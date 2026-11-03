import test from 'node:test';
import assert from 'node:assert/strict';
import {EffectGeometry,EffectMesh,VertexStream} from '../site/src/effects.js';
import {createGame} from '../site/src/game.js';
import {referenceEffects} from './helpers/effects-reference.mjs';
import {renderFixtures,uploadModel,renderer} from './helpers/render-fixtures.mjs';

const bits=a=>new Uint32Array(a.buffer,a.byteOffset,a.length);
test('all effect vertices match the frozen reference bit-for-bit across three workloads',()=>{
  const builder=new EffectGeometry();
  for(const fixture of renderFixtures())for(const {game,alpha,reducedMotion} of fixture.frames){
    const before=JSON.stringify(game),actual=builder.build(game,alpha,reducedMotion),expected=referenceEffects(game,alpha,reducedMotion);
    for(const name of ['dynamic','lines'])assert.deepEqual(bits(actual[name].view()),bits(new Float32Array(expected[name])),fixture.name+' '+name);
    assert.equal(JSON.stringify(game),before,'rendering must not mutate simulation');
  }
});
test('retained uploads preserve live prefixes through changes, shrinking, empty and restart',()=>{
  const model=uploadModel(true),r=renderer(model),mesh=new EffectMesh(r),builder=new EffectGeometry(),game=createGame(true);
  const submit=()=>{
    const data=builder.build(game,.37,true).dynamic;mesh.update(data);
    assert.equal(mesh.mesh.count,data.length/6);
    const actual=model.buffers.get(mesh.mesh.buffer).data.subarray(0,data.length*4);
    assert.deepEqual(actual,new Uint8Array(data.data.buffer,0,data.length*4));
  };
  submit();const originalBytes=model.stats.bytes;submit();assert.equal(model.stats.bytes,originalBytes,'unchanged stream uploads nothing');
  game.enemies[0].position[0]+=.5;submit();assert.ok(model.stats.bytes>originalBytes);
  game.enemies[0].position[0]-=.5;submit();
  game.kills=6;submit();game.enemies=[];submit();game.carrying=true;submit();assert.equal(mesh.mesh.count,0);
  const capacity=model.stats.capacity;Object.assign(game,createGame(true));submit();assert.equal(model.stats.capacity,capacity);
});
test('uploader observes signed zero and retries after a failed upload',()=>{
  const model=uploadModel(true),mesh=new EffectMesh(renderer(model)),stream=new VertexStream();
  stream.reserve(6);stream.vertex(0,1,2,[1,1,1]);mesh.update(stream);
  stream.data[0]=-0;assert.equal(mesh.update(stream),true);assert.equal(mesh.uploaded[0],0x80000000);
  const upload=model.gl.bufferSubData;model.gl.bufferSubData=()=>{throw Error('injected upload failure');};
  stream.data[0]=5;assert.throws(()=>mesh.update(stream),/injected/);
  model.gl.bufferSubData=upload;assert.equal(mesh.update(stream),true);assert.equal(mesh.update(stream),false);
});
test('maximum current population fits bounded staging and upload storage without dropping geometry',()=>{
  const fixture=renderFixtures(3)[2],builder=new EffectGeometry(),model=uploadModel(),r=renderer(model),a=new EffectMesh(r),b=new EffectMesh(r,'lines');
  for(const {game,alpha,reducedMotion} of fixture.frames){builder.build(game,alpha,reducedMotion);a.update(builder.dynamic);b.update(builder.lines);}
  assert.equal(builder.dynamic.data.byteLength+builder.lines.data.byteLength,262144);
  assert.equal(a.uploaded.byteLength+b.uploaded.byteLength,262144);assert.equal(model.stats.capacity,262144);
  const growths=builder.dynamic.growths+builder.lines.growths;
  for(const {game,alpha,reducedMotion} of fixture.frames){builder.build(game,alpha,reducedMotion);a.update(builder.dynamic);b.update(builder.lines);}
  assert.equal(builder.dynamic.growths+builder.lines.growths,growths);
});
