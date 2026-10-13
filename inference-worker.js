// Import the official ONNX Runtime Web library from CDN
importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/ort.min.js');

// Set up WASM paths to point to CDN resources for easy loading
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/';

let session = null;
let audioBufferQueue = [];
const SAMPLE_RATE = 16000;
// NeuDecide typically expects a ~1 to 2-second buffer window to classify a command
const CONFIG = {
  windowSize: 32000, // 2 seconds of audio history at 16kHz
  hopSize: 8000,     // Evaluate every 0.5 seconds
  probabilityThreshold: 0.85 // Execution confidence threshold
};

/**
 * Initializes the ONNX inference session
 */
async function initModel(modelUrl) {
  try {
    postMessage({ status: 'loading', message: 'Downloading NeuDecide model (43MB)...' });
    
    // Configure session to use WASM threads for parallel processing
    const options = {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all'
    };

    session = await ort.InferenceSession.create(modelUrl, options);
    
    postMessage({ status: 'ready', message: 'NeuDecide ONNX model loaded successfully.' });
  } catch (err) {
    postMessage({ status: 'error', message: `Model init failed: ${err.message}` });
  }
}

/**
 * Runs inference on the accumulated audio buffer
 */
async function runInference() {
  if (!session || audioBufferQueue.length < CONFIG.windowSize) return;

  // Flatten queue into a contiguous Float32Array window
  const audioWindow = new Float32Array(CONFIG.windowSize);
  let offset = 0;
  for (let chunk of audioBufferQueue) {
    audioWindow.set(chunk, offset);
    offset += chunk.length;
    if (offset >= CONFIG.windowSize) break;
  }

  try {
    // 1. Wrap raw floats into an ONNX Tensor
    const inputTensor = new ort.Tensor('float32', audioWindow, [1, CONFIG.windowSize]);

    // 2. Execute model
    const feeds = { input: inputTensor };
    const results = await session.run(feeds);

    // 3. Process outputs (Assuming NeuDecide outputs logits/probabilities and tool IDs)
    const outputTensor = results[Object.keys(results)[0]]; // Get primary output tensor
    const outputData = outputTensor.data;

    // 4. Find classification with highest confidence
    let maxIdx = -1;
    let maxVal = -Infinity;
    for (let i = 0; i < outputData.length; i++) {
      if (outputData[i] > maxVal) {
        maxVal = outputData[i];
        maxIdx = i;
      }
    }

    // 5. If confidence surpasses threshold, dispatch action
    if (maxVal >= CONFIG.probabilityThreshold) {
      postMessage({
        status: 'action',
        toolIndex: maxIdx,
        confidence: maxVal
      });
    }

  } catch (err) {
    console.error('Inference execution error:', err);
  }

  // Slide sliding window forward by dropping the oldest hopSize of samples
  let samplesDropped = 0;
  while (audioBufferQueue.length > 0 && samplesDropped < CONFIG.hopSize) {
    const oldestChunk = audioBufferQueue[0];
    if (samplesDropped + oldestChunk.length <= CONFIG.hopSize) {
      samplesDropped += oldestChunk.length;
      audioBufferQueue.shift();
    } else {
      const splitIdx = CONFIG.hopSize - samplesDropped;
      audioBufferQueue[0] = oldestChunk.subarray(splitIdx);
      break;
    }
  }
}

// Global thread message router
self.onmessage = async (event) => {
  const { type, data } = event.data;

  if (type === 'init') {
    await initModel(data.modelUrl);
  } else if (type === 'audio') {
    const audioChunk = new Float32Array(data.audioData);
    audioBufferQueue.push(audioChunk);

    // If accumulated buffer is large enough, trigger sliding-window classification
    const currentLength = audioBufferQueue.reduce((acc, chunk) => acc + chunk.length, 0);
    if (currentLength >= CONFIG.windowSize) {
      await runInference();
    }
  }
};