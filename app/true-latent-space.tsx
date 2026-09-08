'use client';

import { useEffect, useState, useRef } from 'react';
import { designId, LatentSnapshot, StudyState, latentSnapshot } from './study';
import { decodePosition, encodePosition } from './latent-position';

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
  return latentSnapshot(state);
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

export function CandidateField({state,onExplore}:{state:StudyState;onExplore?:(index:number,finished?:boolean)=>void}){
  const canvas=useRef<HTMLCanvasElement>(null),data=useLatentData();
  const latest=useRef(state);latest.current=state;
  const dragging=useRef(false);
  // The participant can move through the latent space at any time while the
  // session is recording -- before a trial starts, during a response
  // animation, and after a response has completed.
  const interactive=!!onExplore&&state.recording;
  const pick=(event:React.PointerEvent<HTMLCanvasElement>,finished=false)=>{
    if(!interactive)return;
    const rect=event.currentTarget.getBoundingClientRect();
    const scale=latest.current.viewScale||1;
    const x=((event.clientX-rect.left)/rect.width-.5)/scale+.5;
    const y=((event.clientY-rect.top)/rect.height-.5)/scale+.5;
    onExplore?.(encodePosition((x-.06)/.88,1-(y-.06)/.88),finished);
  };
  useEffect(()=>{
    const element=canvas.current;if(!element||!data)return;
    const ctx=element.getContext('2d');if(!ctx)return;
    let width=1,height=1,dpr=1,frame=0;
    const xs=data.map.map(point=>point[0]),ys=data.map.map(point=>point[1]);
    const bounds={minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
    const mapLayer=document.createElement('canvas');
    const exemplar=(index:number)=>data.exemplars[((index%data.exemplars.length)+data.exemplars.length)%data.exemplars.length];
    const worldPosition=(index:number):[number,number]=>{const p=decodePosition(index);return p?[mix(bounds.minX,bounds.maxX,p[0]),mix(bounds.minY,bounds.maxY,p[1])]:exemplar(index).position};
    const position=(index:number,scale=1,focus?:[number,number]):XY=>{
      const [x,y]=worldPosition(index);
      const nx=(x-bounds.minX)/(bounds.maxX-bounds.minX),ny=(y-bounds.minY)/(bounds.maxY-bounds.minY);
      let px=.06*width+nx*.88*width,py=.06*height+(1-ny)*.88*height;
      if(focus){const fx=.06*width+((focus[0]-bounds.minX)/(bounds.maxX-bounds.minX))*.88*width;const fy=.06*height+(1-(focus[1]-bounds.minY)/(bounds.maxY-bounds.minY))*.88*height;px=fx+(px-fx)*scale;py=fy+(py-fy)*scale}
      return{x:px,y:py};
    };
    const paint=()=>{
      const state=latest.current;
      const running=state.responsePhase==='running'&&state.screen==='responding';
      const animating=['queued','running'].includes(state.responsePhase);
      const from=running?state.responseFrom:snap(state),target=running?state.responseTarget:snap(state);
      const raw=running?animationProgress(state):1,recognition=smooth(raw/.15),motion=smooth((raw-.15)/.68),settle=smooth((raw-.83)/.17);
      const focus:[number,number]=[(bounds.minX+bounds.maxX)/2,(bounds.minY+bounds.maxY)/2];
      const viewScale=animating?mix(from.viewScale||1,target.viewScale||1,running?motion:0):(state.viewScale||1);
      ctx.clearRect(0,0,width,height);
      ctx.save();ctx.translate(width/2,height/2);ctx.scale(viewScale,viewScale);ctx.drawImage(mapLayer,-width/2,-height/2,width,height);ctx.restore();
      ctx.font='8px ui-monospace, monospace';ctx.fillStyle='rgba(92,137,224,.72)';ctx.fillText('CHAIRS · 6 778',18,22);ctx.fillStyle='rgba(224,84,99,.72)';ctx.fillText('TABLES · 8 509',18,36);
      const pointFor=(index:number)=>position(index,viewScale,focus);
      const history=from.visitedDesigns?.length?from.visitedDesigns:[from.designIndex];
      for(let i=1;i<history.length;i++)path(ctx,pointFor(history[i-1]),pointFor(history[i]),1,'rgba(255,159,69,.28)');
      const start=pointFor(from.designIndex),end=pointFor(target.designIndex);
      const travelling=['navigate','broad','local','return-anchor','branch','undo','reset','timeline-branch'].includes(state.response);
      const current=running&&travelling?{x:mix(start.x,end.x,motion),y:mix(start.y,end.y,motion)}:pointFor(state.designIndex);
      for(let i=0;i<from.anchors.length;i++)marker(ctx,pointFor(from.anchors[i]),'#69b9e3',5,`A${i+1}`);
      if(running){
        if(travelling&&from.designIndex!==target.designIndex)path(ctx,start,end,motion,'rgba(255,159,69,.88)',true);
        if(state.response==='broad'||state.response==='zoom-out')for(let i=0;i<4;i++){ctx.strokeStyle=`rgba(255,159,69,${.6-i*.1})`;ctx.beginPath();ctx.arc(start.x,start.y,(35+i*42)*motion,0,Math.PI*2);ctx.stroke()}
        if(state.response==='local'){const radius=mix(170,48,motion);ctx.strokeStyle='rgba(255,159,69,.8)';ctx.setLineDash([4,5]);ctx.beginPath();ctx.arc(start.x,start.y,radius,0,Math.PI*2);ctx.stroke();ctx.setLineDash([])}
        if(state.response==='anchor'){const dock={x:26,y:height*.73},token=curve(dock,start,smooth((raw-.08)/.64),40);path(ctx,dock,start,smooth((raw-.08)/.64),'rgba(105,185,227,.5)',true,40);marker(ctx,token,'#69b9e3',7,motion>.85?`A${from.anchors.length+1}`:'')}
        if(state.response==='return-anchor'){ctx.strokeStyle=`rgba(105,185,227,${.3+.65*recognition})`;ctx.beginPath();ctx.arc(end.x,end.y,10+20*recognition,0,Math.PI*2);ctx.stroke()}
        if(state.response==='branch')marker(ctx,current,'#69b9e3',8,target.branch);
        if(state.response==='lock'||state.response==='unlock'){const closed=state.response==='lock'?motion:1-motion,span=mix(48,18,closed);ctx.strokeStyle=state.response==='lock'?'#6fbf73':'#ff9f45';ctx.beginPath();ctx.moveTo(start.x-span,start.y-26);ctx.lineTo(start.x-span,start.y+26);ctx.moveTo(start.x+span,start.y-26);ctx.lineTo(start.x+span,start.y+26);ctx.stroke()}
        if(state.response==='compare'&&from.anchors.length>=2){const ids=from.anchors.slice(-2);const a=pointFor(ids[0]),b=pointFor(ids[1]);path(ctx,a,b,motion,'rgba(105,185,227,.8)',true);[a,b].forEach((p,i)=>marker(ctx,p,'#69b9e3',5+16*motion,`A${i+1}`))}
        if(state.response==='select'){const size=mix(48,22,motion);ctx.strokeStyle='#6fbf73';ctx.lineWidth=1.6;ctx.strokeRect(start.x-size,start.y-size,size*2,size*2);if(settle>.3){ctx.beginPath();ctx.moveTo(start.x-8,start.y);ctx.lineTo(start.x-1,start.y+8);ctx.lineTo(start.x+13,start.y-10);ctx.stroke()}}
        if(state.response==='history')for(let i=1;i<history.length;i++){const reveal=clamp(motion*history.length-i+1);path(ctx,pointFor(history[i-1]),pointFor(history[i]),reveal,'rgba(255,159,69,.9)');if(reveal>.8)marker(ctx,pointFor(history[i]),'#ff9f45',3,String(i+1))}
        if(state.response==='reset'){ctx.fillStyle=`rgba(7,9,12,${Math.sin(raw*Math.PI)*.42})`;ctx.fillRect(0,0,width,height)}
      }
      ctx.save();ctx.strokeStyle='#ff9f45';ctx.fillStyle='#ff9f45';ctx.lineWidth=1.35;ctx.beginPath();ctx.arc(current.x,current.y,16+Math.sin(settle*Math.PI)*3,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(current.x-24,current.y);ctx.lineTo(current.x+24,current.y);ctx.moveTo(current.x,current.y-24);ctx.lineTo(current.x,current.y+24);ctx.stroke();ctx.beginPath();ctx.arc(current.x,current.y,2.4,0,Math.PI*2);ctx.fill();ctx.restore();
      frame=requestAnimationFrame(paint);
    };
    const resize=()=>{const rect=element.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);dpr=Math.min(devicePixelRatio||1,2);element.width=Math.round(width*dpr);element.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
      mapLayer.width=element.width;mapLayer.height=element.height;const layer=mapLayer.getContext('2d')!;layer.scale(dpr,dpr);
      for(const [x,y,category] of data.map){layer.fillStyle=category?'rgba(211,75,91,.35)':'rgba(75,125,221,.5)';layer.fillRect((.06+(x-bounds.minX)/(bounds.maxX-bounds.minX)*.88)*width,(.06+(1-(y-bounds.minY)/(bounds.maxY-bounds.minY))*.88)*height,1.2,1.2)}
    };
    const observer=new ResizeObserver(resize);observer.observe(element);resize();paint();return()=>{observer.disconnect();cancelAnimationFrame(frame)};
  },[data]);
  return <canvas ref={canvas} className="candidate-canvas" style={{touchAction:'none',cursor:interactive?'crosshair':'default'}} aria-label="ShapeNet latent space: click or drag to explore" onPointerDown={e=>{if(!interactive||e.button!==0)return;e.preventDefault();dragging.current=true;e.currentTarget.setPointerCapture(e.pointerId);pick(e)}} onPointerMove={e=>{if(dragging.current)pick(e)}} onPointerUp={e=>{if(dragging.current)pick(e,true);dragging.current=false}} onPointerCancel={e=>{if(dragging.current)pick(e,true);dragging.current=false}} onLostPointerCapture={()=>{dragging.current=false}}/>;
}

const geometryCache=new WeakMap<LatentData,Map<number,number[]>>();
function geometryAt(data:LatentData,index:number):number[]{
  let cache=geometryCache.get(data);if(!cache){cache=new Map();geometryCache.set(data,cache)}
  const cached=cache.get(index);if(cached)return cached;
  const p=decodePosition(index);
  if(!p)return data.exemplars[((index%data.exemplars.length)+data.exemplars.length)%data.exemplars.length].points;
  const xs=data.map.map(v=>v[0]),ys=data.map.map(v=>v[1]);
  const x=mix(Math.min(...xs),Math.max(...xs),p[0]),y=mix(Math.min(...ys),Math.max(...ys),p[1]);
  // All exemplars contribute continuously: changing nearest-neighbour membership
  // must not create discontinuous jumps during a drag.
  const weights=data.exemplars.map(e=>1/Math.max((e.position[0]-x)**2+(e.position[1]-y)**2,1e-8)**2);
  const sum=weights.reduce((a,b)=>a+b,0);
  const points=data.exemplars[0].points.map((_,i)=>data.exemplars.reduce((v,e,j)=>v+e.points[i]*weights[j]/sum,0));
  if(cache.size>128)cache.delete(cache.keys().next().value!);cache.set(index,points);return points;
}

export function PointCloudPreview({state,small=false,view='front'}:{state:StudyState;small?:boolean;view?:'front'|'side'|'top'}){
  const canvas=useRef<HTMLCanvasElement>(null),data=useLatentData();
  const latest=useRef(state);latest.current=state;
  useEffect(()=>{
    const element=canvas.current;if(!element||!data)return;const ctx=element.getContext('2d');if(!ctx)return;
    let width=1,height=1,frame=0,last=performance.now();
    const drawn=Float32Array.from(geometryAt(data,latest.current.designIndex));
    const extent=data.exemplars.reduce((max,e)=>e.points.reduce((m,v)=>Math.max(m,Math.abs(v)),max),.001);
    const paint=(now:number)=>{
      const s=latest.current,running=s.responsePhase==='running';
      const progress=running?smooth((animationProgress(s)-.15)/.68):1;
      const from=geometryAt(data,running?s.responseFrom.designIndex:s.designIndex);
      const to=geometryAt(data,running?s.responseTarget.designIndex:s.designIndex);
      const lockedIndex=running?s.responseTarget.lockedDesignIndex:s.lockedDesignIndex;
      const lock=(running?s.responseTarget.locked:s.locked).length&&lockedIndex!==undefined?geometryAt(data,lockedIndex):null;
      const angle=small?(view==='side'?Math.PI/2:0):-.65,cos=Math.cos(angle),sin=Math.sin(angle);
      const follow=1-Math.exp(-Math.min(100,now-last)/65);last=now;
      const projected:Array<[number,number,number,boolean]>=[];
      for(let i=0;i<drawn.length;i+=3){
        const preserved=!!lock&&lock[i+1]>.12*extent;
        for(let axis=0;axis<3;axis++){const goal=preserved?lock![i+axis]:mix(from[i+axis],to[i+axis],progress);drawn[i+axis]+= (goal-drawn[i+axis])*follow;}
        const x=drawn[i],y=drawn[i+1],z=drawn[i+2];
        projected.push([x*cos-z*sin,small&&view==='top'?z:y,x*sin+z*cos,preserved]);
      }
      projected.sort((a,b)=>a[2]-b[2]);const scale=.42*Math.min(width,height)/extent;
      ctx.clearRect(0,0,width,height);ctx.fillStyle='#15191d';ctx.fillRect(0,0,width,height);
      for(const [x,y,depth,preserved] of projected){ctx.fillStyle=preserved?'rgba(127,201,135,.95)':`rgba(160,204,225,${clamp(.68+depth/extent*.2,.35,.95)})`;ctx.beginPath();ctx.arc(width/2+x*scale,height*.52-y*scale+(small?0:depth*scale*.12),small?.8:1.4,0,Math.PI*2);ctx.fill()}
      if(!small){ctx.fillStyle='#a3adb5';ctx.font='9px ui-monospace,monospace';ctx.fillText(lock?'UPPER REGION PRESERVED':'SHAPE PREVIEW',10,height-10)}
      frame=requestAnimationFrame(paint);
    };
    const resize=()=>{const rect=element.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);const dpr=Math.min(devicePixelRatio||1,2);element.width=Math.round(width*dpr);element.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)};
    const observer=new ResizeObserver(resize);observer.observe(element);resize();frame=requestAnimationFrame(paint);
    return()=>{observer.disconnect();cancelAnimationFrame(frame)};
  },[data,small,view]);
  return <canvas ref={canvas} className={small?'point-preview small':'point-preview'} aria-label="Decoded ShapeNet point-cloud preview"/>;
}
