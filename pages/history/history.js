const { request } = require("../../utils/request.js");
const { isLoggedIn } = require("../../utils/auth.js");

const SIZE = 15;
// 会话仍可「继续」的状态（多工具会话空闲时是 awaiting_turn：可继续追加子任务）
const OPEN_SESSION = ["running", "awaiting_answer", "awaiting_confirm", "awaiting_turn"];
// 归档状态筛选：默认只看未归档
const ARCH_OPTIONS = [
  { value: "", label: "不限" },
  { value: "unarchived", label: "未归档" },
  { value: "archived", label: "已归档" },
];

Page({
  data: {
    items: [],
    total: 0,
    page: 0,
    hasMore: false,
    loading: false,
    inited: false,
    q: "",
    dateFrom: "",
    dateTo: "",
    archivedFilter: "unarchived",
    showLogin: false,
    archOptions: ARCH_OPTIONS,
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

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    this.requireLogin(() => this.reload());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.load(this.data.page + 1);
  },

  onInput(e) {
    this.setData({ q: e.detail.value });
  },
  onFrom(e) {
    this.setData({ dateFrom: e.detail.value });
  },
  onTo(e) {
    this.setData({ dateTo: e.detail.value });
  },

  onSearch() {
    this.reload();
  },
  setArchived(e) {
    const v = e.currentTarget.dataset.value || "";
    if (v === this.data.archivedFilter) return;
    this.setData({ archivedFilter: v });
    this.reload();
  },
  onReset() {
    this.setData({ q: "", dateFrom: "", dateTo: "", archivedFilter: "unarchived" });
    this.reload();
  },

  // 手动归档 / 取消归档（catchtap：不触发进入详情）
  async toggleArchive(e) {
    const id = e.currentTarget.dataset.id;
    const cur = String(e.currentTarget.dataset.arch) === "true";
    try {
      await request(`/api/agent/records/${id}/archive`, "POST", { archived: !cur });
      wx.showToast({ title: cur ? "已取消归档" : "已归档", icon: "success" });
      this.reload();
    } catch (err) {
      wx.showToast({ title: err.message, icon: "none" });
    }
  },

  reload() {
    this.setData({ items: [], page: 0, total: 0, hasMore: false });
    this.load(1);
  },

  // 服务端分页：每次只拉一页，滚动到底再拉下一页
  async load(page) {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const { q, dateFrom, dateTo, archivedFilter } = this.data;
      const qs = [
        "page=" + page,
        "size=" + SIZE,
        "archived=" + archivedFilter,
        q ? "q=" + encodeURIComponent(q) : "",
        dateFrom ? "date_from=" + dateFrom : "",
        dateTo ? "date_to=" + dateTo : "",
      ]
        .filter(Boolean)
        .join("&");
      const r = await request("/api/agent/records?" + qs);
      const add = (r.items || []).map((it) => ({
        ...it,
        key: String(it.invocation_id),
        timeText: (it.created_at || "").replace("T", " ").slice(0, 16),
        quotaText: it.quota_charged > 0 ? "消耗 " + it.quota_charged + " 积分" : "",
        brief: (it.input_text || "").replace(/\s+/g, " ").slice(0, 60),
        // 可继续：会话仍开着（含「已产出、空闲可追加子任务」）；归档的记录不给入口
        resumable: !it.archived && !!it.session_id && OPEN_SESSION.indexOf(it.session_status) >= 0,
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

  // 点记录 = 看产出（浏览，不做事）
  open(e) {
    const key = e.currentTarget.dataset.key;
    const it = this.data.items.find((x) => x.key === key);
    if (!it) return;
    wx.navigateTo({ url: "/pages/result/result?invocation_id=" + it.invocation_id });
  },

  // 「继续对话」= 用户主动去「对话」页接着聊（唯一做事的页面）
  continueChat(e) {
    const sid = e.currentTarget.dataset.sid;
    if (!sid) return;
    this.requireLogin(() => {
      getApp().globalData.pendingSession = { sid: Number(sid) };
      wx.switchTab({ url: "/pages/chat/chat" });
    });
  },
});
