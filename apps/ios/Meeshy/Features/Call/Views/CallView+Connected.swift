import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI
import os

// L'appel établi : disposition audio, disposition vidéo, flux primaire et
// indicateurs de qualité. Sorti de `CallView.swift` (hors budget).

extension CallView {
    // MARK: - Connected

    var connectedView: some View {
        // UN conteneur de verre pour tout ce qui flotte au-dessus de
        // l'appel établi : le bloc de verre de la pilule (qui porte les
        // actions du (…)), le bandeau de sous-titres, l'en-tête. Des
        // verres voisins ne se superposent jamais (le verre ne peut pas
        // échantillonner le verre) ; ils se fondent entre eux.
        AdaptiveGlassContainer(spacing: 12) {
            ZStack {
                if isGroupStage {
                    groupStageLayout
                } else {
                    duoLayout
                }

                duoSelfView

                callEdgeControls

                callControlsLayer

                callModeLayer

                // APP-1 — partage, enregistrement, cadre : une pile sous l'en-tête.
                CallTopBannerStackView(screenShare: callManager.screenShare, recording: callManager.recording, captureJournal: transcriptionService.captureJournal, remoteName: callManager.remoteUsername ?? "", participantName: callManager.participantName(for:), chrome: chromeVisibility, hasLiveFrameStatus: hasLiveFrameStatus,
                                       topInset: CallTopBannerStack.topInset(chromeTopInset: Self.chromeTopInset), safeHorizontal: Self.railsSafeHorizontal, selfTile: selfTileBannerNeighbor, servicePills: servicePills) { liveFrameStatus }

                CallCaptureFlash(capture: capture, reduceMotion: reduceMotion)
                CallCaptureOutcomeAnnouncer(capture: capture)
            }
        }
        // Le sélecteur système de diffusion vit dans la hiérarchie en
        // permanence, et en UN seul endroit : le bouton « Écran » vit avec les
        // commandes de ma caméra (rail gauche du duo, ou rangée « Mon image » du groupe).
        .background(screenSharePicker.host.frame(width: 1, height: 1).opacity(0.02).accessibilityHidden(true))
        // §7.1 — populate the camera list when video turns on so the « mon
        // image » actions can decide flip vs device picker (Continuity/USB).
        .task(id: callManager.isVideoEnabled) {
            if callManager.isVideoEnabled { callManager.cameraActuator.refreshAvailableCameras() }
        }
        .onAppear { layer = layer.reconciled(with: currentActionSet) }
        .onDisappear {
            showControls = true
            layer = .idle
        }
        .adaptiveOnChange(of: currentActionSet) { _, actions in
            let reconciled = layer.reconciled(with: actions)
            guard reconciled != layer else { return }
            withAnimation(disclosureAnimation) { layer = reconciled }
        }
        .adaptiveOnChange(of: isGroupStage) { _, isGroup in
            if !isGroup {
                isStageFullScreen = false
                groupStageFocus = .grid
            }
        }
        .adaptiveOnChange(of: isTapStage) { _, stows in
            if !stows { withAnimation(.easeInOut(duration: 0.25)) { showControls = true } }
        }
        // Surfaces a start failure that `advanceCaptionsMode()` couldn't see at
        // tap time (the start path is async — permission request + on-device
        // recognizer/audio-engine checks all happen after the button already
        // optimistically opened the captions). Without this, a failed
        // start (e.g. no on-device speech recognizer for the user's language —
        // never falls back to Apple's server-side recognizer, privacy decision)
        // would leave the panel open and empty with zero feedback.
        // Échec du moteur LOCAL (permission refusée, langue non supportée
        // on-device…) : toast explicite, mais le panneau RESTE ouvert en
        // réception seule — la réception des transcriptions du pair est liée
        // à la visibilité du panneau, le fermer ici
        // couperait aussi ce flux. Le panneau ne s'ouvre pas de lui-même au premier
        // segment reçu : panneau caché ⇒
        // désabonné, aucun segment ne peut arriver panneau fermé.
        .adaptiveOnChange(of: transcriptionService.lastError) { _, newError in
            guard let newError else { return }
            FeedbackToastManager.shared.showError(transcriptionErrorMessage(for: newError))
        }
        .adaptiveOnChange(of: latestFinalRemoteSegmentId) { _, _ in
            announceLatestCaption()
        }
        .task(id: liveFrameBindingKey) { await bindLiveFrame() }
        .task(id: callManager.currentCallId) { await liveFrame.runClock() }
    }

    /// La disposition 1:1 : le flux primaire plein écran (vidéo) ou le duo
    /// d'avatars (audio), puis la pilule en bas.
    private var duoLayout: some View {
        ZStack {
            // §7.2 — full-bleed PRIMARY video is the SINGLE video surface
            // (remote by default, the local camera after a PiP swap). The
            // secondary feed lives ONLY in the draggable PiP. Controls (and the
            // centered avatar for audio calls) overlay on top. This replaces the
            // old centered card sandwiched in Spacers, which floated over the
            // self-preview background and read as a "double frame".
            // `isVideoUIActive` (not `isVideoEnabled`): the peer can escalate an
            // audio call to video unilaterally — its stream must render even
            // while the local camera stays off.
            if callManager.isVideoUIActive {
                primaryVideoLayer
            }

            VStack(spacing: MeeshySpacing.md) {
                if !callManager.isVideoUIActive {
                    // En audio aussi, glisser vers le bas quitte le plein
                    // écran. Les sous-titres vivent dans la pilule (#17343) :
                    // aucun panneau ne remplace l'avatar ; le journal le resserre,
                    // par morphisme d'UN avatar (P9b.15).
                    // Le fond est la scène (loi 11, #17945) : l'avatar reprend 120 pt.
                    CallAudioStage(isCompact: pillText.compactsAudioLayout, compactTopInset: CallTopBannerStack.topInset(chromeTopInset: Self.chromeTopInset)) {
                        audioAvatarPair(isCompact: pillText.compactsAudioLayout)
                            .accessibilityHidden(true)
                    } compact: {
                        CallCompactAudioHeader(name: peerDisplayName,
                                               duration: { callManager.formattedDuration },
                                               spokenDuration: { callManager.spokenDuration }, showsQualityDetail: $showQualityDetail)
                    } rest: {
                        audioCallLayout
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { if exposesTheTapToggle { toggleControls() } }
                    .simultaneousGesture(swipeDownToLeaveGesture)
                } else {
                    Spacer()
                }

                // Loi 11 — la pilule et ses actions se rangent avec l'en-tête
                // au toucher de la scène, vidéo ou audio ; jamais sous
                // VoiceOver. Rangées, elles ne captent aucun toucher, et les
                // sous-titres restent dans un verre sans rangée.
                callControlsBlock
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.bottom, Self.chromeBottomInset)
                    // Les invitations qui sonnent et le mot de retour se
                    // posent AU-DESSUS du bloc, jamais sur ses rangées.
                    .overlay(alignment: .top) { callControlsNoticesAbove }
            }
            .animation(.easeInOut(duration: reduceMotion ? CallChromeStow.reducedFadeDuration : 0.2), value: showTranscript)
        }
    }

    /// Le glissé vers le bas du duo : la décision vit dans
    /// `CallPiPPolicy.swipeDownOutcome`, la vue ne fait que l'exécuter.
    /// Progressif et annulable : l'écran suit le doigt (`swipeDownOffset`),
    /// et revient si le geste est relâché avant sa conclusion. Espace GLOBAL :
    /// la vue qui porte le geste se déplace avec lui.
    private var swipeDownToLeaveGesture: some Gesture {
        DragGesture(minimumDistance: 50, coordinateSpace: .global)
            .onChanged { value in
                swipeDownOffset = CallPiPPolicy.swipeDownOffset(
                    translation: value.translation.height,
                    isGroup: isGroupStage,
                    isEffectsOpen: !layer.mayAutoHide
                )
            }
            .onEnded { value in
                let outcome = CallPiPPolicy.swipeDownOutcome(
                    translation: value.translation.height,
                    predictedTranslation: value.predictedEndTranslation.height,
                    isGroup: isGroupStage,
                    isEffectsOpen: !layer.mayAutoHide,
                    canSystemPiP: callManager.canActivateSystemPiP
                )
                withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                    swipeDownOffset = 0
                }
                leaveFullScreen(outcome)
            }
    }

    private var primaryVideoLayer: some View {
        // Un toucher masque ou rend les contrôles ; la vignette garde son propre échange.
        videoCallLayout
            .contentShape(Rectangle())
            .onTapGesture { toggleControls() }
            // Le balayage vers le bas vit ici : déplacer la vignette, au-dessus, ne ferme pas l'appel.
            .modifier(CallSwipeDownGate(gesture: swipeDownToLeaveGesture))
            .accessibilityLabel(showControls
                ? String(localized: "call.video.hideControls", defaultValue: "Masquer les contrôles", bundle: .main)
                : String(localized: "call.video.showControls", defaultValue: "Afficher les contrôles", bundle: .main))
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { toggleControls() }
            // Sous VoiceOver les contrôles restent en place : cet élément quitte l'arbre.
            .accessibilityHidden(!exposesTheTapToggle)
    }

    /// Ma vignette (§7.2 : la PiP déplaçable, ou la tuile « en pause » de la
    /// survie réseau, `CallSelfViewPresence`) ; les actions du `(…)` sortent en
    /// rails (#17327). Loi 17.1 · 17.12 : elle paraît, part et change de face en fondu.
    private var duoSelfView: some View {
        let presence = selfViewPresence
        return ZStack {
            switch presence {
            case .camera: pipView.transition(.opacity)
            case .paused: localVideoSuspendedTile.transition(.opacity)
            case .hidden: EmptyView()
            }
        }
        .animation(.easeInOut(duration: CallRemoteVideoFade.duration(reduceMotion: reduceMotion)), value: presence)
    }

    private var selfViewPresence: CallSelfViewPresence {
        CallSelfViewPresence.resolve(isShown: !isGroupStage && chromeVisibility.isVisible(.selfView) && !isLiveFrameShown,
                                     isVideoEnabled: callManager.isVideoEnabled, hasLocalVideoTrack: callManager.hasLocalVideoTrack,
                                     isVideoSuspended: callManager.isVideoSuspended)
    }

    /// La scène de groupe au-dessus de la pilule, dans le flux de la mise en
    /// page : quand la pilule grandit (rangées, sous-titres), la grille rétrécit
    /// au lieu de passer dessous (#17949). En portrait, l'en-tête flotte sur la
    /// grille (P11.1) ; la une, la hauteur compacte et une pile de bandeaux
    /// gardent la scène sous lui (`CallTopBannerStack.groupStageTopBase`).
    private var groupStageLayout: some View {
        VStack(spacing: MeeshySpacing.sm) {
            CallGroupStageTopReserve(screenShare: callManager.screenShare, recording: callManager.recording, captureJournal: transcriptionService.captureJournal, hasLiveFrameStatus: hasLiveFrameStatus,
                                     heights: topBannerHeights, safeAreaTop: DeviceLayout.safeAreaTop, chromeTopInset: Self.chromeTopInset,
                                     headerFloats: CallTopBannerStack.headerFloatsOverGroupStage(isGrid: groupStageFocus == .grid, isCompactHeight: isStageCompactHeight),
                                     isStageFullScreen: isStageFullScreen, reduceMotion: reduceMotion, service: servicePills.banners)
            GroupCallStageView(mesh: mesh, callManager: callManager, isFullScreen: $isStageFullScreen, isChromeVisible: isChromeVisible, chrome: chromeVisibility, isCompactHeight: isStageCompactHeight, onStageTap: toggleControls, onFocusChange: { groupStageFocus = $0 })
                .padding(.horizontal, MeeshySpacing.md)
                // La pilule qui grandit rétrécit ses rangées (qui
                // défilent alors), jamais la grille sous ce minimum.
                .frame(minHeight: CallGroupStageSizing.minimumGridHeight)
            if pillText.isOnStage(isStageFullScreen: isStageFullScreen) {
                callControlsBlock
                    .overlay(alignment: .top) { callControlsNoticesAbove }
                    .padding(.horizontal, MeeshySpacing.md)
                    .padding(.bottom, Self.chromeBottomInset)
                    .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
            }
        }
        .padding(.bottom, isStageFullScreen && !pillText.isOnStage(isStageFullScreen: isStageFullScreen) ? DeviceLayout.safeAreaBottom : 0)
        // Chrome masqué, TOUTE la scène le rallume : l'en-tête et la
        // pilule effacés ne laisseraient que les 8 pt entre les vignettes.
        .background(stageRevealTarget)
        .background(
            GeometryReader { stage in
                Color.clear.preference(key: CallGroupStageHeightKey.self, value: stage.size.height)
            }
        )
        .onPreferenceChange(CallGroupStageHeightKey.self) { noteGroupStageHeight($0) }
        .animation(CallChromeStow.animation(reduceMotion: reduceMotion), value: isStageFullScreen)
    }

    /// Seul le franchissement du seuil écrit l'état : une rotation
    /// recalcule l'écran, un redimensionnement continu non.
    func noteGroupStageHeight(_ height: CGFloat) {
        let compact = CallGroupStageSizing.isCompactHeight(height)
        guard compact != isStageCompactHeight else { return }
        isStageCompactHeight = compact
    }

    private var stageRevealTarget: some View {
        Color.clear
            .contentShape(Rectangle())
            .onTapGesture { toggleControls() }
            .accessibilityHidden(true)
    }

    /// La bascule au toucher existe sur la scène de la loi 11 (vidéo, duo audio établi, groupe sans
    /// caméra), mais pas sous VoiceOver, où les contrôles restent en place.
    private var exposesTheTapToggle: Bool {
        CallChromeVisibility.mayToggleByTap(isTapStage: isTapStage, isVoiceOverRunning: UIAccessibility.isVoiceOverRunning)
    }

    private var isTapStage: Bool {
        CallChromeVisibility.isTapStage(isVideoStage: isVideoStage, isConnected: showsConnectedLayout)
    }

    /// La porte UNIQUE par laquelle un contrôle dit qu'il est touché
    /// (`callChromeInteraction`). Seul compte le toucher reçu pendant le fondu
    /// de disparition, qui rallume le chrome : un appui n'écrit aucun état de
    /// la racine, il recalculerait tout l'écran d'appel.
    func noteChromeInteraction(_ interaction: CallChromeInteraction) {
        guard interaction.revealsChrome, !showControls else { return }
        withAnimation(CallChromeStow.animation(reduceMotion: reduceMotion)) { showControls = true }
    }

    func toggleControls() {
        if CallCameraRail.consumesTapElsewhere(isFoldedMenuOpen: isCameraMenuUnfolded) {
            return tapCameraMenu(.elsewhere)
        }
        guard isTapStage else { return }
        withAnimation(CallChromeStow.animation(reduceMotion: reduceMotion)) { showControls.toggle() }
    }

    /// Whether to render the full-screen LOCAL self-preview as the call
    /// background. True ONLY while waiting to connect (ringing/offering/
    /// connecting) so the user sees themselves before the peer's video arrives.
    /// Once `.connected`/`.reconnecting`, the primary stream + PiP own the
    /// single video surface, so a full-screen local layer here would duplicate
    /// the local feed (rendered again in the PiP) — the double-frame bug.
    var shouldShowSelfPreviewBackground: Bool {
        guard callManager.isVideoEnabled, callManager.hasLocalVideoTrack else { return false }
        switch callManager.callState {
        case .connected, .reconnecting: return false
        default: return true
        }
    }

    /// §7.1 — iOS-app-on-Mac (NOT Catalyst). Drives desktop-specific UI:
    /// letterboxed remote video (no crop), persistent controls, hidden
    /// speaker/flip controls.
    var isOnMac: Bool { ProcessInfo.processInfo.isiOSAppOnMac }

    /// §7.1 — fill (crop) on phone/tablet for an immersive edge-to-edge feed;
    /// fit (letterbox) on Mac where the window is resizable and cropping the
    /// peer is undesirable.
    private var primaryVideoContentMode: UIView.ContentMode {
        isOnMac || callManager.screenShare.isRemoteSharing ? .scaleAspectFit : .scaleAspectFill
    }

    /// Le repos du duo audio sous son avatar (que `CallAudioStage` pose) : le
    /// nom, la durée, puis les états.
    var audioCallLayout: some View {
        VStack(spacing: MeeshySpacing.lg) {
            Text(callManager.remoteUsername ?? String(localized: "call.unknown", defaultValue: "Inconnu", bundle: .main))
                .font(.system(.title, design: .rounded).weight(.semibold))
                .foregroundStyle(Color.white)

            // La durée, sous le nom ; le réseau dégradé vit dans la capsule de l'en-tête (#17341).
            CallDurationClock {
                HStack(spacing: MeeshySpacing.xsPlus) {
                    Text(callManager.formattedDuration)
                        .font(.body.weight(.medium).monospacedDigit())
                        .foregroundColor(MeeshyColors.indigo400)
                        // Without an explicit label the combined capsule announces a
                        // context-free "1:23" (the signal glyph is invisible on a
                        // healthy link) — VoiceOver users can't tell it is the call
                        // timer. Static label + dynamic value mirror the video badge
                        // (and FloatingCallPillView 211i): the label reads once, the
                        // timer updates via .accessibilityValue under .updatesFrequently.
                        .accessibilityLabel(String(localized: "call.duration.a11y.label"))
                        .accessibilityValue(callManager.spokenDuration)
                }
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.vertical, MeeshySpacing.xsPlus)
                .background(
                    Capsule()
                        .fill(MeeshyColors.indigo400.opacity(MeeshyOpacity.light))
                )
                // Naked-readout fix (doctrine 206i/210i/211i): the combined element
                // previously announced a bare "0:34" with no context. Signal state is
                // already surfaced by the separate statusPill row here (unlike the video
                // badge), so this label carries only call-duration context — no double
                // announcement. Reuses the existing `call.duration.a11y.label` key.
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(String(localized: "call.duration.a11y.label"))
                .accessibilityValue(callManager.spokenDuration)
                .accessibilityAddTraits(.updatesFrequently)
            }
            .callQualityDetailTrigger(isPresented: $showQualityDetail)

            CallAudioStatusRow(isReconnecting: isReconnectingCall, isMuted: callManager.isMuted, isPeerMuted: !callManager.isRemoteAudioEnabled,
                               isSpeaker: callManager.isSpeaker, isSignalingDegraded: callManager.isSignalingDegraded)
        }
    }

    private var isReconnectingCall: Bool {
        if case .reconnecting = callManager.callState { return true }
        return false
    }

    // MARK: - Connection Quality (glyphe signal)

    /// Niveau du glyphe signal — priorité aux stats RTT+perte (mises à jour
    /// chaque `statsIntervalSeconds`), état ICE binaire en repli. Le mapping
    /// niveaux→barres/couleur vit dans `CallSignalStrength` (pur, testé).
    var signalStrength: CallSignalStrength {
        CallSignalStrength.from(
            level: callManager.liveVideoQualityLevel,
            connection: callManager.connectionQuality
        )
    }

    /// The video duration badge (unlike the audio layout's separate
    /// `statusPill` rows) is the ONLY place signal quality / peer-network state
    /// surfaces in the video call chrome — so its composed VoiceOver label must
    /// carry everything the badge visually shows (glyph + wifi-exclamation),
    /// not just the duration. Applying `.accessibilityLabel`/`.accessibilityValue`
    /// directly to the badge's `HStack` implicitly makes it one opaque
    /// accessibility element (`children: .ignore`) that silently discards every
    /// child's own `.accessibilityLabel` — this composes what would otherwise be
    /// swallowed, mirroring exactly what the sighted layout renders.
    var videoDurationBadgeAccessibilityLabel: String {
        let reconnecting: Bool
        if case .reconnecting = callManager.callState { reconnecting = true } else { reconnecting = false }
        let capsule = headerCapsule
        return CallVideoBadgeAccessibility.label(
            title: capsule?.spokenTitle,
            participants: capsule?.participantCount,
            includesDuration: capsule?.showsDuration ?? true,
            signalDegraded: signalStrength.isDegraded ? signalStrength.accessibilityLabel : nil,
            peerMuted: !callManager.isRemoteAudioEnabled && capsule?.showsDuration != false,
            peerNetworkWeak: callManager.isRemoteQualityDegraded,
            reconnecting: reconnecting && capsule?.showsDuration != false
        )
    }

    var isConnectionDegraded: Bool {
        // Sustained flag only (2 consecutive degraded stats ticks) — a single
        // 5 s sample must never flash the "Connexion instable" pill.
        if callManager.liveVideoQualityLevel != nil {
            return callManager.isLinkQualityDegraded
        }
        switch callManager.connectionQuality {
        case .disconnected, .failed: return true
        default: return false
        }
    }

    var videoCallLayout: some View {
        ZStack {
            // §7.2 — full-bleed PRIMARY stream (edge-to-edge, single surface).
            // `swapStreams` decides whether the primary is the remote feed
            // (default) or the local camera (after a PiP tap). The OTHER stream
            // is rendered in the draggable PiP. §7.1 — letterbox on Mac, fill on
            // phone/tablet. The duration chip lives in the header row
            // (`topChrome`), inside the safe area.
            videoStream(local: effectiveSwapStreams, contentMode: primaryVideoContentMode)
                .callCameraZoom(isEnabled: effectiveSwapStreams)
                .ignoresSafeArea()
                .modifier(CallReceivedScreenZoom(isReceivingScreen: callManager.screenShare.isRemoteSharing))
            // Le cadre en direct du duo, composé ici, au-dessus de la vidéo.
            liveFrameSurface
                .ignoresSafeArea()
            // Le micro coupé du correspondant reste sur SON image,
            // sous la rangée d'en-tête, même quand le chrome s'efface.
            if showsPeerMutedBadge && !effectiveSwapStreams {
                CallPeerMutedBadge(compact: false)
                    .padding(.top, Self.chromeTopInset + 52)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .animation(.easeInOut(duration: reduceMotion ? CallChromeStow.reducedFadeDuration : 0.2), value: showsPeerMutedBadge)
        .animation(CallChromeStow.animation(reduceMotion: reduceMotion), value: isLiveFrameShown)
    }

    /// En duo vidéo, le micro coupé du correspondant se voit sur son
    /// image (la disposition audio a sa pastille « Contact en sourdine »).
    var showsPeerMutedBadge: Bool {
        !callManager.isRemoteAudioEnabled && !isGroupStage
    }

    /// Effective primary-stream selector — `swapStreams` gated on local-track
    /// availability. `CallVideoView` has no fallback for a nil LOCAL track
    /// (unlike the remote branch, which degrades to a camera-off/connecting
    /// placeholder), so rendering it as the full-screen primary while the
    /// survival controller has dropped the outbound track shows a broken
    /// black "Video non disponible" placeholder over a perfectly healthy peer
    /// feed, with no gesture available to swap back (the PiP that owns the
    /// swap tap is itself replaced by the gesture-less suspended tile in that
    /// state). Falling back to `false` here keeps the peer's video primary —
    /// and the suspended-tile/PiP selector below already renders correctly
    /// for `swapStreams == false` — until the local track returns, at which
    /// point the user's swap choice is restored automatically.
    var effectiveSwapStreams: Bool {
        swapStreams && callManager.hasLocalVideoTrack && !callManager.screenShare.isRemoteSharing
    }

    /// §7.2 — renders one call stream. `local == true` shows the (mirrored)
    /// local camera; otherwise the remote feed, degrading to a camera-off
    /// placeholder (peer's camera off) or a connecting placeholder (no track
    /// yet). Shared by the full-area primary and the PiP so a swap just flips
    /// the `local` flag on each.
    @ViewBuilder
    func videoStream(local: Bool, contentMode: UIView.ContentMode) -> some View {
        if local {
            // §7.7 — mirror ONLY the front camera (a mirrored back camera shows
            // reversed text/scene — bug k).
            LocalCameraVideoView(track: callManager.localVideoTrack, intendedFront: callManager.isUsingFrontCamera, contentMode: contentMode)
        } else {
            ZStack {
                switch remoteVideoSurface {
                case .live:
                    CallVideoView(track: callManager.remoteVideoTrack, contentMode: contentMode)
                        .transition(.opacity)
                case .cameraOff:
                    // Peer turned its camera off (or sends no image at
                    // all): avatar placeholder, never the frozen last
                    // frame nor an endless spinner.
                    remoteCameraOffPlaceholder
                        .transition(.opacity)
                case .connecting:
                    connectingVideoPlaceholder
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: CallRemoteVideoFade.duration(reduceMotion: reduceMotion)), value: remoteVideoSurface)
        }
    }

    var remoteVideoSurface: CallRemoteVideoSurface {
        CallRemoteVideoSurface.resolve(
            hasTrack: callManager.hasRemoteVideoTrack,
            peerVideoEnabled: callManager.isRemoteVideoEnabled,
            waitElapsed: callManager.hasEstablishedMedia
                && remoteVideoWaitElapsedCallId != nil
                && remoteVideoWaitElapsedCallId == callManager.currentCallId
        )
    }

    private var connectingVideoPlaceholder: some View {
        Color.black.opacity(0.4)
            .overlay(
                VStack(spacing: MeeshySpacing.md) {
                    ProgressView()
                        .tint(.white.opacity(MeeshyOpacity.strong))
                        .accessibilityHidden(true)
                    Text(String(localized: "call.video.connecting", defaultValue: "Connexion vidéo...", bundle: .main))
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(Color.white.opacity(0.4))
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, MeeshySpacing.xxxl)
                .accessibilityElement(children: .combine)
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            // The watchdog runs only while this placeholder is on screen; SwiftUI
            // cancels the task the moment the remote track arrives and the view
            // is replaced by the live feed. When it fires, the peer is
            // shown with its camera off: nothing is loading any more.
            .task(id: callManager.currentCallId) {
                try? await Task.sleep(for: .seconds(Double(videoConnectWatchdogSeconds)))
                if !Task.isCancelled {
                    withAnimation(.easeInOut(duration: 0.3)) {
                        remoteVideoWaitElapsedCallId = callManager.currentCallId
                    }
                    guard callManager.hasEstablishedMedia else { return }
                    UIAccessibility.post(
                        notification: .announcement,
                        argument: String(localized: "call.video.remoteOff", defaultValue: "Caméra désactivée", bundle: .main)
                    )
                }
            }
    }

    // P0-3 — shown full-area when the remote peer has a video track but turned
    // its camera off, so the user sees the peer's avatar rather than a frozen
    // last frame.
    private var remoteCameraOffPlaceholder: some View {
        CallRemoteCameraOffPlaceholder(peerUserId: callManager.remoteUserId, relayedSpeaking: CallPeerSpeech.relayed(meshActive: mesh.isGroupCallActive, speakers: mesh.speakingUserIds, peer: callManager.remoteUserId), sampleLevel: { await callManager.primaryAudioLevels()?.primary }) {
            avatarFace(size: 96, accentHex: $0)
        }
    }
}

/// P9.6 — l'anneau et le halo de la personne, de SA couleur, à la parole seulement :
/// la loi unique du duo audio et de la caméra coupée. Ils restent dans l'arbre en
/// opacité 0 au repos et se fondent (`CallRemoteVideoFade`, plus court sous « Réduire
/// les animations »). La décoration de profil reste sous l'anneau, dans le visage.
/// Le niveau reçu est relevé tant que l'écran le suit (`follows`), sauf quand le
/// maillage d'un groupe le relève déjà (`relayedSpeaking`).
struct CallPeerSpeechRing<Avatar: View>: View {
    let peerUserId: String?
    let relayedSpeaking: Bool?
    let follows: Bool
    let sampleLevel: @MainActor () async -> Double?
    @ViewBuilder let avatar: (String) -> Avatar

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var sampledSpeaking = false

    private var isSpeaking: Bool { follows && (relayedSpeaking ?? sampledSpeaking) }

    var body: some View {
        let hex = CallPeerSpeech.colorHex(forPeer: peerUserId)
        let color = Color(uiColor: HexColor(hex: hex)?.uiColor ?? .white)
        avatar(hex)
            .modifier(CallSpeakerHalo(shape: Circle(), color: color, spread: 1.25, isSpeaking: isSpeaking))
            .overlay {
                Circle()
                    .stroke(color, lineWidth: 3)
                    .padding(-6)
                    .opacity(isSpeaking ? 1 : 0)
            }
            .animation(
                .easeInOut(duration: CallRemoteVideoFade.duration(reduceMotion: reduceMotion)),
                value: isSpeaking
            )
            .task(id: follows && relayedSpeaking == nil) {
                guard follows, relayedSpeaking == nil else { return }
                await followSpeech()
            }
    }

    private func followSpeech() async {
        var speech = CallPeerSpeech()
        while !Task.isCancelled {
            speech = speech.recording(level: await sampleLevel(), at: Date())
            if speech.isSpeaking != sampledSpeaking { sampledSpeaking = speech.isSpeaking }
            guard await cancellableSleep(for: .milliseconds(400)) else { return }
        }
    }
}

/// P9.6 · P11.5 · P14.4 — le halo de qui parle, à SA couleur : UNE loi pour le
/// disque du duo et pour la vignette d'un groupe. Il reste dans l'arbre en opacité 0
/// au repos ; l'hôte en règle le fondu (`CallRemoteVideoFade`). Il ne prend aucun toucher.
struct CallSpeakerHalo<HaloShape: Shape>: ViewModifier {
    let shape: HaloShape
    let color: Color
    let spread: CGFloat
    let isSpeaking: Bool

    func body(content: Content) -> some View {
        content.background {
            shape
                .fill(color.opacity(MeeshyOpacity.medium))
                .scaleEffect(spread)
                .blur(radius: 14)
                .opacity(isSpeaking ? 1 : 0)
                .allowsHitTesting(false)
        }
    }
}

extension CallPeerSpeechRing {
    /// Le duo audio : la parole de l'autre vient du maillage quand un groupe est encore
    /// montré en duo, sinon elle se relève ici, et seulement une fois l'audio établi.
    @MainActor
    init(callManager: CallManager, mesh: GroupCallMeshCoordinator, @ViewBuilder avatar: @escaping (String) -> Avatar) {
        let established: Bool
        switch callManager.callState {
        case .connected, .reconnecting: established = true
        default: established = false
        }
        self.init(
            peerUserId: callManager.remoteUserId,
            relayedSpeaking: CallPeerSpeech.relayed(meshActive: mesh.isGroupCallActive, speakers: mesh.speakingUserIds, peer: callManager.remoteUserId),
            follows: established,
            sampleLevel: { await callManager.primaryAudioLevels()?.primary },
            avatar: avatar
        )
    }
}

/// G4.2 — la caméra du pair est coupée : son avatar, et l'anneau et le halo de SA
/// couleur quand il parle (rien au repos, `CallPeerSpeechRing`).
struct CallRemoteCameraOffPlaceholder<Avatar: View>: View {
    let peerUserId: String?
    let relayedSpeaking: Bool?
    let sampleLevel: @MainActor () async -> Double?
    @ViewBuilder let avatar: (String) -> Avatar

    var body: some View {
        ZStack {
            Color.black.opacity(MeeshyOpacity.strong)
            VStack(spacing: MeeshySpacing.mdPlus) {
                CallPeerSpeechRing(peerUserId: peerUserId, relayedSpeaking: relayedSpeaking, follows: true,
                                   sampleLevel: sampleLevel, avatar: avatar)
                    .accessibilityHidden(true)
                HStack(spacing: MeeshySpacing.xsPlus) {
                    Image(systemName: "video.slash.fill")
                        .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                        .accessibilityHidden(true)
                    Text(String(localized: "call.video.remoteOff", defaultValue: "Caméra désactivée", bundle: .main))
                        .font(.footnote.weight(.medium))
                }
                .foregroundStyle(Color.white.opacity(0.6))
                .accessibilityElement(children: .combine)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private nonisolated struct CallGroupStageHeightKey: PreferenceKey {
    static let defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

/// P9b.15 (#18206) — le duo audio, du repos (avatar de 120 pt au centre, nom, durée, états) au journal
/// ouvert dans la pilule (avatar de 56 pt en tête, le nom et la durée à côté) : UNE vue d'avatar, dont
/// la disposition change (`AnyLayout` garde son identité). Elle glisse et se réduit vers l'en-tête
/// compact pendant que le nom et la durée la rejoignent en fondu, ≈ 200 ms, puis le chemin inverse.
/// « Réduire les animations » : chaque disposition est une vue à part, qui se fond sur place.
struct CallAudioStage<Avatar: View, Compact: View, Rest: View>: View {
    let isCompact: Bool
    let compactTopInset: CGFloat
    let avatar: Avatar
    let compact: Compact
    let rest: Rest

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(isCompact: Bool, compactTopInset: CGFloat, @ViewBuilder avatar: () -> Avatar,
         @ViewBuilder compact: () -> Compact, @ViewBuilder rest: () -> Rest) {
        self.isCompact = isCompact
        self.compactTopInset = compactTopInset
        self.avatar = avatar()
        self.compact = compact()
        self.rest = rest()
    }

    var body: some View {
        ZStack {
            arrangement
                .id(CallAudioStageLayout.identity(isCompact: isCompact, reduceMotion: reduceMotion))
                .transition(.opacity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .animation(.easeInOut(duration: CallAudioStageLayout.transitionDuration(reduceMotion: reduceMotion)), value: isCompact)
    }

    private var arrangement: some View {
        let layout = isCompact ? AnyLayout(HStackLayout(spacing: MeeshySpacing.md)) : AnyLayout(VStackLayout(spacing: MeeshySpacing.lg))
        return layout {
            avatar
                .padding(.bottom, isCompact ? 0 : MeeshySpacing.sm)
            if isCompact {
                compact.transition(.opacity)
            } else {
                rest.transition(.opacity)
            }
        }
        .padding(.horizontal, isCompact ? MeeshySpacing.lg : 0)
        .padding(.top, isCompact ? compactTopInset : 0)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: isCompact ? .topLeading : .center)
    }
}

/// #17343 — l'en-tête compact de l'appel audio quand le journal ouvert dans la pilule prend une part
/// de la fenêtre : le nom et la durée, à côté de l'avatar resserré que `CallAudioStage` pose. La
/// durée se relit sous l'horloge, à 1 Hz.
struct CallCompactAudioHeader: View {
    let name: String
    let duration: () -> String
    let spokenDuration: () -> String
    @Binding var showsQualityDetail: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
            Text(name)
                .font(.system(.headline, design: .rounded).weight(.semibold))
                .foregroundStyle(Color.white)
                .lineLimit(1)

            CallDurationClock {
                Text(duration())
                    .font(.caption.weight(.medium).monospacedDigit())
                    .foregroundStyle(MeeshyColors.indigo400)
                    // Aucune rangée d'états ici : la durée s'annonce nommée,
                    // « Durée de l'appel, 0:34 », jamais un « 0:34 » nu.
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(String(localized: "call.duration.a11y.label"))
                    .accessibilityValue(spokenDuration())
                    .accessibilityAddTraits(.updatesFrequently)
            }
            .callQualityDetailTrigger(isPresented: $showsQualityDetail)
        }
    }
}

/// Les états de l'appel audio sous la durée (reconnexion, micro coupé, contact en sourdine,
/// haut-parleur, serveur déconnecté) : une vue feuille qui ne reçoit que des primitives.
struct CallAudioStatusRow: View {
    let isReconnecting: Bool
    let isMuted: Bool
    let isPeerMuted: Bool
    let isSpeaker: Bool
    let isSignalingDegraded: Bool

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            // §4.3 — reconnexion ICE en cours : une pill compacte, plutôt qu'un bandeau
            // plein-écran, au même endroit que les autres indicateurs de statut.
            if isReconnecting {
                CallStatusPill(icon: "arrow.triangle.2.circlepath", text: String(localized: "call.reconnecting", defaultValue: "Reconnexion…", bundle: .main), color: MeeshyColors.warning)
            }
            if isMuted {
                CallStatusPill(icon: "mic.slash.fill", text: String(localized: "call.status.muted", defaultValue: "Micro coupé", bundle: .main), color: MeeshyColors.error)
            }
            if isPeerMuted {
                CallStatusPill(icon: "mic.slash", text: String(localized: "call.status.peer.muted", defaultValue: "Contact en sourdine", bundle: .main), color: .white.opacity(MeeshyOpacity.heavy))
            }
            if isSpeaker {
                CallStatusPill(icon: "speaker.wave.3.fill", text: String(localized: "call.status.speaker", defaultValue: "Haut-parleur", bundle: .main), color: MeeshyColors.info)
            }
            if isSignalingDegraded {
                CallStatusPill(icon: "antenna.radiowaves.left.and.right.slash", text: String(localized: "call.status.signaling", defaultValue: "Serveur déconnecté", bundle: .main), color: MeeshyColors.warning)
            }
        }
    }
}
