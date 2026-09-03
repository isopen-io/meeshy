import { bloqueUnParticipant, demarreUneConversation, envoieUneDemandeDAmi, profilDuParticipant } from '@/lib/api/profil';

import { redirection } from './fil-porte';
import {
  adresseDuProfil,
  CHAMP_ACTION_PROFIL,
  CHAMP_CIBLE_PROFIL,
  confirmationDemandee,
  demandeDeProfil,
  type ActionDeProfil,
  type ProfilDeLaSurimpression,
} from './profil-vue';

export { confirmationDemandee, demandeDeProfil, type ProfilDeLaSurimpression } from './profil-vue';

/**
 * LA PORTE DU PROFIL D'UN PARTICIPANT — PARTAGÉE par les TROIS hôtes
 * (`/chats/:cle`, `/chat/:lien`, `/chats`) : c'est ELLE qui lit `?profil=`,
 * appelle la passerelle et traite les trois formulaires d'action, pour que la
 * lecture et l'écriture restent écrites UNE fois — comme la vue qu'elle
 * nourrit (conception § 12.10.3 point 2).
 */

/**
 * `?profil=<handle>` → le handle ET le profil SERVI, ou `null` quand l'adresse
 * n'en demande aucun (le cas nominal : aucune requête de plus sur une lecture
 * ordinaire) — une SEULE lecture de `?profil=`/`?confirmer=` par appel.
 *
 * `jeton` est le JWT du MEMBRE — `null` pour un invité, JAMAIS sa session : la
 * route ne lit que `Authorization: Bearer` (`lib/api/profil.ts`), et un invité
 * anonyme y est lu comme n'importe quel appelant sans compte.
 */
export const chargeLeProfilSiDemande = async ({
  requete,
  jeton,
  recuperer,
}: {
  readonly requete: Request;
  readonly jeton: string | null;
  readonly recuperer?: Parameters<typeof profilDuParticipant>[0]['recuperer'];
}): Promise<ProfilDeLaSurimpression | null> => {
  const handle = demandeDeProfil(requete);
  if (handle === null) return null;
  const servi = await profilDuParticipant({ handle, jeton, recuperer });
  return { handle, servi, confirmerBlocage: confirmationDemandee(requete) };
};

const estUneAction = (valeur: FormDataEntryValue | null): valeur is ActionDeProfil =>
  valeur === 'ecrire' || valeur === 'ami' || valeur === 'bloquer';

/**
 * LE FORMULAIRE D'UNE DES TROIS ACTIONS, TRAITÉ — ou `null` quand le
 * formulaire posté n'en est pas un : l'appelant enchaîne alors sur SA propre
 * lecture du même `FormData` (message, réaction, geste de liste), qui n'a été
 * consommé qu'UNE fois.
 *
 * `jeton === null` (un invité, ou un jeton mort) ne tente RIEN : les trois
 * routes de la passerelle exigent toutes un compte (`lib/api/profil.ts`), et
 * la vue ne rend d'ailleurs aucun de ces formulaires à qui n'en tient pas —
 * cette garde est la SECONDE, pas la seule, sur un POST forgé à la main.
 */
export const traiteLActionDeProfil = async ({
  formulaire,
  jeton,
  adresseHote,
  recuperer,
}: {
  readonly formulaire: FormData | null;
  readonly jeton: string | null;
  readonly adresseHote: string;
  readonly recuperer?: Parameters<typeof demarreUneConversation>[0]['recuperer'];
}): Promise<Response | null> => {
  if (formulaire === null) return null;
  const action = formulaire.get(CHAMP_ACTION_PROFIL);
  const cible = formulaire.get(CHAMP_CIBLE_PROFIL);
  if (!estUneAction(action) || typeof cible !== 'string' || cible === '') return null;
  if (jeton === null) return redirection(adresseHote);

  if (action === 'ecrire') {
    const issue = await demarreUneConversation({ jeton, cible, recuperer });
    return redirection(
      issue.genre === 'redirection' ? `/chats/${encodeURIComponent(issue.conversation)}` : adresseDuProfil(adresseHote, cible),
    );
  }
  if (action === 'ami') {
    await envoieUneDemandeDAmi({ jeton, cible, recuperer });
    return redirection(adresseDuProfil(adresseHote, cible));
  }
  await bloqueUnParticipant({ jeton, cible, recuperer });
  return redirection(adresseHote);
};
