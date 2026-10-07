#!/usr/bin/env node
// Validates a Mermaid ERD and compiles it to SVG using the local mermaid-cli (mmdc).
//
// Usage: node .agent/skills/erd-generator/scripts/render_erd.js docs/architecture/schema.mmd
//
// On success: writes docs/architecture/erd.svg, prints SUCCESS, exits 0.
// On failure: prints SYNTAX_ERROR: <stderr trace>, exits 1.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import * as path from 'node:path';

function fail(message) {
  console.error(`SYNTAX_ERROR: ${message}`);
  process.exit(1);
}

const inputArg = process.argv[2] ?? 'docs/architecture/schema.mmd';
const inputPath = path.resolve(process.cwd(), inputArg);
const outputPath = path.join(path.dirname(inputPath), 'erd.svg');

if (!existsSync(inputPath)) {
  fail(`Input file not found: ${inputPath}`);
}

const source = readFileSync(inputPath, 'utf8').trim();
if (!source) {
  fail(`Input file is empty: ${inputPath}`);
}
if (!/^erDiagram\b/m.test(source)) {
  fail('Diagram must be a Mermaid entity-relationship diagram starting with "erDiagram".');
}

// Remove any stale SVG so a failed compile can never leave an old asset behind.
rmSync(outputPath, { force: true });

const result = spawnSync('npx', ['--no-install', 'mmdc', '-i', inputPath, '-o', outputPath], {
  encoding: 'utf8',
  // npx is a .cmd shim on Windows and must be launched through the shell.
  shell: process.platform === 'win32',
});

if (result.error) {
  fail(`Failed to launch mmdc: ${result.error.message}`);
}

const trace = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();

if (result.status !== 0) {
  fail(trace || `mmdc exited with code ${result.status}`);
}

if (!existsSync(outputPath) || statSync(outputPath).size === 0) {
  fail(trace || `mmdc did not produce ${outputPath}`);
}

console.log('SUCCESS');
console.log(`SVG written to ${path.relative(process.cwd(), outputPath)}`);
process.exit(0);
