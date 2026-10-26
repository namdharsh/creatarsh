(() => {
  const search = document.getElementById('toolSearch');
  const cards = [...document.querySelectorAll('.tool-card')];
  const filters = [...document.querySelectorAll('.filter-chip')];
  const count = document.getElementById('resultCount');
  const empty = document.getElementById('emptyState');
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
  let category = 'all';
  function update() {
    const term = (search?.value || '').trim().toLowerCase();
    let visible = 0;
    cards.forEach(card => {
      const matchesText = (card.dataset.title + ' ' + card.textContent).toLowerCase().includes(term);
      const matchesCategory = category === 'all' || card.dataset.category === category;
      const show = matchesText && matchesCategory;
      card.hidden = !show;
      if (show) visible++;
    });
    if (count) count.textContent = `${visible} ${visible === 1 ? 'tool' : 'tools'} ${term || category !== 'all' ? 'found' : 'in the toolbox'}.`;
    if (empty) empty.hidden = visible !== 0;
  }
  search?.addEventListener('input', update);
  filters.forEach(button => button.addEventListener('click', () => {
    category = button.dataset.category;
    filters.forEach(item => item.classList.toggle('active', item === button));
    update();
  }));
  update();
})();
