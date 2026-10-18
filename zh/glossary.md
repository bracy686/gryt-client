# Gryt 汉化术语表与翻译规则

Gryt 是一个开源桌面聊天/语音软件（Electron + React），界面风格偏简洁、口语化。翻译目标：**简体中文（zh-CN）**，让中文用户读起来像原生软件，不要翻译腔。

## 术语对照（必须统一）

| 英文 | 中文 | 说明 |
|---|---|---|
| server | 服务器 | 指一个社区/群组 |
| channel | 频道 | 文字/语音频道 |
| direct message / DM | 私信 | |
| friend / friends | 好友 | |
| call | 通话 | |
| voice / voice channel | 语音 / 语音频道 | |
| screen share / screen sharing | 屏幕共享 | |
| stream / streaming | 串流 | 直播画面 |
| mute / muted | 静音 | |
| deafen / deafened | 关闭声音 | 不听任何人 |
| push to talk | 按键说话 | |
| noise suppression | 噪声抑制 | |
| role / roles | 身份组 | |
| member | 成员 | |
| invite | 邀请 | |
| thread | 话题 | |
| emoji / emotes | 表情 | |
| sticker | 贴纸 | |
| attachment | 附件 | |
| presence | 状态 | |
| rich presence / game activity | 游戏状态 | |
| settings | 设置 | |
| appearance | 外观 | |
| notifications | 通知 | |
| audit log | 审计日志 | |
| webhook | Webhook | 不译 |
| bot | 机器人 | |
| guest | 访客 | |
| owner | 所有者 | |
| admin / administrator | 管理员 | |
| ban / banned | 封禁 | |
| kick / kicked | 踢出 | |
| timeout / timed out | 禁言 | 临时禁言 |
| report | 举报 | |
| block / blocked | 拉黑 | |
| unread | 未读 | |
| mention / mentions | 提及 | |
| pin / pinned | 置顶 | |
| reply | 回复 | |
| edit / edited | 编辑 / 已编辑 | |
| encrypt / encrypted | 加密 / 已加密 | |
| key / passphrase | 密钥 / 口令 | |
| vault | 保险库 | |
| sign in / sign up / sign out | 登录 / 注册 / 退出登录 | |
| link device / link with another device | 关联设备 / 关联另一台设备 | |
| addon / plugin | 扩展 / 插件 | |
| device | 设备 | |
| microphone / mic | 麦克风 | |
| speaker / output | 扬声器 / 输出 | |
| camera | 摄像头 | |
| bitrate | 码率 | |
| ping / latency | 延迟 | |
| update / upgrade | 更新 / 升级 | |

## 硬规则

1. **占位符必须原样保留**：`{0}`、`{1}`、`{2}`… 数量不许改，中文语序需要时可调换位置。英文复数或语法词若来自插值，应在 `template-rules.mjs` 为该句的该插值添加结果分支译文。`{{name}}`、`%s`、`${x}` 之类同理。
2. **不译**：Gryt、Gryt Chat、Windows、macOS、Linux、Android、iOS、Discord、Steam、Webhook、API、Token、OAuth、SSO、Keycloak、RNNoise、DXGI、FPS、GPU、CPU、RAM、IP、URL、QR、ID、JSON、HTTP(S)、WebSocket、TLS、E2EE、Base64、UUID、Markdown、Emoji（作为格式名时）。
3. **品牌与专有名词**保持原样，包括人名（Sivert）、地名（Norway → 挪威 可译）。
4. **人称用「你」**，不用「您」。
5. **标点用中文全角**（，。！？：；「」或 ""），省略号用 `…`（一个字符，不是三个点）。英文里没有句末句号的短标签（按钮、菜单项、开关名），中文也不要加句号。整句的说明文字该有句号就有。
6. **简洁**：按钮/菜单/标签尽量 2–6 个字；说明文字直白，不要书面语、不要"请"字堆砌。
7. **emoji 原样保留**（包括位置）。
8. 明显是代码、标识符、文件名、日志、单位（`KB/s`、`px`、`ms`）、快捷键（`Ctrl+K`）的条目：**不要翻译**，把值写成 `null`。
9. 只输出译文，不要注释、不要解释、不要括号补充英文原文。
10. 大小写风格：中文没有大小写，忽略原英文的大小写差异，但**键必须与原文完全一致**。

## 输出格式

一个扁平 JSON 对象，键是英文原文（与输入完全一致，一字不差），值是中文译文（或 `null` 表示保持英文）：

```json
{
  "Cancel": "取消",
  "Welcome to Gryt": "欢迎来到 Gryt",
  "Waiting for {0} to accept. Click to cancel.": "等待 {0} 接受。点击取消。"
}
```
