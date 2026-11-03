#!/usr/bin/env python3
"""Convert the two pinned LibreQuake MDL first frames; Python standard library only.

Preserve originals and copyright. This deliberately rejects grouped skins/frames;
it is a build-time converter for these inputs, not a general Quake engine.
"""
import json
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'site/assets/librequake'


def png(width, height, rgb):
    def chunk(name, data):
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', zlib.crc32(name + data))
    rows = b''.join(b'\0' + rgb[y*width*3:(y+1)*width*3] for y in range(height))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>2I5B', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')


def convert(name):
    data = (ASSETS / (name + '.mdl')).read_bytes()
    h = struct.unpack_from('<ii3f3ff3f8if', data)
    assert h[:2] == (1330660425, 6), 'expected Quake MDL v6'
    scales, origin = h[2:5], h[5:8]
    skins, width, height, vertices, triangles, frames = h[12:18]
    assert skins == 1 and 0 < vertices < 10000 and 0 < triangles < 20000
    offset = 84
    assert struct.unpack_from('<i', data, offset)[0] == 0, 'grouped skin unsupported'
    offset += 4
    skin = data[offset:offset+width*height]
    offset += width*height
    uv = [struct.unpack_from('<3i', data, offset+i*12) for i in range(vertices)]
    offset += vertices*12
    faces = [struct.unpack_from('<4i', data, offset+i*16) for i in range(triangles)]
    offset += triangles*16
    assert struct.unpack_from('<i', data, offset)[0] == 0, 'grouped first frame unsupported'
    offset += 4+8+16
    coords = [tuple(data[offset+i*4+k]*scales[k]+origin[k] for k in range(3)) for i in range(vertices)]
    out = []
    # Quake +X forward,+Z up -> framework -Z forward,+Y up.
    for front, *indices in faces:
        assert all(0 <= i < vertices for i in indices)
        for i in indices:
            qx,qy,qz = coords[i]
            seam,s,t = uv[i]
            out.extend([-qy,qz,-qx,(s+(width//2 if seam and not front else 0)+.5)/width,(t+.5)/height])
    palette = (ASSETS/'palette.lmp').read_bytes()
    rgb = b''.join(palette[i*3:i*3+3] for i in skin)
    (ASSETS/(name+'.png')).write_bytes(png(width,height,rgb))
    model = {'format':'position3_uv2','source':name+'.mdl','frame':0,'triangles':triangles,
             'bounds':{'min':[min(out[k::5]) for k in range(3)],'max':[max(out[k::5]) for k in range(3)]},
             'vertices':[round(v,6) for v in out]}
    (ASSETS/(name+'.json')).write_text(json.dumps(model,separators=(',',':'))+'\n')
    print(name, triangles, model['bounds'])


if __name__ == '__main__':
    for asset in ('enforcer','v_rock'):
        convert(asset)
