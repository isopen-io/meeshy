import { afterEach } from 'bun:test';

import { presenceStore } from '@/lib/api/presence-store';

/**
 * LA PRÉSENCE VIVANTE NE TRAVERSE PAS LES TÉMOINS (#18644) — jumelle de
 * `end-to-end-regime-isolation.ts`, pour le même genre de singleton et le même
 * genre de rouge.
 *
 * `presenceStore` est un magasin de MODULE, et `usePresence` lui donne la
 * PRIORITÉ sur la charge servie (`livePresenceOf(state, key, now) ??
 * presenceOf(participant, now)`, #10571 — la règle est voulue). Une entrée
 * laissée en ligne par un fichier fait donc mentir, dans un fichier SUIVANT,
 * tout témoin qui sert le même identifiant hors ligne : `bun test` joue les
 * 2 520 fichiers dans UN SEUL processus.
 *
 * Ce qui rend la fuite coûteuse, c'est qu'elle dépend de la CHARGE, pas d'un
 * fichier fautif : les deux moitiés de `src/components` passent séparément et
 * le tout échoue. Mesuré au cycle 163 — ajouter DEUX témoins `expect(1).toBe(1)`
 * dans `src/lib/api/socket.test.ts` suffisait à faire rougir
 * `focal-row.test.tsx` et `lens-row.test.tsx`, que le lot ne touchait pas.
 *
 * **L'isolation ne peut donc pas rester à la discipline de chaque fichier.**
 * Quatre des cinq écrivains nettoyaient déjà chez eux, et c'était sans effet
 * sur le symptôme : il suffit du cinquième, ou d'un futur. Le nettoyage est ici
 * pour que le prochain lot qui ajoute un témoin n'ait pas à payer une CI rouge
 * qu'il n'a pas causée.
 */
afterEach(() => {
  presenceStore.getState().clear();
});
