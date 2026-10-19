const { request, getToken } = require("../../utils/request.js");
const { isLoggedIn } = require("../../utils/auth.js");

const app = getApp();
const SHARE_IMG = "https://wbg.arfeifei.com/static/share/invite-share.jpg";  // 公网静态图：canvas 加载网络图，绕开包内路径兼容问题

const SIZE = 15;
const STATUS_TEXT = {
  pending: "已发注册奖·待首充加奖",
  rewarded: "已完成",
  invalid: "非首充，不计奖",
  capped: "超上限，未发放",
  expired: "已超时，未加奖",
};

Page({
  data: {
    bindCode: "",
    me: null,
    items: [],
    total: 0,
    page: 0,
    hasMore: false,
    loading: false,
    inited: false,
    showLogin: false,
    posterPath: "",      // 竖版邀请海报（临时文件）
    qrB64: "",           // 小程序码 base64 缓存
  },


  // 需要登录：未登录则弹登录层，登录后自动继续
  requireLogin(cb) {
    if (isLoggedIn()) {
      cb();
      return;
    }
    this._afterLogin = cb;
    this.setData({ showLogin: true });
  },
  onLoginDone() {
    this.setData({ showLogin: false });
    const cb = this._afterLogin;
    this._afterLogin = null;
    if (cb) cb();
  },
  onLoginClose() {
    this.setData({ showLogin: false });
    this._afterLogin = null;
  },

  onLoad() {
    // 邀请页从「我的」进入，此时已登录；未登录由接口 401 提示
  },

  onShow() {
    this.requireLogin(() => {
      this.loadMe();
      this.reload();
    });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.load(this.data.page + 1);
  },

  onShareAppMessage() {
    // 邀请码优先取当前账号，其次取缓存（概览接口失败时也能分享出有效码）
    const code = (this.data.me && this.data.me.invite_code) || wx.getStorageSync("wb_invite_code") || "";
    // imageUrl 优先用 canvas 合成的营销卡片（带文案），失败回落静态图
    return {
      title: "万宝AI助手 · 一个入口，N 个 AI 工具",
      path: "/pages/index/index?invite=" + code,
      imageUrl: "https://wbg.arfeifei.com/static/share/invite-share.jpg",
    };
  },
  onShareTimeline() {
    // 朋友圈：单页模式打开（仅安卓支持），图 1:1
    const code = (this.data.me && this.data.me.invite_code) || wx.getStorageSync("wb_invite_code") || "";
    return {
      title: "万宝AI助手 · 邀请好友得积分",
      query: code ? "invite=" + code : "",
      imageUrl: "https://wbg.arfeifei.com/static/share/invite-share.jpg",
    };
  },

  // 小程序码 base64（scene=邀请码）；失败回落 null（海报用邀请码文本兜底）
  fetchQrBase64() {
    if (this.data.qrB64) return Promise.resolve(this.data.qrB64);
    return new Promise((resolve, reject) => {
      // 小程序码版本跟随当前运行环境：开发版/体验版/正式版（发布后自动为 release）
      const env = (wx.getAccountInfoSync() && wx.getAccountInfoSync().miniProgram.envVersion) || "release";
      wx.request({
        url: app.globalData.baseUrl + "/api/invite/qrcode?env_version=" + env,
        method: "GET",
        responseType: "arraybuffer",
        header: { Authorization: "Bearer " + getToken() },
        success: (r) => {
          if (r.statusCode !== 200) {
            const d = r.data;
            const msg = (d && d.detail) || "小程序码生成失败";
            return reject(new Error(typeof msg === "string" ? msg : "小程序码生成失败"));
          }
          const b64 = wx.arrayBufferToBase64(r.data);
          this.setData({ qrB64: b64 });
          resolve(b64);
        },
        fail: (e) => reject(new Error(e.errMsg || "网络错误")),
      });
    });
  },

  // 竖版邀请海报：背景插画 + 权益文案 + 小程序码/邀请码（保存到相册，发朋友圈用）
  async buildPoster() {
    if (this.data.posterPath) return this.data.posterPath;
    const canvas = await new Promise((resolve, reject) => {
      wx.createSelectorQuery()
        .in(this)
        .select("#posterCanvas")
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) return reject(new Error("canvas 不可用"));
          resolve(res[0].node);
        });
    });
    const W = 750, H = 1334;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const me = this.data.me || {};
    const rq = me.reward_quota || 1;
    const pct = me.recharge_percent || 10;
    const loadImg = (src) =>
      new Promise((resolve, reject) => {
        const i = canvas.createImage();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("图片加载失败: " + src));
        i.src = src;
      });
    const roundRect = (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };
    // 背景：代码渐变（不依赖素材，任何图片都能套）
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1e1b4b");
    g.addColorStop(0.55, "#4c1d95");
    g.addColorStop(1, "#2e1065");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 品牌角标
    ctx.fillStyle = "#ffd76e";
    ctx.font = "bold 40px sans-serif";
    ctx.fillText("万宝AI助手", 56, 96);
    // 标题
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 76px sans-serif";
    ctx.fillText("邀请好友", 56, 300);
    ctx.fillStyle = "#ffd76e";
    ctx.fillText("得积分奖励", 56, 410);
    // 权益点
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "34px sans-serif";
    ctx.fillText("① 好友注册，你得 " + rq + " 积分", 56, 500);
    ctx.fillText("② 好友首充，额外加送 " + pct + "%", 56, 560);
    // 小程序码（白底圆角）；无凭据时回落邀请码大字
    const boxX = 195, boxY = 640, boxW = 360, boxH = 360;
    roundRect(boxX, boxY, boxW, boxH, 24);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.textAlign = "center";
    let qrImg = null;
    try {
      const b64 = await this.fetchQrBase64();
      qrImg = await loadImg("data:image/png;base64," + b64);
    } catch (e) {
      qrImg = null;
    }
    if (qrImg) {
      ctx.drawImage(qrImg, boxX + 40, boxY + 40, boxW - 80, boxW - 80);
      ctx.fillStyle = "#4c1d95";
      ctx.font = "28px sans-serif";
      ctx.fillText("微信扫码，立即体验", boxX + boxW / 2, boxY + boxH - 32);
    } else {
      ctx.fillStyle = "#4c1d95";
      ctx.font = "bold 60px sans-serif";
      ctx.fillText(me.invite_code || "——", boxX + boxW / 2, boxY + boxH / 2 - 10);
      ctx.font = "24px sans-serif";
      ctx.fillText("（当前展示邀请码，绑定后同效）", boxX + boxW / 2, boxY + boxH - 42);
    }
    // 邀请码条
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "30px sans-serif";
    ctx.fillText("好友绑定你的邀请码", W / 2, boxY + boxH + 70);
    ctx.fillStyle = "#ffd76e";
    ctx.font = "bold 58px sans-serif";
    ctx.fillText(me.invite_code || "——", W / 2, boxY + boxH + 140);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "26px sans-serif";
    ctx.fillText("万宝AI助手 · 一个入口，N 个 AI 工具", W / 2, 1290);
    ctx.textAlign = "left";
    // 导出
    return await new Promise((resolve, reject) =>
      wx.canvasToTempFilePath({
        canvas,
        x: 0, y: 0, width: W, height: H,
        destWidth: W, destHeight: H,
        success: (r2) => {
          this.setData({ posterPath: r2.tempFilePath });
          resolve(r2.tempFilePath);
        },
        fail: (e) => reject(new Error(e.errMsg || "海报导出失败")),
      })
    );
  },

  async savePoster() {
    this.requireLogin(async () => {
      try {
        const path = await this.buildPoster();
        const auth = await new Promise((r) =>
          wx.getSetting({ success: (s) => r(s.authSetting || {}) })
        );
        if (auth["scope.writePhotosAlbum"] === false) {
          wx.showModal({
            title: "需要相册权限",
            content: "请在设置中开启「保存到相册」权限后重试",
            success: (r) => r.confirm && wx.openSetting({}),
          });
          return;
        }
        wx.saveImageToPhotosAlbum({
          filePath: path,
          success: () => wx.showToast({ title: "海报已保存到相册", icon: "success" }),
          fail: (e) => {
            const msg = (e && e.errMsg) || "";
            if (msg.indexOf("auth") >= 0) {
              wx.showModal({
                title: "需要相册权限",
                content: "请在设置中开启「保存到相册」权限后重试",
                success: (r) => r.confirm && wx.openSetting({}),
              });
            } else if (msg.indexOf("cancel") >= 0) {
              wx.showToast({ title: "已取消保存", icon: "none" });
            } else {
              // 弹窗展示完整错误（toast 会截断），便于定位
              wx.showModal({
                title: "保存失败",
                content: msg + "\n\n若在开发者工具中，请用真机预览再试",
                showCancel: false,
              });
            }
          },
        });
      } catch (e) {
        wx.showToast({ title: e.message || "海报生成失败", icon: "none" });
      }
    });
  },

  async copyLink() {
    this.requireLogin(async () => {
      try {
        const r = await request("/api/invite/link", { method: "POST" });
        wx.setClipboardData({
          data: r.url,
          success: () => wx.showToast({ title: "链接已复制，可在浏览器/短信中使用", icon: "none" }),
        });
      } catch (e) {
        wx.showToast({ title: e.message || "链接生成失败", icon: "none" });
      }
    });
  },

  async loadMe() {
    try {
      const me = await request("/api/invite/me");
      if (me && me.invite_code) wx.setStorageSync("wb_invite_code", me.invite_code);
      this.setData({ me });
    } catch (e) {
      if (e.authFailed) {
        // 登录态失效：弹登录层，登录后自动刷新
        this.setData({ showLogin: true });
        this._afterLogin = () => {
          this.loadMe();
          this.reload();
        };
        return;
      }
      /* 其他错误静默：概览失败不阻塞记录列表 */
    }
  },

  reload() {
    this.setData({ items: [], page: 0, total: 0, hasMore: false });
    this.load(1);
  },

  async load(page) {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const r = await request("/api/invite/records?page=" + page + "&size=" + SIZE);
      const add = (r.items || []).map((it) => ({
        ...it,
        statusText: STATUS_TEXT[it.status] || it.status,
        timeText: (it.rewarded_at || it.created_at || "").replace("T", " ").slice(0, 16),
      }));
      this.setData({
        items: page === 1 ? add : this.data.items.concat(add),
        page: r.page,
        total: r.total,
        hasMore: !!r.has_more,
        inited: true,
      });
    } catch (e) {
      if (e.authFailed) {
        this.setData({ inited: true, showLogin: true });
        this._afterLogin = () => {
          this.loadMe();
          this.reload();
        };
        return;
      }
      this.setData({ inited: true });
      wx.showToast({ title: e.message, icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  onBindInput(e) {
    this.setData({ bindCode: e.detail.value });
  },

  async submitBind() {
    const code = (this.data.bindCode || "").trim().toUpperCase();
    if (!code) { wx.showToast({ title: "请输入邀请码", icon: "none" }); return; }
    try {
      const r = await request("/api/invite/bind", { method: "POST", data: { code } });
      if (r.bound) {
        wx.showToast({ title: "绑定成功", icon: "success" });
        this.setData({ bindCode: "" });
        this.loadMe();
        this.reload();
      } else {
        const REASON = {
          empty: "请输入邀请码",
          already_invited: "你已绑定过邀请关系",
          code_not_found: "邀请码不存在",
          self: "不能绑定自己的邀请码",
        };
        wx.showToast({ title: REASON[r.reason] || "绑定失败", icon: "none" });
      }
    } catch (e) {
      wx.showToast({ title: e.message || "绑定失败", icon: "none" });
    }
  },

  copyCode() {
    const code = (this.data.me && this.data.me.invite_code) || "";
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: "邀请码已复制", icon: "success" }),
    });
  },
});
