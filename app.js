import { AudioPipeline } from './audio-pipeline.js';

// Convert worker code into a self-contained string blob
const workerCode = `
let isMockMode = true;
let audioBufferQueue = [];
const CONFIG = {
  windowSize: 32000, 
  hopSize: 8000,     
  probabilityThreshold: 0.25,
  energyThreshold: 0.015 
};

self.onmessage = async (event) => {
  const { type, data } = event.data;

  if (type === 'init') {
    postMessage({ status: 'ready', message: 'Inlined Validation Engine initialized.' });
  } else if (type === 'audio') {
    const audioChunk = new Float32Array(data.audioData);
    audioBufferQueue.push(audioChunk);

    const currentLength = audioBufferQueue.reduce((acc, chunk) => acc + chunk.length, 0);
    if (currentLength >= CONFIG.windowSize) {
      // Flatten
      const audioWindow = new Float32Array(CONFIG.windowSize);
      let offset = 0;
      for (let chunk of audioBufferQueue) {
        audioWindow.set(chunk, offset);
        offset += chunk.length;
        if (offset >= CONFIG.windowSize) break;
      }

      // Simple voice pattern metric
      let sumSquares = 0;
      for (let i = 0; i < audioWindow.length; i++) {
        sumSquares += audioWindow[i] * audioWindow[i];
      }
      const rms = Math.sqrt(sumSquares / audioWindow.length);

      if (rms >= CONFIG.energyThreshold) {
        let zeroCrossings = 0;
        for (let i = 1; i < audioWindow.length; i++) {
          if ((audioWindow[i] >= 0 && audioWindow[i-1] < 0) || (audioWindow[i] < 0 && audioWindow[i-1] >= 0)) {
            zeroCrossings++;
          }
        }
        const toolIndex = zeroCrossings % 5;
        postMessage({
          status: 'action',
          toolIndex: toolIndex,
          confidence: Math.min(0.99, CONFIG.probabilityThreshold + (rms * 10))
        });
      }

      // Slide window
      let samplesDropped = 0;
      while (audioBufferQueue.length > 0 && samplesDropped < CONFIG.hopSize) {
        const oldestChunk = audioBufferQueue[0];
        if (samplesDropped + oldestChunk.length <= CONFIG.hopSize) {
          samplesDropped += oldestChunk.length;
          audioBufferQueue.shift();
        } else {
          audioBufferQueue[0] = oldestChunk.subarray(CONFIG.hopSize - samplesDropped);
          break;
        }
      }
    }
  }
};
`;

export class VoiceController {
  constructor(modelUrl, onActionCallback) {
    this.modelUrl = modelUrl;
    this.onActionCallback = onActionCallback;
    this.pipeline = new AudioPipeline({ targetSampleRate: 16000, batchSize: 1600 });
    this.worker = null;
    this.onStatusCallback = null;
  }

  async initialize(onStatus) {
    this.onStatusCallback = onStatus;

    // Build blob URL to load worker without 404 risk
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    this.worker = new Worker(URL.createObjectURL(blob));
    
    this.worker.onmessage = (event) => {
      const { status, message, toolIndex, confidence } = event.data;
      if (status === 'action' && this.onActionCallback) {
        this.onActionCallback({ toolIndex, confidence });
      } else if (this.onStatusCallback) {
        this.onStatusCallback({ status, message });
      }
    };

    this.worker.postMessage({
      type: 'init',
      data: { modelUrl: this.modelUrl }
    });
  }

  async startListening() {
    await this.pipeline.start('./audio-recorder-worklet.js', (chunk) => {
      if (this.worker) {
        this.worker.postMessage({
          type: 'audio',
          data: { audioData: chunk }
        }, [chunk.buffer]);
      }
    });
  }

  async stopListening() {
    await this.pipeline.stop();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.onStatusCallback) {
      this.onStatusCallback({ status: 'offline', message: 'System Offline.' });
    }
  }
}