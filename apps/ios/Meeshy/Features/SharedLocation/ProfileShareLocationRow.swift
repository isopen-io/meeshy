import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Partager ma position » sur la fiche d'un Ami (#16983, iso de la réception `SharedLocationsMapSection`) : la durée
/// (1 h, 8 h) et ce que la personne voit (la ville par défaut, le quartier, l'endroit exact) se choisissent dans une
/// feuille, puis la ligne dit « Elle voit ta position · jusqu'à HH:MM » et « Arrêter » d'un geste, tant que ça dure.
/// La ligne ne paraît que dès Ami (`ProfileCircleViewModel.offersSharedLocation`) ; la passerelle rejuge la loi à chaque envoi.
struct ProfileShareLocationRow: View {
    @ObservedObject private var center: SharedLocationSharingCenter
    let userId: String
    let displayName: String
    @State private var choosing = false
    private var theme: ThemeManager { ThemeManager.shared }

    init(userId: String, displayName: String, center: SharedLocationSharingCenter = SharedLocationSharingHolder.center()) {
        self.userId = userId
        self.displayName = displayName
        _center = ObservedObject(wrappedValue: center)
    }

    var body: some View {
        content
            .padding(MeeshySpacing.md)
            .background(MeeshyColors.indigo500.opacity(MeeshyOpacity.subtle))
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
            .sheet(isPresented: $choosing) {
                ShareMyLocationSheet(recipients: [ShareMyLocationRecipient(userId: userId, name: displayName, circle: nil)],
                                     center: center)
            }
    }

    @ViewBuilder
    private var content: some View {
        if let entry = center.entry(for: userId) {
            HStack(spacing: MeeshySpacing.md) {
                Text("📍 " + ShareLocationWording.sharing(name: displayName, precision: entry.precision, until: entry.until))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(theme.textPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                Button(ShareLocationWording.stop) {
                    HapticFeedback.medium()
                    Task { await stop() }
                }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(theme.error)
                .frame(minHeight: MeeshyControlSize.tapTarget)
                .disabled(center.isBusy)
                .accessibilityLabel(ShareLocationWording.stopAccessibility(name: displayName))
                .accessibilityIdentifier("sharedLocation.stop")
            }
        } else {
            Button {
                HapticFeedback.medium()
                choosing = true
            } label: {
                HStack(spacing: MeeshySpacing.sm) {
                    Image(systemName: "location.fill")
                        .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    Text(ShareLocationWording.action)
                        .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                }
                .foregroundStyle(MeeshyColors.indigo500)
                .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.tapTarget)
            }
            .buttonStyle(.plain)
            .disabled(center.isBusy)
            .accessibilityLabel(ShareLocationWording.actionAccessibility(name: displayName))
            .accessibilityIdentifier("sharedLocation.share")
        }
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

/// Les phrases du partage de ma position, une clé par sens (sept langues dans `Localizable.xcstrings`). Les précisions
/// reprennent celles de la carte de réception, pour que l'émetteur et le lecteur lisent le même mot.
enum ShareLocationWording {
    static var action: String {
        String(localized: "sharedLocation.share.action", defaultValue: "Partager ma position", bundle: .main)
    }

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
