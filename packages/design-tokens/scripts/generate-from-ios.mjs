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
 *   node scripts/generate-from-ios.mjs            écrit ios.css
 *   node scripts/generate-from-ios.mjs --check  échoue si ios.css a dérivé
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');
const COULEURS = join(ROOT, 'packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift');
const JETONS = join(ROOT, 'packages/MeeshySDK/Sources/MeeshyUI/Theme/DesignTokens.swift');
const OUTPUT = join(HERE, '../ios.css');

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
  const [, name, hex, hexChaine, alias] = m;
  if (hex ?? hexChaine) constantes.set(name, `#${(hex ?? hexChaine).toLowerCase()}`);
  else if (alias && nonCouleurs.has(alias)) continue; // alias de dégradé/matériau
  else if (alias && constantes.has(alias)) constantes.set(name, constantes.get(alias));
  // Un alias vers une constante non encore vue (ordre de déclaration) est
  // résolu au second tour ci-dessous.
  else if (alias) constantes.set(name, { alias });
}
for (const [name, value] of constantes) {
  if (typeof value === 'object') {
    const target = constantes.get(value.alias);
    if (typeof target !== 'string') echoue(`alias non résolu : ${name} -> ${value.alias}`);
    constantes.set(name, target);
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
const coupeLeTernaire = (body, ou) => {
  let profondeur = 0;
  let dansChaine = false;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (c === '"') dansChaine = !dansChaine;
    else if (dansChaine) continue;
    else if (c === '(' || c === '[') profondeur += 1;
    else if (c === ')' || c === ']') profondeur -= 1;
    else if (c === ':' && profondeur === 0) return [body.slice(0, i), body.slice(i + 1)];
  }
  echoue(`${ou} : ternaire sans deux-points de premier niveau`);
};

const fonctions = new Map();
for (const m of swiftCouleurs.matchAll(
  /public static func (\w+)\(isDark: Bool\) -> Color \{\s*\n\s*isDark \?([\s\S]*?)\n\s*\}/g,
)) {
  const [, name, body] = m;
  const [dark, light] = coupeLeTernaire(body.trim(), name);
  fonctions.set(name, { dark: terme(dark, name), light: terme(light, name) });
}

const ATTENDUES = ['textPrimary', 'textSecondary', 'textMuted', 'backgroundPrimary', 'backgroundSecondary'];
const manquantes = ATTENDUES.filter((n) => !fonctions.has(n));
if (manquantes.length) echoue(`fonctions attendues absentes ou de forme nouvelle : ${manquantes.join(', ')}`);

// ------------------------------------------------------------------ JETONS

const swiftJetons = readFileSync(JETONS, 'utf8');
const block = (name) => {
  const m = new RegExp(`public enum ${name} \\{([\\s\\S]*?)\\n\\}`).exec(swiftJetons);
  if (!m) echoue(`bloc ${name} introuvable dans DesignTokens.swift`);
  const valeurs = new Map();
  for (const v of m[1].matchAll(/public static let (\w+):\s*CGFloat\s*=\s*([\d.]+)/g)) {
    valeurs.set(v[1], Number(v[2]));
  }
  return valeurs;
};
const espaces = block('MeeshySpacing');
const rayons = block('MeeshyRadius');
const polices = block('MeeshyFont');

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
  ['--ios-radius-bubble', '18px', 'Bubble/BubbleBackground.swift — cornerRadius: 18, littéral'],
  ['--ios-radius-field', '22px', 'UniversalComposerBar+Recording.swift — RoundedRectangle(cornerRadius: 22)'],
  ['--ios-radius-quote', '12px', 'Bubble/BubbleQuotedReply.swift — style .card'],
  ['--ios-text-time', '12px', 'BubbleFooter.swift — .caption de SwiftUI, hors MeeshyFont'],
  ['--ios-text-input', '16px', 'UniversalComposerBar — .callout de SwiftUI'],
  ['--ios-text-large-title', '28px', 'ConversationListView+Overlays.swift — .system(size: 28, weight: .bold)'],
  ['--ios-avatar-row', '52px', 'MeeshyAvatar.swift — contexte .conversationList'],
  ['--ios-avatar-header', '44px', 'MeeshyAvatar.swift — contexte .conversationHeaderCollapsed'],
  ['--ios-avatar-bubble', '32px', 'MeeshyAvatar.swift — contexte .messageBubble'],
  ['--ios-avatar-stacked', '28px', 'MeeshyAvatar.swift — contexte .conversationHeaderStacked'],
  ['--ios-avatar-typing', '18px', 'MessageListViewController.swift — TypingIndicatorBubble, tenue bulle'],
  ['--ios-header-circle', '28px', 'ConversationView+Header.swift — cercle visuel des actions (cible 44)'],
  ['--ios-bubble-mine', 'var(--ios-indigo-500)', 'BubbleBackground.swift — brandPrimary, le MÊME dans toutes les conversations'],
  ['--ios-bubble-meta-mine', 'color-mix(in srgb, white 70%, transparent)', 'BubbleFooter.swift:283 — metaColor quand isMe'],
  ['--ios-text-summary-title', '20px', 'Focal/Summary/LivingSummaryView.swift:64 — relative(20, .heavy), « Résumé Vivant »'],
  ['--ios-text-summary-counts', '14px', 'Focal/Summary/LivingSummaryView.swift:68 — relative(14, .semibold), « N messages · P personnes »'],
  ['--ios-text-summary-partial', '12px', 'Focal/Summary/LivingSummaryView.swift:73 — relative(12, .medium), « Sur les N derniers messages »'],
  /**
   * LES TUILES DU TIROIR DU COMPOSEUR (#5668) — trois littéraux Swift, pas de
   * l'indigo de marque : `UniversalComposerBar+Attachments.swift:250-278`
   * pose `color: "9B59B6"` (photo) / `"45B7D1"` (fichier) / `"E74C3C"`
   * (vocal) sur `CarouselTile`, hors de toute table `MeeshyColors` — mêmes
   * dans les deux schémas (aucune branche claire/sombre dans Swift).
   */
  ['--ios-tile-photo', '#9B59B6', 'UniversalComposerBar+Attachments.swift:250 — CarouselTile(id: "photo").color'],
  ['--ios-tile-file', '#45B7D1', 'UniversalComposerBar+Attachments.swift:262 — CarouselTile(id: "file").color'],
  ['--ios-tile-voice', '#E74C3C', 'UniversalComposerBar+Attachments.swift:274 — CarouselTile(id: "voice").color'],
  /**
   * L'ENCRE DE LA BARRE D'ENREGISTREMENT EN SCHÉMA SOMBRE (#5668,
   * revue-correction) — `UniversalComposerBar+Recording.swift:148` pose
   * `waveformColor = isDark ? "FFFFFF" : accentColor`, et les quatre autres
   * couleurs de cette barre suivent la même bascule (`:144-152`, `:220-225`).
   * Seule la moitié SOMBRE est une valeur : la moitié CLAIRE est l'accent de
   * la conversation, que seule l'application connaît — `app.css` compose les
   * deux (`--recording-ink`).
   */
  ['--ios-recording-ink-dark', '#FFFFFF', 'UniversalComposerBar+Recording.swift:148 — waveformColor = isDark ? "FFFFFF" : accentColor'],
];

/**
 * Les mêmes, mais DÉPENDANTES DU SCHÉMA. Elles ne pouvaient pas rester dans le
 * tableau ci-dessus, qui n'alimente que le bloc sombre : les y laisser aurait
 * donné une bulle reçue à 28 % d'accent en clair comme en sombre, c'est-à-dire
 * le défaut que cette fusion est censée rendre impossible.
 */
const HORS_TABLE_PAR_SCHEMA = [
  ['--ios-bubble-other-opacity', '28%', '16%', 'BubbleBackground.swift — other.opacity(isDark ? 0.28 : 0.16)'],
  ['--ios-bubble-other-hairline-opacity', '34%', '26%', 'BubbleBackground.swift — strokeBorder(isDark ? 0.34 : 0.26)'],
  [
    '--ios-bubble-meta',
    'color-mix(in srgb, white 55%, transparent)',
    'color-mix(in srgb, black 50%, transparent)',
    'BubbleFooter.swift:283-285 — metaColor hors isMe',
  ],
  ['--ios-read-receipt', 'var(--ios-indigo-400)', 'var(--ios-indigo-600)', 'BubbleDeliveryCheck.swift — readTint'],
  [
    '--ios-quote-bg',
    'color-mix(in srgb, white 8%, transparent)',
    'color-mix(in srgb, black 5%, transparent)',
    'BubbleQuotedReply.swift — style .card, hôte non-isMe',
  ],
  [
    '--ios-quote-bg-mine',
    'color-mix(in srgb, white 15%, transparent)',
    'color-mix(in srgb, white 15%, transparent)',
    'BubbleQuotedReply.swift — style .card, hôte isMe',
  ],
  [
    '--ios-edge',
    'color-mix(in srgb, white 6%, transparent)',
    'color-mix(in srgb, black 6%, transparent)',
    'ThemedConversationRow.swift:202-241 — strokeBorder de la carte, 0,5 px',
  ],
  ['--ios-day-ink', 'var(--ios-indigo-200)', 'var(--ios-indigo-700)', 'MessageDaySeparator.swift'],
  ['--ios-day-hairline', 'var(--ios-indigo-900)', 'var(--ios-indigo-200)', 'MessageDaySeparator.swift — strokeBorder'],
  [
    '--ios-summary-surface-tint',
    'color-mix(in srgb, white 6%, transparent)',
    'color-mix(in srgb, black 4%, transparent)',
    'FocalMetrics.swift:385-386 — SurfaceTint, fond des cartes d’épisode du Résumé Vivant',
  ],
  [
    '--ios-summary-skeleton-fill',
    'color-mix(in srgb, white 8%, transparent)',
    'color-mix(in srgb, black 6%, transparent)',
    'Focal/Summary/LivingSummaryView.swift:151-164 — remplissage des trois barres du squelette',
  ],
];

// ------------------------------------------------------------------ SORTIE

const row = (name, value) => `  ${name}: ${value};`;
// `purple*` rejoint la rampe indigo (#5555) : le titre « Meeshy » et le lien
// « Créer un compte » de LoginView.swift dégradent purple700→600→500, une
// couleur DISTINCTE de la marque indigo qui n'était pas encore dérivée.
const ramp = [...constantes]
  .filter(([n]) => /^(indigo|purple)\d+$/.test(n))
  .map(([n, v]) => row(`--ios-${n.replace(/(\d+)$/, '-$1')}`, v));

const SEMANTIQUES = [
  ['success', '--ios-success'],
  ['error', '--ios-error'],
  ['errorStrong', '--ios-error-strong'],
  ['errorDark', '--ios-error-dark'],
  ['warning', '--ios-warning'],
  ['info', '--ios-info'],
  ['pinnedBlue', '--ios-pinned'],
  ['successDeep', '--ios-success-deep'],
  ['neutral400', '--ios-neutral-400'],
  ['neutral500', '--ios-neutral-500'],
  ['neutral600', '--ios-neutral-600'],
];
const semantiques = SEMANTIQUES.map(([swift, css]) => {
  if (!constantes.has(swift)) echoue(`constante attendue absente : ${swift}`);
  return row(css, constantes.get(swift));
});

const output = `/* GÉNÉRÉ — ne pas éditer à la main.
 *
 * Produit par packages/design-tokens/scripts/generate-from-ios.mjs depuis
 * MeeshyColors.swift et DesignTokens.swift, qui sont la SOURCE.
 * Régénérer : cd packages/design-tokens && node scripts/generate-from-ios.mjs
 * Vérifier  : … --check   (le gate de CI ; échoue si ce fichier a dérivé)
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
  /* Les rampes indigo et purple — la marque, identiques dans les deux schémas. */
${ramp.join('\n')}

  /* Les couleurs sémantiques et les neutres — hors schéma également. */
${semantiques.join('\n')}

  /* Les plans et les encres, schéma SOMBRE. */
${row('--ios-surface', fonctions.get('backgroundPrimary').dark)}
${row('--ios-surface-card', fonctions.get('backgroundSecondary').dark)}
${row('--ios-ink', fonctions.get('textPrimary').dark)}
${row('--ios-ink-2', fonctions.get('textSecondary').dark)}
${row('--ios-ink-3', fonctions.get('textMuted').dark)}

  /* L'échelle d'espace (MeeshySpacing). */
${[...espaces].map(([n, v]) => row(`--ios-space-${n}`, `${v}px`)).join('\n')}

  /* Les rayons déclarés (MeeshyRadius). « full » est une capsule côté CSS. */
${[...rayons]
  .filter(([n]) => n !== 'full')
  .map(([n, v]) => row(`--ios-radius-${n}`, `${v}px`))
  .join('\n')}
${row('--ios-radius-full', '9999px')}

  /* Les tailles de police déclarées (MeeshyFont). */
${[...polices].map(([n, v]) => row(`--ios-font-${n.replace(/Size$/, '')}`, `${v}px`)).join('\n')}

  /* Ce que Swift porte en LITTÉRAL dans ses vues, hors de ses tables — voir
     le tableau HORS_TABLE_IOS du générateur, qui vaut inventaire de ce que
     iOS doit remonter chez lui. */
${HORS_TABLE_IOS.map(([n, v, ou]) => `  ${n}: ${v}; /* ${ou} */`).join('\n')}
${HORS_TABLE_PAR_SCHEMA.map(([n, dark, , ou]) => `  ${n}: ${dark}; /* ${ou} */`).join('\n')}
}

:root.light {
${row('--ios-surface', fonctions.get('backgroundPrimary').light)}
${row('--ios-surface-card', fonctions.get('backgroundSecondary').light)}
${row('--ios-ink', fonctions.get('textPrimary').light)}
${row('--ios-ink-2', fonctions.get('textSecondary').light)}
${row('--ios-ink-3', fonctions.get('textMuted').light)}

${HORS_TABLE_PAR_SCHEMA.map(([n, , light]) => `  ${n}: ${light};`).join('\n')}
}
`;

if (process.argv.includes('--check')) {
  let current = null;
  try {
    current = readFileSync(OUTPUT, 'utf8');
  } catch {
    echoue(`ios.css absent — le régénérer`);
  }
  if (current !== output) {
    echoue(
      `ios.css a DÉRIVÉ de MeeshyColors.swift / DesignTokens.swift.\n` +
        `  C'est exactement ce que #5445 interdit : une valeur corrigée d'un côté\n` +
        `  et pas de l'autre. Régénérer avec : node scripts/generate-from-ios.mjs`,
    );
  }
  console.log('  ios.css est conforme à ses sources Swift.');
  process.exit(0);
}

writeFileSync(OUTPUT, output);
console.log(
  `  ios.css écrit — ${ramp.length} pas de rampe, ${semantiques.length} sémantiques, ` +
    `${espaces.size} espaces, ${rayons.size} rayons, ${polices.size} polices, ` +
    `${HORS_TABLE_IOS.length + HORS_TABLE_PAR_SCHEMA.length} valeurs hors table iOS ` +
    `(dont ${HORS_TABLE_PAR_SCHEMA.length} dépendantes du schéma).`,
);
