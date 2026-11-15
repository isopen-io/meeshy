import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Le curseur d'une scène dans la galerie plein écran (#8598)
//
// Demande porteur du 2026-09-28 : « Lorsqu'on ouvre un post qui a une scène qui
// a une timeline, j'aimerais avoir le curseur de contrôle des scènes qui
// s'ouvre ! »
//
// La galerie savait parcourir une VIDÉO (la barre du SDK, au couloir de
// transport, #6162) ; elle ne savait pas parcourir une SCÈNE : sa pièce
// synthétique n'avait pas de durée, donc le couloir n'était jamais réservé, et
// la page ne passait aucun pont de parcours à son player. Le lecteur de stories
// et le réel composé, eux, se parcourent au doigt depuis #7878 — c'est LEUR
// piste (`SceneScrubTrack`) et LEUR pont (`ScenePlaybackScrubber`) que la
// galerie monte ici. Rien n'est réécrit : ni la piste, ni le moteur.

/// **La timeline d'une scène de galerie — la règle, sans vue.**
nonisolated enum GallerySceneTimeline {

    /// **Une scène a une timeline si elle BOUGE** — vidéo, son, animation,
    /// transition, son de fond du document (`GallerySceneItem.moves`).
    ///
    /// Toute slide a une durée (6 s au minimum, `computedTotalDuration`) : une
    /// scène FIXE en a donc une aussi, et un curseur y déplacerait une image qui
    /// ne change pas — un contrôle sans effet (loi 4). La durée n'est demandée
    /// qu'à une scène qui bouge : la calculer projette la scène en slide, et
    /// une galerie de scènes fixes n'a pas à payer ce prix.
    static func duration(moves: Bool, slideDuration: () -> TimeInterval) -> TimeInterval? {
        guard moves else { return nil }
        let seconds = slideDuration()
        guard seconds.isFinite, seconds > 0 else { return nil }
        return seconds
    }

    /// **La durée que porte la pièce synthétique, en MILLISECONDES** — l'unité
    /// de `MessageAttachment.duration`. C'est elle qui fait réserver le couloir
    /// de transport au LOT (`MediaGalleryStage.carriesDuration`) et qui s'y lit
    /// à droite (`durationFormatted`), exactement comme la durée d'une vidéo.
    static func attachmentDurationMs(_ timeline: TimeInterval?) -> Int? {
        timeline.map { Int(($0 * 1_000).rounded()) }
    }
}

/// **L'horloge partagée entre la page qui JOUE et le couloir qui la MONTRE.**
///
/// La page scène vit dans le pager, le curseur dans le couloir de transport :
/// deux arbres distincts. L'horloge est l'objet qu'ils se passent — la page y
/// écrit sa position (≈60 Hz, `onPlaybackTime`), le couloir la lit et y pousse
/// le doigt.
///
/// **Elle ne publie que pour la page ACTIVE.** Les voisines montées pour la
/// fluidité du glissement sont en pause ; leur position est gardée sans être
/// publiée, et rendue à l'activation — le curseur d'une scène rejointe ne
/// reprend pas la barre de la précédente.
///
/// **Un pont de parcours par page** : chaque canvas s'attache au SIEN à sa
/// naissance (`StoryReaderRepresentable.makeUIView`), et ne s'y attache qu'à ce
/// moment-là. Un pont unique réassigné à la page active perdrait la page déjà
/// montée à l'instant du glissement. La carte est bornée par le lot — quelques
/// objets vides, un par scène du post.
///
/// Détenue par la galerie en `@State`, jamais en `@StateObject` : la racine de
/// la galerie ne doit PAS se re-rendre à 60 Hz. Seul le curseur l'observe.
final class GallerySceneClock: ObservableObject {
    // iOS 26.1 : cf. `MeeshyUIDeinitSourceGuardTests`.
    nonisolated deinit {}

    @Published private(set) var progress: Double = 0
    private(set) var activeSceneId: String?
    private var positions: [String: Double] = [:]
    private var scrubbers: [String: ScenePlaybackScrubber] = [:]

    func scrubber(for sceneId: String) -> ScenePlaybackScrubber {
        if let existing = scrubbers[sceneId] { return existing }
        let created = ScenePlaybackScrubber()
        scrubbers[sceneId] = created
        return created
    }

    /// La page ouverte change : le curseur reprend SA position, zéro si elle
    /// n'a jamais joué.
    func activate(_ sceneId: String) {
        guard activeSceneId != sceneId else { return }
        activeSceneId = sceneId
        publish(positions[sceneId] ?? 0)
    }

    /// Une page rapporte son temps écoulé. Gardé pour toutes, publié pour la
    /// seule page active.
    func report(elapsed: Double, duration: TimeInterval, for sceneId: String) {
        let fraction = ReelSceneProgress.fraction(elapsed: elapsed, duration: duration)
        positions[sceneId] = fraction
        guard sceneId == activeSceneId else { return }
        publish(fraction)
    }

    /// Le doigt a relâché : la barre reste où il l'a posée, sans attendre le
    /// prochain rapport du canvas.
    func commit(_ fraction: Double, for sceneId: String) {
        let bounded = ReelSceneProgress.fraction(elapsed: fraction, duration: 1)
        positions[sceneId] = bounded
        guard sceneId == activeSceneId else { return }
        publish(bounded)
    }

    private func publish(_ fraction: Double) {
        guard progress != fraction else { return }
        progress = fraction
    }
}

/// **Le curseur d'une scène, au couloir de transport** — LA piste du lecteur de
/// stories et du réel composé (`SceneScrubTrack`), à la couleur de la
/// conversation.
///
/// Au toucher, la barre s'épaissit, une poignée suit le doigt, la scène se
/// redessine à l'instant pointé et reprend de là au relâcher — ou reste en
/// pause si l'utilisateur l'y avait mise (`ScenePlaybackScrubber.hostPaused`).
/// VoiceOver l'annonce comme un réglable : balayer vers le haut ou le bas
/// avance ou recule d'un pas (`sceneScrubAccessibility`).
struct GallerySceneScrubBar: View {
    @ObservedObject var clock: GallerySceneClock
    let sceneId: String
    let accentColor: String

    var body: some View {
        let scrubber = clock.scrubber(for: sceneId)
        SceneScrubTrack(playback: clock.progress,
                        fill: AnyShapeStyle(Color(hex: accentColor)),
                        scrubber: scrubber,
                        onCommit: commit)
            .padding(.leading, MediaGalleryStage.gutter)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(String(localized: "reels.scrub", defaultValue: "Avancer ou reculer", bundle: .main))
            .accessibilityValue(LocalizedNumber.percent(Int((clock.progress * 100).rounded())))
            .sceneScrubAccessibility(progress: clock.progress, scrubber: scrubber, onCommit: commit)
            .onAppear { clock.activate(sceneId) }
            .adaptiveOnChange(of: sceneId) { _, id in clock.activate(id) }
    }

    private func commit(_ fraction: Double) {
        clock.commit(fraction, for: sceneId)
    }
}
