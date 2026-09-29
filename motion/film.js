/* CAVELUX — frame-addressable composition. 1350 frames / 30 fps / 1080 × 1920. */
(() => {
  'use strict';
  const characterOnly=window.CAVELUX_CHARACTER_ONLY===true;
  const canvas = document.getElementById('film')||document.createElement('canvas');
  // Rendering/export reads these canvases repeatedly; choose a stable readback
  // surface up front rather than allowing a mid-session GPU/CPU fallback.
  let ctx = canvas.getContext('2d', {alpha:false,willReadFrequently:true});
  const W=1080,H=1920,FPS=30,DURATION=1350;
  const INK='#101210', PAPER='#eeefe5', LIME='#92fa11', GRAY='#7c8776';
  const SPECTRUM=['#ff605c','#ffac33','#ffe24a','#b4f328','#3de2cb','#5ebaff','#9f8bff','#e58fe4'];
  const defaults={normal:'sprites/06-normal.png',working:'sprites/01-idle.png',spectrum:'sprites/05-spectrum.png',wordmark:'brand/CAVELUX_wordmark_glitch.png',eye:'brand/CVL_mark_voxel_eye.png',swirl:'brand/CVL_mark_voxel_swirl.png',glyph:'brand/CVL_eyeglyph.svg'};
  const files=Object.fromEntries(Object.entries(defaults).filter(([name])=>!characterOnly||['normal','working','spectrum'].includes(name)).map(([name,url])=>[name,window.CAVELUX_ASSET_URLS?.[name]??url]));
  const assets={};
  const characterStates={
    normal:{eyeMode:'rectangular',aura:'none',sprite:'normal'},
    working:{eyeMode:'friendly-spiral',aura:'green-code',sprite:'working'},
    ultracode:{eyeMode:'friendly-spiral',aura:'flowing-rainbow',sprite:'spectrum'},
  };
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const mix=(a,b,t)=>a+(b-a)*t;
  const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
  const out=t=>1-Math.pow(1-clamp(t),3);
  const inout=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  const rng=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
  const beat=t=>t*128/60;
  const pulse=t=>Math.exp(-((beat(t)%1)*7));
  function line(x1,y1,x2,y2,color=PAPER,width=1,alpha=1){ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.restore();}
  function rect(x,y,w,h,color,alpha=1){ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.fillRect(x,y,w,h);ctx.restore();}
  function text(s,x,y,size=32,color=PAPER,options={}){
    ctx.save();ctx.fillStyle=color;ctx.globalAlpha=options.alpha??1;ctx.textAlign=options.align||'left';ctx.textBaseline='alphabetic';
    ctx.font=`${options.weight||500} ${size}px ${options.mono?'Consolas, monospace':'Bahnschrift, Arial, sans-serif'}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing=(options.spacing??(options.mono?1:-size*.035))+'px';
    if(options.stroke){ctx.lineWidth=1.2;ctx.strokeStyle=color;ctx.strokeText(s,x,y);} else ctx.fillText(s,x,y);
    ctx.restore();
  }
  function circle(x,y,r,color=PAPER,alpha=1,width=1){ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();ctx.restore();}
  function cross(x,y,r=8,color=PAPER,alpha=.6){line(x-r,y,x+r,y,color,1,alpha);line(x,y-r,x,y+r,color,1,alpha);}
  function bracket(x,y,w,h,color=LIME,alpha=1){const n=24;[[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]].forEach(([a,b,dx,dy])=>{line(a,b,a+dx*n,b,color,2,alpha);line(a,b,a,b+dy*n,color,2,alpha);});}
  function image(name,x,y,w,h,alpha=1,rotation=0){const a=assets[name];if(!a)return;ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.globalAlpha=alpha;ctx.drawImage(a.img,-w/2,-h/2,w,h);ctx.restore();}
  function sprite(name,x,y,w,options={}){
    const a=assets[name];if(!a)return;const b=a.bounds;const h=w*b.h/b.w;
    ctx.save();ctx.translate(x,y);ctx.rotate(options.rotation||0);ctx.scale(options.sx??1,options.sy??1);ctx.globalAlpha=options.alpha??1;ctx.imageSmoothingEnabled=false;
    if(a.hypnosis)ctx.drawImage(a.hypnosis.body,-w/2,-h/2,w,h);
    else ctx.drawImage(a.img,b.x,b.y,b.w,b.h,-w/2,-h/2,w,h);
    ctx.restore();
  }
  function makeHypnosisLayers(img,b){
    const body=document.createElement('canvas');body.width=b.w;body.height=b.h;
    const g=body.getContext('2d',{willReadFrequently:true});g.drawImage(img,b.x,b.y,b.w,b.h,0,0,b.w,b.h);
    const original=g.getImageData(0,0,b.w,b.h),pixels=original.data;
    const visited=new Uint8Array(b.w*b.h),components=[];
    const dark=p=>{const i=p*4;return pixels[i+3]>200&&pixels[i]<64&&pixels[i+1]<64&&pixels[i+2]<64;};
    for(let start=0;start<visited.length;start++){
      if(visited[start]||!dark(start))continue;
      const points=[start];visited[start]=1;let x0=b.w,y0=b.h,x1=0,y1=0;
      for(let head=0;head<points.length;head++){
        const p=points[head],x=p%b.w,y=Math.floor(p/b.w);
        x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
        for(const[nx,ny]of[[x-1,y],[x+1,y],[x,y-1],[x,y+1]])if(nx>=0&&nx<b.w&&ny>=0&&ny<b.h){const q=ny*b.w+nx;if(!visited[q]&&dark(q)){visited[q]=1;points.push(q);}}
      }
      if(points.length>b.w*b.h*.01&&x0>b.w*.08&&x1<b.w*.92&&y0>b.h*.04&&y1<b.h*.75)components.push({points,x0,y0,x1,y1});
    }
    const selected=components.sort((a,c)=>c.points.length-a.points.length).slice(0,2).sort((a,c)=>a.x0-c.x0);
    if(selected.length!==2)throw new Error('Expected two isolated friendly spiral eye components in the source sprite');
    const eyes=selected.map((eye,index)=>{
      const ew=eye.x1-eye.x0+1,eh=eye.y1-eye.y0+1;
      const mask=document.createElement('canvas');mask.width=ew;mask.height=eh;
      const mg=mask.getContext('2d',{willReadFrequently:true}),maskData=mg.createImageData(ew,eh);
      for(const p of eye.points){const x=p%b.w-eye.x0,y=Math.floor(p/b.w)-eye.y0,i=(y*ew+x)*4;maskData.data[i+3]=255;}
      mg.putImageData(maskData,0,0);
      const size=25,inner=19,diameter=Math.max(ew,eh),source=document.createElement('canvas');source.width=size;source.height=size;
      const sg=source.getContext('2d',{willReadFrequently:true});sg.imageSmoothingEnabled=false;
      sg.drawImage(mask,(size-inner*ew/diameter)/2,(size-inner*eh/diameter)/2,inner*ew/diameter,inner*eh/diameter);
      const sourcePixels=sg.getImageData(0,0,size,size).data,grid=new Uint8Array(size*size);
      for(let p=0;p<grid.length;p++)grid[p]=sourcePixels[p*4+3]>127?1:0;
      // Replace the original eye ink with nearby body color. The source PNG is
      // untouched; this cached body is used only by the procedural compositor.
      for(let y=Math.max(0,eye.y0-2);y<=Math.min(b.h-1,eye.y1+2);y++){
        const sum=[0,0,0];let count=0;
        for(let x=Math.max(0,eye.x0-8);x<=Math.min(b.w-1,eye.x1+8);x++){
          const i=(y*b.w+x)*4,hi=Math.max(pixels[i],pixels[i+1],pixels[i+2]),lo=Math.min(pixels[i],pixels[i+1],pixels[i+2]);
          if(pixels[i+3]>200&&hi>120&&hi-lo>45){for(let channel=0;channel<3;channel++)sum[channel]+=pixels[i+channel];count++;}
        }
        const color=count?sum.map(value=>Math.round(value/count)):[190,250,17];
        for(let x=Math.max(0,eye.x0-2);x<=Math.min(b.w-1,eye.x1+2);x++){
          const i=(y*b.w+x)*4;if(Math.max(pixels[i],pixels[i+1],pixels[i+2])<145&&pixels[i+3]>0){for(let channel=0;channel<3;channel++)pixels[i+channel]=color[channel];}
        }
      }
      const frame=document.createElement('canvas');frame.width=size;frame.height=size;
      const fg=frame.getContext('2d',{willReadFrequently:true});
      return {grid,size,frame,g:fg,data:fg.createImageData(size,size),step:null,cx:(eye.x0+eye.x1+1)/2,cy:(eye.y0+eye.y1+1)/2,diameter:diameter*size/inner,direction:index===0?1:-1};
    });
    g.putImageData(original,0,0);return {body,eyes};
  }
  function hypnoticEyes(asset,x,y,w,t,options={}){
    const h=asset.hypnosis;if(!h)return;
    const speed=options.eyeSpeed??1,phase=t*1.7*speed,scale=w/asset.bounds.w;
    ctx.save();ctx.translate(x,y);ctx.rotate(options.rotation||0);ctx.scale(options.sx??1,options.sy??1);
    ctx.globalAlpha=options.alpha??1;ctx.imageSmoothingEnabled=false;
    for(const eye of h.eyes){
      const step=((Math.round(phase*eye.direction/(Math.PI*2)*96)%96)+96)%96;
      if(eye.step!==step){
        const angle=step/96*Math.PI*2,cos=Math.cos(angle),sin=Math.sin(angle),center=(eye.size-1)/2;
        eye.data.data.fill(0);
        for(let yy=0;yy<eye.size;yy++)for(let xx=0;xx<eye.size;xx++){
          const dx=xx-center,dy=yy-center,sx=Math.round(cos*dx+sin*dy+center),sy=Math.round(-sin*dx+cos*dy+center);
          if(sx>=0&&sx<eye.size&&sy>=0&&sy<eye.size&&eye.grid[sy*eye.size+sx]){const i=(yy*eye.size+xx)*4;eye.data.data[i]=14;eye.data.data[i+1]=15;eye.data.data[i+2]=13;eye.data.data[i+3]=255;}
        }
        eye.g.putImageData(eye.data,0,0);eye.step=step;
      }
      const ew=eye.diameter*scale;
      ctx.drawImage(eye.frame,(eye.cx-asset.bounds.w/2)*scale-ew/2,(eye.cy-asset.bounds.h/2)*scale-ew/2,ew,ew);
    }
    ctx.restore();
  }
  function codeAura(x,y,w,t,options={}){
    const b=assets.working?.bounds;if(!b)return;
    const h=w*b.h/b.w,count=options.auraCount??(w>=180?5:1);
    if(!count)return;
    const tokens=['{}','</>','[]','::','<>'];
    const seed=options.seed??0,size=clamp(w*.061,9,20),ink=options.auraInk??LIME;
    ctx.save();ctx.translate(x,y);ctx.rotate(options.rotation||0);
    ctx.scale(options.sx??1,options.sy??1);
    for(let i=0;i<count;i++){
      const angle=t*.8+i/count*Math.PI*2+seed*.73;
      const rx=w*.78,ry=h*.84;
      const px=Math.cos(angle)*rx,py=Math.sin(angle)*ry;
      const alpha=(options.alpha??1)*(w>=180?.7:.4)*(.8+.2*Math.sin(t*2+i));
      for(let j=1;j<=3;j++){
        const trail=angle-j*.09;
        rect(Math.cos(trail)*rx-1.5,Math.sin(trail)*ry-1.5,3,3,ink,alpha*(1-j/4)*.42);
      }
      ctx.shadowColor=LIME;ctx.shadowBlur=w>=180?7:2;
      text(tokens[(i+seed)%tokens.length],px,py+size*.3,size,ink,
        {mono:true,align:'center',spacing:0,alpha});
      ctx.shadowBlur=0;
    }
    ctx.restore();
  }
  function makeSpectrumLayers(img,b){
    const make=()=>{const c=document.createElement('canvas');c.width=b.w;c.height=b.h;return c;};
    const matte=make(),ink=make(),paint=make();
    const ig=ink.getContext('2d',{willReadFrequently:true}),mg=matte.getContext('2d',{willReadFrequently:true});
    ig.drawImage(img,b.x,b.y,b.w,b.h,0,0,b.w,b.h);
    const original=ig.getImageData(0,0,b.w,b.h),mask=mg.createImageData(b.w,b.h);
    for(let i=0;i<original.data.length;i+=4){
      const r=original.data[i],g=original.data[i+1],blue=original.data[i+2];
      const high=Math.max(r,g,blue),low=Math.min(r,g,blue);
      // Only saturated source-body pixels receive moving color. Black eyes,
      // outlines and neutral shadows remain in a separate untouched ink layer.
      if(high>70&&high-low>38){
        mask.data[i]=255;mask.data[i+1]=255;mask.data[i+2]=255;
        mask.data[i+3]=original.data[i+3];original.data[i+3]=0;
      }
    }
    mg.putImageData(mask,0,0);ig.putImageData(original,0,0);
    return {matte,ink,paint,g:paint.getContext('2d',{willReadFrequently:true}),time:null};
  }
  function flowingSpectrum(x,y,w,t,options={}){
    const a=assets.spectrum;if(!a?.wave)return;const b=a.bounds,h=w*b.h/b.w;
    const wave=a.wave,g=wave.g;
    if(wave.time!==t){
      g.globalCompositeOperation='source-over';g.clearRect(0,0,b.w,b.h);
      const tileW=Math.max(1,Math.ceil(b.w/52)),tileH=Math.max(1,Math.ceil(b.h/38));
      for(let px=0;px<b.w;px+=tileW){
        const u=px/b.w,offset=Math.sin(u*Math.PI*2.6-t*1.7)*.115+u*.08;
        for(let py=0;py<b.h;py+=tileH){
          const phase=py/b.h*1.14-t*.16+offset;
          const color=((Math.floor(phase*SPECTRUM.length)%SPECTRUM.length)+SPECTRUM.length)%SPECTRUM.length;
          g.fillStyle=SPECTRUM[color];g.fillRect(px,py,tileW,tileH);
        }
      }
      g.globalCompositeOperation='destination-in';g.drawImage(wave.matte,0,0);
      g.globalCompositeOperation='source-over';g.drawImage(wave.ink,0,0);wave.time=t;
    }
    ctx.save();ctx.translate(x,y);ctx.rotate(options.rotation||0);
    ctx.scale(options.sx??1,options.sy??1);ctx.globalAlpha=options.alpha??1;ctx.imageSmoothingEnabled=false;
    ctx.drawImage(wave.paint,-w/2,-h/2,w,h);ctx.restore();
  }
  function character(state,x,y,w,t,options={}){
    const spec=characterStates[state];
    if(state==='working'&&options.aura!==false)codeAura(x,y,w,t,options);
    if(state==='ultracode')flowingSpectrum(x,y,w,t,options);
    else sprite(spec.sprite,x,y,w,options);
    if(state!=='normal')hypnoticEyes(assets[spec.sprite],x,y,w,t,options);
    if(options.hero){
      const b=assets[spec.sprite]?.bounds,h=b?w*b.h/b.w:0;
      const eyeSpeed=options.eyeSpeed??1,eyeScale=b?w/b.w:0;
      const eyeBounds=assets[spec.sprite]?.hypnosis?.eyes.map(eye=>({x:x+(eye.cx-b.w/2-eye.diameter/2)*eyeScale,y:y+(eye.cy-b.h/2-eye.diameter/2)*eyeScale,width:eye.diameter*eyeScale,height:eye.diameter*eyeScale}))??null;
      window.characterState={...window.characterState,state,...spec,
        aura:state==='working'&&options.aura===false?'none':spec.aura,
        eyeMotion:state==='normal'?'none':'counter-rotating-pixel-spirals',eyeSpeed,
        eyePhase:state==='normal'?0:(t*1.7*eyeSpeed)%(Math.PI*2),eyeBounds,
        rainbowPhase:state==='ultracode'?(t*.16)%1:0,
        auraPhase:state==='working'&&options.aura!==false?(t*.8)%(Math.PI*2):0,
        heroBounds:{x:x-w/2,y:y-h/2,width:w,height:h},
        auraBounds:state==='working'&&options.aura!==false?{x:x-w*.9,y:y-h,width:w*1.8,height:h*2}:null,
        opacity:options.alpha??1};
    }
  }
  function title(lines,x,y,size,local,color=PAPER,delay=0){
    lines.forEach((s,i)=>{const v=out((local-delay-i*.13)/.8);ctx.save();ctx.beginPath();ctx.rect(x-3,y+i*size*.98-size,920,size*1.08);ctx.clip();text(s,x,y+i*size*.98+(1-v)*size,size,color);ctx.restore();});
  }
  function micro(s,x,y,color=GRAY,alpha=1){text(s,x,y,20,color,{mono:true,spacing:1.4,alpha});}
  function base(light=false){ctx.fillStyle=light?PAPER:INK;ctx.fillRect(0,0,W,H);const color=light?INK:PAPER;
    for(let y=0;y<H;y+=4)rect(0,y,W,1,color,.011);
    for(let i=0;i<150;i++){const x=Math.floor(rng(i+13)*W),y=Math.floor(rng(i+733)*H);rect(x,y,1.5,1.5,color,.06);}
    line(84,224,996,224,color,1,.14);line(84,1670,996,1670,color,1,.14);
    [[84,224],[996,224],[84,1670],[996,1670]].forEach(p=>cross(...p,7,color,.45));
  }
  function furniture(index,t,light=false){const c=light?INK:PAPER;micro('CAVELUX',106,175,c,.8);micro('MOTION STUDY / 01',670,175,c,.48);
    const names=['WAKE','BUILD','SWARM','SYNCHRONIZE','SPECTRUM','REVEAL'];
    micro(`0${index+1} / ${names[index]}`,106,1730,c,.5);micro('SIGNAL → SPECTRUM',646,1730,c,.45);
    for(let i=0;i<6;i++)rect(106+i*148,1790,130,3,c,.12);
    for(let i=0;i<=index;i++)rect(106+i*148,1790,130*(i===index?clamp((t-i*7.5)/7.5):1),3,light?INK:LIME,.8);
  }
  function wake(t){
    base();const e=out((t-.8)/1.4);const bob=Math.sin(t*2.2)*7;
    micro('A STUDY IN POSSIBILITY',110,324,LIME,smooth(t/.6));
    title(['A SMALL','SIGNAL.'],104,468,148,t,PAPER,.25);
    const radius=235+Math.sin(t*.9)*12;circle(540,960,radius,PAPER,.14*e);circle(540,960,radius+64,PAPER,.07*e);
    for(let i=0;i<48;i++){const a=i*Math.PI/24;const r=radius+64;line(540+Math.cos(a)*r,960+Math.sin(a)*r,540+Math.cos(a)*(r+(i%4===0?14:6)),960+Math.sin(a)*(r+(i%4===0?14:6)),PAPER,1,.2*e);}
    cross(540,960,340,PAPER,.045*e);
    const scale=.12+.88*out((t-.65)/1.2);
    character('normal',540,960+bob,490*scale,t,{hero:true,alpha:e,sy:1+Math.sin(t*2.2)*.014});
    if(t<1.5){const p=out(t/1.5);rect(540-150*p,960-2,300*p,4,LIME,1-p);}
    bracket(243,758,594,400,LIME,e*.6);
    micro('SPECIMEN 01',110,1320,PAPER,e*.7);micro('CURIOUS BY DESIGN.',110,1360,GRAY,e);
    const words='> hello, possibility';text(words.slice(0,Math.floor(Math.max(0,t-2.8)*15)),110,1490,28,LIME,{mono:true});
    if(t>2.8&&Math.floor(t*2)%2===0)rect(110+Math.min(words.length,Math.floor((t-2.8)*15))*17,1500,14,3,LIME);
  }
  function terminal(x,y,w,h,phase,t,label){
    const v=out((t-phase)/.5);ctx.save();ctx.translate(0,(1-v)*35);ctx.globalAlpha=v;
    rect(x,y,w,h,'#e1e5d9');line(x,y,x+w,y,INK,2,.65);line(x,y+h,x+w,y+h,INK,1,.2);
    micro(label,x+28,y+42,INK,.6);rect(x+w-40,y+28,9,9,'#60853d');
    const lines={SKILLS:'explore. make. refine.',MCPs:'context -> possibility',WORKFLOWS:'compose. test. repeat.'};
    const s=lines[label];text(s.slice(0,Math.floor(Math.max(0,t-phase-.2)*24)),x+28,y+101,31,INK,{mono:true,spacing:-.4});
    ctx.restore();
  }
  function build(t){
    base(true);title(['IDEAS,','IN MOTION.'],104,440,138,t,INK);
    micro('02 / SKILLS + MCPs + WORKFLOWS',110,718,INK,.55);
    terminal(110,770,760,143,.35,t,'SKILLS');terminal(160,948,760,143,1.05,t,'MCPs');terminal(210,1126,710,143,1.75,t,'WORKFLOWS');
    const p=(t*.65)%3;const py=844+178*Math.floor(p);line(84,800,84,1220,INK,1,.18);rect(78,py,12,12,'#497d1c');
    for(let i=0;i<3;i++){line(86,842+i*178,102+i*50,842+i*178,INK,1,.35);}
    const tx=mix(810,655,smooth((t-3)/3));character('working',tx,1420+Math.sin(t*5)*4,250,t,{hero:true,auraInk:'#3f8f18',rotation:Math.sin(t*1.5)*.035,alpha:out((t-2)/.7)});
    text('MAKE.',110,1410,68,INK,{alpha:out((t-2.8)/.6)});text('LEARN.',110,1480,68,INK,{alpha:out((t-3.4)/.6)});text('MAKE AGAIN.',110,1550,68,INK,{alpha:out((t-4)/.6)});
  }
  function swarm(t){
    base();title(['ONE SPARK.','MANY MINDS.'],104,433,125,t);
    const expand=smooth((t-.4)/2.6);const spin=t*.12;const nodes=[];
    for(let i=0;i<19;i++){
      const ring=i===0?0:i<7?1:2;const count=ring===1?6:12;const j=ring===1?i-1:i-7;
      const a=j/count*Math.PI*2+spin+(ring===2?.24:0);const r=ring===0?0:(ring===1?205:385)*expand;
      nodes.push({x:540+Math.cos(a)*r,y:1000+Math.sin(a)*r*.87,w:ring===0?240:ring===1?117:78,a:ring===0?1:ring===1?.9:.6});
    }
    for(let i=1;i<nodes.length;i++){const n=nodes[i],p=nodes[i<7?0:1+(i%6)];line(p.x,p.y,n.x,n.y,LIME,1,.16*expand);
      const r=(t*.55+i*.173)%1;rect(mix(p.x,n.x,r)-3,mix(p.y,n.y,r)-3,6,6,LIME,.7*expand);}
    circle(540,1000,205*expand,LIME,.14);circle(540,1000,385*expand,PAPER,.09);
    nodes.forEach((n,i)=>{character('working',n.x,n.y+Math.sin(t*4+i)*4,n.w,t,{hero:i===0,seed:i,auraCount:i===0?5:i%3===0?1:0,alpha:n.a*(i===0?1:expand),rotation:Math.sin(t*.9+i)*.04});});
    micro('INDEPENDENT MOTION.',110,1480,PAPER,.75);micro('SHARED DIRECTION.',110,1520,LIME,.9);
    text(String(Math.floor(mix(1,19,expand))).padStart(2,'0'),822,1518,90,PAPER,{align:'right',alpha:.22});
  }
  function rotate3(p,a,b){let x=p.x*Math.cos(a)-p.z*Math.sin(a),z=p.x*Math.sin(a)+p.z*Math.cos(a);const y=p.y*Math.cos(b)-z*Math.sin(b);z=p.y*Math.sin(b)+z*Math.cos(b);return {x,y,z};}
  function project(p){const s=760/(760+p.z);return{x:540+p.x*s,y:995+p.y*s,scale:s,z:p.z};}
  function sync(t){
    base();title(['COMPLEXITY.','IN CONCERT.'],104,430,122,t);
    const grow=out(t/1.1);const a=t*.42,b=.34+Math.sin(t*.35)*.2;
    for(let axis=0;axis<3;axis++){
      ctx.beginPath();for(let j=0;j<=160;j++){const ang=j/160*Math.PI*2,r=322*grow;let p=axis===0?{x:Math.cos(ang)*r,y:Math.sin(ang)*r,z:0}:axis===1?{x:Math.cos(ang)*r,y:0,z:Math.sin(ang)*r}:{x:0,y:Math.cos(ang)*r,z:Math.sin(ang)*r};const q=project(rotate3(p,a,b));if(j===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);}
      ctx.strokeStyle=axis===1?'#556448':'#323a30';ctx.lineWidth=1.3;ctx.stroke();
    }
    const arr=[];for(let i=0;i<42;i++){const yy=1-2*(i+.5)/42,rr=Math.sqrt(1-yy*yy),ang=i*2.399963;const q=rotate3({x:Math.cos(ang)*rr*320*grow,y:yy*320*grow,z:Math.sin(ang)*rr*320*grow},a,b);arr.push({...project(q),i});}
    arr.sort((p,q)=>q.z-p.z).forEach(p=>{character('working',p.x,p.y,53*p.scale,t,{seed:p.i,auraCount:p.i%5===0?1:0,alpha:mix(.23,.97,clamp((320-p.z)/640)),rotation:Math.sin(t*.5+p.i)*.08});});
    character('working',540,995,190,t,{hero:true,alpha:.95});
    bracket(123,617,834,760,PAPER,.17);
    micro('ORBITAL STUDY / COHERENCE',110,1488,LIME,.8);
    for(let i=0;i<100;i++){const x=110+i*8.5;const y=1570+Math.sin(i*.12+t*3)*Math.sin(i/100*Math.PI)*19;rect(x,y,4,2,PAPER,.28);}
  }
  function spectrum(t){
    base();const burst=out(t/1.4),power=1+.025*pulse(t);
    for(let i=0;i<8;i++){
      const x=80+i*130;const h=(150+Math.sin(t*1.9+i*.7)*80)*burst;
      rect(x,1540-h,24,h,SPECTRUM[i],.28);rect(x+33,1570-h*.6,8,h*.6,SPECTRUM[i],.15);
    }
    title(['FULL','SPECTRUM.'],104,435,153,t,PAPER,.1);
    const w=650*mix(.75,1,burst)*power,y=1000+Math.sin(t*2)*10;
    character('working',540,y,w,t,{aura:false});
    const sweep=clamp((t-.35)/1.5);ctx.save();ctx.beginPath();ctx.rect(90,680,900,640*sweep);ctx.clip();character('ultracode',540,y,w,t,{hero:true});ctx.restore();
    const r=414;for(let i=0;i<64;i++){const a=i/64*Math.PI*2+t*.08;const length=(i%8===0?32:10)*burst;line(540+Math.cos(a)*r,1000+Math.sin(a)*r*.81,540+Math.cos(a)*(r+length),1000+Math.sin(a)*(r+length)*.81,SPECTRUM[Math.floor(i/8)],i%8===0?4:1,.42);}
    micro('SAME CURIOSITY.',110,1418,PAPER,.65);micro('A WHOLE NEW FREQUENCY.',110,1458,SPECTRUM[6],.85);
    if(t<1.8){const yy=mix(740,1230,sweep);line(150,yy,930,yy,PAPER,2,(1-sweep)*.6);}
  }
  function reveal(t){
    base();const settle=out(t/1.9),word=out((t-1.1)/1.1);
    micro('THE NEXT THING STARTS HERE.',110,350,PAPER,.6*out(t/.9));
    const logoY=mix(880,765,settle);const logoW=mix(650,470,settle);
    image('swirl',540,logoY,logoW,logoW,settle,(1-settle)*1.5);
    image('eye',540,logoY,logoW,logoW,smooth((t-.5)/1.4));
    if(t<1.9)character('normal',540,logoY,mix(530,140,settle),t,{hero:true,alpha:1-settle,rotation:Math.sin(t*4)*.05});
    ctx.save();ctx.beginPath();ctx.rect(100,1010,880*word,210);ctx.clip();image('wordmark',540,1080,830,830*209/1005);ctx.restore();
    text('cavelux.ai',540,1230,42,LIME,{mono:true,align:'center',spacing:2.5,alpha:out((t-2.1)/.8)});
    line(340,1310,740,1310,PAPER,1,.18*out((t-2.5)/.8));
    micro('CURIOUS BY DESIGN.',540-112,1360,PAPER,.6*out((t-2.7)/.8));
    character('normal',882,1530+Math.sin(t*2.4)*4,86,t,{hero:t>=1.9,alpha:out((t-3.2)/.9)});
    micro('END OF STUDY. START OF SOMETHING.',110,1540,GRAY,.65*out((t-3.4)/.8));
  }
  const scenes=[wake,build,swarm,sync,spectrum,reveal];
  function transition(local,index){if(index===0||local>.3)return;const p=clamp(local/.3);const height=H*(1-inout(p));rect(0,0,W,height,index===1?PAPER:INK);rect(0,height-5,W,5,index===4?SPECTRUM[4]:LIME,.8);}
  function renderFrame(frame){
    if(characterOnly)throw new Error('Full-film rendering is unavailable in character-only mode');
    if(!Number.isFinite(frame))throw new TypeError('frame must be finite');
    const f=Math.max(0,Math.min(DURATION-1,Math.floor(frame))),t=f/FPS,index=Math.min(5,Math.floor(t/7.5)),local=t-index*7.5;
    const state=index===0||index===5?'normal':index===4?'ultracode':'working';
    window.characterState={state,...characterStates[state],frame:f,chapter:index,rainbowPhase:0,auraPhase:0,heroBounds:null,auraBounds:null,opacity:0};
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    scenes[index](local);furniture(index,t,index===1);transition(local,index);
    window.currentFrame=f;window.currentChapter=index;return {frame:f,chapter:index,width:W,height:H};
  }
  function renderCharacterPreview(state,time,targetCanvas,options={}){
    if(!characterStates[state])throw new TypeError('Unknown character state: '+state);
    if(!Number.isFinite(time))throw new TypeError('Preview time must be finite seconds');
    if(!targetCanvas||typeof targetCanvas.getContext!=='function'||!targetCanvas.width||!targetCanvas.height)throw new TypeError('Preview needs a sized canvas');
    const background=options.background??'dark',requestedScale=options.scale??1,requestedSpeed=options.eyeSpeed??1,aura=options.aura??true;
    if(!['dark','light','transparent'].includes(background))throw new TypeError('Unknown preview background: '+background);
    if(!Number.isFinite(requestedScale)||!Number.isFinite(requestedSpeed)||typeof aura!=='boolean')throw new TypeError('Preview scale/eyeSpeed must be finite numbers and aura must be boolean');
    const scale=clamp(requestedScale,.4,1.4),eyeSpeed=clamp(requestedSpeed,0,3);
    const spec=characterStates[state],a=assets[spec.sprite];
    if(!a)throw new Error('Await filmReady before rendering a character preview');
    const previousContext=ctx,previousState=window.characterState;
    ctx=targetCanvas.getContext('2d',{alpha:true,willReadFrequently:true});
    if(!ctx){ctx=previousContext;throw new Error('Preview canvas has no 2D context');}
    ctx.save();
    try{
      const width=targetCanvas.width,height=targetCanvas.height;
      ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';
      ctx.clearRect(0,0,width,height);
      if(background!=='transparent'){
        rect(0,0,width,height,background==='light'?PAPER:INK);
        for(let y=0;y<height;y+=4)rect(0,y,width,1,background==='light'?INK:PAPER,.011);
      }
      const aspect=a.bounds.h/a.bounds.w,w=Math.min(width*.62,height*.82/(aspect*1.75))*scale;
      window.characterState={state,...spec,frame:null,chapter:null,preview:true,rainbowPhase:0,auraPhase:0};
      character(state,width/2,height/2,w,Math.max(0,time),{hero:true,eyeSpeed,aura,auraInk:background==='light'?'#3f8f18':LIME});
      return {...window.characterState,background,scale,auraEnabled:aura};
    }finally{
      ctx.restore();ctx=previousContext;window.characterState=previousState;
    }
  }
  function bounds(img){const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0);const data=g.getImageData(0,0,c.width,c.height).data;let x0=c.width,y0=c.height,x1=0,y1=0;
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){if(data[(y*c.width+x)*4+3]>180){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}
    return{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};}
  window.renderFrame=renderFrame;
  window.renderCharacterPreview=renderCharacterPreview;
  window.characterStates=Object.fromEntries(Object.entries(characterStates).map(([name,spec])=>[name,{...spec}]));
  window.filmSpec={width:W,height:H,fps:FPS,durationInFrames:DURATION,chapters:['WAKE','BUILD','SWARM','SYNCHRONIZE','SPECTRUM','REVEAL']};
  window.filmReady=Promise.all(Object.entries(files).map(([name,url])=>new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>{try{assets[name]={img,bounds:name==='glyph'?null:bounds(img)};if(name==='working'||name==='spectrum')assets[name].hypnosis=makeHypnosisLayers(img,assets[name].bounds);if(name==='spectrum'){const a=assets[name];a.wave=makeSpectrumLayers(a.hypnosis.body,{x:0,y:0,w:a.bounds.w,h:a.bounds.h});}resolve();}catch(error){reject(error);}};img.onerror=()=>reject(new Error('Failed asset '+url));img.src=url;}))).then(()=>{if(!characterOnly)renderFrame(90);return window.filmSpec;});
})();
