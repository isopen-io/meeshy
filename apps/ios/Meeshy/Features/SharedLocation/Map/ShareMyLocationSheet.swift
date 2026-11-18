import SwiftUI
import MeeshySDK
import MeeshyUI

/// Une personne à qui je peux montrer ma position, et le cercle servi qui la qualifie.
struct ShareMyLocationRecipient: Identifiable, Equatable {
    let userId: String
    let name: String
    let circle: RelationLevel?

    var id: String { userId }
}

/// PARTAGER MA POSITION (#18872, planche Carte-Partage), faite du kit : la durée en tuiles (K47), la précision sur une
/// échelle à trois crans (K53), ce que la personne verra dit en une note (K46), et la capsule d'envoi (K40). Pendant le
/// partage, la feuille dit jusqu'à quand et « Arrêter » est à un geste. Plusieurs personnes (depuis la carte de mes
/// proches) se choisissent en puces (K04). Rien ne part avant le geste ; la passerelle tronque, ce client ne floute rien.
struct ShareMyLocationSheet: View {
    let recipients: [ShareMyLocationRecipient]

    @ObservedObject private var center: SharedLocationSharingCenter
    @State private var chosen: Set<String>
    @State private var duration: SharedLocationShareDuration = .oneHour
    @State private var precision: SharedLocationPrecision = .city
    @State private var openNoteID: String?
    /// « Prévenir » (planche : activé) et « Partager aussi ma batterie » (coupé, ou l'accord du partage en cours).
    @State private var notify = true
    @State private var battery: Bool
    /// La position m'est refusée par le téléphone (planche `Etat-Erreur` vue 5) : le bloc d'état remplace le formulaire
    /// jusqu'au retour dans l'app, où le formulaire revient pour un nouvel essai.
    @State private var locationDenied = false
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    @Environment(\.locale) private var locale
    private var theme: ThemeManager { ThemeManager.shared }

    init(recipients: [ShareMyLocationRecipient], center: SharedLocationSharingCenter = SharedLocationSharingHolder.center()) {
        self.recipients = recipients
        _center = ObservedObject(wrappedValue: center)
        _chosen = State(initialValue: recipients.count == 1 ? Set(recipients.map(\.userId)) : [])
        _battery = State(initialValue: center.roster.sharesBattery)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
                header
                if let sharing = activeShare {
                    activeSection(sharing)
                } else if locationDenied {
                    deniedState
                } else {
                    durationSection
                    precisionSection
                    optionsSection
                    shareButton
                }
            }
            .padding(MeeshySpacing.xl)
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .adaptiveOnChange(of: scenePhase) { _, phase in
            if phase == .active { locationDenied = false }
        }
    }

    private var deniedState: some View {
        MeeshyStateBlock(
            kind: .denied,
            title: ShareMyLocationCopy.deniedTitle,
            message: ShareMyLocationCopy.deniedMessage,
            primary: MeeshyStateBlockAction(title: ShareMyLocationCopy.openSettings, systemImage: "gearshape") {
                guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                openURL(url)
            },
            art: .none,
            systemImage: "location.slash"
        )
        .accessibilityIdentifier("sharedLocation.share.denied")
    }

    // MARK: - En-tête

    private var header: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            Text(ShareMyLocationCopy.title)
                .font(.title2.weight(.bold))
                .foregroundStyle(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            if recipients.count == 1, let only = recipients.first {
                HStack(spacing: MeeshySpacing.sm) {
                    Text(ShareMyLocationCopy.with).foregroundStyle(theme.textSecondary)
                    MeeshyPersonRow(title: only.name, size: .inline, showsDivider: false,
                                    avatar: { avatar(only) }, trailing: { circleBadge(only.circle) })
                }
            } else {
                MeeshyChipRow(
                    recipients.map { recipient in
                        MeeshyChip(id: recipient.userId, title: recipient.name,
                                   systemImage: recipient.circle.map { PersonLocationCard.circleSymbol($0) })
                    },
                    selection: chosen,
                    label: ShareMyLocationCopy.chooseLabel,
                    mode: .multiple,
                    layout: .wrap,
                    surface: .theme,
                    onChange: { selection, _ in chosen = selection }
                )
            }
        }
    }

    private func avatar(_ recipient: ShareMyLocationRecipient) -> some View {
        MeeshyAvatar(name: recipient.name, context: .custom(26), accentColor: DynamicColorGenerator.colorForName(recipient.name))
    }

    @ViewBuilder
    private func circleBadge(_ circle: RelationLevel?) -> some View {
        if let circle {
            MeeshyBadge(.label(CircleLevelNames.title(of: circle)), leading: .systemImage(PersonLocationCard.circleSymbol(circle)),
                        surface: .outline, tint: LocationMapTint.color(for: circle), size: .s28)
        }
    }

    // MARK: - Pendant

    private var durationSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ShareLocationWording.durationTitle)
            MeeshyChoiceTiles(
                label: ShareLocationWording.durationTitle,
                items: durationItems,
                selection: .single(String(duration.rawValue)),
                columns: 3,
                content: .value,
                tint: MeeshyColors.brandPrimary,
                onSelect: { id in
                    guard let minutes = Int(id), let picked = SharedLocationShareDuration(rawValue: minutes) else { return }
                    duration = picked
                }
            )
        }
    }

    /// 1 h et 8 h : les deux durées que la passerelle sert. « Jusqu'à ce que j'arrête » reste fermé : réservé au Sang,
    /// la passerelle ne l'accepte pas encore.
    private var durationItems: [MeeshyChoiceItem] {
        [
            MeeshyChoiceItem(id: String(SharedLocationShareDuration.oneHour.rawValue), title: ShareMyLocationCopy.hourUnit,
                             value: "1"),
            MeeshyChoiceItem(id: String(SharedLocationShareDuration.eightHours.rawValue), title: ShareMyLocationCopy.hoursUnit,
                             value: "8"),
            MeeshyChoiceItem(id: "untilStopped", title: ShareMyLocationCopy.untilStopped, detail: ShareMyLocationCopy.bloodOnly,
                             systemImage: "infinity", state: .locked(key: "untilStopped")),
        ]
    }

    // MARK: - Précision

    private static let precisions: [SharedLocationPrecision] = [.city, .neighborhood, .exact]

    private var precisionSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ShareMyLocationCopy.precisionTitle)
            MeeshyStepper(
                value: Self.precisions.firstIndex(of: precision) ?? 0,
                range: 0...(Self.precisions.count - 1),
                label: ShareMyLocationCopy.precisionTitle,
                spokenValue: ShareLocationWording.precision(precision),
                kind: .track,
                stops: [
                    MeeshyStepperStop(id: "city", title: ShareMyLocationCopy.city, markSize: 52),
                    MeeshyStepperStop(id: "neighborhood", title: ShareMyLocationCopy.neighborhood, markSize: 36),
                    MeeshyStepperStop(id: "exact", title: ShareMyLocationCopy.exact, markSize: 12),
                ],
                tint: MeeshyColors.brandPrimary,
                onChange: { index in
                    guard Self.precisions.indices.contains(index) else { return }
                    precision = Self.precisions[index]
                }
            )
            MeeshyNote(ShareMyLocationCopy.visibleWithin(names: chosenNames, meters: LocationMapRules.visibleRadiusMeters(for: precision), locale: locale),
                       lead: .systemImage("eye"))
            if let name = chosenNames.first, chosenNames.count == 1 {
                MeeshyInfoNoted(note: ShareLocationWording.explainNote, openNoteID: $openNoteID) {
                    Text(ShareLocationWording.explain(name: name))
                        .font(.footnote)
                        .foregroundStyle(theme.textSecondary)
                }
            }
        }
    }

    // MARK: - Prévenir, batterie (#19204, #19476)

    /// Les deux interrupteurs (K06) n'existent que tant que la passerelle n'a pas dit qu'elle ne les sert pas.
    @ViewBuilder
    private var optionsSection: some View {
        if center.servesShareOptions != false {
            VStack(spacing: 0) {
                MeeshyToggleRow(ShareMyLocationCopy.notify(names: chosenNames), systemImage: "bell",
                                subtitle: ShareMyLocationCopy.notifyDetail(count: chosenNames.count),
                                accessory: .toggle(isOn: notify), action: { notify.toggle() })
                    .accessibilityIdentifier("sharedLocation.share.notify")
                MeeshyToggleRow(ShareMyLocationCopy.battery, systemImage: "battery.50",
                                subtitle: ShareMyLocationCopy.batteryDetail, accessory: .toggle(isOn: battery),
                                showsDivider: true, action: { battery.toggle() })
                    .accessibilityIdentifier("sharedLocation.share.battery")
            }
            .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg), tone: .theme)
        }
    }

    // MARK: - Partager, arrêter

    private var shareButton: some View {
        VStack(spacing: MeeshySpacing.sm) {
            MeeshyButton(ShareMyLocationCopy.shareFor(duration), systemImage: "location.fill", kind: .accent, width: .fill,
                         isPending: center.isBusy, disabledReason: chosen.isEmpty ? ShareMyLocationCopy.chooseLabel : nil,
                         action: { Task { await share() } })
            Text(ShareMyLocationCopy.footnote)
                .font(.footnote)
                .foregroundStyle(theme.textMuted)
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
        }
    }

    private var activeShare: SharedLocationRoster.Entry? {
        guard recipients.count == 1, let only = recipients.first else { return nil }
        return center.entry(for: only.userId)
    }

    private func activeSection(_ entry: SharedLocationRoster.Entry) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
            MeeshyNote(ShareLocationWording.sharing(name: chosenNames.first ?? "", precision: entry.precision, until: entry.until),
                       form: .band, kind: .ok, lead: .pulse)
            MeeshyButton(ShareLocationWording.stop, systemImage: "location.slash", kind: .danger, width: .fill,
                         isDestructive: true, isPending: center.isBusy, action: { Task { await stop() } })
                .accessibilityLabel(ShareLocationWording.stopAccessibility(name: chosenNames.first ?? ""))
        }
    }

    private var chosenNames: [String] {
        recipients.filter { chosen.contains($0.userId) }.map(\.name)
    }

    private func share() async {
        let targets = recipients.filter { chosen.contains($0.userId) }
        let offers = center.servesShareOptions != false
        for target in targets {
            if let problem = await center.share(with: target.userId, precision: precision, duration: duration,
                                                notify: offers && notify, battery: offers ? battery : nil) {
                guard problem != .locationDenied else {
                    locationDenied = true
                    return
                }
                FeedbackToastManager.shared.showError(ShareLocationWording.problem(problem))
                return
            }
        }
        if offers, notify || battery, center.servesShareOptions == false {
            FeedbackToastManager.shared.showNotice(ShareMyLocationCopy.optionsUnavailable)
        } else {
            HapticFeedback.success()
        }
        dismiss()
    }

    private func stop() async {
        guard let only = recipients.first else { return }
        switch await center.stopSharing(with: only.userId) {
        case nil:
            HapticFeedback.success()
        case .withdrawalPending:
            FeedbackToastManager.shared.showNotice(ShareLocationWording.problem(.withdrawalPending))
        case let problem?:
            FeedbackToastManager.shared.showError(ShareLocationWording.problem(problem))
        }
    }
}

/// Les mots de « Partager ma position » (sept langues dans `Localizable.xcstrings`).
enum ShareMyLocationCopy {
    static var title: String { String(localized: "sharedLocation.share.action", defaultValue: "Partager ma position", bundle: .main) }
    static var with: String { String(localized: "locationMap.share.with", defaultValue: "avec", bundle: .main) }
    static var chooseLabel: String { String(localized: "locationMap.share.choose", defaultValue: "Avec qui", bundle: .main) }
    static var hourUnit: String { String(localized: "locationMap.share.hour", defaultValue: "heure", bundle: .main) }
    static var hoursUnit: String { String(localized: "locationMap.share.hours", defaultValue: "heures", bundle: .main) }
    static var untilStopped: String { String(localized: "locationMap.share.untilStopped", defaultValue: "Jusqu'à ce que j'arrête", bundle: .main) }
    static var bloodOnly: String { String(localized: "locationMap.share.bloodOnly", defaultValue: "Sang seulement", bundle: .main) }
    static var deniedTitle: String {
        String(localized: "locationMap.share.denied.title", defaultValue: "Meeshy n'a pas accès à ta position", bundle: .main)
    }
    static var deniedMessage: String {
        String(localized: "locationMap.share.denied.message", defaultValue: "Tu peux l'autoriser dans les réglages de ton téléphone.", bundle: .main)
    }
    static var openSettings: String {
        String(localized: "locationMap.share.denied.settings", defaultValue: "Ouvrir les réglages", bundle: .main)
    }
    static var precisionTitle: String { String(localized: "locationMap.share.precision", defaultValue: "Précision", bundle: .main) }
    static var city: String { String(localized: "locationMap.share.city", defaultValue: "Ville", bundle: .main) }
    static var neighborhood: String { String(localized: "locationMap.share.neighborhood", defaultValue: "Quartier", bundle: .main) }
    static var exact: String { String(localized: "locationMap.share.exact", defaultValue: "Exact", bundle: .main) }
    static var footnote: String {
        String(localized: "locationMap.share.footnote", defaultValue: "Tu peux arrêter à tout moment. Rien n'est gardé après.", bundle: .main)
    }

    static var battery: String {
        String(localized: "locationMap.share.battery", defaultValue: "Partager aussi ma batterie", bundle: .main)
    }
    static var batteryDetail: String {
        String(localized: "locationMap.share.battery.detail", defaultValue: "Pendant le partage seulement", bundle: .main)
    }
    static var optionsUnavailable: String {
        String(localized: "locationMap.share.optionsUnavailable",
               defaultValue: "Ta position est partagée, mais personne n'a été prévenu et ta batterie reste privée.", bundle: .main)
    }

    static func notify(names: [String]) -> String {
        guard names.count == 1, let name = names.first else {
            return String(localized: "locationMap.share.notify.many", defaultValue: "Les prévenir", bundle: .main)
        }
        return String(format: String(localized: "locationMap.share.notify", defaultValue: "Prévenir %@", bundle: .main), name)
    }

    static func notifyDetail(count: Int) -> String {
        guard count == 1 else {
            return String(localized: "locationMap.share.notify.detail.many", defaultValue: "Chacun reçoit une notification", bundle: .main)
        }
        return String(localized: "locationMap.share.notify.detail", defaultValue: "Il reçoit une notification", bundle: .main)
    }

    static func shareFor(_ duration: SharedLocationShareDuration) -> String {
        switch duration {
        case .oneHour: return String(localized: "locationMap.share.forOneHour", defaultValue: "Partager pendant 1 heure", bundle: .main)
        case .eightHours: return String(localized: "locationMap.share.forEightHours", defaultValue: "Partager pendant 8 heures", bundle: .main)
        }
    }

    static func visibleWithin(names: [String], meters: Double, locale: Locale) -> String {
        let radius = LocationMapCopy.distance(meters, locale: locale)
        guard names.count == 1, let name = names.first else {
            return String(format: String(localized: "locationMap.share.visibleWithin.many", defaultValue: "On te verra dans un rayon d'environ %@", bundle: .main), radius)
        }
        return String(format: String(localized: "locationMap.share.visibleWithin", defaultValue: "%1$@ te verra dans un rayon d'environ %2$@", bundle: .main), name, radius)
    }
}
