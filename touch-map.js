(function enableInteractiveMapGestures(){
  const mapElement=document.getElementById('map');
  if(!mapElement)return;

  mapElement.style.touchAction='none';
  mapElement.style.webkitUserSelect='none';
  mapElement.style.userSelect='none';

  function stopBrowserGesture(event){
    if(event.touches&&event.touches.length>1)event.preventDefault();
  }

  mapElement.addEventListener('gesturestart',event=>event.preventDefault(),{passive:false});
  mapElement.addEventListener('gesturechange',event=>event.preventDefault(),{passive:false});
  mapElement.addEventListener('gestureend',event=>event.preventDefault(),{passive:false});
  mapElement.addEventListener('touchmove',stopBrowserGesture,{passive:false});

  function activate(){
    if(typeof state==='undefined'||!state.map){
      window.setTimeout(activate,120);
      return;
    }

    if(window.visualViewport){
      window.visualViewport.removeEventListener('resize',fitIsland);
      window.visualViewport.removeEventListener('scroll',fitIsland);
    }

    state.map.touchZoom.enable();
    state.map.dragging.enable();
    state.map.doubleClickZoom.enable();

    state.map.options.bounceAtZoomLimits=false;
    state.map.setMinZoom(Math.max(8,state.map.getZoom()-1));
    state.map.setMaxZoom(16);

    state.map.on('zoom move',()=>updatePositions(true));
    state.map.on('zoomend',()=>{
      const readout=document.getElementById('readout-zoom');
      if(readout)readout.textContent=state.map.getZoom().toFixed(1)+'X';
    });
  }

  activate();
})();
