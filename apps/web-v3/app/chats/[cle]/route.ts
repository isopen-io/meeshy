import { moi } from '@/lib/api/compte';
import { envoie, fil, languesDuLecteur } from '@/lib/api/fil';

import { jetonDuLecteur } from '@/app/session';
import { CHAMP_DU_MESSAGE, documentDuFil, documentIntrouvable } from '@/app/connecte/fil-vue';
import { documentDePanne } from '@/app/connecte/vue';

/**
 * `/chats/:cle` — LE FIL D'UNE CONVERSATION. `:cle` est son identifiant de base
 * (`68f2…`) OU son identifiant lisible (`meeshy`) : la passerelle accepte les
 * deux sur la même route, et la v3 se contente de lui passer ce qu'elle a reçu.
 *
 * GET rend le fil. POST envoie un message, puis REDIRIGE vers le GET
 * (Post/Redirect/Get) : sans cela, un rechargement reposterait le message, et
 * le navigateur demanderait « voulez-vous renvoyer le formulaire ? » sur un
 * écran où la réponse « oui » duplique une parole.
 *
 * LE PRISME EST APPLIQUÉ ICI, ou plus exactement il l'est dans `lib/api/fil.ts`
 * par `resolvePrismTranslation` — le site unique. Ce fichier lui passe les
 * langues du lecteur, dans l'ORDRE, telles que `resolveUserLanguagesOrdered`
 * les rend.
 */

const CACHE_PRIVE = 'no-store, private';

const versLaConnexion = (cle: string): Response =>
  new Response(null, {
    status: 302,
    headers: {
      location: `/login?returnUrl=${encodeURIComponent(`/chats/${cle}`)}`,
      'cache-control': CACHE_PRIVE,
    },
  });

const rendu = (html: string, statut = 200): Response =>
  new Response(html, {
    status: statut,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': CACHE_PRIVE,
      'x-robots-tag': 'noindex, nofollow',
    },
  });

const parametre = async (contexte: { params: Promise<{ cle: string }> }): Promise<string> =>
  (await contexte.params).cle;

const charge = async (jeton: string, cle: string, erreur: string | null, brouillon: string) => {
  const identite = await moi({ jeton });
  if (identite.genre === 'session-expiree') return versLaConnexion(cle);

  const lecteur = identite.genre === 'lecteur' ? identite.lecteur : null;
  const issue = await fil({
    cle,
    jeton,
    moi: lecteur?.id ?? null,
    langues: languesDuLecteur(lecteur ?? {}),
  });

  if (issue.genre === 'session-expiree') return versLaConnexion(cle);
  if (issue.genre === 'introuvable') return rendu(documentIntrouvable(), 404);
  if (issue.genre === 'panne') return rendu(documentDePanne(), 503);

  return rendu(
    documentDuFil({ cle, fil: issue.fil, erreur, brouillon, maintenant: Date.now() }),
    erreur === null ? 200 : 400,
  );
};

export const GET = async (
  requete: Request,
  contexte: { params: Promise<{ cle: string }> },
): Promise<Response> => {
  const cle = await parametre(contexte);
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion(cle);

  return charge(jeton, cle, null, '');
};

export const POST = async (
  requete: Request,
  contexte: { params: Promise<{ cle: string }> },
): Promise<Response> => {
  const cle = await parametre(contexte);
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion(cle);

  const formulaire = await requete.formData().catch(() => null);
  const brut = formulaire?.get(CHAMP_DU_MESSAGE);
  const texte = typeof brut === 'string' ? brut.trim() : '';

  if (texte === '') return charge(jeton, cle, 'Le message est vide.', '');

  const envoi = await envoie({ cle, jeton, texte });
  if (envoi.genre === 'refus') return charge(jeton, cle, envoi.message, texte);

  // Post/Redirect/Get : le rechargement qui suit relit le fil, il ne reposte rien.
  return new Response(null, {
    status: 303,
    headers: { location: `/chats/${encodeURIComponent(cle)}`, 'cache-control': CACHE_PRIVE },
  });
};
