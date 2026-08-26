import SwiftUI
import Combine
import os
import MeeshySDK

struct AffiliateView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.isPresented) private var isPresented
    @Environment(\.meeshyPanelDismiss) private var panelDismiss
    /// Retour operant dans les trois contextes de presentation : pile iPhone,
    /// panneau droit iPad (ni pile ni modale — d'ou l'inertie historique), sheet.
    private var back: PanelBackAction {
        PanelBackAction(isPresented: isPresented, dismiss: dismiss, panelDismiss: panelDismiss)
    }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @StateObject private var viewModel = AffiliateViewModel()
    @State private var showCreateSheet = false

    private let accentColor = MeeshyColors.brandPrimaryHex

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scrollContent
            }
        }
        .sheet(isPresented: $showCreateSheet) {
            AffiliateCreateView { token in
                viewModel.tokens.insert(token, at: 0)
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .task { await viewModel.load() }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                HapticFeedback.light()
                back()
            } label: {
                Image(systemName: "chevron.backward")
                    .font(MeeshyFont.relative(16, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel(String(localized: "a11y.back", bundle: .main))

            Spacer()

            Text(String(localized: "affiliate.title", defaultValue: "Parrainage", bundle: .main))
                .font(MeeshyFont.relative(17, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Spacer()

            Button {
                HapticFeedback.light()
                showCreateSheet = true
            } label: {
                Image(systemName: "plus.circle.fill")
                    .font(MeeshyFont.relative(22))
                    .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel(String(localized: "affiliate.action.create", defaultValue: "Créer un lien de parrainage", bundle: .main))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Content

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 20) {
                statsOverview
                tokensSection
                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
    }

    // MARK: - Stats Overview

    private var statsOverview: some View {
        HStack(spacing: 12) {
            affiliateStatCard(
                value: "\(viewModel.tokens.count)",
                label: String(localized: "affiliate.stat.links", defaultValue: "Liens", bundle: .main),
                color: accentColor,
                icon: "link"
            )
            affiliateStatCard(
                value: "\(viewModel.tokens.reduce(0) { $0 + $1.referralCount })",
                label: String(localized: "affiliate.stat.signups", defaultValue: "Inscrits", bundle: .main),
                color: accentColor,
                icon: "person.fill.checkmark"
            )
            affiliateStatCard(
                value: "\(viewModel.tokens.reduce(0) { $0 + $1.clickCount })",
                label: String(localized: "affiliate.stat.clicks", defaultValue: "Clics", bundle: .main),
                color: accentColor,
                icon: "cursorarrow.click"
            )
        }
    }

    private func affiliateStatCard(value: String, label: String, color: String, icon: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(18, weight: .semibold))
                .foregroundColor(Color(hex: color))
                .accessibilityHidden(true)

            Text(value)
                .font(MeeshyFont.relative(20, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))

            Text(label)
                .font(MeeshyFont.relative(10, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: color))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.border(tint: color), lineWidth: 1)
                )
        )
        .accessibilityElement(children: .combine)
    }

    // MARK: - Tokens Section

    private var tokensSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "link.badge.plus")
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
                    .accessibilityHidden(true)
                Text(String(localized: "affiliate.section.myLinks", defaultValue: "MES LIENS", bundle: .main))
                    .font(MeeshyFont.relative(11, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: accentColor))
                    .tracking(1.2)
                    .accessibilityAddTraits(.isHeader)
            }
            .padding(.leading, 4)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)

            if viewModel.tokens.isEmpty {
                emptyTokensState
            } else {
                VStack(spacing: 0) {
                    ForEach(viewModel.tokens) { token in
                        tokenRow(token)
                        if token.id != viewModel.tokens.last?.id {
                            Divider().background(theme.textMuted.opacity(0.1))
                        }
                    }
                }
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(theme.surfaceGradient(tint: accentColor))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .stroke(theme.border(tint: accentColor), lineWidth: 1)
                        )
                )
            }
        }
    }

    private var emptyTokensState: some View {
        VStack(spacing: 12) {
            // Héros décoratif ≥36pt : gardé figé (doctrine 74i/86i/89i) ; le libellé adjacent
            // porte le sens → laissé fixe et masqué de VoiceOver plutôt que de scaler et
            // déséquilibrer l'état vide.
            Image(systemName: "link")
                .font(.system(size: 36))
                .foregroundColor(Color(hex: accentColor).opacity(0.4))
                .accessibilityHidden(true)

            Text(String(localized: "affiliate.empty.title", defaultValue: "Aucun lien de parrainage", bundle: .main))
                .font(MeeshyFont.relative(14, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            Text(String(localized: "affiliate.empty.subtitle", defaultValue: "Créez un lien pour inviter vos amis", bundle: .main))
                .font(MeeshyFont.relative(12))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 30)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(theme.border(tint: accentColor), lineWidth: 1)
                )
        )
    }

    private func tokenRow(_ token: AffiliateToken) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(token.name)
                    .font(MeeshyFont.relative(14, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                HStack(spacing: 8) {
                    Label(String(localized: "affiliate.token.clicks", defaultValue: "\(token.clickCount) clics", bundle: .main), systemImage: "cursorarrow.click")
                        .font(MeeshyFont.relative(12))
                        .foregroundColor(theme.textMuted)
                    Text("·")
                        .foregroundColor(theme.textMuted)
                    Label(String(localized: "affiliate.token.signups", defaultValue: "\(token.referralCount) inscrit(s)", bundle: .main), systemImage: "person.fill.checkmark")
                        .font(MeeshyFont.relative(12))
                        .foregroundColor(MeeshyColors.success)
                }
            }
            .accessibilityElement(children: .combine)

            Spacer()

            Button {
                if let link = token.affiliateLink {
                    UIPasteboard.general.string = link
                    HapticFeedback.success()
                }
            } label: {
                Image(systemName: "doc.on.doc")
                    .font(MeeshyFont.relative(14, weight: .medium))
                    .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel(String(localized: "affiliate.action.copy", defaultValue: "Copier le lien de parrainage", bundle: .main))

            shareTokenButton(token)

            Button {
                Task { await viewModel.deleteToken(token) }
            } label: {
                Image(systemName: "trash")
                    .font(MeeshyFont.relative(14, weight: .medium))
                    .foregroundColor(MeeshyColors.error)
            }
            .accessibilityLabel(String(localized: "affiliate.action.delete", defaultValue: "Supprimer le lien de parrainage", bundle: .main))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    /// Native share: `ShareLink` gives the activity sheet, the iPad popover
    /// anchor and top-VC presentation for free — no manual
    /// `UIActivityViewController` / window-hierarchy traversal (doctrine:
    /// prefer first-party SwiftUI over UIKit, cf. `CommunityLinkDetailView`).
    /// The hand-rolled path it replaces resolved its presenter from
    /// `connectedScenes.first`; `connectedScenes` is an *unordered* `Set`, so
    /// under iPad multitasking / Stage Manager it could target a background
    /// scene and present the sheet on a window nobody can see.
    @ViewBuilder
    private func shareTokenButton(_ token: AffiliateToken) -> some View {
        let shareLabel = String(localized: "affiliate.action.share", defaultValue: "Partager le lien de parrainage", bundle: .main)
        if let link = token.affiliateLink, let url = URL(string: link) {
            ShareLink(item: url) {
                shareTokenGlyph
            }
            .accessibilityLabel(shareLabel)
        } else {
            // No usable link: the old Button stayed tappable and silently did
            // nothing. Dim it and hide it from VoiceOver instead of offering a
            // dead control.
            shareTokenGlyph
                .opacity(0.4)
                .accessibilityHidden(true)
        }
    }

    private var shareTokenGlyph: some View {
        Image(systemName: "square.and.arrow.up")
            .font(MeeshyFont.relative(16))
            .foregroundColor(Color(hex: accentColor))
    }
}

// MARK: - ViewModel

@MainActor
final class AffiliateViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var tokens: [AffiliateToken] = []
    @Published var isLoading = false

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "affiliate")

    func load() async {
        let cached = await CacheCoordinator.shared.affiliateTokens.load(for: "list")
        switch cached {
        case .fresh(let data, _):
            tokens = data
            return
        case .stale(let data, _):
            tokens = data
            await refreshFromAPI()
        case .expired, .empty:
            isLoading = tokens.isEmpty
            await refreshFromAPI()
        }
    }

    private func refreshFromAPI() async {
        do {
            tokens = try await AffiliateService.shared.listTokens()
            try? await CacheCoordinator.shared.affiliateTokens.save(tokens, for: "list")
        } catch {
            AffiliateViewModel.logger.error("affiliate tokens refresh failed: \(error.localizedDescription)")
        }
        isLoading = false
    }

    func deleteToken(_ token: AffiliateToken) async {
        let snapshot = tokens
        tokens.removeAll { $0.id == token.id }
        try? await CacheCoordinator.shared.affiliateTokens.save(tokens, for: "list")
        HapticFeedback.success()
        do {
            try await AffiliateService.shared.deleteToken(id: token.id)
        } catch {
            tokens = snapshot
            try? await CacheCoordinator.shared.affiliateTokens.save(snapshot, for: "list")
            HapticFeedback.error()
        }
    }
}
