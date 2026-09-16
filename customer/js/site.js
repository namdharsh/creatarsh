const defaultApi=(location.hostname==='localhost'||location.hostname==='127.0.0.1')?'':'https://creatarsh.onrender.com';
const API=(window.CREATARSH_API_URL||defaultApi).replace(/\/$/,'')+'/api';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const token=()=>localStorage.getItem('cr_customer_token');
const customer=()=>{try{return JSON.parse(localStorage.getItem('cr_customer')||'null')}catch{return null}};
const save=(d)=>{localStorage.setItem('cr_customer_token',d.token);localStorage.setItem('cr_customer',JSON.stringify(d.customer));};
const logout=()=>{localStorage.removeItem('cr_customer_token');localStorage.removeItem('cr_customer');location.href='/login';};
async function api(path,opt={}){const h={'Content-Type':'application/json',...(opt.headers||{})};if(token())h.Authorization='Bearer '+token();const r=await fetch(API+path,{...opt,headers:h});let d={};try{d=await r.json()}catch{}if(!r.ok){const e=new Error(d.message||`Request failed (${r.status})`);e.status=r.status;throw e}return d}
function nav(){const c=customer();const account=$('#accountLink');if(account){account.textContent=c?'My Account':'Client Login';account.href=c?'/account':'/login';account.classList.toggle('active',location.pathname.includes('account')||location.pathname.includes('login'))}}
function shell(){nav();const y=$('#year');if(y)y.textContent=new Date().getFullYear();}
async function content(){try{return await api('/public/content')}catch{return {services:[],portfolio:[],testimonials:[],faqs:[],site:{}}}}
function renderHome(d){const s=d.site||{};if($('.hero-title')&&s.heroTitle) $('.hero-title').innerHTML=esc(s.heroTitle).replace(/\n/g,'<br>');if($('.hero-text')&&s.heroText)$('.hero-text').textContent=s.heroText;const services=$('#serviceGrid');if(services)services.innerHTML=(d.services||[]).slice(0,6).map(x=>`<article class="card"><div class="icon">${esc(x.icon||'✦')}</div><h3>${esc(x.title)}</h3><p>${esc(x.description)}</p><div class="price">${x.startingPrice?'Starting ₹'+Number(x.startingPrice).toLocaleString('en-IN'):''}</div></article>`).join('')||'<div class="empty">Services will appear here.</div>';const work=$('#workGrid');if(work)work.innerHTML=(d.portfolio||[]).slice(0,4).map(x=>`<article class="card work-card"><div class="work-media">${x.media?.[0]?`<img src="${esc(x.media[0])}" alt="${esc(x.title)}" style="width:100%;height:100%;object-fit:cover">`:'CREATARSH'}</div><div class="work-body"><span class="tag">${esc(x.category||'Project')}</span><h3>${esc(x.title)}</h3><p>${esc(x.description||'')}</p></div></article>`).join('')||'<div class="empty">Portfolio projects will appear here.</div>';const testimonials=$('#testimonialGrid');if(testimonials)testimonials.innerHTML=(d.testimonials||[]).slice(0,3).map(x=>`<article class="card"><div class="quote">“${esc(x.quote||'Great experience.') }”</div><p style="margin-top:20px">${esc(x.name)} · ${esc(x.company||'Client')}</p></article>`).join('')||'<div class="empty">Client stories will appear here.</div>';}
function renderServices(d){const el=$('#allServices');if(!el)return;el.innerHTML=(d.services||[]).map(x=>`<article class="card"><div class="icon">${esc(x.icon||'✦')}</div><h3>${esc(x.title)}</h3><p>${esc(x.description)}</p><div class="price">${x.startingPrice?'From ₹'+Number(x.startingPrice).toLocaleString('en-IN'):''} ${x.timeline?' · '+esc(x.timeline):''}</div>${x.features?.length?`<ul class="muted">${x.features.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>`:''}<a class="btn" style="margin-top:18px" href="/contact">Discuss this service ↗</a></article>`).join('')||'<div class="empty">No services published yet.</div>'}
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
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)return;
  const source=new Image();
  source.src=new URL('../assets/creatarsh-logo.png', document.currentScript?.src || location.href).href;

  let particles=[], target=[], dpr=1, w=0, h=0;
  const state={progress:hero?1:0,time:0,velocity:0,lastScroll:window.scrollY||0};
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));

  function resize(){
    w=Math.max(1,window.innerWidth); h=Math.max(1,window.innerHeight);
    dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr);
    canvas.style.width=w+'px'; canvas.style.height=h+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if(target.length) buildScatter();
  }

  function buildScatter(){
    const cx=w*.69, cy=h*.43;
    particles.forEach((p,i)=>{
      const angle=Math.random()*Math.PI*2;
      const radius=Math.max(w,h)*(0.16+Math.random()*.58);
      p.sx=cx+Math.cos(angle)*radius;
      p.sy=cy+Math.sin(angle)*radius*.78;
      p.vx=Math.cos(angle)*(18+Math.random()*75);
      p.vy=Math.sin(angle)*(18+Math.random()*75);
      p.drift=(Math.random()-.5)*.9;
      p.twinkle=Math.random()*Math.PI*2;
    });
  }

  function build(){
    const size=600, off=document.createElement('canvas'); off.width=size; off.height=size;
    const oc=off.getContext('2d');
    oc.clearRect(0,0,size,size);
    oc.drawImage(source,0,0,size,size);
    const data=oc.getImageData(0,0,size,size).data;
    target=[];
    const step=3;
    for(let y=0;y<size;y+=step){
      for(let x=0;x<size;x+=step){
        const i=(y*size+x)*4;
        const r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];
        if(a>70 && r+g+b>105){
          target.push({
            nx:x/size-.5, ny:y/size-.5,
            red:r>170&&g<110&&b<110,
            seed:Math.random()*100
          });
        }
      }
    }
    // Keep the effect performant while retaining a dense, clearly particle-based mark.
    if(target.length>9000){
      target=target.filter((_,i)=>i%Math.ceil(target.length/9000)===0);
    }
    particles=target.map((p,i)=>({
      ...p,x:0,y:0,sx:0,sy:0,vx:0,vy:0,size:p.red?1.15:1.0,
      alpha:.48+Math.random()*.52
    }));
    buildScatter();
  }

  function updateProgress(){
    const y=window.scrollY||0;
    state.velocity=Math.abs(y-state.lastScroll);
    state.lastScroll=y;
    if(!hero){state.progress=0;return}
    const r=hero.getBoundingClientRect();
    // Keep the logo formed while the hero is visible, then trigger a splash as it leaves.
    const travel=Math.max(260,Math.min(window.innerHeight*1.15,hero.offsetHeight*.72));
    state.progress=clamp(1-Math.max(0,-r.top)/travel);
  }

  function drawParticle(p,i,join,scatter){
    const cx=w*.69, cy=h*.43;
    const tx=cx+p.nx*Math.min(w*.50,h*.68);
    const ty=cy+p.ny*Math.min(w*.50,h*.68);
    const burst=Math.pow(scatter,1.35);
    let x=tx*join+p.sx*scatter;
    let y=ty*join+p.sy*scatter;

    // Radial splash: particles accelerate away from the formed logo as it leaves the hero.
    const dx=p.sx-cx, dy=p.sy-cy, len=Math.hypot(dx,dy)||1;
    const wave=Math.sin(state.time*5+p.seed)*(.7+scatter*2.5);
    x+=(dx/len)*(burst*55+state.velocity*0.22)+wave;
    y+=(dy/len)*(burst*55+state.velocity*0.16)+Math.cos(state.time*4+p.seed)*(.7+scatter*2.2);

    // Ambient movement keeps scattered particles visible across the whole site.
    x+=Math.sin(state.time*.45+p.twinkle)*10*scatter + p.vx*scatter*.045;
    y+=Math.cos(state.time*.38+p.twinkle)*9*scatter + p.vy*scatter*.045;

    const size=p.size*(.72+.7*join)*(1+Math.min(scatter,.9)*.25);
    const alpha=(.2+.78*join+.16*scatter)*p.alpha;
    ctx.globalAlpha=Math.min(.92,alpha);
    ctx.fillStyle=p.red?'#ff2417':'#8fffc6';
    ctx.shadowBlur=join>.7?7:3;
    ctx.shadowColor=p.red?'rgba(255,36,23,.55)':'rgba(37,242,138,.5)';
    ctx.beginPath();ctx.arc(x,y,size,0,Math.PI*2);ctx.fill();
    if(i%13===0 && scatter>.18){
      ctx.globalAlpha*=.16;
      ctx.beginPath();ctx.arc(x,y,size*3.5,0,Math.PI*2);ctx.fill();
    }
  }

  function frame(t){
    state.time=t*.001;
    updateProgress();
    ctx.clearRect(0,0,w,h);
    const join=Math.pow(state.progress,.72);
    const scatter=1-join;
    particles.forEach((p,i)=>drawParticle(p,i,join,scatter));
    ctx.globalAlpha=1;ctx.shadowBlur=0;
    requestAnimationFrame(frame);
  }

  source.onload=()=>{resize();build();requestAnimationFrame(frame)};
  source.onerror=()=>{canvas.style.display='none'};
  window.addEventListener('resize',resize,{passive:true});
  window.addEventListener('scroll',updateProgress,{passive:true});
}

async function init(){shell();const page=document.body.dataset.page;const d=await content();if(page==='home'){renderHome(d);initParticleLogo();}if(page==='services')renderServices(d);if(page==='work')renderWork(d);if(page==='contact')setupLead();if(page==='faq')renderFaq(d);if(page==='account')account();if(page==='login')authPage('login');if(page==='register')authPage('register');}
init();
