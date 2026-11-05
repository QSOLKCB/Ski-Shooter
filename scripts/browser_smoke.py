#!/usr/bin/env python3
"""CI-only Chromium smoke check, using installed Chrome and Python stdlib."""
import functools
import http.server
from pathlib import Path
import shutil
import tempfile
import threading
from browser_cdp import Chrome

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
    # Real animation frames are essential for redraw assertions. CLI virtual-time
    # timer budgets can finish without delivering compositor animation frames.
    with (ARTIFACTS/'browser-stderr.txt').open('wb') as stderr:
        browser=Chrome(flags+['--user-data-dir='+str(Path(temporary)/'profile')],stderr)
        try:
            browser.navigate(origin+'/browser-test.html')
            browser.wait("['pass','fail'].includes(document.querySelector('#result')?.dataset.result)")
            result=browser.evaluate("document.querySelector('#result').textContent")
            (ARTIFACTS/'browser-result.html').write_text(browser.evaluate('document.documentElement.outerHTML'))
            assert browser.evaluate("document.querySelector('#result').dataset.result === 'pass'"),result
            print(result)
            browser.navigate(origin+'/index.html')
            browser.wait("document.querySelector('#launch') && !document.querySelector('#launch').disabled")
            browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
            browser.screenshot(ARTIFACTS/'updraft-desktop.png')
            browser.navigate(origin+'/browser-test.html?capture=flight')
            browser.wait("document.documentElement.dataset.capture === 'ready' || document.querySelector('#result')?.dataset.result === 'fail'")
            (ARTIFACTS/'flight-result.html').write_text(browser.evaluate('document.documentElement.outerHTML'))
            assert browser.evaluate("document.documentElement.dataset.capture === 'ready'"),browser.evaluate("document.querySelector('#result').textContent")
            browser.screenshot(ARTIFACTS/'updraft-flight.png')
        except Exception:
            (ARTIFACTS/'browser-failure.html').write_text(browser.evaluate('document.documentElement.outerHTML'))
            raise
        finally:
            browser.close()
            server.shutdown()
    print('PASS: Chromium software-WebGL pixel parity, retained uploads, idle invalidation, real assets, flight school, pause, focus loss and narrow layout.')
