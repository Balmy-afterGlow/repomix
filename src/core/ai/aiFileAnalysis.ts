import path from 'node:path';
import type { RepomixConfigMerged } from '../../config/configSchema.js';
import { logger } from '../../shared/logger.js';
import { loadEnvVariables } from '../../shared/envLoader.js';
import type { RepomixProgressCallback } from '../../shared/types.js';
import type { ProcessedFile } from '../file/fileTypes.js';
import { getFileHistory } from '../git/gitHistoryGet.js';
import { analyzeFileHistory } from './aiAnalysis.js';

// Rate limiting utility
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Process files in batches to avoid rate limiting
const processBatch = async <T>(
    items: T[],
    batchSize: number,
    processor: (item: T, index: number) => Promise<any>,
    delayBetweenBatches: number = 1000
): Promise<any[]> => {
    const results: any[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(
            batch.map((item, batchIndex) => processor(item, i + batchIndex))
        );
        results.push(...batchResults);

        // Add delay between batches to avoid rate limiting
        if (i + batchSize < items.length) {
            await sleep(delayBetweenBatches);
        }
    }

    return results;
};

export const addAiAnalysisToFiles = async (
    processedFiles: ProcessedFile[],
    rootDirs: string[],
    config: RepomixConfigMerged,
    progressCallback: RepomixProgressCallback,
): Promise<ProcessedFile[]> => {
    if (!config.output.aiAnalysis?.enabled) {
        logger.trace('AI analysis is disabled');
        return processedFiles;
    }

    progressCallback('Adding AI analysis...');

    // Load environment variables to get API key
    const envVars = loadEnvVariables(config.cwd);
    const apiKey = config.output.aiAnalysis?.apiKey || envVars.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
        logger.warn('AI analysis is enabled but no API key found. Check .env file or environment variables for DEEPSEEK_API_KEY');
        return processedFiles;
    }

    const aiConfig = {
        apiKey,
        baseURL: config.output.aiAnalysis?.baseURL,
        model: config.output.aiAnalysis?.model,
    };

    const maxCommits = config.output.aiAnalysis?.maxCommits || 5;
    const rootDir = rootDirs[0]; // Use the first root directory

    let processedCount = 0;
    const totalFiles = processedFiles.length;

    // Process files in batches to avoid rate limiting
    // Use configuration values with fallbacks
    const batchSize = config.output.aiAnalysis?.batchSize || Math.min(3, Math.ceil(totalFiles / 10));
    const delayBetweenBatches = config.output.aiAnalysis?.delayBetweenBatches || (totalFiles > 50 ? 3000 : 2000);

    logger.trace(`Processing ${totalFiles} files in batches of ${batchSize} with ${delayBetweenBatches}ms delay`);

    const processFile = async (file: ProcessedFile, fileIndex: number): Promise<ProcessedFile> => {
        try {
            // Get the absolute file path
            const absolutePath = path.isAbsolute(file.path) ? file.path : path.resolve(rootDir, file.path);

            // Get commit history for this file
            const commitHistory = await getFileHistory(rootDir, absolutePath, maxCommits);

            // Analyze with AI if there's commit history
            let aiAnalysis = '';
            if (commitHistory.length > 0) {
                const analysisResult = await analyzeFileHistory(
                    file.path,
                    file.content,
                    commitHistory,
                    aiConfig,
                    config.output.aiAnalysis?.maxRetries || 2
                );
                if (analysisResult.error) {
                    logger.warn(`AI analysis failed for ${file.path}: ${analysisResult.error}`);
                    aiAnalysis = `AI分析失败: ${analysisResult.error}`;
                } else {
                    aiAnalysis = analysisResult.analysis;
                }
            } else {
                aiAnalysis = '该文件暂无Git提交历史记录';
            }

            processedCount++;
            progressCallback(`Adding AI analysis... (${processedCount}/${totalFiles}) ${file.path}`);

            return {
                ...file,
                aiAnalysis,
            };
        } catch (error) {
            logger.trace(`Failed to add AI analysis for ${file.path}:`, (error as Error).message);
            processedCount++;
            progressCallback(`Adding AI analysis... (${processedCount}/${totalFiles}) ${file.path}`);

            return {
                ...file,
                aiAnalysis: `AI分析失败: ${(error as Error).message}`,
            };
        }
    };

    return processBatch(processedFiles, batchSize, processFile, delayBetweenBatches);
};
