// 工具详情 = 纯浏览页：只展示工具信息与使用说明，不发起任务。
// 任务一律在「对话」页完成（可附附件，助手会自动识别工具）。
const { request } = require("../../utils/request.js");

Page({
  data: {
    id: "",
    tool: null,      // 详情 {id,name,description,price_quota,needs_attachment,...}
    loadingTool: true,
  },

  onLoad(options) {
    this.setData({ id: options.id || "" });
    this.loadTool();
  },

  onShareAppMessage() {
    const invite = wx.getStorageSync("wb_invite_code") || "";
    return {
      title: this.data.tool ? `万宝AI助手 · ${this.data.tool.name}` : "万宝AI助手",
      path: `/pages/index/index?tool_id=${this.data.id}` + (invite ? "&invite=" + invite : ""),
      imageUrl: "https://wbg.arfeifei.com/static/share/invite-share.jpg",
    };
  },

  onShareTimeline() {
    // 朋友圈（单页模式，仅安卓）；图 1:1
    const invite = wx.getStorageSync("wb_invite_code") || "";
    return {
      title: this.data.tool ? `万宝AI助手 · ${this.data.tool.name}` : "万宝AI助手",
      query: invite ? "invite=" + invite : "",
      imageUrl: "https://wbg.arfeifei.com/static/share/invite-share.jpg",
    };
  },

  async loadTool() {
    this.setData({ loadingTool: true });
    try {
      const t = await request("/api/tools/" + this.data.id);
      this.setData({ tool: t, loadingTool: false });
      wx.setNavigationBarTitle({ title: t.name || "工具详情" });
    } catch (e) {
      this.setData({ tool: null, loadingTool: false });
      wx.showToast({ title: e.message, icon: "none" });
    }
  },

  // 去「对话」页做这件事（用户主动跳转；页面本身不发起任务）
  goChat() {
    wx.switchTab({ url: "/pages/chat/chat" });
  },
});
