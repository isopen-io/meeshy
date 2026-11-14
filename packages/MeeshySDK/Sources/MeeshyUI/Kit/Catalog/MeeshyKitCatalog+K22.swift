#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK22 = MeeshyKitCatalogEntry(
        key: "K22",
        name: "MeeshyTimelineFrise",
        states: [
            MeeshyKitCatalogState(id: "repos", boardView: "I3", backdrop: .dark),
            MeeshyKitCatalogState(id: "aimante", boardView: "S8", backdrop: .dark),
            MeeshyKitCatalogState(id: "choisie", boardView: "S9", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "zoomee", backdrop: .dark),
            MeeshyKitCatalogState(id: "verrouillee", backdrop: .dark),
            MeeshyKitCatalogState(id: "vide", backdrop: .dark),
            MeeshyKitCatalogState(id: "lecture-seule", backdrop: .dark),
            MeeshyKitCatalogState(id: "sans-tete", backdrop: .dark),
            MeeshyKitCatalogState(id: "desactivee", backdrop: .dark),
            MeeshyKitCatalogState(id: "theme", backdrop: .light),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK22(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyTimelineFriseSample(stateID: state.id, isPressed: isPressed)
    }
}

/// Le contenu de démonstration, fixe : une scène de 15 s, le Fond et le Son
/// verrouillés sur toute la durée, un Texte et un Sticker à trois images clés.
private enum MeeshyTimelineFriseSampleScene {
    static let duration: Double = 15

    static let tracks: [MeeshyTimelineFriseTrack] = [
        MeeshyTimelineFriseTrack(id: "fond", name: "Fond", systemImage: "photo", range: 0...15,
                                 height: .tall, isLocked: true, detail: "verrouillée"),
        MeeshyTimelineFriseTrack(id: "texte", name: "Texte", systemImage: "textformat", range: 2...7),
        MeeshyTimelineFriseTrack(
            id: "sticker", name: "Sticker", systemImage: "face.smiling", range: 4...9,
            keyframes: [.init(id: "k1", time: 4.05), .init(id: "k2", time: 6), .init(id: "k3", time: 7.95)],
            detail: "3 images clés"
        ),
        MeeshyTimelineFriseTrack(id: "son", name: "Son", systemImage: "waveform", range: 0...15,
                                 isLocked: true, detail: "verrouillée"),
    ]

    static let names = MeeshyTimelineFriseNames(
        frise: "Plan temps", playhead: "Tête de lecture", earlier: "Plus tôt", later: "Plus tard",
        entryEarlier: "Entrer plus tôt", entryLater: "Entrer plus tard",
        exitEarlier: "Sortir plus tôt", exitLater: "Sortir plus tard",
        start: "Début", end: "Fin", zoomIn: "Zoomer", zoomOut: "Dézoomer", zoomHint: "Pincer pour zoomer"
    )

    static func text(_ time: Double, _ style: MeeshyTimelineFriseTimeStyle) -> String {
        let tenths = Int((time * 10).rounded())
        let decimal = "\(tenths / 10),\(tenths % 10)"
        switch style {
        case .ruler: return "\(Int(time.rounded())) s"
        case .snap: return "aimanté · \(decimal) s"
        case .spoken: return "\(decimal) secondes"
        }
    }

    static func held(for stateID: String, isPressed: Bool) -> MeeshyTimelineFriseHeld? {
        switch stateID {
        case "aimante":
            return MeeshyTimelineFriseHeld(trackID: "texte", part: .move, preview: .init(range: 4...9, snappedTime: 9), isIgnored: false)
        case "choisie" where isPressed:
            return MeeshyTimelineFriseHeld(trackID: "sticker", part: .end, preview: .init(range: 4...10.5, snappedTime: nil), isIgnored: false)
        default:
            return nil
        }
    }

    static func selection(for stateID: String) -> String? {
        switch stateID {
        case "choisie", "lecture-seule", "desactivee", "theme": return "sticker"
        case "aimante": return "texte"
        case "verrouillee": return "fond"
        default: return nil
        }
    }
}

/// L'échantillon d'un état : la vraie frise, vivante (choisir, glisser, tirer,
/// pincer), figée « tenue » pour les tuiles aimantée et pressée.
private struct MeeshyTimelineFriseSample: View {
    let stateID: String
    let isPressed: Bool

    @State private var tracks: [MeeshyTimelineFriseTrack]
    @State private var selectedID: String?
    @StateObject private var clock: PlayheadClock

    private static let width: CGFloat = 372

    init(stateID: String, isPressed: Bool) {
        self.stateID = stateID
        self.isPressed = isPressed
        _tracks = State(initialValue: stateID == "vide" ? [] : MeeshyTimelineFriseSampleScene.tracks)
        _selectedID = State(initialValue: MeeshyTimelineFriseSampleScene.selection(for: stateID))
        _clock = StateObject(wrappedValue: Self.makeClock(at: MeeshyTimelineFriseSampleScene.duration * 0.3))
    }

    private static func makeClock(at time: Double) -> PlayheadClock {
        let clock = PlayheadClock()
        clock.move(to: Float(time))
        return clock
    }

    var body: some View {
        frise
            .frame(width: Self.width)
            .meeshyGlassTone(stateID == "theme" ? .theme : .deep)
            .environment(\.meeshyTimelineFriseForcedHeld, MeeshyTimelineFriseSampleScene.held(for: stateID, isPressed: isPressed))
            .environment(\.meeshyTimelineFriseForcedViewport, stateID == "zoomee" ? MeeshyTimelineFriseViewport(start: 3, span: 6) : nil)
            .disabled(stateID == "desactivee")
    }

    private var frise: some View {
        MeeshyTimelineFrise(
            MeeshyTimelineFriseSampleScene.names,
            tracks: tracks,
            duration: MeeshyTimelineFriseSampleScene.duration,
            minimumSpan: 0.3,
            selectedID: selectedID,
            onSelect: { id, time in
                selectedID = id
                if let time { clock.move(to: Float(time)) }
            },
            playhead: stateID == "sans-tete" ? nil : clock,
            onSeek: { clock.move(to: Float($0)) },
            onWindowCommit: stateID == "lecture-seule" ? nil : commit,
            onKeyframe: { _, _ in },
            timeText: MeeshyTimelineFriseSampleScene.text,
            content: { MeeshyTimelineFriseSampleContent(track: $0) },
            transport: { transport },
            empty: { emptyState }
        )
    }

    private func commit(_ id: String, _ range: ClosedRange<Double>, _ part: MeeshyTimelineFrisePart) {
        tracks = tracks.map { track in
            guard track.id == id else { return track }
            let shift = range.lowerBound - track.range.lowerBound
            return MeeshyTimelineFriseTrack(
                id: track.id, name: track.name, systemImage: track.systemImage, range: range, height: track.height,
                isLocked: track.isLocked,
                keyframes: part == .move ? track.keyframes.map { MeeshyTimelineFriseKey(id: $0.id, time: $0.time + shift) } : track.keyframes,
                detail: track.detail
            )
        }
    }

    @ViewBuilder
    private var transport: some View {
        if stateID == "repos" {
            Text("0:04 / 0:15")
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .bold).monospacedDigit())
                .foregroundStyle(MeeshyColors.onMedia)
        }
    }

    private var emptyState: some View {
        Text("Posez un texte ou un sticker : chaque objet devient une piste.")
            .font(MeeshyFont.relative(MeeshyFont.smallSize))
            .foregroundStyle(MeeshyColors.onMediaSecondary)
            .padding(.vertical, MeeshySpacing.xs)
    }
}

/// Le contenu de l'hôte : vignettes du Fond, onde du Son, le Texte et le
/// Sticker écrits dans leur barre, aux teintes du design system.
private struct MeeshyTimelineFriseSampleContent: View {
    let track: MeeshyTimelineFriseTrack

    private static let samples: [CGFloat] = (0..<48).map { index in
        0.25 + 0.7 * abs(CGFloat(sin(Double(index) * 0.7) * cos(Double(index) * 0.23)))
    }

    var body: some View {
        switch track.id {
        case "fond": tiles
        case "son": wave
        case "sticker": caption("🔥", tint: MeeshyColors.amber500)
        default: caption("Bonjour", tint: MeeshyColors.brandPrimary)
        }
    }

    private var tiles: some View {
        HStack(spacing: 0) {
            ForEach(0..<8, id: \.self) { index in
                LinearGradient(
                    colors: [index.isMultiple(of: 2) ? MeeshyColors.indigo500 : MeeshyColors.purple500, MeeshyColors.indigo300],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            }
        }
    }

    private var wave: some View {
        GeometryReader { proxy in
            HStack(alignment: .center, spacing: 1) {
                ForEach(Self.samples.indices, id: \.self) { index in
                    Capsule()
                        .fill(MeeshyColors.onMedia.opacity(0.7))
                        .frame(height: max(2, proxy.size.height * 0.8 * Self.samples[index]))
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .background(MeeshyColors.success.opacity(0.6))
    }

    private func caption(_ text: String, tint: Color) -> some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
            .foregroundStyle(MeeshyColors.onMedia)
            .lineLimit(1)
            .padding(.horizontal, MeeshySpacing.sm)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .background(tint.opacity(0.85))
    }
}
#endif
