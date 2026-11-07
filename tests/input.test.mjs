import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FixedClock} from '../site/vendor/vanillajs/modules/time/index.js';
import {add,subtract,length,mix,clamp} from '../site/vendor/vanillajs/modules/math/index.js';
import {castSegment} from '../site/vendor/vanillajs/modules/collision/index.js';
import {createGame,stepGame,aimLead,STEP} from '../site/src/game.js';
import {terrain,castTerrain,BASE,CORE,pylons} from '../site/src/world.js';
import {FpsGamepad,PadNav,standardPads,lookRate,PAD} from '../site/src/gamepad.js';
import {snapElapsed} from '../site/src/pacing.js';
import {storage,readSettings,saveSettings,readRecords,recordRun,saveRecords,formatTime} from '../site/src/prefs.js';

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
const pads={list:[]};
async function entrypoint(lockOnRequest=true,autoLaunch=true,localStorage=undefined){
  const win=new EventTarget(),doc=new EventTarget(),elements=new Map();
  doc.getElementById=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  doc.querySelectorAll=()=>[];doc.body=new Element();doc.pointerLockElement=null;
  const canvas=doc.getElementById('world');
  canvas.requestPointerLock=()=>{if(lockOnRequest)doc.pointerLockElement=canvas;return Promise.resolve();};
  doc.exitPointerLock=()=>{doc.pointerLockElement=null;doc.dispatchEvent(new Event('pointerlockchange'));};
  const display={devicePixelRatio:1,localStorage};
  const bindings={FixedClock,add,subtract,length,mix,clamp,castSegment,createGame,stepGame,aimLead,STEP,terrain,castTerrain,BASE,CORE,pylons,
    FpsGamepad,PadNav,lookRate,snapElapsed,storage,readSettings,saveSettings,readRecords,recordRun,saveRecords,formatTime,standardPads:()=>pads.list,
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

// Controller support (src/gamepad.js), driven through the real entrypoint's frame loop.
const padOf=(over={})=>({index:0,id:over.id||'Pad',mapping:'standard',connected:true,axes:over.axes||[0,0,0,0],
  buttons:Array.from({length:17},(_,i)=>({pressed:!!over.buttons?.includes(i),value:over.buttons?.includes(i)?1:0}))});
test('a controller held at launch is ignored until neutral, then steers, skis, jets and fires',async()=>{
  pads.list=[padOf({buttons:[PAD.RT,PAD.A],axes:[0,-1,0,0]})];
  const m=await entrypoint();let now=1000;const frame=()=>{now+=1000/60;m.frame(now);};
  frame();assert.deepEqual([m.input().fire,m.input().ski,m.input().forward],[false,false,0],'held at connect is ignored');
  pads.list=[padOf()];frame();
  pads.list=[padOf({buttons:[PAD.A,PAD.LT],axes:[.9,-1,0,0]})];m.frame(now+=1);
  const i=m.input();assert.equal(i.ski,true);assert.equal(i.jet,true);assert.equal(i.forward,1);assert.ok(i.right>.8);
  pads.list=[padOf({buttons:[PAD.RB]})];m.frame(now+=1);assert.equal(m.input().jet,true,'RB also jets');
  // A trigger tap released before the next tick still fires exactly one disc.
  pads.list=[padOf({buttons:[PAD.RT]})];m.frame(now+=1);pads.list=[padOf()];
  const before=m.game.shotsFired;m.frame(now+=1000/60);assert.equal(m.game.shotsFired,before+1);
  m.frame(now+=1000/60);assert.equal(m.game.shotsFired,before+1,'one press, one disc');
  const yaw=m.game.player.yaw,pitch=m.game.player.pitch;
  pads.list=[padOf({axes:[0,0,1,-1]})];m.frame(now+=1000/60);
  assert.ok(m.game.player.yaw<yaw,'right stick right turns right');assert.ok(m.game.player.pitch>pitch,'right stick up looks up');
  pads.list=[];
});
test('Start pauses and resumes on fresh presses only; a trigger held through the pause does not fire',async()=>{
  pads.list=[padOf()];const m=await entrypoint();let now=1000;const at=over=>{pads.list=[padOf(over)];m.frame(now+=1000/60);};
  at({});at({buttons:[PAD.START]});const time=m.game.time;
  at({buttons:[PAD.START]});at({buttons:[PAD.START,PAD.RT]});assert.equal(m.game.time,time,'a held Start does not toggle again');
  at({buttons:[PAD.RT]});assert.equal(m.game.time,time);
  at({buttons:[PAD.START,PAD.RT]});at({buttons:[PAD.RT]});assert.ok(m.game.time>time,'a fresh Start press resumes');
  assert.equal(m.input().fire,false,'the trigger held through the pause does not fire');
  at({});at({buttons:[PAD.RT]});assert.equal(m.input().fire,true,'it fires once the pad has been neutral');
  at({});at({buttons:[PAD.START]});const paused=m.game.time;at({});at({});assert.equal(m.game.time,paused,'and Start pauses again');
  pads.list=[];
});
test('fixed clock with frame snapping runs exactly two 120 Hz ticks per rounded 60 Hz frame',()=>{
  const run=snap=>{const c=new FixedClock({step:STEP,maxFrame:.15,maxSteps:18});let last=0,uneven=0,ticks=0;
    for(let i=1;i<=3600;i++){const now=Math.round(i*1000/60*10)/10,dt=(now-last)/1000;last=now;let n=0;c.advance(snap?snapElapsed(dt,STEP):dt,()=>{n++;ticks++;});if(n!==2)uneven++;}
    return {uneven,ticks};};
  const raw=run(false),snapped=run(true);
  assert.ok(raw.uneven>100,`rounded timestamps judder without snapping (${raw.uneven} uneven frames)`);
  assert.deepEqual(snapped,{uneven:0,ticks:7200});
  assert.equal(snapElapsed(1/144,STEP),1/144,'other refresh rates pass through');assert.equal(snapElapsed(0,STEP),0);
});

class MemoryStore {constructor(){this.map=new Map();}getItem(k){return this.map.get(k)??null;}setItem(k,v){this.map.set(k,String(v));}}
test('settings persist across reloads and a finished raid records validated personal bests',async()=>{
  const store=new MemoryStore();
  let m=await entrypoint(true,false,store);
  const set=(id,type,value)=>{const el=m.doc.getElementById(id);el.value=value;el.checked=value;m.event(el,type);};
  set('sensitivity','input',1.7);set('pad-sensitivity','input',2.1);set('fov','input',104);set('quality','change',1);set('pad-invert','change',true);
  m.event(m.doc.getElementById('sound'),'click');
  m=await entrypoint(true,true,store); // launches flight school; m.game is that run
  const el=id=>m.doc.getElementById(id);
  assert.deepEqual([+el('sensitivity').value,+el('pad-sensitivity').value,+el('fov').value,el('quality').value,el('pad-invert').checked,el('sound').textContent],[1.7,2.1,104,'1',true,'Sound off']);
  // Finish a flight-school run by putting the player home with the core.
  const g=m.game;g.enemies.forEach(e=>e.health=0);g.kills=6;g.carrying=true;
  g.player.position=[BASE[0],terrain(...BASE).height,BASE[1]];g.player.previous=[...g.player.position];g.player.velocity=[0,0,0];
  m.tick(STEP);assert.equal(g.status,'won');
  const saved=JSON.parse(store.getItem('ski-shooter-records-v1'));assert.equal(saved.school.score,g.score);assert.equal(saved.school.time,g.time);assert.equal(saved.raid,null);
  assert.match(el('debrief').textContent,/NEW BEST TIME/);assert.match(el('records').textContent,/Flight school best 00:00\.0/);
});
test('corrupt or out-of-range stored values fall back to defaults',()=>{
  const store=new MemoryStore();
  store.setItem('ski-shooter-settings-v1',JSON.stringify({sensitivity:9,padSensitivity:1.23,fov:300,resolution:.7,lead:'yes',motion:true,muted:true}));
  assert.deepEqual(readSettings(store),{sensitivity:1,padSensitivity:1,padInvert:false,fov:90,resolution:.85,lead:true,motion:true,muted:true});
  store.setItem('ski-shooter-settings-v1','{not json');assert.equal(readSettings(store).fov,90);
  store.setItem('ski-shooter-records-v1',JSON.stringify({raid:{time:-1,score:5},school:{time:null,score:12},extra:{time:1,score:1}}));
  assert.deepEqual(readRecords(store),{raid:null,school:{time:null,score:12}});
  const records={raid:null,school:null};
  assert.deepEqual(recordRun(records,{status:'lost',training:false,score:300,time:40}),{time:false,score:true});
  assert.deepEqual(recordRun(records,{status:'won',training:false,score:200,time:60}),{time:true,score:false});
  assert.deepEqual(recordRun(records,{status:'playing',training:false,score:900,time:1}),{time:false,score:false});
  assert.deepEqual(records.raid,{time:60,score:300});assert.equal(storage({get localStorage(){throw new Error('blocked');}}),null);
});
