/**
 * LE SITE UNIQUE DU VERRE (#6124) — la règle, pure, et l'inventaire NOMMÉ de
 * ce qui a le droit d'y échapper.
 *
 * `glass-surface.tsx` déclarait en prose être « le site unique » de la matière
 * translucide ; neuf surfaces la réécrivaient à la main. Une règle qu'aucun
 * outil n'exprime ne vaut que là où quelqu'un s'en est souvenu.
 *
 * Ce balayage ne mesure PAS la popularité d'une classe utilitaire (le piège du
 * cycle 107, `services/gateway/CLAUDE.md`) : il nomme une PROPRIÉTÉ. Un flou
 * d'arrière-plan n'a qu'un usage — faire du verre ou un voile — et un ton de
 * surface iOS rendu translucide EST le repli du verre, flou ou pas. Les deux
 * vivent donc dans `GLASS_SITE`, et nulle part ailleurs sans une entrée de
 * l'inventaire qui dit, avec sa raison, pourquoi ce n'est pas une surface de
 * verre. Le discriminant (#6124) : ce qui rend un CONTRÔLE ou une BANDE qui
 * flotte au-dessus du contenu passe par le site ; un voile, un fond de
 * gouttière, une tuile en flux — non.
 *
 * Troisième forme : un élément qui PORTE une classe de verre et réécrit son
 * fond — ou une densité `--glass-*` posée localement — contourne le site en
 * l'employant. C'est exactement ce que faisaient les deux seuls consommateurs
 * de `GlassSurface` avant ce lot.
 */

export const GLASS_SITE = 'src/styles/glass.css';

const KINDS = ['blur', 'translucent-tone', 'glass-override'];

export const GLASS_INVENTORY = {
  'src/styles/thread-menu.css': {
    blur: {
      count: 1,
      reason:
        "le VOILE du menu du message : un scrim qui floute le fil ENTIER derrière le menu ouvert, sans texte ni contrôle — pas une surface de verre",
    },
  },
  'src/components/row-actions.tsx': {
    'translucent-tone': {
      count: 1,
      reason:
        "le fond du bouton d'actions de rangée, posé dans la gouttière RÉSERVÉE (`pr-12`, `lens-row.tsx`) : il ne flotte jamais au-dessus d'un contenu",
    },
  },
  'src/styles/thread-protection.css': {
    'translucent-tone': {
      count: 1,
      reason:
        'la tuile du média masqué, EN FLUX dans la bulle (160×120, aucune URL sous le voile) : un fond de substitution, pas un contrôle flottant',
    },
  },
};

const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\w\\])\/\/[^\n]*/g, '$1');

const count = (text, pattern) => (text.match(pattern) ?? []).length;

const BLUR = /backdrop-blur|backdrop-filter\s*:|[bB]ackdropFilter\s*['"]?\s*:/g;
const TRANSLUCENT_TONE =
  /color-mix\(\s*in\s+srgb\s*,\s*var\(\s*--(?:color-ios-(?:surface|card)|ios-surface(?:-card)?)\s*\)\s*\d+(?:\.\d+)?%\s*,\s*transparent\s*\)/g;
const LOCAL_DENSITY = /--glass-[\w-]+['"]?\s*:/g;
const CLASS_ATTRIBUTE = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\}|'([^']*)')/g;
const GLASS_TOKEN = /^glass(?:-[a-z-]+)?$/;
const FILL = /backgroundColor|background\s*:/;

/** La balise ouvrante qui contient `index` — bornée par le premier `>` hors accolades. */
const openingTagAround = (text, index) => {
  const start = text.lastIndexOf('<', index);
  if (start === -1) return '';
  const end = [...text.slice(start)].reduce(
    (acc, char, offset) => {
      if (acc.end !== -1) return acc;
      if (char === '{') return { ...acc, depth: acc.depth + 1 };
      if (char === '}') return { ...acc, depth: acc.depth - 1 };
      if (char === '>' && acc.depth === 0) return { ...acc, end: start + offset };
      return acc;
    },
    { depth: 0, end: -1 },
  ).end;
  return end === -1 ? text.slice(start) : text.slice(start, end + 1);
};

const glassOverrides = (text) => {
  const tags = [...text.matchAll(CLASS_ATTRIBUTE)]
    .filter((match) =>
      (match.slice(1).find((value) => value !== undefined) ?? '')
        .split(/\s+/)
        .some((token) => GLASS_TOKEN.test(token.replace(/[^\w-]/g, ''))),
    )
    .map((match) => openingTagAround(text, match.index ?? 0));
  return tags.filter((tag) => FILL.test(tag)).length + count(text, LOCAL_DENSITY);
};

const measure = (text) => {
  const code = stripComments(text);
  return {
    blur: count(code, BLUR),
    'translucent-tone': count(code, TRANSLUCENT_TONE),
    'glass-override': glassOverrides(code),
  };
};

export function glassViolations(sources, inventory = GLASS_INVENTORY) {
  return sources
    .filter((source) => source.path !== GLASS_SITE)
    .flatMap((source) => {
      const found = measure(source.text);
      const allowances = inventory[source.path] ?? {};
      return KINDS.map((kind) => ({
        path: source.path,
        kind,
        found: found[kind],
        allowed: allowances[kind]?.count ?? 0,
      })).filter((entry) => entry.found !== entry.allowed);
    });
}
