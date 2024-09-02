import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import axios from 'axios'
import Config from '../components/ai_painting/config.js';
import Log from '../utils/Log.js';
import { parseImg } from '../utils/utils.js';
import pic_tools from '../utils/pic_tools.js';

const figure_type_user = {};
const get_image_time = {};

export class appreciate extends plugin {
    constructor() {
        super({
            name: 'AP-鉴赏图片',
            dsc: '鉴赏图片',
            event: 'message',
            priority: 1009,
            rule: [
                {
                    reg: '^#?鉴赏',
                    fnc: 'appreciate'
                },
                {
                    reg: '^#?解析',
                    fnc: 'interpretation',
                },
                {
                    reg: '^.*',
                    fnc: 'getImage',
                    log: false
                }
            ]
        })
    }

    async interpretation(e) {
        e = await parseImg(e)
        if (!e.img) {
            e.reply("未获取到图片");
            return false;
        }
        let img = await axios.get(e.img[0], {
            responseType: 'arraybuffer'
        });
        let base64 = Buffer.from(img.data, 'binary').toString('base64');
        const config = await Config.getcfg();
        const { APIList, usingAPI } = config;
        if (APIList.length === 0) {
            e.reply("请先配置绘图API");
            return false;
        }
        const { url, account_id, account_password } = APIList[usingAPI - 1];
        const headers = {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(account_id && account_password && {
                Authorization: `Basic ${Buffer.from(
                    `${account_id}:${account_password}`
                ).toString("base64")}`,
            }),
        };
        const res = await axios.post(`${url}/sdapi/v1/png-info`, {
            image: "data:image/png;base64," + base64,
        }, {
            headers
        });
        if (res.status === 200) {
            if (res.data.info === "") {
                e.reply("该图片无解析信息，请确保图片为Stable Diffusion的输出图片，并发送的是原图");
                return false;
            } else {
                let data_msg = [];
                data_msg.push({
                    message: segment.image(e.img[0]),
                    nickname: Bot.nickname,
                    user_id: Bot.uin,
                });
                data_msg.push({
                    message: res.data.info,
                    nickname: Bot.nickname,
                    user_id: Bot.uin,
                });
                let send_res = null;
                if (e.isGroup)
                    send_res = await e.reply(await e.group.makeForwardMsg(data_msg));
                else send_res = await e.reply(await e.friend.makeForwardMsg(data_msg));
                if (!send_res) {
                    e.reply("消息发送失败，可能被风控~");
                }
                return true;
            }
        } else {
            Log.e(`无法获取该图片的解析信息，后端异常：${res.status}`);
            return false;
        }
    }

    async appreciate(e) {
        const config = await Config.getcfg();
        const API = config.APIList[config.usingAPI - 1]?.url;
        let setting = await Config.getSetting();
        if (!setting.appreciation.useSD) {
            if (!API)
                return await e.reply("请先配置鉴赏图片所需API，配置教程：https://ap-plugin.com/Config/docs4")
            await AppreciatePictures(e, API);
        } else {
            await AppreciatePictures(e, API);
        }
    }

    async getImage(e) {
        if (!this.e.img) {
            return false;
        }
        if (get_image_time[e.user_id]) {
            clearTimeout(get_image_time[e.user_id]);
            delete get_image_time[e.user_id];
        } else {
            return false;
        }
        const config = await Config.getcfg();
        const API = config.APIList[config.usingAPI - 1]?.url;
        await AppreciatePictures(e, API);
    }
}

async function AppreciatePictures(e, API) {
    let start = new Date().getTime();

    if (figure_type_user[e.user_id]) {
        e.reply('当前你有任务在列表中排排坐啦，请不要重复发送喵~（๑>؂<๑）');
        return true;
    }

    e = await parseImg(e);

    if (e.img) {
        figure_type_user[e.user_id] = setTimeout(() => {
            if (figure_type_user[e.user_id]) {
                delete figure_type_user[e.user_id];
            }
        }, 60000);

        let base64 = await pic_tools.url_to_base64(e.img[0]);
        let setting = await Config.getSetting();
        let model = setting.appreciation.model;
        let threshold = setting.appreciation.threshold;

        try {
            await e.reply([segment.at(e.user_id), setting.appreciation.useSD ? `少女使用标签器${model}鉴赏中~（*/∇＼*）` : '少女使用WD鉴赏中~（*/∇＼*）']);

            var msg = setting.appreciation.useSD
                ? await requestAppreciateSD(base64, API, model, threshold)
                : await requestAppreciate(base64, API);

            if (!msg) {
                e.reply("鉴赏出错，请查看控制台报错");
                return true;
            }

            let end = new Date().getTime();
            let time = ((end - start) / 1000).toFixed(2);

            await e.reply([segment.at(e.user_id), `鉴赏用时：${time}秒`]);
            e.reply(msg, true);
        } catch (error) {
            e.reply("鉴赏失败，可能是网络或服务器问题，请稍后再试。");
            Log.e("鉴赏过程中出现错误:", error);
        } finally {
            if (figure_type_user[e.user_id]) {
                delete figure_type_user[e.user_id];
            }
        }
    } else {
        e.reply('请在60s内发送图片喵~（๑>؂<๑）');
        get_image_time[e.user_id] = setTimeout(() => {
            if (get_image_time[e.user_id]) {
                e.reply('鉴赏已超时，请再次发送命令喵~', true);
                delete get_image_time[e.user_id];
            }
        }, 60000);
        return false;
    }
}

// 带超时功能的fetch函数-----无响应超时
function fetchWithTimeout(url, options = {}, timeout = 60000) {
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out')), timeout)
        )
    ]);
}

export async function requestAppreciate(base64, API) {
    if (!API) return false;
    Log.i('解析图片tags');

    let config = await Config.getcfg();
    let apiobj = config.APIList[config.usingAPI - 1];
    let model = config.jianshang_model || "wd14-vit-v2-git";
    let threshold = config.jianshang_threshold || 0.35;

    const headers = {
        "Content-Type": "application/json",
    };

    if (apiobj.account_password) {
        headers.Authorization = `Basic ${Buffer.from(apiobj.account_id + ':' + apiobj.account_password, 'utf8').toString('base64')} `;
    }

    try {
        let res = await fetchWithTimeout(`${API}/tagger/v1/interrogate`, {
            method: "POST",
            headers: headers,
            body: JSON.stringify({
                "image": "data:image/png;base64," + base64,
                "model": model,
                "threshold": threshold,
            })
        }, 10000);  // 设置10秒超时

        const json = await res.json();
        console.log("API Response:", JSON.stringify(json));
        let tags_str = '';
        if (json.caption) {
            for (let tag in json.caption) {
                let confidence = json.caption[tag];
                if (confidence > 0.98) {
                    tags_str += `(${tag}: 1.2), `;
                } else if (confidence > 0.95) {
                    tags_str += `(${tag}: 1.1), `;
                } else if (confidence > 0.9) {
                    tags_str += `(${tag}), `;
                } else {
                    tags_str += `${tag}, `;
                }
            }
        } else {
            console.error("API Response does not contain 'caption' field:", json);
            return false;
        }
        Log.i('解析成功');
        return tags_str;
    } catch (err) {
        Log.e("解析失败，错误信息:", err);
        return false;
    }
}

export async function requestAppreciateSD(base64, API, model, threshold) {
    let config = await Config.getcfg();
    let apiobj = config.APIList[config.usingAPI - 1];
    model = model || config.model || "default_model";
    threshold = threshold || config.threshold || 0.35;

    const headers = {
        "Content-Type": "application/json"
    };
    if (apiobj.account_password) {
        headers.Authorization = `Basic ${Buffer.from(apiobj.account_id + ':' + apiobj.account_password, 'utf8').toString('base64')} `;
    }
    try {
        const response = await fetchWithTimeout(`${API}/tagger/v1/interrogate`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                "image": "data:image/png;base64," + base64,
                "model": model,
                "threshold": threshold,
            })
        }, 10000);  // 设置10秒超时

        const json = await response.json();
        console.log("API Response:", JSON.stringify(json));
        let tags_str = '';
        if (json.caption) {
            for (let tag in json.caption) {
                let confidence = json.caption[tag];
                if (confidence > 0.98) {
                    tags_str += `(${tag}: 1.2), `;
                } else if (confidence > 0.95) {
                    tags_str += `(${tag}: 1.1), `;
                } else if (confidence > 0.9) {
                    tags_str += `(${tag}), `;
                } else {
                    tags_str += `${tag}, `;
                }
            }
        } else {
            console.error("API Response does not contain 'caption' field:", json);
            return false;
        }
        Log.i('解析成功');
        return tags_str;
    } catch (err) {
        Log.e("解析失败，错误信息:", err);
        return false;
    }
}
