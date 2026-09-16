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
  const canvas=document.getElementById('particleLogo');
  const hero=document.querySelector('.hero');
  if(!canvas||!hero)return;
  const ctx=canvas.getContext('2d');
  const source=new Image();
  // Resolve the logo relative to this script so the particle source works whether the
  // customer app is served at /, /customer/, or behind a separate Render service.
  source.src=new URL('../assets/creatarsh-logo.png', document.currentScript?.src || location.href).href;
  let particles=[], target=[], scatter=[], dpr=1, w=0, h=0, raf=0, scrollProgress=1;
  const state={progress:1,time:0};
  function resize(){
    const rect=canvas.getBoundingClientRect();
    dpr=Math.min(window.devicePixelRatio||1,2); w=Math.max(1,rect.width); h=Math.max(1,rect.height);
    canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr); ctx.setTransform(dpr,0,0,dpr,0,0);
    if(target.length) {
      // Recalculate the formed logo positions after responsive resizing.
      target=target.map(p=>({ ...p, x:p.nx*w*.78, y:p.ny*h*.78 }));
      rebuildScatter();
    }
  }
  function rebuildScatter(){
    scatter=target.map((p,i)=>({x:(Math.random()-.5)*w*1.35,y:(Math.random()-.5)*h*1.35,vx:(Math.random()-.5)*.08,vy:(Math.random()-.5)*.08,seed:i*0.37,alpha:.25+Math.random()*.7}));
  }
  function build(){
    const size=520, off=document.createElement('canvas'); off.width=size; off.height=size;
    const oc=off.getContext('2d'); oc.drawImage(source,0,0,size,size);
    const data=oc.getImageData(0,0,size,size).data; target=[];
    const step=Math.max(3,Math.round(size/150));
    for(let y=0;y<size;y+=step){for(let x=0;x<size;x+=step){
      const i=(y*size+x)*4, r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];
      // Ignore the black background; keep the white C and red play mark.
      if(a>80 && (r+g+b)>95){
        const red=r>170 && g<100 && b<100;
        target.push({nx:(x/size-.5),ny:(y/size-.5),x:(x/size-.5)*w*.78,y:(y/size-.5)*h*.78,red,base:Math.random()});
      }
    }}
    particles=target.map((p,i)=>({x:p.x,y:p.y,red:p.red,size:p.red?1.45:1.15,seed:i*.71,alpha:.72+Math.random()*.28}));
    rebuildScatter();
  }
  function clamp(v,a=0,b=1){return Math.max(a,Math.min(b,v))}
  function updateScroll(){
    const r=hero.getBoundingClientRect(), travel=Math.max(1,r.height*.9); state.progress=clamp(1-Math.max(0,-r.top)/travel); scrollProgress=state.progress;
  }
  function frame(t){
    state.time=t*.001; updateScroll(); ctx.clearRect(0,0,w,h);
    const join=Math.pow(scrollProgress,.72), drift=1-join;
    particles.forEach((p,i)=>{
      const s=scatter[i]||{x:0,y:0,seed:i};
      const tx=p.x, ty=p.y;
      let x=tx*join+s.x*drift, y=ty*join+s.y*drift;
      const wave=Math.sin(state.time*1.7+p.seed)*1.6*join;
      x+=Math.cos(state.time*.55+p.seed)*wave; y+=Math.sin(state.time*.65+p.seed)*wave;
      // Add a subtle outward current while scrolling away from hero.
      if(drift>.02){const len=Math.hypot(x,y)||1; x+=(x/len)*drift*28; y+=(y/len)*drift*28}
      const size=p.size*(.72+.55*join);
      ctx.globalAlpha=(.34+.66*join)*p.alpha;
      ctx.fillStyle=p.red?'#ff2417':'#dffff0';
      ctx.shadowBlur=join>0.55?8:3; ctx.shadowColor=p.red?'rgba(255,36,23,.55)':'rgba(37,242,138,.55)';
      ctx.beginPath();ctx.arc(w/2+x,h/2+y,size,0,Math.PI*2);ctx.fill();
      if(join>.78 && i%7===0){ctx.globalAlpha*=.3;ctx.fillStyle='#25f28a';ctx.beginPath();ctx.arc(w/2+x,h/2+y,size*2.8,0,Math.PI*2);ctx.fill()}
    });
    ctx.globalAlpha=1;ctx.shadowBlur=0;raf=requestAnimationFrame(frame);
  }
  source.onload=()=>{resize();build();frame(0)};
  window.addEventListener('resize',resize,{passive:true});
  window.addEventListener('scroll',updateScroll,{passive:true});
}

async function init(){shell();const page=document.body.dataset.page;const d=await content();if(page==='home'){renderHome(d);initParticleLogo();}if(page==='services')renderServices(d);if(page==='work')renderWork(d);if(page==='contact')setupLead();if(page==='faq')renderFaq(d);if(page==='account')account();if(page==='login')authPage('login');if(page==='register')authPage('register');}
init();
