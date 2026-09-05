import { moi } from '@/lib/api/compte';
import { fil, languesDuLecteur, type Creance } from '@/lib/api/fil';

import {
  accuseCeQuiEstServi,
  ancreDemandee,
  CACHE_PRIVE,
  curseurDemande,
  lisLeFormulaire,
  modificationDemandee,
  pleinDemande,
  nomDuLecteur,
  redirection,
  reponseDemandee,
  rendu,
  resoutLeContexte,
  soumissionDuFil,
  tempsReelDuDocument,
  traiteLaSoumission,
} from '@/app/connecte/fil-porte';
import { adresseDeLaPorte, documentDuFil, documentIntrouvable } from '@/app/connecte/fil-vue';
import { chargeLeProfilSiDemande, traiteLActionDeProfil } from '@/app/connecte/profil-porte';
import { documentDePanne } from '@/app/connecte/vue';
import { chargementSpeculatif, origineEtrangere, refusDOrigine, sansEffet } from '@/app/provenance';
import { jetonDuLecteur } from '@/app/session';

/**
 * `/chats/:cle` — LE FIL D'UNE CONVERSATION, porte du MEMBRE. `:cle` est son
 * identifiant de base (`68f2…`) OU son identifiant lisible (`meeshy`) : la
 * passerelle accepte les deux sur la même route, et la v3 se contente de lui
 * passer ce qu'elle a reçu.
 *
 * GET rend le fil — `?avant=<id>` rend la page PLUS ANCIENNE (curseur `before`
 * de `GET /conversations/:id/messages`), `?autour=<id>` la tranche qui CONTIENT
 * ce message (`around=`, ce que porte le lien d'un média et le retour de sa
 * surimpression) — et DIT à la passerelle que ce qui est servi est lu
 * (`POST /conversations/:id/receipts`), sauf quand un plein écran RECOUVRE le
 * fil : ce qui n'est pas affiché n'est pas lu (`accuseCeQuiEstServi`). POST envoie un
 * message (texte, pièce jointe ou les deux) ou bascule une réaction, puis
 * REDIRIGE vers le GET (Post/Redirect/Get) en cadrant la ligne concernée
 * (`#m-<id>`) : sans cela, un rechargement reposterait le message, et le
 * navigateur demanderait « voulez-vous renvoyer le formulaire ? » sur un écran
 * où la réponse « oui » duplique une parole.
 *
 * LE PRISME EST APPLIQUÉ ICI, ou plus exactement il l'est dans `lib/api/fil.ts`
 * par `resolvePrismTranslation` — le site unique. Ce fichier lui passe les
 * langues du lecteur, dans l'ORDRE, telles que `resolveUserLanguagesOrdered`
 * les rend.
 *
 * L'invité a SA porte (`app/(public)/chat/[lien]/route.ts`) et le MÊME module
 * de vue (`app/connecte/fil-vue.ts`) : deux routes, un écran (§ 12.3).
 */

const versLaConnexion = (cle: string): Response =>
  new Response(null, {
    status: 302,
    headers: {
      location: `/login?returnUrl=${encodeURIComponent(`/chats/${cle}`)}`,
      'cache-control': CACHE_PRIVE,
    },
  });

const parametre = async (contexte: { params: Promise<{ cle: string }> }): Promise<string> =>
  (await contexte.params).cle;

const charge = async ({
  requete,
  jeton,
  cle,
  avant,
  autour = null,
  plein = null,
  idReponse = null,
  idModification = null,
  erreur,
  brouillon,
  statut = 200,
}: {
  readonly requete: Request;
  readonly jeton: string;
  readonly cle: string;
  readonly avant: string | null;
  /** `?autour=` — la tranche nommée par le message qu'elle doit contenir (§ 12.10.1). */
  readonly autour?: string | null;
  /** `?media=` — la pièce ouverte en plein écran (§ 12.10.1), résolue par la vue contre ce qui est servi. */
  readonly plein?: string | null;
  /** `?repondre=` — ou le contexte CONSERVÉ d'un refus de réponse (issue #5163). */
  readonly idReponse?: string | null;
  /** `?modifier=` — ou le contexte CONSERVÉ d'un refus de modification. */
  readonly idModification?: string | null;
  readonly erreur: string | null;
  readonly brouillon: string;
  readonly statut?: number;
}): Promise<Response> => {
  const identite = await moi({ jeton });
  if (identite.genre === 'session-expiree') return versLaConnexion(cle);

  const lecteur = identite.genre === 'lecteur' ? identite.lecteur : null;
  const langues = languesDuLecteur(lecteur ?? {});
  const creance: Creance = { genre: 'membre', jeton };
  const issue = await fil({ cle, creance, moi: lecteur?.id ?? null, langues, avant, autour });

  if (issue.genre === 'session-expiree') return versLaConnexion(cle);
  // Un membre entré par un lien que la liste ferme (`lien-clos`) lit ce que lit
  // tout membre sans accès : la porte du membre ne sert pas l'état G — c'est
  // celle de l'invité qui le porte (`app/(public)/chat/[lien]/route.ts`).
  if (issue.genre === 'introuvable' || issue.genre === 'lien-clos') return rendu(documentIntrouvable(), 404);
  if (issue.genre === 'panne') return rendu(documentDePanne(), 503);

  if (erreur === null) accuseCeQuiEstServi({ fil: issue.fil, creance, plein });

  // `?profil=` — lu ICI, une SEULE fois pour les trois hôtes (§ 12.10.3) : le
  // profil d'un participant, une requête de plus SEULEMENT quand il est demandé.
  const profil = await chargeLeProfilSiDemande({ requete, jeton });

  const maintenant = Date.now();
  // `?repondre=` / `?modifier=` (§ 12.10.1, issue #5163) — résolus contre CE
  // qui vient d'être servi : une cible hors tranche n'arme rien.
  const contexte = resoutLeContexte({ idReponse, idModification, fil: issue.fil, maintenant, composeurOuvert: true, estInvite: false });

  return rendu(
    documentDuFil({
      porte: { genre: 'membre', cle },
      fil: issue.fil,
      lecteur: { id: lecteur?.id ?? null, nom: nomDuLecteur(lecteur), langues },
      erreur,
      brouillon,
      maintenant,
      composeur: { genre: 'ouvert' },
      tempsReel: tempsReelDuDocument(),
      contexte,
      plein,
      profil,
    }),
    erreur === null ? 200 : statut,
  );
};

export const GET = async (
  requete: Request,
  contexte: { params: Promise<{ cle: string }> },
): Promise<Response> => {
  // Un préchargement marquerait LU un fil que personne n'a ouvert (`app/provenance.ts`).
  if (chargementSpeculatif(requete)) return sansEffet();
  const cle = await parametre(contexte);
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion(cle);

  const idReponse = reponseDemandee(requete);
  const idModification = idReponse === null ? modificationDemandee(requete) : null;

  return charge({
    requete,
    jeton,
    cle,
    avant: curseurDemande(requete),
    // `?repondre=`/`?modifier=` servent la tranche AUTOUR de leur cible — la
    // loi de `?media=` (§ 9 Q2 de la spécification #5163) appliquée à un
    // troisième état ; `?avant=` l'emporte toujours (jamais les deux à la fois).
    autour: ancreDemandee(requete) ?? idReponse ?? idModification,
    plein: pleinDemande(requete),
    idReponse,
    idModification,
    erreur: null,
    brouillon: '',
  });
};

export const POST = async (
  requete: Request,
  contexte: { params: Promise<{ cle: string }> },
): Promise<Response> => {
  if (origineEtrangere(requete)) return refusDOrigine(requete);
  const cle = await parametre(contexte);
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion(cle);

  const formulaire = await lisLeFormulaire(requete);
  // LES TROIS ACTIONS DU PROFIL (§ 12.10.3 point 5) sont vérifiées AVANT le
  // formulaire du fil : un `<form>` posté depuis le panneau de profil ne porte
  // ni `texte` ni `reaction`, et `soumissionDuFil` le lirait comme un message
  // vide.
  const adresseHote = adresseDeLaPorte({ genre: 'membre', cle });
  const actionDeProfil = await traiteLActionDeProfil({ formulaire, jeton, adresseHote });
  if (actionDeProfil !== null) return actionDeProfil;

  const soumission = soumissionDuFil(formulaire);
  const issue = await traiteLaSoumission({
    soumission,
    creance: { genre: 'membre', jeton },
    conversation: cle,
    adresse: adresseHote,
  });
  if (issue.genre === 'redirection') return redirection(issue.vers);
  if (issue.statut === 401) return versLaConnexion(cle);
  // Le contexte armé est CONSERVÉ sur un refus (§ 9 Q2) : le formulaire poste
  // vers l'adresse NUE, donc `requete.url` ne porte plus `?modifier=`/
  // `?repondre=` — c'est la soumission elle-même qui dit ce qui était armé.
  const idReponse = soumission.genre === 'reponse' ? soumission.replyToId : null;
  const idModification = soumission.genre === 'modification' ? soumission.messageId : null;
  return charge({
    requete,
    jeton,
    cle,
    avant: null,
    autour: idReponse ?? idModification,
    idReponse,
    idModification,
    erreur: issue.message,
    brouillon: issue.brouillon,
    statut: issue.statut,
  });
};
