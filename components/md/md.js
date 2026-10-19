// 轻量 Markdown 渲染组件：把工具输出的 markdown 子集转成 rich-text 可用的 HTML。
// 支持子集（按线上真实输出归纳）：#~#### 标题、**加粗**、*斜体*、`行内代码`、
// - 无序列表、1. 有序列表、> 引用、--- 分隔线、| 表格 |。图片/链接不支持（输出中未出现）。
// 样式以内联 style 注入：rich-text 内部节点无法可靠继承页面 wxss。

const S = {
  h1: 'font-size:36rpx;font-weight:700;margin:20rpx 0 12rpx;line-height:1.5;',
  h2: 'font-size:32rpx;font-weight:700;margin:18rpx 0 10rpx;line-height:1.5;',
  h3: 'font-size:30rpx;font-weight:700;margin:14rpx 0 8rpx;line-height:1.5;',
  h4: 'font-size:29rpx;font-weight:700;margin:12rpx 0 8rpx;line-height:1.5;',
  p: 'margin:6rpx 0;line-height:1.75;font-size:28rpx;',
  li: 'margin:4rpx 0;line-height:1.7;font-size:28rpx;',
  liWrap: 'display:flex;margin:4rpx 0;',
  liMark: 'flex-shrink:0;margin-right:10rpx;',
  liBody: 'flex:1;line-height:1.7;font-size:28rpx;min-width:0;',
  quote: 'border-left:6rpx solid #c7d2fe;background:#f6f5fd;border-radius:0 12rpx 12rpx 0;padding:14rpx 18rpx;margin:10rpx 0;',
  quoteP: 'margin:4rpx 0;line-height:1.7;font-size:28rpx;color:#4b5563;',
  hr: 'border:none;border-top:1rpx solid #e5e7eb;margin:16rpx 0;',
  table: 'width:100%;border-collapse:collapse;margin:12rpx 0;font-size:24rpx;',
  th: 'background:#f6f5fd;border:1rpx solid #e5e7eb;padding:10rpx 12rpx;text-align:left;font-weight:700;',
  td: 'border:1rpx solid #e5e7eb;padding:10rpx 12rpx;vertical-align:top;',
  code: 'background:#f3f4f6;border-radius:6rpx;padding:2rpx 8rpx;font-family:Menlo,Consolas,monospace;font-size:26rpx;',
  strong: 'font-weight:700;',
  em: 'font-style:italic;',
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 行内：代码 → 加粗 → 斜体（顺序保证 ** 先于 * 消化）
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code style="' + S.code + '">$1</code>')
    .replace(/[*][*]([^*]+)[*][*]/g, '<strong style="' + S.strong + '">$1</strong>')
    .replace(/[*]([^*\n]+)[*]/g, '<em style="' + S.em + '">$1</em>');
}

function toHtml(md) {
  const lines = String(md || '').split(/\r?\n/);
  let html = '';
  let i = 0;
  const isTableSep = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l);
  const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const rowCells = (l) => l.trim().replace(/^\||\|$/g, '').split('|');
  const isHr = (l) => /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l);

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { i++; continue; }

    // 表格：当前行是行，下一行是 |---| 分隔
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      let t = '<table style="' + S.table + '"><thead><tr>'
        + rowCells(line).map((c) => '<th style="' + S.th + '">' + inline(c) + '</th>').join('')
        + '</tr></thead><tbody>';
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) {
        t += '<tr>' + rowCells(lines[i]).map((c) => '<td style="' + S.td + '">' + inline(c) + '</td>').join('') + '</tr>';
        i++;
      }
      html += t + '</tbody></table>';
      continue;
    }

    // 分隔线
    if (isHr(line)) { html += '<hr style="' + S.hr + '"/>'; i++; continue; }

    // 标题
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lv = Math.min(h[1].length, 4);
      html += '<h' + lv + ' style="' + S['h' + lv] + '">' + inline(h[2]) + '</h' + lv + '>';
      i++; continue;
    }

    // 引用块（连续 > 行）
    if (/^\s*>\s?/.test(line)) {
      let q = '<div style="' + S.quote + '">';
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        const inner = lines[i].replace(/^\s*>\s?/, '');
        q += /^\s*$/.test(inner) ? '' : '<p style="' + S.quoteP + '">' + inline(inner) + '</p>';
        i++;
      }
      html += q + '</div>';
      continue;
    }

    // 无序列表（连续行）
    if (/^\s*[-*•]\s+/.test(line)) {
      html += '<div style="' + S.liWrap + '">';
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        html += '<div style="' + S.liMark + '">•</div><div style="' + S.liBody + '">'
          + inline(lines[i].replace(/^\s*[-*•]\s+/, '')) + '</div>';
        i++;
        // 同一条目的续行（缩进非列表行）并入当前项
        while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^\s*[-*•]\s+/.test(lines[i])
          && !/^\s*\d+[.、]\s+/.test(lines[i]) && !/^(#{1,4})\s/.test(lines[i])
          && !/^\s*>\s?/.test(lines[i]) && !isTableRow(lines[i]) && !isHr(lines[i])) {
          html += inline(lines[i].trim());
          i++;
        }
        html += '</div>';
      }
      continue;
    }

    // 有序列表（连续行，保留原编号）
    if (/^\s*\d+[.、]\s+/.test(line)) {
      html += '<div style="' + S.liWrap + '">';
      while (i < lines.length && /^\s*\d+[.、]\s+/.test(lines[i])) {
        const m2 = lines[i].match(/^\s*(\d+[.、])\s+(.*)$/);
        html += '<div style="' + S.liMark + '">' + inline(m2[1]) + '</div><div style="' + S.liBody + '">'
          + inline(m2[2]) + '</div>';
        i++;
        while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^\s*[-*•]\s+/.test(lines[i])
          && !/^\s*\d+[.、]\s+/.test(lines[i]) && !/^(#{1,4})\s/.test(lines[i])
          && !/^\s*>\s?/.test(lines[i]) && !isTableRow(lines[i]) && !isHr(lines[i])) {
          html += inline(lines[i].trim());
          i++;
        }
        html += '</div>';
      }
      continue;
    }

    // 普通段落（连续普通行合并，行内 <br/> 换行）
    const para = [line];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,4})\s/.test(lines[i])
      && !/^\s*[-*•]\s+/.test(lines[i]) && !/^\s*\d+[.、]\s+/.test(lines[i])
      && !/^\s*>\s?/.test(lines[i]) && !isTableRow(lines[i]) && !isHr(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    html += '<p style="' + S.p + '">' + para.map(inline).join('<br/>') + '</p>';
  }
  return html;
}

Component({
  properties: {
    content: { type: String, value: '' },
  },
  data: { html: '' },
  observers: {
    content(v) {
      this.setData({ html: toHtml(v) });
    },
  },
});
