import SwiftUI
import MeeshySDK

public struct ErrorBannerView: View {
    @Binding var error: MeeshyError?
    @Environment(\.theme) private var theme

    @State private var isVisible = false
    @State private var dismissTask: Task<Void, Never>?

    public init(error: Binding<MeeshyError?>) {
        self._error = error
    }

    public var body: some View {
        VStack {
            if isVisible, let currentError = error {
                bannerContent(for: currentError)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
            Spacer()
        }
        .adaptiveOnChange(of: error?.errorDescription) { _, _ in
            guard error != nil else {
                withAnimation(MeeshyAnimation.springDefault) {
                    isVisible = false
                }
                return
            }
            show()
        }
    }

    private func bannerContent(for currentError: MeeshyError) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: currentError.iconName)
                .font(.system(size: MeeshyFont.headlineSize, weight: .semibold))
                .foregroundStyle(Color.white)

            Text(currentError.errorDescription ?? "")
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                .foregroundStyle(Color.white)
                .lineLimit(2)

            Spacer()

            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: MeeshyFont.footnoteSize, weight: .bold))
                    .foregroundColor(.white.opacity(MeeshyOpacity.intense))
                    .meeshyTapTarget()
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.md)
        .background(
            LinearGradient(
                colors: [
                    MeeshyColors.error,
                    MeeshyColors.indigo500
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
        .shadow(
            color: MeeshyColors.error.opacity(MeeshyShadow.medium.opacity),
            radius: MeeshyShadow.medium.radius,
            y: MeeshyShadow.medium.y
        )
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.xs)
        .onTapGesture {
            dismiss()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(currentError.errorDescription ?? "")
        .accessibilityAddTraits(.isButton)
        .accessibilityHint(ErrorBannerView.dismissHint(in: .module))
        .accessibilityAction {
            dismiss()
        }
    }

    private func show() {
        dismissTask?.cancel()
        withAnimation(MeeshyAnimation.springDefault) {
            isVisible = true
        }
        HapticFeedback.error()
        dismissTask = Task { @MainActor in
            guard await cancellableSleep(for: .seconds(4)) else { return }
            dismiss()
        }
    }

    private func dismiss() {
        dismissTask?.cancel()
        withAnimation(MeeshyAnimation.springDefault) {
            isVisible = false
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            error = nil
        }
    }
}

extension ErrorBannerView {
    static func dismissHint(in bundle: Bundle) -> String {
        String(localized: "error.banner.dismiss.hint", defaultValue: "Ferme ce message d'erreur.", bundle: bundle)
    }
}
