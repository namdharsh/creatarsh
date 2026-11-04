/* 100 data-driven resume templates: 10 layout systems × 10 visual themes */
const templateNames=["Atlas","Avenue","Bristol","Caspian","Dover","Eclipse","Forma","Grove","Harbor","Ivory"];
const layouts=[
 ["ATS Single Column","ats","A clean, single-column structure designed for easy reading."],
 ["Modern Sidebar","sidebar","A balanced two-column layout with a clear information hierarchy."],
 ["Executive Editorial","editorial","A refined, typography-led layout for experienced professionals."],
 ["Compact Professional","compact","Space-efficient formatting for detailed career histories."],
 ["Minimalist","minimal","Quiet typography and generous whitespace."],
 ["Bold Header","bold","A confident header with crisp section divisions."],
 ["Creative Portfolio","creative","A distinctive layout for creative and design roles."],
 ["Academic CV","academic","A structured format for education, research and publications."],
 ["Graduate Starter","graduate","Education, projects and transferable skills take priority."],
 ["Technical Specialist","technical","A structured, skills-forward layout for technical roles."]
];
const palettes=[
 ["Slate","#334155","#64748b","#f1f5f9"],["Ocean","#174a63","#287c91","#eaf4f6"],["Forest","#285746","#658875","#edf4ef"],["Burgundy","#713d4c","#a56d7b","#f7eef1"],["Indigo","#3f477d","#777fb5","#f0f1fa"],["Copper","#80543b","#b17b55","#f7f0e9"],["Graphite","#292d32","#777d84","#f0f1f2"],["Teal","#176b69","#4a9b95","#eaf5f4"],["Plum","#62456e","#9675a3","#f5eff7"],["Monochrome","#202124","#777777","#f3f3f3"]
];
const templates=Array.from({length:100},(_,i)=>{
 const layout=i%10,palette=Math.floor(i/10),[layoutName,layoutKey,description]=layouts[layout],[paletteName,accent,secondary,tint]=palettes[palette];
 return {id:`resume-${String(i+1).padStart(3,"0")}`,number:i+1,name:`${templateNames[layout]} ${paletteName}`,layout:layoutKey,layoutName,paletteName,accent,secondary,tint,description,category:layoutKey==="ats"||layoutKey==="compact"||layoutKey==="technical"?"ATS & Professional":layoutKey==="graduate"?"Students & Freshers":layoutKey==="academic"?"Academic":layoutKey==="creative"?"Creative":"Modern & Executive",recommended:layoutKey==="ats"||layoutKey==="compact"};
});
if(typeof window!=="undefined")window.CREATARSH_TEMPLATES=templates;
