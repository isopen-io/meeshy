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
    // Audit P2-iOS-9 — respect the user's Reduce Motion preference; the
    // banner uses a spring for its enter/exit animations; when reduce motion
    // is on, collapse to a simple cross-fade.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

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
                            // HIG 44x44pt minimum tap target (audit 2026-07-03):
                            // the capsule's own padding alone yields a ~32-36pt
                            // hit height, undersized for a ringing banner where a
                            // mis-tap answers/rejects a live incoming call.
                            .frame(minHeight: 44)
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
                            .frame(minHeight: 44)
                            .background(MeeshyColors.success, in: Capsule())
                    }
                    .accessibilityLabel(String(localized: "call.waiting.answer.a11y", defaultValue: "Raccrocher et repondre a \(callerName)", bundle: .main))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .background(.ultraThinMaterial.opacity(0.9))
            .background(Color.black.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .padding(.horizontal, 12)
            .padding(.top, 8)
            // P2-iOS-9 — slide from top when motion is allowed; fade only
            // when reduce motion is on (no translational movement).
            .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
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
        // P2-iOS-9 — skip the spring when reduce motion is on; a bare
        // assignment is effectively an instant cross-fade via SwiftUI's
        // default transition, which honours the system preference.
        if UIAccessibility.isReduceMotionEnabled {
            isVisible = false
        } else {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                isVisible = false
            }
        }
    }

    private func scheduleAutoDismiss() {
        guard autoDismissSeconds > 0 else { return }
        autoDismissTask?.cancel()
        let seconds = autoDismissSeconds
        autoDismissTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(seconds))
            guard !Task.isCancelled else { return }
            // Audit 2026-07-02 — ignoring the banner for `autoDismissSeconds`
            // used to just hide it (isVisible = false) without ever calling
            // `onReject()`, unlike the explicit "Refuser" button. The caller
            // was left ringing indefinitely (no busy signal) until their own
            // client-side timeout or the gateway's 60s ringing timer, and
            // `CallManager.pendingIncomingCall` stayed set with no visible
            // UI to act on it. The timeout must resolve the pending call the
            // same way the reject button does.
            dismiss()
            onReject()
        }
    }
}
