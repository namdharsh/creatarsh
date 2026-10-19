(function () {
  'use strict';
  const API_BASE = (window.CREATARSH_API_URL || '').replace(/\/$/, '');
  const apiUrl = path => `${API_BASE}${path}`;
  const state = { page: 1, limit: 9, q: '', category: '', city: '', pin: '', lat: null, lng: null, pages: 0, total: 0, sort: 'relevance' };
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase();
  const locationLabel = () => state.city || state.pin || (state.lat !== null ? 'Near your location' : 'All locations');
  function buildQuery() {
    const params = new URLSearchParams({ page: String(state.page), limit: String(state.limit) });
    for (const key of ['q', 'category', 'city', 'pin']) if (state[key]) params.set(key, state[key]);
    if (state.lat !== null && state.lng !== null) { params.set('lat', String(state.lat)); params.set('lng', String(state.lng)); }
    if (state.sort === 'name') params.set('sort', 'name');
    return params.toString();
  }
  async function fetchJson(url) {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    let data = {}; try { data = await response.json(); } catch (_) { /* safe generic error */ }
    if (!response.ok) throw new Error(data.message || `Request failed (${response.status}).`);
    return data;
  }
  function setState(kind, message, detail) {
    const panel = $('#resultsState'); if (!panel) return;
    panel.hidden = false;
    const spinner = kind === 'loading' ? '<span class="spinner" aria-hidden="true"></span>' : '';
    const action = kind === 'error' ? '<button type="button" class="state-action" id="retrySearch">Try again</button>' : '';
    panel.innerHTML = `${spinner}<strong>${esc(message)}</strong>${detail ? `<p>${esc(detail)}</p>` : ''}${action}`;
    if (kind === 'error') $('#retrySearch')?.addEventListener('click', loadBusinesses);
    $('#businessGrid').innerHTML = ''; $('#pagination').hidden = true;
  }
  function renderCategories(categories) {
    const list = $('#categoryList'); if (!list) return;
    if (!categories.length) { list.innerHTML = '<p class="category-loading">Categories will appear as businesses are published.</p>'; return; }
    const symbols = ['⌂', '✂', '✦', '▦', '✿', '◈', '⚙', '☕'];
    list.innerHTML = categories.map((category, i) => `<button class="category-chip" type="button" data-category="${esc(category)}" aria-pressed="${state.category === category}"><span class="category-symbol" aria-hidden="true">${symbols[i % symbols.length]}</span>${esc(category)}</button>`).join('');
    list.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
      state.category = state.category === button.dataset.category ? '' : button.dataset.category; state.page = 1;
      syncUrl(); renderSelectedCategory(); loadBusinesses();
    }));
    renderSelectedCategory();
  }
  function renderSelectedCategory() {
    document.querySelectorAll('[data-category]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === state.category)));
    const clear = $('#clearCategory'); if (clear) clear.hidden = !state.category;
  }
  function cardHtml(business) {
    const image = business.coverImage || business.logo;
    const imageHtml = image ? `<img src="${esc(image)}" alt="${esc(business.name)}" loading="lazy" decoding="async">` : `<span class="cover-placeholder" aria-hidden="true">${esc(initials(business.name))}</span>`;
    const place = [business.city, business.pinCode].filter(Boolean).join(' · ');
    return `<article class="business-card"><a href="/business/${encodeURIComponent(business.slug)}" aria-label="View ${esc(business.name)} business page"><div class="business-cover">${imageHtml}${business.verified ? '<span class="verified">✓ Verified</span>' : ''}</div><div class="business-card-body"><p class="business-category">${esc(business.category || 'Local business')}</p><h3>${esc(business.name)}</h3><p class="business-description">${esc(business.description || 'View this business profile for contact details and more information.')}</p><p class="business-location"><span aria-hidden="true">⌖</span>${esc(place || 'Location not provided')}</p></div><span class="card-link">View business <span aria-hidden="true">↗</span></span></a></article>`;
  }
  function renderPagination() {
    const nav = $('#pagination'); if (!nav) return;
    if (state.pages <= 1) { nav.hidden = true; return; }
    nav.hidden = false; const start = Math.max(1, Math.min(state.page - 2, state.pages - 4)); const end = Math.min(state.pages, start + 4);
    let html = `<button type="button" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''} aria-label="Previous page">←</button>`;
    for (let page = start; page <= end; page++) html += `<button type="button" data-page="${page}" ${page === state.page ? 'aria-current="page"' : ''} aria-label="Page ${page}">${page}</button>`;
    html += `<button type="button" data-page="${state.page + 1}" ${state.page === state.pages ? 'disabled' : ''} aria-label="Next page">→</button>`;
    nav.innerHTML = html; nav.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => {
      const page = Number(button.dataset.page); if (page < 1 || page > state.pages || page === state.page) return;
      state.page = page; syncUrl(); loadBusinesses(); document.querySelector('.results-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }
  async function loadBusinesses() {
    setState('loading', 'Finding local businesses…', 'Loading published listings from Creatarsh.');
    try {
      const data = await fetchJson(apiUrl(`/api/public/businesses?${buildQuery()}`));
      const businesses = Array.isArray(data.businesses) ? data.businesses : []; const pagination = data.pagination || {};
      state.total = Number(pagination.total || 0); state.pages = Number(pagination.pages || 0); state.page = Number(pagination.page || state.page);
      const title = $('#resultsTitle'); if (title) title.textContent = state.category ? `${state.category} businesses` : 'Businesses to discover';
      const summary = $('#resultsSummary'); if (summary) summary.textContent = `${state.total} published ${state.total === 1 ? 'listing' : 'listings'} · ${locationLabel()}`;
      if (!businesses.length) {
        setState('empty', state.q || state.category || state.city || state.pin || state.lat !== null ? 'No businesses found for these filters.' : 'Your local directory starts here.', state.q || state.category || state.city || state.pin || state.lat !== null ? 'Try another search, clear a category, or change your location.' : 'There are no published business listings yet. Check back soon or invite a local business to join Creatarsh.');
        $('#resultsState').insertAdjacentHTML('beforeend', '<a class="state-action" href="/studio#contact">List a business</a>'); return;
      }
      $('#resultsState').hidden = true; $('#businessGrid').innerHTML = businesses.map(cardHtml).join(''); renderPagination();
    } catch (error) { setState('error', 'We couldn’t load the directory.', error.message || 'Check your connection and try again.'); }
  }
  function syncUrl() {
    const params = new URLSearchParams(); for (const key of ['q', 'category', 'city', 'pin']) if (state[key]) params.set(key, state[key]);
    if (state.page > 1) params.set('page', String(state.page)); const query = params.toString(); history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}`);
  }
  function applyLocationStatus() {
    const status = $('#locationStatus'); if (!status) return;
    status.textContent = state.city ? `Showing businesses in ${state.city}` : state.pin ? `Showing businesses near PIN ${state.pin}` : state.lat !== null ? 'Showing businesses near your shared location' : 'Choose a location to find businesses nearby';
  }
  function initHome() {
    if (!$('#businessGrid')) return;
    const params = new URLSearchParams(location.search);
    state.q = (params.get('q') || '').slice(0, 100); state.category = (params.get('category') || '').slice(0, 80);
    state.city = (params.get('city') || '').slice(0, 80); state.pin = /^\d{6}$/.test(params.get('pin') || '') ? params.get('pin') : '';
    state.page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);
    $('#searchInput').value = state.q; $('#cityInput').value = state.city; $('#pinInput').value = state.pin;
    $('#searchForm').addEventListener('submit', event => { event.preventDefault(); state.q = $('#searchInput').value.trim().slice(0, 100); state.page = 1; syncUrl(); loadBusinesses(); });
    $('#manualLocationToggle').addEventListener('click', () => { const form = $('#manualLocation'); form.hidden = !form.hidden; if (!form.hidden) $('#cityInput').focus(); });
    $('#manualLocation').addEventListener('submit', event => {
      event.preventDefault(); const city = $('#cityInput').value.trim().slice(0, 80); const pin = $('#pinInput').value.trim();
      if (pin && !/^\d{6}$/.test(pin)) { $('#pinInput').setCustomValidity('Enter a valid 6-digit PIN code.'); $('#pinInput').reportValidity(); return; }
      $('#pinInput').setCustomValidity(''); state.city = city; state.pin = pin; state.lat = null; state.lng = null; state.page = 1; applyLocationStatus(); syncUrl(); loadBusinesses();
    });
    $('#clearLocation').addEventListener('click', () => { state.city = ''; state.pin = ''; state.lat = null; state.lng = null; $('#cityInput').value = ''; $('#pinInput').value = ''; applyLocationStatus(); syncUrl(); loadBusinesses(); });
    $('#useLocation').addEventListener('click', () => {
      const status = $('#locationStatus'); if (!navigator.geolocation) { status.textContent = 'Location is not supported by this browser. Enter a city or PIN instead.'; $('#manualLocation').hidden = false; return; }
      status.textContent = 'Waiting for your location permission…';
      navigator.geolocation.getCurrentPosition(position => {
        state.lat = Number(position.coords.latitude.toFixed(5)); state.lng = Number(position.coords.longitude.toFixed(5)); state.city = ''; state.pin = ''; state.page = 1;
        $('#cityInput').value = ''; $('#pinInput').value = ''; applyLocationStatus(); syncUrl(); loadBusinesses();
      }, error => { status.textContent = error.code === 1 ? 'Location permission was not granted. You can enter a city or PIN instead.' : 'Could not determine your location. Try entering a city or PIN.'; $('#manualLocation').hidden = false; }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    });
    $('#clearCategory').addEventListener('click', () => { state.category = ''; state.page = 1; syncUrl(); renderSelectedCategory(); loadBusinesses(); });
    $('#sortSelect').addEventListener('change', () => { state.sort = $('#sortSelect').value; loadBusinesses(); });
    const menu = $('#mobileMenu'); menu?.addEventListener('click', () => { const nav = document.querySelector('.topbar nav'); const expanded = menu.getAttribute('aria-expanded') === 'true'; menu.setAttribute('aria-expanded', String(!expanded)); nav.classList.toggle('open', !expanded); });
    applyLocationStatus();
    fetchJson(apiUrl('/api/public/business-categories')).then(data => renderCategories(Array.isArray(data.categories) ? data.categories : [])).catch(() => { $('#categoryList').innerHTML = '<p class="category-loading">Categories are temporarily unavailable. Please try again shortly.</p>'; });
    loadBusinesses();
  }
  async function initBusinessPage() {
    const page = $('#businessPage'); if (!page) return;
    try {
      const data = await fetchJson(apiUrl(`/api/public/businesses/${encodeURIComponent(page.dataset.slug)}`)); const b = data.business;
      if (!b) throw new Error('Business not found.'); const image = b.coverImage || b.logo;
      const cover = image ? `<img src="${esc(image)}" alt="${esc(b.name)}">` : `<span class="cover-placeholder" aria-hidden="true">${esc(initials(b.name))}</span>`;
      const place = [b.address, b.city, b.pinCode].filter(Boolean).join(', '); const phone = String(b.phone || '').replace(/[^+\d]/g, ''); const website = safeWebsiteUrl(b.websiteUrl);
      $('#businessDetail').innerHTML = `<div class="business-detail-cover">${cover}</div><div class="business-detail-grid"><div class="business-detail-main"><p class="business-category">${esc(b.category || 'Local business')}${b.verified ? ' · VERIFIED' : ''}</p><h1>${esc(b.name)}</h1><p>${esc(b.description || 'More information about this business will be added soon.')}</p><h2>Location</h2><p>${esc(place || 'Location not provided')}</p>${website ? `<p><a class="text-button" data-track="CONTACT_CLICK" href="${esc(website)}" rel="noopener noreferrer" target="_blank">Visit website ↗</a></p>` : ''}<h2>Send an enquiry</h2><form id="businessEnquiryForm" class="business-enquiry-form"><label>Your name<input name="name" required maxlength="120"></label><label>Email (optional)<input name="email" type="email" maxlength="254"></label><label>Phone (optional)<input name="phone" maxlength="40"></label><label>Message<textarea name="message" required maxlength="3000"></textarea></label><button type="submit">Send enquiry</button><p id="enquiryStatus" role="status"></p></form></div><aside class="business-contact"><h2>Contact business</h2>${place ? `<p class="contact-line">⌖ ${esc(place)}</p>` : ''}${b.phone ? `<p class="contact-line">☎ ${esc(b.phone)}</p>` : ''}${phone ? `<a class="contact-button" data-track="CONTACT_CLICK" href="tel:${esc(phone)}">Call business</a>` : ''}${b.whatsapp ? `<a class="contact-button" data-track="WHATSAPP_CLICK" href="https://wa.me/${esc(String(b.whatsapp).replace(/[^0-9]/g,''))}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ''}${place ? `<a class="contact-button" data-track="DIRECTIONS_CLICK" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}" target="_blank" rel="noopener noreferrer">Get directions ↗</a>` : ''}${website ? `<a class="contact-button" data-track="CONTACT_CLICK" href="${esc(website)}" rel="noopener noreferrer" target="_blank">Visit website ↗</a>` : ''}</aside></div>`;
      $('#businessDetailState').hidden = true; $('#businessDetail').hidden = false;
      trackBusinessEvent(page.dataset.slug, 'PAGE_VIEW');
      document.querySelectorAll('[data-track]').forEach(a=>a.addEventListener('click',()=>trackBusinessEvent(page.dataset.slug,a.dataset.track)));
      $('#businessEnquiryForm')?.addEventListener('submit', async event=>{event.preventDefault();const form=event.currentTarget;const payload=Object.fromEntries(new FormData(form));payload.slug=page.dataset.slug;payload.pagePath=location.pathname;const status=$('#enquiryStatus');try{const response=await fetch(apiUrl('/api/public/business-enquiries'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw new Error(result.message||'Could not send enquiry.');status.textContent='Thank you. Your enquiry was sent.';form.reset();}catch(error){status.textContent=error.message;}});
    } catch (error) { $('#businessDetailState').innerHTML = `<strong>${esc(error.message || 'Business details are unavailable.')}</strong><p>This listing may have been removed or is temporarily unavailable.</p><a class="state-action" href="/">Back to discovery</a>`; }
  }
  function trackBusinessEvent(slug,event){try{let session=sessionStorage.getItem('cr_analytics_session');if(!session){session=(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`);sessionStorage.setItem('cr_analytics_session',session)}fetch(apiUrl('/api/public/business-events'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug,event,pagePath:location.pathname,referrer:document.referrer,session})}).catch(()=>{});}catch(_){}}
  function safeWebsiteUrl(value) { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch (_) { return ''; } }
  document.addEventListener('DOMContentLoaded', () => { const year = $('#year'); if (year) year.textContent = new Date().getFullYear(); initHome(); initBusinessPage(); });
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildQuery, safeWebsiteUrl, initials };
})();
