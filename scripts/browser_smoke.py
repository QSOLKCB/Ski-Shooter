#!/usr/bin/env python3
"""CI-only Chromium smoke check, using installed Chrome and Python stdlib."""
import functools
import http.server
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading

ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=ROOT/'artifacts'
ARTIFACTS.mkdir(exist_ok=True)
chrome=shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser')
assert chrome,'Chrome/Chromium must be available for the browser check'
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):
        pass

with tempfile.TemporaryDirectory(prefix='ski-shooter-browser-') as temporary:
    stage=Path(temporary)/'site';shutil.copytree(ROOT/'dist',stage)
    shutil.copyfile(ROOT/'tests/browser.html',stage/'browser-test.html')
    helpers=stage/'tests/helpers';helpers.mkdir(parents=True)
    for name in ('effects-reference.mjs','render-fixtures.mjs'):
        # Test-only imports target the packaged root; never ship these helpers.
        (helpers/name).write_text((ROOT/'tests/helpers'/name).read_text().replace('../../site/','../../'))
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(stage)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    origin=f'http://127.0.0.1:{server.server_port}'
    flags=[chrome,'--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-first-run','--disable-background-networking','--hide-scrollbars','--window-size=1440,900']
    result=subprocess.run(flags+['--user-data-dir='+str(Path(temporary)/'check-profile'),'--virtual-time-budget=15000','--dump-dom',origin+'/browser-test.html'],capture_output=True,text=True,timeout=90)
    (ARTIFACTS/'browser-result.html').write_text(result.stdout)
    (ARTIFACTS/'browser-stderr.txt').write_text(result.stderr)
    assert result.returncode==0,f'Chromium failed: {result.returncode}'
    assert 'data-result="pass"' in result.stdout,'Browser assertions failed; see artifacts/browser-result.html'
    screenshot=subprocess.run(flags+['--user-data-dir='+str(Path(temporary)/'screenshot-profile'),'--virtual-time-budget=6000','--screenshot='+str(ARTIFACTS/'updraft-desktop.png'),origin+'/index.html'],capture_output=True,text=True,timeout=60)
    assert screenshot.returncode==0 and (ARTIFACTS/'updraft-desktop.png').is_file(),'Screenshot failed'
    flight=subprocess.run(flags+['--user-data-dir='+str(Path(temporary)/'flight-profile'),'--virtual-time-budget=20000','--dump-dom','--screenshot='+str(ARTIFACTS/'updraft-flight.png'),origin+'/browser-test.html?capture=flight'],capture_output=True,text=True,timeout=90)
    (ARTIFACTS/'flight-result.html').write_text(flight.stdout)
    assert flight.returncode==0 and (ARTIFACTS/'updraft-flight.png').is_file() and 'data-capture="ready"' in flight.stdout,'Flight screenshot did not reach its explicit ready state'
    server.shutdown()
    print('PASS: Chromium software-WebGL pixel parity, retained uploads, idle invalidation, real assets, flight school, pause, focus loss and narrow layout.')
