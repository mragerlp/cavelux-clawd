/* Eight frame-addressable reactions, composed from the canonical character. */
(() => {
  'use strict';
  const SIZE=512,TAU=Math.PI*2,INK='#101210',PAPER='#eeefe5',LIME='#92fa11';
  const COLORS=['#ff605c','#ffac33','#ffe24a','#b4f328','#3de2cb','#5ebaff','#9f8bff','#e58fe4'];
  const makeCanvas=()=>{const c=document.createElement('canvas');c.width=c.height=SIZE;return c;};
  const source=makeCanvas(),scene=makeCanvas(),normal=makeCanvas();
  const g=scene.getContext('2d',{alpha:true,willReadFrequently:true});
  let catalog=[],normalSpec,normalEyes=[],bodyColor='#bafa11';
  const clamp=v=>Math.max(0,Math.min(1,v));
  const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
  const q=v=>Math.round(v/2)*2;
  function gesture(p){if(p<.12)return -.1*smooth(p/.12);if(p<.38)return -.1+1.1*smooth((p-.12)/.26);if(p<.67)return 1;return 1-smooth((p-.67)/.33);}
  function box(x,y,w,h,color,alpha=1){g.save();g.globalAlpha=alpha;g.fillStyle=color;g.fillRect(q(x),q(y),q(w),q(h));g.restore();}
  function arm(x,y,endX,endY,thickness=18){
    const step=6,n=Math.max(1,Math.ceil(Math.hypot(endX-x,endY-y)/step));
    for(let i=0;i<=n;i++){const t=i/n;box(x+(endX-x)*t-thickness/2,y+(endY-y)*t-thickness/2,thickness,thickness,bodyColor);}
    box(endX-thickness*.7,endY-thickness*.45,thickness*1.4,thickness*.9,bodyColor);
  }
  function check(x,y,scale,alpha){g.save();g.globalAlpha=alpha;[[0,2],[1,3],[2,4],[3,3],[4,2],[5,1],[6,0]].forEach(([a,b])=>box(x+a*scale,y+b*scale,scale,scale,LIME));g.restore();}
  const letters={K:['101','110','100','110','101'],I:['111','010','010','010','111'],T:['111','010','010','010','010'],A:['010','101','111','101','101']};
  function pixelWord(word,x,y,s,color){for(let j=0;j<word.length;j++)for(let row=0;row<5;row++)for(let col=0;col<3;col++)if(letters[word[j]][row][col]==='1')box(x+(j*4+col)*s,y+row*s,s,s,color);}
  function wrapper(x,y,w){
    const h=w*.4;box(x-w/2-4,y-h/2+4,w+8,h-8,'#ad131c');box(x-w/2,y-h/2,w,h,'#ed1c24');
    for(let i=0;i<3;i++){box(x-w/2+3+i*4,y-h/2+4,2,h-8,'#ff6c70');box(x+w/2-5-i*4,y-h/2+4,2,h-8,'#c9131e');}
    const ovalW=w*.66,ovalH=h*.67;box(x-ovalW/2+6,y-ovalH/2,ovalW-12,ovalH,PAPER);box(x-ovalW/2,y-ovalH/2+6,ovalW,ovalH-12,PAPER);
    const s=w>=150?3:2;pixelWord('KITKAT',x-23*s/2,y-5*s/2,s,'#ed1c24');
    return{x:x-w/2-4,y:y-h/2,width:w+8,height:h};
  }
  function findNormalEyes(){
    const c=normal.getContext('2d',{willReadFrequently:true}),data=c.getImageData(0,0,SIZE,SIZE).data,b=normalSpec.heroBounds,seen=new Uint8Array(SIZE*SIZE),parts=[];
    const dark=p=>data[p*4+3]>200&&Math.max(data[p*4],data[p*4+1],data[p*4+2])<70;
    for(let y=Math.ceil(b.y+3);y<b.y+b.height*.68;y++)for(let x=Math.ceil(b.x+12);x<b.x+b.width-12;x++){
      const start=y*SIZE+x;if(seen[start]||!dark(start))continue;
      const pts=[start];seen[start]=1;let x0=x,y0=y,x1=x,y1=y;
      for(let i=0;i<pts.length;i++){const p=pts[i],px=p%SIZE,py=Math.floor(p/SIZE);x0=Math.min(x0,px);x1=Math.max(x1,px);y0=Math.min(y0,py);y1=Math.max(y1,py);
        for(const[nx,ny]of[[px-1,py],[px+1,py],[px,py-1],[px,py+1]])if(nx>=0&&nx<SIZE&&ny>=0&&ny<SIZE){const n=ny*SIZE+nx;if(!seen[n]&&dark(n)){seen[n]=1;pts.push(n);}}
      }
      const w=x1-x0+1,h=y1-y0+1;if(pts.length>150&&pts.length<w*h*1.01&&pts.length>w*h*.9&&w<60&&h<60)parts.push({x:x0,y:y0,width:w,height:h});
    }
    normalEyes=parts.sort((a,b)=>a.x-b.x);if(normalEyes.length!==2)throw new Error('Expected two rectangular eyes in canonical normal sprite');
    const sample=c.getImageData(256,256,1,1).data;bodyColor=`rgb(${sample[0]},${sample[1]},${sample[2]})`;
  }
  function character(state,time,x,y,width,{sy=1,eyeShift=0,blink=1,aura=true}={}){
    let spec;if(state==='normal'){spec=normalSpec;const s=source.getContext('2d',{alpha:true,willReadFrequently:true});s.clearRect(0,0,SIZE,SIZE);s.drawImage(normal,0,0);
      if(eyeShift!==0||blink!==1){for(const e of normalEyes){s.fillStyle=bodyColor;s.fillRect(e.x-1,e.y-1,e.width+2,e.height+2);s.fillStyle=INK;const h=Math.max(2,q(e.height*blink));s.fillRect(e.x+q(eyeShift),e.y+q((e.height-h)/2),e.width,h);}}
    }else spec=window.renderCharacterPreview(state,time,source,{background:'transparent',scale:.9,aura});
    const scale=width/spec.heroBounds.width;g.save();g.translate(q(x),q(y));g.scale(scale,scale*sy);g.imageSmoothingEnabled=false;g.drawImage(source,-SIZE/2,-SIZE/2);g.restore();
    return{x:q(x)-width/2,y:q(y)-spec.heroBounds.height*scale*sy/2,width,height:spec.heroBounds.height*scale*sy};
  }
  function alphaBounds(){const d=g.getImageData(0,0,SIZE,SIZE).data;let x0=SIZE,y0=SIZE,x1=-1,y1=-1;for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(d[(y*SIZE+x)*4+3]>8){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return x1<0?null:{x:x0,y:y0,width:x1-x0+1,height:y1-y0+1};}
  function renderReaction(id,time,targetCanvas,options={}){
    const item=catalog.find(entry=>entry.id===id);if(!item)throw new TypeError('Unknown reaction: '+id);
    if(!Number.isFinite(time)||time<0)throw new TypeError('Reaction time must be finite nonnegative seconds');
    if(!targetCanvas?.getContext||targetCanvas.width<1||targetCanvas.height<1)throw new TypeError('Reaction requires a sized canvas');
    const background=options.background??'transparent';if(!['dark','light','transparent'].includes(background))throw new TypeError('Unknown reaction background');
    // Exact endpoint wrap plus periodic canonical time also closes eyes, aura and rainbow.
    const p=(time%item.duration)/item.duration,a=gesture(p),act=clamp(a),wave=Math.sin(TAU*p),canonical=.25+.85*(1-Math.cos(TAU*p));
    g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.globalCompositeOperation='source-over';g.filter='none';g.clearRect(0,0,SIZE,SIZE);g.imageSmoothingEnabled=false;
    let bodyBounds,propBounds=[];
    if(id==='share-break'){
      const packetY=316+24*a,packetW=96+74*a;arm(164,242,217-10*a,packetY,18);arm(348,242,295+10*a,packetY,18);
      bodyBounds=character('normal',canonical,256,228-5*a,278-6*a);propBounds.push(wrapper(256,packetY,packetW));
      box(256-packetW/2-7,packetY-9,15,20,bodyColor);box(256+packetW/2-8,packetY-9,15,20,bodyColor);
    }else if(id==='typing'){
      bodyBounds=character('working',canonical,256,223+2*Math.sin(TAU*p*6),270);
      box(138,322,236,62,INK);box(144,326,224,48,'#343c30');box(140,378,232,6,'#59634e');
      for(let row=0;row<3;row++)for(let col=0;col<10;col++)box(151+col*21,333+row*12,15,7,(col+row+Math.floor(p*24))%7===0?LIME:'#abb39d');
      const tap=Math.sin(TAU*p*6);arm(189,288,211,326+6*tap,20);arm(323,288,301,326-6*tap,20);box(210,370,92,5,'#abb39d');propBounds.push({x:138,y:322,width:236,height:62});
    }else if(id==='approved'){
      bodyBounds=character('normal',canonical,256,253+14*a,284,{sy:1-.06*a});check(357,139,6,act);propBounds.push({x:357,y:139,width:42,height:30});
    }else if(id==='panic'){
      bodyBounds=character('normal',canonical,256+5*Math.sin(TAU*p*8)*act,264+4*Math.sin(TAU*p*12)*act,284);
      for(const[x,y,color]of[[133,140,COLORS[1]],[367,118,COLORS[0]]]){box(x,y-7*act,8,29,color,act);box(x,y+31-7*act,8,8,color,act);}propBounds.push({x:133,y:111,width:242,height:77});
    }else if(id==='side-eye'){
      const blink=1-.93*Math.pow(Math.max(0,1-Math.abs(p-.6)/.055),2);
      bodyBounds=character('normal',canonical,256,256,286,{eyeShift:12*act,blink});
    }else if(id==='shrug'){
      const handY=268-72*act;arm(155,254,109,handY,20);arm(357,254,403,handY,20);
      box(94,handY-6,32,12,bodyColor);box(386,handY-6,32,12,bodyColor);
      bodyBounds=character('normal',canonical,256,257-7*a,280);propBounds.push({x:94,y:handY-12,width:324,height:86});
    }else if(id==='celebrate'){
      const burst=act;for(let i=0;i<16;i++){const angle=-Math.PI+i*TAU/16,radius=108+79*burst,x=256+Math.cos(angle)*radius,y=255+Math.sin(angle)*radius-17*burst;box(x,y,(i%3===0?5:3)*2,(i%3===0?3:5)*2,COLORS[i%8],burst*.95);}
      bodyBounds=character('ultracode',canonical,256,266-21*act,276,{sy:1+.035*wave});propBounds.push({x:60,y:42,width:394,height:404});
    }else if(id==='presenting'){
      const x=256-62*act,w=284-32*act;const panel={x:323,y:132,width:130,height:174};
      g.save();g.globalAlpha=act;g.shadowColor=LIME;g.shadowBlur=12;box(panel.x,panel.y,panel.width,panel.height,LIME);g.restore();
      box(panel.x+4,panel.y+4,panel.width-8,panel.height-8,'#1c2819',act);box(panel.x+10,panel.y+10,panel.width-20,2,'#69855a',act);
      arm(x+w*.37,260,313+5*act,279-30*act,18);box(302+5*act,241+8*(1-act),33,10,bodyColor,act);
      bodyBounds=character('normal',canonical,x,282,w);propBounds.push(panel);
    }
    const contentBounds=alphaBounds(),target=targetCanvas.getContext('2d',{alpha:true,willReadFrequently:true});target.save();target.setTransform(1,0,0,1,0,0);target.globalAlpha=1;target.globalCompositeOperation='source-over';target.filter='none';target.clearRect(0,0,targetCanvas.width,targetCanvas.height);
    if(background!=='transparent'){target.fillStyle=background==='light'?PAPER:INK;target.fillRect(0,0,targetCanvas.width,targetCanvas.height);}target.imageSmoothingEnabled=false;target.drawImage(scene,0,0,targetCanvas.width,targetCanvas.height);target.restore();
    return{id,state:item.state,duration:item.duration,time:time%item.duration,phase:p,bodyBounds,propBounds,contentBounds,coordinateSpace:{width:512,height:512},background,canonicalTime:canonical};
  }
  window.reactionsReady=Promise.all([window.filmReady,fetch('./catalog.json').then(response=>{if(!response.ok)throw new Error('Unable to load reaction catalog');return response.json();})]).then(([,entries])=>{
    catalog=entries;window.reactionCatalog=entries;normalSpec=window.renderCharacterPreview('normal',0,normal,{background:'transparent',scale:.9,aura:false});findNormalEyes();window.renderReaction=renderReaction;return entries;
  });
})();
