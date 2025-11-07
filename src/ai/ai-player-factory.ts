/**
 * AI 玩家工厂类
 */

import { SmartAIPlayer } from './ai-player/smart-ai-player';
import { DeepSeekAIPlayer } from './ai-player/deepseek-ai-player';
import { RandomAIPlayer } from './ai-player/random-ai-player';
import { AIPlayer } from './ai-player';

export enum AIType {
	SMART = 1,
	RANDOM = 2,
	DEEPSEEK = 3
}

export const AI_CONFIG = {
	smart_ai: { id: AIType.SMART, name: 'Smart AI Player' },
	random_ai: { id: AIType.RANDOM, name: 'Random AI Player' },
	deepseek_ai: { id: AIType.DEEPSEEK, name: 'DeepSeek AI Player' }
} as const;

/**
* AI 玩家工厂类
*/
export class AIPlayerFactory {
	/**
	 * 获取默认 AI (智能AI)
	 */
	static getDefaultAI(playerStream: any, debug: boolean = false): AIPlayer {
		return new SmartAIPlayer(playerStream, debug);
	}
	
	/**
	 * 显示所有可用的 AI
	 */
	static displayAllAI(): void {
		console.log('\n可用的 AI 类型:');
		Object.entries(AI_CONFIG).forEach(([type, config], index) => {
			console.log(`    ${index + 1}. ${config.name}`);
		});
	}
	
	/**
	 * 创建 AI 实例
	 * @param type AI类型
	 * @param playerStream 玩家流
	 * @param debug 是否开启调试
	 * @param opponentTeamData 对手队伍数据（仅DeepSeek AI使用）
	 * @param lang 语言（仅DeepSeek AI使用）
	 */
	static createAI(
		type: string, 
		playerStream: any,
		debug: boolean = false,
		opponentTeamData: any[] | null = null,
	): AIPlayer {
		const config = AI_CONFIG[type as keyof typeof AI_CONFIG];
		if (!config) {
			throw new Error(`未知的 AI 类型: ${type}`);
		}
		
		// DeepSeek AI 特殊处理：如果没有API key，降级到智能AI
		if (type === 'deepseek_ai' && !process.env.DEEPSEEK_API_KEY) {
			console.log('⚠ 未设置 DEEPSEEK_API_KEY，使用 SmartAI');
			return this.getDefaultAI(playerStream, debug);
		}
		
		try {
			console.log(`✓ 使用 ${config.name}`);
			
			let ai: AIPlayer;
			switch (type) {
				case 'smart_ai':
					ai = new SmartAIPlayer(playerStream, debug);
					break;
				case 'random_ai':
					ai = new RandomAIPlayer(playerStream, {}, debug);
					break;
				case 'deepseek_ai':
					ai = new DeepSeekAIPlayer(playerStream, opponentTeamData, debug);
					break;
				default:
					throw new Error(`未实现的 AI 类型: ${type}`);
			}
			
			return ai;
		} catch (error) {
			// 如果创建失败且不是智能AI，降级到智能AI
			if (type !== 'smart_ai') {
				console.log(`⚠ ${config.name} 创建失败，使用 SmartAI`);
				return this.getDefaultAI(playerStream, debug);
			}
			throw error;
		}
	}
}

