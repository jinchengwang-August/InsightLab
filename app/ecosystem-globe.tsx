"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import worldData from "world-atlas/countries-110m.json";

type Locale="en"|"zh"|"es";
type RegionId="global"|"north-america"|"europe"|"asia"|"africa"|"oceania";
type PartnerKind="founder"|"research"|"university"|"climate"|"contributor"|"builder"|"emerging"|"accelerator";

const globeRegions:Array<{id:RegionId;focus:[number,number]}> = [
  {id:"global",focus:[20,12]},
  {id:"north-america",focus:[-105,38]},
  {id:"europe",focus:[10,50]},
  {id:"asia",focus:[103,30]},
  {id:"africa",focus:[20,2]},
  {id:"oceania",focus:[137,-27]},
];

const globePartners:Array<{city:string;kind:PartnerKind;region:RegionId;coordinates:[number,number]}> = [
  {city:"San Francisco",kind:"founder",region:"north-america",coordinates:[-122.42,37.77]},
  {city:"New York",kind:"research",region:"north-america",coordinates:[-74,40.71]},
  {city:"London",kind:"university",region:"europe",coordinates:[-.13,51.51]},
  {city:"Berlin",kind:"climate",region:"europe",coordinates:[13.4,52.52]},
  {city:"Singapore",kind:"founder",region:"asia",coordinates:[103.82,1.35]},
  {city:"Beijing",kind:"contributor",region:"asia",coordinates:[116.41,39.9]},
  {city:"Bangalore",kind:"builder",region:"asia",coordinates:[77.59,12.97]},
  {city:"Nairobi",kind:"emerging",region:"africa",coordinates:[36.82,-1.29]},
  {city:"Sydney",kind:"accelerator",region:"oceania",coordinates:[151.21,-33.87]},
];

const globeCopy:Record<Locale,{
  eyebrow:string;title:string;accent:string;description:string;disclaimer:string;
  mapStatus:string;rotation:string;nodes:string;instruction:string;canvasLabel:string;
  regions:Record<RegionId,string>;partners:Record<PartnerKind,string>;
}> = {
  en:{
    eyebrow:"ECOSYSTEM MAP · ILLUSTRATIVE",title:"A global network model,",accent:"ready for verified partners.",
    description:"Explore how confirmed founder, university, and research partners can appear by region as the InsightLab network grows.",
    disclaimer:"Illustrative locations only. No formal partnership is implied until a partner is named and verified.",
    mapStatus:"● SAMPLE NETWORK MAP",rotation:"Drag-free auto rotation",nodes:"SAMPLE NODES",instruction:"Click a light to focus its region",
    canvasLabel:"Interactive sample globe showing possible InsightLab ecosystem regions",
    regions:{global:"Global","north-america":"North America",europe:"Europe",asia:"Asia",africa:"Africa",oceania:"Oceania"},
    partners:{founder:"Founder community sample",research:"Research community sample",university:"University innovation sample",climate:"Climate technology sample",contributor:"Contributor community sample",builder:"Builder community sample",emerging:"Emerging-market research sample",accelerator:"Accelerator community sample"},
  },
  zh:{
    eyebrow:"生态网络地图 · 示意",title:"全球网络模型，",accent:"为已验证合作方做好准备。",
    description:"查看随着 InsightLab 网络发展，经过确认的创业、大学与研究合作方未来可如何按地区展示。",
    disclaimer:"地点仅用于示意。在合作方被正式公布并验证前，不代表已经建立正式合作关系。",
    mapStatus:"● 示例网络地图",rotation:"自动平稳旋转",nodes:"个示例节点",instruction:"点击亮点查看对应区域",
    canvasLabel:"展示 InsightLab 潜在生态区域的交互式示例地球仪",
    regions:{global:"全球","north-america":"北美",europe:"欧洲",asia:"亚洲",africa:"非洲",oceania:"大洋洲"},
    partners:{founder:"创业者社区示例",research:"研究社区示例",university:"大学创新示例",climate:"气候科技示例",contributor:"贡献者社区示例",builder:"建设者社区示例",emerging:"新兴市场研究示例",accelerator:"加速器社区示例"},
  },
  es:{
    eyebrow:"MAPA DEL ECOSISTEMA · ILUSTRATIVO",title:"Un modelo de red global,",accent:"preparado para socios verificados.",
    description:"Explora cómo podrían mostrarse por región los socios confirmados de emprendimiento, universidades e investigación.",
    disclaimer:"Las ubicaciones son ilustrativas. No implican una alianza formal hasta que el socio sea nombrado y verificado.",
    mapStatus:"● MAPA DE RED DE EJEMPLO",rotation:"Rotación automática estable",nodes:"NODOS DE EJEMPLO",instruction:"Pulsa una luz para ver su región",
    canvasLabel:"Globo interactivo de ejemplo con posibles regiones del ecosistema InsightLab",
    regions:{global:"Global","north-america":"Norteamérica",europe:"Europa",asia:"Asia",africa:"África",oceania:"Oceanía"},
    partners:{founder:"Ejemplo de comunidad fundadora",research:"Ejemplo de comunidad investigadora",university:"Ejemplo de innovación universitaria",climate:"Ejemplo de tecnología climática",contributor:"Ejemplo de comunidad colaboradora",builder:"Ejemplo de comunidad creadora",emerging:"Ejemplo de investigación emergente",accelerator:"Ejemplo de comunidad aceleradora"},
  },
};

export default function EcosystemGlobe({locale}:{locale:Locale}) {
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const markerPositions=useRef<Array<{x:number;y:number;index:number;visible:boolean}>>([]);
  const selectedRef=useRef<RegionId>("global");
  const hoveredRef=useRef<number|null>(null);
  const requestDrawRef=useRef<()=>void>(()=>undefined);
  const [selected,setSelected]=useState<RegionId>("global");
  const [hovered,setHovered]=useState<number|null>(null);
  const copy=globeCopy[locale];
  const activePartners=selected==="global"?globePartners:globePartners.filter(partner=>partner.region===selected);

  useEffect(()=>{selectedRef.current=selected;requestDrawRef.current();},[selected]);
  useEffect(()=>{hoveredRef.current=hovered;requestDrawRef.current();},[hovered]);

  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas)return;
    const context=canvas.getContext("2d");
    if(!context)return;
    const topology=worldData as unknown as Topology<{countries:GeometryCollection}>;
    const land=feature(topology,topology.objects.countries);
    const projection=geoOrthographic().clipAngle(90).precision(.35);
    const graticule=geoGraticule10();
    let rotation=-18;
    let tilt=-10;
    let scale=190;
    let previous=performance.now();
    let animationFrame=0;
    let inViewport=true;
    const reducedMotion=window.matchMedia("(prefers-reduced-motion:reduce)").matches;

    const draw=(time:number)=>{
      animationFrame=0;
      const rect=canvas.getBoundingClientRect();
      const ratio=Math.min(window.devicePixelRatio||1,2);
      if(canvas.width!==Math.round(rect.width*ratio)||canvas.height!==Math.round(rect.height*ratio)){
        canvas.width=Math.round(rect.width*ratio);
        canvas.height=Math.round(rect.height*ratio);
      }
      context.setTransform(ratio,0,0,ratio,0,0);
      context.clearRect(0,0,rect.width,rect.height);

      const delta=Math.min(time-previous,40);
      previous=time;
      const region=globeRegions.find(item=>item.id===selectedRef.current)??globeRegions[0];
      const targetScale=Math.min(rect.width,rect.height)*(selectedRef.current==="global"?.41:.53);
      if(selectedRef.current==="global"){
        if(hoveredRef.current===null&&!reducedMotion)rotation+=delta*.0042;
        tilt+=(-10-tilt)*.06;
      }else{
        const targetRotation=-region.focus[0];
        const difference=((targetRotation-rotation+540)%360)-180;
        rotation+=difference*.075;
        tilt+=(-region.focus[1]-tilt)*.075;
      }
      scale+=(targetScale-scale)*.075;
      projection.translate([rect.width/2,rect.height/2]).scale(scale).rotate([rotation,tilt]);
      const path=geoPath(projection,context);

      const atmosphere=context.createRadialGradient(rect.width*.42,rect.height*.36,8,rect.width/2,rect.height/2,scale*1.15);
      atmosphere.addColorStop(0,"rgba(119,166,133,.28)");
      atmosphere.addColorStop(.58,"rgba(53,86,65,.16)");
      atmosphere.addColorStop(1,"rgba(221,121,77,0)");
      context.beginPath();
      context.arc(rect.width/2,rect.height/2,scale*1.13,0,Math.PI*2);
      context.fillStyle=atmosphere;
      context.fill();

      context.beginPath();
      path({type:"Sphere"});
      const ocean=context.createRadialGradient(rect.width*.39,rect.height*.3,scale*.05,rect.width*.54,rect.height*.57,scale);
      ocean.addColorStop(0,"#496c57");
      ocean.addColorStop(.52,"#294638");
      ocean.addColorStop(1,"#152c24");
      context.fillStyle=ocean;
      context.fill();
      context.strokeStyle="rgba(226,196,169,.42)";
      context.lineWidth=1.2;
      context.stroke();

      context.beginPath();
      path(graticule);
      context.strokeStyle="rgba(229,214,197,.10)";
      context.lineWidth=.65;
      context.stroke();

      context.beginPath();
      path(land);
      context.fillStyle=selectedRef.current==="global"?"#87977e":"#9daa90";
      context.fill();
      context.strokeStyle="rgba(26,48,37,.62)";
      context.lineWidth=.55;
      context.stroke();

      const center:[number,number]=[-rotation,-tilt];
      markerPositions.current=globePartners.map((partner,index)=>{
        const point=projection(partner.coordinates);
        const visible=Boolean(point)&&geoDistance(partner.coordinates,center)<Math.PI/2;
        const matches=selectedRef.current==="global"||selectedRef.current===partner.region;
        if(point&&visible&&matches){
          const [x,y]=point;
          const pulse=5+Math.sin(time/420+index)*1.8;
          context.beginPath();
          context.arc(x,y,pulse*2.5,0,Math.PI*2);
          const glow=context.createRadialGradient(x,y,1,x,y,pulse*2.5);
          glow.addColorStop(0,"rgba(255,221,180,.88)");
          glow.addColorStop(.28,"rgba(226,116,73,.62)");
          glow.addColorStop(1,"rgba(226,116,73,0)");
          context.fillStyle=glow;
          context.fill();
          context.beginPath();
          context.arc(x,y,hoveredRef.current===index?5.4:3.5,0,Math.PI*2);
          context.fillStyle=hoveredRef.current===index?"#fff0d6":"#e8794d";
          context.fill();
          if(hoveredRef.current===index){
            context.beginPath();
            context.moveTo(x+7,y);
            context.lineTo(x+24,y-14);
            context.strokeStyle="rgba(255,234,209,.72)";
            context.stroke();
            context.font="700 10px Arial";
            context.fillStyle="#fff4e6";
            context.fillText(partner.city,x+28,y-13);
          }
          return {x,y,index,visible:true};
        }
        return {x:point?.[0]??0,y:point?.[1]??0,index,visible:false};
      });

      const shade=context.createLinearGradient(rect.width*.25,0,rect.width*.78,rect.height);
      shade.addColorStop(0,"rgba(255,238,210,.13)");
      shade.addColorStop(.48,"rgba(255,255,255,0)");
      shade.addColorStop(1,"rgba(7,24,18,.48)");
      context.beginPath();
      context.arc(rect.width/2,rect.height/2,scale,0,Math.PI*2);
      context.fillStyle=shade;
      context.fill();
      if(!reducedMotion&&inViewport&&document.visibilityState==="visible"){
        animationFrame=requestAnimationFrame(draw);
      }
    };

    const requestDraw=()=>{
      if(!animationFrame)animationFrame=requestAnimationFrame(draw);
    };
    requestDrawRef.current=requestDraw;
    const observer=new IntersectionObserver(([entry])=>{
      inViewport=entry?.isIntersecting??false;
      if(inViewport)requestDraw();
      else if(animationFrame){cancelAnimationFrame(animationFrame);animationFrame=0;}
    },{rootMargin:"160px"});
    const onVisibility=()=>{
      if(document.visibilityState==="visible"&&inViewport)requestDraw();
      else if(animationFrame){cancelAnimationFrame(animationFrame);animationFrame=0;}
    };
    observer.observe(canvas);
    document.addEventListener("visibilitychange",onVisibility);
    requestDraw();
    return()=>{
      requestDrawRef.current=()=>undefined;
      observer.disconnect();
      document.removeEventListener("visibilitychange",onVisibility);
      if(animationFrame)cancelAnimationFrame(animationFrame);
    };
  },[]);

  const locateMarker=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
    const rect=event.currentTarget.getBoundingClientRect();
    const x=event.clientX-rect.left;
    const y=event.clientY-rect.top;
    const nearest=markerPositions.current
      .filter(point=>point.visible)
      .map(point=>({...point,distance:Math.hypot(point.x-x,point.y-y)}))
      .sort((a,b)=>a.distance-b.distance)[0];
    setHovered(nearest&&nearest.distance<18?nearest.index:null);
  };

  const openHovered=()=>{
    if(hovered===null)return;
    setSelected(globePartners[hovered].region);
  };

  return <section className="ecosystem globe-ecosystem">
    <div className="ecosystem-copy">
      <span>{copy.eyebrow}</span>
      <h2>{copy.title}<br/><em>{copy.accent}</em></h2>
      <p>{copy.description}</p>
      <div className="region-controls">{globeRegions.map(region=><button className={selected===region.id?"active":""} key={region.id} onClick={()=>setSelected(region.id)}><i/>{copy.regions[region.id]}</button>)}</div>
      <p className="globe-disclaimer">{copy.disclaimer}</p>
    </div>
    <div className="globe-stage">
      <div className="globe-aura"/><div className="orbit-line orbit-a"/><div className="orbit-line orbit-b"/>
      <canvas ref={canvasRef} className={hovered===null?"":"has-hover"} role="img" aria-label={copy.canvasLabel} onPointerMove={locateMarker} onPointerLeave={()=>setHovered(null)} onClick={openHovered}/>
      <div className="globe-hud top"><span>{copy.mapStatus}</span><b>{copy.rotation}</b></div>
      <div className="globe-region-card">
        <span>{copy.regions[selected].toUpperCase()}</span>
        <div className="partner-constellation">{activePartners.map((partner,index)=><button key={partner.city} onMouseEnter={()=>setHovered(globePartners.indexOf(partner))} onMouseLeave={()=>setHovered(null)} onClick={()=>setSelected(partner.region)}><i style={{animationDelay:`${index*.18}s`}}/><span><b>{partner.city}</b><small>{copy.partners[partner.kind]}</small></span></button>)}</div>
      </div>
      <div className="globe-hud bottom"><span>{globePartners.length} {copy.nodes}</span><b>{copy.instruction}</b></div>
    </div>
  </section>;
}
