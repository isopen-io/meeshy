import SwiftUI
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
                .fill(Color(hex: "B24BF3").opacity(isDark ? 0.06 : 0.04))
                .frame(width: 300, height: 300)
                .blur(radius: 80)
                .offset(x: -60, y: -120)
                .ignoresSafeArea()

            Circle()
                .fill(Color(hex: "4ECDC4").opacity(isDark ? 0.04 : 0.02))
                .frame(width: 200, height: 200)
                .blur(radius: 60)
                .offset(x: 100, y: 80)
                .ignoresSafeArea()
        }
    }

    // MARK: - Header

    private var headerBar: some View {
        HStack {
            Text("Rejoindre")
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(theme.textMuted)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(theme.textMuted.opacity(0.12)))
            }
            .accessibilityLabel("Fermer")
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 8)
    }

    // MARK: - Loading

    private var loadingState: some View {
        VStack(spacing: 20) {
            Spacer()

            ProgressView()
                .scaleEffect(1.2)
                .tint(Color(hex: "4ECDC4"))

            Text("Chargement du lien...")
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(theme.textMuted)

            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Success

    private var successState: some View {
        VStack(spacing: 20) {
            Spacer()

            ZStack {
                Circle()
                    .fill(Color(hex: "2ECC71").opacity(0.15))
                    .frame(width: 100, height: 100)

                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 56))
                    .foregroundColor(Color(hex: "2ECC71"))
            }

            Text("Bienvenue !")
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            if let result = viewModel.joinResult {
                Text("Vous avez rejoint \(result.conversation.title ?? "la conversation") en tant que \(result.participant.firstName)")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }

            Button {
                if let result = viewModel.joinResult {
                    onJoinSuccess(result)
                }
                dismiss()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "bubble.left.and.bubble.right.fill")
                        .font(.system(size: 16))
                    Text("Ouvrir la conversation")
                        .font(.system(size: 16, weight: .bold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(
                    LinearGradient(
                        colors: [Color(hex: "2ECC71"), Color(hex: "4ECDC4")],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .cornerRadius(16)
            }
            .padding(.horizontal, 40)
            .padding(.top, 12)

            Spacer()
        }
    }

    // MARK: - Error

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 20) {
            Spacer()

            ZStack {
                Circle()
                    .fill(Color(hex: "FF6B6B").opacity(0.15))
                    .frame(width: 100, height: 100)

                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 48))
                    .foregroundColor(Color(hex: "FF6B6B"))
            }

            Text("Lien indisponible")
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Text(message)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Button {
                Task { await viewModel.loadLinkInfo() }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.clockwise")
                    Text("Reessayer")
                        .font(.system(size: 15, weight: .semibold))
                }
                .foregroundColor(Color(hex: "4ECDC4"))
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(
                    Capsule()
                        .strokeBorder(Color(hex: "4ECDC4").opacity(0.4), lineWidth: 1.5)
                )
            }
            .padding(.top, 8)

            Button("Fermer") {
                dismiss()
            }
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(theme.textMuted)
            .padding(.top, 4)

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
