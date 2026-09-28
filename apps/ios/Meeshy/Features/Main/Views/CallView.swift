import SwiftUI
import UIKit
import Combine
import MeeshySDK
import MeeshyUI
import os

// MARK: - Call View

struct CallView: View {
    // Audit P1-16 — injected by the caller (RootView/iPadRootView already
    // hold their own @ObservedObject callManager to gate presentation), NOT
    // a `= CallManager.shared` default. A defaulted @ObservedObject is
    // reassigned — and its objectWillChange subscription torn down and
    // rebuilt — every time the parent's body re-evaluates and reconstructs
    // this struct, even for churn unrelated to the call (unread counts,
    // presence, navigation). Threading the parent's existing instance down
    // avoids that redundant resubscription during an active call.
    @ObservedObject var callManager: CallManager
    // Audit P2-iOS-9 — respect the user's Reduce Motion preference. Without
    // this check, the continuous pulse/ring animations ran indefinitely
    // even for motion-sensitive users (and burned battery).
    @Environment(\.accessibilityReduceMotion) var reduceMotion
    // Instance du CallManager (et non un `@StateObject` local) : les segments
    // distants (DataChannel) et `toggleTranscription` opèrent sur CELLE-CI —
    // l'ancienne instance locale orpheline ne transcrivait jamais rien et
    // était ré-allouée à chaque présentation du CallView.
    //
    // 2026-07-10 — derived from the injected `callManager` in `init` (below)
    // instead of defaulting to `CallManager.shared.transcriptionService` at
    // declaration. Same P1-16 hazard as `callManager` above: a defaulted
    // @ObservedObject is reassigned every time the parent reconstructs
    // CallView (every call-duration/quality tick), tearing down and
    // rebuilding this subscription mid-call.
    @ObservedObject var transcriptionService: CallTranscriptionService
    @State var pulseScale: CGFloat = 1.0
    @State var showControls = true
    @State var showTranscript = false
    @State var showOriginalText = false
    @State var showEffectsToolbar = false
    /// Progression du morph PiP (0 = plein écran, 1 = contracté vers la
    /// bannière). Piloté par `collapseIntoPip()` (réduction) et par
    /// `onAppear` (expansion depuis la bannière) — voir le trio
    /// scale/opacité/coins posé sur le ZStack racine.
    @State var pipMorphProgress: CGFloat = 0
    /// #8435 — le décalage que l'écran suit pendant le glissé vers le bas.
    @State var swipeDownOffset: CGFloat = 0
    // §7.2 — PiP placement is corner-anchored (snap-to-nearest-corner) and
    // computed from a GeometryReader, not a hardcoded point. `pipDragOffset`
    // tracks the in-flight drag; `pipCorner` is the resting corner.
    @State var pipCorner: PiPCorner = .topTrailing
    @State var pipDragOffset: CGSize = .zero
    // §7.2 — FaceTime-style swap: which stream is the full-area "primary".
    // false ⇒ remote is primary + local in the PiP; true ⇒ swapped. Tapping
    // the PiP toggles it.
    @State var swapStreams = false
    @State var screenSharePicker = ScreenSharePickerLauncher()
    // §7.2/f — watchdog: after a delay with no remote video, the "Connexion
    // vidéo…" spinner turns into a calmer, informative state instead of
    // spinning forever (the media auto-repair / ICE-restart is §5.8).
    @State var videoConnectSlow = false
    let videoConnectWatchdogSeconds: UInt64 = 12
    // §H2 — After 6s in .offering with no answer, surface a calmer label
    // so the user knows the call is ringing, not stuck.
    @State var sdpOfferSlow = false
    let sdpOfferSlowSeconds: UInt64 = 6
    // 2026-07-13 — les alertes qualité (« réseau faible chez votre contact »,
    // « connexion au serveur perdue ») ne s'affichent plus en bannière pop-up
    // (retour user : la pill était du bruit inutile en plein appel). L'état de
    // faiblesse réseau vit UNIQUEMENT dans les indicateurs discrets déjà
    // présents dans la vue : glyphe de signal près du chrono + status pills
    // inline. VoiceOver reste notifié via les annonces a11y dans les onChange.
    // Profil du correspondant (avatar + bannière) — résolu cache-first dès que
    // `remoteUserId` est connu, refresh API silencieux (Instant App). Sert
    // l'avatar des cercles d'appel et le fond pleine page.
    @State var remoteProfile: MeeshyUser?
    @State var showQualityDetail = false
    /// #8276 — le maillage d'un appel de groupe, injecté comme `callManager`
    /// (jamais un `= .shared` par défaut, même hazard P1-16) : sa grille vit
    /// DANS l'écran d'appel, entre l'en-tête et la pilule.
    @ObservedObject var mesh: GroupCallMeshCoordinator
    /// #8394 — le `(…)` de la pilule : replié à l'ouverture de l'écran.
    @State var controlsDisclosure = CallControlsDisclosure()
    /// #8395 — plein écran d'une vignette à la une : masque les commandes.
    @State var isStageFullScreen = false
    /// #8396 — les phrases touchées, qui montrent l'AUTRE version (original
    /// sous une traduction, traduction sous un original dans le journal).
    @State var revealedCaptionIds: Set<UUID> = []
    @State var showCaptionsJournal = false
    /// #8433 · #8439 — le sélecteur d'amis et la palette des réactions.
    @State var showAddPeople = false
    @State var showReactionPalette = false

    /// Encart supérieur du chrome flottant (chevron minimize, bouton
    /// conversation, badge durée vidéo).
    ///
    /// La racine ignore la safe area sur les quatre côtés — c'est ce qui
    /// empêche le `clipShape` du morph PiP de laisser passer le fond blanc du
    /// cover. En contrepartie, la safe area ne descend plus d'elle-même jusqu'au
    /// chrome : posé à 8 pt, il se rendrait SOUS la Dynamic Island. La lire au
    /// niveau de la fenêtre est la seule voie — `GeometryProxy.safeAreaInsets`
    /// répond 0 dans un sous-arbre qui l'ignore, ce que documente déjà
    /// `DeviceLayout.safeAreaTop`.
    static var chromeTopInset: CGFloat { DeviceLayout.safeAreaTop + 8 }

    /// Encart inférieur de la pilule — même raison que `chromeTopInset` : la
    /// racine ignore la safe area, la pilule la retrouve depuis la fenêtre.
    static var chromeBottomInset: CGFloat { DeviceLayout.safeAreaBottom + 12 }

    init(callManager: CallManager, mesh: GroupCallMeshCoordinator) {
        self.callManager = callManager
        self.transcriptionService = callManager.transcriptionService
        self.mesh = mesh
    }

    /// #8276 — un appel de groupe (deux membres distants au moins) remplace la
    /// disposition 1:1 par sa scène.
    var isGroupStage: Bool {
        GroupCallStage.isShown(isMeshActive: mesh.isGroupCallActive, roster: mesh.roster)
    }

    /// #8394 — l'en-tête, la pilule et les rails se montrent et se masquent
    /// ENSEMBLE : masquage automatique (vidéo, 4 s) ou plein écran d'une
    /// vignette à la une.
    var isChromeVisible: Bool {
        showControls && !isStageFullScreen
    }

    var body: some View {
        // Ce conteneur n'existe que pour PROPOSER le plein écran à la surface.
        //
        // `.ignoresSafeArea()` autorise un contenu à DÉBORDER de la safe area,
        // mais ne change pas la taille que sa vue rapporte : elle reste celle
        // que le `fullScreenCover` propose, safe area DÉDUITE. Le `.clipShape`
        // du morph PiP, lui, rogne à cette boîte-là — d'où deux bandes du fond
        // BLANC du cover, hautes d'exactement les deux insets (59 pt sous la
        // Dynamic Island, 34 pt au-dessus du home indicator), constatées au
        // simulateur en thème clair le 2026-08-19.
        //
        // Un correctif du 2026-08-18 avait déplacé `.ignoresSafeArea()` AVANT
        // le clip en croyant élargir la boîte : les bandes sont restées. C'est
        // le PARENT qui doit proposer le plein écran — ici — pour que la boîte
        // de la surface l'égale et que le clip n'ait plus rien à rogner. Le
        // fond du contact couvre alors les quatre bords LUI-MÊME : aucun socle
        // opaque ne vient s'intercaler (retour user 2026-08-19 — « la bande
        // noire ne doit pas exister, le fond doit être l'image entière »).
        ZStack {
            callSurface
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .ignoresSafeArea()
        .callQualityDetailSheet(isPresented: $showQualityDetail)
    }

    /// La surface d'appel elle-même — séparée de `body` pour que son
    /// `clipShape` et son `scaleEffect` s'appliquent à une boîte DÉJÀ pleine.
    private var callSurface: some View {
        ZStack {
            // PiP système — ancre invisible plein écran : `sourceView` d'où la
            // fenêtre PiP émerge. `attachSystemPiP` se gate sur canActivateSystemPiP
            // (no-op hors appel vidéo), donc inoffensive ici en permanence.
            // #8435 — remontée à chaque fenêtre fermée : la génération force
            // la reconfiguration sur une vue vivante.
            PiPSourceAnchor()
                .id(callManager.pipAnchorGeneration)
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
            //
            // §4.3 — l'ancien bandeau plein-écran "Reconnexion…" (IslandEmergingBanner
            // + ProgressView) a été retiré (user-reported 2026-07-11 : l'indicateur
            // jaune couvrait tout l'écran). L'état `.reconnecting` est maintenant
            // porté UNIQUEMENT par une pill compacte dans la même "queue" que les
            // autres indicateurs de statut (statusPill dans audioCallLayout, glyphe
            // inline dans le badge durée de videoCallLayout) — jamais par un overlay
            // plein-écran. VoiceOver reste notifié via l'annonce a11y ci-dessous.

            // §4.4 — la dégradation réseau du pair (`call:quality-alert`) et la
            // perte du signaling (`isSignalingDegraded`) ne sont plus surfacées
            // par une bannière pop-up : l'état persiste dans les indicateurs
            // discrets de la vue (glyphe signal + status pills « Réseau faible
            // (contact) » / « Serveur déconnecté »). Annonces VoiceOver dans les
            // onChange plus bas.

            // Effects overlay — accessible dans tous les etats actifs (pas seulement
            // connected). Video-only depuis 2026-07-02 : le panneau d'effets vocaux
            // est retiré (pipeline de capture audio inexistant — voir
            // CallEffectsOverlay), il ne reste que les filtres vidéo.
            if callManager.callState.isActive && !callManager.callState.isRinging && callManager.isVideoEnabled {
                CallEffectsOverlay(
                    isExpanded: $showEffectsToolbar,
                    isVideoEnabled: callManager.isVideoEnabled,
                    callManager: callManager
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
                topChrome
            }
        }
        // BORD À BORD sur les quatre côtés. Le `clipShape` du morph PiP (plus
        // bas) rogne à la BOÎTE de ce ZStack : tant qu'elle excluait la safe
        // area haute, il coupait net le fond, le self-preview et les flux vidéo
        // que leurs propres `.ignoresSafeArea()` avaient étendus jusqu'au bord —
        // et le fond BLANC du `fullScreenCover` transparaissait en bandeau sous
        // la Dynamic Island (retour user 2026-08-18, capture).
        //
        // Le chrome haut ne perd rien : il ré-encarte lui-même la safe area via
        // `chromeTopInset`, seule façon de la retrouver sous un conteneur qui
        // l'ignore (le proxy d'un GeometryReader y répond 0).
        .ignoresSafeArea()
        // Morph PiP (retour user 2026-08-12) : la réduction vers la bannière
        // et l'agrandissement depuis elle sont portés par CE trio scale/
        // opacité/coins — le fullScreenCover est basculé SANS animation
        // système (withTransaction) pour que la contraction/expansion soit LA
        // transition. Ancre .top : la bannière PiP vit en haut du viewport.
        .scaleEffect(1 - 0.9 * pipMorphProgress, anchor: .top)
        .opacity(1 - 0.55 * Double(pipMorphProgress))
        .clipShape(RoundedRectangle(cornerRadius: pipMorphProgress * 32, style: .continuous))
        .offset(y: swipeDownOffset)
        .statusBarHidden(true)
        // L'écran d'appel est blanc-sur-fond-sombre fixe (cf. callBackground).
        // On épingle aussi le colorScheme en .dark pour que le verre et les
        // matériaux (.ultraThinMaterial, glassEffect) rendent leur variante
        // sombre : sinon ils virent au clair en mode Light et les contrôles/
        // textes blancs deviennent illisibles (white-on-white).
        .environment(\.colorScheme, .dark)
        .onAppear {
            startPulseAnimation()
            // Expansion depuis la bannière PiP : le contenu démarre contracté
            // vers le haut (là où vivait la bannière) puis s'étire en plein
            // écran — mouvement inverse de collapseIntoPip(), même ressort.
            if callManager.consumePendingPipExpansion(), !reduceMotion {
                pipMorphProgress = 1
                withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) {
                    pipMorphProgress = 0
                }
            }
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
            // Plus de bannière pop-up : l'état persiste dans la status pill
            // discrète « Réseau faible (contact) ». On notifie seulement VoiceOver
            // à la bascule en dégradé.
            guard isDegraded else { return }
            UIAccessibility.post(
                notification: .announcement,
                argument: String(localized: "call.a11y.remote.quality.poor",
                                defaultValue: "Réseau faible chez votre contact",
                                bundle: .main))
        }
        .adaptiveOnChange(of: callManager.isSignalingDegraded) { _, isDegraded in
            // Idem : l'état vit dans la status pill « Serveur déconnecté » ;
            // simple annonce VoiceOver à la bascule.
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
    func resolveRemoteProfile(userId: String?) async {
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
            // L'adresse CANONIQUE (#4161) : `/directory/people/{handle}`,
            // qui accepte un identifiant comme un pseudo. Ce site visait
            // `/users/id/{id}`, l'un des trois alias que la passerelle ne garde
            // que pour les versions déjà installées.
            let user = try await UserService.shared.getProfile(handle: userId).user
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
}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}

// Not `private`: FloatingCallPillView reuses both modifiers so its mute/speaker
// controls expose the same toggle semantics (trait + on/off value) as the
// full-screen call surface's equivalent buttons instead of a plain label swap.
extension View {
    @ViewBuilder
    func optionalAccessibilityHint(_ hint: String?) -> some View {
        if let h = hint {
            self.accessibilityHint(h)
        } else {
            self
        }
    }
}

// `callToggleAccessibility` a vécu ici. Rien dedans n'était propre aux appels :
// il a déménagé dans `ToggleStateAccessibility.swift` sous le nom
// `toggleStateAccessibility`, parce que son NOM et son FICHIER l'avaient enfermé
// dans les cinq surfaces d'appel (253i, #4266).