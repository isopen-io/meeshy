import SwiftUI
import MeeshySDK
import MeeshyUI

struct AffiliateView: View {
    private var theme: ThemeManager { ThemeManager.shared }
    @StateObject var viewModel = AffiliateViewModel()
    @Environment(\.colorScheme) var colorScheme
    @Environment(\.routerCommands) var router
    @State private var showCreateSheet = false
    @State var showsInviteSheet = false
    @State var showsAllReferrals = false
    @State var qrShareImage: QRShareImage?
    @State var sharedLink: ShareableLink?

    private let accentColor = MeeshyColors.brandPrimaryHex

    var isDark: Bool { colorScheme == .dark }
    var accent: Color { Color(hex: accentColor) }

    var body: some View {
        LinksPage(
            title: String(localized: "affiliate.title", defaultValue: "Parrainage", bundle: .main),
            accent: accent,
            action: LinksPageAction(
                label: String(localized: "affiliate.action.create", defaultValue: "Créer un lien de parrainage", bundle: .main),
                perform: { showCreateSheet = true }
            ),
            content: { affiliateContent }
        )
        .sheet(isPresented: $showCreateSheet) {
            AffiliateCreateView { token in
                viewModel.insertToken(token)
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showsInviteSheet) {
            ReferralInviteSheet(onSend: { email in await viewModel.invite(email: email) })
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
        .sheet(item: $qrShareImage) { qr in ShareSheet(activityItems: [qr.image]) }
        .sheet(item: $sharedLink) { shared in ShareSheet(activityItems: shared.activityItems) }
        .task { await viewModel.loadPage() }
    }

    // MARK: - Content

    /// De haut en bas, comme la planche : le code, les chiffres, l'entonnoir, ce que ça rapporte, le palier, les
    /// filleuls, les invitations, « Inviter quelqu'un » ; puis mes liens de parrainage, qui se créent, se copient,
    /// se partagent et se suppriment comme avant.
    private var affiliateContent: some View {
        let page = viewModel.page
        return VStack(spacing: MeeshySpacing.xl) {
            SettingsSentence(text: String(localized: "affiliate.orientation", defaultValue: "Ceux qui s'inscrivent par votre lien de parrainage vous sont rattachés.", bundle: .main))
            heroSection(page.hero)
            figuresBand(page.figures)
            funnelSection(page.funnel)
            rewardSection(page.reward)
            tierSection(page.tier)
            referralsSection(page.referrals)
            invitationsSection(page.invitations)
            inviteButton
            tokensSection
            Spacer().frame(height: 40)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.sm)
    }

    // MARK: - Tokens Section

    private var tokensSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ReferralCopy.myLinks, count: viewModel.tokens.isEmpty ? nil : viewModel.tokens.count,
                                size: .sheet)

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
                action: { deleteToken(token) }
            )
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.smPlus)
    }

    /// La rangée part tout de suite ; un refus la rend et se dit.
    private func deleteToken(_ token: AffiliateToken) {
        Task {
            guard await viewModel.deleteToken(token) else {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(ShareLinkDetailCopy.actionFailed)
                return
            }
            HapticFeedback.success()
        }
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
