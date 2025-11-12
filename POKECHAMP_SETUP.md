# PokéChamp AI Setup Guide

## Quick Start

### Option 1: Local Strategy Only (No LLM Dependencies)
如果你只想使用本地策略评估（最快、无 API 依赖），不需要安装任何额外包：

```bash
npm start
```

服务会使用 `choose_best_move()` 和 `choose_best_switch()` 的本地策略。

### Option 2: Install LLM Support (Optional)
如果你想使用 LLM 后端（OpenAI、Gemini、DeepSeek 等），需要安装依赖：

```bash
# 最小化依赖（仅支持 OpenAI 和 Gemini）
pip install openai google-genai ollama requests

# 或完整安装（包括 Hugging Face 模型）
cd pokechamp-ai
pip install -r requirements.txt
```

## Current Status

当前，pokechamp-service.py 会尝试导入这些可选模块：
- `pokechamp.gpt_player` - 用于 OpenAI 后端
- `pokechamp.gemini_player` - 用于 Google Gemini 后端
- `pokechamp.ollama_player` - 用于本地 Ollama 模型
- `pokechamp.openrouter_player` - 用于 OpenRouter API

**如果导入失败，不用担心**。服务会自动降级到本地策略评估，仍然可以正常运行。

## Environment Variables

```bash
# 指定 LLM 后端（默认: deepseek）
export POKECHAMP_LLM_BACKEND=deepseek

# 根据选择的后端设置 API key
export DEEPSEEK_API_KEY=your_key_here
export OPENAI_API_KEY=your_key_here
export GEMINI_API_KEY=your_key_here
export OPENROUTER_API_KEY=your_key_here

# 启用调试模式（显示 import 消息）
export POKECHAMP_DEBUG=1
```

## Troubleshooting

### "Warning: Could not import PokéChamp components"
这是一个信息性警告，不是错误。服务仍然会工作，只是使用本地策略而不是 LLM。

要移除此警告，安装所需的 Python 包：

```bash
pip install openai google-genai ollama requests
```

### Python Not Found (Exit Code 9009)
如果你看到这个错误：

```
[PokéChamp] Attempting to spawn with: python3
❌ [PokéChamp] PokéChamp service exited with code 9009
[PokéChamp] python3 failed, trying python...
```

这是正常的。系统会自动尝试用 `python3` 命令而不是 `python3`。

确保 Python 已安装在系统 PATH 中：

```bash
python --version
# 或
python3 --version
```

## Complete Dependency List

如果需要完整的 LLM 支持，安装所有依赖：

```bash
pip install -r pokechamp-ai/requirements.txt
```

这包括：
- numpy, pandas, scipy, scikit-learn
- torch, transformers, accelerate
- openai, google-genai, ollama
- 和其他数据处理库

**注意**：torch 和 transformers 是大型包，可能需要几分钟下载和安装。

## Supported LLM Backends

| 后端 | API Key | 状态 | 成本 |
|---|---|---|---|
| deepseek | DEEPSEEK_API_KEY | ✅ 推荐 | 最便宜 (~$0.001/turn) |
| gpt-4o-mini | OPENAI_API_KEY | ✅ 支持 | 便宜 (~$0.0003/turn) |
| gpt-4o | OPENAI_API_KEY | ✅ 支持 | 较贵 (~$0.003/turn) |
| gemini-2.5-flash | GEMINI_API_KEY | ✅ 支持 | 便宜 |
| ollama/llama3.1:8b | 无需 | ✅ 本地 | 免费 |
| 本地策略评估 | 无需 | ✅ 总是有效 | 免费 |

## Testing

```bash
# 测试 python 命令
npm start

# 使用特定后端测试
POKECHAMP_LLM_BACKEND=gpt-4o-mini OPENAI_API_KEY=sk-... npm start

# 启用调试
POKECHAMP_DEBUG=1 npm start
```

