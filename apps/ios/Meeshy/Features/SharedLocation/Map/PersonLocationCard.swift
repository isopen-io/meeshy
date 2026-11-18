import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce que la feuille d'une personne sur la carte sait faire : l'hôte (la fiche) fournit écrire et appeler.
struct PersonLocationActions {
    var onWrite: (() -> Void)?
    var onCall: (() -> Void)?
    var onShareMine: () -> Void
    var onDirections: () -> Void
    var onHistory: (() -> Void)?
    /// « Demander à prolonger » (#19476) : absent tant que la demande n'est pas offerte pour cette personne.
    var onAskExtend: (() -> Void)?
    var hasAskedExtend = false
}

/// LA FICHE DEVENUE FEUILLE BASSE (#18872, planche Carte-Personne) : qui (K39 et son cercle en K41), où (le lieu
/// servi), depuis quand (la fraîcheur en K46), pour combien de temps encore (K42), et quoi faire (K32). Tout se lit
/// sur la position SERVIE ; l'heure qui passe se relit toutes les quinze secondes, sans réseau.
struct PersonLocationCard: View {
    let pin: SharedLocationPin
    let place: String?
    let distanceMeters: Double?
    let actions: PersonLocationActions

    @Environment(\.locale) private var locale
    private var theme: ThemeManager { ThemeManager.shared }
    private var tint: Color { LocationMapTint.color(for: pin.circle) }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 15)) { context in
            VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
                header
                freshness(now: context.date)
                meter(now: context.date)
                actionsGrid
                askExtendRow
            }
        }
    }

    private var header: some View {
        MeeshyPersonRow(
            title: pin.name,
            subtitle: place ?? LocationMapCopy.precisionWord(pin.precision),
            size: .header,
            showsDivider: false,
            avatar: { LocationMapPinAvatar(pin: pin, size: MeeshyPersonRowRecipe.avatarSize(for: .header)) },
            trailing: { circleBadge }
        )
    }

    @ViewBuilder
    private var circleBadge: some View {
        if let circle = pin.circle {
            MeeshyBadge(.label(CircleLevelNames.title(of: circle)), leading: .systemImage(Self.circleSymbol(circle)),
                        surface: .outline, tint: tint, size: .s28)
        }
    }

    private func freshness(now: Date) -> some View {
        let fresh = SharedLocationFreshness(updatedAt: pin.updatedAt, now: now)
        let isLive: Bool = { if case .live = fresh { return true } else { return false } }()
        return MeeshyNote(LocationMapCopy.freshness(fresh), kind: isLive ? .ok : .neutral, lead: isLive ? .pulse : .dot)
    }

    private func meter(now: Date) -> some View {
        let window = SharedLocationWindow(deadline: pin.deadline, now: now)
        return MeeshyMeter(
            value: window.remaining, total: window.total,
            label: LocationMapCopy.sharedFor(window),
            spokenValue: LocationMapCopy.remaining(window),
            kind: window.fraction < 0.15 ? .warn : .accent,
            tint: tint,
            title: LocationMapCopy.sharedFor(window),
            valueText: LocationMapCopy.remaining(window),
            leading: { Image(systemName: "timer").foregroundStyle(theme.textSecondary).accessibilityHidden(true) },
            trailing: { EmptyView() }
        )
    }

    private var actionsGrid: some View {
        MeeshyActionGrid(columns: .fixed(4)) {
            MeeshyLabeledAction(title: LocationMapCopy.directions, systemImage: "location.north.fill",
                                value: distanceMeters.map { LocationMapCopy.distance($0, locale: locale) },
                                kind: .active, tint: tint, action: actions.onDirections)
            if let onWrite = actions.onWrite {
                MeeshyLabeledAction(title: LocationMapCopy.write, systemImage: "bubble.left", tint: tint, action: onWrite)
            }
            if let onCall = actions.onCall {
                MeeshyLabeledAction(title: LocationMapCopy.call, systemImage: "phone", tint: tint, action: onCall)
            }
            MeeshyLabeledAction(title: LocationMapCopy.shareMine, systemImage: "mappin.and.ellipse", tint: tint,
                                action: actions.onShareMine)
            if let onHistory = actions.onHistory {
                MeeshyLabeledAction(title: LocationMapCopy.history, systemImage: "clock.arrow.circlepath", tint: tint,
                                    action: onHistory)
            }
        }
    }

    /// Sous les actions, une rangée K06 : le geste se voit aussitôt « Demandé », puis ne se rejoue plus.
    @ViewBuilder
    private var askExtendRow: some View {
        if let onAskExtend = actions.onAskExtend {
            MeeshyToggleRow(SharedLocationAskWording.extend, systemImage: "hourglass",
                            accessory: actions.hasAskedExtend ? .value(SharedLocationAskWording.asked) : .chevron,
                            tint: tint, action: onAskExtend)
                .disabled(actions.hasAskedExtend)
                .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xl), tone: .theme)
                .accessibilityIdentifier("locationMap.person.askExtend")
        }
    }

    /// Le vocabulaire fixe des cercles (brief § 4) : poignée de main, flamme, goutte.
    static func circleSymbol(_ circle: RelationLevel) -> String {
        switch circle {
        case .blood: return "drop.fill"
        case .close: return "flame.fill"
        case .friend: return "hands.clap.fill"
        default: return "person.2.fill"
        }
    }
}
