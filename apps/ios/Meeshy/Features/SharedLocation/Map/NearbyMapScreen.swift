import SwiftUI
import MeeshySDK
import MeeshyUI

/// TOUS MES PROCHES SUR LA CARTE (#18872, planche Carte-Proches). Chacun est son épingle (K36) à la précision qu'il m'a
/// donnée ; les puces (K04) ne montrent qu'un cercle ; la feuille basse range « Autour de toi » du plus près (K39, son
/// temps restant en anneau K09), puis ceux qui viennent d'arrêter, puis « Partager ma position » (K40) et qui me voit.
/// Toucher une épingle ou une rangée ouvre la carte de cette personne.
struct NearbyMapScreen: View {
    @StateObject private var model = SharedLocationsMapViewModel()
    @ObservedObject private var sharing: SharedLocationSharingCenter
    @StateObject private var places = LocationPlaceNamer()
    @State private var viewport: LocationMapViewport?
    @State private var focus: LocationMapFocus?
    @State private var filter: NearbyCircleFilter = .all
    @State private var sort: NearbySort = .nearest
    /// « Nouveau » à côté du titre tant que la carte de mes proches n'a jamais été ouverte sur cet appareil.
    @AppStorage("locationMap.nearby.opened") private var wasOpened = false
    @State private var showsNew = false
    @State private var me: SharedLocationFix?
    @State private var opened: ShareMyLocationRecipient?
    @State private var sharesMine = false
    @State private var sheetHeight: CGFloat = 0
    @Environment(\.dismiss) private var dismiss
    @Environment(\.locale) private var locale
    @Environment(\.horizontalSizeClass) private var sizeClass
    private var theme: ThemeManager { ThemeManager.shared }

    init(sharing: SharedLocationSharingCenter = SharedLocationSharingHolder.center()) {
        _sharing = ObservedObject(wrappedValue: sharing)
    }

    private var shown: [SharedLocationPin] {
        let placements = NearbyRules.arranged(model.pins.map { placement($0) }, filter: filter, sort: sort)
        return placements.compactMap { model.pin(for: $0.id) }
    }

    var body: some View {
        Group {
            if sizeClass == .regular {
                HStack(spacing: 0) {
                    ScrollView { sheetContent.padding(.top, MeeshySpacing.xxl) }
                        .frame(width: 380)
                    Divider()
                    mapStage
                }
            } else {
                mapStage.meeshyAnchoredSheet(
                    isPresented: .constant(true), height: .detents([0.42, 0.85], initial: 0), isDragDismissEnabled: false,
                    closeLabel: nil, surface: .dark, outside: .passesThrough
                ) { ScrollView { sheetContent } }
            }
        }
        .task { await appear() }
        .adaptiveOnChange(of: model.pins, initial: true) { _, pins in Task { await places.resolve(pins) } }
        .fullScreenCover(item: $opened) { person in
            PersonLocationMapScreen(userId: person.userId, displayName: person.name)
        }
        .sheet(isPresented: $sharesMine) {
            ShareMyLocationSheet(recipients: model.pins.map {
                ShareMyLocationRecipient(userId: $0.id, name: $0.name, circle: $0.circle)
            })
        }
    }

    // MARK: - La carte

    private var mapStage: some View {
        ZStack(alignment: .top) {
            LocationMapCanvas(focus: focus, onViewport: { viewport = $0 },
                              onRegionSettled: { model.regionChanged($0.bounds) })
                .ignoresSafeArea()
            LocationMapPinsLayer(viewport: viewport, pins: shown, me: me,
                                 meShare: LocationMapOwnShare.resolve(recipientIds: recipientIds, focusedUserId: nil),
                                 onSelect: { open($0) })
                .ignoresSafeArea()
            VStack(spacing: MeeshySpacing.md) {
                header
                filters
                sharingCapsule
            }
            .padding(.top, MeeshySpacing.sm)
            .frame(maxWidth: .infinity)
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    MeeshyGlassButton(systemImage: "scope", label: LocationMapCopy.recenter, size: .s44,
                                      action: { refocus(animated: true) })
                }
            }
            .padding(MeeshySpacing.lg)
            .padding(.bottom, sizeClass == .regular ? 0 : sheetHeight)
        }
        .onMeeshyAnchoredSheetFootprint { sheetHeight = $0?.height ?? 0 }
    }

    private var recipientIds: [String] { sharing.roster.pruned(now: Date()).recipients.map(\.userId) }

    private var header: some View {
        HStack(spacing: MeeshySpacing.md) {
            MeeshyGlassButton(systemImage: "chevron.left", label: LocationMapCopy.back, size: .s44, action: { dismiss() })
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                HStack(spacing: MeeshySpacing.sm) {
                    Text(LocationMapCopy.nearbyTitle).font(.headline.weight(.bold)).foregroundStyle(Color.white)
                    if showsNew {
                        MeeshyBadge(.label(LocationMapCopy.isNew), surface: .solid, kind: .accent)
                    }
                }
                Text(LocationMapCopy.nearbySubtitle(model.pins.count)).font(.caption).foregroundStyle(Color.white.opacity(0.75))
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.sm)
            .meeshyGlass(in: Capsule(), tone: .deep)
            Spacer()
            arrangeMenu
        }
        .padding(.horizontal, MeeshySpacing.lg)
    }

    /// L'entonnoir : l'ordre de « Autour de toi » et le cercle montré, les mêmes que les puces.
    private var arrangeMenu: some View {
        Menu {
            Picker(LocationMapCopy.sortLabel, selection: $sort) {
                ForEach(NearbySort.allCases, id: \.self) { item in Text(LocationMapCopy.sort(item)).tag(item) }
            }
            Picker(LocationMapCopy.filtersLabel, selection: $filter) {
                ForEach(NearbyCircleFilter.allCases, id: \.self) { item in
                    Text(item.level.map { CircleLevelNames.title(of: $0) } ?? LocationMapCopy.all).tag(item)
                }
            }
        } label: {
            MeeshyGlassButtonFace(systemImage: "line.3.horizontal.decrease", kind: filter == .all && sort == .nearest ? .normal : .active)
        }
        .accessibilityLabel(LocationMapCopy.sortLabel)
        .accessibilityValue("\(LocationMapCopy.sort(sort)), \(filter.level.map { CircleLevelNames.title(of: $0) } ?? LocationMapCopy.all)")
    }

    private var filters: some View {
        let counts = NearbyRules.counts(model.pins.map { placement($0) })
        return MeeshyChipRow(
            NearbyCircleFilter.allCases.map { item in
                MeeshyChip(id: item.rawValue, title: filterTitle(item, count: counts[item] ?? 0),
                           systemImage: item.level.map { PersonLocationCard.circleSymbol($0) })
            },
            selection: [filter.rawValue],
            label: LocationMapCopy.filtersLabel,
            mode: .single,
            surface: .onMedia,
            inset: MeeshySpacing.lg,
            onChange: { _, id in filter = NearbyCircleFilter(rawValue: id) ?? .all }
        )
    }

    private func filterTitle(_ filter: NearbyCircleFilter, count: Int) -> String {
        guard let level = filter.level else { return "\(LocationMapCopy.all) \(count)" }
        return CircleLevelNames.title(of: level)
    }

    @ViewBuilder
    private var sharingCapsule: some View {
        let recipients = sharing.roster.pruned(now: Date()).recipients.map(\.userId)
        if !recipients.isEmpty {
            let names = recipients.map { id in model.pin(for: id)?.name ?? LocationMapCopy.someone }
            MeeshyNote(LocationMapCopy.sharingWith(names, locale: locale), form: .live, kind: .ok, lead: .pulse)
                .padding(.horizontal, MeeshySpacing.lg)
        }
    }

    // MARK: - La feuille

    private var sheetContent: some View {
        TimelineView(.periodic(from: .now, by: 30)) { context in
            VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
                MeeshySectionHeader(title: LocationMapCopy.around, count: shown.count) {
                    EmptyView()
                } accessory: {
                    MeeshyBadge(.label(LocationMapCopy.sort(sort)), leading: .systemImage("arrow.up.arrow.down"),
                                surface: .outline, size: .s28)
                }
                aroundList(now: context.date)
                endedList
                MeeshyButton(LocationMapCopy.shareMyPosition, systemImage: "mappin.and.ellipse", kind: .accent,
                             width: .fill, disabledReason: model.pins.isEmpty ? LocationMapCopy.emptyTitle : nil,
                             action: { sharesMine = true })
                whoSeesMe
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.bottom, MeeshySpacing.xl)
        }
    }

    @ViewBuilder
    private func aroundList(now: Date) -> some View {
        if model.pins.isEmpty {
            MeeshyStateBlock(kind: .empty, title: LocationMapCopy.emptyTitle, message: LocationMapCopy.emptyMessage,
                             art: .glyph, size: .compact) {
                Image(systemName: "map")
            }
        } else if shown.isEmpty {
            MeeshyNote(LocationMapCopy.emptyFilter, lead: .systemImage("line.3.horizontal.decrease"))
        } else {
            VStack(spacing: 0) {
                ForEach(shown) { pin in
                    NearbyPersonRow(pin: pin, place: places.name(for: pin), distanceMeters: distance(to: pin), now: now,
                                    showsDivider: pin.id != shown.last?.id, onOpen: { open(pin.id) })
                }
            }
        }
    }

    @ViewBuilder
    private var endedList: some View {
        let ended = model.ended.filter { filter.admits($0.circle) && model.pin(for: $0.id) == nil }
        if !ended.isEmpty {
            MeeshySectionHeader(title: LocationMapCopy.notOnMap, form: .overline)
            VStack(spacing: 0) {
                ForEach(ended) { person in
                    MeeshyPersonRow(
                        title: person.name,
                        subtitle: LocationMapCopy.endedAgo(person.endedAt, locale: locale),
                        outfit: .muted,
                        showsDivider: person.id != ended.last?.id,
                        avatar: {
                            MeeshyAvatar(name: person.name, context: .custom(44),
                                         accentColor: DynamicColorGenerator.colorForName(person.name), avatarURL: person.avatarURL)
                        }
                    )
                }
            }
        }
    }

    private var whoSeesMe: some View {
        let count = sharing.roster.pruned(now: Date()).recipients.count
        return MeeshyNote(count == 0 ? LocationMapCopy.nobodySeesMe : LocationMapCopy.seenBy(count),
                          lead: .systemImage(count == 0 ? "eye.slash" : "eye"))
            .frame(maxWidth: .infinity)
    }

    // MARK: - Données

    private func placement(_ pin: SharedLocationPin) -> NearbyPlacement {
        NearbyPlacement(id: pin.id, circle: pin.circle, distanceMeters: distance(to: pin),
                        remaining: pin.deadline.timeIntervalSinceNow)
    }

    private func distance(to pin: SharedLocationPin) -> Double? {
        guard let me else { return nil }
        return LocationMapRules.distanceMeters(fromLatitude: me.latitude, fromLongitude: me.longitude,
                                               toLatitude: pin.latitude, toLongitude: pin.longitude)
    }

    private func open(_ userId: String) {
        guard let pin = model.pin(for: userId) else { return }
        opened = ShareMyLocationRecipient(userId: pin.id, name: pin.name, circle: pin.circle)
    }

    private func appear() async {
        showsNew = !wasOpened
        wasOpened = true
        me = LocationMapOwnPosition.lastKnown()
        await model.appeared()
        refocus(animated: false)
    }

    private func refocus(animated: Bool) {
        let people: [LocationMapSpot] = shown.map { (latitude: $0.latitude, longitude: $0.longitude, radiusMeters: $0.radiusMeters) }
        let mine: [LocationMapSpot] = me.map { [(latitude: $0.latitude, longitude: $0.longitude, radiusMeters: 0.0)] } ?? []
        guard let region = LocationMapRegion.fitting(people + mine) else { return }
        focus = LocationMapFocus(region: region, token: (focus?.token ?? 0) + 1, animated: animated)
    }
}

/// Une personne de « Autour de toi » : son nom et son cercle, le lieu servi et sa précision, la distance, le temps qui
/// reste en anneau (K09, décompte).
struct NearbyPersonRow: View {
    let pin: SharedLocationPin
    let place: String?
    let distanceMeters: Double?
    let now: Date
    let showsDivider: Bool
    let onOpen: () -> Void

    @Environment(\.locale) private var locale

    var body: some View {
        let window = SharedLocationWindow(deadline: pin.deadline, now: now)
        let subtitle = [place, LocationMapCopy.precisionWord(pin.precision)].compactMap { $0 }.joined(separator: " · ")
        MeeshyPersonRow(
            title: pin.name,
            subtitle: subtitle,
            meta: distanceMeters.map { LocationMapCopy.distance($0, locale: locale) },
            metaDetail: LocationMapCopy.remainingShort(window),
            levelImage: pin.circle.map { PersonLocationCard.circleSymbol($0) },
            levelLabel: pin.circle.map { CircleLevelNames.title(of: $0) },
            showsDivider: showsDivider,
            onPress: onOpen,
            avatar: { LocationMapPinAvatar(pin: pin, size: MeeshyPersonRowRecipe.avatarSize(for: .regular)) },
            trailing: {
                MeeshyProgressRing(progress: window.fraction, label: LocationMapCopy.remaining(window),
                                   diameter: 34, tint: .solid(LocationMapTint.color(for: pin.circle)), showsPercent: false)
            }
        )
    }
}
