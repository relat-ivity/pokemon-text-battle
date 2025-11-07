/**
 * Pokemon Console Battle - 模块导出
 */

const { DeepSeekPlayerAI } = require('../dist/ai/ai-player/deepseek-ai');
const { SmartPlayerAI } = require('../dist/ai/ai-player/smart-ai');
const { BasePlayerAI } = require('../dist/ai/base-player-ai');
const { AIPlayerFactory } = require('../dist/ai/ai-player-factory');

module.exports = {
  // AI 类
  DeepSeekAI: DeepSeekPlayerAI,
  DeepSeekPlayerAI,
  SmartPlayerAI,
  BasePlayerAI,
  
  // 工厂（推荐使用）
  AIPlayerFactory,
  
  // 对战
  startBattle: () => require('./battle/pve-battle')
};

