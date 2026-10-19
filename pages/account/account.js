const { request } = require("../../utils/request.js");
const { isLoggedIn } = require("../../utils/auth.js");
const { uploadAvatar, saveNickname } = require("../../utils/profile.js");

// 当前终端平台：档位价格 iOS 与 Android 不同，必须按终端取价/下单
function devicePlatform() {
  try {
    if (typeof wx.getDeviceInfo === "function") {
      const d = wx.getDeviceInfo() || {};
      if (d.platform) return d.platform === "ios" ? "ios" : "android";
    }
    const s = wx.getSystemInfoSync() || {};
    return s.platform === "ios" ? "ios" : "android";
  } catch (e) {
    return "android";
  }
}

Page({
  data: {
    quotaTotal: 0,
    quotaUsed: 0,
    quotaExpired: 0,
    quotaRemain: 0,
    paidRemain: 0,
    freeRemain: 0,
    platform: "android",
    checkinEnabled: false,
    freeExpireText: "",
    checkedInToday: false,
    checkinReward: 1,
    checkinValidDays: 30,
    packages: [],
    soldOut: false,
    restockJoined: false,
    restockNotified: false,
    nickname: "",
    avatarUrl: "",
    phone: "",
    paymentMock: false,
    showLogin: false,
    loggedIn: false,
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 });
    }
    // 不静默登录：未登录时整页只展示「微信一键登录」卡片
    const ok = isLoggedIn();
    this.setData({ loggedIn: ok });
    if (ok) this.loadAccount();
    this.loadPackages();
    this.loadPayConfig();
  },

  onLoginDone() {
    this.setData({ loggedIn: true });
    this.loadAccount();
  },
  onLoginClose() {
    /* 整页依赖登录，不提供关闭 */
  },

  // 支付开关：paymentMock=true 走模拟支付（联调），false 走微信支付
  async loadPayConfig() {
    try {
      const cfg = await request("/api/billing/config");
      this.setData({ paymentMock: !!cfg.payment_mock });
    } catch (e) { /* 静默，默认按真实支付处理 */ }
  },

  // 手机号绑定：getPhoneNumber 回调 code -> 后端换手机号（号码在微信侧校验，仅回传 code）。
  async onGetPhone(e) {
    const detail = (e && e.detail) || {};
    const code = detail.code;
    const errMsg = String(detail.errMsg || "");
    if (!code) {
      // 没有 code：微信侧就没成功。区分「用户拒绝」和其它原因，便于定位。
      console.warn("[getPhoneNumber] fail:", detail);
      if (errMsg.indexOf("deny") >= 0 || errMsg.indexOf("cancel") >= 0) {
        wx.showToast({ title: "已取消手机号授权", icon: "none" });
      } else if (/privacy|scope/i.test(errMsg)) {
        // 后台《用户隐私保护指引》未声明「手机号」时会命中这里
        wx.showToast({ title: "隐私指引未声明手机号", icon: "none" });
      } else if (/permission|unauthorized|not support|未开通/i.test(errMsg)) {
        wx.showToast({ title: "手机号能力未开通", icon: "none" });
      } else {
        wx.showToast({ title: errMsg || "手机号授权未就绪，请稍后重试", icon: "none" });
      }
      return;
    }
    wx.showLoading({ title: "绑定中", mask: true });
    try {
      const r = await request("/api/auth/phone", "POST", { code });
      wx.hideLoading();
      wx.setStorageSync("wb_phone", r.phone);
      this.setData({ phone: r.phone });
      wx.showToast({ title: "绑定成功", icon: "success" });
    } catch (err) {
      wx.hideLoading();
      console.warn("[getPhoneNumber] bind failed:", err && err.message);
      if (err && err.authFailed) {
        // 登录态失效：整页回到登录卡片
        this.setData({ loggedIn: false });
        wx.showToast({ title: "请先登录后再绑定手机号", icon: "none" });
      } else {
        wx.showToast({ title: (err && err.message) || "绑定失败", icon: "none" });
      }
    }
  },

  // 头像：官方「头像选择」能力（wx.getUserProfile 已废弃，失败还不报错）
  async onChooseAvatar(e) {
    const path = e.detail && e.detail.avatarUrl;
    if (!path) return;
    wx.showLoading({ title: "上传中", mask: true });
    try {
      const url = await uploadAvatar(path);
      wx.hideLoading();
      this.setData({ avatarUrl: url });
      wx.showToast({ title: "头像已更新", icon: "success" });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message, icon: "none" });
    }
  },

  // 昵称：官方「昵称填写」能力（type=nickname）
  async onNickname(e) {
    const nickname = ((e.detail && e.detail.value) || "").trim();
    if (!nickname || nickname === this.data.nickname) return;
    try {
      const r = await saveNickname(nickname);
      this.setData({ nickname: (r && r.nickname) || nickname });
      wx.showToast({ title: "昵称已更新", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message, icon: "none" });
    }
  },

  async loadAccount() {
    try {
      const a = await request("/api/billing/account/me");
      const base = getApp().globalData.baseUrl;
      const exp = (a.free_expire_at || "").replace("T", " ").slice(0, 10);
      this.setData({
        quotaTotal: a.quota_total || 0,
        quotaUsed: a.quota_used || 0,
        quotaExpired: a.quota_expired || 0,
        quotaRemain: a.quota_remain || 0,
        paidRemain: a.paid_remain || 0,
        freeRemain: a.free_remain || 0,
        freeExpireText: exp ? exp.slice(5) : "",
        checkedInToday: !!a.checked_in_today,
        checkinEnabled: a.checkin_enabled !== false && !!a.checkin_reward,
        checkinReward: a.checkin_reward || 0,
        checkinValidDays: a.checkin_valid_days || 0,
        nickname: a.nickname || this.data.nickname,
        avatarUrl: a.avatar ? base + a.avatar : this.data.avatarUrl,
        phone: a.phone || this.data.phone,
      });
    } catch (e) {
      if (e && e.authFailed) {
        this.setData({ loggedIn: false });
        return;
      }
      wx.showToast({ title: e.message, icon: "none" });
    }
  },

  async loadPackages() {
    try {
      const plat = devicePlatform();
      // 按终端取价：iOS 与 Android 档位价不同（后端据此返回 price/origin_price）
      const list = await request("/api/billing/packages?platform=" + plat);
      const soldOut = list.length > 0 && list.every((p) => p.sold_out);
      const visible = list
        .filter((p) => !p.sold_out) // 后端已过滤未启用档位，这里只需排除停售
        .map((p) => ({
          ...p,
          // 0.5 -> "5"，0.85 -> "8.5"
          discountLabel: p.discount ? String(Math.round(p.discount * 100) / 10) : "",
        }));
      this.setData({ packages: visible, soldOut, platform: plat });
      if (soldOut) this.loadRestockStatus();
    } catch (e) {
      wx.showToast({ title: e.message, icon: "none" });
    }
  },

  // 停售预约（§16.2-B）：月限触顶时收集"开售提醒"
  async loadRestockStatus() {
    try {
      const s = await request("/api/billing/restock/status");
      this.setData({ restockJoined: s.joined, restockNotified: s.notified });
    } catch (e) { /* 静默 */ }
  },

  async onJoinRestock() {
    if (this.data.restockJoined) return;
    try {
      await request("/api/billing/restock/join", "POST", { channel: "wechat" });
      this.setData({ restockJoined: true });
      wx.showToast({ title: "已预约，下月开售提醒", icon: "success" });
    } catch (e) {
      wx.showToast({ title: e.message, icon: "none" });
    }
  },

  // 充值：创建订单 -> 模拟支付（联调）或微信支付（真实）
  async onRecharge(e) {
    const pkg = e.currentTarget.dataset.pkg;
    wx.showLoading({ title: "下单中" });
    try {
      const order = await request("/api/billing/recharge/create", "POST", {
        package_id: pkg.id,
        platform: this.data.platform || devicePlatform(),
      });
      if (this.data.paymentMock) {
        // 模拟支付：后端校验开关 + 订单归属后直接置为已支付
        await request("/api/payment/mock-pay", "POST", { order_id: order.order_id });
      } else {
        // 真实支付：调起微信支付，成功后由异步回调 /api/payment/notify 加积分
        await new Promise((resolve, reject) => {
          wx.requestPayment({
            ...order.prepay_params,
            success: resolve,
            fail: (err) => reject(new Error(err.errMsg || "支付未完成")),
          });
        });
      }
      wx.hideLoading();
      wx.showToast({ title: "充值成功", icon: "success" });
      this.loadAccount();
    } catch (err) {
      wx.hideLoading();
      const msg = err.message || "支付失败";
      wx.showToast({ title: msg.indexOf("cancel") >= 0 ? "已取消支付" : msg, icon: "none" });
    }
  },

  // 每日签到：送免费积分（一天一次）
  async doCheckin() {
    if (!this.data.checkinEnabled) {
      wx.showToast({ title: "签到活动未开启", icon: "none" });
      return;
    }
    if (this.data.checkedInToday) {
      wx.showToast({ title: "今天已签到", icon: "none" });
      return;
    }
    try {
      const r = await request("/api/billing/checkin", "POST", {});
      this.loadAccount();
      if (r.already) wx.showToast({ title: "今天已签到", icon: "none" });
      else wx.showToast({ title: `签到成功 +${r.reward} 积分`, icon: "success" });
    } catch (e) {
      wx.showToast({ title: e.message, icon: "none" });
    }
  },

  goOrders() {
    wx.navigateTo({ url: "/pages/orders/orders" });
  },

  goPoints() {
    wx.navigateTo({ url: "/pages/points/points" });
  },

  goInvite() {
    wx.navigateTo({ url: "/pages/invite/invite" });
  },

  goFeedback() {
    wx.navigateTo({ url: "/pages/feedback/feedback" });
  },

  goAgreement() {
    wx.navigateTo({ url: "/pages/agreement/agreement" });
  },
});
