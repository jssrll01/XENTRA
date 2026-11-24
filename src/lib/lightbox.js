export function openLightbox(url) {
  const back = document.createElement('div');
  back.className = 'lb-back';
  back.setAttribute('role', 'dialog');
  back.setAttribute('aria-modal', 'true');
  back.setAttribute('aria-label', 'Image preview');
  const img = document.createElement('img');
  img.src = url;
  img.alt = '';
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'lb-x';
  x.setAttribute('aria-label', 'Close image');
  x.textContent = '\u00d7';
  const key = (e) => { if (e.key === 'Escape') off(); };
  const off = () => { document.removeEventListener('keydown', key); back.remove(); };
  document.addEventListener('keydown', key);
  back.addEventListener('click', off);
  back.appendChild(img);
  back.appendChild(x);
  document.body.appendChild(back);
}
