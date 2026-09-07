'use client';

import { useEffect, useState, useRef } from 'react';
import { designId, LatentSnapshot, StudyState } from './study';

type MapPoint=[number,number,number];
type Exemplar={designIndex:number;sourceIndex:number;position:[number,number];points:number[]};
type LatentData={source:string;dimensions:number;pointCount:number;map:MapPoint[];exemplars:Exemplar[]};
type XY={x:number;y:number};

let latentDataPromise:Promise<LatentData>|null=null;
function loadLatentData(){
  latentDataPromise??=fetch('/latent-space.json').then(response=>{
    if(!response.ok)throw new Error('Unable to load latent-space data');
    return response.json() as Promise<LatentData>;
  });
  return latentDataPromise;
}

function useLatentData(){
  const [data,setData]=useState<LatentData|null>(null);
  useEffect(()=>{let live=true;loadLatentData().then(value=>live&&setData(value)).catch(()=>{});return()=>{live=false}},[]);
  return data;
}

const clamp=(value:number,min=0,max=1)=>Math.max(min,Math.min(max,value));
const smooth=(value:number)=>{const t=clamp(value);return t*t*(3-2*t)};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;

export const RESPONSE_LABELS:Record<string,string>={
  navigate:'TRAVERSING THE LEARNED MANIFOLD',broad:'EXPANDING TO DISTANT REGIONS',local:'SAMPLING THE LOCAL NEIGHBOURHOOD','zoom-out':'REVEALING THE FULL EMBEDDING',
  anchor:'PRESERVING THIS LATENT VECTOR','return-anchor':'RETURNING TO THE SAVED VECTOR',branch:'CREATING A NEW EXPLORATION PATH',lock:'CONSTRAINING BACKREST FEATURES',
  unlock:'RELEASING FEATURE CONSTRAINT',undo:'REVERSING THE LAST LATENT STEP',compare:'COMPARING SAVED LATENT VECTORS',reset:'RETURNING TO THE INITIAL VECTOR',
  history:'REPLAYING VISITED LATENT VECTORS','timeline-branch':'SWITCHING EXPLORATION BRANCH',select:'COMMITTING THE GENERATED DESIGN',
};

export function animationProgress(state:StudyState,now=Date.now()){
  if(state.responsePhase==='complete')return 1;
  if(state.responsePhase!=='running')return 0;
  return clamp((now-Number(state.responseStartedAt||now))/Number(state.responseDurationMs||2800));
}

export function activeDesignLabel(state:StudyState){
  if(state.responsePhase==='running')return `${designId(state.responseFrom.designIndex)} → ${designId(state.responseTarget.designIndex)}`;
  return designId(state.designIndex);
}

function snap(state:StudyState):LatentSnapshot{
  return {designIndex:state.designIndex,branch:state.branch,anchors:[...state.anchors],locked:[...state.locked],visitedDesigns:[...(state.visitedDesigns||[state.designIndex])]};
}

function curve(a:XY,b:XY,t:number,bend=0):XY{
  const u=1-t,cx=(a.x+b.x)/2,cy=(a.y+b.y)/2-bend;
  return{x:u*u*a.x+2*u*t*cx+t*t*b.x,y:u*u*a.y+2*u*t*cy+t*t*b.y};
}

function path(ctx:CanvasRenderingContext2D,a:XY,b:XY,progress:number,color:string,dashed=false,bend=0){
  ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1.35;if(dashed)ctx.setLineDash([5,6]);ctx.beginPath();
  const steps=36,end=Math.max(1,Math.floor(steps*clamp(progress)));
  for(let i=0;i<=end;i++){const p=curve(a,b,i/steps,bend);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)}ctx.stroke();ctx.restore();
}

function marker(ctx:CanvasRenderingContext2D,p:XY,color:string,size=6,label=''){
  ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1.4;ctx.strokeRect(p.x-size,p.y-size,size*2,size*2);
  if(label){ctx.fillStyle=color;ctx.font='9px ui-monospace, monospace';ctx.fillText(label,p.x+size+5,p.y+3)}ctx.restore();
}

export function CandidateField({state}:{state:StudyState}){
  const canvas=useRef<HTMLCanvasElement>(null),data=useLatentData();
  useEffect(()=>{
    const element=canvas.current;if(!element||!data)return;
    const ctx=element.getContext('2d');if(!ctx)return;
    let width=1,height=1,dpr=1,frame=0;
    const xs=data.map.map(point=>point[0]),ys=data.map.map(point=>point[1]);
    const bounds={minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
    const from=state.responseFrom?.visitedDesigns?state.responseFrom:snap(state);
    const target=state.responseTarget?.visitedDesigns?state.responseTarget:snap(state);
    const exemplar=(index:number)=>data.exemplars[((index%data.exemplars.length)+data.exemplars.length)%data.exemplars.length];
    const running=state.responsePhase==='running'&&state.screen==='responding';
    const position=(index:number,scale=1,focus?:[number,number]):XY=>{
      const [x,y]=exemplar(index).position;
      const nx=(x-bounds.minX)/(bounds.maxX-bounds.minX),ny=(y-bounds.minY)/(bounds.maxY-bounds.minY);
      let px=.06*width+nx*.88*width,py=.06*height+(1-ny)*.88*height;
      if(focus){const fx=.06*width+((focus[0]-bounds.minX)/(bounds.maxX-bounds.minX))*.88*width;const fy=.06*height+(1-(focus[1]-bounds.minY)/(bounds.maxY-bounds.minY))*.88*height;px=fx+(px-fx)*scale;py=fy+(py-fy)*scale}
      return{x:px,y:py};
    };
    const paint=()=>{
      const raw=running?animationProgress(state):1,recognition=smooth(raw/.15),motion=smooth((raw-.15)/.68),settle=smooth((raw-.83)/.17);
      const focus=exemplar(from.designIndex).position;
      let viewScale=1;
      if(running&&(state.response==='broad'||state.response==='zoom-out'))viewScale=mix(1,.72,motion);
      if(running&&state.response==='local')viewScale=mix(1,1.75,motion);
      ctx.clearRect(0,0,width,height);
      for(let i=0;i<data.map.length;i++){
        const [x,y,category]=data.map[i];
        const nx=(x-bounds.minX)/(bounds.maxX-bounds.minX),ny=(y-bounds.minY)/(bounds.maxY-bounds.minY);
        let px=.06*width+nx*.88*width,py=.06*height+(1-ny)*.88*height;
        const fx=.06*width+((focus[0]-bounds.minX)/(bounds.maxX-bounds.minX))*.88*width,fy=.06*height+(1-(focus[1]-bounds.minY)/(bounds.maxY-bounds.minY))*.88*height;
        px=fx+(px-fx)*viewScale;py=fy+(py-fy)*viewScale;
        if(px<0||px>width||py<0||py>height)continue;
        let alpha=category?.19:.25;
        if(state.response==='local'&&running){const distance=Math.hypot(px-fx,py-fy);alpha*=distance<145?mix(1,2.15,motion):mix(1,.2,motion)}
        if(state.response==='select'&&running)alpha*=mix(1,.2,motion);
        ctx.fillStyle=category?`rgba(211,75,91,${alpha})`:`rgba(75,125,221,${alpha})`;
        ctx.fillRect(px,py,category?1.15:1.25,category?1.15:1.25);
      }
      ctx.font='8px ui-monospace, monospace';ctx.fillStyle='rgba(92,137,224,.72)';ctx.fillText('CHAIRS · 6 778',18,22);ctx.fillStyle='rgba(224,84,99,.72)';ctx.fillText('TABLES · 8 509',18,36);
      const pointFor=(index:number)=>position(index,viewScale,focus);
      const history=from.visitedDesigns?.length?from.visitedDesigns:[from.designIndex];
      for(let i=1;i<history.length;i++)path(ctx,pointFor(history[i-1]),pointFor(history[i]),1,'rgba(255,159,69,.28)');
      const start=pointFor(from.designIndex),end=pointFor(target.designIndex);
      const travelling=['navigate','return-anchor','branch','undo','reset','timeline-branch'].includes(state.response);
      const current=running&&travelling?curve(start,end,motion,state.response==='timeline-branch'?42:28):end;
      for(let i=0;i<from.anchors.length;i++)marker(ctx,pointFor(from.anchors[i]),'#69b9e3',5,`A${i+1}`);
      if(running){
        if(travelling)path(ctx,start,end,motion,'rgba(255,159,69,.88)',true,state.response==='timeline-branch'?42:28);
        if(state.response==='broad'||state.response==='zoom-out')for(let i=0;i<4;i++){ctx.strokeStyle=`rgba(255,159,69,${.6-i*.1})`;ctx.beginPath();ctx.arc(start.x,start.y,(35+i*42)*motion,0,Math.PI*2);ctx.stroke()}
        if(state.response==='local'){const radius=mix(170,48,motion);ctx.strokeStyle='rgba(255,159,69,.8)';ctx.setLineDash([4,5]);ctx.beginPath();ctx.arc(start.x,start.y,radius,0,Math.PI*2);ctx.stroke();ctx.setLineDash([])}
        if(state.response==='anchor'){const dock={x:26,y:height*.73},token=curve(dock,start,smooth((raw-.08)/.64),40);path(ctx,dock,start,smooth((raw-.08)/.64),'rgba(105,185,227,.5)',true,40);marker(ctx,token,'#69b9e3',7,motion>.85?`A${from.anchors.length+1}`:'')}
        if(state.response==='return-anchor'){ctx.strokeStyle=`rgba(105,185,227,${.3+.65*recognition})`;ctx.beginPath();ctx.arc(end.x,end.y,10+20*recognition,0,Math.PI*2);ctx.stroke()}
        if(state.response==='branch'){const junction=curve(start,end,.32,28),alternate={x:clamp(junction.x+150,35,width-35),y:clamp(junction.y+72,35,height-35)};path(ctx,junction,alternate,motion,'rgba(105,185,227,.78)',false,-20)}
        if(state.response==='lock'||state.response==='unlock'){const closed=state.response==='lock'?motion:1-motion,span=mix(48,18,closed);ctx.strokeStyle=state.response==='lock'?'#6fbf73':'#ff9f45';ctx.beginPath();ctx.moveTo(start.x-span,start.y-26);ctx.lineTo(start.x-span,start.y+26);ctx.moveTo(start.x+span,start.y-26);ctx.lineTo(start.x+span,start.y+26);ctx.stroke()}
        if(state.response==='compare'){const ids=from.anchors.slice(-2);while(ids.length<2)ids.push((from.designIndex+ids.length*7+3)%28);const a=pointFor(ids[0]),b=pointFor(ids[1]);path(ctx,a,b,motion,'rgba(105,185,227,.8)',true);[a,b].forEach((p,i)=>marker(ctx,p,'#69b9e3',5+16*motion,`A${i+1}`))}
        if(state.response==='select'){const size=mix(48,22,motion);ctx.strokeStyle='#6fbf73';ctx.lineWidth=1.6;ctx.strokeRect(start.x-size,start.y-size,size*2,size*2);if(settle>.3){ctx.beginPath();ctx.moveTo(start.x-8,start.y);ctx.lineTo(start.x-1,start.y+8);ctx.lineTo(start.x+13,start.y-10);ctx.stroke()}}
        if(state.response==='history')for(let i=1;i<history.length;i++){const reveal=clamp(motion*history.length-i+1);path(ctx,pointFor(history[i-1]),pointFor(history[i]),reveal,'rgba(255,159,69,.9)');if(reveal>.8)marker(ctx,pointFor(history[i]),'#ff9f45',3,String(i+1))}
        if(state.response==='reset'){ctx.fillStyle=`rgba(7,9,12,${Math.sin(raw*Math.PI)*.42})`;ctx.fillRect(0,0,width,height)}
      }
      ctx.save();ctx.strokeStyle='#ff9f45';ctx.fillStyle='#ff9f45';ctx.lineWidth=1.35;ctx.beginPath();ctx.arc(current.x,current.y,16+Math.sin(settle*Math.PI)*3,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(current.x-24,current.y);ctx.lineTo(current.x+24,current.y);ctx.moveTo(current.x,current.y-24);ctx.lineTo(current.x,current.y+24);ctx.stroke();ctx.beginPath();ctx.arc(current.x,current.y,2.4,0,Math.PI*2);ctx.fill();ctx.restore();
      if(running&&raw<1)frame=requestAnimationFrame(paint);
    };
    const resize=()=>{const rect=element.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);dpr=Math.min(devicePixelRatio||1,2);element.width=Math.round(width*dpr);element.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);paint()};
    const observer=new ResizeObserver(resize);observer.observe(element);resize();return()=>{observer.disconnect();cancelAnimationFrame(frame)};
  },[data,state]);
  return <canvas ref={canvas} className="candidate-canvas" aria-label="ShapeNet chair and table latent-space embedding"/>;
}

export function PointCloudPreview({state,small=false}:{state:StudyState;small?:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null),data=useLatentData();
  useEffect(()=>{
    const element=canvas.current;if(!element||!data)return;const ctx=element.getContext('2d');if(!ctx)return;
    let width=1,height=1,dpr=1,frame=0,startTime=performance.now();
    const exemplar=(index:number)=>data.exemplars[((index%data.exemplars.length)+data.exemplars.length)%data.exemplars.length];
    const from=exemplar(state.responsePhase==='running'?state.responseFrom.designIndex:state.designIndex),to=exemplar(state.responsePhase==='running'?state.responseTarget.designIndex:state.designIndex);
    const paint=(now=performance.now())=>{
      const progress=state.responsePhase==='running'?animationProgress(state):1,angle=small?-.55:-.65+Math.sin((now-startTime)/6000)*.18;
      const cos=Math.cos(angle),sin=Math.sin(angle),projected:Array<[number,number,number,number]>=[];
      let maxExtent=.001;
      for(let i=0;i<from.points.length;i+=3){const x=mix(from.points[i],to.points[i],progress),y=mix(from.points[i+1],to.points[i+1],progress),z=mix(from.points[i+2],to.points[i+2],progress);maxExtent=Math.max(maxExtent,Math.abs(x),Math.abs(y),Math.abs(z));const rx=x*cos-z*sin,depth=x*sin+z*cos;projected.push([rx,y,depth,z])}
      projected.sort((a,b)=>a[2]-b[2]);const scale=(small?.38:.4)*Math.min(width,height)/maxExtent;
      ctx.clearRect(0,0,width,height);ctx.fillStyle=small?'#14171a':'#15191d';ctx.fillRect(0,0,width,height);
      for(const [x,y,depth,z] of projected){const shade=clamp(.45+(z/maxExtent)*.35,.12,.92);ctx.fillStyle=`hsla(${mix(236,35,shade)},78%,${mix(48,69,shade)}%,.82)`;const radius=small?.75:1.25+clamp(depth/maxExtent,-1,1)*.25;ctx.beginPath();ctx.arc(width/2+x*scale,height*.52-y*scale+depth*scale*.12,radius,0,Math.PI*2);ctx.fill()}
      if(!small){ctx.fillStyle='rgba(215,220,225,.64)';ctx.font='8px ui-monospace, monospace';ctx.fillText(`SHAPENET #${to.sourceIndex} · 1 024 POINTS`,10,height-10)}
      frame=requestAnimationFrame(paint);
    };
    const resize=()=>{const rect=element.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);dpr=Math.min(devicePixelRatio||1,2);element.width=Math.round(width*dpr);element.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)};
    const observer=new ResizeObserver(resize);observer.observe(element);resize();frame=requestAnimationFrame(paint);return()=>{observer.disconnect();cancelAnimationFrame(frame)};
  },[data,state.animationId,state.responsePhase,state.responseStartedAt,state.designIndex,state.responseFrom,state.responseTarget,small]);
  return <canvas ref={canvas} className={small?'point-preview small':'point-preview'} aria-label="Decoded ShapeNet point-cloud preview"/>;
}
