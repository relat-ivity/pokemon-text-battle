
# Pokémon Text Battle

可以以**文本形式**和AI进行宝可梦第九代对战（支持 gen9randombattle 和 gen9ou 规则）。

Version：1.0.2

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ 特性

- 🎮 **完整的第九代对战系统**：支持太晶化、可配置队伍，支持 gen9randombattle 和 gen9ou 格式
- 🤖 **多种AI对手**：
  - **LLM AI** - 支持硅基流动/DeepSeek/OpenRouter 等多种大模型，可配置作弊模式
  - **本地大师AI** - 强大的本地策略AI
  - **本地智能AI** - 基于属性克制的智能决策
  - **随机AI** - 用于测试的随机选择
- 🌏 **中文支持**：完整的中文翻译，支持招式、宝可梦、特性、道具等
- 📊 **详细战况**：实时显示HP、能力变化、场地效果、天气等信息
- ⚡ **易于使用**：简单的命令行交互，新手友好
  
## 💻 规则

- 支持 gen9randombattle 和 gen9ou 规则

## 📦 安装

### 前置要求
- Node.js >= 18.0.0

### 快速开始

```bash
# 克隆仓库
git clone https://github.com/relat-ivity/pokemon-text-battle.git
cd pokemon-text-battle

# 安装依赖
npm install

# 设置环境变量文件
copy .env.example .env

# 启动游戏
npm start
```
---

## 📖 使用说明

### 队伍配置

项目有预设的队伍文件位于 `teams/` 目录下，也可自己配置使用的队伍

**配置方法：**

编辑 `.env` 文件，指定玩家和 AI 使用的队伍：

```bash
# 玩家队伍文件（可选 - 默认随机选择）
PLAYER_TEAM=gen9ou/gen9ou1.txt

# AI 队伍文件（可选 - 默认随机选择）
AI_TEAM=gen9ou/gen9ou2.txt
```

### 对战指令

在对战中，你可以使用以下指令：

```bash
move 2 或 m2          # 使用第2个招式，
switch 2 或 s2        # 切换到第2只宝可梦，先用team查看宝可梦编号再换人
move 1 tera 或 m1 t   # 使用第1个招式并太晶化
team                  # 查看所有宝可梦状态
```

### AI 对手

项目支持 4 种 AI 对手，难度逐级递增：

#### 1. LLM AI 🧠
使用大语言模型进行智能决策，支持作弊模式（获取对手操作信息）

**推荐：使用硅基流动（国内服务，默认）**

```bash
# 复制配置文件
cp .env.example .env

# 编辑 .env 文件，填写 API 密钥，配置模型
LLM_PROVIDER=siliconflow
SILICONFLOW_API_KEY=你的API密钥
SILICONFLOW_MODEL=deepseek-ai/DeepSeek-V3.2-Exp

# 启动游戏
npm start
# 选择菜单中选择 "1. LLM AI"
```

**支持的 Provider：**
- **硅基流动** (推荐) - 国内服务，速度快，价格低，**注册赠送20元余额**
- **DeepSeek** - DeepSeek 官方 API
- **OpenRouter** - 支持 Claude、GPT-4 等多种模型，拥有最多模型

详细配置请查看：
- [LLM AI 文档](./docs/LLM_AI_GUIDE.md)

#### 2. 本地大师AI 🥇
高级本地策略AI，无需API密钥

```bash
npm start
# 选择菜单中选择 "2. 本地大师AI"
```

#### 3. 本地智能AI 🥈
基于属性克制和招式评分的本地智能AI

```bash
npm start
# 选择菜单中选择 "3. 本地智能AI"
```

#### 4. 随机AI 🎲 (测试用)
随机使用技能和换人，用于测试和学习

```bash
npm start
# 选择菜单中选择 "4. 随机AI"
```

## 📸 对战示例
```txt
$ npm start
=== Pokemon Showdown PVE 对战 ===

输入格式:
    使用招式: move 1
    切换宝可梦: switch 2
    太晶化攻击: move 1 tera  (使用第1个招式并太晶化)
    查看队伍: team  (查看所有宝可梦状态)

请选择对手：
    1. LLM AI (可配置硅基流动/DeepSeek/OpenRouter等API)
    2. 本地大师AI
    3. 本地智能AI
    4. 随机行为AI
请输入对手编号:1

✓ 对战格式: gen9ou
✓ 玩家队伍: gen9ou8.txt
✓ AI队伍: gen9ou9.txt

✓ 使用 SiliconFlow 模型: deepseek-ai/DeepSeek-V3.2-Exp
✓ 已创建对手: LLM AI (硅基流动/DeepSeek-V3.2-Exp)
✓ AI已启动

按回车开始生成队伍...
============================================================
Player 的队伍
============================================================
[1] 盔甲鸟 Lv.100 属性:钢/飞行 太晶属性: 龙 性格: 淘气
    特性: 结实 描述: If this Pokemon is at full HP, it survives one hit with at least 1 HP. Immune to OHKO.
    携带物品: 凹凸头盔
    种族值: HP:65 攻击:80 防御:140 特攻:40 特防:70 速度:70
    招式:
       1.吹飞 [一般] 命中:-- 描述:Forces the target to switch to a random ally.
       2.勇鸟猛攻 [飞行] 威力:120 命中:100% 描述:Has 33% recoil.
       3.隐形岩 [岩石] 命中:-- 描述:Hurts foes on switch-in. Factors Rock weakness.
       4.羽栖 [飞行] 命中:-- 描述:Heals 50% HP. Flying-type removed 'til turn ends.

[2] 古鼎鹿 Lv.100 属性:恶/地面 太晶属性: 幽灵 性格: 慎重
    特性: 灾祸之鼎 描述: Active Pokemon without this Ability have their Special Attack multiplied by 0.75.
    携带物品: 厚底靴
    种族值: HP:155 攻击:110 防御:125 特攻:55 特防:80 速度:45
    招式:
       1.大灾难 [恶] 命中:90% 描述:Does damage equal to 1/2 target's current HP.
       2.地震 [地面] 威力:100 命中:100% 描述:Hits adjacent Pokemon. Double damage on Dig.
       3.吹飞 [一般] 命中:-- 描述:Forces the target to switch to a random ally.
       4.撒菱 [地面] 命中:-- 描述:Hurts grounded foes on switch-in. Max 3 layers.

[3] 藏玛然特 Lv.100 属性:格斗 太晶属性: 火 性格: 固执
    特性: 不屈之盾 描述: On switch-in, this Pokemon's Defense is raised by 1 stage. Once per battle.
    携带物品: 厚底靴
    种族值: HP:92 攻击:120 防御:115 特攻:80 特防:115 速度:138
    招式:
       1.近身战 [格斗] 威力:120 命中:100% 描述:Lowers the user's Defense and Sp. Def by 1.
       2.咬碎 [恶] 威力:80 命中:100% 描述:20% chance to lower the target's Defense by 1.
       3.重磅冲撞 [钢] 命中:100% 描述:More power the heavier the user than the target.
       4.尖石攻击 [岩石] 威力:100 命中:80% 描述:High critical hit ratio.

[4] 玛狃拉 Lv.100 属性:恶/冰 太晶属性: 冰 性格: 爽朗
    特性: 顺手牵羊 描述: If this Pokemon has no item and is hit by a contact move, it steals the attacker's item.
    携带物品: 厚底靴
    种族值: HP:70 攻击:120 防御:65 特攻:45 特防:85 速度:125
    招式:
       1.三旋击 [冰] 威力:20 命中:90% 描述:Hits 3 times. Each hit can miss, but power rises.
       2.冰之砾 [冰] 威力:40 命中:100% 描述:Usually goes first.
       3.拍落 [恶] 威力:65 命中:100% 描述:1.5x damage if foe holds an item. Removes item.
       4.踢倒 [格斗] 命中:100% 描述:More power the heavier the target.

[5] 酋雷姆 Lv.100 属性:龙/冰 太晶属性: 妖精 性格: 胆小
    特性: 压迫感 描述: If this Pokemon is the target of a foe's move, that move loses one additional PP.
    携带物品: 厚底靴
    种族值: HP:125 攻击:130 防御:90 特攻:130 特防:90 速度:95
    招式:
       1.鳞射 [龙] 威力:25 命中:90% 描述:Hits 2-5 times. User: -1 Def, +1 Spe after last hit.
       2.冰冻光束 [冰] 威力:90 命中:100% 描述:10% chance to freeze the target.
       3.冷冻干燥 [冰] 威力:70 命中:100% 描述:10% chance to freeze. Super effective on Water.
       4.大地之力 [地面] 威力:90 命中:100% 描述:10% chance to lower the target's Sp. Def by 1.

[6] 呆呆王(伽勒尔形态) Lv.100 属性:毒/超能 太晶属性: 水 性格: 自大
    特性: 再生力 描述: This Pokemon restores 1/3 of its maximum HP, rounded down, when it switches out.
    携带物品: 厚底靴
    种族值: HP:95 攻击:65 防御:80 特攻:110 特防:110 速度:30
    招式:
       1.预知未来 [超能] 威力:120 命中:100% 描述:Hits two turns after being used.
       2.污泥炸弹 [毒] 威力:90 命中:100% 描述:30% chance to poison the target.
       3.冷笑话 [冰] 命中:-- 描述:Starts Snow. User switches out.
       4.剧毒 [毒] 命中:90% 描述:Badly poisons the target. Poison types can't miss.

============================================================
对手的宝可梦：多龙巴鲁托 西狮海壬 铁头壳 大剑鬼(Samurott-Hisui) 仆刀将军 土地云(Landorus-Therian)

请选择你的队伍首发(1-6的数字): 1

✓ 首发已确定为1号宝可梦

战斗开始！

等待AI选择首发宝可梦...

【你】 派出了 盔甲鸟 (HP: 333/333)

【对手】 派出了 铁头壳 (HP: 100/100)

[按回车进行下一回合]

==================================================
第 1 回合
==================================================
对手出战: 铁头壳 Lv.100 属性:钢/超能 HP(%):100/100
当前出战: 盔甲鸟 属性:钢/飞行 HP:333/333
   携带物品: 凹凸头盔
   特性: 结实 描述：If this Pokemon is at full HP, it survives one hit with at least 1 HP. Immune to OHKO.
   太晶属性: 龙（可以太晶化！）

可用招式:
   1.吹飞 [一般/变化] 命中：-- (PP: 32/32) 描述：Forces the target to switch to a random ally.
   2.勇鸟猛攻 [飞行/物理] 威力：120 命中：100% (PP: 24/24) 描述：Has 33% recoil.
   3.隐形岩 [岩石/变化] 命中：-- (PP: 32/32) 描述：Hurts foes on switch-in. Factors Rock weakness.
   4.羽栖 [飞行/变化] 命中：-- (PP: 8/8) 描述：Heals 50% HP. Flying-type removed 'til turn ends.
你的选择: m3

等待对手行动...

【对手】 铁头壳 使用了 伏特替换
  → 效果拔群!
  → 会心一击!
  → 【你】 盔甲鸟 受到伤害! (HP: 11/333)

【对手】 铁头壳 的 夸克充能 状态结束了!

【对手】 派出了 仆刀将军 (HP: 100/100)

【你】 盔甲鸟 使用了 隐形岩
  → 【对手】 的场地上散布了 隐形岩!

[按回车进行下一回合]

==================================================
第 2 回合
==================================================
场地状态:
   对手场地: 隐形岩

对手出战: 仆刀将军 Lv.100 属性:恶/钢 HP(%):100/100
当前出战: 盔甲鸟 属性:钢/飞行 HP:11/333
   携带物品: 凹凸头盔
   特性: 结实 描述：If this Pokemon is at full HP, it survives one hit with at least 1 HP. Immune to OHKO.
   太晶属性: 龙（可以太晶化！）

可用招式:
   1.吹飞 [一般/变化] 命中：-- (PP: 32/32) 描述：Forces the target to switch to a random ally.
   2.勇鸟猛攻 [飞行/物理] 威力：120 命中：100% (PP: 24/24) 描述：Has 33% recoil.
   3.隐形岩 [岩石/变化] 命中：-- (PP: 31/32) 描述：Hurts foes on switch-in. Factors Rock weakness.
   4.羽栖 [飞行/变化] 命中：-- (PP: 8/8) 描述：Heals 50% HP. Flying-type removed 'til turn ends.
你的选择: m4

【你】 盔甲鸟 使用了 羽栖
  → 【你】 盔甲鸟 恢复了HP! (HP: 178/333)

【对手】 仆刀将军 使用了 仆刀
  → 【你】 盔甲鸟 受到伤害! (HP: 84/333)
  → 【对手】 仆刀将军 受到伤害! (HP: 84/100)
  → 【对手】 仆刀将军 恢复了HP! (吃剩的东西) (HP: 90/100)

[按回车进行下一回合]

==================================================
第 3 回合
==================================================
场地状态:
   对手场地: 隐形岩

对手出战: 仆刀将军 Lv.100 属性:恶/钢 HP(%):90/100
当前出战: 盔甲鸟 属性:钢/飞行 HP:84/333
   携带物品: 凹凸头盔
   特性: 结实 描述：If this Pokemon is at full HP, it survives one hit with at least 1 HP. Immune to OHKO.
   太晶属性: 龙（可以太晶化！）

可用招式:
   1.吹飞 [一般/变化] 命中：-- (PP: 32/32) 描述：Forces the target to switch to a random ally.
   2.勇鸟猛攻 [飞行/物理] 威力：120 命中：100% (PP: 24/24) 描述：Has 33% recoil.
   3.隐形岩 [岩石/变化] 命中：-- (PP: 31/32) 描述：Hurts foes on switch-in. Factors Rock weakness.
   4.羽栖 [飞行/变化] 命中：-- (PP: 7/8) 描述：Heals 50% HP. Flying-type removed 'til turn ends.
你的选择: ...
```

## 📚 文档

- [LLM AI 使用指南](./docs/LLM_AI_GUIDE.md) - 提示词和功能说明
- [Claude.md](./CLAUDE.md) - Claude 项目架构和开发指南

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

<div align="center">

**享受你的宝可梦对战之旅！** 🎮✨

Made with ❤️ by Pokemon fans

</div>
