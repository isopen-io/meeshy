import SwiftUI

struct CallWaitingBannerView: View {
    let callerName: String
    let onReject: () -> Void
    let onEndAndAnswer: () -> Void

    @State private var isVisible = false
    @State private var autoDismissTask: Task<Void, Never>?

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
        }
    }

    private func dismiss() {
        autoDismissTask?.cancel()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            isVisible = false
        }
    }

    func show() -> CallWaitingBannerView {
        var view = self
        view._isVisible = State(initialValue: true)
        return view
    }
}

extension CallWaitingBannerView {
    init(callerName: String, autoDismissSeconds: TimeInterval = 15, onReject: @escaping () -> Void, onEndAndAnswer: @escaping () -> Void) {
        self.callerName = callerName
        self.onReject = onReject
        self.onEndAndAnswer = onEndAndAnswer
    }
}
