/* Preview-only shim: a localStorage cart that speaks the same JSON as Shopify's AJAX Cart API,
   plus client-side stand-ins for things a static host can't do (filters, search, checkout, contact). */
(function () {
  var KEY = 'cf-preview-cart-v1';
  var cat = function () { return window.CF_CATALOG || {}; };
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || { lines: [], note: '' }; } catch (e) { return { lines: [], note: '' }; } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function build(s) {
    var items = s.lines.map(function (l) {
      var c = cat()[l.id] || {};
      return { key: l.id + ':preview', id: Number(l.id), variant_id: Number(l.id), product_id: c.product_id, quantity: l.qty, title: c.product_title, product_title: c.product_title,
        variant_title: c.variant_title, price: c.price, line_price: c.price * l.qty, final_line_price: c.price * l.qty, original_line_price: c.price * l.qty,
        image: c.image ? (c.image.indexOf('//') === 0 ? 'https:' + c.image : c.image) : null, url: c.url, product_has_only_default_variant: c.product_has_only_default_variant,
        options_with_values: c.options_with_values, properties: {} };
    });
    return { token: 'preview', note: s.note || null, attributes: {}, item_count: items.reduce(function (a, i) { return a + i.quantity; }, 0),
      total_price: items.reduce(function (a, i) { return a + i.final_line_price; }, 0), items: items, currency: 'USD', requires_shipping: false };
  }
  var delay = function (v) { return new Promise(function (r) { setTimeout(function () { r(v); }, 260); }); };
  window.CFTransport = {
    get: function () { return Promise.resolve(build(load())); },
    add: function (items) {
      var s = load();
      for (var i = 0; i < items.length; i++) {
        var it = items[i], c = cat()[it.id];
        if (!c || !c.available) return Promise.reject(new Error('This meal is not available right now.'));
        var l = s.lines.find(function (x) { return Number(x.id) === Number(it.id); });
        if (l) l.qty += Number(it.quantity || 1); else s.lines.push({ id: Number(it.id), qty: Number(it.quantity || 1) });
      }
      save(s); return delay({ items: items });
    },
    change: function (key, qty) {
      var s = load(), id = Number(String(key).split(':')[0]);
      s.lines = s.lines.map(function (l) { return Number(l.id) === id ? { id: l.id, qty: Number(qty) } : l; }).filter(function (l) { return l.qty > 0; });
      save(s); return delay(build(s));
    },
    update: function (d) { var s = load(); if ('note' in d) s.note = d.note; save(s); return Promise.resolve(build(s)); },
  };

  /* modal for things that need a real store */
  function modal(title, text) {
    var m = document.createElement('div');
    m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.style.cssText = 'position:fixed;inset:0;z-index:200;display:grid;place-items:center;padding:20px;background:rgba(14,15,11,.5)';
    m.innerHTML = '<div style="max-width:420px;width:100%;background:var(--c-paper);border-radius:24px;padding:26px;display:grid;gap:14px;box-shadow:0 30px 80px -20px rgba(0,0,0,.5)"><h2 class="h-3">' + title + '</h2><p class="muted">' + text + '</p><button type="button" class="btn btn--tomato">OK</button></div>';
    m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('button')) m.remove(); });
    document.body.appendChild(m); m.querySelector('button').focus();
  }
  document.addEventListener('click', function (e) {
    var c = e.target.closest('[data-checkout]');
    if (c) { e.preventDefault(); e.stopPropagation(); modal('Checkout goes to Shopify', 'This is a design preview. On casafrescameals.com this button takes the cart straight to Shopify checkout, with Shop Pay, pickup and delivery options as they are set up today.'); }
    var a = e.target.closest('a[href]');
    if (a && /\/cart\/add|\/account/.test(a.getAttribute('href') || '')) { e.preventDefault(); modal('Live store only', 'Accounts live on the real store.'); }
  }, true);
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.matches('[data-preview-form]')) {
      e.preventDefault();
      var msg = document.createElement('p'); msg.className = 'form-msg full'; msg.setAttribute('role', 'status');
      msg.textContent = 'Preview: on the live store this form emails the details to Casa Fresca through Shopify.';
      f.prepend(msg); msg.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    if (f.matches('form[action$="/cart"]') && !f.querySelector('[data-cart-note]:focus')) { e.preventDefault(); }
  }, true);

  /* static-host stand-ins for Shopify's server-side filters, sort and search */
  document.addEventListener('DOMContentLoaded', function () {
    var q = new URLSearchParams(location.search);
    var grid = document.querySelector('[data-grid]');
    var v = q.get('variant');
    if (v) { var r = document.querySelector('input[name="id"][value="' + v + '"]'); if (r && !r.disabled) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } }
    if (!grid) return;
    var cards = Array.prototype.slice.call(grid.children);
    var avail = q.getAll('filter.v.availability'), gte = parseFloat(q.get('filter.v.price.gte')), lte = parseFloat(q.get('filter.v.price.lte'));
    var sort = q.get('sort_by'), term = (q.get('q') || '').trim().toLowerCase();
    var show = cards.filter(function (c) {
      var ok = true, price = Number(c.dataset.price) / 100;
      if (avail.length) ok = ok && avail.indexOf(c.dataset.available === 'true' ? '1' : '0') > -1;
      if (!isNaN(gte)) ok = ok && price >= gte;
      if (!isNaN(lte)) ok = ok && price <= lte;
      if (document.querySelector('[data-search-form]')) ok = ok && !!term && c.dataset.title.toLowerCase().indexOf(term) > -1;
      return ok;
    });
    var cmp = { 'title-ascending': function (a, b) { return a.dataset.title.localeCompare(b.dataset.title); }, 'title-descending': function (a, b) { return b.dataset.title.localeCompare(a.dataset.title); },
      'price-ascending': function (a, b) { return a.dataset.price - b.dataset.price; }, 'price-descending': function (a, b) { return b.dataset.price - a.dataset.price; },
      'created-ascending': function (a, b) { return a.dataset.created - b.dataset.created; }, 'created-descending': function (a, b) { return b.dataset.created - a.dataset.created; } }[sort];
    if (cmp) show.sort(cmp);
    cards.forEach(function (c) { c.hidden = show.indexOf(c) < 0; });
    show.forEach(function (c) { grid.appendChild(c); });
    var n = show.length;
    document.querySelectorAll('.toolbar__count, .coll-count').forEach(function (el) { el.textContent = n + (n === 1 ? ' meal' : ' meals'); });
    var status = document.querySelector('[data-search-form] ~ [role=status]');
    if (status) { status.textContent = term ? n + (n === 1 ? ' result' : ' results') + ' for \u201c' + q.get('q') + '\u201d' : 'Type a meal or an ingredient to search.'; }
    var sel = document.querySelector('select[name="sort_by"]'); if (sel && sort) sel.value = sort;
    avail.forEach(function (a) { var cb = document.querySelector('input[name="filter.v.availability"][value="' + a + '"]'); if (cb) cb.checked = true; });
    if (!isNaN(gte)) { var mi = document.querySelector('input[name="filter.v.price.gte"]'); if (mi) mi.value = gte; }
    if (!isNaN(lte)) { var ma = document.querySelector('input[name="filter.v.price.lte"]'); if (ma) ma.value = lte; }
    var tab = document.querySelector('.toolbar a.tab');
    if (tab && avail.indexOf('1') > -1) { tab.setAttribute('aria-current', 'page'); tab.href = location.pathname + (sort ? '?sort_by=' + sort : ''); }
    var fb = document.querySelector('[data-sheet-open]');
    var active = avail.length + (!isNaN(gte) || !isNaN(lte) ? 1 : 0);
    if (fb && active) fb.lastChild.textContent = fb.lastChild.textContent.replace(/\s*\(\d+\)$/, '') + ' (' + active + ')';
  });
})();
