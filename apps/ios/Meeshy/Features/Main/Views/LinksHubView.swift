import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - LinksHubView

/// Vue hub synthétisant toutes les formes de liens de la plateforme.
/// Deep link : https://meeshy.me/links
struct LinksHubView: View {
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var router: Router
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel

    // Sheets de création rapide
    @State private var showCreateShareLink = false
    @State private var showCreateTrackingLink = false
    @State private var showCreateAffiliate = false
    @State private var scrollOffset: CGFloat = 0

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                    GeometryReader { geo in
                        Color.clear.preference(
                            key: ScrollOffsetPreferenceKey.self,
                            value: geo.frame(in: .named("scroll")).minY
                        )
                    }
                    .frame(height: 0)

                    Color.clear.frame(height: CollapsibleHeaderMetrics.expandedHeight)

                    VStack(spacing: MeeshySpacing.xl) {
                        headerBanner
                            .padding(.horizontal, MeeshySpacing.lg)
                            .padding(.top, MeeshySpacing.sm)

                        linkCategoryCards
                            .padding(.horizontal, MeeshySpacing.lg)
                    }
                    .padding(.bottom, 40)
                }
                .coordinateSpace(name: "scroll")
                .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollOffset = $0 }   // iOS 16–17
                .trackScrollContentOffset { scrollOffset = -$0 }                            // iOS 18+ (preference path is dead there)

            VStack(spacing: 0) {
                CollapsibleHeader(
                    title: String(localized: "links.hub.title", defaultValue: "Mes liens", bundle: .main),
                    scrollOffset: scrollOffset,
                    onBack: { router.pop() },
                    titleColor: theme.textPrimary,
                    backArrowColor: MeeshyColors.communityAccent,
                    backgroundColor: theme.backgroundPrimary
                )
                Spacer()
            }
        }
        .navigationBarHidden(true)
        // Sheets de création rapide
        .sheet(isPresented: $showCreateShareLink) {
            CreateShareLinkView { _ in }
                .environmentObject(conversationListViewModel)
        }
        .sheet(isPresented: $showCreateTrackingLink) {
            CreateTrackingLinkView { _ in }
        }
        .sheet(isPresented: $showCreateAffiliate) {
            AffiliateCreateView { _ in }
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
    }

    // MARK: - Header Banner

    private var headerBanner: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Image(systemName: "link.badge.plus")
                    .font(.title.weight(.bold))
                    .foregroundColor(MeeshyColors.communityAccent)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(String(localized: "links.hub.banner.title", defaultValue: "Gérez vos liens", bundle: .main))
                        .font(.headline.weight(.bold))
                        .foregroundColor(theme.textPrimary)
                    Text(String(localized: "links.hub.banner.subtitle", defaultValue: "Partagez, suivez et monétisez votre audience", bundle: .main))
                        .font(.footnote)
                        .foregroundColor(theme.textSecondary)
                }
                Spacer()
            }
        }
        .padding(MeeshySpacing.lg)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                .fill(Color.white.opacity(0.05))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                        .stroke(MeeshyColors.communityAccent.opacity(0.3), lineWidth: 1)
                )
        )
        .accessibilityElement(children: .combine)
    }

    // MARK: - Category Cards

    private var linkCategoryCards: some View {
        VStack(spacing: MeeshySpacing.md + 2) {
            linkCard(
                icon: "link",
                title: String(localized: "links.hub.share.title", defaultValue: "Liens de partage", bundle: .main),
                description: String(localized: "links.hub.share.description", defaultValue: "Invitez des contacts à rejoindre vos conversations", bundle: .main),
                accentHex: MeeshyColors.shareAccentHex,
                route: .shareLinks,
                createLabel: String(localized: "links.hub.share.create.a11y", defaultValue: "Créer un lien de partage", bundle: .main),
                onCreate: { showCreateShareLink = true }
            )

            linkCard(
                icon: "chart.line.uptrend.xyaxis",
                title: String(localized: "links.hub.tracking.title", defaultValue: "Liens de tracking", bundle: .main),
                description: String(localized: "links.hub.tracking.description", defaultValue: "Suivez les performances de vos liens de référence", bundle: .main),
                accentHex: MeeshyColors.trackingAccentHex,
                route: .trackingLinks,
                createLabel: String(localized: "links.hub.tracking.create.a11y", defaultValue: "Créer un lien de tracking", bundle: .main),
                onCreate: { showCreateTrackingLink = true }
            )

            linkCard(
                icon: "person.3.fill",
                title: String(localized: "links.hub.community.title", defaultValue: "Liens communauté", bundle: .main),
                description: String(localized: "links.hub.community.description", defaultValue: "Gérez les liens d'invitation vers vos communautés", bundle: .main),
                accentHex: MeeshyColors.communityAccentHex,
                route: .communityLinks,
                onCreate: nil
            )

            linkCard(
                icon: "dollarsign.circle.fill",
                title: String(localized: "links.hub.affiliate.title", defaultValue: "Liens affiliés", bundle: .main),
                description: String(localized: "links.hub.affiliate.description", defaultValue: "Monétisez votre réseau avec des tokens d'affiliation", bundle: .main),
                accentHex: MeeshyColors.successHex,
                route: .affiliate,
                createLabel: String(localized: "links.hub.affiliate.create.a11y", defaultValue: "Créer un lien affilié", bundle: .main),
                onCreate: { showCreateAffiliate = true }
            )
        }
    }

    // MARK: - Link Card

    private func linkCard(
        icon: String,
        title: String,
        description: String,
        accentHex: String,
        route: Route,
        createLabel: String? = nil,
        onCreate: (() -> Void)?
    ) -> some View {
        let accent = Color(hex: accentHex)

        return Button {
            HapticFeedback.light()
            router.push(route)
        } label: {
            HStack(spacing: 14) {
                // Icône
                ZStack {
                    Circle()
                        .fill(accent.opacity(0.15))
                        .frame(width: 48, height: 48)
                    Image(systemName: icon)
                        .font(.title3.weight(.semibold))
                        .foregroundColor(accent)
                        .accessibilityHidden(true)
                }

                // Texte
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(theme.textPrimary)
                    Text(description)
                        .font(.caption)
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(2)
                }

                Spacer()

                // Actions: bouton créer + chevron
                HStack(spacing: 8) {
                    if let onCreate {
                        Button {
                            HapticFeedback.medium()
                            onCreate()
                        } label: {
                            Image(systemName: "plus.circle.fill")
                                .font(.title2)
                                .foregroundColor(accent)
                        }
                        .buttonStyle(.plain)
                        // Re-exposé via l'action rotor « Créer… » de la carte (idiome 183i) :
                        // ce Button secondaire imbriqué dans le Button de navigation est
                        // masqué à VoiceOver pour éviter un élément interactif ambigu.
                        .accessibilityHidden(true)
                    }

                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(theme.textMuted)
                        .accessibilityHidden(true)
                }
            }
            .padding(MeeshySpacing.md + 2)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(Color.white.opacity(0.05))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .stroke(accent.opacity(0.2), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
        .modifier(LinkCardCreateAction(label: createLabel, onCreate: onCreate))
    }
}

// MARK: - Accessibility helpers

/// Ré-expose l'action « Créer… » d'une carte de liens comme action VoiceOver
/// nommée (rotor Actions), le `Button` secondaire visible étant masqué à
/// VoiceOver pour éviter un élément interactif imbriqué ambigu (idiome 183i).
/// Aucune action ajoutée pour les cartes sans création (ex. communauté).
private struct LinkCardCreateAction: ViewModifier {
    let label: String?
    let onCreate: (() -> Void)?

    func body(content: Content) -> some View {
        if let label, let onCreate {
            content.accessibilityAction(named: Text(verbatim: label)) { onCreate() }
        } else {
            content
        }
    }
}
