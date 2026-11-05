// SPDX-License-Identifier: Apache-2.0
// Game-owned staging buffers; VANILLAJS Renderer continues to own and draw meshes.
import {CORE,terrain} from './world.js';

const faces=[0,2,4,4,2,1,1,2,5,5,2,0,4,3,0,1,3,4,5,3,1,0,3,5];
const coreY=terrain(...CORE).height+3;
const circles=new Map([8,16,24].map(n=>[n,Array.from({length:n+1},(_,i)=>{
  const a=i/n*Math.PI*2;return [Math.cos(a),Math.sin(a)];
})]));
const orange=[1,.37,.12],flame=[1,.7,.22],halo=[.9,.35,.14];
const playerDisc=[.35,1,.93],enemyDisc=[1,.35,.12],playerBlast=[.45,.95,.86],enemyBlast=[1,.5,.2],spark=[1,.8,.4];
const lockedCore=[1,.55,.18],openCore=[.4,1,.9];

export class VertexStream {
  constructor(){this.data=new Float32Array(0);this.length=0;this.growths=0;}
  reserve(length){
    if(length>this.data.length){
      let size=Math.max(256,this.data.length);while(size<length)size*=2;
      this.data=new Float32Array(size);this.growths++;
    }
    this.length=0;
  }
  vertex(x,y,z,c){
    const i=this.length,d=this.data;d[i]=x;d[i+1]=y;d[i+2]=z;d[i+3]=c[0];d[i+4]=c[1];d[i+5]=c[2];this.length=i+6;
  }
  view(){return this.data.subarray(0,this.length);}
}
function octahedron(out,x,y,z,r,c){
  // Match the reference's arithmetic and vertex order before Float32 conversion.
  for(const k of faces)out.vertex((k===0?r:k===1?-r:0)+x,(k===2?r:k===3?-r:0)+y,(k===4?r:k===5?-r:0)+z,c);
}
function cylinder(out,x,y,z,r,h,c){
  const circle=circles.get(8);
  for(let i=0;i<8;i++){
    const a=circle[i],b=circle[i+1],px=x+a[0]*r,pz=z+a[1]*r,qx=x+b[0]*r,qz=z+b[1]*r;
    out.vertex(px,y,pz,c);out.vertex(qx,y,qz,c);out.vertex(qx,y+h,qz,c);
    out.vertex(px,y,pz,c);out.vertex(qx,y+h,qz,c);out.vertex(px,y+h,pz,c);
    out.vertex(x,y+h,z,c);out.vertex(px,y+h,pz,c);out.vertex(qx,y+h,qz,c);
  }
}
function ring(out,x,y,z,r,c,n){
  const circle=circles.get(n);
  for(let i=0;i<n;i++)for(let j=i;j<=i+1;j++)out.vertex(x+circle[j][0]*r,y+circle[j][1]*r,z,c);
}
export class EffectGeometry {
  constructor(){this.dynamic=new VertexStream();this.lines=new VertexStream();}
  build(game,alpha,reducedMotion=false){
    const dynamic=this.dynamic,lines=this.lines;
    let alive=0;for(const e of game.enemies)if(e.health>0)alive++;
    dynamic.reserve((alive*96+(game.shots.length+game.effects.length+Number(!game.carrying))*24)*6);
    lines.reserve((alive*32+game.shots.length*2+game.effects.length*48)*6);
    for(const e of game.enemies){
      if(e.health<=0)continue;
      const a=e.previous,b=e.position,x=a[0]+(b[0]-a[0])*alpha,y=a[1]+(b[1]-a[1])*alpha,z=a[2]+(b[2]-a[2])*alpha;
      cylinder(dynamic,x,y-.6,z,.55,.6,orange);
      octahedron(dynamic,x,y-.9-(reducedMotion?0:Math.sin(game.time*37+e.index)*.2),z,.42,flame);
      ring(lines,x,y+1.65,z,2.5,halo,16);
    }
    for(const s of game.shots){
      const a=s.previous,b=s.position,x=a[0]+(b[0]-a[0])*alpha,y=a[1]+(b[1]-a[1])*alpha,z=a[2]+(b[2]-a[2])*alpha,c=s.owner==='player'?playerDisc:enemyDisc;
      octahedron(dynamic,x,y,z,.3,c);lines.vertex(a[0],a[1],a[2],c);lines.vertex(x,y,z,c);
    }
    for(const e of game.effects){
      const [x,y,z]=e.position;ring(lines,x,y,z,(.55-e.life)*14+.3,e.owner==='player'?playerBlast:enemyBlast,24);
      octahedron(dynamic,x,y,z,e.life*1.8,spark);
    }
    if(!game.carrying)octahedron(dynamic,CORE[0],coreY,CORE[1],1.7,game.kills===6?openCore:lockedCore);
    return this;
  }
}

// This private uploader is the only writer of its mesh. Do not call Renderer.update
// on it: that API intentionally copies caller arrays and has separate capacity state.
export class EffectMesh {
  constructor(renderer,primitive='triangles'){
    this.renderer=renderer;this.mesh=renderer.mesh([],primitive);
    this.uploaded=new Uint32Array(0);this.length=-1;this.capacity=0;
  }
  update(stream){
    const n=stream.length,bits=new Uint32Array(stream.data.buffer,0,n);
    let same=n===this.length;
    if(same)for(let i=0;i<n;i++)if(bits[i]!==this.uploaded[i]){same=false;break;}
    if(same)return false;
    const gl=this.renderer.gl;this.length=-1;
    if(n){
      gl.bindBuffer(gl.ARRAY_BUFFER,this.mesh.buffer);
      if(stream.data.byteLength>this.capacity){
        gl.bufferData(gl.ARRAY_BUFFER,stream.data.byteLength,gl.DYNAMIC_DRAW);
        this.capacity=stream.data.byteLength;this.uploaded=new Uint32Array(stream.data.length);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER,0,stream.view());
      this.uploaded.set(bits);
    }
    this.length=n;this.mesh.count=n/6;return true;
  }
}
