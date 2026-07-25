const FALLBACK_OBJECTIVES = [
  {"id":"sandown-airport","sequence":1,"name":"SANDOWN AIRPORT","displayName":"Sandown Airport","classification":"AIR OPERATIONS","status":"MONITORING","description":"Island airfield objective serving the eastern and central approaches.","lat":50.65310,"lon":-1.18222,"page":"#sandown-airport"},
  {"id":"bembridge-fort","sequence":2,"name":"BEMBRIDGE FORT","displayName":"Bembridge Fort","classification":"COASTAL DEFENCE","status":"MONITORING","description":"Victorian defensive position overlooking the eastern approaches.","lat":50.6768,"lon":-1.0988,"page":"#bembridge-fort"},
  {"id":"ventnor-radar-station","sequence":3,"name":"VENTNOR RADAR STATION","displayName":"Ventnor Radar Station","classification":"EARLY WARNING","status":"MONITORING","description":"Radar objective positioned on St Martin's Down above Wroxall.","lat":50.6185,"lon":-1.2079,"page":"#ventnor-radar-station"},
  {"id":"appuldurcombe-monument","sequence":4,"name":"APPULDURCOMBE MONUMENT","displayName":"Appuldurcombe Monument","classification":"OBSERVATION POINT","status":"MONITORING","description":"High-ground monument overlooking the Appuldurcombe estate.","lat":50.6224,"lon":-1.2472,"page":"#appuldurcombe-monument"},
  {"id":"carisbrooke-castle","sequence":5,"name":"CARISBROOKE CASTLE","displayName":"Carisbrooke Castle","classification":"FORTIFIED POSITION","status":"MONITORING","description":"Historic fortress controlling the central island approaches.","lat":50.68667,"lon":-1.31472,"page":"#carisbrooke-castle"},
  {"id":"needles-viewpoint","sequence":6,"name":"THE NEEDLES VIEWPOINT","displayName":"The Needles Viewpoint","classification":"WESTERN OBSERVATION","status":"MONITORING","description":"Western observation point overlooking the Needles and Channel.","lat":50.66764,"lon":-1.56618,"page":"#needles-viewpoint"}
];

const ISLAND_BOUNDS=[[50.575,-1.615],[50.785,-1.055]];
const MOVE_MS=1850;
const HOLD_MS=2450;
const state={
  map:null,objectives:[],index:0,timer:null,lockTimer:null,paused:false,
  selected:null,mapReady:false,fitTimer:null,animating:false,cycleStarted:false
};
const els={
  map:document.getElementById("map"),fallback:document.getElementById("fallback"),layer:document.getElementById("objective-layer"),
  reticule:document.getElementById("reticule"),pulse:document.getElementById("lock-pulse"),panel:document.getElementById("intel-panel"),
  close:document.getElementById("close-panel"),pause:document.getElementById("pause-cycle"),sequence:document.getElementById("sequence-readout")
};

function fitIsland(){
  if(!state.map)return;
  clearTimeout(state.fitTimer);
  state.fitTimer=setTimeout(()=>{
    state.map.invalidateSize({pan:false});
    const width=window.innerWidth;
    const padding=width>1200?L.point(150,95):width>900?L.point(90,80):L.point(28,95);
    state.map.fitBounds(ISLAND_BOUNDS,{paddingTopLeft:padding,paddingBottomRight:padding,animate:false,maxZoom:11});
    updatePositions(true);
  },120);
}

function startCycleOnce(){
  if(state.cycleStarted||!state.objectives.length)return;
  state.cycleStarted=true;
  state.index=1;
  state.selected=state.objectives[0];
  setReticulePosition(state.selected,false);
  lockOn(state.selected,false);
  state.timer=window.setTimeout(cycle,HOLD_MS);
}

function initialiseMap(){
  if(!window.L){
    els.fallback.style.zIndex="0";
    window.setTimeout(startCycleOnce,500);
    return;
  }
  state.map=L.map("map",{zoomControl:false,attributionControl:false,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false,tap:false,touchZoom:false,fadeAnimation:true,zoomAnimation:false,preferCanvas:true});
  const imagery=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:18,crossOrigin:true});
  const roads=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",{maxZoom:18,opacity:.30,crossOrigin:true});
  let firstTile=false;
  imagery.on("tileload",()=>{
    if(firstTile)return;
    firstTile=true;
    state.mapReady=true;
    els.fallback.style.display="none";
    fitIsland();
    window.setTimeout(startCycleOnce,450);
  });
  imagery.on("tileerror",()=>{if(!firstTile)els.fallback.style.zIndex="0";});
  imagery.addTo(state.map);roads.addTo(state.map);
  fitIsland();
  state.map.setMaxBounds([[50.54,-1.68],[50.82,-1.00]]);
  state.map.on("moveend zoomend resize",()=>updatePositions(true));
  window.setTimeout(startCycleOnce,1800);
}

function formatCoord(value,positive,negative){
  const hemi=value>=0?positive:negative,abs=Math.abs(value),deg=Math.floor(abs),minFloat=(abs-deg)*60,min=Math.floor(minFloat),sec=Math.round((minFloat-min)*60);
  return `${String(deg).padStart(2,"0")}° ${String(min).padStart(2,"0")}′ ${String(sec).padStart(2,"0")}″ ${hemi}`;
}

function project(obj){
  if(state.mapReady&&state.map){const p=state.map.latLngToContainerPoint([obj.lat,obj.lon]);return{x:p.x,y:p.y};}
  const rect=els.layer.getBoundingClientRect(),lonMin=-1.615,lonMax=-1.055,latMin=50.575,latMax=50.785;
  return{x:((obj.lon-lonMin)/(lonMax-lonMin))*rect.width,y:(1-(obj.lat-latMin)/(latMax-latMin))*rect.height};
}

function updatePositions(forceReticule=false){
  for(const obj of state.objectives){
    if(!obj.button)continue;
    const p=project(obj);obj.button.style.left=`${p.x}px`;obj.button.style.top=`${p.y}px`;
  }
  if(state.selected&&(forceReticule||!state.animating))setReticulePosition(state.selected,false);
}

function createObjectives(){
  els.layer.innerHTML="";
  state.objectives.forEach(obj=>{
    const b=document.createElement("button");b.className="objective";b.type="button";b.setAttribute("aria-label",`Open information for ${obj.displayName}`);
    b.innerHTML=`<span class="objective-label"><strong>OBJ ${String(obj.sequence).padStart(2,"0")}</strong>${obj.name}</span>`;
    b.addEventListener("click",()=>selectObjective(obj,true));els.layer.appendChild(b);obj.button=b;
  });
  requestAnimationFrame(()=>updatePositions(false));
}

function setReticulePosition(obj,animate=true){
  const p=project(obj);
  if(!animate){
    const transition=els.reticule.style.transition;
    els.reticule.style.transition="none";
    els.reticule.style.left=`${p.x}px`;els.reticule.style.top=`${p.y}px`;
    els.pulse.style.left=`${p.x}px`;els.pulse.style.top=`${p.y}px`;
    void els.reticule.offsetWidth;
    els.reticule.style.transition=transition;
  }else{
    els.reticule.style.left=`${p.x}px`;els.reticule.style.top=`${p.y}px`;
    els.pulse.style.left=`${p.x}px`;els.pulse.style.top=`${p.y}px`;
  }
}

function lockOn(obj,showPanel=false){
  state.animating=false;
  els.reticule.classList.remove("searching");els.reticule.classList.add("locked");
  els.pulse.classList.remove("active");void els.pulse.offsetWidth;els.pulse.classList.add("active");
  state.objectives.forEach(o=>o.button.classList.toggle("active",o.id===obj.id));
  document.getElementById("coord-lat").textContent=formatCoord(obj.lat,"N","S");
  document.getElementById("coord-lon").textContent=formatCoord(obj.lon,"E","W");
  document.getElementById("readout-range").textContent=`${(8+obj.sequence*3.1).toFixed(1)} KM`;
  document.getElementById("readout-heading").textContent=`${(obj.sequence*57+18)%360}°`;
  els.sequence.textContent=`${String(obj.sequence).padStart(2,"0")} / ${String(state.objectives.length).padStart(2,"0")}`;
  if(showPanel)openPanel(obj);
}

function selectObjective(obj,showPanel=false){
  clearTimeout(state.timer);clearTimeout(state.lockTimer);
  state.selected=obj;state.animating=true;
  els.reticule.classList.remove("locked");els.reticule.classList.add("searching");
  setReticulePosition(obj,true);
  state.lockTimer=window.setTimeout(()=>lockOn(obj,showPanel),MOVE_MS);
}

function cycle(){
  if(state.paused||!state.objectives.length)return;
  const obj=state.objectives[state.index];
  state.index=(state.index+1)%state.objectives.length;
  selectObjective(obj,false);
  state.timer=window.setTimeout(cycle,MOVE_MS+HOLD_MS);
}

function openPanel(obj){
  state.paused=true;clearTimeout(state.timer);
  document.getElementById("intel-number").textContent=`OBJECTIVE ${String(obj.sequence).padStart(2,"0")}`;
  document.getElementById("intel-name").textContent=obj.name;
  document.getElementById("intel-status").textContent=obj.status;
  document.getElementById("intel-classification").textContent=obj.classification;
  document.getElementById("intel-description").textContent=obj.description;
  document.getElementById("intel-link").href=obj.page;
  els.panel.hidden=false;els.pause.textContent="RESUME";
}

function closePanel(){
  els.panel.hidden=true;state.paused=false;els.pause.textContent="PAUSE";
  state.timer=window.setTimeout(cycle,850);
}

els.close.addEventListener("click",closePanel);
els.pause.addEventListener("click",()=>{
  state.paused=!state.paused;els.pause.textContent=state.paused?"RESUME":"PAUSE";
  if(state.paused){clearTimeout(state.timer);clearTimeout(state.lockTimer);}
  else state.timer=window.setTimeout(cycle,350);
});

async function loadObjectives(){
  try{const response=await fetch("data/objectives.json",{cache:"no-store"});if(!response.ok)throw new Error("Objective data unavailable");return await response.json();}
  catch{return FALLBACK_OBJECTIVES;}
}

(async function start(){
  state.objectives=await loadObjectives();
  createObjectives();
  initialiseMap();
  window.addEventListener("resize",fitIsland);
})();