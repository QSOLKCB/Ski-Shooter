// SPDX-License-Identifier: Apache-2.0
import {normalize} from '../vendor/vanillajs/modules/math/index.js';

export const CELL=8, HALF=256, SIZE=64;
export const BASE=[0,160], CORE=[0,-160];
const heights=new Float64Array((SIZE+1)**2);
for(let z=0;z<=SIZE;z++) for(let x=0;x<=SIZE;x++) {
  const X=x*CELL-HALF,Z=z*CELL-HALF;
  heights[z*(SIZE+1)+x]=18+12*Math.sin(Z*.025)+9*Math.cos(X*.027+Z*.008)
    +5*Math.sin(X*.055-Z*.018)+4*Math.cos(Z*.06+X*.012)
    +Math.max(0,Math.hypot(X,Z)-185)*.42;
}
export function terrain(x,z) {
  const gx=Math.max(0,Math.min(SIZE-1e-9,(x+HALF)/CELL));
  const gz=Math.max(0,Math.min(SIZE-1e-9,(z+HALF)/CELL));
  const ix=Math.floor(gx),iz=Math.floor(gz),u=gx-ix,v=gz-iz;
  const a=heights[iz*(SIZE+1)+ix],b=heights[iz*(SIZE+1)+ix+1];
  const c=heights[(iz+1)*(SIZE+1)+ix],d=heights[(iz+1)*(SIZE+1)+ix+1];
  const dx=(u+v<=1?b-a:d-c)/CELL,dz=(u+v<=1?c-a:d-b)/CELL;
  return {height:u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v),normal:normalize([-dx,1,-dz])};
}
export function terrainTriangles() {
  const triangles=[];
  for(let z=0;z<SIZE;z++) for(let x=0;x<SIZE;x++) {
    const v=(dx,dz)=>[(x+dx)*CELL-HALF,heights[(z+dz)*(SIZE+1)+x+dx],(z+dz)*CELL-HALF];
    triangles.push([v(0,0),v(0,1),v(1,0)],[v(1,0),v(0,1),v(1,1)]);
  }
  return triangles;
}
// Split at every grid and triangle boundary. Height is affine on each interval,
// so this finds the first crossing without endpoint-only terrain tunnelling.
export function castTerrain(origin,delta,radius=0) {
  const cuts=[0,1];
  const planes=(a,d,offset)=>{
    if(Math.abs(d)<1e-12)return;
    const lo=Math.min(a,a+d),hi=Math.max(a,a+d);
    for(let k=Math.ceil((lo+offset)/CELL);k<=Math.floor((hi+offset)/CELL);k++){
      const t=(k*CELL-offset-a)/d;if(t>0&&t<1)cuts.push(t);
    }
  };
  planes(origin[0],delta[0],HALF);planes(origin[2],delta[2],HALF);
  planes(origin[0]+origin[2],delta[0]+delta[2],2*HALF);
  cuts.sort((a,b)=>a-b);
  const distance=t=>origin[1]+delta[1]*t-radius-terrain(origin[0]+delta[0]*t,origin[2]+delta[2]*t).height;
  let t0=0,d0=distance(0);
  if(d0<=0)return {time:0,point:[...origin]};
  for(const t1 of cuts.slice(1)){
    const d1=distance(t1);
    if(d1<=0){const t=t0+(t1-t0)*d0/(d0-d1);return {time:t,point:origin.map((v,i)=>v+delta[i]*t)};}
    t0=t1;d0=d1;
  }
  return null;
}
export const pylons=[[-30,122],[30,122],[-32,-155],[32,-155],[-94,15],[96,-35]].map(([x,z],i)=>{
  const y=terrain(x,z).height;
  return {id:'pylon-'+i,box:{min:[x-3,y-1,z-3],max:[x+3,y+17,z+3]}};
});
export const baseHeight=terrain(...BASE).height;
