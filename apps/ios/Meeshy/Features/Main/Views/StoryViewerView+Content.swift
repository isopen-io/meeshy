import SwiftUI
import Combine
import AVFoundation
import QuartzCore
import os
import MeeshySDK
import MeeshyUI

// MARK: - Extracted from StoryViewerView.swift

extension StoryViewerView {

    // MARK: - Text Content · Media Overlay — RETIRÉS (244i)
    //
    // Six fonctions vivaient ici sans qu'aucun commit du dépôt ne les appelle :
    // `storyTextContent(_:storyEffects:)` et `mediaOverlay(media:geometry:)`, plus
    // les quatre privées qu'elles SEULES appelaient — `fontForStyle`,
    // `textAlignmentFor`, `compositeAlignment`, `coloredMediaFallback`.
    //
    // C'était le lecteur de story d'AVANT le canvas : du texte SwiftUI positionné
    // par `StoryEffects.textPosition/textAlign`, et une image posée en overlay. Le
    // rendu vivant est le canvas — `StoryViewerView+Canvas.swift` côté app,
    // `StorySlideRenderer` côté SDK, qui honore `fontFamily`/`textStyle` (c'est
    // l'extension à 18 familles du 2026-08-20 : `italic` et `retro` y sont entrés
    // précisément parce que des stories publiées portaient le vocabulaire
    // historique de `fontForStyle`).
    //
    // Elles emportaient `story.viewer.a11y.storyText` — une clé traduite en sept
    // locales pour un `accessibilityLabel` qu'aucun lecteur d'écran n'a jamais
    // annoncé.

    // MARK: - Filter Overlay

    var filterOverlay: some View {
        Group {
            if let filter = currentStory?.storyEffects?.filter {
                switch filter {
                case "vintage":
                    MeeshyColors.tileSaffron.opacity(0.15)
                        .blendMode(.multiply)
                case "bw":
                    Color.gray.opacity(0.4)
                        .blendMode(.saturation)
                case "warm":
                    MeeshyColors.error.opacity(0.1)
                        .blendMode(.softLight)
                case "cool":
                    MeeshyColors.indigo300.opacity(0.1)
                        .blendMode(.softLight)
                default:
                    EmptyView()
                }
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }


    /// True cross-dissolve for stories within the same user.
    /// Old content stays visible (outgoing layer) while new content fades in on top —
    /// eliminates the flash caused by AsyncImage reloading between swaps.
    /// Supports StoryTransitionEffect: fade, zoom, slide, reveal.
    // Non-private : appelée par `goToNext`/`goToPrevious`
    // (`StoryViewerView+Navigation.swift`).
    func crossFadeStory(update: @escaping () -> Void) {
        isTransitioning = true

        // 1. Snapshot current story as outgoing (already rendered, no reload needed)
        outgoingStory = currentStory
        outgoingOpacity = 1
        closingScale = 1.0
        contentOpacity = 0

        let closingEffect = currentStory?.storyEffects?.closing

        // 2. Swap to the incoming story (invisible because contentOpacity = 0)
        update()
        markCurrentViewed()

        // La slide entrante d'abord ; ses voisines N±1, N±2 se préparent dès
        // sa première image (`prepareNeighborWindow`, #10348).
        interruptNeighborWindow()
        if let story = currentStory { prefetchAllMedia(for: story) }

        let incomingEffect = currentStory?.storyEffects?.opening

        // Table d'armement PARTAGÉE avec le retrait de l'interlude inter-groupes
        // (`dismissGroupIntro(revealing:)`) : une seule grammaire d'apparition,
        // deux chemins d'entrée. `contentOpacity` n'est PAS réappliqué ici — il
        // a été mis à 0 avant `update()` plus haut, précisément pour que le swap
        // de story soit invisible ; le réécrire après coup n'ajouterait rien et
        // brouillerait cette intention.
        let entrance = StoryOpeningEntrance.armed(for: incomingEffect)
        openingScale = entrance.openingScale
        openingSlideFraction = entrance.openingSlideFraction
        textSlideOffset = entrance.textSlideOffset
        isRevealActive = entrance.isRevealActive

        let animDuration: Double
        let animation: Animation
        switch incomingEffect {
        // Les trois effets NOMMÉS partagent la durée du SDK
        // (`slideTransitionDuration`). L'app en avait trois différentes —
        // 0,4 / 0,38 / 0,4 — désalignées de la seule valeur que l'aperçu du
        // composer et l'export respectent.
        case .zoom:
            animDuration = StoryRenderer.slideTransitionDuration
            animation = .spring(response: StoryRenderer.slideTransitionDuration,
                                dampingFraction: 0.75)
        case .slide:
            animDuration = StoryRenderer.slideTransitionDuration
            animation = .spring(response: StoryRenderer.slideTransitionDuration,
                                dampingFraction: 0.82)
        case .reveal:
            animDuration = StoryRenderer.slideTransitionDuration
            animation = .easeOut(duration: StoryRenderer.slideTransitionDuration)
        default:
            animDuration = 0.35
            animation = .easeOut(duration: 0.35)
        }

        // 3. Animate immediately — thumbHash provides instant visual while full image loads
        withAnimation(animation) {
            outgoingOpacity = 0
            contentOpacity = 1
            openingScale = 1.0
            textSlideOffset = 0
            openingSlideFraction = 0
            if incomingEffect == .reveal { isRevealActive = true }
            if closingEffect == .zoom { closingScale = StoryRenderer.zoomTransitionScale }
        }

        restartTimer()
        delays.run(after: .seconds(animDuration + 0.04)) { outgoingStory = nil; isTransitioning = false; closingScale = 1.0 }
    }

    /// Transition cube entre groupes d'auteurs (Lot 3). Pendant le drag, les
    /// deux faces (carte + aperçu voisin) suivent déjà le doigt ; le commit
    /// termine la rotation jusqu'à ±90° puis swappe le contenu à l'arête —
    /// la carte réelle remplace la face entrante à transform identité, swap
    /// invisible. Le canvas voisin est chaud (prefetch inter-groupes), la
    /// première frame réelle est instantanée.
    // Non-private : appelée depuis `goBackToPreviousGroupFromIntro()`
    // (StoryViewerView.swift, fichier d'extension frère) pour rejouer
    // exactement la même animation de cube quand le tap gauche de l'intro
    // annule le switch de groupe.
    func groupTransition(forward: Bool, update: @escaping () -> Void) {
        guard !isTransitioning else { return }
        isTransitioning = true
        // Le groupe change : quel que soit le chemin d'entrée (drag commité, tap
        // en bord, auto-advance, tap gauche de l'interlude), l'état de toucher
        // hérité n'a plus de sens sur le nouveau groupe. Purge explicite — un
        // drag préempté n'a pas eu son `onEnded` et laisserait l'axe collé.
        resetGestureTracking()
        // Tap-en-bord / auto-advance arrivent ici sans drag : poser la
        // direction pour que la face entrante participe au commit.
        neighborPreviewDirection = forward ? 1 : -1

        let exitX: CGFloat = forward ? -screenW : screenW
        withAnimation(StoryGroupCube.commitAnimation) {
            groupSlide = exitX
        }

        // Swap APRÈS la fin de la courbe (#11192) : la face entrante est
        // exactement à l'identité, la vraie carte la remplace sans saut.
        delays.run(after: .seconds(StoryGroupCube.swapDelay)) {
            update()
            // Pas de `markCurrentViewed()` ici : l'interlude du nouvel auteur
            // n'est décidé qu'ensuite, par l'`adaptiveOnChange(of:
            // currentGroupIndex)`. Marquer maintenant comptait la story avant
            // même que l'écran d'identité ne la recouvre. Le marquage se fait
            // dans ce onChange, APRÈS `presentGroupIntroIfNeeded()`.
            prefetchCurrentGroup()

            // Sans animation : la carte réelle prend la place exacte de la
            // face entrante (transform identité), la face est démontée.
            groupSlide = 0
            neighborPreviewDirection = 0
            restartTimer()
            delays.run(after: .milliseconds(50)) { isTransitioning = false }
        }
    }

    // MARK: - Timer

    /// L'agrégat de pause (`shouldPauseTimer`) et la boucle vivent dans
    /// `StoryViewerView+PlaybackHold.swift` (#9821).
    func startTimer() {
        progressClock.reset()
        isContentReady = false
        hasFiredNextPrefetch = false
        // Toutes les surfaces du reader tombent au changement de slide, pas
        // seulement les commentaires : un strip de langues ou une barre d'emojis
        // laissés ouverts se retrouvaient posés sur la story SUIVANTE, à laquelle
        // ils ne se rapportent plus (directive user 2026-07-25).
        showCommentsOverlay = false
        showLanguageOptions = false
        showFullLanguagePicker = false
        showEmojiStrip = false
        showFullEmojiPicker = false
        // Reset seam for a scrub whose .onEnded never fires (competing
        // recognizer / system interruption drops it, same hazard documented
        // for gestureAxis above): without this, isScrubbingRail could stay
        // stuck true and shouldPauseTimer would freeze the story forever.
        isScrubbingRail = false
        replyingToStoryComment = nil
        storyCommentRepliesMap = [:]
        storyCommentExpandedThreads = []
        storyCommentLoadingReplies = []
        // Slide changed → drop previous slide's comment list, like overrides, and
        // any in-flight heart taps. Without this, `isStoryCommentsEmpty` stays
        // false in the sidebar tap path (Sidebar:277) and the overlay re-opens
        // with the prior slide's comments without ever refetching.
        storyComments = []
        storyCommentLikedIds = []
        storyCommentLikeDelta = [:]
        heartInFlightIds = []
        isLoadingComments = false
        loadStoryCommentCount()
        storyReactionCount = currentStory?.reactionCount ?? 0
        storyCurrentUserReactions = currentStory?.currentUserReactions ?? []
        updateStoryDuration()

        // PROGRESS = StoryReaderTimerController (SDK), unique display-link de
        // progression. Gating : `markContentReady` (canvas visible via
        // `adaptiveOnChange(of: isContentReady)` + canvas préfetché via
        // `refreshPrefetchWindowAndTimer`) empêche le compte avant contenu ;
        // pause : `setPaused` asservi à `shouldPauseTimer`. La barre, le seuil
        // de prefetch N+1 et `goToNext()` vivent dans les callbacks câblés par
        // `installPrefetchPipelineIfNeeded`. Le wall-clock du controller reste
        // l'autorité de la durée slide (cf. plan Lot 2 — l'asservissement au
        // clock canvas clampé bloquerait l'auto-advance sur les pauses UI).
        refreshPrefetchWindowAndTimer()
        slideTimer.setPaused(shouldPauseTimer)
    }

    /// Restart timer AND clear manual pause (e.g., after drag->transition).
    /// Changement de slide ou sortie de transition : on repart en lecture
    /// fraîche. On désarme **les deux** drapeaux de pause :
    /// - `isPaused` (timer-only)
    /// - `isLongPressPaused` (long-press latch — déclenche `.storyPlayerResume`
    ///   au canvas si on était latched-paused au moment du changement).
    private func restartTimer() {
        isPaused = false
        isLongPressPaused = false
        // Filet de récupération de l'axe de geste. Depuis que la pause du drag
        // est ÉTAT-DIRIGÉE (`gestureAxis != 0` dans `shouldPauseTimer`), un axe
        // resté collé gèle la lecture — et SwiftUI ne délivre PAS `onEnded`
        // quand un recognizer concurrent (ScrollView du rail en repli
        // `ViewThatFits`, liste de commentaires) emporte la séquence. Avant ce
        // passage à l'état, la pause était portée par `isPaused`, que cette
        // fonction remettait déjà à false : le changement de slide était la
        // voie de récupération naturelle. La rétablir ici la préserve — sinon
        // taper pour avancer changeait bien de slide, mais la lecture restait
        // figée jusqu'à un changement de GROUPE ou la sortie du lecteur.
        gestureAxis = 0
        startTimer()
    }

    /// Calcule la durée du slide courant en fonction des médias (vidéo/audio).
    /// Minimum 6s pour les slides texte/image seules — parité Instagram/Snapchat,
    /// abaissé depuis 12s après retour utilisateur « les stories durent trop ».
    ///
    /// Spec: la story dure `max(longest_media_end_time, configured_slideDuration, 6s_minimum)`,
    /// puis arrondie au multiple supérieur de chaque période de loop bg pour
    /// que la vidéo/audio bg ne soit JAMAIS coupée au milieu d'un cycle.
    /// Avant ce fix, `effects.slideDuration` early-returned et les médias plus longs
    /// que la durée configurée étaient coupés (la vidéo apparaissait quelques
    /// secondes puis disparaissait alors que le son continuait — typique d'un
    /// timer de slide expirant avant la fin du média).
    /// SINGLE SOURCE OF TRUTH pour la durée du slide.
    /// User spec 2026-05-27 :
    /// - Slide statique → 6 s
    /// - Slide avec vidéo OU audio bg → durée du media (loopé si < 6 s)
    /// - `storyEffects.slideDuration` configuré prime quand > 0
    ///
    /// Délégation à `StorySlide.toRenderableSlide(...).computedTotalDuration()`
    /// pour aligner exactement avec la durée que pilote le canvas
    /// (`StoryCanvasUIView.displayLinkTick.effectiveDuration`). Garantit que
    /// progress bar (wall-clock viewer-side) et auto-advance (canvas-side)
    /// utilisent la MÊME valeur.
    static let defaultSlideDuration: Double = 6.0

    private func updateStoryDuration() {
        guard let story = currentStory else {
            computedStoryDuration = Self.defaultSlideDuration
            return
        }
        // `preferredLanguages: []` — la résolution de langue n'affecte
        // pas la durée (computedTotalDuration ne consulte plus le texte
        // résolu depuis sa simplification single-source-of-truth).
        // Évite la dépendance sur `resolvedViewerLanguageChain` (private
        // dans StoryViewerView.swift, inaccessible depuis cette extension).
        let renderable = story.toRenderableSlide(preferredLanguages: [])
        computedStoryDuration = renderable.computedTotalDuration()
    }

    /// Un écran PLEIN recouvre la story (composeur, citer ou republier en post,
    /// lieu plein écran) : elle se fige, rien ne joue derrière (#9821). Les
    /// feuilles posées SUR la story ne l'appellent pas — elles la font boucler.
    func pauseTimer() { isPaused = true }

    /// Manual resume — symétrique de `pauseTimer()`. N'inverse pas le
    /// long-press latch (`isLongPressPaused`) : si l'utilisateur a stoppé
    /// la story via long-press puis ouvert une sheet, la fermeture de la
    /// sheet ne doit pas relancer la story automatiquement.
    func resumeTimer() {
        isPaused = false
    }

    // MARK: - Initial Action (Phase F — notification entry point)

    /// Honours the optional `initialAction` (set when this viewer was launched
    /// from a story notification redirect). The 250 ms delay lets the
    /// fullScreenCover finish its presentation animation and lets the canvas
    /// (media + progress bars) mount one frame, otherwise the comments overlay
    /// or viewers sheet animates in over a half-blank screen on cold start.
    /// Idempotent via `hasTriggeredInitialAction` — repeated `.onAppear` calls
    /// (scene phase, parent re-renders) are no-ops.
    func triggerInitialActionIfNeeded() {
        guard let action = initialAction, !hasTriggeredInitialAction else { return }
        hasTriggeredInitialAction = true
        delays.run(after: .milliseconds(250)) {
            switch action {
            case .showCommentsOverlay:
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showCommentsOverlay = true
                }
                if storyComments.isEmpty {
                    loadStoryComments()
                }
            case .showViewersSheet:
                showViewersSheet = true
            }
        }
    }

    // MARK: - Dismiss Composer

    func dismissComposer() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil, from: nil, for: nil
        )
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            showTextEmojiPicker = false
            showFullEmojiPicker = false
        }
        isComposerEngaged = false
    }

    // MARK: - Actions

    func sendComment(text: String, effectFlags: Int? = nil, parentId: String? = nil, pendingMedia: PendingCommentMedia? = nil, location: SharedPlace? = nil) {
        guard (!text.isEmpty || pendingMedia != nil), let story = currentStory else { return }
        EngagementTracker.shared.recordAction(.commented, surface: .storyViewer)

        // Optimistic local insert. Reply nesting is currently flat in the UI
        // (Threads-style max-1-niveau pour MVP) — the parentId is forwarded
        // to the backend so the comment graph stays correct, but rendering
        // does not yet visually indent replies. See SOTA audit Pilier 19.
        let currentUser = AuthManager.shared.currentUser
        let authorName: String = currentUser?.displayName ?? currentUser?.username ?? String(localized: "story.tray.me", defaultValue: "Moi", bundle: .main)
        let authorId: String = currentUser?.id ?? ""
        // La ligne optimiste est keyée par le cmid : envoyé au REST ET réutilisé
        // par le repli outbox, il fait dédoublonner le serveur (MutationLog) et
        // revient dans l'écho `comment:added` pour une réconciliation par id
        // exacte (le twin-match par contenu ne tenait pas quand le serveur
        // normalise le texte).
        let optimisticComment = FeedComment(
            id: ClientMutationId.generate(),
            author: authorName,
            authorId: authorId,
            authorUsername: currentUser?.username,
            authorAvatarURL: currentUser?.avatar,
            content: text,
            parentId: parentId,
            effectFlags: effectFlags ?? 0,
            originalLanguage: composerLanguage,
            media: pendingMedia.map { [$0.optimistic] } ?? [],
            location: location
        )

        if let parentId {
            // Reply — insert into repliesMap so it appears in the thread
            var existing = storyCommentRepliesMap[parentId] ?? []
            existing.append(optimisticComment)
            storyCommentRepliesMap[parentId] = existing
            // Also increment the reply count on the parent comment
            if let idx = storyComments.firstIndex(where: { $0.id == parentId }) {
                storyComments[idx].replies += 1
            }
            // Counter now sums top-level + replies, so it must also bump here.
            storyCommentCount += 1
        } else {
            // Top-level comment
            storyComments.append(optimisticComment)
            storyCommentCount += 1
        }

        // Send to API. Un média éventuel est uploadé (uploadContext=comment → PostMedia)
        // puis transmis via `attachmentIds` ; la ligne serveur réconcilie via le socket
        // `comment:added` (qui porte désormais le média). Le commentaire optimiste
        // affiche déjà le média local.
        //
        // Both the media upload and the comment POST now THROW instead of being
        // silently swallowed by `try?` — a media upload failure used to publish
        // the comment WITHOUT its media (silent data loss); a POST failure left
        // the optimistic `temp_` comment/reply on screen forever even offline
        // (no rollback). Either failure now rolls back the exact optimistic
        // insert via the pure `rollingBackOptimisticComment` — same snapshot/
        // rollback discipline as `sendReaction`.
        let language = composerLanguage
        let tempCommentId = optimisticComment.id
        Task {
            let medias = [pendingMedia].compactMap { $0 }
            // La charge est bâtie UNE fois, avec son auteur relevé avant toute
            // attente : l'envoi direct et la file portent la même (#9743).
            let payload = CreateCommentPayload(
                clientMutationId: tempCommentId, postId: story.id,
                parentCommentId: parentId, content: text,
                originalLanguage: language, authorId: authorId,
                location: location, effectFlags: effectFlags,
                mobileTranscription: pendingMedia?.mobileTranscription
            )
            StoryInteractionService().noteComment(storyId: story.id)
            do {
                try await CommentPublisher.live.publish(payload, pieces: CommentPublisher.pieces(medias))
                CommentMediaUploader.discardLocalFiles(medias)
            } catch {
                // Le POST direct a échoué — le plus souvent parce qu'on est
                // hors-ligne. Perdre un commentaire que l'utilisateur vient de
                // taper est la pire issue possible : on le confie à l'outbox,
                // qui le rejouera au retour du réseau. Même chemin que le feed
                // (`FeedCommentsSheet`), même kind `.createComment` : la ligne
                // optimiste `temp_` est réconciliée par le handler socket
                // `comment:added` déjà câblé quand le rejeu aboutit.
                // #9743 — le MÉDIA part avec lui : la file garde son fichier.
                do {
                    // MÊME cmid que la tentative REST : un POST abouti dont la
                    // réponse s'est perdue est dédoublonné au rejeu (MutationLog).
                    let cmid = tempCommentId
                    try await CommentMediaDelivery.entrust(payload, medias: medias,
                                                           acquired: CommentMediaDelivery.acquired(from: error))
                    observeStoryCommentOutcome(cmid: cmid,
                                               tempId: tempCommentId,
                                               parentId: parentId)
                } catch {
                    // L'outbox elle-même a refusé la ligne : là, il n'y a plus
                    // de recours, on annule l'insert optimiste.
                    rollbackOptimisticComment(id: tempCommentId, parentId: parentId)
                    returnRefusedStoryComment(storyId: story.id, text: text, medias: medias)
                }
            }
        }

        // Dismiss composer and give feedback
        DispatchQueue.main.async {
            HapticFeedback.success()
            self.dismissComposer()
            self.storyDrafts.removeValue(forKey: story.id)
        }
    }

    /// Pure core of the rollback — no `@State` access, so it's unit-testable
    /// without a live view (mirrors the "extract the pure decision" pattern
    /// used elsewhere in the codebase). Removes the failed `temp_` comment
    /// (top-level) or reply (routes back out of the parent's reply count +
    /// the replies map) and decrements the shared counter exactly once,
    /// symmetrically with how `sendComment` incremented it.
    static func rollingBackOptimisticComment(
        id: String,
        parentId: String?,
        comments: [FeedComment],
        repliesMap: [String: [FeedComment]],
        commentCount: Int
    ) -> (comments: [FeedComment], repliesMap: [String: [FeedComment]], commentCount: Int) {
        var comments = comments
        var repliesMap = repliesMap
        if let parentId {
            if var replies = repliesMap[parentId] {
                replies.removeAll { $0.id == id }
                repliesMap[parentId] = replies
            }
            if let idx = comments.firstIndex(where: { $0.id == parentId }) {
                comments[idx].replies = max(0, comments[idx].replies - 1)
            }
        } else {
            comments.removeAll { $0.id == id }
        }
        return (comments, repliesMap, max(0, commentCount - 1))
    }

    private func rollbackOptimisticComment(id: String, parentId: String?) {
        let result = Self.rollingBackOptimisticComment(
            id: id, parentId: parentId,
            comments: storyComments, repliesMap: storyCommentRepliesMap, commentCount: storyCommentCount
        )
        storyComments = result.comments
        storyCommentRepliesMap = result.repliesMap
        storyCommentCount = result.commentCount
    }

    // Le compte à rebours d'expiration a quitté le header du reader (directive
    // user 2026-07-30) : il n'existe plus de surface qui l'affiche, donc plus
    // de formateur. `story.expiresAt` reste la source de vérité côté logique
    // (`isExpired(at:)` pilote la sélection de slide et le bandeau « Story
    // expirée ») — c'est seulement la relecture permanente du chrono qui part.

    // MARK: - Delete Story

    func deleteCurrentStory(reason: String? = nil) {
        guard let story = currentStory else { return }
        HapticFeedback.light()
        
        Task {
            let success = await viewModel.deleteStory(storyId: story.id, reason: reason)
            DispatchQueue.main.async {
                if success {
                    HapticFeedback.success()
                    dismissViewer()
                } else {
                    HapticFeedback.error()
                }
            }
        }
    }

    // MARK: - Mark Viewed

    /// - Parameter isIntroVisible: surcharge de `showGroupIntro`. Les `@State`
    ///   d'une `View` hors graphe SwiftUI ne retiennent pas les écritures d'un
    ///   test ; sans cette entrée la garde n'est pas vérifiable. Production :
    ///   `nil`, sauf `dismissGroupIntro` qui passe `false` — à cet instant
    ///   l'interlude vient d'être retiré et la story est révélée.
    /// Annule l'insert optimiste si l'outbox finit par abandonner ce
    /// commentaire (le serveur le refuse durablement). Sans ça, une ligne
    /// `temp_` resterait à l'écran pour toujours : l'écho `comment:added`
    /// qu'elle attend n'arrivera jamais pour une mutation abandonnée.
    /// Miroir de `FeedCommentsSheet.observeCreateCommentOutcome`.
    private func observeStoryCommentOutcome(cmid: String, tempId: String, parentId: String?) {
        Task { @MainActor in
            let stream = await OfflineQueue.shared.outcomeStream(for: cmid)
            for await event in stream {
                if case .exhausted = event {
                    rollbackOptimisticComment(id: tempId, parentId: parentId)
                    await OfflineQueue.shared.cancelCreateComment(clientMutationId: cmid, ownerId: CommentPublisher.currentAccountId())
                    FeedbackToastManager.shared.showError(
                        // Clé du feed réutilisée : message identique, et le
                        // catalogue est verrouillé à 100 % de couverture — une
                        // clé jumelle serait sept traductions redondantes.
                        String(localized: "feed.comments.send_error",
                               defaultValue: "Erreur lors de l'envoi du commentaire",
                               bundle: .main)
                    )
                }
            }
        }
    }

    func markCurrentViewed(isIntroVisible: Bool? = nil) {
        // L'interlude d'identité est OPAQUE et occupe tout l'écran : tant qu'il
        // est affiché, la story n'a rien montré. Marquer ici gonflait le
        // compteur de vues de l'auteur et faisait passer l'anneau en « vu »
        // alors que le lecteur n'avait vu qu'un écran d'identité. Le marquage
        // suit la RÉVÉLATION (`dismissGroupIntro`), pas l'indexation.
        guard !(isIntroVisible ?? showGroupIntro) else { return }
        if let story = currentStory {
            viewModel.markViewed(storyId: story.id)
            // C3 : ce slide vient d'être affiché → 1 impression (source "story") pour CE
            // post-slide, en plus de la vue unique. Chaque changement de slide en émet une.
            viewModel.recordStoryImpression(storyId: story.id)
            // Contenu consommé → ses notifications ne doivent plus être non lues,
            // ET toute notification qui arrive PENDANT la lecture naît consommée
            // (`activePostId`). Idempotent : le manager ignore une story déjà
            // déclarée active et coalesce les appels serveur.
            NotificationToastManager.shared.onPostOpened(story.id)
        }
    }
}

// `StoryViewersSheet` et `StoryViewerItem` vivent dans `PublicationViewersSheet.swift` (#9727).
