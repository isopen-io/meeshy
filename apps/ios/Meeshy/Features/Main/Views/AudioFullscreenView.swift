import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Audio Fullscreen Source (surface-agnostic)

/// Ce dont la vue plein écran audio a besoin, DÉCOUPLÉ de `Message` : les
/// conversations, commentaires, posts et réels fournissent tous un audio avec
/// une transcription, des versions traduites (Prisme) et un auteur. Chaque
/// surface construit une `AudioFullscreenSource` depuis son propre modèle
/// (message ou média de feed) — l'expérience plein écran (transcription +
/// bandeau de langues + sauvegarde) est ainsi la même partout.
struct AudioFullscreenSource: Identifiable {
    let id: String                       // attachment.id
    let attachment: MessageAttachment
    let transcription: MessageTranscription?
    let translatedAudios: [MessageTranslatedAudio]
    let originalLanguage: String
    let caption: String
    let author: ProfileSheetUser
    let createdAt: Date
    /// Renseigné uniquement en conversation — permet de scroller vers le
    /// message d'origine à la fermeture. `nil` pour feed/commentaire/réel/post.
    let messageId: String?
    /// Id "session" utilisé par le coordinator (`playThroughCoordinator`,
    /// `attachmentFinishedPublisher`) pour reconnaître deux lectures comme
    /// faisant partie du même ensemble. En conversation : la vraie
    /// `Conversation.id`. Standalone (feed/commentaire/post) : l'id de
    /// l'ENTITÉ PORTEUSE (commentId / post.id / repost.id) — repris tel quel
    /// du `QueuedAudio.conversationId` que le `CoordinatedAudioPlayer` inline
    /// de la même surface utilise déjà, pour que l'ouverture plein écran de
    /// cette entité soit vue comme la MÊME session (pas de reset de file/
    /// carte Now Playing). `nil` uniquement pour un plein écran sans session
    /// inline connue à faire correspondre (ex. réels, non wirés à ce jour) —
    /// jamais un simple oubli de câblage sur une surface qui, elle, a un id
    /// porteur disponible.
    let conversationId: String?
    /// Nom affiché par la carte Now Playing (conversation, sinon auteur).
    let nowPlayingContextName: String
    /// File « à suivre » fournie par la conversation (vocaux non écoutés
    /// après celui-ci) ; nil pour les surfaces standalone.
    let queueTailProvider: (() -> [QueuedAudio])?

    var authorName: String { author.displayName ?? author.username }
    var authorAvatarURL: String? { author.avatarURL }
    var authorUserId: String { author.userId ?? "" }

    init(id: String,
         attachment: MessageAttachment,
         transcription: MessageTranscription?,
         translatedAudios: [MessageTranslatedAudio],
         originalLanguage: String,
         caption: String,
         author: ProfileSheetUser,
         createdAt: Date,
         messageId: String? = nil,
         conversationId: String? = nil,
         nowPlayingContextName: String? = nil,
         queueTailProvider: (() -> [QueuedAudio])? = nil) {
        self.id = id
        self.attachment = attachment
        self.transcription = transcription
        self.translatedAudios = translatedAudios
        self.originalLanguage = originalLanguage
        self.caption = caption
        self.author = author
        self.createdAt = createdAt
        self.messageId = messageId
        self.conversationId = conversationId
        self.nowPlayingContextName = nowPlayingContextName ?? (author.displayName ?? author.username)
        self.queueTailProvider = queueTailProvider
    }

    /// Chemin conversation : dérive l'auteur et les métadonnées du `Message`.
    /// `conversationId` est dérivé de `item.message.conversationId` — déjà
    /// disponible sans dépendre du ViewModel — pour que la fermeture-sur-
    /// suppression et le filtrage des événements de fin de lecture
    /// (`ConversationAudioCoordinator` / `ConversationViewModel`) fonctionnent
    /// même quand l'appelant ne passe pas explicitement ce paramètre.
    init(from item: ConversationViewModel.AudioItem,
         conversationId: String? = nil,
         nowPlayingContextName: String? = nil,
         queueTailProvider: (() -> [QueuedAudio])? = nil) {
        self.init(
            id: item.id,
            attachment: item.attachment,
            transcription: item.transcription,
            translatedAudios: item.translatedAudios,
            originalLanguage: item.message.originalLanguage,
            caption: item.message.content,
            author: ProfileSheetUser.from(message: item.message),
            createdAt: item.message.createdAt,
            messageId: item.message.id,
            conversationId: conversationId ?? item.message.conversationId,
            nowPlayingContextName: nowPlayingContextName,
            queueTailProvider: queueTailProvider
        )
    }

    /// Mappe cette source vers le `QueuedAudio` que le coordinator attend pour
    /// piloter la piste ACTIVE (`urlString` porte la variante de langue
    /// choisie ; les autres champs restent ceux de la source).
    func queuedAudio(urlString: String) -> QueuedAudio {
        QueuedAudio(
            attachmentId: attachment.id,
            messageId: messageId ?? attachment.id,
            conversationId: conversationId ?? "",
            fileUrl: urlString,
            durationMs: attachment.duration ?? 0,
            senderName: authorName,
            senderAvatarURL: authorAvatarURL,
            receivedAt: createdAt
        )
    }
}

extension AudioFullscreenSource {

    /// La piste que sert une élection du Prisme (`SocialAudioTrack`) : la
    /// version traduite de cette langue si elle existe, l'original sinon.
    func servedTrackURL(selection: String) -> String {
        guard selection != SocialAudioTrack.originalSentinel,
              let audio = translatedAudios.first(where: { $0.targetLanguage.lowercased() == selection.lowercased() })
        else { return attachment.fileUrl }
        return audio.url
    }

    /// L'entrée de file d'une page qu'on n'a pas encore ouverte : la piste
    /// que sa page servirait en s'ouvrant — la même élection, jamais une
    /// seconde descente.
    @MainActor
    var openingQueuedAudio: QueuedAudio {
        queuedAudio(urlString: servedTrackURL(selection: SocialAudioTrack.openingSelection(for: self)))
    }
}

// MARK: - Audio Fullscreen Container (swipe navigation + dismiss)

/// **Le plein écran des vocaux** — un pager de pages `AudioFullscreenPage`,
/// dans l'ordre de RÉCEPTION (#10383), sur un fond qui suit le thème.
///
/// Le conteneur tient ce qui dépasse une page : l'ordre, le chrome qui
/// s'efface (`FullscreenChromeState`), l'enchaînement — la page suit la piste
/// que le lecteur partagé joue —, et les deux couches où l'on PARLE du vocal
/// (rangée d'émojis, barre de réponse, #8916), au-dessus de tout.
struct AudioFullscreenView: View {
    /// La fenêtre qui porte la vue (Stage Manager, Split View) — la fenêtre clé en repli.
    @Environment(\.sceneWindowSize) var sceneWindowSize
    private var hostHeight: CGFloat { SceneWindowSize.resolve(sceneWindowSize, fallback: DeviceLayout.windowSize).height }
    let allAudioItems: [AudioFullscreenSource]
    let startAttachmentId: String
    let contactColor: String
    var mentionDisplayNames: [String: String] = [:]
    var onDismissToMessage: ((String) -> Void)?
    /// Fournit l'emoji d'humeur d'un userId (décoration avatar). Optionnel :
    /// la conversation le branche sur son `StatusViewModel` ; le feed passe
    /// `nil`. Permet de présenter cette vue depuis N'IMPORTE quelle surface
    /// sans dépendre d'un `@EnvironmentObject StatusViewModel` (qui crashe à
    /// travers une barrière `fullScreenCover`, cf. lessons).
    var moodEmojiProvider: ((String) -> String?)?
    var moodTapProvider: ((String) -> ((CGPoint) -> Void)?)?
    /// Réagir, répondre, créer avec ce son (#8916) — `nil` ⇒ aucun bouton.
    var actions: AudioFullscreenActions?

    init(allAudioItems: [AudioFullscreenSource],
         startAttachmentId: String,
         contactColor: String,
         mentionDisplayNames: [String: String] = [:],
         onDismissToMessage: ((String) -> Void)? = nil,
         moodEmojiProvider: ((String) -> String?)? = nil,
         moodTapProvider: ((String) -> ((CGPoint) -> Void)?)? = nil,
         actions: AudioFullscreenActions? = nil) {
        let ordered = AudioFullscreenSequence.ordered(allAudioItems, receivedAt: \.createdAt)
        self.allAudioItems = ordered
        self.startAttachmentId = startAttachmentId
        // La page d'entrée est posée dès l'`init`, jamais dans un `onAppear` :
        // sinon la page 0 naît ACTIVE, lance sa lecture, et la page suivie
        // (`followActiveTrack`) ramènerait l'écran sur elle au lieu du vocal
        // touché.
        let startIndex = ordered.firstIndex { $0.attachment.id == startAttachmentId } ?? 0
        self._currentIndex = State(initialValue: startIndex)
        self._currentPageID = State(initialValue: ordered.indices.contains(startIndex) ? ordered[startIndex].id : nil)
        self.contactColor = contactColor
        self.mentionDisplayNames = mentionDisplayNames
        self.onDismissToMessage = onDismissToMessage
        self.moodEmojiProvider = moodEmojiProvider
        self.moodTapProvider = moodTapProvider
        self.actions = actions
    }

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOverRunning
    @State private var currentPageID: String?
    @State private var currentIndex: Int = 0
    @State private var dragOffset: CGFloat = 0
    @State private var isDismissing = false
    /// Le chrome à l'écran, effacé, ou voilé par une ouverture — UNE loi pour
    /// toutes les visionneuses (`FullscreenChromeState`, #8878).
    @State private var chrome = FullscreenChromeState.initial
    @State private var isPlaying = false
    /// Chaque geste sur un contrôle relance le délai d'effacement.
    @State private var chromeTouches = 0
    @State private var showFullEmojiPicker = false
    /// Le brouillon de réponse, PAR PIÈCE (#6165) : deux vocaux se commentent
    /// séparément, et feuilleter ne change pas ce qu'on cite.
    @State private var replyDrafts: [String: String] = [:]
    @State private var replyTarget: AudioFullscreenSource?
    @State private var replyLanguage: String = DefaultComposerLanguage.resolve()
    @State private var replyKeyboard: KeyboardTransition?
    /// La piste que l'écran a lui-même demandée — tenue hors du rendu : la
    /// noter ne doit refaire aucune page.
    @State private var turnMemory = AudioFullscreenTurnMemory()

    private var coordinator: ConversationAudioCoordinator { .sharedForTesting }
    private var ids: [String] { allAudioItems.map(\.id) }
    /// Par IDENTITÉ : la pièce regardée, jamais « celle qui occupe son ancien rang ».
    private var currentSource: AudioFullscreenSource? {
        AudioFullscreenPaging.index(of: currentPageID, in: ids).map { allAudioItems[$0] }
    }

    var body: some View {
        ZStack {
            AudioFullscreenBackdrop(accentHex: contactColor, isDark: colorScheme == .dark)

            if !allAudioItems.isEmpty {
                AdaptiveHorizontalPager(
                    items: allAudioItems,
                    currentPageID: $currentPageID,
                    fillVertical: true
                ) { index, item in
                    page(index: index, item: item)
                }
                .offset(y: dragOffset)
                .modifier(AudioFullscreenDismissDrag(offset: $dragOffset, onDismiss: dismissDownward))
                .opacity(isDismissing ? 0 : 1)
                .ignoresSafeArea(.keyboard, edges: .bottom)
                // La liste a bougé sous l'écran : la position suit la page regardée.
                .adaptiveOnChange(of: ids) { _, newIds in
                    if let idx = AudioFullscreenPaging.index(of: currentPageID, in: newIds), idx != currentIndex { currentIndex = idx }
                }
                .adaptiveOnChange(of: currentPageID) { _, newID in
                    guard let newID,
                          let newIdx = allAudioItems.firstIndex(where: { $0.id == newID })
                    else { return }
                    if currentIndex != newIdx {
                        currentIndex = newIdx
                        HapticFeedback.light()
                        // La rangée d'émojis et la barre visaient la pièce
                        // qu'on regardait ; l'immersion, elle, reste. Rien
                        // d'ouvert ⇒ rien à animer pendant que la page glisse.
                        let turned = chrome.turningPage()
                        guard turned != chrome || replyTarget != nil else { return }
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                            chrome = turned
                            replyTarget = nil
                        }
                    }
                }
            }

            reactionLayer
                .ignoresSafeArea(.keyboard, edges: .bottom)

            replyLayer
                .padding(.bottom, MediaReplyKeyboardInset.bottomInset(for: replyKeyboard))
                .animation(.easeOut(duration: replyKeyboard?.duration ?? 0.25), value: replyKeyboard?.height)
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .observingKeyboardTransition($replyKeyboard)
        .statusBarHidden(true)
        .onAppear {
            // Filet : `scrollPosition(id:)` honore la valeur posée à l'`init`,
            // mais une présentation qui recycle un état revient sur la pièce
            // réellement touchée.
            if let idx = allAudioItems.firstIndex(where: { $0.attachment.id == startAttachmentId }),
               currentPageID != allAudioItems[idx].id {
                currentIndex = idx
                currentPageID = allAudioItems[idx].id
            }
        }
        .onReceive(coordinator.$isPlaying) { playing in
            isPlaying = playing
            // Une pause — ou la fin du dernier vocal — ramène le chrome : on
            // n'est plus en train d'écouter, on cherche quoi faire ensuite.
            guard !playing, !chrome.showsChrome, chrome.overlay == nil else { return }
            withAnimation(.easeInOut(duration: 0.25)) { chrome = chrome.revealing() }
        }
        // **La page SUIT la piste** : à la fin d'un vocal, le lecteur partagé
        // enchaîne sur la suite que la page lui a posée (ordre de réception),
        // et l'écran tourne avec lui ; le « suivant » de l'écran verrouillé
        // aussi. `dropFirst` : la piste qui jouait AVANT l'ouverture ne
        // détourne pas l'écran de la pièce touchée.
        .onReceive(coordinator.$activeContext
            .map { $0?.attachmentId }
            .removeDuplicates()
            .dropFirst()
            .receive(on: DispatchQueue.main)
        ) { followActiveTrack($0) }
        .task(id: AutoHideKey(chrome: chrome, isPlaying: isPlaying,
                              touches: chromeTouches, voiceOver: voiceOverRunning)) {
            await autoHideChrome()
        }
        .onDisappear(perform: restoreConversationQueue)
        .sheet(isPresented: $showFullEmojiPicker) {
            EmojiPickerSheet(quickReactions: MeeshyQuickReactions.standard) { emoji in
                if let source = currentSource { actions?.react(source, emoji) }
                showFullEmojiPicker = false
            }
        }
        .withStatusBubble()
    }

    // MARK: - Une page

    /// **Une fenêtre de trois pages, chacune comparée avant d'être refaite**
    /// (#10568, leçon 292) : au-delà des voisines, la page n'est qu'un vide —
    /// ni onde, ni abonnement, ni transcription ne survivent au balayage ; et
    /// une écriture d'état de la racine ne refait que les pages dont une entrée
    /// VISIBLE a changé.
    @ViewBuilder
    private func page(index: Int, item: AudioFullscreenSource) -> some View {
        if AudioFullscreenPaging.renders(index: index, current: currentIndex) {
            livePage(index: index, item: item)
                .equatable()
        } else {
            Color.clear
        }
    }

    private func livePage(index: Int, item: AudioFullscreenSource) -> AudioFullscreenPage {
        let offer = actions?.offer(item) ?? .none
        let memory = turnMemory
        return AudioFullscreenPage(
            item: item,
            contactColor: contactColor,
            mentionDisplayNames: mentionDisplayNames,
            isActive: index == currentIndex,
            pageIndex: index,
            totalPages: allAudioItems.count,
            chromeVisible: chrome.showsChrome,
            offer: offer,
            isReactionOpen: chrome.isOpen(.reactions) && index == currentIndex,
            isReplyOpen: replyTarget?.id == item.id,
            upcomingQueue: { upcomingQueue(after: item.id) },
            moodEmojiProvider: moodEmojiProvider,
            moodTapProvider: moodTapProvider,
            onDismiss: { dismiss() },
            onToggleChrome: toggleChrome,
            onChromeInteraction: { chromeTouches += 1 },
            onReact: {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    replyTarget = nil
                    chrome = chrome.toggling(.reactions)
                }
            },
            onReply: { openReply(on: item) },
            onCompose: { actions?.compose(item) },
            onNext: AudioFullscreenSequence.next(after: item.id, in: ids).map { id in { turn(to: id) } },
            onPrevious: AudioFullscreenSequence.previous(before: item.id, in: ids).map { id in { turn(to: id) } },
            onPlaybackRequested: { memory.requested = $0 }
        )
    }

    private func turn(to id: String) {
        withAnimation(.spring(response: 0.45, dampingFraction: 0.88)) {
            currentPageID = id
        }
    }

    /// **La suite du plein écran**, telle que le lecteur partagé la jouera :
    /// chaque vocal reçu après celui-ci, dans sa piste élue.
    private func upcomingQueue(after id: String) -> [QueuedAudio] {
        let later = Set(AudioFullscreenSequence.upcoming(after: id, in: ids))
        return allAudioItems.filter { later.contains($0.id) }.map(\.openingQueuedAudio)
    }

    private func followActiveTrack(_ activeId: String?) {
        guard let target = AudioFullscreenSequence.pageToFollow(activeAttachmentId: activeId,
                                                                currentPageId: currentPageID,
                                                                ids: ids,
                                                                requestedByScreen: turnMemory.requested) else { return }
        turn(to: target)
    }

    /// **En sortant, la conversation reprend SA file** — les vocaux non
    /// écoutés après celui qui joue. L'ordre de réception n'appartient qu'au
    /// plein écran.
    private func restoreConversationQueue() {
        guard let activeId = coordinator.activeContext?.attachmentId,
              let source = allAudioItems.first(where: { $0.id == activeId }),
              let conversationTail = source.queueTailProvider else { return }
        coordinator.replaceUpcoming(conversationTail())
    }

    // MARK: - Le chrome

    private func toggleChrome() {
        withAnimation(.easeInOut(duration: 0.2)) {
            if replyTarget != nil {
                replyTarget = nil
                chrome = chrome.closingOverlay()
            } else {
                chrome = chrome.tappingMedia()
            }
        }
    }

    private struct AutoHideKey: Equatable {
        let chrome: FullscreenChromeState
        let isPlaying: Bool
        let touches: Int
        let voiceOver: Bool
    }

    private func autoHideChrome() async {
        guard let delay = AudioFullscreenChromeTiming.autoHideDelay(state: chrome,
                                                                    isPlaying: isPlaying,
                                                                    voiceOverRunning: voiceOverRunning)
        else { return }
        guard await cancellableSleep(for: .seconds(delay)), !Task.isCancelled else { return }
        withAnimation(.easeInOut(duration: 0.35)) {
            chrome = chrome.autoHiding()
        }
    }

    // MARK: - Réagir

    /// **La rangée d'émojis du plein écran** — celle de la galerie et de la
    /// story (`FullscreenReactionStrip`), au-dessus de tout, ancrée en bas. Un
    /// vocal n'a pas d'image pour lui servir de fond : elle se pose sur un
    /// verre, sans quoi son « + » blanc disparaîtrait sur le fond clair.
    @ViewBuilder
    private var reactionLayer: some View {
        if chrome.isOpen(.reactions), let source = currentSource, let actions, actions.offer(source).react {
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                FullscreenReactionStrip(
                    onReact: { emoji in
                        actions.react(source, emoji)
                        HapticFeedback.success()
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            chrome = chrome.closingOverlay()
                        }
                    },
                    onExpandFullPicker: {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            chrome = chrome.closingOverlay()
                        }
                        showFullEmojiPicker = true
                    }
                )
                .padding(.vertical, MeeshySpacing.xs)
                .padding(.horizontal, MeeshySpacing.sm)
                .adaptiveGlass(in: Capsule(), tint: MeeshyColors.mediaChromeFill)
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.bottom, MeeshySpacing.lg)
            }
            .transition(.asymmetric(
                insertion: .scale(scale: 0.85, anchor: .bottom).combined(with: .opacity),
                removal: .opacity
            ))
        }
    }

    // MARK: - Répondre

    private func openReply(on source: AudioFullscreenSource) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
            if replyTarget?.id == source.id {
                replyTarget = nil
                chrome = chrome.closingOverlay()
            } else {
                replyTarget = source
                chrome = chrome.opening(.reply)
            }
        }
    }

    /// **Répondre sans quitter le plein écran** (#6165, #8916) — la barre
    /// universelle de la galerie, qui CITE le vocal regardé. Rien ne se
    /// referme à l'envoi : on parle de la pièce en l'écoutant.
    @ViewBuilder
    private var replyLayer: some View {
        if let target = replyTarget, let actions, let citation = actions.replyCitation(target) {
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                MediaReplyComposerBar(
                    citation: citation,
                    accentColor: contactColor,
                    pieceId: target.id,
                    draft: Binding(
                        get: { replyDrafts[target.id] ?? "" },
                        set: { replyDrafts[target.id] = $0 }
                    ),
                    composerLanguage: $replyLanguage,
                    onSend: { text, language in
                        actions.sendReply(target, text, language)
                        replyDrafts[target.id] = nil
                        MediaReplyKeyboardInset.apply(MediaReplyKeyboardInset.sendEffects) {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                                replyTarget = nil
                                chrome = chrome.closingOverlay()
                            }
                        }
                        HapticFeedback.light()
                    },
                    onCancel: {
                        MediaReplyKeyboardInset.apply(MediaReplyKeyboardInset.cancelEffects) {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                                replyTarget = nil
                                chrome = chrome.closingOverlay()
                            }
                        }
                    }
                )
            }
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    // MARK: - Vertical Dismiss Gesture

    private func dismissDownward() {
        let currentItem = currentSource
        withAnimation(.easeOut(duration: 0.25)) {
            // Course de sortie mesurée sur la fenêtre : sur le display, une
            // fenêtre Split View sortait de l'écran bien avant la fin de
            // l'animation, donc la vue disparaissait d'un coup au lieu de glisser.
            dragOffset = hostHeight
            isDismissing = true
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            if let messageId = currentItem?.messageId {
                onDismissToMessage?(messageId)
            }
            dismiss()
        }
    }
}


/// La dernière piste lancée par une page de l'écran. Une référence, pas un
/// `@State` de valeur : l'écrire ne réévalue rien.
@MainActor
final class AudioFullscreenTurnMemory {
    nonisolated deinit {}
    var requested: String?
}

// MARK: - Feed / Comment / Reel / Post wiring

extension AudioFullscreenSource {
    /// Construit une source plein écran depuis un média audio de feed
    /// (commentaire, post, réel). La transcription et les versions traduites
    /// (Prisme) proviennent du `FeedMedia` ; l'auteur et les métadonnées du
    /// post/commentaire porteur. `conversationId` : id de l'entité porteuse
    /// (commentId/post.id/repost.id) quand l'appelant a déjà un
    /// `CoordinatedAudioPlayer` inline pour ce même audio — voir
    /// `AudioFullscreenSource.conversationId`. `nil` pour un appelant sans
    /// session inline connue (ex. réels, non wirés à ce jour).
    static func fromFeed(media: FeedMedia,
                         author: ProfileSheetUser,
                         originalLanguage: String?,
                         caption: String,
                         createdAt: Date,
                         conversationId: String? = nil) -> AudioFullscreenSource {
        AudioFullscreenSource(
            id: media.id,
            attachment: media.toMessageAttachment(),
            transcription: media.transcription,
            translatedAudios: media.translatedAudios,
            originalLanguage: originalLanguage ?? "",
            caption: caption,
            author: author,
            createdAt: createdAt,
            messageId: nil,
            conversationId: conversationId
        )
    }
}

extension View {
    /// Présente la vue plein écran audio (transcription + langues Prisme +
    /// sauvegarde) pour une source unique. À attacher sur la surface porteuse
    /// (commentaire, post, réel, feed) ; déclencher en assignant la source via
    /// le callback `onFullscreen` de `AudioPlayerView`.
    func audioFullscreenCover(_ source: Binding<AudioFullscreenSource?>,
                              accentColor: String) -> some View {
        fullScreenCover(item: source) { src in
            AudioFullscreenView(
                allAudioItems: [src],
                startAttachmentId: src.attachment.id,
                contactColor: accentColor
            )
            .contentExitGate(.open) // un son de publication sort ; le défaut est fermé (#9573)
        }
    }
}
