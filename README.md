# Pokémon Console Battle

<div align="center">

**可以在命令行和AI进行第九代随机六六单打**

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

## ✨ 特性

- 🎮 **完整的第九代对战系统**：支持太晶化、50级对战、随机队伍生成
- 🤖 **AI对战**：接入 DeepSeek AI 或使用本地智能AI
- 🌏 **中文支持**：完整的中文翻译，支持招式、宝可梦、特性、道具等
- 📊 **详细战况**：实时显示HP、能力变化、场地效果、天气等信息
- ⚡ **易于使用**：简单的命令行交互，新手友好

## 📦 安装

### 前置要求
- Node.js >= 18.0.0
- npm 或 yarn

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/yourusername/pokemon-console-battle.git
cd pokemon-console-battle

# 安装依赖
npm install

# 编译 TypeScript
npm run build
```

## 🚀 快速开始

```bash
# 方式一：使用 npm 脚本（推荐）
npm start

# 方式二：直接运行
node index.js

# 方式三：运行主文件
node src/battle/pve-battle.js
```

## 📖 使用说明

### 对战指令

在对战中，你可以使用以下指令：

```bash
move 1              # 使用第1个招式
move 2              # 使用第2个招式
switch 2            # 切换到第2只宝可梦
move 1 terastallize # 使用第1个招式并太晶化
team                # 查看所有宝可梦状态
```

### AI 对手

项目支持两种AI对手：

#### 1. DeepSeek AI（推荐）
使用大语言模型进行智能决策，详细配置请查看 [DeepSeek AI 文档](./docs/DEEPSEEK-AI.md)

```bash
# 设置 API 密钥（Windows PowerShell）
$env:DEEPSEEK_API_KEY="你的API密钥"

# 设置 API 密钥（Linux/macOS）
export DEEPSEEK_API_KEY="你的API密钥"

# 启动对战
npm start
```

#### 2. 本地智能AI
如果没有设置 DeepSeek API 密钥，系统会自动使用本地智能AI

## 📁 项目结构

```
pokemon-console-battle/
├── src/                    # 源代码目录
│   ├── ai/                # AI 相关代码
│   │   ├── deepseek-ai.js # DeepSeek AI 实现
│   │   └── smart-ai.js    # 本地智能 AI
│   ├── battle/            # 对战相关代码
│   │   └── pve-battle.js  # PVE 对战主逻辑
│   └── index.js           # 模块导出
├── data/                  # 数据文件
│   └── translations-cn.json # 中文翻译数据
├── docs/                  # 文档
│   └── DEEPSEEK-AI.md    # DeepSeek AI 配置文档
├── tests/                 # 测试文件
│   └── test-deepseek.js  # DeepSeek API 测试
├── index.js              # 主入口文件
├── package.json          # 项目配置
├── .gitignore           # Git 忽略文件
└── README.md            # 项目说明
```

## 🎯 中文翻译

项目使用 [Pokemon-Chinese](https://github.com/relat-ivity/Pokemon-Chinese) 仓库的翻译数据，支持：

- 宝可梦名称
- 招式名称
- 特性名称
- 道具名称
- 状态异常等

## 🧪 测试

```bash
# 测试 DeepSeek API 连接
npm test
```

## 📸 对战示例
```bash
$ node pve-battle.js 
=== Pokemon Showdown PVE 对战 ===

输入格式:
   使用招式: move 1
   切换宝可梦: switch 2
   太晶化攻击: move 1 terastallize  (使用第1个招式并太晶化)
   查看队伍: team  (查看所有宝可梦状态)

正在生成随机队伍...

============================================================
Player 的队伍
============================================================

[1] 劈斧螳螂 (F) 属性:Bug/Rock 太晶属性: Bug
    性格: 慢吞吞 (+特攻 -防御)
    特性: 锋锐 描述: This Pokemon's slicing moves have their power multiplied by 1.5.
    携带物品: 厚底靴
    种族值: HP:70 攻击:135 防御:95 特攻:45 特防:70 速度:85
    招式:
       1.剑舞 [Normal] 命中:-- 描述:Raises the user's Attack by 2.
       2.岩斧 [Rock] 威力:65 命中:90% 描述:Sets Stealth Rock on the target's side.
       3.十字剪 [Bug] 威力:80 命中:100% 描述:No additional effect.
       4.近身战 [Fighting] 威力:120 命中:100% 描述:Lowers the user's Defense and Sp. Def by 1.

[2] 由克希 (N) 属性:Psychic 太晶属性: Dark
    性格: 浮躁
    特性: 飘浮 描述: This Pokemon is immune to Ground; Gravity/Ingrain/Smack Down/Iron Ball nullify it.
    携带物品: 吃剩的东西
    种族值: HP:75 攻击:75 防御:130 特攻:75 特防:130 速度:95
    招式:
       1.精神噪音 [Psychic] 威力:75 命中:100% 描述:For 2 turns, the target is prevented from healing.
       2.急速折返 [Bug] 威力:70 命中:100% 描述:User switches out after damaging the target.
       3.再来一次 [Normal] 命中:100% 描述:Target repeats its last move for its next 3 turns.
       4.拍落 [Dark] 威力:65 命中:100% 描述:1.5x damage if foe holds an item. Removes item.

[3] 拳拳蛸 (M) 属性:Rock 太晶属性: Rock
    性格: 淘气 (+防御 -特攻)
    特性: 愤怒甲壳 描述: At 1/2 or less of this Pokemon's max HP: +1 Atk, Sp. Atk, Spe, and -1 Def, Sp. Def.
    携带物品: 焦点镜
    种族值: HP:70 攻击:100 防御:115 特攻:35 特防:55 速度:75
    招式:
       1.蟹钳锤 [Water] 威力:100 命中:90% 描述:High critical hit ratio.
       2.拍落 [Dark] 威力:65 命中:100% 描述:1.5x damage if foe holds an item. Removes item.
       3.剑舞 [Normal] 命中:-- 描述:Raises the user's Attack by 2.
       4.尖石攻击 [Rock] 威力:100 命中:80% 描述:High critical hit ratio.

[4] 圈圈熊 (M) 属性:Normal 太晶属性: Normal
    性格: 天真 (+速度 -特防)
    特性: 飞毛腿 描述: If this Pokemon is statused, its Speed is 1.5x; ignores Speed drop from paralysis.
    携带物品: 剧毒宝珠
    种族值: HP:90 攻击:130 防御:75 特攻:75 特防:75 速度:55
    招式:
       1.深渊突刺 [Dark] 威力:80 命中:100% 描述:For 2 turns, the target cannot use sound moves.
       2.剑舞 [Normal] 命中:-- 描述:Raises the user's Attack by 2.
       3.近身战 [Fighting] 威力:120 命中:100% 描述:Lowers the user's Defense and Sp. Def by 1.
       4.硬撑 [Normal] 威力:70 命中:100% 描述:Power doubles if user is burn/poison/paralyzed.

[5] 大剑鬼 (M) 属性:Water 太晶属性: Dark
    性格: 乐天 (+防御 -特防)
    特性: 激流 描述: At 1/3 or less of its max HP, this Pokemon's offensive stat is 1.5x with Water attacks.
    携带物品: 突击背心
    种族值: HP:95 攻击:100 防御:85 特攻:108 特防:70 速度:70
    招式:
       1.打草结 [Grass] 命中:100% 描述:More power the heavier the target.
       2.水炮 [Water] 威力:110 命中:80% 描述:No additional effect.
       3.冰冻光束 [Ice] 威力:90 命中:100% 描述:10% chance to freeze the target.
       4.拍落 [Dark] 威力:65 命中:100% 描述:1.5x damage if foe holds an item. Removes item.

[6] 泥偶巨人 (N) 属性:Ground/Ghost 太晶属性: Fighting
    性格: 顽皮 (+攻击 -特防)
    特性: 无防守 描述: Every move used by or against this Pokemon will always hit.
    携带物品: 讲究头带
    种族值: HP:89 攻击:124 防御:80 特攻:55 特防:80 速度:55
    招式:
       1.爆裂拳 [Fighting] 威力:100 命中:50% 描述:100% chance to confuse the target.
       2.地震 [Ground] 威力:100 命中:100% 描述:Hits adjacent Pokemon. Double damage on Dig.
       3.尖石攻击 [Rock] 威力:100 命中:80% 描述:High critical hit ratio.
       4.灵骚 [Ghost] 威力:110 命中:90% 描述:Fails if the target has no held item.

============================================================

按回车开始对战...

战斗开始！

与你对战的是：DeepSeek AI

【你】 派出了 劈斧螳螂 (HP: 156/156)

【对手】 派出了 够赞猿 (HP: 100/100)

==================================================
第 1 回合
==================================================
对手出战: 够赞猿 属性:Poison/Psychic HP(%):100/100
当前出战: 劈斧螳螂 属性:Bug/Rock HP:156/156
   携带物品: 厚底靴
   特性: 锋锐 描述：This Pokemon's slicing moves have their power multiplied by 1.5.
   太晶属性: Bug（可以太晶化！）
可用招式:
   1.剑舞 [Normal] 命中：-- (PP: 32/32) 描述：Raises the user's Attack by 2.
   2.岩斧 [Rock] 威力：65 命中：90% (PP: 24/24) 描述：Sets Stealth Rock on the target's side.
   3.十字剪 [Bug] 威力：80 命中：100% (PP: 24/24) 描述：No additional effect.
   4.近身战 [Fighting] 威力：120 命中：100% (PP: 8/8) 描述：Lowers the user's Defense and Sp. Def by 1.
Your choice: move 1

【对手】 够赞猿 使用了 污泥波
  → 效果不理想...
  → 【你】 劈斧螳螂 受到伤害! (HP: 96/156)

【你】 劈斧螳螂 使用了 剑舞
  → 【你】 劈斧螳螂 的攻击上升了 2 级!

[按回车查看下一回合]

==================================================
第 2 回合
==================================================
对手出战: 够赞猿 属性:Poison/Psychic HP(%):100/100
当前出战: 劈斧螳螂 属性:Bug/Rock HP:96/156
   携带物品: 厚底靴
   特性: 锋锐 描述：This Pokemon's slicing moves have their power multiplied by 1.5.
   能力变化: 攻击+2
   太晶属性: Bug（可以太晶化！）
可用招式:
   1.剑舞 [Normal] 命中：-- (PP: 31/32) 描述：Raises the user's Attack by 2.
   2.岩斧 [Rock] 威力：65 命中：90% (PP: 24/24) 描述：Sets Stealth Rock on the target's side.
   3.十字剪 [Bug] 威力：80 命中：100% (PP: 24/24) 描述：No additional effect.
   4.近身战 [Fighting] 威力：120 命中：100% (PP: 8/8) 描述：Lowers the user's Defense and Sp. Def by 1.
Your choice: move 4

【你】 劈斧螳螂 使用了 近身战
  → 效果拔群!
  → 【对手】 够赞猿 受到伤害! (HP: 0/100)
  → 【对手】 够赞猿 倒下了!
...
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

<div align="center">

**享受你的宝可梦对战之旅！** 🎮✨

Made with ❤️ by Pokemon fans

</div>
