import { premierRefusDeFichier } from '@/app/connecte/composer-porte';
import { CACHE_PRIVE, rendu, versLaConnexion } from '@/app/connecte/porte';
import { origineEtrangere, refusDOrigine } from '@/app/provenance';
import { jetonDuLecteur } from '@/app/session';
import { moi, type Lecteur } from '@/lib/api/compte';
import { relacheMediaDePost, televerseMediaDePost } from '@/lib/api/medias-de-post';
import { publie, type Recuperateur } from '@/lib/api/publication';
import {
  CHAMPS_DU_COMPOSER,
  COMPOSER,
  estUneAudience,
  OCTETS_MAX_D_UNE_STORY,
  type Audience,
} from '@/lib/contenu/composer';
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
      refusDuMedia: null,
      alt: '',
    }),
  );
};

const versLaStoryNeuve = (publieOk: boolean): Response =>
  new Response(null, {
    status: 303,
    headers: { location: `${CHEMIN}${publieOk ? '?publie=1' : ''}`, 'cache-control': CACHE_PRIVE },
  });

/**
 * LE FICHIER DU FORMULAIRE (#5389) — UNE story ne porte qu'UN média, jamais
 * `multiple` (voir `story-neuve-vue.ts`). `FormData.getAll` reste la lecture
 * juste : un navigateur qui n'a RIEN sélectionné poste quand même la part
 * `medias` — un `File` de taille 0 et de nom vide, filtré comme dans
 * `composer-porte.ts` (`fichiersDuFormulaire`), jamais un refus.
 */
const fichiersDuFormulaire = (formulaire: FormData): readonly File[] =>
  formulaire
    .getAll(CHAMPS_DU_COMPOSER.medias)
    .filter((valeur): valeur is File => valeur instanceof File && valeur.size > 0 && valeur.name !== '');

export const PUBLIE_UNE_STORY = async (requete: Request, recuperer?: Recuperateur): Promise<Response> => {
  if (origineEtrangere(requete)) return refusDOrigine(requete);

  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion(CHEMIN);

  /**
   * LA CHARGE SE MESURE AVANT D'ÊTRE LUE (patron `composer-porte.ts`) — un
   * `Content-Length` au-dessus de ce qu'un texte + UN média peut légitimement
   * peser (`OCTETS_MAX_D_UNE_STORY`) ne peut appartenir à aucun lecteur
   * légitime : on refuse sans lire un octet.
   */
  const longueurAnnoncee = Number(requete.headers.get('content-length') ?? '0');
  if (Number.isFinite(longueurAnnoncee) && longueurAnnoncee > OCTETS_MAX_D_UNE_STORY) {
    return rendu(
      documentDeLaStoryNeuve({
        texte: '',
        audience: AUDIENCE_PAR_DEFAUT,
        langue: null,
        publie: false,
        erreur: null,
        refusDuMedia: COMPOSER.mediasCharge,
        alt: '',
      }),
      413,
    );
  }

  const formulaire = await requete.formData().catch(() => null);
  if (formulaire === null) return versLaStoryNeuve(false);

  const texte = texteDe(formulaire, CHAMPS_DU_COMPOSER.texte);
  const brute = texteDe(formulaire, CHAMPS_DU_COMPOSER.audience);
  const audience = estUneAudience(brute) ? brute : AUDIENCE_PAR_DEFAUT;
  const fichiers = fichiersDuFormulaire(formulaire);
  const alt = texteDe(formulaire, CHAMPS_DU_COMPOSER.mediasAlt);

  const identite = await moi({ jeton, recuperer });
  if (identite.genre === 'session-expiree') return versLaConnexion(CHEMIN);
  const lecteur = identite.genre === 'lecteur' ? identite.lecteur : null;

  const repose = ({
    erreur = null,
    refusDuMedia = null,
  }: {
    readonly erreur?: string | null;
    readonly refusDuMedia?: string | null;
  }): Response =>
    rendu(
      documentDeLaStoryNeuve({
        texte,
        audience,
        langue: langueRevendiquee(lecteur),
        publie: false,
        erreur,
        refusDuMedia,
        alt,
      }),
      422,
    );

  /**
   * LES GARDES DU MÉDIA SE DISENT AVANT TOUT OCTET ENVOYÉ (#5389) : le
   * NOMBRE (une story ne porte qu'UN média), puis le type/la taille du seul
   * fichier retenu.
   */
  if (fichiers.length > 1) return repose({ refusDuMedia: STORY_NEUVE.mediaUnSeul });
  const fichier = fichiers[0] ?? null;
  if (fichier !== null) {
    const refusDUnFichier = premierRefusDeFichier([fichier]);
    if (refusDUnFichier !== null) return repose({ refusDuMedia: refusDUnFichier });
  }

  /**
   * UN PORTEUR DE CONTENU SUFFIT : le texte, OU le média (miroir de
   * `hasAnyContentCarrier` — `mediaIds` non vide suffit). L'aller-retour
   * serait payé par le lecteur pour apprendre ce que le document savait déjà.
   */
  if (texte === '' && fichier === null) return repose({ erreur: STORY_NEUVE.vide });

  /**
   * LE TÉLÉVERSEMENT, CONTEXTE `story` — c'est ce champ qui fait écrire le
   * `PostMedia` sous le bon type de publication (`tus-handler.ts:449-505`).
   * Un seul fichier : rien à relâcher sur son propre échec (P4 du composer
   * ne s'applique qu'à une SUITE de téléversements).
   */
  let mediaId: string | null = null;
  if (fichier !== null) {
    const octets = new Uint8Array(await fichier.arrayBuffer());
    const issue = await televerseMediaDePost({
      jeton,
      fichier: { nom: fichier.name, type: fichier.type, octets },
      contexte: 'story',
      recuperer,
    });
    if (issue.genre === 'refus') return repose({ refusDuMedia: COMPOSER.mediasEchec });
    mediaId = issue.id;
  }

  const issue = await publie({
    jeton,
    type: 'STORY',
    texte,
    visibility: audience,
    langue: langueRevendiquee(lecteur),
    mediaIds: mediaId === null ? [] : [mediaId],
    mediaAlt: mediaId === null || alt === '' ? {} : { [mediaId]: alt },
    recuperer,
  });

  if (issue.genre === 'publie') return versLaStoryNeuve(true);
  if (issue.statut === 401) return versLaConnexion(CHEMIN);
  // LE REFUS DE LA PASSERELLE RELÂCHE AUSSI (patron P5 du composer) — un
  // média déjà téléversé pour une story que la passerelle a refusée reste
  // réclamable au prochain essai, jamais orphelin en attente pour rien.
  if (mediaId !== null) await relacheMediaDePost({ jeton, id: mediaId, recuperer });
  return repose({ erreur: issue.message });
};
