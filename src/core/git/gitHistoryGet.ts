import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { RepomixError } from '../../shared/errorHandle.js';
import { logger } from '../../shared/logger.js';
import { isGitRepository } from './gitRepositoryHandle.js';

const execFileAsync = promisify(execFile);

export interface GitCommitInfo {
    hash: string;
    author: string;
    date: string;
    message: string;
    diff: string;
}

export const execGitLog = async (
    directory: string,
    filePath: string,
    maxCommits = 10,
    deps = {
        execFileAsync,
    },
): Promise<GitCommitInfo[]> => {
    try {
        // Get commit log for specific file
        const logResult = await deps.execFileAsync('git', [
            '-C',
            directory,
            'log',
            '--format=%H|%an|%ad|%s',
            '--date=iso',
            `-n`,
            maxCommits.toString(),
            '--',
            filePath,
        ]);

        const commits: GitCommitInfo[] = [];
        const lines = logResult.stdout.trim().split('\n').filter(Boolean);

        for (const line of lines) {
            const [hash, author, date, message] = line.split('|');
            if (!hash) continue;

            try {
                // Get diff for this specific commit
                const diffResult = await deps.execFileAsync('git', [
                    '-C',
                    directory,
                    'show',
                    '--format=',
                    '--no-color',
                    hash,
                    '--',
                    filePath,
                ]);

                commits.push({
                    hash,
                    author,
                    date,
                    message,
                    diff: diffResult.stdout || '',
                });
            } catch (diffError) {
                logger.trace(`Failed to get diff for commit ${hash}:`, (diffError as Error).message);
                // Add commit without diff if diff fails
                commits.push({
                    hash,
                    author,
                    date,
                    message,
                    diff: '',
                });
            }
        }

        return commits;
    } catch (error) {
        logger.trace('Failed to get git log:', (error as Error).message);
        return [];
    }
};

export const getFileHistory = async (
    directory: string,
    filePath: string,
    maxCommits = 10,
    deps = {
        execGitLog,
        isGitRepository,
    },
): Promise<GitCommitInfo[]> => {
    try {
        // Check if the directory is a git repository
        const isGitRepo = await deps.isGitRepository(directory);
        if (!isGitRepo) {
            logger.trace('Not a git repository, skipping history generation');
            return [];
        }

        return await deps.execGitLog(directory, filePath, maxCommits);
    } catch (error) {
        logger.trace('Failed to get file history:', (error as Error).message);
        return [];
    }
};
