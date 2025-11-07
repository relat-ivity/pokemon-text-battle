/**
 * 测试 DeepSeek API 连接
 * 运行: node test-deepseek.js
 */

const axios = require('axios');

async function testDeepSeek() {
	const apiKey = process.env.DEEPSEEK_API_KEY;
	
	console.log('=== DeepSeek API 测试 ===\n');
	
	if (!apiKey) {
		console.log('❌ 未设置 DEEPSEEK_API_KEY 环境变量');
		console.log('\n设置方法:');
		console.log('  Windows (PowerShell): $env:DEEPSEEK_API_KEY="你的密钥"');
		console.log('  Windows (CMD): set DEEPSEEK_API_KEY=你的密钥');
		console.log('  Linux/macOS: export DEEPSEEK_API_KEY="你的密钥"');
		return;
	}
	
	console.log('✓ 找到 API 密钥:', apiKey.substring(0, 10) + '...');
	console.log('\n正在测试 API 连接...');
	
	try {
		const response = await axios.post(
			'https://api.deepseek.com/v1/chat/completions',
			{
				model: 'deepseek-chat',
				messages: [
					{ role: 'user', content: '你好，请回复"测试成功"' }
				],
				max_tokens: 50
			},
			{
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${apiKey}`
				},
				timeout: 10000
			}
		);
		
		const reply = response.data.choices[0].message.content;
		console.log('\n✓ API 连接成功！');
		console.log('AI 回复:', reply);
		console.log('\n可以开始使用 DeepSeek AI 对战了！');
		console.log('运行: node pve-battle.js');
		
	} catch (error) {
		console.log('\n❌ API 调用失败:');
		if (error.response) {
			console.log('状态码:', error.response.status);
			console.log('错误信息:', error.response.data);
			
			if (error.response.status === 401) {
				console.log('\n可能原因: API 密钥无效或过期');
			} else if (error.response.status === 429) {
				console.log('\n可能原因: API 调用次数超过限制');
			}
		} else if (error.code === 'ECONNABORTED') {
			console.log('请求超时，请检查网络连接');
		} else {
			console.log(error.message);
		}
	}
}

// 检查是否安装了 axios
try {
	require.resolve('axios');
	testDeepSeek();
} catch (e) {
	console.log('❌ 未安装依赖');
	console.log('\n请先运行: npm install');
}

