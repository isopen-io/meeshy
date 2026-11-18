import SwiftUI
import MeeshySDK
import MeeshyUI

/// « OÙ IL EST » (#18872, planche Autre-Actions, anatomie de K43) : sur la face Actions de la fiche d'une personne qui
/// me partage sa position, une carte (K43) — la miniature du lieu SERVI avec son avatar en épingle (K36) et son flou,
/// le lieu nommé à la précision servie, « Précision quartier · encore 42 min », « Voir sur la carte » et « Itinéraire »
/// (K40), puis « Partager ma position avec Léo » (K06). Elle se peint depuis le magasin des positions (cache d'abord) ;
/// l'heure qui passe se relit toutes les quinze secondes, sans réseau.
struct ProfileWhereCard: View {
    let userId: String
    let displayName: String
    let openMap: () -> Void

    @StateObject private var model = SharedLocationsMapViewModel()
    @StateObject private var places = LocationPlaceNamer()
    @StateObject private var circle: ProfileCircleViewModel
    @ObservedObject private var sharing = SharedLocationSharingHolder.center()
    @State private var sharesMine = false
    @Environment(\.meeshyHasKeyboard) private var hasKeyboard

    init(userId: String, displayName: String, openMap: @escaping () -> Void) {
        self.userId = userId
        self.displayName = displayName
        self.openMap = openMap
        _circle = StateObject(wrappedValue: ProfileCircleModels.model(for: userId))
    }

    /// La fiche ne pose « Où il est » que si la personne me partage sa position : la même lecture décide de la
    /// section et retire de « Notre cercle » la rangée « Partager ma position », que la carte porte alors.
    static func isShown(for userId: String) -> Bool {
        SharedLocationsLiveHolder.live().byUser[userId] != nil
    }

    private var pin: SharedLocationPin? { model.pin(for: userId) }

    var body: some View {
        Group {
            if let pin {
                TimelineView(.periodic(from: .now, by: 15)) { context in card(pin, now: context.date) }
            } else {
                MeeshyGroupCard {
                    VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                        MeeshyNote(LocationMapCopy.notSharingTitle(name: displayName), lead: .dot)
                        shareRow
                    }
                    .padding(.vertical, MeeshySpacing.md)
                }
            }
        }
        .task { await model.appeared() }
        .adaptiveOnChange(of: model.pins, initial: true) { _, pins in
            Task { await places.resolve(pins.filter { $0.id == userId }) }
        }
        .sheet(isPresented: $sharesMine) {
            ShareMyLocationSheet(recipients: [ShareMyLocationRecipient(userId: userId, name: displayName, circle: pin?.circle)])
        }
    }

    // MARK: - La carte

    private func card(_ pin: SharedLocationPin, now: Date) -> some View {
        let tint = LocationMapTint.color(for: pin.circle)
        let place = places.name(for: pin)
        let detail = LocationMapCopy.whereDetail(pin.precision, window: SharedLocationWindow(deadline: pin.deadline, now: now))
        let spoken = place.map { LocationMapCopy.whereLabel(name: displayName, place: $0, detail: detail) }
            ?? [displayName, detail].joined(separator: ", ")
        return MeeshyGroupCard(
            layout: .preview, tint: tint,
            accessory: { EmptyView() },
            media: { ProfileWhereMiniature(pin: pin, onTap: openMap) },
            emblem: { EmptyView() },
            content: {
                VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
                    VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                        Text(place ?? displayName)
                            .meeshyScaledFont(18, weight: .semibold)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(detail)
                            .meeshyScaledFont(13)
                            .foregroundStyle(ThemeManager.shared.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(spoken)
                    MeeshyButtonPair {
                        openMapButton(tint: tint)
                    } secondary: {
                        MeeshyButton(LocationMapCopy.directions, systemImage: "location.north.fill", kind: .tinted,
                                     size: .s44, width: .fill, tint: tint,
                                     action: { PersonLocationMapScreen.openDirections(to: pin) })
                    }
                }
                .padding(EdgeInsets(top: MeeshySpacing.lg, leading: MeeshySpacing.lg, bottom: MeeshySpacing.md,
                                    trailing: MeeshySpacing.lg))
                if showsShareRow {
                    Divider().padding(.horizontal, MeeshySpacing.lg)
                    shareRow.padding(.horizontal, MeeshySpacing.sm)
                }
            },
            footer: { EmptyView() }
        )
    }

    /// « Voir sur la carte » montre sa touche ⌘M (K55) quand un clavier est branché sur iPad : la même valeur que la
    /// frappe que la section « Où il est » reconnaît (#19515). Sans clavier, le bouton ne réserve aucune place.
    @ViewBuilder
    private func openMapButton(tint: Color) -> some View {
        if hasKeyboard {
            MeeshyButton(LocationMapCopy.openMap, systemImage: "map", kind: .accent, size: .s44, width: .fill,
                         tint: tint, action: openMap) {
                MeeshyKeyHint(keys: ProfileKeyShortcuts.map, context: .inset, surface: .onAccent)
            }
        } else {
            MeeshyButton(LocationMapCopy.openMap, systemImage: "map", kind: .accent, size: .s44, width: .fill,
                         tint: tint, action: openMap)
        }
    }

    // MARK: - Ma position

    private var showsShareRow: Bool {
        sharing.showsRow(for: userId, offered: circle.offersSharedLocation)
    }

    @ViewBuilder
    private var shareRow: some View {
        if showsShareRow {
            let share = LocationMapOwnShare.resolve(recipientIds: sharing.roster.pruned(now: Date()).recipients.map(\.userId),
                                                    focusedUserId: userId)
            MeeshyToggleRow(LocationMapCopy.shareMineWith(displayName), systemImage: "mappin.and.ellipse",
                            subtitle: LocationMapCopy.myPosition(share, name: displayName), accessory: .chevron,
                            tint: LocationMapTint.color(for: pin?.circle), action: { sharesMine = true })
                .accessibilityIdentifier("profile.where.shareMine")
        }
    }
}

/// La miniature du lieu SERVI (K36 sur son fond de carte) : le lieu et son flou, sans geste sur la carte elle-même —
/// la carte s'ouvre d'un toucher quand l'hôte le demande. Partagée par « Où il est » et « En direct » (#19416).
struct ProfileWhereMiniature: View {
    let pin: SharedLocationPin
    var height: CGFloat = 140
    var onTap: (() -> Void)?

    @State private var viewport: LocationMapViewport?

    var body: some View {
        let spot: LocationMapSpot = (latitude: pin.latitude, longitude: pin.longitude, radiusMeters: pin.radiusMeters)
        let focus = LocationMapRegion.fitting([spot], margin: 2.6).map {
            LocationMapFocus(region: $0, token: Self.token(of: pin), animated: false)
        }
        return ZStack {
            LocationMapCanvas(focus: focus, onViewport: { viewport = $0 })
            LocationMapPinsLayer(viewport: viewport, pins: [pin], selectedId: pin.id)
        }
        .allowsHitTesting(false)
        .frame(height: height)
        .clipped()
        .overlay {
            if let onTap {
                Color.clear.contentShape(Rectangle()).onTapGesture(perform: onTap)
            }
        }
        .accessibilityHidden(true)
    }

    /// La miniature se recadre quand la position servie bouge, jamais à chaque image.
    static func token(of pin: SharedLocationPin) -> Int {
        var hasher = Hasher()
        hasher.combine((pin.latitude * 10_000).rounded())
        hasher.combine((pin.longitude * 10_000).rounded())
        hasher.combine(pin.radiusMeters)
        return hasher.finalize()
    }
}
