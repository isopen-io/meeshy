// Mock for @ffmpeg/ffmpeg to avoid ESM issues in Jest
class FFmpeg {
  constructor() {
    this.loaded = false;
  }

  async load() {
    this.loaded = true;
  }

  isLoaded() {
    return this.loaded;
  }

  async writeFile(name, data) {
    // Mock write file
  }

  async readFile(name) {
    // Mock read file - return empty Uint8Array
    return new Uint8Array();
  }

  async exec(args) {
    // Mock FFmpeg exec method (not process exec!)
  }

  on(event, callback) {
    // Mock event listener
  }

  off(event, callback) {
    // Mock event listener removal
  }
}

module.exports = {
  FFmpeg,
  fetchFile: jest.fn((file) => Promise.resolve(new Uint8Array())),
};
