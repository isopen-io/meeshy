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
                ShareLocationChoiceSheet(displayName: displayName) { precision, duration in
                    choosing = false
                    Task { await share(precision: precision, duration: duration) }
                }
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

    private func share(precision: SharedLocationPrecision, duration: SharedLocationShareDuration) async {
        guard let problem = await center.share(with: userId, precision: precision, duration: duration) else {
            HapticFeedback.success()
            return
        }
        FeedbackToastManager.shared.showError(ShareLocationWording.problem(problem))
    }

    private func stop() async {
        guard let problem = await center.stopSharing(with: userId) else { return }
        FeedbackToastManager.shared.showError(ShareLocationWording.problem(problem))
    }
}

/// La feuille du choix : durée et précision, la ville par défaut (on ouvre plus, jamais l'inverse).
struct ShareLocationChoiceSheet: View {
    let displayName: String
    let onShare: (SharedLocationPrecision, SharedLocationShareDuration) -> Void
    @State private var precision: SharedLocationPrecision = .city
    @State private var duration: SharedLocationShareDuration = .oneHour
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker(ShareLocationWording.durationTitle, selection: $duration) {
                        ForEach(SharedLocationShareDuration.allCases, id: \.self) { Text(ShareLocationWording.duration($0)).tag($0) }
                    }
                    .pickerStyle(.segmented)
                } header: {
                    Text(ShareLocationWording.durationTitle)
                }
                Section {
                    Picker(ShareLocationWording.precisionTitle, selection: $precision) {
                        ForEach([SharedLocationPrecision.city, .neighborhood, .exact], id: \.self) {
                            Text(ShareLocationWording.precision($0)).tag($0)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                } header: {
                    Text(ShareLocationWording.precisionTitle)
                } footer: {
                    Text(ShareLocationWording.explain(name: displayName))
                }
            }
            .navigationTitle(ShareLocationWording.sheetTitle(name: displayName))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(ShareLocationWording.confirm) { onShare(precision, duration) }
                        .accessibilityIdentifier("sharedLocation.confirm")
                }
            }
        }
        .presentationDetents([.medium, .large])
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
        String(format: String(localized: "sharedLocation.share.explain", defaultValue: "%@ voit ta position jusqu'à l'échéance, puis plus rien ; elle se met à jour quand Meeshy est ouvert. Tu peux arrêter à tout moment depuis sa fiche.", bundle: .main), name)
    }

    static var confirm: String {
        String(localized: "sharedLocation.share.confirm", defaultValue: "Partager", bundle: .main)
    }

    static func sharing(name: String, precision: SharedLocationPrecision, until: Date) -> String {
        String(
            format: String(localized: "sharedLocation.share.active", defaultValue: "%1$@ voit ta position (%2$@) jusqu'à %3$@", bundle: .main),
            name, Self.precision(precision).lowercased(), until.formatted(date: .omitted, time: .shortened)
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
        case .refused(.offline):
            return String(localized: "sharedLocation.share.offline", defaultValue: "Le partage de position a besoin du réseau", bundle: .main)
        case .refused(.rateLimited):
            return String(localized: "sharedLocation.share.rateLimited", defaultValue: "Trop d'envois, réessaie dans un instant", bundle: .main)
        case .refused:
            return String(localized: "sharedLocation.share.failed", defaultValue: "Le partage de position n'est pas parti, réessaie", bundle: .main)
        }
    }
}
