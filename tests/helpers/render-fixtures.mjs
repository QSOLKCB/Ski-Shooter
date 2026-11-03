// SPDX-License-Identifier: Apache-2.0
import {Renderer} from '../../site/vendor/vanillajs/modules/render-webgl/index.js';
import {createGame,stepGame,STEP} from '../../site/src/game.js';

export function renderFixtures(frames=240){
  const idle=createGame(true),flight=createGame(true),active=[],stress=[];
  for(let frame=0;frame<frames;frame++){
    for(let i=0;i<2;i++)stepGame(flight,{forward:1,ski:true,jet:frame%100<60,fire:true},STEP);
    active.push({game:structuredClone(flight),alpha:(frame%7)/7,reducedMotion:frame%80>60});
    const game=createGame(true);game.time=frame/60;game.kills=frame%2?6:0;game.carrying=frame%5===0;
    game.shots=Array.from({length:96},(_,i)=>({owner:i%2?'player':'enemy',previous:[i-48,40+i%7,-i],position:[i-47+frame*.1,41+i%7,-i-1]}));
    game.effects=Array.from({length:64},(_,i)=>({owner:i%2?'enemy':'player',position:[i-32,25+i%9,-i],life:.55-((frame+i)%32)/60}));
    stress.push({game,alpha:frame%2?.25:.75,reducedMotion:frame%3===0});
  }
  return [{name:'idle',frames:Array.from({length:frames},()=>({game:idle,alpha:1,reducedMotion:false}))},
    {name:'flight',frames:active},{name:'maximum-effects',frames:stress}];
}

// Counts WebGL work without pretending to be a GPU or driver-memory measurement.
export function uploadModel(capture=false){
  let next=0,bound=null;const buffers=new Map(),stats={allocations:0,uploads:0,bytes:0,capacity:0};
  const gl={ARRAY_BUFFER:1,DYNAMIC_DRAW:2,STATIC_DRAW:3,TRIANGLES:4,LINES:5,
    createBuffer(){return next++;},bindBuffer(_target,b){bound=b;},
    bufferData(_target,value){
      const bytes=typeof value==='number'?value:value.byteLength,old=buffers.get(bound);
      stats.allocations++;stats.capacity+=bytes-(old?.bytes||0);
      buffers.set(bound,{bytes,data:capture?new Uint8Array(bytes):null});
      if(typeof value!=='number'&&bytes){stats.uploads++;stats.bytes+=bytes;if(capture)buffers.get(bound).data.set(new Uint8Array(value.buffer,value.byteOffset,bytes));}
    },
    bufferSubData(_target,offset,value){
      const b=buffers.get(bound);if(!b||offset+value.byteLength>b.bytes)throw new Error('GPU buffer overflow');
      stats.uploads++;stats.bytes+=value.byteLength;
      if(capture)b.data.set(new Uint8Array(value.buffer,value.byteOffset,value.byteLength),offset);
    }};
  return {gl,stats,buffers};
}

export function renderer(model){
  // Use the real VANILLAJS mesh method without compiling shaders in Node.
  // Its private capacity state requires construction; the tiny GL boundary is below.
  const gl=model.gl;
  Object.assign(gl,{VERTEX_SHADER:6,FRAGMENT_SHADER:7,COMPILE_STATUS:8,LINK_STATUS:9,DEPTH_TEST:10,
    createShader(){return {};},shaderSource(){},compileShader(){},getShaderParameter(){return true;},
    createProgram(){return {};},attachShader(){},linkProgram(){},deleteShader(){},getProgramParameter(){return true;},
    useProgram(){},getAttribLocation(){return 0;},getUniformLocation(){return {};},enable(){},clearColor(){}});
  return new Renderer({getContext:()=>gl});
}

