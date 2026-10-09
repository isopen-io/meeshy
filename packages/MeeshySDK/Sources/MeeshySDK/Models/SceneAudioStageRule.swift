import CoreGraphics
import Foundation

/// Ce qu'un objet audio produit SUR la scène (#9737).
///
/// Directive porteur 2026-10-09 : « on affiche sur la scène que les sons de
/// premier plan et non de fond, sous la forme d'une chip ». Loi 6 du composer :
/// ce qui ne produit aucun pixel au rendu ne se pose pas sur le canvas.
public enum SceneAudioStagePresence: Equatable, Sendable {
    /// Le son de FOND : aucun pixel, sur aucune surface ni à l'export. Il se
    /// dit par le crédit HORS scène (`BackgroundSoundBadge`, #9677).
    case offStage
    /// Le son de PREMIER PLAN : une pastille, à la place choisie au composeur.
    case chip(SceneAudioChipPose)
}

/// La pose d'une pastille de son, telle que le composeur l'a écrite : centre
/// normalisé 0–1, échelle et rotation avec les défauts du fil (`1`, `0`).
public struct SceneAudioChipPose: Equatable, Sendable {
    public let x: CGFloat
    public let y: CGFloat
    public let scale: Double
    public let rotation: Double

    public init(x: CGFloat, y: CGFloat, scale: Double, rotation: Double) {
        self.x = x
        self.y = y
        self.scale = scale
        self.rotation = rotation
    }
}

/// **LA règle, lue par toute surface qui peint une scène** : lecteur de story,
/// lecteur de réels, carte du fil, détail de post, vignettes et export.
public enum SceneAudioStageRule {
    public static func presence(of audio: StoryAudioPlayerObject) -> SceneAudioStagePresence {
        guard audio.isBackground != true else { return .offStage }
        return .chip(SceneAudioChipPose(x: audio.x,
                                        y: audio.y,
                                        scale: audio.scale ?? 1,
                                        rotation: audio.rotation ?? 0))
    }

    public static func isStaged(_ audio: StoryAudioPlayerObject) -> Bool {
        presence(of: audio) != .offStage
    }

    /// Les sons qui paraissent sur la scène, dans l'ordre du document.
    public static func stagedAudios(in audios: [StoryAudioPlayerObject]) -> [StoryAudioPlayerObject] {
        audios.filter(isStaged)
    }
}

// MARK: - Le visuel d'un réel dont le média est un son

public extension FeedPost {
    /// La scène que ce réel REJOUE, ou `nil` pour un réel de médias. Un réel
    /// composé se montre par sa scène sur toute surface : le fichier de son
    /// qu'il porte en est le son (de fond ou posé), jamais le visuel.
    var reelSceneDocument: CanvasV3? {
        guard let document = storyEffects?.canvasV3, !document.scenes.isEmpty else { return nil }
        return document
    }

    /// Le son qui EST le réel : son média joué est un audio et il ne porte
    /// aucune scène. Lui seul a pour visuel le spectre du réel audio et pour
    /// commande le lecteur audio ; le son d'une scène n'en reçoit aucun.
    var reelPrincipalAudioMedia: FeedMedia? {
        guard reelSceneDocument == nil,
              let media = primaryReelDisplayMedia, media.type == .audio else { return nil }
        return media
    }
}
