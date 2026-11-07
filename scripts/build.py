#!/usr/bin/env python3
"""Allowlisted static package. Python stdlib; no bundler, NPM or network."""
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE, DIST = ROOT/'site', ROOT/'dist'
paths = ['index.html','style.css','credits.html','LICENSE','NOTICE']
paths += ['src/'+name for name in ('world.js','broadphase.js','game.js','render.js','effects.js','audio.js','main.js')]
paths += ['vendor/vanillajs/'+name for name in ('LICENSE','NOTICE','modules/math/index.js','modules/time/index.js','modules/collision/index.js','modules/render-webgl/index.js')]
paths += ['assets/librequake/'+name for name in ('COPYING','CREDITS','conc1_1.png','enforcer.json','enforcer.png','v_rock.json','v_rock.png','rocket1i.wav','r_exp3.wav','lhit.wav')]
if DIST.exists():
    shutil.rmtree(DIST)
DIST.mkdir()
manifest = {}
for path in paths:
    source, target = SITE/path, DIST/path
    assert source.is_file() and not source.is_symlink(), f'Expected regular file: {source}'
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(source,target)
    data=target.read_bytes()
    manifest[path]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
(DIST/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(DIST/'.nojekyll').write_text('')
print(f'Packaged {len(paths)} files ({sum(x["bytes"] for x in manifest.values()):,} bytes) in dist/.')
