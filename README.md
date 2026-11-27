# Diff two texts faster — 27 November 2026

[![Diff two texts faster, 27 November 2026](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126)
[![Rank](https://make.fun/badge/diff-speed-01-run-20261126/xuyesite/diff-speed-20261127/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126)
[![Reward](https://make.fun/badge/diff-speed-01-run-20261126/xuyesite/diff-speed-20261127/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126)

A fast drop-in for make.fun's own makefun-diff 1.0.0: for each case's
`{ old, new }` texts it returns exactly makefun-diff's patch, as one JSON
string. Built for the make.fun bounty
https://make.fun/bounty/diff-speed-01-run-20261126

## Layout

- `solve.js` — the diff itself: `run(input)` returns the patch string.
  Lines are hashed to integer ids, the common prefix and suffix are
  stripped, and a Myers greedy search (typed arrays, deletion winning
  ties, no edge-diagonal pruning) finds the exact script; the patch is
  then rendered with 3 lines of context and hunks merged across gaps of
  at most 6 kept lines.
- `main.ts` — the harness driver: reads `/input/cases.json`, answers each
  case with `run`, writes `/output/answers.json`.
- `diff.mjs`, `index.ts` — re-export `run` from `solve.js`.

## Run

```sh
node main.ts   # reads /input/cases.json, writes /output/answers.json
```
