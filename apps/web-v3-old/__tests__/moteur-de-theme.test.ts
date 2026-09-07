/**
 * Le moteur de thème de la v3 — issue #4413.
 *
 * `theme-script.test.ts` prouve que le script pose la bonne CLASSE.
 * `jetons.test.ts` prouve que la table déclare ses deux schémas.
 * Aucun des deux ne prouve la phrase du critère de fin, qui les COMPOSE :
 * « un utilisateur en préférence CLAIRE explicite sur un OS SOMBRE obtient des
 * jetons CLAIRS ». Entre la classe et le jeton il y a une cascade, et c'est
 * exactement là que se loge la jumelle que la conception § 2 nomme — des jetons
 * rendus à `@media (prefers-color-scheme)` pendant que les utilitaires `dark:`
 * suivent la classe.
 *
 * Ce fichier fait donc DEUX choses qu'aucun autre ne fait :
 *   1. il RÉSOUT la table comme un navigateur la sert, sous une classe et sous
 *      un schéma d'OS donnés, et vérifie la phrase du critère dans les quatre
 *      colonnes du § 9.6 ;
 *   2. il garde le moteur UNIQUE — un second site de `apps/web-v3` qui
 *      interroge le thème est refusé, quelle que soit la forme qu'il prend.
 */
import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { THEME_PAR_DEFAUT, THEME_STORAGE_KEY, themeScriptSource } from '../app/theme-script';
import {
  audit,
  basculesAutomatiques,
  fichiersDeLaV3,
  formateAudit,
  moteursParalleles,
  suivisDeLOS,
  verdict,
} from '../scripts/check-jetons.mjs';
import { feuillesDepuis, tableServie } from '../scripts/lib/cascade.mjs';

const V3 = join(__dirname, '..');
const JETONS = join(V3, '..', '..', 'packages', 'design-tokens');

const TABLE = feuillesDepuis(JETONS, 'tokens.css');

type MediaQueryStub = { matches: boolean; media: string };

const osEn = (schema: 'dark' | 'light'): void => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (media: string): MediaQueryStub => ({
      media,
      matches: media.includes('dark') === (schema === 'dark'),
    }),
  });
};

const classesApresLeScript = (): readonly string[] => {
  new Function(themeScriptSource)();
  return Array.from(document.documentElement.classList);
};

const sert = (classes: readonly string[], osSombre: boolean): Readonly<Record<string, string>> =>
  tableServie({ feuilles: TABLE, classes, osSombre });

/**
 * La jumelle que la conception refuse, écrite telle qu'on l'écrit vraiment :
 * les jetons ne vivent QUE sur `:root`, et un `@media` les remplace selon l'OS.
 * La classe explicite ne peut alors rien — il n'existe aucune règle qui la lise.
 */
const TABLE_RENDUE_A_L_OS = [
  {
    nom: 'jumelle.css',
    source: [
      ':root { color-scheme: light; --color-bg: #f1f3f9; }',
      '@media (prefers-color-scheme: dark) { :root { color-scheme: dark; --color-bg: #0d0e16; } }',
    ].join('\n'),
  },
];

beforeEach(() => {
  document.documentElement.className = '';
  window.localStorage.clear();
});

describe('la préférence explicite atteint le JETON, pas seulement la classe', () => {
  it('sert la table CLAIRE à une préférence claire explicite sur un OS sombre', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    osEn('dark');

    const servie = sert(classesApresLeScript(), true);

    expect(servie).toEqual(sert(['light'], false));
    expect(servie['color-scheme']).toBe('light');
    expect(servie['--color-bg']).not.toBe(sert(['dark'], true)['--color-bg']);
  });

  it('sert la table SOMBRE à une préférence sombre explicite sur un OS clair', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    osEn('light');

    const servie = sert(classesApresLeScript(), false);

    expect(servie).toEqual(sert(['dark'], true));
    expect(servie['color-scheme']).toBe('dark');
    expect(servie['--color-bg']).not.toBe(sert(['light'], false)['--color-bg']);
  });

  it('sert le schéma de l\'OS quand aucune préférence n\'est enregistrée', () => {
    osEn('light');

    expect(sert(classesApresLeScript(), false)).toEqual(sert(['light'], false));
  });

  // La classe attendue est DÉRIVÉE de `THEME_PAR_DEFAUT`, jamais écrite ici :
  // le jour où le thème par défaut change, ce témoin doit suivre tout seul.
  // Un témoin qui réécrit la valeur qu'il vérifie est une seconde source.
  it('sert une table complète à un navigateur SANS JavaScript — aucune classe posée', () => {
    expect(sert([], true)).toEqual(sert([THEME_PAR_DEFAUT], true));
    expect(sert([], false)).toEqual(sert([THEME_PAR_DEFAUT], false));
    expect(sert([], true)['--color-bg']).toBeDefined();
  });

  it('tombe sur la table rendue à l\'OS — le témoin MORD, il n\'est pas tautologique', () => {
    const servie = tableServie({
      feuilles: TABLE_RENDUE_A_L_OS,
      classes: ['light'],
      osSombre: true,
    });

    expect(servie['--color-bg']).toBe('#0d0e16');
    expect(servie['color-scheme']).toBe('dark');
  });
});

describe('aucun jeton ne suit le schéma de l\'OS', () => {
  it('sert la MÊME table sous les deux OS, classe posée ou non', () => {
    expect(suivisDeLOS(TABLE)).toEqual([]);
  });

  it('nomme le jeton, la classe et les deux valeurs dès qu\'un jeton bascule tout seul', () => {
    expect(suivisDeLOS(TABLE_RENDUE_A_L_OS)).toEqual(
      expect.arrayContaining([
        { classe: 'light', propriete: '--color-bg', sombre: '#0d0e16', clair: '#f1f3f9' },
      ]),
    );
  });
});

describe('ce que la règle appelle un SECOND moteur de thème', () => {
  it('refuse une requête de média sur le schéma dans une feuille de la v3', () => {
    const source = '@media (prefers-color-scheme: dark) { body { background: var(--color-bg); } }';

    expect(moteursParalleles(source, 'app/globals.css')).toEqual([
      { ligne: 1, texte: '@media (prefers-color-scheme: dark)' },
    ]);
  });

  it('refuse un sélecteur de thème dans une feuille de la v3 — la classe n\'a qu\'un lecteur, la table', () => {
    const source = ':root.dark .carte { background: var(--color-surface); }';

    expect(moteursParalleles(source, 'app/globals.css')).toHaveLength(1);
  });

  it('refuse matchMedia sur le schéma hors du moteur', () => {
    const source = "const sombre = matchMedia('(prefers-color-scheme: dark)').matches;";

    expect(moteursParalleles(source, 'components/entete.tsx')).toHaveLength(1);
  });

  it('refuse la lecture de la classe de thème hors du moteur', () => {
    const source = "const sombre = document.documentElement.classList.contains('dark');";

    expect(moteursParalleles(source, 'lib/theme.ts')).toHaveLength(1);
  });

  it('refuse une variante dark: qui nomme une couleur hors de la table', () => {
    const source = 'export const Carte = () => <div className="bg-white dark:bg-slate-900" />;';

    expect(moteursParalleles(source, 'components/carte.tsx')).toEqual([
      { ligne: 1, texte: 'dark:bg-slate-900' },
    ]);
  });

  it('laisse passer une variante dark: adossée à un jeton — la valeur reste dans la table', () => {
    const source = 'export const Carte = () => <div className="dark:bg-[var(--color-surface)]" />;';

    expect(moteursParalleles(source, 'components/carte.tsx')).toEqual([]);
  });

  it('laisse passer une variante qui ne décide aucune couleur', () => {
    const source = 'export const Carte = () => <div className="dark:opacity-80" />;';

    expect(moteursParalleles(source, 'components/carte.tsx')).toEqual([]);
  });

  it('laisse passer le MOTEUR lui-même — il est le site unique, pas une exception muette', () => {
    const source = "matchMedia('(prefers-color-scheme:dark)');e.classList.add(d?'dark':'light')";

    expect(moteursParalleles(source, 'app/theme-script.tsx')).toEqual([]);
    expect(moteursParalleles(source, 'app/autre.tsx')).toHaveLength(2);
  });

  it('ne prend pas une requête de média étrangère au schéma pour un moteur', () => {
    const source = '@media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms; } }';

    expect(moteursParalleles(source, 'app/globals.css')).toEqual([]);
  });

  it('ne prend pas une prose ni un commentaire pour un moteur', () => {
    const source = '/* @media (prefers-color-scheme: dark) est interdit ici */\nbody { margin: 0; }';

    expect(moteursParalleles(source, 'app/globals.css')).toEqual([]);
  });

  // --- le SIGNAL que suivent les utilitaires `dark:` [revue #4413] -----------
  //
  // `VARIANTE_COLOREE` juge la COULEUR que nomme un utilitaire `dark:` ; elle ne
  // dit rien du signal qu'il SUIT. `darkMode: 'media'` — la valeur par défaut de
  // Tailwind, celle qu'on obtient en n'écrivant rien — le rend à l'OS pendant
  // que les jetons suivent la classe : la jumelle de #4413, produite à elle
  // seule par un `dark:bg-[var(--color-surface)]` que ce gate ACCEPTE.
  it('accepte le seul réglage que la conception § 2 autorise', () => {
    const source = 'const config = { darkMode: ["class"], content: [] };';

    expect(moteursParalleles(source, 'tailwind.config.ts')).toEqual([]);
  });

  it.each([
    ['media', 'module.exports = { darkMode: "media" };'],
    ['selector', 'module.exports = { darkMode: "selector" };'],
    ['une classe ÉLARGIE', 'export default { darkMode: ["class", ".theme-sombre"] };'],
  ])('refuse darkMode: %s — les utilitaires dark: suivraient un autre signal que la table', (_nom, source) => {
    expect(moteursParalleles(source, 'tailwind.config.js')).toHaveLength(1);
  });

  it('refuse l\'ABSENCE de darkMode — ne rien écrire VAUT media, donc l\'OS', () => {
    const source = 'export default { content: ["./app/**/*.tsx"] };';

    expect(moteursParalleles(source, 'tailwind.config.mjs')).toEqual([
      { ligne: 1, texte: "darkMode absent — Tailwind retombe sur 'media', donc sur l'OS" },
    ]);
  });

  it('ne réclame darkMode qu\'au fichier qui le porte — la garde est armée AVANT Tailwind', () => {
    expect(moteursParalleles('export const Page = () => null;', 'app/page.tsx')).toEqual([]);
  });

  it('refuse un color-scheme qui déclare DEUX schémas dans une feuille de la v3', () => {
    const source = ':root { color-scheme: light dark; }';

    expect(moteursParalleles(source, 'app/globals.css')).toEqual([
      { ligne: 1, texte: 'color-scheme: light dark' },
    ]);
  });

  it('refuse une variante dark: en TÊTE d\'attribut, la forme la plus courante', () => {
    const source = 'export const Carte = () => <div className="dark:bg-slate-900" />;';

    expect(moteursParalleles(source, 'components/carte.tsx')).toEqual([
      { ligne: 1, texte: 'dark:bg-slate-900' },
    ]);
  });

  it('dit à quelle LIGNE se trouve ce qu\'il refuse', () => {
    const source = ['body {', '  margin: 0;', '}', '@media (prefers-color-scheme: dark) { }'].join(
      '\n',
    );

    expect(moteursParalleles(source, 'app/globals.css')[0]?.ligne).toBe(4);
  });
});

describe('la cascade, telle que le navigateur la joue', () => {
  it('suit les @import de la table, dans l\'ordre, avant le corps de l\'entrée', () => {
    expect(TABLE.map((feuille) => feuille.nom)).toEqual([
      'dark.css',
      'light.css',
      'tokens.css',
    ]);
  });

  it('fait gagner la spécificité, pas seulement l\'ordre du fichier', () => {
    const feuilles = [
      { nom: 'a.css', source: ':root.light { --x: clair; }' },
      { nom: 'b.css', source: ':root { --x: defaut; }' },
    ];

    expect(tableServie({ feuilles, classes: ['light'], osSombre: false })['--x']).toBe('clair');
  });

  it('fait gagner la dernière règle à spécificité égale', () => {
    const feuilles = [
      { nom: 'a.css', source: ':root { --x: premier; }' },
      { nom: 'b.css', source: ':root { --x: dernier; }' },
    ];

    expect(tableServie({ feuilles, classes: [], osSombre: false })['--x']).toBe('dernier');
  });

  it('ne sert pas une règle dont la classe n\'est pas posée', () => {
    const feuilles = [{ nom: 'a.css', source: ':root.light { --x: clair; }' }];

    expect(tableServie({ feuilles, classes: ['dark'], osSombre: false })['--x']).toBeUndefined();
  });

  it('REFUSE un sélecteur qu\'elle ne modélise pas plutôt que de l\'ignorer en silence', () => {
    const feuilles = [{ nom: 'a.css', source: ':root:not(.light) { --x: 1; }' }];

    expect(() => tableServie({ feuilles, classes: [], osSombre: true })).toThrow(/non modélisé/);
  });

  // Le combinateur DESCENDANT : les deux atomes sont modélisés, c'est l'ESPACE
  // entre eux qui ne l'est pas — `:root .carte` rendait exactement les mêmes
  // atomes que `:root.carte` et passait en silence [revue #4413].
  it('REFUSE un combinateur descendant, dont les deux atomes sont pourtant modélisés', () => {
    const feuilles = [{ nom: 'a.css', source: ':root .carte { --x: 1; }' }];

    expect(() => tableServie({ feuilles, classes: [], osSombre: true })).toThrow(/non modélisé/);
  });

  it.each([
    ['@layer', '@layer base { :root { --x: 1; } }'],
    ['@supports', '@supports (color: red) { :root { --x: 1; } }'],
  ])('REFUSE %s plutôt que de SAUTER le bloc — c\'est ainsi que Tailwind écrit une table', (_nom, source) => {
    expect(() => tableServie({ feuilles: [{ nom: 'a.css', source }], classes: [], osSombre: true }))
      .toThrow(/règle @ non modélisée/);
  });

  it('REFUSE un @import qu\'elle n\'a pas su suivre plutôt que de perdre la feuille', () => {
    const racine = join(__dirname, 'fixtures', 'import-qualifie');

    expect(() => feuillesDepuis(racine, 'entree.css')).toThrow(/@import non modélisé/);
  });
});

describe('light-dark(), la bascule sur l\'OS qui ne s\'écrit pas « @media »', () => {
  const AVEC_LIGHT_DARK = (colorScheme: string) => [
    {
      nom: 'jumelle.css',
      source: `:root { color-scheme: ${colorScheme}; --color-overlay: light-dark(#ffffff, #000000); }`,
    },
  ];

  it('sert les DEUX couleurs selon l\'OS quand color-scheme en déclare deux', () => {
    const feuilles = AVEC_LIGHT_DARK('light dark');

    expect(tableServie({ feuilles, classes: [], osSombre: true })['--color-overlay']).toBe('#000000');
    expect(tableServie({ feuilles, classes: [], osSombre: false })['--color-overlay']).toBe('#ffffff');
  });

  it('sert UNE seule couleur quand color-scheme est verrouillé sur un schéma', () => {
    const feuilles = AVEC_LIGHT_DARK('dark');

    expect(tableServie({ feuilles, classes: [], osSombre: false })['--color-overlay']).toBe('#000000');
    expect(tableServie({ feuilles, classes: [], osSombre: true })['--color-overlay']).toBe('#000000');
  });

  it('le NOMME comme un jeton qui suit l\'OS — sans qu\'aucune requête de média soit écrite', () => {
    expect(suivisDeLOS(AVEC_LIGHT_DARK('light dark'))).toEqual(
      expect.arrayContaining([
        { classe: '(aucune)', propriete: '--color-overlay', sombre: '#000000', clair: '#ffffff' },
      ]),
    );
  });

  it('refuse dans la TABLE le color-scheme qui l\'arme, avant même de résoudre', () => {
    expect(basculesAutomatiques(':root { color-scheme: light dark; }')).toEqual([
      { ligne: 1, texte: 'color-scheme: light dark' },
    ]);
    expect(basculesAutomatiques(':root { color-scheme: dark; }')).toEqual([]);
  });
});

describe('le contrôle prouve qu\'il a REGARDÉ quelque chose', () => {
  // `suivisDeLOS` a pour valeur nominale de succès « zéro entrée ». Un résolveur
  // qui inspecte une table VIDE rend donc la même phrase qu'un résolveur qui a
  // tout vérifié — c'est ce qui est arrivé, et le gate a rendu vert.
  it('refuse une table servie VIDE, qui rendrait « aucun jeton ne suit l\'OS »', () => {
    expect(() => suivisDeLOS([{ nom: 'vide.css', source: '/* rien */' }])).toThrow(
      /ne sert 0 des 0 jeton/,
    );
  });

  it('refuse une table servie plus COURTE que ce que les feuilles déclarent', () => {
    expect(() => suivisDeLOS([{ nom: 'a.css', source: ':root.light { --x: 1; }' }])).toThrow(
      /ne sert 1 des 1 jeton/,
    );
  });

  it('accepte la table RÉELLE, qui sert tous ses jetons dans les trois états', () => {
    expect(() => suivisDeLOS(TABLE)).not.toThrow();
  });
});

describe('le gate des jetons garde le moteur unique', () => {
  it('ne trouve AUJOURD\'HUI aucun second moteur ni aucun jeton qui suit l\'OS', () => {
    const rapport = audit({ racineV3: V3, racineJetons: JETONS });

    expect(rapport.moteurs).toEqual([]);
    expect(rapport.suivis).toEqual([]);
    expect(verdict(rapport)).toBe(0);
  });

  // Le témoin porte sur `fichiersDeLaV3`/`audit`, pas sur `moteursParalleles`
  // seul : c'est la SÉLECTION des fichiers qui était en défaut, pas la détection
  // des formes. Les onze témoins ci-dessus restaient verts sur ce défaut
  // précisément parce qu'ils passent le nom de fichier à la main [revue #4413].
  it('OUVRE un second moteur écrit en .jsx sous app/ — Next rend sept extensions, pas trois', () => {
    const sonde = join(V3, 'app', 'sonde-de-revue.jsx');
    writeFileSync(
      sonde,
      [
        'export const Sonde = () => {',
        "  const sombre = matchMedia('(prefers-color-scheme: dark)').matches;",
        "  document.documentElement.classList.toggle('dark', sombre);",
        '  return <button className="dark:bg-slate-900">thème</button>;',
        '};',
      ].join('\n'),
    );

    try {
      const rapport = audit({ racineV3: V3, racineJetons: JETONS });

      expect(fichiersDeLaV3(V3)).toContain(sonde);
      expect(rapport.moteurs.filter((m) => m.fichier === 'app/sonde-de-revue.jsx')).toHaveLength(3);
      expect(verdict(rapport)).toBe(1);
    } finally {
      unlinkSync(sonde);
    }
  });

  it('échoue, et DIT où, dès qu\'un second moteur apparaît', () => {
    const rapport = {
      ...audit({ racineV3: V3, racineJetons: JETONS }),
      moteurs: [{ fichier: 'components/carte.tsx', ligne: 3, texte: 'dark:bg-slate-900' }],
    };

    expect(verdict(rapport)).toBe(1);
    expect(formateAudit(rapport)).toContain('components/carte.tsx:3');
    expect(formateAudit(rapport)).toContain('app/theme-script.tsx');
  });

  it('échoue, et le DIT, dès qu\'un jeton suit le schéma de l\'OS', () => {
    const rapport = {
      ...audit({ racineV3: V3, racineJetons: JETONS }),
      suivis: [{ classe: 'light', propriete: '--color-bg', sombre: '#0d0e16', clair: '#f1f3f9' }],
    };

    expect(verdict(rapport)).toBe(1);
    expect(formateAudit(rapport)).toContain('--color-bg');
  });
});
