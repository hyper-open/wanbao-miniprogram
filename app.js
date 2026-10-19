// 万宝AI助手 · 小程序入口
// 注意：baseUrl 在真机/体验版必须是 https 域名，并在小程序后台配置合法域名。
// 本地微信开发者工具调试时，可勾选「不校验合法域名」。
App({
  globalData: {
    // 本地后端地址（docker 映射 28082）。生产替换为 https 域名。
    baseUrl: "https://wbg.arfeifei.com",
    version: "1.1.19",
    token: "",
    openid: "",
    // 跨 tab 传参：首页/工具页/记录页要打开某个会话或某工具时先写这里，
    // 再 switchTab 到「对话」tab（tabBar 页不能通过 url 传参）
    pendingSession: null, // {sid} 续聊 | {toolId, input, attachmentIds, attachmentName} 新会话
  },
  onLaunch(options) {
    const token = wx.getStorageSync("wb_token");
    const openid = wx.getStorageSync("wb_openid");
    if (token) {
      this.globalData.token = token;
      this.globalData.openid = openid;
    }
    this._captureInvite(options);
  },
  onShow(options) {
    this._captureInvite(options);
  },

  // 记录分享链接里携带的邀请码（新用户点分享卡片进来时会带上）
  _captureInvite(options) {
    const q = (options && options.query) || {};
    if (q.invite) {
      wx.setStorageSync("wb_invite", String(q.invite).toUpperCase());
      wx.removeStorageSync("wb_invite_bound"); // 新码重置绑定标记
    }
  },

  // 登录后调用：把本机记录的邀请码绑定到当前账号（幂等，只成功一次）
  bindInvite() {
    const code = wx.getStorageSync("wb_invite");
    if (!code || wx.getStorageSync("wb_invite_bound")) return;
    if (!this.globalData.token) return;
    wx.request({
      url: this.globalData.baseUrl + "/api/invite/bind",
      method: "POST",
      data: { code },
      header: { "Content-Type": "application/json", Authorization: "Bearer " + this.globalData.token },
      complete: () => {
        // 无论成败都标记，避免每次启动重复请求（已绑定/无效码都由后端幂等处理）
        wx.setStorageSync("wb_invite_bound", 1);
      },
    });
  },

  // 分享路径用：缓存我的邀请码（拿不到就退回不带参数）
  loadMyInviteCode() {
    const cached = wx.getStorageSync("wb_invite_code");
    if (cached) return;
    if (!this.globalData.token) return;
    wx.request({
      url: this.globalData.baseUrl + "/api/invite/me",
      header: { Authorization: "Bearer " + this.globalData.token },
      success: (r) => {
        if (r.statusCode === 200 && r.data && r.data.invite_code) {
          wx.setStorageSync("wb_invite_code", r.data.invite_code);
        }
      },
    });
  },
});
