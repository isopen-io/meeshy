import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Partager ma position » sur la fiche d'un Ami (#16983, #19637, planche `Autre-Actions`) : une rangée du kit (K06),
/// teintée par l'accent de la fiche, qui ouvre la feuille où se choisissent la durée et ce que la personne voit. Son
/// sous-titre dit l'état du partage (« Ma position — non partagée », puis « Léo voit ta position (…) jusqu'à HH:MM ») et,
/// tant que ça dure, « Arrêter » (K40 danger) se pose en fin de rangée. La ligne ne paraît que dès Ami
/// (`ProfileCircleViewModel.offersSharedLocation`) ; la passerelle rejuge la loi à chaque envoi.
struct ProfileShareLocationRow: View {
    @ObservedObject private var center: SharedLocationSharingCenter
    let userId: String
    let displayName: String
    /// Le cercle commun, qui ouvre « Jusqu'à ce que j'arrête » entre Sangs (#19616) ; `nil` : la tuile reste verrouillée.
    let circle: RelationLevel?
    /// L'accent de la fiche ; sans lui, la couleur du cercle commun.
    let tint: Color?
    @State private var choosing = false
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    init(userId: String, displayName: String, circle: RelationLevel? = nil, tint: Color? = nil,
         center: SharedLocationSharingCenter = SharedLocationSharingHolder.center()) {
        self.userId = userId
        self.displayName = displayName
        self.circle = circle
        self.tint = tint
        _center = ObservedObject(wrappedValue: center)
    }

    var body: some View {
        let line = ProfileShareLocationLine.resolve(name: displayName, entry: center.entry(for: userId))
        MeeshyGroupCard {
            arrangement(line)
                .padding(.vertical, MeeshySpacing.xs)
        }
        .sheet(isPresented: $choosing) {
            ShareMyLocationSheet(recipients: [ShareMyLocationRecipient(userId: userId, name: displayName, circle: circle)],
                                 center: center)
        }
    }

    @ViewBuilder
    private func arrangement(_ line: ProfileShareLocationLine) -> some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                row(line)
                stopButton(line)
            }
        } else {
            HStack(spacing: 0) {
                row(line)
                stopButton(line)
            }
        }
    }

    private func row(_ line: ProfileShareLocationLine) -> some View {
        MeeshyToggleRow(line.title, systemImage: "mappin.and.ellipse", subtitle: line.subtitle, accessory: .chevron,
                        tint: accent, haptic: .none, action: {
                            HapticFeedback.medium()
                            choosing = true
                        })
            .disabled(center.isBusy)
            .accessibilityHint(ShareLocationWording.actionAccessibility(name: displayName))
            .accessibilityIdentifier("sharedLocation.share")
    }

    @ViewBuilder
    private func stopButton(_ line: ProfileShareLocationLine) -> some View {
        if line.offersStop {
            MeeshyButton(ShareLocationWording.stop, kind: .danger, size: .s44, action: {
                HapticFeedback.medium()
                Task { await stop() }
            })
            .disabled(center.isBusy)
            .padding(.horizontal, MeeshySpacing.lg)
            .accessibilityLabel(ShareLocationWording.stopAccessibility(name: displayName))
            .accessibilityIdentifier("sharedLocation.stop")
        }
    }

    private var accent: Color { Self.accent(tint: tint, circle: circle) }

    /// L'accent de la fiche quand elle en remet un, sinon la couleur du cercle commun.
    static func accent(tint: Color?, circle: RelationLevel?) -> Color {
        tint ?? LocationMapTint.color(for: circle)
    }

    private func stop() async {
        switch await center.stopSharing(with: userId) {
        case nil:
            return
        case .withdrawalPending:
            FeedbackToastManager.shared.showNotice(ShareLocationWording.problem(.withdrawalPending))
        case let problem?:
            FeedbackToastManager.shared.showError(ShareLocationWording.problem(problem))
        }
    }
}

/// La rangée « Partager ma position » en valeurs (#19637) : la personne en titre, l'état du partage en sous-titre, et
/// « Arrêter » offert tant qu'un partage court vers elle.
struct ProfileShareLocationLine: Equatable {
    let title: String
    let subtitle: String
    let offersStop: Bool

    static func resolve(name: String, entry: SharedLocationRoster.Entry?) -> ProfileShareLocationLine {
        guard let entry else {
            return ProfileShareLocationLine(title: LocationMapCopy.shareMineWith(name),
                                            subtitle: LocationMapCopy.myPosition(.notShared, name: name), offersStop: false)
        }
        return ProfileShareLocationLine(title: LocationMapCopy.shareMineWith(name),
                                        subtitle: ShareLocationWording.sharing(name: name, precision: entry.precision, until: entry.until),
                                        offersStop: true)
    }
}

/// Les phrases du partage de ma position, une clé par sens (sept langues dans `Localizable.xcstrings`). Les précisions
/// reprennent celles de la carte de réception, pour que l'émetteur et le lecteur lisent le même mot.
enum ShareLocationWording {
    static func actionAccessibility(name: String) -> String {
        String(format: String(localized: "sharedLocation.share.actionAccessibility", defaultValue: "Partager ma position avec %@", bundle: .main), name)
    }

    static func sheetTitle(name: String) -> String {
        String(format: String(localized: "sharedLocation.share.sheetTitle", defaultValue: "Ma position pour %@", bundle: .main), name)
    }

    static var durationTitle: String {
        String(localized: "sharedLocation.share.durationTitle", defaultValue: "Pendant", bundle: .main)
    }

    static func duration(_ duration: SharedLocationShareDuration) -> String {
        switch duration {
        case .oneHour: return String(localized: "sharedLocation.share.oneHour", defaultValue: "1 heure", bundle: .main)
        case .eightHours: return String(localized: "sharedLocation.share.eightHours", defaultValue: "8 heures", bundle: .main)
        }
    }

    static var precisionTitle: String {
        String(localized: "sharedLocation.share.precisionTitle", defaultValue: "Ce que la personne voit", bundle: .main)
    }

    static func precision(_ precision: SharedLocationPrecision) -> String {
        switch precision {
        case .exact: return String(localized: "circles.locations.precision.exact", defaultValue: "Position exacte", bundle: .main)
        case .neighborhood: return String(localized: "circles.locations.precision.neighborhood", defaultValue: "Au quartier près", bundle: .main)
        case .city: return String(localized: "circles.locations.precision.city", defaultValue: "À la ville près", bundle: .main)
        }
    }

    static func explain(name: String) -> String {
        String(format: String(localized: "sharedLocation.share.explain", defaultValue: "%@ voit ta position jusqu'à l'échéance ; tu peux l'arrêter depuis sa fiche.", bundle: .main), name)
    }

    /// Le détail technique (#18088) : l'échéance et l'arrêt restent au repos, la mise à jour passe derrière un (i).
    static var explainNote: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "sharedLocation.share.refresh.question", defaultValue: "Quand ma position se met-elle à jour ?", bundle: .main),
            text: String(localized: "sharedLocation.share.refresh.note", defaultValue: "Elle se met à jour quand Meeshy est ouvert.", bundle: .main)
        )
    }

    static var confirm: String {
        String(localized: "sharedLocation.share.confirm", defaultValue: "Partager", bundle: .main)
    }

    static func sharing(name: String, precision: SharedLocationPrecision, until: Date) -> String {
        guard !SharedLocationShareTerm.isOpenEnded(until) else { return sharingUntilStopped(name: name, precision: precision) }
        return String(
            format: String(localized: "sharedLocation.share.active", defaultValue: "%1$@ voit ta position (%2$@) jusqu'à %3$@", bundle: .main),
            name, Self.precision(precision).lowercased(), until.formatted(date: .omitted, time: .shortened)
        )
    }

    /// Un partage sans fin (#19616) : ni heure ni compte à rebours, seul « Arrêter » le termine.
    static func sharingUntilStopped(name: String, precision: SharedLocationPrecision) -> String {
        String(
            format: String(localized: "sharedLocation.share.activeUntilStopped",
                           defaultValue: "%1$@ voit ta position (%2$@) jusqu'à ce que tu arrêtes", bundle: .main),
            name, Self.precision(precision).lowercased()
        )
    }

    static var stop: String {
        String(localized: "sharedLocation.share.stop", defaultValue: "Arrêter", bundle: .main)
    }

    static func stopAccessibility(name: String) -> String {
        String(format: String(localized: "sharedLocation.share.stopAccessibility", defaultValue: "Arrêter de partager ma position avec %@", bundle: .main), name)
    }

    static func problem(_ problem: SharedLocationShareProblem) -> String {
        switch problem {
        case .locationDenied:
            return String(localized: "sharedLocation.share.denied", defaultValue: "Autorise la localisation dans Réglages pour partager ta position", bundle: .main)
        case .locationUnavailable:
            return String(localized: "sharedLocation.share.unavailable", defaultValue: "Position introuvable pour le moment, réessaie", bundle: .main)
        case .withdrawalPending:
            return String(localized: "sharedLocation.share.stopPending", defaultValue: "Le partage s'arrêtera dès le retour du réseau", bundle: .main)
        case .refused(.offline), .refused(.unconfirmed):
            return String(localized: "sharedLocation.share.offline", defaultValue: "Le partage de position a besoin du réseau", bundle: .main)
        case .refused(.rateLimited):
            return String(localized: "sharedLocation.share.rateLimited", defaultValue: "Trop d'envois, réessaie dans un instant", bundle: .main)
        case .refused:
            return String(localized: "sharedLocation.share.failed", defaultValue: "Le partage de position n'est pas parti, réessaie", bundle: .main)
        }
    }
}
