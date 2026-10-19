// 反馈与建议：提交反馈/举报 + 查看我提交过的记录
const { request } = require("../../utils/request.js");
const { isLoggedIn } = require("../../utils/auth.js");

const SIZE = 20;
const TYPES = [
  { value: "suggestion", label: "功能建议" },
  { value: "report", label: "举报问题" },
];
const TYPE_TEXT = { report: "举报", suggestion: "建议" };
const STATUS_TEXT = { open: "待处理", processed: "已处理", ignored: "已忽略" };
const STATUS_CLASS = { open: "pending", processed: "success", ignored: "" };

Page({
  data: {
    types: TYPES,
    type: "suggestion",
    content: "",
    submitting: false,
    items: [],
    total: 0,
    page: 0,
    hasMore: false,
    loading: false,
    inited: false,
    showLogin: false,
  },

  // 需要登录：未登录则展示登录卡片，登录后自动继续
  requireLogin(cb) {
    if (isLoggedIn()) {
      cb();
      return;
    }
    this._afterLogin = cb;
    this.setData({ showLogin: true });
  },
  onLoginDone() {
    const cb = this._afterLogin;
    this._afterLogin = null;
    this.setData({ showLogin: false });
    if (cb) cb();
  },
  onLoginClose() {
    this._afterLogin = null;
    this.setData({ showLogin: false });
  },

  onLoad(options) {
    // 从「结果页」进来会带上具体产出 id，提交时一并关联
    const inv = options && options.invocation_id;
    this.setData({ invocationId: inv ? Number(inv) : null });
    this.requireLogin(() => this.reload());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.load(this.data.page + 1);
  },

  setType(e) {
    this.setData({ type: e.currentTarget.dataset.value });
  },
  onInput(e) {
    this.setData({ content: e.detail.value });
  },

  async submit() {
    const content = (this.data.content || "").trim();
    if (!content) {
      wx.showToast({ title: "请先填写反馈内容", icon: "none" });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      const body = { type: this.data.type, content };
      if (this.data.invocationId) body.invocation_id = this.data.invocationId;
      await request("/api/feedback", "POST", body);
      wx.showToast({ title: "已提交，感谢反馈", icon: "success" });
      this.setData({ content: "" });
      this.reload();
    } catch (e) {
      wx.showToast({ title: e.message, icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },

  // 跳到该次产出的结果页（归档不影响：详情接口不按归档过滤）
  openInv(e) {
    const id = e.currentTarget.dataset.inv;
    if (!id) return;
    wx.navigateTo({ url: "/pages/result/result?invocation_id=" + id });
  },

  reload() {
    this.setData({ items: [], page: 0, total: 0, hasMore: false });
    this.load(1);
  },

  async load(page) {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const r = await request(`/api/feedback/mine?page=${page}&size=${SIZE}`);
      const add = (r.items || []).map((it) => ({
        ...it,
        typeText: TYPE_TEXT[it.type] || it.type,
        statusText: STATUS_TEXT[it.status] || it.status,
        statusClass: STATUS_CLASS[it.status] || "",
        timeText: (it.created_at || "").replace("T", " ").slice(0, 16),
        replyTime: (it.replied_at || "").replace("T", " ").slice(0, 16),
      }));
      this.setData({
        items: page === 1 ? add : this.data.items.concat(add),
        page: r.page,
        total: r.total,
        hasMore: !!r.has_more,
        inited: true,
      });
    } catch (e) {
      this.setData({ inited: true });
      wx.showToast({ title: e.message, icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },
});
