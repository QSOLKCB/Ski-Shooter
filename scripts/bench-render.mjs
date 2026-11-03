// SPDX-License-Identifier: Apache-2.0
// Paired CPU-preparation observations; deterministic parity/work gates, no FPS claim.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import {EffectGeometry,EffectMesh} from '../site/src/effects.js';
import {referenceEffects} from '../tests/helpers/effects-reference.mjs';
import {renderFixtures,uploadModel,renderer} from '../tests/helpers/render-fixtures.mjs';

const fixtures=renderFixtures(),results=[];
function trial(fixture,retained){
  const start=performance.now(),model=uploadModel(),r=renderer(model);
  const builder=retained?new EffectGeometry():null;
  const a=retained?new EffectMesh(r):r.mesh([]),b=retained?new EffectMesh(r,'lines'):r.mesh([],'lines');
  let vertices=0;
  for(const {game,alpha,reducedMotion} of fixture.frames){
    const data=retained?builder.build(game,alpha,reducedMotion):referenceEffects(game,alpha,reducedMotion);
    if(retained){a.update(data.dynamic);b.update(data.lines);vertices+=a.mesh.count+b.mesh.count;}
    else{r.update(a,data.dynamic);r.update(b,data.lines);vertices+=a.count+b.count;}
  }
  return {ms:performance.now()-start,...model.stats,vertices,stagingBytes:retained?builder.dynamic.data.byteLength+builder.lines.data.byteLength:null};
}
for(const fixture of fixtures){
  const geometry=new EffectGeometry();
  for(const {game,alpha,reducedMotion} of fixture.frames){
    const actual=geometry.build(game,alpha,reducedMotion),expected=referenceEffects(game,alpha,reducedMotion);
    for(const name of ['dynamic','lines']){
      const a=actual[name].view(),b=new Float32Array(expected[name]);
      assert.deepEqual(new Uint32Array(a.buffer,0,a.length),new Uint32Array(b.buffer));
    }
  }
  for(let i=0;i<2;i++){trial(fixture,false);trial(fixture,true);}
  const fresh=[],retained=[];
  for(let i=0;i<7;i++){
    if(i%2){retained.push(trial(fixture,true));fresh.push(trial(fixture,false));}
    else{fresh.push(trial(fixture,false));retained.push(trial(fixture,true));}
  }
  assert.equal(fresh[0].vertices,retained[0].vertices);
  assert.ok(retained.every(r=>r.capacity<=262144&&r.stagingBytes<=262144));
  if(fixture.name==='idle'){
    assert.equal(retained[0].uploads,2);assert.equal(fresh[0].uploads,480);
    assert.equal(retained[0].bytes*240,fresh[0].bytes);
  }
  const median=xs=>[...xs].map(x=>x.ms).sort((a,b)=>a-b)[3];
  results.push({name:fixture.name,frames:fixture.frames.length,fresh,retained,medianMs:{fresh:median(fresh),retained:median(retained)}});
}
const report={sourceBaseline:'17e3604fdea879c885aed5d36ae427b59648d025',environment:{node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model},
  scope:'CPU geometry and upload preparation; includes per-trial cold construction. Fake GL counts API work, not GPU time or driver memory. No module-load, simulation, UI or FPS measurement.',warmupPairs:2,measuredPairs:7,results};
await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
await writeFile(new URL('../artifacts/opt-render.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
for(const r of results)console.log(`${r.name}: ${r.medianMs.fresh.toFixed(2)} -> ${r.medianMs.retained.toFixed(2)} ms; uploaded bytes ${r.fresh[0].bytes} -> ${r.retained[0].bytes}`);
