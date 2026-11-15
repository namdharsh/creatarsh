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


  // Public CMS hydration: homepage content is managed from the authenticated Manager workspace.
  const safeUrl = value => { try { const u = new URL(value, location.origin); return ['http:','https:'].includes(u.protocol) ? u.href : '#'; } catch { return '#'; } };
  const setText = (selector, value) => { const el=document.querySelector(selector); if(el && typeof value==='string' && value.trim()) el.textContent=value; };
  const renderCollection = (selector, items, renderer) => { const el=document.querySelector(selector); if(el && Array.isArray(items) && items.length) el.innerHTML=items.map(renderer).join(''); };
  fetch('/api/public/content').then(r=>r.ok?r.json():null).then(data=>{
    const s=data?.site; if(!s)return;
    if(s.seo?.title)document.title=s.seo.title;
    if(s.seo?.description){const meta=document.querySelector('meta[name="description"]');if(meta)meta.content=s.seo.description;}
    if(s.logoUrl){document.querySelectorAll('.brand-logo,.art-core img,.roadmap-center img').forEach(img=>img.src=safeUrl(s.logoUrl));}
    const hero=document.querySelector('.hero h1');if(hero&&s.heroTitle){const parts=s.heroTitle.split('\n');hero.innerHTML=parts.map((x,i)=>i===parts.length-1?`<em>${x.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</em>`:x.replace(/[&<>"']/g,'')).join('<br>');}
    setText('.hero-description',s.heroText);setText('.hero .eyebrow',s.heroEyebrow);setText('.intro-content .body-copy',s.aboutText);setText('.ecosystem .section-heading h2',s.ecosystemTitle);setText('.ecosystem .section-note',s.ecosystemText);setText('.capabilities .section-heading h2',s.capabilitiesTitle);setText('.capabilities .section-note',s.capabilitiesText);setText('.roadmap-heading h2',s.roadmapTitle);setText('.roadmap-heading>p:last-child',s.roadmapText);setText('.principles-inner>div:first-child h2',s.principlesTitle);setText('.contact-panel h2',s.contactTitle);setText('.contact-copy',s.contactText);setText('.footer-description',s.footerText);
    renderCollection('.division-grid',s.divisions,(x,i)=>`<a class="division-card" href="${safeUrl(x.url||'#')}" rel="noopener"><span class="division-no">${String(i+1).padStart(2,'0')}</span><span class="division-icon">${String(x.icon||'✦').slice(0,8)}</span><h3>${String(x.name||'').replace(/[&<>]/g,'')}</h3><p>${String(x.description||'').replace(/[&<>]/g,'')}</p><span class="division-foot">${String(x.slug||x.name||'').toUpperCase()} <b>↗</b></span></a>`);
    renderCollection('.product-list',s.products,(x,i)=>`<article class="product-row"><div class="product-number">${String(i+1).padStart(2,'0')}</div><div class="product-main"><span class="product-category">${String(x.category||'PRODUCT').replace(/[&<>]/g,'')}</span><h3>${String(x.name||'').replace(/[&<>]/g,'')}</h3><p>${String(x.description||'').replace(/[&<>]/g,'')}</p></div><span class="status status-progress">${String(x.status||'In progress').replace(/[&<>]/g,'')}</span></article>`);
    renderCollection('.capability-grid',s.capabilities,(x)=>`<article class="capability-card cap-${String(x.tone||'violet').replace(/[^a-z-]/g,'')}"><span class="cap-kicker">${String(x.tag||'EXPLORE').replace(/[&<>]/g,'')}</span><div class="cap-graphic"><b>${String(x.icon||'✦').replace(/[&<>]/g,'')}</b><i></i><i></i><i></i></div><h3>${String(x.title||'').replace(/[&<>]/g,'')}</h3><p>${String(x.description||'').replace(/[&<>]/g,'')}</p><span class="cap-link">EXPLORE / BUILD / EVOLVE</span></article>`);
    renderCollection('.principle-list',s.principles,(x,i)=>`<div><span>${String(i+1).padStart(2,'0')}</span><section><h3>${String(x.title||'').replace(/[&<>]/g,'')}</h3><p>${String(x.description||'').replace(/[&<>]/g,'')}</p></section></div>`);
    if(s.productsTitle)setText('.products .section-heading h2',s.productsTitle);if(s.productsText)setText('.products .section-note',s.productsText);if(s.valueIntro)setText('.intro-content h2',s.valueIntro);
    const theme=s.theme||{};const rootStyle=document.documentElement.style;for(const [k,v] of Object.entries({ '--cms-accent':theme.accent,'--cms-secondary':theme.secondary,'--cms-glass':theme.surface,'--cms-background':theme.background,'--cms-text':theme.text }))if(typeof v==='string')rootStyle.setProperty(k,v);if(Number.isFinite(Number(theme.glassBlur)))rootStyle.setProperty('--cms-blur',`${Math.max(0,Math.min(40,Number(theme.glassBlur)))}px`);
    for(const [key,visible] of Object.entries(s.sectionVisibility||{})){const section=document.getElementById(key)||document.querySelector(`[data-cms-section="${key}"]`)||document.querySelector(`.${key}-section`);if(section)section.hidden=visible===false;}
    if(s.navigation?.length){const nav=document.querySelector('.nav');if(nav)nav.innerHTML=s.navigation.map(n=>`<a href="${safeUrl(n.url||'#')}">${String(n.label||'').replace(/[&<>]/g,'')}</a>`).join('');}
    if(s.email){document.querySelectorAll('a[href^="mailto:"]').forEach(a=>a.href=`mailto:${s.email}`)}
  }).catch(()=>{});

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