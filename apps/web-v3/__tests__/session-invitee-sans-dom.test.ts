/**
 * @jest-environment node
 *
 * Le jeton invité côté SERVEUR — issue #4448.
 *
 * L'écran `join` est rendu par un composant SERVEUR avant de s'hydrater
 * (§ 6.3 état A) : le module qui détient le jeton sera importé là où
 * `localStorage` n'existe pas. Un module qui touche le stockage à l'import —
 * ou qui jette à la première lecture — casse le rendu AVANT le premier pixel,
 * c'est-à-dire exactement le rôle premier.
 *
 * Sans DOM, la réponse est donc « aucune session », jamais une exception : le
 * serveur ne peut pas connaître la place d'un invité, et il n'a pas à le dire
 * par un plantage.
 */
import {
  cleDeLien,
  cleDuLien,
  effaceSession,
  lireSession,
  poseSession,
  type CleDeLien,
} from '../lib/api/guest-session';

const LINK_ID = 'mshy_AAA111';

const lienDe = (linkId: string): CleDeLien => {
  const lien = cleDeLien({ linkId });
  if (lien === null) throw new Error(`linkId refusé par la fabrique : ${JSON.stringify(linkId)}`);
  return lien;
};

const LIEN = lienDe(LINK_ID);

describe('le jeton invité sans DOM', () => {
  it("s'importe et rend sa clé sans toucher au stockage", () => {
    expect(cleDuLien(LIEN)).toBe(`meeshy.guest.${LINK_ID}`);
  });

  it('fabrique une clé de lien depuis la réponse du serveur, sans DOM', () => {
    expect(cleDeLien({ linkId: LINK_ID })).toBe(LINK_ID);
    expect(cleDeLien({ linkId: undefined })).toBeNull();
  });

  it('ne connaît aucune session et ne jette pas', () => {
    expect(lireSession(LIEN)).toBeNull();
    expect(() => poseSession(LIEN, { jeton: 'j', participantId: 'p', pseudo: 'Invite', langue: null, nom: null, conversationId: null, droits: null })).not.toThrow();
    expect(() => effaceSession(LIEN)).not.toThrow();
  });
});
