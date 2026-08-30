/**
 * @jest-environment node
 *
 * Ce que ce temoin gage : les quatre mesures de la machine de verification
 * (§ 9) sont REELLEMENT lancables — pas seulement ecrites.
 *
 * Le defaut qu'il attrape a ete trouve en lancant le rapport agrege : la mesure
 * de rendu, pourtant commitee et correcte, ne pouvait tourner sur AUCUNE
 * machine. Elle charge ses trois paquets depuis le cache npm local
 * (`.cache/dc-vendor`), que `capture-cibles.js` remplit — et la liste de ce
 * bootstrap ne portait ni `pngjs` ni `pixelmatch`. Aucun des deux fichiers
 * n'etait faux : c'est leur RENCONTRE qui l'etait, et personne ne la lisait.
 *
 * Les deux listes sont donc DERIVEES de leurs fichiers, jamais recopiees : le
 * jour ou `compare-rendu.js` charge un quatrieme paquet, ce temoin le sait sans
 * etre reecrit.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const depot = join(__dirname, '..', '..', '..');
const planche = join(depot, 'docs', 'product', 'MeeshyWebV3Design');

const lire = (fichier: string): string => readFileSync(join(planche, fichier), 'utf8');

/** Les paquets que `compare-rendu.js` charge depuis le cache npm local. */
export const paquetsChargesPar = (source: string): readonly string[] => {
  const trouves = [...source.matchAll(/require\(path\.join\(NM,\s*'([^']+)'\)\)/g)].map(
    ([, nom]) => nom ?? '',
  );
  return [...new Set(trouves)].filter(Boolean);
};

/** Le nom d'un paquet, sa version otee — portee incluse (`@babel/standalone`). */
const nomDeSpec = (spec: string): string =>
  spec.startsWith('@') ? `@${spec.slice(1).split('@')[0]}` : (spec.split('@')[0] ?? '');

/** Les paquets que le bootstrap du cache installe. */
export const paquetsInstallesPar = (source: string): readonly string[] => {
  const [, liste] = /const PKGS = \[([^\]]+)\]/.exec(source) ?? [];
  return [...(liste ?? '').matchAll(/'([^']+)'/g)].map(([, spec]) => nomDeSpec(spec ?? ''));
};

describe('les quatre mesures sont lancables, pas seulement ecrites', () => {
  it('les quatre scripts existent la ou le rapport les appelle', () => {
    const zone = join(__dirname, '..');

    expect(existsSync(join(planche, 'ordre-des-ecrans.js'))).toBe(true);
    expect(existsSync(join(planche, 'compare-rendu.js'))).toBe(true);
    expect(existsSync(join(zone, 'scripts', 'mesure-reseau.mjs'))).toBe(true);
    expect(existsSync(join(zone, 'scripts', 'check-bundle-budget.mjs'))).toBe(true);
    expect(existsSync(join(zone, 'scripts', 'rapport-verification.mjs'))).toBe(true);
  });

  it('le bootstrap du cache installe TOUT ce que la mesure de rendu charge', () => {
    const charges = paquetsChargesPar(lire('compare-rendu.js'));
    const installes = paquetsInstallesPar(lire('capture-cibles.js'));

    expect(charges.length).toBeGreaterThan(0);
    expect(charges.filter((p) => !installes.includes(p))).toEqual([]);
  });

  it('rougirait sur le bootstrap d avant le correctif', () => {
    const avant = "const PKGS = ['react@18.3.1', 'playwright-core@1.62.1'];";
    const charges = paquetsChargesPar(lire('compare-rendu.js'));

    expect(charges.filter((p) => !paquetsInstallesPar(avant).includes(p))).not.toEqual([]);
  });
});
