import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'heure de la DERNIÈRE position connue (#20242) : « à l'instant », « il y a 7 min », puis l'heure. Une horloge en
/// avance se lit « à l'instant » ; un instant inconnu (une position servie sans heure) ne se dit pas.
nonisolated enum ProfileWhereStamp: Equatable {
    case justNow
    case minutesAgo(Int)
    case at(Date)

    static func of(_ instant: Date, now: Date) -> ProfileWhereStamp? {
        guard instant > .distantPast.addingTimeInterval(1) else { return nil }
        let elapsed = now.timeIntervalSince(instant)
        if elapsed < 60 { return .justNow }
        if elapsed < 3_600 { return .minutesAgo(Int(elapsed / 60)) }
        return .at(instant)
    }

    func text(now: Date, calendar: Calendar = .current) -> String {
        switch self {
        case .justNow:
            String(localized: "profile.where.stamp.justNow", defaultValue: "à l'instant", bundle: .main)
        case .minutesAgo(let minutes):
            String(format: String(localized: "profile.where.stamp.minutes", defaultValue: "il y a %d min", bundle: .main), minutes)
        case .at(let instant):
            String(format: String(localized: "profile.where.stamp.at", defaultValue: "à %@", bundle: .main),
                   instant.formatted(date: calendar.isDate(instant, inSameDayAs: now) ? .omitted : .abbreviated,
                                     time: .shortened))
        }
    }

    /// « Dernière position · il y a 7 min ».
    static func caption(_ stamp: ProfileWhereStamp?, now: Date) -> String {
        let lead = String(localized: "profile.where.hero.lastKnown", defaultValue: "Dernière position", bundle: .main)
        guard let stamp else { return lead }
        return "\(lead) · \(stamp.text(now: now))"
    }
}

/// LE BLOC HÉROS DE CARTE d'une fiche (#20242) : la carte pleine largeur centrée sur la DERNIÈRE position connue, le lieu
/// (ou le nom) et l'heure de cette position posés sur un voile en bas ; un toucher ouvre la carte. L'hôte ne le pose que
/// s'il a une position : jamais de carte vide.
struct ProfileWhereHero<MapContent: View>: View {
    let title: String
    let stamp: ProfileWhereStamp?
    let now: Date
    let onTap: () -> Void
    @ViewBuilder let map: () -> MapContent

    static var height: CGFloat { 200 }

    var body: some View {
        let caption = ProfileWhereStamp.caption(stamp, now: now)
        Button(action: onTap) {
            map()
                .frame(maxWidth: .infinity)
                .frame(height: Self.height)
                .overlay(alignment: .bottomLeading) { legend(caption: caption) }
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous))
                .contentShape(RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title), \(caption)")
        .accessibilityHint(LocationMapCopy.openMap)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("profile.where.hero")
    }

    private func legend(caption: String) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
            Text(title)
                .meeshyScaledFont(17, weight: .semibold)
                .lineLimit(1)
            Text(caption)
                .meeshyScaledFont(13)
                .lineLimit(1)
                .opacity(0.9)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LinearGradient(colors: [.clear, .black.opacity(0.62)], startPoint: .top, endPoint: .bottom))
    }
}
