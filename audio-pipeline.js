export class AudioPipeline {
  constructor(options = {}) {
    this.targetSampleRate = options.targetSampleRate || 16000;
    this.batchSize = options.batchSize || 1600; // 100ms per batch
    this.audioContext = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.workletNode = null;
    this.onChunkCallback = null;
    this.isRunning = false;
  }

  /**
   * Initializes the microphone and registers the AudioWorklet
   * @param {string} workletPath Path to audio-recorder-worklet.js
   * @param {Function} onChunk Callback receiving Float32Array chunks (16kHz PCM)
   */
  async start(workletPath, onChunk) {
    if (this.isRunning) return;
    this.onChunkCallback = onChunk;

    // 1. Request microphone stream with speech-tailored constraints
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });

    // 2. Initialize AudioContext
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // 3. Register custom worklet script
    await this.audioContext.audioWorklet.addModule(workletPath);

    // 4. Create pipeline nodes
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-recorder-processor', {
      processorOptions: {
        targetSampleRate: this.targetSampleRate,
        batchSize: this.batchSize
      }
    });

    // 5. Pipe incoming audio chunks to callback
    this.workletNode.port.onmessage = (event) => {
      if (event.data.event === 'chunk' && this.onChunkCallback) {
        this.onChunkCallback(event.data.audioData);
      }
    };

    // Connect source to worklet (do NOT connect to audioContext.destination to avoid mic feedback)
    this.sourceNode.connect(this.workletNode);
    this.isRunning = true;
  }

  /**
   * Stops the stream and releases microphone resources
   */
  async stop() {
    if (!this.isRunning) return;

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode.port.onmessage = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
    }

    this.isRunning = false;
  }
}