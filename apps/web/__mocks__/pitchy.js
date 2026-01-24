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
}

module.exports = {
  PitchDetector,
  default: PitchDetector,
};
