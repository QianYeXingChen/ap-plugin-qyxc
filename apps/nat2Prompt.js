import plugin from '../../../lib/plugins/plugin.js'
import _ from 'lodash'
import axios from 'axios'
import Config from '../components/ai_painting/config.js';
import Log from '../utils/Log.js';

let ap_cfg = await Config.getcfg();
//console.log('Config内容:', ap_cfg); // 输出整个配置对象

const API = ap_cfg.openai_key;
const API_URL = ap_cfg.openai_api_url || 'https://nat2pmpt.pages.dev/v1/chat/completions'; // 默认值为原地址
const MODEL = ap_cfg.openai_model || 'gpt-3.5-turbo'; // 默认值为原模型

//console.log("使用的API Key:", API);
//console.log("使用的API URL:", API_URL);
//console.log("使用的模型:", MODEL);

export class nat2pmpt extends plugin {
	constructor() {
		super({
			/** 功能名称 */
			name: 'AP-自然语言处理',
			/** 功能描述 */
			dsc: '自然语言转prompt',
			event: 'message',
			/** 优先级，数字越小等级越高 */
			priority: 1009,
			rule: [{
				/** 命令正则匹配 */
				reg: '^#处理.*',
				/** 执行方法 */
				fnc: 'nat2pmpt'
			}]
		})
	}
	async nat2pmpt(e) {
		if (!API)
			return await e.reply("请先配置处理所需的OpenAI Key，配置教程：https://ap-plugin.com/Config/docs13")
		
		let lang = e.msg.replace(/^#处理/, '');
		if (!lang)
			return await e.reply("请输入要处理的自然语言");
		
		let len = (lang.split('').length / 2).toFixed(0);
		if (len < 10) len = 10;
		await e.reply("即将生成至少" + len + "个prompt，请稍后......");
		
		try {
			const response = await axios.post(
				API_URL, {
				'model': MODEL,
				'messages': [{
					'role': 'user',
					'content': '请为我的描述的图像生成不得少于' + len + '个的英文prompt，每个prompt用英文逗号分割，不用标注序号，用小括号将prompt与其权重包起来，比如(girls:1.3)，请不要输出任何中文和额外的解释，以下是我描述的图像：' + lang
				}],
				'temperature': 0.7
			}, {
				headers: {
					'Content-Type': 'application/json',
					'Authorization': 'Bearer ' + API
				}
			});
			
			let msg = response.data.choices[0].message.content;
			msg = msg.replace(/\n/g, '');
			e.reply(msg, true);
		} catch (error) {
			Log.e(error);
			e.reply('出错了，可能是AP服务器出现问题，也可能是APIKEY失效');
		}
	}
}
