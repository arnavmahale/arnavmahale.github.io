// Shared loader for ONNX Runtime Web, used by every in-browser demo.
// The runtime is fetched once, the first time any demo is used.
(function () {
  let runtimePromise = null;

  window.loadDemoRuntime = function () {
    if (!runtimePromise) {
      runtimePromise = new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = 'vendor/ort/ort.wasm.min.js';
        el.onload = () => {
          ort.env.wasm.wasmPaths = new URL('vendor/ort/', document.baseURI).href;
          ort.env.wasm.numThreads = 1;
          resolve();
        };
        el.onerror = () => reject(new Error('The model runtime could not be downloaded.'));
        document.head.appendChild(el);
      }).catch((error) => { runtimePromise = null; throw error; });
    }
    return runtimePromise;
  };
})();
