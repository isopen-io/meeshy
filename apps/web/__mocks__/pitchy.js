// Mock for pitchy library to avoid ESM issues in Jest
class PitchDetector {
  constructor(config = {}) {
    this.sampleRate = config.sampleRate || 44100;
    this.clarityThreshold = config.clarityThreshold || 0.9;
  }

  findPitch(buffer, sampleRate) {
    // Mock pitch detection - return a fixed pitch
    return [440, 0.95]; // [frequency in Hz, clarity]
  }

  // Real pitchy exposes this as the constructor for Float32Array input
  // (PitchDetector.forFloat32Array(inputLength)) — VoiceCoderProcessor uses
  // it to size the detector to the analyser's fftSize.
  static forFloat32Array(inputLength) {
    return new PitchDetector({ sampleRate: 44100 });
  }
}

module.exports = {
  PitchDetector,
  default: PitchDetector,
};
