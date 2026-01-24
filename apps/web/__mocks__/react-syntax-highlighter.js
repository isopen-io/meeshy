// Mock for react-syntax-highlighter to avoid ESM issues
const React = require('react');

const Prism = ({ children, language, style, ...props }) => {
  return React.createElement('pre', props, 
    React.createElement('code', { className: `language-${language}` }, children)
  );
};

module.exports = {
  Prism,
  Light: Prism,
  PrismLight: Prism,
  default: Prism,
};
