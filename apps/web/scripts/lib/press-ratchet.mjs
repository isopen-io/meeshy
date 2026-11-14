export const PRESS_MARKS = [
  'active:',
  'glass-touch',
  'kit-btn',
  'btn-',
  'BUTTON.',
  'CHROME_ACTION_HIT_CLASS',
  'chrome-action',
  'game-press',
  'PRESS',
  'floating-disc',
  'glass-call-disc',
  'data-press-host',
];

const TAGS = ['button', 'Link'];
const DURATION = /(?<![\w-])duration-\d+(?![\w-])/g;

const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\w\\])\/\/[^\n]*/g, '$1');

export const isMeasured = (path) =>
  path.endsWith('.tsx') && !path.endsWith('.test.tsx') && !path.startsWith('src/components/kit/') && !path.startsWith('src/routes/kit');

const openingTagEnd = (text, from) => {
  let depth = 0;
  let quote = null;
  for (let index = from; index < text.length; index += 1) {
    const char = text[index];
    if (quote !== null) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (depth > 0 && (char === '"' || char === "'" || char === '`')) quote = char;
    else if (depth === 0 && (char === '"' || char === "'")) quote = char;
    else if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (char === '>' && depth === 0) return index + 1;
  }
  return text.length;
};

const closingTagEnd = (text, tag, from) => {
  const pattern = new RegExp(`<${tag}(?=[\\s>/])|</${tag}\\s*>`, 'g');
  pattern.lastIndex = from;
  let depth = 1;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    if (match[0].startsWith('</')) depth -= 1;
    else if (!text.slice(match.index, openingTagEnd(text, match.index)).endsWith('/>')) depth += 1;
    if (depth === 0) return pattern.lastIndex;
  }
  return text.length;
};

const elementsOf = (text, tag) =>
  [...text.matchAll(new RegExp(`<${tag}(?=[\\s>/])`, 'g'))].map((match) => {
    const open = openingTagEnd(text, match.index);
    const opening = text.slice(match.index, open);
    return opening.endsWith('/>') ? opening : text.slice(match.index, closingTagEnd(text, tag, open));
  });

const hasPressMark = (element) => PRESS_MARKS.some((mark) => element.includes(mark));

const measureSource = (text) => {
  const code = stripComments(text);
  const elements = TAGS.flatMap((tag) => elementsOf(code, tag));
  return {
    elements: elements.length,
    mute: elements.filter((element) => !hasPressMark(element)).length,
    durations: [...code.matchAll(DURATION)].length,
  };
};

export const measurePress = (sources) => {
  const perFile = sources.filter((source) => isMeasured(source.path)).map((source) => measureSource(source.text));
  const sum = (key) => perFile.reduce((total, file) => total + file[key], 0);
  return {
    elements: sum('elements'),
    mute: sum('mute'),
    durations: sum('durations'),
    durationFiles: perFile.filter((file) => file.durations > 0).length,
  };
};

const LABELS = {
  mute: 'balises <button> et <Link> sans réponse d’appui reconnue',
  durations: 'durées Tailwind littérales duration-N',
};

export const pressRatchetProblems = ({ measured, ceiling }) =>
  Object.keys(LABELS).flatMap((key) => {
    if (measured[key] > ceiling[key]) return [`${LABELS[key]} : ${measured[key]} pour un plafond de ${ceiling[key]} — pose une réponse d’appui ou une durée nommée`];
    if (measured[key] < ceiling[key]) return [`${LABELS[key]} : ${measured[key]} pour un plafond de ${ceiling[key]} — abaisse le plafond dans ce commit`];
    return [];
  });
