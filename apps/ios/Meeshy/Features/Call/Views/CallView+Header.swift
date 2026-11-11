import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// Le chrome du haut de l'écran d'appel : Réduire · Image dans l'image ·
// Conversation (#17329, `CallHeaderRule`), la capsule de droite (#17341,
// `CallHeaderCapsuleRule`) et le passage vers la conversation pendant l'appel.
// Sorti de `CallView.swift` (hors budget de taille, #8276). #17323 — ses
// boutons sont des verres interactifs voisins, composés dans un
// `AdaptiveGlassContainer`.

extension CallView {
    // MARK: - Top Chrome

    var headerActions: [CallHeaderAction] {
        CallHeaderRule.actions(CallHeaderContext(
            canActivateSystemPiP: callManager.canActivateSystemPiP,
            isSystemPiPActive: callManager.isSystemPiPActive,
            hasConversation: callManager.conversationId != nil
        ))
    }

    /// Minimize-to-PiP affordance + image dans l'image + ouverture de la conversation.
    var topChrome: some View {
        VStack {
            AdaptiveGlassContainer(spacing: CallControlGlassMetrics.containerSpacing) {
                HStack(spacing: MeeshySpacing.sm) {
                    ForEach(headerActions, id: \.self) { action in
                        headerButton(action)
                            .transition(reduceMotion ? .opacity : .opacity.combined(with: .scale(scale: 0.8)))
                    }
                    Spacer()
                    // #8394 — la capsule, à DROITE de la rangée d'en-tête, en duo
                    // vidéo comme en groupe ; en audio, pour le seul réseau dégradé.
                    if headerCapsule != nil {
                        durationChip
                    }
                }
                .animation(disclosureAnimation, value: headerActions)
            }
            Spacer()
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, Self.chromeTopInset)
        // §7.3 — l'en-tête se masque avec la pilule et les rails.
        .callChromeVisibility(isChromeVisible)
        .task(id: callManager.conversationId) { await refreshHeaderNames() }
    }

    @ViewBuilder
    private func headerButton(_ action: CallHeaderAction) -> some View {
        switch action {
        case .minimize:
            headerGlassButton(
                symbol: "chevron.down",
                glyphSize: 16,
                label: String(localized: "call.minimize", defaultValue: "Réduire", bundle: .main),
                hint: String(localized: "call.minimize.hint", defaultValue: "Garde l'appel en cours dans une bannière flottante", bundle: .main),
                action: collapseIntoPip
            )
        case .pictureInPicture:
            pictureInPictureHeaderButton()
        case .conversation:
            // #8436 — la SEULE porte vers la conversation pendant l'appel (plus
            // d'action « Messages ») : ouvrir la conversation (DM) de
            // l'interlocuteur tout en gardant l'appel actif, minimisé en pilule.
            headerGlassButton(
                symbol: "bubble.left.and.bubble.right.fill",
                glyphSize: 15,
                label: String(localized: "call.openConversation", defaultValue: "Conversation", bundle: .main),
                hint: String(localized: "call.openConversation.hint", defaultValue: "Ouvre la conversation en gardant l'appel actif", bundle: .main),
                action: openConversationDuringCall
            )
        }
    }

    /// PiP système : visible seulement si l'appel y est éligible (vidéo, piste
    /// distante, caméra distante allumée, appareil compatible) — ou déjà actif,
    /// pour pouvoir en sortir (`CallHeaderRule`).
    func pictureInPictureHeaderButton() -> some View {
        let isActive = callManager.isSystemPiPActive
        return headerGlassButton(
            symbol: isActive ? "pip.exit" : "pip.enter",
            glyphSize: 16,
            isActive: isActive,
            label: isActive
                ? String(localized: "call.control.pip.exit", defaultValue: "Quitter le mode Picture-in-Picture", bundle: .main)
                : String(localized: "call.control.pip", defaultValue: "Réduire en Picture-in-Picture", bundle: .main),
            hint: isActive ? nil : String(localized: "call.control.pip.hint", defaultValue: "Ferme l'écran d'appel et garde la vidéo dans une fenêtre flottante", bundle: .main)
        ) {
            if isActive {
                callManager.stopSystemPiP()
            } else {
                enterSystemPiP()
            }
        }
    }

    /// Doctrine 82i : glyphe de chrome dans un cadre glass fixe (diameter 40) →
    /// taille figée, sans déborder du cercle ; la cible tactile reste HIG 44×44.
    private func headerGlassButton(
        symbol: String,
        glyphSize: CGFloat,
        isActive: Bool = false,
        label: String,
        hint: String?,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(MeeshyFont.fixedGlyph(glyphSize, weight: .semibold))
                .foregroundStyle(Color.white)
                .callControlGlass(diameter: 40, isActive: isActive, tint: .white)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(label)
        .optionalAccessibilityHint(hint)
    }

    // MARK: - La capsule de droite (#17341)

    /// Les noms que la conversation en cache donne à la capsule — cache-first,
    /// aucune requête ne part d'ici.
    @MainActor
    func refreshHeaderNames() async {
        let conversationId = callManager.conversationId
        let conversation: MeeshyConversation?
        if let conversationId, !conversationId.isEmpty {
            conversation = await CallConversationCache.shared.cachedConversation(id: conversationId)
        } else {
            conversation = nil
        }
        headerNames = CallHeaderNames.resolve(conversation: conversation, knownGroupTitle: mesh.groupTitle(for: conversationId))
    }

    /// La capsule n'a de sens que sur un appel établi dont le layout n'a pas
    /// déjà sa propre ligne de statut : l'audio a le nom et la durée sous
    /// l'avatar, la capsule n'y porte que le réseau dégradé.
    var headerCapsule: CallHeaderCapsule? {
        let isEstablished: Bool
        switch callManager.callState {
        case .connected: isEstablished = true
        case .reconnecting: isEstablished = callManager.hasEstablishedMedia
        default: isEstablished = false
        }
        return CallHeaderCapsuleRule.resolve(CallHeaderCapsuleInput(
            layout: isGroupStage ? .group : (callManager.isVideoUIActive ? .video : .audio),
            isEstablished: isEstablished,
            isNetworkDegraded: signalStrength.isDegraded || callManager.isRemoteQualityDegraded || isConnectionDegraded,
            givenName: headerNames.givenName,
            displayName: callManager.remoteUsername,
            groupName: headerNames.groupName ?? mesh.groupTitle(for: callManager.conversationId),
            participantCount: callParticipantCount
        ))
    }

    @ViewBuilder
    private var durationChip: some View {
        if let capsule = headerCapsule {
            chip(capsule)
        }
    }

    private func chip(_ capsule: CallHeaderCapsule) -> some View {
        Group {
            if capsule.showsDuration {
                CallDurationClock { chipContent(capsule) }
            } else {
                chipContent(capsule)
            }
        }
        .callQualityDetailTrigger(isPresented: $showQualityDetail)
    }

    private func chipContent(_ capsule: CallHeaderCapsule) -> some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            if capsule.showsDuration {
                TransientCallSignalGlyph(strength: signalStrength)
            } else {
                CallSignalGlyph(strength: signalStrength)
            }
            if let title = capsule.title {
                Text(title)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Color.white)
                    .lineLimit(1)
                    .truncationMode(.tail)
                chipSeparator
            }
            if let count = capsule.participantCount {
                Image(systemName: "person.2.fill")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Color.white)
                Text("\(count)")
                    .font(.caption2.weight(.medium).monospacedDigit())
                    .foregroundStyle(Color.white)
                    .fixedSize()
                chipSeparator
            }
            if capsule.showsDuration {
                Text(callManager.formattedDuration)
                    .font(.caption2.weight(.medium).monospacedDigit())
                    .foregroundStyle(Color.white)
                    .fixedSize()
            }
            if capsule.showsNetwork && callManager.isRemoteQualityDegraded {
                Image(systemName: "wifi.exclamationmark")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(MeeshyColors.warning)
            }
            // §4.3 — même remplacement pill-compacte qu'en audio
            // (voir audioCallLayout) : pas de bandeau plein-écran.
            // No per-icon .accessibilityLabel — the badge is one
            // opaque element (children: .ignore below); this
            // state is folded into videoDurationBadgeAccessibilityLabel.
            if case .reconnecting = callManager.callState {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(MeeshyColors.warning)
                    .accessibilityHidden(true)
            }
        }
        // The parent's own .accessibilityLabel below already makes this
        // whole badge one opaque VoiceOver element (children: .ignore) —
        // every child label is discarded regardless, so hiding them here
        // is a no-op today. Kept explicit so a future removal of the
        // parent label doesn't silently re-expose fragmented per-child
        // announcements (glyph, then digits, then icon) instead of the
        // single composed sentence `videoDurationBadgeAccessibilityLabel`.
        .accessibilityElement(children: .ignore)
        .padding(.horizontal, MeeshySpacing.smPlus)
        .padding(.vertical, MeeshySpacing.xs)
        // Verre adaptatif à fond sombre (#8394) : lisible sur un flux clair.
        // #17323 — la capsule s'ouvre au toucher (détail de la qualité) :
        // un verre interactif, comme les boutons voisins.
        .modifier(CallInteractiveChromeCapsule())
        .clipShape(Capsule())
        .frame(height: 44)
        .accessibilityLabel(videoDurationBadgeAccessibilityLabel)
        .accessibilityValue(capsule.showsDuration ? callManager.spokenDuration : "")
        .accessibilityAddTraits(.updatesFrequently)
    }

    private var chipSeparator: some View {
        Text("·")
            .font(.caption2.weight(.medium))
            .foregroundStyle(Color.white.opacity(MeeshyOpacity.heavy))
    }

    // MARK: - Open Conversation During Call

    /// Minimise l'appel en pilule flottante (PiP, exactement comme le chevron)
    /// PUIS ouvre la conversation (DM) de l'interlocuteur — l'utilisateur peut
    /// consulter/écrire dans le chat pendant l'appel, puis revenir au plein écran
    /// via la pilule. Réutilise le canal de navigation `.navigateToConversation`
    /// déjà observé par RootView (iPhone) et iPadRootView (iPad) — même point
    /// d'entrée que la création de conversation et les deep links — plutôt que de
    /// dépendre d'un Router injecté qui ne traverse pas la frontière du
    /// `.fullScreenCover`.
    /// Réduction vers le cadre PiP (retour user 2026-08-12) : le flux plein
    /// écran se CONTRACTE vers le haut — là où la bannière PiP va apparaître —
    /// puis le fullScreenCover est retiré sans animation système : la
    /// contraction est LA transition, la bannière glisse ensuite depuis le
    /// haut (sa propre transition .move). Reduce Motion : bascule directe.
    func collapseIntoPip() {
        HapticFeedback.medium()
        guard !reduceMotion else {
            callManager.displayMode = .pip
            return
        }
        withAnimation(.spring(response: 0.38, dampingFraction: 0.86)) {
            pipMorphProgress = 1
        }
        Task { @MainActor in
            _ = await cancellableSleep(for: .milliseconds(300))
            var swap = Transaction()
            swap.disablesAnimations = true
            withTransaction(swap) {
                callManager.displayMode = .pip
            }
            pipMorphProgress = 0
        }
    }

    /// #8435 — le bouton PiP et le glissé : la fenêtre système démarre, et
    /// son démarrage ferme le plein écran (`CallPiPPolicy.displayModeOnStart`,
    /// appliqué par `CallManager`). AVKit refuse en silence quand la fenêtre
    /// n'est pas possible : passé le délai, le geste retombe sur la pastille
    /// plutôt que de rester sans effet.
    func enterSystemPiP() {
        HapticFeedback.medium()
        callManager.startSystemPiP()
        Task { @MainActor in
            _ = await cancellableSleep(for: .milliseconds(600))
            guard CallPiPPolicy.shouldFallBackToPill(
                isPiPActive: callManager.isSystemPiPActive,
                displayMode: callManager.displayMode
            ) else { return }
            collapseIntoPip()
        }
    }

    func leaveFullScreen(_ outcome: CallSwipeDownOutcome) {
        switch outcome {
        case .none: return
        case .pill: collapseIntoPip()
        case .systemPiP: enterSystemPiP()
        }
    }

    func openConversationDuringCall() {
        guard let conversationId = callManager.conversationId else { return }
        collapseIntoPip()
        Task { await CallConversationOpener.open(conversationId: conversationId) }
    }
}
