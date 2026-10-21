/**
 * La session VIVANTE qu'un jeton nomme, pour les suites de la porte socket et
 * de la porte TUS dont le sujet est ailleurs (#10493). Les deux portes relisent
 * la session nommée par le `sid` du jeton (`sessionAdmissionRefusal`) : un
 * jeton sans `sid`, ou un identifiant qui n'a pas la forme d'un ObjectId, est
 * refusé avant tout le reste. Les portes elles-mêmes sont témoignées par
 * `AuthHandler.session-admission.test.ts` et `tus-handler.session-admission.test.ts`.
 */

export const LIVE_SID = 'bbbbbbbbbbbbbbbbbbbbbbb1';

export const liveSession = () => ({
  id: LIVE_SID,
  isValid: true,
  expiresAt: new Date('2099-01-01T00:00:00.000Z'),
});
