export const KIT_GLASS_CLASSES = ['glass', 'glass-prominent', 'glass-card', 'glass-accent', 'glass-call', 'glass-call-prominent'];

const ROUND_CLASSES = ['rounded-full', 'glass-call-disc'];
const LITERAL = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/gs;

const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\w\\])\/\/[^\n]*/g, '$1');

const tokensOf = (literal) => literal.split(/\s+/).map((token) => token.replace(/^[^\w-]+|[^\w-]+$/g, ''));

const measureSource = (text) => {
  const literals = [...stripComments(text).matchAll(LITERAL)].map((match) => tokensOf(match[2]));
  const glassLiterals = literals.filter((tokens) => tokens.some((token) => KIT_GLASS_CLASSES.includes(token)));
  return {
    calls: glassLiterals.reduce((sum, tokens) => sum + tokens.filter((token) => KIT_GLASS_CLASSES.includes(token)).length, 0),
    rounds: glassLiterals.filter((tokens) => tokens.some((token) => ROUND_CLASSES.includes(token))).length,
  };
};

export const isOutsideKit = (path) => path.endsWith('.tsx') && !/\.test\.tsx$/.test(path) && !path.startsWith('src/components/kit/');

export const measureKitGlass = (sources) => {
  const perFile = sources.filter((source) => isOutsideKit(source.path)).map((source) => measureSource(source.text));
  return {
    calls: perFile.reduce((sum, file) => sum + file.calls, 0),
    files: perFile.filter((file) => file.calls > 0).length,
    rounds: perFile.reduce((sum, file) => sum + file.rounds, 0),
  };
};

const LABELS = {
  calls: 'classes de verre hors du kit',
  files: 'fichiers qui portent du verre hors du kit',
  rounds: 'verres ronds hors du kit',
};

export const ratchetProblems = ({ measured, ceiling }) =>
  Object.keys(LABELS).flatMap((key) => {
    if (measured[key] > ceiling[key]) return [`${LABELS[key]} : ${measured[key]} pour un plafond de ${ceiling[key]} — passe par le kit`];
    if (measured[key] < ceiling[key]) return [`${LABELS[key]} : ${measured[key]} pour un plafond de ${ceiling[key]} — abaisse le plafond dans ce commit`];
    return [];
  });
