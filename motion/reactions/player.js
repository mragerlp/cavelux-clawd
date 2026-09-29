(() => {
  'use strict';
  const byId=id=>document.getElementById(id),canvas=byId('reaction-preview');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let catalog=[],selected=null,time=0,playing=false,raf=0,origin=0,started=0,background='transparent';
  function render(){
    if(!selected)return;
    window.renderReaction(selected.id,time,canvas,{background});
    byId('reaction-time').value=time;
    byId('time-label').textContent=time.toFixed(2)+' / '+selected.duration.toFixed(2)+'s';
  }
  function pause(){
    playing=false;cancelAnimationFrame(raf);
    byId('reaction-play').setAttribute('aria-label','Play reaction');
    byId('play-label').textContent='Play';byId('play-symbol').textContent='▶';byId('playback-state').textContent='PAUSED';
  }
  function tick(now){
    if(!playing)return;
    time=Math.floor(((origin+(now-started)/1000)%selected.duration)*selected.fps)/selected.fps;
    render();raf=requestAnimationFrame(tick);
  }
  function play(){
    if(!selected)return;
    playing=true;origin=time>=selected.duration?0:time;started=performance.now();
    byId('reaction-play').setAttribute('aria-label','Pause reaction');
    byId('play-label').textContent='Pause';byId('play-symbol').textContent='Ⅱ';byId('playback-state').textContent='PLAYING';raf=requestAnimationFrame(tick);
  }
  function select(reaction){
    pause();selected=reaction;time=reaction.posterTime;
    byId('reaction-title').textContent=reaction.title;byId('reaction-description').textContent=reaction.description;
    byId('reaction-state').textContent=reaction.state.toUpperCase()+' / '+String(catalog.indexOf(reaction)+1).padStart(2,'0');
    canvas.setAttribute('aria-label',reaction.title+' — Cavelux Clawd reaction');
    byId('reaction-time').max=reaction.duration;
    document.querySelectorAll('[data-reaction]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.reaction===reaction.id)));
    for(const kind of ['gif','mp4','png']){const link=byId('download-'+kind);link.href='output/'+reaction.id+'.'+kind;link.download=reaction.id+'.'+kind;link.setAttribute('aria-label','Download '+reaction.title+' '+(kind==='png'?'PNG poster':kind.toUpperCase()));}
    render();
  }
  function cards(){
    const list=byId('reaction-list');list.replaceChildren();
    catalog.forEach((reaction,index)=>{
      const button=document.createElement('button'),thumb=document.createElement('canvas'),copy=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small'),number=document.createElement('span');
      button.type='button';button.dataset.reaction=reaction.id;button.className='reaction-card';button.setAttribute('aria-label','Preview '+reaction.title);button.setAttribute('aria-pressed','false');
      thumb.width=96;thumb.height=96;thumb.setAttribute('aria-hidden','true');window.renderReaction(reaction.id,reaction.posterTime,thumb,{background:'transparent'});
      copy.className='reaction-copy';name.textContent=reaction.title;detail.textContent=reaction.description;copy.append(name,detail);
      number.className='reaction-number';number.textContent=String(index+1).padStart(2,'0');button.append(thumb,copy,number);button.onclick=()=>select(reaction);list.appendChild(button);
    });
  }
  byId('reaction-play').onclick=()=>playing?pause():play();
  byId('reaction-time').oninput=event=>{pause();time=Number(event.target.value);render();};
  byId('reaction-background').onchange=event=>{background=event.target.value;byId('preview-surface').dataset.background=background;render();};
  const preference=()=>{byId('motion-note').textContent=reduced.matches?'REDUCED MOTION / MANUAL PLAY.':'PRESS PLAY TO PREVIEW.';if(reduced.matches)pause();};
  reduced.addEventListener('change',preference);preference();
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  async function boot(){
    try{
      if(!window.reactionsReady)throw new Error('The reaction renderer is unavailable.');
      await window.reactionsReady;catalog=window.reactionCatalog;
      if(!Array.isArray(catalog)||!catalog.length)throw new Error('The reaction catalog is empty.');
      cards();select(catalog[0]);byId('reaction-play').disabled=false;byId('reaction-time').disabled=false;byId('reaction-background').disabled=false;byId('gallery-status').hidden=true;
      window.REACTION_GALLERY_READY=true;
    }catch(error){
      const status=byId('gallery-status');status.hidden=false;status.setAttribute('role','alert');status.textContent='The reaction pack could not load. '+error.message+' ';
      const retry=document.createElement('button');retry.type='button';retry.textContent='Retry';retry.onclick=()=>location.reload();status.appendChild(retry);
    }
  }
  boot();
})();
