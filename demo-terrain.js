// TerrainGen demo: samples a level from the conditional VAE decoder in the
// browser, then runs the same repair pass as the original project.
(function () {
  const root = document.getElementById('terrainDemo');
  if (!root || !window.TerrainCore) return;

  const T = window.TerrainCore;
  const canvas = document.getElementById('terrainCanvas');
  const statusLine = document.getElementById('terrainStatus');
  const generateButton = document.getElementById('terrainGenerate');
  const repairToggle = document.getElementById('terrainRepair');
  const difficultyButtons = Array.from(root.querySelectorAll('[data-bucket]'));
  const ctx = canvas.getContext('2d');
  const TILE = 16;
  const COLORS = { 0: '#d6e9f5', 1: '#5b4636', 3: '#f0a202', 6: '#c8321f' };
  const GUIDANCE = 2.0;

  let sessionPromise = null;
  let bucket = 1;
  let current = null;
  let busy = false;

  canvas.width = T.W * TILE;
  canvas.height = T.H * TILE;

  function getSession() {
    if (!sessionPromise) {
      sessionPromise = (async () => {
        statusLine.textContent = 'Loading the model (about 22 MB, first time only).';
        await window.loadDemoRuntime();
        return ort.InferenceSession.create('assets/demo/terrain/decoder.onnx', { executionProviders: ['wasm'] });
      })().catch((error) => { sessionPromise = null; throw error; });
    }
    return sessionPromise;
  }

  function draw() {
    const level = current ? (repairToggle.checked ? current.repaired : current.raw) : null;
    ctx.fillStyle = COLORS[0];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!level) return;
    for (let r = 0; r < T.H; r++) {
      for (let c = 0; c < T.W; c++) {
        const tile = level[r][c];
        if (tile === 0) continue;
        ctx.fillStyle = COLORS[tile] || COLORS[1];
        ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      }
    }
    ctx.strokeStyle = 'rgba(16, 27, 51, 0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < T.W; c++) { ctx.moveTo(c * TILE + 0.5, 0); ctx.lineTo(c * TILE + 0.5, canvas.height); }
    for (let r = 1; r < T.H; r++) { ctx.moveTo(0, r * TILE + 0.5); ctx.lineTo(canvas.width, r * TILE + 0.5); }
    ctx.stroke();
  }

  function describe() {
    if (!current) return;
    const before = current.playableBefore ? 'could already be finished' : 'could not be finished';
    const after = current.playableAfter ? 'it can be finished' : 'it still cannot be finished';
    const edits = current.edits === 1 ? '1 tile changed' : `${current.edits} tiles changed`;
    statusLine.textContent = repairToggle.checked
      ? `As generated, this level ${before}. After repair, ${after} (${edits}).`
      : `Showing the level exactly as the model generated it. It ${before}.`;
  }

  async function generate() {
    if (busy) return;
    busy = true;
    generateButton.disabled = true;
    try {
      const session = await getSession();
      statusLine.textContent = 'Generating.';
      const seed = Math.floor(Math.random() * 4294967296);
      const rng = T.makeRng(seed);
      const z = new Float32Array(64);
      for (let i = 0; i < 64; i++) z[i] = rng.normal();
      const cond = new Float32Array(4); cond[bucket] = 1;
      const none = new Float32Array(4); none[3] = 1;
      const zTensor = new ort.Tensor('float32', z, [1, 64]);
      const withCond = await session.run({ z: zTensor, cond: new ort.Tensor('float32', cond, [1, 4]) });
      const without = await session.run({ z: zTensor, cond: new ort.Tensor('float32', none, [1, 4]) });
      const raw = T.enforceLayout(T.sampleLevel(withCond.logits.data, without.logits.data, GUIDANCE, rng));
      const repaired = T.repair(raw);
      let edits = 0;
      for (let r = 0; r < T.H; r++) for (let c = 0; c < T.W; c++) if (raw[r][c] !== repaired[r][c]) edits++;
      current = { raw, repaired, edits, playableBefore: T.isPlayable(raw), playableAfter: T.isPlayable(repaired) };
      draw();
      describe();
    } catch (error) {
      statusLine.textContent = `The demo could not run: ${error.message} Reload the page and try again.`;
    } finally {
      busy = false;
      generateButton.disabled = false;
    }
  }

  difficultyButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.bucket) === bucket));
    button.addEventListener('click', () => {
      bucket = Number(button.dataset.bucket);
      difficultyButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      generate();
    });
  });
  generateButton.addEventListener('click', generate);
  repairToggle.addEventListener('change', () => { draw(); describe(); });
  draw();
})();
