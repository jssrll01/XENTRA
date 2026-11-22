import React from 'react';
import CodeBlock from '../components/CodeBlock';

const RE = /`([^`\n]+)`|\*([^\s*](?:[^*\n]*[^\s*])?)\*|_([^\s_](?:[^_\n]*[^\s_])?)_|(https?:\/\/[^\s<]+)/g;
const TAIL = /[.,;:!?)\]]+$/;

export function firstUrl(text) {
  const m = /https?:\/\/[^\s<]+/.exec(String(text || ''));
  return m ? m[0].replace(TAIL, '') : null;
}

function inline(text) {
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

export function rich(text) {
  const s = String(text || '');
  const parts = s.split(/```([\s\S]*?)```/);
  if (parts.length === 1) return inline(s);
  const out = [];
  parts.forEach((p, i) => {
    if (i % 2 === 1) out.push(<CodeBlock key={'c' + i} code={p.replace(/^\n/, '').replace(/\n$/, '')} />);
    else if (p) out.push(<React.Fragment key={'t' + i}>{inline(p)}</React.Fragment>);
  });
  return out;
}
