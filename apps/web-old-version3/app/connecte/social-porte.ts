import { actifsTempsReel } from '@/lib/actifs-rt';
import { origineEtrangere, refusDOrigine } from '@/app/provenance';
import { jetonDuLecteur } from '@/app/session';
import { moi, type Recuperateur } from '@/lib/api/compte';
import { languesDuLecteur } from '@/lib/api/fil';
import { baseDeLaPasserellePublique } from '@/lib/api/links';
import { aime, reposte } from '@/lib/api/publication';
import { filSocial, railDeStories } from '@/lib/api/social';

import { CACHE_PRIVE, redirection, rendu } from './fil-porte';
import { documentDuFilSocial, idDuPost, type EtatDuFilSocial } from './social-vue';
import { documentDePanne } from './vue';

/**
 * LA PORTE DE `/feed` (#5031) — la loi de la zone connectée, ordinaire : un
 * jeton absent ou une session expirée renvoient `/login?returnUrl=/feed`,
 * jamais l'invitation inline de `/post/:id` ou `/chat/:lien`. C'est le MÊME
 * arbitrage que `/contacts` (`contacts-porte.ts`) : `/feed` n'est pas
 * l'entrée d'un LIEN partagé, un visiteur sans compte ne l'atteint jamais.
 *
 * DEUX APPELS EN PARALLÈLE, comme le fil et la liste : `filSocial` a besoin
 * des langues du lecteur (`/auth/me`, résolu D'ABORD) pour descendre le
 * Prisme, mais le rail de stories n'en a besoin d'aucune (une vignette porte
 * un nom, jamais un texte) — les DEUX se lancent donc dès que le jeton est
 * accepté par `/auth/me`, sans attendre l'un après l'autre.
 *
 * LES DEUX GESTES (aimer, reposter) SONT UN Post/Redirect/Get, le MÊME patron
 * que `liste-porte.ts` (sourdine, archiver, supprimer) et `contacts-porte.ts`
 * (accepter, refuser) : la garde d'ORIGINE d'abord (un POST déclenché par un
 * site tiers ne doit pas aimer une publication au nom du lecteur), puis la
 * route de `lib/api/publication.ts` qui SAIT laquelle des deux formes de la
 * passerelle appeler.
 */

const CHEMIN = '/feed';

const versLaConnexion = (): Response =>
  new Response(null, {
    status: 302,
    headers: { location: `/login?returnUrl=${encodeURIComponent(CHEMIN)}`, 'cache-control': CACHE_PRIVE },
  });

const TEMOINS_DE_FAIT = ['aime', 'aime-retire', 'repost'] as const;
type TemoinDeFait = (typeof TEMOINS_DE_FAIT)[number];

const faitDeLURL = (requete: Request): TemoinDeFait | null => {
  const valeur = new URL(requete.url).searchParams.get('fait');
  return TEMOINS_DE_FAIT.find((temoin) => temoin === valeur) ?? null;
};

const echecDeLURL = (requete: Request): boolean => new URL(requete.url).searchParams.get('refus') === '1';

const curseurDeLURL = (requete: Request): string | undefined => new URL(requete.url).searchParams.get('cursor') ?? undefined;

/**
 * LE SOCLE DU MODULE DE PARTICIPATION — `null` tant que l'actif compilé est
 * absent (tests, avant le premier `bun build`) : le chemin SANS JavaScript
 * reste alors le SEUL chemin, ce qui est toujours correct (amélioration
 * progressive, jamais une condition, § 12.4).
 */
const moduleDeParticipation = (): EtatDuFilSocial['tempsReel'] => {
  const actifs = actifsTempsReel();
  if (actifs.feed.corps === '') return null;
  return { module: actifs.feed.url, passerelle: baseDeLaPasserellePublique() };
};

const sert = async ({
  jeton,
  curseur,
  fait,
  echoue,
  recuperer,
}: {
  readonly jeton: string;
  readonly curseur?: string;
  readonly fait: TemoinDeFait | null;
  readonly echoue: boolean;
  readonly recuperer?: Recuperateur;
}): Promise<Response> => {
  const identite = await moi({ jeton, recuperer });
  if (identite.genre === 'session-expiree') return versLaConnexion();
  if (identite.genre === 'panne') return rendu(documentDePanne(), 503);

  const langues = languesDuLecteur(identite.lecteur);
  const [fil, stories] = await Promise.all([
    filSocial({ jeton, langues, curseur, recuperer }),
    railDeStories({ jeton, recuperer }),
  ]);

  if (fil.genre === 'session-expiree') return versLaConnexion();
  if (fil.genre === 'panne') return rendu(documentDePanne(), 503);

  return rendu(
    documentDuFilSocial({
      stories,
      posts: fil.posts,
      curseurSuivant: fil.curseurSuivant,
      maintenant: Date.now(),
      fait,
      echoue,
      tempsReel: moduleDeParticipation(),
    }),
  );
};

export const FIL_SOCIAL_SERVI = async (requete: Request, recuperer?: Recuperateur): Promise<Response> => {
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion();

  return sert({
    jeton,
    curseur: curseurDeLURL(requete),
    fait: faitDeLURL(requete),
    echoue: echecDeLURL(requete),
    recuperer,
  });
};

/**
 * VERS LE FIL, APRÈS UN GESTE — l'ANCRE du post (`#post-<id>`) accompagne
 * TOUJOURS la redirection : `PostFeedService.getFeed` réordonne le fil à
 * chaque lecture (récence, engagement, affinité, diversité), donc un rang
 * ne retrouverait rien. Sans JavaScript, c'est le navigateur qui défile
 * jusqu'à l'ancre au chargement — aimer la 18ᵉ publication ne renvoie plus
 * en haut du fil.
 */
const versLeFilSansAncre = (parametres: string): Response =>
  redirection(`${CHEMIN}${parametres}`, { 'cache-control': CACHE_PRIVE });

const versLeFil = (postId: string, parametres: string): Response =>
  redirection(`${CHEMIN}${parametres}#${idDuPost(postId)}`, { 'cache-control': CACHE_PRIVE });

/**
 * UN GESTE, LU CONTRE LE VOCABULAIRE CLOS — jamais cru. `post` vide ou
 * `geste` inconnu ne produit AUCUN appel, et le lecteur retrouve son fil
 * inchangé (même garde que `liste-porte.ts` › `soumissionDuGeste`).
 */
export const GESTE_SUR_UN_POST = async (requete: Request, recuperer?: Recuperateur): Promise<Response> => {
  if (origineEtrangere(requete)) return refusDOrigine(requete);

  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion();

  const formulaire = await requete.formData().catch(() => null);
  const postId = formulaire?.get('post');
  const geste = String(formulaire?.get('geste') ?? '');

  if (typeof postId !== 'string' || postId === '') return versLeFilSansAncre('');

  if (geste === 'aime' || geste === 'retirer-aime') {
    const issue = await aime({ id: postId, jeton, pose: geste === 'aime', recuperer });
    if (issue.genre === 'refus' && issue.statut === 401) return versLaConnexion();
    return versLeFil(postId, issue.genre === 'fait' ? `?fait=${geste === 'aime' ? 'aime' : 'aime-retire'}` : '?refus=1');
  }

  if (geste === 'repost') {
    const issue = await reposte({ id: postId, jeton, recuperer });
    if (issue.genre === 'refus' && issue.statut === 401) return versLaConnexion();
    return versLeFil(postId, issue.genre === 'fait' ? '?fait=repost' : '?refus=1');
  }

  return versLeFilSansAncre('');
};
