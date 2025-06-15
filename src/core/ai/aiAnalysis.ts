import type { GitCommitInfo } from '../git/gitHistoryGet.js';
import { logger } from '../../shared/logger.js';

export interface AIAnalysisConfig {
    apiKey: string;
    baseURL?: string;
    model?: string;
}

export interface AIAnalysisResult {
    analysis: string;
    error?: string;
}

const defaultConfig = {
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
};

// Retry utility with exponential backoff
const retryWithBackoff = async <T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
): Promise<T> => {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;

            // Don't retry on certain errors
            if (lastError.message.includes('400') || lastError.message.includes('401') || lastError.message.includes('403')) {
                throw lastError;
            }

            if (attempt === maxRetries) {
                throw lastError;
            }

            // Exponential backoff with jitter
            const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
            logger.trace(`API request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError!;
};

export const analyzeFileHistory = async (
    filePath: string,
    fileContent: string,
    commitHistory: GitCommitInfo[],
    config: AIAnalysisConfig,
    maxRetries: number = 2,
): Promise<AIAnalysisResult> => {
    try {
        if (!config.apiKey) {
            return {
                analysis: '',
                error: 'API key not provided for AI analysis',
            };
        }

        if (commitHistory.length === 0) {
            return {
                analysis: '该文件暂无Git提交历史记录',
                error: undefined,
            };
        }

        // Limit content size to avoid token limits
        const maxContentLength = 2000; // Reduce content size
        const truncatedContent = fileContent.length > maxContentLength
            ? fileContent.substring(0, maxContentLength) + '\n...(内容已截断)'
            : fileContent;

        // Limit commit history to avoid token limits
        const maxCommits = Math.min(commitHistory.length, 5); // Reduce to 5 commits max
        const recentCommits = commitHistory.slice(0, maxCommits);

        // Prepare the prompt for AI analysis
        const historyText = recentCommits
            .map(
                (commit) => {
                    // Truncate diff if too long
                    const maxDiffLength = 1000;
                    const truncatedDiff = commit.diff.length > maxDiffLength
                        ? commit.diff.substring(0, maxDiffLength) + '\n...(diff已截断)'
                        : commit.diff;

                    return `**提交ID**: ${commit.hash.substring(0, 8)}\n**提交者**: ${commit.author}\n**提交时间**: ${commit.date}\n**提交信息**: ${commit.message}\n**具体diff**:\n\`\`\`diff\n${truncatedDiff}\n\`\`\``;
                }
            )
            .join('\n\n---\n\n');

        const prompt = `请分析以下文件的最近提交历史，重点关注：
1. 变更演进规律和趋势
2. 已修复的bug和问题，以避免后续再次引入
3. 潜在风险和需要注意的问题
4. 代码质量改进建议

**文件路径**: ${filePath}

**当前文件内容**(部分):
\`\`\`
${truncatedContent}
\`\`\`

**最近${maxCommits}个提交历史**:
${historyText}

请用中文进行分析，保持简洁明了，重点突出关键信息。`;

        const makeRequest = async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

            try {
                const response = await fetch(`${config.baseURL || defaultConfig.baseURL}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${config.apiKey}`,
                    },
                    body: JSON.stringify({
                        model: config.model || defaultConfig.model,
                        messages: [
                            {
                                role: 'user',
                                content: prompt,
                            },
                        ],
                        temperature: 0.7,
                        max_tokens: 1500, // Reduce max tokens to avoid timeout
                    }),
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
                }

                const data = (await response.json()) as {
                    choices?: Array<{
                        message?: {
                            content?: string;
                        };
                    }>;
                };

                return data.choices?.[0]?.message?.content || 'AI分析未能生成结果';
            } catch (error) {
                clearTimeout(timeoutId);
                throw error;
            }
        };

        const analysis = await retryWithBackoff(makeRequest, maxRetries, 2000);

        return {
            analysis,
            error: undefined,
        };
    } catch (error) {
        const errorMessage = (error as Error).message;
        logger.trace('Failed to analyze file history with AI:', errorMessage);

        // Provide more specific error messages
        if (errorMessage.includes('429')) {
            return {
                analysis: '',
                error: '请求频率过高，已达到API限制',
            };
        } else if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
            return {
                analysis: '',
                error: '请求超时',
            };
        } else {
            return {
                analysis: '',
                error: `AI分析失败: ${errorMessage}`,
            };
        }
    }
};
