import Foundation

/// **On n'écrit que ce qu'on sait complet et qu'on a su rendre** — le miroir
/// Swift de `buildUpdatePayload`
/// (`packages/shared/utils/composer-contract.ts`). Toute évolution touche les
/// deux sites.
///
/// Le tri-état du FIL était déjà tenu des deux côtés : `UpdatePostRequest`
/// omet ses optionnels `nil`, et le gateway lit l'absence comme « ne touche
/// pas » (`UpdatePostSchema` a tous ses champs `optional()`). Ce qui manquait
/// n'était pas le tri-état — c'était la **déclaration de ce qu'on sait**,
/// tenue jusqu'ici à un SEUL site (`declaredReferencesAreKnown`, à l'édition
/// d'une story) sur UN champ. Une énumération, jugée une fois, plutôt que
/// treize drapeaux dispersés dont le prochain serait oublié.
///
/// Deux raisons indépendantes rendent un champ non-écrivable, et la sanction
/// est la même — la clé est OMISE :
/// - la surface ne l'a jamais PEINT (une feuille d'édition de texte ne rend
///   pas les références déclarées, donc elle ne peut pas les réécrire) ;
/// - la charge dont elle dispose est AMPUTÉE par construction (le `select` du
///   fil écarte les mentions silencieuses ; les republier révoquerait celles
///   que l'auteur avait posées discrètement).
public enum PostEditField: String, CaseIterable, Sendable {
    case content
    case visibility
    case visibilityUserIds
    case moodEmoji
    case originalLanguage
    case type
    case removeMediaIds
    case storyEffects
    case mediaIds
    case location
    case mentions
    case allowSoundExtraction
    case mediaAlt
    /// La LÉGENDE par média (#4055). Déclarée ICI parce que le corps la porte :
    /// un champ d'`UpdatePostRequest` sans son case ne pourrait plus jamais
    /// être écrit — c'est l'invariant que ce type existe pour tenir.
    case mediaCaption

    /// Le chemin historique — une surcharge qui recevait déjà treize
    /// paramètres DÉCLARE les treize : ses `nil` valaient « je n'en parle
    /// pas » avant ce contrat, et continuent de le valoir après.
    public static let all: Set<PostEditField> = Set(allCases)
}

/// Ce qu'un composer a en main. Chaque champ y est optionnel, et son `nil`
/// est le miroir exact de l'`undefined` TypeScript : **absent**, jamais
/// « vide-le ». L'effacement s'écrit `[]` (une liste) ou `.remove` (une
/// position) — et il n'est écrit que si le champ est DÉCLARÉ connu.
///
/// Type distinct d'`UpdatePostRequest` parce que les deux répondent à deux
/// questions : celui-ci porte ce que la surface DÉTIENT, l'autre ce qui PART
/// sur le fil. Les confondre rendrait la déclaration inopérante — il n'y
/// aurait plus rien à filtrer.
public struct PostEditDraft: Sendable {
    public let content: String?
    public let visibility: String?
    public let visibilityUserIds: [String]?
    public let moodEmoji: String?
    public let originalLanguage: String?
    public let type: String?
    public let removeMediaIds: [String]?
    public let storyEffects: StoryEffects?
    public let mediaIds: [String]?
    public let location: PostLocationUpdate?
    public let mentions: [PostMentionInput]?
    public let allowSoundExtraction: Bool?
    public let mediaAlt: [String: String]?
    public let mediaCaption: [String: String]?

    public init(content: String? = nil,
                visibility: String? = nil,
                visibilityUserIds: [String]? = nil,
                moodEmoji: String? = nil,
                originalLanguage: String? = nil,
                type: String? = nil,
                removeMediaIds: [String]? = nil,
                storyEffects: StoryEffects? = nil,
                mediaIds: [String]? = nil,
                location: PostLocationUpdate? = nil,
                mentions: [PostMentionInput]? = nil,
                allowSoundExtraction: Bool? = nil,
                mediaAlt: [String: String]? = nil,
                mediaCaption: [String: String]? = nil) {
        self.content = content
        self.visibility = visibility
        self.visibilityUserIds = visibilityUserIds
        self.moodEmoji = moodEmoji
        self.originalLanguage = originalLanguage
        self.type = type
        self.removeMediaIds = removeMediaIds
        self.storyEffects = storyEffects
        self.mediaIds = mediaIds
        self.location = location
        self.mentions = mentions
        self.allowSoundExtraction = allowSoundExtraction
        self.mediaAlt = mediaAlt
        self.mediaCaption = mediaCaption
    }
}

/// **Le SEUL constructeur du corps d'une édition.** `UpdatePostRequest` ne
/// s'écrit plus qu'ici : les six chemins d'édition passent par cette
/// fonction, et un quatorzième champ ajouté au corps sans case dans
/// `PostEditField` ne pourrait plus jamais être écrit — ce qu'un témoin dit.
public enum PostEditPayload {
    /// - Parameters:
    ///   - known: ce que la surface a su RENDRE. Un champ absent d'ici est
    ///     omis du corps, quelle que soit la matière du brouillon.
    ///   - draft: ce que la surface DÉTIENT. Un `nil` y reste omis même
    ///     déclaré connu — on n'écrit pas ce qu'on n'a pas.
    public static func build(known: Set<PostEditField>, draft: PostEditDraft) -> UpdatePostRequest {
        UpdatePostRequest(
            content: known.contains(.content) ? draft.content : nil,
            visibility: known.contains(.visibility) ? draft.visibility : nil,
            visibilityUserIds: known.contains(.visibilityUserIds) ? draft.visibilityUserIds : nil,
            moodEmoji: known.contains(.moodEmoji) ? draft.moodEmoji : nil,
            originalLanguage: known.contains(.originalLanguage) ? draft.originalLanguage : nil,
            type: known.contains(.type) ? draft.type : nil,
            removeMediaIds: known.contains(.removeMediaIds) ? draft.removeMediaIds : nil,
            storyEffects: known.contains(.storyEffects) ? draft.storyEffects : nil,
            mediaIds: known.contains(.mediaIds) ? draft.mediaIds : nil,
            location: known.contains(.location) ? draft.location : nil,
            mentions: known.contains(.mentions) ? draft.mentions : nil,
            allowSoundExtraction: known.contains(.allowSoundExtraction) ? draft.allowSoundExtraction : nil,
            mediaAlt: known.contains(.mediaAlt) ? draft.mediaAlt : nil,
            mediaCaption: known.contains(.mediaCaption) ? draft.mediaCaption : nil
        )
    }
}
