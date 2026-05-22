#!/usr/bin/env node
// Syncs the marked AP127 sections from index.html into student.html.
// Run manually or via GitHub Actions before committing student.html.

const fs = require('fs');

const SECTIONS = [
  ['/* ##AP127CSS_START## */',    '/* ##AP127CSS_END## */'],
  ['<!-- ##AP127PAGE_START## -->', '<!-- ##AP127PAGE_END## -->'],
  ['<!-- ##AP127DRAWER_START## -->', '<!-- ##AP127DRAWER_END## -->'],
  ['// ##AP127NICKS_START##',     '// ##AP127NICKS_END##'],
  ['// ##AP127JS_START##',        '// ##AP127JS_END##'],
];

function extract(src, start, end) {
  const si = src.indexOf(start);
  const ei = src.indexOf(end);
  if (si === -1 || ei === -1) throw new Error(`Markers not found: ${start}`);
  return src.slice(si + start.length, ei);
}

function patch(target, start, end, content) {
  const si = target.indexOf(start);
  const ei = target.indexOf(end);
  if (si === -1 || ei === -1) throw new Error(`Markers not found in student.html: ${start}`);
  return target.slice(0, si + start.length) + content + target.slice(ei);
}

const indexHtml = fs.readFileSync('index.html', 'utf8');
let studentHtml = fs.readFileSync('student.html', 'utf8');

for (const [start, end] of SECTIONS) {
  const content = extract(indexHtml, start, end);
  studentHtml = patch(studentHtml, start, end, content);
  console.log(`  synced: ${start.slice(0, 30).trim()}…`);
}

fs.writeFileSync('student.html', studentHtml, 'utf8');
console.log(`student.html synced from index.html (${studentHtml.length} bytes)`);
