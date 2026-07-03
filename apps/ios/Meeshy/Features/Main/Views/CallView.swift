import SwiftUI
import UIKit
import Combine
import MeeshySDK
import MeeshyUI
import os

// MARK: - Call View

struct CallView: View {
    @ObservedObject var callManager = CallManager.shared
    @Environment(\.colorScheme) private var colorScheme
    // Audit P2-iOS-9 — respect the user's Reduce Motion preference. Without
    // this check, the continuous pulse/ring animations ran indefinitely
    // even for motion-sensitive users (and burned battery).
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    // Instance du CallManager (et non un `@StateObject` local) : les segments
    // distants (DataChannel) et `toggleTranscription` opèrent sur CELLE-CI —
    // l'ancienne instance locale orpheline ne transcrivait jamais rien et
    // était ré-allouée à chaque présentation du CallView.
    @ObservedObject private var transcriptionService = CallManager.shared.transcriptionService
    @State private var pulseScale: CGFloat = 1.0
    @State private var showControls = true
    @State private var showTranscript = false
    @State private var showEffectsToolbar = false
    // §7.2 — PiP placement is corner-anchored (snap-to-nearest-corner) and
    // computed from a GeometryReader, not a hardcoded point. `pipDragOffset`
    // tracks the in-flight drag; `pipCorner` is the resting corner.
    @State private var pipCorner: PiPCorner = .topTrailing
    @State private var pipDragOffset: CGSize = .zero
    // §7.2 — FaceTime-style swap: which stream is the full-area "primary".
    // false ⇒ remote is primary + local in the PiP; true ⇒ swapped. Tapping
    // the PiP toggles it.
    @State private var swapStreams = false
    // §7.2/f — watchdog: after a delay with no remote video, the "Connexion
    // vidéo…" spinner turns into a calmer, informative state instead of
    // spinning forever (the media auto-repair / ICE-restart is §5.8).
    @State private var videoConnectSlow = false
    private let videoConnectWatchdogSeconds: UInt64 = 12
    // §H2 — After 6s in .offering with no answer, surface a calmer label
    // so the user knows the call is ringing, not stuck.
    @State private var sdpOfferSlow = false
    private let sdpOfferSlowSeconds: UInt64 = 6
    // Profil du correspondant (avatar + bannière) — résolu cache-first dès que
    // `remoteUserId` est connu, refresh API silencieux (Instant App). Sert
    // l'avatar des cercles d'appel et le fond pleine page.
    @State private var remoteProfile: MeeshyUser?

    var body: some View {
        ZStack {
            // PiP système — ancre invisible plein écran : `sourceView` d'où la
            // fenêtre PiP émerge. `attachSystemPiP` se gate sur canActivateSystemPiP
            // (no-op hors appel vidéo), donc inoffensive ici en permanence.
            PiPSourceAnchor()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .allowsHitTesting(false)

            // Background: full-screen LOCAL self-preview ONLY while waiting to
            // connect (ringing/offering/connecting) — the user sees themselves
            // before the peer's video arrives. Once `.connected`/`.reconnecting`,
            // the primary stream (`videoCallLayout`) + the `pipView` own the
            // single video surface; keeping a full-screen local layer here would
            // render the local feed TWICE (background + PiP) and bleed around the
            // primary — the "double frame / overlapping layers" bug. After a PiP
            // swap the local feed becomes the primary, so this would duplicate it
            // again. Hence: self-preview background only when NOT connected.
            if shouldShowSelfPreviewBackground {
                // §7.7 — self-preview background mirrors only the front camera.
                CallVideoView(track: callManager.localVideoTrack, mirror: callManager.isUsingFrontCamera, contentMode: .scaleAspectFill)
                    .ignoresSafeArea()
                Color.black.opacity(0.25)
                    .ignoresSafeArea()
            } else {
                callBackground
            }

            // Content based on state
            switch callManager.callState {
            case .ringing(let isOutgoing):
                if isOutgoing {
                    outgoingRingingView
                } else {
                    // Audit P1-16 — pass our own @ObservedObject down so
                    // SwiftUI reuses the same subscription instead of
                    // re-creating it on each parent body reval.
                    IncomingCallView(callManager: callManager)
                }
            case .offering:
                // `.offering` = SDP offer émis, en attente de l'answer du
                // peer = en attente que l'appelé tape "Accepter" sur CallKit.
                // L'utilisateur attend toujours une réponse humaine — afficher
                // l'UI de "Sonnerie" (outgoingRingingView), pas "Connexion".
                // La transition vers connectingView ne se fait qu'après que
                // handleRemoteAnswer ait reçu l'answer SDP = preuve formelle
                // que le peer a accepté.
                outgoingRingingView
            case .connecting:
                connectingView
            case .connected:
                connectedView
            case .ended(let reason):
                endedView(reason: reason)
            case .reconnecting:
                // §4.3 — keep the connected layout (peer's last frame / tiles)
                // and overlay a "Reconnexion…" banner instead of blanking to
                // the full-screen connecting view — the FaceTime/WhatsApp
                // recovery behaviour. Gated on `hasEstablishedMedia` : un ICE
                // restart PRÉ-établissement (watchdog `.connecting`) passe
                // aussi par `.reconnecting` — sans média déjà négocié il n'y a
                // pas de "dernier frame" à figer et le layout connecté
                // afficherait un chrono 00:00 mensonger : rester "Connexion…".
                if callManager.hasEstablishedMedia {
                    connectedView
                } else {
                    connectingView
                }
            case .idle:
                EmptyView()
            }

            // Bandeau top — les bannières émergent de la Dynamic Island
            // (IslandEmergingBanner) et se posent SOUS elle, dans la safe area.
            // `.padding(.horizontal, 56)` garde la capsule à droite du chevron
            // minimize (leading, 40 pt + marges) — le texte long wrappe sur 2
            // lignes au lieu de passer dessous.
            let showsReconnectingBanner: Bool = {
                if case .reconnecting = callManager.callState { return callManager.hasEstablishedMedia }
                return false
            }()

            // §4.3 — reconnecting banner over the frozen last frame while an ICE
            // restart recovers. Même gate que le layout : pré-établissement,
            // connectingView affiche déjà "Connexion…" — pas de bannière.
            if showsReconnectingBanner {
                reconnectingBanner
                    .padding(.horizontal, 56)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    // P2-iOS-9 — l'émergence Island porte le mouvement ; fade à l'insertion/retrait.
                    .transition(.opacity)
            }

            // §4.4 — remote peer quality alert. Gateway emits `call:quality-alert`
            // when the remote end reports sustained poor stats; CallManager sets
            // `isRemoteQualityDegraded`. Stacked below the reconnecting banner
            // (extra top padding) so both can be visible simultaneously.
            if callManager.isRemoteQualityDegraded {
                remoteQualityDegradedBanner
                    .padding(.horizontal, 56)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    .padding(.top, showsReconnectingBanner ? 52 : 0)
                    .transition(.opacity)
            }

            // EXIGENCE №1 — signaling dégradé : le socket est tombé pendant un
            // appel établi. Le média P2P continue ; indicateur discret, empilé
            // sous les bannières reconnexion/qualité éventuelles.
            if callManager.isSignalingDegraded {
                let stackedOffset: CGFloat = (showsReconnectingBanner ? 52 : 0)
                    + (callManager.isRemoteQualityDegraded ? 44 : 0)
                signalingDegradedBanner
                    .padding(.horizontal, 56)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    .padding(.top, stackedOffset)
                    .transition(.opacity)
            }

            // Effects overlay — accessible dans tous les etats actifs (pas seulement
            // connected). Video-only depuis 2026-07-02 : le panneau d'effets vocaux
            // est retiré (pipeline de capture audio inexistant — voir
            // CallEffectsOverlay), il ne reste que les filtres vidéo.
            if callManager.callState.isActive && !callManager.callState.isRinging && callManager.isVideoEnabled {
                CallEffectsOverlay(
                    isExpanded: $showEffectsToolbar,
                    isVideoEnabled: callManager.isVideoEnabled
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

            // Minimize-to-PiP affordance. The drag-down gesture on the call
            // view already minimizes video calls (see audio/video layouts),
            // but audio calls had no equivalent and users were forced to end
            // the call to get back to the rest of the app. This explicit
            // top-leading chevron covers both modes and is reachable with one
            // hand on any device size.
            if callManager.callState.isActive {
                VStack {
                    HStack {
                        Button {
                            withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                                callManager.displayMode = .pip
                            }
                            HapticFeedback.medium()
                        } label: {
                            Image(systemName: "chevron.down")
                                // Doctrine 82i : glyphe de chrome dans un cadre glass fixe
                                // (diameter 40) → taille figée (ne doit pas déborder du cercle).
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(.white)
                                .callControlGlass(diameter: 40, isActive: false, tint: .white)
                                // Visual glass circle stays 40pt (doctrine 82i), but the
                                // tappable area must meet the HIG 44×44 minimum.
                                .frame(width: 44, height: 44)
                                .contentShape(Rectangle())
                        }
                        .accessibilityLabel(String(localized: "call.minimize", defaultValue: "Reduire l'appel", bundle: .main))
                        .accessibilityHint(String(localized: "call.minimize.hint", defaultValue: "Garde l'appel en cours dans une banniere flottante", bundle: .main))
                        Spacer()
                    }
                    Spacer()
                }
                .padding(.horizontal, 16)
                // Safe area top désormais respectée par le conteneur : 8 pt
                // suffisent (l'ancien 50 compensait l'encoche à la main).
                .padding(.top, 8)
            }
        }
        // Safe area TOP respectée : les bannières/chrome top se posent SOUS la
        // Dynamic Island (elles se rendaient derrière l'encoche, illisibles).
        // Le fond, le self-preview et les flux vidéo restent full-bleed via
        // leurs `.ignoresSafeArea()` internes ; seul le bottom est ignoré ici
        // (barre de contrôles au ras du home indicator, comme avant).
        .ignoresSafeArea(edges: .bottom)
        .statusBarHidden(true)
        // L'écran d'appel est blanc-sur-fond-sombre fixe (cf. callBackground).
        // On épingle aussi le colorScheme en .dark pour que le verre et les
        // matériaux (.ultraThinMaterial, glassEffect) rendent leur variante
        // sombre : sinon ils virent au clair en mode Light et les contrôles/
        // textes blancs deviennent illisibles (white-on-white).
        .environment(\.colorScheme, .dark)
        .onAppear {
            startPulseAnimation()
        }
        .onDisappear {
            stopPulseAnimation()
        }
        .task(id: callManager.remoteUserId) {
            await resolveRemoteProfile(userId: callManager.remoteUserId)
        }
        .adaptiveOnChange(of: callManager.callState) { _, newState in
            // Audit P2-iOS-11 — announce key call-state transitions for VoiceOver.
            // `.ended` stays first so the end-of-call announcement lives right
            // inside this handler (fires exactly once per state transition).
            switch newState {
            case .ended:
                UIAccessibility.post(notification: .announcement, argument: String(localized: "call.a11y.ended"))
            case .connecting:
                // Announce connecting (ICE negotiation begun) so the silent
                // ringing→connected gap doesn't read as a failed call.
                UIAccessibility.post(notification: .announcement, argument: String(localized: "call.a11y.connecting", defaultValue: "Connexion en cours", bundle: .main))
            case .connected:
                UIAccessibility.post(notification: .announcement, argument: String(localized: "call.a11y.connected"))
            case .reconnecting:
                UIAccessibility.post(notification: .announcement, argument: String(localized: "call.a11y.reconnecting"))
            default:
                break
            }
        }
        .adaptiveOnChange(of: callManager.isLinkQualityDegraded) { wasDegraded, isDegraded in
            if isDegraded && !wasDegraded {
                UIAccessibility.post(
                    notification: .announcement,
                    argument: String(localized: "call.a11y.quality.poor",
                                    defaultValue: "Qualité réseau faible",
                                    bundle: .main))
            } else if wasDegraded && !isDegraded {
                UIAccessibility.post(
                    notification: .announcement,
                    argument: String(localized: "call.a11y.quality.recovered",
                                    defaultValue: "Qualité réseau restaurée",
                                    bundle: .main))
            }
        }
        .adaptiveOnChange(of: callManager.isRemoteQualityDegraded) { _, isDegraded in
            guard isDegraded else { return }
            UIAccessibility.post(
                notification: .announcement,
                argument: String(localized: "call.a11y.remote.quality.poor",
                                defaultValue: "Réseau faible chez votre contact",
                                bundle: .main))
        }
        .adaptiveOnChange(of: callManager.isSignalingDegraded) { _, isDegraded in
            guard isDegraded else { return }
            UIAccessibility.post(
                notification: .announcement,
                argument: String(localized: "call.a11y.signaling.degraded",
                                defaultValue: "Connexion au serveur perdue, l'appel continue",
                                bundle: .main))
        }
    }

    // MARK: - Background

    private var callBackground: some View {
        ZStack {
            // Call UI is white-on-dark in BOTH video (camera feed) and audio
            // modes — like every platform call screen (FaceTime/WhatsApp). Pin
            // a fixed DARK backdrop so the white controls stay readable in
            // .light mode too: `theme.backgroundGradient` turns near-white in
            // light mode, which would make the white labels/icons invisible
            // (white-on-white). This keeps the call screen correct in .dark AND
            // .light appearance.
            LinearGradient(
                colors: [Color(hex: "09090B"), Color(hex: "0F0D19"), Color(hex: "13111C")],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            // Prisme visuel du correspondant : sa bannière de profil (fallback
            // avatar) couvre toute la page en transparence tant qu'aucun flux
            // vidéo distant n'est actif — l'appel audio « habite » chez le
            // contact (façon FaceTime audio). Blur + voile sombre dégradé pour
            // préserver la lisibilité du chrome blanc (écran épinglé .dark).
            if !hasActiveRemoteVideo, let backdrop = remoteBackdropURL {
                // Layout-neutre : `Color.clear` prend EXACTEMENT la proposition
                // (l'écran) et l'image ne vit qu'en `.overlay` — hors layout.
                // L'ancien `CachedAsyncImage.scaledToFill()` posé directement
                // dans le ZStack RÉPONDAIT sa largeur débordante (bannière
                // paysage ~1400 pt), gonflait le ZStack racine entier et
                // décalait TOUT l'écran d'appel de +30 pt (chevron minimize
                // expulsé hors écran à x≈-475). Bug repro simu 2026-07-03.
                Color.clear
                    .overlay {
                        CachedAsyncImage(url: backdrop, thumbHash: remoteBackdropThumbHash) {
                            Color.clear
                        }
                        .scaledToFill()
                    }
                    .scaleEffect(1.08)
                    .blur(radius: 20)
                    .clipped()
                    .opacity(0.55)
                    .overlay(
                        LinearGradient(
                            colors: [
                                Color.black.opacity(0.50),
                                Color.black.opacity(0.18),
                                Color.black.opacity(0.55)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .ignoresSafeArea()
                    .transition(.opacity)
                    .accessibilityHidden(true)
            }

            // Animated ambient orbs — decorative only
            Circle()
                .fill(MeeshyColors.indigo500.opacity(0.15))
                .frame(width: 300, height: 300)
                .blur(radius: 80)
                .offset(x: -80, y: -200)
                .floating(range: 20, duration: 5)
                .accessibilityHidden(true)

            Circle()
                .fill(MeeshyColors.indigo400.opacity(0.12))
                .frame(width: 350, height: 350)
                .blur(radius: 90)
                .offset(x: 100, y: 200)
                .floating(range: 25, duration: 6)
                .accessibilityHidden(true)

            Circle()
                .fill(MeeshyColors.error.opacity(0.1))
                .frame(width: 250, height: 250)
                .blur(radius: 70)
                .offset(x: 80, y: -100)
                .floating(range: 15, duration: 4.5)
                .accessibilityHidden(true)
        }
        // Fondu du backdrop profil quand le flux vidéo distant (dés)active.
        .animation(.easeInOut(duration: 0.35), value: hasActiveRemoteVideo)
    }

    /// Flux vidéo distant réellement visible (track présent ET caméra active).
    private var hasActiveRemoteVideo: Bool {
        callManager.hasRemoteVideoTrack && callManager.isRemoteVideoEnabled
    }

    /// Image de fond « du concerné » : bannière de profil d'abord, avatar en
    /// repli. `nil` tant que le profil n'est pas résolu (gradient seul).
    private var remoteBackdropURL: String? {
        if let banner = remoteProfile?.banner, !banner.isEmpty { return banner }
        if let avatar = remoteProfile?.avatar, !avatar.isEmpty { return avatar }
        return nil
    }

    private var remoteBackdropThumbHash: String? {
        if let banner = remoteProfile?.banner, !banner.isEmpty { return remoteProfile?.bannerThumbHash }
        return remoteProfile?.avatarThumbHash
    }

    /// Résolution cache-first du profil du correspondant (Instant App) : le
    /// store `.profiles` sert `.fresh`/`.stale` immédiatement, l'API rafraîchit
    /// en silence (et ré-alimente le cache). Un profil caché PARTIEL — sans
    /// bannière ni avatar, hydraté par un flux léger — ne court-circuite PAS
    /// l'API : sinon le fond pleine page restait sur le gradient alors que le
    /// serveur a les images.
    private func resolveRemoteProfile(userId: String?) async {
        guard let userId, !userId.isEmpty else {
            remoteProfile = nil
            return
        }
        switch await CacheCoordinator.shared.profiles.load(for: userId) {
        case .fresh(let users, _):
            remoteProfile = users.first
            if let user = users.first, Self.hasBackdropImage(user) { return }
        case .stale(let users, _):
            remoteProfile = users.first
        case .expired, .empty:
            break
        }
        do {
            let user = try await UserService.shared.getProfileById(userId)
            guard callManager.remoteUserId == userId else { return }
            remoteProfile = user
            try? await CacheCoordinator.shared.profiles.save([user], for: userId)
        } catch {
            Logger.calls.warning("CallView: profil distant non résolu (\(userId)): \(error.localizedDescription)")
        }
    }

    private static func hasBackdropImage(_ user: MeeshyUser) -> Bool {
        (user.banner?.isEmpty == false) || (user.avatar?.isEmpty == false)
    }

    // MARK: - Outgoing Ringing

    private var outgoingRingingView: some View {
        VStack(spacing: 0) {
            Spacer()

            // Pulsing avatar
            pulsingAvatar
                .padding(.bottom, 24)

            // Name
            Text(callManager.remoteUsername ?? String(localized: "call.unknown", defaultValue: "Inconnu", bundle: .main))
                .font(.system(.title, design: .rounded).weight(.semibold))
                .foregroundColor(.white)
                .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
                .padding(.bottom, 8)

            // §H2 — Status: "Appel en cours…" until 6s have elapsed, then the
            // calmer "En attente du correspondant…" so the user knows the ring
            // is reaching the peer (not a silent failure). The watchdog task
            // below drives this flag and auto-cancels on state transition.
            VStack(spacing: 4) {
                Text(sdpOfferSlow
                    ? String(localized: "call.outgoing.waiting", defaultValue: "En attente du correspondant…", bundle: .main)
                    : String(localized: "call.outgoing.ringing", defaultValue: "Appel en cours...", bundle: .main))
                    .font(.callout.weight(.medium))
                    .foregroundColor(.white.opacity(0.7))
                if sdpOfferSlow {
                    Text(String(localized: "call.outgoing.waiting.hint", defaultValue: "Le correspondant n'a pas encore répondu.", bundle: .main))
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.45))
                        .multilineTextAlignment(.center)
                        .transition(.opacity)
                }
            }
            .padding(.bottom, 8)
            .animation(.easeInOut(duration: 0.3), value: sdpOfferSlow)

            // Call type badge
            callTypeBadge
                .padding(.bottom, 60)

            Spacer()

            // Effects + End call row
            HStack(spacing: 40) {
                if callManager.isVideoEnabled {
                    effectsToggleButton
                }
                endCallButton
            }
            .padding(.bottom, 80)
        }
        .task {
            sdpOfferSlow = false
            try? await Task.sleep(nanoseconds: sdpOfferSlowSeconds * 1_000_000_000)
            if !Task.isCancelled {
                withAnimation(.easeInOut(duration: 0.3)) { sdpOfferSlow = true }
                UIAccessibility.post(
                    notification: .announcement,
                    argument: String(localized: "call.outgoing.waiting",
                                    defaultValue: "En attente du correspondant…",
                                    bundle: .main)
                )
            }
        }
    }

    // MARK: - Connecting

    private var connectingView: some View {
        VStack(spacing: 0) {
            Spacer()

            pulsingAvatar
                .padding(.bottom, 24)

            Text(callManager.remoteUsername ?? String(localized: "call.unknown", defaultValue: "Inconnu", bundle: .main))
                .font(.system(.title, design: .rounded).weight(.semibold))
                .foregroundColor(.white)
                .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
                .padding(.bottom, 8)

            HStack(spacing: 8) {
                ProgressView()
                    .tint(MeeshyColors.indigo400)
                    .accessibilityHidden(true)
                Text(String(localized: "call.connecting", defaultValue: "Connexion...", bundle: .main))
                    .font(.callout.weight(.medium))
                    .foregroundColor(.white.opacity(0.7))
            }
            .accessibilityElement(children: .combine)
            .padding(.bottom, 60)

            Spacer()

            HStack(spacing: 40) {
                if callManager.isVideoEnabled {
                    effectsToggleButton
                }
                endCallButton
            }
            .padding(.bottom, 80)
        }
    }

    // MARK: - Connected

    private var connectedView: some View {
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
                // §7.3 — tap the primary video to toggle the controls
                // (auto-hide UX). The PiP (on top) keeps its own swap tap.
                videoCallLayout
                    .contentShape(Rectangle())
                    .onTapGesture { toggleControls() }
                    // Swipe-down-to-minimize is attached HERE, not on the whole
                    // connectedView ZStack: the draggable PiP is a sibling ABOVE
                    // this layer, so moving the PiP no longer also dismisses the
                    // full-screen call (user-reported 2026-07-02).
                    .simultaneousGesture(
                        DragGesture(minimumDistance: 50)
                            .onEnded { value in
                                guard !showEffectsToolbar else { return }
                                if value.translation.height > 100 {
                                    withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                                        callManager.displayMode = .pip
                                    }
                                }
                            }
                    )
                    .accessibilityLabel(showControls
                        ? String(localized: "call.video.hideControls", defaultValue: "Masquer les contrôles", bundle: .main)
                        : String(localized: "call.video.showControls", defaultValue: "Afficher les contrôles", bundle: .main))
                    .accessibilityAddTraits(.isButton)
                    // Controls never auto-hide during VoiceOver (shouldAutoHideControls
                    // returns false) — this tap element has no meaningful purpose then,
                    // so hide it from the accessibility tree to avoid confusing VoiceOver.
                    .accessibilityHidden(!shouldAutoHideControls)
            }

            VStack(spacing: 0) {
                if !callManager.isVideoUIActive {
                    Spacer()
                    audioCallLayout
                }

                Spacer()

                // §7.3 — auto-hiding control bar on iPhone video calls; always
                // visible for audio and on Mac (and while the effects tray is
                // open). Hidden controls don't capture taps.
                controlBar
                    .padding(.bottom, 60)
                    .opacity(showControls ? 1 : 0)
                    .allowsHitTesting(showControls)
                    .animation(.easeInOut(duration: 0.25), value: showControls)
            }

            // Transcript overlay
            transcriptOverlay

            // §7.2 — draggable, corner-snapping PiP showing the secondary
            // stream. Tap to swap it with the full-area primary (FaceTime).
            if callManager.isVideoEnabled && callManager.hasLocalVideoTrack {
                pipView
            } else if callManager.isVideoEnabled && callManager.isVideoSuspended {
                // Survival: outbound video dropped to audio-only on a weak link.
                // The live local track is gone, so show a dedicated "paused" tile
                // over the user's avatar rather than letting the self-view vanish.
                localVideoSuspendedTile
            }
        }
        // §7.3 — auto-hide after 4s of no interaction. Re-arms whenever
        // showControls flips to true (a reveal tap); no-op for audio / Mac /
        // effects-open via shouldAutoHideControls.
        .task(id: showControls) {
            guard showControls, shouldAutoHideControls else { return }
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            if !Task.isCancelled {
                withAnimation(.easeInOut(duration: 0.25)) { showControls = false }
            }
        }
        .onDisappear { showControls = true }
    }

    /// §7.3 — controls auto-hide only on iPhone/iPad video calls, never on Mac
    /// (controls are persistent on desktop), never for audio-only (no video to
    /// reveal), never while the effects tray is open, and never while VoiceOver
    /// is running (VoiceOver users can't tap the video to reveal hidden controls).
    private var shouldAutoHideControls: Bool {
        callManager.isVideoUIActive
            && !showEffectsToolbar
            && !ProcessInfo.processInfo.isiOSAppOnMac
            && !UIAccessibility.isVoiceOverRunning
    }

    private func toggleControls() {
        withAnimation(.easeInOut(duration: 0.25)) { showControls.toggle() }
    }

    /// Whether to render the full-screen LOCAL self-preview as the call
    /// background. True ONLY while waiting to connect (ringing/offering/
    /// connecting) so the user sees themselves before the peer's video arrives.
    /// Once `.connected`/`.reconnecting`, the primary stream + PiP own the
    /// single video surface, so a full-screen local layer here would duplicate
    /// the local feed (rendered again in the PiP) — the double-frame bug.
    private var shouldShowSelfPreviewBackground: Bool {
        guard callManager.isVideoEnabled, callManager.hasLocalVideoTrack else { return false }
        switch callManager.callState {
        case .connected, .reconnecting: return false
        default: return true
        }
    }

    /// §7.1 — iOS-app-on-Mac (NOT Catalyst). Drives desktop-specific UI:
    /// letterboxed remote video (no crop), persistent controls, hidden
    /// speaker/flip controls.
    private var isOnMac: Bool { ProcessInfo.processInfo.isiOSAppOnMac }

    /// §7.1 — fill (crop) on phone/tablet for an immersive edge-to-edge feed;
    /// fit (letterbox) on Mac where the window is resizable and cropping the
    /// peer is undesirable.
    private var primaryVideoContentMode: UIView.ContentMode {
        isOnMac ? .scaleAspectFit : .scaleAspectFill
    }

    private var audioCallLayout: some View {
        VStack(spacing: 16) {
            // Duo d'avatars (no pulse) — correspondant + pastille locale.
            callAvatarPair(size: 120)
                .padding(.bottom, 8)

            Text(callManager.remoteUsername ?? String(localized: "call.unknown", defaultValue: "Inconnu", bundle: .main))
                .font(.system(.title, design: .rounded).weight(.semibold))
                .foregroundColor(theme.textPrimary)

            // Duration + audit P2-iOS-10 connection quality indicator
            HStack(spacing: 6) {
                connectionQualityDot
                Text(callManager.formattedDuration)
                    .font(.body.weight(.medium).monospacedDigit())
                    .foregroundColor(durationColor)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(durationColor.opacity(0.15))
            )
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.updatesFrequently)

            // Status indicators
            HStack(spacing: 12) {
                if callManager.isMuted {
                    statusPill(icon: "mic.slash.fill", text: String(localized: "call.status.muted", defaultValue: "Micro coupe", bundle: .main), color: MeeshyColors.error)
                }
                if !callManager.isRemoteAudioEnabled {
                    statusPill(icon: "mic.slash", text: String(localized: "call.status.peer.muted", defaultValue: "Contact muet", bundle: .main), color: .white.opacity(0.7))
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
            }
        }
    }

    // MARK: - Connection Quality (P2-iOS-10)

    /// Audit P2-iOS-10 — `CallManager.connectionQuality` was tracked but
    /// never surfaced in the UI. Without this dot the user has no feedback
    /// when the call degrades (disconnected/failed), until it actually drops.
    private var connectionQualityDot: some View {
        Circle()
            .fill(connectionQualityColor)
            .frame(width: 8, height: 8)
            .accessibilityLabel(connectionQualityAccessibilityLabel)
    }

    /// §4.3 — reconnecting banner shown over the frozen call layout while an
    /// ICE restart recovers a dropped connection (warning-tinted capsule with a
    /// spinner). The call is NOT torn down; the peer's last frame stays visible.
    private var reconnectingBanner: some View {
        IslandEmergingBanner(tint: MeeshyColors.warning.opacity(0.92), reduceMotion: reduceMotion) {
            HStack(spacing: 8) {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(.white)
                    .scaleEffect(0.8)
                Text(String(localized: "call.reconnecting", defaultValue: "Reconnexion…", bundle: .main))
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.white)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "call.reconnecting", defaultValue: "Reconnexion…", bundle: .main))
    }

    /// §4.4 — remote peer quality alert. Appears when `callManager.isRemoteQualityDegraded`
    /// is set by the `call:quality-alert` socket event emitted by the gateway.
    /// Mirrors FaceTime's "Contact has a poor connection" indicator.
    private var remoteQualityDegradedBanner: some View {
        IslandEmergingBanner(tint: MeeshyColors.warning.opacity(0.85), reduceMotion: reduceMotion) {
            HStack(spacing: 6) {
                Image(systemName: "wifi.exclamationmark")
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .accessibilityHidden(true)
                Text(String(localized: "call.remote.quality.degraded",
                            defaultValue: "Réseau faible chez votre contact",
                            bundle: .main))
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "call.remote.quality.degraded",
                                   defaultValue: "Réseau faible chez votre contact",
                                   bundle: .main))
    }

    /// EXIGENCE №1 — the signaling socket dropped while the call is connected.
    /// The P2P media keeps flowing; this discreet hint mirrors the
    /// quality-degraded capsule and never implies the call is at risk.
    private var signalingDegradedBanner: some View {
        IslandEmergingBanner(tint: MeeshyColors.warning.opacity(0.85), reduceMotion: reduceMotion) {
            HStack(spacing: 6) {
                Image(systemName: "antenna.radiowaves.left.and.right.slash")
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .accessibilityHidden(true)
                Text(String(localized: "call.signaling.degraded",
                            defaultValue: "Connexion au serveur perdue — l'appel continue",
                            bundle: .main))
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "call.signaling.degraded",
                                   defaultValue: "Connexion au serveur perdue — l'appel continue",
                                   bundle: .main))
    }

    private var connectionQualityColor: Color {
        // Prefer the RTT+packet-loss stats level (updated every statsIntervalSeconds)
        // over the binary ICE state for a more accurate real-time quality indicator.
        if let level = callManager.liveVideoQualityLevel {
            switch level {
            case .excellent, .good: return MeeshyColors.success
            case .fair: return MeeshyColors.warning
            case .poor, .critical: return MeeshyColors.error
            }
        }
        switch callManager.connectionQuality {
        case .connected: return MeeshyColors.success
        case .reconnecting, .checking, .new: return MeeshyColors.warning
        case .disconnected, .failed, .closed: return MeeshyColors.error
        case .connecting: return MeeshyColors.indigo400
        }
    }

    private var connectionQualityAccessibilityLabel: String {
        if let level = callManager.liveVideoQualityLevel {
            switch level {
            case .excellent, .good: return String(localized: "call.quality.good", defaultValue: "Connexion bonne", bundle: .main)
            case .fair: return String(localized: "call.quality.reconnecting", defaultValue: "Reconnexion", bundle: .main)
            case .poor, .critical: return String(localized: "call.quality.lost", defaultValue: "Connexion perdue", bundle: .main)
            }
        }
        switch callManager.connectionQuality {
        case .connected: return String(localized: "call.quality.good", defaultValue: "Connexion bonne", bundle: .main)
        case .reconnecting, .checking, .new: return String(localized: "call.quality.reconnecting", defaultValue: "Reconnexion", bundle: .main)
        case .disconnected, .failed, .closed: return String(localized: "call.quality.lost", defaultValue: "Connexion perdue", bundle: .main)
        case .connecting: return String(localized: "call.quality.inProgress", defaultValue: "Connexion en cours", bundle: .main)
        }
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

    private var videoCallLayout: some View {
        ZStack {
            // §7.2 — full-bleed PRIMARY stream (edge-to-edge, single surface).
            // `swapStreams` decides whether the primary is the remote feed
            // (default) or the local camera (after a PiP tap). The OTHER stream
            // is rendered in the draggable PiP. §7.1 — letterbox on Mac, fill on
            // phone/tablet. `.ignoresSafeArea()` is on the VIDEO only so the feed
            // reaches the screen edges while the duration badge stays inside the
            // safe area (never under the notch / Dynamic Island).
            videoStream(local: swapStreams, contentMode: primaryVideoContentMode)
                .ignoresSafeArea()

            VStack {
                HStack {
                    Text(callManager.formattedDuration)
                        .font(.caption2.weight(.medium).monospacedDigit())
                        .foregroundColor(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        // iOS 26 Liquid Glass — floating duration badge over the
                        // full-bleed video stream (SDK Compatibility wrapper gates
                        // the native effect / `.ultraThinMaterial` fallback).
                        .adaptiveGlass(in: Capsule())
                        .clipShape(Capsule())
                        .padding(12)
                        .accessibilityLabel(String(localized: "call.duration.a11y.label"))
                        .accessibilityValue(callManager.formattedDuration)
                        .accessibilityAddTraits(.updatesFrequently)
                    Spacer()
                }
                Spacer()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// §7.2 — renders one call stream. `local == true` shows the (mirrored)
    /// local camera; otherwise the remote feed, degrading to a camera-off
    /// placeholder (peer's camera off) or a connecting placeholder (no track
    /// yet). Shared by the full-area primary and the PiP so a swap just flips
    /// the `local` flag on each.
    @ViewBuilder
    private func videoStream(local: Bool, contentMode: UIView.ContentMode) -> some View {
        if local {
            // §7.7 — mirror ONLY the front camera (a mirrored back camera shows
            // reversed text/scene — bug k).
            CallVideoView(track: callManager.localVideoTrack, mirror: callManager.isUsingFrontCamera, contentMode: contentMode)
        } else if callManager.hasRemoteVideoTrack && callManager.isRemoteVideoEnabled {
            CallVideoView(track: callManager.remoteVideoTrack, contentMode: contentMode)
        } else if callManager.hasRemoteVideoTrack {
            // P0-3 — peer turned its camera off: avatar placeholder, never the
            // frozen last frame.
            remoteCameraOffPlaceholder
        } else {
            connectingVideoPlaceholder
        }
    }

    private var connectingVideoPlaceholder: some View {
        Color.black.opacity(0.4)
            .overlay(
                VStack(spacing: 12) {
                    ProgressView()
                        .tint(.white.opacity(0.5))
                        .accessibilityHidden(true)
                    Text(videoConnectSlow
                        ? String(localized: "call.video.connecting.slow", defaultValue: "La vidéo prend plus de temps que prévu…", bundle: .main)
                        : String(localized: "call.video.connecting", defaultValue: "Connexion video...", bundle: .main))
                        .font(.footnote.weight(.medium))
                        .foregroundColor(.white.opacity(videoConnectSlow ? 0.7 : 0.4))
                        .multilineTextAlignment(.center)
                    if videoConnectSlow {
                        Text(String(localized: "call.video.connecting.slow.hint", defaultValue: "L'audio est peut-être déjà actif.", bundle: .main))
                            .font(.caption2)
                            .foregroundColor(.white.opacity(0.45))
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.horizontal, 32)
                .accessibilityElement(children: .combine)
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            // The watchdog runs only while this placeholder is on screen; SwiftUI
            // cancels the task the moment the remote track arrives and the view
            // is replaced by the live feed.
            .task {
                videoConnectSlow = false
                try? await Task.sleep(nanoseconds: videoConnectWatchdogSeconds * 1_000_000_000)
                if !Task.isCancelled {
                    withAnimation(.easeInOut(duration: 0.3)) { videoConnectSlow = true }
                    UIAccessibility.post(
                        notification: .announcement,
                        argument: String(localized: "call.video.connecting.slow", defaultValue: "La vidéo prend plus de temps que prévu…", bundle: .main)
                    )
                }
            }
    }

    // P0-3 — shown full-area when the remote peer has a video track but turned
    // its camera off, so the user sees the peer's avatar rather than a frozen
    // last frame.
    private var remoteCameraOffPlaceholder: some View {
        ZStack {
            Color.black.opacity(0.5)
            VStack(spacing: 14) {
                avatarCircle(size: 96)
                    .accessibilityHidden(true)
                HStack(spacing: 6) {
                    Image(systemName: "video.slash.fill")
                        .font(MeeshyFont.relative(13, weight: .semibold))
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

    // MARK: - Picture-in-Picture (§7.2)

    /// The four anchor corners a PiP can snap to.
    private enum PiPCorner: CaseIterable {
        case topLeading, topTrailing, bottomLeading, bottomTrailing
    }

    private static let pipSize = CGSize(width: 100, height: 140)

    /// Resting center for the PiP in a given container, accounting for device
    /// safe area insets (landscape notch/Dynamic Island cutouts) plus fixed
    /// clearances for the minimize chevron/badge (top) and control bar (bottom).
    private func pipCenter(_ corner: PiPCorner, in container: CGSize, safeArea: EdgeInsets = .init()) -> CGPoint {
        let halfW = Self.pipSize.width / 2
        let halfH = Self.pipSize.height / 2
        let margin: CGFloat = 16
        let topInset = safeArea.top + QualityThresholds.pipTopClearance
        let bottomInset = safeArea.bottom + QualityThresholds.pipBottomClearance
        let leadingX = safeArea.leading + margin + halfW
        let trailingX = container.width - safeArea.trailing - margin - halfW
        let topY = topInset + halfH
        let bottomY = container.height - bottomInset - halfH
        switch corner {
        case .topLeading: return CGPoint(x: leadingX, y: topY)
        case .topTrailing: return CGPoint(x: trailingX, y: topY)
        case .bottomLeading: return CGPoint(x: leadingX, y: bottomY)
        case .bottomTrailing: return CGPoint(x: trailingX, y: bottomY)
        }
    }

    /// Nearest corner to a point — used to snap on drag end.
    private func nearestCorner(to point: CGPoint, in container: CGSize, safeArea: EdgeInsets = .init()) -> PiPCorner {
        PiPCorner.allCases.min(by: { a, b in
            let ca = pipCenter(a, in: container, safeArea: safeArea)
            let cb = pipCenter(b, in: container, safeArea: safeArea)
            return hypot(point.x - ca.x, point.y - ca.y) < hypot(point.x - cb.x, point.y - cb.y)
        }) ?? .topTrailing
    }

    private var pipView: some View {
        GeometryReader { geo in
            let base = pipCenter(pipCorner, in: geo.size, safeArea: geo.safeAreaInsets)
            // §7.2 — the PiP shows the SECONDARY stream (the opposite of the
            // primary). Swap flips both with one tap.
            videoStream(local: !swapStreams, contentMode: .scaleAspectFill)
                .frame(width: Self.pipSize.width, height: Self.pipSize.height)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.white.opacity(0.3), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.3), radius: 8, y: 4)
                // Flip + filters live ON the self-view frame, where the user is
                // already looking at their own camera (user-requested
                // 2026-07-02). Only when the PiP shows the LOCAL stream — these
                // controls act on the local camera, not the peer's feed.
                .overlay(alignment: .bottom) {
                    if !swapStreams {
                        HStack(spacing: 8) {
                            pipFrameButton(
                                icon: "arrow.triangle.2.circlepath.camera.fill",
                                label: String(localized: "call.control.flipCamera", defaultValue: "Basculer la caméra avant/arrière", bundle: .main)
                            ) {
                                callManager.switchCamera()
                            }
                            pipFrameButton(
                                icon: "camera.filters",
                                label: String(localized: "call.filters.a11y", defaultValue: "Filtres video", bundle: .main),
                                hint: String(localized: "call.filters.hint", defaultValue: "Ouvre ou ferme la barre de filtres video", bundle: .main)
                            ) {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                    showEffectsToolbar.toggle()
                                }
                            }
                            .accessibilityHint(String(localized: "call.filters.hint", defaultValue: "Ouvre ou ferme la barre de filtres video", bundle: .main))
                        }
                        .padding(.bottom, 6)
                    }
                }
                .position(x: base.x + pipDragOffset.width, y: base.y + pipDragOffset.height)
                .gesture(
                    DragGesture()
                        .onChanged { pipDragOffset = $0.translation }
                        .onEnded { value in
                            let dropped = CGPoint(x: base.x + value.translation.width,
                                                  y: base.y + value.translation.height)
                            let corner = nearestCorner(to: dropped, in: geo.size, safeArea: geo.safeAreaInsets)
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                                pipCorner = corner
                                pipDragOffset = .zero
                            }
                            HapticFeedback.light()
                        }
                )
                // §7.2 — tap PiP = swap which stream is full-screen (FaceTime).
                // Camera flip also sits on the self-view frame itself.
                .onTapGesture {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                        swapStreams.toggle()
                    }
                    HapticFeedback.light()
                }
                .accessibilityLabel(String(localized: "call.pip.swap", defaultValue: "Permuter les vidéos", bundle: .main))
                .accessibilityHint(String(localized: "call.pip.swap.hint", defaultValue: "Touchez pour échanger la petite et la grande vidéo ; faites glisser pour déplacer", bundle: .main))
        }
    }

    /// Small circular control pinned to the local self-view frame (flip
    /// camera, filters). Buttons win the hit-test over the frame's tap-to-swap
    /// and drag gestures, so they stay usable on the 100×140 tile.
    private func pipFrameButton(icon: String, label: String, hint: String? = nil, action: @escaping () -> Void) -> some View {
        Button {
            action()
            HapticFeedback.light()
        } label: {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.white.opacity(0.95))
                .frame(width: 28, height: 28)
                .background(Color.black.opacity(0.45), in: Circle())
                .overlay(Circle().stroke(Color.white.opacity(0.25), lineWidth: 0.5))
                // Visual glyph stays a compact 28pt (the 100×140 tile has no
                // room for a 44pt circle), but the hit target itself must meet
                // the HIG 44×44 minimum — expand invisibly via contentShape.
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(label)
        .optionalAccessibilityHint(hint)
    }

    /// True when the survival layer has auto-dropped our outbound video while the
    /// user still wants the camera on (distinct from a deliberate camera-off).
    private var videoAutoPaused: Bool {
        callManager.isVideoSuspended && callManager.isVideoEnabled
    }

    /// Survival self-tile: the local user's avatar with a discreet "video paused
    /// · auto-resume" overlay ON TOP, shown where the PiP normally sits when the
    /// adaptive controller has dropped our outbound video to audio-only.
    private var localVideoSuspendedTile: some View {
        GeometryReader { geo in
            let base = pipCenter(pipCorner, in: geo.size, safeArea: geo.safeAreaInsets)
            videoSuspendedTileBody
                .frame(width: Self.pipSize.width, height: Self.pipSize.height)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(MeeshyColors.warning.opacity(0.7), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.3), radius: 8, y: 4)
                .position(x: base.x, y: base.y)
                .accessibilityElement(children: .combine)
                .accessibilityLabel(String(localized: "call.video.suspended", defaultValue: "Vidéo en pause", bundle: .main))
                .accessibilityHint(String(localized: "call.video.suspended.hint", defaultValue: "Connexion faible, la vidéo reprendra automatiquement", bundle: .main))
        }
    }

    private var videoSuspendedTileBody: some View {
        // Local user's initial (the suspended camera is OURS).
        let localName = AuthManager.shared.currentUser?.displayName
            ?? AuthManager.shared.currentUser?.username
            ?? "?"
        let initial = String(localName.prefix(1)).uppercased()
        return ZStack {
            Color.black.opacity(0.55)
            // Avatar behind…
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [MeeshyColors.indigo500, MeeshyColors.indigo400],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 56, height: 56)
                Text(initial)
                    // Doctrine 86i : initiale d'avatar dans un cercle fixe 56×56 → figée.
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
            }
            .opacity(0.45)
            // …"video paused" affordance on top.
            VStack(spacing: 6) {
                Image(systemName: "video.slash.fill")
                    .font(MeeshyFont.relative(18, weight: .semibold))
                    .foregroundColor(MeeshyColors.warning)
                    .accessibilityHidden(true)
                Text(String(localized: "call.video.suspended", defaultValue: "Vidéo en pause", bundle: .main))
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(.white)
                Text(String(localized: "call.video.suspended.short", defaultValue: "Reprise auto", bundle: .main))
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.7))
            }
        }
    }

    // MARK: - Transcript Overlay

    private var transcriptOverlay: some View {
        let localUserId = AuthManager.shared.currentUser?.id ?? ""
        let localName = AuthManager.shared.currentUser?.displayName ?? AuthManager.shared.currentUser?.username ?? String(localized: "call.transcript.you", defaultValue: "Vous", bundle: .main)
        let remoteName = callManager.remoteUsername ?? String(localized: "call.incoming.unknown_caller", defaultValue: "Appel entrant", bundle: .main)
        return VStack(alignment: .leading, spacing: 6) {
            ForEach(transcriptionService.displayedSegments) { segment in
                let isLocal = segment.speakerId == localUserId
                HStack(alignment: .top, spacing: 8) {
                    Circle()
                        .fill(isLocal ? MeeshyColors.indigo400 : MeeshyColors.success)
                        .frame(width: 8, height: 8)
                        .padding(.top, 6)
                        .accessibilityHidden(true)
                    Text(segment.text)
                        .font(.callout.weight(segment.isFinal ? .regular : .light))
                        .foregroundColor(.white)
                        .opacity(segment.isFinal ? 1.0 : 0.7)
                        .accessibilityLabel("\(isLocal ? localName : remoteName) : \(segment.text)")
                }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(12)
        // iOS 26 Liquid Glass — floating live-transcript panel over the video
        // stream (same chrome-over-content family as the duration badge / effects
        // toolbar). SDK Compatibility wrapper gates native effect / fallback.
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 12))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 16)
        .padding(.bottom, 100)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .opacity(showTranscript ? 1 : 0)
        .accessibilityHidden(!showTranscript)
        .animation(.easeInOut(duration: 0.2), value: showTranscript)
        // PERF-005: tell the transcription service when the panel is visible
        // so it can skip per-frame partial-result work while hidden.
        .adaptiveOnChange(of: showTranscript) { _, newValue in
            transcriptionService.isShowingOverlay = newValue
        }
        .onAppear {
            transcriptionService.isShowingOverlay = showTranscript
        }
    }

    // MARK: - Ended

    private func endedView(reason: CallEndReason) -> some View {
        VStack(spacing: 16) {
            Spacer()

            avatarCircle(size: 100)
                .opacity(0.6)
                .accessibilityHidden(true)

            Text(callManager.remoteUsername ?? String(localized: "call.unknown", defaultValue: "Inconnu", bundle: .main))
                .font(.system(.title3, design: .rounded).weight(.semibold))
                .foregroundColor(theme.textPrimary.opacity(0.7))

            Text(endReasonText(reason))
                .font(.callout.weight(.medium))
                .foregroundColor(theme.textMuted)

            if callManager.callDuration > 0 {
                Text(callManager.formattedDuration)
                    .font(.footnote.weight(.medium).monospacedDigit())
                    .foregroundColor(theme.textMuted.opacity(0.6))
            }

            Spacer()
        }
    }

    // MARK: - Control Bar

    private var hasActiveEffects: Bool {
        // Voice effects are no longer settable from the UI (dead pipeline,
        // entry removed) — only video filters light this up.
        callManager.videoFilters.config.isEnabled
    }

    /// §7.3 + iOS 26 Liquid Glass. The buttons are grouped in a
    /// `GlassEffectContainer` so adjacent glass circles blend/morph (glass can't
    /// sample glass otherwise). Layout is intelligent: `ViewThatFits` centres the
    /// row when it fits the width, and only falls back to a horizontal scroll on
    /// narrow widths / large Dynamic Type — so the camera-flip and other controls
    /// are evenly centred rather than left-anchored in a scroll view.
    /// Ancre invisible servant de `sourceView` au PiP système (le rect d'où la
    /// fenêtre flottante émerge). Enregistrée auprès de `CallManager` à chaque
    /// apparition/mise à jour ; `attachSystemPiP` est idempotent + auto-gated.
    private struct PiPSourceAnchor: UIViewRepresentable {
        func makeUIView(context: Context) -> UIView {
            let view = UIView()
            view.backgroundColor = .clear
            view.isUserInteractionEnabled = false
            return view
        }
        func updateUIView(_ uiView: UIView, context: Context) {
            CallManager.shared.attachSystemPiP(sourceView: uiView)
        }
    }

    private var controlBar: some View {
        // Adjacent glass circles must share a container (glass can't sample
        // glass). `AdaptiveGlassContainer` (SDK Compatibility) is a GlassEffect-
        // Container on iOS 26 and a pass-through on earlier versions.
        AdaptiveGlassContainer(spacing: 20) { fittingControlRow }
    }

    private var fittingControlRow: some View {
        ViewThatFits(in: .horizontal) {
            controlButtonsRow
            ScrollView(.horizontal, showsIndicators: false) { controlButtonsRow }
        }
    }

    private var controlButtonsRow: some View {
        HStack(spacing: 20) {
            // Mute — dynamic VoiceOver label so users hear the tap outcome.
            callControlButton(
                icon: callManager.isMuted ? "mic.slash.fill" : "mic.fill",
                color: callManager.isMuted ? MeeshyColors.error : .white,
                bgColor: callManager.isMuted ? MeeshyColors.error : .white,
                isActive: callManager.isMuted,
                caption: String(localized: "call.control.mute.caption", defaultValue: "Micro", bundle: .main),
                label: callManager.isMuted ? String(localized: "call.control.unmute", defaultValue: "Réactiver le micro", bundle: .main) : String(localized: "call.control.mute", defaultValue: "Couper le micro", bundle: .main),
                isToggle: true
            ) {
                callManager.toggleMute()
            }

            // Speaker — §7.1/§7.3: hidden on iOS-on-Mac (output is the system
            // device, route is forced .speaker; a toggle here is a dead control).
            if !isOnMac {
                callControlButton(
                    icon: callManager.isSpeaker ? "speaker.wave.3.fill" : "speaker.fill",
                    color: callManager.isSpeaker ? MeeshyColors.info : .white,
                    bgColor: callManager.isSpeaker ? MeeshyColors.info : .white,
                    isActive: callManager.isSpeaker,
                    caption: String(localized: "call.control.speaker.caption", defaultValue: "Son", bundle: .main),
                    label: callManager.isSpeaker ? String(localized: "call.control.speakerOff", defaultValue: "Désactiver le haut-parleur", bundle: .main) : String(localized: "call.control.speakerOn", defaultValue: "Activer le haut-parleur", bundle: .main),
                    isToggle: true
                ) {
                    callManager.toggleSpeaker()
                }
            }

            // Effects (Plus button) — label is state-aware so VoiceOver users
            // Effets/filtres et flip iPhone : déplacés SUR le cadre de la
            // self-preview (pipFrameButton, retour user 2026-07-02) — plus de
            // doublon dans la barre. Seul reste ici le picker multi-caméras
            // Mac/iPad (Continuity/USB), sans équivalent sur le cadre.
            cameraControl

            // §5.4 — always visible so an AUDIO call can be upgraded to video
            // (FaceTime-style), not just toggled off/on once already in video.
            // `video.badge.plus` when off reads as "turn on camera". When the
            // survival layer has auto-paused video on a weak link, the button
            // turns amber and reads "paused (weak connection)".
            callControlButton(
                icon: videoAutoPaused ? "video.slash.fill" : (callManager.isVideoEnabled ? "video.fill" : "video.badge.plus"),
                color: videoAutoPaused ? MeeshyColors.warning : MeeshyColors.indigo400,
                bgColor: videoAutoPaused ? MeeshyColors.warning : MeeshyColors.indigo400,
                isActive: videoAutoPaused ? true : !callManager.isVideoEnabled,
                caption: videoAutoPaused
                    ? String(localized: "call.control.video.paused.caption", defaultValue: "En pause", bundle: .main)
                    : String(localized: "call.control.video.caption", defaultValue: "Vidéo", bundle: .main),
                label: videoAutoPaused
                    ? String(localized: "call.control.video.paused", defaultValue: "Vidéo en pause (connexion faible)", bundle: .main)
                    : (callManager.isVideoEnabled ? String(localized: "call.control.videoOff", defaultValue: "Désactiver la vidéo", bundle: .main) : String(localized: "call.control.videoOn", defaultValue: "Activer la vidéo", bundle: .main)),
                hint: videoAutoPaused
                    ? String(localized: "call.control.video.paused.hint", defaultValue: "Touchez pour éteindre la caméra. La vidéo reprend automatiquement si la connexion s'améliore.", bundle: .main)
                    : nil,
                isToggle: true
            ) {
                callManager.toggleVideo()
            }

            // PiP système — réduire en fenêtre vidéo flottante. Visible seulement
            // si éligible (appel vidéo + track distant + caméra distante allumée +
            // appareil compatible). En audio, le « réduire » reste le chevron →
            // pilule in-app, pas une fenêtre vidéo.
            if callManager.canActivateSystemPiP {
                callControlButton(
                    icon: "pip.enter",
                    color: .white,
                    bgColor: .white,
                    isActive: callManager.isSystemPiPActive,
                    caption: String(localized: "call.control.pip.caption", defaultValue: "PiP", bundle: .main),
                    label: String(localized: "call.control.pip", defaultValue: "Réduire en Picture-in-Picture", bundle: .main)
                ) {
                    callManager.startSystemPiP()
                }
            }

            // End call
            endCallButton
        }
        .padding(.horizontal, 16)
        // §7.1 — populate the camera list when video turns on so `cameraControl`
        // can decide flip vs device picker (Continuity/USB on Mac/iPad).
        .task(id: callManager.isVideoEnabled) {
            if callManager.isVideoEnabled { callManager.refreshAvailableCameras() }
        }
    }

    /// §7.1/§7.3 — front/back flip on iPhone; a named device picker on Mac/iPad
    /// when multiple cameras (incl. Continuity/USB) are available. Hidden when
    /// video is off, or on Mac with a single camera (flip would be a no-op).
    @ViewBuilder
    private var cameraControl: some View {
        // Le flip avant/arrière iPhone vit désormais sur le cadre de la
        // self-preview (pipFrameButton) ; la barre ne garde que le picker
        // multi-caméras Mac/iPad (Continuity/USB), qui n'a pas d'équivalent
        // sur le cadre.
        if callManager.isVideoEnabled,
           callManager.availableCameras.count > 1,
           isOnMac || callManager.availableCameras.contains(where: { $0.isExternal }) {
            cameraPickerMenu
        }
    }

    /// §7.1 — named camera picker (Continuity / USB / built-in) for Mac/iPad.
    private var cameraPickerMenu: some View {
        Menu {
            ForEach(callManager.availableCameras) { cam in
                Button {
                    callManager.selectCamera(id: cam.id)
                } label: {
                    Label(
                        cam.displayName,
                        systemImage: callManager.selectedCameraId == cam.id ? "checkmark" : "camera"
                    )
                }
            }
        } label: {
            VStack(spacing: 6) {
                Image(systemName: "camera.badge.ellipsis")
                    // Doctrine 86i : glyphe de contrôle dans un cercle glass fixe (diameter 56) → figé.
                    .font(.system(size: 22, weight: .medium))
                    .foregroundColor(.white.opacity(0.9))
                    .callControlGlass(diameter: 56, isActive: false, tint: .white)
                Text(String(localized: "call.control.camera.caption", defaultValue: "Caméra", bundle: .main))
                    .font(.caption2.weight(.medium))
                    .foregroundColor(theme.textMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(width: 68)
        }
        .pressable()
        .accessibilityLabel(String(localized: "call.control.camera", defaultValue: "Choisir la caméra", bundle: .main))
    }

    // MARK: - UI Components

    private var pulsingAvatar: some View {
        ZStack {
            // Pulse rings — decorative animation only
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [MeeshyColors.indigo500.opacity(0.3), MeeshyColors.indigo400.opacity(0.1)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 2
                    )
                    .frame(width: 120 + CGFloat(index) * 30, height: 120 + CGFloat(index) * 30)
                    .scaleEffect(pulseScale)
                    .opacity(2.0 - Double(pulseScale) * 0.8)
                    .animation(
                        .easeInOut(duration: 1.5)
                            .repeatForever(autoreverses: true)
                            .delay(Double(index) * 0.3),
                        value: pulseScale
                    )
                    .accessibilityHidden(true)
            }

            callAvatarPair(size: 100)
        }
        // Decorative: the remote user's name is shown as a Text element directly
        // below this avatar in every layout that uses pulsingAvatar. VoiceOver
        // would otherwise read the first-initial letter from avatarCircle and then
        // the full name from the adjacent Text, producing a double-read.
        .accessibilityHidden(true)
    }

    private func avatarCircle(size: CGFloat) -> some View {
        let name = callManager.remoteUsername ?? "?"
        let initial = String(name.prefix(1)).uppercased()

        return ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [MeeshyColors.indigo500, MeeshyColors.indigo400],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: size, height: size)

            Text(initial)
                // Doctrine 86i : initiale d'avatar proportionnelle au cercle fixe `size` → figée.
                .font(.system(size: size * 0.4, weight: .bold, design: .rounded))
                .foregroundColor(.white)

            // Vraie photo de profil par-dessus le fallback initiale (le
            // dégradé + initiale restent visibles pendant le chargement).
            if let avatar = remoteProfile?.avatar, !avatar.isEmpty {
                CachedAsyncImage(
                    url: avatar,
                    targetSize: CGSize(width: size, height: size),
                    thumbHash: remoteProfile?.avatarThumbHash
                ) {
                    Color.clear
                }
                .scaledToFill()
                .frame(width: size, height: size)
                .clipShape(Circle())
            }
        }
        .shadow(color: MeeshyColors.indigo500.opacity(0.3), radius: 12, y: 4)
    }

    /// Duo d'avatars de l'appel : le correspondant en grand, l'utilisateur
    /// local en pastille chevauchante bas-droite — appelant ET appelé sont
    /// identifiables d'un coup d'œil, quel que soit le sens de l'appel.
    private func callAvatarPair(size: CGFloat) -> some View {
        let badgeSize = max(44, size * 0.4)
        return avatarCircle(size: size)
            .overlay(alignment: .bottomTrailing) {
                localAvatarBadge(size: badgeSize)
                    .offset(x: badgeSize * 0.22, y: badgeSize * 0.12)
            }
    }

    private func localAvatarBadge(size: CGFloat) -> some View {
        let user = AuthManager.shared.currentUser
        let name = user?.displayName ?? user?.username ?? "?"
        let initial = String(name.prefix(1)).uppercased()

        return ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [MeeshyColors.indigo600, MeeshyColors.indigo800],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            Text(initial)
                .font(.system(size: size * 0.4, weight: .bold, design: .rounded))
                .foregroundColor(.white)

            if let avatar = user?.avatar, !avatar.isEmpty {
                CachedAsyncImage(
                    url: avatar,
                    targetSize: CGSize(width: size, height: size),
                    thumbHash: user?.avatarThumbHash
                ) {
                    Color.clear
                }
                .scaledToFill()
                .frame(width: size, height: size)
                .clipShape(Circle())
            }
        }
        .frame(width: size, height: size)
        // Liseré au ton du fond : détache la pastille du grand cercle.
        .overlay(Circle().stroke(Color(hex: "0F0D19"), lineWidth: 3))
        .accessibilityLabel(String(localized: "call.avatar.you", defaultValue: "Vous", bundle: .main))
    }

    private var callTypeBadge: some View {
        HStack(spacing: 6) {
            Image(systemName: callManager.isVideoEnabled ? "video.fill" : "phone.fill")
                .font(MeeshyFont.relative(12, weight: .semibold))
                .accessibilityHidden(true)
            Text(callManager.isVideoEnabled ? String(localized: "call.type.video", defaultValue: "Appel vidéo", bundle: .main) : String(localized: "call.type.audio", defaultValue: "Appel audio", bundle: .main))
                .font(.caption2.weight(.semibold))
        }
        .foregroundColor(MeeshyColors.indigo400)
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(MeeshyColors.indigo400.opacity(0.15))
                .overlay(
                    Capsule()
                        .stroke(MeeshyColors.indigo400.opacity(0.3), lineWidth: 0.5)
                )
        )
    }

    /// `caption` is the short visible word under the glass circle; `label` is the
    /// full (often long, stateful) VoiceOver description. Keeping them separate is
    /// what lets every column stay the same width so the row reads as an even,
    /// intelligently-aligned glass bar instead of one button ballooning to fit a
    /// long French label.
    private func callControlButton(icon: String, color: Color, bgColor: Color, isActive: Bool, caption: String, label: String, hint: String? = nil, isToggle: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    // Doctrine 86i : glyphe de contrôle dans un cercle glass fixe (diameter 56) → figé
                    // (la caption `.caption2` sous le bouton porte, elle, le Dynamic Type).
                    .font(.system(size: 22, weight: .medium))
                    .foregroundColor(isActive ? color : .white.opacity(0.9))
                    .callControlGlass(diameter: 56, isActive: isActive, tint: bgColor)

                Text(caption)
                    .font(.caption2.weight(.medium))
                    .foregroundColor(theme.textMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(width: 68)
        }
        .pressable()
        .accessibilityLabel(label)
        .optionalAccessibilityHint(hint)
        .callToggleAccessibility(isToggle: isToggle, isActive: isActive)
    }

    private var effectsToggleButton: some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                showEffectsToolbar.toggle()
            }
        } label: {
            VStack(spacing: 6) {
                Image(systemName: showEffectsToolbar ? "xmark" : "camera.filters")
                    // Doctrine 86i : glyphe de contrôle dans un cercle glass fixe (diameter 64) → figé.
                    .font(.system(size: 24, weight: .medium))
                    .foregroundColor(hasActiveEffects ? MeeshyColors.indigo500 : .white.opacity(0.9))
                    .callControlGlass(diameter: 64, isActive: hasActiveEffects, tint: MeeshyColors.indigo500)

                Text(String(localized: "call.filters", defaultValue: "Filtres", bundle: .main))
                    .font(.caption2.weight(.medium))
                    .foregroundColor(.white.opacity(0.7))
            }
        }
        .pressable()
        .accessibilityLabel(String(localized: "call.filters.a11y", defaultValue: "Filtres video", bundle: .main))
        .accessibilityHint(String(localized: "call.filters.hint", defaultValue: "Ouvre ou ferme la barre de filtres video", bundle: .main))
    }

    private var endCallButton: some View {
        Button {
            callManager.endCall()
        } label: {
            VStack(spacing: 6) {
                Image(systemName: "phone.down.fill")
                    // Doctrine 86i : glyphe de fin d'appel dans un cercle glass fixe (diameter 56) → figé.
                    .font(.system(size: 24, weight: .medium))
                    .foregroundColor(.white)
                    .endCallGlass(diameter: 56)

                Text(String(localized: "call.end.caption", defaultValue: "Raccrocher", bundle: .main))
                    .font(.caption2.weight(.medium))
                    .foregroundColor(theme.textMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(width: 68)
        }
        .pressable()
        .accessibilityLabel(String(localized: "call.end", defaultValue: "Raccrocher", bundle: .main))
        .accessibilityHint(String(localized: "call.end.hint", defaultValue: "Termine l'appel en cours", bundle: .main))
    }

    private func statusPill(icon: String, text: String, color: Color) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption2.weight(.semibold))
                .accessibilityHidden(true)
            Text(text)
                .font(.caption2.weight(.medium))
        }
        .foregroundColor(color)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(color.opacity(0.12))
        )
    }

    // MARK: - Helpers

    private func startPulseAnimation() {
        // Audit P2-iOS-9 — skip the repeating animation when Reduce Motion
        // is enabled. A one-shot scale is still informative; the infinite
        // loop is what's problematic for motion-sensitive users.
        guard !reduceMotion else { return }
        withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
            pulseScale = 1.15
        }
    }

    private func stopPulseAnimation() {
        withTransaction(Transaction(animation: nil)) {
            pulseScale = 1.0
        }
    }

    private func endReasonText(_ reason: CallEndReason) -> String {
        switch reason {
        case .local: return String(localized: "call.ended.local")
        case .remote: return String(localized: "call.ended.remote")
        case .rejected: return String(localized: "call.ended.rejected")
        case .missed: return String(localized: "call.ended.missed")
        case .connectionLost: return String(localized: "call.ended.connectionLost")
        case .failed(let msg):
            // Use a static key with the message as a separate interpolation
            // arg via String.LocalizationValue. Putting `\(msg)` directly in
            // the key argument violates the StaticString requirement of
            // String(localized:) under Swift 6 strict mode.
            return String(
                localized: "call.ended.failed",
                defaultValue: "Échec de l'appel : \(msg)"
            )
        }
    }
}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}

// MARK: - Liquid Glass (product styling over the SDK Compatibility wrappers)

/// These are thin, app-side *styling* helpers: they encode Meeshy's product
/// choices (circle diameter, active→tint, red hang-up) and delegate the version
/// gating to the SDK `Compatibility/` layer (`adaptiveGlass` /
/// `adaptiveGlassProminent` / `AdaptiveGlassContainer`), which owns the real
/// `#available(iOS 26.0, *)` and the pre-iOS-26 fallback. No `#available` lives
/// in the app — same rule as every other adaptive wrapper.
private extension View {
    /// Regular Liquid Glass circle for a neutral/secondary control. Active state
    /// tints the glass; inactive renders plain glass (clear / material fallback).
    func callControlGlass(diameter: CGFloat, isActive: Bool, tint: Color) -> some View {
        self
            .frame(width: diameter, height: diameter)
            .adaptiveGlass(in: Circle(), tint: isActive ? tint.opacity(0.55) : nil, interactive: true)
    }

    /// Prominent red Liquid Glass circle for the hang-up button.
    func endCallGlass(diameter: CGFloat) -> some View {
        self
            .frame(width: diameter, height: diameter)
            .adaptiveGlassProminent(in: Circle(), tint: MeeshyColors.error)
    }
}

private extension View {
    @ViewBuilder
    func optionalAccessibilityHint(_ hint: String?) -> some View {
        if let h = hint {
            self.accessibilityHint(h)
        } else {
            self
        }
    }
}

private extension View {
    @ViewBuilder
    func callToggleAccessibility(isToggle: Bool, isActive: Bool) -> some View {
        if isToggle {
            let stateLabel = isActive
                ? String(localized: "call.control.state.on", defaultValue: "Activé", bundle: .main)
                : String(localized: "call.control.state.off", defaultValue: "Désactivé", bundle: .main)
            if #available(iOS 17, *) {
                self
                    .accessibilityAddTraits(.isToggle)
                    .accessibilityValue(stateLabel)
            } else {
                self.accessibilityValue(stateLabel)
            }
        } else {
            self
        }
    }
}
