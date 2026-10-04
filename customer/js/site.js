const defaultApi='';
const API=(window.CREATARSH_API_URL||defaultApi).replace(/\/$/,'')+'/api';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const slugifyClient=v=>String(v||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const token=()=>localStorage.getItem('cr_customer_token');
const customer=()=>{try{return JSON.parse(localStorage.getItem('cr_customer')||'null')}catch{return null}};
const save=(d)=>{localStorage.setItem('cr_customer_token',d.token);localStorage.setItem('cr_customer',JSON.stringify(d.customer));};
const logout=()=>{localStorage.removeItem('cr_customer_token');localStorage.removeItem('cr_customer');location.href='/login';};
async function api(path,opt={}){const h={'Content-Type':'application/json',...(opt.headers||{})};if(token())h.Authorization='Bearer '+token();const r=await fetch(API+path,{...opt,headers:h});let d={};try{d=await r.json()}catch{}if(!r.ok){const e=new Error(d.message||`Request failed (${r.status})`);e.status=r.status;throw e}return d}
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
  try{return await api('/public/content')}
  catch{return {services:[
    {title:'Web Development',slug:'web-development',description:'Fast, scalable websites and web applications.',icon:'</>',features:['Responsive UI','Modern architecture','Deployment'],startingPrice:15000,timeline:'1–4 weeks'},
    {title:'App Development',slug:'app-development',description:'Cross-platform mobile apps built around your workflow.',icon:'▣',features:['Android & iOS','API integration','App launch'],startingPrice:25000,timeline:'3–8 weeks'},
    {title:'UI/UX Design',slug:'ui-ux-design',description:'Clear, conversion-focused interfaces with a premium visual system.',icon:'✦',features:['Wireframes','UI system','Prototype'],startingPrice:8000,timeline:'1–2 weeks'},
    {title:'Branding & Design',slug:'branding-design',description:'Identity, social creatives and digital brand assets.',icon:'◇',features:['Logo system','Brand kit','Social assets'],startingPrice:5000,timeline:'3–10 days'},
    {title:'E-commerce',slug:'e-commerce',description:'Complete stores with payments, inventory and admin systems.',icon:'□',features:['Storefront','Payments','Manager panel'],startingPrice:30000,timeline:'3–8 weeks'},
    {title:'Custom Systems',slug:'custom-systems',description:'Business software tailored to the way your team works.',icon:'⌘',features:['Custom workflow','Dashboard','Integrations'],startingPrice:40000,timeline:'4–12 weeks'}
  ],portfolio:[],testimonials:[],faqs:[],site:{}}}
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
function renderServices(d){const el=$('#allServices');if(!el)return;el.innerHTML=(d.services||[]).map(x=>`<article class="card service-card"><a class="service-link" href="/service/${encodeURIComponent(x.slug||slugifyClient(x.title))}"><div class="icon">${esc(x.icon||'✦')}</div><h3>${esc(x.title)}</h3><p>${esc(x.description)}</p><div class="price">${x.startingPrice?'From ₹'+Number(x.startingPrice).toLocaleString('en-IN'):''} ${x.timeline?' · '+esc(x.timeline):''}</div>${x.features?.length?`<ul class="muted">${x.features.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>`:''}<span class="service-more">Explore pricing, work & packages ↗</span></a></article>`).join('')||'<div class="empty">No services published yet.</div>'}
function renderWork(d){const el=$('#allWork');if(!el)return;el.innerHTML=(d.portfolio||[]).map(x=>`<article class="card work-card"><div class="work-media">${x.media?.[0]?`<img src="${esc(x.media[0])}" alt="${esc(x.title)}" style="width:100%;height:100%;object-fit:cover">`:'CREATARSH'}</div><div class="work-body"><span class="tag">${esc(x.category||'Project')}</span><h3>${esc(x.title)}</h3><p>${esc(x.description||'')}</p>${x.technologies?.length?`<p class="muted" style="margin-top:12px">${x.technologies.map(esc).join(' · ')}</p>`:''}</div></article>`).join('')||'<div class="empty">No portfolio projects published yet.</div>'}
function renderFaq(d){const el=$('#faqList');if(el)el.innerHTML=(d.faqs||[]).map(x=>`<details><summary>${esc(x.question)} <span>+</span></summary><p>${esc(x.answer)}</p></details>`).join('')||'<div class="empty">FAQ will appear here.</div>'}
function setupLead(){const f=$('#leadForm');if(!f)return;const c=customer();['name','email','whatsapp','company'].forEach(k=>{if(c&&f.elements[k])f.elements[k].value=c[k]||''});f.onsubmit=async e=>{e.preventDefault();const st=$('#formStatus'),b=f.querySelector('button[type=submit]');b.disabled=true;st.textContent='Sending…';try{const d=await api('/public/leads',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(f)))});st.textContent=`Received · Enquiry ${d.enquiryId}`;f.reset()}catch(e){st.textContent=e.message}finally{b.disabled=false}}}
function authPage(mode){const f=$('#authForm');if(!f)return;const c=customer();if(c&&token()){location.href='/account';return}f.innerHTML=mode==='login'?`<div class="field"><label>Email</label><input name="email" type="email" required placeholder="you@company.com"></div><div class="field"><label>Password</label><input name="password" type="password" required placeholder="Your password"></div><button class="btn primary" style="width:100%">Sign in ↗</button>`:`<div class="form-grid"><div class="field"><label>Name</label><input name="name" required placeholder="Your name"></div><div class="field"><label>Email</label><input name="email" type="email" required placeholder="you@company.com"></div><div class="field"><label>Phone</label><input name="phone" placeholder="+91"></div><div class="field"><label>Company</label><input name="company" placeholder="Company name"></div><div class="field full"><label>Password</label><input name="password" type="password" minlength="8" required placeholder="Minimum 8 characters"></div></div><button class="btn primary" style="width:100%">Create account ↗</button>`;f.onsubmit=async e=>{e.preventDefault();const st=$('#authStatus'),b=f.querySelector('button');b.disabled=true;st.textContent='Please wait…';try{save(await api('/customer/'+mode,{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(f)))}));location.href='/account'}catch(err){st.textContent=err.message}finally{b.disabled=false}}}
async function account(){const root=$('#accountRoot');if(!root)return;const c=customer();if(!c||!token()){root.innerHTML='<div class="empty">Please sign in to access your client account.<br><a class="btn primary" href="/login" style="margin-top:16px">Client Login ↗</a></div>';return}try{const [me,p,q,i,pay]=await Promise.all([api('/customer/me'),api('/customer/projects'),api('/customer/quotes'),api('/customer/invoices'),api('/customer/payments')]);root.innerHTML=`<div class="section-head"><div><span class="eyebrow">CLIENT PORTAL</span><h2>Welcome, ${esc(me.customer.name.split(' ')[0])}.</h2><p>${esc(me.customer.email)}${me.customer.company?' · '+esc(me.customer.company):''}</p></div><button class="btn" id="logout">Sign out</button></div><div class="grid account-grid"><article class="card account-card"><span>PROJECTS</span><strong>${p.length}</strong><p>Active and completed work</p></article><article class="card account-card"><span>QUOTATIONS</span><strong>${q.length}</strong><p>Quotes to review</p></article><article class="card account-card"><span>INVOICES</span><strong>${i.length}</strong><p>Billing records</p></article><article class="card account-card"><span>PAID</span><strong>₹${pay.filter(x=>x.status==='SUCCESS').reduce((s,x)=>s+Number(x.amount||0),0).toLocaleString('en-IN')}</strong><p>Recorded successful payments</p></article></div><div class="section"><div class="section-head"><div><span class="eyebrow">YOUR WORK</span><h2>Projects</h2></div><a class="btn primary" href="/contact">Start a project ↗</a></div><div class="portal-list">${p.length?p.map(x=>`<article class="portal-row"><div><span class="tag">${esc(x.status)}</span><h3>${esc(x.name)}</h3><p>${esc(x.description||'')}</p></div><div class="progress"><b>${x.progress||0}%</b><i><em style="width:${Math.min(100,Math.max(0,x.progress||0))}%"></em></i></div></article>`).join(''):'<div class="empty">No projects yet.</div>'}</div></div><div class="section"><div class="section-head"><div><span class="eyebrow">FINANCE</span><h2>Quotations & invoices</h2></div></div><div class="portal-list">${q.map(x=>`<article class="portal-row"><div><span class="tag">${esc(x.status)}</span><h3>${esc(x.quoteId)}</h3><p>${esc(x.project?.name||'Project quotation')}</p></div><strong>₹${Number(x.total||0).toLocaleString('en-IN')}</strong></article>`).join('')||'<div class="empty">No quotations yet.</div>'}${i.map(x=>`<article class="portal-row"><div><span class="tag">${esc(x.status)}</span><h3>${esc(x.invoiceId)}</h3><p>${esc(x.project?.name||'Invoice')}</p></div><strong>₹${Number(x.total||0).toLocaleString('en-IN')}</strong></article>`).join('')}</div></div>`;$('#logout').onclick=logout}catch(e){if(e.status===401)logout();else root.innerHTML=`<div class="empty">${esc(e.message)}</div>`}}

function initParticleLogo(){
  let canvas=document.getElementById('particleLogo');
  const hero=document.querySelector('.hero');
  if(!canvas){
    canvas=document.createElement('canvas');
    canvas.id='particleLogo';
    canvas.className='global-particles';
    canvas.setAttribute('aria-hidden','true');
    document.body.prepend(canvas);
  }else{
    canvas.classList.add('global-particles');
  }

  const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
  if(!ctx)return;

  const source=new Image();
  source.decoding='async';
  source.src=new URL('../assets/creatarsh-logo.png',location.href).href;

  let particles=[], target=[], dpr=1, w=0, h=0;
  let rafId=0, lastFrame=0, lastScroll=window.scrollY||0, scrollDirty=true;
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const state={progress:hero?1:0,time:0,velocity:0};

  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));

  function particleLimit(){
    const area=w*h;
    if(reducedMotion.matches)return 700;
    if(w<=600)return 1200;
    if(w<=1000)return 2000;
    if(area>2500000)return 3200;
    return 2600;
  }

  function resize(){
    w=Math.max(1,window.innerWidth);
    h=Math.max(1,window.innerHeight);
    dpr=Math.min(window.devicePixelRatio||1,1.5);
    canvas.width=Math.round(w*dpr);
    canvas.height=Math.round(h*dpr);
    canvas.style.width=w+'px';
    canvas.style.height=h+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if(target.length)buildScatter();
  }

  function buildScatter(){
    const cx=w*.69, cy=h*.43;
    particles.forEach(p=>{
      const angle=p.scatterAngle;
      const radius=Math.max(w,h)*(.16+p.scatterRadius*.58);
      p.sx=cx+Math.cos(angle)*radius;
      p.sy=cy+Math.sin(angle)*radius*.78;
      p.vx=Math.cos(angle)*(18+p.scatterSpeed*75);
      p.vy=Math.sin(angle)*(18+p.scatterSpeed*75);
    });
  }

  function build(){
    const size=500;
    const off=document.createElement('canvas');
    off.width=size; off.height=size;
    const oc=off.getContext('2d',{willReadFrequently:true});
    oc.clearRect(0,0,size,size);
    oc.drawImage(source,0,0,size,size);
    const data=oc.getImageData(0,0,size,size).data;
    target=[];

    // Fewer source samples than the previous 600px/3px grid.
    const step=w<=600?5:4;
    for(let y=0;y<size;y+=step){
      for(let x=0;x<size;x+=step){
        const i=(y*size+x)*4;
        const r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];
        if(a>70 && r+g+b>105){
          target.push({
            nx:x/size-.5,
            ny:y/size-.5,
            red:r>170&&g<110&&b<110
          });
        }
      }
    }

    const limit=particleLimit();
    if(target.length>limit){
      // Deterministic thinning keeps the logo shape stable instead of reallocating
      // a large random array every time.
      const stride=Math.ceil(target.length/limit);
      target=target.filter((_,i)=>i%stride===0).slice(0,limit);
    }

    particles=target.map(p=>({
      ...p,
      x:0,y:0,sx:0,sy:0,vx:0,vy:0,
      size:p.red?1.2:1,
      alpha:.52+Math.random()*.48,
      scatterAngle:Math.random()*Math.PI*2,
      scatterRadius:Math.random(),
      scatterSpeed:Math.random(),
      twinkle:Math.random()*Math.PI*2
    }));
    buildScatter();
  }

  function updateProgress(){
    if(!hero){state.progress=0;return;}
    const r=hero.getBoundingClientRect();
    const travel=Math.max(260,Math.min(window.innerHeight*1.15,hero.offsetHeight*.72));
    state.progress=clamp(1-Math.max(0,-r.top)/travel);
  }

  function onScroll(){
    const y=window.scrollY||0;
    state.velocity=Math.min(120,Math.abs(y-lastScroll));
    lastScroll=y;
    scrollDirty=true;
  }

  function drawParticle(p,join,scatter){
    const cx=w*.69, cy=h*.43;
    const scale=Math.min(w*.50,h*.68);
    const tx=cx+p.nx*scale;
    const ty=cy+p.ny*scale;
    const burst=scatter*scatter;
    let x=tx*join+p.sx*scatter;
    let y=ty*join+p.sy*scatter;

    const dx=p.sx-cx, dy=p.sy-cy;
    const len=Math.sqrt(dx*dx+dy*dy)||1;
    const wave=Math.sin(state.time*5+p.twinkle)*(.45+scatter*1.3);
    x+=(dx/len)*(burst*55+state.velocity*.22)+wave;
    y+=(dy/len)*(burst*55+state.velocity*.16)+
      Math.cos(state.time*4+p.twinkle)*(.45+scatter*1.2);

    x+=Math.sin(state.time*.45+p.twinkle)*6*scatter+p.vx*scatter*.035;
    y+=Math.cos(state.time*.38+p.twinkle)*5*scatter+p.vy*scatter*.035;

    ctx.globalAlpha=Math.min(.9,(.22+.74*join+.13*scatter)*p.alpha);
    ctx.fillStyle=p.red?'#ff2417':'#8fffc6';

    // Avoid per-particle shadowBlur: it is one of the most expensive canvas
    // operations in the original effect.
    ctx.beginPath();
    ctx.arc(x,y,p.size*(.74+.65*join),0,Math.PI*2);
    ctx.fill();
  }

  function frame(now){
    if(document.hidden){
      rafId=0;
      return;
    }

    // Cap the effect at ~45 FPS. The browser still renders the rest of the page
    // normally, while the particle field gets substantially less CPU time.
    const minFrame=22;
    if(now-lastFrame<minFrame){
      rafId=requestAnimationFrame(frame);
      return;
    }
    lastFrame=now;

    if(scrollDirty){
      updateProgress();
      scrollDirty=false;
    }

    state.time=now*.001;
    ctx.clearRect(0,0,w,h);

    const join=Math.pow(state.progress,.72);
    const scatter=1-join;

    // One fill pass per particle is retained for the clean two-tone logo.
    for(let i=0;i<particles.length;i++)drawParticle(particles[i],join,scatter);

    ctx.globalAlpha=1;
    rafId=requestAnimationFrame(frame);
  }

  function start(){
    if(!rafId)rafId=requestAnimationFrame(frame);
  }

  function stop(){
    if(rafId){
      cancelAnimationFrame(rafId);
      rafId=0;
    }
  }

  source.onload=()=>{
    resize();
    build();
    start();
  };
  source.onerror=()=>{canvas.style.display='none';};

  window.addEventListener('resize',resize,{passive:true});
  window.addEventListener('scroll',onScroll,{passive:true});
  document.addEventListener('visibilitychange',()=>document.hidden?stop():start());
  reducedMotion.addEventListener?.('change',()=>{build();start();});
}

async function init(){shell();const page=document.body.dataset.page;const d=await content();if(page==='home'){renderHome(d);renderBanners(d);initParticleLogo();}if(page==='services')renderServices(d);if(page==='service')renderServiceDetail();if(page==='work')renderWork(d);if(page==='contact')setupLead();if(page==='faq')renderFaq(d);if(page==='account')account();if(page==='login')authPage('login');if(page==='register')authPage('register');}
init();

function serviceDefaults(title){
  const t=String(title||'').toLowerCase();
  if(t.includes('web')) return {designTypes:['Business websites','Landing pages','E-commerce stores','Web applications','Portfolio websites'],deliverables:['UI/UX design','Responsive frontend','Backend/API integration','SEO-ready structure','Deployment & domain setup'],packages:[{name:'Starter',price:'₹5,000+',description:'Clean professional website for a small business.',features:['Up to 5 pages','Responsive design','Contact/WhatsApp CTA']},{name:'Business',price:'₹10,000+',description:'Conversion-focused business presence.',features:['Up to 10 pages','CMS/content sections','SEO setup','Analytics'],popular:true},{name:'Advanced',price:'₹25,000+',description:'Custom web experience or web application.',features:['Custom UI/UX','Database/API','Authentication','Deployment']}],offers:['Free consultation','Free basic SEO setup with Business package']};
  if(t.includes('app')) return {designTypes:['Android apps','iOS apps','Flutter apps','Customer apps','Manager/admin apps'],deliverables:['UI/UX','App development','API integration','Testing','Store/deployment support'],packages:[{name:'MVP',price:'₹30,000+',description:'Launch the first usable version.',features:['Core screens','API integration','Basic testing']},{name:'Business App',price:'₹60,000+',description:'Full customer-facing mobile system.',features:['Custom UI','Authentication','Payments','Notifications'],popular:true},{name:'Advanced',price:'Custom',description:'Large-scale app with custom backend.',features:['Advanced workflows','Admin panel','Integrations','Analytics']}],offers:['Free project planning call']};
  if(t.includes('software')) return {designTypes:['CRM','ERP','Inventory','Billing','Business dashboards','Custom workflows'],deliverables:['Requirement analysis','UI/UX','Backend','Database','Admin panel','Deployment'],packages:[{name:'Starter System',price:'₹50,000+',description:'One focused business workflow.',features:['Custom dashboard','Database','Authentication']},{name:'Business OS',price:'₹1,00,000+',description:'Multiple connected business workflows.',features:['CRM','Automation','Reports','Roles'],popular:true},{name:'Enterprise',price:'Custom',description:'Complex custom software platform.',features:['Multi-module system','Integrations','Advanced permissions']}],offers:['Requirement audit before quotation']};
  if(t.includes('ai')) return {designTypes:['AI assistants','AI automation','AI content tools','AI integrations','Custom AI workflows'],deliverables:['Use-case analysis','Model/API integration','Prompt/workflow design','Dashboard','Deployment'],packages:[{name:'AI Starter',price:'₹20,000+',description:'One practical AI workflow.',features:['1 workflow','API integration','Basic UI']},{name:'AI Business',price:'₹50,000+',description:'Multiple connected AI automations.',features:['Multiple workflows','Dashboard','Automation'],popular:true},{name:'Custom AI',price:'Custom',description:'Advanced AI product or model work.',features:['Custom architecture','Data pipeline','Deployment']}],offers:['Free AI feasibility discussion']};
  if(t.includes('design')) return {designTypes:['Brand identity','UI/UX','Social media','Marketing creatives','Presentation design'],deliverables:['Creative direction','Design system','Source files','Export assets'],packages:[{name:'Starter',price:'₹3,000+',description:'Focused design requirement.',features:['Defined deliverables','2 revisions']},{name:'Brand+',price:'₹10,000+',description:'Consistent visual identity.',features:['Logo direction','Colors','Typography','Social kit'],popular:true},{name:'Premium',price:'Custom',description:'Full design system.',features:['Brand system','UI/UX','Campaign assets']}],offers:['Portfolio review before booking']};
  if(t.includes('marketing')||t.includes('seo')) return {designTypes:['SEO','Social media','Content strategy','Performance campaigns','Lead generation'],deliverables:['Strategy','Content plan','Tracking','Monthly reporting'],packages:[{name:'Starter',price:'₹5,000/mo+',description:'Basic growth foundation.',features:['SEO basics','Content plan','Reporting']},{name:'Growth',price:'₹15,000/mo+',description:'Consistent acquisition system.',features:['SEO','Content','Lead campaigns'],popular:true},{name:'Performance',price:'Custom',description:'Aggressive growth campaigns.',features:['Multi-channel','Ads','Conversion optimization']}],offers:['Free initial digital audit']};
  return {designTypes:['Custom solution'],deliverables:['Strategy','Design','Development','Launch'],packages:[{name:'Starter',price:'Custom',description:'A focused solution.',features:['Consultation','Design','Delivery']},{name:'Business',price:'Custom',description:'Complete business solution.',features:['Custom development','Support'],popular:true},{name:'Premium',price:'Custom',description:'Advanced custom engagement.',features:['Full solution','Priority support']}],offers:['Free consultation']};
}
function serviceSlugMatch(s,slug){return String(s.slug||slugifyClient(s.title))===slug||slugifyClient(s.title)===slug;}
async function renderServiceDetail(){
  const root=$('#serviceRoot');if(!root)return;
  const slug=decodeURIComponent(location.pathname.split('/').filter(Boolean).pop()||'');
  try{
    const d=await content();
    const service=(d.services||[]).find(x=>serviceSlugMatch(x,slug));
    if(!service){root.innerHTML='<section class="page-head"><div class="container"><span class="eyebrow">404</span><h1>Service not found.</h1><p>Return to <a class="accent" href="/services">all services</a>.</p></div></section>';return;}
    document.title=`${service.title} | Creatarsh`;
    const defaults=serviceDefaults(service.title);
    const details={...defaults,...service};
    const packages=service.packages?.length?service.packages:defaults.packages;
    const designTypes=service.designTypes?.length?service.designTypes:defaults.designTypes;
    const deliverables=service.deliverables?.length?service.deliverables:defaults.deliverables;
    const offers=service.offers?.length?service.offers:defaults.offers;
    const related=(d.portfolio||[]).filter(p=>{const c=slugifyClient(p.category||'');const t=slugifyClient(service.title);return c===slug||c===t||c.includes(slug)||t.includes(c)});
    root.innerHTML=`
      <section class="service-hero"><div class="container service-hero-grid"><div><span class="eyebrow">CREATARSH SERVICE</span><h1>${esc(service.title)}</h1><p>${esc(service.description||'A complete Creatarsh solution designed around your business goals.')}</p><div class="actions"><a class="btn primary" href="#book">Book this service ↗</a><a class="btn" href="/services">All services</a></div></div><div class="service-meta"><div class="card"><span class="muted">Starting from</span><b>${service.startingPrice?'₹'+Number(service.startingPrice).toLocaleString('en-IN')+'+':'Custom'}</b></div><div class="card"><span class="muted">Typical timeline</span><b>${esc(service.timeline||'Custom')}</b></div></div></div></section>
      <section class="service-section"><div class="container service-layout"><article class="service-panel"><span class="eyebrow">WHAT WE PROVIDE</span><h2>Everything needed to launch.</h2><ul>${deliverables.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></article><article class="service-panel"><span class="eyebrow">DESIGN TYPES</span><h2>Choose your direction.</h2><div class="chip-list">${designTypes.map(x=>`<span class="chip">${esc(x)}</span>`).join('')}</div><h3 style="margin-top:28px">Core features</h3><ul>${(service.features||[]).map(x=>`<li>${esc(x)}</li>`).join('')||'<li>Custom scope based on your requirements</li>'}</ul></article></div></section>
      <section class="service-section" style="padding-top:10px"><div class="container"><div class="section-head"><div><span class="eyebrow">PACKAGES</span><h2>Choose what fits.</h2><p>Packages are starting points. We customize the final scope after understanding your business.</p></div></div><div class="package-grid">${packages.map(x=>`<article class="card package ${x.popular?'popular':''}">${x.popular?'<span class="badge-pop">MOST POPULAR</span>':''}<span class="tag">PACKAGE</span><h3>${esc(x.name)}</h3><div class="package-price">${esc(x.price)}</div><p>${esc(x.description||'')}</p><ul class="muted">${(x.features||[]).map(f=>`<li>${esc(f)}</li>`).join('')}</ul><a class="btn primary" href="#book" data-package="${esc(x.name)}">Book ${esc(x.name)} ↗</a></article>`).join('')}</div>${offers.map(o=>`<div class="offer-strip"><strong>Special offer</strong><span>${esc(o)}</span></div>`).join('')}</div></section>
      <section class="service-section"><div class="container"><div class="section-head"><div><span class="eyebrow">RELATED WORK</span><h2>See what we've built.</h2></div><a class="btn" href="/work">View portfolio ↗</a></div><div class="work-filter"><button class="active" data-filter="all">All</button>${[...new Set(related.map(x=>x.category).filter(Boolean))].map(c=>`<button data-filter="${esc(c)}">${esc(c)}</button>`).join('')}</div><div id="serviceWorkGrid" class="service-work-grid">${related.length?related.map(x=>`<article class="card service-work" data-category="${esc(x.category||'')}" data-title="${esc(x.title)}"><div>${x.media?.[0]?`<img src="${esc(x.media[0])}" alt="${esc(x.title)}" loading="lazy">`:'<div style="height:210px;display:grid;place-items:center;color:var(--green);font:800 28px Manrope">CREATARSH</div>'}</div><div class="service-work-body"><span class="tag">${esc(x.category||service.title)}</span><h3>${esc(x.title)}</h3><p>${esc(x.description||'')}</p>${x.projectUrl?`<a class="btn" style="margin-top:12px" target="_blank" rel="noopener" href="${esc(x.projectUrl)}">Explore project ↗</a>`:''}</div></article>`).join(''):'<div class="empty">More ${esc(service.title)} projects are coming soon.</div>'}</div></div></section>
      <section class="service-section" id="book"><div class="container"><div class="booking"><span class="eyebrow">BOOK THIS SERVICE</span><h2>Let's build it.</h2><p>Tell us what you need. This creates a project enquiry in the Creatarsh manager so we can follow up with you.</p><form id="serviceBookForm"><div class="form-grid"><div class="field"><label>Name</label><input name="name" required placeholder="Your name"></div><div class="field"><label>Email</label><input name="email" type="email" required placeholder="you@company.com"></div><div class="field"><label>WhatsApp / Phone</label><input name="whatsapp" placeholder="+91"></div><div class="field"><label>Company</label><input name="company" placeholder="Business name"></div><div class="field"><label>Package</label><select name="budget"><option value="Custom">Custom / Need advice</option>${packages.map(x=>`<option>${esc(x.name)} — ${esc(x.price)}</option>`).join('')}</select></div><div class="field"><label>Timeline</label><input name="deadline" placeholder="e.g. 2–4 weeks"></div><div class="field full"><label>What do you want us to build?</label><textarea name="requirements" required placeholder="Tell us about your business, goals and required features."></textarea></div><input type="hidden" name="projectType" value="${esc(service.title)}"><input type="hidden" name="referenceUrl" value="${esc(location.href)}"></div><button class="btn primary" type="submit">Book / Send enquiry ↗</button><div id="serviceBookStatus" class="booking-status"></div></form></div></div></section>`;
    document.querySelectorAll('[data-package]').forEach(b=>b.addEventListener('click',()=>{const sel=document.querySelector('#serviceBookForm select[name=budget]');if(sel){const name=b.dataset.package;[...sel.options].forEach(o=>{if(o.textContent.startsWith(name+' '))sel.value=o.textContent})}}));
    document.querySelectorAll('.work-filter button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.work-filter button').forEach(x=>x.classList.remove('active'));b.classList.add('active');const f=b.dataset.filter;document.querySelectorAll('.service-work').forEach(x=>x.style.display=f==='all'||x.dataset.category===f?'block':'none')});
    const f=$('#serviceBookForm');f.onsubmit=async e=>{e.preventDefault();const status=$('#serviceBookStatus'),btn=f.querySelector('button');btn.disabled=true;status.textContent='Sending enquiry…';try{const result=await api('/public/leads',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(f)))});status.textContent=`Enquiry received: ${result.enquiryId}. Creatarsh will contact you.`;f.reset()}catch(err){status.textContent=err.message}finally{btn.disabled=false}};
  }catch(e){root.innerHTML=`<section class="page-head"><div class="container"><h1>Unable to load this service.</h1><p>${esc(e.message)}</p></div></section>`}
}
