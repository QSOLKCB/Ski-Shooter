// SPDX-License-Identifier: Apache-2.0
import {Renderer,boxVertices} from '../vendor/vanillajs/modules/render-webgl/index.js';
import {normalize,subtract,cross,dot,quatMultiply,rotate,perspective,viewMatrix,multiplyMatrices,seededRandom,mix} from '../vendor/vanillajs/modules/math/index.js';
import {EffectGeometry,EffectMesh} from './effects.js';
import {terrainTriangles,terrain,pylons,BASE,CORE} from './world.js';

export function cameraQuaternion(yaw,pitch){return quatMultiply([0,Math.sin(yaw/2),0,Math.cos(yaw/2)],[Math.sin(pitch/2),0,0,Math.cos(pitch/2)]);}
function program(gl,vs,fs){
  const p=gl.createProgram();
  for(const [kind,source] of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){
    const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p,s);gl.deleteShader(s);
  }
  gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;
}
function octahedron(pos,r,color){
  const v=[[r,0,0],[-r,0,0],[0,r,0],[0,-r,0],[0,0,r],[0,0,-r]].map(v=>v.map((n,i)=>n+pos[i]));
  const out=[];for(const f of [[0,2,4],[4,2,1],[1,2,5],[5,2,0],[4,3,0],[1,3,4],[5,3,1],[0,3,5]])for(const i of f)out.push(...v[i],...color);return out;
}
function groundRing(x,z,radius,color){
  const out=[],vertex=(a,r)=>{const X=x+Math.cos(a)*r,Z=z+Math.sin(a)*r;return [X,terrain(X,Z).height+.16,Z];};
  for(let i=0;i<80;i++){const a=i/80*Math.PI*2,b=(i+1)/80*Math.PI*2,points=[vertex(a,radius),vertex(b,radius),vertex(b,radius-.35),vertex(a,radius-.35)];for(const k of [0,1,2,0,2,3])out.push(...points[k],...color);}
  return out;
}
export class Scene {
  constructor(canvas){
    this.core=new Renderer(canvas);this.gl=this.core.gl;this.canvas=canvas;
    const r=this.core,gl=this.gl;
    const ground=[];
    for(const tri of terrainTriangles()){
      const normal=normalize(cross(subtract(tri[1],tri[0]),subtract(tri[2],tri[0])));
      const y=tri.reduce((s,p)=>s+p[1],0)/3;
      const illumination=.52+.48*Math.max(0,dot(normal,normalize([-.6,1,.3])));
      const c=y>47?[.62,.68,.66]:y>33?[.29,.39,.37]:[.12,.25,.25];
      for(const p of tri)ground.push(...p,...c.map(x=>x*illumination));
    }
    this.ground=r.mesh(ground);
    const structures=[],lights=[],rng=seededRandom(410);
    for(const [i,p] of pylons.entries()){
      const [x,y,z]=p.box.min.map((v,k)=>(v+p.box.max[k])/2);
      structures.push(...boxVertices([x,y,z],[6,18,6],[.32,.41,.4]));
      structures.push(...boxVertices([x,y+9,z],[9,1,9],[.15,.22,.23]));
      const c=i<2?[.3,1,.85]:[1,.39,.15];
      lights.push(...boxVertices([x,y+3,z+3.04],[.55,10,.12],c),...boxVertices([x,y+3,z-3.04],[.55,10,.12],c));
      lights.push(...boxVertices([x,y+10,z],[.4,2,.4],c));
    }
    for(const [base,col] of [[BASE,[.25,.95,.83]],[CORE,[1,.38,.12]]]){
      const [x,z]=base;
      lights.push(...groundRing(x,z,8,col));
      for(let k=0;k<4;k++){const a=k*Math.PI/2,X=x+Math.cos(a)*9,Z=z+Math.sin(a)*9;lights.push(...boxVertices([X,terrain(X,Z).height+1,Z],[.25,2,.25],col));}
    }
    for(let i=0;i<105;i++){
      const x=(rng()-.5)*490,z=(rng()-.5)*490;
      // Decorative rocks are placed outside the central playable corridor.
      if(Math.abs(x)<110)continue;
      const s=2+rng()*7;structures.push(...octahedron([x,terrain(x,z).height-s*.4,z],s,[.17,.23,.24]));
    }
    this.structures=r.mesh(structures);this.lights=r.mesh(lights);
    this.geometry=new EffectGeometry();this.dynamic=new EffectMesh(r);this.trails=new EffectMesh(r,'lines');
    this.textureProgram=program(gl,`attribute vec3 aPosition;attribute vec2 aUV;uniform mat4 uVP;uniform mat4 uModel;varying vec2 vUV;varying float vDepth;void main(){gl_Position=uVP*uModel*vec4(aPosition,1.);vUV=aUV;vDepth=gl_Position.w;}`,`precision mediump float;varying vec2 vUV;varying float vDepth;uniform sampler2D uTexture;uniform vec3 uTint;uniform float uFog;void main(){vec3 c=texture2D(uTexture,vUV).rgb*uTint;float f=exp(-max(0.,vDepth)*uFog);gl_FragColor=vec4(mix(vec3(.018,.03,.05),c,f),1.);}`);
    this.tp={};for(const n of ['aPosition','aUV'])this.tp[n]=gl.getAttribLocation(this.textureProgram,n);for(const n of ['uVP','uModel','uTexture','uTint','uFog'])this.tp[n]=gl.getUniformLocation(this.textureProgram,n);
    this.skyProgram=program(gl,`attribute vec2 aPosition;varying vec2 vUV;void main(){vUV=aPosition;gl_Position=vec4(aPosition,1.,1.);}`,`precision mediump float;varying vec2 vUV;uniform mat3 uRotation;uniform float uAspect;uniform float uFov;void main(){vec3 d=normalize(uRotation*vec3(vUV.x*uAspect*uFov,vUV.y*uFov,-1.));float h=smoothstep(-.25,.8,d.y);vec3 c=mix(vec3(.26,.36,.37),vec3(.015,.045,.07),h);vec3 sun=normalize(vec3(-.45,.2,-.8));float angle=dot(d,sun);c+=vec3(.9,.45,.19)*pow(max(0.,angle),50.)*.5;c=mix(c,vec3(1.,.81,.47),smoothstep(.9985,.9993,angle));float cloud=sin(d.x*22.+d.y*32.)*sin(d.z*20.-d.y*21.);c+=max(0.,cloud)*.018*smoothstep(0.,.3,d.y);gl_FragColor=vec4(c,1.);}`);
    this.skyBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    this.sp={position:gl.getAttribLocation(this.skyProgram,'aPosition')};for(const n of ['uRotation','uAspect','uFov'])this.sp[n]=gl.getUniformLocation(this.skyProgram,n);
    this.ready=this.loadAssets();
  }
  async texture(url){
    const im=new Image();im.src=url;await im.decode();const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,im);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;
  }
  async loadAssets(){
    const gl=this.gl;
    for(const name of ['enforcer','v_rock']){
      const res=await fetch(`assets/librequake/${name}.json`);if(!res.ok)throw new Error(`Missing model: ${name}`);const data=await res.json();
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data.vertices),gl.STATIC_DRAW);
      this[name]={buffer,count:data.vertices.length/5,bounds:data.bounds,texture:await this.texture(`assets/librequake/${name}.png`)};
    }
    const values=[];
    // Real LibreQuake concrete panels on the broad pylon faces.
    for(const p of pylons){const [x,y,z]=p.box.min,[X,Y,Z]=p.box.max;
      for(const [a,b,c,d] of [[[x,y,Z+.02],[X,y,Z+.02],[X,Y,Z+.02],[x,Y,Z+.02]],[[X,y,z-.02],[x,y,z-.02],[x,Y,z-.02],[X,Y,z-.02]]]){
        const uv=[[0,1],[1,1],[1,0],[0,0]],pts=[a,b,c,d];for(const i of [0,1,2,0,2,3])values.push(...pts[i],...uv[i]);
      }
    }
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);
    this.panels={buffer,count:values.length/5,texture:await this.texture('assets/librequake/conc1_1.png')};
  }
  modelMatrix(pos,scale=1,yaw=0){const c=Math.cos(yaw)*scale,s=Math.sin(yaw)*scale;return new Float32Array([c,0,-s,0,0,scale,0,0,s,0,c,0,...pos,1]);}
  textured(mesh,model,tint=[1,1,1],fog=.0013,vp=this.vp){
    if(!mesh)return;const gl=this.gl,u=this.tp;gl.useProgram(this.textureProgram);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
    gl.enableVertexAttribArray(u.aPosition);gl.vertexAttribPointer(u.aPosition,3,gl.FLOAT,false,20,0);
    gl.enableVertexAttribArray(u.aUV);gl.vertexAttribPointer(u.aUV,2,gl.FLOAT,false,20,12);
    gl.uniformMatrix4fv(u.uVP,false,vp);gl.uniformMatrix4fv(u.uModel,false,model);gl.uniform3fv(u.uTint,tint);gl.uniform1f(u.uFog,fog);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,mesh.texture);gl.uniform1i(u.uTexture,0);gl.drawArrays(gl.TRIANGLES,0,mesh.count);
  }
  draw(game,alpha,{menu=false,fov=90,resolution=1,reducedMotion=false}={}){
    const p=game.player,q=cameraQuaternion(p.yaw,p.pitch);let camera=mix(p.previous,p.position,alpha);camera[1]+=1.65;
    let orientation=q;
    if(menu){camera=[65,70,205];orientation=cameraQuaternion(.31,-.15);}
    const gl=this.gl,r=this.core;r.begin(camera,orientation,{fog:.0013,resolution});
    const aspect=this.canvas.width/this.canvas.height,angle=fov*Math.PI/180;
    this.vp=multiplyMatrices(perspective(angle,aspect,.08,1200),viewMatrix(camera,orientation));
    this.camera=camera;this.orientation=orientation;
    gl.disable(gl.DEPTH_TEST);gl.useProgram(this.skyProgram);gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);gl.enableVertexAttribArray(this.sp.position);gl.vertexAttribPointer(this.sp.position,2,gl.FLOAT,false,8,0);
    const right=rotate(orientation,[1,0,0]),up=rotate(orientation,[0,1,0]),back=rotate(orientation,[0,0,1]);gl.uniformMatrix3fv(this.sp.uRotation,false,[...right,...up,...back]);gl.uniform1f(this.sp.uAspect,aspect);gl.uniform1f(this.sp.uFov,Math.tan(angle/2));gl.drawArrays(gl.TRIANGLES,0,3);gl.enable(gl.DEPTH_TEST);
    gl.useProgram(r.program);gl.uniformMatrix4fv(r.vp,false,this.vp);r.draw(this.ground);r.draw(this.structures);r.draw(this.lights);
    this.geometry.build(game,alpha,reducedMotion);
    this.dynamic.update(this.geometry.dynamic);this.trails.update(this.geometry.lines);
    r.draw(this.dynamic.mesh);r.draw(this.trails.mesh);
    this.textured(this.panels,this.modelMatrix([0,0,0]),[.55,.65,.63]);
    for(const e of game.enemies){if(e.health<=0||!this.enforcer)continue;const pos=mix(e.previous,e.position,alpha),b=this.enforcer.bounds,s=3.4/(b.max[1]-b.min[1]);const centerX=(b.min[0]+b.max[0])/2,centerZ=(b.min[2]+b.max[2])/2;
      const yaw=Math.atan2(-(camera[0]-pos[0]),-(camera[2]-pos[2]));
      const model=this.modelMatrix([pos[0],pos[1]-b.min[1]*s,pos[2]],s,yaw);
      model[12]-=(Math.cos(yaw)*centerX+Math.sin(yaw)*centerZ)*s;model[14]-=(-Math.sin(yaw)*centerX+Math.cos(yaw)*centerZ)*s;
      this.textured(this.enforcer,model,[1.25,1.05,.85]);
    }
    if(!menu&&this.v_rock){
      gl.clear(gl.DEPTH_BUFFER_BIT);
      const b=this.v_rock.bounds,s=.8/(b.max[2]-b.min[2]);
      const recoil=reducedMotion?0:Math.max(0,p.cooldown-.42)*.35;
      const model=this.modelMatrix([.3-(b.min[0]+b.max[0])*s/2,-.24-b.max[1]*s,-.35-b.max[2]*s+recoil],s);
      this.textured(this.v_rock,model,[1.2,1.25,1.2],0,perspective(Math.PI/2,aspect,.05,10));
    }
    gl.useProgram(r.program);
  }
  project(pos){const m=this.vp,[x,y,z]=pos,w=m[3]*x+m[7]*y+m[11]*z+m[15];if(w<=.1)return null;return {x:(m[0]*x+m[4]*y+m[8]*z+m[12])/w,y:(m[1]*x+m[5]*y+m[9]*z+m[13])/w,depth:w};}
}
