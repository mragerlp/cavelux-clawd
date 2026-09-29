(() => {
  'use strict';
  const cards=[...document.querySelectorAll('[data-character]')];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let last=-Infinity,request=0;
  function paint(time){
    if(document.hidden)return;
    cards.forEach(card=>window.renderCharacterPreview(card.dataset.character,time,card));
  }
  function tick(ms){
    if(ms-last>=50){paint(ms/1000);last=ms;}
    if(!reduced.matches)request=requestAnimationFrame(tick);
  }
  function start(){
    cancelAnimationFrame(request);
    if(reduced.matches)paint(2);else request=requestAnimationFrame(tick);
  }
  window.filmReady.then(()=>{paint(2);start();});
  reduced.addEventListener('change',start);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelAnimationFrame(request);else start();});
})();
