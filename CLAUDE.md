# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作提供指导。

## 开发规则

- 根目录只能放文档和配置文件（不要放代码文件）
- 代码文件必须有清晰的结构
- 每次改动都需要更新相关文档

## 项目概述

**宝可梦控制台对战** 是一个 TypeScript/JavaScript 项目，在控制台中模拟第九代宝可梦对战。基于 Pokemon Showdown 模拟器框架构建，支持完整的中文翻译。

### 核心特性

- 直接在 Node.js 进程中运行，无需额外服务器
- 支持 4 种 AI 对手：LLM AI、Master AI、Smart AI、Random AI
- 启动命令：`npm start`
- 完整的第九代对战机制（包括太晶化）
- 全中文本地化系统

**关键技术栈：**
- Pokemon Showdown 模拟器
- Node.js 18+
- TypeScript 严格模式
- 完整的中文本地化系统

## 核心架构

### 消息流管道

```
Pokemon Showdown 模拟器
         ↓
消息流（管道分隔协议）
         ↓
消息处理器 (message-handler.js)
  [解析 50+ 种消息类型]
         ↓
战斗状态 (battle-state.js)
  [更新游戏状态对象]
         ↓
UI 显示 (ui-display.js)
  [控制台渲染，带中文翻译]
         ↓
玩家输入 (readline)
         ↓
AI 决策 (通过 AIPlayer 层次结构)
```

### 战斗系统文件 (`src/battle/` 和 `src/battle_common/`)

**1. pve-battle.js** (342 行) - 本地对战模式入口
- 直接在 Node.js 中执行
- 处理 Pokemon Showdown 消息流
- 管理玩家输入和队伍选择
- 入口函数：`startPVEBattle()` 异步函数
- 使用 readline 进行交互式 CLI 输入
- 支持：LLM AI（可配置硅基流动/DeepSeek/OpenRouter）、Master AI、Smart AI、Random AI

**2. message-handler.js** (1638 行) - 协议解析器
- 解析 50+ 种 Pokemon Showdown 战斗消息类型
- 根据战斗事件更新游戏状态（切换、招式、伤害、倒下、状态等）
- `BattleMessageHandler` 类，每种消息类型都有对应的 `handle*` 方法
- 支持所有 Major Actions 和 Minor Actions 消息
- 将宝可梦名称和招式翻译为中文

**关键消息类型：**
- Major Actions: `switch`、`drag`、`move`、`cant`、`faint`、`detailschange`、`formechange`
- Minor Actions - 伤害/治疗: `damage`、`heal`、`sethp`
- Minor Actions - 能力值: `boost`、`unboost`、`setboost`、`copyboost`、`invertboost`
- Minor Actions - 状态: `status`、`curestatus`
- Minor Actions - 场地: `weather`、`fieldstart`、`fieldend`、`sidestart`、`sideend`
- Minor Actions - 特殊: `terastallize`、`transform`、`mega`

**3. battle-state.js** (412 行) - 游戏状态管理
- 完整的游戏状态容器，包含多个类：
  - `BattleState`：主状态容器
  - `BattleField`：天气、地形、场地效果
  - `PlayerState` / `OpponentState`：单个玩家状态
  - `PokemonState`：单只宝可梦数据（HP、状态、能力变化、太晶化）
- 管理能力变化、状态异常、队伍组成

**关键方法：**
- `switchPokemon(player, index)`：切换时更新状态
- `markFainted(player, index)`：跟踪倒下的宝可梦
- `boost()` / `unboost()`：管理能力变化
- `setCurrentRequest()` / `clearCurrentRequest()`：管理待处理的选择请求

**4. ui-display.js** (377 行) - 控制台渲染
- 控制台渲染函数
- 显示：队伍信息、可用选择、战斗状态、宝可梦数据
- 函数：`displayChoices()`、`displaySwitchChoices()`、`displayTeamInfo()`

### AI 系统 (`src/ai/`)

**架构：** 抽象工厂模式，包含基类和具体实现

**基类：** `ai-player.ts`
- 抽象 `AIPlayer` 类，继承 Pokemon Showdown 的 BattlePlayer
- 关键方法：
  - `start()`：异步初始化（连接战斗流）
  - `receiveRequest()`：处理 Pokemon Showdown 请求消息
  - `choosePokemon()` / `chooseMove()`：决策方法

**工厂：** `ai-player-factory.ts`
- 根据类型创建 AI 实例
- 根据 LLM_PROVIDER 环境变量选择 LLM 提供商
- 优雅降级（LLM API 密钥缺失时 → Smart AI）

**AI 实现：**

1. **master-ai-player.ts** - 高级策略 AI
   - 跟踪对手队伍组成
   - 维护招式历史记录
   - 深度属性克制分析
   - 动态难度调整

2. **smart-ai-player.ts** - 基础启发式 AI
   - 评估招式威力和属性克制
   - 智能宝可梦切换

3. **llm-ai-player.ts** - 基于 LLM 的 AI
   - 支持多种 LLM 提供商（硅基流动、DeepSeek、OpenRouter）
   - 使用依赖注入的 LLMProvider 接口
   - 维护 3 回合对话历史
   - **支持作弊模式**（可以获取对手的招式）
   - API 失败时优雅降级到 Smart AI

   **LLM Provider 架构** (`src/ai/ai-player/llm_provider/`):
   - `llm-provider.ts` - 抽象基类，定义统一接口
   - `siliconflow-provider.ts` - 硅基流动 API（默认，推荐国内用户）
   - `deepseek-provider.ts` - DeepSeek 官方 API
   - `openrouter-provider.ts` - OpenRouter API（支持 Claude、GPT-4 等）

4. **random-ai-player.ts** - 随机决策 AI
   - 用于测试目的

### 支持模块 (`src/support/`)

**translator.ts** - 单例翻译器，用于中文本地化
- 翻译：宝可梦名称、招式、特性、携带物品、属性、状态
- 使用 `data/translations-cn.json` 进行翻译映射
- 智能处理地区形态："Pikachu-Alola" → "皮卡丘(Pikachu-Alola)"
- 缺少翻译时回退到英文

**damage-calculator.ts** - @smogon/calc 的封装
- 精确的第九代伤害计算
- 考虑因素：种族值、性格、IV/EV、特性、道具、太晶化、天气、地形、能力变化、会心一击

## 构建和运行命令

### 构建

```bash
npm run build          # 编译 TypeScript 到 dist/
npm run build:watch    # 开发模式的监视编译
```

### 运行

**一条命令启动，支持多种 AI：**

```bash
npm start
```

**支持的 AI 对手：**
- LLM AI（支持硅基流动/DeepSeek/OpenRouter，可配置作弊模式）
  - 默认使用硅基流动（推荐国内用户）
  - 需要配置相应的 API Key
- Master AI（高级启发式）
- Smart AI（基础启发式）
- Random AI（用于测试）

**优点：**
- ✅ 简单，一条命令
- ✅ 无需额外配置
- ✅ 适合快速测试和开发

### 其他命令

```bash
npm test              # 运行 LLM AI 测试
```

**注意：** `postinstall` 钩子会在 `npm install` 后自动运行 `npm run build`

## 关键消息流程：请求处理

请求处理分为三种情况，以处理时序问题：

**1. teamPreview（队伍预览）：**
- 收到后立即处理（发送队伍顺序到 Showdown）
- 这是初始化消息，不会与其他消息混淆

**2. forceSwitch（强制切换）：**
- 当收到 `|request|` 消息 → 保存到 `currentRequest`
- 使用 `process.nextTick()` 注册延迟处理回调
- 两种情况：
  - 正常情况：`|turn|` 消息到达时（第 190-203 行），检查并处理保存的 forceSwitch 请求
  - 异常情况：没有 `|turn|` 消息（刚上场就倒下），`process.nextTick()` 的延迟回调会处理它

**3. active（普通招式）：**
- 当收到 `|request|` 消息 → 保存到 `currentRequest`
- 等待 `|turn|` 消息到达后（第 190-203 行）处理

这种方式解决了两个问题：
1. request 消息比 move/turn 消息更早到达导致的显示格式混乱
2. 刚上场就倒下时没有 `|turn|` 消息导致的卡死

**关键处理代码：**
- 第 221-225 行：teamPreview 立即处理
- 第 226-235 行：forceSwitch 保存并注册延迟处理
- 第 236-238 行：active 只保存，不需要延迟
- 第 190-203 行：|turn| 消息处理后统一处理保存的请求

### 回合处理（第 182-203 行）

- 以 `|` 开头的战斗消息在消息循环中被处理
- `|turn|` 消息触发回合开始提示（等待用户按回车）
- 在 `|turn|` 消息处理后，检查是否有待处理的请求（forceSwitch 或 active）
- 如果有，立即显示菜单并获取玩家输入
- 这样所有当前 chunk 中的消息都已显示完毕，菜单顺序正确

## Pokemon Showdown 协议

Pokemon Showdown 使用管道分隔的消息：

```
|switch|p1a: Pikachu|Pikachu, L50, M|156/156    → 玩家切换皮卡丘上场
|-damage|p1a: Pikachu|75/156                     → 皮卡丘受伤
|faint|p1a: Pikachu                              → 皮卡丘倒下
|move|p2a: Charizard|Flamethrower|p1a: Pikachu → 使用招式
|request|{"active":[...], "side":{...}}          → 玩家选择的 JSON 请求
```

解析器实现：
```javascript
const parts = line.split('|');
// parts[0] = '', parts[1] = action, parts[2+] = parameters
```

## 队伍生成

- 使用 Pokemon Showdown 的 `Sim.Teams.generate('gen9randombattle')`
- 使用 `TeamValidator` 验证队伍
- 标准化所有宝可梦：50 级，勤奋性格，所有属性 IV 31，EV 85

## AI 配置

### LLM AI 配置

**环境变量配置（使用 .env 文件）：**

```bash
# 1. 复制配置文件
cp .env.example .env

# 2. 编辑 .env 文件，填写以下内容：

# 选择 LLM 提供商（siliconflow, deepseek, openrouter）
LLM_PROVIDER=siliconflow  # 默认推荐硅基流动

# 硅基流动配置（推荐国内用户）
SILICONFLOW_API_KEY=sk-your-siliconflow-api-key-here
SILICONFLOW_MODEL=deepseek-ai/DeepSeek-V3.2-Exp

# DeepSeek 配置
DEEPSEEK_API_KEY=sk-your-deepseek-api-key-here

# OpenRouter 配置
OPENROUTER_API_KEY=sk-or-your-openrouter-api-key-here
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet

# 作弊概率（可选）
AI_CHEAT_PROBABILITY=0.5  # 0-1 之间，默认 0.5

# 队伍配置（可选）
PLAYER_TEAM=gen9ou/gen9ou1.txt  # 指定玩家队伍文件
AI_TEAM=gen9ou/gen9ou2.txt      # 指定 AI 队伍文件
```

**特性：**
- 支持多种 LLM 提供商（硅基流动、DeepSeek、OpenRouter）
- 可选的作弊模式（`AI_CHEAT_PROBABILITY`）
- 可配置玩家和 AI 的队伍文件（`PLAYER_TEAM`、`AI_TEAM`）
- API 失败或未设置密钥时自动降级到 Smart AI
- 配置了关于宝可梦对战策略的系统提示词
- 维护 3 轮对话历史以保持上下文
- 详见 `docs/LLM_AI_GUIDE.md` 了解详细设置
- 详见 `docs/LLM_PROVIDER_CONFIG.md` 了解提供商配置

### 队伍配置

**队伍文件选择：**
- 默认情况下，玩家和 AI 的队伍会从 `teams/{format}/` 目录中随机选择
- 可以通过环境变量指定固定的队伍文件：
  - `PLAYER_TEAM`: 玩家使用的队伍文件（例如：`gen9ou/gen9ou1.txt`）
  - `AI_TEAM`: AI 使用的队伍文件（例如：`gen9ou/gen9ou2.txt`）
- 如果指定的文件不存在，系统会自动回退到随机选择

## 常见开发任务

### 添加新的消息处理器

1. 在 `message-handler.js` 的 `handleMessage()` 分派器中添加 case
2. 创建 `handle[MessageType]()` 方法
3. 解析管道分隔的部分：`const parts = line.split('|')`
4. 相应地更新 `battleState`
5. 通过 `this.translate()` 显示中文输出

### 修复战斗逻辑错误

- 从理解 `pve-battle.js` 中的消息流开始
- 检查 `message-handler.js` 中的正确消息解析
- 验证 `battle-state.js` 中的状态更新
- 测试 `ui-display.js` 中的 UI 显示

### 测试 AI 行为

- 使用 Random AI 进行快速调试
- 使用 Smart AI 进行可预测的测试用例
- 使用 Master AI 测试更复杂的策略
- LLM AI 需要配置相应的 API Key；建议先使用本地 AI 测试
- 硅基流动是默认推荐的 LLM 提供商（国内访问快速稳定）

### 处理翻译

- 编辑 `data/translations-cn.json` 添加新翻译
- 使用 `translator.translate(name, type)`，type 为：'pokemon'、'moves'、'abilities'、'items'、'types'、'status'
- 使用 `npm run build` 重建

## TypeScript 编译

- **配置：** tsconfig.json
- **目标：** ES2020、CommonJS 模块
- **严格模式：** 启用
- **输出：** dist/ 目录
- **源代码映射：** 为调试生成
- **排除：** node_modules、tests

## 关键依赖

### Node.js 依赖

- **pokemon-showdown**: 战斗模拟器和宝可梦数据库
- **axios**: HTTP 客户端（用于 LLM API 调用）
- **readline**: Node.js 模块，用于 CLI 输入/输出
- **@types/node**: TypeScript 类型定义
- **dotenv**: 环境变量加载（用于 .env 文件）
- **@smogon/calc**: Smogon 伤害计算器
- **ws**: WebSocket 库

## 最近的更改

### 命令简化
- **启动命令标准化**: 将主启动命令改为 `npm start`
- **移除服务器模式**: 移除了 PokéChamp AI 和服务器对战模式的相关代码
- **简化架构**: 专注于本地对战模式，减少复杂性

### 请求处理机制修复

最近的修复改进了请求处理机制：
- **teamPreview**: 收到后立即发送队伍顺序
- **forceSwitch**: 保存请求并注册 `process.nextTick()` 延迟处理回调，在 `|turn|` 消息后立即处理，或如果没有 `|turn|` 消息（刚上场就倒下）则由延迟回调处理
- **active**: 保存请求，等待 `|turn|` 消息到达后处理
- 这样确保所有消息都显示完毕后，才显示选择菜单
- 解决了 request 消息提前到达导致的显示格式混乱问题
- 解决了刚上场就倒下导致的卡死问题（有 `process.nextTick()` 作为备用）

## 测试入口

- `npm start` - 启动完整对战（推荐），可选择任何 AI 对手
- `npm test` - 运行 `tests/test-deepseek.js` 进行 LLM AI 测试
- 使用 Random AI 或 Smart AI 测试而无需 API 依赖
- 使用 LLM AI 测试需要在 `.env` 文件中配置相应的 API Key
  - 推荐硅基流动：`SILICONFLOW_API_KEY`
  - 或 DeepSeek：`DEEPSEEK_API_KEY`
  - 或 OpenRouter：`OPENROUTER_API_KEY`
