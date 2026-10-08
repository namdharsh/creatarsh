const configuredApi=(window.CREATARSH_API_URL||'').replace(/\/$/,'');
const sameOriginApi=location.origin.replace(/\/$/,'');
// The customer site may be hosted separately from the Express API (for example
// Vercel/GitHub Pages + Render). Prefer an explicit API URL, then same-origin,
// then the default Render API used by the Creatarsh deployment.
const API_CANDIDATES=[
  configuredApi,
  sameOriginApi,
  'https://creatarsh.onrender.com',
  'https://creatarsh-api.onrender.com'
].filter((v,i,a)=>v && a.indexOf(v)===i).map(v=>v.endsWith('/api')?v:v+'/api');
let activeApiBase=API_CANDIDATES[0]||'/api';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const slugifyClient=v=>String(v||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const token=()=>localStorage.getItem('cr_customer_token');
const customer=()=>{try{return JSON.parse(localStorage.getItem('cr_customer')||'null')}catch{return null}};
const save=(d)=>{localStorage.setItem('cr_customer_token',d.token);localStorage.setItem('cr_customer',JSON.stringify(d.customer));};
const logout=()=>{localStorage.removeItem('cr_customer_token');localStorage.removeItem('cr_customer');location.href='/login';};
async function api(path,opt={}){
  const h={'Content-Type':'application/json',...(opt.headers||{})};
  if(token())h.Authorization='Bearer '+token();
  let lastError=null;
  const candidates=[activeApiBase,...API_CANDIDATES.filter(x=>x!==activeApiBase)];
  for(const base of candidates){
    try{
      const r=await fetch(base+path,{...opt,headers:h});
      let d={}; try{d=await r.json()}catch{}
      // A 404 from a static host means the API is not hosted there. Try the
      // configured/Render backend before surfacing the error to the customer.
      // Some static hosts return the SPA/HTML shell with HTTP 200 for unknown
      // /api routes. Treat a successful response without JSON as an API miss and
      // continue to the next configured backend instead of reporting an
      // "incomplete authentication response" to the customer.
      const contentType=(r.headers.get('content-type')||'').toLowerCase();
      if(!contentType.includes('application/json')){
        lastError=new Error('API endpoint returned a non-JSON response');
        continue;
      }
      if(r.status===404 && candidates.length>1 && base!==candidates[candidates.length-1]){lastError=new Error(d.message||'API route not found');continue;}
      if(!r.ok){const e=new Error(d.message||`Request failed (${r.status})`);e.status=r.status;throw e}
      activeApiBase=base;
      return d;
    }catch(e){
      lastError=e;
      if(e.name==='TypeError' || e.message==='Failed to fetch') continue;
      if(e.status===404 && base!==candidates[candidates.length-1]) continue;
      throw e;
    }
  }
  throw lastError||new Error('Creatarsh API is unavailable.');
}
function nav(){
  const c=customer();
  const account=$('#accountLink');
  if(account){account.textContent=c?'My Account':'Client Login';account.href=c?'/account':'/login';account.classList.toggle('active',location.pathname.includes('account')||location.pathname.includes('login'));}
  const navInner=$('.nav-inner'), links=$('.links');
  if(navInner && links && !$('.mobile-menu-toggle')){
    const toggle=document.createElement('button'); toggle.type='button'; toggle.className='mobile-menu-toggle'; toggle.setAttribute('aria-label','Open navigation'); toggle.setAttribute('aria-expanded','false'); toggle.textContent='☰';
    const menu=document.createElement('div'); menu.className='mobile-menu'; menu.innerHTML=links.innerHTML;
    navInner.append(toggle); navInner.parentElement.append(menu);
    toggle.onclick=()=>{const open=menu.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'×':'☰';};
  }
}
function shell(){nav();const y=$('#year');if(y)y.textContent=new Date().getFullYear();}
async function content(){
  return await api('/public/content');
}
function renderBanners(d){
  const slider=$('#bannerSlider'),track=$('#bannerTrack'),dots=$('#bannerDots');
  if(!slider||!track||!dots)return;
  const banners=(d.banners||[]).filter(x=>x.active!==false).sort((a,b)=>(a.order||0)-(b.order||0));
  if(!banners.length){slider.parentElement.parentElement.style.display='none';return;}

  const slideHtml=(x,i)=>`<article class="banner-slide" data-index="${i}">
    ${x.image?`<img class="banner-media" src="${esc(String(x.image).trim())}" alt="${esc(x.title||'Featured banner')}" loading="${i===0?'eager':'lazy'}" referrerpolicy="no-referrer">`:''}
    <div class="banner-overlay" aria-hidden="true"></div>
    <div class="banner-content">${x.eyebrow?`<span class="eyebrow">${esc(x.eyebrow)}</span>`:''}${x.title?`<h2>${esc(x.title)}</h2>`:''}${x.text?`<p>${esc(x.text)}</p>`:''}${x.ctaText?`<a class="btn primary" href="${esc(x.ctaUrl||'/contact')}">${esc(x.ctaText)} ↗</a>`:''}</div>
  </article>`;

  // Clone the first/last banner so moving from the last banner back to the first
  // is visually seamless instead of jumping backwards.
  const looped=banners.length>1?[banners[banners.length-1],...banners,banners[0]]:banners;
  track.innerHTML=looped.map((x,i)=>slideHtml(x,i)).join('');
  dots.innerHTML=banners.map((_,i)=>`<button type="button" class="banner-dot${i===0?' active':''}" data-banner="${i}" aria-label="Go to banner ${i+1}"></button>`).join('');

  let physicalIndex=banners.length>1?1:0;
  let timer;
  let moving=false;

  const updateDots=()=>$$('.banner-dot').forEach((b,n)=>b.classList.toggle('active',n===((physicalIndex-1+banners.length)%banners.length)));
  const apply=animate=>{
    track.style.transition=animate?'transform .65s cubic-bezier(.22,.61,.36,1)':'none';
    track.style.transform=`translate3d(-${physicalIndex*100}%,0,0)`;
    updateDots();
  };
  const go=i=>{
    if(banners.length===1)return;
    physicalIndex=i+1;
    moving=true;
    apply(true);
  };
  const start=()=>{clearInterval(timer);if(banners.length>1)timer=setInterval(()=>go((physicalIndex-1+banners.length+1)%banners.length),3000)};

  track.addEventListener('transitionend',e=>{
    if(e.propertyName!=='transform'||!moving||banners.length<2)return;
    moving=false;
    if(physicalIndex===0){physicalIndex=banners.length;apply(false)}
    else if(physicalIndex===banners.length+1){physicalIndex=1;apply(false)}
  });

  slider.querySelector('.banner-prev').onclick=()=>{go((physicalIndex-2+banners.length)%banners.length);start()};
  slider.querySelector('.banner-next').onclick=()=>{go((physicalIndex+banners.length)%banners.length);start()};
  $$('.banner-dot').forEach(b=>b.onclick=()=>{go(Number(b.dataset.banner));start()});
  slider.addEventListener('mouseenter',()=>clearInterval(timer));
  slider.addEventListener('mouseleave',start);
  slider.addEventListener('touchstart',()=>clearInterval(timer),{passive:true});
  slider.addEventListener('touchend',start,{passive:true});

  apply(false);
  start();
}
function renderHome(d){const s=d.site||{};if($('.hero-title')&&s.heroTitle) $('.hero-title').innerHTML=esc(s.heroTitle).replace(/\n/g,'<br>');if($('.hero-text')&&s.heroText)$('.hero-text').textContent=s.heroText;const services=$('#serviceGrid');if(services)services.innerHTML=(d.services||[]).slice(0,6).map(x=>`<article class="card service-card"><a class="service-link" href="/service/${encodeURIComponent(x.slug||slugifyClient(x.title))}"><div class="icon">${esc(x.icon||'✦')}</div><h3>${esc(x.title)}</h3><p>${esc(x.description)}</p><div class="price">${x.startingPrice?'Starting ₹'+Number(x.startingPrice).toLocaleString('en-IN'):''}</div><span class="service-more">Explore service ↗</span></a></article>`).join('')||'<div class="empty">Services will appear here.</div>';const work=$('#workGrid');if(work)work.innerHTML=(d.portfolio||[]).slice(0,4).map(x=>`<article class="card work-card"><div class="work-media">${x.media?.[0]?`<img src="${esc(x.media[0])}" alt="${esc(x.title)}" style="width:100%;height:100%;object-fit:cover">`:'CREATARSH'}</div><div class="work-body"><span class="tag">${esc(x.category||'Project')}</span><h3>${esc(x.title)}</h3><p>${esc(x.description||'')}</p></div></article>`).join('')||'<div class="empty">Portfolio projects will appear here.</div>';const testimonials=$('#testimonialGrid');if(testimonials)testimonials.innerHTML=(d.testimonials||[]).slice(0,3).map(x=>`<article class="card"><div class="quote">“${esc(x.quote||'Great experience.') }”</div><p style="margin-top:20px">${esc(x.name)} · ${esc(x.company||'Client')}</p></article>`).join('')||'<div class="empty">Client stories will appear here.</div>';}
function renderServices(d){const el=$('#allServices');if(!el)return;const serviceCards=(d.services||[]).map(x=>`<article class="card service-card"><a class="service-link" href="/service/${encodeURIComponent(x.slug||slugifyClient(x.title))}"><div class="icon">${esc(x.icon||'✦')}</div><h3>${esc(x.title)}</h3><p>${esc(x.description)}</p><div class="price">${x.startingPrice?'From ₹'+Number(x.startingPrice).toLocaleString('en-IN'):''} ${x.timeline?' · '+esc(x.timeline):''}</div>${x.features?.length?`<ul class="muted">${x.features.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>`:''}<span class="service-more">Explore pricing, work & packages ↗</span></a></article>`).join('');el.innerHTML=serviceCards||'<div class="empty">No services published yet.</div>'}
function renderWork(d){const el=$('#allWork');if(!el)return;el.innerHTML=(d.portfolio||[]).map(x=>{const slug=slugifyClient(x.title);return `<article class="card work-card"><a href="/portfolio/${encodeURIComponent(slug)}" style="display:block;height:100%"><div class="work-media">${x.media?.[0]?`<img src="${esc(x.media[0])}" alt="${esc(x.title)}" style="width:100%;height:100%;object-fit:cover">`:'CREATARSH'}</div><div class="work-body"><span class="tag">${esc(x.category||'Project')}</span><h3>${esc(x.title)}</h3><p>${esc(x.description||'')}</p>${x.technologies?.length?`<p class="muted" style="margin-top:12px">${x.technologies.map(esc).join(' · ')}</p>`:''}<span class="service-more">View project ↗</span></div></a></article>`}).join('')||'<div class="empty">No portfolio projects published yet.</div>'}
function renderFaq(d){const el=$('#faqList');if(!el)return;const fallback=[['What services does Creatarsh provide?','Creatarsh provides website and web app development, mobile apps, custom business software, e-commerce, UI/UX, branding, AI-enabled solutions and related digital services.'],['How do I start a project?','Use the Start a Project or Contact page and submit your requirements. We review the brief and discuss scope, pricing, timeline and the next steps.'],['Are online prices final?','Some displayed prices are starting packages. Custom requirements, third-party services, taxes and additional scope may change the final quotation.'],['How do payments work?','Payment milestones and due dates are stated in the applicable quotation, invoice or project agreement. Work may be paused when a payment becomes overdue.'],['Can I request a refund?','You can request a refund or cancellation by contacting support with your order or invoice details. Eligibility is handled under the Refund & Cancellation Policy and applicable agreement.'],['How many revisions are included?','Revision limits depend on the selected package or signed agreement. Changes outside the agreed scope may require an additional fee.'],['How do I get technical support?','Email creatarshbusiness@gmail.com or call +91 7566743098. Include your order, project or invoice reference and a clear description of the issue.'],['How can I make a privacy request?','Contact creatarshbusiness@gmail.com. We may verify your identity before processing an access, correction, deletion or other privacy request.'],['How do I submit a grievance?','If normal support has not resolved your concern, use the Grievance Redressal page or email creatarshbusiness@gmail.com with your previous support details and requested resolution.'],['Do third-party services cost extra?','Domains, hosting, payment gateways, app stores, APIs, premium assets and other third-party services may have separate charges unless your quotation expressly includes them.']];const rows=(d.faqs&&d.faqs.length?d.faqs:fallback);el.innerHTML=rows.map(x=>`<details><summary>${esc(x.question||x[0])} <span>+</span></summary><p>${esc(x.answer||x[1])}</p></details>`).join('')}
function setupLead(){const f=$('#leadForm');if(!f)return;const c=customer();['name','email','whatsapp','company'].forEach(k=>{if(c&&f.elements[k])f.elements[k].value=c[k]||''});f.onsubmit=async e=>{e.preventDefault();const st=$('#formStatus'),b=f.querySelector('button[type=submit]');b.disabled=true;st.textContent='Sending…';try{const d=await api('/public/leads',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(f)))});st.textContent=`Received · Enquiry ${d.enquiryId}`;f.reset()}catch(e){st.textContent=e.message}finally{b.disabled=false}}}
function initAccountAuthModal(){
  const modal=$('#clientAuthModal');
  if(!modal) return;
  const form=$('#clientAuthForm'), status=$('#clientAuthStatus'), title=$('#clientAuthTitle'), subtitle=$('#clientAuthSubtitle');
  if(!form||!status||!title||!subtitle) return;
  let mode='login';
  const render=()=>{
    $$('[data-auth-mode]').forEach(b=>b.classList.toggle('active',b.dataset.authMode===mode));
    title.textContent=mode==='login'?'Welcome back.':'Create your client account.';
    subtitle.textContent=mode==='login'?'Sign in to manage your projects, orders, invoices and payments.':'Create an account to manage your Creatarsh projects in one place.';
    form.innerHTML=mode==='login'
      ? '<div class="field"><label for="authEmail">Email</label><input id="authEmail" name="email" type="email" required autocomplete="email" placeholder="you@company.com"></div><div class="field"><label for="authPassword">Password</label><input id="authPassword" name="password" type="password" required autocomplete="current-password" placeholder="Your password"></div><button class="btn primary" type="submit" style="width:100%">Sign in ↗</button>'
      : '<div class="form-grid"><div class="field"><label>Name</label><input name="name" required autocomplete="name" placeholder="Your name"></div><div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email" placeholder="you@company.com"></div><div class="field"><label>Phone</label><input name="phone" autocomplete="tel" placeholder="+91"></div><div class="field"><label>Business</label><input name="company" autocomplete="organization" placeholder="Business name"></div><div class="field full"><label>Password</label><input name="password" type="password" minlength="8" required autocomplete="new-password" placeholder="Minimum 8 characters"></div></div><button class="btn primary" type="submit" style="width:100%">Create account ↗</button>';
    status.textContent=''; status.className='form-help';
  };
  const open=(next='login')=>{mode=next;render();modal.hidden=false;modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';setTimeout(()=>form.querySelector('input')?.focus(),30)};
  const close=()=>{modal.hidden=true;modal.setAttribute('aria-hidden','true');document.body.style.overflow='';};
  window.openClientLogin=()=>open('login');
  window.openClientRegister=()=>open('register');
  modal.querySelectorAll('[data-close-auth]').forEach(x=>x.onclick=close);
  modal.querySelectorAll('[data-auth-mode]').forEach(b=>b.onclick=()=>open(b.dataset.authMode));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)close();});
  // Delegation is intentional: account() creates the Client Login link dynamically.
  document.addEventListener('click',e=>{
    const a=e.target.closest?.('a[href="/login"]');
    if(a && document.body.dataset.page==='account'){e.preventDefault();open('login');}
  });
  form.onsubmit=async e=>{
    e.preventDefault();
    if(!form.reportValidity()) return;
    const btn=form.querySelector('button[type=submit]');
    btn.disabled=true;
    status.textContent=mode==='login'?'Signing in…':'Creating account…';
    status.className='form-help';
    try{
      const data=await api('/customer/'+mode,{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});
      const auth=normalizeAuthResponse(data);
      if(!auth) throw new Error('The server returned an incomplete authentication response.');
      save(auth);
      status.textContent='Success. Opening your account…';
      status.className='form-help success';
      close();
      window.location.replace('/account');
    }catch(err){
      status.textContent=err.message||'Unable to complete the request. Please try again.';
      status.className='form-help error';
    }finally{btn.disabled=false;}
  };
  render();
}
function normalizeAuthResponse(data){
  if(!data || typeof data!=='object') return null;
  const t=data.token||data.accessToken||data.jwt||data.data?.token||data.data?.accessToken;
  const c=data.customer||data.user||data.client||data.data?.customer||data.data?.user;
  if(!t||!c) return null;
  return {token:t,customer:c};
}
function authPage(mode){const f=$('#authForm');if(!f)return;const c=customer();if(c&&token()){location.href='/account';return}f.innerHTML=mode==='login'?`<div class="field"><label>Email</label><input name="email" type="email" required placeholder="you@company.com"></div><div class="field"><label>Password</label><input name="password" type="password" required placeholder="Your password"></div><button class="btn primary" style="width:100%">Sign in ↗</button>`:`<div class="form-grid"><div class="field"><label>Name</label><input name="name" required placeholder="Your name"></div><div class="field"><label>Email</label><input name="email" type="email" required placeholder="you@company.com"></div><div class="field"><label>Phone</label><input name="phone" placeholder="+91"></div><div class="field"><label>Company</label><input name="company" placeholder="Company name"></div><div class="field full"><label>Password</label><input name="password" type="password" minlength="8" required placeholder="Minimum 8 characters"></div></div><button class="btn primary" style="width:100%">Create account ↗</button>`;f.onsubmit=async e=>{e.preventDefault();const st=$('#authStatus'),b=f.querySelector('button');b.disabled=true;st.textContent='Please wait…';try{save(await api('/customer/'+mode,{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(f)))}));location.href='/account'}catch(err){st.textContent=err.message}finally{b.disabled=false}}}
async function account(){
  const root=$('#accountRoot'); if(!root)return;
  if(!customer()||!token()){root.innerHTML='<div class="empty">Please sign in to access your client account.<br><a class="btn primary" href="/login" style="margin-top:16px">Client Login ↗</a></div>';return;}
  try{
    const [me,p,q,i,pay,o,t,a,d,pr,c]=await Promise.all([api('/customer/me'),api('/customer/projects'),api('/customer/quotes'),api('/customer/invoices'),api('/customer/payments'),api('/customer/orders'),api('/customer/tickets'),api('/customer/approvals'),api('/customer/documents'),api('/customer/privacy/requests'),api('/customer/consents'),api('/customer/contracts')]);
    const paid=pay.filter(x=>x.status==='SUCCESS').reduce((s,x)=>s+Number(x.amount||0),0), due=i.filter(x=>x.status!=='PAID').reduce((s,x)=>s+Number(x.total||0),0);
    root.innerHTML=`<div class="portal-shell"><aside class="portal-nav" aria-label="Customer account navigation">
      <button class="active" data-tab="overview">⌂ Overview</button><button data-tab="projects">▣ Projects</button><button data-tab="orders">🛒 Orders</button><button data-tab="billing">₹ Payments & Billing</button><button data-tab="contracts">✎ Contracts</button><button data-tab="support">? Support</button><button data-tab="documents">▤ Documents</button><button data-tab="privacy">⚖ Privacy</button><button data-tab="profile">◎ Profile</button><button id="logout">↪ Sign out</button>
    </aside><section class="portal-panel">
      <div class="section-head"><div><span class="eyebrow">CLIENT PORTAL</span><h2>Welcome, ${esc(me.customer.name.split(' ')[0])}.</h2><p>${esc(me.customer.email)}${me.customer.company?' · '+esc(me.customer.company):''}</p></div><a class="btn primary" href="/contact">Start a project ↗</a></div>
      <div class="portal-tab active" id="tab-overview"><div class="metric-grid"><article class="card"><span>PROJECTS</span><strong>${p.length}</strong><p>Active & completed</p></article><article class="card"><span>ORDERS</span><strong>${o.length}</strong><p>Service orders</p></article><article class="card"><span>AMOUNT PAID</span><strong>₹${paid.toLocaleString('en-IN')}</strong><p>Recorded payments</p></article><article class="card"><span>AMOUNT DUE</span><strong>₹${due.toLocaleString('en-IN')}</strong><p>Open invoices</p></article></div><div class="section"><div class="section-head"><div><span class="eyebrow">NEXT ACTION</span><h3>${a.find(x=>x.status==='PENDING')?.title||((o.find(x=>x.status==='PENDING_PAYMENT'))?'Complete payment for your order':(p.find(x=>!['COMPLETED','CANCELLED'].includes(x.status))?'Your project is in progress':'Nothing needs your action right now'))}</h3></div>${a.find(x=>x.status==='PENDING')?'<button class="btn primary" data-tab-jump="projects">Review ↗</button>':o.find(x=>x.status==='PENDING_PAYMENT')?'<button class="btn primary" data-tab-jump="billing">View billing ↗</button>':''}</div><div class="notice">Creatarsh keeps your projects, orders, payments, invoices, documents and support in one place. Your dashboard shows the next action and project progress.</div></div></div>
      <div class="portal-tab" id="tab-projects"><div class="section-head"><div><span class="eyebrow">YOUR WORK</span><h2>Projects</h2></div></div><div class="portal-list">${p.length?p.map(x=>`<article class="portal-row"><div><span class="status-chip">${esc(x.status)}</span><h3>${esc(x.name)}</h3><p>${esc(x.description||'')}</p>${x.dueDate?`<p class="muted-small">Target: ${new Date(x.dueDate).toLocaleDateString('en-IN')}</p>`:''}</div><div class="progress"><b>${x.progress||0}%</b><i><em style="width:${Math.min(100,Math.max(0,x.progress||0))}%"></em></i></div></article>`).join(''):'<div class="empty">No projects yet.</div>'}</div><h3 style="margin-top:30px">Approval requests</h3><div class="portal-list">${a.length?a.map(x=>`<article class="portal-row"><div><span class="status-chip">${esc(x.status)}</span><h3>${esc(x.title)}</h3><p>${esc(x.project?.name||'Project')} · v${esc(x.version||'1.0')}</p></div>${x.status==='PENDING'?`<div class="portal-actions"><button class="btn primary" onclick="respondApproval('${x._id}','APPROVED')">Approve</button><button class="btn" onclick="requestChanges('${x._id}')">Request changes</button></div>`:''}</article>`).join(''):'<div class="empty">No approval requests.</div>'}</div></div>
      <div class="portal-tab" id="tab-orders"><div class="section-head"><div><span class="eyebrow">ORDERS</span><h2>Service orders</h2></div><a class="btn primary" href="/buy">Browse packages ↗</a></div><div class="portal-list">${o.length?o.map(x=>`<article class="portal-row"><div><span class="status-chip">${esc(x.status)}</span><h3>${esc(x.orderId)}</h3><p>${esc(x.productName||'Creatarsh service')} · ${esc(x.business||'')}</p></div><strong>₹${Number(x.amount||0).toLocaleString('en-IN')}</strong></article>`).join(''):'<div class="empty">No orders yet. <a href="/buy">Choose a service.</a></div>'}</div></div>
      <div class="portal-tab" id="tab-billing"><div class="section-head"><div><span class="eyebrow">FINANCE</span><h2>Payments & Billing</h2></div></div><h3>Quotations</h3><div class="portal-list">${q.length?q.map(x=>`<article class="portal-row"><div><span class="status-chip">${esc(x.status)}</span><h3>${esc(x.quoteId)}</h3><p>${esc(x.project?.name||'Project quotation')}</p></div><strong>₹${Number(x.total||0).toLocaleString('en-IN')}</strong>${x.status==='SENT'?`<div class="portal-actions"><button class="btn primary" onclick="respondQuote('${x._id}','ACCEPTED')">Accept</button><button class="btn" onclick="respondQuote('${x._id}','REJECTED')">Decline</button></div>`:''}</article>`).join(''):'<div class="empty">No quotations.</div>'}</div><h3 style="margin-top:30px">Invoices & payments</h3><div class="portal-list">${i.map(x=>`<article class="portal-row"><div><span class="status-chip">${esc(x.status)}</span><h3>${esc(x.invoiceId)}</h3><p>${esc(x.project?.name||'Invoice')} · Due ${x.dueDate?new Date(x.dueDate).toLocaleDateString('en-IN'):'on request'}</p></div><strong>₹${Number(x.total||0).toLocaleString('en-IN')}</strong></article>`).join('')||'<div class="empty">No invoices yet.</div>'}</div></div>
      <div class="portal-tab" id="tab-contracts"><div class="section-head"><div><span class="eyebrow">AGREEMENTS</span><h2>Your contracts</h2><p class="muted">Review and accept agreements prepared for your project.</p></div></div><div class="portal-list">${(c||[]).map(x=>`<article class="portal-row"><div><span class="status-chip">${esc(x.status)}</span><h3>${esc(x.contractId)} · ${esc(x.title)}</h3><p>${esc(x.priceLabel||('₹'+Number(x.price||0).toLocaleString('en-IN')))} · ${esc(x.timeline||'Timeline in agreement')}</p></div>${x.status==='SENT'?`<button class="btn primary" data-accept-contract="${x._id}">Accept agreement</button>`:''}</article>`).join('')||'<div class="empty">No contracts yet.</div>'}</div></div><div class="portal-tab" id="tab-support"><div class="section-head"><div><span class="eyebrow">HELP DESK</span><h2>Support</h2></div></div><form id="supportForm" class="card support-form"><div class="form-grid"><div class="field"><label>Subject</label><input name="subject" required placeholder="What do you need help with?"></div><div class="field"><label>Category</label><select name="category"><option>WEBSITE</option><option>SOFTWARE</option><option>PAYMENT</option><option>DOMAIN</option><option>HOSTING</option><option>BUG</option><option>BILLING</option><option>OTHER</option></select></div><div class="field full"><label>Message</label><textarea name="message" rows="5" required placeholder="Describe the issue or request"></textarea></div></div><button class="btn primary">Create support ticket ↗</button><p id="supportStatus" class="form-help"></p></form><div class="portal-list" style="margin-top:18px">${t.length?t.map(x=>`<article class="portal-row"><div><span class="status-chip">${esc(x.status)}</span><h3>${esc(x.ticketId)} · ${esc(x.subject)}</h3><p>${esc(x.message)}</p></div></article>`).join(''):'<div class="empty">No support tickets.</div>'}</div></div>
      <div class="portal-tab" id="tab-documents"><div class="section-head"><div><span class="eyebrow">DOCUMENTS</span><h2>Your documents</h2></div></div><div class="portal-list">${d.length?d.map(x=>`<article class="portal-row"><div><h3>${esc(x.name)}</h3><p>${esc(x.type)} · Version ${esc(x.version||'1.0')}</p></div>${x.url?`<a class="btn" href="${esc(x.url)}" target="_blank" rel="noopener">Open ↗</a>`:''}</article>`).join(''):'<div class="empty">Your proposals, agreements and deliverables will appear here.</div>'}</div></div>
      <div class="portal-tab" id="tab-privacy"><div class="section-head"><div><span class="eyebrow">PRIVACY CENTER</span><h2>Your data & privacy</h2></div></div><div class="notice">You control your Creatarsh account data. Submit a request when you need access, correction, deletion, consent withdrawal or privacy assistance.</div><div class="card" style="margin-top:16px"><form id="privacyForm"><div class="form-grid"><div class="field"><label>Request type</label><select name="type"><option value="ACCESS">Access my data</option><option value="CORRECTION">Correct my data</option><option value="DELETION">Delete my data</option><option value="WITHDRAW_CONSENT">Withdraw consent</option><option value="COMPLAINT">Privacy complaint</option></select></div><div class="field full"><label>Details</label><textarea name="details" rows="4" placeholder="Tell us what you need"></textarea></div></div><button class="btn primary">Submit privacy request ↗</button><p id="privacyStatus" class="form-help"></p></form></div><h3 style="margin-top:30px">Previous requests</h3><div class="portal-list">${pr.length?pr.map(x=>`<article class="portal-row"><div><span class="status-chip">${esc(x.status)}</span><h3>${esc(x.requestId)}</h3><p>${esc(x.type)} · ${new Date(x.createdAt).toLocaleDateString('en-IN')}</p></div></article>`).join(''):'<div class="empty">No privacy requests.</div>'}</div><div class="portal-actions" style="margin-top:18px"><button class="btn" id="exportData">Export my account data</button><a class="btn" href="/legal/privacy">Read Privacy Policy ↗</a></div></div>
      <div class="portal-tab" id="tab-profile"><div class="section-head"><div><span class="eyebrow">PROFILE</span><h2>Business profile</h2></div></div><form id="profileForm" class="card"><div class="form-grid"><div class="field"><label>Name</label><input name="name" value="${esc(me.customer.name)}" required></div><div class="field"><label>Email</label><input value="${esc(me.customer.email)}" disabled></div><div class="field"><label>Phone</label><input name="phone" value="${esc(me.customer.phone||'')}" placeholder="+91"></div><div class="field"><label>Business</label><input name="company" value="${esc(me.customer.company||'')}" placeholder="Business name"></div></div><button class="btn primary">Save profile</button><p id="profileStatus" class="form-help"></p></form><div class="legal-nav"><a href="/legal/terms">Terms</a><a href="/legal/privacy">Privacy</a><a href="/legal/refunds">Refunds</a><a href="/legal/cookies">Cookies</a><a href="/legal/ai">AI policy</a></div></div>
      </div></section></div>`;
    $$('.portal-nav button[data-tab]').forEach(btn=>btn.onclick=()=>switchTab(btn.dataset.tab));
    $$('[data-tab-jump]').forEach(b=>b.onclick=()=>switchTab(b.dataset.tabJump));
    $('#logout').onclick=logout;
    $('#profileForm').onsubmit=async e=>{e.preventDefault();try{await api('/customer/me',{method:'PUT',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});$('#profileStatus').textContent='Profile saved ✓';}catch(err){$('#profileStatus').textContent=err.message}};
    $('#supportForm').onsubmit=async e=>{e.preventDefault();try{await api('/customer/tickets',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});$('#supportStatus').textContent='Ticket created ✓';e.target.reset();}catch(err){$('#supportStatus').textContent=err.message}};
    $$('[data-accept-contract]').forEach(b=>b.onclick=async()=>{if(!confirm('I have reviewed and agree to this agreement. Continue?'))return;try{await api('/customer/contracts/'+b.dataset.acceptContract+'/accept',{method:'POST'});location.reload()}catch(err){alert(err.message)}});
    $('#privacyForm').onsubmit=async e=>{e.preventDefault();try{await api('/customer/privacy/requests',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});$('#privacyStatus').textContent='Privacy request submitted ✓';e.target.reset();}catch(err){$('#privacyStatus').textContent=err.message}};
    $('#exportData').onclick=async()=>{try{const data=await api('/customer/profile/export');const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='creatarsh-account-data.json';a.click();URL.revokeObjectURL(a.href)}catch(err){alert(err.message)}};
  }catch(e){if(e.status===401)logout();else root.innerHTML=`<div class="empty">${esc(e.message)}</div>`}
}
function switchTab(tab){$$('.portal-nav button[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$$('.portal-tab').forEach(x=>x.classList.toggle('active',x.id==='tab-'+tab));}
async function respondQuote(id,status){try{await api('/customer/quotes/'+id+'/respond',{method:'POST',body:JSON.stringify({status})});location.reload()}catch(e){alert(e.message)}}
async function respondApproval(id,status){try{await api('/customer/approvals/'+id+'/respond',{method:'POST',body:JSON.stringify({status})});location.reload()}catch(e){alert(e.message)}}
async function requestChanges(id){const comment=prompt('What should be changed?');if(comment===null)return;try{await api('/customer/approvals/'+id+'/respond',{method:'POST',body:JSON.stringify({status:'CHANGES_REQUESTED',comment})});location.reload()}catch(e){alert(e.message)}}
function buyPage(){
  const root=$('#buyRoot'); if(!root)return;
  const params=new URLSearchParams(location.search);
  let selectedCode=params.get('package')||null;
  let packages=[];
  const isLogged=()=>!!token();
  const goLogin=()=>{localStorage.setItem('cr_pending_package',selectedCode||'');localStorage.setItem('cr_pending_buy','1');location.href='/login?next='+encodeURIComponent('/buy?package='+(selectedCode||''));};
  const render=()=>{
    const selected=packages.find(x=>x.code===selectedCode);
    root.innerHTML=`<div class="section-head"><div><span class="eyebrow">CREATARSH PACKAGES</span><h2>Choose what you want to build.</h2><p class="muted">Explore the package, see the full project value, then pay only the minimum booking charge to start your enquiry.</p></div></div>
      <div class="grid package-grid">${packages.map(x=>`<article class="card package-card ${x.code===selectedCode?'selected':''}"><span class="eyebrow">${esc(x.category||'SERVICE PACKAGE')}</span><h3>${esc(x.name)}</h3><div class="package-price">₹${Number(x.price||0).toLocaleString('en-IN')}</div><p class="muted">${esc(x.description||'')}</p><ul>${(x.features||[]).map(f=>`<li>${esc(f)}</li>`).join('')}</ul><p class="form-help"><strong>Minimum booking:</strong> ₹${Number(x.bookingAmount||499).toLocaleString('en-IN')}</p><button class="btn ${x.code===selectedCode?'primary':''} choose-package" data-code="${esc(x.code)}">${x.code===selectedCode?'Selected ✓':'Select package ↗'}</button></article>`).join('')}</div>
      ${selected?`<div class="card" style="margin-top:28px"><div class="stepper"><span class="active">1 Package</span><span class="active">2 Login</span><span>3 Booking</span><span>4 Enquiry</span></div><h2>${esc(selected.name)}</h2><p class="muted">Package value <strong>₹${Number(selected.price||0).toLocaleString('en-IN')}</strong>. You pay only <strong>₹${Number(selected.bookingAmount||499).toLocaleString('en-IN')}</strong> as the minimum booking charge now. The remaining scope and payment schedule are confirmed by Creatarsh after review.</p>${isLogged()?bookingForm(selected):`<div class="notice"><strong>Login required before booking.</strong><br>Already a customer? Sign in. New customer? Create your free client account first.</div><div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:18px"><button class="btn primary" id="continueLogin">Continue to login ↗</button><a class="btn" href="/register?next=${encodeURIComponent('/buy?package='+selected.code)}">Create account</a></div>`}</div>`:''}`;
    $$('.choose-package').forEach(b=>b.onclick=()=>{selectedCode=b.dataset.code;history.replaceState(null,'','/buy?package='+encodeURIComponent(selectedCode));render();document.querySelector('.package-grid')?.nextElementSibling?.scrollIntoView({behavior:'smooth',block:'start'});});
    $('#continueLogin')?.addEventListener('click',goLogin);
    const form=$('#bookingForm'); if(form)form.onsubmit=e=>submitBooking(e,selected);
  };
  const bookingForm=x=>`<form id="bookingForm"><div class="form-grid"><div class="field"><label>Business / project name</label><input name="company" value="${esc(customer()?.company||'')}" placeholder="Your business or project"></div><div class="field"><label>Phone / WhatsApp</label><input name="phone" value="${esc(customer()?.phone||'')}" placeholder="+91"></div><div class="field full"><label>What do you need?</label><textarea name="requirements" rows="5" required placeholder="Tell us what you want, your current website/app if any, goals, deadline and important requirements."></textarea></div><div class="field full"><label><input type="checkbox" name="terms" value="true" required> I agree to the <a href="/legal/terms" target="_blank">Terms & Conditions</a>.</label></div><div class="field full"><label><input type="checkbox" name="privacy" value="true" required> I acknowledge the <a href="/legal/privacy" target="_blank">Privacy Policy</a>.</label></div><div class="field full"><label><input type="checkbox" name="marketingConsent" value="true"> I want optional Creatarsh updates.</label></div></div><button class="btn primary" type="submit">Pay ₹${Number(x.bookingAmount||499).toLocaleString('en-IN')} booking charge ↗</button><p id="bookingStatus" class="form-help"></p></form>`;
  async function submitBooking(e,x){
    e.preventDefault(); const form=e.target, btn=form.querySelector('button[type=submit]'), status=$('#bookingStatus'); btn.disabled=true; status.textContent='Creating your enquiry…';
    try{
      const v=Object.fromEntries(new FormData(form));
      const r=await api('/customer/bookings',{method:'POST',body:JSON.stringify({...v,productCode:x.code,termsVersion:'2026-10',privacyVersion:'2026-10'})});
      status.textContent='Booking created. Opening secure payment…';
      const cfg=await api('/public/payment-config'); if(!cfg.enabled)throw new Error('Razorpay is not configured on the server yet.');
      const po=await api('/customer/payments/razorpay/order',{method:'POST',body:JSON.stringify({orderId:r.orderId,amount:r.package.bookingAmount})});
      const open=()=>{const rz=new Razorpay({key:po.keyId,amount:po.amount,currency:po.currency,name:'Creatarsh',description:`Booking charge — ${x.name}`,order_id:po.orderId,prefill:{name:customer()?.name,email:customer()?.email,contact:v.phone||customer()?.phone},notes:{package:x.name,enquiry:'Created after payment verification'},handler:async response=>{try{const verified=await api('/customer/payments/razorpay/verify',{method:'POST',body:JSON.stringify(response)});status.innerHTML=`<strong>Payment verified ✓</strong> Enquiry ${esc(verified.enquiry?.enquiryId||'created')} is now with Creatarsh. Invoice ${esc(verified.invoice.invoiceId)} is available in your account. <a class="btn primary" href="/account">Open client dashboard ↗</a>`;}catch(err){status.textContent=err.message;btn.disabled=false;}}});rz.on('payment.failed',response=>{status.textContent=response.error?.description||'Payment failed. Your booking remains pending and can be resumed from your account.';btn.disabled=false;});rz.open();};
      if(window.Razorpay)open();else{const sc=document.createElement('script');sc.src='https://checkout.razorpay.com/v1/checkout.js';sc.onload=open;sc.onerror=()=>{throw new Error('Unable to load Razorpay Checkout.')};document.head.appendChild(sc);}
    }catch(err){status.textContent=err.message||'Unable to start booking.';btn.disabled=false;}
  }
  const pending=localStorage.getItem('cr_pending_package'); if(!selectedCode&&pending){selectedCode=pending;localStorage.removeItem('cr_pending_package');}
  api('/public/pricing').then(d=>{packages=d.packages||[]; if(selectedCode&&!packages.some(x=>x.code===selectedCode))selectedCode=null; render();}).catch(e=>root.innerHTML=`<div class="empty">${esc(e.message)}</div>`);
}
