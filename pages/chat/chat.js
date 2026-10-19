// 「对话」页：像桌面 Agent 一样，一个窗口连续完成多个任务。
// 设计要点：
// - 底部输入框**常驻**，任何阶段都能打字（无会话=识别并开始 / 追问 / 空闲=继续下一个任务）
// - 所有交互（分析卡 / 追问 / 确认扣费 / 产出）都是消息流里的卡片，**就地展示，不跳页**
// - 发送后**用户消息立即上屏**（乐观显示），不等服务端识别
// - 需要文件时点「＋」，上传后自动续跑
const { request, uploadFile, getToken } = require("../../utils/request.js");
const { isLoggedIn } = require("../../utils/auth.js");
const { checkAttachment, extOf } = require("../../utils/attachment.js");

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
function seqText(seq) { return CIRCLED[seq - 1] || "#" + seq; }

const PRI_TEXT = { high: "高", medium: "中", low: "低" };
function normAnalysis(a) {
  if (!a) return null;
  const map = (l) => (l || []).map((it) => Object.assign({}, it, { priText: PRI_TEXT[it.priority] || "中" }));
  return Object.assign({}, a, { missing: map(a.missing), suspicious: map(a.suspicious) });
}

// 会话状态 → 页面阶段
function phaseOf(status) {
  if (status === "awaiting_answer") return "awaiting_answer";
  if (status === "awaiting_confirm") return "awaiting_confirm";
  if (status === "awaiting_turn" || status === "success") return "idle";
  if (status === "failed") return "failed";
  if (status === "expired" || status === "cancelled") return "closed";
  if (status === "running") return "processing";
  return "compose";
}

const PLACEHOLDER = {
  compose: "描述你的需求，例如「帮我把这句翻译成英文」",
  processing: "正在处理…",
  awaiting_answer: "输入你的回答",
  awaiting_confirm: "请点消息里的「确认生成」，或先取消",
  idle: "继续做一个任务，如「再帮我优化这份简历」",
  failed: "重新描述你的需求",
  closed: "描述新的需求，开始新的对话",
};

Page({
  data: {
    phase: "compose",
    sessionStatus: "",
    placeholder: PLACEHOLDER.compose,
    sid: null,
    turns: [],
    timeline: [],
    // 乐观消息：刚发出、服务端还没落库的用户消息（先上屏，避免"卡了"的感觉）
    pendingMsg: "",
    pendingTurns: 0,
    // 流式输出：AI 产出的增量文本（SSE chunked 接收；开关关闭时为空）
    streamText: "",
    input: "",
    attachIds: [],
    attachName: "",
    menu: [],
    price: 0,
    quotaRemain: null,
    invocationId: null,
    diff: null,
    err: "",
    sending: false,
    showLogin: false,
  },

  onLoad() { this.setData({ version: (getApp().globalData || {}).version || "" }); },
  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    this.consumePending();
  },
  onUnload() { this.stopPoll(); },

  // 首页/工具页/记录页 → 暂存 {sid} 后切到这里（tabBar 页不能通过 url 传参）
  async consumePending() {
    const app = getApp();
    const p = app && app.globalData ? app.globalData.pendingSession : null;
    if (!p) return;
    app.globalData.pendingSession = null;
    if (!p.sid) return;
    this.stopPoll();
    this.setData({
      phase: "processing", sid: Number(p.sid), sessionStatus: "running",
      timeline: [], turns: [], diff: null, invocationId: null, err: "", menu: [],
      pendingMsg: "", pendingTurns: 0,
    });
    if (isLoggedIn()) this.poll();
    else this.setData({ showLogin: true });
  },

  // ---- 登录 ----
  requireLogin(cb) {
    if (isLoggedIn()) { cb(); return; }
    this._afterLogin = cb;
    this.setData({ showLogin: true });
  },
  onLoginDone() {
    this.setData({ showLogin: false });
    const cb = this._afterLogin;
    this._afterLogin = null;
    if (cb) cb(); else this.onSend();
  },
  onLoginClose() { this.setData({ showLogin: false }); this._afterLogin = null; },

  // ---- 底部常驻输入 ----
  onInput(e) { this.setData({ input: e.detail.value }); },

  // 清空底部输入与附件（发送成功后调用）
  clearInput() { this.setData({ input: "", attachIds: [], attachName: "" }); },

  // 有效会话 ID：sid 必须是正数（排除 null/undefined/NaN/字符串 "null"）
  validSid() {
    const n = Number(this.data.sid);
    return !!n && isFinite(n) && n > 0;
  },

  chooseAttach() { this.requireLogin(() => this.doChooseAttach()); },
  clearAttach() { this.setData({ attachIds: [], attachName: "" }); },

  async doChooseAttach() {
    // 三入口：聊天文件（文档）/ 相册选图 / 拍照
    let idx;
    try {
      idx = await new Promise((resolve, reject) => {
        wx.showActionSheet({
          itemList: ["聊天文件", "相册选图", "拍照"],
          success: (r) => resolve(r.tapIndex),
          fail: reject,
        });
      });
    } catch (e) {
      return; // 用户取消菜单，静默
    }
    try {
      let path, name, size;
      if (idx === 0) {
        const res = await new Promise((resolve, reject) => {
          wx.chooseMessageFile({ count: 1, type: "file", success: resolve, fail: reject });
        });
        const file = res.tempFiles[0];
        path = file.path;
        name = file.name;
        size = file.size;
      } else {
        const media = await new Promise((resolve, reject) => {
          wx.chooseMedia({
            count: 1,
            mediaType: ["image"],
            sourceType: [idx === 1 ? "album" : "camera"],
            success: resolve,
            fail: reject,
          });
        });
        const f = media.tempFiles[0];
        const ext = extOf(f.tempFilePath) || ".jpg";
        path = f.tempFilePath;
        size = f.size;
        name = (idx === 1 ? "相册图片_" : "拍照_") + Date.now() + ext;
      }
      const bad = checkAttachment({ path, name, size });
      if (bad) { wx.showModal({ title: "无法上传", content: bad, showCancel: false }); return; }
      wx.showLoading({ title: "上传中" });
      const up = await uploadFile(path, name);
      wx.hideLoading();
      const ids = up.attachment_ids || [];
      if (!ids.length) { wx.showToast({ title: "上传未成功，请重试", icon: "none" }); return; }
      this.setData({ attachIds: ids, attachName: file.name });
      wx.showToast({ title: "已添加附件", icon: "success" });
      // 刚才因缺附件被拦下的请求 → 上传完自动续跑
      const retry = this._retry;
      if (retry) { this._retry = null; this._runRetry(retry, ids); }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e.message || "上传失败", icon: "none" });
    }
  },

  // 统一发送：无会话=识别并开新会话；有会话按状态分流
  onSend() {
    const text = (this.data.input || "").trim();
    const attach = this.data.attachIds || [];
    if (!text && !attach.length) { wx.showToast({ title: "请输入内容", icon: "none" }); return; }
    this.requireLogin(() => {
      // 乐观上屏：先把用户的话显示出来，再发请求
      const show = () => this.setData({
        pendingMsg: text, pendingTurns: (this.data.turns || []).length,
        input: "", attachIds: [], attachName: "",
      });

      if (!this.data.sid) {
        show();
        return this.dispatchChat("", text, attach);
      }
      const p = this.data.phase;
      if (p === "awaiting_answer") {
        show();
        return this.sendAnswer(text);
      }
      if (p === "awaiting_confirm") { wx.showToast({ title: "请点消息里的「确认生成」，或先取消", icon: "none" }); return; }
      if (p === "processing") { wx.showToast({ title: "正在处理，请稍候", icon: "none" }); return; }
      if (p === "idle") {
        show();
        return this.appendTurn({ input: text, attachment_ids: attach });
      }
      // 会话已结束（failed/closed）→ 新开会话并用同一句话开始
      if (p === "failed" || p === "closed") {
        this.newSession();
        show();
        return this.dispatchChat("", text, attach);
      }
      show();
      this.dispatchChat("", text, attach);
    });
  },

  // 无会话：识别 → 开新会话（识别耗时只影响助手回复，用户消息已上屏）
  async dispatchChat(toolId, inputText, attachIds) {
    this.setData({ sending: true });
    try {
      const body = { input: inputText, attachment_ids: attachIds || [] };
      if (toolId) body.tool_id = toolId;
      const r = await request("/api/agent/chat", "POST", body);
      this.setData({ sending: false });
      this.handleDispatch(r, inputText, attachIds || []);
    } catch (e) {
      this.setData({ sending: false });
      // 发送失败：把内容还给输入框，用户可直接重发
      this.clearPending();
      this.setData({ input: inputText || "", attachIds: attachIds || [], attachName: "" });
      if (this.handleQuota(e)) return;
      wx.showToast({ title: e.message || "请求失败", icon: "none" });
    }
  },

  handleDispatch(r, inputText, attachIds) {
    if (!r || !r.status) { this.clearPending(); return; }
    if (r.status === "session") {
      this.clearPending();
      this.setData({
        sid: r.session_id, menu: [], phase: "processing", sessionStatus: "running",
        err: "", timeline: [], turns: [], diff: null, invocationId: null,
        price: r.price_quota || 0,
      });
      if (r.stream) this.startStream(r.session_id, r.seq);
      this.poll();
      return;
    }
    if (r.status === "clarify") {
      wx.showModal({
        title: r.tool_name || "请确认",
        content: r.clarify || "是否使用该工具？",
        confirmText: "使用",
        success: (m) => { if (m.confirm) this.dispatchChat(r.tool_id, inputText, attachIds); },
      });
      return;
    }
    if (r.status === "need_attachment") {
      this._retry = { type: "chat", toolId: r.tool_id || "", input: inputText || "" };
      wx.showModal({
        title: "需要上传附件",
        content: `「${r.tool_name || "该工具"}」需要先上传文件。点「选择文件」上传，完成后会自动继续。`,
        confirmText: "选择文件", showCancel: false,
        success: () => this.chooseAttach(),
      });
      return;
    }
    if (r.status === "menu") {
      const menu = r.menu || [];
      this.setData({ menu });
      wx.showToast({ title: menu.length ? "请选择要使用的工具" : "没识别出来，换个说法试试", icon: "none" });
      return;
    }
    this.clearPending();
    wx.showToast({ title: "未能识别，请补充描述", icon: "none" });
  },

  // 追问的回答
  async sendAnswer(text) {
    try {
      await request(`/api/agent/session/${this.data.sid}/answer`, "POST", { text });
      this.clearInput();
      this.setData({ phase: "processing" });
      this.poll();
    } catch (e) { wx.showToast({ title: e.message, icon: "none" }); }
  },

  // 会话里追加一个子任务（可换工具、可带附件）
  async appendTurn(body) {
    this.setData({ sending: true });
    try {
      const r = await request(`/api/agent/session/${this.data.sid}/turn`, "POST", body);
      this.setData({ sending: false });
      if (r.status === "session") {
        this._retry = null;
        this.clearPending();
        this.setData({ phase: "processing", sessionStatus: "running" });
        if (r.stream) this.startStream(this.data.sid, r.seq);
        this.poll();
        return;
      }
      if (r.status === "clarify") {
        wx.showModal({
          title: r.tool_name || "请确认",
          content: r.clarify || "是否使用该工具？",
          confirmText: "使用",
          success: (m) => { if (m.confirm) this.appendTurn(Object.assign({}, body, { tool_id: r.tool_id })); },
        });
        return;
      }
      if (r.status === "need_attachment") {
        this._retry = { type: "turn", payload: body };
        wx.showModal({
          title: "需要上传附件",
          content: `「${r.tool_name || "该工具"}」需要先上传文件。点「选择文件」上传，完成后会自动继续本次任务。`,
          confirmText: "选择文件", showCancel: false,
          success: () => this.chooseAttach(),
        });
        return;
      }
      if (r.status === "menu") {
        const menu = r.menu || [];
        if (!menu.length) { wx.showToast({ title: "没识别出来，换个说法试试", icon: "none" }); return; }
        wx.showActionSheet({
          itemList: menu.slice(0, 6).map((x) => x.name || x.id),
          success: (m) => {
            const picked = menu[m.tapIndex];
            if (picked) this.appendTurn(Object.assign({}, body, { tool_id: picked.id }));
          },
        });
        return;
      }
    } catch (e) {
      this.setData({ sending: false });
      // 发送失败：把内容还给输入框，用户可直接重发
      this.clearPending();
      this.setData({ input: body.input || "", attachIds: body.attachment_ids || [] });
      if (this.handleQuota(e)) return;
      wx.showToast({ title: e.message || "操作失败", icon: "none" });
    }
  },

  // 缺附件被拦下 → 上传完自动续跑
  _runRetry(retry, ids) {
    if (retry.type === "chat") {
      this.dispatchChat(retry.toolId || "", retry.input, ids);
    } else {
      this.appendTurn(Object.assign({}, retry.payload, { attachment_ids: ids }));
    }
  },

  clearPending() { this.setData({ pendingMsg: "", pendingTurns: 0 }); },

  // 确认扣费（来自消息流里的确认卡）
  async doConfirm() {
    if (!this.validSid()) return;
    try {
      const r = await request(`/api/agent/session/${this.data.sid}/confirm`, "POST", {});
      this.setData({ phase: "processing", invocationId: r.invocation_id || this.data.invocationId });
      if (r.stream) this.startStream(this.data.sid, r.seq);
      this.poll();
    } catch (e) {
      if (this.handleQuota(e)) return;
      wx.showToast({ title: e.message, icon: "none" });
    }
  },

  // 取消当前子任务（会话保留，可继续做别的）
  async cancelTurn() {
    if (!this.validSid()) return;
    const at = (this.data.turns || []).find((t) => t.status === "awaiting_confirm" || t.status === "awaiting_answer" || t.status === "running");
    if (!at) return;
    try {
      await request(`/api/agent/session/${this.data.sid}/turn/${at.seq}/cancel`, "POST", {});
      this.setData({ phase: "idle" });
      this.sync();
    } catch (e) { wx.showToast({ title: e.message, icon: "none" }); }
  },

  // 跳过追问，直接生成
  skip() {
    if (!this.validSid()) return;
    request(`/api/agent/session/${this.data.sid}/skip`, "POST", {})
      .then(() => { this.setData({ phase: "processing" }); this.poll(); })
      .catch((e) => wx.showToast({ title: e.message, icon: "none" }));
  },

  // 新开会话：本地清空即可；旧会话保留在「记录」里，仍可继续
  newSession() {
    this.stopPoll();
    this.stopStream();
    this.setData({
      phase: "compose", sid: null, sessionStatus: "", timeline: [], turns: [],
      diff: null, invocationId: null, err: "", menu: [],
      pendingMsg: "", pendingTurns: 0,
      input: "", attachIds: [], attachName: "",
    });
  },

  // 积分不足 → 引导充值
  handleQuota(e) {
    const msg = (e && e.message) || "";
    if (msg.indexOf("充值") >= 0 || msg.indexOf("次数") >= 0 || msg.indexOf("积分") >= 0) {
      wx.showModal({
        title: "积分不足",
        content: msg,
        confirmText: "去充值",
        success: (m) => { if (m.confirm) wx.switchTab({ url: "/pages/account/account" }); },
      });
      return true;
    }
    return false;
  },

  // ---------- 轮询 ----------
  stopPoll() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },
  poll() { this.stopPoll(); this.timer = setInterval(() => this.sync(), 3000); this.sync(); },

  // ---- 流式输出（SSE chunked；开关开启且请求返回 stream=true 时启用）----
  startStream(sid, seq) {
    if (!sid || !seq || !wx.request) return;
    this.stopStream();
    const self = this;
    let buf = "";
    this._streamSeq = String(seq);
    this._streamTask = wx.request({
      url: getApp().globalData.baseUrl + `/api/agent/session/${sid}/stream`,
      method: "GET",
      header: { Authorization: "Bearer " + getToken() },
      enableChunked: true,
      timeout: 120000,
      success: () => { self._streamTask = null; self.setData({ streamText: "" }); },
      fail: () => { self._streamTask = null; self.setData({ streamText: "" }); },
    });
    if (this._streamTask && this._streamTask.onChunkReceived) {
      this._streamTask.onChunkReceived((res) => {
        // 后端 JSON ensure_ascii，字节流 ASCII 安全
        const arr = new Uint8Array(res.data);
        let text = "";
        for (let i = 0; i < arr.length; i++) text += String.fromCharCode(arr[i]);
        buf += text;
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = frame.split("\n").find((l) => l.indexOf("data: ") === 0);
          if (!line) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (String(ev.seq) !== self._streamSeq) continue;
            if (ev.type === "delta" && ev.text) {
              self._streamBuf = (self._streamBuf || "") + ev.text;
              const now = Date.now();
              if (!self._lastFlush || now - self._lastFlush > 120) {
                self._lastFlush = now;
                self.setData({ streamText: self._streamBuf });
              }
            } else if (ev.type === "done") {
              self.stopStream();
              self.sync(); // 用库内最终结果对齐（增量可能缺尾）
            }
          } catch (e) { /* 非 JSON 帧（心跳注释）忽略 */ }
        }
      });
    }
  },

  stopStream() {
    if (this._streamTask) { try { this._streamTask.abort(); } catch (e) { /* 已结束 */ } this._streamTask = null; }
    this._streamBuf = "";
    this._streamSeq = null;
    if (this.data.streamText) this.setData({ streamText: "" });
  },


  async sync() {
    if (!this.validSid()) return;
    try {
      const r = await request("/api/agent/session/" + this.data.sid);
      this.apply(r);
    } catch (e) {
      this.stopPoll();
      this.setData({ phase: "failed", err: e.message });
    }
  },

  apply(r) {
    const phase = phaseOf(r.status);
    // 会话不在生成态 → 流式必然结束，清掉增量气泡
    if (phase !== "processing" && this.data.streamText) this.stopStream();
    const turns = r.turns || [];
    const msgs = r.messages || [];
    const diffMsg = msgs.find((m) => m.type === "diff");
    const diff = diffMsg && diffMsg.payload
      ? { summary: diffMsg.payload.summary || "", changes: (diffMsg.payload.changes || []).map((c, i) => Object.assign({}, c, { idx: i })) }
      : null;
    if (phase !== "processing") this.stopPoll();

    // 时间线：按子任务分组（多工具会话），产出/确认/分析都是流里的卡片
    const timeline = [];
    const pushMsg = (m, toolName) => {
      if (m.type === "diff") return;
      if (m.type === "analysis") {
        timeline.push(Object.assign({}, m, {
          key: "m" + m.id, isAnalysis: true,
          analysisTitle: (toolName ? toolName + " · 分析" : "分析结果"),
          analysis: normAnalysis(m.payload),
        }));
        return;
      }
      timeline.push(Object.assign({}, m, { key: "m" + m.id }));
    };
    if (turns.length) {
      turns.forEach((t) => {
        const toolName = t.tool_name || t.tool_id || "任务";
        timeline.push({
          key: "t" + t.seq, isTurnHead: true, seqText: seqText(t.seq), toolName,
          done: t.status === "success", turnStatus: t.status,
        });
        (t.messages || []).forEach((m) => pushMsg(m, toolName));
      });
    } else {
      msgs.forEach((m) => pushMsg(m, ""));
    }

    // 确认扣费卡：作为消息流的一部分就地展示
    const at = turns.find((t) => t.status === "awaiting_confirm");
    if (phase === "awaiting_confirm" && at) {
      timeline.push({
        key: "confirm", isConfirm: true,
        price: at.quota_price || r.price_quota || 0,
      });
    }

    // 乐观消息：服务端已看到这条内容（子任务数变多 / 消息里出现同文）→ 撤掉本地占位
    let pending = this.data.pendingMsg;
    if (pending) {
      const seen = msgs.some((m) => m.role === "user" && (m.content || "") === pending)
        || turns.some((t) => (t.input_text || "") === pending)
        || turns.length > this.data.pendingTurns;
      if (seen) pending = "";
    }
    if (pending) timeline.push({ key: "pending", role: "user", content: pending });

    this.setData({
      phase,
      timeline,
      turns,
      sessionStatus: r.status,
      placeholder: PLACEHOLDER[phase] || PLACEHOLDER.compose,
      pendingMsg: pending,
      pendingTurns: pending ? this.data.pendingTurns : 0,
      diff,
      invocationId: r.invocation_id || this.data.invocationId,
      price: r.price_quota || this.data.price,
      quotaRemain: r.quota_remain,
      err: r.err || "",
    });
  },

  // 需要下载文档时前往结果页（navigateTo：返回可回到本会话继续）
  openResult() {
    if (!this.data.invocationId) return;
    wx.navigateTo({ url: "/pages/result/result?invocation_id=" + this.data.invocationId });
  },
});
