import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - LinksHubView

/// Vue hub synthétisant toutes les formes de liens de la plateforme.
/// Deep link : https://meeshy.me/links
struct LinksHubView: View {
    @ObservedObject private var theme = ThemeManager.shared
    @EnvironmentObject private var router: Router
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel

    // Sheets de création rapide
    @State private var showCreateShareLink = false
    @State private var showCreateTrackingLink = false
    @State private var showCreateAffiliate = false

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                VStack(spacing: 20) {
                    headerBanner
                        .padding(.horizontal, 16)
                        .padding(.top, 8)

                    linkCategoryCards
                        .padding(.horizontal, 16)
                }
                .padding(.bottom, 40)
            }
        }
        .navigationTitle("Mes liens")
        .navigationBarTitleDisplayMode(.large)
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
        }
    }

    // MARK: - Header Banner

    private var headerBanner: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Image(systemName: "link.badge.plus")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(Color(hex: "F8B500"))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Gérez vos liens")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(theme.textPrimary)
                    Text("Partagez, suivez et monétisez votre audience")
                        .font(.system(size: 13))
                        .foregroundColor(theme.textSecondary)
                }
                Spacer()
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.white.opacity(0.05))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color(hex: "F8B500").opacity(0.3), lineWidth: 1)
                )
        )
    }

    // MARK: - Category Cards

    private var linkCategoryCards: some View {
        VStack(spacing: 14) {
            linkCard(
                icon: "link",
                title: "Liens de partage",
                description: "Invitez des contacts à rejoindre vos conversations",
                accentHex: "08D9D6",
                route: .shareLinks,
                onCreate: { showCreateShareLink = true }
            )

            linkCard(
                icon: "chart.line.uptrend.xyaxis",
                title: "Liens de tracking",
                description: "Suivez les performances de vos liens de référence",
                accentHex: "A855F7",
                route: .trackingLinks,
                onCreate: { showCreateTrackingLink = true }
            )

            linkCard(
                icon: "person.3.fill",
                title: "Liens communauté",
                description: "Gérez les liens d'invitation vers vos communautés",
                accentHex: "F8B500",
                route: .communityLinks,
                onCreate: nil
            )

            linkCard(
                icon: "dollarsign.circle.fill",
                title: "Liens affiliés",
                description: "Monétisez votre réseau avec des tokens d'affiliation",
                accentHex: "2ECC71",
                route: .affiliate,
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
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(accent)
                }

                // Texte
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                    Text(description)
                        .font(.system(size: 12))
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
                                .font(.system(size: 22))
                                .foregroundColor(accent)
                        }
                        .buttonStyle(.plain)
                    }

                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color.white.opacity(0.05))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(accent.opacity(0.2), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }
}
