import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LE CORPS SERVI DU TRAVAILLEUR DE ZONE (#4473).
 *
 * `scripts/build-participate.mjs` compile `lib/sw/travailleur.js` vers
 * `.rt/sw.js` ; ce module le lit UNE fois par processus, calcule l'empreinte
 * du corps compilé et la substitue au marqueur `__V3_SW_EMPREINTE__` — c'est
 * elle qui versionne le CACHE du worker (`meeshy-v3-sw-<empreinte>`), pas son
 * URL : l'URL d'un Service Worker est son identité et doit rester stable.
 * L'empreinte se calcule AVANT substitution — le corps servi change donc à
 * chaque changement du source, et l'`activate` du worker neuf purge les caches
 * de l'ancien (le sien seulement : § 4.4 bis, canal 3).
 *
 * Fichier absent ⇒ `null`, jamais une exception : même contrat que
 * `actifParNom` (`lib/actifs-rt.ts`) — la route rend 404 et le worker
 * n'existe pas pour ce déploiement.
 */
export type ActifTravailleur = {
  readonly corps: string;
  readonly empreinte: string;
};

const MARQUEUR = '__V3_SW_EMPREINTE__';

const lisFichier = (chemin: string): string => {
  try {
    return readFileSync(chemin, 'utf8');
  } catch {
    return '';
  }
};

const memo = <T>(calcule: () => T): (() => T) => {
  let valeur: T | undefined;
  return () => {
    valeur ??= calcule();
    return valeur;
  };
};

export const actifTravailleur = memo((): ActifTravailleur | null => {
  const brut = lisFichier(join(process.cwd(), '.rt', 'sw.js'));
  if (brut === '') return null;
  const empreinte = createHash('sha256').update(brut).digest('hex').slice(0, 16);
  return { corps: brut.replaceAll(MARQUEUR, empreinte), empreinte };
});
