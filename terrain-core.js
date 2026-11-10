// TerrainGen level logic, ported line for line from the project's Python
// (scripts/repair.py and the sampling step in scripts/model_deep.py).
// Levels are 20 rows by 40 columns of tile ids: 0 empty, 1 solid, 3 platform, 6 hazard.
(function (root) {
  const H = 20, W = 40;
  const EMPTY = 0, SOLID = 1, SLOPE = 2, PLATFORM = 3, HAZARD = 6;
  const MAX_JUMP_HEIGHT = 2, MAX_JUMP_WIDTH = 2, GAME_JUMP_PEAK = 4;

  const walkable = (t) => t === SOLID || t === SLOPE || t === PLATFORM;
  const copy = (level) => level.map((row) => row.slice());

  function isStanding(level, r, c) {
    const t = level[r][c];
    if (walkable(t) || t === HAZARD) return false;
    if (r >= H - 1) return false;
    return walkable(level[r + 1][c]);
  }

  function jumpArcClear(level, r, c, nr, nc) {
    const rPeak = Math.min(r - GAME_JUMP_PEAK, Math.min(r, nr) - 1);
    const rMax = Math.max(r, nr);
    const cLo = Math.min(c, nc), cHi = Math.max(c, nc);
    for (let rr = rPeak; rr <= rMax; rr++) {
      if (rr < 0 || rr >= H) continue;
      for (let cc = cLo; cc <= cHi; cc++) {
        if ((rr === r && cc === c) || (rr === nr && cc === nc)) continue;
        if (level[rr][cc] === HAZARD) return false;
      }
    }
    if (nr < r) {
      for (let rr = nr; rr < r; rr++) {
        if ((rr === r) || (rr === nr && c === nc)) continue;
        if (rr < 0 || rr >= H) continue;
        if (walkable(level[rr][c])) return false;
      }
    }
    for (const rr of [nr - 1, nr - 2]) {
      if (rr < 0 || rr >= H) continue;
      if ((rr === r && nc === c) || rr === nr) continue;
      if (walkable(level[rr][nc])) return false;
    }
    return true;
  }

  function fallPathClear(level, r, nr, nc) {
    for (let rr = r + 1; rr < nr; rr++) {
      if (rr >= 0 && rr < H && level[rr][nc] === HAZARD) return false;
    }
    return true;
  }

  // Breadth-first search over standing positions: walk, jump, fall.
  function reachable(level) {
    const visited = new Uint8Array(H * W);
    const queue = [];
    for (let r = 0; r < H; r++) {
      if (isStanding(level, r, 0)) { visited[r * W] = 1; queue.push(r, 0); }
    }
    for (let head = 0; head < queue.length; head += 2) {
      const r = queue[head], c = queue[head + 1];
      for (const dc of [-1, 1]) {
        const nc = c + dc;
        if (nc >= 0 && nc < W && isStanding(level, r, nc) && !visited[r * W + nc]) {
          visited[r * W + nc] = 1; queue.push(r, nc);
        }
      }
      for (let dh = 1; dh <= MAX_JUMP_HEIGHT; dh++) {
        for (let dc = -MAX_JUMP_WIDTH; dc <= MAX_JUMP_WIDTH; dc++) {
          const nr = r - dh, nc = c + dc;
          if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
          if (isStanding(level, nr, nc) && jumpArcClear(level, r, c, nr, nc) && !visited[nr * W + nc]) {
            visited[nr * W + nc] = 1; queue.push(nr, nc);
          }
        }
      }
      for (const dc of [-1, 0, 1]) {
        const nc = c + dc;
        if (nc < 0 || nc >= W) continue;
        for (let dr = 1; dr < H; dr++) {
          const nr = r + dr;
          if (nr >= H) break;
          if (walkable(level[nr][nc])) break;
          if (isStanding(level, nr, nc) && !visited[nr * W + nc]) {
            if (fallPathClear(level, r, nr, nc)) { visited[nr * W + nc] = 1; queue.push(nr, nc); }
            break;
          }
        }
      }
    }
    return visited;
  }

  function reachesRightEdge(visited) {
    for (let r = 0; r < H; r++) if (visited[r * W + W - 1]) return true;
    return false;
  }

  function isPlayable(level) { return reachesRightEdge(reachable(level)); }

  function enforceLayout(level, topAirRows = 4, bottomSolidRows = 2) {
    const out = copy(level);
    for (let r = 0; r < topAirRows; r++) out[r].fill(EMPTY);
    for (let r = H - bottomSolidRows; r < H; r++) out[r].fill(SOLID);
    return out;
  }

  function stripSkyWalls(level) {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < W; c++) {
        if (level[r][c] === SOLID || level[r][c] === SLOPE) level[r][c] = EMPTY;
      }
    }
  }

  function removeStrayIslands(level) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < W; c++) {
        if (level[r][c] !== SOLID) continue;
        let neighbor = false;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < H && nc >= 0 && nc < W && walkable(level[nr][nc])) { neighbor = true; break; }
        }
        if (!neighbor) level[r][c] = EMPTY;
      }
    }
  }

  function fillSubfloorPits(level) {
    for (let c = 0; c < W; c++) {
      for (let r = H - 4; r < H - 1; r++) {
        if (level[r][c] !== EMPTY) continue;
        const above = r > 0 ? level[r - 1][c] : EMPTY;
        const below = level[r + 1][c];
        if ((above === SOLID || above === SLOPE) && (below === SOLID || below === SLOPE)) level[r][c] = SOLID;
      }
    }
  }

  function ensureEveryColumnHasFloor(level) {
    for (let c = 0; c < W; c++) {
      let any = false;
      for (let r = 0; r < H; r++) if (walkable(level[r][c])) { any = true; break; }
      if (!any) level[H - 1][c] = SOLID;
    }
  }

  function ensureSpawn(level) {
    let spawn = null;
    for (let c = 0; c < 3 && !spawn; c++) {
      for (let r = 0; r < H; r++) {
        if (isStanding(level, r, c)) { spawn = [r, c]; break; }
      }
    }
    if (!spawn) {
      level[H - 1][0] = SOLID;
      const t = level[H - 2][0];
      if (walkable(t) || t === HAZARD) level[H - 2][0] = EMPTY;
      spawn = [H - 2, 0];
    }
    const r = spawn[0];
    for (let cc = 0; cc < Math.min(4, W); cc++) {
      for (const rr of [r, Math.max(0, r - 1)]) {
        if (level[rr][cc] === HAZARD) level[rr][cc] = EMPTY;
      }
    }
  }

  // Rightmost reachable column, and the lowest reachable row in it.
  function frontier(visited) {
    for (let c = W - 1; c >= 0; c--) {
      for (let r = H - 1; r >= 0; r--) {
        if (visited[r * W + c]) return [r, c];
      }
    }
    return null;
  }

  function placeBridgeStep(level, visited) {
    const f = frontier(visited);
    if (!f) return false;
    const [r, c] = f;
    for (let dc = 1; dc <= MAX_JUMP_WIDTH; dc++) {
      const nc = c + dc;
      if (nc >= W) break;
      for (let dr = 1; dr > -MAX_JUMP_HEIGHT; dr--) {
        const nr = r + dr;
        if (nr < 0 || nr >= H) continue;
        if (level[nr][nc] !== EMPTY) continue;
        if (nr > 0) {
          const above = level[nr - 1][nc];
          if (walkable(above) || above === HAZARD) continue;
        }
        if (!jumpArcClear(level, r, c, nr - 1, nc)) continue;
        level[nr][nc] = PLATFORM;
        return true;
      }
    }
    return false;
  }

  function carveWalls(level, visited) {
    const f = frontier(visited);
    if (!f) return false;
    const nc = f[1] + 1;
    if (nc >= W) return false;
    for (let r = 0; r < H; r++) {
      if (walkable(level[r][nc])) { level[r][nc] = EMPTY; return true; }
    }
    for (let r = 0; r < H; r++) {
      if (level[r][nc] === HAZARD) { level[r][nc] = EMPTY; return true; }
    }
    return false;
  }

  function repair(input, maxIterations = 60) {
    const level = copy(input);
    stripSkyWalls(level);
    removeStrayIslands(level);
    fillSubfloorPits(level);
    ensureEveryColumnHasFloor(level);
    ensureSpawn(level);
    for (let i = 0; i < maxIterations; i++) {
      const visited = reachable(level);
      if (reachesRightEdge(visited)) return level;
      if (!placeBridgeStep(level, visited)) {
        if (!carveWalls(level, visited)) break;
      }
    }
    return level;
  }

  // Small seeded generator so a level can be reproduced from its seed.
  function makeRng(seed) {
    let a = seed >>> 0;
    const uniform = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const normal = () => {
      let u = 0;
      while (u === 0) u = uniform();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uniform());
    };
    return { uniform, normal };
  }

  // Classifier-free guidance, then sample one tile per cell from the softmax.
  // Logits are laid out [class][row][col]; classes are empty, solid, hazard.
  function sampleLevel(condLogits, nullLogits, guidance, rng) {
    const plane = H * W;
    const level = [];
    for (let r = 0; r < H; r++) {
      const row = new Array(W);
      for (let c = 0; c < W; c++) {
        const i = r * W + c;
        const l = [0, 1, 2].map((k) => nullLogits[k * plane + i] + guidance * (condLogits[k * plane + i] - nullLogits[k * plane + i]));
        const top = Math.max(l[0], l[1], l[2]);
        const e = l.map((v) => Math.exp(v - top));
        const sum = e[0] + e[1] + e[2];
        const u = rng.uniform() * sum;
        const k = u < e[0] ? 0 : (u < e[0] + e[1] ? 1 : 2);
        row[c] = k === 2 ? HAZARD : k;
      }
      level.push(row);
    }
    return level;
  }

  const api = { H, W, EMPTY, SOLID, PLATFORM, HAZARD, enforceLayout, repair, isPlayable, makeRng, sampleLevel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TerrainCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
