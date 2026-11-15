/**
 * Le témoin de COUVERTURE : ce que le code annonce, le compteur le voit-il ?
 *
 * Il lit `ROUTES_SURVEILLEES` comme une DONNÉE et le code de route comme la
 * SOURCE. Retirer une entrée de la liste le fait donc tomber — c'est le sens
 * de la flèche qui le distingue de `surveilleesMalDeclarees()` et de
 * `deprecation-successor-sweep.ts`, qui partent tous deux de la liste et ne
 * pourraient jamais rougir sur une adresse ABSENTE.
 *
 * Voir le doc-comment de `deprecation-coverage-sweep.ts` pour la résolution.
 */

import {
  DECLARATIONS_HORS_COMPOSITION,
  adressesSansCompteur,
  balayerCouvertureDepreciation,
  declarationsInvalides,
  sitesOrphelins,
  type ResultatCouverture,
} from './deprecation-coverage-sweep';
import { ROUTES_SURVEILLEES } from '../../services/route-usage.service';

const resultat: ResultatCouverture = balayerCouvertureDepreciation();
const surveillees = new Set(ROUTES_SURVEILLEES.map((r) => `${r.method} ${r.route}`));

const enLignes = (adresses: ReadonlyArray<{ method: string; route: string; fichier: string; ligne: number }>): string =>
  adresses
    .map((a) => `  ${a.method.padEnd(7)} ${a.route}   (${a.fichier}:${a.ligne})`)
    .sort()
    .join('\n');

describe('couverture du compteur d\'acces par les sites de depreciation (#4488)', () => {
  it('ne balaie pas dans le vide', () => {
    // Un motif qui cesse de matcher rendrait TOUS les autres temoins verts
    // sans rien mesurer. Le plancher est volontairement bas — il n'est pas un
    // inventaire, seulement la preuve que le balayage voit encore le depot.
    expect(resultat.fichiersVisites).toBeGreaterThan(100);
    expect(resultat.sites.length).toBeGreaterThan(50);
    expect(resultat.adresses.length).toBeGreaterThan(50);
  });

  it('surveille chaque adresse qui annonce son sursis', () => {
    const manquantes = adressesSansCompteur(resultat, surveillees);
    expect(
      manquantes.length === 0
        ? ''
        : `${manquantes.length} adresse(s) depreciee(s) hors de ROUTES_SURVEILLEES — leur compteur n'existe pas, donc leur Sunset ne peut jamais etre derive :\n${enLignes(manquantes)}`
    ).toBe('');
  });

  it('ne laisse tomber aucun site de depreciation en silence', () => {
    const orphelins = sitesOrphelins(resultat);
    expect(
      orphelins.length === 0
        ? ''
        : `${orphelins.length} site(s) de depreciation ni composable(s) ni declare(s) — le balayage mesurerait moins que ce qu'il pretend :\n${orphelins
            .map((s) => `  ${s.fichier}:${s.ligne} [${s.motif}] ${s.detail}`)
            .join('\n')}`
    ).toBe('');
  });

  it('exige de chaque declaration hors composition une raison et des adresses montees', () => {
    const invalides = declarationsInvalides(resultat);
    expect(
      invalides.length === 0
        ? ''
        : invalides.map((d) => `  ${d.fichier} [${d.motif}] ${d.grief} ${d.detail}`).join('\n')
    ).toBe('');
  });

  it('resout POST / d\'admin/reports.ts sur le prefixe NU, pas sur prefixe + /', () => {
    // Le cas nomme par #4488 : `mountPrefix + '/'` rend `/api/v1/admin/reports/`,
    // que Fastify ne monte pas. Sans la regle du chemin nu, ce site tomberait
    // en `aucune-composition` et l'adresse sortirait du perimetre mesure.
    const servie = resultat.adresses.find((a) => a.method === 'POST' && a.route === '/api/v1/admin/reports');
    expect(servie).toBeDefined();
    expect(servie?.fichier).toBe('routes/admin/reports.ts');
    expect(resultat.adresses.some((a) => a.route.endsWith('/'))).toBe(false);
  });

  it('ne prend pas la jumelle VERSIONNEE d\'un alias racine pour une adresse depreciee', () => {
    // `voiceAnalysisLegacyAliasRoutes` pose son hook sur le montage RACINE et
    // delegue a `voiceAnalysisRoutes`, montee telle quelle sous /api/v1 sans
    // hook. Rattacher le hook « a la declaration la plus proche en amont »
    // ferait passer la CIBLE pour l'alias — et surveiller une cible produit un
    // compteur qui ne tombe jamais a zero.
    const racine = resultat.adresses.filter((a) => a.route === '/voice/analysis');
    expect(racine.map((a) => a.method).sort()).toEqual(['GET', 'POST']);
    expect(resultat.adresses.some((a) => a.route === '/api/v1/voice/analysis')).toBe(false);
  });

  it('ne prend pas le SUCCESSEUR annonce pour l\'adresse qui l\'annonce', () => {
    // `friends.ts` declare `/friend-requests` sous /api/v1 ; le meme chemin
    // compose aussi sous /api/v1/directory, ou il designe le successeur, servi
    // par un autre fichier qui n'annonce rien.
    const successeurs = resultat.adresses.filter((a) => a.route.startsWith('/api/v1/directory/friend-requests'));
    expect(successeurs).toEqual([]);
    expect(resultat.adresses.some((a) => a.method === 'POST' && a.route === '/api/v1/friend-requests')).toBe(true);
  });

  it('couvre les vingt-huit routes de la fabrique de preferences par declaration', () => {
    const fabrique = DECLARATIONS_HORS_COMPOSITION.find((d) => d.motif === 'plugin-de-fabrique');
    expect(fabrique?.adresses).toHaveLength(28);
    expect(
      resultat.adresses.some((a) => a.method === 'PUT' && a.route === '/api/v1/me/preferences/privacy')
    ).toBe(true);
  });
});
