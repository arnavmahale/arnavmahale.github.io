// Fresh or Rotten demo: runs the fine-tuned EfficientNet-B0 in the browser
// with ONNX Runtime Web. The runtime and model load on first use.
(function () {
  const root = document.getElementById('freshDemo');
  if (!root) return;

  const result = document.getElementById('freshResult');
  const fileInput = document.getElementById('freshFile');
  const exampleButtons = Array.from(root.querySelectorAll('.demo-examples button'));
  const LABELS = ['Fresh', 'Rotten'];
  const MEAN = [0.485, 0.456, 0.406];
  const STD = [0.229, 0.224, 0.225];
  const SIZE = 224;

  let sessionPromise = null;
  let runId = 0;

  function show(html, label) {
    result.innerHTML = html;
    if (label) result.dataset.label = label; else delete result.dataset.label;
  }

  function getSession() {
    if (!sessionPromise) {
      sessionPromise = (async () => {
        show('<p class="demo-status">Loading the model (about 28 MB, first time only).</p>');
        await window.loadDemoRuntime();
        return ort.InferenceSession.create('assets/demo/fresh/model.onnx', { executionProviders: ['wasm'] });
      })().catch((error) => { sessionPromise = null; throw error; });
    }
    return sessionPromise;
  }

  function toTensor(image) {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, SIZE, SIZE);
    const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
    const plane = SIZE * SIZE;
    const input = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
      for (let c = 0; c < 3; c++) {
        input[c * plane + i] = (data[i * 4 + c] / 255 - MEAN[c]) / STD[c];
      }
    }
    return new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]);
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('That file could not be read as an image.'));
      image.src = src;
    });
  }

  async function classify(src) {
    const id = ++runId;
    try {
      const session = await getSession();
      if (id !== runId) return;
      show('<p class="demo-status">Classifying.</p>');
      const image = await loadImage(src);
      const tensor = toTensor(image);
      const started = performance.now();
      const output = await session.run({ input: tensor });
      const elapsed = performance.now() - started;
      if (id !== runId) return;

      const logits = output.logits.data;
      const top = Math.max(logits[0], logits[1]);
      const exps = [Math.exp(logits[0] - top), Math.exp(logits[1] - top)];
      const sum = exps[0] + exps[1];
      const probs = exps.map((e) => e / sum);
      const best = probs[0] >= probs[1] ? 0 : 1;
      const percent = (probs[best] * 100).toFixed(1);

      show(
        `<p class="demo-verdict">${LABELS[best]}</p>` +
        `<p>${percent}% confident</p>` +
        `<div class="demo-bar"><span style="width:${percent}%"></span></div>` +
        `<p class="demo-fine">Fresh ${(probs[0] * 100).toFixed(1)}%, rotten ${(probs[1] * 100).toFixed(1)}%. Ran in ${Math.round(elapsed)} ms on your device.</p>`,
        LABELS[best]
      );
    } catch (error) {
      if (id !== runId) return;
      show(`<p class="demo-status">The demo could not run: ${error.message} Reload the page and try again.</p>`);
    }
  }

  exampleButtons.forEach((button) => {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      exampleButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      classify(button.dataset.src);
    });
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    exampleButtons.forEach((b) => b.setAttribute('aria-pressed', 'false'));
    const url = URL.createObjectURL(file);
    classify(url).finally(() => URL.revokeObjectURL(url));
  });
})();
