const API='http://localhost:5000/api';
fetch(API+'/manager/stats').then(r=>r.json()).then(s=>{
  document.querySelector('#portfolioCount').textContent=s.portfolio||0;
  document.querySelector('#serviceCount').textContent=s.services||0;
  document.querySelector('#leadCount').textContent=s.leads||0;
}).catch(()=>{});
