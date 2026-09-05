/**
 * LA COPIE DE `/stories/new` (#5033) — publier une story depuis la v3.
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
   * CE QUE CET ÉCRAN NE SAIT PAS FAIRE, DIT PLUTÔT QUE CACHÉ. La cible dessine
   * une scène (caméra, galerie, fond coloré) et une barre d'outils : ce sont
   * des surfaces de COMPOSITION MÉDIA que la v3 ne sert pas — `mediaIds` attend
   * des médias déjà téléversés. Une story de TEXTE est une vraie story
   * (`content` seul satisfait `hasAnyContentCarrier`) ; l'écran la publie, et
   * annonce ce qui lui manque au lieu de dessiner des boutons inertes.
   */
  sansMedia: 'Pour l’instant, une story se publie en texte depuis le web. Photo et vidéo arrivent avec le téléversement.',
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
  vide: 'Écrivez quelque chose avant de publier votre story.',
} as const;
