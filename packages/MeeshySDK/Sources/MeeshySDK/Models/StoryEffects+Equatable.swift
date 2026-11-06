import Foundation

/// **`StoryEffects` s'égale par les champs de son `runtimeSnapshot`, un à un** (#4756, #11168).
///
/// ## Pourquoi une conformance
///
/// Trois charges du dépôt sont `Equatable` et transportent le canvas :
/// `PublishIntent`, `ComposerDocumentDraft` et `CreatePostPayload`. Sans
/// `StoryEffects: Equatable`, elles perdent leur synthèse, et avec elle les
/// témoins qui comparent une charge composée à celle qu'on attend.
///
/// ## Pourquoi plus par ENCODAGE (#11168)
///
/// AttributeGraph appelle `==` à chaque mise à jour d'une vue qui reçoit des
/// effets. L'égalité d'avant encodait les DEUX côtés en JSON trié : chaque
/// rendu d'une story sérialisait deux documents complets sur le fil principal,
/// jusqu'au chien de garde (0x8BADF00D, 10 s, iPhone 18 / iOS 27). Comparer
/// champ à champ ne coûte presque rien, s'arrête au premier écart, et deux
/// tableaux qui partagent leur tampon s'égalent sans être parcourus.
///
/// ## Le verdict reste celui de l'encodage
///
/// `identityFields` nomme exactement ce que `runtimeSnapshot` encode — la
/// forme v1 COMPLÈTE, l'empreinte dont l'écran dépend. Les mémos du fil et
/// `canvasV3` (`outsideIdentity`) n'en font pas partie, ni les champs
/// dépréciés. Les types imbriqués s'égalent par synthèse : un champ neuf y
/// entre sans qu'on y pense.
///
/// ## Un inventaire qui ne peut pas se périmer en silence
///
/// Un `==` écrit à la main continuerait de rendre `true` le jour où un champ
/// s'ajoute. `StoryEffectsEqualityTests` confronte ces deux listes aux champs
/// stockés que `Mirror` voit : un champ neuf qui n'est dans aucune fait
/// rougir le test, et chaque champ comparé a son témoin de parité contre
/// l'ancienne égalité par encodage.
extension StoryEffects: Equatable {

    public static func == (lhs: StoryEffects, rhs: StoryEffects) -> Bool {
        identityFields.allSatisfy { $0.same(lhs, rhs) }
    }
}

extension StoryEffects {

    struct IdentityField: Sendable {
        let name: String
        let same: @Sendable (StoryEffects, StoryEffects) -> Bool
    }

    static let identityFields: [IdentityField] = [
        IdentityField(name: "background") { $0.background == $1.background },
        IdentityField(name: "textStyle") { $0.textStyle == $1.textStyle },
        IdentityField(name: "textColor") { $0.textColor == $1.textColor },
        IdentityField(name: "textPosition") { $0.textPosition == $1.textPosition },
        IdentityField(name: "filter") { $0.filter == $1.filter },
        IdentityField(name: "filterIntensity") { $0.filterIntensity == $1.filterIntensity },
        IdentityField(name: "stickers") { $0.stickers == $1.stickers },
        IdentityField(name: "textAlign") { $0.textAlign == $1.textAlign },
        IdentityField(name: "textSize") { $0.textSize == $1.textSize },
        IdentityField(name: "textBg") { $0.textBg == $1.textBg },
        IdentityField(name: "textOffsetY") { $0.textOffsetY == $1.textOffsetY },
        IdentityField(name: "textPositionPoint") { $0.textPositionPoint == $1.textPositionPoint },
        IdentityField(name: "backgroundAudioId") { $0.backgroundAudioId == $1.backgroundAudioId },
        IdentityField(name: "backgroundAudioVolume") { $0.backgroundAudioVolume == $1.backgroundAudioVolume },
        IdentityField(name: "backgroundAudioStart") { $0.backgroundAudioStart == $1.backgroundAudioStart },
        IdentityField(name: "backgroundAudioEnd") { $0.backgroundAudioEnd == $1.backgroundAudioEnd },
        IdentityField(name: "voiceAttachmentId") { $0.voiceAttachmentId == $1.voiceAttachmentId },
        IdentityField(name: "opening") { $0.opening == $1.opening },
        IdentityField(name: "closing") { $0.closing == $1.closing },
        IdentityField(name: "thumbHash") { $0.thumbHash == $1.thumbHash },
        IdentityField(name: "backgroundTransform") { $0.backgroundTransform == $1.backgroundTransform },
        IdentityField(name: "slideDuration") { $0.slideDuration == $1.slideDuration },
        IdentityField(name: "timelineDuration") { $0.timelineDuration == $1.timelineDuration },
        IdentityField(name: "canvasAspectRatio") { $0.canvasAspectRatio == $1.canvasAspectRatio },
        IdentityField(name: "voiceTranscriptions") { $0.voiceTranscriptions == $1.voiceTranscriptions },
        IdentityField(name: "backgroundAudioVariants") { $0.backgroundAudioVariants == $1.backgroundAudioVariants },
        IdentityField(name: "clipTransitions") { $0.clipTransitions == $1.clipTransitions },
        IdentityField(name: "stickerObjects") { $0.stickerObjects == $1.stickerObjects },
        IdentityField(name: "locationObjects") { $0.locationObjects == $1.locationObjects },
        IdentityField(name: "textObjects") { $0.textObjects == $1.textObjects },
        IdentityField(name: "audioPlayerObjects") { $0.audioPlayerObjects == $1.audioPlayerObjects },
        IdentityField(name: "mediaObjects") { $0.mediaObjects == $1.mediaObjects },
        IdentityField(name: "drawingStrokes") { $0.drawingStrokes == $1.drawingStrokes },
        IdentityField(name: "drawingData") { $0.drawingData == $1.drawingData },
    ]

    static let outsideIdentity: Set<String> = [
        "openingWire", "closingWire", "wireBandEdge", "wireTimingEnd", "wireAnchorPoint",
        "wireRepaintMemo", "wireMissingZIndex", "canvasV3",
        "musicTrackId", "musicStartTime", "musicEndTime",
    ]
}
