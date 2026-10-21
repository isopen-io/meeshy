/**
 * **LES ROUTES D'OPUS-MT** (#9898) — quel modèle traduit quelle paire, et
 * avec quel jeton de langue. Les modèles Opus-MT (Marian, ~75 M de paramètres,
 * ONNX quantifié par `Xenova/`) ne savent chacun qu'UN sens d'UNE paire : on
 * n'en charge que ce qu'une conversation demande, deux en mémoire au plus
 * (`opus-mt-engine.ts`).
 *
 * Les sept langues du produit :
 * - une paire DIRECTE (neuf modèles) est un seul saut ;
 * - depuis ou vers l'anglais, un seul saut aussi ;
 * - toute autre paire passe par l'anglais : deux sauts, `X→en` puis `en→Y`.
 *
 * L'arabe et le portugais n'ont qu'un modèle MULTI-CIBLES depuis l'anglais : il
 * exige le jeton de langue cible devant le texte (`>>ara<< `, `>>pt<< `), que
 * `prefix` porte. Les autres modèles n'en veulent pas.
 */
export const OPUS_MT_LANGUAGES = ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'] as const;

export type OpusMtHop = {
  /** Le dépôt du modèle, tel que transformers.js le charge. */
  readonly model: string;
  /** Le jeton de langue cible que le modèle exige devant le texte, vide sinon. */
  readonly prefix: string;
};

const hop = (name: string, prefix = ''): OpusMtHop => ({ model: `Xenova/opus-mt-${name}`, prefix });

const DIRECT: ReadonlySet<string> = new Set(['fr>es', 'es>fr', 'fr>de', 'de>fr', 'es>de', 'de>es', 'it>fr', 'es>it', 'it>es']);

const FROM_ENGLISH: Readonly<Record<string, OpusMtHop>> = {
  fr: hop('en-fr'),
  es: hop('en-es'),
  de: hop('en-de'),
  it: hop('en-it'),
  ar: hop('en-ar', '>>ara<< '),
  pt: hop('en-ROMANCE', '>>pt<< '),
};

const TO_ENGLISH: Readonly<Record<string, OpusMtHop>> = {
  fr: hop('fr-en'),
  es: hop('es-en'),
  de: hop('de-en'),
  it: hop('it-en'),
  ar: hop('ar-en'),
  pt: hop('ROMANCE-en'),
};

/** Les sauts à enchaîner pour traduire `source` vers `target` ; vide si Opus-MT ne couvre pas la paire. */
export function opusMtRoute(source: string, target: string): readonly OpusMtHop[] {
  if (source === target) return [];
  if (DIRECT.has(`${source}>${target}`)) return [hop(`${source}-${target}`)];
  if (source === 'en') {
    const toTarget = FROM_ENGLISH[target];
    return toTarget === undefined ? [] : [toTarget];
  }
  if (target === 'en') {
    const fromSource = TO_ENGLISH[source];
    return fromSource === undefined ? [] : [fromSource];
  }
  const toEnglish = TO_ENGLISH[source];
  const fromEnglish = FROM_ENGLISH[target];
  return toEnglish === undefined || fromEnglish === undefined ? [] : [toEnglish, fromEnglish];
}

export const opusMtSupports = (source: string, target: string): boolean => opusMtRoute(source, target).length > 0;
