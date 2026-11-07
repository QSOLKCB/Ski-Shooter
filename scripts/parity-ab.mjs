// SPDX-License-Identifier: Apache-2.0
// Exact A/B gate for simulation refactors (OPT: reuse and reductions are admitted
// only when every later state is bit-identical).
//
//   node scripts/parity-ab.mjs [git-ref=HEAD] [--time] [--out=path]
//
// Exports site/ at the reference commit beside the working tree and drives both
// with identical inputs: the input-driven pilot from the mission test (flight
// school and raid) and seeded chaotic flyers that ski, jet, strafe, spin and fire
// into terrain, pylons and sentries. The complete serialised game state, signed
// zero and non-finite values included, is hashed after every 120 Hz tick and must
// match on every tick. --time adds interleaved ABBA CPU timing of stepGame only;
// it is a characterisation, not a frame-rate claim.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),ref=args.find(a=>!a.startsWith('--'))??'HEAD';
const timing=args.includes('--time'),out=args.find(a=>a.startsWith('--out='))?.slice(6);
const dir=mkdtempSync(join(tmpdir(),'ski-shooter-ab-'));
try {
  execFileSync('sh',['-c',`git -C "${root}" archive "${ref}" site | tar -x -C "${dir}"`]);
  const load=async base=>{
    const url=p=>pathToFileURL(join(base,p)).href;
    return {game:await import(url('site/src/game.js')),world:await import(url('site/src/world.js')),
      math:await import(url('site/vendor/vanillajs/modules/math/index.js'))};
  };
  const before=await load(dir),after=await load(root);

  const replacer=(key,value)=>typeof value==='number'&&(!Number.isFinite(value)||Object.is(value,-0))?{$n:String(Object.is(value,-0)?'-0':value)}:value;
  const hash=g=>createHash('sha1').update(JSON.stringify(g,replacer)).digest('hex');

  // The mission test's pilot, plus periodic skiing so ground contact is exercised.
  function pilotInput({game:{aimLead},world:{terrain,BASE,CORE},math:{add,subtract,clamp}},g,i) {
    const p=g.player,e=g.enemies.find(e=>e.health>0),destination=g.carrying?BASE:CORE;
    const goal=e?e.position:[destination[0],0,destination[1]];
    const aim=e?aimLead(add(p.position,[0,1.65,0]),add(e.position,[0,1.7,0]),e.velocity,p.velocity):null;
    const dx=goal[0]-p.position[0],dz=goal[2]-p.position[2],distance=Math.hypot(dx,dz),v=aim?subtract(aim,add(p.position,[0,1.65,0])):[dx,0,dz];
    p.yaw=Math.atan2(-v[0],-v[2]);p.pitch=Math.atan2(v[1],Math.hypot(v[0],v[2]));
    const speed=clamp((distance-(e?25:0))*.8,0,14),wx=dx/(distance||1)*speed-p.velocity[0]*.75,wz=dz/(distance||1)*speed-p.velocity[2]*.75;
    const desired=e?Math.max(goal[1]+2,terrain(p.position[0],p.position[2]).height+8):terrain(p.position[0],p.position[2]).height+(distance>20?8:0);
    return {forward:clamp((-Math.sin(p.yaw)*wx-Math.cos(p.yaw)*wz)/6,-1,1),right:clamp((Math.cos(p.yaw)*wx-Math.sin(p.yaw)*wz)/6,-1,1),
      jet:p.position[1]<desired&&p.velocity[1]<7,fire:!!e,ski:i%600<200};
  }
  function* scenario(tree,training,kind,seed) {
    const g=tree.game.createGame(training);let s=seed>>>0;
    const rand=()=>(s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296;
    let held={};
    for(let i=0;i<120*90&&g.status==='playing';i++) {
      let input;
      if(kind==='pilot')input=pilotInput(tree,g,i);
      else {
        if(i%30===0)held={forward:Math.floor(rand()*3)-1,right:Math.floor(rand()*3)-1,ski:rand()<.5,jet:rand()<.4,fire:rand()<.6};
        const p=g.player;p.yaw+=(rand()-.5)*.08;p.pitch=Math.max(-1.48,Math.min(1.48,p.pitch+(rand()-.5)*.06));
        input=held;
      }
      const started=performance.now();tree.game.stepGame(g,input,tree.game.STEP);const ms=performance.now()-started;
      yield {g,ms};
    }
  }
  const cases=[];for(const training of [true,false]){cases.push([training,'pilot',1]);for(const seed of [11,23,47,95])cases.push([training,'chaos',seed]);}
  let compared=0;const outcomes=[];
  for(const [training,kind,seed] of cases) {
    const a=scenario(before,training,kind,seed),b=scenario(after,training,kind,seed);let t=0,status='';
    for(;;) {
      const x=a.next(),y=b.next();
      if(x.done!==y.done)throw new Error(`${kind}/${seed}/${training}: run length differs at tick ${t}`);
      if(x.done)break;
      if(hash(x.value.g)!==hash(y.value.g))throw new Error(`${kind}/${seed}/${training?'training':'raid'}: state diverged at tick ${t+1}`);
      t++;compared++;status=y.value.g.status;
    }
    outcomes.push(`${training?'school':'raid'}/${kind}${kind==='chaos'?seed:''}:${status}@${t}`);
  }
  const summary={reference:execFileSync('git',['-C',root,'rev-parse',ref]).toString().trim(),scenarios:cases.length,ticks_compared:compared,parity:'exact',outcomes:outcomes.join(' ')};
  if(timing) {
    const run=tree=>{let total=0,n=0;for(const [training,kind,seed] of cases)for(const {ms} of scenario(tree,training,kind,seed)){total+=ms;n++;}return total/n*1000;};
    run(before);run(after);
    const A=[],B=[];for(let r=0;r<6;r++){if(r%2===0){A.push(run(before));B.push(run(after));}else{B.push(run(after));A.push(run(before));}}
    const median=v=>[...v].sort((p,q)=>p-q)[v.length>>1];
    const hashes={};for(const f of ['site/src/game.js','site/src/world.js'])hashes[f]={reference:createHash('sha256').update(readFileSync(join(dir,f))).digest('hex'),candidate:createHash('sha256').update(readFileSync(join(root,f))).digest('hex')};
    Object.assign(summary,{reference_us_per_tick:A.map(v=>+v.toFixed(2)),candidate_us_per_tick:B.map(v=>+v.toFixed(2)),
      median_reference_us:+median(A).toFixed(2),median_candidate_us:+median(B).toFixed(2),node:process.version,source_sha256:hashes,
      scope:'CPU time inside stepGame only, Node, this host. Not a frame rate or GPU measurement.'});
  }
  const text=JSON.stringify(summary,null,2)+'\n';
  if(out){mkdirSync(dirname(out),{recursive:true});writeFileSync(out,text);}
  process.stdout.write(text);
} finally { rmSync(dir,{recursive:true,force:true}); }
