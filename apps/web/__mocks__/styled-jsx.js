/**
 * Mock for styled-jsx/style to avoid module resolution issues in Jest
 */
const React = require('react');

function MockStyle({ children }) {
  return null;
}

module.exports = MockStyle;
module.exports.default = MockStyle;
