import SwiftUI
import MeeshySDK
import MeeshyUI

/// Habillage du mini-lecteur : **aplat indigo, angles droits, pleine largeur**.
///
/// Le bandeau ne flotte pas — il occupe une bande du `VStack` de compression de
/// `RootView`, au même titre que la bannière d'appel. Un aplat de marque opaque
/// dit exactement cela ; la capsule Liquid Glass qu'il portait jusqu'au
/// 2026-08-13 promettait au contraire un objet flottant, et empruntait sa
/// couleur au contenu qui défilait derrière.
///
/// Le fond étant désormais un indigo soutenu dans les DEUX thèmes, les contenus
/// ne peuvent plus s'en remettre à `.primary`/`.secondary` : ils vireraient au
/// noir en thème clair. Les deux tokens ci-dessous sont donc la seule source de
/// couleur de texte et d'icône de la barre.
enum MiniAudioPlayerBarStyle {
    static var background: Color { MeeshyColors.indigo600 }
    static var primaryForeground: Color { .white }
    static var secondaryForeground: Color { Color.white.opacity(0.72) }
}

/// Mini-player flottant qui suit le `ConversationAudioCoordinator.shared`.
///
/// Visibilité contrôlée par `coordinator.activeContext`. Pendant 5s après la fin de
/// queue (`activeContext` → nil), conserve une copie du contexte (`graceContext`)
/// pour animer un fade-out propre au lieu de disparaître instantanément.
///
/// Pure orchestration UX produit — kept app-side per SDK purity rule.
///
/// Habillage : aplat indigo bord à bord, angles droits — voir
/// `MiniAudioPlayerBarStyle`.
struct MiniAudioPlayerBar: View {
    /// Named magic numbers for the mini-player's grace-fade lifecycle.
    private enum Constants {
        /// Window during which the bar keeps showing the last-played context
        /// after `activeContext` flips to nil. Allows a clean fade-out
        /// animation rather than an instant pop.
        static let graceDurationSeconds: TimeInterval = 5.0
        static let graceDurationNanos: UInt64 = UInt64(graceDurationSeconds * 1_000_000_000)
    }

    @ObservedObject private var coordinator: ConversationAudioCoordinator
    @State private var graceContext: ActiveAudioContext?
    @State private var graceTask: Task<Void, Never>?
    @State private var lastObservedContext: ActiveAudioContext?

    private let onTapBody: () -> Void
    private let routerForTesting: ((String) -> Void)?
    /// When non-nil and the returned conversation id matches the
    /// currently-playing audio's `conversationId`, the mini-player hides
    /// itself. The bubble in the active conversation already exposes the
    /// same controls, so overlapping the bar on top is redundant. Read as
    /// a closure (not a value) so callers can wire the live `Router.path`
    /// without forcing the parent to observe the coordinator at 20 Hz —
    /// the closure is re-invoked on each body eval, which already runs
    /// when `coordinator.activeContext` changes.
    private let currentConversationId: () -> String?

    init(coordinatorForTesting: ConversationAudioCoordinator? = nil,
         onTapBody: @escaping () -> Void = {},
         currentConversationId: @escaping () -> String? = { nil },
         routerForTesting: ((String) -> Void)? = nil) {
        self._coordinator = ObservedObject(
            wrappedValue: coordinatorForTesting ?? .shared
        )
        self.onTapBody = onTapBody
        self.currentConversationId = currentConversationId
        self.routerForTesting = routerForTesting
    }

    var shouldDisplayForTesting: Bool {
        displayedContext != nil
    }

    var shouldDisplayDuringGraceForTesting: Bool {
        displayedContext != nil || graceContext != nil
    }

    var displayedContextForTesting: ActiveAudioContext? {
        displayedContext
    }

    /// `true` when the user is currently inside the same conversation
    /// driving the playback. The mini-player MUST hide in this case — the
    /// audio bubble in the conversation is the single source of UI truth.
    private var isInsidePlayingConversation: Bool {
        // Use the grace context as a fallback when the queue just finished
        // (`activeContext` → nil during the ~5s grace window). Otherwise the bar
        // fades in INSIDE the source conversation during the grace window,
        // overlapping the in-conversation audio bubble it must defer to.
        guard let active = coordinator.activeContext ?? graceContext,
              let currentId = currentConversationId() else { return false }
        return active.conversationId == currentId
    }

    private var displayedContext: ActiveAudioContext? {
        if isInsidePlayingConversation { return nil }
        return coordinator.activeContext ?? graceContext
    }

    var body: some View {
        Group {
            if let context = displayedContext {
                content(for: context)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        // Animate on the *displayed* context so the bar fades in/out when
        // the user enters/leaves the playing conversation, not only when
        // the coordinator itself swaps the active audio.
        .animation(.spring(response: 0.4, dampingFraction: 0.8),
                   value: displayedContext)
        .adaptiveOnChange(of: coordinator.activeContext) { _, newValue in
            handleContextChange(newValue)
        }
        .onAppear {
            lastObservedContext = coordinator.activeContext
        }
    }

    private func handleContextChange(_ newValue: ActiveAudioContext?) {
        if newValue == nil {
            // Fin de queue : capture le dernier contexte pour le fade.
            graceContext = lastObservedContext
            graceTask?.cancel()
            graceTask = Task { @MainActor in
                try? await Task.sleep(nanoseconds: Constants.graceDurationNanos)
                if !Task.isCancelled { graceContext = nil }
            }
        } else {
            graceContext = nil
            graceTask?.cancel()
            graceTask = nil
        }
        lastObservedContext = newValue
    }

    @ViewBuilder
    private func content(for context: ActiveAudioContext) -> some View {
        HStack(spacing: 10) {
            // Now-playing cluster (avatar + track meta + progress). Tapping it
            // opens the source conversation — so VoiceOver exposes it as a single
            // button rather than as disconnected monogram / name / percent
            // fragments, and the whole-card tap action stays reachable non-visually.
            HStack(spacing: 10) {
                // Avatar conv. Le fond de la barre étant lui-même indigo
                // plein, le placeholder ne peut plus être un dégradé indigo —
                // il s'y fondrait. Voile blanc translucide : il se détache du
                // fond quelle que soit la nuance choisie pour la barre.
                Circle()
                    .fill(Color.white.opacity(0.22))
                    .frame(width: 36, height: 36)
                    .overlay(
                        Text(String(context.senderName.prefix(1)).uppercased())
                            .font(.footnote.weight(.bold))
                            .foregroundColor(.white))

                VStack(alignment: .leading, spacing: 1) {
                    Text(context.senderName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(MiniAudioPlayerBarStyle.primaryForeground)
                        .lineLimit(1)
                    Text(context.conversationName)
                        .font(.caption2)
                        .foregroundColor(MiniAudioPlayerBarStyle.secondaryForeground)
                        .lineLimit(1)
                    ProgressView(value: max(0, min(1, coordinator.progress)))
                        .progressViewStyle(.linear)
                        .tint(MiniAudioPlayerBarStyle.primaryForeground)
                        .frame(height: 2)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(nowPlayingAccessibilityLabel(for: context))
            .accessibilityValue(progressAccessibilityValue)
            .accessibilityHint(openConversationAccessibilityHint)
            .accessibilityAddTraits(.isButton)
            .accessibilityAddTraits(coordinator.isPlaying ? .updatesFrequently : [])
            .accessibilityAction { openConversation(for: context) }

            Spacer(minLength: 4)

            // Transport controls. `.buttonStyle(.plain)` adds no padding of its
            // own, so each label's frame IS its tappable region — hence the
            // 44×44 floor (Apple HIG), matching the floating call pill this bar
            // mirrors. The glyphs stay font-sized; only the hit area grew.
            //
            // spacing: 0 because the 44 pt boxes already separate the glyphs: a
            // ~14 pt symbol centred in 44 pt leaves ~15 pt each side, so the gap
            // reads as it did with the old 10 pt spacing around smaller frames.
            // Keeping both would cost the single-line, truncating track title
            // another 20 pt of width for no visual gain.
            HStack(spacing: 0) {
                Button(action: { coordinator.togglePlayPause() }) {
                    Image(systemName: coordinator.isPlaying ? "pause.fill" : "play.fill")
                        .font(.body.weight(.bold))
                        .foregroundColor(MiniAudioPlayerBarStyle.primaryForeground)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(
                    coordinator.isPlaying
                        ? String(localized: "mini_player.pause", defaultValue: "Mettre en pause", bundle: .main)
                        : String(localized: "mini_player.play", defaultValue: "Lecture", bundle: .main)
                )

                Button(action: { coordinator.playNext() }) {
                    Image(systemName: "forward.fill")
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(MiniAudioPlayerBarStyle.secondaryForeground)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "mini_player.next", defaultValue: "Suivant", bundle: .main))

                Button(action: { coordinator.close() }) {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.bold))
                        .foregroundColor(MiniAudioPlayerBarStyle.secondaryForeground)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "mini_player.close", defaultValue: "Fermer le lecteur", bundle: .main))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        // Bandeau INDIGO PLEIN, à angles droits, pleine largeur (retour user
        // 2026-08-13). La capsule glass d'avant flottait au-dessus du contenu
        // et empruntait sa couleur au fond : à ce point de montage — le bloc
        // vit DANS le VStack de compression de `RootView`, il pousse l'écran
        // vers le bas au lieu de le recouvrir — une pastille flottante ment
        // sur ce qu'elle est. Un aplat de marque, bord à bord, se lit comme la
        // bande d'état qu'il est réellement.
        .frame(maxWidth: .infinity)
        .background(MiniAudioPlayerBarStyle.background)
        // Petit espace vertical : que ce bloc soit le tout premier élément
        // du VStack de compression (pas d'appel actif — respire depuis la
        // safe area) ou qu'il suive `FloatingCallPillView` (appel actif —
        // respire depuis la bannière pleine largeur), il ne doit jamais
        // coller au bord. Vit DANS `content(for:)`, jamais sur le composant
        // entier au point de montage, pour ne créer aucune empreinte quand
        // `displayedContext == nil` (cf. doc du VStack dans RootView.swift).
        .padding(.top, 6)
        .contentShape(Rectangle())
        .onTapGesture { openConversation(for: context) }
    }

    /// Opens the conversation driving the active audio. Wired to BOTH the
    /// whole-card tap gesture and the VoiceOver activation of the now-playing
    /// cluster, so the sighted and non-visual paths share one implementation.
    private func openConversation(for context: ActiveAudioContext) {
        if let router = routerForTesting {
            router(context.conversationId)
        } else {
            onTapBody()
        }
    }

    private func nowPlayingAccessibilityLabel(for context: ActiveAudioContext) -> String {
        String(
            localized: "mini_player.a11y.now-playing",
            defaultValue: "Lecture audio de \(context.senderName), \(context.conversationName)",
            bundle: .main
        )
    }

    private var progressAccessibilityValue: String {
        max(0, min(1, coordinator.progress))
            .formatted(.percent.precision(.fractionLength(0)))
    }

    private var openConversationAccessibilityHint: String {
        String(
            localized: "mini_player.a11y.open-hint",
            defaultValue: "Ouvrir la conversation",
            bundle: .main
        )
    }

    // MARK: - Test helpers
    func simulateTapPlayPauseForTesting() { coordinator.togglePlayPause() }
    func simulateTapNextForTesting() { coordinator.playNext() }
    func simulateTapCloseForTesting() { coordinator.close() }
    func simulateTapBodyForTesting() {
        guard let context = displayedContext else { return }
        openConversation(for: context)
    }
}
