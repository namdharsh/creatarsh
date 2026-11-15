(() => {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const opened = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(opened));
      toggle.setAttribute('aria-label', opened ? 'Close navigation' : 'Open navigation');
      toggle.textContent = opened ? '×' : '☰';
    });
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = '☰';
    }));
  }

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const form = document.getElementById('contactForm');
  const message = document.getElementById('formMessage');
  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.projectType = 'Corporate enquiry';
      button.disabled = true;
      button.textContent = 'Sending…';
      message.textContent = '';
      try {
        const response = await fetch('/api/public/leads', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || 'We could not send your enquiry. Please try again.');
        form.reset();
        message.textContent = `Thank you. Your enquiry reference is ${result.enquiryId || 'received'}.`;
      } catch (error) {
        message.textContent = error.message || 'Something went wrong. Please email us instead.';
      } finally {
        button.disabled = false;
        button.innerHTML = 'Send enquiry <span>↗</span>';
      }
    });
  }
})();