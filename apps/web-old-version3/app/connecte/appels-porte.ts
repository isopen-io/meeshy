import { jetonDuLecteur } from '@/app/session';
import { journalDesAppels, type Recuperateur } from '@/lib/api/appels';

import { CACHE_PRIVE, rendu } from './fil-porte';
import { documentDesAppels } from './appels-vue';
import { documentDePanne } from './vue';

/**
 * LA PORTE DE `/calls` — écran de CONSULTATION pure, un appel de moins que
 * `/contacts` et `/notifications`.
 *
 * PAS DE `/auth/me`. Le sens d'une ligne (« Manqué », « entrant », vidéo) est
 * dérivé CÔTÉ SERVEUR (`deriveCallDirection`, `services/gateway/src/services/
 * callHistory.ts:92-100`) : contrairement au carnet des contacts, où le SENS
 * d'une demande se lit en comparant `senderId` à l'identité du lecteur, cet
 * écran n'a RIEN à classer — l'identité du lecteur ne sert à rien ici, et
 * l'appeler serait un aller-retour payé sur une 3G rurale pour une donnée déjà
 * dans la charge (§ 5 de la spécification, T5).
 *
 * AUCUN MODULE DE PARTICIPATION, AUCUN SOCKET. Le critère de la matrice
 * l'exclut nommément (« ni CallManager ni la pile WebRTC ») : passer un appel
 * est HORS périmètre, et le temps réel de la v3 est réservé aux surfaces de
 * PARTICIPATION (fil, liste) — un journal n'en est pas une.
 *
 * LES TROIS QUESTIONS SONT LES MÊMES, dans le même ordre : un jeton ? la
 * passerelle l'accepte-t-elle ? a-t-elle répondu ? Un 401 renvoie se
 * connecter — le cas NOMINAL d'un retour après quelques jours — et un silence
 * dessine la panne plutôt qu'une page blanche.
 */

const CHEMIN = '/calls';

const versLaConnexion = (): Response =>
  new Response(null, {
    status: 302,
    headers: {
      location: `/login?returnUrl=${encodeURIComponent(CHEMIN)}`,
      'cache-control': CACHE_PRIVE,
    },
  });

/** Même lecture que `curseurDeLURL` (`notifs-porte.ts`, `social-porte.ts`) : absent, une chaîne opaque. */
const curseurDeLURL = (requete: Request): string | undefined =>
  new URL(requete.url).searchParams.get('cursor') ?? undefined;

const sert = async ({
  jeton,
  curseur,
  recuperer,
}: {
  readonly jeton: string;
  readonly curseur?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Response> => {
  const journal = await journalDesAppels({ jeton, curseur, recuperer });

  if (journal.genre === 'session-expiree') return versLaConnexion();
  if (journal.genre === 'panne') return rendu(documentDePanne(), 503);

  return rendu(
    documentDesAppels({
      appels: journal.appels,
      maintenant: Date.now(),
      curseurSuivant: journal.curseurSuivant,
    }),
  );
};

export const HISTORIQUE = async (requete: Request, recuperer?: Recuperateur): Promise<Response> => {
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion();

  return sert({ jeton, curseur: curseurDeLURL(requete), recuperer });
};
