import React from 'react';

const RE = /`([^`\n]+)`|\*([^\s*](?:[^*\n]*[^\s*])?)\*|_([^\s_](?:[^_\n]*[^\s_])?)_|(https?:\/\/[^\s<]+)/g;
const TAIL = /[.,;:!?)\]]+$/;

export function firstUrl(text) {
  const m = /https?:\/\/[^\s<]+/.exec(String(text || ''));
  return m ? m[0].replace(TAIL, '') : null;
}

export function rich(text) {
  const s = String(text || '');
  const out = [];
  let last = 0;
  let k = 0;
  let m;
  RE.lastIndex = 0;
  while ((m = RE.exec(s)) !== null) {
    if (m[3] !== undefined && m.index > 0 && /\w/.test(s[m.index - 1])) { RE.lastIndex = m.index + 1; continue; }
    let end = m.index + m[0].length;
    let node;
    if (m[1] !== undefined) node = <code key={k++}>{m[1]}</code>;
    else if (m[2] !== undefined) node = <b key={k++}>{m[2]}</b>;
    else if (m[3] !== undefined) node = <i key={k++}>{m[3]}</i>;
    else {
      const url = m[4].replace(TAIL, '');
      end = m.index + url.length;
      RE.lastIndex = end;
      node = <a key={k++} href={url} target="_blank" rel="noopener noreferrer">{url}</a>;
    }
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(node);
    last = end;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
