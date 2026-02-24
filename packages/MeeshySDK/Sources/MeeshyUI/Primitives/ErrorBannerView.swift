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
        .onChange(of: error?.errorDescription) { _ in
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
                .foregroundColor(.white)

            Text(currentError.errorDescription ?? "")
                .font(.system(size: MeeshyFont.subheadSize, weight: .medium))
                .foregroundColor(.white)
                .lineLimit(2)

            Spacer()

            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: MeeshyFont.footnoteSize, weight: .bold))
                    .foregroundColor(.white.opacity(0.8))
                    .frame(width: 24, height: 24)
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.md)
        .background(
            LinearGradient(
                colors: [
                    MeeshyColors.coral,
                    MeeshyColors.pink
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
        .shadow(
            color: MeeshyColors.coral.opacity(MeeshyShadow.medium.opacity),
            radius: MeeshyShadow.medium.radius,
            y: MeeshyShadow.medium.y
        )
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.xs)
        .onTapGesture {
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
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            guard !Task.isCancelled else { return }
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
