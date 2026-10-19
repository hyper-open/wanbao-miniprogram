Component({
  data: {
    selected: 0,
    list: [
      { pagePath: "/pages/index/index", text: "首页", icon: "home" },
      { pagePath: "/pages/tools/tools", text: "工具", icon: "grid" },
      { pagePath: "/pages/chat/chat", text: "对话", icon: "chat" },
      { pagePath: "/pages/history/history", text: "记录", icon: "clock" },
      { pagePath: "/pages/account/account", text: "我的", icon: "user" },
    ],
  },
  methods: {
    switchTab(e) {
      const { path, index } = e.currentTarget.dataset;
      wx.switchTab({ url: path });
      this.setData({ selected: index });
    },
  },
});
