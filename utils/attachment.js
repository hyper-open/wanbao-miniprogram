// 附件格式校验（与后端 ATTACHMENT_ALLOWED_MIME 保持一致）
const SUPPORTED_EXT = [".docx", ".pdf", ".pptx", ".txt", ".md", ".jpg", ".jpeg", ".png", ".webp"];
const MAX_BYTES = 10 * 1024 * 1024; // 单文件 10MB

function extOf(nameOrPath) {
  const m = String(nameOrPath || "").match(/\.[a-z0-9]+$/i);
  return m ? m[0].toLowerCase() : "";
}

/**
 * 选择文件后先做本地校验，避免白跑一次上传。
 * 返回 null 表示通过，否则返回给用户看的提示文案。
 */
function checkAttachment(file) {
  const name = (file && (file.name || file.path)) || "";
  const ext = extOf(name);
  const size = (file && file.size) || 0;

  if (size > MAX_BYTES) {
    return "文件超过 10MB，请压缩后再上传";
  }
  if (ext === ".doc") {
    return "暂不支持 .doc 格式，请在 Word / WPS 中另存为 .docx 或 .pdf 后再上传";
  }
  if (!ext) {
    return "无法识别文件格式，请上传 .docx / .pdf / .pptx / .txt / .md 文件或图片";
  }
  if (SUPPORTED_EXT.indexOf(ext) < 0) {
    return "不支持 " + ext + " 格式，请上传 .docx / .pdf / .pptx / .txt / .md 文件或图片";
  }
  return null;
}

module.exports = { checkAttachment, extOf, SUPPORTED_EXT, MAX_BYTES };
