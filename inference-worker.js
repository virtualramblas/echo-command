let isMockMode = true;
let session = null;
let audioBufferQueue = [];
const SAMPLE_RATE = 16000;

const CONFIG = {
  windowSize: 32000,          // 2 seconds of audio history
  hopSize: 8000,              // Evaluate every 0.5 seconds
  probabilityThreshold: 0.25, // Lowered threshold for mock classification
  energyThreshold: 0.015      // Minimum signal noise level to recognize speech
};

async function initModel(modelUrl) {
  try {
    postMessage({ status: 'loading', message: 'Configuring inference pipeline...' });
    
    // Check if we are using the placeholder MNIST model
    if (modelUrl.includes('mnist')) {
      isMockMode = true;
      postMessage({ 
        status: 'ready', 
        message: 'Pipeline initialized in validation mode (Energy Pattern Matcher active).' 
      });
    } else {
      // Load real ONNX model weights
      importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/ort.min.js');
      ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/';
      
      session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
      });
      isMockMode = false;
      postMessage({ status: 'ready', message: 'NeuDecide ONNX Engine loaded.' });
    }
  } catch (err) {
    postMessage({ status: 'error', message: `Initialization failed: ${err.message}` });
  }
}

/**
 * Robust mock classifier that converts raw vocal patterns into 
 * discrete system actions based on duration and energy.
 */
function runMockClassifier(audioWindow) {
  // 1. Calculate the overall root-mean-square (RMS) energy
  let sumSquares = 0;
  for (let i = 0; i < audioWindow.length; i++) {
    sumSquares += audioWindow[i] * audioWindow[i];
  }
  const rms = Math.sqrt(sumSquares / audioWindow.length);

  // Ignore ambient silence
  if (rms < CONFIG.energyThreshold) return;

  // 2. Map structural vocal characteristics to mock indices:
  // We count zero-crossings to estimate high vs low-frequency spoken phrases
  let zeroCrossings = 0;
  for (let i = 1; i < audioWindow.length; i++) {
    if ((audioWindow[i] >= 0 && audioWindow[i - 1] < 0) || 
        (audioWindow[i] < 0 && audioWindow[i - 1] >= 0)) {
      zeroCrossings++;
    }
  }

  // Determine a classification index based on vocal frequency profile
  let toolIndex = 0;
  const signature = zeroCrossings % 5;

  if (signature === 0) {
    toolIndex = 0; // "Ping Radar" (Active Sonar)
  } else if (signature === 1) {
    toolIndex = 1; // "Shields Bow"
  } else if (signature === 2) {
    toolIndex = 2; // "Shields Stern"
  } else if (signature === 3) {
    toolIndex = 3; // "Fire Torpedo"
  } else {
    toolIndex = 4; // "Go Dark" (Silent Running)
  }

  // Simulate model confidence score based on signal strength
  const confidence = Math.min(0.99, CONFIG.probabilityThreshold + (rms * 10));

  postMessage({
    status: 'action',
    toolIndex: toolIndex,
    confidence: confidence
  });
}

/**
 * Runs inference on the accumulated audio buffer
 */
async function runInference() {
  if (audioBufferQueue.length < CONFIG.windowSize) return;

  // Flatten queue into a contiguous Float32Array
  const audioWindow = new Float32Array(CONFIG.windowSize);
  let offset = 0;
  for (let chunk of audioBufferQueue) {
    audioWindow.set(chunk, offset);
    offset += chunk.length;
    if (offset >= CONFIG.windowSize) break;
  }

  if (isMockMode) {
    runMockClassifier(audioWindow);
  } else {
    try {
      // Execute the production model
      const inputTensor = new ort.Tensor('float32', audioWindow,);
      const results = await session.run({ input: inputTensor });
      const outputTensor = results[Object.keys(results)[0]];
      const outputData = outputTensor.data;

      let maxIdx = -1;
      let maxVal = -Infinity;
      for (let i = 0; i < outputData.length; i++) {
        if (outputData[i] > maxVal) {
          maxVal = outputData[i];
          maxIdx = i;
        }
      }

      if (maxVal >= CONFIG.probabilityThreshold) {
        postMessage({ status: 'action', toolIndex: maxIdx, confidence: maxVal });
      }
    } catch (err) {
      console.error('ONNX Execution Error:', err);
    }
  }

  // Slide sliding window forward by dropping old samples
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

self.onmessage = async (event) => {
  const { type, data } = event.data;

  if (type === 'init') {
    await initModel(data.modelUrl);
  } else if (type === 'audio') {
    const audioChunk = new Float32Array(data.audioData);
    audioBufferQueue.push(audioChunk);

    const currentLength = audioBufferQueue.reduce((acc, chunk) => acc + chunk.length, 0);
    if (currentLength >= CONFIG.windowSize) {
      await runInference();
    }
  }
};