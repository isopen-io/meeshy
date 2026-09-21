export const meta = {
  name: 'meeshy-lecture-et-accuses',
  description:
    'Lecture / non-lecture (notifications, conversations, messages, separateur « messages non lus » en couleur primaire) et accuses + progression media (emis, recu, vu, ouvertures, audio/video lus jusqu ou) — sur iOS ET web-v2, trois chaines paralleles (gateway, web-v2, iOS) en lots TDD, revue-correction opus, PR auto-merge vers dev, validation a deux comptes sur staging (Chrome + simulateur), en boucle jusqu a un etat acceptable — sonnet DEVELOPPE, haiku fait le MECANIQUE, opus RELIT, CORRIGE, VALIDE et LIVRE',
  whenToUse:
    "Lancer un tour du chantier « lecture et accuses » (directive porteur 2026-09-21, spec docs/superpowers/specs/2026-09-21-lecture-et-accuses-design.md). Args : { repo_web, repo_gw, repo_ios, repo_principal, base, date, attribution, tours, lots, sauter, sim_native, sim_coque, valider, livrer_main, modeles }.",
  phases: [
    { title: 'Synchroniser', detail: 'fetch origin/dev dans les trois worktrees de chaine, releve de ce que les autres sessions tiennent', model: 'sonnet' },
    { title: 'Cadrer', detail: 'chaque lot verifie contre l arbre VIVANT : deja livre, tenu ailleurs, ou a faire', model: 'sonnet' },
    { title: 'Ouvrir', detail: 'une issue par lot (ou l existante), milestones, projet In Progress, decision D-L1 posee sur #7001', model: 'haiku' },
    { title: 'Developper', detail: 'par chaine, lot apres lot : specification + TDD sur lot/<cle> depuis origin/dev, squelette pousse tot', model: 'sonnet' },
    { title: 'Revue', detail: 'opus relit le diff du lot, CORRIGE lui-meme, rejoue les gates', model: 'opus' },
    { title: 'Livrer', detail: 'gates de la plateforme, commit Closes #n, PR vers dev + auto-merge, commentaire de cloture', model: 'sonnet' },
    { title: 'Valider', detail: 'staging deploye ; scenario a deux comptes : Chrome sur staging.meeshy.me + simulateur natif sur gate.staging ; chaque echec devient un lot', model: 'opus' },
    { title: 'Livrer final', detail: 'sur feu vert du porteur seulement (livrer_main=true) : dev -> main -> Xcode Cloud', model: 'opus' },
  ],
}

// ---------------------------------------------------------------------------
// PARAMETRES
// ---------------------------------------------------------------------------

const A = args && typeof args === 'object' ? args : {}
const REPO_WEB = typeof A.repo_web === 'string' && A.repo_web ? A.repo_web : '/Users/smpceo/Documents/v2_meeshy-lecture'
const REPO_GW = typeof A.repo_gw === 'string' && A.repo_gw ? A.repo_gw : '/Users/smpceo/Documents/v2_meeshy-lecture-gw'
const REPO_IOS = typeof A.repo_ios === 'string' && A.repo_ios ? A.repo_ios : '/Users/smpceo/Documents/v2_meeshy-lecture-ios'
const REPO_PAR_CHAINE = { web: REPO_WEB, gateway: REPO_GW, ios: REPO_IOS }
const BASE = typeof A.base === 'string' && A.base ? A.base : 'dev'
const DATE = typeof A.date === 'string' ? A.date : '(date non fournie — la lire avec `date -I`)'
const ATTRIBUTION = typeof A.attribution === 'string' && A.attribution ? A.attribution : 'Co-Authored-By: Claude <noreply@anthropic.com>'
const TOURS = Number.isInteger(A.tours) && A.tours > 0 ? A.tours : 2
const VALIDER = A.valider !== false
const LIVRER_MAIN = A.livrer_main === true
// `auto_merge: false` : les PR s'ouvrent mais n'arment PAS l'auto-merge — une session voisine tient le
// verdict de dev et demande que sa tête ne bouge pas avant son dev→main (2026-09-21). Sans auto-merge, la
// recette staging n'a rien à mesurer : la phase Valider est sautée et se rejoue au tour suivant.
const AUTO_MERGE = A.auto_merge !== false
const SAUTER = new Set(Array.isArray(A.sauter) ? A.sauter : [])
// Simulateurs : le NATIF de reference (l'app apps/ios) et la COQUE Capacitor de web-v2 — deux
// appareils, jamais un seul (meme bundle id me.meeshy.app, installer l'un remplace l'autre).
// JAMAIS Meeshy-iOS26 (C295B364…) : c'est le simulateur du porteur, pilote par lui en meme temps.
const SIM_NATIVE = typeof A.sim_native === 'string' && A.sim_native ? A.sim_native : '171765AF-36FD-45B1-9B9D-570E24C72E11'
const SIM_COQUE = typeof A.sim_coque === 'string' && A.sim_coque ? A.sim_coque : '138B8B8D-0B3B-44E5-98B0-B62723B884BC'
const SCRATCH = `${REPO_WEB}/.cache/lecture-workflow` // .cache est gitignore
// La spec et ce script vivent sur feat/lecture-et-accuses, dans un worktree qui NE CHANGE JAMAIS de branche.
// Le clone principal : seul détenteur des fichiers gitignorés (comptes de recette). On y LIT, jamais on n'y écrit.
const REPO_PRINCIPAL = typeof A.repo_principal === 'string' && A.repo_principal ? A.repo_principal : '/Users/smpceo/Documents/v2_meeshy'
const REPO_SPEC = typeof A.repo_spec === 'string' && A.repo_spec ? A.repo_spec : '/Users/smpceo/Documents/v2_meeshy-lecture-spec'
const SPEC = `${REPO_SPEC}/docs/superpowers/specs/2026-09-21-lecture-et-accuses-design.md`

// LE BON MODELE AU BON MOMENT (directive porteur 2026-09-21 : fable orchestre seulement ;
// sonnet/haiku developpent ; opus relit, corrige, valide et livre en fin).
const M0 = A.modeles && typeof A.modeles === 'object' ? A.modeles : {}
const MODELE = {
  developper: typeof M0.developper === 'string' ? M0.developper : 'sonnet',
  petit: typeof M0.petit === 'string' ? M0.petit : 'haiku',
  mecanique: typeof M0.mecanique === 'string' ? M0.mecanique : 'haiku',
  relire: typeof M0.relire === 'string' ? M0.relire : 'opus',
  livrer: typeof M0.livrer === 'string' ? M0.livrer : 'sonnet',
  valider: typeof M0.valider === 'string' ? M0.valider : 'opus',
  final: typeof M0.final === 'string' ? M0.final : 'opus',
}

// ---------------------------------------------------------------------------
// LES LOTS — la spec § 4. `lots` dans les args remplace la liste ; `sauter` en retire.
// ---------------------------------------------------------------------------

const LOTS_PAR_DEFAUT = [
  { cle: 'G1', chaine: 'gateway', famille: 'A', taille: 'developper',
    titre: 'La frontière de lecture (lastReadMessageId, lastReadAt, lastReadMessageCreatedAt) est servie aux clients par la liste et le détail de conversation',
    critere: "GET /api/v1/conversations et GET /api/v1/conversations/:id rendent, pour le lecteur, lastReadMessageId / lastReadAt / lastReadMessageCreatedAt du ConversationReadCursor ; un témoin gateway écrit AVANT rougit sans le producteur et verdit avec ; le contrat packages/shared/types/conversation.ts:606 est enfin PRODUIT",
    existe: 'ConversationReadCursor (schema.prisma ~l.1414) ; core-list.ts et core-detail.ts ne sélectionnent pas ces champs ; mark-unread les écrit (conversations/messages-read-status.ts ~l.274)',
    depend: [] },
  { cle: 'S1', chaine: 'gateway', famille: 'A', taille: 'developper',
    titre: 'La loi du premier message non lu est UNE fonction partagée, avec son miroir Swift',
    critere: "packages/shared/utils/first-unread.ts exporte firstUnreadBoundary({ messages, lastReadMessageId, lastReadAt, lastReadMessageCreatedAt, viewerId }) → { firstUnreadId, unreadCount } | null (jamais un message du lecteur, jamais avant la frontière, null si tout est lu) avec ses témoins vitest ; MeeshySDK porte FirstUnreadBoundary.resolve(...) avec les MÊMES cas en XCTest/Swift Testing ; les deux fichiers se citent l'un l'autre",
    existe: 'rien ; iOS ConversationView.swift ~l.1869 calcule un faux firstUnread (premier message d autrui)',
    depend: ['G1'] },
  { cle: 'G2', chaine: 'gateway', famille: 'A', taille: 'developper',
    titre: 'Un seul calcul du non-lu alimente la liste des conversations et le push temps réel',
    critere: "getUnreadCountsForUser et getUnreadCountsForParticipants (MessageReadStatusService.ts ~l.329 et ~l.488) partagent UNE implémentation ; un témoin de PARITÉ nourrit les deux chemins avec la même base et exige le même compte ; aucune route ni événement ne change de forme",
    existe: 'deux implémentations, doc-comment MessageReadStatusService.ts ~l.321-324 qui assume la divergence',
    depend: [] },
  { cle: 'G3', chaine: 'gateway', famille: 'A', taille: 'developper', issue: 7001,
    titre: "Le badge poussé (aps.badge / FCM) compte les conversations non lues, comme l'app — décision D-L1",
    critere: "NotificationService (les deux sites : création ~l.1037 et renvoi après révocation ~l.4302) calcule le badge depuis ConversationReadCursor.unreadCount > 0 du destinataire, conversations muettes exclues — la MÊME projection que NotificationCoordinator.conversationUnreadTotal sur iOS ; témoin : une demande d'ami n'incrémente pas le badge, un message non lu oui ; notification:counts garde le compte de la CLOCHE ; commentaire sur #7001 avec la décision",
    existe: 'aps.badge = prisma.notification.count(unreadOnly) ; pont best-effort syncConversationNotifications ~l.1116',
    depend: [] },
  { cle: 'W1', chaine: 'web', famille: 'A', taille: 'developper',
    titre: 'Ouvrir un fil, le faire défiler et revenir au premier plan marquent la conversation lue',
    critere: "à l'ouverture d'un thread, quand le dernier message devient visible (IntersectionObserver) et au retour de visibilité (visibilitychange/focus) : POST /api/v1/conversations/:id/receipts { type:'read', caughtUpToMessageId } (routes/conversations/receipts.ts) en OPTIMISTE (store puis réseau, rollback sur refus), dédupliqué (un seul envoi par frontière atteinte), jamais quand la fenêtre est cachée ; la pastille de la Lentille redescend sans geste ; témoins bun test",
    existe: 'marquage manuel seul : conversation-actions.ts pushRead ; unread-below.ts (session) ; aucun conversation:join émis',
    depend: [] },
  { cle: 'W2', chaine: 'web', famille: 'B', taille: 'developper',
    titre: 'Les coches ✓✓ d\'un message envoyé bougent en direct quand le destinataire reçoit ou lit',
    critere: "socket.ts écoute read-status:updated (summary : totalMembers/receivedCount/readCount/deliveredToAllAt/readByAllAt) et message:pending-delivered avec leurs charges RÉELLES (socketio/broadcastReadStatus.ts) ; une fonction pure applique la charge au cache TanStack du fil (view/message.ts dérive Delivery) ; tous-ou-rien en groupe conservé ; témoins bun test sur la fonction pure ET le branchement",
    existe: 'rendu OK (message-blocks.tsx CHECKS, view/message.ts) ; zéro écoute de READ_STATUS_UPDATED',
    depend: [] },
  { cle: 'W4', chaine: 'web', famille: 'A', taille: 'petit',
    titre: 'Le titre d\'onglet et le badge PWA portent le nombre de conversations non lues',
    critere: "document.title préfixé « (N) » et navigator.setAppBadge(N) / clearAppBadge() quand N = conversations non lues (hors muettes) — D-L1, jamais les notifications ; dérivé du cache des conversations, mis à jour sur conversation:unread-updated ; try/catch sur setAppBadge absent ; témoins",
    existe: 'zéro setAppBadge, zéro document.title dynamique',
    depend: [] },
  { cle: 'W5', chaine: 'web', famille: 'B', taille: 'petit',
    titre: 'Ouvrir un message à vue unique le dit au serveur — un rechargement ne le rouvre plus',
    critere: "thread.tsx appelle consumeViewOnce (lib/api/view-once.ts:30, POST /conversations/:id/messages/:messageId/consume) au moment de la révélation, en optimiste avec l'application locale existante (applyConsumption) ; sur refus réseau, l'état local est rétabli ; témoin",
    existe: 'port écrit jamais appelé ; contournement documenté thread.tsx ~l.160-193',
    depend: [] },
  { cle: 'W6', chaine: 'web', famille: 'B', taille: 'developper',
    titre: 'Un audio ou une vidéo reprend là où on l\'avait laissé et rapporte jusqu\'où on l\'a lu',
    critere: "use-media-playback / attachment-blocks : au montage, seek(currentUserConsumption.lastPlayPositionMs) si non complet ; pendant la lecture, POST /api/v1/attachments/:id/status { action:'listened'|'watched', playPositionMs, durationMs, complete, stretches } (routes/messages-writes.ts ~l.588) à la pause, au seek, à la fin et au démontage, jamais plus d'une fois par 5 s ; la barre de consommation au repos reflète ce qui est rapporté ; témoins",
    existe: 'affichage lecture seule attachment-blocks.tsx ~l.112 ; aucun envoi',
    depend: [] },
  { cle: 'W7', chaine: 'web', famille: 'B', taille: 'developper',
    titre: 'La fiche « Infos du message » dit qui a reçu, qui a vu, qui a écouté ou regardé jusqu\'où, et combien de fois une pièce a été ouverte',
    critere: "depuis le menu d'un message envoyé : feuille alimentée par GET /conversations/:id/receipts?detail=people (receipts.ts ~l.600) et GET /attachments/:id/status-details (messages-reads.ts ~l.570) ; sections Reçu par / Vu par / Pas encore ; par pièce : ouvertures, téléchargements, écouté/regardé jusqu'à mm:ss (barre), « Nx » ; mise à jour sur attachment-status:updated ; disposition = iOS MessageViewsDetailView (cité) ; opt-out showReadReceipts respecté ; témoins",
    existe: 'rien sur web-v2 ; iOS MessageViewsDetailView.swift est la référence',
    depend: [] },
  { cle: 'W8', chaine: 'web', famille: 'B', taille: 'developper',
    titre: 'Les Réels apprennent ce que le Flux apprend, et les réactions, éditions et suppressions arrivent en direct',
    critere: "feed-realtime.ts et onPostLikeChanged écrivent AUSSI REELS_QUERY_ROOT (un post supprimé disparaît des Réels, un like d'autrui s'y voit) ; socket.ts écoute story:reacted/unreacted, comment:updated/deleted/liked/unliked, post:reaction-added/removed avec leurs charges réelles (SocialEventsHandler.ts) et les applique en pur aux caches concernés (détail, feed, reels, story) ; témoins par événement",
    existe: 'post:* et comment:added livrés (#7183, #7151) n écrivent que FEED_QUERY_KEY ; les autres événements ont zéro écoute',
    depend: [] },
  { cle: 'W3', chaine: 'web', famille: 'A', taille: 'developper',
    titre: 'Le fil porte « — N messages non lus — » en couleur primaire et s\'ouvre dessus',
    critere: "thread.tsx : à l'ouverture, firstUnreadBoundary (S1, depuis @meeshy/shared) place un séparateur en couleur PRIMAIRE (jeton du design system, jamais l'accent de la conversation) libellé dans les 7 langues avec pluriel ; le défilement initial se pose SUR le séparateur (D-L2 : toujours, quel que soit N) ; tout lu ⇒ ouverture en bas comme aujourd'hui ; le séparateur ne bouge pas pendant la session même quand W1 marque lu ; témoins bun test + capture des deux schémas",
    existe: 'ouverture en bas (thread.tsx ~l.593) ; scrollToBottomLabel (thread-chrome.ts) ; aucun séparateur',
    depend: ['S1', 'G1'] },
  { cle: 'I3', chaine: 'ios', famille: 'B', taille: 'developper',
    titre: 'Un vocal écouté à 80 % sur l\'iPhone reprend à 80 % sur l\'iPad — la reprise est réhydratée depuis le serveur',
    critere: "AudioPlayerView.eligibleResumePosition et restingProgress prennent, quand le store local (AudioPlaybackPositionStore / MediaConsumptionStore) n'a rien, la valeur servie currentUserConsumption.lastPlayPositionMs / listenedComplete (messages-list-query.ts ~l.551 la sert) ; le local, plus récent, garde la main ; idem vidéo ; témoins",
    existe: 'UserDefaults par appareil ; serveur reçoit tout via AttachmentStatusReporter',
    depend: [] },
  { cle: 'I4', chaine: 'ios', famille: 'A', taille: 'developper',
    titre: 'Les issues #6999 et #7000 (cloche, marquage lu instantané, retour au premier plan) sont prouvées contre le code, closes ou terminées',
    critere: "pour chacune : lire l'issue, relire NotificationConsumption.swift et NotificationCoordinator.swift, jouer les témoins existants ; si le critère de fin est tenu, commentaire de clôture avec la preuve et Closes ; sinon, terminer le manque en TDD. #6997 est TENUE par une autre session (branche claude/ios-registre-lecture-6997) — ne pas y toucher, vérifier seulement si elle est déjà dans origin/dev",
    existe: 'code cite #6999/#7000 comme implémentés (NotificationConsumption.swift ~l.118-336) ; issues encore ouvertes',
    depend: [] },
  { cle: 'I1', chaine: 'ios', famille: 'A', taille: 'developper',
    titre: 'Sur iOS, le fil porte « — N messages non lus — » en couleur primaire, s\'ouvre dessus, et « Reprendre le fil » y va vraiment',
    critere: "MessageListViewController : une cellule séparateur en couleur PRIMAIRE (MeeshyColors, jamais l'accent) libellée dans les 7 langues, posée par FirstUnreadBoundary.resolve (S1) sur la frontière servie par G1 (ou, à défaut, sur userState.lastReadAt) ; l'ouverture d'une conversation avec non-lus scrolle SUR le séparateur (D-L2), sinon en bas ; onResumeThread (ConversationView.swift ~l.1869) cible le VRAI premier non-lu ; la pastille flottante « nouveaux messages » reste ; XCTest sur la loi et sur le positionnement ; captures clair/sombre au simulateur natif",
    existe: 'pastille flottante pendingUnreadCount ; scrollToBottom à l ouverture (~l.2201) ; faux firstUnread',
    depend: ['S1', 'G1'] },
  { cle: 'I2', chaine: 'ios', famille: 'B', taille: 'petit',
    titre: 'Les ouvertures d\'une image ou d\'un document s\'affichent dans « Vu par », comme celles d\'un audio',
    critere: "MessageViewsDetailView.loadAttachmentStatuses (~l.963) ne filtre plus sur hasTimebasedTrack : image et document montrent vues / téléchargements / « Nx » depuis AttachmentService.getStatusDetails ; la carte de consommation n'affiche la barre de progression que pour les médias à piste ; témoin",
    existe: 'ImageViewerView/DocumentViewerView envoient viewed/downloaded ; jamais affiché',
    depend: [] },
  { cle: 'I5', chaine: 'ios', famille: 'A', taille: 'developper', issue: 7236,
    titre: "Le badge d'icône iOS compte les CONVERSATIONS non lues, hors muettes — le même nombre que le serveur pousse (D-L1)",
    critere: "ConversationReadLedger.swift (~l.272-281, aujourd'hui une SOMME des unreadCount) expose conversationUnreadTotal = nombre d'entrées dont unreadCount > 0 et qui ne sont pas muettes, et NotificationCoordinator.recomputeTotal / badgeTotal (~l.77) lit CE compte : app fermée (aps.badge servi par G3, PR #7289) et app au premier plan affichent le MÊME nombre ; la pastille de l'onglet Conversations peut garder la somme des messages si elle la montre déjà, mais l'ICÔNE compte des conversations ; XCTest : trois conversations dont une muette et une à 12 messages ⇒ badge 2 ; commentaire de clôture sur #7236 (décision = D-L1) avec Closes #7236",
    existe: "ConversationReadLedger.swift:272-281 somme les messages ; NotificationCoordinator.swift:77 badgeTotal ; web-v2 countUnreadConversations (use-app-badge.ts) et gateway computeConversationUnreadBadge (G3) comptent déjà des conversations",
    depend: [] },
]

const LOTS = (Array.isArray(A.lots) && A.lots.length ? A.lots : LOTS_PAR_DEFAUT).filter((l) => !SAUTER.has(l.cle))
const CHAINES = ['gateway', 'web', 'ios']

// ---------------------------------------------------------------------------
// LE SOCLE — ce que tout agent lit avant d'ecrire
// ---------------------------------------------------------------------------

const socle = (chaine) => `
TU TRAVAILLES SUR LE CHANTIER « LECTURE ET ACCUSÉS » DE MEESHY (directive porteur 2026-09-21), chaîne
${chaine.toUpperCase()}, dans le worktree ${REPO_PAR_CHAINE[chaine]}. Date : ${DATE}.

TON RÉPERTOIRE DE TRAVAIL EST ${REPO_PAR_CHAINE[chaine]} — le shell RÉINITIALISE le cwd entre deux appels
Bash : PRÉFIXE CHAQUE commande, SANS EXCEPTION, par \`cd ${REPO_PAR_CHAINE[chaine]} && \`. Le cwd de session est
un AUTRE clone du même dépôt, occupé par d'autres sessions : ce que tu y lirais est faux, ce que tu y
écrirais détruirait le travail d'un autre. Première commande de ta mission, littéralement :
\`cd ${REPO_PAR_CHAINE[chaine]} && git branch --show-current && git rev-parse --short HEAD\`.
NE CRÉE PAS de worktree, NE SUPPRIME JAMAIS un worktree (\`git worktree remove\` / \`prune\` INTERDITS — un agent
a détruit le worktree gateway de ce chantier en voulant « prouver un rouge », et deux lots ont échoué derrière
lui), NE CLONE RIEN dans /tmp, NE POUSSE JAMAIS sur \`${BASE}\` directement, et NE FUSIONNE JAMAIS une PR :
\`gh pr merge\` est INTERDIT sous TOUTES ses formes (\`--auto\`, \`--squash\`, \`--merge\`, \`--rebase\`,
\`--admin\`) pour tout agent de ce chantier${AUTO_MERGE ? ", sauf l'agent de LIVRAISON du tour, qui fusionne UNE PR au VERT de ses checks par `gh pr merge <n> --merge` — jamais `--auto`, qui fusionne sur-le-champ ici, faute de protection de branche" :' — sans exception ce tour : une session voisine tient le verdict CI de `' + BASE + '` et demande que sa tête ne bouge pas'}.
Sur ce dépôt \`--auto\` fusionne IMMÉDIATEMENT quand aucun check n'est requis : un agent l'a fait sur #7213 et
a cassé la parole donnée à cette session. Toute occurrence de \`gh pr merge\` dans ta transcription est une
FAUTE. Seul l'agent de livraison ouvre la PR (\`gh pr create\`) ; les autres poussent leur branche, c'est tout.

LA SPÉCIFICATION DU CHANTIER : ${SPEC} (chemin ABSOLU, dans un worktree qui ne change jamais de branche —
les worktrees de chaîne, eux, basculent sur des branches issues de ${BASE} où ce fichier n'existe pas) — lis-la
en entier avant d'écrire : le relevé du 2026-09-21 (§ 2), les décisions D-L1 (badge = conversations
non lues), D-L2 (ouverture SUR le séparateur, toujours), D-L3 (séparateur en couleur PRIMAIRE), les lots (§ 4).

SOURCES DE VÉRITÉ, dans cet ordre :
1. Le CODE RÉEL de la passerelle : services/gateway/src/routes/** (chemin exact préfixé /api/v1, méthode,
   schéma de corps, réponse { success, data, error (chaîne plate), pagination }), packages/shared/types/
   socketio-events/** (événements entity:action-word à tirets, charges RÉELLES lues dans les handlers
   services/gateway/src/socketio/**). Cite fichier:ligne pour CHAQUE route ou événement consommé. Un
   endpoint qui n'existe pas ne s'invente pas.
2. apps/ios et packages/MeeshySDK sont la RÉFÉRENCE de disposition, hiérarchie, états et gestes pour
   web-v2 (D-1) : un écran web-v2 se spécifie en CITANT les fichiers Swift qui font foi.
3. ${REPO_PAR_CHAINE[chaine]}/apps/web-v2/decisions.md (D-1…D-100+), services/gateway/decisions.md, apps/ios/decisions.md.
4. CLAUDE.md (injecté) : TDD non négociable, TypeScript strict sans any, immutabilité, budget 1000-1200
   lignes par fichier (un fichier déjà hors budget : extraire d'abord, ajouter ensuite), UNE source de
   vérité, Prisme Linguistique, Instant App (optimistic update, cache-first), treize dimensions.
5. tasks/lessons.md (tail -300) : le dépôt a déjà payé ces erreurs.

RÈGLES DE FORME DU DÉPÔT :
- Commits : titre en français qui dit le RÉSULTAT (\`feat(web-v2): …\`, \`fix(gateway): …\`, \`feat(ios): …\`,
  \`feat(shared): …\`), corps bref (ce qui était absent, la forme retenue), \`Closes #n\` pour l'issue du lot
  (JAMAIS \`Closes #0\`), et en fin de message EXACTEMENT :
${ATTRIBUTION}
  Pour un lot iOS, le SUJET du commit de tête porte « run test » (sinon la CI iOS d'une PR ne compile que).
  N'écris aucun nom de modèle ailleurs.
- Aucun artefact généré dans un commit (dist/, .cache/, node_modules/, Build/, DerivedData, rendu/).
- Le code est nommé en ANGLAIS (D-13) ; la prose (commentaires, commits, textes utilisateur) en français,
  les textes utilisateur dans les SEPT langues du catalogue.
- Dossier de travail hors dépôt suivi : ${SCRATCH} (spécifications, captures, journaux).
`

const GATES_PAR_CHAINE = {
  gateway: `GATES GATEWAY (${REPO_GW}) :
- rapides, à chaque étape : \`cd ${REPO_GW}/services/gateway && bunx tsc --noEmit\` et \`bun run test -- <les fichiers du périmètre>\`.
- shared, si touché : \`cd ${REPO_GW}/packages/shared && bun run type-check && bun run build && bun test\`
  (le gateway lit shared/dist : rebâtir AVANT de rejouer le gateway).
- prérequis si un import Prisma manque : \`cd ${REPO_GW}/packages/shared && npx prisma generate --generator client\`.
- avant la PR : \`cd ${REPO_GW}/services/gateway && bun run test 2>&1 | tail -30\` (complet, ~15 min ; rends
  la SORTIE tronquée, jamais un résumé). Un rouge PRÉEXISTANT (déjà rouge sur origin/${BASE}, prouvé en LISANT
  le run CI de ${BASE} : \`gh run list --branch ${BASE} --limit 5\`, \`gh run view <id> --log-failed | grep <suite>\` — JAMAIS par
  un clone ou un checkout temporaire, JAMAIS en touchant aux worktrees) n'arrête pas la livraison : il se DIT dans la PR.`,
  web: `GATES WEB-V2 (${REPO_WEB}) :
- rapides, à chaque étape : \`cd ${REPO_WEB}/apps/web-v2 && bun run type-check && bun test 2>&1 | tail -15\`.
  ATTENTION : \`bun test\` n'applique AUCUN typage — un témoin vert sans type-check ne prouve rien.
- si packages/shared est touché ou vient de bouger : \`cd ${REPO_WEB}/packages/shared && bun run build\` d'abord.
- avant la PR : \`cd ${REPO_WEB}/apps/web-v2 && bun run gate 2>&1 | tail -40\` (composite : tokens, type-check,
  test, build, ~50 check-*.mjs). Corriger, jamais contourner ; un rouge PRÉEXISTANT se prouve et se dit.
- captures : \`node scripts/capture.mjs\` selon README.md, dans ${SCRATCH}/captures/<cle>/ (clair + sombre).`,
  ios: `GATES iOS (${REPO_IOS}) :
- UN SEUL BUILD À LA FOIS sur cette machine (mémoire faible : un xcodebuild tué rend « Killed »/rc 137 —
  attendre 60 s et réessayer UNE fois ; s'il est encore tué, dis-le et laisse la CI de la PR juger, avec
  « run test » dans le sujet du commit de tête).
- build : \`cd ${REPO_IOS} && ./apps/ios/meeshy.sh build 2>&1 | tail -30\` (JAMAIS \`meeshy.sh run\`, qui bloque).
  Si project.yml a changé : \`cd ${REPO_IOS}/apps/ios && xcodegen generate\` d'abord.
- tests ciblés (la suite complète a des rouges hérités, #5599) : lis apps/ios/meeshy.sh pour la commande de
  test et ajoute \`-only-testing:<Cible>/<ClasseDeTest>\` pour les classes du lot ; SDK :
  \`cd ${REPO_IOS}/packages/MeeshySDK && swift test --filter <Nom>\`.
- captures au simulateur NATIF ${SIM_NATIVE} (jamais Meeshy-iOS26) : installer le .app bâti
  (\`xcrun simctl install ${SIM_NATIVE} <chemin .app>\`), lancer, capturer clair et sombre
  (\`xcrun simctl ui ${SIM_NATIVE} appearance dark\`) dans ${SCRATCH}/captures/<cle>/.`,
}

// ---------------------------------------------------------------------------
// SCHEMAS
// ---------------------------------------------------------------------------

const SYNCHRO = {
  type: 'object', additionalProperties: false, required: ['pret', 'etat'],
  properties: {
    pret: { type: 'boolean', description: 'false SEULEMENT si un worktree manque, si origin est injoignable ou si un conflit de fusion demande un arbitrage — jamais parce qu un worktree est sur une branche lot/* ou porte un arbre sale' },
    etat: { type: 'string', description: 'FACTUEL : commandes et sorties (sha de origin/dev, état des trois worktrees, dist de shared)' },
    sha_dev: { type: 'string' },
    ci_dev: { type: 'string', description: 'le verdict CI à la tête de dev : vert / rouge (quels jobs) / en cours' },
    tenus_ailleurs: {
      type: 'array', description: 'ce que d AUTRES sessions tiennent : PR ouvertes, branches poussées < 72 h, worktrees d agents',
      items: { type: 'object', additionalProperties: false, required: ['quoi', 'preuve'], properties: { quoi: { type: 'string' }, preuve: { type: 'string' }, lots_a_eviter: { type: 'array', items: { type: 'string' } } } },
    },
    fichiers_touches_par_dev: { type: 'array', items: { type: 'string' } },
  },
}

const CADRAGE = {
  type: 'object', additionalProperties: false, required: ['lots'],
  properties: {
    etat: { type: 'string' },
    lots: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['cle', 'verdict', 'preuve'],
        properties: {
          cle: { type: 'string' },
          verdict: { type: 'string', enum: ['a-faire', 'deja-livre', 'tenu-ailleurs', 'a-decouper', 'en-pr'] },
          pr_numero: { type: 'number', description: 'pour en-pr : le numéro de la PR OUVERTE de la branche lot/<clé>-*' },
          preuve: { type: 'string', description: 'fichier:ligne, commande et sortie' },
          existe_deja: { type: 'string', description: 'ce que l arbre VIVANT porte déjà pour ce lot (fichiers, wc -l)' },
          fichiers_cibles: { type: 'array', items: { type: 'string' }, description: 'les fichiers que le lot touchera — pour détecter deux lots sur un même fichier' },
          taille: { type: 'string', enum: ['petit', 'developper'] },
          hors_budget: { type: 'array', items: { type: 'string' }, description: 'fichiers cibles déjà > 1000 lignes : extraire AVANT d ajouter' },
          note: { type: 'string' },
        },
      },
    },
    collisions: { type: 'array', items: { type: 'string' }, description: 'deux lots de la même chaîne qui touchent le même fichier — ordre imposé' },
  },
}

const ISSUES = {
  type: 'object', additionalProperties: false, required: ['issues'],
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['cle', 'numero'],
        properties: { cle: { type: 'string' }, numero: { type: 'number' }, url: { type: 'string' }, deja_ouverte: { type: 'boolean' }, milestone: { type: 'string' } },
      },
    },
    milestone_b: { type: 'string', description: 'le nom du milestone de la famille B, créé ou retrouvé' },
    decision_7001_posee: { type: 'boolean' },
    rapport: { type: 'string' },
  },
}

const FAIT = {
  type: 'object', additionalProperties: false, required: ['branche', 'pousse', 'rapport', 'temoins', 'gates_rapides'],
  properties: {
    branche: { type: 'string' },
    pousse: { type: 'boolean', description: 'true si la branche du lot est sur origin' },
    commits: { type: 'array', items: { type: 'string' } },
    fichiers: { type: 'array', items: { type: 'string' } },
    temoins: { type: 'array', items: { type: 'string' }, description: 'un par ligne du critère : fichier, describe, ce qui est prouvé, rouge PUIS vert' },
    endpoints: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['route', 'site'], properties: { route: { type: 'string' }, site: { type: 'string' } } } },
    gates_rapides: { type: 'string', description: 'sorties tronquées de type-check + tests du périmètre' },
    rapport: { type: 'string' },
    blocage: { type: 'string', description: 'vide si rien ; sinon ce qui empêche de finir (dépendance non fusionnée, arbitrage produit)' },
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
    verdict: { type: 'string', enum: ['conforme', 'a-corriger', 'a-refaire'], description: 'l état APRÈS les corrections du relecteur' },
    defauts_trouves: { type: 'array', items: DEFAUT },
    corriges: { type: 'number' },
    restants: { type: 'array', items: DEFAUT },
    rapport: { type: 'string' },
    gates_rejoues: { type: 'string' },
    commits: { type: 'array', items: { type: 'string' } },
  },
}

const LIVRAISON = {
  type: 'object', additionalProperties: false, required: ['pousse', 'rapport'],
  properties: {
    pousse: { type: 'boolean' },
    pr_numero: { type: 'number' },
    pr_url: { type: 'string' },
    auto_merge: { type: 'boolean' },
    gates: { type: 'string', description: 'les gates complets de la plateforme : commande, résultat, sortie tronquée' },
    rouge_preexistant: { type: 'string', description: 'ce qui est rouge AVANT le lot, avec sa preuve et son issue' },
    issue_commentee: { type: 'boolean' },
    rapport: { type: 'string' },
  },
}

const VALIDATION = {
  type: 'object', additionalProperties: false, required: ['acceptable', 'etapes', 'defauts', 'rapport'],
  properties: {
    acceptable: { type: 'boolean', description: 'true si TOUTES les étapes passent sur les deux plateformes' },
    staging_sha: { type: 'string', description: 'le sha que staging sert, et comment il a été lu' },
    fusionnees: { type: 'array', items: { type: 'number' }, description: 'les PR fusionnées avant la recette' },
    non_fusionnees: { type: 'array', items: { type: 'string' }, description: 'les PR encore ouvertes ou rouges, avec la raison' },
    etapes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['nom', 'plateforme', 'resultat', 'preuve'],
        properties: { nom: { type: 'string' }, plateforme: { type: 'string', enum: ['web', 'ios', 'les-deux'] }, resultat: { type: 'string', enum: ['passe', 'echoue', 'non-jouee'] }, preuve: { type: 'string', description: 'capture (chemin), sortie de commande, réponse d API' } },
      },
    },
    defauts: {
      type: 'array', description: 'un lot par échec, dans la forme des lots du script',
      items: {
        type: 'object', additionalProperties: false, required: ['cle', 'chaine', 'titre', 'critere'],
        properties: { cle: { type: 'string' }, chaine: { type: 'string', enum: ['gateway', 'web', 'ios'] }, famille: { type: 'string' }, taille: { type: 'string', enum: ['petit', 'developper'] }, titre: { type: 'string' }, critere: { type: 'string' }, existe: { type: 'string' }, depend: { type: 'array', items: { type: 'string' } } },
      },
    },
    rapport: { type: 'string' },
  },
}

const FINAL = {
  type: 'object', additionalProperties: false, required: ['fait', 'rapport'],
  properties: { fait: { type: 'boolean' }, main_sha: { type: 'string' }, xcode_cloud: { type: 'string' }, rapport: { type: 'string' } },
}

// ---------------------------------------------------------------------------
// OUTILS
// ---------------------------------------------------------------------------

const court = (v, n) => JSON.stringify(v === undefined ? null : v, null, 1).slice(0, n)
const ligneDeLot = (l) => `- ${l.cle} [${l.chaine}, famille ${l.famille || '?'}, ${l.taille || 'developper'}${l.issue ? `, issue #${l.issue}` : ''}] ${l.titre}\n  critère : ${l.critere}${l.existe ? `\n  existe déjà : ${l.existe}` : ''}${l.depend && l.depend.length ? `\n  dépend de : ${l.depend.join(', ')}` : ''}`

const resultats = []
let lotsDuTour = LOTS
let numeros = {}

for (let tour = 1; tour <= TOURS; tour += 1) {
  if (!lotsDuTour.length) { log(`=== TOUR ${tour} — aucun lot à faire, fin ===`); break }
  log(`=== TOUR ${tour}/${TOURS} — ${lotsDuTour.length} lots : ${lotsDuTour.map((l) => l.cle).join(', ')} ===`)

  // -------------------------------------------------------------------------
  phase('Synchroniser')
  // -------------------------------------------------------------------------
  const synchro = await agent(`${socle('web')}

TA MISSION — PRÉPARER LES TROIS WORKTREES DE CHAÎNE ET RELEVER CE QUE LES AUTRES SESSIONS TIENNENT.
Tu ne modifies aucun fichier de production.

Pour CHACUN des trois worktrees — ${REPO_GW} (gateway), ${REPO_WEB} (web), ${REPO_IOS} (ios) :
1. \`cd <worktree> && git branch --show-current && git status --short | head\`. Un worktree de chaîne sur une
   branche \`lot/*\` est NORMAL (les lots y basculent) : ne change pas de branche. Un arbre SALE est le reste
   d'un tour interrompu : COMMITE-LE sur la branche courante (\`git add -A apps packages services && git commit -m "wip(<chaîne>): reprise — état laissé par un tour interrompu (Refs #<n si connu>)"\`,
   fin de message EXACTEMENT « ${ATTRIBUTION} ») et POUSSE-LE (\`git push origin HEAD\`) — jamais de stash, jamais de
   \`checkout -- .\`. Ce n'est PAS une raison de rendre pret=false.
2. \`git fetch origin ${BASE}\` (4 essais sur échec réseau : 2 s, 4 s, 8 s, 16 s).
3. Si la branche courante est la branche de CHAÎNE (\`chaine/*\`) : \`git merge origin/${BASE}\` (JAMAIS rebase).
   Si c'est une branche \`lot/*\` : ne fusionne rien, le lot s'en charge. Chaque lot partira de \`origin/${BASE}\`
   ou reprendra sa branche.
   ATTENTION au sens d'un diff : \`git diff A..origin/${BASE}\` liste comme « supprimé » ce que A porte et que
   ${BASE} n'a PAS ENCORE — c'est le travail du lot, pas un retrait de ${BASE}. Lis \`git log origin/${BASE} -- <fichier>\`
   avant d'annoncer que ${BASE} a retiré quelque chose.
4. \`ls packages/shared/dist | head -3\` et \`ls apps/web-v2/node_modules | wc -l\` : si absent,
   \`bun install --ignore-scripts\`, puis \`cd packages/shared && npx prisma generate --generator client && bun run build\`.
   Si \`git diff --stat HEAD@{1}..HEAD -- packages/shared\` montre du mouvement, rebâtis shared.

Puis, depuis ${REPO_WEB} :
5. \`git log --oneline -1 origin/${BASE}\` et le verdict CI à cette tête :
   \`gh run list --branch ${BASE} --limit 8 --json headSha,name,status,conclusion\` — rends ci_dev.
6. LE RELEVÉ : \`gh pr list --state open --limit 40 --json number,title,headRefName,files\` ;
   \`git branch -r --sort=-committerdate | head -40\` puis \`git log -1 --format='%ci %s' <branche>\` sur celles
   de moins de 72 h ; \`git worktree list\` (les worktrees .claude/worktrees/agent-* d'autres sessions).
   Une PR ou une branche vivante qui touche lecture / non-lu / receipts / badge / notifications /
   consommation média / temps réel social TIENT son sujet : rends-la dans tenus_ailleurs avec la preuve
   — SAUF les branches lot/<clé>-<n> et leurs PR : elles sont CE chantier (poussées par un tour précédent), jamais « tenues ailleurs »
   et les clés de lots à éviter parmi : ${lotsDuTour.map((l) => l.cle).join(', ')}.
   Cas connu : la branche claude/ios-registre-lecture-6997 (2026-09-18) tient #6997 — dis si elle est
   déjà dans origin/${BASE} (\`git merge-base --is-ancestor <sha> origin/${BASE}\`).
7. \`git diff --stat HEAD@{1}...origin/${BASE} | tail -30\` dans ${REPO_WEB} : les chemins que ${BASE} vient de bouger.

Sois FACTUEL : etat cite les commandes et leurs sorties.`,
    { label: `synchroniser:tour-${tour}`, phase: 'Synchroniser', schema: SYNCHRO, model: MODELE.developper, effort: 'medium' })

  if (!synchro || synchro.pret === false) {
    log(`ARRÊT — synchronisation impossible : ${synchro ? synchro.etat : '(aucun rapport)'}`)
    resultats.push({ tour, arret: 'synchronisation', etat: synchro && synchro.etat })
    break
  }
  const TENUS = Array.isArray(synchro.tenus_ailleurs) ? synchro.tenus_ailleurs : []
  // Une branche lot/<clé>-<n> ou sa PR est CE chantier (un tour précédent l'a poussée) : elle n'écarte jamais son lot —
  // le cadrage la classe en-pr (PR ouverte) ou deja-livre (fusionnée). Seuls les sujets ÉTRANGERS écartent.
  const estDuChantier = (t) => /\blot\/[a-z]\d-\d+/.test(`${t.quoi || ''} ${t.preuve || ''}`)
  const CLES_TENUES = new Set(TENUS.filter((t) => !estDuChantier(t)).flatMap((t) => Array.isArray(t.lots_a_eviter) ? t.lots_a_eviter : []))
  log(`${BASE} à ${synchro.sha_dev || '?'} (CI : ${synchro.ci_dev || '?'}) — ${TENUS.length} sujets tenus ailleurs${CLES_TENUES.size ? ` (lots écartés : ${[...CLES_TENUES].join(', ')})` : ''}`)
  const RELEVE = TENUS.length
    ? `CE QUE D'AUTRES SESSIONS TIENNENT — n'y touche pas :\n${TENUS.map((t) => `- ${t.quoi} (preuve : ${t.preuve})`).join('\n')}\n`
    : 'Aucun sujet relevé comme tenu par une autre session.\n'

  // -------------------------------------------------------------------------
  phase('Cadrer')
  // -------------------------------------------------------------------------
  const candidats = lotsDuTour.filter((l) => !CLES_TENUES.has(l.cle))
  const cadrage = await agent(`${socle('web')}

TA MISSION — VÉRIFIER CHAQUE LOT CONTRE L'ARBRE VIVANT (origin/${BASE} = ${synchro.sha_dev || '?'}). Le relevé
de la spec date du matin ; ${BASE} a pu bouger. Pour CHAQUE lot ci-dessous, dans le worktree de sa chaîne
(gateway → ${REPO_GW}, web → ${REPO_WEB}, ios → ${REPO_IOS}) :
0. D'ABORD : ce lot a-t-il déjà une PR OUVERTE d'un tour précédent ? \`gh pr list --state open --search "head:lot/<clé en minuscules>-" --json number,headRefName,title\`
   (et \`gh pr list --state merged --search "head:lot/<clé en minuscules>-"\`). PR ouverte ⇒ verdict en-pr avec
   pr_numero (le lot ne se redéveloppe PAS : il se fusionne au vert de ses checks). PR fusionnée ⇒ deja-livre.
1. Sinon, rejoue les greps qui fondent « existe déjà » (les fichiers, fonctions, événements cités) et lis les
   fichiers cibles : le lot est-il DÉJÀ LIVRÉ (le critère de fin est tenu — prouve-le par le code et un
   témoin existant), TENU AILLEURS (une PR/branche du relevé y écrit), À FAIRE, ou À DÉCOUPER (plus d'un
   jour de travail : dis en quoi le découper) ?
2. Rends fichiers_cibles (ceux que le lot touchera) et hors_budget (ceux déjà > 1000 lignes — \`wc -l\`).
3. Rends la taille : petit (haiku suffit : une feuille, un relais délimité, sans temps réel ni route
   nouvelle) ou developper (sonnet).
4. Signale les COLLISIONS : deux lots de la même chaîne sur un même fichier ⇒ dis lequel passe avant.

${RELEVE}
LES LOTS :
${candidats.map(ligneDeLot).join('\n')}

Sois FACTUEL : chaque verdict porte sa preuve (fichier:ligne, commande, sortie).`,
    { label: `cadrer:tour-${tour}`, phase: 'Cadrer', schema: CADRAGE, model: MODELE.developper, effort: 'high' })

  const verdicts = new Map((cadrage && cadrage.lots ? cadrage.lots : []).map((v) => [v.cle, v]))
  const aFaire = candidats.filter((l) => { const v = verdicts.get(l.cle); return !v || v.verdict === 'a-faire' || v.verdict === 'a-decouper' })
  const enPr = candidats.filter((l) => { const v = verdicts.get(l.cle); return v && v.verdict === 'en-pr' && v.pr_numero })
  const dejaLivres = candidats.filter((l) => { const v = verdicts.get(l.cle); return v && v.verdict === 'deja-livre' })
  const tenus = candidats.filter((l) => { const v = verdicts.get(l.cle); return v && v.verdict === 'tenu-ailleurs' })
  log(`cadrage : ${aFaire.length} à faire (${aFaire.map((l) => l.cle).join(', ') || '—'}), ${enPr.length} en PR (${enPr.map((l) => `${l.cle}#${verdicts.get(l.cle).pr_numero}`).join(', ') || '—'}), ${dejaLivres.length} déjà livrés, ${tenus.length} tenus ailleurs`)
  if (cadrage && cadrage.collisions && cadrage.collisions.length) log(`collisions : ${cadrage.collisions.join(' ; ')}`)

  // Les PR ouvertes d'un tour précédent se fusionnent au VERT de leurs checks — jamais par --auto, qui
  // fusionne sur-le-champ sur ce dépôt sans protection de branche.
  const FUSION = {
    type: 'object', additionalProperties: false, required: ['fusionnee', 'rapport'],
    properties: { fusionnee: { type: 'boolean' }, sha: { type: 'string' }, checks: { type: 'string', description: 'la sortie de gh pr checks, tronquée' }, rapport: { type: 'string' } },
  }
  const fusions = AUTO_MERGE && enPr.length ? await parallel(enPr.map((l) => async () => {
    const num = verdicts.get(l.cle).pr_numero
    const f = await agent(`${socle(l.chaine)}

TA MISSION — FUSIONNER LA PR #${num} DU LOT ${l.cle} DANS \`${BASE}\`, AU VERT DE SES CHECKS ET SEULEMENT ALORS.
Tu es l'agent de LIVRAISON de ce tour : tu es le seul autorisé à fusionner, et uniquement ainsi :
1. \`cd ${REPO_PAR_CHAINE[l.chaine]} && gh pr view ${num} --json state,mergeStateStatus,headRefName,baseRefName\` — la PR doit être OPEN vers ${BASE}.
   Si mergeStateStatus est DIRTY/BEHIND : \`git fetch origin && git checkout <headRefName> && git merge origin/${BASE}\`
   (jamais rebase), résous en gardant les deux apports, rejoue les gates rapides de la plateforme, pousse.
2. \`gh pr checks ${num} --watch --fail-fast\` (bloquant ; au plus ~45 min). Rends la sortie tronquée.
3. TOUT VERT ⇒ \`gh pr merge ${num} --merge\` (JAMAIS --auto, JAMAIS --squash) puis \`gh pr view ${num} --json mergedAt,mergeCommit\`.
   UN ROUGE ⇒ ne fusionne pas ; lis le job (\`gh run view <id> --log-failed | tail -60\`) ; si le rouge est CAUSÉ
   par le lot, corrige-le en TDD sur la branche, pousse, et reprends à l'étape 2 (une fois) ; s'il est
   PRÉEXISTANT (le même job est rouge sur origin/${BASE}), fusionne quand même et DIS-LE dans un commentaire de la PR.
4. Commentaire de clôture sur l'issue du lot (\`Closes\` est dans le commit ; sinon \`gh issue close\` avec la preuve).
Rends fusionnee, sha, checks, rapport.`,
      { label: `fusionner:${l.cle}`, phase: 'Livrer', schema: FUSION, model: MODELE.livrer, effort: 'medium' })
    if (f) log(`${l.cle} : PR #${num} ${f.fusionnee ? `fusionnée (${f.sha || '?'})` : 'NON fusionnée'}`)
    return { cle: l.cle, issue: numeros[l.cle] || l.issue || 0, pr: num, fusion: f }
  })) : []
  if (!AUTO_MERGE && enPr.length) log(`${enPr.length} PR en attente (auto_merge désarmé) : ${enPr.map((l) => `#${verdicts.get(l.cle).pr_numero}`).join(', ')}`)

  if (!aFaire.length && !enPr.length) { resultats.push({ tour, cadrage, rien_a_faire: true }); lotsDuTour = []; continue }

  // -------------------------------------------------------------------------
  phase('Ouvrir')
  // -------------------------------------------------------------------------
  const ouverture = await agent(`${socle('web')}

TA MISSION — OUVRIR (OU RETROUVER) L'ISSUE DE CHAQUE LOT, avant la première ligne de code. Mécanique, exact.
Dépôt GitHub : isopen-io/meeshy. Projet : « Meeshy — pilotage » (org isopen-io, numéro 1).

1. Milestones : la famille A va dans « Un non-lu n'a qu'une source — conversations, cloche et badge disent
   la même chose » (numéro 103). La famille B va dans « Un envoi dit s'il est reçu, vu, écouté — et jusqu'où »
   : \`gh api repos/isopen-io/meeshy/milestones --jq '.[] | select(.title | startswith("Un envoi dit"))'\` ;
   s'il n'existe pas, crée-le (\`gh api -X POST repos/isopen-io/meeshy/milestones -f title=... -f due_on=2026-10-15T00:00:00Z -f description='Accusés émis / reçu / vu, ouvertures d une pièce, audio et vidéo lus jusqu où — sur iOS et web-v2, validés sur staging.'\`).
2. Pour chaque lot : s'il porte déjà un numéro (issue: n), réutilise-le. Sinon cherche une issue OUVERTE
   au même sujet (\`gh issue list --state open --search "<mots clés>" --limit 5\`) ; à défaut crée-la :
   titre = le titre du lot VERBATIM (sémantique, pas de code interne) ; corps = Contexte (deux phrases,
   le relevé), Critère de fin (verbatim), Source (la spec : docs/superpowers/specs/2026-09-21-lecture-et-accuses-design.md
   § 4, clé <cle>), Dimensions visées (parmi les treize) ; label \`web-v3\` pour web, \`ios\` pour ios,
   \`gateway\` pour gateway (crée le label s'il manque) ; milestone selon la famille.
3. Ajoute chaque issue au projet 1 et pose Status = In Progress :
   \`gh project item-add 1 --owner isopen-io --url <url>\` puis \`gh project item-edit\` sur le champ Status
   (\`gh project field-list 1 --owner isopen-io --format json\` donne les ids). Si le scope project manque, dis-le.
4. Sur #7001, poste UN commentaire qui porte la décision du porteur (2026-09-21) : « D-L1 — le badge
   d'icône compte les CONVERSATIONS non lues (hors muettes), comme l'app iOS et WhatsApp ; la cloche garde son
   compte de notifications ; le serveur aligne aps.badge/FCM sur cette projection. Une demande d'ami
   n'incrémente que la cloche. Livrée par le lot G3. » — sauf si un commentaire identique existe déjà.
   Termine chaque commentaire par une ligne vide, ---, puis _Generated by [Claude Code](https://claude.ai/code)_

LES LOTS :
${aFaire.map(ligneDeLot).join('\n')}`,
    { label: `ouvrir:tour-${tour}`, phase: 'Ouvrir', schema: ISSUES, model: MODELE.mecanique, effort: 'low' })
  ;(ouverture && ouverture.issues ? ouverture.issues : []).forEach((i) => { if (i.numero) numeros[i.cle] = i.numero })
  log(`issues : ${Object.entries(numeros).map(([c, n]) => `${c}→#${n}`).join(', ') || 'aucune'}${ouverture && ouverture.milestone_b ? ` — milestone B : ${ouverture.milestone_b}` : ''}`)

  // -------------------------------------------------------------------------
  // LES TROIS CHAÎNES, EN PARALLÈLE ; dans une chaîne, les lots l'un après l'autre.
  // -------------------------------------------------------------------------
  const developperLot = async (l) => {
    const repo = REPO_PAR_CHAINE[l.chaine]
    const num = numeros[l.cle] || l.issue || 0
    const v = verdicts.get(l.cle) || {}
    const taille = v.taille || l.taille || 'developper'
    const branche = `lot/${l.cle.toLowerCase()}-${num || 'sans-issue'}`
    const dependances = (l.depend || []).map((d) => `${d}${numeros[d] ? ` (#${numeros[d]})` : ''}`)

    // ---- Développer
    const fait = await agent(`${socle(l.chaine)}

${GATES_PAR_CHAINE[l.chaine]}

TA MISSION — LIVRER LE LOT ${l.cle} EN TDD, SUR SA BRANCHE, SQUELETTE POUSSÉ TÔT.

LE LOT : ${l.titre}${num ? ` (issue #${num})` : ''}
CRITÈRE DE FIN : ${l.critere}
${l.existe ? `EXISTE DÉJÀ (relevé) : ${l.existe}` : ''}
${v.existe_deja ? `EXISTE DÉJÀ (cadrage, arbre vivant) : ${v.existe_deja}` : ''}
${v.fichiers_cibles && v.fichiers_cibles.length ? `FICHIERS CIBLES (cadrage) : ${v.fichiers_cibles.join(', ')}` : ''}
${v.hors_budget && v.hors_budget.length ? `HORS BUDGET (> 1000 lignes — extraire par responsabilité AVANT d'ajouter) : ${v.hors_budget.join(', ')}` : ''}
${v.note ? `NOTE DU CADRAGE : ${v.note}` : ''}
${dependances.length ? `DÉPEND DE : ${dependances.join(', ')} — si le lot amont n'est pas encore dans origin/${BASE} (\`git log origin/${BASE} --oneline --grep "Closes #<n>"\` vide), \`git fetch origin\` puis \`git merge origin/<branche amont>\` (\`git branch -r | grep lot/<clé amont en minuscules>\` la nomme — elle peut vivre dans une AUTRE chaîne) dans ta branche (jamais rebase) ; la PR portera les deux et GitHub résoudra à la fusion de l'amont. Si la branche amont n'existe pas encore, code contre le CONTRAT (types partagés) et dis-le en blocage.` : ''}
${RELEVE}
ÉTAPES :
1. \`cd ${repo} && git fetch origin\` puis : si \`origin/${branche}\` EXISTE déjà (un tour interrompu l'a poussée :
   \`git branch -r | grep ${branche}\`), REPRENDS-LA — \`git checkout -B ${branche} origin/${branche} && git merge origin/${BASE}\`
   (jamais rebase) et lis ce qu'elle porte déjà (\`git log --oneline origin/${BASE}..HEAD\`, \`git diff --stat origin/${BASE}...HEAD\`)
   avant d'écrire ; sinon \`git checkout -B ${branche} origin/${BASE}\` — la branche du lot part de ${BASE} VIVANT.
   \`git status --short\` doit être vide. Si shared a bougé : rebâtis dist.
2. SPÉCIFIE d'abord, dans ${SCRATCH}/${l.cle}.md (hors dépôt) : la route/l'événement réel cité
   fichier:ligne, la référence iOS lue (pour web), les témoins à écrire (un par ligne du critère), le
   découpage. Une question produit se tranche par la spec (D-L1..3) ou par le défaut le plus simple — et
   se DIT dans le rapport ; elle n'arrête pas le lot.
3. RED : écris le(s) témoin(s) d'abord, joue-le(s), constate le ROUGE (rends la sortie).
   Commite ce squelette et POUSSE-LE (\`git push -u origin ${branche}\`) dans les quinze minutes — c'est
   la réservation du lot, visible des autres sessions.
4. GREEN : le code MINIMAL, immutable, sans any, dans le budget de taille. Fichiers par responsabilité.
5. REFACTOR si ça ajoute de la valeur. Gates rapides (ci-dessus) VERTS. Prisme Linguistique : tout texte
   utilisateur nouveau va dans le catalogue des SEPT langues (cherche le catalogue de la plateforme).
6. Commits en français, forme du dépôt (\`Refs #${num || 'n'}\` sur les points d'étape ; le \`Closes\` viendra
   à la livraison). Pousse à chaque étape verte.
7. Rends : branche, commits, fichiers, témoins (rouge PUIS vert, prouvé), endpoints cités, gates rapides
   (sorties tronquées), dimensions mûres/restantes, blocage s'il y en a un.

INTERDITS : ouvrir une PR (c'est l'agent de livraison qui le fait) ; \`gh pr merge\` sous toute forme ;
toucher services/gateway depuis la chaîne web ou ios (une capacité manquante ⇒ blocage, pas un
contournement ; un BOGUE PROUVÉ du gateway ⇒ témoin rouge d'abord, correctif minimal, son propre commit) ;
inventer un champ ou un événement ; désactiver un témoin ; contourner un gate ; pousser sur ${BASE}.`,
      { label: `developper:${l.cle}`, phase: 'Developper', schema: FAIT, model: taille === 'petit' ? MODELE.petit : MODELE.developper, effort: taille === 'petit' ? 'medium' : 'high' })
    if (!fait) return { cle: l.cle, issue: num, arret: 'développement sans rapport' }
    log(`${l.cle} : développé sur ${fait.branche || branche} — ${fait.pousse ? 'poussé' : 'NON poussé'}${fait.blocage ? ` — blocage : ${fait.blocage.slice(0, 160)}` : ''}`)
    if (fait.blocage && !fait.pousse) return { cle: l.cle, issue: num, fait, arret: 'blocage' }

    // ---- Revue-correction (opus)
    const revue = await agent(`${socle(l.chaine)}

${GATES_PAR_CHAINE[l.chaine]}

TA MISSION — RELIRE LE LOT ${l.cle} SUR SA BRANCHE ET LE CORRIGER TOI-MÊME. Tu es le relecteur qui
CORRIGE : tout défaut bloquant ou majeur que tu constates, tu le répares, tu rejoues les gates, tu commites
(forme du dépôt, \`Refs #${num || 'n'}\`), tu pousses. Ne rends « restants » que ce qui demande un arbitrage.

LE LOT : ${l.titre}${num ? ` (issue #${num})` : ''}
CRITÈRE DE FIN : ${l.critere}
BRANCHE : ${fait.branche || branche} — \`cd ${repo} && git checkout ${fait.branche || branche} && git diff --stat origin/${BASE}...HEAD\`
RAPPORT DU DÉVELOPPEUR : ${court(fait, 4000)}

RELIS, dans cet ordre :
1. LE CRITÈRE, ligne à ligne : chaque ligne a-t-elle son témoin, et le témoin a-t-il ÉTÉ rouge ? (un témoin
   qui lit la SOURCE au lieu du COMPORTEMENT verdit sur un correctif annulé — refuse-le).
2. LA PASSERELLE : chaque route/événement consommé existe-t-il TEL QUEL dans services/gateway/src (chemin,
   méthode, corps, charge) ? Un champ deviné est BLOQUANT.
3. « QUI AFFICHE ce qui est résolu ? » et « QU'EST-CE QUI PART À CÔTÉ ? » (Prisme, confidentialité :
   showReadReceipts, présence, vue unique) — la valeur atteint-elle un pixel ? un contrôle a-t-il un EFFET ?
4. LES DÉCISIONS : D-L1 (badge = conversations), D-L2 (ouverture sur le séparateur, toujours), D-L3 (couleur
   PRIMAIRE), D-1 (iOS référence), D-13 (code en anglais), Instant App (optimiste, cache-first, zéro
   re-render inutile), budget 1000-1200 lignes, aucun any, immutabilité, sept langues.
5. iOS : pas d'@ObservedObject sur un singleton global dans une feuille (RootRerenderSourceGuardTests
   balaie les racines) ; protocole avant service ; injection par init.
6. LES GATES : rejoue les gates rapides ET les gates de fin de lot ; rends les SORTIES tronquées.
Rends verdict (après tes corrections), défauts trouvés, corrigés (nombre), restants, commits.`,
      { label: `revue:${l.cle}`, phase: 'Revue', schema: REVUE, model: MODELE.relire, effort: 'high' })
    if (revue) log(`${l.cle} : revue ${revue.verdict} — ${revue.defauts_trouves.length} défauts, ${revue.corriges} corrigés, ${revue.restants.length} restants`)
    const restants = revue && revue.restants ? revue.restants.filter((d) => d.gravite !== 'mineur') : []

    // ---- Livrer : gates complets, PR, auto-merge
    const livraison = await agent(`${socle(l.chaine)}

${GATES_PAR_CHAINE[l.chaine]}

TA MISSION — LIVRER LE LOT ${l.cle} PAR UNE PR VERS \`${BASE}\`, AUTO-MERGE ARMÉ. Rien ne part sur ${BASE} directement.

LE LOT : ${l.titre}${num ? ` (issue #${num})` : ''}
BRANCHE : ${fait.branche || branche} — \`cd ${repo} && git checkout ${fait.branche || branche}\`
VERDICT DE LA REVUE : ${revue ? revue.verdict : '(aucune)'} — ${restants.length} défauts non mineurs restants.
${restants.length ? `RESTANTS (ils voyagent avec le lot et se DISENT dans la PR) :\n${court(restants, 2000)}` : ''}

1. \`git fetch origin ${BASE}\` ; si ${BASE} a avancé, \`git merge origin/${BASE}\` (jamais rebase), résous en
   gardant les DEUX apports, rebâtis shared si touché.
2. Les GATES COMPLETS de la plateforme (ci-dessus). Un rouge CAUSÉ par le lot : corrige-le (TDD) ; un rouge
   PRÉEXISTANT ou TRANSVERSAL : prouve-le (le même gate est rouge sur origin/${BASE}, ou le run CI de ${BASE}
   le montre) et DIS-LE dans la PR — il n'arrête pas la livraison.
3. \`git status --short\` : aucun artefact généré. Commit final qui ferme l'issue si le verdict n'est pas
   « a-refaire » : \`Closes #${num || 'n'}\` (JAMAIS \`Closes #0\` — si le lot n'a pas d'issue, \`Refs\` et dis-le)
   ${l.chaine === 'ios' ? '— SUJET avec « run test » ' : ''}; sinon \`wip(...)\` avec \`Refs\`, et dis pourquoi.
4. \`git push -u origin ${fait.branche || branche}\` (4 essais sur échec réseau ; rejet non fast-forward ⇒ fetch + merge, jamais rebase).
5. LA PR : \`gh pr list --head ${fait.branche || branche} --state open\` ; si absente,
   \`gh pr create --base ${BASE} --title "<le titre du lot>" --body "<corps>"\` — corps : ce qui était absent,
   ce qui est livré fichier par fichier, les routes/événements consommés (fichier:ligne), les témoins, les
   gates et leurs chiffres, le rouge préexistant s'il y en a, \`Closes #${num || 'n'}\`, dimensions mûres et
   restantes ; ligne vide puis
   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   ${AUTO_MERGE ? `Puis ATTENDS LE VERT et fusionne toi-même — JAMAIS \`--auto\` (sur ce dépôt sans protection de branche, \`--auto\` fusionne sur-le-champ, avant tout verdict) : \`gh pr checks <n> --watch --fail-fast\` (au plus ~45 min), puis, tout vert, \`gh pr merge <n> --merge\` ; un rouge CAUSÉ par le lot se corrige en TDD sur la branche puis on recommence (une fois) ; un rouge PRÉEXISTANT (même job rouge sur origin/${BASE}) se dit dans la PR et n'empêche pas la fusion ; si le vert n'est pas venu dans le délai, laisse la PR ouverte et dis-le (elle sera fusionnée au tour suivant).` : `NE FUSIONNE PAS ET N'ARME RIEN — \`gh pr merge\` interdit sous toutes ses formes ce tour (voir le socle) ; la PR reste OUVERTE, rends auto_merge=false, et écris dans son corps « auto-merge à armer après le feu vert de la veille de dev ».`} Si GitHub dit CONFLICTING sur une fusion propre, \`git merge-tree\`
   arbitre ; fusionne origin/${BASE} dans la branche et repousse.
6. Commentaire sur l'issue #${num || 'n'} : la PR, les preuves (gates, témoins, captures décrites), dimensions
   MÛRES / RESTANTES, et une issue par dimension non mûre (même milestone) si elle n'existe pas. Termine par
   une ligne vide, ---, puis _Generated by [Claude Code](https://claude.ai/code)_
7. Rends pousse, pr_numero, pr_url, auto_merge, gates (sorties tronquées), rouge_preexistant, rapport.`,
      { label: `livrer:${l.cle}`, phase: 'Livrer', schema: LIVRAISON, model: MODELE.livrer, effort: 'medium' })
    if (livraison) log(`${l.cle} : ${livraison.pousse ? 'livré' : 'NON livré'}${livraison.pr_numero ? ` — PR #${livraison.pr_numero}${livraison.auto_merge ? ' (auto-merge)' : ''}` : ''}`)
    return { cle: l.cle, issue: num, branche: fait.branche || branche, fait: { pousse: fait.pousse, temoins: fait.temoins, dimensions_mures: fait.dimensions_mures, dimensions_restantes: fait.dimensions_restantes, blocage: fait.blocage }, revue: revue && { verdict: revue.verdict, trouves: revue.defauts_trouves.length, corriges: revue.corriges, restants }, livraison }
  }

  // Ordre dans une chaîne : dépendances d'abord, puis l'ordre déclaré.
  const ordonne = (lots) => {
    const restants = [...lots]; const ordre = []; const places = new Set()
    let garde = 0
    while (restants.length && garde < 50) {
      garde += 1
      const i = restants.findIndex((l) => (l.depend || []).every((d) => places.has(d) || !lots.some((x) => x.cle === d)))
      const l = i >= 0 ? restants.splice(i, 1)[0] : restants.shift()
      ordre.push(l); places.add(l.cle)
    }
    return ordre
  }
  const chaines = CHAINES.map((c) => ordonne(aFaire.filter((l) => l.chaine === c))).filter((lots) => lots.length)
  log(`chaînes : ${chaines.map((lots) => `${lots[0].chaine} (${lots.map((l) => l.cle).join(' → ')})`).join(' ‖ ')}`)

  const parChaine = await parallel(chaines.map((lots) => async () => {
    const faits = []
    for (const l of lots) {
      const r = await developperLot(l)
      faits.push(r)
    }
    return faits
  }))
  const livres = [
    ...parChaine.filter(Boolean).flat(),
    ...fusions.filter(Boolean).map((f) => ({ cle: f.cle, issue: f.issue, livraison: { pousse: !!(f.fusion && f.fusion.fusionnee), pr_numero: f.pr, pr_url: `https://github.com/isopen-io/meeshy/pull/${f.pr}`, rapport: f.fusion && f.fusion.rapport }, fusion: f.fusion })),
  ]
  log(`tour ${tour} : ${livres.filter((r) => r.livraison && r.livraison.pousse).length}/${aFaire.length + enPr.length} lots livrés (PR ouvertes ou fusionnées)`)

  // -------------------------------------------------------------------------
  phase('Valider')
  // -------------------------------------------------------------------------
  let validation = null
  if (VALIDER && !AUTO_MERGE) log('Valider : SAUTÉE ce tour — auto-merge désarmé, les PR attendent le feu vert de la veille de dev ; relancer avec auto_merge: true')
  if (VALIDER && AUTO_MERGE) {
    validation = await agent(`${socle('web')}

TA MISSION — VALIDER LE CHANTIER SUR STAGING, SUR LES DEUX PLATEFORMES, À DEUX COMPTES. Tu es la recette :
tu ne codes pas, tu MESURES, et chaque échec devient un lot (forme des lots du script) pour le tour suivant.

LES PR DU TOUR :
${livres.map((r) => `- ${r.cle}${r.issue ? ` (#${r.issue})` : ''} : ${r.livraison && r.livraison.pr_url ? r.livraison.pr_url : '(pas de PR)'} — ${r.livraison && r.livraison.pousse ? 'livré' : 'non livré'}`).join('\n')}

A. FUSIONNER AU VERT, PUIS ATTENDRE LE DÉPLOIEMENT (jamais de push sur ${BASE}, jamais \`--auto\`) :
1. Pour chaque PR de lot encore ouverte (\`gh pr list --state open --search "head:lot/"\`) : \`gh pr checks <n> --watch --fail-fast\`
   (bloquant, jusqu'au verdict, ~40 min au plus). TOUT VERT ⇒ \`gh pr merge <n> --merge\` puis
   \`gh pr view <n> --json mergedAt\` → fusionnees. Une PR ROUGE : lis le job rouge
   (\`gh run view <id> --log-failed | tail -80\`) ; rouge PRÉEXISTANT (même job rouge sur origin/${BASE}) ⇒
   fusionne et dis-le ; rouge CAUSÉ par le lot ⇒ ne fusionne pas, rends-la dans non_fusionnees avec la
   cause — c'est un défaut du tour suivant (lot « la PR #n est rouge sur <job> : <cause> », chaîne du lot).
2. Staging suit ${BASE} : \`gh run list --workflow docker.yml --branch ${BASE} --limit 3 --json headSha,status,conclusion\`
   — attends le run qui porte la tête de ${BASE} après la dernière fusion (\`gh run watch <id>\`). Puis lis
   le sha que staging SERT (\`curl -s https://gate.staging.meeshy.me/api/v1/health\` ou la route de version
   que services/gateway/src/routes expose — cherche « version »/« commit ») : rends staging_sha. Si staging
   ne porte pas les lots fusionnés, la recette ne prouve rien : dis-le et arrête-toi là (acceptable=false).

B. LES DEUX COMPTES ET LES DEUX SURFACES :
- Compte A = Demo : nom d'utilisateur dans ${REPO_PRINCIPAL}/apps/ios/fastlane/.env (DEMO_USER, DEMO_PASSWORD — fichier gitignoré, présent dans le SEUL clone principal, jamais dans un worktree) — lis
  le fichier, N'IMPRIME JAMAIS le mot de passe. Compte B : cherche un second compte de recette sur staging
  (\`POST https://gate.staging.meeshy.me/api/v1/auth/login\`) parmi ceux que le README ou tasks/ documentent ;
  à défaut, crée \`recette-lecture\` par \`POST /api/v1/auth/register\` (lis le schéma dans routes/auth) avec un
  mot de passe généré que tu gardes dans ${SCRATCH}/recette/comptes.env (hors dépôt). Assure-toi qu'A et B
  ont une conversation directe (crée-la par l'API si besoin : routes/conversations).
- WEB (compte A) : Chrome sur https://staging.meeshy.me via les outils mcp__claude-in-chrome__* (charge-les
  par ToolSearch « select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,
  mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__tabs_create_mcp,
  mcp__claude-in-chrome__read_console_messages,mcp__claude-in-chrome__find,mcp__claude-in-chrome__get_page_text »).
  Nouvel onglet, jamais un onglet existant. Captures dans ${SCRATCH}/recette/web/. Ne déclenche aucun
  alert/confirm.
- iOS (compte B) : simulateur NATIF ${SIM_NATIVE} (jamais Meeshy-iOS26). \`xcrun simctl boot ${SIM_NATIVE}\` ;
  bâtis l'app depuis ${REPO_IOS} à la tête de origin/${BASE} (\`git fetch origin ${BASE} && git checkout -B recette origin/${BASE}\`,
  \`./apps/ios/meeshy.sh build\`, un seul build à la fois, retry ×1 s'il est tué) ; installe le .app ;
  pointe-la sur staging AVANT de la lancer :
  \`xcrun simctl spawn ${SIM_NATIVE} defaults write me.meeshy.app meeshy_selected_environment -string "gate.staging.meeshy.me"\`
  puis \`xcrun simctl launch ${SIM_NATIVE} me.meeshy.app\`. Pilote par la skill ios-simulator (Skill
  « ios-simulator » : navigation sémantique par accessibilité) et \`idb\` (\`idb ui describe-all\`, \`idb ui tap\`,
  \`idb ui swipe\` — coordonnées en POINTS) ; captures \`xcrun simctl io ${SIM_NATIVE} screenshot\` dans
  ${SCRATCH}/recette/ios/. Connecte B. Vérifie l'environnement affiché (Réglages) avant toute écriture.

C. LE SCÉNARIO — chaque étape rend passe/echoue/non-jouee avec sa PREUVE (capture, réponse d'API) :
1. A (web) envoie un texte à B → sur le web, coche simple puis double coche grise quand B est en ligne
   (message:pending-delivered / read-status:updated), SANS recharger.
2. B (iOS) ouvre la conversation : le fil s'ouvre SUR « — 1 message non lu — » en couleur primaire (D-L2,
   D-L3) ; la pastille de la liste tombe à 0 ; sur le web, la coche d'A passe en double coche colorée
   (lu) en direct.
3. B envoie 3 messages à A. Sur le web, la Lentille montre « 3 » sur la conversation, le titre d'onglet
   « (1) » (1 conversation non lue, D-L1). A ouvre le fil : séparateur « — 3 messages non lus — », défilement
   posé dessus ; la conversation se marque lue SANS geste (W1) ; le titre d'onglet redevient nu ; sur iOS, les
   coches de B passent en lu.
4. B envoie un VOCAL (ou, à défaut, A envoie depuis le web une pièce audio) ; A l'écoute à moitié sur le web
   puis quitte ; A rouvre : la barre au repos montre la moitié, la lecture reprend à la position (W6) ; sur
   iOS, B ouvre « Infos » du vocal : « écouté jusqu'à … » et « 1x » (attachment-status:updated).
5. A ouvre « Infos du message » d'un de ses messages sur le web (W7) : Vu par B, avec l'heure.
6. Notifications : A envoie une demande d'ami à B (ou une mention) → sur iOS, la cloche monte de 1, le badge
   d'icône NE monte PAS (D-L1) ; B ouvre la notification : la cloche redescend, la notification est lue.
7. Badge poussé (G3) : sans appareil réel, la charge APNs ne se lit pas d'ici — vérifie alors par l'API
   (GET /api/v1/conversations : unreadCount > 0, muettes exclues) que le compte de conversations non lues de B
   est celui que le badge d'icône du simulateur affiche ; non-jouee si impossible, avec la raison.
8. Vue unique (W5) : A envoie une image à vue unique depuis le web si le composeur le permet, B l'ouvre sur
   iOS, puis A recharge la page : rien ne rouvre ; sinon non-jouee, dis pourquoi.
9. Social (W8) : B publie un post, A le voit apparaître dans le Flux ET dans les Réels sans recharger ; B aime
   le post depuis iOS, A voit le compteur monter ; B supprime, le post disparaît des deux.
10. Régression : aucune erreur console sur le web (read_console_messages, pattern « error|Error »), aucun
    crash iOS (\`xcrun simctl spawn ${SIM_NATIVE} log show --last 5m --predicate 'process == "Meeshy"' | grep -i crash\`).

D. RENDS acceptable (true seulement si TOUT passe sur les deux plateformes), les étapes avec preuves, et
   les DÉFAUTS sous forme de lots : clé V<n>, chaîne (gateway/web/ios), titre sémantique, critère observable,
   existe (ce que tu as vu), depend. Ne fabrique rien : une étape non jouée se dit non-jouee avec sa raison.`,
      { label: `valider:tour-${tour}`, phase: 'Valider', schema: VALIDATION, model: MODELE.valider, effort: 'high' })
    if (validation) log(`validation : ${validation.acceptable ? 'ACCEPTABLE' : 'NON acceptable'} — ${validation.etapes.filter((e) => e.resultat === 'passe').length}/${validation.etapes.length} étapes passent, ${validation.defauts.length} défauts → lots`)
  }

  resultats.push({ tour, synchro: { sha_dev: synchro.sha_dev, ci_dev: synchro.ci_dev, tenus: TENUS }, cadrage: { a_faire: aFaire.map((l) => l.cle), deja_livres: dejaLivres.map((l) => l.cle), tenus: tenus.map((l) => l.cle), collisions: cadrage && cadrage.collisions }, issues: { ...numeros }, lots: livres, validation })

  // Le tour suivant reprend les lots non livrés et les défauts de la recette.
  const nonLivres = [...aFaire, ...enPr].filter((l) => { const r = livres.find((x) => x.cle === l.cle); return !r || !r.livraison || !r.livraison.pousse || (AUTO_MERGE && r.fusion && !r.fusion.fusionnee) || (!AUTO_MERGE) })
  const defauts = validation && Array.isArray(validation.defauts) ? validation.defauts.map((d) => ({ ...d, taille: d.taille || 'developper', depend: d.depend || [] })) : []
  lotsDuTour = [...nonLivres, ...defauts]
  if (validation && validation.acceptable && !nonLivres.length) { log('=== ÉTAT ACCEPTABLE ATTEINT ==='); break }
}

// ---------------------------------------------------------------------------
phase('Livrer final')
// ---------------------------------------------------------------------------
let final = null
if (LIVRER_MAIN) {
  final = await agent(`${socle('web')}

TA MISSION — LIVRER LE CHANTIER EN PRODUCTION, sur feu vert EXPLICITE du porteur (livrer_main=true).
1. \`cd ${REPO_WEB} && git fetch origin ${BASE} main\` ; vérifie que ${BASE} est VERT à sa tête
   (\`gh run list --branch ${BASE} --limit 6 --json headSha,name,status,conclusion\`) — un ${BASE} rouge ne part pas.
2. Ouvre la PR ${BASE} → main (\`gh pr create --base main --head ${BASE} --title "..." --body "..."\`), corps = le
   bilan du chantier (les lots, les PR, la recette staging), attends ses checks (\`gh pr checks --watch\`),
   fusionne par \`gh pr merge --merge\`. Si le lot touche .changeset/** ou un package.json, une release part
   et main prend de l'avance : back-merge main → ${BASE} ensuite (PR, jamais un push direct).
3. Xcode Cloud : lis .github/workflows/ios-release.yml et apps/ios/meeshy.sh (« distribute » / lane beta) —
   déclenche le build beta sur la tête de main comme le dépôt le prévoit ; #7149 dit que le déclencheur beta
   annonce une ref qu'il n'envoie pas : vérifie la ref effectivement bâtie et dis-la.
4. Rends fait, main_sha, xcode_cloud (identifiant du build ou la raison), rapport.

BILAN DES TOURS : ${court(resultats.map((r) => ({ tour: r.tour, lots: (r.lots || []).map((l) => ({ cle: l.cle, pr: l.livraison && l.livraison.pr_numero })), validation: r.validation && { acceptable: r.validation.acceptable, defauts: r.validation.defauts.length } })), 6000)}`,
    { label: 'livrer-final', phase: 'Livrer final', schema: FINAL, model: MODELE.final, effort: 'high' })
} else {
  log('Livraison finale (dev → main → Xcode Cloud) : EN ATTENTE du feu vert du porteur — relancer avec livrer_main: true')
}

return { tours: resultats, final, lots_restants: lotsDuTour.map((l) => l.cle) }
