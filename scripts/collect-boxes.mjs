#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const USAGE = `usage: node collect-boxes.mjs --url <file-or-http-url> --viewport <W>x<H> --ids <spec.md|id,id,...>
                          [--frame <css selector>] [--frame-index <n>] [--wait <css selector>] --out <boxes.json>
  Run from the project root, so its own Playwright is used. Every id is looked up as #id, then as
  [data-testid="id"]. With --frame, boxes are relative to that frame (a design canvas); without it,
  relative to the page (the running app, captured full page).
`;

const args = {};
for (let index = 2; index < process.argv.length; index += 2) args[process.argv[index].replace(/^--/, '')] = process.argv[index + 1];
if (!args.url || !args.viewport || !args.ids || !args.out) {
  process.stderr.write(USAGE);
  process.exit(2);
}

const [width, height] = args.viewport.split('x').map(Number);
const ids = fs.existsSync(args.ids)
  ? [...new Set([...fs.readFileSync(args.ids, 'utf8').matchAll(/`([a-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+)`/g)].map((match) => match[1]))]
  : args.ids.split(',').map((id) => id.trim()).filter(Boolean);

const require = createRequire(path.join(process.cwd(), 'package.json'));
let chromium;
for (const name of ['playwright', '@playwright/test', 'playwright-core']) {
  try { ({ chromium } = require(name)); break; } catch {}
}
if (!chromium) {
  process.stderr.write('no Playwright in this project — run from a project that has playwright or @playwright/test\n');
  process.exit(2);
}

const url = /^[a-z]+:\/\//.test(args.url) ? args.url : 'file://' + path.resolve(args.url);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(url, { waitUntil: 'networkidle' });
  if (args.wait) await page.waitForSelector(args.wait, { timeout: 30000 });
  const result = await page.evaluate(({ ids, frameSelector, frameIndex }) => {
    const pick = (root, id) => root.querySelector('#' + CSS.escape(id)) || root.querySelector(`[data-testid="${id}"]`);
    let frame = document.documentElement;
    if (frameSelector) {
      const frames = [...document.querySelectorAll(frameSelector)];
      frame = frames[frameIndex || 0];
      if (!frame) return { error: `no frame matches ${frameSelector} at index ${frameIndex || 0}` };
    }
    const origin = frameSelector ? frame.getBoundingClientRect() : { x: -window.scrollX, y: -window.scrollY };
    const boxes = {};
    const missing = [];
    for (const id of ids) {
      const element = pick(frame, id);
      if (!element) { missing.push(id); continue; }
      const box = element.getBoundingClientRect();
      boxes[id] = [box.x - origin.x, box.y - origin.y, box.width, box.height].map((value) => Math.round(value));
    }
    const frameBox = frameSelector ? frame.getBoundingClientRect() : null;
    return {
      frame: frameBox ? [frameBox.x, frameBox.y, frameBox.width, frameBox.height].map((value) => Math.round(value)) : null,
      boxes,
      missing,
    };
  }, { ids, frameSelector: args.frame || null, frameIndex: Number(args['frame-index'] || 0) });
  if (result.error) {
    process.stderr.write(result.error + '\n');
    process.exit(2);
  }
  fs.writeFileSync(args.out, JSON.stringify({ source: args.url, viewport: [width, height], ...result }, null, 2) + '\n');
  process.stdout.write(`boxes: ${Object.keys(result.boxes).length} of ${ids.length} ids found · missing ${result.missing.length}` +
    (result.missing.length ? ` (${result.missing.slice(0, 6).join(', ')}${result.missing.length > 6 ? ', …' : ''})` : '') + '\n');
} finally {
  await browser.close();
}
