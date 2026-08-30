/**
 * @jest-environment node
 *
 * Ce que ce temoin gage : il existe UN rapport, il invoque les QUATRE mesures
 * de la machine de verification (§ 9), et il n'est jamais vert quand l'une
 * d'elles n'a pas pu tourner.
 *
 * Le defaut qu'il attrape est celui d'un tableau de bord qui rassure : quatre
 * mesures dont deux n'ont pas tourne, un vert en bas de page, et personne ne
 * regarde. Le rapport a donc TROIS verdicts et trois codes de sortie —
 * `vert` (0), `echec` (1), `incomplet` (3) — et `echec` prime sur `incomplet` :
 * une mesure qui ROUGIT ne doit jamais etre masquee par une mesure absente.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const zoneRoot = join(__dirname, '..');
const script = join(zoneRoot, 'scripts', 'rapport-verification.mjs');

type Mesure = {
  readonly id: string;
  readonly titre: string;
  readonly commande: string;
  readonly statut: string;
  readonly code: number | null;
  readonly raison?: string;
  readonly chiffres?: Readonly<Record<string, unknown>>;
};

type Rapport = {
  readonly verdict: string;
  readonly mesures: readonly Mesure[];
};

const lancer = (...args: readonly string[]): { code: number; stdout: string; rapport: Rapport } => {
  const json = join(mkdtempSync(join(tmpdir(), 'web-v3-rapport-')), 'rapport.json');
  let code = 0;
  let stdout = '';
  try {
    stdout = execFileSync(process.execPath, [script, '--json', json, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000,
    });
  } catch (erreur) {
    const e = erreur as { status?: number; stdout?: string };
    code = e.status ?? -1;
    stdout = e.stdout ?? '';
  }
  return { code, stdout, rapport: JSON.parse(readFileSync(json, 'utf8')) as Rapport };
};

const mesure = (rapport: Rapport, id: string): Mesure => {
  const trouvee = rapport.mesures.find((m) => m.id === id);
  if (trouvee === undefined) throw new Error(`le rapport ne porte pas la mesure « ${id} »`);
  return trouvee;
};

/** Une zone construite, dont l'unique route pese plus que son plafond. */
const zoneHorsBudget = (): string => {
  const racine = mkdtempSync(join(tmpdir(), 'web-v3-zone-'));
  const ecrire = (relatif: string, contenu: string): void => {
    mkdirSync(join(racine, dirname(relatif)), { recursive: true });
    writeFileSync(join(racine, relatif), contenu);
  };
  ecrire('.next/static/chunks/lourd.js', 'x'.repeat(50000));
  ecrire(
    '.next/app-build-manifest.json',
    JSON.stringify({ pages: { '/(public)/stories/[id]/page': ['static/chunks/lourd.js'] } }),
  );
  ecrire(
    'budgets.json',
    JSON.stringify({ groupes: { '(public)': { socle: 1, ecran: 1, statut: 'GATE' } }, routes: {} }),
  );
  return racine;
};

describe('le rapport unique invoque les quatre mesures de la machine de verification', () => {
  const { code, stdout, rapport } = lancer('--sans-navigateur');

  it('les porte toutes les quatre, nommees', () => {
    expect(rapport.mesures.map((m) => m.id).sort()).toEqual([
      'budget-bundle',
      'ordre',
      'poids-reseau',
      'rendu',
    ]);
  });

  it('cite pour chacune la commande qui la rejoue', () => {
    for (const m of rapport.mesures) {
      expect(m.commande).toMatch(/^node /);
    }
  });

  it("rend le gate d'ordre VERT, avec ses chiffres — c'est la mesure qui tourne partout", () => {
    expect(mesure(rapport, 'ordre').statut).toBe('vert');
    expect(mesure(rapport, 'ordre').chiffres).toEqual(
      expect.objectContaining({ ecrans: 44, lots: 10 }),
    );
  });

  it('rend le budget de bundle selon ce que la zone a REELLEMENT construit', () => {
    const construite = existsSync(join(zoneRoot, '.next', 'app-build-manifest.json'));

    expect(mesure(rapport, 'budget-bundle').statut).toBe(construite ? 'vert' : 'non-executee');
  });

  it("declare non-executees, avec leur raison, les deux mesures qui exigent un navigateur", () => {
    for (const id of ['rendu', 'poids-reseau']) {
      expect(mesure(rapport, id).statut).toBe('non-executee');
      expect(mesure(rapport, id).raison).toMatch(/navigateur/i);
    }
  });

  it("n'est PAS vert : un rapport incomplet ne rassure pas", () => {
    expect(rapport.verdict).toBe('incomplet');
    expect(code).toBe(3);
  });

  it('sort un resultat chiffre lisible, pas seulement un verdict', () => {
    expect(stdout).toMatch(/ordre/);
    expect(stdout).toMatch(/44/);
  });
});

describe("une mesure qui ROUGIT n'est jamais masquee par une mesure absente", () => {
  it('rend le verdict echec et rc=1 des qu un plafond est depasse', () => {
    const racine = zoneHorsBudget();
    try {
      const { code, rapport } = lancer('--sans-navigateur', '--racine', racine);

      expect(mesure(rapport, 'budget-bundle').statut).toBe('echec');
      expect(rapport.verdict).toBe('echec');
      expect(code).toBe(1);
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });
});

/**
 * rc=3 n'est ni un echec ni une absence. Le rapport le confondait avec
 * « non-executee », ce qui perdait la seule information qui distingue « je n'ai
 * pas pu mesurer » de « j'ai mesure et je refuse de conclure ». Dans les deux
 * cas le verdict global reste `incomplet` — jamais vert.
 */
describe("une mesure qui a TOURNE sans conclure est `indeterminee`, pas absente", () => {
  const zoneSansPlafond = (): string => {
    const racine = mkdtempSync(join(tmpdir(), 'web-v3-zone-'));
    const ecrire = (relatif: string, contenu: string): void => {
      mkdirSync(join(racine, dirname(relatif)), { recursive: true });
      writeFileSync(join(racine, relatif), contenu);
    };
    ecrire('.next/static/chunks/ecran.js', 'x'.repeat(50000));
    ecrire(
      '.next/app-build-manifest.json',
      JSON.stringify({ pages: { '/(inconnu)/mystere/page': ['static/chunks/ecran.js'] } }),
    );
    ecrire('budgets.json', JSON.stringify({ groupes: {}, routes: {} }));
    return racine;
  };

  it('la nomme `indeterminee`, rend le verdict incomplet et rc=3', () => {
    const racine = zoneSansPlafond();
    try {
      const { code, rapport } = lancer('--sans-navigateur', '--racine', racine);

      expect(mesure(rapport, 'budget-bundle').statut).toBe('indeterminee');
      expect(mesure(rapport, 'budget-bundle').raison ?? '').not.toBe('');
      expect(rapport.verdict).toBe('incomplet');
      expect(code).toBe(3);
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });
});

describe('la mesure de poids reseau est invoquee A UNE BALANCE NOMMEE', () => {
  it('passe le profil de bridage et le nombre de tirages a la commande qu elle cite', () => {
    const { rapport } = lancer('--sans-navigateur');
    const commande = mesure(rapport, 'poids-reseau').commande;

    expect(commande).toContain('--reseau 3g-fast');
    expect(commande).toContain('--tirages 5');
  });
});
