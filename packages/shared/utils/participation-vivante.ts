import { unsetOrNull } from './prisma-unset';

/**
 * Une participation VIVANTE : active ET non bannie — UNE définition pour
 * l'invité et pour l'inscrit, sur toutes les portes de lecture (REST et
 * socket) (#7389), et pour **tout paquet qui lit `Participant`** (#20111).
 *
 * `isActive: true` seul ne suffit pas. Un bannissement d'un membre ACTIF écrit
 * bien `isActive: false`, mais celui d'un membre déjà INACTIF (parti, ou qui a
 * supprimé la conversation pour lui) n'écrit que `bannedAt`
 * (`resolveBanWrite`, `services/conversations/conversationBanState.ts`) ; et
 * `POST /conversations/:id/restore-for-me` (`routes/user-deletions.ts`)
 * rallumait ensuite `isActive` sans lire `bannedAt` — fermé par #10436, qui
 * refuse la restauration d'un banni et porte la garde dans le `where` de
 * l'écriture. (Ce n'est PAS la restauration de compte de
 * `routes/me/delete-account.ts` : elle écrit `User.isActive`, jamais une
 * participation.) Les réintégrations (lien, invitation, ajout) passent par
 * `resolveConversationEntry`, qui refuse un banni ; le débannissement remet
 * `bannedAt` à `null` dans la même écriture. La garde de lecture reste
 * porteuse pour les lignes actives ET bannies déjà en base : elle ne vivait
 * que sur la branche INVITÉ, et l'inscrit concerné relisait le fil, la
 * recherche et les épinglés, et rejoignait la room à la connexion socket.
 *
 * `unsetOrNull` et non `bannedAt: null` : la colonne est ABSENTE du document de
 * tout participant jamais banni, et l'égalité à `null` fermerait la
 * conversation à toute la population (`./prisma-unset`). Elle porte une clé
 * `OR` : un `where` qui a déjà le sien passe par `AND`.
 *
 * ── POURQUOI CETTE LOI VIT DANS `@meeshy/shared` DEPUIS #20111 ──────────────
 *
 * Elle vivait dans `services/gateway/src/routes/conversations/utils/access-control.ts`,
 * qui la ré-exporte désormais sous le MÊME nom — le cliquet des audiences
 * reconnaît la loi à ce nom (`LAW_SPELLINGS`), et un déménagement qui le
 * changerait reclasserait son inventaire entier pour rien.
 *
 * Ce qui a forcé le déménagement n'est pas une préférence d'architecture :
 * **`services/agent` lit `Participant` et ne pouvait rien importer de la
 * passerelle.** Ses trois sélecteurs de membres DORMANTS — ceux qui décident à
 * la place de qui l'agent va parler — portaient `isActive` NU, et un
 * membre actif-et-banni y était éligible. Une loi qu'un paquet ne peut pas
 * importer est une loi qu'il va réécrire ou ignorer ; ici il l'avait ignorée.
 */
export const PARTICIPATION_VIVANTE = {
  isActive: true,
  ...unsetOrNull('bannedAt')
} as const;

/**
 * `PARTICIPATION_VIVANTE` jugée sur une ligne DÉJÀ lue — pour une porte qui
 * doit distinguer une participation MORTE (désactivée ou bannie) d'une ligne
 * absente, et ne peut donc pas filtrer dans son `where` (#10449). Même règle :
 * active (`true`, pas seulement « non fausse ») et `bannedAt` nul ou absent.
 */
export function participationEstVivante(row: { readonly isActive?: boolean | null; readonly bannedAt?: Date | null }): boolean {
  return row.isActive === true && row.bannedAt == null;
}
