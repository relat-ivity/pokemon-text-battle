# DeepSeek Direct Integration for PokéChamp

## 概述

pokechamp-service.py 现在原生支持 DeepSeek API，使用 OpenAI SDK 通过兼容接口调用 DeepSeek 的 `deepseek-chat` 模型。

## 快速开始

### 1. 安装 openai 包

```bash
pip install openai
```

### 2. 设置 DeepSeek API Key

```bash
export DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. 运行对战

```bash
npm start
```

系统会自动：
1. 启动 Python 服务 (pokechamp-service.py)
2. 初始化 DeepSeek 客户端 (使用 OpenAI SDK)
3. 在每个回合使用 DeepSeek AI 选择招式
4. 如果 DeepSeek 调用失败，自动降级到本地策略评估

## 工作原理

### DeepSeek 客户端初始化

```python
from openai import OpenAI

deepseek_client = OpenAI(
    api_key=os.environ.get('DEEPSEEK_API_KEY'),
    base_url="https://api.deepseek.com"
)
```

### 招式选择流程

当 `choose_move` 命令到达时：

```
1. 检查是否初始化了 DeepSeek 客户端
   ↓
2. 如果有，使用 choose_move_with_deepseek()
   ├─ 格式化当前可用的招式
   ├─ 调用 DeepSeek API (deepseek-chat 模型)
   ├─ 解析 AI 的选择 (返回数字 1-4)
   ├─ 返回选定的招式
   └─ 如果失败 → 降级到本地策略
   ↓
3. 如果没有，使用 choose_best_move() (本地策略)
```

### 本地策略评估

如果 DeepSeek 不可用或失败，自动使用本地策略：

```python
def evaluate_move(move_data):
    score = 50.0  # 基础分数
    score += min(power / 2, 25)  # 威力加分
    score -= (100 - accuracy) * 0.3  # 命中率扣分
    score += 20 if healing else 0  # 恢复加分
    score += 15 if boosts else 0  # 强化加分
    return max(0, min(100, score))
```

## 环境变量

```bash
# 必需
export DEEPSEEK_API_KEY=sk-...

# 可选
export POKECHAMP_DEBUG=1  # 启用调试日志
```

## 示例日志

启用调试模式查看完整流程：

```bash
POKECHAMP_DEBUG=1 npm start
```

输出示例：
```
[PokéChamp] Starting service from: D:\...\pokechamp-service.py
[PokéChamp] Using LLM backend: deepseek
[PokéChamp] Attempting to spawn with: python3
❌ [PokéChamp] Process error: ...
[PokéChamp] python3 failed, trying python...
[PokéChamp] Sending init command...
[PokéChamp] DeepSeek client initialized
✓ [PokéChamp] Service initialized with backend: deepseek
[PokéChamp] Sending command: {"action":"choose_move",...}
```

## API 成本

DeepSeek 相对便宜：
- **输入**: $0.14 per 1M tokens
- **输出**: $0.28 per 1M tokens

一个典型的对战 (50 回合):
- 每个招式选择: ~50-100 tokens
- 总成本: ~$0.003-0.010 (约 2-7 分钱)

## 错误处理

### 场景 1: DEEPSEEK_API_KEY 未设置

```
❌ [PokéChamp] Init command error: DEEPSEEK_API_KEY not set
❌ [PokéChamp] Initialization or execution error: DEEPSEEK_API_KEY not set
```

**解决**: 设置环境变量
```bash
export DEEPSEEK_API_KEY=sk-...
```

### 场景 2: openai 包未安装

```
❌ [PokéChamp] Init command error: openai package required for DeepSeek backend
```

**解决**: 安装 openai
```bash
pip install openai
```

### 场景 3: DeepSeek API 调用失败

```
[PokéChamp] DeepSeek move selection failed: ... (使用本地策略)
```

**自动处理**: 服务会自动降级到本地策略评估，对战继续进行

## 支持的其他 LLM 后端

虽然当前代码重点是 DeepSeek，但架构支持：

| 后端 | 环境变量 | 状态 |
|---|---|---|
| deepseek | DEEPSEEK_API_KEY | ✅ 已实现 |
| gpt-4o-mini | OPENAI_API_KEY | ⏳ 待实现 |
| gemini | GEMINI_API_KEY | ⏳ 待实现 |
| ollama | 无需 | ⏳ 待实现 |

## 测试

```bash
# 基础测试 (本地策略)
npm start

# 使用 DeepSeek
export DEEPSEEK_API_KEY=sk-... && npm start

# 调试模式
export POKECHAMP_DEBUG=1 && npm start

# 检查 DeepSeek 客户端
python -c "from openai import OpenAI; c=OpenAI(api_key='test', base_url='https://api.deepseek.com'); print('✅ OpenAI SDK OK')"
```

## 文件修改

### pokechamp-service.py

**新增**:
- `deepseek_client` 全局变量 - DeepSeek 客户端实例
- `has_openai` 标志 - 检查 openai 包是否可用
- `choose_move_with_deepseek()` 函数 - DeepSeek 招式选择逻辑
- DeepSeek 初始化代码在 `initialize_ai()` 函数中

**修改**:
- `main()` 函数的 `choose_move` 处理 - 添加 DeepSeek 路径

## 注意事项

1. **响应格式**: DeepSeek 应该只返回数字 (1-4)，其他内容会被忽略
2. **速度**: DeepSeek API 通常 < 1 秒响应，不会显著影响对战速度
3. **成本**: 免费试用或付费账户都支持，检查 https://platform.deepseek.com
4. **可靠性**: 如果 API 不可用，本地策略评估会自动接管

