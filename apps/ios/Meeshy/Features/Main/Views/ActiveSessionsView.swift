import SwiftUI
import MeeshySDK
import MeeshyUI

struct ActiveSessionsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var viewModel = ActiveSessionsViewModel()

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                content
            }
        }
        .alert(
            String(localized: "sessions_error_title", defaultValue: "Erreur"),
            isPresented: $viewModel.showError
        ) {
            Button(String(localized: "sessions_error_ok", defaultValue: "OK"), role: .cancel) {}
        } message: {
            Text(viewModel.errorMessage)
        }
        .task { await viewModel.loadSessions() }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .semibold))
                    Text(String(localized: "sessions_back", defaultValue: "Retour"))
                        .font(.system(size: 15, weight: .medium))
                }
                .foregroundColor(MeeshyColors.indigo500)
            }

            Spacer()

            Text(String(localized: "sessions_title", defaultValue: "Sessions actives"))
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Color.clear.frame(width: 60, height: 24)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading {
            Spacer()
            ProgressView()
                .tint(MeeshyColors.indigo500)
            Spacer()
        } else if viewModel.sessions.isEmpty {
            Spacer()
            Text(String(localized: "sessions_empty", defaultValue: "Aucune session active"))
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(theme.textMuted)
            Spacer()
        } else {
            sessionsList
        }
    }

    // MARK: - Sessions List

    private var sessionsList: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 16) {
                ForEach(viewModel.sessions) { session in
                    sessionRow(session)
                }

                if viewModel.sessions.contains(where: { !$0.isCurrent }) {
                    revokeAllButton
                }

                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
    }

    // MARK: - Session Row

    private func sessionRow(_ session: UserSession) -> some View {
        HStack(spacing: 12) {
            Image(systemName: session.isCurrent ? "iphone" : "desktopcomputer")
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(session.isCurrent ? MeeshyColors.success : MeeshyColors.indigo400)
                .frame(width: 32, height: 32)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill((session.isCurrent ? MeeshyColors.success : MeeshyColors.indigo400).opacity(0.12))
                )

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(session.deviceName ?? String(localized: "sessions_unknown_device", defaultValue: "Appareil inconnu"))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(theme.textPrimary)

                    if session.isCurrent {
                        Text(String(localized: "sessions_current_badge", defaultValue: "Actuelle"))
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(MeeshyColors.success))
                    }
                }

                if let ip = session.ipAddress {
                    Text(ip)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundColor(theme.textMuted)
                }

                if let lastActive = session.lastActive {
                    let formatted = lastActive.formatted(.relative(presentation: .named))
                    Text(String(localized: "sessions_last_active", defaultValue: "Actif") + " " + formatted)
                        .font(.system(size: 11, weight: .regular))
                        .foregroundColor(theme.textSecondary)
                }
            }

            Spacer()

            if !session.isCurrent {
                Button {
                    HapticFeedback.medium()
                    Task { await viewModel.revokeSession(sessionId: session.id) }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(MeeshyColors.error.opacity(0.7))
                }
                .accessibilityLabel(String(localized: "sessions_revoke", defaultValue: "Revoquer cette session"))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.surfaceGradient(tint: session.isCurrent ? "34D399" : "6366F1"))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(theme.border(tint: session.isCurrent ? "34D399" : "6366F1"), lineWidth: 1)
                )
        )
    }

    // MARK: - Revoke All Button

    private var revokeAllButton: some View {
        Button {
            HapticFeedback.medium()
            Task { await viewModel.revokeAllOtherSessions() }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "trash")
                    .font(.system(size: 13, weight: .semibold))
                Text(String(localized: "sessions_revoke_all", defaultValue: "Revoquer toutes les autres sessions"))
                    .font(.system(size: 14, weight: .semibold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(MeeshyColors.error)
            )
        }
        .disabled(viewModel.isRevoking)
        .opacity(viewModel.isRevoking ? 0.6 : 1.0)
        .accessibilityLabel(String(localized: "sessions_revoke_all_label", defaultValue: "Revoquer toutes les autres sessions"))
    }
}

// MARK: - ViewModel

@MainActor
final class ActiveSessionsViewModel: ObservableObject {
    @Published var sessions: [UserSession] = []
    @Published var isLoading = false
    @Published var isRevoking = false
    @Published var showError = false
    @Published var errorMessage = ""

    private let sessionService: SessionServiceProviding

    init(sessionService: SessionServiceProviding = SessionService.shared) {
        self.sessionService = sessionService
    }

    func loadSessions() async {
        isLoading = true
        do {
            sessions = try await sessionService.listSessions()
        } catch {
            errorMessage = String(localized: "sessions_load_error", defaultValue: "Impossible de charger les sessions")
            showError = true
        }
        isLoading = false
    }

    func revokeSession(sessionId: String) async {
        isRevoking = true
        do {
            try await sessionService.revokeSession(sessionId: sessionId)
            HapticFeedback.success()
            sessions.removeAll { $0.id == sessionId }
        } catch {
            HapticFeedback.error()
            errorMessage = String(localized: "sessions_revoke_error", defaultValue: "Impossible de revoquer la session")
            showError = true
        }
        isRevoking = false
    }

    func revokeAllOtherSessions() async {
        isRevoking = true
        do {
            try await sessionService.revokeAllOtherSessions()
            HapticFeedback.success()
            sessions.removeAll { !$0.isCurrent }
        } catch {
            HapticFeedback.error()
            errorMessage = String(localized: "sessions_revoke_all_error", defaultValue: "Impossible de revoquer les sessions")
            showError = true
        }
        isRevoking = false
    }
}
