import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Incoming Call View

struct IncomingCallView: View {
    // Audit P1-16 — `@ObservedObject var x = CallManager.shared` would
    // re-create the subscription every time the parent CallView re-evaluates
    // its body (which happens often during the ringing pulse animation).
    // Receive the manager from the parent so SwiftUI keeps the same
    // subscription throughout the view's lifetime.
    @ObservedObject var callManager: CallManager
    /// Le profil du correspondant résolu par `CallView` (cache d'abord) : sa photo et son
    /// contour équipé habillent le disque (#12336). `nil` tant qu'il n'est pas résolu.
    let peerProfile: MeeshyUser?
    // Audit P2-iOS-9 — see CallView; skip repeating animations for
    // motion-sensitive users.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var ringScale: CGFloat = 0.8
    @State private var ringOpacity: Double = 1.0
    @State private var avatarBounce: Bool = false
    @State private var isDeclineSheetPresented: Bool = false
    /// Vue P17 (#16945) — micro et caméra choisis AVANT de décrocher : un
    /// état local de l'écran, rien n'en part au pair avant la réponse.
    @State private var preAnswer = IncomingPreAnswer()

    /// Le micro coupé dans la barre d'avant le décroché se pose juste après la
    /// réponse, par le même chemin que la pilule : la piste qui naît pendant la
    /// connexion respecte la coupure (#8434). Sans effet si la réponse n'est
    /// pas partie (micro refusé, appel déjà fini).
    private func applyMicrophoneChoice() {
        guard preAnswer.answersMuted, !callManager.isMuted, callManager.callState == .connecting else { return }
        callManager.toggleMute()
    }

    /// Tranche les permissions AVANT de laisser `CallManager` répondre.
    ///
    /// Ce chemin (bannière in-app, app au premier plan) est le seul où l'on
    /// peut demander avant l'acceptation — sur le chemin CallKit l'UI système
    /// répond pour nous et `CallManager.answerCall()` porte la garde de repli.
    /// Micro refusé ⇒ on ne répond pas et on raccroche : un appel accepté sans
    /// micro se connecte muet, l'appelant parlant dans le vide.
    /// Caméra refusée ⇒ on répond quand même, en audio (dégradation gérée en aval).
    private func acceptCall() {
        Task { @MainActor in
            guard await MediaPermissionCoordinator.ensureMicrophone() else {
                callManager.endCall()
                return
            }
            switch preAnswer.route(isVideoCall: callManager.isVideoEnabled) {
            case .asOffered:
                if callManager.isVideoEnabled {
                    await MediaPermissionCoordinator.ensureCamera(announcesRefusal: false)
                }
                callManager.answerCall()
            case .withoutVideo:
                CallAnswerWithoutVideo(call: callManager).answer()
            }
            applyMicrophoneChoice()
        }
    }

    /// « Répondre sans vidéo » (OPUS-5) : même garde micro qu'Accepter, mais
    /// la caméra n'est pas demandée et `CallManager` la retire avant de
    /// répondre — aucune image ne part au pair.
    private func acceptCallWithoutVideo() {
        Task { @MainActor in
            guard await MediaPermissionCoordinator.ensureMicrophone() else {
                callManager.endCall()
                return
            }
            CallAnswerWithoutVideo(call: callManager).answer()
            applyMicrophoneChoice()
        }
    }

    private var layout: IncomingCallLayout {
        IncomingCallLayout.of(isVideoCall: callManager.isVideoEnabled)
    }

    private var callerName: String {
        callManager.remoteUsername ?? String(localized: "call.incoming.unknown_caller", defaultValue: "Inconnu", bundle: .main)
    }

    private var callTypeLabel: String {
        callManager.isVideoEnabled
            ? String(localized: "call.incoming.video", defaultValue: "Appel vidéo entrant", bundle: .main)
            : String(localized: "call.incoming.audio", defaultValue: "Appel entrant", bundle: .main)
    }

    var body: some View {
        VStack(spacing: 0) {
            switch layout {
            case .audio:
                audioHeader
            case .videoPreview:
                videoHeader
            }

            preAnswerBar

            // Accept / Reject buttons
            actionButtons
                .padding(.bottom, MeeshySpacing.xl)

            declineWithMessageButton
                // Comme la pilule de l'appel établi (`CallView+Connected.swift`) :
                // le même encart bas que le reste de l'écran d'appel, pas une
                // valeur en dur sans rapport avec la safe area de l'appareil.
                .padding(.bottom, CallView.chromeBottomInset)
        }
        // L'écran ENTIER, avant d'y poser l'aperçu : sans ce cadre, le
        // `VStack` ne prenait que la largeur de ses boutons, et la vidéo de
        // l'appelant n'était peinte que dans cette colonne — les côtés
        // montraient un autre fond (appel réel iPhone → simulateur).
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        // #8480 — l'appelant, vu avant de décrocher
        .background { CallPreviewBackdrop(preview: .shared) }
        .sheet(isPresented: $isDeclineSheetPresented) {
            CallDeclineSheet(callManager: callManager) {
                isDeclineSheetPresented = false
            }
        }
        .onAppear {
            UIAccessibility.post(
                notification: .screenChanged,
                argument: String(
                    localized: "call.incoming.a11y.announced",
                    defaultValue: "\(callTypeLabel), \(callerName)",
                    bundle: .main
                )
            )
        }
    }

    // MARK: - Headers

    /// L'écran d'appel AUDIO entrant tel qu'il est livré (#8480) : la planche
    /// ne le redessine pas, sa disposition ne bouge pas.
    @ViewBuilder
    private var audioHeader: some View {
        Spacer()

        // Pulsing ring animation — purely decorative; caller name announced below
        ringAnimation
            .accessibilityHidden(true)
            .padding(.bottom, MeeshySpacing.xxxl)

        callerNameText
            .padding(.bottom, MeeshySpacing.sm)

        // Call type label
        Text(callTypeLabel)
            .font(.callout.weight(.medium))
            .foregroundStyle(Color.white.opacity(0.7))
            .padding(.bottom, MeeshySpacing.md)

        // Call type badge
        callTypeBadge
            .padding(.bottom, 60)

        Spacer()

        // #8480 — entendre l'appelant avant de décrocher
        CallPreviewSoundButton(preview: .shared)
            .padding(.bottom, MeeshySpacing.xxl)
    }

    /// Vue P17 (#16945) — de haut en bas : la puce de verre du type d'appel,
    /// le nom, « Activer le son » ; puis la vidéo voilée de l'appelant, que
    /// son disque ne recouvre pas, et ma vignette à mi-hauteur à droite.
    @ViewBuilder
    private var videoHeader: some View {
        typeChip
            .padding(.top, MeeshySpacing.xxxl)
            .padding(.bottom, MeeshySpacing.md)

        callerNameText
            .padding(.bottom, MeeshySpacing.md)

        CallPreviewSoundButton(preview: .shared)

        ZStack {
            CallPreviewCallerDisc(preview: .shared) {
                ringAnimation
                    .accessibilityHidden(true)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            // OPUS-5 — MA caméra, vue avant de décrocher (jamais envoyée avant) :
            // au tiers de l'espace libre, sous « Activer le son ».
            VStack(spacing: 0) {
                Spacer(minLength: MeeshySpacing.xxxl)
                selfPreview
                Spacer()
                Spacer()
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var callerNameText: some View {
        Text(callerName)
            .font(.system(.title, design: .rounded).weight(.semibold))
            // Posé sur le fond sombre fixe de CallView → texte clair fixe
            // (theme.textPrimary suit le système et virait au foncé en Light).
            .foregroundStyle(Color.white)
    }

    /// La puce de verre « Appel vidéo entrant » de la vue P17, au-dessus du nom.
    private var typeChip: some View {
        Label(callTypeLabel, systemImage: "video")
            .font(.caption.weight(.semibold))
            .foregroundStyle(Color.white)
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.xsPlus)
            .adaptiveGlass(in: Capsule())
            .accessibilityElement(children: .combine)
    }

    // MARK: - Ring Animation

    private var ringAnimation: some View {
        ZStack {
            // Expanding rings
            ForEach(0..<4, id: \.self) { index in
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [
                                MeeshyColors.success.opacity(0.4 - Double(index) * 0.08),
                                MeeshyColors.indigo400.opacity(0.2 - Double(index) * 0.04)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: max(1, 3 - CGFloat(index) * 0.5)
                    )
                    .frame(
                        width: 120 + CGFloat(index) * 35,
                        height: 120 + CGFloat(index) * 35
                    )
                    .scaleEffect(ringScale)
                    .opacity(ringOpacity - Double(index) * 0.15)
                    .animation(
                        reduceMotion ? nil
                            : .easeInOut(duration: 1.2)
                                .repeatForever(autoreverses: true)
                                .delay(Double(index) * 0.2),
                        value: ringScale
                    )
            }

            // Avatar
            avatarView
                .scaleEffect(avatarBounce ? 1.05 : 1.0)
                .animation(
                    reduceMotion
                        ? nil
                        : .spring(response: 0.6, dampingFraction: 0.5).repeatForever(autoreverses: true),
                    value: avatarBounce
                )
        }
        .onAppear {
            // Audit P2-iOS-9 — only kick off the infinite animations when
            // Reduce Motion is OFF. Otherwise the static layout is shown.
            ringScale = reduceMotion ? 1.0 : 1.1
            ringOpacity = reduceMotion ? 0.85 : 0.6
            avatarBounce = !reduceMotion
        }
        .onDisappear {
            withTransaction(Transaction(animation: nil)) {
                ringScale = 1.0
                ringOpacity = 0.0
                avatarBounce = false
            }
        }
    }

    private var avatarView: some View {
        CachedAvatarImage(
            urlString: peerProfile?.avatar,
            thumbHash: peerProfile?.avatarThumbHash,
            name: callManager.remoteUsername ?? "?",
            size: 110,
            accentColor: MeeshyColors.brandPrimaryHex
        )
        .avatarRingWithin(ProfileDecorResolver.ring(peerProfile?.profileDecor?.avatarRing), footprint: 110)
        .shadow(color: MeeshyColors.indigo500.opacity(0.4), radius: 16, y: 6)
    }

    // MARK: - Call Type Badge

    private var callTypeBadge: some View {
        CallTypeBadgeView(
            isVideo: callManager.isVideoEnabled,
            label: callManager.isVideoEnabled
                ? String(localized: "call.incoming.badge.video", defaultValue: "Vidéo", bundle: .main)
                : String(localized: "call.incoming.badge.audio", defaultValue: "Audio", bundle: .main)
        )
    }

    // MARK: - Decline With Message

    private var declineWithMessageButton: some View {
        Button {
            isDeclineSheetPresented = true
        } label: {
            Label(
                String(localized: "call.decline.open", defaultValue: "Message", bundle: .main),
                systemImage: "message.fill"
            )
            .font(.callout.weight(.medium))
            .foregroundStyle(Color.white)
            .padding(.horizontal, MeeshySpacing.xl)
            .frame(minHeight: 44)
            .adaptiveGlass(in: Capsule())
        }
        .pressable()
        .accessibilityLabel(String(localized: "call.decline.open.label", defaultValue: "Refuser avec un message", bundle: .main))
        .accessibilityHint(String(localized: "call.decline.open.hint", defaultValue: "Propose des réponses rapides qui refusent l'appel", bundle: .main))
    }

    // MARK: - Pre-Answer Bar

    /// Vue P17 (#16945) — ce que l'autre verra, mon micro, ma caméra.
    @ViewBuilder
    private var preAnswerBar: some View {
        if IncomingCallChoices.showsPreAnswerBar(isVideoCall: callManager.isVideoEnabled) {
            IncomingPreAnswerBar(
                peerName: callerName,
                choice: preAnswer,
                exposure: preAnswer.exposure(
                    isVideoCall: callManager.isVideoEnabled,
                    hasLocalVideoTrack: callManager.hasLocalVideoTrack
                ),
                cameraFilms: preAnswer.cameraFilms(
                    isVideoCall: callManager.isVideoEnabled,
                    hasLocalVideoTrack: callManager.hasLocalVideoTrack
                ),
                onToggleMicrophone: { preAnswer = preAnswer.togglingMicrophone() },
                onToggleCamera: { preAnswer = preAnswer.togglingCamera() }
            )
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.bottom, MeeshySpacing.xxl)
        }
    }

    // MARK: - Self Preview

    /// OPUS-5 — la vignette de ma propre caméra, à la taille de la vignette de
    /// l'appel établi (`CallSelfTileScale.standard`). Elle lit la
    /// piste locale que la sonnerie a déjà démarrée : aucune caméra en plus,
    /// et rien ne part au pair avant le décroché (pas de réponse SDP, lien
    /// d'aperçu en réception seule).
    @ViewBuilder
    private var selfPreview: some View {
        let shows = IncomingCallChoices.showsSelfPreview(
            isVideoCall: callManager.isVideoEnabled,
            hasLocalVideoTrack: callManager.hasLocalVideoTrack,
            cameraChosen: preAnswer.cameraOn
        )
        ZStack {
            if shows {
                let size = CallSelfTileScale.standard.size
                LocalCameraVideoView(
                    track: callManager.localVideoTrack,
                    intendedFront: callManager.isUsingFrontCamera,
                    contentMode: .scaleAspectFill
                )
                .frame(width: size.width, height: size.height)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                // Loi 4 — le liseré de MA vignette porte MA couleur, la même
                // que ma tuile de groupe et mes sous-titres ; la plaque dit
                // « Vous » comme ma tuile de groupe.
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(selfTileStroke, lineWidth: CallSelfTileStroke.lineWidth)
                )
                .overlay(alignment: .bottom) { selfTileNameplate }
                .shadow(color: Color.black.opacity(0.35), radius: 10, y: 4)
                .padding(.trailing, MeeshySpacing.md)
                .accessibilityElement()
                .accessibilityLabel(String(localized: "call.incoming.selfPreview.label", defaultValue: "Votre caméra, non envoyée avant de décrocher", bundle: .main))
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: IncomingCallChoices.selfPreviewFadeDuration(reduceMotion: reduceMotion)), value: shows)
    }

    private var selfTileStroke: Color {
        CallSelfTileStroke.color(forKey: IncomingCallChoices.selfColorKey(userId: AuthManager.shared.currentUser?.id))
    }

    private var selfTileNameplate: some View {
        CallTileNameplate(title: String(localized: "call.group.tile.you", defaultValue: "Vous", bundle: .main))
            .padding(.bottom, MeeshySpacing.xsPlus)
            .accessibilityHidden(true)
    }

    // MARK: - Action Buttons

    private var actionButtons: some View {
        let actions = IncomingCallChoices.actions(isVideoCall: callManager.isVideoEnabled)
        // iOS 26 Liquid Glass (prominent, tinted) for the primary actions —
        // gating/fallback owned by the SDK Compatibility wrappers. Grouped so the
        // glass circles blend rather than clip (glass can't sample glass).
        return AdaptiveGlassContainer(spacing: 40) {
            HStack(spacing: IncomingCallChoices.buttonSpacing(for: actions.count)) {
                ForEach(actions, id: \.self) { action in
                    actionButton(action)
                }
            }
        }
    }

    @ViewBuilder
    private func actionButton(_ action: IncomingCallAction) -> some View {
        let captionInk: Color? = layout.whiteCaptions ? Color.white : nil
        switch action {
        case .decline:
            roundButton(
                systemImage: "phone.down.fill",
                tint: MeeshyColors.error,
                caption: String(localized: "call.incoming.decline", defaultValue: "Refuser", bundle: .main),
                captionInk: captionInk,
                label: String(localized: "call.incoming.decline.label", defaultValue: "Refuser l'appel", bundle: .main),
                hint: String(localized: "call.incoming.decline.hint", defaultValue: "Décline l'appel entrant", bundle: .main)
            ) { callManager.rejectCall() }
        case .answerWithoutVideo:
            // P17 — un verre neutre et un téléphone blanc : répondre en audio.
            roundButton(
                systemImage: "phone.fill",
                tint: Color.white,
                caption: String(localized: "call.incoming.answerNoVideo", defaultValue: "Sans vidéo", bundle: .main),
                captionInk: captionInk,
                label: String(localized: "call.incoming.answerNoVideo.label", defaultValue: "Répondre sans vidéo", bundle: .main),
                hint: String(localized: "call.incoming.answerNoVideo.hint", defaultValue: "Décroche caméra coupée : l'appelant voit votre avatar", bundle: .main),
                prominent: false
            ) { acceptCallWithoutVideo() }
        case .accept:
            acceptButton(captionInk: captionInk)
        }
    }

    /// « Répondre » (P17) ou « Accepter » (audio) : le glyphe suit la route
    /// choisie — caméra coupée dans la barre ⇒ un téléphone.
    @ViewBuilder
    private func acceptButton(captionInk: Color?) -> some View {
        let glyph = IncomingCallChoices.acceptGlyph(
            isVideoCall: callManager.isVideoEnabled,
            route: preAnswer.route(isVideoCall: callManager.isVideoEnabled)
        )
        switch layout.acceptCaption {
        case .answer:
            roundButton(
                systemImage: glyph,
                tint: MeeshyColors.success,
                caption: String(localized: "call.incoming.answer", defaultValue: "Répondre", bundle: .main),
                captionInk: captionInk,
                label: String(localized: "call.incoming.answer.label", defaultValue: "Répondre à l'appel", bundle: .main),
                hint: String(localized: "call.incoming.accept.hint", defaultValue: "Répond à l'appel entrant", bundle: .main)
            ) { acceptCall() }
        case .accept:
            roundButton(
                systemImage: glyph,
                tint: MeeshyColors.success,
                caption: String(localized: "call.incoming.accept", defaultValue: "Accepter", bundle: .main),
                captionInk: captionInk,
                label: String(localized: "call.incoming.accept.label", defaultValue: "Accepter l'appel", bundle: .main),
                hint: String(localized: "call.incoming.accept.hint", defaultValue: "Répond à l'appel entrant", bundle: .main)
            ) { acceptCall() }
        }
    }

    /// Un bouton rond de 70 pt et sa légende. `prominent: false` — verre neutre
    /// teinté seulement par le glyphe, pour que « Sans vidéo » se lise comme
    /// une variante de Répondre, pas comme un troisième choix aussi fort.
    /// `captionInk` — l'encre de la légende (blanche sur la vue P17), sinon
    /// la teinte du bouton.
    private func roundButton(
        systemImage: String,
        tint: Color,
        caption: String,
        captionInk: Color? = nil,
        label: String,
        hint: String,
        prominent: Bool = true,
        perform: @escaping () -> Void
    ) -> some View {
        Button(action: perform) {
            VStack(spacing: MeeshySpacing.smPlus) {
                Group {
                    if prominent {
                        Image(systemName: systemImage)
                            // doctrine 82i — glyphe borné par le cercle de bouton fixe 70×70 ;
                            // le `Button` porte déjà son `.accessibilityLabel`/`.accessibilityHint`
                            .font(MeeshyFont.fixedGlyph(28, weight: .medium))
                            .foregroundStyle(Color.white)
                            .frame(width: 70, height: 70)
                            .adaptiveGlassProminent(in: Circle(), tint: tint)
                    } else {
                        Image(systemName: systemImage)
                            // doctrine 82i — même cercle fixe 70×70
                            .font(MeeshyFont.fixedGlyph(26, weight: .medium))
                            .foregroundStyle(tint)
                            .frame(width: 70, height: 70)
                            .adaptiveGlass(in: Circle())
                    }
                }

                Text(caption)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(captionInk ?? tint)
                    .lineLimit(1)
                    .fixedSize()
            }
        }
        .pressable()
        .accessibilityLabel(label)
        .accessibilityHint(hint)
    }
}
