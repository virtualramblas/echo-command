import { AudioPipeline } from './audio-pipeline.js';

export class VoiceController {
  constructor(modelUrl, onActionCallback) {
    this.modelUrl = modelUrl;
    this.onActionCallback = onActionCallback;
    this.pipeline = new AudioPipeline({ targetSampleRate: 16000, batchSize: 1600 });
    this.worker = null;
    this.onStatusCallback = null;
  }

  /**
   * Spawns worker and connects pipeline
   */
  async initialize(onStatus) {
    this.onStatusCallback = onStatus;

    // 1. Initialize Web Worker
    this.worker = new Worker('./inference-worker.js');
    
    this.worker.onmessage = (event) => {
      const { status, message, toolIndex, confidence } = event.data;
      
      if (status === 'action' && this.onActionCallback) {
        this.onActionCallback({ toolIndex, confidence });
      } else if (this.onStatusCallback) {
        this.onStatusCallback({ status, message });
      }
    };

    // Send init command to worker to load Model Weights
    this.worker.postMessage({
      type: 'init',
      data: { modelUrl: this.modelUrl }
    });
  }

  /**
   * Starts listening to audio stream and routing buffers to background worker
   */
  async startListening() {
    await this.pipeline.start('./audio-recorder-worklet.js', (chunk) => {
      if (this.worker) {
        // Zero-copy transfer of the Float32Array Buffer to the background thread
        this.worker.postMessage({
          type: 'audio',
          data: { audioData: chunk }
        }, [chunk.buffer]);
      }
    });
  }

  /**
   * Stops pipelines and terminates background thread resources
   */
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