// 登录：wx.login 拿 code -> 后端换 token/openid。微信主体下可在此一并 getPhoneNumber。
const app = getApp();

// 当前小程序的 appid（多渠道：后端据此选用对应渠道账号的凭证）
function currentAppId() {
  try {
    const info = wx.getAccountInfoSync && wx.getAccountInfoSync();
    return (info && info.miniProgram && info.miniProgram.appId) || "";
  } catch (e) {
    return "";
  }
}

function login() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (!res.code) return reject(new Error("wx.login 失败"));
        wx.request({
          url: app.globalData.baseUrl + "/api/auth/login",
          method: "POST",
          data: { code: res.code, appid: currentAppId() },
          success: (r) => {
            if (r.statusCode === 200 && r.data.token) {
              app.globalData.token = r.data.token;
              app.globalData.openid = r.data.openid;
              wx.setStorageSync("wb_token", r.data.token);
              wx.setStorageSync("wb_openid", r.data.openid);
              resolve(r.data);
            } else {
              reject(new Error("登录失败"));
            }
          },
          fail: () => reject(new Error("网络错误")),
        });
      },
      fail: () => reject(new Error("wx.login 失败")),
    });
  });
}

// 登录失效时清除本地登录态；此后由用户主动触发登录（不静默登录）
function logout() {
  const app = getApp();
  if (app && app.globalData) {
    app.globalData.token = "";
    app.globalData.openid = "";
  }
  wx.removeStorageSync("wb_token");
  wx.removeStorageSync("wb_openid");
}

function isLoggedIn() {
  const app = getApp();
  return !!(app && app.globalData && app.globalData.token);
}

module.exports = { login, logout, isLoggedIn, currentAppId };
