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
    let linkId: String
    let state: ShareLinkDetailViewModel.StatsState
    let isDark: Bool

    /// Combien d'arrivées récentes la carte montre ; au-delà, « Voir les N
    /// arrivées » ouvre la liste complète (#7813).
    static let recentLimit = 8

    private var stats: ShareLinkArrivalStats? {
        guard case .loaded(let stats) = state else { return nil }
        return stats
    }

    var body: some View {
        VStack(spacing: MeeshySpacing.smPlus) {
            HStack(spacing: MeeshySpacing.smPlus) {
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
                            .font(MeeshyFont.relative(MeeshyFont.labelSize))
                            .foregroundColor(isDark ? MeeshyColors.indigo200 : MeeshyColors.neutral500)
                    } else {
                        ForEach(stats.recentArrivals.prefix(Self.recentLimit)) { arrival in
                            ShareLinkArrivalRow(entry: ShareLinkArrivalEntry(arrival), avatarURL: arrival.avatar, isDark: isDark)
                        }
                    }
                    if Self.showsSeeAll(stats) {
                        seeAllLink(stats)
                    }
                }
            }
        }
        .animation(.easeOut(duration: 0.25), value: state)
    }

    /// Le lien vers la liste complète n'apparaît que s'il montre plus que la carte.
    static func showsSeeAll(_ stats: ShareLinkArrivalStats) -> Bool {
        stats.arrivals > min(stats.recentArrivals.count, recentLimit)
    }

    private func seeAllLink(_ stats: ShareLinkArrivalStats) -> some View {
        NavigationLink {
            ShareLinkArrivalsListView(
                linkId: linkId,
                totalCount: stats.arrivals,
                seed: stats.recentArrivals.map(ShareLinkArrivalEntry.init)
            )
        } label: {
            HStack(spacing: MeeshySpacing.sm) {
                Text(ShareLinkDetailCopy.seeAllArrivals(stats.arrivals))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold))
                    .accessibilityHidden(true)
            }
            .foregroundColor(isDark ? MeeshyColors.indigo300 : MeeshyColors.indigo600)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func tile(_ value: Int?, label: String) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
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
        .padding(MeeshySpacing.mdPlus)
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

/// Un arrivant : initiales, nom, drapeau du pays (ISO 3166-1 alpha-2), badge
/// « sans compte », langue, ancienneté relative. La MÊME ligne sert la carte
/// « Arrivés récemment » et la liste complète (#7813) ; VoiceOver la lit d'un
/// seul tenant.
struct ShareLinkArrivalRow: View, Equatable {
    let entry: ShareLinkArrivalEntry
    var avatarURL: String? = nil
    let isDark: Bool

    var body: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            MeeshyAvatar(
                name: entry.displayName,
                context: .custom(36),
                avatarURL: avatarURL,
                enablePulse: false,
                isDark: isDark
            )
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                HStack(spacing: MeeshySpacing.sm) {
                    Text(entry.displayName)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundColor(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
                        .lineLimit(1)
                    if let flag {
                        Text(verbatim: flag)
                    }
                    if entry.isAnonymous {
                        Text(ShareLinkDetailCopy.noAccountBadge)
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold))
                            .foregroundColor(isDark ? MeeshyColors.indigo200 : MeeshyColors.indigo700)
                            .lineLimit(1)
                            .padding(.horizontal, MeeshySpacing.sm)
                            .padding(.vertical, MeeshySpacing.xxs)
                            .background(Capsule().fill(isDark ? MeeshyColors.indigo900 : MeeshyColors.indigo50))
                    }
                }
                if let languageName {
                    Text(verbatim: languageName)
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                        .foregroundColor(isDark ? MeeshyColors.indigo200 : MeeshyColors.neutral500)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            Text(entry.joinedAt, format: .relative(presentation: .named, unitsStyle: .abbreviated))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                .foregroundColor(isDark ? MeeshyColors.indigo200 : MeeshyColors.neutral500)
                .lineLimit(1)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    private var flag: String? {
        guard let country = entry.country else { return nil }
        let emoji = CountryFlag.emoji(for: country)
        return emoji.isEmpty ? nil : emoji
    }

    private var countryName: String? {
        entry.country.flatMap(CountryFlag.name(for:))
    }

    private var languageName: String? {
        guard let language = entry.language, !language.isEmpty else { return nil }
        return LanguageData.autonym(for: language)
    }

    /// Nom, « sans compte », pays, langue, ancienneté — en une phrase.
    var accessibilityText: String {
        [
            entry.displayName,
            entry.isAnonymous ? ShareLinkDetailCopy.noAccountBadge : nil,
            countryName,
            languageName,
            entry.joinedAt.formatted(.relative(presentation: .named)),
        ]
        .compactMap { $0 }
        .filter { !$0.isEmpty }
        .joined(separator: ", ")
    }
}
