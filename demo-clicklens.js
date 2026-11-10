// ClickLens demo: ranks thumbnails by predicted click-through class and draws
// a Grad-CAM heatmap for each. The exported model computes Grad-CAM inside the
// graph, so one forward pass returns both the probabilities and the heatmap.
(function () {
  const root = document.getElementById('clickDemo');
  if (!root) return;

  const results = document.getElementById('clickResults');
  const fileInput = document.getElementById('clickFiles');
  const exampleButton = document.getElementById('clickExamples');
  const heatToggle = document.getElementById('clickHeat');
  const EXAMPLES = [
    'assets/demo/clicklens/example-1.jpg',
    'assets/demo/clicklens/example-2.jpg',
    'assets/demo/clicklens/example-3.jpg',
  ];
  const MEAN = [0.485, 0.456, 0.406];
  const STD = [0.229, 0.224, 0.225];
  const SIZE = 224;
  const VIEW = 320;

  let sessionPromise = null;
  let runId = 0;

  function status(text) {
    results.innerHTML = `<p class="demo-status">${text}</p>`;
  }

  function getSession() {
    if (!sessionPromise) {
      sessionPromise = (async () => {
        status('Loading the model (about 30 MB, first time only).');
        await window.loadDemoRuntime();
        return ort.InferenceSession.create('assets/demo/clicklens/model.onnx', { executionProviders: ['wasm'] });
      })().catch((error) => { sessionPromise = null; throw error; });
    }
    return sessionPromise;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('One of the files could not be read as an image.'));
      image.src = src;
    });
  }

  // Same preprocessing as training: resize the short side to 256, then take the
  // central 224 square. Returns the square crop too, so the heatmap lines up.
  function centerSquare(image) {
    const short = Math.min(image.naturalWidth, image.naturalHeight);
    const side = short * (SIZE / 256);
    return {
      sx: (image.naturalWidth - side) / 2,
      sy: (image.naturalHeight - side) / 2,
      side,
    };
  }

  function toTensor(image, crop) {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, crop.sx, crop.sy, crop.side, crop.side, 0, 0, SIZE, SIZE);
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

  // Blue to red ramp for the heatmap.
  function heatColor(v) {
    const r = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * v - 3)));
    const g = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * v - 2)));
    const b = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * v - 1)));
    return [r * 255, g * 255, b * 255];
  }

  function drawCard(canvas, image, crop, cam, showHeat) {
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, crop.sx, crop.sy, crop.side, crop.side, 0, 0, VIEW, VIEW);
    if (!showHeat) return;

    const small = document.createElement('canvas');
    small.width = 7;
    small.height = 7;
    const sctx = small.getContext('2d');
    const pixels = sctx.createImageData(7, 7);
    for (let i = 0; i < 49; i++) {
      const [r, g, b] = heatColor(cam[i]);
      pixels.data[i * 4] = r;
      pixels.data[i * 4 + 1] = g;
      pixels.data[i * 4 + 2] = b;
      pixels.data[i * 4 + 3] = 255;
    }
    sctx.putImageData(pixels, 0, 0);
    ctx.globalAlpha = 0.42;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, VIEW, VIEW);
    ctx.globalAlpha = 1;
  }

  let lastItems = [];

  function render() {
    results.innerHTML = '';
    lastItems.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'click-card';
      const canvas = document.createElement('canvas');
      canvas.width = VIEW;
      canvas.height = VIEW;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `Thumbnail ranked ${index + 1}`);
      drawCard(canvas, item.image, item.crop, item.cam, heatToggle.checked);
      const high = (item.probs[2] * 100).toFixed(1);
      const text = document.createElement('div');
      text.innerHTML =
        `<p class="click-rank">${index === 0 ? 'Best pick' : 'Rank ' + (index + 1)}</p>` +
        `<p>${high}% chance of a high click-through rate</p>` +
        `<div class="demo-bar"><span style="width:${high}%"></span></div>` +
        `<p class="demo-fine">Low ${(item.probs[0] * 100).toFixed(1)}%, medium ${(item.probs[1] * 100).toFixed(1)}%, high ${high}%</p>`;
      card.appendChild(canvas);
      card.appendChild(text);
      results.appendChild(card);
    });
  }

  async function analyze(sources) {
    const id = ++runId;
    try {
      const session = await getSession();
      if (id !== runId) return;
      status('Scoring the thumbnails.');
      const items = [];
      for (const src of sources) {
        const image = await loadImage(src);
        const crop = centerSquare(image);
        const output = await session.run({ input: toTensor(image, crop) });
        items.push({ image, crop, probs: Array.from(output.probs.data), cam: Array.from(output.cam.data) });
      }
      if (id !== runId) return;
      items.sort((a, b) => b.probs[2] - a.probs[2]);
      lastItems = items;
      render();
    } catch (error) {
      if (id !== runId) return;
      status(`The demo could not run: ${error.message} Reload the page and try again.`);
    }
  }

  exampleButton.addEventListener('click', () => analyze(EXAMPLES));
  heatToggle.addEventListener('change', () => { if (lastItems.length) render(); });
  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files || []).slice(0, 4);
    if (files.length < 2) {
      status('Choose between two and four thumbnail images to compare.');
      return;
    }
    analyze(files.map((file) => URL.createObjectURL(file)));
  });
})();
