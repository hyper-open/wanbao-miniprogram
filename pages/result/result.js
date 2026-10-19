const { request, getToken } = require("../../utils/request.js");
const { isLoggedIn } = require("../../utils/auth.js");

const STATUS_TEXT = {
  pending: "处理中",
  running: "处理中",
  success: "已完成",
  failed: "失败",
  expired: "已过期",
  cancelled: "已结束",
};

// wx.openDocument 支持的类型；用于从文件名推断 fileType
const DOC_TYPES = ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "pdf"];

function fileTypeOf(nameOrUrl) {
  const m = String(nameOrUrl || "").split("?")[0].match(/\.([a-z0-9]+)$/i);
  const ext = m ? m[1].toLowerCase() : "";
  return DOC_TYPES.indexOf(ext) >= 0 ? ext : "";
}

Page({
  data: {
    id: null,
    status: "pending",
    statusText: "处理中",
    resultText: "",
    downloadUrl: "",
    fileName: "",
    err: "",
    quotaRemain: null,
    showLogin: false,
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

  onLoad(options) {
    this.setData({ id: Number(options.invocation_id) });
    this.requireLogin(() => this.poll());
  },

  poll() {
    this.timer = setInterval(async () => {
      try {
        const r = await request("/api/agent/invocation/" + this.data.id);
        this.setData({
          status: r.status,
          statusText: STATUS_TEXT[r.status] || r.status,
          resultText: r.result_text || "",
          downloadUrl: r.download_url || "",
          fileName: r.filename || "",
          err: r.err || "",
          quotaRemain: r.quota_remain,
        });
        // cancelled/expired 也是终态：否则结果页会永远停在「处理中」不停轮询
        if (r.status === "success" || r.status === "failed" || r.status === "cancelled" || r.status === "expired") {
          clearInterval(this.timer);
        }
      } catch (e) {
        clearInterval(this.timer);
        wx.showToast({ title: e.message, icon: "none" });
      }
    }, 1500);
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer);
  },

  copy() {
    if (!this.data.resultText) return;
    wx.setClipboardData({ data: this.data.resultText });
  },

  // 生成文档下载：后端代理模式返回相对路径（拼 baseUrl + 带 token），
  // 预签名模式返回绝对 URL（直接下载）。downloadFile 合法域名需含 API 域名。
  openDoc() {
    const { downloadUrl, fileName } = this.data;
    if (!downloadUrl) return;
    const app = getApp();
    const isProxy = downloadUrl.indexOf("/api/") === 0;
    const url = isProxy ? app.globalData.baseUrl + downloadUrl : downloadUrl;
    // 显式指定文件类型：downloadFile 的临时文件常常没有扩展名，
    // openDocument 无法自动识别，会被判为「不支持的格式」
    const ft = fileTypeOf(fileName) || fileTypeOf(downloadUrl);
    wx.showLoading({ title: "下载中" });
    wx.downloadFile({
      url,
      header: isProxy ? { Authorization: "Bearer " + getToken() } : {},
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode !== 200) {
          wx.showToast({ title: "下载失败(" + res.statusCode + ")", icon: "none" });
          return;
        }
        const opt = {
          filePath: res.tempFilePath,
          showMenu: true,
          fail: () => wx.showToast({ title: "该格式暂不支持预览，可复制内容", icon: "none" }),
        };
        if (ft) opt.fileType = ft;
        wx.openDocument(opt);
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: "下载失败，请检查 downloadFile 合法域名", icon: "none" });
      },
    });
  },

  // 反馈/举报（§16.3-C 投诉举报渠道）：跳到独立反馈页，自动带上本次产出
  goFeedback() {
    const id = this.data.id ? "?invocation_id=" + this.data.id : "";
    wx.navigateTo({ url: "/pages/feedback/feedback" + id });
  },

  goAgreement() {
    wx.navigateTo({ url: "/pages/agreement/agreement" });
  },
});
