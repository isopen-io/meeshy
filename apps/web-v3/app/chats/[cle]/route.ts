import { moi } from '@/lib/api/compte';
import { fil, languesDuLecteur, type Creance } from '@/lib/api/fil';

import {
  accuseCeQuiEstServi,
  CACHE_PRIVE,
  curseurDemande,
  lisLeFormulaire,
  nomDuLecteur,
  redirection,
  rendu,
  soumissionDuFil,
  tempsReelDuDocument,
  traiteLaSoumission,
} from '@/app/connecte/fil-porte';
import { adresseDeLaPorte, documentDuFil, documentIntrouvable } from '@/app/connecte/fil-vue';
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
 * de `GET /conversations/:id/messages`) — et DIT à la passerelle que ce qui
 * est servi est lu (`POST /conversations/:id/receipts`). POST envoie un
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
  jeton,
  cle,
  avant,
  erreur,
  brouillon,
  statut = 200,
}: {
  readonly jeton: string;
  readonly cle: string;
  readonly avant: string | null;
  readonly erreur: string | null;
  readonly brouillon: string;
  readonly statut?: number;
}): Promise<Response> => {
  const identite = await moi({ jeton });
  if (identite.genre === 'session-expiree') return versLaConnexion(cle);

  const lecteur = identite.genre === 'lecteur' ? identite.lecteur : null;
  const langues = languesDuLecteur(lecteur ?? {});
  const creance: Creance = { genre: 'membre', jeton };
  const issue = await fil({ cle, creance, moi: lecteur?.id ?? null, langues, avant });

  if (issue.genre === 'session-expiree') return versLaConnexion(cle);
  // Un membre entré par un lien que la liste ferme (`lien-clos`) lit ce que lit
  // tout membre sans accès : la porte du membre ne sert pas l'état G — c'est
  // celle de l'invité qui le porte (`app/(public)/chat/[lien]/route.ts`).
  if (issue.genre === 'introuvable' || issue.genre === 'lien-clos') return rendu(documentIntrouvable(), 404);
  if (issue.genre === 'panne') return rendu(documentDePanne(), 503);

  if (erreur === null) accuseCeQuiEstServi({ fil: issue.fil, creance });

  return rendu(
    documentDuFil({
      porte: { genre: 'membre', cle },
      fil: issue.fil,
      lecteur: { id: lecteur?.id ?? null, nom: nomDuLecteur(lecteur), langues },
      erreur,
      brouillon,
      maintenant: Date.now(),
      composeur: { genre: 'ouvert' },
      tempsReel: tempsReelDuDocument(),
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

  return charge({ jeton, cle, avant: curseurDemande(requete), erreur: null, brouillon: '' });
};

export const POST = async (
  requete: Request,
  contexte: { params: Promise<{ cle: string }> },
): Promise<Response> => {
  if (origineEtrangere(requete)) return refusDOrigine(requete);
  const cle = await parametre(contexte);
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion(cle);

  const issue = await traiteLaSoumission({
    soumission: soumissionDuFil(await lisLeFormulaire(requete)),
    creance: { genre: 'membre', jeton },
    conversation: cle,
    adresse: adresseDeLaPorte({ genre: 'membre', cle }),
  });
  if (issue.genre === 'redirection') return redirection(issue.vers);
  if (issue.statut === 401) return versLaConnexion(cle);
  return charge({ jeton, cle, avant: null, erreur: issue.message, brouillon: issue.brouillon, statut: issue.statut });
};
