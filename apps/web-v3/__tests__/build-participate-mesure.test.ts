import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ecrisLaMesure, SOURCES } from '../scripts/build-participate.mjs';

/**
 * DÉFAUT MAJEUR DE REVUE (#5387) — « le ratchet peut ABAISSER en silence un
 * MAX documenté » : `--mesure` réécrivait le bloc `participate` EN ENTIER
 * depuis la seule mesure du poste courant, effaçant `raison_de_la_hausse` —
 * le seul endroit où vit la doctrine « on enregistre le MAX des
 * environnements » (#5343) — dès qu'un lancement touchait des modules qu'il
 * n'avait pas mesurés dans le conteneur.
 *
 * Un fichier TEMPORAIRE, jamais `budgets-mesures.json` du dépôt lui-même : ce
 * témoin ne doit ni dépendre de son contenu réel, ni le muter.
 */
describe('ecrisLaMesure — un champ MANUEL du bloc précédent SURVIT à --mesure', () => {
  const poidsFactice = (): Record<string, { readonly brut: number; readonly gzip: number }> =>
    Object.fromEntries(SOURCES.map(({ base }, index) => [base, { brut: 1000 + index, gzip: 500 + index }]));

  const fichierTemporaire = (participatePrecedent: Record<string, unknown>): string => {
    const dossier = mkdtempSync(join(tmpdir(), 'meeshy-v3-mesures-'));
    const chemin = join(dossier, 'budgets-mesures.json');
    writeFileSync(chemin, JSON.stringify({ participate: participatePrecedent }, null, 2), 'utf8');
    return chemin;
  };

  it('`raison_de_la_hausse` du bloc précédent est PRÉSERVÉE, à l’identique', () => {
    const chemin = fichierTemporaire({
      participate_gzip_9_octets: 999,
      raison_de_la_hausse: 'BAISSE #5396 — valeur MAX-ENVIRONNEMENTS, ne pas écraser.',
    });
    try {
      ecrisLaMesure(poidsFactice(), chemin);
      const relu = JSON.parse(readFileSync(chemin, 'utf8'));
      expect(relu.participate.raison_de_la_hausse).toBe('BAISSE #5396 — valeur MAX-ENVIRONNEMENTS, ne pas écraser.');
    } finally {
      rmSync(chemin, { force: true });
    }
  });

  it('les poids CALCULÉS sont bien mis à jour, malgré la préservation du champ manuel', () => {
    const chemin = fichierTemporaire({ participate_gzip_9_octets: 999, raison_de_la_hausse: 'ancienne mesure' });
    try {
      const poids = poidsFactice();
      ecrisLaMesure(poids, chemin);
      const relu = JSON.parse(readFileSync(chemin, 'utf8'));
      SOURCES.forEach(({ base }) => {
        expect(relu.participate[`${base}_gzip_9_octets`]).toBe(poids[base]!.gzip);
        expect(relu.participate[`${base}_brut_octets`]).toBe(poids[base]!.brut);
      });
    } finally {
      rmSync(chemin, { force: true });
    }
  });

  it('un tour SANS champ manuel préalable n’en invente aucun', () => {
    const chemin = fichierTemporaire({ participate_gzip_9_octets: 999 });
    try {
      ecrisLaMesure(poidsFactice(), chemin);
      const relu = JSON.parse(readFileSync(chemin, 'utf8'));
      expect(relu.participate.raison_de_la_hausse).toBeUndefined();
    } finally {
      rmSync(chemin, { force: true });
    }
  });

  it('un premier enregistrement (aucun bloc `participate` précédent) ne lève rien et ne préserve rien', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'meeshy-v3-mesures-'));
    const chemin = join(dossier, 'budgets-mesures.json');
    writeFileSync(chemin, JSON.stringify({}, null, 2), 'utf8');
    try {
      expect(() => ecrisLaMesure(poidsFactice(), chemin)).not.toThrow();
      const relu = JSON.parse(readFileSync(chemin, 'utf8'));
      expect(relu.participate.raison_de_la_hausse).toBeUndefined();
      expect(typeof relu.participate.participate_gzip_9_octets).toBe('number');
    } finally {
      rmSync(chemin, { force: true });
    }
  });
});
