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
    env_path = Path(__file__).parent / '.env'
    if env_path.exists():
        load_dotenv(env_path)
        print(f"[✓] 已加载 .env 文件", file=sys.stderr, flush=True)
    else:
        print(f"[⚠️] .env 文件不存在: {env_path}", file=sys.stderr, flush=True)
except ImportError:
    print("[⚠️] python-dotenv 未安装，将使用系统环境变量", file=sys.stderr, flush=True)

# Add pokechamp to path
pokechamp_path = Path(__file__).parent / 'pokechamp-ai'
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

        # 使用 get_llm_player 工厂函数创建玩家（避免循环导入）
        player = get_llm_player(
            args=args,
            backend=backend,
            prompt_algo="minimax",
            name="pokechamp",
            KEY=api_key,
            battle_format=battle_format,
            device=0,
            PNUMBER1=unique_id,  # 使用唯一ID避免用户名冲突
            USERNAME="",
            PASSWORD="",
            online=False,  # 设置为 False，这样 server_config 会是 None
            use_timeout=False,
            timeout_seconds=90
        )

        # 手动覆盖 server_configuration 为 LocalhostServerConfiguration
        player.ps_client._server_configuration = LocalhostServerConfiguration

        print(f"[✓] PokéChamp AI 初始化成功", file=sys.stderr, flush=True)
        print(f"[DEBUG] avatar = {player.ps_client._avatar}", file=sys.stderr, flush=True)
        print(f"[DEBUG] server_url = {player.ps_client._server_configuration.server_url}", file=sys.stderr, flush=True)
        print(f"[DEBUG] websocket_url = {player.ps_client.websocket_url}", file=sys.stderr, flush=True)

        # 对于 localhost + noguestsecurity，手动发送简化的登录命令
        print(f"[DEBUG] 手动发送登录命令...", file=sys.stderr, flush=True)
        await player.ps_client.send_message(f"/trn {player.username}")

        # 手动设置 logged_in 事件（避免等待）
        print(f"[DEBUG] 手动设置 logged_in 事件...", file=sys.stderr, flush=True)
        player.ps_client.logged_in.set()
        print(f"[DEBUG] logged_in 事件已设置", file=sys.stderr, flush=True)

        # 等待一小会让服务器处理登录
        await asyncio.sleep(0.5)

        print(f"[🔍] 正在等待挑战...", file=sys.stderr, flush=True)

        # 等待来自玩家的挑战（接受任何玩家的挑战）
        print(f"[DEBUG] 调用 accept_challenges() 等待挑战...", file=sys.stderr, flush=True)
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
