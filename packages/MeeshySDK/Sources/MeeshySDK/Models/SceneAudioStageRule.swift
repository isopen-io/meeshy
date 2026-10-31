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

/// La forme d'une pastille de son. Le composeur n'en propose AUCUNE à ce
/// jour et le fil n'en persiste pas : toute pastille est une capsule. Le type
/// existe pour que la règle sache la porter le jour où le choix est tranché
/// (#9739) — rien ne le lit dans le modèle.
public enum SceneAudioChipShape: String, Equatable, Sendable {
    case capsule
}

/// La pose d'une pastille de son, telle que le composeur l'a écrite : centre
/// normalisé 0–1, échelle et rotation (en degrés) avec les défauts du fil
/// (`1`, `0`).
public struct SceneAudioChipPose: Equatable, Sendable {
    public let x: CGFloat
    public let y: CGFloat
    public let scale: Double
    public let rotation: Double
    public let shape: SceneAudioChipShape

    public init(x: CGFloat, y: CGFloat, scale: Double, rotation: Double,
                shape: SceneAudioChipShape = .capsule) {
        self.x = x
        self.y = y
        self.scale = scale
        self.rotation = rotation
        self.shape = shape
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

    // MARK: - Le rang d'une pastille parmi les objets de la scène (#13901)

    /// **Une pastille se peint à son RANG** (#13901, R7) : comme Android
    /// (`StorySceneStack`), texte, média posé, sticker, lieu et pastille de son
    /// partagent un seul ordre, le `zIndex`. Une pastille est ENFOUIE quand un
    /// autre objet de premier plan, d'une autre famille, a un rang plus haut :
    /// le moteur de scène la peint alors dans son arbre de calques, à sa place,
    /// et la surcouche ne la peint pas une seconde fois.
    ///
    /// Une pastille sans rang (`zIndex == nil`, brouillon ou story d'avant le
    /// rang) n'est jamais enfouie : elle reste au-dessus de tout, comme avant.
    /// À rang égal, la pastille passe devant, comme l'objet ajouté le dernier.
    public static func isBuried(_ audio: StoryAudioPlayerObject, in effects: StoryEffects) -> Bool {
        guard isStaged(audio), let rang = audio.zIndex else { return false }
        return effects.sceneObjects.contains { objet in
            objet.kind != .audio && !objet.isBackground && objet.zIndex > rang
        }
    }

    /// Les pastilles que le moteur de scène peint dans son arbre, à leur rang.
    public static func buriedAudios(in effects: StoryEffects) -> [StoryAudioPlayerObject] {
        (effects.audioPlayerObjects ?? []).filter { isBuried($0, in: effects) }
    }

    /// Les pastilles que la surcouche peint par-dessus la scène, de la plus
    /// basse à la plus haute : celles qui n'ont aucun autre objet au-dessus
    /// d'elles, puis celles sans rang, dans l'ordre du document.
    public static func overlaidAudios(in effects: StoryEffects) -> [StoryAudioPlayerObject] {
        stagedAudios(in: effects.audioPlayerObjects ?? [])
            .filter { !isBuried($0, in: effects) }
            .enumerated()
            .sorted { ($0.element.zIndex ?? .max, $0.offset) < ($1.element.zIndex ?? .max, $1.offset) }
            .map(\.element)
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

    /// Les effets que la carte d'un réel JOUE : les siens, ou ceux du réel
    /// qu'il republie quand l'enveloppe est vide — le repli de
    /// `StoryEffects.played` (#9677), étendu à la republication d'un réel.
    var reelPlayedStoryEffects: StoryEffects? {
        StoryEffects.played(own: storyEffects, ownMediaIsEmpty: media.isEmpty,
                            source: repost?.storyEffects)
    }

    /// La scène que la carte du fil rejoue, republication comprise.
    var reelPlayedSceneDocument: CanvasV3? {
        guard let document = reelPlayedStoryEffects?.canvasV3, !document.scenes.isEmpty else { return nil }
        return document
    }

    /// Le porteur de cette scène : médias ET effets d'un seul tenant — ceux du
    /// post, ou ceux de sa source, jamais mêlés (leurs `postMediaId` se
    /// répondent). L'identité reste celle du post CONTENANT.
    var reelPlayedSceneCarrier: StoryItem {
        let hasOwnContent = StoryEffects.republicationHasOwnContent(own: storyEffects,
                                                                    ownMediaIsEmpty: media.isEmpty)
        return StoryItem(id: id,
                         content: hasOwnContent ? content : (repost?.content ?? content),
                         media: hasOwnContent ? media : (repost?.media ?? []),
                         storyEffects: reelPlayedStoryEffects,
                         createdAt: timestamp)
    }
}
