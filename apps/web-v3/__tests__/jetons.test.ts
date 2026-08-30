/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  audit,
  basculesAutomatiques,
  blocsCss,
  contrastesInsuffisants,
  couleursLitterales,
  dimensionsLitterales,
  fichiersDeLaV3,
  formateAudit,
  jetonsOrphelins,
  plansDesordonnes,
  verdict,
} from '../scripts/check-jetons.mjs';
import { contraste, luminance, resout } from '../scripts/lib/couleur.mjs';

const V3 = join(__dirname, '..');
const JETONS = join(V3, '..', '..', 'packages', 'design-tokens');
const PLANCHE = join(V3, '..', '..', 'docs', 'product', 'MeeshyWebV3Design');

const lis = (chemin: string): string => readFileSync(chemin, 'utf8');

const jetonsDe = (fichier: string, selecteur: string): Readonly<Record<string, string>> =>
  Object.assign(
    {},
    ...blocsCss(lis(join(JETONS, fichier)))
      .filter((bloc) => bloc.selecteurs.includes(selecteur))
      .map((bloc) => bloc.jetons),
  );

const SCHEMAS = [
  { nom: 'sombre', fichier: 'dark.css', selecteur: ':root' },
  { nom: 'clair', fichier: 'light.css', selecteur: ':root.light' },
] as const;

const tableServie = (schema: (typeof SCHEMAS)[number]): Readonly<Record<string, string>> => ({
  ...jetonsDe('tokens.css', ':root'),
  ...jetonsDe(schema.fichier, schema.selecteur),
});

const servi = (schema: (typeof SCHEMAS)[number], jeton: string): string => {
  const valeur = resout(tableServie(schema), jeton);
  if (valeur === null) throw new Error(`${jeton} ne se résout pas dans le schéma ${schema.nom}`);
  return valeur;
};

const rapportVide = {
  infractions: [],
  dimensions: [],
  bascules: [],
  moteurs: [],
  orphelins: [],
  contrastes: [],
  ordres: [],
  suivis: [],
};

describe('ce que la règle appelle une couleur écrite à la main', () => {
  it('refuse un hex à six chiffres', () => {
    expect(couleursLitterales('const fond = "#0d0e16";').map((v) => v.texte)).toEqual(['#0d0e16']);
  });

  it('refuse un hex à trois et à huit chiffres', () => {
    expect(couleursLitterales('a{color:#fff;border-color:#0d0e16ff}').map((v) => v.texte)).toEqual([
      '#fff',
      '#0d0e16ff',
    ]);
  });

  it('refuse une couleur écrite en rgb, hsl ou oklch', () => {
    expect(couleursLitterales('a{color:rgba(239,68,68,.15)}').map((v) => v.texte)).toEqual([
      'rgba(',
    ]);
    expect(couleursLitterales('a{color:hsl(232 40% 8%)}')).toHaveLength(1);
    expect(couleursLitterales('a{color:oklch(0.7 0.1 260)}')).toHaveLength(1);
  });

  it('refuse AUSSI lch, lab, hwb, color-mix et color — le gate ferme la FAMILLE', () => {
    expect(couleursLitterales('a{color:lch(50% 40 30)}').map((v) => v.texte)).toEqual(['lch(']);
    expect(couleursLitterales('a{color:lab(50% 40 30)}').map((v) => v.texte)).toEqual(['lab(']);
    expect(couleursLitterales('a{color:hwb(200 30% 40%)}').map((v) => v.texte)).toEqual(['hwb(']);
    expect(couleursLitterales('a{color:color(display-p3 1 0 0)}').map((v) => v.texte)).toEqual([
      'color(',
    ]);
  });

  it('refuse un mot-clé de couleur CSS — une seconde table s\'écrit aussi en white/black', () => {
    expect(
      couleursLitterales('.p{background:white;color:black;border-color:rebeccapurple}').map(
        (v) => v.texte,
      ),
    ).toEqual(['white', 'black', 'rebeccapurple']);
  });

  it('attrape le mot-clé au milieu d\'une valeur composée, et les DEUX d\'une ombre', () => {
    expect(
      couleursLitterales('a{border:1px solid tomato;box-shadow:0 0 0 1px black,0 0 0 2px white}')
        .map((v) => v.texte),
    ).toEqual(['tomato', 'black', 'white']);
  });

  it('attrape le mot-clé dans un objet de style TSX', () => {
    expect(couleursLitterales("const s = { background: 'white' };").map((v) => v.texte)).toEqual([
      'white',
    ]);
  });

  it('ne prend pas une pile de polices pour une couleur', () => {
    expect(
      couleursLitterales('a{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas}'),
    ).toEqual([]);
  });

  it('ne prend pas une fonction mathématique ni un identifiant pour une couleur', () => {
    expect(couleursLitterales('a{transform:rotate(tan(30deg))}')).toEqual([]);
    expect(couleursLitterales('a{color:var(--color-tan-500)}')).toEqual([]);
  });

  it('laisse passer transparent et currentColor — ils ne déclarent aucune valeur', () => {
    expect(couleursLitterales('a{background:transparent;border-color:currentColor}')).toEqual([]);
  });

  it("dit à quelle LIGNE se trouve ce qu'elle refuse", () => {
    expect(couleursLitterales('const a = 1;\nconst b = "#fff";')[0]).toEqual({
      ligne: 2,
      texte: '#fff',
    });
  });

  it('dit à quelle LIGNE se trouve un mot-clé, même après une déclaration', () => {
    expect(couleursLitterales('a{color:var(--x)}\nb{background:white}')[0]?.ligne).toBe(2);
  });

  it('laisse passer un jeton, seule façon autorisée de nommer une couleur', () => {
    expect(couleursLitterales('a{color:var(--color-text);background:var(--color-bg)}')).toEqual([]);
  });

  it("laisse passer une couleur DÉRIVÉE d'un jeton — la valeur reste dans la table", () => {
    expect(couleursLitterales('a{background:rgb(from var(--color-bg) r g b / 0.7)}')).toEqual([]);
    expect(couleursLitterales('a{color:color-mix(in oklab, var(--a), var(--b))}')).toEqual([]);
  });

  it("ne prend pas une ancre ni un sélecteur d'identifiant pour une couleur", () => {
    expect(couleursLitterales('<a href="#faq">')).toEqual([]);
    expect(couleursLitterales('#principal{display:block}')).toEqual([]);
  });

  it("ne prend pas une référence d'issue pour une couleur — elle vit en commentaire", () => {
    expect(couleursLitterales("// voir l'issue #4413\nconst a = 1;")).toEqual([]);
    expect(couleursLitterales('/* issue #4413 */\n:root{--x:1}')).toEqual([]);
  });

  it("attrape la couleur au milieu d'une valeur composée", () => {
    expect(couleursLitterales('a{border:1px solid #fff;box-shadow:0 0 0 2px #0d0e16}')).toHaveLength(
      2,
    );
  });

  it('garde la LIGNE juste malgré un commentaire de plusieurs lignes', () => {
    expect(couleursLitterales('/* a\nb\nc */\nconst x = "#fff";')[0]?.ligne).toBe(4);
  });
});

describe('les deux autres tiers du corollaire 2 — un rayon, une police', () => {
  it('refuse un rayon écrit à la main', () => {
    expect(dimensionsLitterales('a{border-radius:13px}').map((v) => v.texte)).toEqual([
      'border-radius: 13px',
    ]);
    expect(dimensionsLitterales('a{border-top-left-radius:11px}')).toHaveLength(1);
    expect(dimensionsLitterales('const s = { borderRadius: 13 };')).toHaveLength(1);
  });

  it('refuse une police, une taille, une graisse et un interligne écrits à la main', () => {
    expect(
      dimensionsLitterales(
        'a{font-family:"Comic Sans MS",cursive;font-size:17px;font-weight:700;line-height:1.3}',
      ),
    ).toHaveLength(4);
    expect(dimensionsLitterales('const s = { fontSize: 17, lineHeight: 1.3 };')).toHaveLength(2);
  });

  it('laisse passer la seule forme autorisée — un jeton', () => {
    expect(
      dimensionsLitterales(
        'a{border-radius:var(--radius-md);font-family:var(--font-body);font-size:var(--text-base);line-height:var(--leading-normal)}',
      ),
    ).toEqual([]);
  });

  it('laisse passer ce qui ne DÉCLARE aucune valeur de design', () => {
    expect(dimensionsLitterales('a{border-radius:inherit;font-size:inherit;line-height:0}')).toEqual(
      [],
    );
  });

  it('ne confond pas le raccourci font avec font-family', () => {
    expect(dimensionsLitterales('a{font-family:var(--font-body)}')).toEqual([]);
    expect(dimensionsLitterales('a{font:12px/1.2 Inter}').map((v) => v.texte)).toEqual([
      'font: 12px/1.2 Inter',
    ]);
  });

  it("ne prend pas une propriété voisine pour une dimension", () => {
    expect(dimensionsLitterales('a{padding:7px;-webkit-text-size-adjust:100%}')).toEqual([]);
  });
});

describe('ce que la règle appelle une bascule automatique', () => {
  it('refuse une requête de média sur le schéma de couleurs', () => {
    expect(basculesAutomatiques('@media (prefers-color-scheme: dark){:root{--x:1}}')).toEqual([
      { ligne: 1, texte: '@media (prefers-color-scheme: dark)' },
    ]);
  });

  it('refuse la forme sans espace, que le grep du critère attraperait aussi', () => {
    expect(basculesAutomatiques('@media(prefers-color-scheme:dark){}')).toHaveLength(1);
  });

  it('laisse passer une requête de média qui ne parle pas de schéma', () => {
    expect(basculesAutomatiques('@media (min-width: 768px){:root{--x:1}}')).toEqual([]);
  });
});

describe('packages/design-tokens, LA table de jetons de la v3', () => {
  const fichiers = ['tokens.css', 'dark.css', 'light.css', 'README.md', 'package.json'] as const;

  it.each(fichiers)('porte son fichier %s', (fichier) => {
    expect(lis(join(JETONS, fichier)).length).toBeGreaterThan(0);
  });

  it('est un PAQUET, donc la v3 l\'atteint par spécificateur et jamais par le disque', () => {
    const manifeste: unknown = JSON.parse(lis(join(JETONS, 'package.json')));
    const paquet = manifeste as { name?: string; exports?: Record<string, string> };

    expect(paquet.name).toBe('@meeshy/design-tokens');
    expect(paquet.exports?.['./tokens.css']).toBe('./tokens.css');
  });

  it('ne bascule jamais toute seule — aucun schéma de couleurs en requête de média', () => {
    const feuilles = fichiers.filter((fichier) => fichier.endsWith('.css'));

    expect(feuilles.flatMap((fichier) => basculesAutomatiques(lis(join(JETONS, fichier))))).toEqual(
      [],
    );
  });

  it('le laisse voir au grep du critère de fin, README compris', () => {
    const motif = ['@media', ' (prefers-color-scheme)'].join('');

    expect(fichiers.filter((fichier) => lis(join(JETONS, fichier)).includes(motif))).toEqual([]);
  });

  it('expose ses deux schémas depuis tokens.css — un seul import chez le consommateur', () => {
    const source = lis(join(JETONS, 'tokens.css'));

    expect(source).toContain("@import './dark.css'");
    expect(source).toContain("@import './light.css'");
  });

  it('sert le schéma sombre SANS classe — un navigateur sans JavaScript est servi', () => {
    expect(jetonsDe('dark.css', ':root')['--color-bg']).toBe('#0d0e16');
  });

  it('sert le schéma clair sur la classe que pose le moteur de thème', () => {
    expect(jetonsDe('light.css', ':root.light')['--color-bg']).toBeDefined();
    expect(jetonsDe('light.css', ':root.light')['--color-bg']).not.toBe(
      jetonsDe('dark.css', ':root')['--color-bg'],
    );
  });

  it("ne laisse aucun jeton de schéma sans sa jumelle dans l'autre schéma", () => {
    expect(jetonsOrphelins(JETONS)).toEqual([]);
  });

  it('reconduit exactement les jetons reconstitués de la planche (ds-shim.css)', () => {
    const shim = Object.assign(
      {},
      ...blocsCss(lis(join(PLANCHE, 'ds-shim.css'))).map((bloc) => bloc.jetons),
    ) as Record<string, string>;
    const table = { ...jetonsDe('tokens.css', ':root'), ...jetonsDe('dark.css', ':root') };

    expect(Object.keys(shim).length).toBeGreaterThan(0);
    expect(
      Object.entries(shim).filter(
        ([nom, valeur]) => table[nom]?.toLowerCase() !== valeur.toLowerCase(),
      ),
    ).toEqual([]);
  });

  it("ne déclare aucun jeton dans son README — il dit d'où viennent les valeurs, pas ce qu'elles valent", () => {
    const readme = lis(join(JETONS, 'README.md'));

    expect(readme).toContain('ds-shim.css');
    expect(readme).not.toMatch(/--[\w-]+\s*:/);
  });
});

describe('la table est LISIBLE — la dimension 5 se calcule, elle ne s\'affirme pas', () => {
  it('ne laisse aucune paire sous son seuil, dans les DEUX schémas', () => {
    expect(contrastesInsuffisants(JETONS)).toEqual([]);
  });

  it.each(SCHEMAS)('tient 4,5:1 pour le texte discret sur la surface surélevée ($nom)', (schema) => {
    expect(
      contraste(servi(schema, '--color-text-subtle'), servi(schema, '--color-surface-raised')),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SCHEMAS)("tient 4,5:1 pour l'encre d'un avatar sur chacun des quatre fonds ($nom)", (schema) => {
    const encre = servi(schema, '--color-on-avatar');

    expect(
      [1, 2, 3, 4]
        .map((rang) => contraste(encre, servi(schema, `--color-avatar-${rang}`)))
        .filter((rapport) => rapport < 4.5),
    ).toEqual([]);
  });

  it.each(SCHEMAS)('tient 3:1 pour le contour visible d\'un contrôle ($nom)', (schema) => {
    expect(
      contraste(servi(schema, '--color-border-interactive'), servi(schema, '--color-surface')),
    ).toBeGreaterThanOrEqual(3);
  });

  it('rend le rapport MESURÉ quand un jeton retombe sous son seuil', () => {
    expect(contraste('#75798c', '#22243a')).toBeCloseTo(3.53, 2);
    expect(contraste('#34d399', '#f6f7fb')).toBeCloseTo(1.8, 2);
  });
});

describe('la présence est une famille DE SCHÉMA, pas une famille hors schéma', () => {
  it('ne vit plus dans tokens.css — sa lisibilité dépend du fond', () => {
    expect(Object.keys(jetonsDe('tokens.css', ':root'))).not.toContain('--color-presence-online');
  });

  it.each(SCHEMAS)('tient 3:1 sur les quatre plans du schéma $nom', (schema) => {
    const roles = ['online', 'away', 'idle', 'offline'];
    const plans = ['--color-bg-sunken', '--color-bg', '--color-surface', '--color-surface-raised'];

    expect(
      roles.flatMap((role) =>
        plans
          .map((plan) => contraste(servi(schema, `--color-presence-${role}`), servi(schema, plan)))
          .filter((rapport) => rapport < 3),
      ),
    ).toEqual([]);
  });

  it('garde en SOMBRE les valeurs citées de CLAUDE.md', () => {
    const sombre = SCHEMAS[0];

    expect(servi(sombre, '--color-presence-online')).toBe('#34d399');
    expect(servi(sombre, '--color-presence-away')).toBe('#fbbf24');
    expect(servi(sombre, '--color-presence-idle')).toBe('#9ca3af');
  });
});

describe('les plans de surface sont ORDONNÉS — une parité de clés ne dit rien d\'une palette', () => {
  it('ne laisse aucune élévation en creux, dans les DEUX schémas', () => {
    expect(plansDesordonnes(JETONS)).toEqual([]);
  });

  it.each(SCHEMAS)('monte en luminance du plus enfoncé au plus surélevé ($nom)', (schema) => {
    const plans = ['--color-bg-sunken', '--color-bg', '--color-surface', '--color-surface-raised'];
    const luminances = plans.map((plan) => luminance(servi(schema, plan)));

    expect(luminances).toEqual([...luminances].sort((a, b) => a - b));
    expect(new Set(luminances).size).toBe(plans.length);
  });

  it('ne confond plus « surélevé » et « enfoncé » en clair — ils valaient 1,00:1', () => {
    const clair = SCHEMAS[1];

    expect(
      contraste(servi(clair, '--color-surface-raised'), servi(clair, '--color-bg-sunken')),
    ).toBeGreaterThan(1.05);
  });
});

describe('le thème par défaut, et ce qui le sert sans JavaScript', () => {
  it('déclare color-scheme dans la TABLE, où il suit la classe sans JS', () => {
    expect(lis(join(JETONS, 'dark.css'))).toMatch(
      /:root,\s*:root\.dark\s*\{[^}]*color-scheme:\s*dark/,
    );
    expect(lis(join(JETONS, 'light.css'))).toMatch(/:root\.light\s*\{[^}]*color-scheme:\s*light/);
  });

  it('ne laisse plus le script poser color-scheme — il ne fait que corriger la classe', async () => {
    const { themeScriptSource } = await import('../app/theme-script');

    expect(themeScriptSource).not.toContain('colorScheme');
    expect(themeScriptSource).toContain('classList.add');
  });

  it('rend la classe par défaut côté SERVEUR — sans elle, les utilitaires dark: sont inactifs', async () => {
    const { THEME_PAR_DEFAUT } = await import('../app/theme-script');
    const layout = lis(join(V3, 'app', 'layout.tsx'));

    expect(THEME_PAR_DEFAUT).toBe('dark');
    expect(layout).toContain('className={THEME_PAR_DEFAUT}');
  });

  // « sert bien CE thème-là quand aucune classe ne le corrige » vivait ici et
  // était TAUTOLOGIQUE [revue #4413] : il comparait `jetonsDe('dark.css',
  // ':root')` à `jetonsDe(schemaDeDefaut.fichier, ':root')`, où
  // `schemaDeDefaut.fichier` VAUT `'dark.css'` — le même appel, deux fois. Il ne
  // pouvait pas tomber si `THEME_PAR_DEFAUT` divergeait de ce que la classe par
  // défaut sert. La propriété est prouvée, elle, par
  // `moteur-de-theme.test.ts` § « sert une table complète à un navigateur SANS
  // JavaScript », qui compare DEUX chemins de résolution distincts (la cascade
  // sous zéro classe contre la cascade sous la classe de `THEME_PAR_DEFAUT`) —
  // un site, pas deux.
});

describe('la feuille de la v3 qui consomme la table', () => {
  it('importe les jetons PAR SPÉCIFICATEUR, et rien qui les redéclare', () => {
    const globals = lis(join(V3, 'app', 'globals.css'));

    expect(globals).toContain("@import '@meeshy/design-tokens/tokens.css'");
    expect(globals.match(/^\s*@import\s+'([^']+)'/gm)).toEqual([
      "@import '@meeshy/design-tokens/tokens.css'",
    ]);
    expect(couleursLitterales(globals)).toEqual([]);
    expect(dimensionsLitterales(globals)).toEqual([]);
  });

  it('déclare la table en dépendance — ce que l\'image doit embarquer se lit au manifeste', () => {
    const manifeste: unknown = JSON.parse(lis(join(V3, 'package.json')));
    const dependances = (manifeste as { dependencies?: Record<string, string> }).dependencies;

    expect(dependances?.['@meeshy/design-tokens']).toBe('workspace:*');
  });

  it("est chargée par la coquille racine — un jeton qui n'atteint aucun pixel ne sert personne", () => {
    expect(lis(join(V3, 'app', 'layout.tsx'))).toContain('globals.css');
  });
});

describe('le scan de apps/web-v3', () => {
  it('énumère les sources rendues, jamais les fixtures ni ce qui est construit', () => {
    const fichiers = fichiersDeLaV3(V3);

    expect(fichiers).toContain(join(V3, 'app', 'layout.tsx'));
    expect(fichiers).toContain(join(V3, 'app', 'globals.css'));
    expect(fichiers.filter((f) => f.includes('__tests__'))).toEqual([]);
    expect(fichiers.filter((f) => f.includes('node_modules') || f.includes('.next'))).toEqual([]);
  });

  it("ne trouve AUJOURD'HUI aucun défaut dans la v3", () => {
    const rapport = audit({ racineV3: V3, racineJetons: JETONS });

    expect(rapport).toEqual(rapportVide);
    expect(verdict(rapport)).toBe(0);
  });

  it('est câblé au lint — un gate qui ne tourne nulle part ne garde personne', () => {
    const manifeste: unknown = JSON.parse(lis(join(V3, 'package.json')));
    const lint = (manifeste as { scripts?: Record<string, string> }).scripts?.lint;

    expect(lint).toContain('check-jetons.mjs');
  });

  it("échoue, et DIT où, dès qu'une couleur est écrite à la main", () => {
    const rapport = {
      ...rapportVide,
      infractions: [{ fichier: 'app/page.tsx', ligne: 12, texte: '#0d0e16' }],
    };

    expect(verdict(rapport)).toBe(1);
    expect(formateAudit(rapport)).toContain('app/page.tsx');
    expect(formateAudit(rapport)).toContain('#0d0e16');
    expect(formateAudit(rapport)).toContain('design-tokens');
  });

  it("échoue, et DIT où, dès qu'un rayon est écrit à la main", () => {
    const rapport = {
      ...rapportVide,
      dimensions: [{ fichier: 'app/page.tsx', ligne: 7, texte: 'border-radius: 13px' }],
    };

    expect(verdict(rapport)).toBe(1);
    expect(formateAudit(rapport)).toContain('border-radius: 13px');
    expect(formateAudit(rapport)).toContain('--radius-');
  });

  it("échoue, et DIT où, dès qu'un jeton bascule tout seul", () => {
    const rapport = {
      ...rapportVide,
      bascules: [{ fichier: 'dark.css', ligne: 3, texte: '@media (prefers-color-scheme: dark)' }],
    };

    expect(verdict(rapport)).toBe(1);
    expect(formateAudit(rapport)).toContain('dark.css');
    expect(formateAudit(rapport)).toContain('theme-script');
  });

  it("échoue, et le DIT, dès qu'un jeton de schéma perd sa jumelle", () => {
    const rapport = {
      ...rapportVide,
      orphelins: [{ fichier: 'light.css', jeton: '--color-orpheline', manque: 'dark.css' }],
    };

    expect(verdict(rapport)).toBe(1);
    expect(formateAudit(rapport)).toContain('--color-orpheline');
    expect(formateAudit(rapport)).toContain('absent de dark.css');
  });

  it("échoue, et le DIT, dès qu'une paire passe sous son seuil", () => {
    const rapport = {
      ...rapportVide,
      contrastes: [
        {
          schema: 'sombre',
          encre: '--color-text-subtle',
          fond: '--color-surface-raised',
          seuil: 4.5,
          rapport: 3.53,
        },
      ],
    };

    expect(verdict(rapport)).toBe(1);
    expect(formateAudit(rapport)).toContain('3.53');
    expect(formateAudit(rapport)).toContain('--color-text-subtle');
  });

  it("échoue, et le DIT, dès qu'une élévation se peint en creux", () => {
    const rapport = {
      ...rapportVide,
      ordres: [
        {
          schema: 'clair',
          dessous: '--color-surface',
          plan: '--color-surface-raised',
          ecart: -0.04,
        },
      ],
    };

    expect(verdict(rapport)).toBe(1);
    expect(formateAudit(rapport)).toContain("n'est pas plus clair que");
  });
});
