class AudioRecorderProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    // Default target sample rate for speech models like NeuDecide is 16,000 Hz
    this.targetSampleRate = options.processorOptions?.targetSampleRate || 16000;
    this.sourceSampleRate = currentFrame === 0 ? sampleRate : 48000; // Native hardware rate
    
    // Send batches of 1600 samples (100ms chunks at 16kHz)
    this.batchSize = options.processorOptions?.batchSize || 1600;
    this.buffer = new Float32Array(this.batchSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    // Use channel 0 (mono input)
    const channelData = input[0];
    if (!channelData || channelData.length === 0) return true;

    const resampleRatio = sampleRate / this.targetSampleRate;

    // Linear interpolation downsampling
    for (let i = 0; i < channelData.length; i += resampleRatio) {
      const idx = Math.floor(i);
      const nextIdx = Math.min(idx + 1, channelData.length - 1);
      const fraction = i - idx;

      // Interpolated sample
      const sample = channelData[idx] * (1 - fraction) + channelData[nextIdx] * fraction;

      this.buffer[this.bufferIndex++] = sample;

      // When the chunk is filled, emit via zero-copy transfer
      if (this.bufferIndex >= this.batchSize) {
        const chunk = new Float32Array(this.buffer);
        
        // Zero-copy transfer of the underlying ArrayBuffer
        this.port.postMessage(
          { event: 'chunk', audioData: chunk },
          [chunk.buffer]
        );

        this.buffer = new Float32Array(this.batchSize);
        this.bufferIndex = 0;
      }
    }

    return true; // Keep processor alive
  }
}

registerProcessor('audio-recorder-processor', AudioRecorderProcessor);