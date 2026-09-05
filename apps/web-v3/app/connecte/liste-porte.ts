import { creeUneConversation, moi } from '@/lib/api/compte';
import { carnetDuLecteur, type Contact } from '@/lib/api/contacts';
import { languesDuLecteur } from '@/lib/api/fil';
import { reglePreference, supprimePourMoi, type IssueDuGeste } from '@/lib/api/preferences';
import {
  NOUVELLE_CONVERSATION,
  confirmationDuGeste,
  estUnGeste,
  estUneConfirmation,
  type ConfirmationDeGeste,
  type GesteDeLigne,
} from '@/lib/contenu/liste';

import { origineEtrangere, refusDOrigine } from '@/app/provenance';
import { jetonDuLecteur } from '@/app/session';

import { espaceDemande } from './espace-vue';
import { tempsReelDuDocument } from './fil-porte';
import {
  ADRESSE_DE_LA_LISTE,
  CHAMPS_DE_LA_NOUVELLE_CONV,
  NOUVELLE_CONV_NEUVE,
  documentDesChats,
  type EtatDeLaNouvelleConv,
} from './liste-vue';
import { CACHE_PRIVE, serviteurDe, versLaConnexion } from './porte';
import { chargeLeProfilSiDemande, traiteLActionDeProfil } from './profil-porte';

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

/**
 * LE CARNET DE CONTACTS N'EST DEMANDÉ QUE DANS L'ÉTAT `?nouvelle`.
 *
 * `/chats` est l'écran le plus visité de la zone ; lui faire payer un
 * aller-retour de plus à chaque ouverture, pour une feuille que la plupart des
 * lectures n'ouvrent jamais, serait une lenteur — c'est-à-dire un bug. C'est la
 * même règle que `?profil=` (§ 12.10.3), qui ne charge rien sur une lecture
 * ordinaire.
 *
 * UN CARNET INJOIGNABLE N'EMPÊCHE PAS DE CRÉER. Les contacts sont FACULTATIFS :
 * une panne du carnet rend une liste vide et sa phrase, jamais un écran
 * d'erreur — le lecteur peut toujours nommer sa conversation et la créer.
 */
const carnetPourLaFeuille = async ({
  jeton,
  moiId,
  recuperer,
}: {
  readonly jeton: string;
  readonly moiId: string | null;
  readonly recuperer?: (url: string, options: RequestInit) => Promise<Response>;
}): Promise<readonly Contact[]> => {
  if (moiId === null) return [];
  const carnet = await carnetDuLecteur({ jeton, moiId, recuperer });
  return carnet.genre === 'liste' ? carnet.contacts : [];
};

/** L'état `?nouvelle` demandé par l'adresse — rien d'autre ne l'ouvre. */
const creationDemandee = (requete: Request): boolean =>
  new URL(requete.url).searchParams.has('nouvelle');

export const LISTE_DES_CHATS = serviteurDe({
  chemin: CHEMIN,
  ecran: async (charge, maintenant, requete, recuperer) =>
    documentDesChats({
      conversations: charge.conversations,
      maintenant,
      langues: languesDuLecteur(charge.lecteur ?? {}),
      moi: charge.lecteur?.id ?? null,
      tempsReel: tempsReelDuDocument(),
      fait: confirmationDemandee(requete),
      echoue: echecDemande(requete),
      // `?profil=` (§ 12.10.3) — le jeton du membre est REDÉRIVÉ du cookie,
      // jamais recopié : `jetonDuLecteur` est le site unique de sa lecture, et
      // `serviteurDe` (`app/connecte/porte.ts`) l'a déjà vérifié pour rendre
      // cette page du tout.
      profil: await chargeLeProfilSiDemande({ requete, jeton: jetonDuLecteur(requete), recuperer }),
      lecteur: charge.lecteur,
      espace: espaceDemande(requete),
      // LE CARNET N'EST PAS DEMANDÉ QUAND L'ESPACE MEMBRE EST OUVERT. Les deux
      // états ne se rendent jamais ensemble (`documentDesChats` tranche en
      // faveur du dernier ouvert) : sans cette garde, une adresse portant les
      // deux paierait un aller-retour pour une feuille que le document ne rend
      // pas.
      nouvelle: creationDemandee(requete) && !espaceDemande(requete)
        ? NOUVELLE_CONV_NEUVE(
            await carnetPourLaFeuille({
              jeton: jetonDuLecteur(requete) ?? '',
              moiId: charge.lecteur?.id ?? null,
              recuperer,
            }),
          )
        : undefined,
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

export const GESTE_SUR_UNE_LIGNE = async (
  requete: Request,
  recuperer?: (url: string, options: RequestInit) => Promise<Response>,
): Promise<Response> => {
  if (origineEtrangere(requete)) return refusDOrigine(requete);
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion(CHEMIN);

  const formulaire = await requete.formData().catch(() => new FormData());
  // LES TROIS ACTIONS DU PROFIL (§ 12.10.3 point 5), vérifiées AVANT le geste
  // d'une ligne : un formulaire posté depuis le panneau de profil ne porte
  // aucun `geste` connu, et `soumissionDuGeste` le laisserait tomber en
  // silence — ce que fait ICI la porte du profil, avec son propre effet.
  const actionDeProfil = await traiteLActionDeProfil({ formulaire, jeton, adresseHote: CHEMIN, recuperer });
  if (actionDeProfil !== null) return actionDeProfil;

  // LA TROISIÈME FAMILLE DE POST de cet écran (#5072), reconnue par son
  // MARQUEUR et non par ce qu'elle porte : un formulaire qui gagnerait un champ
  // `nom` ne doit pas pouvoir se faire prendre pour une création.
  if (formulaire.get(CHAMPS_DE_LA_NOUVELLE_CONV.quoi) === CHAMPS_DE_LA_NOUVELLE_CONV.marque) {
    const identite = await moi({ jeton, recuperer });
    if (identite.genre === 'session-expiree') return versLaConnexion(CHEMIN);
    return CREE_UNE_CONVERSATION({
      requete,
      formulaire,
      jeton,
      moiId: identite.genre === 'lecteur' ? identite.lecteur.id : null,
      recuperer,
    });
  }

  const soumission = soumissionDuGeste(formulaire);
  if (soumission === null) return versLaListe('');

  const issue = await appliqueLeGeste({ soumission, jeton, recuperer });
  if (issue.genre === 'session-expiree') return versLaConnexion(CHEMIN);
  if (issue.genre === 'fait') {
    return versLaListe(`?fait=${confirmationDuGeste({ geste: soumission.geste, sourdine: soumission.sourdine })}`);
  }
  return versLaListe('?refus=1');
};

const texteDuChamp = (formulaire: FormData, nom: string): string => {
  const valeur = formulaire.get(nom);
  return typeof valeur === 'string' ? valeur.trim() : '';
};

/**
 * LA SAISIE DE LA FEUILLE, relue — jamais crue. Les invités cochés sont des
 * identifiants de COMPTE (`personne.id`), ceux que `participantIds` attend :
 * l'identifiant de la LIGNE de carnet n'est pas celui de la personne, et les
 * confondre créerait une conversation avec personne dedans.
 */
const saisieDeLaConversation = (formulaire: FormData, contacts: readonly Contact[]): EtatDeLaNouvelleConv => ({
  contacts,
  nom: texteDuChamp(formulaire, CHAMPS_DE_LA_NOUVELLE_CONV.nom),
  description: texteDuChamp(formulaire, CHAMPS_DE_LA_NOUVELLE_CONV.description),
  invites: new Set(
    formulaire
      .getAll(CHAMPS_DE_LA_NOUVELLE_CONV.invite)
      .filter((valeur): valeur is string => typeof valeur === 'string' && valeur !== ''),
  ),
  motif: null,
});

/**
 * CRÉER UNE CONVERSATION — le SUCCÈS mène AU FIL CRÉÉ, pas à la liste.
 *
 * C'est ce que « ≤ 2 gestes » veut dire : le lecteur voulait parler, pas
 * revenir à un index. Le Post/Redirect/Get l'y dépose directement, et il n'y a
 * aucun état intermédiaire à réconcilier — l'optimisme viendra AMÉLIORER ce
 * chemin (la ligne peinte avant la réponse), jamais le remplacer.
 *
 * LE REFUS RE-SERT LA FEUILLE avec la saisie et les cases : rien n'a été écrit,
 * donc rien à protéger du rejeu, et une redirection coûterait un nom et des
 * invités qu'aucune URL ne peut porter sans les exposer.
 */
export const CREE_UNE_CONVERSATION = async ({
  requete,
  formulaire,
  jeton,
  moiId,
  recuperer,
}: {
  readonly requete: Request;
  readonly formulaire: FormData;
  readonly jeton: string;
  readonly moiId: string | null;
  readonly recuperer?: (url: string, options: RequestInit) => Promise<Response>;
}): Promise<Response> => {
  const contacts = await carnetPourLaFeuille({ jeton, moiId, recuperer });
  const saisie = saisieDeLaConversation(formulaire, contacts);

  /**
   * LE REFUS RE-SERT LA MÊME PAGE, PAR LE MÊME CHEMIN. `serviteurDe` recharge
   * la liste exactement comme le GET — une seconde façon de composer cette page
   * aurait divergé au premier champ ajouté. Seul le statut change : 422 dit que
   * l'écriture a échoué, là où un 200 la dirait réussie.
   */
  const refuse = (motif: string): Promise<Response> =>
    serviteurDe({
      chemin: CHEMIN,
      recuperer,
      statut: 422,
      ecran: (charge, maintenant) =>
        documentDesChats({
          conversations: charge.conversations,
          maintenant,
          langues: languesDuLecteur(charge.lecteur ?? {}),
          moi: charge.lecteur?.id ?? null,
          tempsReel: tempsReelDuDocument(),
          fait: null,
          echoue: false,
          profil: null,
          nouvelle: { ...saisie, motif },
        }),
    })(requete);

  // SANS NOM, RIEN NE PART. La passerelle refuserait, mais son message parlerait
  // d'un champ que le lecteur n'a pas nommé ainsi.
  if (saisie.nom === '') return refuse(NOUVELLE_CONVERSATION.sansNom);

  const issue = await creeUneConversation({
    jeton,
    champs: {
      title: saisie.nom,
      ...(saisie.description === '' ? {} : { description: saisie.description }),
      ...(saisie.invites.size === 0 ? {} : { participantIds: [...saisie.invites] }),
    },
    recuperer,
  });

  if (issue.genre === 'session-expiree') return versLaConnexion(CHEMIN);
  if (issue.genre === 'faite') {
    return new Response(null, {
      status: 303,
      headers: { location: `${CHEMIN}/${encodeURIComponent(issue.id)}`, 'cache-control': CACHE_PRIVE },
    });
  }
  return refuse(issue.genre === 'refus' ? issue.message : '');
};
