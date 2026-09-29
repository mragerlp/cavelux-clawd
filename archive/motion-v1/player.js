(() => {
  'use strict';
  const exp=new URLSearchParams(location.search).has('export');
  if(exp){document.documentElement.classList.add('export');return;}
  const play=document.getElementById('play'),restart=document.getElementById('restart'),mute=document.getElementById('mute'),seek=document.getElementById('seek');
  const audio=new Audio('audio/master.wav');audio.preload='auto';
  let active=false,frame=90,start=0,origin=90,raf=0,hasPlayed=false;
  function ui(){seek.value=frame;document.getElementById('time').textContent=`00:${String(Math.floor(frame/30)).padStart(2,'0')} / 00:45`;document.getElementById('chapter').textContent=`0${window.currentChapter+1} / ${window.filmSpec.chapters[window.currentChapter]}`;}
  function stop(){active=false;cancelAnimationFrame(raf);audio.pause();play.textContent='Play';play.setAttribute('aria-label','Play motion film');}
  function draw(now){if(!active)return;frame=Math.min(1349,Math.floor(origin+(now-start)*.03));window.renderFrame(frame);ui();if(frame===1349){stop();return;}raf=requestAnimationFrame(draw);}
  function go(){if(!hasPlayed||frame>=1349)frame=0;hasPlayed=true;active=true;origin=frame;start=performance.now();audio.currentTime=frame/30;audio.play().catch(()=>{});play.textContent='Pause';play.setAttribute('aria-label','Pause motion film');raf=requestAnimationFrame(draw);}
  function jump(f){const was=active;hasPlayed=true;stop();frame=Math.max(0,Math.min(1349,Number(f)));window.renderFrame(frame);audio.currentTime=frame/30;ui();if(was)go();}
  window.filmReady.then(()=>{ui();play.onclick=()=>active?stop():go();restart.onclick=()=>{jump(0);if(!active)go();};mute.onclick=()=>{audio.muted=!audio.muted;mute.textContent=audio.muted?'Sound off':'Sound on';mute.setAttribute('aria-pressed',String(audio.muted));};seek.oninput=()=>jump(seek.value);document.querySelectorAll('[data-frame]').forEach(b=>b.onclick=()=>jump(b.dataset.frame));});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)stop();});
})();
