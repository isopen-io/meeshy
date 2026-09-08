import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Garde de NON-RÉGRESSION : `User.lastActiveAt` ne doit jamais redevenir le
 * critère de sélection de l'agent.
 *
 * Cette colonne est écrite par une socket qui se rouvre toute seule
 * (`AuthHandler` → `updateUserOnlineStatus`), sans vérifier que la session vit
 * encore. Mesuré en production le 2026-09-08 : `clyf_tone` marquée active il y
 * a 36 min pour une dernière connexion à 71 JOURS, `La_mignonne` 147 min contre
 * deux sessions expirées depuis 62 jours. Seule la CONNEXION —
 * `UserSession.lastActivityAt` sur session vivante — décide d'une absence
 * (#5703, #5712).
 *
 * Une garde de SOURCE prouve qu'une ligne EXISTE, jamais qu'elle s'exécute :
 * les témoins de comportement de `mongo-persistence-connexion.test.ts` sont la
 * vraie preuve. Celle-ci n'empêche qu'une chose — la marche arrière silencieuse.
 */
describe('le critère de sélection ne peut plus revenir à l\'activité', () => {
  const source = readFileSync(join(__dirname, '../../memory/mongo-persistence.ts'), 'utf8');
  const selecteurs = source.slice(source.indexOf('async getPotentialControlledUsers'));

  /**
   * On interdit le FILTRE (`lastActiveAt: { lt: … }`), pas la PROJECTION
   * (`lastActiveAt: true`) : lire la colonne pour la rendre à l'appelant reste
   * légitime — c'est décider avec elle qui ne l'est plus.
   */
  it('aucun sélecteur ne FILTRE sur lastActiveAt du user', () => {
    const filtres = selecteurs.match(/lastActiveAt:\s*\{/g) ?? [];
    // Le seul filtre `lastActiveAt: {` admis porte sur le PARTICIPANT — son
    // activité DANS la conversation, critère légitime et distinct.
    expect(filtres).toHaveLength(1);
  });

  /**
   * TROIS sites décident d'une absence, et la première écriture de cette garde
   * n'en connaissait que deux — c'est elle qui a trouvé le troisième :
   *
   *   1. `getPotentialControlledUsers`  — qui RECRUTER
   *   2. `getLeastActiveParticipants`   — qui recruter en SECOURS
   *   3. `getEligibleConversations`     — quelles CONVERSATIONS valent un scan
   *
   * Le troisième était resté sur `user.lastActiveAt` : invisible depuis les
   * sélecteurs d'utilisateurs, il écartait des conversations entières dont les
   * participants paraissent actifs par une socket qui se rouvre seule.
   */
  it('les TROIS sites qui décident d\'une absence lisent les sessions', () => {
    const occurrences = selecteurs.match(/sessions:\s*\{\s*none:\s*\{\s*lastActivityAt/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(3);
  });

  it('ces sites refusent tous quelqu\'un actuellement en ligne', () => {
    const occurrences = selecteurs.match(/isOnline:\s*false/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(3);
  });
});
