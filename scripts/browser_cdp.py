"""Small Linux CI Chrome pipe client, Python stdlib only. No listening debug port.

Uses the Chrome DevTools Protocol Target, Runtime and Page domains:
https://chromedevtools.github.io/devtools-protocol/
"""
import base64
import json
import os
import select
import subprocess
import time


class Chrome:
    def __init__(self, flags, stderr):
        # Chrome's pipe transport uses fd 3 for input and fd 4 for output.
        # Positional arguments remain argv; no URL/path is evaluated as shell code.
        self.process = subprocess.Popen(
            ['bash', '-c', 'exec 3<&0 4>&1\nexec "$@"', 'chrome-pipe',
             *flags, '--remote-debugging-pipe'],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=stderr, bufsize=0)
        self.sequence = 0
        self.pending = b''
        self.session = None
        try:
            target = self.call('Target.createTarget', {'url': 'about:blank'})['targetId']
            self.session = self.call('Target.attachToTarget', {'targetId': target, 'flatten': True})['sessionId']
            self.call('Page.enable')
            self.call('Page.bringToFront')
            self.call('Emulation.setDeviceMetricsOverride', {
                'width': 1440, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
        except Exception:
            self.close()
            raise

    def call(self, method, params=None, timeout=30):
        self.sequence += 1
        message = {'id': self.sequence, 'method': method, 'params': params or {}}
        if self.session:
            message['sessionId'] = self.session
        self.process.stdin.write(json.dumps(message).encode() + b'\0')
        deadline = time.monotonic() + timeout
        while True:
            while b'\0' in self.pending:
                packet, self.pending = self.pending.split(b'\0', 1)
                if not packet:
                    continue
                response = json.loads(packet)
                if response.get('id') == self.sequence:
                    if 'error' in response:
                        raise RuntimeError(f'{method}: {response["error"]}')
                    return response.get('result', {})
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not select.select([self.process.stdout], [], [], remaining)[0]:
                raise TimeoutError(f'Chrome did not answer {method}')
            data = os.read(self.process.stdout.fileno(), 65536)
            if not data:
                raise RuntimeError(f'Chrome closed its pipe during {method}')
            self.pending += data

    def evaluate(self, expression):
        result = self.call('Runtime.evaluate', {'expression': expression, 'returnByValue': True, 'awaitPromise': True})
        if 'exceptionDetails' in result:
            raise RuntimeError(str(result['exceptionDetails']))
        return result.get('result', {}).get('value')

    def wait(self, expression, timeout=45):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.evaluate(expression):
                return
            time.sleep(.1)
        raise TimeoutError(f'Page never reached: {expression}')

    def navigate(self, url):
        # Navigate through a blank document so polling cannot accept the prior
        # document's completion marker while the next page is still loading.
        self.call('Page.navigate', {'url': 'about:blank'})
        self.wait("location.href === 'about:blank'")
        result = self.call('Page.navigate', {'url': url})
        if result.get('errorText'):
            raise RuntimeError(result['errorText'])
        self.wait('location.href === ' + json.dumps(url))

    def screenshot(self, path):
        result = self.call('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': False})
        path.write_bytes(base64.b64decode(result['data'], validate=True))

    def close(self):
        self.process.terminate()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
        self.process.stdin.close()
        self.process.stdout.close()
