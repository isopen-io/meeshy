/**
 * LE CONTRASTE DU VERRE, PIRE CAS FLOU DÉSACTIVÉ — mesuré une fois, gardé
 * jamais (#6308).
 *
 * D-51 (`decisions.md`) et l'en-tête de `styles/glass.css` arbitrent les deux
 * densités du verre (80 % / 92 %) sur une mesure au navigateur, relevée le
 * 2026-09-13 et écrite en dur dans un TABLEAU DE PROSE. Rien ne rougissait si
 * la matière régressait : une densité baissée dans `glass.css`, ou une encre
 * régénérée depuis `MeeshyColors.swift` (`packages/design-tokens/ios.css`),
 * pouvait repasser la pilule de jour sous AA sans qu'aucun témoin ne le voie
 * — exactement ce que la pilule à 70 % faisait avant #6124.
 *
 * CE MODULE REJOUE LA MESURE, DEPUIS LES FICHIERS RÉELS, JAMAIS DEPUIS DES
 * VALEURS RECOPIÉES. `loadIosSchemes()` lit `packages/design-tokens/ios.css`
 * (les tons et les encres) ; `loadGlassDensities()` lit `styles/glass.css`
 * (les deux densités). Un jeton régénéré ou une densité modifiée change donc
 * le résultat au prochain `bun test`, sans qu'aucune valeur n'ait été
 * recopiée ici.
 *
 * LE PIRE CAS N'EST PAS LE FOND RÉEL DE L'ÉCRAN — c'est le fond composé sur
 * du NOIR pur en schéma CLAIR, sur du BLANC pur en schéma SOMBRE (D-51 : « le
 * fond composé sur du noir OU du blanc pur passant dessous »). C'est
 * l'extrême qui RÉDUIT le contraste : assombrir un ton clair (schéma clair)
 * ou éclaircir un ton sombre (schéma sombre) rapproche le fond de l'encre
 * posée dessus. Formule validée en reproduisant EXACTEMENT le tableau de
 * D-51 à 70/78/80/92 % (voir `glass-contrast.test.ts`).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const IOS_TOKENS_PATH = join(HERE, '..', '..', '..', '..', 'packages', 'design-tokens', 'ios.css');
export const GLASS_CSS_PATH = join(HERE, '..', '..', 'src', 'styles', 'glass.css');
export const IOS_ALIAS_PATH = join(HERE, '..', '..', 'src', 'styles', 'ios.css');

const NAMED_COLORS = {
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
};

/** Le pire cas de D-51 : jamais le fond réel de l'écran, l'extrême qui réduit le contraste. */
export const WORST_CASE_CANVAS = { light: NAMED_COLORS.black, dark: NAMED_COLORS.white };

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function parseHex(value) {
  if (!HEX.test(value)) return null;
  const h = value.slice(1);
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
}

/** Extrait le CONTENU d'un bloc `sélecteur { … }`, accolades imbriquées comprises. */
function extractBlock(css, selectorPattern) {
  const start = selectorPattern.exec(css);
  if (!start) throw new Error(`bloc introuvable pour ${selectorPattern}`);
  const open = css.indexOf('{', start.index);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`accolade non refermée pour ${selectorPattern}`);
}

function parseDeclarations(block) {
  const map = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map[m[1]] = m[2].trim();
  return map;
}

/**
 * Résout une valeur CSS (jeton, `color-mix(in srgb, X P%, transparent)`, hex,
 * `white`/`black`) en `{r,g,b,a}`. Récursif, garde-cycle incluse : SEULES les
 * formes que les tons/encres du verre emploient réellement sont couvertes
 * (voir GLASS_CONTRAST_INVENTORY) — un jeton d'une autre forme lève plutôt
 * que de rendre une couleur fausse en silence.
 */
export function resolveColor(rawValue, vars, seen = new Set()) {
  const value = rawValue.trim();

  const varMatch = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(value);
  if (varMatch) {
    const [, name, fallback] = varMatch;
    if (seen.has(name)) throw new Error(`cycle de jetons sur ${name}`);
    const next = vars[name] ?? fallback;
    if (next === undefined) throw new Error(`jeton introuvable : ${name}`);
    return resolveColor(next, vars, new Set(seen).add(name));
  }

  const mixMatch = /^color-mix\(\s*in\s+srgb\s*,\s*(.+?)\s+(\d+(?:\.\d+)?)%\s*,\s*transparent\s*\)$/.exec(value);
  if (mixMatch) {
    const [, base, percent] = mixMatch;
    const resolved = resolveColor(base, vars, seen);
    return { ...resolved, a: resolved.a * (Number(percent) / 100) };
  }

  if (NAMED_COLORS[value]) return NAMED_COLORS[value];

  const hex = parseHex(value);
  if (hex) return hex;

  throw new Error(`couleur non reconnue : ${value}`);
}

/**
 * Les jetons des DEUX schémas, résolus depuis le fichier généré. `:root,
 * :root.dark` porte les valeurs SOMBRES (base) ; `:root.light` les
 * SURCHARGE pour le schéma clair — même structure que le fichier lui-même.
 */
export function loadIosSchemes() {
  const css = readFileSync(IOS_TOKENS_PATH, 'utf8');
  const darkBlock = extractBlock(css, /:root\s*,\s*:root\.dark\s*\{/);
  const lightBlock = extractBlock(css, /:root\.light\s*\{/);
  const dark = parseDeclarations(darkBlock);
  const light = { ...dark, ...parseDeclarations(lightBlock) };
  return { dark, light };
}

/** Les deux densités du verre, lues depuis `styles/glass.css` — jamais recopiées. */
export function loadGlassDensities() {
  const css = readFileSync(GLASS_CSS_PATH, 'utf8');
  const regular = /\.glass\s*\{\s*--glass-density:\s*(\d+(?:\.\d+)?)%/.exec(css);
  const prominent = /\.glass-prominent\s*\{\s*--glass-density:\s*(\d+(?:\.\d+)?)%/.exec(css);
  if (!regular || !prominent) throw new Error('densité de verre introuvable dans glass.css');
  return { glass: Number(regular[1]), 'glass-prominent': Number(prominent[1]) };
}

const relativeLuminance = (c) => {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
};

const over = (top, bottom) => ({
  r: top.r * top.a + bottom.r * (1 - top.a),
  g: top.g * top.a + bottom.g * (1 - top.a),
  b: top.b * top.a + bottom.b * (1 - top.a),
  a: 1,
});

/** Le rapport de contraste WCAG (formule §1.4.3) entre deux couleurs opaques ou non. */
export function wcagContrastRatio(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Le fond de verre au PIRE CAS (D-51) : le ton, à sa densité, composé sur l'extrême du schéma. */
export function glassWorstCaseBackground({ tone, densityPercent, scheme }) {
  return over({ ...tone, a: tone.a * (densityPercent / 100) }, WORST_CASE_CANVAS[scheme]);
}

/** Le contraste d'une encre posée sur ce fond de verre, au pire cas. */
export function glassWorstCaseContrast({ tone, ink, densityPercent, scheme }) {
  const background = glassWorstCaseBackground({ tone, densityPercent, scheme });
  const text = over(ink, background);
  return wcagContrastRatio(text, background);
}

/**
 * L'INVENTAIRE NOMMÉ — chaque couple (ton, encre) réellement SERVI par une
 * surface `glass*`, cité par son site (audit du 2026-09-13). `--accent`
 * (`.glass-accent`) est HORS inventaire : sa valeur varie par conversation
 * (`ColorGeneration.swift`), ce n'est pas un jeton fixe à mesurer ici.
 */
export const GLASS_CONTRAST_INVENTORY = [
  {
    /**
     * #7143 — la bande du composeur reçoit `glass-prominent` (D-51 : la densité
     * de « ce qui se pose SUR un contenu qu'on lit »). Ses trois encres sont
     * des GLYPHES (annuler la réponse, micro) : seuil non-texte.
     *
     * **CETTE ENTRÉE A DÛ ÊTRE ÉCRITE À LA MAIN, et c'est un fait à connaître**
     * — `glassContrastCoverage` ne l'a PAS réclamée. Elle dérive les couples
     * fichier par fichier ; ici le VERRE est posé dans `routes/thread.tsx` et
     * les ENCRES vivent dans `components/composer.tsx`. Un verre dont le
     * contenu est un composant enfant échappe donc entièrement à la
     * couverture. Mesuré : 0 couple neuf détecté, avec ou sans la classe.
     *
     * Mesure : 4,40:1 en clair, 8,47:1 en sombre (minimum non-texte 3:1).
     */
    site: 'src/routes/thread.tsx — la bande du composeur, glyphes (#7143)',
    tone: '--ios-surface',
    ink: '--ios-ink-2',
    density: 'glass-prominent',
    kind: 'non-text',
  },
  {
    /**
     * #7178 — LE PLACEHOLDER de la même bande, et il n'est PAS un glyphe :
     * « Message… » est du TEXTE, lu par les voyants comme par les lecteurs
     * d'écran. Le classer `non-text` aurait fait passer le gate en changeant
     * la question, pas la réponse — c'est un assouplissement de seuil déguisé,
     * et D-51 l'interdit.
     *
     * L'entrée a manqué à #7143 pour la raison que son voisin explique : la
     * couverture dérive les couples FICHIER PAR FICHIER, et ici le verre est
     * posé dans `routes/thread.tsx` quand l'encre vit dans
     * `components/composer.tsx`. **Un verre dont le contenu est un composant
     * enfant échappe à la détection** — les deux entrées de cette bande ont dû
     * être écrites à la main.
     *
     * Ce qui l'a fait passer n'est ni l'encre (`--ios-ink-3` est au cran
     * minimal d'iOS, D-18 bis) ni le ton (`glass-card` DÉGRADE à 4,21:1,
     * mesuré) mais la DENSITÉ, relevée de 92 à 94 % sur mesure.
     *
     * Mesure à 94 % : 4,55:1 en clair, 4,52:1 en sombre (minimum texte 4,5:1).
     */
    site: 'src/components/composer.tsx — le placeholder de la bande (#7178)',
    tone: '--ios-surface',
    ink: '--ios-ink-3',
    density: 'glass-prominent',
    kind: 'text',
  },
  {
    /* #7826 — la liste de mentions flotte AU-DESSUS du fil qu'on lit : même
       densité que la bande du composeur (D-51). Le nom est du TEXTE. */
    site: 'src/components/mention-suggestions.tsx — le nom d’une personne à mentionner (#7826)',
    tone: '--ios-surface',
    ink: '--ios-ink',
    density: 'glass-prominent',
    kind: 'text',
  },
  {
    site: 'src/components/mention-suggestions.tsx — le @pseudo et « Aucune personne trouvée » (#7826)',
    tone: '--ios-surface',
    ink: '--ios-ink-2',
    density: 'glass-prominent',
    kind: 'text',
  },
  {
    site: 'src/components/thread-chrome.tsx — DayPill, la pilule de jour collante',
    tone: '--ios-surface-card',
    ink: '--ios-day-ink',
    density: 'glass',
    kind: 'text',
  },
  {
    site: 'src/components/thread-header.tsx — titre de l’en-tête déplié',
    tone: '--ios-surface',
    ink: '--ios-ink',
    density: 'glass',
    kind: 'text',
  },
  {
    /* Corrigé par #6308 : `--ios-ink-2` (semi-transparente) n'y tenait pas
       AA en clair (3,58:1) — voir le doc-comment de `thread-header.tsx`. */
    site: 'src/components/thread-header.tsx — sous-titre (participants / chiffrement)',
    tone: '--ios-surface',
    ink: '--ios-ink',
    density: 'glass',
    kind: 'text',
  },
  {
    site: 'src/components/thread-chrome.tsx — l’annonce du presse-papiers (« Message copié », NoticePill, #7429)',
    tone: '--ios-surface-card',
    ink: '--ios-ink',
    density: 'glass-prominent',
    kind: 'text',
  },
  {
    site: 'src/routes/conversations.tsx — la loupe de la barre de recherche flottante',
    tone: '--ios-surface-card',
    ink: '--ios-ink-2',
    density: 'glass-prominent',
    kind: 'non-text',
  },
  {
    /* Trouvé par la dérivation automatique (#6367), absent de l'audit manuel
       du 2026-09-13 : `MinimalHeader` peignait le chevron en `--color-ios-brand`
       nu, 2,78:1 / 2,53:1 au pire cas — sous la barre AA non-texte. Corrigé par
       `--color-ios-ink` (voir `thread-states.tsx`). */
    site: 'src/components/thread-states.tsx — MinimalHeader, le chevron de retour des écrans refusé/erreur',
    tone: '--ios-surface',
    ink: '--ios-ink',
    density: 'glass',
    kind: 'non-text',
  },
];

export const MIN_RATIO = { text: 4.5, 'non-text': 3 };

/**
 * L'audit complet : chaque entrée de l'inventaire, dans les deux schémas,
 * avec son ratio mesuré et le seuil qu'il doit tenir.
 */
/**
 * L'ALIAS `--color-*` → jeton `--ios-*` (#6367) — `src/styles/ios.css` NOMME
 * les jetons iOS pour Tailwind (`@theme inline`) ; c'est cette table, jamais
 * une recopie, qui relie une couleur écrite dans le JSX (`--color-ios-ink`)
 * au jeton mesuré par `loadIosSchemes()` (`--ios-ink`). Un alias absent d'ici
 * (`--accent`, `--color-ok`…) n'est pas un jeton iOS fixe : il sort du
 * balayage, jamais par une liste d'exclusion à la main.
 */
export function loadColorAliasMap() {
  const css = readFileSync(IOS_ALIAS_PATH, 'utf8');
  const block = extractBlock(css, /@theme\s+inline\s*\{/);
  const aliases = {};
  for (const [name, value] of Object.entries(parseDeclarations(block))) {
    const match = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
    if (match) aliases[name] = match[1];
  }
  return aliases;
}

const GLASS_TONE_ALIAS_BY_TOKEN = { 'glass-card': '--color-ios-card' };
const GLASS_EXCLUDED_TOKENS = new Set(['glass-accent']);
const GLASS_DEFAULT_TONE_ALIAS = '--color-ios-surface';
const CLASS_VALUE = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\}|'([^']*)')/;
const STYLE_COLOR = /color:\s*['"]var\((--[\w-]+)\)['"]/;

/** Le ton et la densité de verre d'un tag, depuis SA classe — jamais un ancêtre (`--glass-tone` se pose sur la surface elle-même, `glass.css`). */
function classifyGlassTag(tagText) {
  const classMatch = CLASS_VALUE.exec(tagText);
  const classText = classMatch?.slice(1).find((v) => v !== undefined) ?? '';
  const tokens = classText.split(/\s+/).filter(Boolean);
  if (tokens.some((t) => GLASS_EXCLUDED_TOKENS.has(t))) return null;
  const density = tokens.includes('glass-prominent') ? 'glass-prominent' : tokens.includes('glass') ? 'glass' : null;
  if (!density) return null;
  const toneToken = tokens.find((t) => GLASS_TONE_ALIAS_BY_TOKEN[t]);
  return { density, toneAlias: toneToken ? GLASS_TONE_ALIAS_BY_TOKEN[toneToken] : GLASS_DEFAULT_TONE_ALIAS };
}

/** La fin du tag ouvert à `start` (`<` inclus) — profondeur d'accolades et guillemets ignorés, comme `extractBlock`. */
function findTagEnd(text, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      if (c === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return i;
  }
  return -1;
}

/**
 * Chaque couple (alias de ton, alias d'encre, densité) réellement PEINT
 * ensemble dans le JSX (#6367) : un tag qui porte le verre ouvre un CADRE
 * hérité par ses descendants (comme `--glass-tone` en CSS) jusqu'à sa
 * fermeture ; toute encre déclarée dans ce cadre — sur le tag lui-même ou un
 * descendant, à toute profondeur — forme un couple avec lui.
 *
 * `</...>` est TOUJOURS une fermeture JSX sans ambiguïté (aucune syntaxe TS
 * ne produit `</`) : le caractère qui précède le `<` n'est jamais regardé
 * pour une fermeture — seulement pour une ouverture, où un générique
 * TypeScript appelé (`useState<string>('a')`) prend la même forme. Ce
 * générique-là est reconnu à ce qui le suit, pas à ce qui le précède : son
 * `>` fermant est immédiatement suivi de `(`, ce que ferme jamais un tag JSX
 * ouvrant (`<b>x</b>` n'appelle rien).
 */
export function glassInkUsages(text) {
  const usages = [];
  const stack = [];
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt === -1) break;
    if (text[lt + 1] === '/') {
      const gt = text.indexOf('>', lt);
      if (gt === -1) break;
      stack.pop();
      i = gt + 1;
      continue;
    }
    if (!/[A-Za-z>]/.test(text[lt + 1] ?? '')) {
      i = lt + 1;
      continue;
    }
    const end = findTagEnd(text, lt);
    if (end === -1) {
      i = lt + 1;
      continue;
    }
    const prev = text[lt - 1];
    const isGenericCall = prev !== undefined && /[\w$]/.test(prev) && text[end + 1] === '(';
    if (isGenericCall) {
      i = end + 1;
      continue;
    }
    const tagText = text.slice(lt, end + 1);
    const selfClosing = /\/\s*>$/.test(tagText);
    const frame = classifyGlassTag(tagText);
    const active = frame ?? [...stack].reverse().find(Boolean) ?? null;
    const colorMatch = STYLE_COLOR.exec(tagText);
    if (colorMatch && active) {
      usages.push({ toneAlias: active.toneAlias, density: active.density, inkAlias: colorMatch[1] });
    }
    if (!selfClosing) stack.push(frame ?? null);
    i = end + 1;
  }
  return usages;
}

/**
 * L'audit dérivé (#6367) : chaque couple (ton, encre, densité) réellement
 * peint dans `src/**\/*.tsx`, résolu vers les jetons `--ios-*` mesurés par
 * `glassContrastAudit`. Une encre hors du schéma iOS (`--accent`, un jeton
 * sémantique) n'a pas d'alias dans `loadColorAliasMap()` — elle sort ici,
 * jamais par une exclusion nommée.
 */
export function derivedGlassInkPairs(sources) {
  const aliases = loadColorAliasMap();
  const byKey = new Map();
  for (const { path, text } of sources) {
    if (!/\.tsx$/.test(path)) continue;
    for (const usage of glassInkUsages(text)) {
      const tone = aliases[usage.toneAlias];
      const ink = aliases[usage.inkAlias];
      if (!tone || !ink) continue;
      const key = `${tone}|${ink}|${usage.density}`;
      if (!byKey.has(key)) byKey.set(key, { tone, ink, density: usage.density, sites: new Set() });
      byKey.get(key).sites.add(path);
    }
  }
  return [...byKey.values()].map((entry) => ({ ...entry, sites: [...entry.sites].sort() }));
}

/**
 * Les couples dérivés SANS entrée dans l'inventaire (#6367) — un usage réel
 * que personne n'a encore mesuré ni classé (texte / non-texte). C'est ce
 * témoin qui rougit sur un couple neuf, là où `GLASS_CONTRAST_INVENTORY`
 * seul ne pouvait que garder ce qu'on y avait déjà écrit.
 */
export function glassContrastCoverage(sources, inventory = GLASS_CONTRAST_INVENTORY) {
  const declared = new Set(inventory.map((entry) => `${entry.tone}|${entry.ink}|${entry.density}`));
  return derivedGlassInkPairs(sources).filter((pair) => !declared.has(`${pair.tone}|${pair.ink}|${pair.density}`));
}

export function glassContrastAudit(inventory = GLASS_CONTRAST_INVENTORY) {
  const schemes = loadIosSchemes();
  const densities = loadGlassDensities();
  return inventory.flatMap((entry) =>
    ['light', 'dark'].map((scheme) => {
      const vars = schemes[scheme];
      const tone = resolveColor(`var(${entry.tone})`, vars);
      const ink = resolveColor(`var(${entry.ink})`, vars);
      const densityPercent = densities[entry.density];
      const ratio = glassWorstCaseContrast({ tone, ink, densityPercent, scheme });
      const minRatio = MIN_RATIO[entry.kind];
      return { ...entry, scheme, densityPercent, ratio, minRatio, passes: ratio >= minRatio };
    }),
  );
}
