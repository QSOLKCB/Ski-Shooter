import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FixedClock} from '../site/vendor/vanillajs/modules/time/index.js';
import {add,subtract,length,mix,clamp} from '../site/vendor/vanillajs/modules/math/index.js';
import {castSegment} from '../site/vendor/vanillajs/modules/collision/index.js';
import {createGame,stepGame,aimLead,STEP} from '../site/src/game.js';
import {terrain,castTerrain,BASE,CORE,pylons} from '../site/src/world.js';

// Execute the actual entrypoint and its event handlers with a small DOM boundary.
// Imports are supplied explicitly; no WebGL, browser driver or packages are needed.
const source=(await readFile(new URL('../site/src/main.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
class Element extends EventTarget {
  hidden=false;disabled=false;textContent='';style={};
  classList={add(){},remove(){},toggle(){}};
  focus(){}setAttribute(){}setPointerCapture(){}
  getBoundingClientRect(){return {width:640,height:400};}
  getContext(){return new Proxy({},{get:()=>()=>{}});}
}
class SilentSound {start(){return Promise.resolve();}pause(){}play(){}update(){}mute(){}}
async function entrypoint(lockOnRequest=true,autoLaunch=true){
  const win=new EventTarget(),doc=new EventTarget(),elements=new Map();
  doc.getElementById=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  doc.querySelectorAll=()=>[];doc.body=new Element();doc.pointerLockElement=null;
  const canvas=doc.getElementById('world');
  canvas.requestPointerLock=()=>{if(lockOnRequest)doc.pointerLockElement=canvas;return Promise.resolve();};
  doc.exitPointerLock=()=>{doc.pointerLockElement=null;doc.dispatchEvent(new Event('pointerlockchange'));};
  const display={devicePixelRatio:1};
  const bindings={FixedClock,add,subtract,length,mix,clamp,castSegment,createGame,stepGame,aimLead,STEP,terrain,castTerrain,BASE,CORE,pylons,
    Scene:class {ready=Promise.resolve();draws=0;camera=[0,0,0];draw(){this.draws++;}project(){return null;}},Sound:SilentSound,document:doc,globalThis:display,matchMedia:()=>({matches:false}),requestAnimationFrame:()=>0,
    addEventListener:win.addEventListener.bind(win)};
  const main=await new AsyncFunction(...Object.keys(bindings),source+'\nreturn {input,tick,launch,pause,frame,get scene(){return scene;},get game(){return game;}};')(...Object.values(bindings));
  if(autoLaunch)main.launch(true);
  const event=(target,type,properties={})=>{const e=new Event(type,{cancelable:true});Object.assign(e,properties);target.dispatchEvent(e);return e;};
  let buttons=0,suppressMouse=false;
  function mouse(button,down){
    const before=buttons,bit=[1,4,2][button];buttons=down?buttons|bit:buttons&~bit;
    // Pointer Events only emit down for the first button and up for the last.
    // Chord changes are pointermove; compatibility mouse events remain per button.
    const type=before===0?'pointerdown':buttons===0?'pointerup':'pointermove';
    const e=event(type==='pointerdown'?canvas:doc,type,{pointerType:'mouse',pointerId:1,button,buttons,movementX:0,movementY:0,clientX:0,clientY:0});
    if(type==='pointerdown')suppressMouse=e.defaultPrevented;
    if(!suppressMouse)event(doc,down?'mousedown':'mouseup',{button,buttons});
    if(buttons===0)suppressMouse=false;
  }
  const expect=(fire,jet)=>assert.deepEqual({fire:main.input().fire,jet:main.input().jet},{fire,jet});
  return {...main,doc,win,canvas,mouse,event,expect,display,allowCapture(){lockOnRequest=true;}};
}

for(const first of [0,2])for(const releaseFirst of [0,2]){
  test(`mouse chord: press ${first} first, release ${releaseFirst} first`,async()=>{
    const m=await entrypoint();
    m.mouse(first,true);m.tick(STEP);m.expect(first===0,first===2);
    m.mouse(2-first,true);m.tick(STEP);m.expect(true,true);
    m.mouse(releaseFirst,false);m.expect(releaseFirst!==0,releaseFirst!==2);
    m.mouse(2-releaseFirst,false);m.expect(false,false);
    // A simulation tick after release must not see a stuck button either.
    m.tick(STEP);m.expect(false,false);
  });
}
test('a brief fire click while jetting is retained for exactly one tick',async()=>{
  const m=await entrypoint();m.mouse(2,true);m.mouse(0,true);m.mouse(0,false);
  m.expect(true,true);m.tick(STEP);m.expect(false,true);m.mouse(2,false);m.expect(false,false);
});
test('pause and pointer-lock loss clear held buttons and pending fire',async()=>{
  for(const reason of ['pause','pointerlock','blur']){
    const m=await entrypoint();m.mouse(2,true);m.mouse(0,true);m.expect(true,true);
    if(reason==='pause')m.pause();else if(reason==='pointerlock')m.doc.exitPointerLock();else m.win.dispatchEvent(new Event('blur'));
    m.expect(false,false);m.mouse(0,false);m.mouse(2,false);
    m.launch(true,true);m.expect(false,false);
  }
});
test('the click used to acquire pointer lock does not also fire',async()=>{
  const m=await entrypoint(false);m.allowCapture();m.mouse(0,true);m.expect(false,false);m.mouse(0,false);m.expect(false,false);
  m.mouse(0,true);m.expect(true,false);m.tick(STEP);m.mouse(0,false);m.expect(false,false);
});

test('idle rendering sleeps until graphics, viewport, density or lifecycle invalidation',async()=>{
  const m=await entrypoint(true,false);m.frame(1000);assert.equal(m.scene.draws,1);
  for(let i=1;i<=240;i++)m.frame(1000+i*16);assert.equal(m.scene.draws,1);
  let expected=1;
  const draw=()=>{m.frame(6000);assert.equal(m.scene.draws,++expected);m.frame(6016);assert.equal(m.scene.draws,expected);};
  for(const [id,type,value] of [['fov','input',100],['quality','change',1],['motion','change',true]]){
    const el=m.doc.getElementById(id);el.value=value;el.checked=value;m.event(el,type);draw();
  }
  m.win.dispatchEvent(new Event('resize'));draw();m.display.devicePixelRatio=2;draw();
  m.win.dispatchEvent(new Event('pageshow'));draw();m.doc.dispatchEvent(new Event('visibilitychange'));draw();
  m.launch(true);m.frame(7000);m.frame(7016);assert.equal(m.scene.draws,expected+2);
  m.pause();m.frame(7032);const pausedDraws=m.scene.draws;
  for(let i=0;i<60;i++)m.frame(7050+i*16);assert.equal(m.scene.draws,pausedDraws);
  m.launch(true,true);m.frame(9000);assert.equal(m.scene.draws,pausedDraws+1);
});
