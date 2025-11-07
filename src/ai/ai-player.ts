/**
 * 基础 PlayerAI 抽象类 - 继承自 BattlePlayer
 * 提供基础的 AI 功能，供其他 AI 类继承
 * 
 * 【抽象类】不应直接实例化，应通过 AIPlayerFactory 创建具体的 AI 实例
 */

import type { ObjectReadWriteStream } from 'pokemon-showdown/lib/streams';
import { BattlePlayer } from 'pokemon-showdown/dist/sim/battle-stream';
import type { 
    ChoiceRequest,
    SwitchRequest,
    TeamPreviewRequest,
    MoveRequest
} from 'pokemon-showdown/dist/sim/side';


export abstract class AIPlayer extends BattlePlayer {
	constructor(
		playerStream: ObjectReadWriteStream<string>,
		debug: boolean = false
	) {
		super(playerStream, debug);
	}
	
	/**
	 * 处理错误 - 如果是无效选择，允许重试
	 */
	override receiveError(error: Error): void {
		if (error.message.startsWith('[Unavailable choice]')) {
			return;
		}
		throw error;
	}
	
	/**
	 * 接收请求并做出决策
	 */
	override receiveRequest(request: ChoiceRequest): void {
		if (request.wait) {
			return;
		} else if (request.forceSwitch) {
			this.handleForceSwitchRequest(request as SwitchRequest);
		} else if (request.teamPreview) {
			this.handleTeamPreviewRequest(request as TeamPreviewRequest);
		} else if (request.active) {
			this.handleActiveTurnRequest(request as MoveRequest);
		}
	}
	
	/**
	 * 处理强制切换（宝可梦倒下时）
	 */
	protected abstract handleForceSwitchRequest(request: SwitchRequest): void;
	
	/**
	 * 处理队伍预览
	 */
	protected abstract handleTeamPreviewRequest(request: TeamPreviewRequest): void;
	
	/**
	 * 处理正常回合
	 */
	protected abstract handleActiveTurnRequest(request: MoveRequest): void;
}

