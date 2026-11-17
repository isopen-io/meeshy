import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

struct AffiliateView: View {
    private var theme: ThemeManager { ThemeManager.shared }
    @StateObject private var viewModel = AffiliateViewModel()
    @State private var showCreateSheet = false

    private let accentColor = MeeshyColors.brandPrimaryHex

    var body: some View {
        LinksPage(
            title: String(localized: "affiliate.title", defaultValue: "Parrainage", bundle: .main),
            accent: Color(hex: accentColor),
            action: LinksPageAction(
                label: String(localized: "affiliate.action.create", defaultValue: "Créer un lien de parrainage", bundle: .main),
                perform: { showCreateSheet = true }
            ),
            content: { affiliateContent }
        )
        .sheet(isPresented: $showCreateSheet) {
            AffiliateCreateView { token in
                viewModel.tokens.insert(token, at: 0)
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .task { await viewModel.load() }
    }

    // MARK: - Content

    private var affiliateContent: some View {
        VStack(spacing: MeeshySpacing.xl) {
            SettingsSentence(text: String(localized: "affiliate.orientation", defaultValue: "Ceux qui s'inscrivent par votre lien de parrainage vous sont rattachés.", bundle: .main))
            statsOverview
            tokensSection
            Spacer().frame(height: 40)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.sm)
    }

    // MARK: - Stats Overview

    private var statsOverview: some View {
        HStack(spacing: MeeshySpacing.md) {
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
        VStack(spacing: MeeshySpacing.xsPlus) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(MeeshyIconSize.lg, weight: .semibold))
                .foregroundStyle(Color(hex: color))
                .accessibilityHidden(true)

            Text(value)
                .font(MeeshyFont.relative(MeeshyFont.title3Size, weight: .bold, design: .rounded))
                .foregroundStyle(Color(hex: color))

            Text(label)
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                .foregroundStyle(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .padding(.vertical, MeeshySpacing.mdPlus)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(theme.surfaceGradient(tint: color))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .stroke(theme.border(tint: color), lineWidth: 1)
                )
        )
        .accessibilityElement(children: .combine)
    }

    // MARK: - Tokens Section

    private var tokensSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: "link.badge.plus")
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    .foregroundStyle(Color(hex: accentColor))
                    .accessibilityHidden(true)
                Text(String(localized: "affiliate.section.myLinks", defaultValue: "MES LIENS", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: accentColor))
                    .tracking(1.2)
                    .accessibilityAddTraits(.isHeader)
            }
            .padding(.leading, MeeshySpacing.xs)
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
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                        .fill(theme.surfaceGradient(tint: accentColor))
                        .overlay(
                            RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                                .stroke(theme.border(tint: accentColor), lineWidth: 1)
                        )
                )
            }
        }
    }

    private var emptyTokensState: some View {
        VStack(spacing: MeeshySpacing.md) {
            // Héros décoratif ≥36pt : gardé figé (doctrine 74i/86i/89i) ; le libellé adjacent
            // porte le sens → laissé fixe et masqué de VoiceOver plutôt que de scaler et
            // déséquilibrer l'état vide.
            Image(systemName: "link")
                .font(MeeshyFont.fixedGlyph(36))
                .foregroundStyle(Color(hex: accentColor).opacity(0.4))
                .accessibilityHidden(true)

            Text(String(localized: "affiliate.empty.title", defaultValue: "Aucun lien de parrainage", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                .foregroundStyle(theme.textPrimary)

            Button {
                HapticFeedback.light()
                showCreateSheet = true
            } label: {
                Text(String(localized: "affiliate.action.create", defaultValue: "Créer un lien de parrainage", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                    .foregroundStyle(Color(hex: accentColor))
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, MeeshySpacing.xxxl)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                        .stroke(theme.border(tint: accentColor), lineWidth: 1)
                )
        )
    }

    private func tokenRow(_ token: AffiliateToken) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(token.name)
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(1)

                if let created = AffiliateTokenRowDates.line(for: token) {
                    Text(created)
                        .font(MeeshyFont.relative(MeeshyFont.smallSize))
                        .foregroundStyle(theme.textMuted)
                        .lineLimit(1)
                }

                HStack(spacing: MeeshySpacing.sm) {
                    Label(String(localized: "affiliate.token.clicks", defaultValue: "\(token.clickCount) clics", bundle: .main), systemImage: "cursorarrow.click")
                        .font(MeeshyFont.relative(MeeshyFont.smallSize))
                        .foregroundStyle(theme.textMuted)
                    MetaSeparator()
                        .foregroundStyle(theme.textMuted)
                    Label(String(localized: "affiliate.token.signups", defaultValue: "\(token.referralCount) inscrit(s)", bundle: .main), systemImage: "person.fill.checkmark")
                        .font(MeeshyFont.relative(MeeshyFont.smallSize))
                        .foregroundStyle(MeeshyColors.success)
                }
            }
            .accessibilityElement(children: .combine)

            Spacer()

            MeeshyGlassButton(
                systemImage: "doc.on.doc",
                label: String(localized: "affiliate.action.copy", defaultValue: "Copier le lien de parrainage", bundle: .main),
                size: .s36,
                glyphTint: Color(hex: accentColor),
                haptic: .none,
                action: { token.affiliateLink.map { LinksClipboard.copy($0) } }
            )
            .disabled(token.affiliateLink == nil)

            shareTokenButton(token)

            MeeshyGlassButton(
                systemImage: "trash",
                label: String(localized: "affiliate.action.delete", defaultValue: "Supprimer le lien de parrainage", bundle: .main),
                kind: .destructive,
                size: .s36,
                action: { Task { await viewModel.deleteToken(token) } }
            )
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.smPlus)
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
        MeeshyGlassButtonFace(systemImage: "square.and.arrow.up", size: .s36, glyphTint: Color(hex: accentColor))
    }
}

/// La date de création d'un lien de parrainage, pour le reconnaître dans la liste (règle 7 de l'épure). Le serveur ne
/// sert aucune date de dernier usage : rien n'est inventé, une date illisible ne produit pas de ligne.
enum AffiliateTokenRowDates {
    static func line(for token: AffiliateToken, locale: Locale = .current) -> String? {
        WireDate.date(from: token.createdAt).map { date in
            String(
                format: String(localized: "links.row.created", defaultValue: "Créé le %@", bundle: .main),
                date.formatted(.dateTime.day().month(.abbreviated).year().locale(locale))
            )
        }
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

    private static let logger = MeeshyLog.logger(.affiliate)

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
            await bestEffort("affiliateView.affiliateTokens.save", category: .cache) { try await CacheCoordinator.shared.affiliateTokens.save(tokens, for: "list") }
        } catch {
            AffiliateViewModel.logger.error("affiliate tokens refresh failed: \(error.localizedDescription)")
        }
        isLoading = false
    }

    func deleteToken(_ token: AffiliateToken) async {
        let snapshot = tokens
        tokens.removeAll { $0.id == token.id }
        await bestEffort("affiliateView.affiliateTokens.save.2", category: .cache) { try await CacheCoordinator.shared.affiliateTokens.save(tokens, for: "list") }
        HapticFeedback.success()
        do {
            try await AffiliateService.shared.deleteToken(id: token.id)
        } catch {
            tokens = snapshot
            await bestEffort("affiliateView.affiliateTokens.save.3", category: .cache) { try await CacheCoordinator.shared.affiliateTokens.save(snapshot, for: "list") }
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(ShareLinkDetailCopy.actionFailed)
        }
    }
}
