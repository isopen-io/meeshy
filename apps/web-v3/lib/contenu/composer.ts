/**
 * LA COPIE DU COMPOSER (`/composer`, #4966).
 *
 * QUATRE FORMATS DANS LA CIBLE, DEUX SERVIS — et les deux absents le sont pour
 * des raisons DIFFÉRENTES, qu'il faut dire séparément :
 *
 * • **Réel** exige une VIDÉO. `CreatePostSchema.mediaIds` attend des médias
 *   « already uploaded » : cet écran ne téléverse rien pour LUI (#5390 ouvre le
 *   transport pour le POST — voir § médias ci-dessous —, mais le format Réel
 *   reste hors lot : sa vidéo obligatoire et son propre défaut d'audience ne
 *   se réduisent pas à « ajouter un fichier »), et publier un `REEL` sans
 *   média produirait un réel sans réel. Ce n'est pas un onglet à câbler
 *   plus tard au même endroit — c'est un lot de téléversement.
 * • **Story** a sa propre route (`/stories/new`, #5033), servie depuis ce
 *   lot : son onglet est donc un LIEN VERS ELLE, pas un format de ce
 *   formulaire. Publier une story demande une audience par défaut différente
 *   (`FRIENDS`, le défaut serveur) et une durée de vie à annoncer — deux
 *   choses qu'un troisième `?format=` aurait fondues dans un écran qui ne les
 *   distingue pas.
 *
 * Un onglet vers une route absente, ou vers une publication qu'on ne peut pas
 * composer, est le contrôle sans effet de la charte règle 7 — la même doctrine
 * que les trois rangées servies du carrefour des réglages. Les deux onglets
 * rendus sont motivés par ce qu'ils PROMETTENT.
 *
 * PAS DE COMPTEUR DE CARACTÈRES, ET C'EST UN CHOIX. La cible en dessine un
 * (« 24/140 ») ; sans JavaScript il ne bougerait pas d'un caractère pendant la
 * frappe — un chiffre qui ment est pire que pas de chiffre (charte règle 7).
 * La BORNE, elle, est dite et APPLIQUÉE : `maxlength` la tient nativement, et
 * elle vient de `CreatePostSchema.content` (5 000), jamais du « 140 » de la
 * planche, qu'aucune route n'applique.
 */

/** `CreatePostSchema.content` — `z.string().max(5000)` (`routes/posts/types.ts:237`). */
export const LONGUEUR_MAX_DU_CONTENU = 5000;

/**
 * `MAX_POST_MEDIA` (`@meeshy/shared/types/attachment:481`) — RECOPIÉ EN
 * LITTÉRAL, comme `LONGUEUR_MAX_DU_CONTENU` ci-dessus, jamais importé
 * depuis ce fichier précisément : `lib/contenu/composer.ts` est requis à la
 * fois par jest ET par les specs Playwright, qui le chargent en CommonJS
 * dans leur PROPRE process (`e2e/visual/lib/serveurs.ts` en atteste : ses
 * imports RUNTIME de `@meeshy/shared` passent tous par un `import()`
 * dynamique, `bouchon-preferences.ts`, jamais un `import` statique — la
 * même contrainte). `composer-porte.ts`, lui, tourne dans le process
 * `next start` (bundlé par Next), et y importe `isImageMimeType`/
 * `isVideoMimeType` directement : c'est LUI, pas ce
 * fichier, qui reste la source de VALIDATION — cette constante n'est ici
 * que pour la PHRASE d'aide et la garde de COMPTE, jamais pour re-décider
 * un type de fichier.
 */
export const MAX_POST_MEDIA = 10;

/**
 * LE PLAFOND PAR FICHIER EST CELUI DE LA V3, PAS CELUI DE LA PASSERELLE — et
 * il fallait le dire, parce que la première écriture appliquait
 * `SMALL_FILE_THRESHOLD` (`@meeshy/shared/types/attachment:487`), dont le
 * commentaire d'origine dit ce qu'il est vraiment : « below this, use direct
 * REST upload » — un choix de TRANSPORT, jamais une limite. La limite RÉELLE
 * de la passerelle est `UPLOAD_LIMITS` (`attachment.ts:427-434`,
 * `getSizeLimit` → `onUploadCreate:337-342`) : **4 Go** pour une image comme
 * pour une vidéo. Refuser à 50 Mo en disant « dépasse la taille autorisée
 * pour un média » aurait donc menti au lecteur sur une règle qui n'est pas
 * celle du serveur.
 *
 * Ce plafond-ci existe pour une raison qui appartient à la V3 seule : la
 * porte RELAIE (`composer-porte.ts` → `televerseMediaDePost`), donc elle
 * tient le fichier ENTIER en mémoire le temps d'un `POST` TUS. C'est une
 * borne de la porte, assumée et dite au lecteur par `mediasAide` — un seul
 * nombre pour la PHRASE et pour la RÈGLE, jamais deux.
 *
 * Le jour où la porte diffusera le corps en flux plutôt qu'en tampon, c'est
 * CETTE constante qui monte, et rien d'autre.
 */
const MEGA_OCTETS_PAR_FICHIER = 50;

/** Le plafond ci-dessus en OCTETS — ce que `composer-porte.ts` compare à `File.size`. */
export const OCTETS_MAX_PAR_MEDIA = MEGA_OCTETS_PAR_FICHIER * 1024 * 1024;

/**
 * LE PLAFOND DE LA PUBLICATION ENTIÈRE (revue #5390, défaut 2) — une borne
 * PROPRE, distincte du produit `MAX_POST_MEDIA × OCTETS_MAX_PAR_MEDIA`
 * (≈ 500 Mo) qui servait ici jusqu'à ce lot : ce produit n'est le plafond
 * d'AUCUN lecteur légitime — dix fichiers de 50 Mo chacun est une sélection
 * qu'aucun geste n'atteint sur un appareil qui compose depuis une galerie —
 * et le laisser gouverner `OCTETS_MAX_DE_LA_CHARGE` faisait tenir ~500 Mo en
 * mémoire du process `next start` (`Request.formData()`) pour toute
 * sélection en dessous, sans qu'AUCUNE garde ne s'exécute avant. Le nombre
 * ci-dessous est celui que `mediasAide` DIT au lecteur, et celui que
 * `premierRefusDeFichier` (`composer-porte.ts`) APPLIQUE sur la somme des
 * fichiers lus — un seul nombre pour la phrase et pour la règle, comme
 * `OCTETS_MAX_PAR_MEDIA` l'est déjà pour le fichier seul.
 */
const MEGA_OCTETS_PAR_PUBLICATION = 150;

/** Le plafond ci-dessus en OCTETS — ce que `composer-porte.ts` compare à la SOMME des `File.size`. */
export const OCTETS_MAX_PAR_PUBLICATION = MEGA_OCTETS_PAR_PUBLICATION * 1024 * 1024;

/**
 * LA CHARGE ENTIÈRE A SON PLAFOND, ET IL SE LIT AVANT D'ÊTRE BUFFERISÉE
 * (revue #5390). `Request.formData()` met le multipart ENTIER en mémoire
 * AVANT que la moindre garde de la porte ne s'exécute — nombre, type, taille
 * viennent toutes après. `/composer` est la PREMIÈRE porte de la v3 qui
 * accepte des FICHIERS, et rien ne bornait ce qu'elle acceptait de recevoir :
 * ni Next (une route App Router n'a aucune limite de corps — `bodyParser.
 * sizeLimit` est du routeur Pages), ni la zone (le routeur Traefik
 * `frontend-v3` ne porte que `compress@file`, aucun middleware `buffering`,
 * donc `maxRequestBodyBytes` illimité, mesuré dans
 * `infrastructure/docker/compose/docker-compose.prod.yml:505`).
 *
 * Ce plafond est `OCTETS_MAX_PAR_PUBLICATION` — la borne RÉELLE de ce
 * qu'une publication peut légitimement peser (revue #5390, défaut 2 ; pas
 * `MAX_POST_MEDIA × OCTETS_MAX_PAR_MEDIA`, qui n'est le plafond d'aucun
 * usage réel) —, plus la marge du texte et des frontières multipart : au-delà,
 * la charge ne peut appartenir à aucun lecteur légitime, et refuser sans lire
 * est le seul refus qui coûte zéro octet de mémoire. Il ne remplace PAS une
 * borne de proxy — un client qui n'annonce aucun `Content-Length` (transfert
 * fragmenté) reste hors de sa portée (suivi ouvert, § composer-porte.ts).
 * Il ne remplace pas non plus la garde de SOMME posée par
 * `premierRefusDeFichier`, qui s'applique elle APRÈS lecture, sur ce que les
 * fichiers PÈSENT VRAIMENT (`File.size`), jamais sur ce que le client a
 * ANNONCÉ.
 */
export const OCTETS_MAX_DE_LA_CHARGE = OCTETS_MAX_PAR_PUBLICATION + 1024 * 1024;

/**
 * LE PLAFOND D'UNE STORY (#5389) — SA SŒUR, pas une recopie de
 * `OCTETS_MAX_DE_LA_CHARGE` : celle-ci suppose jusqu'à `MAX_POST_MEDIA`
 * fichiers, une story n'en porte JAMAIS qu'UN (`STORY_NEUVE.mediaUnSeul`,
 * `lib/contenu/story-neuve.ts`). La même marge d'1 Mo pour le texte du
 * formulaire et les frontières multipart, appliquée à un seul média plutôt
 * qu'à `OCTETS_MAX_PAR_PUBLICATION`.
 */
export const OCTETS_MAX_D_UNE_STORY = OCTETS_MAX_PAR_MEDIA + 1024 * 1024;

/** Le paramètre d'adresse qui choisit le format. Un seul site le nomme. */
export const CHAMP_DU_FORMAT = 'format';

export const FORMATS_SERVIS = [
  { cle: 'post', glyphe: 'ph-article', libelle: 'Post', type: 'POST' },
  { cle: 'humeur', glyphe: 'ph-smiley', libelle: 'Humeur', type: 'STATUS' },
] as const;

/**
 * LA STORY N'EST PAS UN FORMAT DE CE FORMULAIRE — c'est un ÉCRAN. L'onglet est
 * rendu à côté des deux autres, comme la cible le dessine, mais il MÈNE
 * ailleurs : `/stories/new` (#5033). Le distinguer dans le type plutôt que de
 * le glisser dans `FORMATS_SERVIS` est ce qui empêche la porte de le traiter
 * comme un `?format=` qu'elle publierait elle-même.
 */
export const ONGLET_DE_LA_STORY = {
  glyphe: 'ph-sparkle',
  libelle: 'Story',
  href: '/stories/new',
} as const;

export type FormatServi = (typeof FORMATS_SERVIS)[number]['cle'];

export const estUnFormat = (valeur: string): valeur is FormatServi =>
  FORMATS_SERVIS.some((format) => format.cle === valeur);

/**
 * LES DIX HUMEURS DE LA CIBLE (`MeeshyWebV3.dc.html:669`), dans son ordre.
 * `moodEmoji` les accepte toutes (`z.string().max(10)`) — la borne est la
 * TAILLE, pas une énumération : la passerelle ne tient aucune liste, donc
 * celle-ci est une proposition d'écran, jamais une loi. Un emoji hors liste ne
 * serait pas refusé par la passerelle ; il ne serait simplement pas offert ici.
 */
export const HUMEURS = ['😴', '🎉', '💪', '☕', '🔥', '💭', '🎵', '📚', '✈️', '❤️'] as const;

export const CHAMPS_DU_COMPOSER = {
  texte: 'texte',
  humeur: 'humeur',
  audience: 'audience',
  /** `<input type="file" multiple>` — servi UNIQUEMENT en format `post` (#5390). */
  medias: 'medias',
  /**
   * LA LÉGENDE PAR MÉDIA (#5390, revue — défaut 3) — `CreatePostSchema.mediaAlt`,
   * appliqué au `PostMedia.alt` de chaque id RÉELLEMENT rattaché
   * (`applyMediaAlt`, `services/gateway/src/services/PostService.ts:901-919`).
   *
   * UN CHAMP RÉPÉTÉ, PAS DIX CHAMPS NOMMÉS. `FormData.getAll` rend ses
   * valeurs dans l'ORDRE du DOM ; la porte les ZIPPE positionnellement avec
   * les fichiers validés (`fichiersDuFormulaire`, même ordre). Un rang écrit
   * à la main (`alt-0`..`alt-9`) aurait exigé de la porte qu'elle sache
   * LEQUEL des dix rangs correspond au Nième fichier — cette clé UNIQUE le
   * rend inutile : peu importe QUEL champ porte QUEL texte, seul L'ORDRE
   * compte, et c'est aussi ce que `previsualiseMedias`
   * (`lib/realtime/composer.ts`) n'a JAMAIS besoin de recalculer.
   */
  mediasAlt: 'medias-alt',
} as const;

/**
 * LES TROIS AUDIENCES QUE LA PASSERELLE ACCEPTE SANS CHAMP DE PLUS
 * (`CreatePostSchema.visibility`). `COMMUNITY`, `EXCEPT` et `ONLY` exigent des
 * identifiants que cet écran ne collecte pas : les offrir enverrait une charge
 * que la passerelle refuse.
 */
export const AUDIENCES = [
  { valeur: 'PUBLIC', libelle: 'Public', phrase: 'Tout le monde peut voir cette publication.' },
  { valeur: 'FRIENDS', libelle: 'Contacts', phrase: 'Seuls vos contacts acceptés la voient.' },
  { valeur: 'PRIVATE', libelle: 'Moi seul', phrase: 'Personne d’autre que vous ne la voit.' },
] as const;

export type Audience = (typeof AUDIENCES)[number]['valeur'];

export const estUneAudience = (valeur: string): valeur is Audience =>
  AUDIENCES.some((audience) => audience.valeur === valeur);

export const COMPOSER = {
  titre: 'Composer',
  sousTitre: 'Ce que vous publiez, et pour qui',
  retour: 'Retour',
  formats: 'Ce que vous publiez',
  texte: 'Votre texte',
  textePlaceholder: 'Quoi de neuf ?',
  humeur: 'Votre humeur',
  humeurAide: 'Choisissez une humeur, ajoutez un mot si vous voulez.',
  humeurTexte: 'Un mot sur votre humeur',
  humeurTextePlaceholder: 'Café et revue de mars',
  audience: 'Audience',
  traduction: 'Traduction',
  /**
   * CE QUE « AUTO » VEUT DIRE, ET IL FAUT LE DIRE. La v3 ne CHOISIT pas une
   * langue de traduction : elle REVENDIQUE la langue dans laquelle le texte est
   * écrit (`originalLanguage`), et c'est le Prisme de chaque LECTEUR qui décide
   * ensuite ce qu'il lit. Écrire « Auto » seul laisserait croire à un réglage.
   */
  traductionPhrase: (langue: string): string =>
    `Publié en ${langue} ; chaque lecteur le reçoit dans sa langue.`,
  traductionSansLangue:
    'La langue de votre texte sera détectée ; chaque lecteur le reçoit dans la sienne.',
  publier: 'Publier',
  borne: (max: number): string => `${max.toLocaleString('fr-FR')} caractères au plus.`,
  /** Le retour du Post/Redirect/Get — la publication est partie. */
  publie: 'Publié.',
  publieVoir: 'Voir dans le fil',
  refuse: 'Votre publication n’est pas partie.',
  vide: 'Écrivez quelque chose, ou choisissez une humeur, avant de publier.',
  /**
   * LES CHAMPS DU MÉDIA (#5390) — servi UNIQUEMENT en format `post`. Le
   * libellé dit la VÉRITÉ du multipart : un navigateur ne repose JAMAIS un
   * `<input type="file">` après un aller-retour serveur — l'état de refus
   * l'assume, au lieu de le taire (§ `mediasRefuse`/`mediasEchec` ci-dessous).
   */
  medias: 'Vos photos et vidéos',
  /**
   * LE TOTAL SE DIT AUTANT QUE LE PAR-FICHIER (revue #5390, défaut 2) — la
   * phrase promettait déjà « 50 Mo par fichier » sans jamais dire que
   * DIX fichiers à cette taille ne partiraient pas non plus : elle
   * promettait implicitement ~500 Mo, ce que ni la porte ni cette phrase
   * n'autorisent plus. `MEGA_OCTETS_PAR_PUBLICATION` est le MÊME nombre que
   * `premierRefusDeFichier` applique sur la somme lue.
   */
  mediasAide: `Images ou vidéos, ${MAX_POST_MEDIA} au plus, ${MEGA_OCTETS_PAR_FICHIER} Mo par fichier, ${MEGA_OCTETS_PAR_PUBLICATION} Mo au total.`,
  mediasAjouter: 'Ajouter',
  mediasRefuse: (nom: string): string =>
    `« ${nom} » n’est ni une photo ni une vidéo — il n’est pas parti. Vos fichiers sont à resélectionner.`,
  /**
   * LE MESSAGE DIT LE NOMBRE QU'IL APPLIQUE (revue #5390). Il disait
   * « dépasse la taille autorisée pour un média » — une phrase qui laissait
   * croire à la limite de la PASSERELLE (4 Go, `UPLOAD_LIMITS`) et ne
   * donnait au lecteur aucun moyen de savoir ce qu'il devait faire. C'est
   * la borne de la PORTE (`OCTETS_MAX_PAR_MEDIA`), et elle se nomme.
   */
  mediasVolumineux: (nom: string): string =>
    `« ${nom} » dépasse ${MEGA_OCTETS_PAR_FICHIER} Mo — il n’est pas parti. Vos fichiers sont à resélectionner.`,
  mediasTrop: (max: number): string => `${max} fichiers au plus — vos fichiers sont à resélectionner.`,
  mediasCharge:
    'Votre envoi est trop lourd pour cet écran — rien n’a été reçu. Resélectionnez moins de fichiers, ou des fichiers plus légers.',
  /**
   * LA GARDE DE SOMME (revue #5390, défaut 2) — distincte de `mediasCharge`
   * ci-dessus : celle-là juge ce que le client ANNONCE (`Content-Length`,
   * avant lecture) ; celle-ci juge ce que les fichiers VALIDES PÈSENT VRAIMENT
   * (`File.size`, après lecture) — une sélection légitime (des images, des
   * vidéos, chacune sous 50 Mo) dont la somme dépasse quand même le total.
   */
  mediasChargeTrop: `Vos fichiers pèsent plus de ${MEGA_OCTETS_PAR_PUBLICATION} Mo au total — ils ne sont pas partis. Resélectionnez moins de fichiers, ou des fichiers plus légers.`,
  mediasEchec: 'Le téléversement a échoué. Votre texte est conservé ; vos fichiers sont à resélectionner.',
  /**
   * RETIRER UN MÉDIA AVANT L'ENVOI (#5390, revue — défaut 1). Le nom
   * accessible du bouton posé sur chaque vignette : sans lui, un lecteur
   * d'écran annoncerait « bouton » autant de fois qu'il y a de photos, sans
   * dire LAQUELLE part.
   */
  mediasRetirer: (nom: string): string => `Retirer « ${nom} »`,
  /**
   * LA LÉGENDE PAR MÉDIA (#5390, revue — défaut 3), CÔTÉ MODULE. Le champ vit
   * DANS le repli sans JavaScript (`mediasAltRang` ci-dessous, un rang) ;
   * `previsualiseMedias` (`lib/realtime/composer.ts`) ne le RECRÉE jamais —
   * il ouvre le REPLI et REMPLACE le libellé générique du rang par le NOM du
   * fichier qui l'occupe désormais, seule chose que la porte ne sait pas
   * mieux dire.
   */
  mediasAltPourFichier: (nom: string): string => `Décrire « ${nom} »`,
  mediasAltTitre: 'Décrire vos photos et vidéos',
  mediasAltPhrase:
    'Un texte court dit ce qu’une image montre à qui ne peut pas la voir — dans l’ordre où vous les avez choisies.',
  mediasAltRang: (rang: number): string => `Photo ou vidéo n°${rang}`,
} as const;
