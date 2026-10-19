// 个人资料：头像上传 / 昵称保存（「我的」页使用；
// 隐私授权交由微信原生控件自动处理，不额外调用 requirePrivacyAuthorize）
const { request } = require("./request.js");

function _token() {
  const app = getApp();
  return (app && app.globalData && app.globalData.token) || wx.getStorageSync("wb_token") || "";
}

// 上传头像（微信 chooseAvatar 返回的临时文件），返回可直接用于 <image> 的完整地址
function uploadAvatar(filePath) {
  const app = getApp();
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: app.globalData.baseUrl + "/api/auth/avatar",
      filePath,
      name: "file",
      header: { Authorization: "Bearer " + _token() },
      success: (res) => {
        let data = {};
        try {
          data = JSON.parse(res.data);
        } catch (e) {
          /* 非 JSON */
        }
        if (res.statusCode === 200 && data.avatar) {
          resolve(app.globalData.baseUrl + data.avatar);
        } else {
          reject(new Error((data && data.detail) || "头像上传失败"));
        }
      },
      fail: () => reject(new Error("头像上传失败")),
    });
  });
}

// 保存昵称（微信 nickname 输入给出的值）
function saveNickname(nickname) {
  return request("/api/auth/profile", "POST", { nickname });
}

module.exports = { uploadAvatar, saveNickname };
