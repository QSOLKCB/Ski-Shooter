#!/usr/bin/env python3
"""Verify immutable upstream inputs and reproducible model conversion, no packages."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT/'UPSTREAM.json').read_text())
for source in manifest['sources']:
    for item in source['files']:
        data = (ROOT/item['path']).read_bytes()
        assert hashlib.sha256(data).hexdigest() == item['sha256'], f"Changed upstream input: {item['path']}"
        blob = hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
        assert blob == item['git_blob'], f"Changed Git blob: {item['path']}"
derived = [ROOT/'site/assets/librequake'/f'{name}.{ext}' for name in ('enforcer','v_rock') for ext in ('png','json')]
before = {p:p.read_bytes() for p in derived}
subprocess.run([sys.executable,str(ROOT/'scripts/convert_models.py')],check=True)
assert all(p.read_bytes() == data for p,data in before.items()), 'model conversion changed checked-in output'
for p in (ROOT/'site').rglob('*.js'):
    subprocess.run(['node','--check',str(p)],check=True)
print(f"Verified {sum(len(s['files']) for s in manifest['sources'])} pinned inputs and {len(derived)} derived assets; JavaScript syntax passed.")
