#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createSuite, pluginRoot } = require('../lib/harness');

const suite = createSuite('design-draft');
const { report, fixture, runScript, finish } = suite;

const read = (relativePath) => fs.readFileSync(path.join(pluginRoot, relativePath), 'utf8');
const FEATURE = path.join(pluginRoot, 'tests', 'fixtures', 'design-draft', 'payment-reminder');
const DRAFT = path.join(FEATURE, 'design', 'reminder-list.html');
const SPEC = path.join(FEATURE, 'widget-spec', 'reminder-list.md');
const THE_QUESTION_J9_GREPS_FOR = 'Do you have a design for the screen';

{
  const clientSpoke = read('skills/do-grooming/client-spoke.md');
  const schema = read('skills/do-grooming/grooming-run-schema.md');
  const skill = read('skills/do-grooming/SKILL.md');
  report('skill', 'client-spoke asks the design question word for word, curly quotes included',
    clientSpoke.includes('`Do you have a design for the screen “{screen}”?`'));
  report('skill', 'the grooming-run guide gives the platform the same title',
    schema.includes('`Do you have a design for the screen “<screen name>”?`'));
  const skillsHolding = fs.readdirSync(path.join(pluginRoot, 'skills', 'do-grooming'))
    .filter((name) => fs.readFileSync(path.join(pluginRoot, 'skills', 'do-grooming', name), 'utf8').includes(THE_QUESTION_J9_GREPS_FOR));
  report('skill', 'the installed skills hold the text the platform journey greps for', skillsHolding.includes('client-spoke.md'), skillsHolding);
  report('skill', 'client-spoke names the options by id: draft recommended, figma requiring the link',
    /`draft` — \*\*Claude drafts it\*\*, recommended/.test(clientSpoke) && /`figma` — \*\*I have a Figma link\*\*, requires a reason/.test(clientSpoke));
  report('skill', 'the guide fixes the option ids, order and flags',
    /`draft`, label `Claude drafts it`, `recommended` true,\s+`requiresReason` false; `figma`, label `I have a Figma link`, `recommended` false,\s+`requiresReason` true/.test(schema));
  report('skill', 'the guide sends draft on a draft\'s gate only, with the contract\'s pattern',
    schema.includes('{ "path": "design/<screen>.html" }') && schema.includes('`^design/[A-Za-z0-9._-]+\\.html$`') &&
      /Sent on every draft's gate and on\s+no other gate/.test(schema));
  report('skill', 'SKILL.md keeps "never generate UI" with the one exception the member picks',
    /never generate UI, except a draft of a screen with\s+no design whose member picks "Claude drafts it"/.test(skill) && !/do not generate UI/.test(skill));
  report('skill', 'the widget-spec template lets Design name a Claude draft', read('skills/do-grooming/widget-spec-template.md').includes('a Claude draft, `../design/<screen>.html`'));
  report('skill', 'do-planning reads a draft as an HTML canvas', /A Claude draft\s+\(`design\/<screen>\.html`\) is read as an HTML canvas/.test(read('skills/do-planning/SKILL.md')));
  const draftStep = read('skills/do-grooming/design-draft.md');
  report('skill', 'the draft step commits both files before the gate and redraws over the same file',
    /\*\*Commit both files before the gate\*\*/.test(draftStep) && /Redraw over the \*\*same file\*\*/.test(draftStep) &&
      /show the \*\*same gate again\*\*/.test(draftStep));
  report('skill', 'the draft step runs check-draft.js before every commit', /scripts\/check-draft\.js docs\/development\/<feature>\/design\/<screen>\.html/.test(draftStep));
}

const THE_WEBS_DESIGN_ROW = /^\|\s*\*\*Design\*\*\s*\|(.*)\|\s*$/m;
const THE_WEBS_FIRST_MARKDOWN_LINK = /\[[^\]]*\]\(([^)\s]+)\)/;
const draftTheWebReads = (spec) => {
  const cell = (spec.match(THE_WEBS_DESIGN_ROW) || [])[1];
  const linked = cell && (cell.match(THE_WEBS_FIRST_MARKDOWN_LINK) || [])[1];
  const pathInFolder = linked && linked.replace(/^\.\.\//, '');
  return pathInFolder && /^design\/[A-Za-z0-9._-]+\.html$/.test(pathInFolder) ? pathInFolder : null;
};

{
  report('Design field', 'the platform\'s web reads the recorded draft as design/<screen>.html', draftTheWebReads(fs.readFileSync(SPEC, 'utf8')) === 'design/reminder-list.html');
  const example = (/```\n\s*(\| \*\*Design\*\* \|[^\n]+)\n/.exec(read('skills/do-grooming/design-draft.md')) || [])[1] || '';
  report('Design field', 'the draft step\'s own example reads as a draft once filled in',
    draftTheWebReads(example.replace(/<screen>/g, 'reminder-list')) === 'design/reminder-list.html', example);
  const approved = fs.readFileSync(SPEC, 'utf8').replace('Claude draft, awaiting approval', 'Claude draft · commit abc1234 · approved 2026-10-21');
  report('Design field', 'the approval stamp keeps the link the web reads', draftTheWebReads(approved) === 'design/reminder-list.html');
}

const clean = fs.readFileSync(DRAFT, 'utf8');
const check = (html, name = 'reminder-list.html', withSpec = true) => {
  const file = fixture(path.join(`case-${check.count = (check.count || 0) + 1}`, 'design', name), html);
  return runScript('check-draft.js', withSpec ? [file, '--spec', SPEC] : [file]);
};

{
  const passed = check(clean);
  report('check-draft.js', 'a draft drawn to the rules is clean', passed.exitCode === 0, passed.stdout + passed.stderr);
  const usage = runScript('check-draft.js', []);
  report('check-draft.js', 'no file is a usage error', usage.exitCode === 2);

  const header = '<header class="header" data-testid="reminders_list_header">';
  const breaking = [
    ['a <script> element', clean.replace('</body>', '<script>alert(1)</script></body>'), /<script>/],
    ['an event-handler attribute', clean.replace('<button class="add"', '<button onclick="go()" class="add"'), /event-handler attribute onclick/],
    ['an uppercase event handler', clean.replace(header, header.replace('<header', '<header ONMOUSEOVER="x()"')), /event-handler attribute onmouseover/],
    ['a javascript: link', clean.replace('</main>', '<a href="javascript:go()">Go</a></main>'), /javascript:/],
    ['a data: URL in CSS', clean.replace('.overdue {', '.overdue { background: url(data:image/png;base64,AAAA);'), /url\(data:/],
    ['a data: URL in an attribute', clean.replace('</main>', '<a href="data:text/html,hi">x</a></main>'), /data: URL/],
    ['an outside image', clean.replace('</main>', '<img src="https://example.com/a.png" alt=""></main>'), /<img>/],
    ['an outside stylesheet', clean.replace('</head>', '<link rel="stylesheet" href="https://example.com/a.css"></head>'), /<link>/],
    ['an @import', clean.replace('<style>', '<style>@import url("https://fonts.example.com/a.css");'), /@import/],
    ['an outside font', clean.replace('<style>', '<style>@font-face { font-family: X; src: url(x.woff2); }'), /@font-face/],
    ['an outside URL in CSS', clean.replace('.overdue {', '.overdue { background: url(//cdn.example.com/a.png);'), /url\(\/\/cdn/],
    ['an outside URL in an SVG', clean.replace('<path d="M8 2v12M2 8h12"', '<use href="https://example.com/i.svg#a"/><path d="M8 2v12M2 8h12"'), /only a #fragment/],
    ['an outside URL in the text', clean.replace('Payment reminders</h1>', 'Pay at https://pay.example.com</h1>'), /outside URL/],
    ['a policy meta', clean.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta http-equiv="refresh" content="0">'), /http-equiv/],
    ['no data-frame', clean.replace(/ data-frame="[^"]*"/g, ''), /data-frame/],
    ['a Test ID of the widget spec on no element', clean.replace(/reminders_list_empty_text/g, 'reminders_list_empty'), /reminders_list_empty_text/],
    ['a file of 1 MiB', clean.replace('</body>', `<div hidden>${'x'.repeat(1024 * 1024)}</div></body>`), /under 1 MiB/],
  ];
  for (const [what, html, says] of breaking) {
    const outcome = check(html);
    report('check-draft.js', `refuses ${what}`, outcome.exitCode === 1 && says.test(outcome.stdout), outcome.stdout.slice(0, 600));
  }
  const badName = check(clean, 'reminder list.html');
  report('check-draft.js', 'refuses a name outside [A-Za-z0-9._-]', badName.exitCode === 1 && /does not match/.test(badName.stdout), badName.stdout);
  const outside = fixture(path.join('case-outside', 'drafts', 'reminder-list.html'), clean);
  const notUnderDesign = runScript('check-draft.js', [outside]);
  report('check-draft.js', 'refuses a draft outside the feature folder\'s design/', notUnderDesign.exitCode === 1 && /design\//.test(notUnderDesign.stdout), notUnderDesign.stdout);
  const svgNamespace = check(clean.replace(/<svg /g, '<svg xmlns="http://www.w3.org/2000/svg" '));
  report('check-draft.js', 'allows the SVG namespace, which fetches nothing', svgNamespace.exitCode === 0, svgNamespace.stdout);
  const fragment = check(clean.replace('<path d="M8 2v12M2 8h12"', '<use href="#plus"/><path d="M8 2v12M2 8h12"'));
  report('check-draft.js', 'allows a #fragment of the draft itself', fragment.exitCode === 0, fragment.stdout);
}

finish();
