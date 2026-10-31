export const meta = {
  name: 'meeshy-cercles-et-sang',
  description:
    'Cercles de proximité (Public < Communauté < Connaissance < Ami < Proche < Sang, Atome réservé) et mode Sang — MVP iOS, apps/web et apps/android : quatre chaînes parallèles (serveur = shared + gateway, ios = iOS + MeeshySDK, web, android) en lots TDD depuis origin/dev, inventaire de l existant d abord, revue-correction opus + auditeur-adversarial sur les lots sensibles, PR vers dev fusionnée au vert, recette staging à deux comptes et recette à deux téléphones réels rendue par le porteur, conformité avant toute promotion — sonnet DÉVELOPPE, haiku fait le MÉCANIQUE, opus RELIT, CORRIGE, VALIDE et LIVRE',
  whenToUse:
    "Lancer un tour du chantier « Cercles de proximité et mode Sang » (décisions porteur 2026-10-31, spec docs/superpowers/specs/2026-10-31-cercles-et-mode-sang-design.md, source docs/specs/cercles/Meeshy_niveaux_features_regles.xlsx, milestone #215). Args : { repo_serveur, repo_ios, repo_web, repo_android, repo_principal, repo_spec, recette, poste, base, date, attribution, tours, lots, jalon, sauter, numeros, valider, auto_merge, livrer_main, flag_position, modeles }.",
  phases: [
    { title: 'Synchroniser', detail: 'fetch origin/dev dans les quatre worktrees de chaîne, shared rebâti, relevé de ce que tiennent les autres sessions', model: 'sonnet' },
    { title: 'Cadrer', detail: 'chaque lot confronté à l arbre VIVANT : inventaire de l existant (à étendre / à modifier / à ne pas toucher), déjà livré, tenu ailleurs, ou à faire', model: 'sonnet' },
    { title: 'Ouvrir', detail: 'une issue par lot (ou l existante) avec son inventaire, milestone #215, champs de l issue, projet #1 In Progress', model: 'haiku' },
    { title: 'Developper', detail: 'quatre chaînes en parallèle ; dans une chaîne, lot après lot ; un client attend le contrat serveur ; iOS est la référence de web et Android ; TDD sur lot/<clé>-<n> depuis origin/dev, squelette poussé tôt', model: 'sonnet' },
    { title: 'Revue', detail: 'opus relit, refuse toute recréation injustifiée de l existant, corrige lui-même, rejoue les gates ; auditeur-adversarial en plus sur présence, position, historique, talkie, Bring, mineurs, modèle', model: 'opus' },
    { title: 'Livrer', detail: 'gates de la plateforme, commit Closes #n, PR vers dev fusionnée au vert, commentaire de clôture (preuve, dimensions mûres, une issue par dimension restante)', model: 'sonnet' },
    { title: 'Valider', detail: 'staging : scénario à deux comptes (Chrome + simulateur) ; écoute, talkie, Bring et position : recette publiée sur l issue, résultats lus du porteur, jamais cochés par le workflow ; chaque échec devient un lot', model: 'opus' },
    { title: 'Conformite', detail: 'conformite-juridique : analyse d impact RGPD, conservation, consentements, politique de confidentialité — bloque toute promotion', model: 'opus' },
    { title: 'Livrer final', detail: 'sur feu vert du porteur seulement (livrer_main=true) et conformité rendue : dev -> main', model: 'opus' },
  ],
}

// ---------------------------------------------------------------------------
// PARAMÈTRES
// ---------------------------------------------------------------------------

const A = args && typeof args === 'object' ? args : {}
const texte = (v, defaut) => (typeof v === 'string' && v ? v : defaut)
// `poste` : 'mac' (le poste du porteur : Xcode, simulateurs, Chrome, staging joignable) ou 'cloud' (un
// conteneur Linux : ni Xcode ni Gradle — dl.google.com est refusé —, staging refusé par le proxy, GraphQL
// GitHub refusé). Il ne change pas ce qui est livré, seulement ce qui se PROUVE ici et ce qui se prouve
// par la CI de la PR.
const POSTE = A.poste === 'cloud' ? 'cloud' : 'mac'
const RACINE = POSTE === 'cloud' ? '/home/user' : '/Users/smpceo/Documents'
const REPO_PRINCIPAL = texte(A.repo_principal, POSTE === 'cloud' ? '/home/user/meeshy' : `${RACINE}/v2_meeshy`)
// La spec et ce script vivent dans un worktree qui NE CHANGE JAMAIS de branche (en cloud : le clone
// principal, sur la branche de session). Les worktrees de chaîne, eux, basculent sur des branches lot/*.
const REPO_SPEC = texte(A.repo_spec, POSTE === 'cloud' ? REPO_PRINCIPAL : `${RACINE}/v2_meeshy-cercles-spec`)
const REPO = {
  serveur: texte(A.repo_serveur, `${RACINE}/v2_meeshy-cercles-serveur`),
  ios: texte(A.repo_ios, `${RACINE}/v2_meeshy-cercles-ios`),
  web: texte(A.repo_web, `${RACINE}/v2_meeshy-cercles-web`),
  android: texte(A.repo_android, `${RACINE}/v2_meeshy-cercles-android`),
}
const BASE = texte(A.base, 'dev')
const DATE = texte(A.date, '(date non fournie — la lire avec `date -I`)')
const ATTRIBUTION = texte(A.attribution, 'Co-Authored-By: Claude <noreply@anthropic.com>')
const TOURS = Number.isInteger(A.tours) && A.tours > 0 ? A.tours : 1
const VALIDER = A.valider !== false
const AUTO_MERGE = A.auto_merge !== false
const LIVRER_MAIN = A.livrer_main === true
// Le flag de la position Sang (§ 1.7) : le code, les tests et la recette se livrent flag OFF. `true` ne
// l'ouvre JAMAIS au public — il autorise seulement la recette à l'allumer pour la liste blanche de test.
const FLAG_POSITION = A.flag_position === true
const SAUTER = new Set(Array.isArray(A.sauter) ? A.sauter : [])
// Les issues ouvertes le 2026-10-31 (milestone #215, chapeau #13925) ; `numeros` dans les args les complète.
const NUMEROS_PAR_DEFAUT = { 'rel-modele': 13926, 'rel-loi-acces': 13927, 'presence-ami-binaire': 13928, 'notifs-cercles': 13929, 'jeu-suit-le-cercle': 13930, 'audiences-publications': 13931, 'rel-compteurs': 13932, 'rel-demandes': 13933, 'proche-sang-ecoute': 13934, 'proche-talkie': 13935, 'proche-bring': 13936, 'sang-position-historique': 13937, 'ui-cercles': 13938, 'ui-audience': 13939, 'ui-profil-cercles': 13940, 'sang-recette-reelle': 13941, 'conformite-cercles': 13942, 'version-minimale': 13954 }
const NUMEROS_ARGS = { ...NUMEROS_PAR_DEFAUT, ...(A.numeros && typeof A.numeros === 'object' ? A.numeros : {}) }
// Les décisions-produit ouvertes (spec § 8) : D-1 seuils Connaissance, D-2 audio en E2EE, D-3 Critical Alerts, D-4 PushToTalk, D-5 exception des anciens clients.
const DECISIONS = { 'D-1': 13943, 'D-2': 13944, 'D-3': 13945, 'D-4': 13946, 'D-5': 13947, 'age': 13948, 'e2ee': 13949 }
const SPEC = `${REPO_SPEC}/docs/superpowers/specs/2026-10-31-cercles-et-mode-sang-design.md`
const XLSX = `${REPO_SPEC}/docs/specs/cercles/Meeshy_niveaux_features_regles.xlsx`
const RECETTE = texte(A.recette, POSTE === 'cloud' ? '/home/user/.cache/meeshy-recette-cercles' : '/Users/smpceo/.cache/meeshy-recette-cercles')
const SCRATCH = (chaine) => `${REPO[chaine]}/.cache/cercles-workflow`
const GH = 'isopen-io/meeshy'
const MILESTONE = 215
const CHAPEAU = Number.isInteger(A.chapeau) ? A.chapeau : 13925
const SIM_NATIVE = texte(A.sim_native, '171765AF-36FD-45B1-9B9D-570E24C72E11')

const M0 = A.modeles && typeof A.modeles === 'object' ? A.modeles : {}
const MODELE = {
  synchro: texte(M0.synchro, 'sonnet'),
  cadrer: texte(M0.cadrer, 'sonnet'),
  mecanique: texte(M0.mecanique, 'haiku'),
  developper: texte(M0.developper, 'sonnet'),
  petit: texte(M0.petit, 'haiku'),
  relire: texte(M0.relire, 'opus'),
  livrer: texte(M0.livrer, 'sonnet'),
  valider: texte(M0.valider, 'opus'),
  conformite: texte(M0.conformite, 'opus'),
  final: texte(M0.final, 'opus'),
}

// ---------------------------------------------------------------------------
// LES LOTS — la spec § 6. Un lot multi-plateforme du prompt porteur (§ 3) a UNE issue et un sous-lot
// par plateforme (`<clé>@<chaîne>`) : iOS d'abord, web et Android le suivent (iso). `sensible` ⇒ passe
// AUSSI par auditeur-adversarial. `lots` dans les args : une liste de clés (sous-ensemble) ou d'objets.
// ---------------------------------------------------------------------------

const LOTS_PAR_DEFAUT = [
  // ===== JALON 1 — LES CERCLES =====
  { cle: 'rel-modele', chaine: 'serveur', jalon: 1, sensible: true,
    titre: 'Chaque lien entre deux personnes porte le niveau que chacun accorde à l\'autre, avec son historique',
    critere: "Prisma : le niveau ACCORDÉ par direction (A→B, B→A) dans l'échelle PUBLIC·COMMUNITY·ACQUAINTANCE·FRIEND·CLOSE·BLOOD (ATOM réservé, modèle AtomLink déclaré sans route), l'historique des passages (date, de, vers — jamais affiché pour une baisse), la date d'entrée au niveau ; EXTENSION de FriendRequest / UserContact si l'inventaire le permet, sinon un modèle UserRelation justifié dans l'issue ; index justifiés ; toute FriendRequest acceptée se lit FRIEND (aucune rétrogradation rétroactive) ; backfill IDEMPOTENT rejouable (script + témoin qui le joue deux fois) exécuté sur staging seulement — la production attend le feu vert du porteur après sauvegarde vérifiée ; types TS dans packages/shared/types/ (RelationLevel, ordre, comparateur) ; témoins vitest du modèle et du backfill",
    existe: "FriendRequest (schema.prisma:1956-1985) : status String libre (pending/accepted/rejected/blocked), AUCUN @@unique de paire, une ligne par paire orientée ; blocage = User.blockedUserIds (:180) ; UserContact (:600) est le carnet de l'appareil, pas une relation ; âge : User.birthDate (:426), ageVerifiedAt (:469), utils/age.ts isDeclaredMinor (:64) ; modèle TTL de référence : socialEventIndexes.ts:55-72. Le mot « Cercles » est PRIS dans le code par services/achievements/CerclesAchievements.ts (#5759) : nommer le code relation/RelationLevel",
    depend: [] },
  { cle: 'rel-loi-acces', chaine: 'serveur', jalon: 1, sensible: true,
    titre: 'Une seule loi dit ce qu\'un viewer peut voir ou faire d\'une personne selon leur cercle commun',
    critere: "packages/shared/utils/relation-access.ts exporte resolveRelationAccess({ viewer, target, feature }) (niveau effectif = minimum des deux sens, blocage ⇒ rien ; MINEURS — décision porteur 2026-10-31 : l'âge DÉCLARÉ fait foi et le Sang, la position et le Bring sont ouverts à TOUS, mineurs compris, derrière un CONSENTEMENT explicite et refusable — la loi rend `requiresConsent` pour ces features, jamais un refus d'âge ; seule la Connaissance AUTOMATIQUE reste désactivée entre un mineur et un majeur inconnu) et la matrice niveau → feature lue d'une CONFIG (packages/shared/config/relation-levels.ts : libellés par clé i18n, icônes, seuils — abaissables sur staging) ; les cas de témoins sont écrits dans un fichier de cas partagé (packages/shared/config/relation-access-cases.json) que les miroirs Swift et Kotlin rejouent (sous-lots @ios, @android) ; une garde (sur le modèle de presence-visibility-viewer-aware-guard.test.ts) interdit qu'un service réécrive la boucle de niveaux ; resolvePresenceVisibility devient une PROJECTION de cette loi sans changer de comportement à ce lot ; services/friendship.ts devient le site UNIQUE du niveau effectif (niveauEffectif / niveauxParmi) et les SIX copies locales de « amis acceptés » (PostFeedService, SocialEventsHandler, DuoService, contact-recently-active, contact-joined, profile-discoverability) le consomment",
    existe: "services/friendship.ts (62 l) amitieAcceptee (:16) / amisAcceptesParmi (:41), utilisée par 10 fichiers ; SIX copies locales à CONVERGER : PostFeedService.getFriendIds (:1036, cache Redis feed:friends:), SocialEventsHandler.getFriendIds (:115), DuoService.areFriends (:130), contact-recently-active.ts acceptedFriendIds (:133), contact-joined.ts acceptedFriendsOf (:119), profile-discoverability.ts acceptedFriendsAmong (:46) ; PresenceVisibilityService.acceptedFriendIds (:152) ; communauté : communityVisibility.ts doUsersShareCommunity (:57) ; blocage : utils/blocking.ts isBlockedBetween (:21) ; resolvePresenceVisibility (presence-visibility.ts:50) prend areConnected:boolean",
    depend: ['rel-modele'] },
  { cle: 'rel-loi-acces@ios', chaine: 'ios', jalon: 1, issueDe: 'rel-loi-acces',
    titre: 'Le SDK iOS porte le miroir de la loi d\'accès par cercle',
    critere: "MeeshySDK Relations/RelationAccess.swift (RelationLevel, ordre, niveau effectif = minimum, blocage, mineur fail-closed) rejoue les cas de packages/shared/config/relation-access-cases.json en Swift Testing ; le miroir ne décide d'aucun accès, il sert à ne pas proposer une action que le serveur refusera ; preuve : sdk-tests.yml vert sur la PR",
    existe: "FriendshipCache.swift (FriendshipStatus :5), FriendModels.swift ; aucun niveau", depend: ['rel-loi-acces'] },
  { cle: 'rel-loi-acces@android', chaine: 'android', jalon: 1, issueDe: 'rel-loi-acces',
    titre: 'Android porte le miroir de la loi d\'accès par cercle',
    critere: "apps/android/core/model/.../relation/RelationAccess.kt rejoue les mêmes cas (relation-access-cases.json copié en ressource de test par la CI, ou lu depuis le dépôt) en tests JVM ; assembleDebug + testDebugUnitTest verts sur android.yml",
    existe: "core/model/.../friend/UserRelationship.kt (FriendshipStatus :9), sdk-core/.../friend/UserRelationshipResolver.kt", depend: ['rel-loi-acces@ios'] },
  { cle: 'version-minimale', chaine: 'serveur', jalon: 1, sensible: false,
    titre: "Un client trop ancien pour les cercles est invité à se mettre à jour, partout, avant d'aller plus loin",
    critere: "D-5 (#13947) : plus de compatibilité — le plancher EXISTANT (utils/appVersion.ts getAppVersionFloor / MIN_APP_VERSION, isBelowFloor) s'applique à l'admission de session (services/auth/session-admission.ts), au handshake socket (socketio/handlers/AuthHandler.ts) et aux routes de cercles, en plus de routes/posts/core.ts:111 ; sous le plancher ⇒ 426 UPGRADE_REQUIRED (utils/response.ts:213) avec getAppStoreUrl ; en-tête absent (web) jamais bloqué ; témoins",
    existe: "utils/appVersion.ts (MIN_APP_VERSION, isBelowFloor, getAppStoreUrl), utils/response.ts:213 (426 UPGRADE_REQUIRED), appliqué seulement à routes/posts/core.ts:111", depend: [] },
  { cle: 'version-minimale@ios', chaine: 'ios', jalon: 1, issueDe: 'version-minimale',
    titre: "iOS montre « Mettre à jour Meeshy » sur tout 426, pas seulement dans le composer",
    critere: "UpgradeGateController (apps/ios/Meeshy/Features/Composer/UpgradeGateController.swift) et AppVersionFloorService généralisés à l'app : un 426 n'importe où (APIClient poste .meeshyUpgradeRequired) ⇒ écran plein qui ouvre l'App Store ; 7 langues, VoiceOver ; XCTest",
    existe: "UpgradeGateController.swift, MeeshyCore/Networking/AppVersionHeader.swift", depend: ['version-minimale'] },
  { cle: 'version-minimale@android', chaine: 'android', jalon: 1, issueDe: 'version-minimale',
    titre: "Android montre « Mettre à jour Meeshy » sur tout 426",
    critere: "MeeshyError.kt (426 → Server(426)) mène à un écran plein qui ouvre le Play Store ; iso iOS ; TalkBack ; android.yml vert",
    existe: "core/model/.../error/MeeshyError.kt:80-92", depend: ['version-minimale@ios'] },
  { cle: 'rel-demandes', chaine: 'serveur', jalon: 1, sensible: true,
    titre: 'On monte d\'un cran à la fois, sur demande acceptée, et un refus ne se voit pas',
    critere: "routes (étendant celles de FriendRequest) pour demander Connaissance, Ami, Proche, Sang : le serveur REFUSE toute demande qui saute un niveau ou dont les conditions ne sont pas tenues (éligibilité de rel-compteurs) ; refus, baisse, sortie et ignorance silencieux (aucune notification) ; cool-down 30 j avant une nouvelle demande de montée ; Sang : jeton de rituel synchronisé (les deux tiennent l'écran dans une fenêtre courte, double confirmation, consentement feature par feature) ; mineurs : le Sang est ouvert à tous (décision porteur 2026-10-31) mais son rituel exige l'écran de CONSENTEMENT feature par feature — refusable, avec un DÉPLIANT qui détaille ce que chaque partage montre, à qui, combien de temps — et les rappels de consentement restent ; AUCUNE exception de compatibilité (D-5 tranchée #13947) : un client sous le plancher de version reçoit 426 UPGRADE_REQUIRED (lot version-minimale), donc la règle « aucun saut de phase » s'applique à toutes les demandes ; événements socket au format entity:action-word déclarés dans packages/shared/types/socketio-events ; témoins par transition et par refus",
    existe: "plancher de version : lot version-minimale (#13954) ; routes/directory/friend-requests.ts (404 l) GET :222 POST :289 PATCH :358 ; friend-requests-core.ts (753 l) ACTIONS accept|reject|cancel|dismiss (:160), envoyerDemande :179, repondreDemande :308 (dismiss d'une acceptée = retirer l'ami) ; alias dépréciés routes/friends.ts ; notifications émises 'friend_request'/'friend_accepted' (NotificationService.ts:2089/2130) — CONTACT_REQUEST/CONTACT_ACCEPTED déclarés mais non émis ; temps réel FRIEND_REQUEST_NEW/ACCEPTED/REJECTED/CANCELLED (:2169-2216) ; rate limit Redis utils/rate-limiter.ts createCustomRateLimiter (:474)",
    depend: ['rel-loi-acces', 'rel-compteurs', 'version-minimale'] },
  { cle: 'rel-compteurs', chaine: 'serveur', jalon: 1, sensible: true,
    titre: 'La Connaissance naît toute seule et les semaines d\'échanges se comptent pour chaque paire',
    critere: "un agrégat par paire et par semaine (ISO, UTC) alimenté par les événements et modèles EXISTANTS (messages, réactions, vues de posts, commentaires, partages, réponses de story/mood, mentions, appels, messages audio) ; Connaissance automatique quand, dans CHAQUE sens, les seuils de la config (D-1 tranchée #13943 : ≥10 interactions par sens sur UNE SEMAINE glissante, dont ≥1 message, ≥1 like ou réaction, ≥1 vue de post sur le contenu de l'autre ET ≥1 message audio) sont tenus — lien créé chez les deux, notification discrète, annulé par un blocage, désactivé entre mineur et majeur inconnu ; séries hebdomadaires : semaine active = chacun a interagi ; Proche éligible à 4 semaines d'affilée, Sang à 12 (décision porteur 2026-10-31 : 12 semaines actives d'affilée depuis Proche — la continuité est le garde-fou) ; une semaine manquée remet la série à zéro, le niveau atteint est conservé ; l'éligibilité n'élève jamais seule ; E2EE : seul le fait qu'un message est passé compte, jamais le clair ; l'audio d'une conversation chiffrée se compte par Message.messageType DÉCLARÉ par le client (D-2 tranchée #13944 : oui), signalé déclaratif ; rattrapage IDEMPOTENT et rejouable (témoin : deux passes = même état) ; témoins de chaque seuil",
    existe: "AUCUN agrégat par paire ; PostView (:4561, unique postId+userId), PostReaction (:1860), PostComment (:4507), PostEngagement (:4688), reposts (Post.repostOfId), PostMention (:5491), Message (:1010, senderId = Participant.id, messageType String « audio », storyReplyToId :1044), Reaction message (:1813, participantId), Mention (:1930), CallSession (:2550)/CallParticipant (:2631) ; planification : jobs/index.ts BackgroundJobsManager.startAll (:100-205) + utils/guarded-timer.ts, patron idempotent jobs/game-nightly.ts ; E2EE : messageType reste en clair mais DÉCLARÉ par le client (e2eePlaintextAdmission.ts:28) — le compter en E2EE suit la décision-produit",
    depend: ['rel-modele'] },
  { cle: 'presence-ami-binaire', chaine: 'serveur', jalon: 1, sensible: true,
    titre: 'Un Ami voit seulement « en ligne » ou rien ; un Proche voit la présence détaillée',
    critere: "resolvePresenceVisibility (via resolveRelationAccess) rend pour un viewer de niveau effectif FRIEND : online:true quand la cible est en ligne, sinon RIEN (ni lastActiveAt, ni away/idle, ni « vu il y a ») ; CLOSE et au-dessus : la présence complète (règle 1/3/5) ; sous FRIEND : rien (directive 2026-08-25 inchangée) ; user:status, presence:snapshot, les routes users et conversations, et les sélections/tris (OnlineOnlyScope, servedOnline, mayOrderByRawPresence, servedOnlineFirst) restent alignés sur la valeur SERVIE — ce qui part À CÔTÉ (lastActiveAt voisin, colonnes de la ligne) est gardé ; contact_recently_active (#8285) inchangé ; ADR services/gateway/decisions/2026-10-31-*.md ; § « User Presence » du CLAUDE.md racine mis à jour ; garde presence-visibility-viewer-aware-guard.test.ts étendue ; témoins gateway : un Ami ne reçoit jamais lastActiveAt, ni dans la charge ni dans un champ voisin",
    existe: "point UNIQUE presence-visibility.ts:59 (ami ⇒ showLastSeenTimestamp: targetShowLastSeen) — areConnected:boolean devient un niveau ; seconde projection à aligner presence-audience.ts:113-120 (le socket rejoue la loi au lieu de l'appeler) ; PresenceVisibilityService.ts:64 (Set connected → Map id→niveau) ; presence-gate.ts presenceFor (:96), mayOrderByRawPresence (:154), servedOnlineFirst (:166) ; OnlineOnlyScope/servedOnline dans routes/conversations/participants-presence.ts:42-62 ; garde presence-visibility-viewer-aware-guard.test.ts (126 l, interdit resolvePrefsOnly et sortBy: query.sortBy) ; ADR visibilite-de-la-presence-soi-ami-accepte-admin-*.md",
    depend: ['rel-loi-acces'] },
  { cle: 'presence-ami-binaire@ios', chaine: 'ios', jalon: 1, issueDe: 'presence-ami-binaire',
    titre: 'iOS rend la présence servie à un Ami (en ligne ou rien) sans la prolonger',
    critere: "UserPresence.state(now:) (PresenceModels.swift) et PresenceStyle.swift : une présence réduite à online sans lastActiveAt rend le point vert ou AUCUN point, jamais « vu il y a » ; aucun état local ne prolonge ce que le serveur retire ; XCTest/Swift Testing",
    existe: "PresenceModels.swift (67 l, state(now:) :50, servedPresence :64), PresenceStyle.swift (226 l, AvatarPresenceDot.resolve :68) — un lastActiveAt nul donne déjà « en ligne » ou aucun point : lot probablement réduit à un témoin de non-régression", depend: ['presence-ami-binaire'] },
  { cle: 'presence-ami-binaire@android', chaine: 'android', jalon: 1, issueDe: 'presence-ami-binaire',
    titre: 'Android rend la présence servie à un Ami (en ligne ou rien) comme iOS',
    critere: "Presence.kt et MeeshyAvatar.kt (meeshyPresenceDotColor) : présence online sans lastActiveAt ⇒ point vert ou aucun point, jamais « vu il y a » ; témoins JVM ; assembleDebug + testDebugUnitTest verts sur android.yml",
    existe: "Presence.kt (70 l, served() :57), MeeshyAvatar.kt (491 l, meeshyPresenceDotColor :95) — même remarque qu'iOS", depend: ['presence-ami-binaire@ios'] },
  { cle: 'notifs-cercles', chaine: 'serveur', jalon: 1, sensible: false,
    titre: 'Seuls mes Proches sont prévenus de mes nouvelles publications, et seuls mes Sangs de mes commentaires ailleurs',
    critere: "fanout/friend-content.ts : friend_new_post / friend_new_story / friend_new_mood (et reels) partent aux niveaux effectifs CLOSE et au-dessus ; fanout/story-comment.ts : le seau friendIds de friend_story_comment devient BLOOD uniquement ; le relais « qui commente mes posts » vers des tiers passe à CLOSE et au-dessus (les Amis ne le reçoivent plus) ; dans les fan-outs EXISTANTS, aucun nouveau service ; l'audience se lit par resolveRelationAccess ; un ancien client ne voit aucun changement de forme ; témoins par éventail (Ami non notifié, Proche notifié, Sang seul pour friend_story_comment)",
    existe: "fanout/friend-content.ts (227 l) : types :66-72 (REEL → friend_new_post libellé friend.reel), amis par friendRequest.findMany :82-90, baseFriendIds + switch de visibilité :142-160 = point à restreindre ; seul appelant routes/posts/publication.ts:527 ; fanout/story-comment.ts (424 l) : seau friendIds :149-158, friendAudience :266-272, émission :402-418 ; relais « X a commenté le post de Y » : routes/posts/commentAddedNotifications.ts:129-145, tous types ; miroir temps réel SocialEventsHandler.getVisibilityFilteredRecipients (:347) à aligner dans le MÊME lot ; type-preference.ts:51-55",
    depend: ['rel-loi-acces'] },
  { cle: 'jeu-suit-le-cercle', chaine: 'serveur', jalon: 1, sensible: false,
    titre: 'Le jeu d\'une personne n\'est jamais plus visible que ce que son cercle permet',
    critere: "visibilité servie = minimum(GameProfile.*Visibility, droits du cercle) partout où le gateway sert le jeu ; Ami : niveau, nomination (titres), rang ; Proche et au-dessus : + étincelles et gloire ; sous Ami : le public seulement ; les réglages du jeu ne peuvent jamais ouvrir plus que le cercle ; témoins par champ et par niveau",
    existe: "GameProfile (schema :5891) showcase/rank/treasury/atlasVisibility = String? valeurs everyone|friends|me (utils/game/trophies.ts:152, défaut friends, atlas me) ; capShowcaseVisibility est une FONCTION (trophies.ts:171), pas une colonne ; GameProfileService.ts (220 l) storedVisibility :83, viewerKind :155 (amitieAcceptee), facetVisibleTo :168/178 ; appelants GameStandingService.ts:72, TrophyService.ts:85 ; iOS ShowcaseVisibility Codable STRICT (GameWave2Models.swift:325-329) et Android @Serializable enum : AUCUNE nouvelle valeur de visibilité de jeu, le minimum s'applique côté serveur seulement ; pas de module « nomination » : les titres = trophées/rank-crest (à confirmer au cadrage)",
    depend: ['rel-loi-acces'] },
  { cle: 'audiences-publications', chaine: 'serveur', jalon: 1, sensible: false,
    titre: 'Une publication peut viser mes Connaissances, mes Proches ou mes Sangs — et un ancien client reste sûr',
    critere: "PostVisibility gagne ACQUAINTANCES, CLOSE et BLOOD (FRIENDS garde « Amis et au-dessus », aucune valeur retirée) pour POST, REEL, STORY et STATUS/mood ; le filtre passe par postAudience.ts (filterPostConsumers) et le fil (PostFeedService) sans jumelle ; index justifiés ; Zod partagé à jour ; le risque qu'un ancien client affiche une valeur nouvelle comme Public (iOS ?? .public, Android fromWire) est ACCEPTÉ par le porteur (2026-10-31) et réglé par la mise à jour forcée (lot version-minimale, #13954) : aucune garde d'édition spécifique ; les sous-lots clients rendent néanmoins le décodage fail-closed — témoin de décodage iOS/Android/web noté pour les sous-lots clients ; repartage borné à une audience ≤ l'origine, un contenu BLOOD jamais repartageable ; témoins par audience et par niveau",
    existe: "enum PostType {POST,REEL,STORY,STATUS} (:3963) et PostVisibility {PUBLIC,FRIENDS,COMMUNITY,PRIVATE,EXCEPT,ONLY} (:3971) ; index [type,visibility,createdAt] (:4231) ; union TS shared/types/post.ts:15 ; repost-audience.ts:62-75 (allowedRepostVisibilities) ; z.enum recopié 4 fois routes/posts/types.ts:289,445,581,785 (à dédupliquer) ; postAudience.ts:87 filterPostConsumers (valeur inconnue ⇒ FRIENDS :111-114) ; postVisibility.ts buildPostVisibilityOrFilter :111-125, canUserViewPost :165 (default false) ; feedVisibility.ts:28 utilisé par PostFeedService :137/289/536/652/870 ; PostService.buildVisibilityFilter :946, reposts :268-289. RISQUE ANCIEN CLIENT : iOS PostVisibility(rawValue:) ?? .public (FeedComposerSheet:84, EditPostSheet:404, StoryComposerView+TopBar:257) et Android StoryVisibility.fromWire → PUBLIC : un ancien appareil AFFICHE une valeur nouvelle comme Public et peut la RÉÉCRIRE en PUBLIC à l'édition ⇒ le serveur refuse (ou ignore) un PATCH qui élargit une audience nouvelle (CLOSE/BLOOD/ACQUAINTANCES) vers PUBLIC/FRIENDS/COMMUNITY venant d'un client sous la version minimale",
    depend: ['rel-loi-acces'] },
  { cle: 'ui-cercles@ios', chaine: 'ios', jalon: 1, issueDe: 'ui-cercles',
    titre: 'Mes cercles : je vois mes liens, ce qui manque pour monter et mes demandes, sur iOS',
    critere: "écran « Mes cercles » (liste par niveau, progression « 3 semaines sur 4 », « il manque un message audio », demandes reçues/envoyées), demande de montée en optimiste (snapshot → local → réseau → rollback), rituel Sang animé synchronisé, réglages par personne (écoute, talkie, Bring, position — désactivés tant que le jalon 2 n'est pas livré, l'interface le dit) ; cache-first, états vide/chargement/erreur/hors-ligne ; VoiceOver, Dynamic Type, 7 langues ; protocole avant service, injection par init ; XCTest ; captures clair/sombre",
    existe: "UserProfileSheet.swift (701 l) états none|pendingSent|pendingReceived|connected (:8-11), sendConnectionRequest (:368) ; SDK FriendService.swift (272 l), FriendshipCache.swift (410 l, FriendshipStatus :5), FriendModels.swift, FriendRequestsEndpoint.swift ; flags locaux MeeshyFeatureFlags.swift ; libellés MeeshyUI/Resources/Localizable.xcstrings", depend: ['rel-demandes'] },
  { cle: 'ui-cercles@web', chaine: 'web', jalon: 1, issueDe: 'ui-cercles',
    titre: 'Mes cercles sur apps/web, iso de l\'écran iOS',
    critere: "même disposition, mêmes états et gestes que ui-cercles@ios (fichiers Swift cités) ; optimistic update ; cache TanStack ; lecteur d'écran, clavier, 7 langues ; bun test + type-check + gate",
    existe: "lib/profile/relation.ts (161 l, ProfileRelation :54, PROFILE_ACTION_KINDS :66), lib/api/friend-requests.ts (248 l), friend-actions.ts (338 l), routes/discover.tsx, routes/profile.tsx, catalogues catalog-*-user-profile.ts / contact-card / contact-discovery (7 langues)", depend: ['ui-cercles@ios'] },
  { cle: 'ui-cercles@android', chaine: 'android', jalon: 1, issueDe: 'ui-cercles',
    titre: 'Mes cercles sur Android natif, iso de l\'écran iOS',
    critere: "même disposition, mêmes états et gestes que ui-cercles@ios ; Compose ; TalkBack, 7 langues ; ProfileActionsViewModel étendu, pas recréé ; assembleDebug + testDebugUnitTest verts sur android.yml",
    existe: "ProfileActionsViewModel.kt (213 l), core/model/.../friend/UserRelationship.kt (FriendshipStatus :9), sdk-core/.../friend/FriendRepository.kt, FriendshipCache.kt, ConnectionActionController.kt, UserRelationshipResolver.kt ; strings feature/profile, feature/contacts", depend: ['ui-cercles@ios'] },
  { cle: 'ui-audience@ios', chaine: 'ios', jalon: 1, issueDe: 'ui-audience',
    titre: 'Le composer iOS propose Connaissances, Amis, Proches et Sang pour posts, reels, stories et moods',
    critere: "le sélecteur d'audience EXISTANT de MeeshyComposer gagne les crans du cercle (ordre Public → Communauté → Connaissances → Amis → Proches → Sang), audience par défaut = dernier choix, optimistic update ; une valeur inconnue servie se décode en « restreinte » (témoin de décodage) ; 7 langues ; XCTest",
    existe: "ComposerAudienceSheet.swift (279 l), MeeshyComposerHost+Audience.swift (84 l), MeeshyUI/Story/PostVisibility.swift (51 l, ?? .public à rendre fail-closed), AudienceUserPickerView.swift ; décodage fil en String? (PostModels.swift:232,355, FeedPost.swift:95,288, StoryItem.swift:26, StatusEntry.swift:15)", depend: ['audiences-publications'] },
  { cle: 'ui-audience@web', chaine: 'web', jalon: 1, issueDe: 'ui-audience',
    titre: 'Le composer web propose les audiences du cercle, iso d\'iOS',
    critere: "iso ui-audience@ios ; union TS fail-closed sur valeur inconnue (témoin) ; bun test + type-check + gate",
    existe: "apps/web/src/lib/stories/publication-audience.ts (STUDIO_AUDIENCES :34, isRememberableAudience :81), routes/story-compose-audience-sheet.tsx, story-compose-audience.tsx", depend: ['ui-audience@ios'] },
  { cle: 'ui-audience@android', chaine: 'android', jalon: 1, issueDe: 'ui-audience',
    titre: 'Le composer Android propose les audiences du cercle, iso d\'iOS',
    critere: "iso ui-audience@ios ; enum Kotlin tolérante (valeur inconnue ⇒ restreinte, témoin) ; android.yml vert",
    existe: "feature/stories/.../StoryAudiencePickerPage.kt (175 l), StoryVisibilityMenuResolver.kt:18-19 (fromWire → PUBLIC à rendre fail-closed), StatusComposerDraft.kt:31 (StatusVisibility, 4 cas)", depend: ['ui-audience@ios'] },
  { cle: 'ui-profil-cercles@ios', chaine: 'ios', jalon: 1, issueDe: 'ui-profil-cercles',
    titre: 'Sur iOS, le profil d\'un Ami ou d\'un Proche montre exactement ce que son cercle permet',
    critere: "badge du niveau commun (visible des deux seuls), jeu (Ami : niveau, nomination, rang ; Proche : + étincelles, gloire), présence (Ami binaire, Proche détaillée), action de montée quand éligible ; rien n'est fabriqué côté client : ce qui manque à la charge ne s'affiche pas ; XCTest, captures",
    existe: "UserProfileSheet.swift, Features/Game/Wave2/GameBannerBadge.swift, MeeshySDK/Game/GameTrophies.swift", depend: ['jeu-suit-le-cercle', 'presence-ami-binaire', 'rel-demandes'] },
  { cle: 'ui-profil-cercles@web', chaine: 'web', jalon: 1, issueDe: 'ui-profil-cercles',
    titre: 'Sur le web, le profil d\'un Ami ou d\'un Proche montre ce que son cercle permet, iso d\'iOS',
    critere: "iso ui-profil-cercles@ios ; game-profile-banner étendu, pas recréé ; bun test + type-check + gate",
    existe: "components/game-profile-banner.tsx (142 l), game-visibility-picker.tsx, lib/profile/relation.ts", depend: ['ui-profil-cercles@ios'] },
  { cle: 'ui-profil-cercles@android', chaine: 'android', jalon: 1, issueDe: 'ui-profil-cercles',
    titre: 'Sur Android, le profil d\'un Ami ou d\'un Proche montre ce que son cercle permet, iso d\'iOS',
    critere: "iso ui-profil-cercles@ios ; android.yml vert", existe: "feature/game/.../banner/GameBannerBadgeView.kt, écran profil feature/profile", depend: ['ui-profil-cercles@ios'] },

  // ===== JALON 2 — PROCHE ET SANG EN DIRECT =====
  { cle: 'proche-sang-ecoute', chaine: 'serveur', jalon: 2, sensible: true,
    titre: 'Ce que j\'écoute ou regarde arrive en direct à mes Proches (la catégorie) et à mes Sangs (le titre)',
    critere: "un événement socket now-playing (entity:action-word, déclaré dans socketio-events) : l'émetteur envoie UNE fois l'état courant, le serveur TRONQUE selon le niveau effectif de chaque destinataire — CLOSE : catégorie seule (music, video, browsing), jamais titre ni app ; BLOOD : titre et origine ; rien sous CLOSE ; rien n'est stocké au-delà de l'état courant (Redis à TTL court) ; pause et apps exclues côté émetteur respectées ; garde de test : un Proche ne reçoit JAMAIS titre ni origine, ni dans l'événement ni dans un champ voisin ; témoins",
    existe: "rien pour les médias tiers ; patron de registre/expiration/fins de vie : LocationHandler.ts ; audience par rooms user:<id> : presence-audience.ts ; événements dans packages/shared/types/socketio-events/event-names.ts", depend: ['rel-loi-acces'] },
  { cle: 'proche-sang-ecoute@ios', chaine: 'ios', jalon: 2, issueDe: 'proche-sang-ecoute',
    titre: 'L\'iPhone transmet ce qu\'il joue (Meeshy, Apple Music, Spotify connecté) et dit ce qu\'il ne peut pas lire',
    critere: "lectures Meeshy (MPNowPlayingInfoCenter existant), Apple Music (MPMusicPlayerController.systemMusicPlayer), Spotify (API currently-playing après connexion du compte) ; YouTube/Netflix hors d'atteinte sur iOS : l'interface le DIT, rien n'est simulé ; « navigue » non envoyé si non détectable ; pause, apps exclues ; réception et affichage ; XCTest ; preuve sur appareil réel par la recette", existe: "lectures Meeshy : ConversationAudioCoordinator+NowPlaying.swift (304 l), NowPlayingArtwork.swift ; AUCUN MPMusicPlayerController, SDK Spotify ni MusicKit", depend: ['proche-sang-ecoute'] },
  { cle: 'proche-sang-ecoute@android', chaine: 'android', jalon: 2, issueDe: 'proche-sang-ecoute',
    titre: 'Android transmet la session média active (titre, artiste, app) avec l\'accord de l\'utilisateur',
    critere: "NotificationListenerService + MediaSessionManager.getActiveSessions (accès demandé et expliqué), catégorie « navigue » si le navigateur est au premier plan et l'accès donné ; pause, apps exclues ; réception et affichage iso iOS ; android.yml vert", existe: "aucun NotificationListenerService ni MediaSessionManager ; lecture Meeshy : VoicePlaybackSessionController.kt", depend: ['proche-sang-ecoute@ios'] },
  { cle: 'proche-sang-ecoute@web', chaine: 'web', jalon: 2, issueDe: 'proche-sang-ecoute',
    titre: 'Le web affiche ce qu\'écoutent mes Proches et mes Sangs sans rien transmettre',
    critere: "réception et affichage iso iOS, aucun envoi ; bun test + type-check + gate", existe: "lib/view/web-now-playing.ts (156 l), use-voice-now-playing.ts — réception à créer sur le socket web", depend: ['proche-sang-ecoute@ios'] },
  { cle: 'proche-talkie', chaine: 'serveur', jalon: 2, sensible: true,
    titre: 'Un Proche appuie et parle : sa voix sort chez l\'autre sans décrocher — côté serveur',
    critere: "D-4 tranchée (#13946) : les DEUX chemins, avec ET sans PushToTalk, et le son se LIT DÈS SA RÉCEPTION : le serveur RELAIE chaque fragment audio au destinataire à l'instant où il le reçoit (flux socket binaire, même encodage que le vocal, fragments de ~200-500 ms), sans attendre la fin de l'enregistrement, un upload, une normalisation ni une transcription — la copie vocale (pipeline existant, ≤ 30 s) se fait APRÈS, hors du chemin critique, et sert de repli ; latence p95 émission → premier son mesurée par un témoin d'horodatage, refus serveur si niveau effectif < CLOSE, réception directe désactivable par personne, coupé pendant un appel / Ne pas déranger / heures calmes (repli : message vocal classique), blocage = coupure immédiate, débit limité (utilitaire de rate limit existant), push : APNs pushtotalk (entitlement demandé, D-4) ET, sans lui, alerte portant l'URL du segment pour la NSE ; FCM haute priorité ; HORS E2EE au MVP (dit dans l'interface, issue de suivi crypto-e2ee) ; témoins", existe: "vocal : MessageHandler.ts:461 (message:send-with-attachments) + POST /attachments/upload (routes/attachments/upload.ts:87) + audio-normalization.ts (AAC/M4A mono 64 kb/s) ; CallEventsHandler.ts (4098 l) ; PushNotificationService.ts (941 l) : pushType voip/background/alert :693-701, AUCUN interruption-level ; FCM priority high :545-556 ; DND : isWithinDnd (shared/utils/notification-dnd.ts:53), push-delivery-preferences.ts:62-74 ; rate limit Redis utils/rate-limiter.ts (socket-rate-limiter.ts est en mémoire par process : NE PAS l'utiliser)", depend: ['rel-loi-acces'] },
  { cle: 'proche-talkie@ios', chaine: 'ios', jalon: 2, issueDe: 'proche-talkie',
    titre: 'Le talkie sur iOS, avec et sans PushToTalk',
    critere: "app ouverte : lecture des fragments DÈS LEUR ARRIVÉE (tampon de gigue minimal), sans attendre la fin ; arrière-plan AVEC PushToTalk (iOS 16+, entitlement, le canal PTT joue le flux) ; SANS : la NSE télécharge le segment, l'écrit dans Library/Sounds de l'App Group et l'utilise comme son de la notification, dernier recours vocal classique ; écouteurs/Bluetooth prioritaires (CallAudioRoutes) ; indicateur des deux côtés ; silencieux/concentration respectés et dits ; XCTest ; recette sur deux iPhone", existe: "NSE apps/ios/MeeshyNotificationExtension (NotificationService.swift 750 l, App Group group.me.meeshy.apps, aucun UNNotificationSound personnalisé, NSEPreferencesGate.swift:51,71) ; entitlements : communication + time-sensitive, PAS push-to-talk ; UIBackgroundModes audio, voip, fetch, remote-notification, processing ; MediaSessionCoordinator.swift (playAndRecord + defaultToSpeaker + allowBluetoothHFP :576) ; CallAudioRouteService.swift (188 l) — CallAudioRoutes n'existe que dans la coque web", depend: ['proche-talkie'] },
  { cle: 'proche-talkie@android', chaine: 'android', jalon: 2, issueDe: 'proche-talkie',
    titre: 'Le talkie sur Android en service au premier plan',
    critere: "FCM haute priorité + service au premier plan (microphone / mediaPlayback), lecture directe, repli vocal ; iso iOS ; android.yml vert ; recette deux téléphones", existe: "MeeshyFcmService.kt → PushMessageDispatcher.kt (:72-79) ; VoicePlaybackService.kt (mediaPlayback, manifest app :222) ; VoiceRecordingService (microphone :228) ; ChatAudioPlayerHost.kt", depend: ['proche-talkie@ios'] },
  { cle: 'proche-talkie@web', chaine: 'web', jalon: 2, issueDe: 'proche-talkie',
    titre: 'Le talkie sur le web, onglet ouvert, repli en message vocal',
    critere: "lecture directe onglet ouvert, sinon repli vocal ; iso iOS ; gate", existe: "components/mini-audio-player.tsx (229 l), lecture audio web", depend: ['proche-talkie@ios'] },
  { cle: 'proche-bring', chaine: 'serveur', jalon: 2, sensible: true,
    titre: 'Un Proche autorisé peut faire sonner mon téléphone, trois fois par heure au plus — côté serveur',
    critere: "autorisation PAR PERSONNE côté destinataire, OFF par défaut ; refus sous CLOSE ; 3 Bring par heure et par expéditeur (rate limit existant) ; heures calmes respectées sauf autorisation explicite ; arrêt propagé aux appareils du destinataire ; push iOS time-sensitive (Critical Alerts = décision-produit), FCM haute priorité ; témoins", existe: "push d'appel services/call-incoming-push.ts (bypassDnd :51-84) ; PushNotificationService.ts (aucun interruption-level) ; rate-limiter.ts RedisStore.increment (:171-190), CacheStore.setnx (:186) ; DND isWithinDnd", depend: ['rel-loi-acces'] },
  { cle: 'proche-bring@ios', chaine: 'ios', jalon: 2, issueDe: 'proche-bring',
    titre: 'Le Bring sonne sur iOS, premier plan comme arrière-plan, et s\'arrête d\'un geste',
    critere: "son fort personnalisé (réutilise la sonnerie d'appel), interruption time-sensitive, limite du silencieux DITE dans l'interface ; arrêt d'un geste ; XCTest ; recette appareil réel", existe: "Ringtone.caf (30 s, bundle principal, utilisable en UNNotificationSound(named:)), RingbackTonePlayer.swift (145 l) ; entitlement time-sensitive PRÉSENT, critical-alerts ABSENT", depend: ['proche-bring'] },
  { cle: 'proche-bring@android', chaine: 'android', jalon: 2, issueDe: 'proche-bring',
    titre: 'Le Bring sonne sur Android en flux alarme',
    critere: "USAGE_ALARM via service au premier plan, volume selon réglage du destinataire, arrêt d'un geste ; android.yml vert", existe: "NotificationChannelIds.kt (:30-64, aucun canal USAGE_ALARM), canal d'appel IncomingCallNotificationPresenter.kt:50-71 (USAGE_NOTIFICATION_RINGTONE + full-screen) à prendre pour modèle, CallToneController.kt (sonnerie par défaut)", depend: ['proche-bring@ios'] },
  { cle: 'proche-bring@web', chaine: 'web', jalon: 2, issueDe: 'proche-bring',
    titre: 'Le Bring sonne sur le web onglet ouvert',
    critere: "onglet ouvert seulement, iso iOS ; gate", existe: "lib/calls/call-tones.ts (147 l, tonalités AudioContext)", depend: ['proche-bring@ios'] },
  { cle: 'sang-position-historique', chaine: 'serveur', jalon: 2, sensible: true, flag: true,
    titre: 'Entre Sangs, la position se partage en continu et se souvient de 30 jours — derrière un flag',
    critere: "EXTENSION de LocationHandler et du partage live existant au lien BLOOD (aucun second système) ; historique 30 j (index TTL, chiffrement au repos), visible entre Sangs seulement (Atome réservé), périodes fantôme jamais enregistrées, effacement par chacun ; fantôme global et ciblé indétectables ; journal des consultations visible du seul observé, message discret si consultations excessives ; alerte de proximité aux deux, rayon réglable, une par paire toutes les 2 h, rien si fantôme ; ouvert à tous les âges derrière le consentement du rituel (décision porteur 2026-10-31), rappels de consentement ; flag serveur ET client OFF par défaut, liste blanche de comptes de test ; témoins (dont : flag OFF ⇒ aucune route ni événement ne répond)", existe: "LocationHandler.ts (681 l) : location:live-start/-update/-stop → -started/-updated/-stopped (event-names.ts:776-778, :525-527), registre en MÉMOIRE par (conversationId,userId), audience = room de CONVERSATION (:277,354,391,600), aucune persistance, durée ≤ 480 min (socket-event-schemas.ts:200) ; AUCUN modèle de position ; TTL : socialEventIndexes.ts:55-72 ; chiffrement au repos : utils/secret-at-rest.ts (AES-256-GCM, sealSecret :97) ; AUCUN système de feature flag serveur (seulement ENABLE_* en env) : flag + liste blanche à créer, justifié", depend: ['rel-loi-acces'] },
  { cle: 'sang-position-historique@ios', chaine: 'ios', jalon: 2, issueDe: 'sang-position-historique',
    titre: 'La carte « Mon univers » et la position continue entre Sangs sur iOS, flag OFF',
    critere: "permissions « Toujours », changements significatifs, régions ; carte ; fantôme ; flag client ; batterie mesurée sur appareil réel ; XCTest", existe: "MeeshySDK LocationService.swift (57 l) émet start/update/stop mais AUCUN appelant dans apps/ios ; Info.plist : WhenInUse seulement (:73), pas de mode location ; LocationSharingSettingsSection.swift (précision et style de carte)", depend: ['sang-position-historique'] },
  { cle: 'sang-position-historique@android', chaine: 'android', jalon: 2, issueDe: 'sang-position-historique',
    titre: 'La position continue entre Sangs sur Android, flag OFF',
    critere: "ACCESS_BACKGROUND_LOCATION + service au premier plan de type location ; carte iso iOS ; android.yml vert", existe: "émetteur complet : LiveLocationSharingController.kt, LiveLocationForegroundService.kt (FOREGROUND_SERVICE_TYPE_LOCATION), LiveLocationDeviceSource.kt (LocationManager), LiveLocationBadge.kt ; ACCESS_BACKGROUND_LOCATION ABSENTE", depend: ['sang-position-historique@ios'] },
  { cle: 'sang-position-historique@web', chaine: 'web', jalon: 2, issueDe: 'sang-position-historique',
    titre: 'La carte des Sangs sur le web, onglet ouvert, flag OFF',
    critere: "lecture seule onglet ouvert, iso iOS ; gate", existe: "AUCUN client de position en direct dans apps/web/src : à créer (lecture seule)", depend: ['sang-position-historique@ios'] },
]
// Les lots sans chaîne de développement : la recette réelle et la conformité ont leurs propres phases.
const LOTS_HORS_CHAINE = [
  { cle: 'sang-recette-reelle', jalon: 2, titre: 'Écoute, talkie, Bring et position sont prouvés sur deux téléphones personnels', critere: "la recette (onglet « Tests talkie » du xlsx, étendue à l'écoute et au Bring) publiée en commentaire de l'issue ; résultats rendus par le porteur ; latence p95 du talkie (< 1 s en 4G proposé) et batterie (< 5 % en 8 h au repos proposé) mesurées" },
  { cle: 'conformite-cercles', jalon: 2, titre: 'L\'analyse d\'impact des cercles est faite avant toute mise en production', critere: "analyse d'impact RGPD (position, historique 30 j, écoute, mineurs), durées de conservation, écrans de consentement, politique de confidentialité ; ce qui exige un avis juridique signé est dit" },
]

const CLES_DEMANDEES = Array.isArray(A.lots) && A.lots.length && A.lots.every((x) => typeof x === 'string') ? new Set(A.lots) : null
const LOTS_OBJETS = Array.isArray(A.lots) && A.lots.length && A.lots.every((x) => x && typeof x === 'object') ? A.lots : null
const JALON = Number.isInteger(A.jalon) ? A.jalon : 0
const LOTS = (LOTS_OBJETS || LOTS_PAR_DEFAUT)
  .filter((l) => !CLES_DEMANDEES || CLES_DEMANDEES.has(l.cle) || CLES_DEMANDEES.has(l.issueDe))
  .filter((l) => !JALON || l.jalon === JALON)
  .filter((l) => !SAUTER.has(l.cle))
const CHAINES = ['serveur', 'ios', 'web', 'android']
const cleIssue = (l) => l.issueDe || l.cle
const estSousLot = (l) => !!l.issueDe

// ---------------------------------------------------------------------------
// LE SOCLE — ce que tout agent lit avant d'écrire
// ---------------------------------------------------------------------------

const GITHUB = `GITHUB (dépôt ${GH}) — par l'API REST, jamais par GraphQL :
- ${POSTE === 'cloud' ? 'Ce poste est un conteneur cloud : `gh pr create`, `gh pr view --json`, `gh pr list`, `gh project` et `node scripts/ci/pr-verte.mjs` passent par GraphQL et rendent 403. Utilise' : 'Sur ce poste `gh` complet marche ; pour rester portable, préfère'} :
  lire une PR : \`gh api repos/${GH}/pulls/<n> --jq '{state,merged,mergeable_state,head:.head.ref,sha:.head.sha,base:.base.ref}'\` ;
  lister : \`gh api "repos/${GH}/pulls?state=open&head=isopen-io:<branche>"\` ;
  ouvrir : \`gh api -X POST repos/${GH}/pulls -f base=${BASE} -f head=<branche> -f title='…' -F body=@<fichier>\` ;
  verdict CI : ${POSTE === 'cloud' ? '' : '`node scripts/ci/pr-verte.mjs <n> --attendre 45` (0 vert, 1 rouge, 3 en cours, 2 lecture impossible) ; à défaut, '}\`gh api "repos/${GH}/commits/<sha>/check-runs?per_page=100" --jq '.check_runs[] | [.name,.status,.conclusion] | @tsv'\` —
  VERT = tous « completed », aucun « failure »/« cancelled »/« timed_out », et le check « Verdict CI » présent en « success » ;
  rejoue toutes les 60 s jusqu'à 45 min ;
  fusionner (agent de LIVRAISON seulement, au VERT) : \`gh api -X PUT repos/${GH}/pulls/<n>/merge -f merge_method=merge\` ;
  commenter une issue : \`gh api -X POST repos/${GH}/issues/<n>/comments -F body=@<fichier>\` ; issues : \`gh api repos/${GH}/issues…\`.
- Les outils MCP mcp__github__* (ToolSearch « select:mcp__github__issue_write,mcp__github__add_issue_comment ») sont un recours équivalent.
- Tout commentaire ou corps de PR se termine par une ligne vide, ---, puis _Generated by [Claude Code](https://claude.ai/code)_ (les PR : 🤖 Generated with [Claude Code](https://claude.com/claude-code)).`

const socle = (chaine) => `
TU TRAVAILLES SUR LE CHANTIER « CERCLES DE PROXIMITÉ ET MODE SANG » DE MEESHY (décisions porteur 2026-10-31,
milestone #${MILESTONE}${CHAPEAU ? `, issue chapeau #${CHAPEAU}` : ''}), chaîne ${chaine.toUpperCase()}, dans le worktree ${REPO[chaine] || REPO_SPEC}. Date : ${DATE}.
Poste : ${POSTE}.

TON RÉPERTOIRE DE TRAVAIL EST ${REPO[chaine] || REPO_SPEC} — le shell RÉINITIALISE le cwd entre deux appels Bash :
PRÉFIXE CHAQUE commande par \`cd ${REPO[chaine] || REPO_SPEC} && \`. Première commande, littéralement :
\`cd ${REPO[chaine] || REPO_SPEC} && git branch --show-current && git rev-parse --short HEAD\`.
NE CRÉE ni NE SUPPRIME de worktree (\`git worktree add/remove/prune\` INTERDITS — seul l'agent de synchronisation
crée les quatre worktrees de chaîne ; le hook du dépôt refuse le 5e), NE CLONE RIEN dans /tmp, NE POUSSE JAMAIS
sur \`${BASE}\` ni sur \`main\`, et NE FUSIONNE JAMAIS une PR — sauf l'agent de LIVRAISON, au VERT de ses checks.
\`gh pr merge --auto\` et la route ccr/auto_merge sont INTERDITS : sans protection de branche, ils fusionnent sur-le-champ.

LA SPÉCIFICATION : ${SPEC} (chemin ABSOLU, dans un worktree qui ne change jamais de branche ; les worktrees de chaîne
basculent sur des branches issues de ${BASE} où elle peut ne pas encore exister). Lis-la avant d'écrire : § 1 décisions
porteur, § 2 modèles, § 3 loi d'accès, § 4 événements et routes, § 5 états d'écran, § 6 matrice cas × plateforme,
§ 7 table « existant → modification ». La spec fait foi ; le classeur ${XLSX} (onglets Niveaux, Features, Règles,
Tests talkie) en est la source — lis-le avec \`python3 -I\` et openpyxl si tu as besoin d'une ligne.

RÈGLE D'OR — RÉUTILISER ET METTRE À JOUR L'EXISTANT, NE RIEN RECRÉER INUTILEMENT. Créer un module, un modèle, une
route, un événement ou un écran exige une justification ÉCRITE dans l'issue (pourquoi l'existant ne suffit pas). Une
jumelle divergente d'un code existant est un défaut BLOQUANT. Ce qui part À CÔTÉ d'un champ gardé est gardé aussi.

SOURCES DE VÉRITÉ, dans cet ordre :
1. le CODE RÉEL : services/gateway/src/routes/** (préfixe /api/v1, réponse sendSuccess/sendError), packages/shared/types/
   socketio-events/** (événements entity:action-word à tirets), handlers services/gateway/src/socketio/**. Cite fichier:ligne.
2. apps/ios + packages/MeeshySDK sont la RÉFÉRENCE de disposition, hiérarchie, états et gestes pour apps/web ET apps/android (iso).
3. les CLAUDE.md des dossiers touchés, services/gateway/decisions/, apps/web/decisions.md, apps/android/decisions.md.
4. tasks/lessons/ (\`ls tasks/lessons | grep -iE "presence|friend|ami|contact|post|story|notification|location|audio|voice|socket|game|android"\`).

RÈGLES DE FORME : commits conventionnels en français qui disent le RÉSULTAT (\`feat(gateway): …\`, \`feat(shared): …\`,
\`feat(ios): …\`, \`feat(web): …\`, \`feat(android): …\`), \`Refs #n\` sur les points d'étape, \`Closes #n\` à la livraison
(jamais \`Closes #0\`), et en fin de message EXACTEMENT :
${ATTRIBUTION}
Aucun nom de modèle ailleurs. Aucun artefact généré dans un commit. Code nommé en anglais ; prose et textes utilisateur en
français ; textes utilisateur dans les SEPT langues du catalogue. Compatibilité (D-5, #13947) : AUCUNE compatibilité ascendante pour les cercles — un client sous le plancher de version reçoit
426 UPGRADE_REQUIRED et l'invitation à se mettre à jour (lot version-minimale, #13954) ; rien n'est retiré du serveur au MVP ; le web
(sans en-tête de version) n'est jamais bloqué. Ce qui ne marche pas encore n'est pas livré (Status partiel + issue) ;
ce qu'une plateforme interdit se DIT dans l'interface et ne se simule jamais.
Dossier de travail hors suivi : ${REPO[chaine] ? SCRATCH(chaine) : `${REPO_SPEC}/.cache/cercles-workflow`}.

${GITHUB}

TON RENDU STRUCTURÉ est du JSON validé : chaque champ texte COURT (\`rapport\` ≤ 3 000 caractères, chaque sortie de gate ≤ 800),
le détail dans <dossier de travail>/<clé>-rapport.md que tu CITES ; aucun caractère de contrôle brut. Un refus ⇒ raccourcis de moitié.
`

const GATES = {
  serveur: `GATES SERVEUR (${REPO.serveur}) :
- prérequis : \`cd ${REPO.serveur}/packages/shared && npx prisma generate --generator client && bun run build\` (le gateway lit shared/dist).
- rapides : \`cd ${REPO.serveur}/packages/shared && bun run type-check && bun test <fichiers>\` ; \`cd ${REPO.serveur}/services/gateway && bunx tsc --noEmit && bun run test -- <fichiers du périmètre>\`.
- avant la PR : \`cd ${REPO.serveur}/services/gateway && bun run test:coverage 2>&1 | tail -30\` (complet) puis \`bunx tsc --noEmit\`.
  Un rouge PRÉEXISTANT se prouve par le run CI de ${BASE} (\`gh api "repos/${GH}/actions/runs?branch=${BASE}&per_page=5"\`), jamais par un clone, et se DIT dans la PR.`,
  web: `GATES WEB (${REPO.web}) :
- si packages/shared a bougé : \`cd ${REPO.web}/packages/shared && bun run build\` d'abord.
- rapides : \`cd ${REPO.web}/apps/web && bun run type-check && bun test <fichiers> 2>&1 | tail -15\` (bun test ne type rien : type-check obligatoire).
- avant la PR : \`cd ${REPO.web}/apps/web && bun run gate 2>&1 | tail -40\`.`,
  ios: POSTE === 'cloud'
    ? `GATES iOS (${REPO.ios}) — POSTE CLOUD : ni Xcode ni simulateur ici. Les tests SDK purs Swift qui ne touchent ni UIKit ni SwiftUI peuvent se
  jouer par \`cd ${REPO.ios}/packages/MeeshySDK && swift test --filter <Nom>\` SI \`swift --version\` répond ; sinon la SEULE preuve est la CI
  de la PR (ios.yml, sdk-tests.yml) : le SUJET du commit de tête porte « run test » (sinon la CI iOS ne fait que compiler). Écris les témoins
  XCTest/Swift Testing d'abord, pousse, et lis le run de la PR (\`gh api "repos/${GH}/actions/runs?branch=<branche>&per_page=5"\`,
  \`gh api repos/${GH}/actions/jobs/<id>/logs | tail -80\`) pour prouver rouge puis vert. Jamais « ça devrait compiler ».`
    : `GATES iOS (${REPO.ios}) — UN SEUL BUILD À LA FOIS (xcodebuild tué ⇒ attendre 60 s, réessayer une fois) :
- \`cd ${REPO.ios} && ./apps/ios/meeshy.sh build 2>&1 | tail -30\` (JAMAIS \`meeshy.sh run\`) ; project.yml changé ⇒ \`cd apps/ios && xcodegen generate\`.
- tests ciblés : la commande de test de apps/ios/meeshy.sh avec \`-only-testing:<Cible>/<Classe>\` ; SDK : \`cd packages/MeeshySDK && swift test --filter <Nom>\`.
- \`apps/ios/scripts/check_cohesion_budget.sh\` vert. Sujet du commit de tête avec « run test » pour la CI.
- captures au simulateur NATIF ${SIM_NATIVE} (jamais Meeshy-iOS26) clair et sombre.`,
  android: `GATES ANDROID (${REPO.android}) — le SEUL compilateur joignable est la CI android.yml (dl.google.com refusé aux conteneurs) :
  écris les témoins JVM d'abord, pousse, lis le run android.yml de la branche (\`gh api "repos/${GH}/actions/runs?branch=<branche>&per_page=5"\`) :
  \`assembleDebug\` et \`testDebugUnitTest\` VERTS sont la seule preuve admise ; un rouge se lit (\`gh api repos/${GH}/actions/jobs/<id>/logs | tail -80\`) et se corrige.`,
}

// ---------------------------------------------------------------------------
// SCHÉMAS
// ---------------------------------------------------------------------------

const SYNCHRO = {
  type: 'object', additionalProperties: false, required: ['pret', 'etat'],
  properties: {
    pret: { type: 'boolean', description: 'false SEULEMENT si origin est injoignable, si un worktree ne peut pas être créé ou si un conflit demande un arbitrage' },
    etat: { type: 'string' },
    sha_dev: { type: 'string' },
    ci_dev: { type: 'string' },
    worktrees: { type: 'array', items: { type: 'string' } },
    tenus_ailleurs: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['quoi', 'preuve'], properties: { quoi: { type: 'string' }, preuve: { type: 'string' }, lots_a_eviter: { type: 'array', items: { type: 'string' } } } },
    },
  },
}

const INVENTAIRE = {
  type: 'object', additionalProperties: false, required: ['a_etendre', 'a_modifier', 'a_ne_pas_toucher'],
  properties: {
    a_etendre: { type: 'array', items: { type: 'string' }, description: 'fichier:ligne — ce qu on étend' },
    a_modifier: { type: 'array', items: { type: 'string' } },
    a_ne_pas_toucher: { type: 'array', items: { type: 'string' } },
    a_creer: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['quoi', 'pourquoi_l_existant_ne_suffit_pas'], properties: { quoi: { type: 'string' }, pourquoi_l_existant_ne_suffit_pas: { type: 'string' } } } },
  },
}

const CADRAGE = {
  type: 'object', additionalProperties: false, required: ['lots'],
  properties: {
    etat: { type: 'string' },
    lots: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['cle', 'verdict', 'preuve', 'inventaire'],
        properties: {
          cle: { type: 'string' },
          verdict: { type: 'string', enum: ['a-faire', 'deja-livre', 'tenu-ailleurs', 'a-decouper', 'en-pr', 'bloque-decision'] },
          pr_numero: { type: 'number' },
          preuve: { type: 'string' },
          inventaire: INVENTAIRE,
          fichiers_cibles: { type: 'array', items: { type: 'string' } },
          hors_budget: { type: 'array', items: { type: 'string' } },
          taille: { type: 'string', enum: ['petit', 'developper'] },
          note: { type: 'string' },
        },
      },
    },
    collisions: { type: 'array', items: { type: 'string' } },
  },
}

const ISSUES = {
  type: 'object', additionalProperties: false, required: ['issues'],
  properties: {
    issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['cle', 'numero'], properties: { cle: { type: 'string' }, numero: { type: 'number' }, url: { type: 'string' }, deja_ouverte: { type: 'boolean' } } } },
    projet: { type: 'string', description: 'ce qui a été posé au projet #1, ou pourquoi rien ne l a été' },
    rapport: { type: 'string' },
  },
}

const FAIT = {
  type: 'object', additionalProperties: false, required: ['branche', 'pousse', 'rapport', 'temoins', 'gates_rapides'],
  properties: {
    branche: { type: 'string' },
    pousse: { type: 'boolean' },
    commits: { type: 'array', items: { type: 'string' } },
    fichiers: { type: 'array', items: { type: 'string' } },
    crees: { type: 'array', items: { type: 'string' }, description: 'chaque fichier/modèle/route/événement CRÉÉ, avec sa justification' },
    temoins: { type: 'array', items: { type: 'string' }, description: 'fichier, describe, ce qui est prouvé, ROUGE puis VERT' },
    gates_rapides: { type: 'string' },
    rapport: { type: 'string' },
    blocage: { type: 'string' },
    contrat: { type: 'string', description: 'serveur : les types, routes et événements que les clients consomment (fichier:ligne)' },
    dimensions_mures: { type: 'array', items: { type: 'string' } },
    dimensions_restantes: { type: 'array', items: { type: 'string' } },
  },
}

const DEFAUT = {
  type: 'object', additionalProperties: false, required: ['gravite', 'constat', 'preuve', 'correctif'],
  properties: { gravite: { type: 'string', enum: ['bloquant', 'majeur', 'mineur'] }, constat: { type: 'string' }, preuve: { type: 'string' }, correctif: { type: 'string' } },
}

const REVUE = {
  type: 'object', additionalProperties: false, required: ['verdict', 'defauts_trouves', 'corriges', 'restants', 'rapport'],
  properties: {
    verdict: { type: 'string', enum: ['conforme', 'a-corriger', 'a-refaire'] },
    defauts_trouves: { type: 'array', items: DEFAUT },
    corriges: { type: 'number' },
    restants: { type: 'array', items: DEFAUT },
    recreations_refusees: { type: 'array', items: { type: 'string' } },
    gates_rejoues: { type: 'string' },
    commits: { type: 'array', items: { type: 'string' } },
    rapport: { type: 'string' },
  },
}

const LIVRAISON = {
  type: 'object', additionalProperties: false, required: ['pousse', 'rapport'],
  properties: {
    pousse: { type: 'boolean' },
    pr_numero: { type: 'number' },
    pr_url: { type: 'string' },
    fusionnee: { type: 'boolean' },
    gates: { type: 'string' },
    rouge_preexistant: { type: 'string' },
    issue_commentee: { type: 'boolean' },
    issues_de_suivi: { type: 'array', items: { type: 'number' } },
    rapport: { type: 'string' },
  },
}

const LOT_FORME = {
  type: 'object', additionalProperties: false, required: ['cle', 'chaine', 'titre', 'critere'],
  properties: { cle: { type: 'string' }, chaine: { type: 'string', enum: ['serveur', 'ios', 'web', 'android'] }, jalon: { type: 'number' }, issueDe: { type: 'string' }, titre: { type: 'string' }, critere: { type: 'string' }, existe: { type: 'string' }, depend: { type: 'array', items: { type: 'string' } }, sensible: { type: 'boolean' } },
}

const VALIDATION = {
  type: 'object', additionalProperties: false, required: ['acceptable', 'etapes', 'defauts', 'rapport'],
  properties: {
    acceptable: { type: 'boolean' },
    staging_sha: { type: 'string' },
    fusionnees: { type: 'array', items: { type: 'number' } },
    etapes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['nom', 'plateforme', 'resultat', 'preuve'],
        properties: { nom: { type: 'string' }, plateforme: { type: 'string', enum: ['web', 'ios', 'android', 'api', 'tous'] }, resultat: { type: 'string', enum: ['passe', 'echoue', 'non-jouee', 'attend-le-porteur'] }, preuve: { type: 'string' } },
      },
    },
    recette_reelle_publiee: { type: 'boolean', description: 'true si la recette deux téléphones est en commentaire de son issue' },
    retour_porteur: { type: 'string', description: 'ce que le porteur a rendu dans les commentaires (OK/KO/Partiel par ligne), verbatim résumé ; vide s il n a rien rendu' },
    defauts: { type: 'array', items: LOT_FORME },
    rapport: { type: 'string' },
  },
}

const CONFORMITE = {
  type: 'object', additionalProperties: false, required: ['rendue', 'bloque_production', 'rapport'],
  properties: {
    rendue: { type: 'boolean', description: 'true si l analyse est écrite, poussée et liée à son issue' },
    chemin: { type: 'string' },
    pr_numero: { type: 'number' },
    bloque_production: { type: 'boolean', description: 'true tant qu un point exige une décision ou un avis signé' },
    avis_signe_requis: { type: 'array', items: { type: 'string' } },
    rapport: { type: 'string' },
  },
}

const FINAL = {
  type: 'object', additionalProperties: false, required: ['fait', 'rapport'],
  properties: { fait: { type: 'boolean' }, main_sha: { type: 'string' }, rapport: { type: 'string' } },
}

// ---------------------------------------------------------------------------
// OUTILS
// ---------------------------------------------------------------------------

const court = (v, n) => JSON.stringify(v === undefined ? null : v, null, 1).slice(0, n)
const ligneDeLot = (l) => `- ${l.cle} [${l.chaine}, jalon ${l.jalon || '?'}${l.sensible ? ', SENSIBLE' : ''}${l.issueDe ? `, issue de ${l.issueDe}` : ''}] ${l.titre}\n  critère : ${l.critere}${l.existe ? `\n  existe déjà (relevé du 2026-10-31) : ${l.existe}` : ''}${l.depend && l.depend.length ? `\n  dépend de : ${l.depend.join(', ')}` : ''}`
const listeInventaire = (inv) => inv ? [
  `À ÉTENDRE : ${(inv.a_etendre || []).join(' ; ') || '—'}`,
  `À MODIFIER : ${(inv.a_modifier || []).join(' ; ') || '—'}`,
  `À NE PAS TOUCHER : ${(inv.a_ne_pas_toucher || []).join(' ; ') || '—'}`,
  `À CRÉER (justifié) : ${(inv.a_creer || []).map((c) => `${c.quoi} — ${c.pourquoi_l_existant_ne_suffit_pas}`).join(' ; ') || 'rien'}`,
].join('\n') : '(pas d inventaire)'

const resultats = []
let lotsDuTour = LOTS
const numeros = { ...NUMEROS_ARGS }

for (let tour = 1; tour <= TOURS; tour += 1) {
  if (!lotsDuTour.length) { log(`=== TOUR ${tour} — aucun lot, fin ===`); break }
  log(`=== TOUR ${tour}/${TOURS} — ${lotsDuTour.length} lots : ${lotsDuTour.map((l) => l.cle).join(', ')} ===`)
  const chainesDuTour = CHAINES.filter((c) => lotsDuTour.some((l) => l.chaine === c))

  // -------------------------------------------------------------------------
  phase('Synchroniser')
  // -------------------------------------------------------------------------
  const synchro = await agent(`${socle('serveur')}

TA MISSION — PRÉPARER LES WORKTREES DE CHAÎNE DU TOUR (${chainesDuTour.join(', ')}) ET RELEVER CE QUE TIENNENT LES AUTRES SESSIONS.
Tu es le SEUL agent autorisé à créer un worktree, et seulement ceux-ci : ${chainesDuTour.map((c) => `${REPO[c]} (${c})`).join(', ')}.
Aucun fichier de production n'est modifié.

1. \`cd ${REPO_PRINCIPAL} && git worktree list\`. Plus de 4 worktrees en plus du clone principal ⇒ n'en crée aucun et rends pret=false
   avec la liste (directive porteur 2026-10-02 : on rapatrie et on retire un worktree fusionné et inactif avant d'en ouvrir un).
2. \`git -C ${REPO_PRINCIPAL} fetch origin ${BASE}\` (4 essais sur échec réseau : 2 s, 4 s, 8 s, 16 s).
3. Pour chaque worktree de chaîne absent : \`cd ${REPO_PRINCIPAL} && git worktree add <chemin> origin/${BASE} --detach\`.
   Présent : \`git -C <chemin> status --short | head\` — un arbre SALE est le reste d'un tour interrompu : commite-le sur sa branche
   (\`wip(<chaîne>): reprise — état laissé par un tour interrompu\`, attribution EXACTE) et pousse-le ; jamais de stash, jamais de checkout -- .
   Une branche lot/* courante est NORMALE : ne change pas de branche.
4. Dans chaque worktree : \`ls node_modules/.bun 2>/dev/null | head -1\` sinon \`bun install --ignore-scripts\` (le postinstall de grpc-tools échoue
   derrière le proxy : c'est attendu) ; serveur et web : \`cd packages/shared && npx prisma generate --generator client && bun run build\`.
5. \`git -C ${REPO_PRINCIPAL} log --oneline -1 origin/${BASE}\` et le verdict CI à cette tête :
   \`gh api "repos/${GH}/actions/runs?branch=${BASE}&per_page=10" --jq '.workflow_runs[] | [.name,.head_sha[0:8],.status,.conclusion] | @tsv'\` → ci_dev.
6. LE RELEVÉ : PR ouvertes (\`gh api "repos/${GH}/pulls?state=open&per_page=60" --jq '.[] | [.number,.head.ref,.title] | @tsv'\`), branches poussées
   depuis moins de 72 h (\`git -C ${REPO_PRINCIPAL} for-each-ref --sort=-committerdate refs/remotes/origin --format='%(committerdate:iso) %(refname:short)' | head -40\`).
   Une PR ou une branche vivante qui écrit presence-visibility / presence-gate / presence-audience / FriendRequest / postAudience /
   friend-content / story-comment / GameProfile / LocationHandler / NSE / pipeline vocal TIENT son sujet : rends-la dans tenus_ailleurs avec
   la preuve et les clés à éviter parmi : ${lotsDuTour.map((l) => l.cle).join(', ')} — SAUF les branches lot/<clé>-<n> de CE chantier.
Sois FACTUEL : etat cite les commandes et leurs sorties.`,
    { label: `synchroniser:tour-${tour}`, phase: 'Synchroniser', schema: SYNCHRO, model: MODELE.synchro, effort: 'medium' })

  if (!synchro || synchro.pret === false) {
    log(`ARRÊT — synchronisation impossible : ${synchro ? synchro.etat.slice(0, 400) : '(aucun rapport)'}`)
    resultats.push({ tour, arret: 'synchronisation', etat: synchro && synchro.etat })
    break
  }
  const TENUS = Array.isArray(synchro.tenus_ailleurs) ? synchro.tenus_ailleurs : []
  const estDuChantier = (t) => /\blot\/[a-z0-9-]+-\d+/.test(`${t.quoi || ''} ${t.preuve || ''}`)
  const CLES_TENUES = new Set(TENUS.filter((t) => !estDuChantier(t)).flatMap((t) => Array.isArray(t.lots_a_eviter) ? t.lots_a_eviter : []))
  log(`${BASE} à ${synchro.sha_dev || '?'} (CI : ${(synchro.ci_dev || '?').slice(0, 120)}) — ${TENUS.length} sujets tenus ailleurs${CLES_TENUES.size ? ` (écartés : ${[...CLES_TENUES].join(', ')})` : ''}`)
  const RELEVE = TENUS.length
    ? `CE QUE D'AUTRES SESSIONS TIENNENT — n'y touche pas :\n${TENUS.map((t) => `- ${t.quoi} (preuve : ${t.preuve})`).join('\n')}\n`
    : 'Aucun sujet relevé comme tenu par une autre session.\n'

  // -------------------------------------------------------------------------
  phase('Cadrer')
  // -------------------------------------------------------------------------
  const candidats = lotsDuTour.filter((l) => !CLES_TENUES.has(l.cle))
  const cadrage = await agent(`${socle('serveur')}

TA MISSION — CONFRONTER CHAQUE LOT À L'ARBRE VIVANT (origin/${BASE} = ${synchro.sha_dev || '?'}) ET PRODUIRE SON INVENTAIRE DE L'EXISTANT.
Pour CHAQUE lot, dans le worktree de sa chaîne (${CHAINES.map((c) => `${c} → ${REPO[c]}`).join(', ')}) :
0. PR d'un tour précédent ? \`gh api "repos/${GH}/pulls?state=all&per_page=20&head=isopen-io:lot/<clé sans @, @ remplacé par ->-<n>"\` (et une recherche
   des branches \`git branch -r | grep lot/<clé>\`). PR ouverte ⇒ en-pr + pr_numero ; fusionnée ⇒ deja-livre.
1. Sinon rejoue les greps qui fondent « existe déjà », LIS les fichiers et rends l'INVENTAIRE : à étendre / à modifier / à ne pas toucher
   (fichier:ligne), et à créer — chaque création avec « pourquoi l'existant ne suffit pas » ; une création que l'existant couvre est REFUSÉE ici.
2. Verdict : deja-livre (critère tenu, prouvé par le code et un témoin), tenu-ailleurs, a-faire, a-decouper (plus d'un jour — dis comment),
   bloque-decision (une décision-produit ouverte de la spec § 8 le bloque SANS défaut applicable : dis laquelle — issues ${Object.entries(DECISIONS).map(([k, n]) => `${k} #${n}`).join(', ')} ; une décision qui a un défaut écrit en § 8 ne bloque pas : le défaut s'applique et se dit).
3. fichiers_cibles, hors_budget (\`wc -l\` > 1000 : extraire avant d'ajouter), taille (petit = haiku ; developper = sonnet).
4. COLLISIONS : deux lots d'une même chaîne sur un même fichier ⇒ l'ordre.

${RELEVE}
LES LOTS :
${candidats.map(ligneDeLot).join('\n')}`,
    { label: `cadrer:tour-${tour}`, phase: 'Cadrer', schema: CADRAGE, model: MODELE.cadrer, effort: 'high' })

  const verdicts = new Map((cadrage && cadrage.lots ? cadrage.lots : []).map((v) => [v.cle, v]))
  const aFaire = candidats.filter((l) => { const v = verdicts.get(l.cle); return !v || v.verdict === 'a-faire' || v.verdict === 'a-decouper' })
  const enPr = candidats.filter((l) => { const v = verdicts.get(l.cle); return v && v.verdict === 'en-pr' && v.pr_numero })
  const bloques = candidats.filter((l) => { const v = verdicts.get(l.cle); return v && v.verdict === 'bloque-decision' })
  log(`cadrage : ${aFaire.length} à faire (${aFaire.map((l) => l.cle).join(', ') || '—'}), ${enPr.length} en PR, ${bloques.length} bloqués par une décision (${bloques.map((l) => l.cle).join(', ') || '—'})`)
  if (cadrage && cadrage.collisions && cadrage.collisions.length) log(`collisions : ${cadrage.collisions.join(' ; ')}`)

  // -------------------------------------------------------------------------
  phase('Ouvrir')
  // -------------------------------------------------------------------------
  const aOuvrir = [...new Map([...aFaire, ...enPr, ...bloques].map((l) => [cleIssue(l), l])).values()].filter((l) => !numeros[cleIssue(l)])
  const aInventorier = aFaire.filter((l) => numeros[cleIssue(l)] && verdicts.get(l.cle) && verdicts.get(l.cle).inventaire)
  if (aInventorier.length) {
    await agent(`${socle('serveur')}

TA MISSION — ÉCRIRE L'INVENTAIRE DE L'EXISTANT DU TOUR ${tour} DANS CHAQUE ISSUE DE LOT. Mécanique, exact, sans rien reformuler.
Pour chaque lot ci-dessous, UN commentaire sur son issue (REST : \`gh api -X POST repos/${GH}/issues/<n>/comments -F body=@<fichier>\`), titré
« Inventaire de l'existant — cadrage du tour ${tour} (${DATE}, origin/${BASE} ${synchro.sha_dev || '?'}) », qui recopie les quatre rubriques ; sauf s'il existe déjà un
commentaire de même titre (\`gh api repos/${GH}/issues/<n>/comments --jq '.[].body' | grep -c "cadrage du tour ${tour}"\`).

${aInventorier.map((l) => `### ${l.cle} → #${numeros[cleIssue(l)]}\n${listeInventaire(verdicts.get(l.cle).inventaire)}`).join('\n\n')}`,
      { label: `inventorier:tour-${tour}`, phase: 'Ouvrir', model: MODELE.mecanique, effort: 'low' })
  }
  if (aOuvrir.length) {
    const ouverture = await agent(`${socle('serveur')}

TA MISSION — OUVRIR (OU RETROUVER) L'ISSUE DE CHAQUE LOT avant la première ligne de code, et y écrire son INVENTAIRE. Mécanique, exact.
Un lot multi-plateforme (\`<clé>@<chaîne>\`) partage l'issue de sa clé racine : UNE issue par clé ci-dessous.
1. Cherche une issue ouverte au même sujet (\`mcp__github__search_issues\`, owner isopen-io, repo meeshy) — milestone #${MILESTONE}.
2. À défaut, crée-la : titre = le titre VERBATIM ; corps = ## Contexte (deux phrases + « décisions porteur du 2026-10-31, issue chapeau${CHAPEAU ? ` #${CHAPEAU}` : ''} ») ·
   ## Inventaire de l'existant (à étendre / à modifier / à ne pas toucher / à créer avec justification — recopie l'inventaire ci-dessous) ·
   ## Preuve (gates de la plateforme) · ## Critère de fin (verbatim, plus les sous-lots par plateforme s'il y en a) · ## Dimensions visées (parmi
   les treize) · ## Source (spec § 6 clé <clé> ; xlsx feuille Features ligne <ID>). Labels : gateway et/ou shared, ios, web, android selon
   les sous-lots, sécurité si sensible. Milestone ${MILESTONE}. Champs de l'issue : « Start date » = ${DATE}, « Target date » = 2026-12-15,
   « Priority » = High (jalon 1) ou Medium (jalon 2).${CHAPEAU ? ` Rattache-la comme sous-issue de #${CHAPEAU} (mcp__github__sub_issue_write, l'id interne se lit par issue_read).` : ''}
3. Projet « Meeshy — pilotage » (org isopen-io, numéro 1), Status = In Progress : ${POSTE === 'cloud' ? "l'API Projects v2 n'est joignable que par GraphQL, refusé sur ce poste : ne tente pas, rends projet = « à poser depuis le poste du porteur »." : '`gh project item-add 1 --owner isopen-io --url <url>` puis `gh project item-edit` sur Status (ids : `gh project field-list 1 --owner isopen-io --format json`).'}

LES LOTS ET LEUR INVENTAIRE :
${aOuvrir.map((l) => `${ligneDeLot(l)}\n  INVENTAIRE :\n${listeInventaire((verdicts.get(l.cle) || {}).inventaire)}`).join('\n\n')}`,
      { label: `ouvrir:tour-${tour}`, phase: 'Ouvrir', schema: ISSUES, model: MODELE.mecanique, effort: 'low' })
    ;(ouverture && ouverture.issues ? ouverture.issues : []).forEach((i) => { if (i.numero) numeros[i.cle.split('@')[0]] = i.numero })
    log(`issues : ${Object.entries(numeros).map(([c, n]) => `${c}→#${n}`).join(', ') || 'aucune'}${ouverture && ouverture.projet ? ` — projet : ${ouverture.projet.slice(0, 120)}` : ''}`)
  }

  // -------------------------------------------------------------------------
  // LES QUATRE CHAÎNES EN PARALLÈLE. Dans une chaîne : un lot après l'autre. Entre chaînes : un lot attend
  // la fin de ses dépendances DU TOUR (contrat serveur, référence iOS), jamais celles d'un tour passé.
  // -------------------------------------------------------------------------
  const fin = {}
  const signaler = {}
  aFaire.forEach((l) => { fin[l.cle] = new Promise((r) => { signaler[l.cle] = r }) })
  const attendre = async (l) => {
    const deps = (l.depend || []).filter((d) => fin[d])
    const etats = await Promise.all(deps.map((d) => fin[d]))
    return deps.map((d, i) => ({ cle: d, ...etats[i] }))
  }

  const developperLot = async (l) => {
    const repo = REPO[l.chaine]
    const num = numeros[cleIssue(l)] || 0
    const v = verdicts.get(l.cle) || {}
    const taille = v.taille || 'developper'
    const branche = `lot/${l.cle.replace('@', '-')}-${num || 'sans-issue'}`
    const amont = await attendre(l)
    const amontRate = amont.filter((a) => !a.livre)
    if (amontRate.length) {
      log(`${l.cle} : attend ${amontRate.map((a) => a.cle).join(', ')} (non livré ce tour) — reporté`)
      return { cle: l.cle, issue: num, arret: `dépendance non livrée : ${amontRate.map((a) => a.cle).join(', ')}` }
    }
    const contrats = amont.filter((a) => a.contrat).map((a) => `- ${a.cle} (branche ${a.branche}${a.pr ? `, PR #${a.pr}` : ''}) : ${a.contrat}`).join('\n')
    // Une issue à plusieurs lots (le lot racine et ses `@chaîne`) ne se ferme qu'au DERNIER fusionné : chaque livraison vérifie ses frères.
    const freres = LOTS_PAR_DEFAUT.filter((x) => x.cle !== l.cle && cleIssue(x) === cleIssue(l)).map((x) => x.cle)

    // ---- Développer
    const fait = await agent(`${socle(l.chaine)}

${GATES[l.chaine]}

TA MISSION — LIVRER LE LOT ${l.cle} EN TDD, SUR SA BRANCHE ${branche}, SQUELETTE POUSSÉ DANS LES QUINZE MINUTES.

LE LOT : ${l.titre}${num ? ` (issue #${num})` : ''}
CRITÈRE DE FIN : ${l.critere}
${l.flag ? `FLAG : tout se livre derrière un flag serveur ET client, OFF par défaut, liste blanche de comptes de test${FLAG_POSITION ? ' (la recette peut l allumer pour la liste blanche)' : ''}.` : ''}
INVENTAIRE (cadrage, arbre vivant) :
${listeInventaire(v.inventaire)}
${v.hors_budget && v.hors_budget.length ? `HORS BUDGET (> 1000 lignes — extraire par responsabilité AVANT d'ajouter) : ${v.hors_budget.join(', ')}` : ''}
${v.note ? `NOTE DU CADRAGE : ${v.note}` : ''}
${contrats ? `CONTRATS AMONT (livrés ce tour — fusionne leur branche si elle n'est pas encore dans origin/${BASE} : \`git fetch origin && git merge origin/<branche>\`, jamais rebase) :\n${contrats}` : ''}
${RELEVE}
ÉTAPES :
1. \`cd ${repo} && git fetch origin\` ; si \`origin/${branche}\` existe, REPRENDS-LA (\`git checkout -B ${branche} origin/${branche} && git merge origin/${BASE}\`)
   et lis ce qu'elle porte ; sinon \`git checkout -B ${branche} origin/${BASE}\`. \`git status --short\` vide. Shared bougé ⇒ rebâtis dist.
2. SPÉCIFIE dans ${SCRATCH(l.chaine)}/${l.cle}.md : le contrat consommé ou produit (fichier:ligne), ${l.chaine === 'web' || l.chaine === 'android' ? 'les fichiers Swift de référence lus (iso iOS), ' : ''}les témoins (un par ligne du critère), le découpage.
   Une question produit se tranche par la spec ; si elle n'y est pas, par le défaut le plus SÛR (fail-closed) — et se DIT.
3. RED : témoins d'abord (comportement par l'API publique, factories, aucun \`let\`/beforeEach mutant), joués, ROUGES (rends la sortie).
   Commit + \`git push -u origin ${branche}\` : c'est la réservation du lot.
4. GREEN : code MINIMAL, immutable, sans any, dans le budget (fichier ≤ 1200 lignes, fonction ≤ 80). ÉTENDS l'existant ; toute création est
   justifiée dans \`crees\`. Textes utilisateur dans les SEPT langues. Instant App : cache-first, optimistic update, aucun spinner sur cache non vide.
5. REFACTOR si utile ; gates rapides VERTS ; pousse à chaque étape verte (\`Refs #${num || 'n'}\`).
${l.chaine === 'serveur' ? '6. Rends `contrat` : types partagés, routes (méthode + chemin + corps + réponse) et événements (nom + charge) que les clients consommeront, fichier:ligne.' : '6. Ne touche pas services/gateway ni packages/shared : une capacité manquante est un BLOCAGE, pas un contournement.'}
7. Rends branche, commits, fichiers, crees, témoins (rouge PUIS vert), gates rapides, dimensions mûres/restantes, blocage.
INTERDITS : ouvrir une PR, fusionner, inventer un champ ou un événement, désactiver un témoin, contourner un gate, pousser sur ${BASE}.`,
      { label: `developper:${l.cle}`, phase: 'Developper', schema: FAIT, model: taille === 'petit' ? MODELE.petit : MODELE.developper, effort: taille === 'petit' ? 'medium' : 'high' })
    if (!fait) return { cle: l.cle, issue: num, arret: 'développement sans rapport' }
    log(`${l.cle} : développé sur ${fait.branche || branche} — ${fait.pousse ? 'poussé' : 'NON poussé'}${fait.blocage ? ` — blocage : ${fait.blocage.slice(0, 160)}` : ''}`)
    if (fait.blocage && !fait.pousse) return { cle: l.cle, issue: num, fait, arret: 'blocage' }
    const br = fait.branche || branche

    // ---- Revue-correction (opus)
    const revue = await agent(`${socle(l.chaine)}

${GATES[l.chaine]}

TA MISSION — RELIRE LE LOT ${l.cle} SUR ${br} ET LE CORRIGER TOI-MÊME (bloquant et majeur : tu répares, tu rejoues les gates, tu commites \`Refs #${num || 'n'}\`, tu pousses).
Ne rends « restants » que ce qui demande un arbitrage.
LE LOT : ${l.titre} — CRITÈRE : ${l.critere}
\`cd ${repo} && git checkout ${br} && git diff --stat origin/${BASE}...HEAD\`
RAPPORT DU DÉVELOPPEUR : ${court(fait, 4000)}
INVENTAIRE DU CADRAGE :
${listeInventaire(v.inventaire)}

RELIS, dans cet ordre :
1. RECRÉATION : chaque fichier, modèle, route, événement ou écran NOUVEAU — l'existant le couvrait-il ? Une recréation injustifiée ou une jumelle
   divergente est BLOQUANTE : fusionne-la dans l'existant toi-même (recreations_refusees).
2. LE CRITÈRE ligne à ligne : un témoin par ligne, qui a été ROUGE, qui interroge le COMPORTEMENT (pas la source).
3. LA LOI : chaque décision d'accès passe-t-elle par resolveRelationAccess (ou son miroir) ? Aucune boucle de niveaux réécrite ; niveau effectif = minimum
   des deux sens ; blocage ⇒ rien ; Sang / position / Bring ouverts à tous les âges SEULEMENT derrière un consentement explicite et refusable
   (requiresConsent) ; la Connaissance automatique ne naît pas entre un mineur et un majeur inconnu.
4. « QU'EST-CE QUI PART À CÔTÉ ? » : un champ voisin (lastActiveAt, titre d'écoute, coordonnées, colonnes de ligne par include) échappe-t-il à la garde ?
   Un Ami reçoit-il un octet de plus que « en ligne » ? Un Proche un titre ? « QUI AFFICHE ce qui est résolu ? » — la valeur atteint-elle un pixel ?
5. RÉTROCOMPATIBILITÉ : un ancien client contre ce serveur (valeur d'enum inconnue, champ absent, événement nouveau) ; rien de retiré.
6. FORME : TDD, sans any, immutabilité, budget, sept langues, iso iOS (web/android), protocole avant service et injection par init (iOS), aucun
   @ObservedObject sur singleton global dans une feuille.
7. LES GATES : rejoue rapides et complets ; rends les SORTIES tronquées.`,
      { label: `revue:${l.cle}`, phase: 'Revue', schema: REVUE, model: MODELE.relire, effort: 'high' })
    if (revue) log(`${l.cle} : revue ${revue.verdict} — ${revue.defauts_trouves.length} défauts, ${revue.corriges} corrigés, ${revue.restants.length} restants`)

    // ---- Auditeur adversarial (lots sensibles et leurs sous-lots)
    const sensible = l.sensible || (estSousLot(l) && taille !== 'petit' && LOTS_PAR_DEFAUT.some((x) => x.cle === l.issueDe && x.sensible))
    let audit = null
    if (sensible) {
      audit = await agent(`${socle(l.chaine)}

TA MISSION — CASSER LE LOT ${l.cle} (branche ${br}) AVANT SA FUSION. Tu ne l'approuves pas : tu cherches la fuite, le contournement, la régression.
LE LOT : ${l.titre} — CRITÈRE : ${l.critere}
\`cd ${repo} && git fetch origin && git checkout ${br} && git diff origin/${BASE}...HEAD\`
Angles obligatoires : (a) un viewer de niveau inférieur obtient-il une donnée d'un niveau supérieur, par la charge, un champ voisin, une sélection, un tri,
un compteur, une erreur différenciée ou un temps de réponse ? (b) le sens unique : A accorde Sang, B accorde Ami — A voit-il plus que Ami ? (c) blocage,
baisse et refus : coupent-ils IMMÉDIATEMENT (sockets ouvertes, caches, pushes en vol) et restent-ils silencieux ? (d) consentement : Sang, position, Bring (ouverts à tous les âges) s'activent-ils SANS consentement explicite ou après un refus ? la Connaissance automatique naît-elle entre un mineur et un majeur inconnu ?
(e) migration / backfill : idempotent, rejouable, sans rétrogradation, sans perte ? (f) E2EE : quelque chose lit-il le clair d'une conversation chiffrée ?
(g) rate limit et abus (talkie, Bring, demandes répétées, cool-down contourné par un second appareil).
Chaque constat porte sa PREUVE (un témoin rouge que tu écris et pousses sur la branche, ou fichier:ligne + scénario). Rends verdict, défauts, restants.`,
        { label: `audit:${l.cle}`, phase: 'Revue', schema: REVUE, model: MODELE.relire, effort: 'high', agentType: 'auditeur-adversarial' })
      if (audit) log(`${l.cle} : audit adversarial ${audit.verdict} — ${audit.defauts_trouves.length} constats`)
      const aCorriger = audit ? audit.defauts_trouves.filter((d) => d.gravite !== 'mineur') : []
      if (aCorriger.length) {
        const correction = await agent(`${socle(l.chaine)}

${GATES[l.chaine]}

TA MISSION — CORRIGER EN TDD LES CONSTATS DE L'AUDIT ADVERSARIAL DU LOT ${l.cle} (branche ${br}) : pour chacun, le témoin rouge (le sien s'il l'a poussé),
le correctif minimal, les gates, un commit \`fix(...)\` \`Refs #${num || 'n'}\`, push. Un constat qui exige un arbitrage produit reste dans restants.
CONSTATS : ${court(aCorriger, 5000)}`,
          { label: `corriger-audit:${l.cle}`, phase: 'Revue', schema: REVUE, model: MODELE.relire, effort: 'high' })
        if (correction) { audit = { ...audit, restants: correction.restants, corriges: correction.corriges }; log(`${l.cle} : audit corrigé — ${correction.corriges} corrigés, ${correction.restants.length} restants`) }
      }
    }
    const restants = [...(revue && revue.restants ? revue.restants : []), ...(audit && audit.restants ? audit.restants : [])].filter((d) => d.gravite !== 'mineur')
    const bloquantRestant = restants.some((d) => d.gravite === 'bloquant')

    // ---- Livrer
    const livraison = await agent(`${socle(l.chaine)}

${GATES[l.chaine]}

TA MISSION — LIVRER LE LOT ${l.cle} PAR UNE PR VERS \`${BASE}\`${AUTO_MERGE && !bloquantRestant ? ', FUSIONNÉE PAR TOI AU VERT DE SES CHECKS' : ' — PR OUVERTE, NON FUSIONNÉE'}.
LE LOT : ${l.titre}${num ? ` (issue #${num})` : ''} — BRANCHE ${br}
REVUE : ${revue ? revue.verdict : '(aucune)'}${audit ? ` ; AUDIT : ${audit.verdict}` : ''} — ${restants.length} défauts non mineurs restants${bloquantRestant ? ' DONT UN BLOQUANT : la PR reste ouverte, titre préfixé « [bloqué] »' : ''}.
${restants.length ? `RESTANTS (dits dans la PR) :\n${court(restants, 2000)}` : ''}
1. \`cd ${repo} && git checkout ${br} && git fetch origin ${BASE}\` ; ${BASE} a avancé ⇒ \`git merge origin/${BASE}\` (jamais rebase), garde les DEUX apports.
2. GATES COMPLETS de la plateforme. Rouge causé par le lot ⇒ corrige (TDD). Rouge préexistant ⇒ prouvé par le run CI de ${BASE}, dit dans la PR.
3. \`git status --short\` sans artefact. Commit final : ${freres.length ? `l'issue #${num || 'n'} porte aussi les lots ${freres.join(', ')} — \`Closes #${num || 'n'}\` SEULEMENT si leurs PR sont toutes fusionnées (\`gh api "repos/${GH}/pulls?state=closed&per_page=50" --jq '.[] | select(.merged_at) | .head.ref' | grep lot/\`), sinon \`Refs #${num || 'n'}\`` : `\`Closes #${num || 'n'}\` si la revue n'est pas « a-refaire » (sinon wip + Refs, et dis pourquoi)`}${l.chaine === 'ios' ? ' — le SUJET du commit de TÊTE porte « run test » (sinon commit vide `test(ios): … — run test`)' : ''}.
4. \`git push -u origin ${br}\` (4 essais réseau ; non fast-forward ⇒ fetch + merge, jamais rebase).
5. LA PR (REST, voir GITHUB) : corps = ce qui était absent ; l'INVENTAIRE (étendu / modifié / non touché / créé et pourquoi) ; ce qui est livré fichier par
   fichier ; routes et événements (fichier:ligne) ; témoins ; gates et chiffres ; rouge préexistant ; le même \`Closes\`/\`Refs\` que le commit ;
   dimensions mûres / restantes ; puis la ligne d'attribution des PR.
   ${AUTO_MERGE && !bloquantRestant ? `Puis ATTENDS LE VERT (verdict CI, voir GITHUB) et fusionne par \`gh api -X PUT repos/${GH}/pulls/<n>/merge -f merge_method=merge\` ; un rouge causé par le lot se corrige puis on recommence (une fois) ; un rouge préexistant se dit et n'empêche pas ; pas de vert dans le délai ⇒ PR ouverte, dis-le.` : 'NE FUSIONNE PAS.'}
${l.chaine === 'android' ? "   Android : le vert d'android.yml (assembleDebug + testDebugUnitTest) est EXIGÉ — sans lui, pas de fusion, même si les autres checks sont verts." : ''}
${l.chaine === 'ios' ? '   iOS : un vert ne compte que si la tête porte « run test » et que le job de tests MeeshyTests a tourné.' : ''}
6. Commentaire sur l'issue #${num || 'n'} : PR, preuves, inventaire retenu, dimensions MÛRES / RESTANTES, et UNE issue par dimension non mûre (milestone ${MILESTONE})
   si elle n'existe pas (rends leurs numéros dans issues_de_suivi).`,
      { label: `livrer:${l.cle}`, phase: 'Livrer', schema: LIVRAISON, model: MODELE.livrer, effort: 'medium' })
    if (livraison) log(`${l.cle} : ${livraison.pousse ? 'livré' : 'NON livré'}${livraison.pr_numero ? ` — PR #${livraison.pr_numero}${livraison.fusionnee ? ' fusionnée' : ' ouverte'}` : ''}`)
    return { cle: l.cle, issue: num, branche: br, contrat: fait.contrat, fait: { pousse: fait.pousse, crees: fait.crees, temoins: fait.temoins, dimensions_mures: fait.dimensions_mures, dimensions_restantes: fait.dimensions_restantes, blocage: fait.blocage }, revue: revue && { verdict: revue.verdict, trouves: revue.defauts_trouves.length, corriges: revue.corriges, recreations_refusees: revue.recreations_refusees }, audit: audit && { verdict: audit.verdict, trouves: audit.defauts_trouves.length, restants: (audit.restants || []).length }, restants, livraison }
  }

  const ordonne = (lots) => {
    const reste = [...lots]; const ordre = []; const places = new Set()
    let garde = 0
    while (reste.length && garde < 80) {
      garde += 1
      const i = reste.findIndex((l) => (l.depend || []).every((d) => places.has(d) || !lots.some((x) => x.cle === d)))
      const l = i >= 0 ? reste.splice(i, 1)[0] : reste.shift()
      ordre.push(l); places.add(l.cle)
    }
    return ordre
  }
  const chaines = CHAINES.map((c) => ordonne(aFaire.filter((l) => l.chaine === c))).filter((lots) => lots.length)
  log(`chaînes : ${chaines.map((lots) => `${lots[0].chaine} (${lots.map((l) => l.cle).join(' → ')})`).join(' ‖ ')}`)

  const parChaine = await parallel(chaines.map((lots) => async () => {
    const faits = []
    for (const l of lots) {
      let r
      try {
        r = await developperLot(l)
      } catch (e) {
        log(`${l.cle} : ÉCHEC d'un agent (${String(e && e.message ? e.message : e).slice(0, 160)}) — le lot repart au tour suivant`)
        r = { cle: l.cle, issue: numeros[cleIssue(l)] || 0, arret: 'échec agent' }
      }
      const livre = !!(r && r.livraison && r.livraison.pousse && r.livraison.pr_numero)
      signaler[l.cle]({ livre, contrat: r && r.contrat, branche: r && r.branche, pr: r && r.livraison && r.livraison.pr_numero })
      faits.push(r)
    }
    return faits
  }))
  const livres = parChaine.filter(Boolean).flat().filter(Boolean)
  log(`tour ${tour} : ${livres.filter((r) => r.livraison && r.livraison.pousse).length}/${aFaire.length} lots livrés (PR ouvertes ou fusionnées)${enPr.length ? ` ; ${enPr.length} PR d'un tour précédent : ${enPr.map((l) => `#${verdicts.get(l.cle).pr_numero}`).join(', ')}` : ''}`)

  // -------------------------------------------------------------------------
  phase('Valider')
  // -------------------------------------------------------------------------
  let validation = null
  const reelsDuTour = lotsDuTour.filter((l) => l.jalon === 2)
  if (!VALIDER) log('Valider : désactivée (valider: false)')
  if (VALIDER) {
    validation = await agent(`${socle('web')}

TA MISSION — VALIDER LE TOUR SUR STAGING ET PRÉPARER LA RECETTE RÉELLE. Tu ne codes pas : tu MESURES ; chaque échec devient un lot (forme des lots du script).
LES PR DU TOUR :
${livres.map((r) => `- ${r.cle}${r.issue ? ` (#${r.issue})` : ''} : ${r.livraison && r.livraison.pr_url ? r.livraison.pr_url : '(pas de PR)'} — ${r.livraison && r.livraison.fusionnee ? 'fusionnée' : 'non fusionnée'}`).join('\n') || '(aucune)'}

A. STAGING : \`curl -sS -m 10 https://gate.staging.meeshy.me/api/v1/health\`. Un refus du proxy (CONNECT 403) ⇒ toutes les étapes staging sont non-jouee
   (« staging injoignable depuis ${POSTE} ») — dis-le et passe à C. Sinon attends le déploiement de la tête de ${BASE}
   (\`gh api "repos/${GH}/actions/runs?branch=${BASE}&per_page=5"\`, docker.yml) et lis le sha servi (route de version du gateway) → staging_sha.
B. SCÉNARIO À DEUX COMPTES (A = compte Demo de ${REPO_PRINCIPAL}/apps/ios/fastlane/.env, jamais imprimé ; B = un compte de recette dont les identifiants
   vivent dans ${RECETTE}/comptes.env, hors dépôt). ${POSTE === 'mac' ? `Web : Chrome (mcp__claude-in-chrome__*, nouvel onglet ; repli Chromium Playwright). iOS : simulateur NATIF ${SIM_NATIVE}, app bâtie à la tête de ${BASE}, pointée sur staging (\`defaults write me.meeshy.app meeshy_selected_environment -string gate.staging.meeshy.me\`).` : 'Poste cloud : API seulement (curl), aucun navigateur ni simulateur.'}
   Étapes, selon ce qui est fusionné (une étape dont le lot n'est pas fusionné est non-jouee) :
   1. niveaux : A et B amis ⇒ GET du lien rend FRIEND des deux côtés ; demande Proche sans éligibilité ⇒ refus serveur ; saut Connaissance → Proche ⇒ refus.
   2. présence : B en ligne ⇒ A (Ami) reçoit online:true sans lastActiveAt (charge brute de l'API ET de presence:snapshot) ; B hors ligne ⇒ RIEN (ni « vu il y a »).
   3. notifications : B publie un post ⇒ A (Ami) n'est PAS notifié ; seuils staging abaissés pour rendre A Proche ⇒ A est notifié.
   4. jeu : A (Ami) voit niveau, nomination, rang de B, jamais étincelles ni gloire.
   5. audiences : B publie en CLOSE ⇒ A (Ami) ne le voit pas ; en FRIENDS ⇒ il le voit.
   6. régression : aucune erreur console web, aucun crash iOS.
C. RECETTE RÉELLE (écoute, talkie, Bring, position — deux téléphones personnels) ${reelsDuTour.length ? '— des lots du jalon 2 sont dans ce tour' : '— aucun lot du jalon 2 ce tour : ne publie rien, rends recette_reelle_publiee=false'} :
   ${reelsDuTour.length ? `publie UNE fois (sauf si déjà publiée) en commentaire de l'issue ${numeros['sang-recette-reelle'] ? `#${numeros['sang-recette-reelle']}` : '« sang-recette-reelle » (retrouve-la dans le milestone ' + MILESTONE + ')'} le tableau de l'onglet « Tests talkie » du classeur (TK-01…TK-18) ÉTENDU à l'écoute (Proche : catégorie seule ; Sang : titre + origine ; iOS : ce qui n'est pas lisible est dit) et au Bring (autorisé / non autorisé, 3/h, heures calmes, arrêt d'un geste), colonnes iOS · Android · Résultat vides. Puis LIS les commentaires suivants du porteur : rends retour_porteur ; chaque KO devient un lot ; JAMAIS tu ne coches une ligne toi-même — une ligne sans retour est attend-le-porteur.` : ''}
D. Rends acceptable (true seulement si TOUT ce qui est jouable passe et que la recette réelle, si elle est due, est rendue OK par le porteur), étapes, défauts.`,
      { label: `valider:tour-${tour}`, phase: 'Valider', schema: VALIDATION, model: MODELE.valider, effort: 'high' })
    if (validation) log(`validation : ${validation.acceptable ? 'ACCEPTABLE' : 'NON acceptable'} — ${validation.etapes.filter((e) => e.resultat === 'passe').length}/${validation.etapes.length} étapes passent, ${validation.defauts.length} défauts → lots${validation.recette_reelle_publiee ? ' ; recette réelle publiée, en attente du porteur' : ''}`)
  }

  resultats.push({ tour, synchro: { sha_dev: synchro.sha_dev, ci_dev: synchro.ci_dev, tenus: TENUS }, cadrage: { a_faire: aFaire.map((l) => l.cle), en_pr: enPr.map((l) => l.cle), bloques: bloques.map((l) => l.cle), collisions: cadrage && cadrage.collisions, inventaires: Object.fromEntries([...verdicts.entries()].map(([k, v]) => [k, v.inventaire])) }, issues: { ...numeros }, lots: livres, validation })

  const nonLivres = aFaire.filter((l) => { const r = livres.find((x) => x.cle === l.cle); return !r || !r.livraison || !r.livraison.fusionnee })
  const defauts = validation && Array.isArray(validation.defauts) ? validation.defauts.map((d) => ({ ...d, depend: d.depend || [] })) : []
  lotsDuTour = [...nonLivres, ...defauts]
  if (validation && validation.acceptable && !nonLivres.length) { log('=== ÉTAT ACCEPTABLE ATTEINT ==='); break }
}

// ---------------------------------------------------------------------------
phase('Conformite')
// ---------------------------------------------------------------------------
// Toujours avant une promotion ; sinon dès qu'un lot du jalon 2 a été touché. Elle ne se contourne pas.
let conformite = null
const toucheJalon2 = resultats.some((r) => (r.lots || []).some((l) => /ecoute|talkie|bring|position/.test(l.cle)))
if (LIVRER_MAIN || toucheJalon2 || (CLES_DEMANDEES && CLES_DEMANDEES.has('conformite-cercles'))) {
  conformite = await agent(`${socle('serveur')}

TA MISSION — L'ANALYSE DE CONFORMITÉ DES CERCLES, AVANT TOUTE PROMOTION EN PRODUCTION (§ 1.8 de la spec). Tu es l'agent conformite-juridique :
une analyse sourcée, pas un avis juridique — et tu DIS ce qui exige un avis signé.
1. Branche \`lot/conformite-cercles-${numeros['conformite-cercles'] || 'n'}\` depuis origin/${BASE} dans ${REPO.serveur}.
2. Écris docs/conformite/2026-10-31-cercles-et-mode-sang-aipd.md : analyse d'impact RGPD (art. 35) sur la position continue, l'historique 30 j,
   l'alerte de proximité, ce qu'on écoute/regarde, le talkie hors E2EE, le Bring, les mineurs (art. 8, Age Appropriate Design Code) ; base légale
   par traitement ; durées de conservation ; écrans de consentement feature par feature (textes en français à traduire) ; mise à jour de la
   politique de confidentialité (diff proposé) ; exigences des stores (App Store : Critical Alerts, PushToTalk, localisation « Toujours » ;
   Google Play : ACCESS_BACKGROUND_LOCATION, NotificationListenerService, types de service au premier plan) ; ce qui exige un avis juridique signé.
3. PR vers ${BASE} (REST), commentaire sur l'issue conformite-cercles${numeros['conformite-cercles'] ? ` #${numeros['conformite-cercles']}` : ''}. Ne fusionne pas.
Rends rendue, chemin, pr_numero, bloque_production (true tant qu'un point exige une décision ou un avis signé), avis_signe_requis.
BILAN DES TOURS : ${court(resultats.map((r) => ({ tour: r.tour, lots: (r.lots || []).map((l) => l.cle) })), 2000)}`,
    { label: 'conformite', phase: 'Conformite', schema: CONFORMITE, model: MODELE.conformite, effort: 'high', agentType: 'conformite-juridique' })
  if (conformite) log(`conformité : ${conformite.rendue ? 'rendue' : 'NON rendue'} — production ${conformite.bloque_production ? 'BLOQUÉE' : 'non bloquée'}${conformite.avis_signe_requis && conformite.avis_signe_requis.length ? ` ; avis signé requis : ${conformite.avis_signe_requis.join(', ')}` : ''}`)
} else {
  log('Conformité : rien du jalon 2 touché et aucune promotion demandée — non jouée ce tour')
}

// ---------------------------------------------------------------------------
phase('Livrer final')
// ---------------------------------------------------------------------------
let final = null
if (LIVRER_MAIN && conformite && conformite.rendue && !conformite.bloque_production) {
  final = await agent(`${socle('serveur')}

TA MISSION — PROMOUVOIR LE CODE EN PRODUCTION sur feu vert EXPLICITE du porteur (livrer_main=true), conformité rendue et non bloquante.
1. ${BASE} VERT à sa tête (\`gh api "repos/${GH}/actions/runs?branch=${BASE}&per_page=8"\`) ; recette staging passée ; retour arrière prêt (dis lequel).
2. PR ${BASE} → main (REST), corps = bilan (lots, PR, recette, conformité) ; vert ⇒ fusion par \`gh api -X PUT …/merge -f merge_method=merge\`.
3. AUCUNE migration ni backfill de production : ils attendent un feu vert DISTINCT du porteur, précédé d'une sauvegarde vérifiée — dis-le dans la PR.
Rends fait, main_sha, rapport.
BILAN : ${court(resultats.map((r) => ({ tour: r.tour, lots: (r.lots || []).map((l) => ({ cle: l.cle, pr: l.livraison && l.livraison.pr_numero })), acceptable: r.validation && r.validation.acceptable })), 5000)}`,
    { label: 'livrer-final', phase: 'Livrer final', schema: FINAL, model: MODELE.final, effort: 'high' })
} else {
  log(`Livraison finale : EN ATTENTE — ${LIVRER_MAIN ? 'conformité non rendue ou bloquante' : 'feu vert du porteur requis (livrer_main: true)'}`)
}

return { tours: resultats, conformite, final, issues: numeros, lots_restants: lotsDuTour.map((l) => l.cle), hors_chaine: LOTS_HORS_CHAINE.map((l) => l.cle) }
