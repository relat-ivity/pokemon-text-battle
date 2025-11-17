#!/usr/bin/env python3
"""
PokéChamp AI Player - 自动连接并搜索对战

直接连接到 localhost:8000 的 Pokemon Showdown 服务器
自动搜索 gen9randombattle 对战
"""

import sys
import os
import asyncio
from pathlib import Path

# 加载 .env 文件
try:
    from dotenv import load_dotenv
    # 现在文件在 src/ai/ai-player/ 目录下，需要向上三级找到项目根目录
    env_path = Path(__file__).parent.parent.parent.parent / '.env'
    if env_path.exists():
        load_dotenv(env_path)
        print(f"[✓] 已加载 .env 文件", file=sys.stderr, flush=True)
    else:
        print(f"[⚠️] .env 文件不存在: {env_path}", file=sys.stderr, flush=True)
except ImportError:
    print("[⚠️] python-dotenv 未安装，将使用系统环境变量", file=sys.stderr, flush=True)

# Add pokechamp to path (向上三级到项目根目录)
pokechamp_path = Path(__file__).parent.parent.parent.parent / 'pokechamp-ai'
sys.path.insert(0, str(pokechamp_path))

print(f"[DEBUG] pokechamp_path = {pokechamp_path}", file=sys.stderr, flush=True)
print(f"[DEBUG] pokechamp_path.exists() = {pokechamp_path.exists()}", file=sys.stderr, flush=True)

try:
    from poke_env.player.team_util import get_llm_player
    from poke_env.ps_client.server_configuration import LocalhostServerConfiguration
    import poke_env.player.player as player_module

    # Patch _get_random_avatar 以避免 avatar 导致的服务器崩溃
    original_get_random_avatar = player_module._get_random_avatar
    player_module._get_random_avatar = lambda: None  # 返回 None 而不是随机 avatar

    print("[✓] 成功导入 PokéChamp 模块", file=sys.stderr, flush=True)
except ImportError as e:
    print(f"[✗] 导入失败: {e}", file=sys.stderr, flush=True)
    print("[提示] 请确保 pokechamp-ai 已正确安装", file=sys.stderr, flush=True)
    sys.exit(1)


async def main():
    """主函数"""
    # 从环境变量读取配置
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    backend = os.environ.get("POKECHAMP_LLM_BACKEND", "deepseek/deepseek-chat-v3.1:free")
    battle_format = "gen9randombattle"

    # 从命令行参数获取唯一ID，如果没有则生成一个
    import time
    if len(sys.argv) > 1:
        unique_id = sys.argv[1]
        print(f"[DEBUG] 使用传入的ID: {unique_id}", file=sys.stderr, flush=True)
    else:
        unique_id = str(int(time.time() * 1000) % 10000)  # 使用时间戳生成唯一ID
        print(f"[DEBUG] 生成唯一ID: {unique_id}", file=sys.stderr, flush=True)

    if not api_key:
        print("[⚠️] OPENROUTER_API_KEY 未设置", file=sys.stderr, flush=True)
        print("[⚠️] 将使用默认配置（可能无法正常工作）", file=sys.stderr, flush=True)
        api_key = "dummy_key"  # 提供一个默认值

    print(f"[🚀] 正在初始化 PokéChamp AI...", file=sys.stderr, flush=True)
    print(f"[📡] 服务器: localhost:8000", file=sys.stderr, flush=True)
    print(f"[🤖] 后端: {backend}", file=sys.stderr, flush=True)
    print(f"[🎮] 对战格式: {battle_format}", file=sys.stderr, flush=True)

    try:
        # 创建简单的 args 对象（模拟命令行参数）
        class SimpleArgs:
            def __init__(self):
                self.temperature = 0.7
                self.log_dir = "./battle_log"

        args = SimpleArgs()

        # 直接创建 LLMPlayer，使用 LocalhostServerConfiguration
        from pokechamp.llm_player import LLMPlayer
        from poke_env.ps_client.account_configuration import AccountConfiguration

        # 创建一个包装类来添加调试日志
        class DebugLLMPlayer(LLMPlayer):
            async def _handle_battle_message(self, split_messages):
                # 获取 battle_tag（在第一个元素中）
                battle_tag = ""
                if split_messages and len(split_messages[0]) > 0:
                    battle_tag = split_messages[0][0].replace(">", "")

                print(f"[📩] 收到对战消息包，battle_tag = {battle_tag}", file=sys.stderr, flush=True)
                print(f"[📩] 已注册的对战: {list(self._battles.keys())}", file=sys.stderr, flush=True)

                # 检查每条消息，特别关注 turn 和 request
                has_start_message = False
                has_request_before_start = False

                for split_message in split_messages:
                    if len(split_message) > 1:
                        if split_message[1] == "start":
                            has_start_message = True
                            print(f"[🚀] 收到 start 消息", file=sys.stderr, flush=True)
                        elif split_message[1] == "turn":
                            print(f"[⏱️] 收到 turn 消息: 回合 {split_message[2]}", file=sys.stderr, flush=True)
                            if battle_tag in self._battles:
                                battle = self._battles[battle_tag]
                                print(f"[⏱️] 对战存在，当前 move_on_next_request = {battle.move_on_next_request}", file=sys.stderr, flush=True)
                            else:
                                print(f"[⚠️] 对战对象不存在！", file=sys.stderr, flush=True)
                        elif split_message[1] == "request":
                            print(f"[📨] 收到 request 消息", file=sys.stderr, flush=True)
                            if battle_tag in self._battles:
                                battle = self._battles[battle_tag]
                                print(f"[📨] 在处理前 move_on_next_request = {battle.move_on_next_request}", file=sys.stderr, flush=True)
                                # 检查是否是 start 之前的 request
                                if not has_start_message and battle.turn == 0:
                                    has_request_before_start = True
                            # 打印 request 内容
                            if len(split_message) > 2 and split_message[2]:
                                print(f"[📨] Request 数据: {split_message[2][:200]}...", file=sys.stderr, flush=True)
                        elif split_message[1] == "teampreview":
                            print(f"[👥] 收到 teampreview 消息", file=sys.stderr, flush=True)

                # 在调用父类方法之前，检查是否有未处理的 request
                has_pending_request = False
                pending_rqid = 0
                if battle_tag in self._battles:
                    battle = self._battles[battle_tag]
                    # 检查是否收到了 request 但还没处理（move_on_next_request 仍为 False）
                    if battle._rqid > 0 and not battle.move_on_next_request:
                        has_pending_request = True
                        pending_rqid = battle._rqid
                        print(f"[🔧] 处理前检测：发现有未处理的 request (rqid={pending_rqid})", file=sys.stderr, flush=True)

                # 调用父类方法
                result = await super()._handle_battle_message(split_messages)

                # 检查处理后的状态
                if battle_tag in self._battles:
                    battle = self._battles[battle_tag]
                    print(f"[✅] 消息处理完成，move_on_next_request = {battle.move_on_next_request}", file=sys.stderr, flush=True)

                    # 如果之前有未处理的 request，并且处理完后 move_on_next_request 变成了 True
                    # 这意味着收到了 |turn| 消息，应该立即触发决策
                    if has_pending_request and battle.move_on_next_request:
                        print(f"[🔧] 检测到 request (rqid={pending_rqid}) 在 turn 之前到达，现在强制触发决策", file=sys.stderr, flush=True)
                        # 调用决策方法
                        await self._handle_battle_request(battle)
                        # 调用后清除标志，避免重复处理
                        battle.move_on_next_request = False

                return result

            async def _handle_battle_request(self, battle, **kwargs):
                print(f"[🔔] _handle_battle_request 被调用！", file=sys.stderr, flush=True)
                print(f"[🔔] 对战: {battle.battle_tag}, 回合: {battle.turn}", file=sys.stderr, flush=True)
                result = await super()._handle_battle_request(battle, **kwargs)
                print(f"[🔔] _handle_battle_request 完成", file=sys.stderr, flush=True)
                return result

            def choose_move(self, battle):
                print(f"[🎯] choose_move 被调用！回合: {battle.turn}", file=sys.stderr, flush=True)
                print(f"[🎯] 对战标签: {battle.battle_tag}", file=sys.stderr, flush=True)
                print(f"[🎯] 可用招式数: {len(battle.available_moves)}", file=sys.stderr, flush=True)
                print(f"[🎯] 可切换宝可梦数: {len(battle.available_switches)}", file=sys.stderr, flush=True)
                result = super().choose_move(battle)
                print(f"[✅] choose_move 完成！返回: {result}", file=sys.stderr, flush=True)
                return result

        player = DebugLLMPlayer(
            battle_format=battle_format,
            api_key=api_key,
            backend=backend,
            temperature=0.7,
            prompt_algo="minimax",  # 使用 Minimax + LLM
            log_dir="./battle_log",
            K=2,  # Minimax 树深度
            account_configuration=AccountConfiguration(f"pokechamp{unique_id}", ""),
            server_configuration=LocalhostServerConfiguration  # 直接使用本地服务器配置
        )

        print(f"[✓] PokéChamp AI 初始化成功", file=sys.stderr, flush=True)
        print(f"[📝] 用户名: {player.username}", file=sys.stderr, flush=True)
        print(f"[📡] 服务器: {player.ps_client._server_configuration.server_url}", file=sys.stderr, flush=True)
        print(f"[🔌] WebSocket: {player.ps_client.websocket_url}", file=sys.stderr, flush=True)

        # 检查 WebSocket 监听是否启动
        if hasattr(player.ps_client, '_listening_coroutine'):
            print(f"[DEBUG] WebSocket 监听协程存在: {player.ps_client._listening_coroutine}", file=sys.stderr, flush=True)
        else:
            print(f"[⚠️] WebSocket 监听协程不存在！", file=sys.stderr, flush=True)

        print(f"[🔍] 正在等待挑战（将自动登录并接受任何玩家的挑战）...\n", file=sys.stderr, flush=True)

        # accept_challenges 会自动处理登录和接受挑战
        # 不需要手动发送登录命令或设置 logged_in 事件

        # 启用调试日志
        import logging
        player.logger.setLevel(logging.DEBUG)

        await player.accept_challenges(
            opponent=None,  # 接受任何玩家的挑战
            n_challenges=1
        )

        print(f"[✓] 对战结束", file=sys.stderr, flush=True)

    except Exception as e:
        print(f"[✗] 错误: {e}", file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
