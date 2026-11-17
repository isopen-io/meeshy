import SwiftUI

/// Le bloc « En direct · Entre Proches » (#19416), fait du kit : l'en-tête K44 (point en direct, pastille K41 du
/// cercle), la tuile du lieu sur sa miniature (K34 + K36 fournie par l'app), la batterie sur sa jauge (K42) et le
/// téléphone. Hors ligne, il devient « Dernières infos · il y a 3 h », en tuiles périmées (pointillé, sans teinte).
public struct ProfileLiveBoardView<Map: View>: View {
    private let board: ProfileLiveBoard
    private let now: Date
    private let tint: Color
    private let map: Map?
    private let onOpenMap: (() -> Void)?

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    public init(board: ProfileLiveBoard, now: Date, tint: Color, map: Map?, onOpenMap: (() -> Void)?) {
        self.board = board
        self.now = now
        self.tint = tint
        self.map = map
        self.onOpenMap = onOpenMap
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: board.isStale ? ProfileVitrineCopy.staleTitle : ProfileVitrineCopy.liveTitle,
                                isLive: !board.isStale, lead: { EmptyView() }, accessory: { circleBadge })
            if let place = board.place { placeTile(place) }
            deviceTiles
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("profile.vitrine.live")
    }

    @ViewBuilder
    private var circleBadge: some View {
        if let age = board.staleAge {
            MeeshyBadge(.time(ProfileVitrineCopy.ago(age, now: now)), leading: .systemImage("clock"), size: .s28)
        } else {
            MeeshyBadge(.label(ProfileVitrineCopy.betweenClose), leading: .systemImage("flame.fill"), kind: .accent,
                        tint: tint, size: .s28)
        }
    }

    // MARK: Le lieu

    private func placeTile(_ place: ProfileLiveBoard.Place) -> some View {
        let detail = board.staleAge.map { ProfileVitrineCopy.measured(ProfileVitrineCopy.ago($0, now: now)) } ?? place.detail
        return MeeshyStatusTile(
            title: board.isStale ? ProfileVitrineCopy.lastPosition : ProfileVitrineCopy.position,
            systemImage: "mappin.and.ellipse",
            value: place.name,
            detail: detail,
            kind: .accent,
            tint: tint,
            isStale: board.isStale,
            hint: onOpenMap == nil ? nil : ProfileVitrineCopy.openMapHint,
            onPress: onOpenMap,
            hasMedia: map != nil,
            media: { map },
            footer: { EmptyView() }
        )
        .accessibilityIdentifier("profile.vitrine.live.place")
    }

    // MARK: La batterie et le téléphone

    @ViewBuilder
    private var deviceTiles: some View {
        if board.battery != nil || board.phone != nil {
            let layout = dynamicTypeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(spacing: MeeshySpacing.smPlus))
                : AnyLayout(HStackLayout(alignment: .top, spacing: MeeshySpacing.smPlus))
            layout {
                if let battery = board.battery { batteryTile(battery) }
                if let phone = board.phone { phoneTile(phone) }
            }
        }
    }

    private func batteryTile(_ battery: ProfileLiveBoard.Battery) -> some View {
        let value = ProfileVitrineCopy.percent(battery.level)
        let detail = board.isStale ? ProfileVitrineCopy.mayHaveChanged : (battery.isCharging ? ProfileVitrineCopy.charging : nil)
        return MeeshyStatusTile(
            title: ProfileVitrineCopy.battery,
            systemImage: battery.isCharging ? "battery.100.bolt" : Self.batteryGlyph(battery.level),
            value: value,
            detail: detail,
            kind: Self.batteryKind(battery.level),
            isStale: board.isStale
        ) {
            MeeshyMeter(value: Double(battery.level), total: 100, label: ProfileVitrineCopy.battery, spokenValue: value,
                        kind: Self.meterKind(battery.level), size: .s8, isStale: board.isStale)
        }
        .accessibilityIdentifier("profile.vitrine.live.battery")
    }

    private func phoneTile(_ phone: ProfileLiveBoard.Phone) -> some View {
        let tile: MeeshyStatusTile<EmptyView, EmptyView>
        switch phone {
        case .reachable:
            tile = MeeshyStatusTile(title: ProfileVitrineCopy.phone, systemImage: "antenna.radiowaves.left.and.right",
                                    value: ProfileVitrineCopy.reachable, detail: ProfileVitrineCopy.networkAvailable,
                                    kind: .ok, isStale: board.isStale, footer: { EmptyView() })
        case .unreachable(let since):
            tile = MeeshyStatusTile(title: ProfileVitrineCopy.phone, systemImage: "antenna.radiowaves.left.and.right.slash",
                                    value: ProfileVitrineCopy.unreachable,
                                    detail: ProfileVitrineCopy.ago(now.timeIntervalSince(since), now: now),
                                    kind: .warn, isStale: board.isStale, footer: { EmptyView() })
        }
        return tile.accessibilityIdentifier("profile.vitrine.live.phone")
    }

    static func batteryKind(_ level: Int) -> MeeshyStatusTileKind {
        level <= 10 ? .err : (level <= 20 ? .warn : .ok)
    }

    static func meterKind(_ level: Int) -> MeeshyMeterKind {
        level <= 10 ? .err : (level <= 20 ? .warn : .ok)
    }

    static func batteryGlyph(_ level: Int) -> String {
        switch level {
        case ..<13: return "battery.0"
        case ..<38: return "battery.25"
        case ..<63: return "battery.50"
        case ..<88: return "battery.75"
        default: return "battery.100"
        }
    }
}
