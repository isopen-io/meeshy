/**
 * Mock for next/font/google
 * Provides mock font constructors that return objects with the correct variable names
 */

const createFontMock = (fontName, defaultVariable) => {
  return function(options = {}) {
    return {
      className: `__${fontName}_mock`,
      style: { fontFamily: fontName },
      variable: options.variable || defaultVariable,
    };
  };
};

module.exports = {
  Inter: createFontMock('Inter', '--font-inter'),
  Nunito: createFontMock('Nunito', '--font-nunito'),
  Poppins: createFontMock('Poppins', '--font-poppins'),
  Open_Sans: createFontMock('Open_Sans', '--font-open-sans'),
  Lato: createFontMock('Lato', '--font-lato'),
  Comic_Neue: createFontMock('Comic_Neue', '--font-comic-neue'),
  Lexend: createFontMock('Lexend', '--font-lexend'),
  Roboto: createFontMock('Roboto', '--font-roboto'),
};
