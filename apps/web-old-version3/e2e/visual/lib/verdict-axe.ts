// LE VERDICT D'AXE ET LES QUATRE COLONNES DE THÈME — la moitié de la loi du gate axe qui ne
// dépend d'AUCUN module du build.
//
// `lib/a11y.ts` porte l'autre moitié — quelles routes balayer — et pour cela lit le manifeste par
// `scripts/lib/routes-emises.mjs`, importé STATIQUEMENT. C'est ce `.mjs` qui interdit à un spec de
// CHAÎNE de l'importer : Playwright installe alors son chargeur pour tout `.mjs` de l'exécution, et
// le `import()` dynamique de `scripts/mesure-reseau.mjs` (`chargeMesureReseau`) échoue en « does not
// provide an export named plusPrecis » — mesuré, c'est la raison des deux projets de
// `playwright.config.ts`. Un spec qui monte sa propre chaîne (`v3-join.spec.ts`) a pourtant besoin
// des colonnes et du verdict : ils vivent donc ICI, sans `.mjs`, et `lib/a11y.ts` les ré-exporte —
// une seule définition, deux portes.

export type NoeudEnViolation = {
  readonly target: readonly (string | readonly string[])[];
};

export type ViolationAxe = {
  readonly id: string;
  readonly impact?: string | null;
  readonly help?: string;
  readonly nodes: readonly NoeudEnViolation[];
};

// LES QUATRE COLONNES DE THÈME du § 9.6, appliquées au gate d'accessibilité pour la même raison
// qu'au gate visuel.
//
// `color-contrast` est une règle d'impact `serious` — la barre EXACTE de ce gate — et la seule
// règle d'axe dont le verdict dépende ENTIÈREMENT du thème. Sans `colorScheme` posé et sans
// stockage, le script anti-flash (`app/theme-script.tsx`) résout toujours `light` : la branche
// `.dark`, celle pour laquelle ce script existe, n'était jamais auditée, et une palette sombre
// non conforme AA aurait passé ce gate indéfiniment.
//
// Les deux colonnes `system-*` mesurent la préférence de l'OS. Les deux colonnes explicites
// mettent le stockage EN CONTRADICTION avec l'OS : c'est la seule façon d'attraper une jumelle
// entre la classe posée par le script et un `@media (prefers-color-scheme)` qui l'ignorerait.
export type ColonneDeTheme = {
  readonly id: string;
  readonly colorScheme: 'light' | 'dark';
  readonly stockage: 'light' | 'dark' | null;
  readonly classeAttendue: 'light' | 'dark';
};

export const COLONNES_DE_THEME: readonly ColonneDeTheme[] = [
  { id: 'system-light', colorScheme: 'light', stockage: null, classeAttendue: 'light' },
  { id: 'system-dark', colorScheme: 'dark', stockage: null, classeAttendue: 'dark' },
  { id: 'explicit-light-on-dark', colorScheme: 'dark', stockage: 'light', classeAttendue: 'light' },
  { id: 'explicit-dark-on-light', colorScheme: 'light', stockage: 'dark', classeAttendue: 'dark' },
];

export const IMPACTS_BLOQUANTS = ['serious', 'critical'] as const;

const IMPACTS_CONNUS: readonly string[] = ['minor', 'moderate', 'serious', 'critical'];

const IMPACT_NON_CLASSE = 'non classé';

const classe = (impact: string | null | undefined): string =>
  impact === null || impact === undefined || !IMPACTS_CONNUS.includes(impact)
    ? IMPACT_NON_CLASSE
    : impact;

// Une violation dont l'`impact` n'appartient pas à la taxonomie d'axe est RETENUE : rien ne prouve
// qu'elle est sous la barre, et un gate d'accessibilité se ferme du côté du lecteur.
export const estBloquante = (violation: ViolationAxe): boolean => {
  const impact = classe(violation.impact);
  return impact === IMPACT_NON_CLASSE || (IMPACTS_BLOQUANTS as readonly string[]).includes(impact);
};

export const violationsBloquantes = (
  violations: readonly ViolationAxe[],
): readonly ViolationAxe[] => violations.filter(estBloquante);

const cible = (noeud: NoeudEnViolation): string =>
  noeud.target
    .map((selecteur) => (Array.isArray(selecteur) ? selecteur.join(' >>> ') : selecteur))
    .join(', ');

export const rapporteViolations = (route: string, violations: readonly ViolationAxe[]): string =>
  [
    `${violations.length} violation(s) axe bloquante(s) sur ${route} :`,
    ...violations.map((violation) =>
      [
        `  • ${violation.id} (${classe(violation.impact)})${
          violation.help === undefined ? '' : ` — ${violation.help}`
        }`,
        ...violation.nodes.map((noeud) => `      ${cible(noeud)}`),
      ].join('\n'),
    ),
  ].join('\n');
