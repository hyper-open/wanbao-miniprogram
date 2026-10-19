# 万宝AI助手 · 小程序端

「万宝AI助手」的微信小程序前端（原生小程序，无第三方框架）。用户用自然语言描述需求，Agent 自动识别意图、调度工具、多轮追问并生成结果——本仓库是它的用户端界面，服务端在 [wanbao-backend](../wanbao-backend) 仓库。

## 截图

| 首页 | 工具 | 对话 |
|---|---|---|
| ![首页](docs/images/mp-index.png) | ![工具](docs/images/mp-tools.png) | ![对话](docs/images/mp-chat.png) |

## 特性

- **单页对话式体验**：自由描述需求 → 意图识别 → 多轮追问 → 就地确认扣费 → 流式产出，全程不跳页
- **工具目录**：分类浏览 + 语义搜索（服务端向量召回 + 关键词加权）
- **多模态附件**：聊天文件 / 相册选图 / 拍照三入口，图片直达视觉模型
- **邀请裂变**：小程序码 + 邀请海报（canvas 生成）+ 朋友圈分享
- **虚拟支付**：微信小程序虚拟支付（个人主体可开通），积分充值即买即用
- **合规内建**：AI 生成内容显著标识（顶部提示条 + 逐条角标）、隐私授权清单、协议页

## 快速开始

### 前置要求

1. [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)（已登录）
2. 已部署的 [wanbao-backend](../wanbao-backend)（本地或公网均可）
3. 一个微信小程序 AppID（个人主体即可）

### 步骤

1. 克隆本仓库，用微信开发者工具导入目录
2. 把 `project.config.json` 的 `appid` 换成你的小程序 AppID
3. 修改 `app.js` 中的 `baseUrl` 指向你的后端：
   ```js
   baseUrl: "https://your-backend.example.com",
   ```
4. 在小程序后台「开发管理 → 开发设置 → 服务器域名」把后端域名加入 **request 合法域名**（必须 HTTPS）
5. 开发者工具中编译，即可看到由后端种子数据驱动的工具列表

### 需要注意的权限

项目按「最小必要」申请隐私权限，清单见 [docs/隐私权限申请清单.md](docs/隐私权限申请清单.md)。二次开发若启用新能力（如录音语音输入），记得同步在小程序后台更新隐私指引并在代码中调用对应 API。

## 联系作者

- 技术问题 / Bug 反馈：请提 [Issue](../../issues)，方便沉淀给后来人
- 交流 / 合作：扫码添加微信（备注 GitHub）

<p align="center"><img src="docs/images/wechat-qrcode.png" width="240" alt="作者微信"></p>

## License

[MIT](LICENSE)
