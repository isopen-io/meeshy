#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK21 = MeeshyKitCatalogEntry(
        key: "K21",
        name: "MeeshyTrimTrack",
        states: [
            MeeshyKitCatalogState(id: "onde", boardView: "A15", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "vignettes", boardView: "O8", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "nue", boardView: "C2", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "entiere", backdrop: .dark),
            MeeshyKitCatalogState(id: "precision", backdrop: .dark),
            MeeshyKitCatalogState(id: "retrait", backdrop: .dark),
            MeeshyKitCatalogState(id: "non-coupable", backdrop: .dark),
            MeeshyKitCatalogState(id: "sans-tete", backdrop: .dark),
            MeeshyKitCatalogState(id: "sans-releve", backdrop: .dark),
            MeeshyKitCatalogState(id: "desactivee", backdrop: .dark),
            MeeshyKitCatalogState(id: "theme", backdrop: .light, isTouchable: true),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK21(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyTrimTrackSample(stateID: state.id, isPressed: isPressed)
    }
}

/// Ce que l'hôte passerait à la piste pour un état du catalogue.
private nonisolated struct MeeshyTrimTrackSampleSetting: Sendable, Equatable {
    let duration: Double
    let range: ClosedRange<Double>
    let playhead: Double?
    let keptLabel: String?
    let isTall: Bool

    static func setting(for stateID: String) -> MeeshyTrimTrackSampleSetting {
        switch stateID {
        case "vignettes", "nue": return .init(duration: 12, range: 2...9, playhead: 4, keptLabel: "Gardé", isTall: true)
        case "entiere": return .init(duration: 48, range: 0...48, playhead: 12, keptLabel: "Gardé", isTall: false)
        case "non-coupable": return .init(duration: 0.3, range: 0...0.3, playhead: 0.1, keptLabel: "Gardé", isTall: false)
        case "retrait": return .init(duration: 48, range: 18...33, playhead: 40, keptLabel: "Retiré", isTall: false)
        case "sans-tete": return .init(duration: 48, range: 18...33, playhead: nil, keptLabel: "Extrait", isTall: false)
        case "sans-releve": return .init(duration: 48, range: 18...33, playhead: 24, keptLabel: nil, isTall: false)
        default: return .init(duration: 48, range: 18...33, playhead: 24, keptLabel: "Extrait", isTall: false)
        }
    }
}

/// L'échantillon d'un état : la vraie piste, vivante (les poignées et la tête se
/// glissent), figée « tenue » pour la tuile du même nom. Le contenu est
/// déterministe — aucune image n'est embarquée.
private struct MeeshyTrimTrackSample: View {
    let stateID: String
    let isPressed: Bool

    @State private var range: ClosedRange<Double>
    @State private var playhead: Double?
    private let setting: MeeshyTrimTrackSampleSetting

    private static let width: CGFloat = 320

    init(stateID: String, isPressed: Bool) {
        let setting = MeeshyTrimTrackSampleSetting.setting(for: stateID)
        self.stateID = stateID
        self.isPressed = isPressed
        self.setting = setting
        _range = State(initialValue: setting.range)
        _playhead = State(initialValue: setting.playhead)
    }

    var body: some View {
        track
            .frame(width: Self.width)
            .meeshyGlassTone(stateID == "theme" ? .theme : .deep)
            .environment(\.meeshyTrimTrackForcesHeld, heldPart)
            .environment(\.meeshyTrimTrackForcesPrecise, stateID == "precision")
            .disabled(stateID == "desactivee")
    }

    private var track: some View {
        MeeshyTrimTrack(
            Self.names,
            range: $range,
            duration: setting.duration,
            minimumSpan: 0.4,
            timeText: Self.text,
            keptText: setting.keptLabel.map { "\($0) \(Self.text(range.upperBound - range.lowerBound, .clock))" },
            playhead: setting.playhead == nil ? nil : playhead,
            onSeek: seek,
            selection: stateID == "retrait" ? .removed : .kept,
            height: setting.isTall ? .tall : .regular
        ) {
            MeeshyTrimTrackSampleContent(isTall: setting.isTall)
        }
    }

    private var heldPart: MeeshyTrimTrackPart? {
        stateID == "precision" || isPressed ? MeeshyTrimTrackPart.start : nil
    }

    private var seek: ((Double) -> Void)? {
        guard setting.playhead != nil else { return nil }
        return { playhead = $0 }
    }

    private static let names = MeeshyTrimTrackNames(
        track: "Piste de coupe", start: "Début", end: "Fin", playhead: "Tête de lecture",
        precisionHint: "Maintenir pour régler à la milliseconde"
    )

    private static func text(_ time: Double, _ style: MeeshyTrimTrackTimeStyle) -> String {
        let total = Int(time.rounded(.down))
        let base = "\(total / 60):" + (total % 60 < 10 ? "0" : "") + "\(total % 60)"
        guard style != .clock else { return base }
        let thousandths = Int(((time - Double(total)) * 1000).rounded())
        return base + "." + String(repeating: "0", count: max(0, 3 - "\(thousandths)".count)) + "\(thousandths)"
    }
}

/// Le contenu de l'hôte : une onde, ou des vignettes avec l'onde dessous.
private struct MeeshyTrimTrackSampleContent: View {
    let isTall: Bool

    private static let samples: [CGFloat] = (0..<64).map { index in
        0.25 + 0.7 * abs(CGFloat(sin(Double(index) * 0.7) * cos(Double(index) * 0.23)))
    }
    private static let tiles = 12
    private static let waveHeight: CGFloat = 16

    var body: some View {
        if isTall {
            VStack(spacing: 0) {
                HStack(spacing: 0) {
                    ForEach(0..<Self.tiles, id: \.self) { index in
                        LinearGradient(
                            colors: [index.isMultiple(of: 2) ? MeeshyColors.indigo500 : MeeshyColors.purple500, MeeshyColors.indigo300],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        )
                    }
                }
                wave.frame(height: Self.waveHeight)
            }
        } else {
            wave.padding(.vertical, MeeshySpacing.sm)
        }
    }

    private var wave: some View {
        GeometryReader { proxy in
            HStack(alignment: .center, spacing: 1) {
                ForEach(Self.samples.indices, id: \.self) { index in
                    Capsule()
                        .fill(MeeshyColors.onMedia.opacity(0.7))
                        .frame(height: max(2, proxy.size.height * Self.samples[index]))
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
    }
}
#endif
