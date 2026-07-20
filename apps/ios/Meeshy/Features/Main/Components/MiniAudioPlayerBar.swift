import SwiftUI
import MeeshySDK
import MeeshyUI

/// Mini-player flottant qui suit le `ConversationAudioCoordinator.shared`.
///
/// Visibilité contrôlée par `coordinator.activeContext`. Pendant 5s après la fin de
/// queue (`activeContext` → nil), conserve une copie du contexte (`graceContext`)
/// pour animer un fade-out propre au lieu de disparaître instantanément.
///
/// Pure orchestration UX produit — kept app-side per SDK purity rule.
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
                // Avatar conv (fallback indigo gradient placeholder)
                Circle()
                    .fill(LinearGradient(
                        colors: [MeeshyColors.indigo500, MeeshyColors.indigo700],
                        startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 36, height: 36)
                    .overlay(
                        Text(String(context.senderName.prefix(1)).uppercased())
                            .font(.footnote.weight(.bold))
                            .foregroundColor(.white))

                VStack(alignment: .leading, spacing: 1) {
                    Text(context.senderName)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text(context.conversationName)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                    ProgressView(value: max(0, min(1, coordinator.progress)))
                        .progressViewStyle(.linear)
                        .tint(MeeshyColors.indigo500)
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

            Button(action: { coordinator.togglePlayPause() }) {
                Image(systemName: coordinator.isPlaying ? "pause.fill" : "play.fill")
                    .font(.body.weight(.bold))
                    .foregroundColor(.primary)
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                coordinator.isPlaying
                    ? String(localized: "mini_player.pause", defaultValue: "Pause", bundle: .main)
                    : String(localized: "mini_player.play", defaultValue: "Lecture", bundle: .main)
            )

            Button(action: { coordinator.playNext() }) {
                Image(systemName: "forward.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.secondary)
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "mini_player.next", defaultValue: "Suivant", bundle: .main))

            Button(action: { coordinator.close() }) {
                Image(systemName: "xmark")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.secondary)
                    .frame(width: 24, height: 24)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "mini_player.close", defaultValue: "Fermer le lecteur", bundle: .main))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        // iOS 26 Liquid Glass capsule — the SDK Compatibility wrapper owns the
        // gating + the `.ultraThinMaterial` fallback. Inner controls stay as
        // vibrancy fills ON the glass (Apple HIG: don't nest glass in glass).
        // Same atom + pattern as the floating call pill.
        .adaptiveGlass(in: Capsule())
        .clipShape(Capsule())
        .padding(.horizontal, 12)
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
