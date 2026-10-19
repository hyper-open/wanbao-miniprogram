// 「微信一键登录」弹窗：全屏遮罩 + 居中卡片，由用户点击按钮直接触发 wx.login。
// 头像 / 昵称 / 手机号等授权，统一走微信原生控件（见「我的」页）。
const { login, isLoggedIn } = require("../../utils/auth.js");

Component({
  properties: {
    // 是否展示
    show: { type: Boolean, value: false },
    // 是否允许「暂不登录」/点遮罩关闭（「我的」页整页依赖登录，设为 false）
    closable: { type: Boolean, value: true },
  },
  data: { logging: false },
  methods: {
    async onLogin() {
      if (this.data.logging) return;
      if (isLoggedIn()) {
        this.triggerEvent("done");
        return;
      }
      this.setData({ logging: true });
      try {
        await login();
        wx.showToast({ title: "登录成功", icon: "success" });
        this.triggerEvent("done");
      } catch (e) {
        wx.showToast({ title: e.message || "登录失败", icon: "none" });
      } finally {
        this.setData({ logging: false });
      }
    },
    onClose() {
      this.triggerEvent("close");
    },
    // 点遮罩关闭（不可关闭场景不响应）
    onMaskTap() {
      if (this.data.closable) this.triggerEvent("close");
    },
    // 阻止卡片内点击冒泡到遮罩 / 阻止遮罩滚动穿透
    noop() {},
  },
});
