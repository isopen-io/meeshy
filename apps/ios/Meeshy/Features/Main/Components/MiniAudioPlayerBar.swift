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
    @ObservedObject private var coordinator: ConversationAudioCoordinator
    @State private var graceContext: ActiveAudioContext?
    @State private var graceTask: Task<Void, Never>?
    @State private var lastObservedContext: ActiveAudioContext?

    private let onTapBody: () -> Void
    private let routerForTesting: ((String) -> Void)?

    init(coordinatorForTesting: ConversationAudioCoordinator? = nil,
         onTapBody: @escaping () -> Void = {},
         routerForTesting: ((String) -> Void)? = nil) {
        self._coordinator = ObservedObject(
            wrappedValue: coordinatorForTesting ?? .shared
        )
        self.onTapBody = onTapBody
        self.routerForTesting = routerForTesting
    }

    var shouldDisplayForTesting: Bool {
        coordinator.activeContext != nil
    }

    var shouldDisplayDuringGraceForTesting: Bool {
        coordinator.activeContext != nil || graceContext != nil
    }

    var displayedContextForTesting: ActiveAudioContext? {
        coordinator.activeContext ?? graceContext
    }

    private var displayedContext: ActiveAudioContext? {
        coordinator.activeContext ?? graceContext
    }

    var body: some View {
        Group {
            if let context = displayedContext {
                content(for: context)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8),
                   value: coordinator.activeContext)
        .onChange(of: coordinator.activeContext) { newValue in
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
                try? await Task.sleep(nanoseconds: 5_000_000_000)
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
            // Avatar conv (fallback indigo gradient placeholder)
            Circle()
                .fill(LinearGradient(
                    colors: [Color(hex: "6366F1"), Color(hex: "4338CA")],
                    startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 36, height: 36)
                .overlay(
                    Text(String(context.senderName.prefix(1)).uppercased())
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white))

            VStack(alignment: .leading, spacing: 1) {
                Text(context.senderName)
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(1)
                Text(context.conversationName)
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                ProgressView(value: max(0, min(1, coordinator.progress)))
                    .progressViewStyle(.linear)
                    .tint(Color(hex: "6366F1"))
                    .frame(height: 2)
            }

            Spacer(minLength: 4)

            Button(action: { coordinator.togglePlayPause() }) {
                Image(systemName: coordinator.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.primary)
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(coordinator.isPlaying ? "Pause" : "Lecture")

            Button(action: { coordinator.playNext() }) {
                Image(systemName: "forward.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.secondary)
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Suivant")

            Button(action: { coordinator.close() }) {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.secondary)
                    .frame(width: 24, height: 24)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Fermer le lecteur")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
        .clipShape(Capsule())
        .padding(.horizontal, 12)
        .contentShape(Rectangle())
        .onTapGesture {
            if let router = routerForTesting {
                router(context.conversationId)
            } else {
                onTapBody()
            }
        }
    }

    // MARK: - Test helpers
    func simulateTapPlayPauseForTesting() { coordinator.togglePlayPause() }
    func simulateTapNextForTesting() { coordinator.playNext() }
    func simulateTapCloseForTesting() { coordinator.close() }
    func simulateTapBodyForTesting() {
        guard let context = displayedContext else { return }
        if let router = routerForTesting {
            router(context.conversationId)
        } else {
            onTapBody()
        }
    }
}
