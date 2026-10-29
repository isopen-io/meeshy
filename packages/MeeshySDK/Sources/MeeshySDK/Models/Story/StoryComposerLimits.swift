import Foundation

/// **Les plafonds d'une story / d'une scène — UNE source de constantes**
/// (décision porteur, #13590).
///
/// Plafonds LARGES : assez hauts pour ne refuser aucun contenu réaliste, assez
/// bas pour qu'une scène reste un document borné. Les nombres sont ceux de la
/// passerelle et du composeur web (`packages/shared/utils/story-limits.ts`,
/// `services/gateway/src/routes/posts/storyLimits.ts`) :
/// un nombre qui diverge entre deux clients refuse sur l'un ce que l'autre
/// publie.
///
/// Constantes pures : l'orchestration (refuser, vibrer, afficher) reste côté
/// composeur.
public nonisolated enum StoryComposerLimits {
    /// Caractères d'un texte (et d'une légende) posé sur une scène.
    public static let maxTextCharacters = 1_000
    /// Stickers posés sur UNE scène.
    public static let maxStickersPerScene = 50
    /// Images posées sur UNE scène.
    public static let maxImagesPerScene = 50
    /// Textes posés sur UNE scène.
    public static let maxTextsPerScene = 50
    /// Audios posés sur UNE scène.
    public static let maxAudiosPerScene = 50
    /// Vidéos posées sur UNE scène.
    public static let maxVideosPerScene = 50
    /// Durée maximale de la story ENTIÈRE, toutes scènes comprises : 2 h.
    public static let maxStoryDurationSeconds: Float = 7_200

    /// `text` coupé à `maxTextCharacters` (par caractère affiché, jamais au
    /// milieu d'un emoji ou d'un caractère composé).
    public static func clampedText(_ text: String) -> String {
        guard text.count > maxTextCharacters else { return text }
        return String(text.prefix(maxTextCharacters))
    }

    /// Le texte à insérer pour que `current` remplaçant `range` par
    /// `replacement` ne dépasse pas le plafond : `replacement` entier s'il tient,
    /// sa tête sinon (vide si la place manque).
    public static func fittedReplacement(current: String,
                                         replacing range: Range<String.Index>,
                                         with replacement: String) -> String {
        let kept = current.count - current[range].count
        let room = max(0, maxTextCharacters - kept)
        guard replacement.count > room else { return replacement }
        return String(replacement.prefix(room))
    }

    /// La durée que peut encore prendre une scène quand les AUTRES en
    /// totalisent `others` — jamais négative.
    public static func remainingDuration(otherScenes others: Float) -> Float {
        max(0, maxStoryDurationSeconds - others)
    }

    /// Ce qu'il reste des deux heures quand on met de côté la scène `index` :
    /// la somme des durées des AUTRES scènes est déjà prise.
    public static func remainingDuration(excludingSceneAt index: Int, of slides: [StorySlide]) -> Float {
        let others = slides.enumerated()
            .filter { $0.offset != index }
            .reduce(Float(0)) { $0 + Float($1.element.computedTotalDuration()) }
        return remainingDuration(otherScenes: others)
    }

    /// La scène `effects` peut-elle recevoir un objet de plus de la famille
    /// `limit` ? Les plafonds de longueur et de durée ne se jugent pas ici.
    public static func canAdd(_ limit: StoryComposerLimit, to effects: StoryEffects) -> Bool {
        let medias = effects.mediaObjects ?? []
        switch limit {
        case .sticker: return (effects.stickerObjects?.count ?? 0) < maxStickersPerScene
        case .image: return medias.filter { $0.kind == .image }.count < maxImagesPerScene
        case .video: return medias.filter { $0.kind == .video }.count < maxVideosPerScene
        case .audio: return (effects.audioPlayerObjects?.count ?? 0) < maxAudiosPerScene
        case .text: return effects.textObjects.count < maxTextsPerScene
        case .textLength, .duration: return true
        }
    }
}

/// Ce qu'un composeur refuse, pour que le retour dise QUELLE borne est atteinte.
public nonisolated enum StoryComposerLimit: String, Sendable, Equatable, CaseIterable {
    case sticker, image, text, audio, video, textLength, duration

    /// Le plafond chiffré, pour le libellé du refus.
    public var value: Int {
        switch self {
        case .sticker: return StoryComposerLimits.maxStickersPerScene
        case .image: return StoryComposerLimits.maxImagesPerScene
        case .text: return StoryComposerLimits.maxTextsPerScene
        case .audio: return StoryComposerLimits.maxAudiosPerScene
        case .video: return StoryComposerLimits.maxVideosPerScene
        case .textLength: return StoryComposerLimits.maxTextCharacters
        case .duration: return Int(StoryComposerLimits.maxStoryDurationSeconds / 3_600)
        }
    }
}
