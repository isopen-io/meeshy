/**
 * L'ANALYSEUR JSON STRICT du clair `d` du registre de confiance (#18906, #19182).
 *
 * Spécification `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md`, § 6.2
 * (temps 0) et § 6.3. Le clair est analysé à TOUT niveau avant tout décodage typé ;
 * `null`, une clé en double (comparée après décodage des échappements), ou un nombre écrit
 * autrement que `0` ou un chiffre non nul suivi de chiffres — point, exposant, signe —
 * font refuser le contenu entier. Sans cela, un relais pouvait AJOUTER `"fromSeq": null`
 * sans changer les octets signés (`null` ↦ 0), et deux plateformes rendaient deux états.
 *
 * `JSON.parse` n'est appelé qu'APRÈS ce balayage : il garde la dernière de deux clés en
 * double et lit `1.0` comme `1`, ce qu'il faut justement refuser. L'analyse est itérative
 * (aucune pile d'appels) : un contenu imbriqué très profond ne la fait pas tomber.
 */

export type StrictLedgerJsonProblem = 'null' | 'duplicate-key' | 'number' | 'syntax';

export type StrictLedgerJsonResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly problem: StrictLedgerJsonProblem };

const WHITESPACE = new Set([' ', '\t', '\n', '\r']);
/** Une chaîne JSON : aucun caractère de contrôle brut, échappements de RFC 8259 § 7 seulement. */
const STRING = /"(?:[^"\\\u0000-\u001f]|\\["\\/bfnrt]|\\u[0-9a-fA-F]{4})*"/y;
/** Un nombre au sens de JSON, pour distinguer « nombre interdit » de « texte invalide ». */
const JSON_NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const STRICT_NUMBER = /^(?:0|[1-9][0-9]*)$/;

type Frame = { readonly kind: 'object'; readonly keys: Set<string> } | { readonly kind: 'array' };

class StrictJsonRefusal extends Error {
  constructor(readonly problem: StrictLedgerJsonProblem) {
    super(`strict ledger json: ${problem}`);
  }
}

const refuse = (problem: StrictLedgerJsonProblem): never => {
  throw new StrictJsonRefusal(problem);
};

/**
 * Balaye `text` et rend la raison du refus, ou `null` si le texte est un JSON strict.
 * Le balayage tient sa pile dans un tableau local : la fonction reste pure vue d'ailleurs.
 */
export function strictLedgerJsonProblem(text: string): StrictLedgerJsonProblem | null {
  const stack: Frame[] = [];
  const cursor = { at: 0 };
  const skipWhitespace = (): void => {
    while (cursor.at < text.length && WHITESPACE.has(text[cursor.at] as string)) cursor.at += 1;
  };
  const sticky = (pattern: RegExp): RegExpExecArray | null => {
    pattern.lastIndex = cursor.at;
    return pattern.exec(text);
  };
  const readString = (): string => {
    const match = sticky(STRING);
    if (match === null) return refuse('syntax');
    cursor.at += match[0].length;
    return JSON.parse(match[0]) as string;
  };
  const readScalar = (): void => {
    if (text.startsWith('"', cursor.at)) return void readString();
    if (text.startsWith('true', cursor.at)) return void (cursor.at += 4);
    if (text.startsWith('false', cursor.at)) return void (cursor.at += 5);
    if (text.startsWith('null', cursor.at)) return refuse('null');
    const number = sticky(JSON_NUMBER);
    if (number === null) return refuse('syntax');
    if (!STRICT_NUMBER.test(number[0])) return refuse('number');
    cursor.at += number[0].length;
  };
  const readKey = (frame: { readonly keys: Set<string> }): void => {
    skipWhitespace();
    if (text[cursor.at] !== '"') refuse('syntax');
    const key = readString();
    if (frame.keys.has(key)) refuse('duplicate-key');
    frame.keys.add(key);
    skipWhitespace();
    if (text[cursor.at] !== ':') refuse('syntax');
    cursor.at += 1;
  };
  /** Ouvre un conteneur, ou lit un scalaire ; rend `true` si une valeur ENTIÈRE vient d'être lue. */
  const readValue = (): boolean => {
    skipWhitespace();
    const char = text[cursor.at];
    if (char !== '{' && char !== '[') {
      readScalar();
      return true;
    }
    cursor.at += 1;
    skipWhitespace();
    const closing = char === '{' ? '}' : ']';
    if (text[cursor.at] === closing) {
      cursor.at += 1;
      return true;
    }
    const frame: Frame = char === '{' ? { kind: 'object', keys: new Set() } : { kind: 'array' };
    stack.push(frame);
    if (frame.kind === 'object') readKey(frame);
    return false;
  };
  /** Après une valeur complète : `,` relance le conteneur courant, sa fermeture le termine. */
  const afterValue = (): boolean => {
    skipWhitespace();
    const frame = stack[stack.length - 1];
    if (frame === undefined) return false;
    const char = text[cursor.at];
    cursor.at += 1;
    if (char === ',') {
      if (frame.kind === 'object') readKey(frame);
      return false;
    }
    if (char === (frame.kind === 'object' ? '}' : ']')) {
      stack.pop();
      return true;
    }
    return refuse('syntax');
  };
  try {
    for (let complete = readValue(); ; complete = readValue()) {
      while (complete && stack.length > 0) complete = afterValue();
      if (complete && stack.length === 0) break;
    }
    skipWhitespace();
    return cursor.at === text.length ? null : 'syntax';
  } catch (error) {
    if (error instanceof StrictJsonRefusal) return error.problem;
    throw error;
  }
}

/** Le clair reçu, analysé seulement s'il est strict (temps 0 du § 6.2). */
export function parseStrictLedgerJson(text: string): StrictLedgerJsonResult {
  const problem = strictLedgerJsonProblem(text);
  return problem === null ? { ok: true, value: JSON.parse(text) as unknown } : { ok: false, problem };
}
