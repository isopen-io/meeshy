// Mock for react-markdown to avoid ESM issues in Jest
const React = require('react');

function ReactMarkdown({ children }) {
  return React.createElement('div', { 'data-testid': 'react-markdown' }, children);
}

// Support both: import ReactMarkdown from 'react-markdown' and require('react-markdown')
module.exports = ReactMarkdown;
module.exports.__esModule = true;
module.exports.default = ReactMarkdown;
