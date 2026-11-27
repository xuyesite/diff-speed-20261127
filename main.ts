// main.ts — the program the harness runs: reads every case from
// /input/cases.json (or MAKEFUN_INPUT_DIR), answers each with run() from
// solve.js, and writes /output/answers.json (or MAKEFUN_OUTPUT_DIR).
// Input is only ever read from the directory the harness gives;
// output is only ever written to the directory the harness gives.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// Same V8 tuning the house baseline uses; the rules allow an entry to
// tune V8's flags the same way.
setFlagsFromString('--no-incremental-marking');

const { run } = await import('./solve.js');

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8'));
const answers = [];
for (const c of cases) answers.push(run(c.input));
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'answers.json'), JSON.stringify(answers));
