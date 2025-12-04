/**
 * OpenRouter LLM Provider
 * 使用 OpenRouter API 进行智能决策
 * OpenRouter 支持多种模型（Claude、GPT、Gemini等）
 */

import axios from 'axios';
import { LLMProvider, LLMResponse } from './llm-provider';

export class OpenRouterProvider extends LLMProvider {
	private readonly apiKey: string;
	private readonly apiUrl: string = 'https://openrouter.ai/api/v1/chat/completions';
	private readonly model: string;
	private readonly temperature: number = 0;
	private readonly maxTokens: number = 500;
	private readonly timeout: number = 60000;

	/**
	 * 构造函数
	 * @param model OpenRouter 模型名称（例如：'anthropic/claude-3.5-sonnet', 'openai/gpt-4'）
	 * @param apiKey OpenRouter API key（可选，默认从环境变量读取）
	 * @param debugMode 是否开启调试模式
	 */
	constructor(model: string = 'anthropic/claude-3.5-sonnet', apiKey?: string, debugMode: boolean = false) {
		super(debugMode);
		this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
		this.model = model;
	}

	/**
	 * 检查 OpenRouter API 是否可用
	 */
	isAvailable(): boolean {
		return this.apiKey !== '';
	}

	/**
	 * 获取 Provider 名称
	 */
	getName(): string {
		return `OpenRouter (${this.model})`;
	}

	/**
	 * 调用 OpenRouter API
	 */
	async callAPI(prompt: string, systemPrompt: string): Promise<LLMResponse> {
		if (this.debugMode) {
			console.log('CallOpenRouter:', systemPrompt, '\n', prompt);
		}

		if (!this.isAvailable()) {
			return {
				content: '',
				success: false,
				error: 'OpenRouter API key not configured'
			};
		}

		try {
			const messages = this.buildMessages(prompt, systemPrompt);

			const response = await axios.post(
				this.apiUrl,
				{
					model: this.model,
					messages: messages,
					temperature: this.temperature,
					max_tokens: this.maxTokens,
					reasoning: { 
						effort: "minimal" // 可选: "minimal", "low", "medium", "high" 
					}
				},
				{
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${this.apiKey}`,
						'HTTP-Referer': 'https://github.com/relat-ivity/pokemon-console-battle',
						'X-Title': 'Pokemon Console Battle'
					},
					timeout: this.timeout
				}
			);

			const aiResponse = response.data.choices[0].message.content;

			// 保存到对话历史
			this.addToHistory(prompt, aiResponse);

			return {
				content: aiResponse,
				success: true
			};
		} catch (error) {
			if (this.debugMode) {
				console.error('OpenRouter API 调用失败:', error);
			}
			return {
				content: '',
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}
}
