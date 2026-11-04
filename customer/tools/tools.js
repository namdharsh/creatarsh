(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const search = $('toolSearch');
  const grid = $('toolsGrid');
  const filters = [...document.querySelectorAll('.filter-chip')];
  const count = $('resultCount');
  const empty = $('emptyState');
  const error = $('toolsError');
  const year = $('year');
  const meta = $('toolCountMeta');
  if (year) year.textContent = new Date().getFullYear();
  let tools = [];
  let category = 'all';

  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[ch]));
  const safeInternalPath = value => {
    const path = String(value || '').trim();
    return path.startsWith('/tools/') && !path.startsWith('//') &&
      !path.includes('\\') && !path.split('/').includes('..') &&
      !/[\r\n]/.test(path) ? path : '';
  };
  function render() {
    const term = (search?.value || '').trim().toLowerCase();
    const visible = tools.filter(tool => {
      const matchesText = [tool.title, tool.category, tool.description, tool.audience]
        .join(' ').toLowerCase().includes(term);
      const key = String(tool.category || '').toLowerCase();
      const matchesCategory = category === 'all' || key.includes(category);
      return matchesText && matchesCategory && safeInternalPath(tool.url);
    });
    grid.innerHTML = visible.map((tool, index) => `
      <article class="tool-card ${index === 0 ? 'tool-card-featured' : ''}">
        <div class="tool-card-top">
          <span class="tool-icon">${escapeHTML(tool.icon || '✦')}</span>
          <span class="tool-badge">${escapeHTML(tool.badge || 'AVAILABLE NOW')}</span>
          <span class="tool-arrow" aria-hidden="true">↗</span>
        </div>
        <div class="tool-card-body">
          <span class="tool-category">${escapeHTML(tool.category || 'DIGITAL TOOL')}</span>
          <h3>${escapeHTML(tool.title)}</h3>
          <p>${escapeHTML(tool.description)}</p>
          ${tool.audience ? `<span class="tool-audience">${escapeHTML(tool.audience)}</span>` : ''}
          <div class="tool-card-footer">
            <span>CREATARSH DIGITAL TOOLS</span>
            <a class="tool-try-button" href="${escapeHTML(safeInternalPath(tool.url))}">${escapeHTML(tool.buttonText || 'Try now')} <span aria-hidden="true">→</span></a>
          </div>
        </div>
      </article>`).join('');
    if (count) count.textContent = `${visible.length} ${visible.length === 1 ? 'tool' : 'tools'} ${term || category !== 'all' ? 'found' : 'available'}.`;
    if (empty) empty.hidden = visible.length !== 0;
    if (meta) meta.textContent = `${tools.length} ${tools.length === 1 ? 'tool' : 'tools'} in the collection`;
  }
  async function load() {
    if (error) error.hidden = true;
    if (grid) grid.innerHTML = '<div class="tool-loading" aria-label="Loading tools"><span></span><span></span><span></span></div>';
    try {
      const response = await fetch('/api/public/tools', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Tools are temporarily unavailable.');
      tools = Array.isArray(data.tools) ? data.tools.filter(t => t && safeInternalPath(t.url)) : [];
      render();
    } catch (err) {
      if (grid) grid.innerHTML = '';
      if (count) count.textContent = 'The catalogue could not be loaded.';
      if (error) error.hidden = false;
      if (empty) empty.hidden = true;
    }
  }
  search?.addEventListener('input', render);
  filters.forEach(button => button.addEventListener('click', () => {
    category = button.dataset.category || 'all';
    filters.forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    render();
  }));
  $('retryTools')?.addEventListener('click', load);
  load();
})();