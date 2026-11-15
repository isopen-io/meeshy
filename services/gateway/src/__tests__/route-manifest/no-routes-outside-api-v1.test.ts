/**
 * Témoin de #4277, critère 6. Deux blocs, deux questions séparées :
 *
 *  1. La LOGIQUE du balayage est-elle correcte ? (fixtures synthétiques,
 *     mutable, prouvable au rouge — la garde-fou ordinaire du dépôt)
 *  2. Le MANIFESTE RÉEL, aujourd'hui, satisfait-il la règle ? (lecture du
 *     fichier généré par #4276 — ne peut PAS passer au vert avant que
 *     l'intégrateur applique les édits d'enregistrement de ce lot ET
 *     régénère le manifeste ; voir le commentaire du second bloc pour
 *     l'ordre exact des opérations et ce qui reste rouge après, et pourquoi).
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { routesOutsideApiV1, ALLOWED_OUTSIDE_API_V1, type ManifestRoute } from './no-routes-outside-api-v1';

describe('routesOutsideApiV1 — la logique du balayage (#4277 critère 6)', () => {
  it('rend vide quand toutes les routes sont sous /api/v1', () => {
    const routes: ManifestRoute[] = [
      { method: 'GET', path: '/api/v1/users' },
      { method: 'POST', path: '/api/v1/messages' },
    ];
    expect(routesOutsideApiV1(routes, [])).toEqual([]);
  });

  it('rend une route hors /api/v1 quand elle n\'est PAS dans la liste déclarée', () => {
    const routes: ManifestRoute[] = [{ method: 'GET', path: '/oublié-au-passage' }];
    expect(routesOutsideApiV1(routes, [])).toEqual([{ method: 'GET', path: '/oublié-au-passage' }]);
  });

  it('laisse passer une route hors /api/v1 explicitement déclarée, avec sa raison', () => {
    const routes: ManifestRoute[] = [{ method: 'GET', path: '/health' }];
    const allowlist = [{ path: '/health', family: 'permanent' as const, reason: 'sonde S0' }];
    expect(routesOutsideApiV1(routes, allowlist)).toEqual([]);
  });

  it('la déclaration se lit par CHEMIN, pas par méthode — GET et POST du même alias sont TOUS DEUX couverts', () => {
    const routes: ManifestRoute[] = [
      { method: 'GET', path: '/voice/analysis' },
      { method: 'POST', path: '/voice/analysis' },
    ];
    const allowlist = [{ path: '/voice/analysis', family: 'deprecated-alias' as const, reason: 'alias' }];
    expect(routesOutsideApiV1(routes, allowlist)).toEqual([]);
  });

  it('la liste ALLOWED_OUTSIDE_API_V1 réelle ne masque QUE ses chemins déclarés — un intrus non listé tombe encore', () => {
    const routes: ManifestRoute[] = [
      { method: 'GET', path: '/health' }, // déclaré → passe
      { method: 'GET', path: '/nouveau-defaut-non-declare' }, // pas déclaré → tombe
    ];
    expect(routesOutsideApiV1(routes, ALLOWED_OUTSIDE_API_V1)).toEqual([
      { method: 'GET', path: '/nouveau-defaut-non-declare' },
    ]);
  });
});

describe('Le manifeste RÉEL (#4277 critère 6, mesuré sur route-manifest.json)', () => {
  it('ne contient plus aucune route hors /api/v1 en dehors de la liste déclarée', () => {
    const manifestPath = path.resolve(__dirname, '../../../route-manifest.json');
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(raw) as { routes: ManifestRoute[] };

    const violations = routesOutsideApiV1(manifest.routes);

    // Mesuré (#4277) : ce témoin est VERT dès AUJOURD'HUI, avant même que
    // l'intégrateur applique les quatre `edits_hors_territoire` sur
    // `route-registration.ts` — parce qu'AUCUN de ces édits ne RETIRE une
    // adresse existante. `voiceAnalysisRoutes` GARDE ses cinq adresses
    // racine actuelles (elles deviennent l'alias déprécié, critère 1) tout
    // en GAGNANT leurs jumelles sous `/api/v1` ; `userDeletionsRoutes` ne
    // bouge aucune de ses sept adresses (critère 3, § collision documentée
    // dans `UserDeletionsRoutesOptions`). Un manifeste régénéré APRÈS
    // intégration doit donc rester VERT ici, avec deux différences
    // invisibles à un scan par CHEMIN seul (que ce témoin ne peut pas
    // mesurer) : les cinq alias portent désormais les en-têtes de
    // dépréciation (couvert par `voice-analysis-legacy-alias.test.ts`), et
    // `registerTusRoutes`/`voiceRoutesPlugin` gagnent un `mountPrefix` non
    // vide dans le manifeste (`voiceRoutesPlugin` seulement — tus et
    // user-deletions gardent `mountPrefix: ''` par construction, voir
    // `TusRoutesOptions`/`UserDeletionsRoutesOptions` : ils lisent une clé
    // `basePath` PERSONNALISÉE, jamais la clé `prefix` réservée de Fastify,
    // pour ne jamais additionner deux préfixages sur une URL déjà absolue).
    //
    // Ce témoin RESTERA utile après intégration : c'est un GARDE-FOU de
    // RÉGRESSION — toute route future qui échappe à `/api/v1` sans figurer
    // ici (nommée, avec sa famille et sa raison) le fait tomber.
    // `routesOutsideApiV1` (§ premier bloc) prouve que le mécanisme
    // fonctionne ; ce second bloc prouve que le manifeste RÉEL, aujourd'hui,
    // n'a besoin d'aucune entrée non déclarée.
    if (violations.length > 0) {
      // eslint-disable-next-line no-console
      console.log('[route-manifest] routes hors /api/v1 non déclarées :', JSON.stringify(violations, null, 2));
    }
    expect(violations).toEqual([]);
  });
});
