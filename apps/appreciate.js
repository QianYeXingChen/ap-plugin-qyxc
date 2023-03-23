/*
 * @Author: 0卡苏打水
 * @Date: 2022-12-23 22:19:02
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2023-01-02 22:01:54
 * @FilePath: \Yunzai-Bot\plugins\ap-plugin\apps\appreciate.js
 * @Description: 鉴赏图片获取tags
 */
import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import axios from 'axios'
import Config from '../components/ai_painting/config.js';
import Log from '../utils/Log.js';
import { parseImg } from '../utils/utils.js';
import pic_tools from '../utils/pic_tools.js';

let ap_cfg = await Config.getcfg()
const API = ap_cfg.appreciate
let figure_type_user = {}
let get_image_time = {}

export class appreciate extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: '鉴赏图片',
            /** 功能描述 */
            dsc: '鉴赏图片',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 5000,
            rule: [
                {
                    /** 命令正则匹配 */
                    reg: '^#?鉴赏$',
                    /** 执行方法 */
                    fnc: 'appreciate'
                },
                {
                    /** 命令正则匹配 */
                    reg: '^.*$',
                    /** 执行方法 */
                    fnc: 'getImage',
                    log: false
                }
            ]
        })
    }

    async appreciate(e) {
        if (!API)
            return await e.reply("请先配置鉴赏图片所需API，配置教程：https://www.wolai.com/jRW3wLMn53vpf9wc9JCo6T")
        await AppreciatePictures(e)
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
        await AppreciatePictures(e);
    }
}


async function AppreciatePictures(e) {
    let start = new Date().getTime();

    if (figure_type_user[e.user_id]) {
        e.reply('当前你有任务在列表中排排坐啦，请不要重复发送喵~（๑>؂<๑）')
        return true
    }

    e = await parseImg(e)

    if (e.img) {
        figure_type_user[e.user_id] = setTimeout(() => {
            if (figure_type_user[e.user_id]) {
                delete figure_type_user[e.user_id];
            }
        }, 60000);

        await e.reply([segment.at(e.user_id), '少女鉴赏中~（*/∇＼*）', true])

        let base64 = await pic_tools.url_to_base64(e.img[0])

        let msg = await requestAppreciate(base64)
        if (!msg) {
            e.reply("鉴赏出错，请查看控制台报错")
            return true
        }

        let end = new Date().getTime();
        let time = ((end - start) / 1000).toFixed(2);

        await e.reply([segment.at(e.user_id), `鉴赏用时：${time}秒`, true])
        e.reply(msg, true)
        if (figure_type_user[e.user_id]) {
            delete figure_type_user[e.user_id];
        }

    } else {
        e.reply('请在60s内发送图片喵~（๑>؂<๑）')
        get_image_time[e.user_id] = setTimeout(() => {
            if (get_image_time[e.user_id]) {
                e.reply('鉴赏已超时，请再次发送命令喵~', true);
                delete get_image_time[e.user_id];
            }
        }, 60000);
        return false;
    }
}

/**使用图片base64来逆向解析tags，返回整理后的tags
 * @param {*} base64 图片base64
 * @return {*}  解析的tags
 */
export async function requestAppreciate(base64) {
    if (!API) return false
    Log.i('解析图片tags')
    try {
        let res = await fetch(API, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                data: [
                    "data:image/png;base64," + base64,
                    0.3,
                ]
            })
        })
        console.log(res)
        res = await res.json()
        let tags = res.data[2].confidences;
        console.log(tags)
        let tags_str = '';
        for (let i = 0; i < tags.length; i++) {
            if (tags[i].confidence > 0.98) {
                tags_str += `{{{${tags[i].label}}}},`;
            } else if (tags[i].confidence > 0.95 && tags[i].confidence < 0.98) {
                tags_str += `{{${tags[i].label}}},`;
            } else if (tags[i].confidence > 0.9 && tags[i].confidence < 0.95) {
                tags_str += `{${tags[i].label}},`;
            } else {
                tags_str += `${tags[i].label},`;
            }
        }
        Log.i('解析成功')
        return `{{masterpiece}},{{best quality}},{{official art}},{{extremely detailed CG unity 8k wallpaper}},` + tags_str
    } catch (err) {
        Log.e(err)
        Log.e('解析失败')
        return false
    }
}
