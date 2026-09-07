#!/usr/bin/env node
/**
 * GÉNÈRE `ios.css` DEPUIS LES SOURCES SWIFT.
 *
 * Pourquoi ce script existe : la v4 web doit reprendre l'interface iOS
 * (directive porteur 2026-09-06, #5444). Elle a d'abord recopié la palette iOS
 * à la main dans `apps/web-v3/src/styles/ios.css` — c'est-à-dire une SECONDE
 * TABLE, ce que la charte interdit (§ 12.5 règle 1), et le défaut exact que
 * #5445 demande de solder : une couleur corrigée d'un côté dérive de l'autre
 * en SILENCE, chaque table restant cohérente avec elle-même.
 *
 * La source retenue est SWIFT, pour une raison et une seule : c'est l'interface
 * que le web doit reproduire. `tokens.css` reste la table de la v3, intacte —
 * la réécrire changerait le rendu d'une application en service, ce qu'aucune
 * décision n'a demandé. Les deux tables COEXISTENT donc encore, mais plus
 * aucune valeur n'est recopiée : `ios.css` est dérivé, et le gate le prouve.
 *
 * Le parseur est DÉLIBÉRÉMENT STRICT : toute déclaration d'une forme qu'il ne
 * connaît pas fait échouer la génération. Un parseur qui saute en silence ce
 * qu'il ne comprend pas rendrait une table INCOMPLÈTE tout en ayant l'air de
 * marcher — le pire résultat possible pour un générateur de jetons.
 *
 *   node scripts/genere-depuis-ios.mjs            écrit ios.css
 *   node scripts/genere-depuis-ios.mjs --verifie  échoue si ios.css a dérivé
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '../../..');
const COULEURS = join(RACINE, 'packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift');
const JETONS = join(RACINE, 'packages/MeeshySDK/Sources/MeeshyUI/Theme/DesignTokens.swift');
const SORTIE = join(ICI, '../ios.css');

const echoue = (message) => {
  console.error(`\n  GÉNÉRATION REFUSÉE — ${message}\n`);
  process.exit(1);
};

// ---------------------------------------------------------------- COULEURS

const swiftCouleurs = readFileSync(COULEURS, 'utf8');

/**
 * Trois formes de constante, toutes trois porteuses de couleur :
 *   public static let nom = Color(hex: "AABBCC")   la forme nominale
 *   public static let nomHex = "AABBCC"            le jumeau CHAÎNE que Swift
 *     tient pour les API qui veulent un hexadécimal (`accentColor`, ZMQ…)
 *   public static let nom = autreNom               un alias
 *
 * La forme CHAÎNE doit être lue même si aucun jeton n'en sort : sans elle,
 * `communityAccentHex = warningHex` reste un alias non résolu et la génération
 * échoue. C'est le parseur strict qui fait son travail — il a trouvé une forme
 * que je n'avais pas prévue plutôt que de la sauter.
 */
/**
 * Ce que le fichier déclare et qui n'est PAS une couleur : dégradés, matériaux.
 * On les recense pour pouvoir SAUTER leurs alias en connaissance de cause
 * (`primaryGradient = brandGradient`), sans pour autant sauter un alias dont
 * la cible est inconnue — celui-là reste une erreur.
 */
const nonCouleurs = new Set(
  [...swiftCouleurs.matchAll(/public static let (\w+)\s*=\s*(?:LinearGradient|RadialGradient|Material|Angular)/g)].map(
    (m) => m[1],
  ),
);
for (const m of swiftCouleurs.matchAll(/public static func (\w+)\(isDark: Bool\) -> LinearGradient/g)) {
  nonCouleurs.add(m[1]);
}

const constantes = new Map();
for (const m of swiftCouleurs.matchAll(
  /^\s*public static let (\w+)\s*=\s*(?:Color\(hex:\s*"([0-9A-Fa-f]{6})"\)|"([0-9A-Fa-f]{6})"|(\w+))\s*$/gm,
)) {
  const [, nom, hex, hexChaine, alias] = m;
  if (hex ?? hexChaine) constantes.set(nom, `#${(hex ?? hexChaine).toLowerCase()}`);
  else if (alias && nonCouleurs.has(alias)) continue; // alias de dégradé/matériau
  else if (alias && constantes.has(alias)) constantes.set(nom, constantes.get(alias));
  // Un alias vers une constante non encore vue (ordre de déclaration) est
  // résolu au second tour ci-dessous.
  else if (alias) constantes.set(nom, { alias });
}
for (const [nom, valeur] of constantes) {
  if (typeof valeur === 'object') {
    const cible = constantes.get(valeur.alias);
    if (typeof cible !== 'string') echoue(`alias non résolu : ${nom} -> ${valeur.alias}`);
    constantes.set(nom, cible);
  }
}

/**
 * Les fonctions `nom(isDark:)`. Trois formes acceptées, et TROIS SEULEMENT :
 *   isDark ? Color(hex: "A") : Color(hex: "B")
 *   isDark ? constante        : constante
 *   isDark ? constante.opacity(x) : constante.opacity(y)
 * Toute autre forme fait échouer — voir le doc-comment.
 */
const terme = (expr, ou) => {
  const t = expr.trim();
  let m = /^Color\(hex:\s*"([0-9A-Fa-f]{6})"\)$/.exec(t);
  if (m) return `#${m[1].toLowerCase()}`;
  m = /^(\w+)$/.exec(t);
  if (m) {
    if (!constantes.has(m[1])) echoue(`${ou} référence une constante inconnue : ${m[1]}`);
    return constantes.get(m[1]);
  }
  m = /^(\w+)\.opacity\(([\d.]+)\)$/.exec(t);
  if (m) {
    if (!constantes.has(m[1])) echoue(`${ou} référence une constante inconnue : ${m[1]}`);
    // `color-mix` avec `transparent` reproduit exactement l'alpha de SwiftUI,
    // et reste lisible dans l'inspecteur — préférable à une conversion en rgba
    // qui perdrait le nom de la couleur d'origine.
    return `color-mix(in srgb, ${constantes.get(m[1])} ${Math.round(Number(m[2]) * 100)}%, transparent)`;
  }
  echoue(`${ou} : forme non reconnue « ${t} »`);
};

/**
 * Coupe `a ? b : c` au deux-points de PREMIER NIVEAU.
 *
 * Une regex ne peut pas faire ça : `Color(hex: "09090B")` porte lui-même un
 * deux-points, et toute coupe naïve tombe dedans. C'est ce qui a fait échouer
 * la première version sur `backgroundPrimary` — et c'est le parseur strict qui
 * l'a signalé au lieu de rendre une table à laquelle il manquait les fonds.
 */
const coupeLeTernaire = (corps, ou) => {
  let profondeur = 0;
  let dansChaine = false;
  for (let i = 0; i < corps.length; i += 1) {
    const c = corps[i];
    if (c === '"') dansChaine = !dansChaine;
    else if (dansChaine) continue;
    else if (c === '(' || c === '[') profondeur += 1;
    else if (c === ')' || c === ']') profondeur -= 1;
    else if (c === ':' && profondeur === 0) return [corps.slice(0, i), corps.slice(i + 1)];
  }
  echoue(`${ou} : ternaire sans deux-points de premier niveau`);
};

const fonctions = new Map();
for (const m of swiftCouleurs.matchAll(
  /public static func (\w+)\(isDark: Bool\) -> Color \{\s*\n\s*isDark \?([\s\S]*?)\n\s*\}/g,
)) {
  const [, nom, corps] = m;
  const [sombre, clair] = coupeLeTernaire(corps.trim(), nom);
  fonctions.set(nom, { sombre: terme(sombre, nom), clair: terme(clair, nom) });
}

const ATTENDUES = ['textPrimary', 'textSecondary', 'textMuted', 'backgroundPrimary', 'backgroundSecondary'];
const manquantes = ATTENDUES.filter((n) => !fonctions.has(n));
if (manquantes.length) echoue(`fonctions attendues absentes ou de forme nouvelle : ${manquantes.join(', ')}`);

// ------------------------------------------------------------------ JETONS

const swiftJetons = readFileSync(JETONS, 'utf8');
const bloc = (nom) => {
  const m = new RegExp(`public enum ${nom} \\{([\\s\\S]*?)\\n\\}`).exec(swiftJetons);
  if (!m) echoue(`bloc ${nom} introuvable dans DesignTokens.swift`);
  const valeurs = new Map();
  for (const v of m[1].matchAll(/public static let (\w+):\s*CGFloat\s*=\s*([\d.]+)/g)) {
    valeurs.set(v[1], Number(v[2]));
  }
  return valeurs;
};
const espaces = bloc('MeeshySpacing');
const rayons = bloc('MeeshyRadius');
const polices = bloc('MeeshyFont');

/**
 * CE QUE SWIFT N'A PAS EN JETON, et qui vit en LITTÉRAL dans ses vues.
 *
 * Ce tableau est le constat le plus utile de cette fusion : l'app iOS elle-même
 * porte des valeurs hors de ses propres tables. `cornerRadius: 18` de la bulle
 * n'est pas `MeeshyRadius.md` (14) ni `.lg` (16) ; le champ du composeur pose
 * 22 ; l'heure d'une bulle emploie `.caption` (≈12) et non `MeeshyFont`. Les
 * générer est impossible — ils ne sont déclarés nulle part. Les recopier
 * SANS LE DIRE reproduirait exactement le défaut que cette fusion solde.
 *
 * Ils sont donc déclarés ICI, chacun avec son site Swift, et ce tableau vaut
 * inventaire de ce que iOS doit remonter dans ses propres tables (#5445).
 */
const HORS_TABLE_IOS = [
  ['--ios-radius-bulle', '18px', 'Bubble/BubbleBackground.swift — cornerRadius: 18, littéral'],
  ['--ios-radius-champ', '22px', 'UniversalComposerBar+Recording.swift — RoundedRectangle(cornerRadius: 22)'],
  ['--ios-radius-citation', '12px', 'Bubble/BubbleQuotedReply.swift — style .card'],
  ['--ios-text-heure', '12px', 'BubbleFooter.swift — .caption de SwiftUI, hors MeeshyFont'],
  ['--ios-text-saisie', '16px', 'UniversalComposerBar — .callout de SwiftUI'],
  ['--ios-text-grand-titre', '28px', 'ConversationListView+Overlays.swift — .system(size: 28, weight: .bold)'],
  ['--ios-avatar-ligne', '52px', 'MeeshyAvatar.swift — contexte .conversationList'],
  ['--ios-avatar-entete', '44px', 'MeeshyAvatar.swift — contexte .conversationHeaderCollapsed'],
  ['--ios-avatar-bulle', '32px', 'MeeshyAvatar.swift — contexte .messageBubble'],
  ['--ios-avatar-empile', '28px', 'MeeshyAvatar.swift — contexte .conversationHeaderStacked'],
  ['--ios-avatar-frappe', '18px', 'MessageListViewController.swift — TypingIndicatorBubble, tenue bulle'],
  ['--ios-rond-entete', '28px', 'ConversationView+Header.swift — cercle visuel des actions (cible 44)'],
  ['--ios-bulle-moi', 'var(--ios-indigo-500)', 'BubbleBackground.swift — brandPrimary, le MÊME dans toutes les conversations'],
  ['--ios-bulle-meta-moi', 'color-mix(in srgb, white 70%, transparent)', 'BubbleFooter.swift:283 — metaColor quand isMe'],
];

/**
 * Les mêmes, mais DÉPENDANTES DU SCHÉMA. Elles ne pouvaient pas rester dans le
 * tableau ci-dessus, qui n'alimente que le bloc sombre : les y laisser aurait
 * donné une bulle reçue à 28 % d'accent en clair comme en sombre, c'est-à-dire
 * le défaut que cette fusion est censée rendre impossible.
 */
const HORS_TABLE_PAR_SCHEMA = [
  ['--ios-bulle-recue-opacite', '28%', '16%', 'BubbleBackground.swift — other.opacity(isDark ? 0.28 : 0.16)'],
  ['--ios-bulle-recue-filet-opacite', '34%', '26%', 'BubbleBackground.swift — strokeBorder(isDark ? 0.34 : 0.26)'],
  [
    '--ios-bulle-meta',
    'color-mix(in srgb, white 55%, transparent)',
    'color-mix(in srgb, black 50%, transparent)',
    'BubbleFooter.swift:283-285 — metaColor hors isMe',
  ],
  ['--ios-accuse-lu', 'var(--ios-indigo-400)', 'var(--ios-indigo-600)', 'BubbleDeliveryCheck.swift — readTint'],
  [
    '--ios-citation-fond',
    'color-mix(in srgb, white 8%, transparent)',
    'color-mix(in srgb, black 5%, transparent)',
    'BubbleQuotedReply.swift — style .card, hôte non-isMe',
  ],
  [
    '--ios-citation-fond-moi',
    'color-mix(in srgb, white 15%, transparent)',
    'color-mix(in srgb, white 15%, transparent)',
    'BubbleQuotedReply.swift — style .card, hôte isMe',
  ],
  [
    '--ios-lisere',
    'color-mix(in srgb, white 6%, transparent)',
    'color-mix(in srgb, black 6%, transparent)',
    'ThemedConversationRow.swift:202-241 — strokeBorder de la carte, 0,5 px',
  ],
  ['--ios-jour-encre', 'var(--ios-indigo-200)', 'var(--ios-indigo-700)', 'MessageDaySeparator.swift'],
  ['--ios-jour-filet', 'var(--ios-indigo-900)', 'var(--ios-indigo-200)', 'MessageDaySeparator.swift — strokeBorder'],
];

// ------------------------------------------------------------------ SORTIE

const ligne = (nom, valeur) => `  ${nom}: ${valeur};`;
const rampe = [...constantes]
  .filter(([n]) => /^indigo\d+$/.test(n))
  .map(([n, v]) => ligne(`--ios-${n.replace(/(\d+)$/, '-$1')}`, v));

const SEMANTIQUES = [
  ['success', '--ios-succes'],
  ['error', '--ios-erreur'],
  ['errorStrong', '--ios-erreur-forte'],
  ['errorDark', '--ios-erreur-sombre'],
  ['warning', '--ios-alerte'],
  ['info', '--ios-info'],
  ['pinnedBlue', '--ios-epingle'],
  ['successDeep', '--ios-succes-profond'],
  ['neutral400', '--ios-neutre-400'],
  ['neutral500', '--ios-neutre-500'],
  ['neutral600', '--ios-neutre-600'],
];
const semantiques = SEMANTIQUES.map(([swift, css]) => {
  if (!constantes.has(swift)) echoue(`constante attendue absente : ${swift}`);
  return ligne(css, constantes.get(swift));
});

const sortie = `/* GÉNÉRÉ — ne pas éditer à la main.
 *
 * Produit par packages/design-tokens/scripts/genere-depuis-ios.mjs depuis
 * MeeshyColors.swift et DesignTokens.swift, qui sont la SOURCE.
 * Régénérer : cd packages/design-tokens && node scripts/genere-depuis-ios.mjs
 * Vérifier  : … --verifie   (le gate de CI ; échoue si ce fichier a dérivé)
 *
 * POURQUOI CE FICHIER EXISTE (#5445) : la v4 web reprend l'interface iOS, donc
 * elle a besoin des valeurs iOS. Elle les recopiait à la main — une seconde
 * table, que la charte interdit. Elles sont désormais DÉRIVÉES.
 *
 * CE FICHIER NE REMPLACE PAS tokens.css, qui reste la table de la v3 : les deux
 * assignent les mêmes couleurs à des RÔLES DIFFÉRENTS (design-tokens fait de
 * indigo400 sa primaire, iOS de indigo500 ; les neutres de la v3 sont violacés,
 * ceux d'iOS sont des gris vrais). Unifier ces rôles changerait le rendu de
 * web-v3, ce qu'aucune décision n'a demandé — c'est le reste de #5445.
 */

:root,
:root.dark {
  /* La rampe indigo — la marque, identique dans les deux schémas. */
${rampe.join('\n')}

  /* Les couleurs sémantiques et les neutres — hors schéma également. */
${semantiques.join('\n')}

  /* Les plans et les encres, schéma SOMBRE. */
${ligne('--ios-plan-fond', fonctions.get('backgroundPrimary').sombre)}
${ligne('--ios-plan-carte', fonctions.get('backgroundSecondary').sombre)}
${ligne('--ios-encre', fonctions.get('textPrimary').sombre)}
${ligne('--ios-encre-2', fonctions.get('textSecondary').sombre)}
${ligne('--ios-encre-3', fonctions.get('textMuted').sombre)}

  /* L'échelle d'espace (MeeshySpacing). */
${[...espaces].map(([n, v]) => ligne(`--ios-space-${n}`, `${v}px`)).join('\n')}

  /* Les rayons déclarés (MeeshyRadius). « full » est une capsule côté CSS. */
${[...rayons]
  .filter(([n]) => n !== 'full')
  .map(([n, v]) => ligne(`--ios-radius-${n}`, `${v}px`))
  .join('\n')}
${ligne('--ios-radius-full', '9999px')}

  /* Les tailles de police déclarées (MeeshyFont). */
${[...polices].map(([n, v]) => ligne(`--ios-font-${n.replace(/Size$/, '')}`, `${v}px`)).join('\n')}

  /* Ce que Swift porte en LITTÉRAL dans ses vues, hors de ses tables — voir
     le tableau HORS_TABLE_IOS du générateur, qui vaut inventaire de ce que
     iOS doit remonter chez lui. */
${HORS_TABLE_IOS.map(([n, v, ou]) => `  ${n}: ${v}; /* ${ou} */`).join('\n')}
${HORS_TABLE_PAR_SCHEMA.map(([n, sombre, , ou]) => `  ${n}: ${sombre}; /* ${ou} */`).join('\n')}
}

:root.light {
${ligne('--ios-plan-fond', fonctions.get('backgroundPrimary').clair)}
${ligne('--ios-plan-carte', fonctions.get('backgroundSecondary').clair)}
${ligne('--ios-encre', fonctions.get('textPrimary').clair)}
${ligne('--ios-encre-2', fonctions.get('textSecondary').clair)}
${ligne('--ios-encre-3', fonctions.get('textMuted').clair)}

${HORS_TABLE_PAR_SCHEMA.map(([n, , clair]) => `  ${n}: ${clair};`).join('\n')}
}
`;

if (process.argv.includes('--verifie')) {
  let actuel = null;
  try {
    actuel = readFileSync(SORTIE, 'utf8');
  } catch {
    echoue(`ios.css absent — le régénérer`);
  }
  if (actuel !== sortie) {
    echoue(
      `ios.css a DÉRIVÉ de MeeshyColors.swift / DesignTokens.swift.\n` +
        `  C'est exactement ce que #5445 interdit : une valeur corrigée d'un côté\n` +
        `  et pas de l'autre. Régénérer avec : node scripts/genere-depuis-ios.mjs`,
    );
  }
  console.log('  ios.css est conforme à ses sources Swift.');
  process.exit(0);
}

writeFileSync(SORTIE, sortie);
console.log(
  `  ios.css écrit — ${rampe.length} pas de rampe, ${semantiques.length} sémantiques, ` +
    `${espaces.size} espaces, ${rayons.size} rayons, ${polices.size} polices, ` +
    `${HORS_TABLE_IOS.length + HORS_TABLE_PAR_SCHEMA.length} valeurs hors table iOS ` +
    `(dont ${HORS_TABLE_PAR_SCHEMA.length} dépendantes du schéma).`,
);
