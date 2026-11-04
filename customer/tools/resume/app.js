const $=id=>document.getElementById(id);
const steps=["personal","summary","experience","education","projects","skills","extras"];
const fields=["name","title","email","phone","location","link","summary","skills","additional","certifications","languages","awards"];
let current=0, saveTimer;
const escapeHTML=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const val=id=>$(id)?.value.trim()||"";
function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),2600);}
function addCard(type,data={}){
 const template=$(type+"Template"),card=template.content.cloneNode(true).querySelector(".repeat-card");
 Object.entries(data).forEach(([k,v])=>{const el=card.querySelector("."+k);if(el)el.value=v;});
 card.querySelector(".remove-button").addEventListener("click",()=>{card.remove();render();});
 card.querySelectorAll("input,textarea").forEach(el=>el.addEventListener("input",render));
 $(type+"List").append(card);render();
}
function cardData(type){return [...document.querySelectorAll("#"+type+"List .repeat-card")].map(c=>Object.fromEntries([...c.querySelectorAll("input,textarea")].map(el=>[el.className,el.value.trim()])));}
function visibleCards(type){return cardData(type).filter(x=>Object.values(x).some(Boolean));}
function itemHTML(title,sub,date,desc){return `<div class="resume-item"><div class="resume-item-top"><span>${escapeHTML(title)}</span><span>${escapeHTML(date)}</span></div>${sub?`<div class="resume-item-sub">${escapeHTML(sub)}</div>`:""}${desc?`<div class="resume-item-desc">${escapeHTML(desc)}</div>`:""}</div>`;}
function render(){
 $("pName").textContent=val("name")||"Your Name";$("pTitle").textContent=val("title")||"Professional Title";
 $("pContact").textContent=[val("location"),val("phone"),val("email")].filter(Boolean).join(" · ");
 $("pContact").style.display=$("pContact").textContent?"":"none";
 $("pLink").textContent=val("link");$("pLink").style.display=val("link")?"":"none";
 $("pSummary").textContent=val("summary")||"Add a concise professional introduction highlighting your experience, strengths and career direction.";
 $("pSummaryBlock").style.display=val("summary")?"":"none";
 const exp=visibleCards("experience");$("pExperience").innerHTML=exp.map(x=>itemHTML(x["exp-role"]||"Role",x["exp-company"],[x["exp-start"],x["exp-end"]].filter(Boolean).join(" – "),x["exp-desc"])).join("");
 $("pExperienceBlock").style.display=exp.length?"":"none";
 const edu=visibleCards("education");$("pEducation").innerHTML=edu.map(x=>itemHTML(x["edu-degree"]||"Qualification",x["edu-school"],x["edu-year"],"")).join("");
 $("pEducationBlock").style.display=edu.length?"":"none";
 const projects=visibleCards("project");$("pProjects").innerHTML=projects.map(x=>itemHTML(x["proj-name"]||"Project",[x["proj-role"],x["proj-link"]].filter(Boolean).join(" · "),"",x["proj-desc"])).join("");
 $("pProjectsBlock").style.display=projects.length?"":"none";
 $("pSkills").textContent=val("skills").split(",").map(x=>x.trim()).filter(Boolean).join("  ·  ");
 $("pSkillsBlock").style.display=$("pSkills").textContent?"":"none";
 $("pAdditional").textContent=[val("additional"),val("certifications")].filter(Boolean).join("\n");$("pAdditionalBlock").style.display=$("pAdditional").textContent?"":"none";
 $("pLanguages").textContent=val("languages");$("pLanguagesBlock").style.display=val("languages")?"":"none";
 $("pAwards").textContent=val("awards");$("pAwardsBlock").style.display=val("awards")?"":"none";
 updateQuality();scheduleSave();
}
function completion(){
 const checks=[
  !!val("name"),!!val("email"),!!val("phone"),!!val("title"),!!val("summary"),
  visibleCards("experience").length>0||visibleCards("education").length>0,
  !!val("skills"),visibleCards("education").length>0,visibleCards("project").length>0||!!val("certifications")
 ];
 return Math.round(checks.filter(Boolean).length/checks.length*100);
}
function updateQuality(){
 const checks=[
  ["Full name",!!val("name"),"Add your name"],
  ["Contact details",!!val("email")&&!!val("phone"),"Add both email and phone"],
  ["Professional title",!!val("title"),"Add the role you're targeting"],
  ["Summary",val("summary").length>=60,"Write a focused 2–4 sentence profile"],
  ["Experience or education",visibleCards("experience").length>0||visibleCards("education").length>0,"Add relevant experience or education"],
  ["Skills",val("skills").split(",").filter(x=>x.trim()).length>=3,"Add at least 3 relevant skills"],
  ["Achievements",visibleCards("experience").some(x=>x["exp-desc"].length>30)||visibleCards("project").some(x=>x["proj-desc"].length>30),"Describe outcomes, not only responsibilities"],
  ["Additional sections",!!(val("certifications")||val("languages")||val("awards")||visibleCards("project").length),"Add projects, certifications or languages"]
 ];
 const score=Math.round(checks.filter(x=>x[1]).length/checks.length*100);
 $("qualityScore").textContent=score+"/100";
 $("qualityList").innerHTML=checks.map(([name,ok,tip])=>`<div class="quality-item ${ok?"good":""}"><i></i><span>${escapeHTML(name)} · ${ok?"Looks good":escapeHTML(tip)}</span></div>`).join("");
 const pct=completion();$("progressBar").style.width=pct+"%";$("progressLabel").textContent=pct+"% complete";$("progressHint").textContent=pct>=90?"Great progress. Review your details before exporting.":"Complete the key sections to strengthen your resume.";
}
function snapshot(){return {version:2,updatedAt:new Date().toISOString(),fields:Object.fromEntries(fields.map(id=>[id,val(id)])),experience:cardData("experience"),education:cardData("education"),project:cardData("project"),template:localStorage.getItem("creatarshSelectedTemplate")||"resume-001"};}
function scheduleSave(){ $("saveState").textContent="Saving…";clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem("creatarshResumeDraftV2",JSON.stringify(snapshot()));$("saveState").textContent="Saved on this device";}catch(e){$("saveState").textContent="Could not save";}},300);}
function loadSnapshot(data){
 if(!data||typeof data!=="object"||Array.isArray(data))throw Error("Invalid backup");
 if(data.fields!==undefined&&(!data.fields||typeof data.fields!=="object"||Array.isArray(data.fields)))throw Error("Invalid fields");
 const cleanText=value=>typeof value==="string"?value.slice(0,12000):"";
 fields.forEach(id=>{const el=$(id);if(el)el.value=cleanText(data.fields?.[id]);});
 ["experience","education","project"].forEach(type=>{
  const list=$(type+"List");list.innerHTML="";
  const items=data[type]===undefined?[]:data[type];
  if(!Array.isArray(items)||items.length>100)throw Error("Invalid "+type+" entries");
  items.forEach(item=>{
   if(!item||typeof item!=="object"||Array.isArray(item))return;
   const safe={};Object.entries(item).forEach(([key,value])=>{if(/^(exp-|edu-|proj-)/.test(key))safe[key]=cleanText(value);});
   addCard(type,safe);
  });
 });
 const requested=typeof data.template==="string"?data.template:"resume-001";
 const template=(window.CREATARSH_TEMPLATES||[]).some(t=>t.id===requested)?requested:"resume-001";
 localStorage.setItem("creatarshSelectedTemplate",template);setTemplate(template);render();
}
function setTemplate(id){const t=(window.CREATARSH_TEMPLATES||[]).find(x=>x.id===id)||window.CREATARSH_TEMPLATES?.[0];if(!t)return;const el=$("resumePreview");el.className="resume template-"+t.layout;el.style.setProperty("--accent",t.accent);el.style.setProperty("--secondary",t.secondary);el.style.setProperty("--tint",t.tint);$("selectedTemplateLabel").textContent=t.name;}
function showStep(i){current=Math.max(0,Math.min(steps.length-1,i));document.querySelectorAll(".tab").forEach((t,n)=>t.classList.toggle("active",n===current));document.querySelectorAll(".form-section").forEach((s,n)=>s.classList.toggle("active",n===current));$("prevBtn").disabled=current===0;$("nextBtn").innerHTML=current===steps.length-1?"Review resume ✓":'Continue <span>→</span>';$("stepText").textContent=`Step ${current+1} of ${steps.length}`;}
$("resumeForm").addEventListener("submit",event=>event.preventDefault());
document.querySelectorAll(".tab").forEach((t,i)=>t.addEventListener("click",()=>showStep(i)));
$("nextBtn").addEventListener("click",()=>current===steps.length-1?(showStep(0),toast("Review your resume preview and quality check.")):showStep(current+1));
$("prevBtn").addEventListener("click",()=>showStep(current-1));
$("addExperience").addEventListener("click",()=>addCard("experience"));$("addEducation").addEventListener("click",()=>addCard("education"));$("addProject").addEventListener("click",()=>addCard("project"));
fields.forEach(id=>$(id).addEventListener("input",render));
document.querySelectorAll(".template").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".template").forEach(x=>x.classList.toggle("active",x===b));setTemplate(b.dataset.template);scheduleSave();}));
$("downloadBtn").addEventListener("click",()=>{if(!val("name")){toast("Add your name before exporting.");showStep(0);return;}window.print();});
$("resetBtn").addEventListener("click",()=>{if(!confirm("Clear your resume and start again? This removes the saved draft on this device."))return;fields.forEach(id=>$(id).value="");$("jobDescription").value="";$("matchText").textContent="Job match not checked";["experience","education","project"].forEach(t=>$(t+"List").innerHTML="");localStorage.removeItem("creatarshResumeDraftV2");localStorage.setItem("creatarshSelectedTemplate","resume-001");setTemplate("resume-001");showStep(0);render();toast("Your resume has been reset.");});
$("backupBtn").addEventListener("click",()=>{const blob=new Blob([JSON.stringify(snapshot(),null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="my-creatarsh-resume-backup.json";a.click();URL.revokeObjectURL(a.href);toast("Resume backup downloaded.");});
$("importBtn").addEventListener("click",()=>$("importFile").click());
$("importFile").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>2*1024*1024)throw Error("Backup is too large");const data=JSON.parse(await file.text());loadSnapshot(data);toast("Resume backup imported.");}catch(err){toast("This backup file is not valid.");}e.target.value="";});
$("matchBtn").addEventListener("click",()=>{const job=val("jobDescription").toLowerCase();if(job.length<30){toast("Paste a longer job description first.");return;}const snap=snapshot();const resume=[...fields.map(val),...["experience","education","project"].flatMap(k=>(snap[k]||[]).flatMap(item=>Object.values(item)))].join(" ").toLowerCase();const words=[...new Set(job.match(/[a-z][a-z+#.-]{2,}/g)||[])].filter(w=>!["the","and","for","with","you","our","are","will","this","that","from","your","have","has","who","all","can","not","job","role","work","team","years","ability","strong","including","such","their","into","about","what","their"].includes(w));const hits=words.filter(w=>resume.includes(w));const pct=words.length?Math.round(hits.length/words.length*100):0;$("matchText").textContent=`${pct}% keyword overlap · ${hits.length} of ${words.length} terms found`;toast("Keyword comparison completed locally. This is not an ATS prediction.");});
$("coverBtn").addEventListener("click",()=>{if(!val("name")){toast("Add your name first.");showStep(0);return;}const role=val("title")||"the position";const body=`Dear Hiring Manager,\n\nI am writing to express my interest in the ${role} opportunity. ${val("summary")||"I bring a thoughtful approach, a willingness to learn and a commitment to delivering quality work."}\n\n${visibleCards("experience").length?`In my experience, I have worked on ${visibleCards("experience").map(x=>x["exp-role"]||"relevant projects").join(", ")}, developing skills that I would be excited to bring to your team.`:"My education and skills have helped me build a strong foundation, and I am eager to apply them in a professional environment."}\n\nThank you for your time and consideration. I would welcome the opportunity to discuss how my background aligns with your needs.\n\nSincerely,\n${val("name")}`;const w=window.open("","_blank");if(!w){toast("Allow pop-ups to open your cover letter draft.");return;}w.document.write(`<title>Cover letter draft</title><pre style="white-space:pre-wrap;font:15px/1.7 Arial;max-width:760px;margin:60px auto;padding:20px;color:#252b34">${escapeHTML(body)}</pre>`);w.document.close();});
function restore(){try{const raw=localStorage.getItem("creatarshResumeDraftV2");if(raw){loadSnapshot(JSON.parse(raw));return;}}catch(e){console.warn("Could not restore draft",e);}render();}
restore();setTemplate(localStorage.getItem("creatarshSelectedTemplate")||"resume-001");showStep(0);
