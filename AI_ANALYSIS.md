# AI Analysis Configuration

The AI analysis feature provides intelligent insights into file change history using DeepSeek-V3. This document explains the configuration options to optimize performance and avoid rate limiting.

## Configuration Options

### Basic Configuration

```json
{
  "output": {
    "aiAnalysis": {
      "enabled": true,
      "apiKey": "your_deepseek_api_key_here"
    }
  }
}
```

### Advanced Configuration

```json
{
  "output": {
    "aiAnalysis": {
      "enabled": true,
      "maxCommits": 5,
      "apiKey": "your_deepseek_api_key_here",
      "baseURL": "https://api.deepseek.com/v1",
      "model": "deepseek-chat",
      "batchSize": 3,
      "delayBetweenBatches": 2000,
      "maxRetries": 2
    }
  }
}
```

## Configuration Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable AI analysis |
| `maxCommits` | number | `5` | Maximum number of commits to analyze per file |
| `apiKey` | string | - | DeepSeek API key (can also be set via `DEEPSEEK_API_KEY` environment variable) |
| `baseURL` | string | `"https://api.deepseek.com/v1"` | API base URL |
| `model` | string | `"deepseek-chat"` | AI model to use |
| `batchSize` | number | `3` | Number of files to process simultaneously |
| `delayBetweenBatches` | number | `2000` | Delay in milliseconds between batches |
| `maxRetries` | number | `2` | Maximum retry attempts for failed requests |

## Rate Limiting Solutions

### 429 Too Many Requests

This error occurs when you exceed the API rate limits. Solutions:

1. **Reduce batch size**: Lower the `batchSize` value (e.g., from 3 to 1)
2. **Increase delays**: Increase `delayBetweenBatches` (e.g., from 2000ms to 5000ms)
3. **Reduce commits**: Lower `maxCommits` to analyze fewer commits per file
4. **Process fewer files**: Use `--include` patterns to limit files

Example for large repositories:
```json
{
  "output": {
    "aiAnalysis": {
      "enabled": true,
      "batchSize": 1,
      "delayBetweenBatches": 5000,
      "maxCommits": 3
    }
  }
}
```

### Request Timeouts

For timeout issues:

1. **Reduce content size**: The system automatically truncates long files and diffs
2. **Reduce max tokens**: The system limits response tokens to prevent timeouts
3. **Increase retries**: Set `maxRetries` to 3 or higher for unstable connections

## Environment Variables

You can set the API key using environment variables:

### .env file
```bash
DEEPSEEK_API_KEY=your_api_key_here
```

### Command line
```bash
export DEEPSEEK_API_KEY=your_api_key_here
repomix --add-ai-analysis
```

## CLI Usage

```bash
# Basic usage
repomix --add-ai-analysis

# With custom config
repomix --config repomix.config.json --add-ai-analysis

# With output style
repomix --add-ai-analysis --style markdown --output analysis.md
```

## Best Practices

1. **Start small**: Test with a few files first using `--include` patterns
2. **Monitor rate limits**: Watch for 429 errors and adjust batch settings
3. **Use .env files**: Keep API keys secure in environment variables
4. **Configure delays**: For large repositories, use longer delays between batches
5. **Filter files**: Use patterns to exclude test files or generated code

## Troubleshooting

### Common Issues

1. **No API key found**: Set `DEEPSEEK_API_KEY` in .env file or environment
2. **429 errors**: Reduce `batchSize` and increase `delayBetweenBatches`
3. **Timeout errors**: Usually auto-retry, check network connection
4. **No git history**: Files without commits will show "该文件暂无Git提交历史记录"

### Example Error Handling

The system provides detailed error messages:
- `请求频率过高，已达到API限制` - Rate limiting (429)
- `请求超时` - Network timeout
- `AI分析失败: [error]` - General API errors
