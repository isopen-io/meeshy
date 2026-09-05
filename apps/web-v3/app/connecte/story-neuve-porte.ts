import { CACHE_PRIVE, rendu, versLaConnexion } from '@/app/connecte/porte';
import { origineEtrangere, refusDOrigine } from '@/app/provenance';
import { jetonDuLecteur } from '@/app/session';
import { moi, type Lecteur } from '@/lib/api/compte';
import { publie, type Recuperateur } from '@/lib/api/publication';
import { CHAMPS_DU_COMPOSER, estUneAudience, type Audience } from '@/lib/contenu/composer';
import { STORY_NEUVE } from '@/lib/contenu/story-neuve';

import { ADRESSE_DE_LA_STORY_NEUVE, documentDeLaStoryNeuve } from './story-neuve-vue';

/**
 * LA PORTE DE `/stories/new` (#5033) — la SŒUR de celle du composer, et elle
 * partage tout ce qui peut l'être.
 *
 * `publie()` est la même primitive, `CHAMPS_DU_COMPOSER` le même vocabulaire de
 * formulaire, `estUneAudience` la même lecture close. Ce qui change tient en
 * deux valeurs : le `type` (`STORY`) et le défaut d'audience (`FRIENDS`, le
 * défaut SERVEUR d'une story — exactement le « Contacts » de la cible).
 *
 * **LE DÉFAUT D'AUDIENCE EST « CONTACTS », PAS « PUBLIC », ET C'EST UNE
 * DÉCISION DE CONFIDENTIALITÉ.** Le composer publie en `PUBLIC` par défaut (un
 * post s'adresse au monde) ; une story est un contenu éphémère et personnel,
 * dont le serveur lui-même retient `FRIENDS` quand rien n'est dit. Reprendre le
 * défaut du composer aurait ouvert au monde entier ce que le service ferme aux
 * contacts — un écart qu'aucun message d'erreur n'aurait signalé.
 *
 * LA GARDE D'ORIGINE EST SUR LE POST, comme partout où la v3 écrit : un
 * formulaire auto-soumis par un site tiers publierait une story au nom du
 * lecteur.
 */

const CHEMIN = ADRESSE_DE_LA_STORY_NEUVE;

/** Le défaut SERVEUR d'une story sans `visibility` (`routes/posts/core.ts`). */
const AUDIENCE_PAR_DEFAUT: Audience = 'FRIENDS';

const texteDe = (formulaire: FormData, nom: string): string => {
  const brut = formulaire.get(nom);
  return typeof brut === 'string' ? brut.trim() : '';
};

/**
 * LA LANGUE REVENDIQUÉE — celle que le lecteur a DÉCLARÉE, jamais le repli du
 * Prisme de lecture. Voir `composer-porte.ts` et la leçon 510 : réutiliser
 * `languesDuLecteur` ferait publier en « français » le contenu d'un compte qui
 * n'a rien configuré, et `originalLanguage` est le pivot de la descente du
 * Prisme chez tous les lecteurs.
 */
const langueRevendiquee = (lecteur: Lecteur | null): string | null => lecteur?.systemLanguage ?? null;

export const LIS_LA_STORY_NEUVE = async (requete: Request, recuperer?: Recuperateur): Promise<Response> => {
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion(CHEMIN);

  const identite = await moi({ jeton, recuperer });
  if (identite.genre === 'session-expiree') return versLaConnexion(CHEMIN);

  return rendu(
    documentDeLaStoryNeuve({
      texte: '',
      audience: AUDIENCE_PAR_DEFAUT,
      langue: langueRevendiquee(identite.genre === 'lecteur' ? identite.lecteur : null),
      publie: new URL(requete.url).searchParams.get('publie') === '1',
      erreur: null,
    }),
  );
};

const versLaStoryNeuve = (publieOk: boolean): Response =>
  new Response(null, {
    status: 303,
    headers: { location: `${CHEMIN}${publieOk ? '?publie=1' : ''}`, 'cache-control': CACHE_PRIVE },
  });

export const PUBLIE_UNE_STORY = async (requete: Request, recuperer?: Recuperateur): Promise<Response> => {
  if (origineEtrangere(requete)) return refusDOrigine(requete);

  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion(CHEMIN);

  const formulaire = await requete.formData().catch(() => null);
  if (formulaire === null) return versLaStoryNeuve(false);

  const texte = texteDe(formulaire, CHAMPS_DU_COMPOSER.texte);
  const brute = texteDe(formulaire, CHAMPS_DU_COMPOSER.audience);
  const audience = estUneAudience(brute) ? brute : AUDIENCE_PAR_DEFAUT;

  const identite = await moi({ jeton, recuperer });
  if (identite.genre === 'session-expiree') return versLaConnexion(CHEMIN);
  const lecteur = identite.genre === 'lecteur' ? identite.lecteur : null;

  const repose = (erreur: string): Response =>
    rendu(
      documentDeLaStoryNeuve({
        texte,
        audience,
        langue: langueRevendiquee(lecteur),
        publie: false,
        erreur,
      }),
      422,
    );

  /**
   * UNE STORY DE TEXTE EXIGE DU TEXTE. Sans média téléversable, `content` est
   * le seul porteur de contenu que cet écran peut fournir : une story vide
   * serait refusée par `hasAnyContentCarrier`, et l'aller-retour serait payé
   * par le lecteur pour apprendre ce que le document savait.
   */
  if (texte === '') return repose(STORY_NEUVE.vide);

  const issue = await publie({
    jeton,
    type: 'STORY',
    texte,
    visibility: audience,
    langue: langueRevendiquee(lecteur),
    recuperer,
  });

  if (issue.genre === 'publie') return versLaStoryNeuve(true);
  if (issue.statut === 401) return versLaConnexion(CHEMIN);
  return repose(issue.message);
};
