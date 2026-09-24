import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce qu'un lien a fait venir (#7797) : visites, arrivées, arrivées sans
/// compte ; les langues des arrivants ; les derniers arrivés.
///
/// Trois états, jamais un indicateur éternel : en chargement, les tuiles
/// montrent des tirets à leur taille finale (rien ne saute à l'arrivée des
/// chiffres) ; indisponibles (route pas encore servie, hors ligne), elles
/// gardent leurs tirets et une ligne le dit.
struct ShareLinkArrivalsSection: View {
    let state: ShareLinkDetailViewModel.StatsState
    let isDark: Bool

    private var stats: ShareLinkArrivalStats? {
        guard case .loaded(let stats) = state else { return nil }
        return stats
    }

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                tile(stats?.visits, label: ShareLinkDetailCopy.visits)
                tile(stats?.arrivals, label: ShareLinkDetailCopy.arrivals)
                tile(stats?.anonymousArrivals, label: ShareLinkDetailCopy.withoutAccount)
            }
            if state == .unavailable {
                Text(ShareLinkDetailCopy.statsUnavailable)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundColor(isDark ? MeeshyColors.indigo200 : MeeshyColors.neutral500)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let stats, !stats.languageShares.isEmpty {
                card {
                    sectionTitle(ShareLinkDetailCopy.arrivalLanguages)
                    LanguageShareBar(shares: stats.languageShares, isDark: isDark)
                }
            }
            if let stats {
                card {
                    sectionTitle(ShareLinkDetailCopy.recentArrivals)
                    if stats.recentArrivals.isEmpty {
                        Text(ShareLinkDetailCopy.noArrivals)
                            .font(MeeshyFont.relative(14))
                            .foregroundColor(isDark ? MeeshyColors.indigo200 : MeeshyColors.neutral500)
                    } else {
                        ForEach(stats.recentArrivals.prefix(8)) { arrival in
                            ShareLinkArrivalRow(arrival: arrival, isDark: isDark)
                        }
                    }
                }
            }
        }
        .animation(.easeOut(duration: 0.25), value: state)
    }

    private func tile(_ value: Int?, label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: value.map { $0.formatted() } ?? "—")
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .heavy, design: .rounded))
                .foregroundColor(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .redacted(reason: state == .loading ? .placeholder : [])
            Text(label)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                .foregroundColor(isDark ? MeeshyColors.indigo200 : MeeshyColors.neutral500)
                .lineLimit(2)
                .minimumScaleFactor(0.85)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .inviteCardSurface(isDark: isDark, cornerRadius: MeeshyRadius.lg)
        .accessibilityElement(children: .combine)
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) { content() }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(MeeshySpacing.lg)
            .inviteCardSurface(isDark: isDark)
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .heavy))
            .scriptSafeTracking(1.1)
            .textCase(.uppercase)
            .foregroundColor(isDark ? MeeshyColors.indigo300 : MeeshyColors.indigo600)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Un arrivant : initiales, nom, badge « sans compte », drapeau du pays
/// (ISO 3166-1 alpha-2), ancienneté relative.
struct ShareLinkArrivalRow: View, Equatable {
    let arrival: ShareLinkArrivalStats.Arrival
    let isDark: Bool

    var body: some View {
        HStack(spacing: 10) {
            MeeshyAvatar(
                name: arrival.displayName,
                context: .custom(36),
                avatarURL: arrival.avatar,
                enablePulse: false,
                isDark: isDark
            )
            .accessibilityHidden(true)
            Text(arrival.displayName)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundColor(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
                .lineLimit(1)
            if let flag = flag {
                Text(verbatim: flag)
                    .accessibilityLabel(countryName ?? "")
            }
            if arrival.isAnonymous {
                Text(ShareLinkDetailCopy.noAccountBadge)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold))
                    .foregroundColor(isDark ? MeeshyColors.indigo200 : MeeshyColors.indigo700)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(isDark ? MeeshyColors.indigo900 : MeeshyColors.indigo50))
            }
            Spacer(minLength: 0)
            Text(arrival.joinedAt, format: .relative(presentation: .named, unitsStyle: .abbreviated))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                .foregroundColor(isDark ? MeeshyColors.indigo200 : MeeshyColors.neutral500)
                .lineLimit(1)
        }
        .accessibilityElement(children: .combine)
    }

    private var flag: String? {
        guard let country = arrival.country else { return nil }
        let emoji = CountryFlag.emoji(for: country)
        return emoji.isEmpty ? nil : emoji
    }

    private var countryName: String? {
        arrival.country.flatMap(CountryFlag.name(for:))
    }
}
