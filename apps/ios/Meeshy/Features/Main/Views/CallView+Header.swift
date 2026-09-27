import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI
import os

// Le chrome du haut de l'écran d'appel : Réduire, Conversation, et le
// passage vers la conversation pendant l'appel. Sorti de `CallView.swift`
// (hors budget de taille, #8276).

extension CallView {
    // MARK: - Top Chrome

    /// Minimize-to-PiP affordance + ouverture de la conversation.
    var topChrome: some View {
        VStack {
            HStack {
                Button {
                    collapseIntoPip()
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
                .accessibilityLabel(String(localized: "call.minimize", defaultValue: "Réduire l'appel", bundle: .main))
                .accessibilityHint(String(localized: "call.minimize.hint", defaultValue: "Garde l'appel en cours dans une bannière flottante", bundle: .main))

                // Ouvrir la conversation (DM) de l'interlocuteur tout en
                // gardant l'appel actif (minimisé en pilule). Masqué quand
                // la conversationId est inconnue (ex: appel entrant réveillé
                // par un push VoIP sans conversationId dans le payload).
                if callManager.conversationId != nil {
                    Button {
                        openConversationDuringCall()
                    } label: {
                        Image(systemName: "bubble.left.and.bubble.right.fill")
                            // Doctrine 82i : glyphe de chrome dans un cadre
                            // glass fixe (diameter 40) → taille figée.
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(.white)
                            .callControlGlass(diameter: 40, isActive: false, tint: .white)
                            // Cercle glass 40pt (doctrine 82i) mais cible
                            // tactile HIG 44×44.
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .padding(.leading, 8)
                    .accessibilityLabel(String(localized: "call.openConversation", defaultValue: "Conversation", bundle: .main))
                    .accessibilityHint(String(localized: "call.openConversation.hint", defaultValue: "Ouvre la conversation en gardant l'appel actif", bundle: .main))
                }
                Spacer()
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.top, Self.chromeTopInset)
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
            try? await Task.sleep(nanoseconds: 300_000_000)
            var swap = Transaction()
            swap.disablesAnimations = true
            withTransaction(swap) {
                callManager.displayMode = .pip
            }
            pipMorphProgress = 0
        }
    }

    func openConversationDuringCall() {
        guard let conversationId = callManager.conversationId else { return }
        collapseIntoPip()
        Task { await resolveAndOpenConversation(conversationId: conversationId) }
    }

    /// Résout la conversation cache-first (Instant App : la conversation de
    /// l'appel est quasi toujours déjà dans la liste en cache → navigation
    /// immédiate), avec repli réseau — le socket d'appel étant vivant, le repli
    /// `getById` aboutit. La `Conversation` résolue est postée sur le canal
    /// `.navigateToConversation` que RootView/iPadRootView routent vers le DM.
    func resolveAndOpenConversation(conversationId: String) async {
        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        switch await CacheCoordinator.shared.conversations.load(for: "list") {
        case .fresh(let list, _), .stale(let list, _):
            if let conv = list.first(where: { $0.id == conversationId }) {
                NotificationCenter.default.post(name: .navigateToConversation, object: conv)
                return
            }
        case .expired, .empty:
            break
        }
        do {
            let apiConv = try await ConversationService.shared.getById(conversationId)
            let conv = apiConv.toConversation(currentUserId: currentUserId)
            NotificationCenter.default.post(name: .navigateToConversation, object: conv)
        } catch {
            Logger.calls.warning("CallView: conversation d'appel non résolue (\(conversationId)): \(error.localizedDescription)")
        }
    }
}

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
