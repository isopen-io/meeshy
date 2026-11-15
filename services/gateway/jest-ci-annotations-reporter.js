const { relative } = require('path');
const { stripVTControlCharacters } = require('util');

const MAX_MESSAGE = 4000;

const escapeData = (text) =>
  text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

const escapeProperty = (text) => escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');

const annotation = (title, message) =>
  `::error title=${escapeProperty(title)}::${escapeData(
    stripVTControlCharacters(message).slice(0, MAX_MESSAGE)
  )}`;

const suiteAnnotations = (suite, rootDir) => {
  const file = relative(rootDir, suite.testFilePath);
  if (suite.testExecError) {
    return [annotation(`${file} › Test suite failed to run`, suite.testExecError.message ?? '')];
  }
  return (suite.testResults ?? [])
    .filter((test) => test.status === 'failed')
    .map((test) =>
      annotation(
        [file, ...test.ancestorTitles, test.title].join(' › '),
        test.failureMessages.join('\n')
      )
    );
};

const annotationsFor = (results, rootDir) =>
  (results.testResults ?? []).flatMap((suite) => suiteAnnotations(suite, rootDir));

class JestCiAnnotationsReporter {
  constructor(globalConfig) {
    this.rootDir = globalConfig.rootDir;
  }

  onRunComplete(_contexts, results) {
    if (process.env.GITHUB_ACTIONS !== 'true') return;
    annotationsFor(results, this.rootDir).forEach((line) => process.stdout.write(`${line}\n`));
  }
}

module.exports = JestCiAnnotationsReporter;
module.exports.annotationsFor = annotationsFor;
