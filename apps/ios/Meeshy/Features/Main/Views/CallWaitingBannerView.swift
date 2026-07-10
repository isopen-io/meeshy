import SwiftUI
import UIKit

struct CallWaitingBannerView: View {
    // Audit P2-iOS-11 — refactored from a `show()`-returning-a-new-View
    // pattern (which mutated `@State` storage on a struct copy — fragile and
    // not officially supported) to a parent-driven `@Binding isVisible`.
    // The auto-dismiss Task is now actually scheduled (the previous
    // `autoDismissSeconds` init parameter was accepted but never consumed).
    let callerName: String
    let autoDismissSeconds: TimeInterval
    let onReject: () -> Void
    let onEndAndAnswer: () -> Void

    @Binding var isVisible: Bool
    @State private var autoDismissTask: Task<Void, Never>?

    init(
        callerName: String,
        autoDismissSeconds: TimeInterval = 15,
        isVisible: Binding<Bool>,
        onReject: @escaping () -> Void,
        onEndAndAnswer: @escaping () -> Void
    ) {
        self.callerName = callerName
        self.autoDismissSeconds = autoDismissSeconds
        self._isVisible = isVisible
        self.onReject = onReject
        self.onEndAndAnswer = onEndAndAnswer
    }

    var body: some View {
        if isVisible {
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    Image(systemName: "phone.fill")
                        .font(.title3)
                        .foregroundStyle(.white)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(callerName)
                            .font(.headline)
                            .foregroundStyle(.white)
                        Text(String(localized: "call.waiting.incoming", defaultValue: "Appel entrant...", bundle: .main))
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.8))
                    }

                    Spacer()

                    Button(action: {
                        dismiss()
                        onReject()
                    }) {
                        Text(String(localized: "call.waiting.reject", defaultValue: "Refuser", bundle: .main))
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(MeeshyColors.error, in: Capsule())
                    }
                    .accessibilityLabel(String(localized: "call.waiting.reject.a11y", defaultValue: "Refuser l'appel de \(callerName)", bundle: .main))

                    Button(action: {
                        dismiss()
                        onEndAndAnswer()
                    }) {
                        Text(String(localized: "call.waiting.answer", defaultValue: "Répondre", bundle: .main))
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(MeeshyColors.success, in: Capsule())
                    }
                    .accessibilityLabel(String(localized: "call.waiting.answer.a11y", defaultValue: "Raccrocher et repondre a \(callerName)", bundle: .main))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .background(.ultraThinMaterial.opacity(0.9))
            .background(Color.black.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .transition(.move(edge: .top).combined(with: .opacity))
            .accessibilityElement(children: .contain)
            .accessibilityLabel(String(localized: "call.waiting.banner.a11y", defaultValue: "Appel entrant de \(callerName)", bundle: .main))
            .onAppear {
                scheduleAutoDismiss()
                UIAccessibility.post(
                    notification: .announcement,
                    argument: String(localized: "call.waiting.banner.a11y", defaultValue: "Appel entrant de \(callerName)", bundle: .main)
                )
            }
            .onDisappear {
                autoDismissTask?.cancel()
                autoDismissTask = nil
            }
            // Bannière blanc-sur-verre : on épingle le verre en sombre pour
            // rester lisible en mode Light (sinon .ultraThinMaterial vire au
            // clair et le texte blanc devient illisible).
            .environment(\.colorScheme, .dark)
        }
    }

    private func dismiss() {
        autoDismissTask?.cancel()
        autoDismissTask = nil
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            isVisible = false
        }
    }

    private func scheduleAutoDismiss() {
        guard autoDismissSeconds > 0 else { return }
        autoDismissTask?.cancel()
        let seconds = autoDismissSeconds
        autoDismissTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(seconds))
            guard !Task.isCancelled else { return }
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                isVisible = false
            }
        }
    }
}
