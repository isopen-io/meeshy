import WidgetKit
import SwiftUI
import CoreImage.CIFilterBuiltins

// ============================================================================
// MARK: - « Mon lien » (planche `Hors-App`, vue 3, #18873)
// ============================================================================
//
// Mon QR prêt à être montré sans ouvrir l'app, avec l'adresse courte de mon profil. L'app publie l'adresse dans le
// groupe d'app (`WidgetDataManager.publishProfileLink`) ; sans compte ni pseudo, le widget le dit et n'invente rien.
// « 57 visites aujourd'hui » (#19489) : l'app publie le chiffre du jour compté par la passerelle, avec son jour UTC et
// l'adresse qu'il compte (`WidgetDataManager.publishProfileLinkVisits`). Le widget ne le montre que sous cette adresse
// et ce jour-là ; sans lui, il s'en passe.

struct MyProfileLinkWidget: Widget {
    let kind: String = MyProfileLinkKeys.kind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MyProfileLinkProvider()) { entry in
            MyProfileLinkWidgetView(entry: entry)
        }
        .configurationDisplayName(String(localized: "widget.myLink.title", defaultValue: "My link"))
        .description(String(localized: "widget.myLink.description", defaultValue: "Your profile QR, ready to show without opening the app"))
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

enum MyProfileLinkKeys {
    static let kind = "MyProfileLink"
    static let defaultsKey = "my_profile_link"
    static let visitsKey = "my_profile_link_visits"
}

/// Le miroir de `WidgetProfileLink` (app) : l'adresse complète que le QR encode, et sa forme courte affichée.
struct ProfileLinkCard: Codable, Equatable {
    let url: String
    let displayText: String
}

/// Le miroir de `WidgetProfileLinkVisits` (app) : le chiffre du jour, le jour UTC où il a été compté, l'adresse comptée.
struct ProfileLinkVisitsCard: Codable, Equatable {
    let url: String
    let today: Int
    let day: String

    /// Le chiffre, seulement sous l'adresse qu'il compte et le jour (UTC) où il a été compté.
    func visits(for card: ProfileLinkCard, at now: Date) -> Int? {
        url == card.url && day == Self.utcDay(now) && today >= 0 ? today : nil
    }

    static func utcDay(_ date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? TimeZone(secondsFromGMT: 0) ?? .current
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// Minuit UTC suivant : le chiffre du jour cesse d'être vrai, le widget se redessine sans lui.
    static func nextUTCMidnight(after date: Date) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? TimeZone(secondsFromGMT: 0) ?? .current
        let start = calendar.startOfDay(for: date)
        return calendar.date(byAdding: .day, value: 1, to: start) ?? date.addingTimeInterval(86_400)
    }
}

struct MyProfileLinkEntry: TimelineEntry {
    let date: Date
    let card: ProfileLinkCard?
    var visitsToday: Int? = nil

    static let sample = ProfileLinkCard(url: "https://meeshy.me/@aissa", displayText: "meeshy.me/@aissa")
}

struct MyProfileLinkProvider: TimelineProvider {
    func placeholder(in context: Context) -> MyProfileLinkEntry {
        MyProfileLinkEntry(date: Date(), card: MyProfileLinkEntry.sample, visitsToday: 57)
    }

    func getSnapshot(in context: Context, completion: @escaping (MyProfileLinkEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : entry(at: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MyProfileLinkEntry>) -> Void) {
        let now = Date()
        let current = entry(at: now)
        let policy: TimelineReloadPolicy = current.visitsToday == nil
            ? .never
            : .after(ProfileLinkVisitsCard.nextUTCMidnight(after: now))
        completion(Timeline(entries: [current], policy: policy))
    }

    private func entry(at now: Date) -> MyProfileLinkEntry {
        let card = loadCard()
        let visits = card.flatMap { card in loadVisits()?.visits(for: card, at: now) }
        return MyProfileLinkEntry(date: now, card: card, visitsToday: visits)
    }

    private func loadVisits() -> ProfileLinkVisitsCard? {
        guard let defaults = UserDefaults(suiteName: WidgetSharedKeys.suiteName),
              let data = defaults.data(forKey: MyProfileLinkKeys.visitsKey) else { return nil }
        return try? JSONDecoder().decode(ProfileLinkVisitsCard.self, from: data)
    }

    /// Pas de repli fabriqué : une lecture morte doit se VOIR (même règle que les favoris).
    private func loadCard() -> ProfileLinkCard? {
        guard let defaults = UserDefaults(suiteName: WidgetSharedKeys.suiteName),
              let data = defaults.data(forKey: MyProfileLinkKeys.defaultsKey) else { return nil }
        return try? JSONDecoder().decode(ProfileLinkCard.self, from: data)
    }
}

/// Le QR d'une adresse, en pixels nets : CoreImage, à l'échelle entière, sans lissage.
enum ProfileLinkQR {
    static func image(for text: String) -> CGImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 10, y: 10)) else { return nil }
        return CIContext().createCGImage(output, from: output.extent)
    }
}

struct MyProfileLinkWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: MyProfileLinkEntry

    var body: some View {
        Group {
            if let card = entry.card {
                if family == .systemSmall { small(card) } else { medium(card) }
            } else {
                signedOut
            }
        }
        .widgetURL(WidgetDeepLink.myLinks)
        .containerBackground(.background, for: .widget)
    }

    private func small(_ card: ProfileLinkCard) -> some View {
        VStack(spacing: 6) {
            qr(card)
            Text(card.displayText)
                .font(.caption2.monospaced())
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label(card))
    }

    private func medium(_ card: ProfileLinkCard) -> some View {
        HStack(spacing: 16) {
            qr(card)
            VStack(alignment: .leading, spacing: 6) {
                Label(String(localized: "widget.myLink.title", defaultValue: "My link"), systemImage: "qrcode")
                    .font(.headline)
                    .foregroundStyle(WidgetColors.brandPrimary)
                Text(card.displayText)
                    .font(.subheadline.monospaced())
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if let visits = entry.visitsToday {
                    visitsLine(visits)
                } else {
                    Text(String(localized: "widget.myLink.hint", defaultValue: "Scan with any camera"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label(card))
    }

    @ViewBuilder
    private func qr(_ card: ProfileLinkCard) -> some View {
        if let image = ProfileLinkQR.image(for: card.url) {
            Image(decorative: image, scale: 1)
                .interpolation(.none)
                .resizable()
                .aspectRatio(1, contentMode: .fit)
                .padding(6)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(.white))
        } else {
            Image(systemName: "qrcode")
                .resizable()
                .aspectRatio(1, contentMode: .fit)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
        }
    }

    private var signedOut: some View {
        VStack(spacing: 8) {
            Image(systemName: "qrcode")
                .font(.title2)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(String(localized: "widget.myLink.signedOut", defaultValue: "Open Meeshy to show your QR here"))
                .font(.caption)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }

    /// « 57 visites aujourd'hui » : le chiffre en gras, sa légende accordée.
    private func visitsLine(_ visits: Int) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(visits.formatted())
                .font(.subheadline.weight(.heavy))
                .monospacedDigit()
            Text(Self.visitsCaption(visits))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }

    static func visitsCaption(_ visits: Int) -> String {
        visits == 1
            ? String(localized: "widget.myLink.visitsToday.one", defaultValue: "visit today")
            : String(localized: "widget.myLink.visitsToday.many", defaultValue: "visits today")
    }

    private func label(_ card: ProfileLinkCard) -> String {
        let base = String(format: String(localized: "widget.myLink.a11y", defaultValue: "My profile QR, %@"), card.displayText)
        guard let visits = entry.visitsToday else { return base }
        return "\(base), \(visits.formatted()) \(Self.visitsCaption(visits))"
    }
}
