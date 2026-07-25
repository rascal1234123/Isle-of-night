const MOVE_MS=1800;
const HOLD_MS=2400;
const INTERRUPTION_MS=3000;

const state={
  map:null,
  objectives:[],
  index:0,
  timer:null,
  lockTimer:null,
  paused:false,
  selected:null,
  mapReady:false,
  interrupting:false
};

const els={
  map:document.getElementById("map"),
  markerLayer:document.getElementById("marker-layer"),
  list:document.getElementById("objective-list"),
  reticule:document.getElementById("reticule"),
  pulse:document.getElementById("pulse"),
  leader:document.getElementById("leader"),
  leaderLine:document.getElementById("leader-line"),
  pause:document.getElementById("pause-cycle"),
  reset:document.getElementById("reset-view"),
  interruption:document.getElementById("feed-interruption")
};

async function loadObjectives(){
  const response=await fetch("data/objectives.json",{cache:"no-store"});
  if(!response.ok)throw new Error("Objective data unavailable");
  return response.json();
}

function formatCoord(value,positive,negative){
  const hemisphere=value>=0?positive:negative;
  const absolute=Math.abs(value);
  const degrees=Math.floor(absolute);
  const minutesFloat=(absolute-degrees)*60;
  const minutes=Math.floor(minutesFloat);
  const seconds=Math.round((minutesFloat-minutes)*60);
  return `${String(degrees).padStart(2,"0")}° ${String(minutes).padStart(2,"0")}′ ${String(seconds).padStart(2,"0")}″ ${hemisphere}`;
}

function objectiveBounds(){
  return L.latLngBounds(state.objectives.map(objective=>[objective.lat,objective.lon])).pad(window.innerWidth<=980?.16:.12);
}

function fitIsland(){
  if(!state.map)return;
  state.map.invalidateSize({pan:false});
  const mobile=window.innerWidth<=980;
  state.map.fitBounds(objectiveBounds(),{
    paddingTopLeft:L.point(mobile?22:66,mobile?72:56),
    paddingBottomRight:L.point(mobile?22:66,mobile?44:56),
    animate:false,
    maxZoom:11
  });
  updatePositions(true);
}

function initialiseMap(){
  state.map=L.map("map",{
    zoomControl:false,
    attributionControl:false,
    dragging:false,
    scrollWheelZoom:false,
    doubleClickZoom:false,
    boxZoom:false,
    keyboard:false,
    tap:false,
    touchZoom:false,
    fadeAnimation:true,
    zoomAnimation:false,
    preferCanvas:true
  });

  const imagery=L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {maxZoom:18,crossOrigin:true,keepBuffer:4}
  );
  const roads=L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
    {maxZoom:18,opacity:.18,crossOrigin:true,keepBuffer:4}
  );

  let ready=false;
  imagery.on("tileload",()=>{
    if(ready)return;
    ready=true;
    state.mapReady=true;
    fitIsland();
    startCycle();
  });

  imagery.addTo(state.map);
  roads.addTo(state.map);
  fitIsland();
  state.map.on("moveend zoomend resize",()=>updatePositions(true));
  window.setTimeout(()=>{if(!state.selected)startCycle();},1800);
}

function project(objective){
  if(state.mapReady&&state.map){
    const point=state.map.latLngToContainerPoint([objective.lat,objective.lon]);
    return{x:point.x,y:point.y};
  }
  const rect=els.map.getBoundingClientRect();
  const bounds=state.objectives.reduce((acc,current)=>({
    minLat:Math.min(acc.minLat,current.lat),
    maxLat:Math.max(acc.maxLat,current.lat),
    minLon:Math.min(acc.minLon,current.lon),
    maxLon:Math.max(acc.maxLon,current.lon)
  }),{minLat:90,maxLat:-90,minLon:180,maxLon:-180});
  return{
    x:((objective.lon-bounds.minLon)/(bounds.maxLon-bounds.minLon))*rect.width,
    y:(1-(objective.lat-bounds.minLat)/(bounds.maxLat-bounds.minLat))*rect.height
  };
}

function createInterface(){
  els.markerLayer.innerHTML="";
  els.list.innerHTML="";

  state.objectives
    .sort((a,b)=>a.sequence-b.sequence)
    .forEach(objective=>{
      const marker=document.createElement("button");
      marker.className="marker";
      marker.dataset.type=objective.behaviour?.type||"standard";
      marker.type="button";
      marker.setAttribute("aria-label",`Select ${objective.shortName}`);
      marker.addEventListener("click",()=>selectObjective(objective,true));
      els.markerLayer.appendChild(marker);
      objective.marker=marker;

      const item=document.createElement("button");
      item.className="objective-item";
      item.type="button";
      item.innerHTML=`<span>${String(objective.sequence).padStart(2,"0")}</span><span>${objective.shortName}</span>`;
      item.addEventListener("click",()=>selectObjective(objective,true));
      els.list.appendChild(item);
      objective.item=item;
    });

  requestAnimationFrame(()=>updatePositions(false));
}

function setReticule(objective,animate=true){
  const point=project(objective);
  if(!animate){
    const transition=els.reticule.style.transition;
    els.reticule.style.transition="none";
    els.reticule.style.left=`${point.x}px`;
    els.reticule.style.top=`${point.y}px`;
    els.pulse.style.left=`${point.x}px`;
    els.pulse.style.top=`${point.y}px`;
    void els.reticule.offsetWidth;
    els.reticule.style.transition=transition;
  }else{
    els.reticule.style.left=`${point.x}px`;
    els.reticule.style.top=`${point.y}px`;
    els.pulse.style.left=`${point.x}px`;
    els.pulse.style.top=`${point.y}px`;
  }
}

function updatePositions(force=false){
  state.objectives.forEach(objective=>{
    const point=project(objective);
    objective.marker.style.left=`${point.x}px`;
    objective.marker.style.top=`${point.y}px`;
  });
  if(state.selected)setReticule(state.selected,!force);
  if(state.selected)drawLeader(state.selected);
}

function drawLeader(objective){
  if(!objective||window.innerWidth<=980){
    els.leader.classList.remove("active");
    return;
  }
  const point=project(objective);
  const mapRect=els.map.getBoundingClientRect();
  const workspace=document.querySelector(".workspace").getBoundingClientRect();
  const endX=mapRect.width;
  const endY=Math.max(94,Math.min(mapRect.height-40,point.y));
  const elbowX=Math.min(endX-44,point.x+100);
  els.leaderLine.setAttribute("points",`${point.x},${point.y} ${elbowX},${point.y} ${elbowX},${endY} ${endX},${endY}`);
  els.leader.classList.add("active");
}

function updatePanel(objective){
  document.getElementById("intel-number").textContent=String(objective.sequence).padStart(2,"0");
  document.getElementById("intel-name").textContent=objective.name;
  document.getElementById("intel-classification").textContent=objective.classification;
  document.getElementById("intel-status").textContent=objective.status;
  document.getElementById("intel-description").textContent=objective.description;
  document.getElementById("intel-link").href=objective.page;
  const latitude=formatCoord(objective.lat,"N","S");
  const longitude=formatCoord(objective.lon,"E","W");
  document.getElementById("coord-lat").textContent=latitude;
  document.getElementById("coord-lon").textContent=longitude;
  document.getElementById("panel-lat").textContent=latitude;
  document.getElementById("panel-lon").textContent=longitude;
  document.getElementById("sequence-readout").textContent=`${String(objective.sequence).padStart(2,"0")} / ${String(state.objectives.length).padStart(2,"0")}`;
}

function runCarisbrookeInterruption(){
  if(state.interrupting)return;
  state.interrupting=true;
  clearTimeout(state.timer);
  clearTimeout(state.lockTimer);
  els.leader.classList.remove("active");
  els.interruption.hidden=false;

  window.setTimeout(()=>{
    els.interruption.hidden=true;
    state.interrupting=false;
    const next=state.objectives[state.index];
    state.index=(state.index+1)%state.objectives.length;
    selectObjective(next,false);
    state.timer=window.setTimeout(cycle,MOVE_MS+HOLD_MS);
  },INTERRUPTION_MS);
}

function lockOn(objective){
  updatePanel(objective);
  els.reticule.classList.remove("searching");
  els.reticule.classList.add("locked");
  els.pulse.className="pulse";
  if(objective.behaviour?.pulse==="slow")els.pulse.classList.add("slow");
  void els.pulse.offsetWidth;
  els.pulse.classList.add("active");

  state.objectives.forEach(item=>{
    const active=item.id===objective.id;
    item.marker.classList.toggle("active",active);
    item.item.classList.toggle("active",active);
  });
  drawLeader(objective);

  if(objective.id==="carisbrooke-castle")runCarisbrookeInterruption();
}

function selectObjective(objective,manual=false){
  if(state.interrupting)return;
  clearTimeout(state.timer);
  clearTimeout(state.lockTimer);
  state.selected=objective;
  state.index=(state.objectives.findIndex(item=>item.id===objective.id)+1)%state.objectives.length;
  els.reticule.classList.remove("locked");
  els.reticule.classList.add("searching");
  setReticule(objective,true);
  state.lockTimer=window.setTimeout(()=>{
    lockOn(objective);
    if(manual){
      state.paused=true;
      els.pause.textContent="RESUME";
    }
  },MOVE_MS);
}

function cycle(){
  if(state.paused||state.interrupting||!state.objectives.length)return;
  const objective=state.objectives[state.index];
  state.index=(state.index+1)%state.objectives.length;
  selectObjective(objective,false);
  if(objective.id!=="carisbrooke-castle"){
    state.timer=window.setTimeout(cycle,MOVE_MS+HOLD_MS);
  }
}

function startCycle(){
  if(state.selected||!state.objectives.length)return;
  state.selected=state.objectives[0];
  state.index=1;
  setReticule(state.selected,false);
  lockOn(state.selected);
  state.timer=window.setTimeout(cycle,HOLD_MS);
}

function updateClock(){
  document.getElementById("system-time").textContent=`${new Date().toISOString().slice(11,19)} GMT`;
}

els.pause.addEventListener("click",()=>{
  state.paused=!state.paused;
  els.pause.textContent=state.paused?"RESUME":"PAUSE";
  if(state.paused){
    clearTimeout(state.timer);
    clearTimeout(state.lockTimer);
  }else{
    state.timer=window.setTimeout(cycle,350);
  }
});

els.reset.addEventListener("click",fitIsland);

(async()=>{
  try{
    state.objectives=await loadObjectives();
    createInterface();
    initialiseMap();
    updateClock();
    window.setInterval(updateClock,1000);
    window.addEventListener("resize",fitIsland);
    window.addEventListener("orientationchange",()=>window.setTimeout(fitIsland,250));
  }catch(error){
    console.error(error);
    document.querySelector(".map-heading span").innerHTML="SATELLITE FEED // <b>OFFLINE</b>";
  }
})();