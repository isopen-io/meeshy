import { OCTETS_MAX_PAR_MEDIA } from './composer';

/**
 * LA COPIE DE `/stories/new` (#5033, médias #5389) — publier une story
 * depuis la v3.
 *
 * DEUX CONTRÔLES DANS LA CIBLE, ET ILS NE SONT PAS SYMÉTRIQUES. C'est le fond
 * de cet écran, et le confondre produirait un réglage qui ne règle rien :
 *
 * • **L'AUDIENCE MUTE RÉELLEMENT LA CHARGE.**
 *   `CreatePostSchema.visibility` accepte trois valeurs sans champ de plus, et
 *   `FRIENDS` est le défaut SERVEUR d'une story sans `visibility`
 *   (`routes/posts/core.ts`) — exactement le « Contacts » que la cible dessine.
 *   C'est un contrôle, et le critère de fin porte sur le corps ENVOYÉ.
 *
 * • **L'EXPIRATION N'A AUCUNE CAPACITÉ SERVEUR.** `CreatePostSchema` ne porte
 *   aucun champ d'échéance : la durée de vie d'une story est FIXE
 *   (`EPHEMERAL_POST_TTL_HOURS.STORY = 20`,
 *   `services/gateway/src/services/posts/ephemeralPosts.ts:32`). Régime 3 de la
 *   conception (§ 5.2) : la ligne RESTE — le lecteur a le droit de savoir
 *   combien de temps ce qu'il publie sera visible — mais elle est INFORMATIVE,
 *   et rien ne prétend qu'on peut la changer. La rendre réglable serait le
 *   contrôle sans effet de la charte règle 7 ; la retirer cacherait un fait qui
 *   gouverne ce qu'on décide de publier. Décision produit ouverte : #5064.
 *
 * LA VALEUR EST 20 h, JAMAIS 24. La cible écrit « 24 h »
 * (`MeeshyWebV3.dc.html`, ligne « Expire dans »), et `lib/contenu/story.ts`
 * portait la même erreur dans la phrase servie à un lecteur d'une story
 * indisponible. Le nombre vient du gateway, mesuré ; le document de design est
 * arrêté à sa date et ne peut pas décider d'une durée que le serveur applique.
 */

/**
 * `EPHEMERAL_POST_TTL_HOURS.STORY` — RECOPIÉE, et il faut dire pourquoi c'est
 * accepté ici alors que le § 3.2 interdit les secondes tables.
 *
 * La constante vit dans `services/gateway/src/services/posts/ephemeralPosts.ts`
 * et n'est PAS exportée par `@meeshy/shared` (vérifié : aucune occurrence). La
 * v3 n'a pas le droit d'importer depuis le gateway — c'est la contrainte de
 * séparation de ce chantier. Il reste donc deux formes possibles : une valeur
 * citée avec sa source, ou une phrase vague (« quelques heures ») qui n'apprend
 * rien. La première est choisie, et son coût est nommé : le jour où le gateway
 * change ce nombre, CETTE ligne doit changer aussi. Le remède durable est de
 * remonter la constante dans `@meeshy/shared` — hors du territoire de ce lot,
 * qui ne touche pas au serveur.
 */
export const HEURES_DE_VIE_D_UNE_STORY = 20;

/** `EPHEMERAL_POST_TTL_HOURS.STATUS` — même source, même réserve. */
export const HEURES_DE_VIE_D_UNE_HUMEUR = 1;

export const STORY_NEUVE = {
  titre: 'Nouvelle story',
  sousTitre: 'Ce que vous publiez, et pour combien de temps',
  retour: 'Retour au composer',
  texte: 'Votre story',
  textePlaceholder: 'Racontez quelque chose…',
  /**
   * LE MÉDIA (#5389) — CE QUE CET ÉCRAN SAIT DÉSORMAIS FAIRE. La cible
   * dessine une scène (caméra, galerie, fond coloré) et une barre d'outils :
   * les outils (sticker, musique, mentionner, dessiner) restent des surfaces
   * de COMPOSITION que la v3 ne sert pas ; la SCÈNE, elle, est servie —
   * `mediaIds` attend un média TÉLÉVERSÉ, et c'est exactement ce que le champ
   * fichier fournit. Une story de TEXTE reste une vraie story (`content`
   * seul satisfait `hasAnyContentCarrier`) : le média est une AMÉLIORATION,
   * jamais une exigence.
   */
  media: 'Votre photo ou vidéo',
  mediaAide: `Une photo ou une vidéo, ${OCTETS_MAX_PAR_MEDIA / (1024 * 1024)} Mo au plus.`,
  mediaImporter: 'Importer une photo ou une vidéo',
  /** Une story ne rend qu'UN média (`story.medias[0]`, `partage-vue.ts`) — une seconde sélection est refusée, pas fondue. */
  mediaUnSeul: 'Une story porte un seul média — resélectionnez un fichier.',
  mediaAlt: 'Décrire votre photo ou vidéo',
  /**
   * LE LIBELLÉ DU CHAMP, DISTINCT DU `<summary>` qui l'ouvre (revue #5389) —
   * `mediaAlt` ci-dessus nomme le DISCLOSURE, celui-ci nomme la ZONE DE
   * SAISIE. Les confondre servait deux fois le même nom accessible à la
   * suite : un lecteur d'écran annonçait « Décrire votre photo ou vidéo,
   * bouton » puis « Décrire votre photo ou vidéo, zone de texte », sans dire
   * ce qui les distingue.
   */
  mediaAltChamp: 'Ce que montre votre photo ou vidéo',
  mediaAltPhrase: 'Un texte court dit ce qu’une image montre à qui ne peut pas la voir.',
  audience: 'Audience',
  langue: 'Langue du texte',
  expiration: 'Expire dans',
  expirationValeur: (heures: number): string => `${heures} h`,
  expirationPhrase: (heures: number): string =>
    `Une story reste visible ${heures} h après sa publication. Cette durée est fixée par le service ; elle ne se règle pas.`,
  publier: 'Publier la story',
  publie: 'Story publiée.',
  publieVoir: 'Voir le fil',
  refuse: 'Votre story n’est pas partie.',
  /** Un porteur de contenu SUFFIT : le texte, OU le média — jamais les deux exigés (#5389). */
  vide: 'Écrivez quelque chose, ou joignez une photo ou une vidéo.',
} as const;
