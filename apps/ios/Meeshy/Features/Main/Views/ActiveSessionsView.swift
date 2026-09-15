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
    /// Référence stable, jamais observée par la racine : seul l'en-tête se
    /// re-rend au fil du défilement (même dispositif que Réglages).
    @State private var scrollRelay = ScrollOffsetRelay()

    var body: some View {
        ZStack(alignment: .top) {
            theme.backgroundGradient.ignoresSafeArea()

            // L'en-tête partagé est monté À LA MAIN plutôt que par
            // `CollapsibleHeaderPage` : l'écran bascule entre chargement, vide et
            // liste, et seul ce dernier état défile. Le retour en verre (#6481)
            // doit rester présent dans les trois.
            VStack(spacing: 0) {
                content
            }

            header
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
        ScrollOffsetReader(relay: scrollRelay) { offset in
            CollapsibleHeader(
                title: String(localized: "sessions_title", defaultValue: "Sessions actives"),
                scrollOffset: offset,
                onBack: { dismiss() },
                titleColor: theme.textPrimary,
                backArrowColor: MeeshyColors.indigo500,
                backgroundColor: theme.backgroundPrimary
            )
        }
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading {
            Color.clear.frame(height: CollapsibleHeaderMetrics.expandedHeight)
            Spacer()
            ProgressView()
                .tint(MeeshyColors.indigo500)
            Spacer()
        } else if viewModel.sessions.isEmpty {
            Color.clear.frame(height: CollapsibleHeaderMetrics.expandedHeight)
            emptyState
                // Un état qui ne défile pas rend l'en-tête déplié : le relais
                // pourrait garder le repli de la liste quittée.
                .onAppear { scrollRelay.offset = 0 }
        } else {
            sessionsList
        }
    }

    // MARK: - Empty State

    // Bare `Text` (icon-less, non-grouped) replaced by the shared native
    // `ContentUnavailableView` wrapper (iOS 17+, faithful iOS 16 fallback) —
    // parity with FriendRequestListView (185i) / StarredMessagesView (175i).
    // Adds a semantic SF Symbol that scales with Dynamic Type, a guiding
    // subtitle, and native title+description VoiceOver grouping. The existing
    // `sessions_empty` key is reused for the title (0 catalog edit). maxHeight
    // fill keeps it vertically centred like the former Spacer sandwich.
    private var emptyState: some View {
        AdaptiveContentUnavailableView(
            String(localized: "sessions_empty", defaultValue: "Aucune session active"),
            systemImage: "laptopcomputer.and.iphone",
            description: Text(String(localized: "sessions_empty_subtitle", defaultValue: "Vos appareils connectés apparaîtront ici."))
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Sessions List

    private var sessionsList: some View {
        ScrollView(showsIndicators: false) {
            GeometryReader { geo in
                Color.clear.preference(
                    key: ScrollOffsetPreferenceKey.self,
                    value: geo.frame(in: .named("scroll")).minY
                )
            }
            .frame(height: 0)

            Color.clear.frame(height: CollapsibleHeaderMetrics.expandedHeight)

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
        .coordinateSpace(name: "scroll")
        .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollRelay.offset = $0 }      // iOS 16–17
        .trackScrollContentOffset { scrollRelay.offset = -$0 }                               // iOS 18+
    }

    // MARK: - Session Row

    private func sessionRow(_ session: UserSession) -> some View {
        HStack(spacing: 12) {
            // Bloc informatif (icône + libellés) groupé en UN seul élément VoiceOver
            // au lieu de ~5 arrêts fragmentés (168i, parité 142i/164i). VoiceOver lit
            // « <appareil>, Actuelle, <ip>, Actif <date> » d'une traite ; le bouton
            // Révoquer reste un élément actionnable distinct (sibling, hors du groupe).
            HStack(spacing: 12) {
                Image(systemName: session.isCurrent ? "iphone" : "desktopcomputer")
                    // Glyphe décoratif borné par le cadre fixe 32×32 → police figée (86i) ;
                    // l'identité de l'appareil est portée par `deviceName` → masqué du rotor.
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(session.isCurrent ? MeeshyColors.success : MeeshyColors.indigo400)
                    .frame(width: 32, height: 32)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill((session.isCurrent ? MeeshyColors.success : MeeshyColors.indigo400).opacity(0.12))
                    )
                    .accessibilityHidden(true)

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
            .accessibilityElement(children: .combine)

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
                .accessibilityLabel(String(localized: "sessions_revoke", defaultValue: "Révoquer cette session"))
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
                    .font(MeeshyFont.relative(13, weight: .semibold))
                Text(String(localized: "sessions_revoke_all", defaultValue: "Révoquer toutes les autres sessions"))
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
        .accessibilityLabel(String(localized: "sessions_revoke_all_label", defaultValue: "Révoquer toutes les autres sessions"))
    }
}

// MARK: - ViewModel
// `ActiveSessionsViewModel` lives in `Features/Main/ViewModels/ActiveSessionsViewModel.swift`
// since A1 (extracted to allow protocol-injected testing).
