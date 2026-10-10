import SwiftUI
import Combine
import MeeshySDK

/// **L'horloge des pastilles d'UNE surface** (#9737).
///
/// Le lecteur de story lit une horloge GLOBALE (`StoryReaderPlayheadState`) :
/// juste tant qu'un seul canvas joue, faux dans un fil où plusieurs scènes
/// vivent côte à côte. Chaque `MeeshyScenePlayer` tient donc la sienne, nourrie
/// par SON fil de position. Elle ne publie que l'APPARTENANCE — qui change aux
/// frontières de fenêtre, quelques fois par scène — jamais le temps (#7010).
@MainActor
public final class SceneSoundChipClock: ObservableObject {
    nonisolated deinit {}

    /// `nil` tant qu'aucune scène n'a été remise : la couche montre alors
    /// toutes les pastilles posées.
    @Published public private(set) var visibleIds: [String]?

    private var audios: [StoryAudioPlayerObject] = []
    private var slideDuration: TimeInterval = 0
    private var elapsed: TimeInterval = 0

    public init() {}

    public func configure(audios: [StoryAudioPlayerObject], slideDuration: TimeInterval) {
        self.audios = SceneAudioStageRule.stagedAudios(in: audios)
        self.slideDuration = slideDuration
        refresh()
    }

    public func tick(_ seconds: TimeInterval) {
        elapsed = max(0, seconds)
        guard !audios.isEmpty else { return }
        refresh()
    }

    private func refresh() {
        let ids = AudioForegroundReaderOverlay.visibleAudios(in: audios,
                                                             elapsed: elapsed,
                                                             slideDuration: slideDuration).map(\.id)
        guard ids != visibleIds else { return }
        visibleIds = ids
    }
}

/// **Les pastilles des sons de PREMIER PLAN d'une scène**, posées par-dessus
/// le canvas qui la joue (#9737) — le même composant que le lecteur de story
/// (`AudioForegroundChip`), la même règle (`SceneAudioStageRule`) : un son de
/// fond n'y paraît jamais.
///
/// La pastille est dessinée pour une scène de
/// `StoryAudioChipPainter.referenceCanvasWidth` points de large : la couche se
/// compose à cette largeur puis se réduit à celle de la surface, pour que la
/// pastille garde la même part de la scène sur une carte, une tuile ou un
/// plein écran — la projection que l'export applique déjà (`unit`).
@MainActor
public struct SceneSoundChipLayer: View {

    public let audios: [StoryAudioPlayerObject]
    /// Les pastilles dans leur fenêtre de lecture ; `nil` = la surface n'a pas
    /// d'horloge, toutes les pastilles posées se montrent (comme la couverture).
    public let visibleIds: [String]?
    public let slideDuration: TimeInterval?
    /// `false` sur une surface qui verrouille son muet (carte du fil) : la
    /// pastille ne prend aucun toucher, le geste reste à la carte.
    public let isInteractive: Bool
    /// Le son de la surface entière est coupé : la pastille se montre muette.
    public let isHostMuted: Bool

    @ObservedObject private var muteRegistry = StoryReaderAudioMuteRegistry.shared

    public init(audios: [StoryAudioPlayerObject],
                visibleIds: [String]? = nil,
                slideDuration: TimeInterval? = nil,
                isInteractive: Bool,
                isHostMuted: Bool) {
        self.audios = audios
        self.visibleIds = visibleIds
        self.slideDuration = slideDuration
        self.isInteractive = isInteractive
        self.isHostMuted = isHostMuted
    }

    /// Les pastilles que la couche pose — pur, extrait pour ses témoins.
    public nonisolated static func chips(in audios: [StoryAudioPlayerObject],
                                         visibleIds: [String]?) -> [StoryAudioPlayerObject] {
        let staged = SceneAudioStageRule.stagedAudios(in: audios)
        guard let visibleIds else { return staged }
        let visibles = Set(visibleIds)
        return staged.filter { visibles.contains($0.id) }
    }

    /// La scène de référence dans laquelle les pastilles se composent, et le
    /// facteur qui la ramène à la surface.
    public nonisolated static func referenceCanvas(for size: CGSize) -> (size: CGSize, unit: CGFloat) {
        let reference = StoryAudioChipPainter.referenceCanvasWidth
        guard size.width > 0, size.height > 0 else { return (.zero, 1) }
        let unit = size.width / reference
        return (CGSize(width: reference, height: size.height / unit), unit)
    }

    public var body: some View {
        let chips = Self.chips(in: audios, visibleIds: visibleIds)
        GeometryReader { geo in
            let canvas = Self.referenceCanvas(for: geo.size)
            ZStack {
                ForEach(chips, id: \.id) { audio in
                    AudioForegroundChip(
                        audioObject: .constant(audio),
                        canvasSize: canvas.size,
                        mode: .reader,
                        isSelected: false,
                        isUserMuted: isHostMuted || muteRegistry.isMuted(audio.id) || audio.isMuted,
                        slideDuration: slideDuration,
                        onTap: {
                            guard isInteractive else { return }
                            HapticFeedback.light()
                            StoryReaderAudioMuteRegistry.shared.toggle(audio.id)
                        }
                    )
                }
            }
            .frame(width: canvas.size.width, height: canvas.size.height)
            .scaleEffect(canvas.unit)
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .allowsHitTesting(isInteractive && !chips.isEmpty)
        .accessibilityHidden(!isInteractive)
    }
}

/// La couche, branchée sur l'horloge de SA surface : seul ce relais observe
/// l'horloge, donc seul lui se ré-évalue à une frontière de fenêtre.
@MainActor
struct ClockedSceneSoundChips: View {
    @ObservedObject var clock: SceneSoundChipClock
    let audios: [StoryAudioPlayerObject]
    let slideDuration: TimeInterval
    let isHostMuted: Bool

    private var configurationKey: String {
        audios.map { "\($0.id):\($0.startTime ?? 0):\($0.duration ?? -1)" }.joined(separator: "|")
            + "#\(slideDuration)"
    }

    var body: some View {
        SceneSoundChipLayer(audios: audios,
                            visibleIds: clock.visibleIds,
                            slideDuration: slideDuration,
                            isInteractive: true,
                            isHostMuted: isHostMuted)
            .task(id: configurationKey) {
                clock.configure(audios: audios, slideDuration: slideDuration)
            }
    }
}
