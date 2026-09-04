import { moi } from '@/lib/api/compte';
import { fil, languesDuLecteur, type Creance } from '@/lib/api/fil';
import { galerie, genreDemande } from '@/lib/api/medias';

import { CACHE_PRIVE, curseurDemande, pleinDemande, rendu } from '@/app/connecte/fil-porte';
import { documentIntrouvable } from '@/app/connecte/fil-vue';
import { documentDesMedias } from '@/app/connecte/medias-vue';
import { documentDePanne } from '@/app/connecte/vue';
import { jetonDuLecteur } from '@/app/session';

/**
 * `/chats/:cle/medias` — LES MÉDIAS D'UNE CONVERSATION, porte du MEMBRE
 * (issue #4525, `cible/media.png`).
 *
 * `:cle` est l'identifiant de base ou l'identifiant lisible, comme sur le fil :
 * la passerelle accepte les deux, et la v3 lui passe ce qu'elle a reçu.
 * `?genre=image|video|audio|fichier` filtre la grille ; `?avant=<id>` remonte
 * d'une page — le MÊME curseur que le fil, puisque c'est le MÊME lot de
 * messages qui est lu. `?media=<pièce>` (`pleinDemande`, lue au MÊME site que
 * les deux portes du fil) ouvre la surimpression plein écran d'une tuile,
 * résolue contre `issue.fil` — déjà en main, donc sans requête de plus.
 *
 * UNE SEULE MÉTHODE. Cet écran ne mute rien : pas de POST, et pas d'accusé de
 * lecture — parcourir une galerie n'est pas LIRE la conversation, et poser
 * `POST /conversations/:id/receipts` ici ferait disparaître les non-lus de
 * quelqu'un qui n'a rien lu. Le fil, lui, accuse ce qu'il sert
 * (`app/chats/[cle]/route.ts`) ; c'est une différence de contrat, pas un oubli.
 * Rien n'étant muté, aucune garde de préchargement n'est posée : un
 * `Sec-Purpose: prefetch` ne peut, sur cette adresse, que réchauffer un cache.
 *
 * LA GALERIE EST UNE PROJECTION DU FIL, jamais une seconde lecture — la raison
 * (protection héritée, transcription au Prisme, piste servie) est écrite au
 * site de la projection, `lib/api/medias.ts`. Cette route ne fait donc qu'UN
 * appel de plus que le fil : aucun.
 *
 * L'INVITÉ N'A PAS CETTE ADRESSE. La directive du porteur (2026-09-01) ferme
 * tout `/chat/:lien/…` — « un lien reçu s'ouvre, se rejoint et se lit à UNE
 * adresse » —, et `/chats/:cle` est l'interface du MEMBRE. La passerelle
 * servirait pourtant la donnée à un invité (`GET /conversations/:id/messages`
 * est en `optionalAuth`) : ouvrir la galerie à l'invité est une décision
 * produit, pas un travail de plomberie.
 */

const versLaConnexion = (chemin: string): Response =>
  new Response(null, {
    status: 302,
    headers: { location: `/login?returnUrl=${encodeURIComponent(chemin)}`, 'cache-control': CACHE_PRIVE },
  });

/** La page servie est aussi profonde que la passerelle l'autorise (`validatePagination`, `maxLimit: 50`). */
const PAR_PAGE = 50;

export const GET = async (
  requete: Request,
  contexte: { params: Promise<{ cle: string }> },
): Promise<Response> => {
  const { cle } = await contexte.params;
  const jeton = jetonDuLecteur(requete);
  const chemin = new URL(requete.url).pathname;
  if (jeton === null) return versLaConnexion(chemin);

  const identite = await moi({ jeton });
  if (identite.genre === 'session-expiree') return versLaConnexion(chemin);

  const lecteur = identite.genre === 'lecteur' ? identite.lecteur : null;
  const creance: Creance = { genre: 'membre', jeton };
  const issue = await fil({
    cle,
    creance,
    moi: lecteur?.id ?? null,
    langues: languesDuLecteur(lecteur ?? {}),
    limite: PAR_PAGE,
    avant: curseurDemande(requete),
  });

  if (issue.genre === 'session-expiree') return versLaConnexion(chemin);
  if (issue.genre === 'introuvable' || issue.genre === 'lien-clos') return rendu(documentIntrouvable(), 404);
  if (issue.genre === 'panne') return rendu(documentDePanne(), 503);

  const genre = genreDemande(new URL(requete.url).searchParams.get('genre'));

  return rendu(
    documentDesMedias({
      cle,
      titre: issue.fil.titre,
      galerie: galerie({ messages: issue.fil.messages, genre }),
      plusAncien: issue.fil.plusAncien,
      fil: issue.fil,
      plein: pleinDemande(requete),
    }),
  );
};
