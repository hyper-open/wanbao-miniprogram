const { request } = require("../../utils/request.js");
const { withEmoji } = require("../../utils/meta.js");

Page({
  data: {
    q: "",
    cats: [],          // [{category, name}]，按后台排序返回
    activeCat: "",     // "" = 全部
    tools: [],
    page: 1,
    total: 0,
    hasMore: true,     // 还有下一页（列表模式）
    loadingMore: false,
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.loadCategories();
    this.loadTools();
  },

  async loadCategories() {
    try {
      const cats = await request("/api/tools/categories");
      this.setData({ cats: [{ category: "", name: "全部" }, ...cats] });
    } catch (e) { /* 静默 */ }
  },

  async loadTools(append) {
    if (this.data.loadingMore) return;
    const cat = this.data.activeCat ? `&category=${this.data.activeCat}` : "";
    try {
      this.setData({ loadingMore: true });
      if (this.data.q) {
        // 语义搜索：一次性返回最相关的前 20 个（不分页）
        const r = await request(`/api/tools/search?q=${encodeURIComponent(this.data.q)}`);
        this.setData({
          tools: withEmoji(Array.isArray(r) ? r : r.items || []),
          page: 1, total: 0, hasMore: false,
        });
        return;
      }
      // 列表模式：分页 + 触底加载
      const page = append ? this.data.page + 1 : 1;
      const r = await request(`/api/tools?sort=hot${cat}&page=${page}&size=20`);
      const items = withEmoji(r.items || []);
      const shown = append ? this.data.tools.concat(items) : items;
      this.setData({
        tools: shown,
        page,
        total: r.total || 0,
        hasMore: shown.length < (r.total || 0),
      });
    } catch (e) {
      wx.showToast({ title: e.message, icon: "none" });
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  onReachBottom() {
    if (this.data.q || !this.data.hasMore || this.data.loadingMore) return;
    this.loadTools(true);
  },

  onSearchInput(e) {
    const v = e.detail.value;
    this.setData({ q: v });
    if (this._searchTimer) { clearTimeout(this._searchTimer); this._searchTimer = null; }
    if (!v) { this.loadTools(); return; } // 清空立即恢复列表
    // 300ms 防抖：输入停顿后才发语义搜索（embedding 检索 ~1s/次）
    this._searchTimer = setTimeout(() => {
      this._searchTimer = null;
      if (this.data.q === v) this.loadTools(); // 值没变才请求
    }, 300);
  },

  onSearch() {
    if (this._searchTimer) { clearTimeout(this._searchTimer); this._searchTimer = null; }
    this.loadTools();
  },

  onPickCat(e) {
    if (this._searchTimer) { clearTimeout(this._searchTimer); this._searchTimer = null; }
    this.setData({ activeCat: e.currentTarget.dataset.cat || "", q: "" });
    this.loadTools();
  },

  onUnload() {
    if (this._searchTimer) clearTimeout(this._searchTimer);
  },

  openTool(e) {
    wx.navigateTo({ url: "/pages/tool/tool?id=" + e.currentTarget.dataset.id });
  },
});
