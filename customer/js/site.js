const API = 'http://localhost:5000/api';

const fallbackServices = [
  ['Web Development','High-performance business websites and custom web experiences.'],
  ['Web Applications','Scalable dashboards, portals and workflow-driven applications.'],
  ['Business Systems','Custom management systems that replace manual processes.'],
  ['E-commerce','Modern stores with catalogues, orders and business management.'],
  ['AI & Automation','AI-powered workflows, assistants and business automation.'],
  ['Custom Software','Purpose-built digital products for unique requirements.']
];

function renderServices(items){
  document.querySelector('#servicesGrid').innerHTML = items.map((x,i)=>`<article class="card"><span>0${i+1}</span><h3>${x.title||x[0]}</h3><p>${x.description||x[1]}</p></article>`).join('');
}
function renderPortfolio(items){
  document.querySelector('#portfolioGrid').innerHTML = items.length
    ? items.map(x=>`<article class="card"><span>${x.category||'Project'}</span><h3>${x.title}</h3><p>${x.description||''}</p></article>`).join('')
    : '<article class="card"><span>CREATARSH LAB</span><h3>Portfolio is being prepared.</h3><p>Our first case studies will appear here.</p></article>';
}
renderServices(fallbackServices); renderPortfolio([]);

fetch(API+'/public/services').then(r=>r.ok?r.json():Promise.reject()).then(renderServices).catch(()=>{});
fetch(API+'/public/portfolio').then(r=>r.ok?r.json():Promise.reject()).then(renderPortfolio).catch(()=>{});

document.querySelector('#leadForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const status=document.querySelector('#formStatus');
  const data=Object.fromEntries(new FormData(e.target));
  try{
    const r=await fetch(API+'/public/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(!r.ok) throw new Error();
    status.textContent='Thanks — your project brief has been received.';
    e.target.reset();
  }catch(err){status.textContent='Demo mode: connect the Creatarsh API to submit this form.';}
});
