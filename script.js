document.querySelectorAll('[data-year]').forEach((el) => {
  el.textContent = new Date().getFullYear();
});

// Landing page: show the small header logo only after the big hero logo leaves view.
const landingHeader = document.querySelector('.site-header--landing');
const heroLogo = document.querySelector('.hero-logo');
if (landingHeader && heroLogo && 'IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => {
    landingHeader.classList.toggle('is-scrolled', !entry.isIntersecting);
  }, { rootMargin: '-84px 0px 0px 0px' }).observe(heroLogo);
}

// Recent-work strip: continuous glide (transform-driven, seamless loop via one
// cloned set). Visitors can drag, swipe, use a trackpad, the edge arrows or the
// arrow keys; it pauses on hover/focus and stays still under reduced motion.
const reelViewport = document.querySelector('.reel-viewport');
if (reelViewport) {
  const reel = reelViewport.closest('.reel');
  const track = reelViewport.querySelector('.reel-track');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SPEED = 32;            // px per second
  const RESUME_AFTER_MS = 1800;

  [...track.children].forEach((item) => {
    const copy = item.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    copy.setAttribute('tabindex', '-1');
    copy.querySelectorAll('img').forEach((img) => { img.alt = ''; img.loading = 'lazy'; });
    track.appendChild(copy);
  });

  const count = track.children.length / 2;
  const setWidth = () => track.children[count].offsetLeft - track.children[0].offsetLeft;
  const cardStep = () => track.children[1].offsetLeft - track.children[0].offsetLeft;

  let pos = 0;
  let hovering = false;
  let onScreen = true;
  let holdUntil = 0;
  let drag = null;
  let tween = null;

  const wrap = (value) => { const w = setWidth(); return ((value % w) + w) % w; };
  const render = () => { track.style.transform = `translate3d(${-pos}px, 0, 0)`; };
  const hold = () => { holdUntil = performance.now() + RESUME_AFTER_MS; };
  const nudge = (dir) => {
    hold();
    tween = { from: pos, to: pos + dir * cardStep(), start: performance.now(), ms: reducedMotion ? 1 : 650 };
  };

  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(now - last, 64) / 1000;
    last = now;
    if (tween) {
      const t = Math.min(1, (now - tween.start) / tween.ms);
      pos = tween.from + (tween.to - tween.from) * (1 - Math.pow(1 - t, 3));
      if (t === 1) tween = null;
    } else if (!drag && !hovering && onScreen && !reducedMotion && now > holdUntil) {
      pos += SPEED * dt;
    }
    pos = wrap(pos);
    render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  reel.querySelector('.reel-prev').addEventListener('click', () => nudge(-1));
  reel.querySelector('.reel-next').addEventListener('click', () => nudge(1));
  reelViewport.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); nudge(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-1); }
  });

  // Drag to browse. Pointer capture starts only once the pointer has really
  // moved, so a plain tap or click still opens the project on Instagram.
  let dragged = false;
  reelViewport.addEventListener('pointerdown', (e) => {
    tween = null;
    dragged = false;
    drag = { x: e.clientX, pos, id: e.pointerId };
  });
  reelViewport.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!dragged && Math.abs(dx) > 6) {
      dragged = true;
      reelViewport.setPointerCapture(e.pointerId);
      reelViewport.classList.add('is-dragging');
    }
    if (dragged) pos = drag.pos - dx;
  });
  reelViewport.addEventListener('click', (e) => {
    if (dragged) { e.preventDefault(); e.stopPropagation(); dragged = false; }
  }, true);
  const endDrag = () => {
    if (!drag) return;
    drag = null;
    hold();
    reelViewport.classList.remove('is-dragging');
  };
  reelViewport.addEventListener('pointerup', endDrag);
  reelViewport.addEventListener('pointercancel', endDrag);

  reelViewport.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    tween = null;
    pos += e.deltaX;
    hold();
  }, { passive: false });

  // Hover-pause for real mice only: taps on touch screens emit a mouseenter with no leave.
  reelViewport.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hovering = true; });
  reelViewport.addEventListener('pointerleave', () => { hovering = false; });
  reelViewport.addEventListener('focus', () => { hovering = true; });
  reelViewport.addEventListener('blur', () => { hovering = false; });
  new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; }).observe(reel);
}

const form = document.getElementById('contact-form');

// Enquiries go to our own /api/contact (email + WhatsApp) when the site runs on
// Vercel. Static hosts such as GitHub Pages have no API, so a missing endpoint
// falls back to FormSubmit, which emails the enquiry.
async function sendEnquiry(data) {
  if (data.company) return; // honeypot filled: quietly drop bot submissions
  const fallback = form.dataset.fallbackEndpoint;
  // Only call our own API when the page declares one (e.g. data-api="/api/contact"
  // on Vercel). Static hosting such as GitHub Pages goes straight to the email service.
  if (form.dataset.api) {
    const res = await fetch(form.dataset.api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) return;
    if (![404, 405, 501].includes(res.status) || !fallback) throw new Error(String(res.status));
  }

  const fields = {
    Name: data.name,
    Email: data.email,
    Phone: data.phone,
    'Event date': data.date,
    Guests: data.guests,
    Details: data.message,
    Consent: data.consent === 'yes' ? 'Agreed to be contacted (privacy policy)' : '',
  };
  const payload = Object.fromEntries(Object.entries(fields).filter(([, value]) => value));
  payload._subject = `New enquiry from ${data.name} – The Chutney Project`;
  payload._template = 'table';
  if (data.email) payload._replyto = data.email;

  const viaService = await fetch(fallback, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await viaService.json().catch(() => ({}));
  if (!viaService.ok || String(result.success) !== 'true') throw new Error(result.message || String(viaService.status));
}

if (form) {
  const status = form.querySelector('.form-status');
  const button = form.querySelector('button[type="submit"]');

  const setStatus = (text, kind) => {
    status.textContent = text;
    status.className = 'form-status ' + (kind || '');
  };

  // Clear the error state as soon as someone edits a flagged field.
  form.addEventListener('input', (e) => {
    if (e.target.getAttribute('aria-invalid') === 'true') e.target.removeAttribute('aria-invalid');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));

    // Required: name, phone, event date, guests and consent. Email and details are optional.
    const email = data.email.trim();
    const phone = data.phone.trim();
    const problems = [];
    if (data.name.trim().length < 2) problems.push(['name', 'Add your name.']);
    if (!phone) problems.push(['phone', 'Add a phone number so we can call you back.']);
    else if (phone.replace(/\D/g, '').length < 8) problems.push(['phone', 'Check the phone number.']);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push(['email', 'Check the email address.']);
    if (!data.date) problems.push(['date', 'Add the event date.']);
    if (!(Number(data.guests) >= 1)) problems.push(['guests', 'Add the number of guests.']);
    if (!form.elements.consent.checked) problems.push(['consent', 'Tick the box to agree to be contacted.']);
    ['name', 'phone', 'email', 'date', 'guests', 'consent'].forEach((field) => form.elements[field].removeAttribute('aria-invalid'));
    problems.forEach(([field]) => form.elements[field].setAttribute('aria-invalid', 'true'));
    if (problems.length) {
      setStatus(problems.map(([, message]) => message).filter(Boolean).join(' '), 'error');
      form.elements[problems[0][0]].focus();
      return;
    }

    button.disabled = true;
    setStatus('Sending your enquiry… this can take up to 20 seconds.');
    try {
      await sendEnquiry(data);
      form.reset();
      setStatus('Enquiry sent. We’ll reply within one working day.', 'ok');
    } catch {
      setStatus('Your enquiry didn’t send. Try again, or message us on Instagram.', 'error');
    } finally {
      button.disabled = false;
    }
  });
}
