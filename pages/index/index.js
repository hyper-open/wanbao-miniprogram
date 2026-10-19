// 首页 = 纯浏览页：只展示热门工具与入口，不发起任务。
// 任务一律在「对话」页完成（输入 → 分析 → 确认 → 产出 → 继续），全在同一页。
const { request } = require("../../utils/request.js");
const { withEmoji } = require("../../utils/meta.js");

Page({
  data: {
    hot: [],            // 热门工具（横滑卡片）
    quotaRemain: null,
  },

  onLoad(options) {
    if (getApp().globalData.token) {
      getApp().bindInvite();
      getApp().loadMyInviteCode();
    }
    // 深链：分享卡片/扫码直达工具（§16.1-D2）
    if (options && options.tool_id) {
      wx.navigateTo({ url: "/pages/tool/tool?id=" + options.tool_id });
    }
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    this.loadHot();
    if (getApp().globalData.token) this.loadQuota();
    else this.setData({ quotaRemain: null });
  },

  onShareAppMessage() {
    const invite = wx.getStorageSync("wb_invite_code") || "";
    const qs = invite ? "?invite=" + invite : "";
    return {
      title: "万宝AI助手 · 一个入口，N 个 AI 工具",
      path: "/pages/index/index" + qs,
      // 统一品牌图，避免微信自动截取当前页当卡片缩略图
      imageUrl: "https://wbg.arfeifei.com/static/share/invite-share.jpg",
    };
  },

  onShareTimeline() {
    // 朋友圈（单页模式，仅安卓）；图 1:1
    const invite = wx.getStorageSync("wb_invite_code") || "";
    return {
      title: "万宝AI助手 · 一个入口，N 个 AI 工具",
      query: invite ? "invite=" + invite : "",
      imageUrl: "https://wbg.arfeifei.com/static/share/invite-share.jpg",
    };
  },

  async loadHot() {
    try {
      const r = await request("/api/tools?sort=hot");
      const list = Array.isArray(r) ? r : r.items || [];
      this.setData({ hot: withEmoji(list).slice(0, 20) });
    } catch (e) { /* 静默 */ }
  },

  async loadQuota() {
    try {
      const a = await request("/api/billing/account/me");
      this.setData({ quotaRemain: a.quota_remain });
    } catch (e) { /* 静默 */ }
  },

  // 工具卡片 → 工具详情（浏览，不发起任务）
  openTool(e) {
    wx.navigateTo({ url: "/pages/tool/tool?id=" + e.currentTarget.dataset.id });
  },

  // 去「对话」页做事（唯一发起任务的地方；这里是用户主动跳转）
  goChat() {
    wx.switchTab({ url: "/pages/chat/chat" });
  },

  // 查看全部工具（工具 tab）
  goTools() {
    wx.switchTab({ url: "/pages/tools/tools" });
  },
});
