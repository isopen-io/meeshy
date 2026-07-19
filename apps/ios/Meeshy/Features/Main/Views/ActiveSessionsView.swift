import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct ActiveSessionsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
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
                        .font(MeeshyFont.relative(14, weight: .semibold))
                    Text(String(localized: "sessions_back", defaultValue: "Retour"))
                        .font(MeeshyFont.relative(15, weight: .medium))
                }
                .foregroundColor(MeeshyColors.indigo500)
            }

            Spacer()

            Text(String(localized: "sessions_title", defaultValue: "Sessions actives"))
                .font(MeeshyFont.relative(17, weight: .bold))
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
                .font(MeeshyFont.relative(15, weight: .medium))
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
            HStack(spacing: 12) {
                // 82i-style: glyph borné par le badge fixe 32×32 → figé (pas de scale Dynamic Type).
                // Le type d'appareil est porté par le libellé VoiceOver composé de la rangée, pas par
                // cette icône (rangée en `children: .ignore`) → info jamais portée par icône/couleur seule.
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
                            .font(MeeshyFont.relative(14, weight: .semibold))
                            .foregroundColor(theme.textPrimary)

                        if session.isCurrent {
                            Text(String(localized: "sessions_current_badge", defaultValue: "Actuelle"))
                                .font(MeeshyFont.relative(10, weight: .bold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Capsule().fill(MeeshyColors.success))
                        }
                    }

                    if let ip = session.ipAddress {
                        Text(ip)
                            .font(MeeshyFont.relative(12, weight: .regular))
                            .foregroundColor(theme.textMuted)
                    }

                    if let lastActive = session.lastActive {
                        let formatted = lastActive.formatted(.relative(presentation: .named))
                        Text(String(localized: "sessions_last_active", defaultValue: "Actif") + " " + formatted)
                            .font(MeeshyFont.relative(11, weight: .regular))
                            .foregroundColor(theme.textSecondary)
                    }
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(sessionRowAccessibilityLabel(session))

            Spacer()

            if !session.isCurrent {
                Button {
                    HapticFeedback.medium()
                    Task { await viewModel.revokeSession(sessionId: session.id) }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(MeeshyFont.relative(20))
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

    // MARK: - Session Row Accessibility

    /// Composed VoiceOver label for a session row: device name, "current" marker,
    /// IP and last-active — so the row reads as one element and its state is never
    /// carried by the badge icon/color alone. Reuses the visible-string keys and
    /// joins locale-aware / RTL via `ListFormatter`.
    private func sessionRowAccessibilityLabel(_ session: UserSession) -> String {
        var parts: [String] = [
            session.deviceName ?? String(localized: "sessions_unknown_device", defaultValue: "Appareil inconnu")
        ]
        if session.isCurrent {
            parts.append(String(localized: "sessions_current_badge", defaultValue: "Actuelle"))
        }
        if let ip = session.ipAddress {
            parts.append(ip)
        }
        if let lastActive = session.lastActive {
            let formatted = lastActive.formatted(.relative(presentation: .named))
            parts.append(String(localized: "sessions_last_active", defaultValue: "Actif") + " " + formatted)
        }
        return ListFormatter.localizedString(byJoining: parts)
    }

    // MARK: - Revoke All Button

    private var revokeAllButton: some View {
        Button {
            HapticFeedback.medium()
            Task { await viewModel.revokeAllOtherSessions() }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "trash")
                    .font(MeeshyFont.relative(13, weight: .semibold))
                Text(String(localized: "sessions_revoke_all", defaultValue: "Revoquer toutes les autres sessions"))
                    .font(MeeshyFont.relative(14, weight: .semibold))
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
// `ActiveSessionsViewModel` lives in `Features/Main/ViewModels/ActiveSessionsViewModel.swift`
// since A1 (extracted to allow protocol-injected testing).
