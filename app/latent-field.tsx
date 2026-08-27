'use client';

import { useEffect, useMemo, useRef } from 'react';
import { designId, LatentSnapshot, StudyState } from './study';

type Point = { x:number; y:number; size:number; alpha:number; cluster:number; drift:number };
type XY = { x:number; y:number };

const clamp=(n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smooth=(n:number)=>{const t=clamp(n);return t*t*(3-2*t)};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;

function seededPoints(count=1600):Point[]{
  let seed=9173;
  const random=()=>((seed=(seed*16807)%2147483647)-1)/2147483646;
  const centres:[[number,number],[number,number],[number,number],[number,number],[number,number],[number,number],[number,number],[number,number]]=[
    [.15,.24],[.31,.68],[.43,.38],[.58,.71],[.68,.27],[.83,.57],[.88,.2],[.52,.88],
  ];
  return Array.from({length:count},(_,index)=>{
    const cluster=index%centres.length,c=centres[cluster];
    const radius=Math.pow(random(),1.72)*(.105+random()*.095),angle=random()*Math.PI*2;
    return {x:clamp(c[0]+Math.cos(angle)*radius*1.35,.018,.982),y:clamp(c[1]+Math.sin(angle)*radius,.025,.975),size:random()>.965?1.65:.55+random()*.85,alpha:.1+random()*.31,cluster,drift:random()*Math.PI*2};
  });
}

function designPoint(index:number,w:number,h:number):XY{
  const nx=.12+(((index*37+11)%97)/96)*.76;
  const ny=.14+(((index*53+19)%89)/88)*.70;
  return{x:nx*w,y:ny*h};
}

function curvePoint(a:XY,b:XY,t:number,lift=0):XY{
  const cx=(a.x+b.x)/2,cy=(a.y+b.y)/2-Math.min(90,Math.abs(b.x-a.x)*.16)-lift;
  const u=1-t;
  return{x:u*u*a.x+2*u*t*cx+t*t*b.x,y:u*u*a.y+2*u*t*cy+t*t*b.y};
}

function line(ctx:CanvasRenderingContext2D,a:XY,b:XY,progress=1,color='rgba(255,159,69,.5)',dash=false,lift=0){
  const steps=34,end=Math.max(1,Math.floor(steps*clamp(progress)));
  ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1.25;if(dash)ctx.setLineDash([5,6]);ctx.beginPath();
  for(let i=0;i<=end;i++){const p=curvePoint(a,b,i/steps,lift);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)}ctx.stroke();ctx.restore();
}

function node(ctx:CanvasRenderingContext2D,p:XY,color:string,r=5,label=''){
  ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1.3;ctx.strokeRect(p.x-r,p.y-r,r*2,r*2);
  if(label){ctx.fillStyle=color;ctx.font='9px ui-monospace, monospace';ctx.fillText(label,p.x+r+6,p.y+3)}ctx.restore();
}

function cursor(ctx:CanvasRenderingContext2D,p:XY,settle:number){
  const pulse=17+Math.sin(settle*Math.PI*2)*2;
  ctx.save();ctx.strokeStyle='#ff9f45';ctx.fillStyle='#ff9f45';ctx.lineWidth=1.25;
  ctx.beginPath();ctx.arc(p.x,p.y,pulse,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.moveTo(p.x-25,p.y);ctx.lineTo(p.x+25,p.y);ctx.moveTo(p.x,p.y-25);ctx.lineTo(p.x,p.y+25);ctx.stroke();
  ctx.beginPath();ctx.arc(p.x,p.y,2.5,0,Math.PI*2);ctx.fill();ctx.restore();
}

function snapshot(state:StudyState):LatentSnapshot{
  return {designIndex:state.designIndex,branch:state.branch,anchors:[...state.anchors],locked:[...state.locked],visitedDesigns:[...(state.visitedDesigns||[state.designIndex])]};
}

export const RESPONSE_LABELS:Record<string,string>={
  navigate:'TRAVERSING LATENT NEIGHBOURHOOD',broad:'EXPANDING SEARCH RADIUS',local:'REFINING LOCAL CLUSTER','zoom-out':'WIDENING LATENT VIEW',
  anchor:'PLACING ANCHOR AT CURSOR','return-anchor':'RETURNING TO PRESERVED STATE',branch:'GENERATING NEW BRANCH',lock:'PRESERVING BACKREST',
  unlock:'RELEASING BACKREST',undo:'REVERSING LAST MOVE',compare:'ALIGNING PRESERVED STATES',reset:'RESTORING INITIAL STATE',
  history:'RECONSTRUCTING VISITED PATH','timeline-branch':'SWITCHING EXPLORATION PATH',select:'COMMITTING FINAL SELECTION',
};

export function CandidateField({state}:{state:StudyState}){
  const canvas=useRef<HTMLCanvasElement>(null);
  const points=useMemo(()=>seededPoints(),[]);
  useEffect(()=>{
    const element=canvas.current;if(!element)return;
    const ctx=element.getContext('2d');if(!ctx)return;
    let frame=0;let width=0,height=0,dpr=1;
    const resize=()=>{
      const rect=element.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);dpr=Math.min(window.devicePixelRatio||1,2);
      element.width=Math.round(width*dpr);element.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);paint();
    };
    const from=state.responseFrom?.visitedDesigns?snapshot({...state,...state.responseFrom}):snapshot(state);
    const target=state.responseTarget?.visitedDesigns?state.responseTarget:snapshot(state);
    const isRunning=state.responsePhase==='running'&&state.screen==='responding';
    const response=state.response;
    const paint=()=>{
      window.cancelAnimationFrame(frame);
      const raw=isRunning?clamp((Date.now()-Number(state.responseStartedAt||Date.now()))/Number(state.responseDurationMs||2800)):1;
      const recognition=smooth(raw/.14),transform=smooth((raw-.14)/.68),resolution=smooth((raw-.82)/.18);
      const start=designPoint(from.designIndex,width,height),end=designPoint(target.designIndex,width,height);
      const travelling=['navigate','return-anchor','branch','undo','reset','timeline-branch'].includes(response);
      const current=travelling&&isRunning?curvePoint(start,end,transform,response==='timeline-branch'?35:0):end;
      ctx.clearRect(0,0,width,height);

      const worldScale=response==='zoom-out'&&isRunning?mix(1,.78,transform):response==='broad'&&isRunning?mix(1,1.13,transform):1;
      const focus=response==='local'?start:current;
      for(const p of points){
        let x=p.x*width,y=p.y*height;
        x=width/2+(x-width/2)*worldScale;y=height/2+(y-height/2)*worldScale;
        const initialDistance=Math.hypot(x-focus.x,y-focus.y);
        if(response==='local'&&isRunning&&initialDistance<185){const k=mix(1,.82,transform);x=focus.x+(x-focus.x)*k;y=focus.y+(y-focus.y)*k;}
        if(response==='navigate'&&isRunning){const wake=Math.exp(-Math.pow(initialDistance/170,2));x+=Math.cos(p.drift)*7*wake*transform;y+=Math.sin(p.drift)*5*wake*transform;}
        if(response==='branch'&&isRunning&&p.cluster===target.designIndex%8){x+=36*transform;y-=22*transform;}
        const distance=Math.hypot(x-current.x,y-current.y),near=distance<125;
        let alpha=p.alpha+(near?.17:0);
        if(response==='local'&&isRunning)alpha*=initialDistance<190?mix(1,1.65,transform):mix(1,.2,transform);
        if(response==='broad'&&isRunning)alpha*=mix(.75,1.45,transform)*(p.cluster%2?.86:1.08);
        if(response==='zoom-out'&&isRunning)alpha*=mix(.75,1.15,transform);
        if(response==='select'&&isRunning&&distance>90)alpha*=mix(1,.16,transform);
        if(response==='reset'&&isRunning)alpha*=1-.48*Math.sin(raw*Math.PI);
        ctx.fillStyle=`rgba(214,218,223,${clamp(alpha,0,.84)})`;ctx.beginPath();ctx.arc(x,y,near?p.size+.18:p.size,0,Math.PI*2);ctx.fill();
      }

      const history=from.visitedDesigns?.length?from.visitedDesigns:[from.designIndex];
      if(response!=='reset'||!isRunning||transform<.7){
        for(let i=1;i<history.length;i++)line(ctx,designPoint(history[i-1],width,height),designPoint(history[i],width,height),1,response==='reset'&&isRunning?`rgba(255,159,69,${.32*(1-transform)})`:'rgba(255,159,69,.25)');
      }

      for(let i=0;i<from.anchors.length;i++)node(ctx,designPoint(from.anchors[i],width,height),'#69b9e3',5,`A${i+1}`);

      if(isRunning){
        if(travelling)line(ctx,start,end,transform,'rgba(255,159,69,.8)',true,response==='timeline-branch'?35:0);
        if(response==='broad'){
          [38,72,116,168].forEach((radius,i)=>{ctx.strokeStyle=`rgba(255,159,69,${(.65-i*.1)*recognition})`;ctx.beginPath();ctx.arc(start.x,start.y,radius*transform,0,Math.PI*2);ctx.stroke()});
        }
        if(response==='local'){
          const radius=mix(180,62,transform);ctx.strokeStyle=`rgba(255,159,69,${.35+.5*recognition})`;ctx.setLineDash([4,5]);ctx.beginPath();ctx.arc(start.x,start.y,radius,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
          [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sy])=>{ctx.beginPath();ctx.moveTo(start.x+sx*(radius+20),start.y+sy*radius);ctx.lineTo(start.x+sx*radius,start.y+sy*radius);ctx.stroke()});
        }
        if(response==='zoom-out'){
          for(let i=0;i<5;i++){const angle=i*1.26+.2;const radius=mix(45,180,transform);ctx.fillStyle=`rgba(105,185,227,${.12+.2*transform})`;ctx.beginPath();ctx.arc(start.x+Math.cos(angle)*radius,start.y+Math.sin(angle)*radius*.65,3+2*transform,0,Math.PI*2);ctx.fill()}
        }
        if(response==='anchor'){
          const dock={x:24,y:height*.72},travel=smooth((raw-.08)/.64),token=curvePoint(dock,start,travel,40);
          line(ctx,dock,start,travel,'rgba(105,185,227,.42)',true,40);node(ctx,token,'#69b9e3',7,travel>.92?`A${from.anchors.length+1}`:'');
          if(resolution>0){ctx.strokeStyle=`rgba(105,185,227,${1-resolution})`;ctx.beginPath();ctx.arc(start.x,start.y,18+resolution*30,0,Math.PI*2);ctx.stroke()}
        }
        if(response==='return-anchor'){
          ctx.strokeStyle=`rgba(105,185,227,${.3+.65*recognition})`;ctx.beginPath();ctx.arc(end.x,end.y,12+recognition*14,0,Math.PI*2);ctx.stroke();
        }
        if(response==='branch'){
          const junction=curvePoint(start,end,.28);const alternate={x:clamp(junction.x+150,40,width-40),y:clamp(junction.y+78,40,height-40)};
          line(ctx,junction,alternate,transform,'rgba(79,163,209,.75)',false,-18);
          for(let i=0;i<8;i++){const reveal=clamp(transform*1.35-i*.08);if(!reveal)continue;const p=curvePoint(junction,alternate,i/7,-18);ctx.fillStyle=`rgba(105,185,227,${reveal*.75})`;ctx.beginPath();ctx.arc(p.x+Math.sin(i*4)*9,p.y+Math.cos(i*3)*6,1.8,0,Math.PI*2);ctx.fill()}
        }
        if(response==='lock'||response==='unlock'){
          const closed=response==='lock'?transform:1-transform,span=mix(48,19,closed);ctx.strokeStyle=response==='lock'?'#6fbf73':'#ff9f45';ctx.lineWidth=1.6;
          ctx.beginPath();ctx.moveTo(start.x-span,start.y-29);ctx.lineTo(start.x-span,start.y+29);ctx.moveTo(start.x+span,start.y-29);ctx.lineTo(start.x+span,start.y+29);ctx.stroke();
          ctx.strokeRect(start.x-8,start.y-1,16,13);ctx.beginPath();ctx.arc(start.x,start.y-1,7,Math.PI,0);ctx.stroke();
        }
        if(response==='select'){
          const size=mix(52,23,transform);ctx.strokeStyle='#6fbf73';ctx.lineWidth=1.6;ctx.strokeRect(start.x-size,start.y-size,size*2,size*2);
          if(resolution>.25){ctx.beginPath();ctx.moveTo(start.x-8,start.y);ctx.lineTo(start.x-1,start.y+8);ctx.lineTo(start.x+13,start.y-10);ctx.stroke()}
        }
        if(response==='undo')line(ctx,end,start,1-transform,'rgba(214,218,223,.28)',true);
        if(response==='compare'){
          const ids=from.anchors.slice(-2);while(ids.length<2)ids.push((from.designIndex+ids.length*7+5)%28);
          const a=designPoint(ids[0],width,height),b=designPoint(ids[1],width,height);line(ctx,a,b,transform,'rgba(105,185,227,.7)',true);
          [a,b].forEach((p,i)=>{const size=5+transform*18;ctx.strokeStyle='#69b9e3';ctx.strokeRect(p.x-size,p.y-size,size*2,size*2);ctx.fillStyle='#8bd2f1';ctx.font='9px ui-monospace';ctx.fillText(`A${i+1}`,p.x+size+6,p.y)});
        }
        if(response==='reset'){
          ctx.fillStyle=`rgba(8,10,12,${Math.sin(raw*Math.PI)*.42})`;ctx.fillRect(0,0,width,height);
          ctx.strokeStyle=`rgba(255,159,69,${.2+.55*resolution})`;ctx.beginPath();ctx.arc(end.x,end.y,18+30*(1-resolution),0,Math.PI*2);ctx.stroke();
        }
        if(response==='history'){
          for(let i=1;i<history.length;i++){const segment=clamp(transform*history.length-i+1);line(ctx,designPoint(history[i-1],width,height),designPoint(history[i],width,height),segment,'rgba(255,159,69,.82)');if(segment>.75)node(ctx,designPoint(history[i],width,height),'rgba(255,159,69,.9)',3,String(i+1))}
        }
        if(response==='timeline-branch'){
          const junction=curvePoint(start,end,.42,35);ctx.strokeStyle='#69b9e3';ctx.beginPath();ctx.arc(junction.x,junction.y,6+8*recognition,0,Math.PI*2);ctx.stroke();
        }
      }

      cursor(ctx,current,resolution);
      if(isRunning&&raw<1)frame=window.requestAnimationFrame(paint);
    };
    const observer=new ResizeObserver(resize);observer.observe(element);resize();
    return()=>{observer.disconnect();window.cancelAnimationFrame(frame)};
  },[points,state.animationId,state.responsePhase,state.responseStartedAt,state.responseDurationMs,state.response,state.designIndex,state.branch,state.anchors,state.locked,state.visitedDesigns,state.responseFrom,state.responseTarget,state.screen]);
  return <canvas ref={canvas} className="candidate-canvas" aria-label="Animated latent design space showing the current response"/>;
}

export function animationProgress(state:StudyState,now=Date.now()){
  if(state.responsePhase==='complete')return 1;
  if(state.responsePhase!=='running')return 0;
  return clamp((now-Number(state.responseStartedAt||now))/Number(state.responseDurationMs||2800));
}

export function activeDesignLabel(state:StudyState){
  return state.responsePhase==='running'?`${designId(state.responseFrom.designIndex)} → ${designId(state.responseTarget.designIndex)}`:designId(state.designIndex);
}
