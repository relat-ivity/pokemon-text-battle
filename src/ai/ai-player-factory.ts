/**
 * AI 玩家工厂类
 */

import { SmartAIPlayer } from './ai-player/smart-ai-player';
import { LLMAIPlayer } from './ai-player/llm-ai-player';
import { DoublesLLMAIPlayer } from './ai-player/doubles-llm-ai-player';
import { RandomAIPlayer } from './ai-player/random-ai-player';
import { MasterAIPlayer } from './ai-player/master-ai-player';
import { AIPlayer } from './ai-player';
import { DeepSeekProvider, OpenRouterProvider, SiliconFlowProvider } from './ai-player/llm_provider';

export enum AIType {
	SMART = 1,
	RANDOM = 2,
	DEEPSEEK = 3,
	MASTER = 4,
	POKECHAMP = 5
}

export const AI_CONFIG = {
	smart_ai: { id: AIType.SMART, name: 'Smart AI Player' },
	random_ai: { id: AIType.RANDOM, name: 'Random AI Player' },
	llm_ai: { id: AIType.DEEPSEEK, name: 'LLM AI Player' },
	master_ai: { id: AIType.MASTER, name: 'Master AI Player' }
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
	 * 获取 Master AI
	 */
	static getMasterAI(playerStream: any, debug: boolean = false): AIPlayer {
		return new MasterAIPlayer(playerStream, debug);
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
	 * 根据环境变量创建 LLM Provider
	 * @param debug 是否开启调试
	 * @returns LLM Provider 实例，如果无法创建则返回 null
	 */
	private static createLLMProvider(debug: boolean = false): any {
		const llmProvider = (process.env.LLM_PROVIDER || 'siliconflow').toLowerCase();

		switch (llmProvider) {
			case 'siliconflow': {
				if (!process.env.SILICONFLOW_API_KEY) {
					console.log('⚠ 未设置 SILICONFLOW_API_KEY');
					return null;
				}
				const model = process.env.SILICONFLOW_MODEL || 'deepseek-ai/DeepSeek-V3.2-Exp';
				console.log(`✓ 使用 SiliconFlow 模型: ${model}`);
				return new SiliconFlowProvider(model, undefined, debug);
			}
			case 'deepseek': {
				if (!process.env.DEEPSEEK_API_KEY) {
					console.log('⚠ 未设置 DEEPSEEK_API_KEY');
					return null;
				}
				console.log('✓ 使用 DeepSeek API');
				return new DeepSeekProvider(undefined, debug);
			}
			case 'openrouter': {
				if (!process.env.OPENROUTER_API_KEY) {
					console.log('⚠ 未设置 OPENROUTER_API_KEY');
					return null;
				}
				const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
				console.log(`✓ 使用 OpenRouter 模型: ${model}`);
				return new OpenRouterProvider(model, undefined, debug);
			}
			default: {
				console.log(`⚠ 未知的 LLM_PROVIDER: ${llmProvider}，使用 SiliconFlow`);
				if (!process.env.SILICONFLOW_API_KEY) {
					return null;
				}
				const model = process.env.SILICONFLOW_MODEL || 'deepseek-ai/DeepSeek-V3.2-Exp';
				return new SiliconFlowProvider(model, undefined, debug);
			}
		}
	}

	/**
	 * 判断是否为双打格式
	 * @param format 战斗格式（如 gen9vgc2024, gen9doublesou, gen9ou 等）
	 * @returns 是否为双打格式
	 */
	private static isDoublesFormat(format?: string): boolean {
		if (!format) return false;
		const formatLower = format.toLowerCase();
		// VGC 或 doubles 格式都是双打
		return formatLower.includes('vgc') || formatLower.includes('doubles');
	}

	/**
	 * 创建 AI 实例
	 * @param type AI类型
	 * @param playerStream 玩家流
	 * @param debug 是否开启调试
	 * @param teamData 我方队伍数据（LLM AI使用）
	 * @param opponentTeamData 对手队伍数据（LLM AI使用）
	 * @param format 战斗格式（如 gen9vgc2024, gen9ou 等），用于判断单打/双打
	 */
	static createAI(
		type: string,
		playerStream: any,
		debug: boolean = false,
		teamData: any[] | null = null,
		opponentTeamData: any[] | null = null,
		format?: string
	): AIPlayer {
		const config = AI_CONFIG[type as keyof typeof AI_CONFIG];
		if (!config) {
			throw new Error(`未知的 AI 类型: ${type}`);
		}

		try {
			let ai: AIPlayer;
			switch (type) {
				case 'smart_ai':
					ai = new SmartAIPlayer(playerStream, debug);
					break;
				case 'random_ai':
					ai = new RandomAIPlayer(playerStream, {}, debug);
					break;
				case 'llm_ai': {
					// 根据配置创建 LLM Provider
					const provider = this.createLLMProvider(debug);
					if (!provider) {
						console.log('⚠ LLM Provider 创建失败，降级到 Smart AI');
						return this.getDefaultAI(playerStream, debug);
					}

					// 根据格式判断创建单打或双打 AI
					if (this.isDoublesFormat(format)) {
						console.log('✓ 检测到双打格式，使用双打专用 LLM AI');
						ai = new DoublesLLMAIPlayer(playerStream, provider, teamData, opponentTeamData, debug);
					} else {
						console.log('✓ 检测到单打格式，使用单打 LLM AI');
						ai = new LLMAIPlayer(playerStream, provider, teamData, opponentTeamData, debug);
					}
					break;
				}
				case 'master_ai':
					ai = new MasterAIPlayer(playerStream, debug);
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
