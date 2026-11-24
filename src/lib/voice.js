const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const SEL = 'input[type="search"], .chat-find input, .tm-search input, .pal-in input, .msg-find input';
const ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0"></path><path d="M12 18v4"></path></svg>';
let active = null;

function toast(msg) {
  const old = document.querySelector('.mic-toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'mic-toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

const setVal = (el, v) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

const MSG = {
  'not-allowed': 'Microphone access is blocked. Allow it in your browser settings.',
  'service-not-allowed': 'Microphone access is blocked. Allow it in your browser settings.',
  'no-speech': 'No speech heard. Try again.',
  'audio-capture': 'No microphone was found.',
  network: 'Voice search needs an internet connection.',
};

function begin(input, btn) {
  if (!SR) { toast('Voice search is not supported in this browser.'); return; }
  if (active) { const same = active.btn === btn; active.rec.stop(); if (same) return; }
  const rec = new SR();
  rec.lang = document.documentElement.lang || navigator.language || 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (e) => {
    let t = '';
    for (let i = 0; i < e.results.length; i += 1) t += e.results[i][0].transcript;
    setVal(input, t.trim());
  };
  rec.onerror = (e) => { if (e.error !== 'aborted') toast(MSG[e.error] || 'Voice search failed. Try again.'); };
  rec.onend = () => { btn.classList.remove('on'); btn.setAttribute('aria-pressed', 'false'); if (active && active.rec === rec) active = null; };
  try {
    rec.start();
    active = { rec, btn };
    btn.classList.add('on');
    btn.setAttribute('aria-pressed', 'true');
    input.focus();
  } catch (x) { toast('Could not start voice search.'); }
}

function enhance(input) {
  if (input.dataset.mic) return;
  input.dataset.mic = '1';
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mic-btn';
  b.setAttribute('aria-label', 'Voice search');
  b.setAttribute('aria-pressed', 'false');
  b.innerHTML = ICON;
  b.addEventListener('click', (e) => { e.preventDefault(); begin(input, b); });
  input.insertAdjacentElement('afterend', b);
}

let raf = 0;
function scan() {
  raf = 0;
  document.querySelectorAll('.mic-btn').forEach((b) => {
    const p = b.previousElementSibling;
    if (!p || !p.dataset || !p.dataset.mic) b.remove();
  });
  document.querySelectorAll(SEL).forEach(enhance);
}
new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(scan); }).observe(document.documentElement, { childList: true, subtree: true });
scan();
