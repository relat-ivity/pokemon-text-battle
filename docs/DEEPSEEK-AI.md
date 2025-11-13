# DeepSeek AI 对战系统

## 简介

本系统集成了 DeepSeek AI，让你可以与真正的大语言模型进行宝可梦对战！AI 会基于实时战场信息分析局势并做出决策。

## 安装步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 获取 DeepSeek API 密钥

1. 访问 [DeepSeek 官网](https://platform.deepseek.com/)
2. 注册账号并登录
3. 在控制台创建 API 密钥
4. 复制你的 API 密钥

### 3. 设置环境变量

#### 方法一：使用 .env 文件（推荐）

这是最简单的方法，无需设置系统环境变量：

1. 复制 `.env.example` 文件为 `.env`：
   ```bash
   copy .env.example .env
   ```

2. 用文本编辑器打开 `.env` 文件，将 `your_api_key_here` 替换为你的实际 API 密钥：
   ```
   DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

3. 保存文件，直接运行即可：
   ```bash
   npm start
   ```

#### 方法二：临时设置环境变量（当前会话有效）

**Windows (PowerShell):**
```powershell
$env:DEEPSEEK_API_KEY="你的API密钥"
npm start
```

**Windows (CMD):**
```cmd
set DEEPSEEK_API_KEY=你的API密钥
npm start
```

**Linux / macOS:**
```bash
export DEEPSEEK_API_KEY="你的API密钥"
npm start
```

#### 方法三：永久设置系统环境变量

**Windows:**
1. 右键"此电脑" → 属性 → 高级系统设置 → 环境变量
2. 在"用户变量"中点击"新建"
3. 变量名：`DEEPSEEK_API_KEY`
4. 变量值：你的 API 密钥
5. **重要**：设置完成后，必须**重启所有终端窗口和 IDE**（如 VS Code、WebStorm 等），环境变量才会生效

**Linux / macOS:**
在 `~/.bashrc` 或 `~/.zshrc` 中添加：
```bash
export DEEPSEEK_API_KEY="你的API密钥"
```
然后运行：
```bash
source ~/.bashrc  # 或 source ~/.zshrc
```

## 使用方法

### 启动对战

```bash
node pve-battle.js
```

- **如果设置了 API 密钥**：使用 DeepSeek AI 对战
- **如果没有设置 API 密钥**：自动回退到本地智能 AI

### AI 决策流程

1. **收集战场信息**
   - 双方宝可梦状态（HP、属性、能力变化、状态异常）
   - 可用招式（威力、命中率、PP、属性、效果描述）
   - 特性和携带道具
   - 太晶化状态

2. **AI 分析**
   - DeepSeek AI 会分析当前局势
   - 考虑属性克制、招式威力、命中率
   - 评估 HP 状况和能力变化
   - 决定最优行动

3. **执行决策**
   - AI 会显示思考过程和理由
   - 执行选定的招式或切换宝可梦

### 示例输出

```
[使用 DeepSeek AI 对战]

【对手】 坦克臭鼬 使用了 火焰放射
  → 【你】 故勒顿 受到伤害! (HP: 150/186)

[DeepSeek AI 思考中...]
[DeepSeek AI]: 分析当前战况：
1. 我方坦克臭鼬 HP 较低（50%），对方故勒顿血量健康（80%）
2. 故勒顿是龙/格斗属性，火焰放射效果一般
3. 建议使用毒菱限制对手换人，为团队创造优势
选择：move 3 （毒菱）

【对手】 坦克臭鼬 使用了 毒菱
```

## 功能特点

### 1. 智能战术分析
- 考虑属性克制关系
- 评估招式威力和命中率
- 分析当前 HP 和能力变化
- 考虑场地效果和天气

### 2. 上下文记忆
- 保留最近 3 轮对话
- 理解战局发展趋势
- 基于历史做出连续决策

### 3. 详细思考过程
- 显示 AI 的分析理由
- 帮助理解 AI 的决策逻辑
- 提供学习对战策略的机会

### 4. 自动回退机制
- 如果 API 调用失败，自动使用备用智能 AI
- 如果没有设置 API 密钥，使用本地智能 AI
- 确保游戏始终可以正常进行

## 注意事项

1. **API 费用**
   - DeepSeek API 需要付费使用
   - 每次对战约调用 10-30 次 API
   - 建议在官网查看当前费率

2. **网络要求**
   - 需要稳定的网络连接
   - 每次决策需要 2-5 秒响应时间
   - 如果超时（10秒），会自动使用备用 AI

3. **API 调用限制**
   - 注意 API 的速率限制
   - 如果频繁调用可能触发限流

## 故障排除

### 问题：显示"未设置 DEEPSEEK_API_KEY"

**解决方案（按优先级排序）**：

1. **使用 .env 文件（推荐）**
   - 确保项目根目录存在 `.env` 文件
   - 检查文件内容格式是否正确：`DEEPSEEK_API_KEY=你的密钥`
   - 注意：等号两边不要有空格，密钥不需要引号

2. **临时设置环境变量**
   - PowerShell: `$env:DEEPSEEK_API_KEY="你的密钥"; npm start`
   - CMD: `set DEEPSEEK_API_KEY=你的密钥 && npm start`

3. **系统环境变量未生效**
   - Windows：设置系统环境变量后，必须**完全关闭并重新打开**所有终端和 IDE（如 VS Code、WebStorm）
   - 简单的"新建终端"不会加载新的环境变量
   - 可以在终端中运行 `echo %DEEPSEEK_API_KEY%`（CMD）或 `echo $env:DEEPSEEK_API_KEY`（PowerShell）验证是否生效

### 问题：API 调用失败
**解决方案**：
1. 检查网络连接
2. 验证 API 密钥是否正确
3. 检查 DeepSeek API 服务状态
4. 查看是否有足够的 API 额度

### 问题：AI 响应慢
**解决方案**：
1. 检查网络速度
2. DeepSeek API 可能在高峰期较慢
3. 系统会在 10 秒后自动超时并使用备用 AI

## 文件说明

- `deepseek-ai.js` - DeepSeek AI 实现
- `smart-ai.js` - 本地智能 AI（备用）
- `pve-battle.js` - 主对战脚本
- `translations-cn.json` - 中文翻译数据

## 自定义配置

### 修改 AI 行为

编辑 `deepseek-ai.js` 中的系统提示词：

```javascript
const systemPrompt = `你是一个宝可梦对战专家。你需要根据当前战场状态...`;
```

### 调整对话历史长度

```javascript
...this.conversationHistory.slice(-6), // 保留最近3轮（改为 -10 保留5轮）
```

### 修改超时时间

```javascript
timeout: 10000 // 10秒超时（修改为其他值，单位：毫秒）
```

## 进阶使用

### 使用其他 AI 模型

修改 `deepseek-ai.js`：

```javascript
model: 'deepseek-chat', // 改为其他模型名称
```

### 调整 AI 创造性

```javascript
temperature: 0.7, // 0.0-2.0，值越高越有创造性
```

## 技术支持

如有问题，请检查：
1. Node.js 版本（建议 18+）
2. 依赖包是否正确安装
3. API 密钥是否有效
4. 网络连接状态

祝你对战愉快！

