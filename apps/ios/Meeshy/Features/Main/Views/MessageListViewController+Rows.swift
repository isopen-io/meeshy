import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

// Construction des rangées du fil : bulle, rangée plate Focal/Script, séparateurs et indicateur de frappe (#10758).

/// Ce que TOUTE rangée d'une conversation reçoit de son fil : le point d'entrée
/// unique d'une donnée par conversation vers les cellules (#10758) — dont la
/// peau des bulles tirée de l'apparence choisie (#10753).
struct MessageRowConversationContext: Equatable {
    let accentHex: String
    let isDark: Bool
    let isDirect: Bool
    let currentUserId: String
    let bubbleSkin: BubbleSkin
}

extension MessageListViewController {

    var rowConversationContext: MessageRowConversationContext {
        MessageRowConversationContext(
            accentHex: accentColor,
            isDark: isDark,
            isDirect: isDirect,
            currentUserId: currentUserId,
            bubbleSkin: bubbleSkin
        )
    }

    // MARK: - DataSource

    func configureDataSource() {
        // Cells host their SwiftUI content via UIHostingConfiguration
        // (iOS 16+). The message registration reuses the rich SwiftUI bubble
        // shipped before — avatars, sender chrome, accent gradients,
        // translations, reactions, etc. — without manually mirroring its
        // layout in UIKit. The hosting configuration diff-updates on reuse,
        // so scroll performance is preserved.
        // Une registration PAR type d'item (bulle / séparateur de jour /
        // typing). Avec une registration unique, UIKit recyclait une cellule
        // hébergeant un `BubbleSwipeContainer<…>` pour y poser une
        // configuration `MessageDaySeparator` (et inversement) : le hosting
        // content view existant ne supporte pas le nouveau type racine, UIKit
        // détruit et reconstruit la content view à chaque recyclage croisé
        // (warning runtime `UIContentConfigurationAlertForReplacedContentView`,
        // coût visible au scroll). Des registrations distinctes donnent des
        // pools de réutilisation distincts : chaque cellule ne reçoit que des
        // configurations de son propre type racine et se diff-update en place.

        let typingRegistration = makeTypingRegistration()
        let dayHeaderRegistration = makeDayHeaderRegistration()
        let startRegistration = makeConversationStartRegistration()

        let messageRegistration = UICollectionView.CellRegistration<MessageListCell, MessageListItem> { [weak self] cell, _, item in
            guard let self else {
                cell.contentConfiguration = nil
                return
            }
            let _spState = PerfSignpost.signposter.beginInterval("cellConfig")
            defer { PerfSignpost.signposter.endInterval("cellConfig", _spState) }
            // Étiquette « tête de groupe » (marges de la carte Focal) : remise
            // à zéro à chaque configuration — la branche rangée plate la pose.
            cell.tag = 0

            guard case .message(let localId) = item,
                  var message = self.store.domainMessage(for: localId, currentUserId: self.currentUserId) else {
                cell.contentConfiguration = nil
                return
            }
            self.applyVisitState(to: &message)
            let row = self.rowConversationContext
            let accent = row.accentHex
            let dark = row.isDark
            let direct = row.isDirect
            let myId = row.currentUserId
            let skin = row.bubbleSkin
            let host = self.router
            let stories = self.storyViewModel
            let statuses = self.statusViewModel
            let convList = self.conversationListViewModel

            // Snap dynamic VM-owned state into immutable lets. SwiftUI then
            // sees the bubble depend only on these primitive inputs (Equatable),
            // so VM @Published changes elsewhere don't re-render this cell.
            let vm = self.conversationViewModel
            // Recipient denominator for the all-or-nothing delivery indicator:
            // active conversation members EXCLUDING me. Prefer the gateway's
            // authoritative per-message `recipientCount` (active participants
            // minus the sender, computed server-side at fetch time); fall back to
            // the local member count only when the server did not provide it
            // (`0` — a socket-origin row or an older payload). Direct chats
            // resolve to 1 (the stored status is trusted verbatim); groups require
            // EVERY recipient before the bubble shows ✓✓ / indigo ✓✓.
            let serverRecipients = message.recipientCount
            let recipients = direct
                ? 1
                : (serverRecipients > 0
                    ? serverRecipients
                    : max(1, (vm?.currentConversation?.memberCount ?? 2) - 1))
            let translations = vm?.messageTranslations[message.id] ?? []
            let preferred = vm?.preferredTranslation(for: message.id)
            let transcription = vm?.messageTranscriptions[message.id]
            let translatedAudios = vm?.messageTranslatedAudios[message.id] ?? []
            // Active in-conversation search term — snapped as a primitive so the
            // Equatable bubble highlights matches in search-filter mode. Nil in
            // normal mode (no highlight). The visible cells reconfigure whenever
            // the filtered message set changes (which always accompanies a query
            // change), so the highlight stays in sync.
            let highlightTerm = vm?.currentSearchQuery
            // Galerie audio plein écran : `AudioFullscreenView` n'affiche son
            // pager que si cette liste est non-vide. Sans ce wiring, le tap
            // sur l'icône / chip plein écran d'une bulle audio ouvre un
            // ZStack contenant uniquement le `Color.black` de fond — d'où
            // l'écran noir observé en prod.
            let allAudioItems = vm?.allAudioItems ?? [], audioIndex = vm?.audioItemsByMessageId ?? [:]
            // Cold-open plein écran audio (F1) : sans lecture déjà active, la
            // carte Now Playing / l'avance auto doivent porter le même
            // contexte conversation que `ConversationViewModel.playAudio`
            // (mini-player / lock screen). `audioQueueTail(after:)` est
            // réutilisée telle quelle — jamais redéfinie ici.
            let conversationName = vm?.currentConversationName
            let audioQueueTailProvider: (String) -> [QueuedAudio] = { [weak self] attachmentId in
                self?.conversationViewModel?.audioQueueTail(after: attachmentId) ?? []
            }
            let mentionDisplayNames = vm?.mentionDisplayNames ?? [:]
            let isLastReceived = (vm?.lastReceivedMessageId == message.id)
            let isLastSent = (vm?.lastSentMessageId == message.id)
            let messageId = message.id
            // Flag-strip language selection — VM-owned (lifted out of the
            // bubble's @State so it flows through the Equatable gate). A tap
            // writes back to the VM, whose publisher triggers a targeted
            // reconfigure of this cell with the fresh snapped values.
            let languageSelection = vm?.bubbleLanguageSelections[messageId]
            let setActiveDisplayLanguage: ((String?) -> Void) = { [weak self] code in
                self?.conversationViewModel?.setBubbleActiveDisplayLanguage(code, for: messageId)
            }
            let setSecondaryLanguage: ((String?) -> Void) = { [weak self] code in
                self?.conversationViewModel?.setBubbleSecondaryLanguage(code, for: messageId)
            }
            // Avatar/name tap → profile deep link. Routed through the
            // controller-held Router so the bubble no longer needs the
            // `@EnvironmentObject Router` that re-rendered every visible
            // bubble on every Router publish.
            // Deux fiches, et le discriminant est l'existence d'un COMPTE.
            //
            // `deepLinkProfileUser` présente un compte : bio, bannière, voix,
            // langues — tout cela se demande par `User.id`. Un visiteur entré
            // par lien n'en a aucun ; le lui appliquer ouvrait une feuille vide,
            // exact pendant iOS du lien `/u/{pseudo}` mort côté web. Son
            // identité vit dans CETTE conversation et se demande par le couple
            // `(conversationId, participantId)`.
            // L'avis d'arrivée mène TOUJOURS à la fiche de participation, quelle
            // que soit la porte empruntée : c'est là que vit l'identité fournie
            // en entrant. Un arrivant qui a un compte y figure aussi, simplement
            // sans conditions d'entrée à énoncer.
            let openParticipantProfileHandler: ((String) -> Void) = { [weak self] participantId in
                self?.router.participantProfileTarget = ParticipantProfileTarget(
                    conversationId: message.conversationId,
                    participantId: participantId
                )
            }

            let openProfileHandler: ((ProfileSheetUser) -> Void) = { [weak self] user in
                self?.router.openProfile(user, inConversation: message.conversationId)
            }
            let user = AuthManager.shared.currentUser
            let userLanguages: (regional: String?, custom: String?) = (
                user?.regionalLanguage,
                user?.customDestinationLanguage
            )
            // Langue de piste AUDIO préférée du Prisme — même loi que
            // `ConversationViewModel.playAudio` (`AudioTrackLanguageResolver`).
            // Alimente le repli du builder pour que le drapeau-toggle d'un
            // vocal SANS traduction texte montre la bonne face et agisse.
            let preferredAudioLang = AudioTrackLanguageResolver.resolve(
                manualOverride: nil,
                originalLanguage: message.originalLanguage,
                preferredLanguages: ConversationLanguagePreferences(user: user).resolved,
                translatedAudios: translatedAudios
            )

            // Capture self weakly inside the @Sendable closure passed as
            // ThemedMessageBubble.onReplyTap. The bubble fires it on tap of
            // a reply chip; we forward to the controller's scroll routine.
            let scrollHandler: ((String) -> Void) = { [weak self] targetId in
                self?.scrollToMessage(localId: targetId)
            }
            let storyReplyHandler = self.onStoryReplyTap
            let swipeReplyHandler = self.onSwipeReply
            let swipeForwardHandler = self.onSwipeForward
            // Wrap the raw handler so each tap also carries the bubble cell's
            // on-screen frame — the quick-reaction bar anchors to it.
            let addReactionHandler: ((String) -> Void) = { [weak self] tappedId in
                guard let self else { return }
                self.onAddReaction?(tappedId, self.cellFrameInWindow(messageId: tappedId))
            }
            // Même patron qu'`addReactionHandler` : le frame de la cellule est
            // résolu ICI (UIKit, `cellFrameInWindow`) et voyage AVEC l'appel —
            // `MessageFramePreferenceKey` (mode Rivière uniquement) ne
            // traverse pas la frontière UIKit pour ce mode-ci (#4004, revue
            // 2026-08-27).
            let longPressHandler: ((String) -> Void) = { [weak self] tappedId in
                guard let self else { return }
                self.onLongPress?(tappedId, self.cellFrameInWindow(messageId: tappedId))
            }
            let quotedReference = message.replyTo
            let quoteJumpHandler: ((String) -> Void) = { [weak self] targetId in
                self?.followQuote(quotedReference, to: targetId)
            }
            let pieceLongPressHandler: ((String) -> Void) = { [weak self] pieceId in
                guard let self else { return }
                self.onLongPressPiece?(messageId, pieceId, self.cellFrameInWindow(messageId: messageId))
            }
            let toggleReactionHandler = self.onToggleReaction
            let attachmentReactionHandler = self.onReactToAttachment
            let selectionModeActive = self.isSelectionModeActive
            let selectedIds = self.selectedMessageIds
            let toggleSelectionHandler = self.onToggleSelection
            let editHandler = self.onEditMessage
            let selectHandler = self.onSelectMessage
            let composeHandler = self.onComposeFromMessage
            let imagineHandler = self.onImagineFromMessage
            let moreSheetHandler = self.onOpenMoreSheet
            let canEdit = self.canEditMessage
            let openReactPickerHandler = self.onOpenReactPicker
            let showInfoHandler = self.onShowMessageInfo
            let showReadStatusHandler = self.onShowReadStatus
            let retryHandler = self.onRetry
            let showReactionsHandler = self.onShowReactions
            let showTranslationHandler = self.onShowTranslationDetail
            let tapLocationHandler = self.onFocalTapLocation
            let shareFileHandler = self.onFocalShareFile
            let callBackHandler = self.onCallBack
            let callDetailHandler = self.onCallDetailRequest
            let mediaTapHandler = self.onMediaTap
            let consumeViewOnceHandler = self.onConsumeViewOnce
            let requestTranslationHandler = self.onRequestTranslation
            let isMine = message.isMe
            // Anneau story de l'expéditeur — snappé en input primitif comme
            // presence/mood : la cellule ne dépend pas du StoryViewModel, le
            // sink storyGroups (observeStore) reconfigure les cellules
            // visibles quand l'état vu/non-vu change.
            let senderId = message.senderId
            let senderRingState: StoryRingState = isMine
                ? .none
                : stories.storyRingState(forUserId: senderId)
            let senderIsHere: ConversationHere = isMine ? .absent : self.conversationHere[message.viewingKey]
            let senderPresence: PresenceState? = isMine ? nil : PresenceManager.shared.presenceState(forSenderOf: message)
            let viewSenderStoryHandler = self.onViewSenderStory

            // Menu d'appui long — DEUX chemins par version d'OS (miroir des
            // lignes de conversation) :
            // - iOS 26+ : menu contextuel NATIF (Liquid Glass) attaché au
            //   contenu SwiftUI via `.nativeMessageContextMenu`. Le builder
            //   vient de `ConversationView` (toutes les actions y sont déjà
            //   résolues) ; on le fige UNE fois en AnyView stable — précédent
            //   anti-crash EXC_BAD_ACCESS de `ConversationRowItem`.
            // - < iOS 26 : overlay custom (long-press du BubbleSwipeContainer
            //   → `onLongPress` → état d'overlay de ConversationView). Le menu
            //   natif UIMenu ne se style pas comme cet overlay.
            // **Le `.contextMenu` natif ne prend plus la pression** (#6117).
            //
            // Il la prenait sous iOS 26, ce qui coupait le menu Meeshy sur les
            // téléphones récents : le même appui long rendait deux menus
            // différents selon la version. La directive porteur du 2026-09-12
            // rend le menu Meeshy à l'appui long partout, et confie le menu
            // SYSTÈME au DOUBLE TAP — où il se présente par code
            // (`UIEditMenuInteraction`, `NativeMessageEditMenu.swift`), ce
            // qu'un `.contextMenu` ne sait pas faire.
            //
            // `nativeMenu` reste déclaré à `nil` plutôt que supprimé : c'est
            // lui qui commande, vingt lignes plus bas, le RETRAIT de
            // l'`UIContextMenuInteraction` que le système pose sur la cellule.
            // Le supprimer laisserait cette interaction en place et rouvrirait
            // la pression système que ce lot vient de fermer.
            let nativeMenu: (() -> AnyView)? = nil

            // Chemin overlay custom uniquement : retirer toute
            // UIContextMenuInteraction que le système aurait posée. Sur le
            // chemin natif on la GARDE — c'est précisément notre menu.
            if nativeMenu == nil {
                cell.interactions
                    .filter { $0 is UIContextMenuInteraction }
                    .forEach { cell.removeInteraction($0) }
            }

            // Bulles avec piste temporelle (audio/vidéo) → swipe résistant :
            // le curseur de lecture se manipule sans déclencher Répondre/
            // Transférer, sauf swipe horizontal franc (seuil relevé).
            let hasTimebasedMedia = message.attachments.contains {
                AttachmentKind(mimeType: $0.mimeType).hasTimebasedTrack
            }
            // Bulle construite UNE fois, réutilisée pour le contenu de cellule
            // ET l'aperçu du `.contextMenu` natif (iOS 26) : l'aperçu élevé
            // montre alors la VRAIE bulle/attachement d'origine.
            // (Equatable re-render gate conservé : le @State restant de la bulle
            // vit sur un CHILD du gate stateless, ses invalidations contournent
            // `==` — topologie du `FeedPostCard().equatable()`.)
            // Fabrique la MÊME bulle en deux tenues : `standalone: false` pour
            // le contenu de cellule (alignement isMe/reçu via les spacers de
            // row) et `standalone: true` pour l'aperçu du `.contextMenu` natif
            // (bulle qui épouse son contenu → platter système collé à la bulle,
            // plus de « card » bordé). Une seule liste de paramètres, pas de
            // duplication de l'init ~40 champs.
            // Mode Bulles : c'est le DERNIER message d'une suite qui porte
            // l'identité — `BubbleStandardLayout.showIdentityBar` s'accroche à
            // `isLastInGroup`, et l'espacement bas aussi (10pt en fin de suite,
            // 2pt à l'intérieur). Ce drapeau était figé à `true`, donc AUCUN
            // regroupement n'existait : chaque bulle reçue montrait son avatar.
            //
            // Même règle de continuité que la tête de groupe du mode Focal
            // (`MessageDayGrouping`) — un message système n'entre dans aucune
            // suite, et deux expéditeurs sans identifiant ne sont pas la même
            // personne.
            let isLastInGroup: Bool = {
                guard let index = self.store.index(of: localId),
                      index + 1 < self.store.messages.count else { return true }
                let next = self.store.messages[index + 1]
                return MessageDayGrouping.isGroupTail(
                    current: .init(
                        senderId: senderId,
                        isSystem: message.messageSource == .system,
                        createdAt: message.createdAt
                    ),
                    next: .init(
                        senderId: next.senderId,
                        // `MessageRecord` porte la source en CHAÎNE, `MeeshyMessage`
                        // l'énumération — comparaison au `rawValue`, pas à un littéral.
                        isSystem: next.messageSource == MeeshyMessage.MessageSource.system.rawValue,
                        createdAt: next.createdAt
                    )
                )
            }()
            // Les rappels faibles sont formés HORS de `makeThemedBubble` : une
            // capture `[weak self]` imbriquée oblige la fermeture englobante à
            // retenir `self` en fort, et l'aperçu du menu la stocke (#10853).
            let quotedAuthorTapHandler: (ReplyReference) -> Void = { [weak self] ref in
                self?.openQuotedAuthorProfile(ref)
            }
            let quotedMediaTapHandler: (ReplyReference) -> Void = { [weak self] ref in
                self?.openQuotedMedia(ref)
            }
            let playAudioHandler: (String) -> Void = { [weak self] attachmentId in
                self?.conversationViewModel?.playAudio(attachmentId: attachmentId)
            }
            let consentNoticeHandler: () -> Void = { [weak self] in self?.router.push(.settings) }
            let makeThemedBubble: (Bool) -> ThemedMessageBubble = { standalone in
                ThemedMessageBubble(
                        message: message,
                        contactColor: accent,
                        recipientCount: recipients,
                        isDirect: direct,
                        isDark: dark,
                        transcription: transcription,
                        translatedAudios: translatedAudios,
                        textTranslations: translations,
                        preferredTranslation: preferred,
                        // Résolue UNE fois ici (déjà calculée pour la rangée
                        // plate) : la bulle ne la recalcule plus à chaque
                        // évaluation de son body (audit fluidité 2026-08-21).
                        preferredAudioLangCode: preferredAudioLang,
                        showAvatar: !direct,
                        presenceState: senderPresence,
                        senderIsHere: senderIsHere, senderMoodEmoji: statuses.statusForUser(userId: senderId)?.moodEmoji,
                        senderStoryRingState: senderRingState, onSenderMoodTap: statuses.moodTapHandler(for: senderId),
                        onViewStory: (senderRingState != .none)
                            ? { viewSenderStoryHandler?(senderId) }
                            : nil,
                        onAddReaction: addReactionHandler,
                        onToggleReaction: { emoji in toggleReactionHandler?(messageId, emoji) },
                        onOpenReactPicker: openReactPickerHandler,
                        onShowInfo: { showInfoHandler?(messageId) },
                        onShowReactions: showReactionsHandler,
                        onShowReadStatus: showReadStatusHandler,
                        onRetry: retryHandler,
                        onReplyTap: quoteJumpHandler,
                        onStoryReplyTap: storyReplyHandler,
                        onMediaTap: mediaTapHandler,
                        // LOI DES ZONES (2026-08-24) — les MEMES deux
                        // gestionnaires que la rangee plate, montes ici sur la
                        // peau BULLE, celle que voit tout le monde tant que le
                        // programme beta reste eteint (defaut OFF).
                        onQuotedAuthorTap: quotedAuthorTapHandler,
                        onQuotedMediaTap: quotedMediaTapHandler,
                        onConsumeViewOnce: consumeViewOnceHandler,
                        onReactToAttachment: { attId, emoji in attachmentReactionHandler?(attId, messageId, emoji) },
                        onRequestTranslation: requestTranslationHandler,
                        onShowTranslationDetail: showTranslationHandler,
                        onPlayAudio: playAudioHandler,
                        allAudioItems: allAudioItems, messageAudioItems: audioIndex[message.id] ?? [],
                        conversationName: conversationName,
                        audioQueueTailProvider: audioQueueTailProvider,
                        onScrollToMessage: scrollHandler,
                        onCallBack: callBackHandler,
                        onLongPressCallDetail: { callDetailHandler?(messageId) },
                        // Le drapeau-toggle pilote AUSSI la piste audio et
                        // ses segments karaoké (user 2026-08-18) — canal
                        // resté mort depuis sa pose (jamais alimenté), le
                        // reste du chemin ThemedMessageBubble →
                        // BubbleStandardLayout → AudioMediaView était déjà
                        // câblé de bout en bout.
                        activeAudioLanguage: languageSelection?.activeDisplayLangCode,
                        isLastInGroup: isLastInGroup,
                        isLastReceivedMessage: isLastReceived,
                        isLastSentMessage: isLastSent,
                        mentionDisplayNames: mentionDisplayNames,
                        highlightSearchTerm: highlightTerm,
                        currentUserId: myId,
                        userLanguages: userLanguages,
                        activeDisplayLangCode: languageSelection?.activeDisplayLangCode,
                        secondaryLangCode: languageSelection?.secondaryLangCode,
                        onSetActiveDisplayLanguage: setActiveDisplayLanguage,
                        onSetSecondaryLanguage: setSecondaryLanguage,
                        onOpenProfile: openProfileHandler,
                        onOpenParticipantProfile: openParticipantProfileHandler,
                        voiceConsentMissing: vm?.voiceConsentMissing ?? false,
                        onTapConsentNotice: consentNoticeHandler,
                        standalone: standalone
                )
            }
            let messageBubble = EquatableMessageBubble(bubble: makeThemedBubble(false)).equatable()

            // WS-7 (F-086) — mux de rangée SOUS DRAPEAU (contrat §WS-6 travail
            // 2) : Focal/Script (FocalRow, WS-4 GELÉ) vs bulle historique.
            // `readingMode.usesFlatRow` (extension F-085) est le SEUL point de
            // branchement — vrai pour `.focal` ET `.script`, jamais pour
            // `.summary`/`.river`/`.bubbles`. Gardé SOUS `if` (pas un ternaire) :
            // la construction (BubbleContent, groupement, présence) ne doit
            // JAMAIS s'exécuter sur le chemin bulle — flag off ⇒ zéro coût
            // additionnel, bit-à-bit identique (contrat §WS-6).
            //
            // ÉCART SIGNALÉ (RE-PREUVE, rapport F-086) : le contrat §WS-6
            // travail 2 assume que WS-6 construit `FocalRowInput` « à partir
            // des lets déjà snapés — aucun calcul nouveau ». Trois lookups
            // s'avèrent RÉELLEMENT nouveaux — aucun équivalent ailleurs dans
            // le dépôt : `isFirstInGroup` (le regroupement vit désormais dans
            // `MessageDayGrouping` — tête ici, queue au-dessus pour les bulles,
            // même règle de continuité), `senderPresence`
            // (`PresenceManager.shared`, déjà utilisé par `ConversationView
            // .headerPresenceState`) et `isRightToLeft`
            // (`collectionView.effectiveUserInterfaceLayoutDirection`,
            // API UIKit standard). Les trois sont des
            // lookups TRIVIAUX via des API déjà établies ailleurs dans le
            // dépôt — signalés, pas improvisés à l'aveugle.
            let focalRow: EquatableFocalRow?
            if self.readingMode.usesFlatRow {
                let record = self.store.message(for: localId)
                let isOptimistic = record.map { Self.optimisticStates.contains($0.state) } ?? false
                let focalContent = BubbleContent(
                    message: message,
                    translations: translations,
                    preferredTranslation: preferred,
                    translatedAudios: translatedAudios,
                    userLanguages: userLanguages,
                    secondaryLangCode: languageSelection?.secondaryLangCode,
                    activeDisplayLangCode: languageSelection?.activeDisplayLangCode,
                    preferredAudioLangCode: preferredAudioLang,
                    currentUserId: myId,
                    recipientCount: recipients
                )
                // « Pseudo · HH:mm en tête de groupe uniquement » (contrat
                // §WS-4) : un message ouvre un nouveau groupe quand son
                // voisin CHRONOLOGIQUEMENT PRÉCÉDENT (`store.messages`,
                // ordre chronologique croissant, `index - 1`) change
                // d'expéditeur ou de jour calendaire. Heuristique standard
                // (iMessage/WhatsApp) — voir écart signalé ci-dessus.
                let isFirstInGroup: Bool = {
                    guard let index = self.store.index(of: localId), index > 0 else { return true }
                    let previous = self.store.messages[index - 1]
                    return MessageDayGrouping.isGroupHead(
                        previous: .init(
                            senderId: previous.senderId,
                            // `MessageRecord` (persistance) porte la source en CHAÎNE,
                            // là où `MeeshyMessage` porte l'énumération — on compare
                            // au `rawValue` plutôt qu'à un littéral.
                            isSystem: previous.messageSource == MeeshyMessage.MessageSource.system.rawValue,
                            createdAt: previous.createdAt
                        ),
                        current: .init(
                            senderId: senderId,
                            isSystem: message.messageSource == .system,
                            createdAt: message.createdAt
                        )
                    )
                }()
                cell.tag = FocalScrollPerspective.cellTag(isFirstInGroup: isFirstInGroup, showsFocusDetails: self.focalDetailedLocalId == localId)
                let focalInput = FocalRowInput(
                    localId: localId,
                    serverId: record?.serverId,
                    content: focalContent,
                    density: self.readingMode == .script ? .script : .focal,
                    isFirstInGroup: isFirstInGroup,
                    isLastInGroup: isLastInGroup,
                    senderId: senderId,
                    senderDisplayName: message.senderName ?? message.senderUsername ?? "",
                    senderUsername: message.senderUsername,
                    senderAvatarURL: message.senderAvatarURL,
                    senderThumbHash: nil,
                    senderColorHex: message.senderColor ?? accent,
                    senderPresence: senderPresence ?? .offline,
                    senderIsHere: senderIsHere,
                    senderStoryRing: senderRingState,
                    senderMoodEmoji: statuses.statusForUser(userId: senderId)?.moodEmoji,
                    senderIsAnonymous: message.senderIsAnonymous,
                    senderRing: isMine ? nil : message.senderRing,
                    accentHex: accent,
                    isDark: dark,
                    isDirect: direct,
                    isRightToLeft: self.collectionView.effectiveUserInterfaceLayoutDirection == .rightToLeft,
                    isOptimistic: isOptimistic,
                    isAgentAuthored: message.messageSource == .agent,
                    // R6-2 — WS-10 A LIVRÉ `isAgentGrammarEnabled`
                    // (`MeeshyFeatureFlags.swift:69`) : ce site le branche
                    // enfin. Le drapeau lui-même reste OFF PAR DÉFAUT (§5.2
                    // du contrat : le chemin serveur non écrivant n'existe
                    // toujours pas — activation soumise à décision produit
                    // écrite, non prise ici) ; brancher le site rend
                    // seulement le levier réel, il ne l'actionne pas.
                    showsAgentGrammar: MeeshyFeatureFlags.isAgentGrammarEnabled,
                    highlightSearchTerm: highlightTerm,
                    mentionDisplayNames: mentionDisplayNames,
                    userLanguages: userLanguages,
                    activeDisplayLangCode: languageSelection?.activeDisplayLangCode,
                    secondaryLangCode: languageSelection?.secondaryLangCode,
                    voiceConsentMissing: vm?.voiceConsentMissing ?? false,
                    transcription: transcription?.text,
                    translatedAudios: translatedAudios,
                    allAudioItems: allAudioItems,
                    conversationName: conversationName ?? "",
                    // Matrice §5 « Effets, mentions, appels » : le bitfield du
                    // message alimente `.messageEffects` de FocalRow — resté
                    // au défaut `.none` jusqu'au 2026-08-18 (feature morte,
                    // audit) : aucune rangée Focal ne jouait le moindre effet.
                    effects: message.effects,
                    // Script/Focal : le (+) d'ajout rapide de réaction sur le
                    // dernier message reçu — même signal que la bulle.
                    isLastReceivedMessage: isLastReceived,
                    // Focal : le message en focus (posé à la POSE par
                    // `syncFocalFocusDetails`) porte ses détails complets.
                    isFocused: self.focalDetailedLocalId == localId,
                    isExpanded: self.expandedLongMessageLocalId == localId,
                    sentAt: message.createdAt,
                    // Pré-calculée ici, jamais dans un body (directive 2026-08-22).
                    focusTimestamp: self.focalDetailedLocalId == localId ? self.focalFocusTimestamp(for: message.createdAt) : nil,
                    availableWidth: self.rowAvailableWidth
                )
                var focalActions = FocalRowActions(onMoodTap: statuses.moodTapHandler(for: senderId))
                focalActions.onToggleReaction = { emoji in toggleReactionHandler?(messageId, emoji) }
                focalActions.onAddReaction = addReactionHandler
                focalActions.onOpenReactPicker = openReactPickerHandler
                focalActions.onOpenParticipantProfile = openParticipantProfileHandler
                focalActions.onShowReactions = showReactionsHandler
                focalActions.onShowReadStatus = showReadStatusHandler
                focalActions.onShowMessageInfo = showInfoHandler
                focalActions.onRetry = retryHandler
                focalActions.onReplyTap = quoteJumpHandler
                focalActions.onStoryReplyTap = storyReplyHandler
                focalActions.onMediaTap = mediaTapHandler
                focalActions.onConsumeViewOnce = consumeViewOnceHandler
                focalActions.onReactToAttachment = { attId, emoji in attachmentReactionHandler?(attId, messageId, emoji) }
                focalActions.onRequestTranslation = requestTranslationHandler
                focalActions.onShowTranslationDetail = showTranslationHandler
                focalActions.onToggleExpanded = { [weak self] in self?.toggleLongMessageExpansion(localId) }
                focalActions.onTapLocation = { place in tapLocationHandler?(place, messageId) }
                focalActions.onShareFile = shareFileHandler
                focalActions.onSetActiveDisplayLanguage = { [weak self] msgId, code in
                    self?.conversationViewModel?.setBubbleActiveDisplayLanguage(code, for: msgId)
                }
                // Rangée ORDINAIRE (jamais magnifiée) montée sur le DERNIER
                // message d'un groupe (#3919) : le choix posé là s'applique
                // à CHAQUE message du groupe qu'elle ferme.
                focalActions.onSetActiveDisplayLanguageForGroup = { [weak self] msgId, code in
                    guard let self else { return }
                    for memberId in self.messageIdsInGroup(endingAt: msgId) {
                        self.conversationViewModel?.setBubbleActiveDisplayLanguage(code, for: memberId)
                    }
                }
                focalActions.onSetSecondaryLanguage = { [weak self] msgId, code in
                    self?.conversationViewModel?.setBubbleSecondaryLanguage(code, for: msgId)
                }
                focalActions.onPlayAudio = { [weak self] attachmentId in
                    self?.conversationViewModel?.playAudio(attachmentId: attachmentId)
                }
                // Parité audio avec le chemin bulle : la MÊME file de lecture
                // continue et le MÊME tap de consentement (→ Réglages) — les
                // deux étaient les seuls câblages absents du lecteur Focal.
                focalActions.audioQueueTailProvider = audioQueueTailProvider
                focalActions.onTapConsentNotice = { [weak self] in self?.router.push(.settings) }
                focalActions.onOpenProfile = openProfileHandler
                // Citations riches (user 2026-08-18), sous LOI DES ZONES
                // depuis le 2026-08-24 : AVATAR → profil de l'auteur CITÉ
                // (le NOM ne l'ouvre plus, il retombe sur le retour au
                // message cité) ; zone média → plein écran / lecture.
                focalActions.onQuotedAuthorTap = { [weak self] ref in
                    self?.openQuotedAuthorProfile(ref)
                }
                focalActions.onQuotedMediaTap = { [weak self] ref in
                    self?.openQuotedMedia(ref)
                }
                // Le « … » de la barre de contrôles ouvre EXACTEMENT le menu
                // de l'appui long — même gestionnaire, donc même liste
                // d'actions (édition, suppression, signalement, traduction),
                // sans qu'aucune seconde liste n'existe à maintenir.
                focalActions.onMore = { _ in longPressHandler(messageId) }
                focalActions.onViewStory = (senderRingState != .none) ? { _ in viewSenderStoryHandler?(senderId) } : nil
                focalActions.onCallBack = { _ in
                    guard let summary = message.callSummary else { return }
                    callBackHandler?(summary)
                }
                focalActions.onLongPressCallDetail = { _ in callDetailHandler?(messageId) }
                focalRow = EquatableFocalRow(row: FocalRow(input: focalInput, actions: focalActions))
            } else {
                focalRow = nil
            }

            // Le cadre de l'élu déborde de la cellule : jamais rogné, dessiné au-dessus
            // des voisines, et touchable (`touchOverflow`, posé par la passe Focal).
            let isFocusedCell = (self.readingMode.usesFlatRow && self.focalDetailedLocalId == localId) || self.expandedLongMessageLocalId == localId
            cell.clipsToBounds = false
            cell.contentView.clipsToBounds = false
            cell.layer.zPosition = isFocusedCell ? 1 : 0

            // #10853 — le contenu de `BubbleSwipeContainer` et l'aperçu du menu
            // sont des fermetures STOCKÉES par la cellule : y lire `self`
            // capturait le contrôleur en fort (contrôleur → collection →
            // cellule → fermeture → contrôleur), et le cycle gardait en vie,
            // à chaque fermeture d'écran, le modèle et son handler de socket.
            // Elles ne reçoivent que des valeurs résolues ici.
            let longMessageExpansion = self.longMessageExpansion(for: localId)
            let timestampReveal = self.timestampReveal
            cell.contentConfiguration = UIHostingConfiguration {
                BubbleSwipeContainer(
                    isMine: isMine,
                    messageCreatedAt: message.createdAt,
                    // Masquée pendant que l'overlay d'appui long présente CETTE
                    // bulle : seule la copie élevée reste visible (anti ghost).
                    isHiddenForOverlay: message.id == self.overlaidMessageId,
                    resistance: hasTimebasedMedia ? .resistant : .normal,
                    // Rangée plate : reply à droite/icône gauche, forward à
                    // gauche/icône droite — uniforme, loi `BubbleSwipeResistance`.
                    uniformFlatDirection: self.readingMode.usesFlatRow,
                    onSwipeReply: { swipeReplyHandler?(messageId) },
                    onSwipeForward: { swipeForwardHandler?(messageId) },
                    onLongPress: { longPressHandler(messageId) },
                    // **L'appui long ouvre le menu MEESHY sur TOUTES les
                    // versions** (#6117, directive porteur du 2026-09-12 :
                    // « le menu meeshy se fait au longpress »).
                    //
                    // Il valait `nativeMenu == nil` — donc sous iOS 26 le
                    // long-press custom était COUPÉ et le `.contextMenu` natif
                    // possédait la pression. Le même geste rendait alors deux
                    // menus différents selon le téléphone ; la directive rend
                    // à chaque geste une identité stable de iOS 16 à iOS 26,
                    // et confie le natif au double tap.
                    enableLongPress: true,
                    isSelectionModeActive: selectionModeActive,
                    isSelected: selectedIds.contains(messageId),
                    onToggleSelection: { toggleSelectionHandler?(messageId) },
                    // Les opérations primaires du menu SYSTÈME (double tap), composées ici : seul étage qui
                    // tient à la fois le `messageId` et les rappels déjà résolus par `ConversationView`.
                    editMenuActions: MessageEditMenuAction.primaires(
                        messageId: messageId,
                        peutEditer: canEdit?(messageId) ?? false,
                        editer: editHandler,
                        selectionner: selectHandler,
                        composer: message.exitOffer.offers(.publish) ? composeHandler : nil,
                        imager: message.exitOffer.offers(.imagine) && MessageCardSubject.isExportable(message, now: Date()) ? imagineHandler : nil,
                        repondre: swipeReplyHandler,
                        transferer: message.isForwardable ? swipeForwardHandler : nil,
                        plus: moreSheetHandler
                    )
                ) {
                    if let focalRow {
                        focalRow.equatable()
                    } else {
                        messageBubble.longMessageFocus(longMessageExpansion)
                    }
                }
                .environmentObject(host)
                .environmentObject(stories)
                .environmentObject(statuses)
                .environment(\.bubbleSkin, skin)
                // La bulle se mesure à CETTE liste — colonne d'iPad, fenêtre détachée —, jamais à la fenêtre principale.
                .environment(\.bubbleContainerWidth, self.collectionView.bounds.width > 0 ? self.collectionView.bounds.width : nil)
                // #9907 — l'appui long d'une tuile vise CETTE pièce ; aucun en sélection.
                .environment(\.messagePieceLongPress, selectionModeActive ? nil : pieceLongPressHandler)
                .environment(\.pieceSpotlight, self.pieceSpotlight.eraseToAnyPublisher())
                .conversationListObject(convList).announcesCaptures() // #9617 — le fil déclare ce qu'il montre
                // Révélé des heures au défilement (successeur de la pilule
                // « jour · heure »). Observé par `FocalRevealedTime` SEULE —
                // une `Text` et rien d'autre — donc son basculement
                // n'invalide jamais la rangée entière ni ne traverse le gate
                // `EquatableFocalRow`.
                .environmentObject(timestampReveal)
                // Counter-flip to undo the parent collectionView.transform.
                .scaleEffect(x: 1, y: -1)
                // iOS 26+ : `.contextMenu` NATIF + aperçu = le RENDU d'origine.
                // En rangée plate (Focal/Script), l'aperçu est LA RANGÉE PLATE
                // (lot 3.3, 2026-08-18 — l'aperçu montrait une BULLE alors que
                // l'utilisateur pressait une rangée plate : deux rendus pour
                // le même message). En bulles : la vraie bulle « standalone »
                // (épouse son contenu, pas de spacers de row), mise à
                // l'échelle SEULEMENT si trop haute (proportions intactes) —
                // « prise de sa position et affichée comme avant » (feedback
                // device 2026-07-14). No-op < iOS 26 → overlay custom.
                .nativeMessageContextMenu(menu: nativeMenu) {
                    MessageMenuPreviewContainer {
                        if let focalRow {
                            focalRow
                                .environmentObject(host)
                                .environmentObject(stories)
                                .environmentObject(statuses)
                                .conversationListObject(convList)
                                .environmentObject(timestampReveal)
                        } else {
                            makeThemedBubble(true)
                                .environment(\.bubbleSkin, skin)
                                .environmentObject(host)
                                .environmentObject(stories)
                                .environmentObject(statuses)
                                .conversationListObject(convList)
                        }
                    }
                }
            }
            .margins(.all, 0)
            cell.backgroundColor = .clear
            // Cellule (re)configurée : à plat. Focal (et le dépliage, #8147) la
            // reposent à l'affichage (`willDisplay`) — jamais une pose héritée
            // d'un recyclage.
            FocalScrollPerspective.reset(cell.contentView.layer)
        }

        // Séparateur de premier non-lu (#7222) — cluster dédié, voir
        // `MessageListViewController+UnreadSeparator.swift`.
        let unreadSeparatorRegistration = makeUnreadSeparatorRegistration()

        dataSource = UICollectionViewDiffableDataSource(collectionView: collectionView) { cv, indexPath, item in
            switch item {
            case .message:
                return cv.dequeueConfiguredReusableCell(using: messageRegistration, for: indexPath, item: item)
            case .dayHeader:
                return cv.dequeueConfiguredReusableCell(using: dayHeaderRegistration, for: indexPath, item: item)
            case .typingIndicator:
                return cv.dequeueConfiguredReusableCell(using: typingRegistration, for: indexPath, item: item)
            case .conversationStart:
                return cv.dequeueConfiguredReusableCell(using: startRegistration, for: indexPath, item: item)
            case .firstUnreadSeparator:
                return cv.dequeueConfiguredReusableCell(using: unreadSeparatorRegistration, for: indexPath, item: item)
            }
        }
    }
}
