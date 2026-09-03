import { languesDuLecteur } from '@/lib/api/fil';
import { reglePreference, supprimePourMoi, type IssueDuGeste } from '@/lib/api/preferences';
import {
  confirmationDuGeste,
  estUnGeste,
  estUneConfirmation,
  type ConfirmationDeGeste,
  type GesteDeLigne,
} from '@/lib/contenu/liste';

import { origineEtrangere, refusDOrigine } from '@/app/provenance';
import { jetonDuLecteur } from '@/app/session';

import { tempsReelDuDocument } from './fil-porte';
import { ADRESSE_DE_LA_LISTE, documentDesChats } from './liste-vue';
import { CACHE_PRIVE, serviteurDe, versLaConnexion } from './porte';

/**
 * LA PORTE DE `/chats` — deux méthodes, et la seconde est ce qui rend les trois
 * gestes de la ligne REELS sans un octet de JavaScript (§ 12.10.4).
 *
 * GET sert la liste : le document porte déjà chaque aperçu descendu au Prisme,
 * chaque compte de non-lus et chaque menu. `?fait=` et `?refus=` disent ce qu'un
 * POST vient de faire — ce sont des CLÉS d'un vocabulaire clos
 * (`lib/contenu/liste.ts`), jamais des phrases : rien de ce qu'un tiers
 * écrirait dans l'adresse n'atteint le document.
 *
 * POST applique UN geste sur UNE ligne, puis REDIRIGE vers le GET
 * (Post/Redirect/Get). Sans cela, un rechargement rejouerait le geste, et le
 * navigateur demanderait « voulez-vous renvoyer le formulaire ? » sur un écran
 * où la réponse « oui » archive une seconde conversation.
 *
 * UNE SEULE GARDE DE PROVENANCE ICI, ET C'EST DÉLIBÉRÉ. Le POST porte celle de
 * l'ORIGINE (`origineEtrangere`) : un formulaire auto-soumis par un site tiers
 * ne doit pas pouvoir archiver ou supprimer les conversations d'un lecteur
 * connecté — `meeshy_auth` est `SameSite=Lax`, il ne part pas avec un POST
 * inter-sites, mais la garde est la ceinture qui ne dépend pas de cette seule
 * propriété. Le GET, lui, n'a AUCUN effet — il ne joint personne et n'accuse
 * aucune lecture, contrairement à `/chats/:cle` — : lui poser la garde du
 * préchargement casserait la spéculation du navigateur sans rien protéger.
 */

const CHEMIN = ADRESSE_DE_LA_LISTE;

/** `?fait=` — la confirmation du geste qui vient d'aboutir, lue contre le vocabulaire CLOS. */
const confirmationDemandee = (requete: Request): ConfirmationDeGeste | null => {
  const valeur = new URL(requete.url).searchParams.get('fait');
  return valeur !== null && estUneConfirmation(valeur) ? valeur : null;
};

const echecDemande = (requete: Request): boolean => new URL(requete.url).searchParams.get('refus') === '1';

export const LISTE_DES_CHATS = serviteurDe({
  chemin: CHEMIN,
  ecran: (charge, maintenant, requete) =>
    documentDesChats({
      conversations: charge.conversations,
      maintenant,
      langues: languesDuLecteur(charge.lecteur ?? {}),
      moi: charge.lecteur?.id ?? null,
      tempsReel: tempsReelDuDocument(),
      fait: confirmationDemandee(requete),
      echoue: echecDemande(requete),
    }),
});

const versLaListe = (parametres: string): Response =>
  new Response(null, {
    status: 303,
    headers: { location: `${CHEMIN}${parametres}`, 'cache-control': CACHE_PRIVE },
  });

export type Soumission = {
  readonly conversation: string;
  readonly geste: GesteDeLigne;
  /** L'état de sourdine AVANT le geste — c'est lui qui décide du sens de la bascule. */
  readonly sourdine: boolean;
};

/**
 * CE QUE LE FORMULAIRE PORTE, relu — jamais cru. Le `geste` est comparé au
 * vocabulaire clos ; un identifiant vide ou un geste inconnu ne produit AUCUN
 * appel, et le lecteur retrouve sa liste inchangée.
 *
 * `sourdine` voyage avec le formulaire parce que la bascule dépend de l'état
 * d'AVANT et que la porte ne relit pas la ligne pour le savoir : lui faire
 * demander `GET /conversations` avant chaque geste doublerait le coût du geste
 * le plus courant, sur la connexion la plus lente.
 */
export const soumissionDuGeste = (formulaire: FormData): Soumission | null => {
  const conversation = formulaire.get('conversation');
  const geste = formulaire.get('geste');
  if (typeof conversation !== 'string' || conversation === '') return null;
  if (typeof geste !== 'string' || !estUnGeste(geste)) return null;
  return { conversation, geste, sourdine: formulaire.get('sourdine') === '1' };
};

export const appliqueLeGeste = async ({
  soumission,
  jeton,
  recuperer,
}: {
  readonly soumission: Soumission;
  readonly jeton: string;
  readonly recuperer?: (url: string, options: RequestInit) => Promise<Response>;
}): Promise<IssueDuGeste> => {
  const commun = { jeton, conversation: soumission.conversation, recuperer };
  if (soumission.geste === 'supprimer') return supprimePourMoi(commun);
  if (soumission.geste === 'archiver') return reglePreference({ ...commun, isArchived: true });
  return reglePreference({ ...commun, isMuted: !soumission.sourdine });
};

export const GESTE_SUR_UNE_LIGNE = async (requete: Request): Promise<Response> => {
  if (origineEtrangere(requete)) return refusDOrigine(requete);
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion(CHEMIN);

  const soumission = soumissionDuGeste(await requete.formData().catch(() => new FormData()));
  if (soumission === null) return versLaListe('');

  const issue = await appliqueLeGeste({ soumission, jeton });
  if (issue.genre === 'session-expiree') return versLaConnexion(CHEMIN);
  if (issue.genre === 'fait') {
    return versLaListe(`?fait=${confirmationDuGeste({ geste: soumission.geste, sourdine: soumission.sourdine })}`);
  }
  return versLaListe('?refus=1');
};
