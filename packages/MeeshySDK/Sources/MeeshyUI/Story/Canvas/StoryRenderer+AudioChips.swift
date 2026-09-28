import CoreMedia
import QuartzCore
import MeeshySDK

// MARK: - Pastilles audio

extension StoryRenderer {

    /// **Les puces des sons de premier plan visibles au temps `time`** (#8599).
    ///
    /// Le son est le seul objet de scène que `collectItems` n'énumère pas :
    /// à l'écran, sa puce est une vue SwiftUI posée au-dessus du canvas, et
    /// l'arbre de couches du canvas ne doit pas la dessiner une seconde fois.
    /// Les rendus qui n'ont PAS cette surcouche — l'export MP4 — les ajoutent
    /// par ici, au-dessus des autres objets comme à l'écran.
    ///
    /// La fenêtre de visibilité est celle du lecteur
    /// (`AudioForegroundReaderOverlay.visibleAudios`) : pas de puce pour le son
    /// de fond, ni hors de `startTime … startTime + duration`.
    @MainActor
    public static func audioChipLayers(for slide: StorySlide,
                                       into geometry: CanvasGeometry,
                                       at time: CMTime) -> [CALayer] {
        let audios = slide.effects.audioPlayerObjects ?? []
        guard !audios.isEmpty else { return [] }
        let visibles = AudioForegroundReaderOverlay.visibleAudios(
            in: audios,
            elapsed: max(0, time.seconds),
            slideDuration: slide.computedTotalDuration())
        return visibles.map { audio in
            let layer = StoryAudioChipLayer()
            layer.configure(with: audio, geometry: geometry)
            return layer
        }
    }
}
