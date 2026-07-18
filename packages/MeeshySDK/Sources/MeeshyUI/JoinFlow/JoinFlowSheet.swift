import SwiftUI
import Combine
import MeeshySDK

public struct JoinFlowSheet: View {
    @StateObject private var viewModel: JoinFlowViewModel
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    let onJoinSuccess: (AnonymousJoinResponse) -> Void

    public init(identifier: String, onJoinSuccess: @escaping (AnonymousJoinResponse) -> Void) {
        self._viewModel = StateObject(wrappedValue: JoinFlowViewModel(identifier: identifier))
        self.onJoinSuccess = onJoinSuccess
    }

    private var isDark: Bool { theme.mode.isDark }

    public var body: some View {
        ZStack {
            background

            VStack(spacing: 0) {
                headerBar

                switch viewModel.phase {
                case .loading:
                    loadingState
                case .preview:
                    if let info = viewModel.linkInfo {
                        JoinLinkPreviewView(linkInfo: info) {
                            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                                viewModel.proceedToForm()
                            }
                        }
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                    }
                case .form:
                    AnonymousJoinFormView(viewModel: viewModel) {
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                            viewModel.phase = .preview
                        }
                    }
                    .transition(.move(edge: .trailing).combined(with: .opacity))
                case .success:
                    successState
                        .transition(.scale.combined(with: .opacity))
                case .error(let message):
                    errorState(message)
                        .transition(.opacity)
                }
            }
        }
        .presentationDragIndicator(.visible)
        .task {
            await viewModel.loadLinkInfo()
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: viewModel.phase == .loading)
    }

    // MARK: - Background

    private var background: some View {
        ZStack {
            theme.backgroundPrimary
                .ignoresSafeArea()

            Circle()
                .fill(MeeshyColors.indigo500.opacity(isDark ? 0.06 : 0.04))
                .frame(width: 300, height: 300)
                .blur(radius: 80)
                .offset(x: -60, y: -120)
                .ignoresSafeArea()

            Circle()
                .fill(MeeshyColors.indigo400.opacity(isDark ? 0.04 : 0.02))
                .frame(width: 200, height: 200)
                .blur(radius: 60)
                .offset(x: 100, y: 80)
                .ignoresSafeArea()
        }
    }

    // MARK: - Header

    private var headerBar: some View {
        HStack {
            Text(String(localized: "joinFlow.header.title", defaultValue: "Rejoindre", bundle: .module))
                .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .bold))
                    .foregroundColor(theme.textMuted)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(theme.textMuted.opacity(0.12)))
            }
            .accessibilityLabel(String(localized: "joinFlow.close.accessibilityLabel", defaultValue: "Fermer", bundle: .module))
            .meeshyTapTarget()
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.top, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.sm)
    }

    // MARK: - Loading

    private var loadingState: some View {
        VStack(spacing: MeeshySpacing.xl) {
            Spacer()

            ProgressView()
                .scaleEffect(1.2)
                .tint(MeeshyColors.indigo400)

            Text(String(localized: "joinFlow.loading.message", defaultValue: "Chargement du lien...", bundle: .module))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
                .foregroundColor(theme.textMuted)

            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Success

    private var successState: some View {
        VStack(spacing: MeeshySpacing.xl) {
            Spacer()

            ZStack {
                Circle()
                    .fill(MeeshyColors.success.opacity(0.15))
                    .frame(width: 100, height: 100)

                Image(systemName: "checkmark.circle.fill")
                    .font(MeeshyFont.relative(56))
                    .foregroundColor(MeeshyColors.success)
            }

            Text(String(localized: "joinFlow.success.title", defaultValue: "Bienvenue !", bundle: .module))
                .font(MeeshyFont.relative(24, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            if let result = viewModel.joinResult {
                Text("Vous avez rejoint \(result.conversation.title ?? "la conversation") en tant que \(result.participant.username)")
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
                    .foregroundColor(theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, MeeshySpacing.xxxl + MeeshySpacing.sm)
            }

            Button {
                if let result = viewModel.joinResult {
                    onJoinSuccess(result)
                }
                dismiss()
            } label: {
                HStack(spacing: MeeshySpacing.sm) {
                    Image(systemName: "bubble.left.and.bubble.right.fill")
                        .font(MeeshyFont.relative(16))
                    Text(String(localized: "joinFlow.success.openConversation", defaultValue: "Ouvrir la conversation", bundle: .module))
                        .font(MeeshyFont.relative(16, weight: .bold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, MeeshySpacing.lg)
                .background(MeeshyColors.brandGradient)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
            }
            .padding(.horizontal, MeeshySpacing.xxxl + MeeshySpacing.sm)
            .padding(.top, MeeshySpacing.md)

            Spacer()
        }
    }

    // MARK: - Error

    private func errorState(_ message: String) -> some View {
        VStack(spacing: MeeshySpacing.xl) {
            Spacer()

            ZStack {
                Circle()
                    .fill(MeeshyColors.error.opacity(0.15))
                    .frame(width: 100, height: 100)

                Image(systemName: "exclamationmark.triangle.fill")
                    .font(MeeshyFont.relative(48))
                    .foregroundColor(MeeshyColors.error)
            }

            Text(String(localized: "joinFlow.error.title", defaultValue: "Lien indisponible", bundle: .module))
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Text(message)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, MeeshySpacing.xxxl + MeeshySpacing.sm)

            Button {
                Task { await viewModel.loadLinkInfo() }
            } label: {
                HStack(spacing: MeeshySpacing.sm) {
                    Image(systemName: "arrow.clockwise")
                    Text(String(localized: "joinFlow.error.retry", defaultValue: "Reessayer", bundle: .module))
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                }
                .foregroundColor(MeeshyColors.indigo400)
                .padding(.horizontal, MeeshySpacing.xxl)
                .padding(.vertical, MeeshySpacing.md)
                .background(
                    Capsule()
                        .strokeBorder(MeeshyColors.indigo400.opacity(0.4), lineWidth: 1.5)
                )
            }
            .padding(.top, MeeshySpacing.sm)

            Button(String(localized: "joinFlow.error.close", defaultValue: "Fermer", bundle: .module)) {
                dismiss()
            }
            .font(MeeshyFont.relative(14, weight: .medium))
            .foregroundColor(theme.textMuted)
            .padding(.top, MeeshySpacing.xs)

            Spacer()
        }
    }
}

// MARK: - Phase Equatable (for animation)

extension JoinFlowViewModel.Phase: Equatable {
    public static func == (lhs: JoinFlowViewModel.Phase, rhs: JoinFlowViewModel.Phase) -> Bool {
        switch (lhs, rhs) {
        case (.loading, .loading): return true
        case (.preview, .preview): return true
        case (.form, .form): return true
        case (.success, .success): return true
        case (.error(let a), .error(let b)): return a == b
        default: return false
        }
    }
}
