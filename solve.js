// solve.js — a fast drop-in for makefun-diff 1.0.0.
//
// Written from scratch in this session from the brief in RULES.txt:
// lines are cut after every '\n' (a '\r' is part of its line, a last line
// with no '\n' is a line too); two lines are equal only when they are the
// same code units, newline or its absence included. The edit script keeps
// the common prefix, then the common suffix of what is left; between them
// a Myers greedy search from the first lines, keeping on each diagonal the
// path reaching furthest into the old text, preferring the deletion when a
// deletion and an insertion reach the same point, never moving past either
// text's end, pruning no edge diagonal, and following every run of equal
// lines as far as it goes; the first path to reach both ends is the script.
// The patch is one header line, then hunks with up to 3 kept lines before
// and after each run of changes, runs at most 6 kept lines apart sharing a
// hunk, deletions before insertions inside a run, and a line that ends its
// text with no newline written with one and followed by a '%' line.
// Identical texts are the header line alone.

/** Split a text into lines, each keeping its trailing '\n' except possibly the last. */
function splitLines(text) {
  const lines = [];
  let start = 0;
  const len = text.length;
  while (start < len) {
    const nl = text.indexOf('\n', start);
    if (nl === -1) {
      lines.push(text.slice(start));
      break;
    }
    lines.push(text.slice(start, nl + 1));
    start = nl + 1;
  }
  return lines;
}

/**
 * Myers greedy search on the middle slices A[0..n), B[0..m).
 * Returns the edit ops as a flat Int8Array over the middle, in order:
 * 0 = keep, 1 = delete (old only), 2 = insert (new only).
 * Also returns the edit distance D.
 *
 * Speed: every row d of V is written straight into one flat scratch array
 * (row d starts at flat[d * d], entry k at flat[d * d + k + d]), so there
 * is no per-row copy and no per-row allocation; the buffer is reused
 * across cases (scratch only, no answers are carried between cases).
 */
let vFlat = new Int32Array(1 << 20);

function myersOps(A, B, n, m) {
  const ops = new Int8Array(n + m); // over-allocated; only first `len` used
  if (n === 0) {
    for (let j = 0; j < m; j++) ops[j] = 2;
    return { ops, len: m, D: m };
  }
  if (m === 0) {
    for (let i = 0; i < n; i++) ops[i] = 1;
    return { ops, len: n, D: n };
  }
  const a = A;
  const b = B;
  const ensure = (need) => {
    if (vFlat.length >= need) return vFlat;
    let cap = vFlat.length;
    while (cap < need) cap *= 2;
    const grown = new Int32Array(cap);
    grown.set(vFlat);
    vFlat = grown;
    return grown;
  };
  let F = vFlat;
  let D = -1;
  for (let d = 0; d <= n + m; d++) {
    const curBase = d * d;
    const need = curBase + 2 * d + 1;
    if (need > F.length) F = ensure(need);
    if (d === 0) {
      let x = 0;
      let y = 0;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      F[0] = x;
      if (x === n && y === m) {
        D = 0;
        break;
      }
      continue;
    }
    const prevBase = (d - 1) * (d - 1);
    for (let j = 0; j <= 2 * d; j += 2) {
      const k = j - d;
      let x;
      if (j === 0) {
        x = F[prevBase + 0];
      } else if (j === 2 * d) {
        x = F[prevBase + 2 * d - 2] + 1;
      } else {
        const del = F[prevBase + j - 2] + 1;
        const ins = F[prevBase + j];
        x = del >= ins ? del : ins; // deletion wins the tie
      }
      let y = x - k;
      // Follow the run of equal lines as far as it goes, never past either end.
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      F[curBase + j] = x;
      if (x === n && y === m) {
        D = d;
        break;
      }
    }
    if (D !== -1) break;
  }
  // Backtrack from (n, m) at d = D down to 1, collecting ops in reverse.
  // Row d - 1 lives at flat[(d - 1) * (d - 1)], entry kk at + kk + d - 1.
  const rev = [];
  let x = n;
  let y = m;
  for (let d = D; d >= 1; d--) {
    const k = x - y;
    const prevBase = (d - 1) * (d - 1);
    const getPrev = (kk) => (kk < -(d - 1) || kk > d - 1 ? 0 : F[prevBase + kk + (d - 1)]);
    let prevK;
    if (k === -d) {
      prevK = k + 1;
    } else if (k === d) {
      prevK = k - 1;
    } else {
      prevK = getPrev(k - 1) + 1 >= getPrev(k + 1) ? k - 1 : k + 1;
    }
    const prevX = getPrev(prevK);
    const prevY = prevX - prevK;
    const stepX = prevK === k - 1 ? prevX + 1 : prevX;
    const stepY = prevK === k - 1 ? prevY : prevY + 1;
    // The snake from the step's end to (x, y) is a run of keeps.
    for (let i = x - 1; i >= stepX; i--) rev.push(0);
    // The one edit step itself.
    rev.push(prevK === k - 1 ? 1 : 2);
    x = prevX;
    y = prevY;
  }
  // The d = 0 snake (the common prefix of the middle) is a run of keeps.
  for (let i = x - 1; i >= 0; i--) rev.push(0);
  rev.reverse();
  for (let i = 0; i < rev.length; i++) ops[i] = rev[i];
  return { ops, len: rev.length, D };
}

export function run(input) {
  const oldText = input.old;
  const newText = input.new;
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const N = oldLines.length;
  const M = newLines.length;

  // Map every distinct line to an id so comparisons are integer compares.
  const ids = new Map();
  let nextId = 1;
  const A = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    const line = oldLines[i];
    let id = ids.get(line);
    if (id === undefined) {
      id = nextId++;
      ids.set(line, id);
    }
    A[i] = id;
  }
  const B = new Int32Array(M);
  for (let j = 0; j < M; j++) {
    const line = newLines[j];
    let id = ids.get(line);
    if (id === undefined) {
      id = nextId++;
      ids.set(line, id);
    }
    B[j] = id;
  }

  // Common prefix, then common suffix of what is left.
  let p = 0;
  while (p < N && p < M && A[p] === B[p]) p++;
  let s = 0;
  while (s < N - p && s < M - p && A[N - 1 - s] === B[M - 1 - s]) s++;
  const n = N - p - s;
  const m = M - p - s;

  // Edit script for the middle, as segments of keeps/deletes/inserts.
  // Each segment: [kind, oldStart, oldEnd, newStart, newEnd) in full-text indices.
  const segments = [];
  const pushSeg = (kind, os, oe, ns, ne) => {
    if (oe === os && ne === ns) return;
    const last = segments[segments.length - 1];
    if (last && last[0] === kind && last[2] === os && last[4] === ns) {
      last[2] = oe;
      last[4] = ne;
      return;
    }
    segments.push([kind, os, oe, ns, ne]);
  };
  if (p > 0) pushSeg(0, 0, p, 0, p);
  if (n > 0 || m > 0) {
    const subA = A.subarray(p, p + n);
    const subB = B.subarray(p, p + m);
    const { ops, len } = myersOps(subA, subB, n, m);
    let oi = p;
    let nj = p;
    for (let t = 0; t < len; t++) {
      const op = ops[t];
      if (op === 0) {
        pushSeg(0, oi, oi + 1, nj, nj + 1);
        oi++;
        nj++;
      } else if (op === 1) {
        pushSeg(1, oi, oi + 1, nj, nj);
        oi++;
      } else {
        pushSeg(2, oi, oi, nj, nj + 1);
        nj++;
      }
    }
  }
  if (s > 0) pushSeg(0, N - s, N, M - s, M);

  // Count deletes / inserts for the header.
  let deleted = 0;
  let inserted = 0;
  for (const seg of segments) {
    if (seg[0] === 1) deleted += seg[2] - seg[1];
    else if (seg[0] === 2) inserted += seg[4] - seg[3];
  }

  // Group segments into hunks: a change run is a maximal run of segments
  // containing deletes/inserts; runs at most 6 kept lines apart share a hunk;
  // each hunk shows up to 3 kept lines before and after each run.
  const CONTEXT = 3;
  const MERGE_GAP = 6;
  const hunks = []; // each: list of segments (with kind) clipped to the hunk
  let i = 0;
  while (i < segments.length) {
    // Find the next change run starting at or after i.
    let start = i;
    while (start < segments.length && segments[start][0] === 0) start++;
    if (start >= segments.length) break;
    let end = start;
    while (end < segments.length && segments[end][0] !== 0) end++;
    // end is the first keep segment after the run (or the end).
    // Extend the hunk over following runs while the keep gap is <= 6.
    let hunkEnd = end;
    while (true) {
      let next = hunkEnd;
      while (next < segments.length && segments[next][0] === 0) next++;
      if (next >= segments.length) break;
      const gapSeg = segments[hunkEnd]; // the keep segment between runs
      const gap = gapSeg[2] - gapSeg[1];
      if (gap > MERGE_GAP) break;
      let nextEnd = next;
      while (nextEnd < segments.length && segments[nextEnd][0] !== 0) nextEnd++;
      hunkEnd = nextEnd;
    }
    // Clip the keep segments at the hunk edges to at most 3 lines.
    const clip = [];
    // Leading keep (the segment just before `start`).
    if (start > 0 && segments[start - 1][0] === 0) {
      const seg = segments[start - 1];
      const keep = Math.min(CONTEXT, seg[2] - seg[1]);
      clip.push([0, seg[2] - keep, seg[2], seg[4] - keep, seg[4]]);
    }
    for (let t = start; t < hunkEnd; t++) {
      const seg = segments[t];
      if (seg[0] === 0) {
        // A keep segment inside the hunk: it is a gap of <= 6 lines, shown whole.
        clip.push(seg);
      } else {
        clip.push(seg);
      }
    }
    // Trailing keep (the segment at hunkEnd).
    if (hunkEnd < segments.length && segments[hunkEnd][0] === 0) {
      const seg = segments[hunkEnd];
      const keep = Math.min(CONTEXT, seg[2] - seg[1]);
      clip.push([0, seg[1], seg[1] + keep, seg[3], seg[3] + keep]);
    }
    hunks.push(clip);
    i = hunkEnd;
  }

  // Render.
  const out = [];
  out.push(`makefun-diff/1 old=${N} new=${M} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`);
  const oldBare = N > 0 && !oldLines[N - 1].endsWith('\n');
  const newBare = M > 0 && !newLines[M - 1].endsWith('\n');
  for (const hunk of hunks) {
    const first = hunk[0];
    const last = hunk[hunk.length - 1];
    const os = first[1] + 1;
    const ol = last[2] - first[1];
    const ns = first[3] + 1;
    const nl = last[4] - first[3];
    out.push(`@ ${os} ${ol} ${ns} ${nl}\n`);
    // Within each change run, deletions come before insertions.
    let t = 0;
    while (t < hunk.length) {
      const seg = hunk[t];
      if (seg[0] === 0) {
        for (let a = seg[1]; a < seg[2]; a++) {
          const line = oldLines[a];
          out.push('=', line);
          if (a === N - 1 && oldBare) out.push('\n%\n');
          else if (!line.endsWith('\n')) out.push('\n');
        }
        t++;
        continue;
      }
      // A change run: collect its delete and insert segments.
      let u = t;
      const dels = [];
      const inss = [];
      while (u < hunk.length && hunk[u][0] !== 0) {
        if (hunk[u][0] === 1) dels.push(hunk[u]);
        else inss.push(hunk[u]);
        u++;
      }
      for (const d of dels) {
        for (let a = d[1]; a < d[2]; a++) {
          const line = oldLines[a];
          out.push('-', line);
          if (a === N - 1 && oldBare) out.push('\n%\n');
          else if (!line.endsWith('\n')) out.push('\n');
        }
      }
      for (const s2 of inss) {
        for (let b = s2[3]; b < s2[4]; b++) {
          const line = newLines[b];
          out.push('+', line);
          if (b === M - 1 && newBare) out.push('\n%\n');
          else if (!line.endsWith('\n')) out.push('\n');
        }
      }
      t = u;
    }
  }
  return out.join('');
}
