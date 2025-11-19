# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作提供指导。

## CLAUDE开发规则
- 根目录不要放代码文件，只能放文档和配置文件
- 代码文件需要有清晰的结构
- 注意每次改动都需要更新相关文档

## 项目概述

**宝可梦控制台对战** 是一个 TypeScript/JavaScript 项目，在控制台中模拟第九代宝可梦对战。

### 两种对战模式

本项目支持两种对战架构：

#### 1. 本地对战模式（推荐新手）
- 直接在 Node.js 进程中运行，无需额外服务器
- 支持 AI 对手：DeepSeek AI、Master AI、智能 AI、随机 AI
- 简单易用，一条命令启动：`npm run battle`
- **不支持 PokéChamp AI**（因为 PokéChamp 需要完整的 Battle 对象）

#### 2. 服务器对战模式（PokéChamp AI 专用）
- 通过本地 Pokemon Showdown 服务器进行对战
- **仅支持 PokéChamp AI**（Minimax + LLM，84% 胜率）
- 需要启动三个进程：服务器、Python AI 服务、玩家客户端
- PokéChamp AI 可以使用完整的 `choose_move(battle)` 方法

**关键点：**
- 基于 Pokemon Showdown 模拟器
- 完整的第九代规则支持 (gen9randombattle, gen9ou)
- 多种 AI 实现，难度不同
- 完整的中文语言支持和翻译系统
- 需要 Node.js 18+

## 项目结构

### 核心目录

```
src/
├── battle/              # 主战斗系统（游戏循环、消息解析、UI）
├── ai/                  # AI 玩家实现
├── support/             # 工具模块（翻译系统）
└── types/               # TypeScript 类型定义

pokechamp-ai/
├── pokechamp/          # PokéChamp AI 核心库
└── ...                 # 其他 Python 依赖

dist/                   # 编译后的 JavaScript 输出（自动生成）
data/                   # 翻译数据文件
docs/                   # 文档文件
tests/                  # 测试文件
.env.example            # 环境变量配置示例
```

### 战斗系统 (`src/battle/`)

战斗系统是核心游戏引擎，包含以下关键文件：

**对战入口文件（两种架构）：**

#### 模式 1：本地对战入口

1. **pve-battle.js** (342 行) - 本地对战模式主入口
   - 直接在 Node.js 进程中运行
   - 处理 Pokemon Showdown 消息流
   - 管理玩家输入和队伍选择
   - 入口函数：`startPVEBattle()` 异步函数
   - 使用 readline 进行交互式 CLI 输入
   - 支持 AI：DeepSeek AI、Master AI、智能 AI、随机 AI
   - **不支持 PokéChamp AI**

#### 模式 2：服务器对战入口

2. **pokechamp-local-battle.js** (新增) - 服务器对战模式客户端
   - 通过 WebSocket 连接到本地 Pokemon Showdown 服务器
   - 使用与 poke_env 相同的协议（`ws://localhost:8000/showdown/websocket`）
   - 让 PokéChamp AI 可以使用完整的 `choose_move(battle)` 方法
   - 实现真正的 Minimax + LLM 混合决策
   - 入口函数：`startClient()`
   - **仅支持与 PokéChamp AI 对战**
   - 需要配合 `scripts/start-server.js` 和 `src/ai/ai-player/pokechamp-ai-player.py` 使用

**核心模块文件：**

3. **message-handler.js** (1638 行)
   - 解析 50+ 种 Pokemon Showdown 战斗消息类型
   - 根据战斗事件更新游戏状态（切换、招式、伤害、倒下、状态等）
   - `BattleMessageHandler` 类通过 `handle*` 方法处理各类消息
   - 支持所有 Major Actions 和 Minor Actions 消息
   - 将宝可梦名称和招式翻译为中文

4. **battle-state.js** (412 行)
   - 完整的游戏状态管理，包含多个类：
     - `BattleState`：主状态容器
     - `BattleField`：天气、地形、场地效果
     - `PlayerState` / `OpponentState`：个别玩家状态
     - `PokemonState`：单只宝可梦数据（HP、状态、能力变化、太晶化）
   - 管理能力变化、状态异常、队伍组成

5. **ui-display.js** (377 行)
   - 控制台渲染函数
   - 显示：队伍信息、可用选择、战斗状态、宝可梦数据
   - 函数：`displayChoices()`、`displaySwitchChoices()`、`displayTeamInfo()` 等

### AI 系统 (`src/ai/`)

**架构：** 抽象工厂模式，包含基类和具体实现

#### 本地对战模式可用的 AI

这些 AI 在 `pve-battle.js` 中可用，通过 `ai-player-factory.ts` 创建：

- **ai-player.ts**：抽象 `AIPlayer` 类，继承 Pokemon Showdown 的 BattlePlayer
- **ai-player-factory.ts**：根据类型创建 AI 实例的工厂
- **ai-player/master-ai-player.ts**：高级智能 AI，使用更复杂的启发式算法
- **ai-player/smart-ai-player.ts**：本地智能 AI，评估招式威力和属性克制
- **ai-player/deepseek-ai-player.ts**：基于 LLM 的 AI，使用 DeepSeek API（有本地 AI 降级），支持作弊模式（获取对手操作信息）
- **ai-player/random-ai-player.ts**：随机选择招式/切换，用于测试

**关键方法：**
- `start()`：异步初始化（连接战斗流）
- `receiveRequest()`：处理 Pokemon Showdown 请求消息
- `choosePokemon()` / `chooseMove()`：决策方法

#### 服务器对战模式可用的 AI

这些 AI 仅在服务器对战模式中可用：

- **PokéChamp AI**（通过 `src/ai/ai-player/pokechamp-ai-player.py` 和 `pokechamp-ai/` 库）
  - 独立的 Python AI 玩家，直接连接到 Pokemon Showdown 服务器
  - Minimax 树搜索（K=2）+ LLM 混合决策
  - 84% 胜率（ICML 2025）
  - 使用 poke-env 库连接到本地 Pokemon Showdown 服务器 (localhost:8000)
  - 需要 `OPENROUTER_API_KEY` 环境变量
  - 支持多种免费和付费 LLM 模型（默认使用免费的 DeepSeek）
  - **注意：** PokéChamp AI 需要完整的 Battle 对象，因此只能在服务器模式下使用
  - 等待玩家发起挑战后自动应战
  - 支持 gen9randombattle 和 gen9ou 对战格式

**历史遗留（已删除）：**
- **ai-support/pokechamp-service.py**：旧版本的 PokéChamp AI 服务（已删除）
  - 尝试通过 stdin/stdout 与 Node.js 通信
  - 由于循环导入问题和无法提供完整的 Battle 对象而废弃
  - 已被 `pokechamp-ai-player.py` 独立玩家模式取代

### 支持模块 (`src/support/`)

- **translator.ts**：单例翻译器，用于中文本地化
  - 翻译：宝可梦名称、招式、特性、携带物品、属性、状态异常
  - 使用 `data/translations-cn.json` 进行翻译映射

## 构建和运行命令

### 构建
```bash
npm run build          # 将 TypeScript 编译到 dist/
npm run build:watch   # 开发模式下的监视编译
```

### 运行

#### 模式 1：本地对战模式（推荐新手）

**一条命令启动，支持多种 AI（不包括 PokéChamp）：**

```bash
npm run battle
```

**支持的 AI 对手：**
- DeepSeek AI（需要 `DEEPSEEK_API_KEY`，支持作弊模式）
- Master AI（高级启发式）
- 智能 AI（基础启发式）
- 随机 AI（用于测试）

**优点：**
- ✅ 简单易用，一条命令启动
- ✅ 无需额外配置
- ✅ 适合快速测试和开发

**缺点：**
- ❌ 不支持 PokéChamp AI

#### 模式 2：服务器对战模式（PokéChamp AI 专用）

**通过本地服务器与 PokéChamp AI 对战：**

**方法 A：一键启动（推荐）⭐**

```bash
npm run serverbattle
```

自动启动脚本（`start-pokechamp-battle.js`）会依次启动所有必要的服务。

**方法 B：手动启动（三个终端）**

如果需要分别查看各个进程的日志：

**终端 1 - 启动本地服务器：**
```bash
npm run server
```
服务器将在 `http://localhost:8000` 运行

**终端 2 - 启动 PokéChamp Python 服务：**
```bash
python src/ai/ai-player/pokechamp-ai-player.py
```
确保在 `.env` 文件中设置了 `OPENROUTER_API_KEY`

**终端 3 - 启动玩家客户端：**
```bash
node src/battle/pve-server-battle.js
```

**支持的 AI 对手：**
- **仅 PokéChamp AI**（Minimax + LLM，84% 胜率）

**优点：**
- ✅ PokéChamp AI 使用完整的 `choose_move(battle)` 方法
- ✅ 运行真正的 Minimax 树搜索（K=2）
- ✅ 通过 LLM 进行状态评估
- ✅ 达到 84% 的对战胜率
- ✅ 支持一键启动！

**缺点：**
- ⚠️ 需要 Python 环境和额外依赖
- ⚠️ 需要配置 `.env` 文件

#### 其他命令

```bash
npm run simple        # 运行 simple-battle.js（简化版）
npm test              # 运行 deepseek 测试
```

**注意：** `postinstall` 钩子会在 `npm install` 后自动运行 `npm run build`

## 重要的消息流程

### pve-battle.js 中的请求处理

请求处理分为三种情况：

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

## 战斗消息解析

Pokemon Showdown 协议使用管道分隔的消息：
- `|switch|p1a: Pikachu|Pikachu, L50, M|156/156` → 玩家切换皮卡丘上场
- `|-damage|p1a: Pikachu|75/156` → 皮卡丘受伤
- `|faint|p1a: Pikachu` → 皮卡丘倒下
- `|move|p2a: Charizard|Flamethrower|p1a: Pikachu` → 使用招式
- `|request|{"active":[...], "side":{...}}` → 玩家选择的 JSON 请求

## 队伍生成

- 使用 Pokemon Showdown 的 `Sim.Teams.generate('gen9randombattle')`
- 使用 `TeamValidator` 验证队伍
- 标准化所有宝可梦：50 级，勤奋性格，所有属性 IV 31，EV 85

## 关键函数

### pve-battle.js
- `startPVEBattle()` - 主入口
- `startMessageLoop()` - 从 Pokemon Showdown 异步处理消息
- `getPlayerChoice()` - 读取玩家输入并验证
- `createPlayerChoiceHandler()` - 为选择处理器创建工厂，通过闭包捕获 battleState

### message-handler.js
- `handleMessage()` - 所有消息类型的分派器
- Major Actions: `handleSwitch()`, `handleDrag()`, `handleMove()`, `handleCant()`, `handleFaint()`, `handleDetailsChange()`, `handleFormeChange()`, `handleReplace()`, `handleSwap()`
- Minor Actions - 失败/阻挡: `handleFail()`, `handleBlock()`, `handleNoTarget()`, `handleMiss()`, `handleImmune()`
- Minor Actions - HP/状态: `handleDamage()`, `handleHeal()`, `handleSetHP()`, `handleStatus()`, `handleCureStatus()`, `handleCureTeam()`
- Minor Actions - 能力变化: `handleBoost()`, `handleUnboost()`, `handleSetBoost()`, `handleSwapBoost()`, `handleInvertBoost()`, `handleClearBoost()`, `handleClearAllBoost()`, `handleClearPositiveBoost()`, `handleClearNegativeBoost()`, `handleCopyBoost()`
- Minor Actions - 场地效果: `handleSideStart()`, `handleSideEnd()`, `handleSwapSideConditions()`, `handleWeather()`, `handleFieldStart()`, `handleFieldEnd()`
- Minor Actions - 异常状态: `handleStart()`, `handleEnd()`
- Minor Actions - 道具/特性: `handleItem()`, `handleEndItem()`, `handleAbility()`, `handleEndAbility()`
- Minor Actions - 特殊形态: `handleTransform()`, `handleMega()`, `handlePrimal()`, `handleBurst()`, `handleZPower()`, `handleZBroken()`, `handleTerastallize()`
- Minor Actions - 杂项: `handleActivate()`, `handleHint()`, `handleCenter()`, `handleMessageText()`, `handleCombine()`, `handleWaiting()`, `handlePrepare()`, `handleMustRecharge()`, `handleHitCount()`, `handleSingleMove()`, `handleSingleTurn()`

### battle-state.js
- `switchPokemon()` - 切换时更新状态
- `markFainted()` - 跟踪倒下的宝可梦
- `boost()` / `unboost()` - 管理能力变化
- `setCurrentRequest()`、`clearCurrentRequest()` - 管理待处理的选择请求

### ui-display.js
- `displayChoices()` - 显示可用招式和切换选项
- `displaySwitchChoices()` - 显示可切换的宝可梦
- `displayTeamInfo()` - 显示完整队伍信息

## 状态管理模式

```
Pokemon Showdown 流
         ↓
消息循环 (pve-battle.js)
         ↓
消息解析器 (message-handler.js)
         ↓
游戏状态更新 (battle-state.js)
         ↓
UI 渲染 (ui-display.js)
         ↓
玩家输入 (readline)
         ↓
写回流
```

`battleState` 对象贯穿整个管道，随着对战进行而不断更新。

## AI 配置

### PokéChamp AI 配置（推荐）⭐

**环境变量配置（使用 .env 文件）：**

```bash
# 1. 复制配置文件
cp .env.example .env

# 2. 编辑 .env 文件，填写以下内容：
OPENROUTER_API_KEY=sk-or-v1-your-api-key-here
POKECHAMP_LLM_BACKEND=deepseek/deepseek-chat-v3.1:free  # 可选，这是默认值
```

**特性：**
- 需要 `OPENROUTER_API_KEY` 环境变量（获取免费 API key: https://openrouter.ai/keys）
- 默认使用完全**免费**的 `deepseek/deepseek-chat-v3.1:free` 模型
- 支持多种免费模型（Llama、Gemma）和付费模型（GPT-4o、Claude）
- 如果未设置 API key，自动降级到 Master AI
- Minimax 树搜索（K=2）+ LLM 评估
- 84% 胜率（vs 规则类 AI）
- 详见 `docs/POKECHAMP_AI_GUIDE.md` 了解完整配置

### DeepSeek AI 配置

- 需要 `DEEPSEEK_API_KEY` 环境变量
- 如果 API 失败或未设置密钥，则降级到智能 AI
- 详见 `docs/DEEPSEEK-AI.md` 了解详细设置
- 配置有关于宝可梦对战策略的系统提示词
- 维护 3 轮对话历史以保持上下文

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
- 使用随机 AI 进行快速调试
- 使用智能 AI 进行可预测的测试用例
- 使用 Master AI 测试更复杂的策略
- PokéChamp AI 需要 `OPENROUTER_API_KEY`；可使用免费的 DeepSeek 模型测试
- DeepSeek AI 需要 `DEEPSEEK_API_KEY`；先使用本地 AI 测试

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
- **pokemon-showdown**：战斗模拟器和宝可梦数据库
- **axios**：HTTP 客户端（用于 DeepSeek API 调用）
- **readline**：Node.js 模块，用于 CLI 输入/输出
- **@types/node**：TypeScript 类型定义
- **dotenv**：环境变量加载（用于 .env 文件）

### Python 依赖（PokéChamp AI）
- **pokechamp**：PokéChamp AI 库（位于 pokechamp-ai/ 子目录）
- **poke-env**：Pokemon Showdown 的 Python 接口
- **openai**：OpenAI/OpenRouter API 客户端
- 详细依赖见 `pokechamp-ai/pyproject.toml` 或 `pokechamp-ai/requirements.txt`

## 最近的更改和已知问题

### PokéChamp AI 集成（最新）⭐
- **新增 PokéChamp AI**：集成了 ICML 2025 获奖的高级对战 AI
- **环境变量配置**：改用 `.env` 文件配置（`OPENROUTER_API_KEY`、`POKECHAMP_LLM_BACKEND`）
- **免费 LLM 支持**：默认使用免费的 `deepseek/deepseek-chat-v3.1:free` 模型
- **独立 Python 玩家**：通过 `src/ai/ai-player/pokechamp-ai-player.py` 独立连接服务器
- **架构优化**：移除了有循环导入问题的 `pokechamp-service.py`，改用独立玩家模式
- 详见 `docs/POKECHAMP_AI_GUIDE.md` 了解完整文档

### 请求处理机制修复
最近的修复改进了请求处理机制：
- **teamPreview**：收到后立即发送队伍顺序
- **forceSwitch**：保存请求并注册 `process.nextTick()` 延迟处理回调，在 `|turn|` 消息后立即处理，或如果没有 `|turn|` 消息（刚上场就倒下）则由延迟回调处理
- **active**：保存请求，等待 `|turn|` 消息到达后处理
- 这样确保所有消息都显示完毕后，才显示选择菜单
- 解决了 request 消息提前到达导致的显示格式混乱问题
- 解决了刚上场就倒下导致的卡死问题（有 `process.nextTick()` 作为备用）

请查看 TODO.md 了解当前问题和待办工作。

## 测试入口

- `npm run battle` - 启动完整对战（推荐），可选择任何 AI 对手
- `npm run battle` - 直接运行对战
- `npm test` - 运行 `tests/test-deepseek.js` 进行 DeepSeek AI 测试
- 使用随机 AI 或智能 AI 测试而无需 API 依赖
- 使用 PokéChamp AI 测试需要在 `.env` 文件中配置 `OPENROUTER_API_KEY`

### PokéChamp AI 测试步骤

测试 PokéChamp AI 时，请按照以下**完整步骤**操作：

```bash
npm run battle
```

然后依次输入：
1. 输入 `1` - 选择 PokéChamp AI 作为对手
2. 按 `Enter` - 确认选择
3. 输入 `1` - 选择第一个宝可梦作为首发
4. 等待测试结果

**⚠️ 重要提醒：**
- 每次测试 PokéChamp AI 都必须完成**完整流程**（所有 4 个步骤）
- 不要只运行 `npm run battle` 就停止
- 必须等待 Python 服务启动并完成 AI 初始化
- 如果看到 Python 导入错误或连接错误，这些通常是预期行为（我们不需要连接 Pokemon Showdown 服务器）
