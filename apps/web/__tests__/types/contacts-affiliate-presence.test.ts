/**
 * Témoin — `AffiliateRelation.referredUser` ne PROMET pas une présence que la
 * passerelle ne sert jamais.
 *
 * Le type déclarait `isOnline: boolean` NON optionnel. Mesuré contre le
 * producteur (`AffiliateTrackingService.getUserAffiliateData`, le `select` de
 * `referredUser`), la charge servie est exactement
 * `{ id, username, firstName, lastName, email, avatar, createdAt }` : `isOnline`
 * n'y figure pas, et ce n'est pas un oubli. La directive du 2026-08-25 est
 * explicite — « affiliation/parrainage jamais comptés » : un parrainage est un
 * lien posé d'un seul côté, pas une amitié, et il n'ouvre aucune présence.
 *
 * Un champ que le serveur ne sert JAMAIS ne se déclare pas `boolean`. La forme
 * juste n'est ni `boolean` (le gate `applyPresenceVisibilityAsOffline`, qui sert
 * `false` quand il masque) ni `boolean | null` (`applyPresenceVisibility`, qui
 * sert `null`) : c'est l'ABSENCE — la troisième forme, celle d'une surface qui
 * ne charge pas la colonne. Un type qui la promet invite un lecteur à écrire
 * `isOnline ? … : …` sur un `undefined` typé `boolean`, c'est-à-dire à afficher
 * « hors ligne » comme s'il l'avait mesuré.
 *
 * `avatar` porte le même défaut à côté du champ corrigé (leçon 275) : Prisma le
 * déclare `String?`, l'extension `stripDataUri` rend `null` pour une image
 * embarquée, et le type promettait `string | undefined`.
 *
 * L'assertion qui compte est de TYPE : elle tombe sous `tsc --noEmit`, pas sous
 * jest, dont le transformeur SWC efface les types. Les assertions d'exécution
 * ci-dessous prouvent que la charge exercée est bien celle du producteur —
 * sans elles, le fichier n'attesterait rien pour le lanceur de tests.
 */

import type { AffiliateRelation } from '@/types/contacts';

/** Les sept clés du `select` de `referredUser`, copiées du producteur. */
const servedReferredUser = {
  id: '507f1f77bcf86cd799439011',
  username: 'bob',
  firstName: 'Bob',
  lastName: 'Jones',
  email: 'bob@example.com',
  avatar: null,
  createdAt: '2026-08-01T10:00:00.000Z',
};

const servedRelation: AffiliateRelation = {
  id: '507f1f77bcf86cd799439012',
  referredUser: servedReferredUser,
  status: 'completed',
  createdAt: '2026-08-01T10:00:00.000Z',
  completedAt: '2026-08-02T09:00:00.000Z',
  affiliateToken: { name: 'Campagne été', token: 'aff_abc12345', createdAt: '2026-07-01T00:00:00.000Z' },
};

describe('AffiliateRelation — la présence n’est pas promise', () => {
  it('la charge SERVIE par la passerelle ne porte aucune présence', () => {
    expect(Object.keys(servedRelation.referredUser).sort()).toEqual([
      'avatar',
      'createdAt',
      'email',
      'firstName',
      'id',
      'lastName',
      'username',
    ]);
    expect('isOnline' in servedRelation.referredUser).toBe(false);
    expect('lastActiveAt' in servedRelation.referredUser).toBe(false);
  });

  it('un avatar absent voyage en `null`, jamais en `undefined`', () => {
    expect(servedRelation.referredUser.avatar).toBeNull();
  });
});
