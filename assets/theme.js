/* Casa Fresca theme: vanilla JS, no dependencies */
(() => {
  'use strict';
  const CF = window.CF || {};
  const doc = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t = (k, vars = {}) => String((CF.strings || {})[k] || k).replace(/__(\w+)__/g, (_, v) => vars[v] ?? '');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- money ---------- */
  function formatMoney(cents, format = CF.moneyFormat || '${{amount}}') {
    cents = Number(cents) || 0;
    const fmt = (n, d = 2, ts = ',', ds = '.') => {
      const [i, f] = (n / 100).toFixed(d).split('.');
      return i.replace(/\B(?=(\d{3})+(?!\d))/g, ts) + (f ? ds + f : '');
    };
    return format.replace(/\{\{\s*(\w+)\s*\}\}/, (_, k) => ({
      amount: fmt(cents), amount_no_decimals: fmt(cents, 0), amount_with_comma_separator: fmt(cents, 2, '.', ','),
      amount_no_decimals_with_comma_separator: fmt(cents, 0, '.', ','), amount_with_apostrophe_separator: fmt(cents, 2, "'", '.'),
    }[k] || fmt(cents)));
  }
  const sizedImg = (url, w) => { if (!url) return ''; return url + (url.includes('?') ? '&' : '?') + 'width=' + w; };

  /* ---------- cart transport (Shopify AJAX API; the preview swaps this) ---------- */
  const R = CF.routes || { root: '/', cart: '/cart', cart_add: '/cart/add', cart_change: '/cart/change', cart_update: '/cart/update' };
  const post = (url, body) => fetch(url + '.js', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => { const j = await r.json(); if (!r.ok) throw Object.assign(new Error(j.description || j.message || 'Cart error'), { data: j }); return j; });
  const transport = window.CFTransport || {
    get: () => fetch(R.cart + '.js', { headers: { Accept: 'application/json' } }).then((r) => r.json()),
    add: (items) => post(R.cart_add, { items }),
    change: (key, quantity) => post(R.cart_change, { id: key, quantity }),
    update: (data) => post(R.cart_update, data),
  };

  /* ---------- cart store ---------- */
  const Cart = {
    state: CF.cart || null,
    subs: new Set(),
    on(fn) { this.subs.add(fn); if (this.state) fn(this.state, {}); },
    set(state, meta = {}) { this.state = state; document.dispatchEvent(new CustomEvent('cart:updated', { detail: { cart: state, ...meta } })); this.subs.forEach((fn) => fn(state, meta)); },
    async refresh(meta) { this.set(await transport.get(), meta); return this.state; },
    async add(id, quantity = 1) { await transport.add([{ id: Number(id), quantity: Number(quantity) }]); return this.refresh({ added: Number(id) }); },
    async change(key, quantity) { const s = await transport.change(key, quantity); this.set(s.items ? s : await transport.get()); return this.state; },
    async note(note) { await transport.update({ note }); },
    qtyFor(variantId) { if (!this.state) return 0; return this.state.items.filter((i) => i.variant_id === Number(variantId)).reduce((a, i) => a + i.quantity, 0); },
    lineFor(variantId) { return this.state && this.state.items.find((i) => i.variant_id === Number(variantId)); },
  };
  window.CFCart = Cart;

  /* ---------- toast ---------- */
  let toastEl, toastT;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('is-on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('is-on'), 2400);
  }

  /* ---------- counts, totals, bar ---------- */
  Cart.on((c) => {
    $$('[data-cart-count]').forEach((el) => { el.textContent = c.item_count; });
    $$('[data-cart-total]').forEach((el) => { el.textContent = formatMoney(c.total_price); });
    $$('[data-cart-label]').forEach((el) => { el.textContent = c.item_count === 1 ? t('meal_one') : t('meal_other'); });
    const bar = $('[data-cart-bar]');
    if (bar) { bar.classList.toggle('is-visible', c.item_count > 0); document.body.classList.toggle('has-cart-bar', c.item_count > 0); }
  });
  document.addEventListener('cart:updated', (e) => {
    if (!e.detail.added) return;
    $$('.cart-btn').forEach((b) => { b.classList.remove('is-bump'); void b.offsetWidth; b.classList.add('is-bump'); });
  });

  /* ---------- line renderer (drawer + cart page) ---------- */
  const ico = {
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };
  function lineHTML(item) {
    const variant = item.product_has_only_default_variant ? '' : (item.options_with_values || []).map((o) => esc(o.value)).join(' · ') || esc(item.variant_title || '');
    const props = Object.entries(item.properties || {}).filter(([k, v]) => v && k[0] !== '_').map(([k, v]) => `<div class="line__variant">${esc(k)}: ${esc(v)}</div>`).join('');
    const img = item.image ? `<img src="${esc(sizedImg(item.image, 200))}" alt="" width="76" height="76" loading="lazy">` : '';
    const was = item.original_line_price > item.final_line_price ? `<s class="muted">${formatMoney(item.original_line_price)}</s> ` : '';
    return `<li class="line" data-line="${esc(item.key)}">
      <a class="line__img" href="${esc(item.url)}" tabindex="-1">${img}</a>
      <div>
        <div class="line__top"><div><a class="line__title" href="${esc(item.url)}">${esc(item.product_title)}</a>${variant ? `<div class="line__variant">${variant}</div>` : ''}${props}</div>
        <div class="line__price">${was}${formatMoney(item.final_line_price)}</div></div>
        <div class="line__ctrl">
          <div class="stepper stepper--light stepper--sm" role="group" aria-label="${esc(t('quantity'))}">
            <button type="button" data-line-qty="${item.quantity - 1}" aria-label="${esc(t('decrease'))}">${ico.minus}</button>
            <output aria-live="polite">${item.quantity}</output>
            <button type="button" data-line-qty="${item.quantity + 1}" aria-label="${esc(t('increase'))}">${ico.plus}</button>
          </div>
          <button type="button" class="line__remove" data-line-qty="0">${esc(t('remove'))}</button>
        </div>
      </div></li>`;
  }
  function bindLines(root) {
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-line-qty]'); if (!b) return;
      const li = b.closest('[data-line]'); li.classList.add('is-busy');
      try { await Cart.change(li.dataset.line, Number(b.dataset.lineQty)); } catch (err) { toast(err.message); li.classList.remove('is-busy'); }
    });
  }

  /* ---------- drawer ---------- */
  const drawer = $('[data-drawer]');
  const overlay = $('[data-overlay]');
  let lastFocus;
  function openDrawer() {
    if (!drawer) { window.location.href = R.cart; return; }
    lastFocus = document.activeElement;
    if (toastEl) toastEl.classList.remove('is-on');
    drawer.classList.add('is-open'); overlay && overlay.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false'); document.body.classList.add('drawer-open');
    $$('[data-cart-open]').forEach((b) => b.setAttribute('aria-expanded', 'true'));
    setTimeout(() => { const f = $('[data-drawer-close]', drawer); f && f.focus({ preventScroll: true }); }, 50);
  }
  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove('is-open'); overlay && overlay.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true'); document.body.classList.remove('drawer-open');
    $$('[data-cart-open]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true });
  }
  window.CFDrawer = { open: openDrawer, close: closeDrawer };
  document.addEventListener('click', (e) => {
    const o = e.target.closest('[data-cart-open]');
    if (o) { e.preventDefault(); openDrawer(); return; }
    if (e.target.closest('[data-drawer-close]') || e.target === overlay) closeDrawer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (drawer && drawer.classList.contains('is-open')) closeDrawer();
    closeMenu(); closeSheet();
  });
  if (drawer) {
    const list = $('[data-drawer-lines]', drawer), empty = $('[data-drawer-empty]', drawer), foot = $('[data-drawer-foot]', drawer);
    bindLines(list);
    Cart.on((c) => {
      list.innerHTML = c.items.map(lineHTML).join('');
      empty.hidden = c.item_count > 0; foot.hidden = c.item_count === 0; list.hidden = c.item_count === 0;
      $$('[data-upsell-item]', drawer).forEach((el) => { el.hidden = Cart.qtyFor(el.dataset.variantId) > 0; });
      const up = $('[data-upsell]', drawer); if (up) up.hidden = !$$('[data-upsell-item]', drawer).some((el) => !el.hidden);
      const note = $('[data-cart-note]', drawer); if (note && document.activeElement !== note) note.value = c.note || '';
    });
  }
  /* note autosave (drawer + cart page) */
  let noteT;
  document.addEventListener('input', (e) => {
    const n = e.target.closest('[data-cart-note]'); if (!n) return;
    clearTimeout(noteT); noteT = setTimeout(() => Cart.note(n.value).catch(() => {}), 500);
  });

  /* ---------- cart page ---------- */
  const cartPage = $('[data-cart-page]');
  if (cartPage) {
    const list = $('[data-cart-lines]', cartPage);
    bindLines(list);
    Cart.on((c) => {
      list.innerHTML = c.items.map(lineHTML).join('');
      $$('[data-cart-filled]', cartPage).forEach((el) => { el.hidden = c.item_count === 0; });
      $$('[data-cart-empty]', cartPage).forEach((el) => { el.hidden = c.item_count > 0; });
      const note = $('[data-cart-note]', cartPage); if (note && document.activeElement !== note) note.value = c.note || '';
    });
  }

  /* ---------- product forms (cards, PDP, mini add) ---------- */
  function syncForm(form) {
    const id = Number(($('[name="id"]:checked', form) || $('[name="id"]', form) || {}).value);
    const opt = $(`[data-variant="${id}"]`, form) || ($('select[name="id"]', form) || {}).selectedOptions?.[0];
    const price = opt && opt.dataset.price;
    const scope = form.closest('[data-product-scope]') || form;
    if (price) $$('[data-price-el]', scope).forEach((el) => { el.textContent = formatMoney(price); });
    const qty = Cart.qtyFor(id);
    const btn = $('[data-add-btn]', form), step = $('[data-stepper]', form);
    if (form.hasAttribute('data-card-form') && step && btn && !form.dataset.hold) {
      btn.hidden = qty > 0; step.hidden = qty === 0;
      const out = $('output', step); if (out) out.textContent = qty;
    }
    if (btn) { const avail = !opt || opt.dataset.available !== 'false'; btn.toggleAttribute('disabled', !avail); }
    if (form.dataset.urlSync !== undefined && id && history.replaceState) {
      const u = new URL(location.href); u.searchParams.set('variant', id); history.replaceState({}, '', u);
    }
  }
  function bindForms(root = document) {
    $$('[data-product-form]', root).forEach((form) => {
      if (form.dataset.bound) return; form.dataset.bound = '1';
      form.addEventListener('change', (e) => { if (e.target.name === 'id') syncForm(form); });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('[data-add-btn]', form);
        const id = ($('[name="id"]:checked', form) || $('[name="id"]', form)).value;
        const qty = ($('[name="quantity"]', form) || {}).value || 1;
        const fd = new FormData(form); const props = {};
        for (const [k, v] of fd.entries()) { const m = k.match(/^properties\[(.+)\]$/); if (m && v) props[m[1]] = v; }
        btn && btn.classList.add('is-loading');
        if (form.hasAttribute('data-card-form')) form.dataset.hold = '1';
        try {
          if (Object.keys(props).length) { await transport.add([{ id: Number(id), quantity: Number(qty), properties: props }]); await Cart.refresh({ added: Number(id) }); }
          else await Cart.add(id, qty);
          if (btn) {
            btn.classList.add('is-added');
            if (form.hasAttribute('data-card-form')) { setTimeout(() => { delete form.dataset.hold; btn.classList.remove('is-added'); syncForm(form); }, 900); }
            else setTimeout(() => btn.classList.remove('is-added'), 1600);
          }
          const title = form.dataset.title || '';
          if (form.hasAttribute('data-open-drawer') && CF.settings.openDrawerOnAdd) openDrawer(); else toast(t('added', { title }));
        } catch (err) { delete form.dataset.hold; syncForm(form); toast(err.message || t('error')); }
        finally { btn && btn.classList.remove('is-loading'); }
      });
      const step = $('[data-stepper]', form);
      if (step) step.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-step]'); if (!b) return;
        const id = ($('[name="id"]:checked', form) || $('[name="id"]', form)).value;
        const line = Cart.lineFor(id); if (!line) return;
        step.classList.add('is-busy');
        try { await Cart.change(line.key, line.quantity + Number(b.dataset.step)); } catch (err) { toast(err.message); }
        step.classList.remove('is-busy');
      });
      syncForm(form);
    });
  }
  bindForms();
  Cart.on(() => $$('[data-product-form]').forEach(syncForm));
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-quick-add]'); if (!b) return;
    e.preventDefault(); b.classList.add('is-loading');
    try { await Cart.add(b.dataset.quickAdd, 1); toast(t('added', { title: b.dataset.title || '' })); } catch (err) { toast(err.message); }
    b.classList.remove('is-loading');
  });
  /* PDP qty stepper */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-qty-step]'); if (!b) return;
    const input = $('input', b.closest('.stepper')); const v = Math.max(1, (Number(input.value) || 1) + Number(b.dataset.qtyStep)); input.value = v;
  });

  /* ---------- order cut-off ---------- */
  const S = CF.settings || {};
  function zonedNow(tz) {
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
      return new Date(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    } catch (e) { return new Date(); }
  }
  function cutoffInfo() {
    const now = zonedNow(S.timezone || 'America/Indiana/Indianapolis');
    const [hh, mm] = String(S.cutoffTime || '18:00').split(':').map(Number);
    const cut = new Date(now); cut.setHours(hh || 0, mm || 0, 0, 0);
    let add = (Number(S.cutoffDay) - now.getDay() + 7) % 7; cut.setDate(cut.getDate() + add);
    if (cut <= now) cut.setDate(cut.getDate() + 7);
    const ready = new Date(cut); ready.setDate(ready.getDate() + ((Number(S.readyDay) - cut.getDay() + 7) % 7 || 7));
    return { now, cut, ready, ms: cut - now };
  }
  const dfmt = (d, o) => d.toLocaleDateString('en-US', o);
  const tfmt = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined }).replace(':00', '');
  function left(ms) {
    const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
    if (d > 0) return t('left_days', { d, h }); if (h > 0) return t('left_hours', { h, m: mi }); return t('left_minutes', { m: Math.max(1, mi) });
  }
  function paintCutoff() {
    if (S.ordersPaused) return;
    const c = cutoffInfo();
    const cutTxt = dfmt(c.cut, { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + tfmt(c.cut);
    const readyTxt = dfmt(c.ready, { weekday: 'short', month: 'short', day: 'numeric' });
    $$('[data-cutoff-date]').forEach((el) => { el.textContent = cutTxt; });
    $$('[data-ready-date]').forEach((el) => { el.textContent = readyTxt; });
    $$('[data-cutoff-left]').forEach((el) => { el.textContent = left(c.ms); });
    $$('[data-day]').forEach((el) => { el.classList.toggle('is-today', el.dataset.day.split(',').map(Number).includes(c.now.getDay())); });
  }
  paintCutoff(); setInterval(paintCutoff, 30000);

  /* ---------- header + menu ---------- */
  const header = $('[data-header]');
  const setH = () => header && doc.style.setProperty('--header-h', header.offsetHeight + 'px');
  setH(); window.addEventListener('resize', setH, { passive: true });
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => { header && header.classList.toggle('is-scrolled', window.scrollY > 8); ticking = false; });
  }, { passive: true });
  const menu = $('[data-mobile-menu]'), menuBtn = $('[data-menu-toggle]');
  function closeMenu() { if (!menu || !menu.classList.contains('is-open')) return; menu.classList.remove('is-open'); menuBtn.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-hidden', 'true'); document.body.classList.remove('menu-open'); }
  if (menu && menuBtn) menuBtn.addEventListener('click', () => {
    const open = !menu.classList.contains('is-open');
    if (!open) return closeMenu();
    menu.classList.add('is-open'); menuBtn.setAttribute('aria-expanded', 'true'); menu.setAttribute('aria-hidden', 'false'); document.body.classList.add('menu-open');
  });
  $$('details[data-hover-menu]').forEach((d) => {
    document.addEventListener('click', (e) => { if (!d.contains(e.target)) d.removeAttribute('open'); });
  });

  /* ---------- facets ---------- */
  const sheet = $('[data-sheet]');
  function closeSheet() { if (!sheet || !sheet.classList.contains('is-open')) return; sheet.classList.remove('is-open'); overlay && overlay.classList.remove('is-open'); document.body.classList.remove('drawer-open'); }
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-sheet-open]') && sheet) { sheet.classList.add('is-open'); overlay && overlay.classList.add('is-open'); document.body.classList.add('drawer-open'); }
    if (e.target.closest('[data-sheet-close]') || (e.target === overlay && sheet && sheet.classList.contains('is-open'))) closeSheet();
  });
  $$('[data-facets]').forEach((f) => f.addEventListener('change', (e) => { if (e.target.matches('[data-autosubmit], [data-autosubmit] *')) f.requestSubmit ? f.requestSubmit() : f.submit(); }));
  $$('form[data-facets]').forEach((f) => f.addEventListener('submit', () => {
    $$('input, select', f).forEach((i) => { if ((i.type === 'number' || i.tagName === 'SELECT') && !i.value) i.disabled = true; });
  }));

  /* ---------- gallery dots ---------- */
  $$('[data-gallery]').forEach((g) => {
    const track = $('.gallery__track', g), dots = $$('.gallery__dots i', g); if (!dots.length) return;
    const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { const i = Number(en.target.dataset.index); dots.forEach((d, j) => d.classList.toggle('is-on', i === j)); } }), { root: track, threshold: 0.6 });
    $$('.gallery__item', g).forEach((it) => io.observe(it));
  });

  /* ---------- motion ---------- */
  function splitWords(el) {
    if (el.dataset.splitDone) return; el.dataset.splitDone = '1';
    let w = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const parts = n.textContent.split(/(\s+)/); const frag = document.createDocumentFragment();
          parts.forEach((p) => {
            if (!p) return; if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(' ')); return; }
            const o = document.createElement('span'); o.className = 'split-w'; const i = document.createElement('span'); i.textContent = p; i.style.setProperty('--w', w++); o.appendChild(i); frag.appendChild(o);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    };
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    walk(el);
    $$('.split-w', el).forEach((s) => s.setAttribute('aria-hidden', 'true'));
    el.classList.add('is-split');
  }
  let io;
  function observeReveals(root = document) {
    const els = $$('[data-reveal], [data-split]', root);
    if (reduce || !('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-in')); return; }
    if (!io) io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach((el) => {
      if (el.hasAttribute('data-split')) splitWords(el);
      const grp = el.closest('[data-stagger]');
      if (grp && !el.style.getPropertyValue('--d')) { const idx = $$('[data-reveal]', grp).indexOf(el); el.style.setProperty('--d', Math.min(idx, 8) * 80); }
      io.observe(el);
    });
    // failsafe: never leave content hidden
    setTimeout(() => els.forEach((el) => { const r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) el.classList.add('is-in'); }), 1800);
  }
  doc.classList.add('js');
  observeReveals();

  /* ---------- boot cart ---------- */
  Cart.refresh().catch(() => {});
  window.addEventListener('pageshow', (e) => { if (e.persisted) Cart.refresh().catch(() => {}); });
  document.addEventListener('shopify:section:load', (e) => { bindForms(e.target); observeReveals(e.target); paintCutoff(); });
})();
