// Mock for mermaid to avoid ESM issues in Jest
const mermaid = {
  initialize: jest.fn(),
  init: jest.fn(),
  render: jest.fn(() => Promise.resolve({ svg: '<svg></svg>' })),
  parse: jest.fn(() => Promise.resolve(true)),
  parseError: jest.fn(),
  mermaidAPI: {
    initialize: jest.fn(),
    render: jest.fn(),
  },
};

module.exports = mermaid;
module.exports.default = mermaid;
