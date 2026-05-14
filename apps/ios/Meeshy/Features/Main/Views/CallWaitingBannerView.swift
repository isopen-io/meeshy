import SwiftUI

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
                        Text("Appel entrant...")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.8))
                    }

                    Spacer()

                    Button(action: {
                        dismiss()
                        onReject()
                    }) {
                        Text("Refuser")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(.red, in: Capsule())
                    }
                    .accessibilityLabel("Refuser l'appel de \(callerName)")

                    Button(action: {
                        dismiss()
                        onEndAndAnswer()
                    }) {
                        Text("Repondre")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(.green, in: Capsule())
                    }
                    .accessibilityLabel("Raccrocher et repondre a \(callerName)")
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .background(.ultraThinMaterial.opacity(0.9))
            .background(Color.black.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .transition(.move(edge: .top).combined(with: .opacity))
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Appel entrant de \(callerName)")
            .onAppear {
                scheduleAutoDismiss()
            }
            .onDisappear {
                autoDismissTask?.cancel()
                autoDismissTask = nil
            }
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
