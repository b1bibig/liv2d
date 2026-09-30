// Renders the model in a set of poses with headless Chromium and saves PNGs,
// so rig changes can be checked without opening a browser.
//   node tools/snapshot.mjs [model] [outDir] [--wire]
// Needs Playwright (local or global install).

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './serve.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const wire = process.argv.includes('--wire');
const modelName = args[0] ?? 'placeholder';
const outDir = args[1] ?? 'out';

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require('playwright');
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim();
    return require(join(globalRoot, 'playwright'));
  }
}

export const POSES = {
  rest: {},
  'look-right': { ParamAngleX: 30, ParamEyeBallX: 1, ParamBodyAngleX: 8 },
  'look-left': { ParamAngleX: -30, ParamEyeBallX: -1, ParamBodyAngleX: -8 },
  'look-up': { ParamAngleY: 30, ParamEyeBallY: 1 },
  'look-down': { ParamAngleY: -30, ParamEyeBallY: -1 },
  tilt: { ParamAngleZ: 30, ParamBodyAngleZ: 10 },
  'eyes-half': { ParamEyeLOpen: 0.5, ParamEyeROpen: 0.5 },
  'eyes-closed': { ParamEyeLOpen: 0, ParamEyeROpen: 0 },
  'eyes-smile': { ParamEyeLOpen: 0, ParamEyeROpen: 0, ParamEyeLSmile: 1, ParamEyeRSmile: 1, ParamMouthForm: 1, ParamMouthOpenY: 0.7, ParamCheek: 1 },
  'mouth-open': { ParamMouthOpenY: 1 },
  angry: { ParamBrowLAngle: -1, ParamBrowRAngle: -1, ParamBrowLY: -0.5, ParamBrowRY: -0.5, ParamMouthForm: -1, ParamEyeLOpen: 0.75, ParamEyeROpen: 0.75 },
  'hair-sway': { ParamHairFront: 1, ParamHairSide: 1, ParamHairBack: 1, ParamHairAhoge: 1 },
};

const { chromium } = loadPlaywright();
const server = await startServer(0);
const port = server.address().port;
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 820 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://localhost:${port}/?still&model=${modelName}${wire ? '&wire' : ''}`);
  await page.waitForFunction(() => window.liv2d || document.querySelector('#status.error'), null, { timeout: 30000 });
  if (errors.length) throw new Error(errors.join('\n'));
  await page.addStyleTag({ content: '#toolbar,#params{display:none!important}' });
  for (const [name, pose] of Object.entries(POSES)) {
    await page.evaluate((p) => window.liv2d.pose(p), pose);
    await page.locator('#gl').screenshot({ path: join(outDir, `${name}.png`) });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`saved ${Object.keys(POSES).length} poses to ${outDir}/`);
} finally {
  await browser.close();
  server.close();
}
