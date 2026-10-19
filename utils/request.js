// 统一请求封装：自动附带 token。**不做静默登录** —— 未登录/登录失效一律提示，
// 由页面内联「登录卡片」（login-panel）在用户点击后登录。
const app = getApp();
const { logout, currentAppId } = require("./auth.js");

function getToken() {
  return (app.globalData && app.globalData.token) || wx.getStorageSync("wb_token") || "";
}

// 后端错误码 -> 用户可读文案
const ERR_TEXT = {
  insufficient_quota: "剩余次数不足，请先充值",
};

function request(path, method = "GET", data = {}) {
  // 兼容两种调用形态：(path, "POST", data) 与 (path, {method, data})
  if (method && typeof method === "object") {
    data = method.data ?? {};
    method = method.method || "GET";
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url: app.globalData.baseUrl + path,
      method,
      data,
      header: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + getToken(),
        "X-App-Id": currentAppId(),  // 多渠道矩阵：后端据此返回本小程序的工具集
      },
      success: (res) => {
        if (res.statusCode === 401) {
          // 不静默登录：清掉本地登录态，让页面重新展示登录卡片
          logout();
          const err = new Error("登录已失效，请重新登录");
          err.statusCode = 401;
          err.authFailed = true;
          reject(err);
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          // FastAPI 422 的 detail 是数组（每项含 msg/loc），直接 new Error(数组) 会变成
          // "[object Object]" 这类用户看不懂的提示，这里先归一化成可读文字
          let detail = (res.data && res.data.detail) || "";
          if (Array.isArray(detail)) {
            detail = detail.map((x) => (x && x.msg) || "").join("；");
          } else if (detail && typeof detail === "object") {
            detail = detail.msg || "";
          }
          const fallback = res.statusCode === 422 ? "请求参数有误，请重试" : "请求失败(" + res.statusCode + ")";
          const err = new Error(ERR_TEXT[detail] || detail || fallback);
          err.statusCode = res.statusCode;
          reject(err);
        }
      },
      fail: (err) => reject(new Error(err.errMsg || "网络错误")),
    });
  });
}

// 附件上传（单文件）：小程序 wx.uploadFile 仅支持一个文件字段。
// fileName：chooseMessageFile 返回的原始文件名。临时路径常不带扩展名，
// 后端靠它做格式校验，必须显式传入。
function uploadFile(filePath, fileName) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: app.globalData.baseUrl + "/api/attachment/upload",
      filePath,
      name: "files",
      formData: fileName ? { filename: fileName } : {},
      header: { Authorization: "Bearer " + getToken(), "X-App-Id": currentAppId() },
      success: (res) => {
        let data = {};
        try { data = JSON.parse(res.data); } catch (e) { /* 非 JSON 响应 */ }
        if (res.statusCode === 401) {
          logout();
          const err = new Error("登录已失效，请重新登录");
          err.statusCode = 401;
          err.authFailed = true;
          reject(err);
          return;
        }
        if (res.statusCode === 200) resolve(data);
        else reject(new Error(data.detail || "上传失败(" + res.statusCode + ")"));
      },
      fail: (err) => reject(new Error(err.errMsg || "上传错误")),
    });
  });
}

module.exports = { request, uploadFile, getToken };
