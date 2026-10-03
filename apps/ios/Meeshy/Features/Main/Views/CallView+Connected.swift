import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI
import os

// L'appel établi : disposition audio, disposition vidéo, flux primaire et
// indicateurs de qualité. Sorti de `CallView.swift` (hors budget, #8276).

extension CallView {
    // MARK: - Connected

    var connectedView: some View {
        // #8394 — UN conteneur de verre pour tout ce qui flotte au-dessus de
        // l'appel établi : le bloc de verre de la pilule (qui porte les
        // actions du (…), #8459), le bandeau de sous-titres, l'en-tête. Des
        // verres voisins ne se superposent jamais (le verre ne peut pas
        // échantillonner le verre) ; ils se fondent entre eux.
        AdaptiveGlassContainer(spacing: 12) {
            ZStack {
                if isGroupStage {
                    groupStageLayout
                } else {
                    duoLayout
                }

                CallScreenShareBanner(isSharing: callManager.screenShare.isSharing, remoteSharerName: callManager.screenShare.isRemoteSharing ? (callManager.remoteUsername ?? "") : nil, onStop: callManager.screenShare.stopSharing)
                    .equatable().padding(.top, 60).frame(maxHeight: .infinity, alignment: .top)
                    .callChromeVisibility(chromeVisibility.isVisible(.screenShareBanner))

                if !isGroupStage && chromeVisibility.isVisible(.selfView) && !isLiveFrameShown {
                    duoOverlays
                }

                cameraRail

                callControlsLayer

                callModeLayer

                CallRecordingOverlay(phase: callManager.recording.phase, notice: callManager.recording.notice, kind: callManager.recording.kind, requesterName: callManager.remoteUsername ?? "", onAnswer: { _ = callManager.recording.answer(accepted: $0) }, onStop: { _ = callManager.recording.stop() }, onDismiss: callManager.recording.dismissNotice, showsStatus: chromeVisibility.isVisible(.recordingStatus))
                    .equatable().padding(.top, 110).frame(maxHeight: .infinity, alignment: .top)

                CallCaptureFlash(capture: capture, reduceMotion: reduceMotion)
                CallCaptureOutcomeAnnouncer(capture: capture)
            }
        }
        // Le sélecteur système de diffusion vit dans la hiérarchie en
        // permanence, et en UN seul endroit : le bouton « Écran » vit avec les
        // commandes de ma caméra (vignette, haut de l'écran ou (…), #8626).
        .background(screenSharePicker.host.frame(width: 1, height: 1).opacity(0.02).accessibilityHidden(true))
        // §7.1 — populate the camera list when video turns on so the « mon
        // image » actions can decide flip vs device picker (Continuity/USB).
        .task(id: callManager.isVideoEnabled) {
            if callManager.isVideoEnabled { callManager.refreshAvailableCameras() }
        }
        .onAppear { showEffectsToolbar = false }
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
                isSelfFeatured = false
            }
        }
        .adaptiveOnChange(of: isVideoStage) { _, isVideo in
            if !isVideo { withAnimation(.easeInOut(duration: 0.25)) { showControls = true } }
        }
        // Surfaces a start failure that `advanceCaptionsMode()` couldn't see at
        // tap time (the start path is async — permission request + on-device
        // recognizer/audio-engine checks all happen after the button already
        // optimistically opened the transcript panel). Without this, a failed
        // start (e.g. no on-device speech recognizer for the user's language —
        // never falls back to Apple's server-side recognizer, privacy decision)
        // left the panel open and empty with zero feedback — user-reported
        // 2026-07-11: "on dirait que la transcription ne fonctionne pas".
        // Échec du moteur LOCAL (permission refusée, langue non supportée
        // on-device…) : toast explicite, mais le panneau RESTE ouvert en
        // réception seule — la réception des transcriptions du pair est liée
        // à la visibilité du panneau (spec 2026-08-13), le fermer ici
        // couperait aussi ce flux. L'ancien auto-reveal du panneau au premier
        // segment reçu est retiré par la même spec : panneau caché ⇒
        // désabonné, aucun segment ne peut plus arriver panneau fermé.
        .adaptiveOnChange(of: transcriptionService.lastError) { _, newError in
            guard let newError else { return }
            FeedbackToastManager.shared.showError(transcriptionErrorMessage(for: newError))
        }
        .adaptiveOnChange(of: latestFinalRemoteSegmentId) { _, _ in
            announceLatestCaption()
        }
        .sheet(isPresented: panelSheet(.journal)) {
            captionsJournal
        }
        .sheet(isPresented: $showLiveFramePicker) { liveFramePicker }
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
                // #8978 — tap the primary video to hide the controls, tap again to
                // bring them back; nothing hides them on a timer. The PiP (on top)
                // keeps its own swap tap.
                videoCallLayout
                    .contentShape(Rectangle())
                    .onTapGesture { toggleControls() }
                    // Swipe-down-to-minimize is attached HERE, not on the whole
                    // connectedView ZStack: the draggable PiP is a sibling ABOVE
                    // this layer, so moving the PiP no longer also dismisses the
                    // full-screen call (user-reported 2026-07-02).
                    .simultaneousGesture(swipeDownToLeaveGesture)
                    .accessibilityLabel(showControls
                        ? String(localized: "call.video.hideControls", defaultValue: "Masquer les contrôles", bundle: .main)
                        : String(localized: "call.video.showControls", defaultValue: "Afficher les contrôles", bundle: .main))
                    .accessibilityAddTraits(.isButton)
                    // Under VoiceOver the controls stay put — this tap element has no
                    // meaningful purpose then, so it leaves the accessibility tree.
                    .accessibilityHidden(!exposesTheTapToggle)
            }

            VStack(spacing: MeeshySpacing.md) {
                if !callManager.isVideoUIActive {
                    if showTranscript {
                        // Captions active on an audio call: compact header at
                        // the top, structural transcript panel filling the
                        // freed space — replaces the old vertically-centered
                        // avatar layout while captions are on.
                        compactAudioCallHeader
                            .padding(.top, Self.chromeTopInset + 52)
                        transcriptPanel
                            .padding(.horizontal, MeeshySpacing.lg)
                            .frame(maxHeight: .infinity)
                    } else {
                        // #8435 — en audio aussi, glisser vers le bas quitte
                        // le plein écran. Pas sur le panneau de sous-titres :
                        // son défilement garde ses propres glissés.
                        VStack(spacing: MeeshySpacing.md) {
                            Spacer()
                            audioCallLayout
                            Spacer()
                        }
                        .contentShape(Rectangle())
                        .simultaneousGesture(swipeDownToLeaveGesture)
                    }
                } else {
                    Spacer()
                }

                VStack(spacing: MeeshySpacing.md) {
                    // #8396 — le bandeau de sous-titres, juste au-dessus de la
                    // pilule ; il RESTE quand les actions sont rangées, et
                    // quand le chrome se masque.
                    if callManager.isVideoUIActive && showTranscript {
                        captionsBand(hasOwnGlass: true)
                            .padding(.horizontal, MeeshySpacing.lg)
                            .transition(.opacity)
                    }

                    // §7.3 — la pilule et ses actions se masquent avec l'en-tête
                    // en vidéo (4 s) ; toujours visibles en audio, sur Mac, avec
                    // VoiceOver. Masquées, elles ne captent aucun toucher.
                    callControlsPill
                        .padding(.horizontal, MeeshySpacing.lg)
                        .padding(.bottom, Self.chromeBottomInset)
                        .callChromeVisibility(isChromeVisible)
                }
                // #8735 — les invitations qui sonnent et le mot de retour se
                // posent AU-DESSUS du bloc, jamais sur ses rangées.
                .overlay(alignment: .top) { callControlsNoticesAbove }
            }
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: showTranscript)
        }
    }

    /// #8435 — le glissé vers le bas du duo : la décision vit dans
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
                    isEffectsOpen: showEffectsToolbar || !layer.mayAutoHide
                )
            }
            .onEnded { value in
                let outcome = CallPiPPolicy.swipeDownOutcome(
                    translation: value.translation.height,
                    predictedTranslation: value.predictedEndTranslation.height,
                    isGroup: isGroupStage,
                    isEffectsOpen: showEffectsToolbar || !layer.mayAutoHide,
                    canSystemPiP: callManager.canActivateSystemPiP
                )
                withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                    swipeDownOffset = 0
                }
                leaveFullScreen(outcome)
            }
    }

    /// Ce qui flotte AU-DESSUS de la disposition 1:1 : la vignette perso. Les
    /// actions du `(…)` montent au-dessus de la pilule (#8432).
    @ViewBuilder
    private var duoOverlays: some View {
        // §7.2 — draggable, corner-snapping PiP showing the secondary
        // stream. Tap to swap it with the full-area primary (FaceTime).
        if callManager.isVideoEnabled && callManager.hasLocalVideoTrack {
            pipView
        } else if callManager.isVideoEnabled && callManager.isVideoSuspended {
            // Survie réseau : depuis L6-1 la piste locale RESTE attachée
            // (l'encodeur est au plancher), donc `hasLocalVideoTrack` est
            // vrai et c'est la PiP qui gagne — elle montre l'image
            // réellement gelée. Cette branche ne sert plus que si la piste
            // disparaît pour une AUTRE raison (échec de ré-acquisition) :
            // une tuile « en pause » sur l'avatar plutôt qu'une self-view
            // qui s'évapore.
            localVideoSuspendedTile
        }
    }

    /// #8276 — la scène de groupe entre l'en-tête et la pilule, dans le flux
    /// de la mise en page : quand la pilule grandit (rangées, sous-titres), la
    /// grille rétrécit au lieu de passer dessous — en portrait comme en paysage.
    private var groupStageLayout: some View {
        VStack(spacing: MeeshySpacing.sm) {
            Color.clear
                .frame(height: isStageFullScreen ? DeviceLayout.safeAreaTop : Self.chromeTopInset + 52)
            GroupCallStageView(mesh: mesh, callManager: callManager, isFullScreen: $isStageFullScreen, isChromeVisible: isChromeVisible, onStageTap: toggleControls, onSelfFeaturedChange: { isSelfFeatured = $0 })
                .padding(.horizontal, MeeshySpacing.md)
                // #8410 — la pilule qui grandit rétrécit ses rangées (qui
                // défilent alors), jamais la grille sous ce minimum.
                .frame(minHeight: CallGroupStageSizing.minimumGridHeight)
            if !isStageFullScreen {
                ZStack(alignment: .bottom) {
                    callControlsPill
                        .callChromeVisibility(isChromeVisible)
                    if showTranscript && !isChromeVisible {
                        captionsBand(hasOwnGlass: true)
                            .transition(.opacity)
                    }
                }
                .overlay(alignment: .top) { callControlsNoticesAbove }
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.bottom, Self.chromeBottomInset)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .padding(.bottom, isStageFullScreen ? DeviceLayout.safeAreaBottom : 0)
        // #8735 — chrome masqué, TOUTE la scène le rallume : l'en-tête et la
        // pilule effacés ne laissaient que les 8 pt entre les vignettes.
        .background(stageRevealTarget)
        .background(
            GeometryReader { stage in
                Color.clear.preference(key: CallGroupStageHeightKey.self, value: stage.size.height)
            }
        )
        .onPreferenceChange(CallGroupStageHeightKey.self) { noteGroupStageHeight($0) }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: isStageFullScreen)
    }

    /// #8410 — seul le franchissement du seuil écrit l'état : une rotation
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

    /// #8978 — la bascule au toucher n'existe que sur une scène vidéo, et pas sous VoiceOver,
    /// où les contrôles restent en place.
    private var exposesTheTapToggle: Bool {
        CallChromeVisibility.mayToggleByTap(isVideoStage: isVideoStage) && !UIAccessibility.isVoiceOverRunning
    }

    /// #8735 — la porte UNIQUE par laquelle un contrôle dit qu'il est touché
    /// (`callChromeInteraction`). Seul compte le toucher reçu pendant le fondu
    /// de disparition, qui rallume le chrome : un appui n'écrit aucun état de
    /// la racine, il recalculerait tout l'écran d'appel (#8978).
    func noteChromeInteraction(_ interaction: CallChromeInteraction) {
        guard interaction.revealsChrome, !showControls else { return }
        withAnimation(.easeInOut(duration: CallChromeVisibility.fadeDuration)) { showControls = true }
    }

    func toggleControls() {
        if CallCameraRail.consumesTapElsewhere(isFoldedMenuOpen: isCameraMenuUnfolded) {
            return tapCameraMenu(.elsewhere)
        }
        guard CallChromeVisibility.mayToggleByTap(isVideoStage: isVideoStage) else { return }
        withAnimation(.easeInOut(duration: 0.25)) { showControls.toggle() }
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

    var audioCallLayout: some View {
        VStack(spacing: MeeshySpacing.lg) {
            // Duo d'avatars (no pulse) — correspondant + pastille locale.
            // Decorative: the remote user's name is shown as a Text element
            // directly below, mirroring pulsingAvatar's rationale — without
            // .accessibilityHidden VoiceOver reads the avatar initial, then
            // "Vous", then the full name as three disjoint stops.
            callAvatarPair(size: 120)
                .accessibilityHidden(true)
                .padding(.bottom, MeeshySpacing.sm)

            Text(callManager.remoteUsername ?? String(localized: "call.unknown", defaultValue: "Inconnu", bundle: .main))
                .font(.system(.title, design: .rounded).weight(.semibold))
                .foregroundColor(.white)

            // Duration + glyphe signal code couleur (P2-iOS-10 → 2026-07-04) :
            // invisible sur lien sain, apparaît à la dégradation, persiste en
            // vert `recoveryLingerSeconds` après récupération puis se retire
            // (cycle de vie dans TransientCallSignalGlyph).
            CallDurationClock {
                HStack(spacing: MeeshySpacing.xsPlus) {
                    TransientCallSignalGlyph(strength: signalStrength)
                    Text(callManager.formattedDuration)
                        .font(.body.weight(.medium).monospacedDigit())
                        .foregroundColor(durationColor)
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
                        .fill(durationColor.opacity(MeeshyOpacity.light))
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

            // Status indicators
            HStack(spacing: MeeshySpacing.md) {
                // §4.3 — reconnexion ICE en cours : remplace l'ancien bandeau
                // plein-écran (user-reported 2026-07-11) par une pill compacte,
                // au même endroit que les autres indicateurs de statut.
                if case .reconnecting = callManager.callState {
                    statusPill(icon: "arrow.triangle.2.circlepath", text: String(localized: "call.reconnecting", defaultValue: "Reconnexion…", bundle: .main), color: MeeshyColors.warning)
                }
                if callManager.isMuted {
                    statusPill(icon: "mic.slash.fill", text: String(localized: "call.status.muted", defaultValue: "Micro coupé", bundle: .main), color: MeeshyColors.error)
                }
                if !callManager.isRemoteAudioEnabled {
                    statusPill(icon: "mic.slash", text: String(localized: "call.status.peer.muted", defaultValue: "Contact en sourdine", bundle: .main), color: .white.opacity(MeeshyOpacity.heavy))
                }
                if callManager.isRemoteScreenCapturing {
                    statusPill(icon: "record.circle", text: String(localized: "call.status.peer.recording", defaultValue: "Enregistrement", bundle: .main), color: MeeshyColors.error)
                }
                if callManager.isSpeaker {
                    statusPill(icon: "speaker.wave.3.fill", text: String(localized: "call.status.speaker", defaultValue: "Haut-parleur", bundle: .main), color: MeeshyColors.info)
                }
                if isConnectionDegraded {
                    statusPill(icon: "wifi.exclamationmark", text: String(localized: "call.status.unstable", defaultValue: "Connexion instable", bundle: .main), color: MeeshyColors.warning)
                }
                // État persistant des alertes ponctuelles : tant que le lien du
                // contact / le signaling restent dégradés, une status pill
                // discrète le rappelle (la bannière, elle, s'est retirée).
                if callManager.isRemoteQualityDegraded {
                    statusPill(icon: "wifi.exclamationmark", text: String(localized: "call.status.peer.network", defaultValue: "Réseau faible (contact)", bundle: .main), color: MeeshyColors.warning)
                }
                if callManager.isSignalingDegraded {
                    statusPill(icon: "antenna.radiowaves.left.and.right.slash", text: String(localized: "call.status.signaling", defaultValue: "Serveur déconnecté", bundle: .main), color: MeeshyColors.warning)
                }
            }
        }
    }

    /// Compacted header shown INSTEAD of `audioCallLayout` while captions are
    /// active — avatar shrunk (120 → 56), status pills dropped, no longer
    /// vertically centered (sits at the top) so `transcriptPanel` gets the
    /// freed vertical space. User-requested 2026-07-11.
    var compactAudioCallHeader: some View {
        HStack(spacing: MeeshySpacing.md) {
            callAvatarPair(size: 56)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(callManager.remoteUsername ?? String(localized: "call.unknown", defaultValue: "Inconnu", bundle: .main))
                    .font(.system(.headline, design: .rounded).weight(.semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                CallDurationClock {
                    HStack(spacing: MeeshySpacing.xsPlus) {
                        TransientCallSignalGlyph(strength: signalStrength)
                        Text(callManager.formattedDuration)
                            .font(.caption.weight(.medium).monospacedDigit())
                            .foregroundColor(durationColor)
                            // Same context-free-timer fix as audioCallLayout: this
                            // caption-mode header has no status-pill row, so the
                            // labelled value is the only place the timer gains meaning.
                            .accessibilityLabel(String(localized: "call.duration.a11y.label"))
                            .accessibilityValue(callManager.spokenDuration)
                    }
                    // Same naked-readout fix as audioCallLayout — captions-active
                    // compact header. Bare "0:34" → "Durée de l'appel, 0:34".
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(String(localized: "call.duration.a11y.label"))
                    .accessibilityValue(callManager.spokenDuration)
                    .accessibilityAddTraits(.updatesFrequently)
                }
                .callQualityDetailTrigger(isPresented: $showQualityDetail)
            }

            Spacer()
        }
        .padding(.horizontal, MeeshySpacing.lg)
    }


    // MARK: - Connection Quality (P2-iOS-10 → glyphe signal 2026-07-04)

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
        return CallVideoBadgeAccessibility.label(
            signalDegraded: signalStrength.isDegraded ? signalStrength.accessibilityLabel : nil,
            peerMuted: !callManager.isRemoteAudioEnabled,
            peerNetworkWeak: callManager.isRemoteQualityDegraded,
            reconnecting: reconnecting
        )
    }

    private var isConnectionDegraded: Bool {
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

    private var durationColor: Color {
        isConnectionDegraded ? MeeshyColors.warning : MeeshyColors.indigo400
    }

    var videoCallLayout: some View {
        ZStack {
            // §7.2 — full-bleed PRIMARY stream (edge-to-edge, single surface).
            // `swapStreams` decides whether the primary is the remote feed
            // (default) or the local camera (after a PiP tap). The OTHER stream
            // is rendered in the draggable PiP. §7.1 — letterbox on Mac, fill on
            // phone/tablet. The duration chip lives in the header row
            // (`topChrome`, #8394), inside the safe area.
            videoStream(local: effectiveSwapStreams, contentMode: primaryVideoContentMode)
                .callCameraZoom(isEnabled: effectiveSwapStreams)
                .ignoresSafeArea()
            // #9214 — le cadre en direct du duo, composé ici, au-dessus de la vidéo.
            liveFrameSurface
                .ignoresSafeArea()
            // #8787 — le micro coupé du correspondant reste sur SON image,
            // sous la rangée d'en-tête, même quand le chrome s'efface.
            if showsPeerMutedBadge && !effectiveSwapStreams {
                CallPeerMutedBadge(compact: false)
                    .padding(.top, Self.chromeTopInset + 52)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: showsPeerMutedBadge)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: isLiveFrameShown)
    }

    /// #8787 — en duo vidéo, le micro coupé du correspondant se voit sur son
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
            switch remoteVideoSurface {
            case .live:
                CallVideoView(track: callManager.remoteVideoTrack, contentMode: contentMode)
            case .cameraOff:
                // P0-3 — peer turned its camera off (or sends no image at
                // all, #8788): avatar placeholder, never the frozen last
                // frame nor an endless spinner.
                remoteCameraOffPlaceholder
            case .connecting:
                connectingVideoPlaceholder
            }
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
                        .foregroundColor(.white.opacity(0.4))
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, MeeshySpacing.xxxl)
                .accessibilityElement(children: .combine)
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            // The watchdog runs only while this placeholder is on screen; SwiftUI
            // cancels the task the moment the remote track arrives and the view
            // is replaced by the live feed. #8788 — when it fires, the peer is
            // shown with its camera off: nothing is loading any more.
            .task(id: callManager.currentCallId) {
                try? await Task.sleep(nanoseconds: videoConnectWatchdogSeconds * 1_000_000_000)
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
        ZStack {
            Color.black.opacity(MeeshyOpacity.strong)
            VStack(spacing: MeeshySpacing.mdPlus) {
                avatarCircle(size: 96)
                    .accessibilityHidden(true)
                HStack(spacing: MeeshySpacing.xsPlus) {
                    Image(systemName: "video.slash.fill")
                        .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                        .accessibilityHidden(true)
                    Text(String(localized: "call.video.remoteOff", defaultValue: "Caméra désactivée", bundle: .main))
                        .font(.footnote.weight(.medium))
                }
                .foregroundColor(.white.opacity(0.6))
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
