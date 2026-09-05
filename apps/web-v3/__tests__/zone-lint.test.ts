/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Linter } from 'eslint';

import { frontiereDeZone } from '../eslint/frontiere-de-zone.mjs';
import {
  COMPOSE_DE_PRODUCTION,
  ROUTEUR_V3,
  ZONE_DACTIFS,
  litLePerimetreSiPresent,
  perimetreDeNavigation,
} from '../scripts/lib/perimetre-de-zone.mjs';
import type { CheminReclame } from '../scripts/lib/perimetre-de-zone.mjs';

const ROOT = join(__dirname, '..');
const DEPOT = join(ROOT, '..', '..');
const ESLINT = join(ROOT, 'node_modules', '.bin', 'eslint');
const PROBE = join(ROOT, 'app', 'zone-lint-probe.tsx');

type LintMessage = {
  readonly ruleId: string | null;
  readonly severity: number;
  readonly line: number;
  readonly message: string;
};
type LintResult = { readonly messages: readonly LintMessage[] };

const hasStdout = (value: unknown): value is { stdout: string } =>
  typeof value === 'object' && value !== null && typeof (value as { stdout?: unknown }).stdout === 'string';

const eslintJson = (args: readonly string[], options: { cwd: string; input?: string }): readonly LintResult[] => {
  const stdout = ((): string => {
    try {
      return execFileSync(ESLINT, [...args], { ...options, encoding: 'utf8' });
    } catch (error: unknown) {
      if (hasStdout(error)) return error.stdout;
      throw error;
    }
  })();

  return JSON.parse(stdout);
};

const lintTout = (source: string): readonly LintMessage[] =>
  eslintJson(['--no-color', '--format', 'json', '--stdin', '--stdin-filename', PROBE], {
    cwd: ROOT,
    input: source,
  }).flatMap((result) => result.messages);

const lint = (source: string): readonly LintMessage[] =>
  lintTout(source).filter((m) => m.ruleId === 'no-restricted-imports');

const FORBIDDEN_FORMS: readonly (readonly [string, string])[] = [
  ['la fonte @phosphor-icons/web par son sous-chemin CSS documenté', "import '@phosphor-icons/web/regular/style.css';"],
  ['la fonte @phosphor-icons/web par sa racine', "import '@phosphor-icons/web';"],
  ['lucide-react icône par icône', "import { House } from 'lucide-react/dist/esm/icons/house';"],
  ['lucide-react par sa racine', "import { List } from 'lucide-react';"],
  // Les deux formes que l'ABSENCE ne bloque pas : `@phosphor-icons/core` est une
  // devDependency de la RACINE, donc RÉSOLVABLE depuis apps/web-v3 (contrairement
  // à lucide-react, qui n'est déclaré nulle part). Sans ces lignes, un fichier de
  // la v3 court-circuite le sprite, une requête par icône, et tous les gates
  // restent verts. `@phosphor-icons/react` est barré d'avance : la conception le
  // rejette nommément, et son installation ne doit pas rouvrir la porte.
  [
    'les tracés source @phosphor-icons/core, que le sprite a déjà payés',
    "import play from '@phosphor-icons/core/assets/regular/play.svg';",
  ],
  ['@phosphor-icons/react, qui bundle les 6 poids par icône', "import { Play } from '@phosphor-icons/react';"],
  ['un second moteur de thème par un sous-chemin', "import 'next-themes/dist/index.js';"],
];

const PROBE_SOURCE = `${FORBIDDEN_FORMS.map(([, line]) => line).join('\n')}\nexport const probe = [House, List, play, Play];\n`;

jest.setTimeout(180_000);

describe('les lints de zone de la v3', () => {
  const refused = lint(PROBE_SOURCE);

  it.each(FORBIDDEN_FORMS.map(([label], index) => [label, index + 1] as const))(
    'refuse %s',
    (_label, line) => {
      expect(refused.map((message) => message.line)).toContain(line);
    },
  );

  // Un témoin qui n'énumère PAS ce que la config interdit ne mord pas : on
  // ajoute un `root` au lint, aucune sonde ne le couvre, et la suite reste
  // verte. Le compte se dérive de la config plutôt que d'être recopié — un
  // nombre en dur serait la jumelle de la liste qu'il prétend garder.
  it('sonde CHAQUE forme que la config interdit — aucune ajoutée sans témoin', () => {
    const config = readFileSync(join(ROOT, 'eslint.config.mjs'), 'utf8');
    const roots = [...config.matchAll(/\{\s*root:\s*'([^']+)'/g)].map(([, root]) => root);

    expect(roots).toHaveLength(5);
    roots.forEach((root) =>
      expect(FORBIDDEN_FORMS.some(([, ligne]) => ligne.includes(`'${root}`))).toBe(true),
    );
  });

  it("dit POURQUOI un import est refusé, jamais seulement qu'il l'est", () => {
    expect(refused.filter((m) => m.message.includes('sprite')).length).toBeGreaterThan(0);
    expect(refused.filter((m) => m.message.includes('moteur')).length).toBeGreaterThan(0);
  });

  it('laisse passer ce que la v3 utilise réellement', () => {
    expect(lint("import type { ReactNode } from 'react';\nexport type A = ReactNode;\n")).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// LA FRONTIÈRE DE ZONE (§ 3.2 corollaire 4, § 4.9)
// ───────────────────────────────────────────────────────────────────────────
// Le périmètre n'est recopié NULLE PART, ici pas plus qu'ailleurs : chaque étape
// du § 4.9 se fabrique en écrivant la LIGNE de compose de cette étape et en la
// passant au site unique (`perimetreDeNavigation`). Un objet `{matcher, valeur}`
// écrit à la main serait la jumelle du parseur qu'il prétend gager — et c'est
// précisément par une jumelle, celle de `scripts/check-v3-pipeline.mjs`, que le
// prédicat s'est mis à contredire Traefik sur `Path(`/`)` [revue #4414].
//
// Les sondes tournent par l'API `Linter`, pas par un sous-processus : elles
// doivent juger un périmètre FUTUR (l'étape 7 met `/` dans la règle), et le
// sous-processus ne sait lire que le compose du dépôt, c'est-à-dire l'étape 1 —
// le seul état où le périmètre est vide, donc le seul où plusieurs défauts sont
// indistinguables. La config LIVRÉE, elle, est gagée plus bas, sur le compose réel.
const ligneDeCompose = (regle: string): string =>
  `      - "traefik.http.routers.${ROUTEUR_V3}.rule=(Host(\`meeshy.me\`)) && (${regle})"\n`;

const ACTIFS = `PathPrefix(\`${ZONE_DACTIFS}\`)`;

const perimetreDeLEtape = (regle: string): readonly CheminReclame[] =>
  perimetreDeNavigation(ligneDeCompose(regle));

const SORTANT = 'zone/lien-sortant-en-navigation-client';
const INTERNE = 'zone/lien-interne-en-rechargement';

type Sonde = readonly [libelle: string, jsx: string, attendu: string | null, severite: number];

type Etape = {
  readonly libelle: string;
  readonly regle: string;
  readonly sondes: readonly Sonde[];
};

const ETAPES: readonly Etape[] = [
  {
    // Étape 1 — « rien ne bascule, zéro trafic humain, seuls ses bundles sont
    // joignables ». Le périmètre de NAVIGATION est donc vide, et c'est la
    // lecture juste : tout `<Link>` est cassé, aucun `<a>` n'est de trop.
    libelle: "étape 1 — la règle ne réclame que la zone d'ACTIFS",
    regle: ACTIFS,
    sondes: [
      ["un <Link> vers une route que la v3 ne sert pas", '<Link href="/settings">réglages</Link>', SORTANT, 2],
      ['la MÊME cible en <a> réel', '<a href="/settings">réglages</a>', null, 0],
      ["un <Link> vers /l, que la v3 ne sert PAS ENCORE", '<Link href="/l/abc">lien</Link>', SORTANT, 2],
      // LE défaut que ce lot corrige : la zone d'actifs n'est pas un périmètre
      // de routes. Confondue avec lui, elle faisait recommander `<Link>` sur
      // une URL de BUNDLE — le seul input que la règle pouvait alors atteindre,
      // et celui où son conseil est faux.
      [
        "un <a download> vers un ACTIF de la zone — un bundle n'est pas une page",
        `<a href="${ZONE_DACTIFS}/static/media/guide.pdf" download>guide</a>`,
        null,
        0,
      ],
    ],
  },
  {
    libelle: 'étape 2 — /l/ entre dans la règle, avec sa barre finale',
    regle: `${ACTIFS} || PathPrefix(\`/l/\`)`,
    sondes: [
      ['un <Link> vers /l/ — la v3 la sert', '<Link href="/l/abc">lien</Link>', null, 0],
      ['la MÊME cible en <a> — signalé, jamais refusé', '<a href="/l/abc">lien</a>', INTERNE, 1],
      ['/login reste au legacy, la barre finale l’en protège', '<Link href="/login">entrer</Link>', SORTANT, 2],
      ["un <a> vers un ACTIF — toujours pas une page", `<a href="${ZONE_DACTIFS}/x.js">x</a>`, null, 0],
    ],
  },
  {
    // LE MODÈLE SUIT TRAEFIK, ET TRAEFIK NE SEGMENTE PAS.
    //
    // Cette colonne a d'abord porté `PathPrefix(`/l`)` avec l'attente que
    // `/login` en soit DEHORS. C'était le modèle du dépôt, pas celui de
    // l'aiguilleur : mesuré sur staging le 2026-09-01, `/login`, `/links` et
    // `/lien` étaient tous les trois servis par la ZONE, donc par le 404 du
    // routeur Pages de la v3, alors que le legacy les sert. `/login` est
    // l'appel à l'action de la vitrine.
    //
    // Un modèle PLUS PRUDENT que la réalité ne protège de rien : il déclare une
    // frontière que personne ne trace. Le témoin dit donc désormais ce que
    // Traefik FAIT — et c'est l'invariant « aucun PathPrefix ne vole une route
    // voisine du legacy » de `scripts/check-v3-pipeline.mjs` qui interdit
    // d'ÉCRIRE une telle règle.
    libelle: 'un PathPrefix SANS barre finale emporte ses voisins de chaîne',
    regle: `${ACTIFS} || PathPrefix(\`/l\`)`,
    sondes: [
      ['/l/abc — la cible voulue', '<Link href="/l/abc">lien</Link>', null, 0],
      ['/login — emporté, et la v3 ne le sert pas', '<Link href="/login">entrer</Link>', null, 0],
      ['/links — emporté lui aussi', '<Link href="/links">liens</Link>', null, 0],
      ['/settings — hors du préfixe, il reste au legacy', '<Link href="/settings">réglages</Link>', SORTANT, 2],
    ],
  },
  {
    // Étape 7 — « vide le routeur legacy ». C'est l'étape où toute
    // l'application est en v3 et où `<Link>` est universellement CORRECT ; le
    // prédicat comparait alors contre `//` et rendait chaque `<Link>` fautif.
    libelle: 'étape 7 — / entre dans la règle et vide le routeur legacy',
    regle: `${ACTIFS} || PathPrefix(\`/\`)`,
    sondes: [
      ['un <Link> vers /settings — la v3 sert tout', '<Link href="/settings">réglages</Link>', null, 0],
      ['un <Link> vers une route profonde', '<Link href="/chats/1">fil</Link>', null, 0],
      ['un <Link> vers la racine elle-même', '<Link href="/">accueil</Link>', null, 0],
      ['un <a> vers /settings — un rechargement inutile', '<a href="/settings">réglages</a>', INTERNE, 1],
      ["un <Link> vers une route paramétrée, écrite en gabarit", '<Link href={`/settings/${identifiant}`}>réglages</Link>', null, 0],
      ['une autre origine — aucune des deux zones ne la sert', '<a href="https://meeshy.me/aide">aide</a>', null, 0],
      ['une ancre du document courant', '<a href="#contenu">contenu</a>', null, 0],
      ['un protocole qui ne navigue pas', '<a href="mailto:bonjour@meeshy.me">écrire</a>', null, 0],
      ["un //hôte/chemin — protocol-relative, donc une AUTRE origine", '<a href="//cdn.meeshy.me/a.png">actif</a>', null, 0],
    ],
  },
  {
    // `Path` est une ÉGALITÉ. Le parseur d'ici ne le reconnaissait pas et le
    // jetait EN SILENCE, là où celui de `check-v3-pipeline.mjs` le rendait :
    // deux lectures de la même ligne, deux verdicts.
    libelle: 'un Path(`/`) ne réclame que la racine, jamais ce qui est dessous',
    regle: `${ACTIFS} || Path(\`/\`)`,
    sondes: [
      ['un <Link> vers la racine exacte', '<Link href="/">accueil</Link>', null, 0],
      ['un <Link> vers un sous-chemin, que Path ne réclame pas', '<Link href="/settings">réglages</Link>', SORTANT, 2],
    ],
  },
];

const PREMIERE_SONDE = 4;

const sourceDesSondes = (sondes: readonly Sonde[]): string =>
  [
    "import Link from 'next/link';",
    'export const identifiant = String(1);',
    'export const sondes = [',
    ...sondes.map(([, jsx]) => `  ${jsx},`),
    '];',
  ].join('\n');

const linter = new Linter();

const lintDeFrontiere = (
  perimetre: readonly CheminReclame[],
  source: string,
): readonly LintMessage[] =>
  linter.verify(
    source,
    [
      {
        files: ['**/*.tsx'],
        plugins: { zone: frontiereDeZone },
        languageOptions: {
          ecmaVersion: 2023,
          sourceType: 'module',
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        rules: {
          [SORTANT]: ['error', { perimetre }],
          [INTERNE]: ['warn', { perimetre }],
        },
      },
    ],
    'sondes.tsx',
  ) as readonly LintMessage[];

describe.each(ETAPES.map((etape) => [etape.libelle, etape] as const))(
  'la frontière de zone v3 ↔ legacy — %s',
  (_libelle, etape) => {
    const perimetre = perimetreDeLEtape(etape.regle);
    const messages = lintDeFrontiere(perimetre, sourceDesSondes(etape.sondes));
    const surLaLigne = (ligne: number): readonly LintMessage[] =>
      messages.filter((m) => m.line === ligne);

    it.each(etape.sondes.map((sonde, index) => [sonde[0], index] as const))(
      '%s',
      (_label, index) => {
        const [, , attendu, severite] = etape.sondes[index] as Sonde;
        const trouves = surLaLigne(PREMIERE_SONDE + index);

        expect(trouves.map((m) => m.ruleId)).toEqual(attendu === null ? [] : [attendu]);
        expect(trouves.map((m) => m.severity)).toEqual(attendu === null ? [] : [severite]);
      },
    );
  },
);

describe('ce que le périmètre de navigation EST', () => {
  it("ne contient jamais la zone d'ACTIFS — un bundle n'est pas une route humaine", () => {
    ETAPES.forEach((etape) =>
      expect(perimetreDeLEtape(etape.regle).map(({ valeur }) => valeur)).not.toContain(ZONE_DACTIFS),
    );
  });

  it('est VIDE à l’étape 1, et le dit plutôt que de fabriquer une page sous /__v3/_next', () => {
    expect(perimetreDeLEtape(ACTIFS)).toEqual([]);
  });

  it('rend le matcher, jamais seulement la valeur — Path et PathPrefix ne réclament pas pareil', () => {
    expect(perimetreDeLEtape(`${ACTIFS} || Path(\`/\`)`)).toEqual([{ matcher: 'Path', valeur: '/' }]);
    expect(perimetreDeLEtape(`${ACTIFS} || PathPrefix(\`/l\`)`)).toEqual([
      { matcher: 'PathPrefix', valeur: '/l' },
    ]);
  });

  it("dit POURQUOI un lien sortant est refusé, jamais seulement qu’il l’est", () => {
    const refus = lintDeFrontiere(
      perimetreDeLEtape(`${ACTIFS} || PathPrefix(\`/l\`)`),
      sourceDesSondes([['x', '<Link href="/settings">réglages</Link>', SORTANT, 2]]),
    ).filter((m) => m.ruleId === SORTANT);

    expect(refus.length).toBe(1);
    refus.forEach((m) => {
      expect(m.message).toContain('/settings');
      expect(m.message).toContain('zone');
    });
  });
});

// La config LIVRÉE, sur le compose RÉEL : les sondes ci-dessus jugent les
// RÈGLES, celle-ci juge leur CÂBLAGE. Sans elle, on pourrait retirer les deux
// règles de `eslint.config.mjs` sans qu'un seul témoin ne rougisse.
describe('la config livrée câble la frontière sur le compose du dépôt', () => {
  const perimetreReel = perimetreDeNavigation(readFileSync(join(DEPOT, COMPOSE_DE_PRODUCTION), 'utf8'));

  it("lit son périmètre au routeur de production, jamais dans une liste recopiée", () => {
    expect(perimetreReel).toEqual(perimetreDeLEtape(ACTIFS));
  });

  it("refuse un <Link> hors zone dans le lint réel, sur le fichier réel", () => {
    const messages = lintTout(
      'import Link from \'next/link\';\nexport const s = <Link href="/settings">réglages</Link>;\n',
    );

    expect(messages.filter((m) => m.ruleId === SORTANT).map((m) => m.severity)).toEqual([2]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// `@next/next/no-html-link-for-pages`, ÉTEINTE
// ───────────────────────────────────────────────────────────────────────────
// La règle ne se déclenche que si une PAGE d'App Router porte l'URL visée :
// tant que la v3 n'en émet aucune, elle dort, et une assertion sur le lint
// courant ne prouverait rien. La condition qui la RÉVEILLE se fabrique donc —
// mais JAMAIS dans `apps/web-v3/app/`.
//
// La première écriture de ce témoin y écrivait `app/page.tsx` en `wx` et le
// supprimait dans un `afterAll` INCONDITIONNEL : un développeur qui écrivait la
// vraie page racine (étape 7 du § 4.9) la perdait au premier `bun run test`, et
// définitivement si elle n'était pas commitée. Le commentaire affirmait pourtant
// « échouera bruyamment AU LIEU DE LA SUPPRIMER EN SILENCE » — il faisait les
// deux. Aggravant : jest tourne à `--maxWorkers=50%`, donc le fichier
// apparaissait et disparaissait de `app/` PENDANT que d'autres suites balaient
// `app/` (`check-jetons.mjs`, `jetons.test.ts`, `zone-cycle-de-vie.test.ts`).
//
// Un projet JETABLE lève les deux défauts d'un coup : rien n'est écrit dans
// l'arbre de production, donc rien n'y est supprimé et rien n'y clignote.
// [revue #4414]
const projetJetable = <T,>(faire: (racine: string) => T): T => {
  const racine = mkdtempSync(join(tmpdir(), 'zone-lint-'));
  racinesUtilisees.push(racine);
  try {
    mkdirSync(join(racine, 'app'));
    writeFileSync(join(racine, 'app', 'page.tsx'), 'export default function P() {\n  return <p>racine</p>;\n}\n');
    writeFileSync(join(racine, 'app', 'sonde.tsx'), 'export const sortie = <a href="/">accueil</a>;\n');
    return faire(racine);
  } finally {
    rmSync(racine, { recursive: true, force: true });
  }
};

const CONFIG_LIVREE = join(ROOT, 'eslint.config.mjs');

const racinesUtilisees: string[] = [];

const lintDuProjetJetable = (racine: string, config: string): readonly LintMessage[] => {
  writeFileSync(join(racine, 'sonde.config.mjs'), config);
  return eslintJson(
    ['--no-color', '--format', 'json', '--config', './sonde.config.mjs', 'app/sonde.tsx'],
    { cwd: racine },
  ).flatMap((result) => result.messages);
};

const HERITEE = '@next/next/no-html-link-for-pages';

describe("la règle héritée qui pousse vers <Link> à la frontière", () => {
  const verdicts = projetJetable((racine) => ({
    livree: lintDuProjetJetable(racine, `export { default } from '${CONFIG_LIVREE}';\n`),
    // La MÊME config, la règle forcée : sans ce second verdict, le premier ne
    // dirait pas si la règle est éteinte ou seulement endormie.
    reveillee: lintDuProjetJetable(
      racine,
      `import base from '${CONFIG_LIVREE}';\nexport default [...base, { rules: { '${HERITEE}': 'error' } }];\n`,
    ),
  }));

  it('dort vraiment dans le projet jetable — sinon le témoin ne prouverait rien', () => {
    expect(verdicts.reveillee.map((m) => m.ruleId)).toContain(HERITEE);
  });

  it("ne refuse plus un <a> vers une page émise par la v3 — c'est le lint de zone qui juge", () => {
    expect(verdicts.livree.map((m) => m.ruleId)).not.toContain(HERITEE);
  });

  // Le défaut corrigé n'était pas « le témoin échoue mal » mais « le témoin
  // DÉTRUIT un fichier de production ». Ce qui l'empêche de revenir n'est pas
  // une assertion sur le verdict : c'est l'ADRESSE du projet qui porte la
  // condition. Elle est donc gagée, et rien ne subsiste après le nettoyage.
  it("fabrique sa condition HORS de l'arbre de production, et ne laisse rien derrière", () => {
    expect(racinesUtilisees.length).toBeGreaterThan(0);
    racinesUtilisees.forEach((racine) => {
      expect(racine.startsWith(ROOT)).toBe(false);
      expect(racine.startsWith(tmpdir())).toBe(true);
      expect(existsSync(racine)).toBe(false);
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// LE COMPOSE HORS DU CONTEXTE — ce que fait le lint DANS L'IMAGE
// ───────────────────────────────────────────────────────────────────────────
// `eslint.config.mjs` lit la règle du routeur, qui vit à la RACINE. `next build`
// charge cette config, et l'étage builder du Dockerfile ne copie que
// `apps/web-v3/` (`.dockerignore` exclut de plus `docker-compose*.yml`) : dans
// l'image, le fichier est ABSENT. Mesuré en déplaçant le compose hors du dépôt,
// AVANT ce repli : « ⨯ ESLint: ENOENT … docker-compose.prod.yml », et le build
// sortait tout de même en RC=0. La passe ne lintait donc RIEN, en rouge — et
// `workspace-contract.test.ts` (« le build ne masque aucune erreur ESLint »)
// restait vert sur une garantie VIDE. Un contrat tenu sur le papier et creux
// dans l'image est exactement ce que ce lot corrige ailleurs [revue #4414].
describe('le périmètre, quand le compose est hors du contexte', () => {
  it("rend null, et non un périmètre vide — l'absence n'est pas un verdict", () => {
    const horsContexte = mkdtempSync(join(tmpdir(), 'v3-sans-compose-'));
    try {
      expect(litLePerimetreSiPresent(horsContexte)).toBeNull();
    } finally {
      rmSync(horsContexte, { recursive: true, force: true });
    }
  });

  // « null » et « vide » ne sont pas la même chose, et les confondre serait le
  // pire des deux mondes : un périmètre VIDE affirme « la v3 ne sert aucune
  // route humaine », ce qui rendrait fautif TOUT `<Link>` de l'application à
  // l'étape 7 du § 4.9 — celle où `<Link>` devient universel.
  it('ne se confond pas avec le périmètre vide de l’étape 1, qui lui est un verdict', () => {
    expect(perimetreDeLEtape(ACTIFS)).toEqual([]);
    expect(perimetreDeLEtape(ACTIFS)).not.toBeNull();
  });

  // Ce qui reste une ERREUR : un compose PRÉSENT dont la règle est corrompue.
  // La tolérance ne porte que sur l'absence du fichier — une règle manquante,
  // vide ou déclarée deux fois est une corruption du site unique.
  it('refuse un compose présent dont la règle du routeur est absente', () => {
    const racine = mkdtempSync(join(tmpdir(), 'v3-compose-muet-'));
    try {
      writeFileSync(join(racine, COMPOSE_DE_PRODUCTION), 'services:\n  frontend-v3:\n');
      expect(() => litLePerimetreSiPresent(racine)).toThrow(/absente/);
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });

  // CE QUI N'EST PAS TESTÉ ICI, et pourquoi. « Le lint continue de mordre sans
  // le compose » ne se gage pas par un projet jetable : `lintDuProjetJetable`
  // ré-exporte la config LIVRÉE, dont le `ICI` reste le vrai `apps/web-v3` — la
  // racine résolue est donc le vrai dépôt, compose PRÉSENT. Un tel témoin
  // n'exercerait pas le repli et affirmerait le contraire de ce qu'il prouve.
  // La mesure se fait là où la condition est réelle : compose déplacé hors du
  // dépôt, puis `next build`. Relevé après ce lot — plus aucun « ⨯ ESLint:
  // ENOENT », la passe « Linting and checking validity of types » s'exécute, et
  // le build sort en RC=0.
});
