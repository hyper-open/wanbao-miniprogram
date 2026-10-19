const { request } = require("../../utils/request.js");

Page({
  data: {
    filings: [], // 所用已备案大模型公示（§16.3-B，无需登录）
  },

  onLoad() {
    this.loadFilings();
  },

  async loadFilings() {
    try {
      const r = await request("/api/compliance/filings");
      this.setData({ filings: (r && r.items) || [] });
    } catch (e) {
      // 公示失败不阻塞协议阅读
    }
  },
});
