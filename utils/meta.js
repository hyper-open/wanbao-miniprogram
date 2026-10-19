// 类目元信息：名称与图标，供首页/工具页共用
const CAT_NAMES = {
  writing: "写作",
  office: "办公",
  doc: "文档",
  marketing: "营销",
  code: "编程",
  study: "学习",
  design: "设计",
  translate: "翻译",
  life: "生活",
  data: "数据",
  other: "其他",
};

const CAT_EMOJI = {
  writing: "✍️",
  office: "💼",
  doc: "📄",
  marketing: "📣",
  code: "💻",
  study: "📚",
  design: "🎨",
  translate: "🌐",
  life: "🌱",
  data: "📊",
  other: "✨",
};

// 给工具列表补充 emoji 字段（后端不返回图标）
function withEmoji(list) {
  return (list || []).map((t) => ({ ...t, emoji: CAT_EMOJI[t.category] || CAT_EMOJI.other }));
}

module.exports = { CAT_NAMES, CAT_EMOJI, withEmoji };
