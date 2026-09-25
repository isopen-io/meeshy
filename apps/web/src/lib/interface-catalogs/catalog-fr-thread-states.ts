/**
 * LES ÉTATS DU FIL ET LA CAUSE D'UN ENVOI — tranche du catalogue français
 * (`catalog-fr.ts`), extraite pour tenir le budget de taille (CLAUDE.md,
 * 1200 lignes). Ce sont des clés du catalogue comme les autres : `catalog-fr`
 * les RÉPAND, et les six autres langues les portent à plat.
 */
const frThreadStates = {
  /* LES LIBELLÉS D'ÉTAT DU FIL (#7337) — le transfert, l'échec d'envoi, les
     tombstones et les substituts de pièce protégée. Ils étaient EN DUR, en
     français, sur des surfaces servies en SEPT langues : un lecteur anglophone,
     arabophone ou lusophone lisait du français sur les états les plus
     anxiogènes de l'application. D-13 ne les couvre pas — elle EXCLUT
     explicitement « les textes affichés à l'utilisateur, qui relèvent de
     l'internationalisation, pas du nommage ».

     Valeurs reprises du catalogue iOS là où il en a une : `bubble.meta.forwarded`,
     `bubble.meta.forwarded.fromGroup`, `bubble.meta.forwarded.from`,
     `bubble.system.deleted`, `bubble.system.burned`, `bubble.system.burned.a11y`,
     `bubble.media.masked`, `bubble.media.viewOnce`, `common.retry`,
     `sync.pill.failed.message` (l'annonce au lecteur d'écran). */
  'message.forwarded': 'Transféré',
  'message.forwarded.fromGroup': 'Transféré depuis {name}',
  'message.forwarded.fromPerson': 'Transféré de {name}',
  'message.send.failed': 'Non envoyé',
  'message.send.failed.reason': 'Non envoyé — {reason}',
  'message.send.retry': 'Réessayer',
  'announce.messageNotSent': 'Message non envoyé',
  'announce.messageNotSent.reason': 'Message non envoyé — {reason}',
  'message.deleted': 'Message supprimé',
  'message.expired.a11y': 'Message éphémère expiré',
  'message.withheld': 'Contenu retenu',
  'message.withheld.a11y': 'Contenu retenu : ce message existe et ne se montre pas',
  'message.veiled': 'Contenu masqué',
  'message.veiled.hint': 'Toucher pour révéler le contenu',
  'message.veiled.error': 'Révélation impossible pour l’instant',
  'message.ephemeral.a11y': 'Message éphémère, disparaît dans {remaining}',
  'message.ephemeral.awaiting': 'En attente de réception',
  'message.ephemeral.awaiting.a11y': 'Message éphémère de {duration}, en attente de réception',
  'message.viewOnce.tap': 'Touchez pour afficher',
  'message.viewOnce.opened': 'Déjà ouvert',
  'message.viewOnce.sealed.a11y': 'Message à vue unique, touchez pour afficher',
  'message.viewOnce.opened.a11y': 'Message à vue unique, déjà ouvert',
  'message.viewOnce.close': 'Fermer',
  'attachment.protected.image': 'Photo protégée',
  'attachment.protected.video': 'Vidéo protégée',
  'attachment.protected.audio': 'Vocal protégé',
  'attachment.protected.file': 'Pièce protégée',
  /* LE GENRE D'UN MEDIA CITE (#7556) — miroir `AttachmentKind.shortLabel`
     (`packages/MeeshySDK/.../Models/AttachmentKind.swift:140-153`) : le libelle
     COURT qui remplace un apercu VIDE dans une citation (« Photo », « Video »…).
     DISTINCT d'`attachment.protected.*` juste au-dessus, qui qualifie le
     SUBSTITUT d'une piece masquee — deux etats, donc deux jeux de mots : « un
     second vocabulaire ferait dire deux choses differentes a l'oeil et a
     l'oreille pour un meme etat ». */
  'attachment.kind.image': 'Photo',
  'attachment.kind.video': 'Vidéo',
  'attachment.kind.audio': 'Audio',
  'attachment.kind.file': 'Fichier',
  /* LA STORY CITÉE (#7881) — `bubble.reply.story.answer`, `bubble.reply.story`
     et `feed.post.detail.story_unavailable` du catalogue iOS. Le bandeau de
     `StoryCitationCard` et le libellé accessible de la rangée étaient EN DUR,
     en français. */
  'message.story.reply': 'réponse à sa story',
  'message.story.label': 'Story',
  'message.story.unavailable': 'Story indisponible',
  'message.mood.label': 'Humeur',

  /* LA CAUSE D'UN ENVOI QUI N'EST PAS PARTI (#7740) — `send/failure-reason.ts`.
     Minuscule initiale : la phrase s'embarque après un tiret, dans
     `message.send.failed.reason` et `announce.messageNotSent.reason`. Le délai
     du mode lent des nouveaux comptes est celui du SERVEUR (`retryAfter`). */
  'send.failure.offline': 'réseau indisponible',
  'send.failure.timeout': 'la passerelle n’a pas répondu',
  'send.failure.uploadPartial': 'une pièce n’a pas pu être téléversée',
  'send.failure.newcomerSlowMode': 'bienvenue ! un message toutes les 30 s pour les nouveaux comptes — réessayez dans {seconds} s',
  'send.failure.newcomerSlowMode.soon': 'bienvenue ! un message toutes les 30 s pour les nouveaux comptes — réessayez dans un instant',
  'send.failure.sessionExpired': 'session expirée — reconnectez-vous',
  'send.failure.forbidden': 'envoi refusé pour cette conversation',
  'send.failure.tooMany': 'trop de messages d’un coup — réessayez dans un instant',
  'send.failure.rejected': 'message refusé',
  'send.failure.gatewayUnavailable': 'la passerelle est indisponible',

  /* LA PASTILLE DES RÉACTIONS D'UNE PIÈCE (#7894) — valeurs du catalogue iOS
     (`media.reactions.badge.a11y`, `media.reactions.badge.mine.a11y`). */
  'media.reactions.badge.a11y': 'Réactions',
  'media.reactions.badge.mine.a11y': 'dont la vôtre',
} as const;

export default frThreadStates;
