/**
 * @jest-environment node
 */

import { resolvePresenceVisibility } from '@meeshy/shared/utils/presence-visibility';

import { BASCULES_DE_CONFIDENTIALITE, CLES_DE_CONFIDENTIALITE_EXPOSEES, estUneCleDeConfidentialite } from '@/lib/contenu/reglages-details';

/**
 * `lib/contenu/reglages-details.ts` — LA TABLE FERMÉE (spécification § 0, § 3
 * témoin 1) et LE TEST DE GARDE du critère de fin de `detail-privacy`
 * (témoin 2) : aucune bascule de cet écran ne peut ÉLARGIR la visibilité de
 * présence, quoi qu'elle porte.
 */

describe('la table des quatre bascules de confidentialité EXPOSÉES', () => {
  it('est EXACTEMENT ces quatre clés — un ajout non revu fait rougir ce témoin', () => {
    expect(CLES_DE_CONFIDENTIALITE_EXPOSEES).toEqual([
      'showOnlineStatus',
      'showLastSeen',
      'showReadReceipts',
      'showTypingIndicator',
    ]);
  });

  it('a un libellé pour chacune, dans le même ordre', () => {
    expect(BASCULES_DE_CONFIDENTIALITE.map((b) => b.cle)).toEqual([...CLES_DE_CONFIDENTIALITE_EXPOSEES]);
    BASCULES_DE_CONFIDENTIALITE.forEach((b) => expect(b.libelle.length).toBeGreaterThan(0));
  });

  it('exclut `hideProfileFromSearch` et `allowContactRequests` — AUCUN lecteur serveur (§0)', () => {
    expect(estUneCleDeConfidentialite('hideProfileFromSearch')).toBe(false);
    expect(estUneCleDeConfidentialite('allowContactRequests')).toBe(false);
  });

  it('refuse une clé inconnue', () => {
    expect(estUneCleDeConfidentialite('motDePasse')).toBe(false);
  });
});

describe('LE TEST DE GARDE — aucune bascule de /settings/privacy ne peut ÉLARGIR la visibilité de présence', () => {
  it('un viewer NON AMI reste MASQUÉ même quand les DEUX préférences de la cible valent `true`', () => {
    const visibilite = resolvePresenceVisibility({
      isSelf: false,
      viewerRole: 'USER',
      areConnected: false, // pas d'amitié acceptée
      targetShowOnlineStatus: true,
      targetShowLastSeen: true,
      targetIsDeactivated: false,
      isBlockedEitherWay: false,
    });

    expect(visibilite).toEqual({ showOnline: false, showLastSeenTimestamp: false });
  });

  it('un AMI reste masqué quand `showOnlineStatus` vaut `false` — la préférence ne peut que RESTREINDRE', () => {
    const visibilite = resolvePresenceVisibility({
      isSelf: false,
      viewerRole: 'USER',
      areConnected: true,
      targetShowOnlineStatus: false,
      targetShowLastSeen: true,
      targetIsDeactivated: false,
      isBlockedEitherWay: false,
    });

    expect(visibilite.showOnline).toBe(false);
  });

  it('un ADMIN voit la présence même sans amitié — la loi PRIVILÉGIÉE prime sur les préférences (jamais l’inverse)', () => {
    const visibilite = resolvePresenceVisibility({
      isSelf: false,
      viewerRole: 'ADMIN',
      areConnected: false,
      targetShowOnlineStatus: false,
      targetShowLastSeen: false,
      targetIsDeactivated: false,
      isBlockedEitherWay: false,
    });

    expect(visibilite).toEqual({ showOnline: true, showLastSeenTimestamp: true });
  });
});
