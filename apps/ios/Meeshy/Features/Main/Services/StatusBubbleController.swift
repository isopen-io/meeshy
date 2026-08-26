import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

// MARK: - Status Bubble Controller

@MainActor
final class StatusBubbleController: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = StatusBubbleController()
    private init() {}

    @Published var currentEntry: StatusEntry?
    @Published var anchor: CGPoint = .zero
    /// Mood en attente de confirmation de réponse (groupe / story tray / ailleurs).
    /// Non-nil ⇒ le pop-up "Répondre / Quitter" est présenté.
    @Published var replyConfirmationEntry: StatusEntry?

    var onRepublish: ((StatusEntry) -> Void)?
    /// Action de réponse à un mood : résout/ouvre la DM avec l'auteur et amorce
    /// le composer. Branchée une fois au niveau racine (RootView / iPadRootView).
    var onConfirmedReply: ((StatusEntry) -> Void)?

    /// Vrai quand le mood courant est affiché DANS la conversation directe de son
    /// auteur (barre de conversation directe). La réponse est alors immédiate
    /// (pas de pop-up) : on est déjà dans la bonne conversation. Posé par le site
    /// d'appel à `show(...)`, jamais stale (chaque ouverture le réécrit).
    var repliesInline = false

    func show(entry: StatusEntry, anchor: CGPoint, repliesInline: Bool = false) {
        currentEntry = entry
        self.anchor = anchor
        self.repliesInline = repliesInline

        // Statut consommé : enregistrer la vue côté serveur (sauf le sien) pour
        // que la notification « X a publié un statut » (friend_new_mood) ne reste
        // pas non lue. Le gateway marque alors les notifications liées à ce post
        // et ré-émet `notification:counts`. Fire-and-forget.
        guard entry.userId != AuthManager.shared.currentUser?.id else { return }
        let statusId = entry.id
        Task {
            do {
                try await PostService.shared.viewPost(postId: statusId)
            } catch {
                // Compteur de vue perdu — sans impact sur l'affichage.
                Logger.statusBubble.error("Status view not registered: \(error.localizedDescription, privacy: .public)")
            }
        }
        EngagementTracker.shared.begin(postId: statusId, contentType: .status, surface: .statusBubble)
    }

    func dismiss() {
        currentEntry = nil
        Task { await EngagementTracker.shared.end(surface: .statusBubble) }
    }

    /// Déclenché quand l'utilisateur touche le CONTENU du mood affiché (pas la
    /// zone extérieure de fermeture). Ouvre la réponse au mood :
    /// - mood affiché dans la conversation directe courante ⇒ réponse immédiate ;
    /// - sinon (groupe, story tray, …) ⇒ pop-up de confirmation Répondre / Quitter.
    func requestReply() {
        guard let entry = currentEntry else { return }
        currentEntry = nil
        EngagementTracker.shared.recordAction(.commented, surface: .statusBubble)
        Task { await EngagementTracker.shared.end(surface: .statusBubble) }
        // On ne répond pas à son propre mood.
        guard entry.userId != AuthManager.shared.currentUser?.id else { return }

        if repliesInline {
            onConfirmedReply?(entry)
        } else {
            replyConfirmationEntry = entry
        }
    }

    var isPresented: Binding<Bool> {
        Binding(
            get: { self.currentEntry != nil },
            set: { newValue in
                if !newValue {
                    self.currentEntry = nil
                    Task { await EngagementTracker.shared.end(surface: .statusBubble) }
                }
            }
        )
    }
}

// MARK: - View Modifier

struct StatusBubbleOverlayModifier: ViewModifier {
    // `StatusBubbleController` is a `.shared` singleton, so reference it
    // directly instead of via `@EnvironmentObject`. The environment-object
    // form is fatal ("No ObservableObject of type … found") whenever
    // `.withStatusBubble()` is evaluated outside the injected ancestor chain —
    // notably inside a sheet's `PresentationHostingController`, which does NOT
    // inherit the presenter's `.environmentObject(...)`. Several sheets apply
    // `.withStatusBubble()` (ConversationInfoSheet, ForwardPickerSheet,
    // FeedCommentsSheet, …) without re-injecting, which crashed on present.
    @StateObject private var controller = StatusBubbleController.shared

    /// Présentation dans laquelle un hôte ancêtre rend déjà la bulle, `nil`
    /// si aucun. Cf. `shouldRenderOverlay`.
    @Environment(\.statusBubbleHostPresentation) private var hostPresentation
    @Environment(\.isPresented) private var isPresented

    /// Un SEUL overlay doit être rendu par présentation.
    ///
    /// Ce mécanisme ne déduplique qu'entre ANCÊTRE et DESCENDANT (l'environment
    /// ne se propage qu'aux enfants) — il est AVEUGLE aux hôtes FRÈRES. D'où la
    /// règle de placement (gardée par `StatusBubbleHostPlacementTests`) : un
    /// hôte non modal UNIQUE par fenêtre (`RootView`, `iPadRootView`) ; seules
    /// les présentations modales (sheet / fullScreenCover) posent le leur.
    /// Poser le modificateur sur des vues sœurs (une carte de feed, une colonne
    /// iPad, un écran poussé) rendait une bulle PAR hôte, chacune convertissant
    /// l'ancre globale dans son propre repère (bulles dupliquées et flottantes,
    /// bug 2026-07-30).
    ///
    /// La frontière est la PRÉSENTATION, pas la hiérarchie de vues : une
    /// `.sheet` a son propre `PresentationHostingController` et l'overlay du
    /// présentateur y est invisible — elle doit donc rendre le sien. Les
    /// `EnvironmentValues` traversent les feuilles (contrairement aux
    /// `EnvironmentObject`), d'où la comparaison avec `isPresented` plutôt
    /// qu'un simple drapeau booléen, qui aurait privé les feuilles de bulle.
    nonisolated static func shouldRenderOverlay(hostPresentation: Bool?, isPresented: Bool) -> Bool {
        hostPresentation != isPresented
    }

    func body(content: Content) -> some View {
        let rendersOverlay = Self.shouldRenderOverlay(
            hostPresentation: hostPresentation, isPresented: isPresented
        )
        return ZStack {
            content
                .environment(\.statusBubbleHostPresentation, rendersOverlay ? isPresented : hostPresentation)
            if rendersOverlay, let entry = controller.currentEntry {
                StatusBubbleOverlay(
                    status: entry,
                    anchorPoint: controller.anchor,
                    isPresented: controller.isPresented,
                    onRepublish: entry.userId != AuthManager.shared.currentUser?.id
                        ? controller.onRepublish
                        : nil,
                    onReplyTapped: entry.userId != AuthManager.shared.currentUser?.id
                        ? { controller.requestReply() }
                        : nil
                )
                .zIndex(200)
            }
            // Pop-up de confirmation (groupe / story tray / ailleurs). Rendu en
            // overlay ZStack — et NON via `.confirmationDialog` système — parce que
            // `.withStatusBubble()` est appliqué sur ~15 écrans potentiellement
            // co-présents : une présentation modale UIKit partagée déclencherait des
            // conflits « already presenting ». Comme la bulle, il n'y en a qu'un
            // seul par présentation — cf. `shouldRenderOverlay`.
            if rendersOverlay, let entry = controller.replyConfirmationEntry {
                MoodReplyConfirmationOverlay(
                    entry: entry,
                    onReply: {
                        controller.onConfirmedReply?(entry)
                        controller.replyConfirmationEntry = nil
                    },
                    onCancel: { controller.replyConfirmationEntry = nil }
                )
                .zIndex(201)
            }
        }
    }
}

// MARK: - Mood Reply Confirmation Overlay

/// Pop-up « Répondre à cette humeur ? » présenté quand un mood est touché hors de
/// la conversation directe de son auteur (groupe, story tray, liste…). Affiche le
/// mood entier (emoji + contenu + date) et propose Répondre / Quitter.
private struct MoodReplyConfirmationOverlay: View {
    let entry: StatusEntry
    let onReply: () -> Void
    let onCancel: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemeManager { ThemeManager.shared }
    @State private var appear = false

    private var moodSummary: String {
        let date = RelativeTimeFormatter.shortString(for: entry.createdAt)
        let content = entry.content.flatMap { $0.isEmpty ? nil : " \($0)" } ?? ""
        return "\(entry.moodEmoji)\(content) \u{00B7} \(date)"
    }

    var body: some View {
        ZStack {
            Color.black.opacity(appear ? 0.35 : 0)
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { onCancel() }

            VStack(spacing: 14) {
                Text(String(localized: "mood.reply.confirm.title", defaultValue: "Répondre à cette humeur ?", bundle: .main))
                    .font(MeeshyFont.relative(16, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .multilineTextAlignment(.center)

                Text(moodSummary)
                    .font(MeeshyFont.relative(14))
                    .foregroundColor(theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)

                HStack(spacing: 10) {
                    Button(action: onCancel) {
                        Text(String(localized: "mood.reply.confirm.cancel", defaultValue: "Quitter", bundle: .main))
                            .font(MeeshyFont.relative(15, weight: .medium))
                            .foregroundColor(theme.textSecondary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 11)
                            .background(
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(colorScheme == .dark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))
                            )
                    }

                    Button(action: onReply) {
                        Text(String(localized: "mood.reply.confirm.reply", defaultValue: "Répondre", bundle: .main))
                            .font(MeeshyFont.relative(15, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 11)
                            .background(
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(MeeshyColors.brandGradient)
                            )
                    }
                }
            }
            .padding(20)
            .frame(maxWidth: 320)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .stroke(theme.border(tint: "6366F1", intensity: 0.3), lineWidth: 1)
                    )
                    .shadow(color: Color.black.opacity(0.18), radius: 24, y: 8)
            )
            .padding(.horizontal, 32)
            .scaleEffect(appear ? 1 : 0.9)
            .opacity(appear ? 1 : 0)
        }
        .onAppear {
            withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) { appear = true }
        }
        .accessibilityElement(children: .contain)
    }
}

// MARK: - Portée de l'hôte de bulle

/// Présentation dans laquelle un hôte `.withStatusBubble()` rend déjà la bulle.
/// `nil` = aucun hôte au-dessus dans cette présentation.
private struct StatusBubbleHostPresentationKey: EnvironmentKey {
    static let defaultValue: Bool? = nil
}

extension EnvironmentValues {
    var statusBubbleHostPresentation: Bool? {
        get { self[StatusBubbleHostPresentationKey.self] }
        set { self[StatusBubbleHostPresentationKey.self] = newValue }
    }
}

extension View {
    /// Idempotent : appliqué plusieurs fois dans une même présentation, seul
    /// l'hôte le plus EXTERNE rend l'overlay. Poser ce modificateur sur une vue
    /// déjà couverte est donc sans effet plutôt que source d'un doublon.
    func withStatusBubble() -> some View {
        modifier(StatusBubbleOverlayModifier())
    }
}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let statusBubble = Logger(subsystem: "me.meeshy.app", category: "status-bubble")
}
