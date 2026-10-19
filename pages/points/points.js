// 积分明细：充值 / 消耗 / 退款 / 签到 / 邀请奖励流水（/api/billing/transactions）
const { request } = require("../../utils/request.js");
const { isLoggedIn } = require("../../utils/auth.js");

const TYPE_TEXT = {
  recharge: "充值",
  recharge_bonus: "充值赠送",
  consume: "工具消耗",
  refund: "退款回补",
  checkin_reward: "签到奖励",
  invite_reward: "邀请奖励",
};

Page({
  data: { list: [], loading: true, showLogin: false },

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
    this.requireLogin(() => this.load());
  },

  async load() {
    try {
      const list = await request("/api/billing/transactions");
      this.setData({
        list: (list || []).map((t) => ({
          ...t,
          typeText: TYPE_TEXT[t.type] || t.type || "流水",
          // 消耗笔展示工具名，其余按类型文案
          titleText: t.type === "consume" && t.tool_name ? t.tool_name : TYPE_TEXT[t.type] || t.type || "积分流水",
          deltaText: (t.quota_delta > 0 ? "+" : "") + (t.quota_delta || 0),
          positive: (t.quota_delta || 0) > 0,
          timeText: (t.created_at || "").replace("T", " ").slice(0, 16),
        })),
        loading: false,
      });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.message, icon: "none" });
    }
  },
});
