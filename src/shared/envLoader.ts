import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';

export const loadEnvVariables = (cwd: string): Record<string, string> => {
    const envFilePath = path.resolve(cwd, '.env');
    const envVars: Record<string, string> = {};

    try {
        if (fs.existsSync(envFilePath)) {
            const envContent = fs.readFileSync(envFilePath, 'utf-8');
            const lines = envContent.split('\n');

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine && !trimmedLine.startsWith('#')) {
                    const equalIndex = trimmedLine.indexOf('=');
                    if (equalIndex > 0) {
                        const key = trimmedLine.substring(0, equalIndex).trim();
                        const value = trimmedLine.substring(equalIndex + 1).trim();
                        // Remove quotes if present
                        const cleanValue = value.replace(/^["']|["']$/g, '');
                        envVars[key] = cleanValue;
                    }
                }
            }

            logger.trace('Loaded environment variables from .env file');
        } else {
            logger.trace('.env file not found, using system environment variables');
        }
    } catch (error) {
        logger.trace('Failed to load .env file:', (error as Error).message);
    }

    return envVars;
};
