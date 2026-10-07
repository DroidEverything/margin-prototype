import { spawn } from 'child_process';

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--remote-debugging-port=9222',
  '--no-first-run',
  '--no-default-browser-check',
  '--user-data-dir=C:\\Users\\Asus\\AppData\\Local\\Temp\\chrome_debug_margin'
]);

await new Promise(r => setTimeout(r, 1200));

try {
  const version = await fetch('http://localhost:9222/json/version').then(r => r.json());
  const wsUrl = version.webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);

  await new Promise(r => ws.onopen = r);

  let id = 1;
  function send(method, params = {}) {
    return new Promise((resolve) => {
      const curId = id++;
      const handler = (e) => {
        const data = JSON.parse(e.data);
        if (data.id === curId) {
          ws.removeEventListener('message', handler);
          resolve(data.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  // Create a new target/page
  const { targetId } = await send('Target.createTarget', { url: 'http://localhost:8906/index.html' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

  function sendSession(method, params = {}) {
    return new Promise((resolve) => {
      const curId = id++;
      const handler = (e) => {
        const data = JSON.parse(e.data);
        if (data.id === curId) {
          ws.removeEventListener('message', handler);
          resolve(data.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: curId, sessionId, method, params }));
    });
  }

  ws.addEventListener('message', (e) => {
    const data = JSON.parse(e.data);
    if (data.method === 'Runtime.consoleAPICalled') {
      const args = data.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
      console.log(`[BROWSER CONSOLE ${data.params.type}]`, args);
    }
    if (data.method === 'Runtime.exceptionThrown') {
      console.error('[BROWSER EXCEPTION]', data.params.exceptionDetails);
    }
  });

  await sendSession('Runtime.enable');
  await sendSession('Page.enable');
  await sendSession('Network.enable');
  await sendSession('Network.setCacheDisabled', { cacheDisabled: true });

  await sendSession('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });

  console.log('Navigating to http://localhost:8906/index.html ...');
  await sendSession('Page.navigate', { url: 'http://localhost:8906/index.html' });

  console.log('Waiting for load...');
  await new Promise(r => setTimeout(r, 2000));

  // Direct test importing ops-view.js
  const importRes = await sendSession('Runtime.evaluate', {
    expression: `
      import('./js/ops-view.js')
        .then(m => ({ success: true, keys: Object.keys(m) }))
        .catch(err => ({ success: false, name: err.name, message: err.message, stack: err.stack }))
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Import ops-view.js result:', importRes.result.value);

  // Simulate setting up a real mission with launch state and going to ops
  console.log('Setting up mission and switching to ops screen...');
  const switchRes = await sendSession('Runtime.evaluate', {
    expression: `
      (() => {
        try {
          if (typeof S !== 'undefined') {
            S.levelId = 'l4';
            S.instruments = ['hires', 'arm'];
            S.power = 'sa3';
            S.comms = 'hga2';
            S.prop = 'bi';
            S.shield = 'sh0';
            S.objectives = ['o_samp'];
            S.launch = {
              lv: 'av551',
              c3: 15.2,
              tof: 370,
              tDep: 2029.2,
              vinf: 5.4,
              cost: 120,
              set: true
            };
            S.screen = 'ops';
            render();
          }
          return {
            screen: typeof S !== 'undefined' ? S.screen : null,
            hasOpsView: typeof OpsView !== 'undefined',
            windowHasOpsView: !!window.OpsView,
            opsActive: window.OpsView ? window.OpsView.isActive() : false
          };
        } catch (e) {
          return { error: e.message, stack: e.stack };
        }
      })()
    `,
    returnByValue: true
  });
  console.log('After switch:', switchRes.result.value);

  // Wait 1.2s for animations and rendering
  await new Promise(r => setTimeout(r, 1200));

  // Capture screenshot of CRAFT mode
  const { data: craftData } = await sendSession('Page.captureScreenshot', { format: 'png' });
  const fs = await import('fs');
  fs.writeFileSync('scratch_review/ops_craft_screenshot.png', Buffer.from(craftData, 'base64'));
  console.log('Saved screenshot to scratch_review/ops_craft_screenshot.png');

  // Switch camera to TARGET mode via OpsView.setCameraMode('target')
  console.log('Switching to TARGET camera mode...');
  await sendSession('Runtime.evaluate', {
    expression: `window.OpsView.setCameraMode('target');`
  });
  await new Promise(r => setTimeout(r, 1100));
  const { data: targetData } = await sendSession('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch_review/ops_target_screenshot.png', Buffer.from(targetData, 'base64'));
  console.log('Saved screenshot to scratch_review/ops_target_screenshot.png');

  // Switch camera to SYSTEM mode via OpsView.setCameraMode('system')
  console.log('Switching to SYSTEM camera mode...');
  await sendSession('Runtime.evaluate', {
    expression: `window.OpsView.setCameraMode('system');`
  });
  await new Promise(r => setTimeout(r, 1100));

  // Capture screenshot of the SYSTEM mode
  const { data: sysData } = await sendSession('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch_review/ops_system_screenshot.png', Buffer.from(sysData, 'base64'));
  console.log('Saved screenshot to scratch_review/ops_system_screenshot.png');

  // Switch back to CRAFT mode and test mouse drag orbit freedom
  console.log('Switching back to CRAFT mode and testing OrbitControls mouse drag freedom...');
  await sendSession('Runtime.evaluate', {
    expression: `window.OpsView.setCameraMode('craft');`
  });
  await new Promise(r => setTimeout(r, 1000));

  // Record camera pos before drag
  const beforeDrag = await sendSession('Runtime.evaluate', {
    expression: `[window.__opsV.camera.position.x, window.__opsV.camera.position.y, window.__opsV.camera.position.z]`,
    returnByValue: true
  });
  console.log('Camera pos before drag:', beforeDrag.result.value);

  // Dispatch mouse drag on the 3D canvas (center of screen)
  await sendSession('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 450, button: 'left', clickCount: 1 });
  await sendSession('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 860, y: 410, button: 'left' });
  await sendSession('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 860, y: 410, button: 'left' });

  // Wait 300ms
  await new Promise(r => setTimeout(r, 300));

  const afterDrag = await sendSession('Runtime.evaluate', {
    expression: `({
      camPos: [window.__opsV.camera.position.x, window.__opsV.camera.position.y, window.__opsV.camera.position.z],
      targetPos: [window.__opsV.controls.target.x, window.__opsV.controls.target.y, window.__opsV.controls.target.z],
      userInteracted: window.__opsV.userInteracted,
      glide: !!window.__opsV.glide
    })`,
    returnByValue: true
  });
  console.log('Camera pos after mouse drag:', afterDrag.result.value);

  // Capture screenshot of user rotated chase angle
  const { data: userDragData } = await sendSession('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch_review/ops_user_drag_screenshot.png', Buffer.from(userDragData, 'base64'));
  console.log('Saved screenshot to scratch_review/ops_user_drag_screenshot.png');

  // Inspect scene objects and their world positions / scale / materials
  const sceneDebug = await sendSession('Runtime.evaluate', {
    expression: `
      (() => {
        const V = window.__opsV;
        if (!V) return { noV: true };
        return {
          camPos: [V.camera.position.x, V.camera.position.y, V.camera.position.z],
          camTarget: [V.controls.target.x, V.controls.target.y, V.controls.target.z],
          craftPos: [V.craftGroup.position.x, V.craftGroup.position.y, V.craftGroup.position.z],
          craftScale: [V.craftGroup.scale.x, V.craftGroup.scale.y, V.craftGroup.scale.z],
          craftWorldPos: [V.craftWorldPos.x, V.craftWorldPos.y, V.craftWorldPos.z],
          camDist: V.camera.position.distanceTo(V.craftWorldPos),
          targetKey: V.targetKey,
          targetWorldPos: [V.targetWorldPos.x, V.targetWorldPos.y, V.targetWorldPos.z],
          camMode: V.camMode
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Scene Debug:', sceneDebug.result.value);

  // Test labels and camera tracking
  const opsAudit = await sendSession('Runtime.evaluate', {
    expression: `
      (() => {
        const V = window.__opsV;
        if (!V) return { err: 'no V' };
        const orbitTagsVisible = (V.sys && V.sys.orbitTags) ? V.sys.orbitTags.filter(t => t.visible).length : 0;
        const labels = {};
        if (V.bodyLabels) {
          for (const k of Object.keys(V.bodyLabels)) {
            const item = V.bodyLabels[k];
            labels[k] = {
              visible: item.sprite ? item.sprite.visible : false,
              opacity: item.sprite && item.sprite.material ? item.sprite.material.opacity : 0,
              pos: item.sprite ? [item.sprite.position.x.toFixed(3), item.sprite.position.y.toFixed(3), item.sprite.position.z.toFixed(3)] : null
            };
          }
        }
        return {
          orbitTagsVisible,
          labels,
          camMode: V.camMode,
          camPos: [V.camera.position.x.toFixed(3), V.camera.position.y.toFixed(3), V.camera.position.z.toFixed(3)],
          camTarget: [V.controls.target.x.toFixed(3), V.controls.target.y.toFixed(3), V.controls.target.z.toFixed(3)],
          glideActive: !!V.glide
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Ops Audit:', JSON.stringify(opsAudit.result.value, null, 2));

} finally {
  chrome.kill();
  process.exit(0);
}
