
# Pokémon Text Battle

可以以**文本形式**和AI进行宝可梦第九代宝可梦随机对战（gen9randombattle规则）。

Version：0.3.0 (新增 PokéChamp AI)

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ 特性

- 🎮 **完整的第九代对战系统**：支持太晶化、50级对战、随机队伍生成
- 🤖 **多种AI对手**：
  - **PokéChamp AI** - ICML 2025 获奖的 Minimax + LLM 混合AI，支持 10+ 种 LLM 后端
  - **DeepSeek AI** - 高性能、低成本的 LLM AI
  - **本地大师AI** - 强大的本地策略AI
  - **本地智能AI** - 基于属性克制的智能决策
  - **随机AI** - 用于测试的随机选择
- 🌏 **中文支持**：完整的中文翻译，支持招式、宝可梦、特性、道具等
- 📊 **详细战况**：实时显示HP、能力变化、场地效果、天气等信息
- ⚡ **易于使用**：简单的命令行交互，新手友好
  
## 💻 规则

- 宝可梦随机分配
- 所有宝可梦等级50级，性格：勤奋，个体值(IV)每项31，努力值(EV)每项85
- 添加**选择首发**环节

## 📦 安装

### 前置要求
- Node.js >= 18.0.0

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/relat-ivity/pokemon-text-battle.git
cd pokemon-text-battle

# 安装依赖
npm install

# 编译 TypeScript
npm run build
```

## 🚀 快速开始

### 🎯 选择对战模式

本项目支持**两种对战模式**：

#### 模式 1：本地对战模式（推荐新手）⭐

**一条命令启动，简单快捷：**

```bash
npm start
# 或
node src/battle_local/pve-battle.js
```

**特点：**
- ✅ 简单易用，无需额外配置
- ✅ 支持 4 种 AI：DeepSeek AI、Master AI、智能 AI、随机 AI
- ❌ 不支持 PokéChamp AI（PokéChamp 需要完整的 Battle 对象）

#### 模式 2：服务器对战模式（PokéChamp AI 专用）🏆

**方法 A：一键启动（推荐）⭐**

使用自动启动脚本，一条命令启动所有服务：

```bash
npm run pokechamp:all
```

脚本会自动依次启动：
1. Pokemon Showdown 本地服务器
2. PokéChamp Python 服务
3. 玩家客户端

**方法 B：手动启动（三个终端）**

如果需要分别查看每个进程的日志：

```bash
# 终端 1 - 启动本地服务器
npm run server

# 终端 2 - 启动 PokéChamp Python 服务
cd pokechamp-ai
python pokechamp-service.py

# 终端 3 - 启动玩家客户端
npm run pokechamp
```

**特点：**
- ✅ PokéChamp AI 使用完整的 Minimax + LLM 决策（84% 胜率）
- ✅ 支持 10+ 种 LLM 后端
- ✅ 现在支持一键启动！
- ⚠️ 需要 Python 环境和 `.env` 配置

---

## 📖 使用说明

### 对战指令

在对战中，你可以使用以下指令：

```bash
move 2              # 使用第2个招式
switch 2            # 切换到第2只宝可梦
move 1 terastallize # 使用第1个招式并太晶化
team                # 查看所有宝可梦状态
```

### AI 对手

项目支持 5 种 AI 对手，难度逐级递增：

#### 1. PokéChamp AI 🏆 (最强！)**仅服务器模式**

ICML 2025 获奖的强大 AI，采用 Minimax 树搜索 + LLM 混合策略
- **性能**: 84% 胜率（vs 规则类AI）
- **支持后端**: 10+ 种 LLM（GPT-4o、Gemini、DeepSeek、本地模型等）
- **⚠️ 注意**: 仅在服务器对战模式中可用（需要完整的 Battle 对象）

**一键启动（推荐）：**
```bash
npm run pokechamp:all
```

**或手动启动（三个终端）：**
```bash
# 终端 1 - 启动服务器
npm run server

# 终端 2 - 启动 Python 服务
python pokechamp-service.py

# 终端 3 - 启动玩家客户端
npm run pokechamp
```

详细配置请查看 [PokéChamp AI 文档](./POKECHAMP_AI_GUIDE.md)

#### 2. DeepSeek AI 💰 (性价比最高) **本地模式**
使用 DeepSeek LLM 进行智能决策，成本极低
- **成本**: $0.02/对战（约20回合）
- **性能**: 高（接近 GPT-4）

```bash
# 设置 API 密钥并运行
export DEEPSEEK_API_KEY="你的API密钥"
npm start

# 选择菜单中选择 "2. DeepSeek AI"
```

#### 3. Master AI 🥇 (强大本地AI) **本地模式**
高级本地策略AI，无需API密钥
- **性能**: 强（70% 胜率 vs 智能AI）
- **速度**: 快速（2秒/回合）

```bash
npm start
# 选择菜单中选择 "3. Master AI (强大对手)"
```

#### 4. 本地智能AI 🧠 (智能AI) **本地模式**
基于属性克制和招式评分的本地智能AI
- **性能**: 中等（60% 胜率 vs 随机AI）
- **速度**: 快速（1秒/回合）

```bash
npm start
# 选择菜单中选择 "4. 本地智能AI"
```

#### 5. 随机AI 🎲 (测试用) **本地模式**
随机使用技能和换人，用于测试和学习

```bash
npm start
# 选择菜单中选择 "5. 随机AI"
```

### AI 难度对比表

| 特性 | 随机AI | 智能AI | Master | DeepSeek | PokéChamp |
|------|---------|---------|---------|----------|-----------|
| **对战模式** | 本地 | 本地 | 本地 | 本地 | **服务器** |
| 基础策略 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 属性克制 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 招式评分 | ❌ | ✅ | ✅ | ✅ | ✅ |
| LLM推理 | ❌ | ❌ | ❌ | ✅ | ✅ |
| Minimax搜索 | ❌ | ❌ | ❌ | ❌ | ✅ |
| 胜率 | ~20% | ~60% | ~70% | ~80% | ~84% |
| 成本/对战 | 免费 | 免费 | 免费 | $0.02 | $0.40 |
| 启动命令 | `npm start` | `npm start` | `npm start` | `npm start` | 见上文 |

## 📸 对战示例
```txt
$ node pve-battle.js 
=== Pokemon Showdown PVE 对战 ===

输入格式:
    使用招式: move 1
    切换宝可梦: switch 2
    太晶化攻击: move 1 terastallize  (使用第1个招式并太晶化)
    查看队伍: team  (查看所有宝可梦状态)

请选择对手：
    1. PokéChamp AI (最强！)
    2. DeepSeek AI
    3. Master AI (强大对手)
    4. 本地智能AI
    5. 随机AI
请输入对手编号:1

✓ 已创建对手: PokéChamp AI
✓ AI已启动

按回车开始生成队伍...
============================================================
Player 的队伍
============================================================
[1] 幸福蛋 (F) 属性:一般 太晶属性: 幽灵 性格: 勤奋
    特性: 自然回复 描述: This Pokemon has its non-volatile status condition cured when it switches out.
    携带物品: 吃剩的东西
    种族值: HP:255 攻击:10 防御:10 特攻:75 特防:135 速度:55
    招式:
       1.隐形岩 [岩石] 命中:-- 描述:Hurts foes on switch-in. Factors Rock weakness.
       2.电磁波 [电] 命中:90% 描述:Paralyzes the target.
       3.地球上投 [格斗] 命中:100% 描述:Does damage equal to the user's level.
       4.生蛋 [一般] 命中:-- 描述:Heals the user by 50% of its max HP.

[2] 怖纳噬草 (M) 属性:草/幽灵 太晶属性: 妖精 性格: 勤奋
    特性: 乘风 描述: Attack raised by 1 if hit by a wind move or Tailwind begins. Wind move immunity.
    携带物品: 厚底靴
    种族值: HP:55 攻击:115 防御:70 特攻:80 特防:70 速度:90
    招式:
       1.灵骚 [幽灵] 威力:110 命中:90% 描述:Fails if the target has no held item.
       2.高速旋转 [一般] 威力:50 命中:100% 描述:Free user from hazards/bind/Leech Seed; +1 Spe.
       3.强力鞭打 [草] 威力:120 命中:85% 描述:No additional effect.
       4.撒菱 [地面] 命中:-- 描述:Hurts grounded foes on switch-in. Max 3 layers.

[3] 随风球 (M) 属性:幽灵/飞行 太晶属性: 妖精 性格: 勤奋
    特性: 轻装 描述: Speed is doubled on held item loss; boost is lost if it switches, gets new item/Ability.
    携带物品: 文柚果
    种族值: HP:150 攻击:80 防御:44 特攻:90 特防:54 速度:80
    招式:
       1.暗影球 [幽灵] 威力:80 命中:100% 描述:20% chance to lower the target's Sp. Def by 1.
       2.吸取力量 [草] 命中:100% 描述:User heals HP=target's Atk stat. Lowers Atk by 1.
       3.空气斩 [飞行] 威力:75 命中:95% 描述:30% chance to make the target flinch.
       4.冥想 [超能] 命中:-- 描述:Raises the user's Sp. Atk and Sp. Def by 1.

[4] 火烈鸟 (M) 属性:飞行/格斗 太晶属性: 钢 性格: 勤奋
    特性: 胆量 描述: Fighting, Normal moves hit Ghost. Immune to Intimidate.
    携带物品: 生命宝珠
    种族值: HP:82 攻击:115 防御:74 特攻:75 特防:64 速度:90
    招式:
       1.勇鸟猛攻 [飞行] 威力:120 命中:100% 描述:Has 33% recoil.
       2.近身战 [格斗] 威力:120 命中:100% 描述:Lowers the user's Defense and Sp. Def by 1.
       3.深渊突刺 [恶] 威力:80 命中:100% 描述:For 2 turns, the target cannot use sound moves.
       4.剑舞 [一般] 命中:-- 描述:Raises the user's Attack by 2.

[5] 卡比兽 (M) 属性:一般 太晶属性: 妖精 性格: 勤奋
    特性: 厚脂肪 描述: Fire-/Ice-type moves against this Pokemon deal damage with a halved offensive stat.
    携带物品: 吃剩的东西
    种族值: HP:160 攻击:110 防御:65 特攻:65 特防:110 速度:30
    招式:
       1.泰山压顶 [一般] 威力:85 命中:100% 描述:30% chance to paralyze the target.
       2.梦话 [一般] 命中:-- 描述:User must be asleep. Uses another known move.
       3.诅咒 [幽灵] 命中:-- 描述:Curses if Ghost, else -1 Spe, +1 Atk, +1 Def.
       4.睡觉 [超能] 命中:-- 描述:User sleeps 2 turns and restores HP and status.

[6] 千面避役 (M) 属性:水 太晶属性: 水 性格: 勤奋
    特性: 激流 描述: At 1/3 or less of its max HP, this Pokemon's offensive stat is 1.5x with Water attacks.
    携带物品: 讲究眼镜
    种族值: HP:70 攻击:85 防御:65 特攻:125 特防:65 速度:120
    招式:
       1.冰冻光束 [冰] 威力:90 命中:100% 描述:10% chance to freeze the target.
       2.急速折返 [虫] 威力:70 命中:100% 描述:User switches out after damaging the target.
       3.恶之波动 [恶] 威力:80 命中:100% 描述:20% chance to make the target flinch.
       4.水炮 [水] 威力:110 命中:80% 描述:No additional effect.

============================================================
对手的宝可梦：沙螺蟒 普隆隆姆 轰擂金刚猩 藏饱栗鼠 沙铁皮 电击魔兽

请选择你的队伍首发(1-6的数字): 6

✓ 首发已确定为6号宝可梦

战斗开始！

等待PokéChamp选择首发宝可梦...

【你】 派出了 千面避役 (HP: 156/156)

【对手】 派出了 沙铁皮 (HP: 100/100)

[按回车进行下一回合]

==================================================
第 1 回合
==================================================
对手出战: 沙铁皮 属性:电/地面 HP(%):100/100
当前出战: 千面避役 属性:水 HP:156/156
   携带物品: 讲究眼镜
   特性: 激流 描述：At 1/3 or less of its max HP, this Pokemon's offensive stat is 1.5x with Water attacks.
   太晶属性: 水（可以太晶化！）

可用招式:
   1.冰冻光束 [冰] 威力：90 命中：100% (PP: 16/16) 描述：10% chance to freeze the target.
   2.急速折返 [虫] 威力：70 命中：100% (PP: 32/32) 描述：User switches out after damaging the target.
   3.恶之波动 [恶] 威力：80 命中：100% (PP: 24/24) 描述：20% chance to make the target flinch.
   4.水炮 [水] 威力：110 命中：80% (PP: 8/8) 描述：No additional effect.
你的选择: switch 2

【你】 派出了 幸福蛋 (HP: 341/341)

【对手】 沙铁皮 使用了 撒菱
  → 【你】 的场地上散布了 撒菱!

[按回车进行下一回合]

==================================================
第 2 回合
==================================================
场地状态:
   我方场地: 撒菱

对手出战: 沙铁皮 属性:电/地面 HP(%):100/100
当前出战: 幸福蛋 属性:一般 HP:341/341
   携带物品: 吃剩的东西
   特性: 自然回复 描述：This Pokemon has its non-volatile status condition cured when it switches out.
   太晶属性: 幽灵（可以太晶化！）

可用招式:
   1.隐形岩 [岩石] 命中：-- (PP: 32/32) 描述：Hurts foes on switch-in. Factors Rock weakness.
   2.电磁波 [电] 命中：90% (PP: 32/32) 描述：Paralyzes the target.
   3.地球上投 [格斗] 命中：100% (PP: 32/32) 描述：Does damage equal to the user's level.
   4.生蛋 [一般] 命中：-- (PP: 8/8) 描述：Heals the user by 50% of its max HP.
Your choice: team

对手剩余宝可梦: 沙螺蟒 普隆隆姆 轰擂金刚猩 藏饱栗鼠 沙铁皮 电击魔兽
你的宝可梦:
[1] 幸福蛋 [出战中] HP:341/341
[2] 千面避役 HP:156/156
[3] 怖纳噬草 HP:141/141
[4] 随风球 HP:236/236
[5] 火烈鸟 HP:168/168
[6] 卡比兽 HP:246/246

你的选择: move 1

【对手】 派出了 轰擂金刚猩 (HP: 100/100)
  → 场地变为: 青草场地

【你】 幸福蛋 使用了 隐形岩
  → 【对手】 的场地上散布了 隐形岩!

[按回车进行下一回合]

==================================================
第 3 回合
==================================================
场地状态:
   场地: 青草场地
   我方场地: 撒菱
   对手场地: 隐形岩

对手出战: 轰擂金刚猩 属性:草 HP(%):100/100
当前出战: 幸福蛋 属性:一般 HP:341/341
   携带物品: 吃剩的东西
   特性: 自然回复 描述：This Pokemon has its non-volatile status condition cured when it switches out.
   太晶属性: 幽灵（可以太晶化！）

可用招式:
   1.隐形岩 [岩石] 命中：-- (PP: 31/32) 描述：Hurts foes on switch-in. Factors Rock weakness.
   2.电磁波 [电] 命中：90% (PP: 32/32) 描述：Paralyzes the target.
   3.地球上投 [格斗] 命中：100% (PP: 32/32) 描述：Does damage equal to the user's level.
   4.生蛋 [一般] 命中：-- (PP: 8/8) 描述：Heals the user by 50% of its max HP.
你的选择: ...
```

## 📚 文档

- [PokéChamp AI 详细配置指南](./POKECHAMP_AI_GUIDE.md) - 学习如何配置 10+ 种 LLM 后端
- [Claude.md](./CLAUDE.md) - 项目架构和开发指南

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

<div align="center">

**享受你的宝可梦对战之旅！** 🎮✨

Made with ❤️ by Pokemon fans

</div>
