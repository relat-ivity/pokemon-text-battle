/**
 * LLM Provider 抽象基类
 * 定义所有 LLM API 提供商的通用接口
 */

export interface LLMMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface LLMResponse {
	content: string;
	success: boolean;
	error?: string;
}

/**
 * LLM Provider 抽象基类
 * 所有具体的 LLM 提供商（DeepSeek、OpenRouter等）都应继承此类
 */
export abstract class LLMProvider {
	protected conversationHistory: LLMMessage[] = [];
	protected debugMode: boolean = false;

	constructor(debugMode: boolean = false) {
		this.debugMode = debugMode;
	}

	/**
	 * 调用 LLM API
	 * @param prompt 用户提示词
	 * @param systemPrompt 系统提示词
	 * @returns LLM 响应
	 */
	abstract callAPI(prompt: string, systemPrompt: string): Promise<LLMResponse>;

	/**
	 * 检查 API 是否可用（例如检查 API key 是否设置）
	 */
	abstract isAvailable(): boolean;

	/**
	 * 获取 Provider 名称
	 */
	abstract getName(): string;

	/**
	 * 添加消息到对话历史
	 */
	protected addToHistory(userPrompt: string, assistantResponse: string): void {
		this.conversationHistory.push(
			{ role: 'user', content: userPrompt },
			{ role: 'assistant', content: assistantResponse }
		);
	}

	/**
	 * 获取最近的对话历史（限制数量）
	 */
	protected getRecentHistory(maxMessages: number = 0): LLMMessage[] {
		if (maxMessages <= 0) {
			return [];
		}
		return this.conversationHistory.slice(-maxMessages);
	}

	/**
	 * 清空对话历史
	 */
	clearHistory(): void {
		this.conversationHistory = [];
	}

	/**
	 * 构建完整的消息列表
	 */
	protected buildMessages(prompt: string, systemPrompt: string): LLMMessage[] {
		return [
			{ role: 'system', content: systemPrompt },
			// ...this.getRecentHistory(),
			{ role: 'user', content: prompt }
		];
	}
}
