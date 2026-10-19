const { request } = require("../../utils/request.js");
const { isLoggedIn } = require("../../utils/auth.js");

const STATUS_TEXT = { paid: "已支付", pending: "待支付", closed: "已关闭", refunded: "已退款" };
const STATUS_CLASS = { paid: "success", pending: "pending" };

Page({
  data: { list: [], loading: true },


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
    this.requireLogin(() => this.load());
  },

  async load() {
    try {
      const list = await request("/api/billing/orders");
      this.setData({
        list: (list || []).map((o) => ({
          ...o,
          statusText: STATUS_TEXT[o.status] || o.status || "",
          statusClass: STATUS_CLASS[o.status] || "",
          timeText: (o.paid_at || o.created_at || "").replace("T", " ").slice(0, 16),
          // 两端档位价不同，标注充值平台
          platformLabel: o.platform === "ios" ? "iOS" : (o.platform === "android" ? "安卓" : ""),
          amountText: (o.amount || 0).toFixed(2),
          originText: (o.origin_amount || 0).toFixed(2),
          // 0.5 -> "5"，0.85 -> "8.5"
          discountLabel: o.discount && o.discount < 1 ? String(Math.round(o.discount * 100) / 10) : "",
        })),
        loading: false,
      });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.message, icon: "none" });
    }
  },
});
