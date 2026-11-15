import CoreGraphics
import Foundation
import XCTest
@testable import MeeshySDK

/// #11168 — AttributeGraph appelle `StoryEffects.==` à chaque mise à jour d'une
/// vue qui reçoit des effets (0x8BADF00D, `StoryEffects.== → JSONEncoder.encode`).
/// L'égalité compare désormais champ à champ ; elle doit rendre le MÊME verdict
/// que l'ancienne égalité par encodage (`runtimeSnapshot`, clés triées), et ne
/// jamais laisser un champ neuf hors de la comparaison.
final class StoryEffectsEqualityTests: XCTestCase {

    // MARK: - Aucun champ n'échappe à l'identité

    func test_chaqueChampStocke_estCompareOuDeclareHorsIdentite() {
        let stored = Set(Mirror(reflecting: StoryEffects()).children.compactMap(\.label))
        let compared = Set(StoryEffects.identityFields.map(\.name))
        let declared = compared.union(StoryEffects.outsideIdentity)

        XCTAssertGreaterThan(stored.count, 30, "Mirror ne voit presque rien — la garde passerait à vide")
        XCTAssertEqual(stored.subtracting(declared).sorted(), [],
                       "Un champ neuf de StoryEffects doit entrer dans `identityFields` (il part dans le runtimeSnapshot) ou dans `outsideIdentity`")
        XCTAssertEqual(declared.subtracting(stored).sorted(), [],
                       "L'inventaire nomme un champ que StoryEffects n'a plus")
        XCTAssertTrue(compared.isDisjoint(with: StoryEffects.outsideIdentity))
    }

    // MARK: - Parité avec l'égalité par encodage

    func test_deuxCopies_sontEgales_commeParEncodage() {
        let base = Self.richEffects()
        let copie = Self.distinctStorage(base)

        XCTAssertTrue(Self.encodedEqual(base, copie))
        XCTAssertEqual(base, copie)
    }

    func test_chaqueChampDuSnapshot_distingue_commeParEncodage() {
        let base = Self.richEffects()
        for (champ, mutation) in Self.mutations {
            var autre = base
            mutation(&autre)
            XCTAssertFalse(Self.encodedEqual(base, autre), "l'oracle doit distinguer \(champ)")
            XCTAssertNotEqual(base, autre, "`==` doit distinguer \(champ), comme l'encodage")
        }
        let couverts = Set(Self.mutations.map(\.0))
        XCTAssertEqual(Set(StoryEffects.identityFields.map(\.name)).subtracting(couverts).sorted(), [],
                       "chaque champ comparé a son témoin de parité")
    }

    func test_lesMemosDuFil_nEntrentPasDansLIdentite_commeParEncodage() {
        let base = Self.richEffects()
        var autre = base
        autre.wireTimingEnd = ["texte": 3]
        autre.wireAnchorPoint = ["texte": "topLeading"]
        autre.wireMissingZIndex = ["texte"]

        XCTAssertTrue(Self.encodedEqual(base, autre))
        XCTAssertEqual(base, autre)
    }

    // MARK: - Le coût

    func test_comparerDeuxSceneslourdes_neSerialisePlus() {
        let base = Self.heavyEffects()
        let copie = Self.distinctStorage(base)

        let oracle = Self.bestOf { _ = Self.encodedEqual(base, copie) }
        let egalite = Self.bestOf { _ = base == copie }

        XCTAssertLessThan(egalite * Self.ecartQuiExclutLaSerialisation, oracle,
                          "`==` doit coûter une fraction de l'encodage (\(egalite)s contre \(oracle)s)")
    }

    // MARK: - Oracle : l'égalité d'avant #11168

    private static func encodedEqual(_ lhs: StoryEffects, _ rhs: StoryEffects) -> Bool {
        let encodeur = JSONEncoder()
        encodeur.outputFormatting = [.sortedKeys]
        guard let gauche = try? encodeur.encode(lhs.runtimeSnapshot),
              let droite = try? encodeur.encode(rhs.runtimeSnapshot) else { return false }
        return gauche == droite
    }

    private static let ecartQuiExclutLaSerialisation: Double = 5

    private static func seconds(_ work: () -> Void) -> TimeInterval {
        let start = CFAbsoluteTimeGetCurrent()
        (0..<5).forEach { _ in work() }
        return CFAbsoluteTimeGetCurrent() - start
    }

    private static func bestOf(_ work: () -> Void) -> TimeInterval {
        (0..<7).map { _ in seconds(work) }.min() ?? .infinity
    }

    /// Recopie les tableaux élément par élément : deux valeurs égales qui ne
    /// partagent AUCUN tampon, comme celles qu'AttributeGraph compare après une
    /// reconstruction de la vue.
    private static func distinctStorage(_ effects: StoryEffects) -> StoryEffects {
        var copie = effects
        copie.mediaObjects = effects.mediaObjects.map { $0.map { $0 } }
        copie.textObjects = effects.textObjects.map { $0 }
        copie.stickerObjects = effects.stickerObjects.map { $0.map { $0 } }
        copie.drawingStrokes = effects.drawingStrokes.map { $0.map { $0 } }
        copie.drawingData = effects.drawingData.map { Data($0) }
        return copie
    }

    // MARK: - Fixtures

    private static func richEffects() -> StoryEffects {
        StoryEffects(
            background: "#112233", textStyle: "bold", textColor: "FFFFFF", textPosition: "top",
            filter: "vivid", filterIntensity: 0.4, stickers: ["🔥"], textAlign: "center",
            textSize: 28, textBg: "000000", textOffsetY: 12,
            stickerObjects: [StorySticker(id: "sticker", emoji: "🎉")],
            textPositionPoint: StoryTextPosition(x: 0.3, y: 0.7),
            drawingData: Data([1, 2, 3]),
            drawingStrokes: [StoryDrawingStroke(id: "trait", colorHex: "FF0000", width: 4,
                                                createdAt: Date(timeIntervalSince1970: 0))],
            backgroundAudioId: "son", backgroundAudioVolume: 0.8,
            backgroundAudioStart: 1, backgroundAudioEnd: 9,
            voiceAttachmentId: "voix",
            voiceTranscriptions: [StoryVoiceTranscription(language: "fr", content: "bonjour")],
            opening: StoryTransitionEffect.allCases.first, closing: StoryTransitionEffect.allCases.last,
            textObjects: [StoryTextObject(id: "texte", text: "Salut")],
            locationObjects: [StoryLocationObject(id: "lieu", place: SharedPlace(latitude: 48.8, longitude: 2.3))],
            mediaObjects: [media(id: "media")],
            audioPlayerObjects: [StoryAudioPlayerObject(id: "lecteur", postMediaId: "pm-audio")],
            backgroundAudioVariants: [StoryAudioVariant(postMediaId: "pm-en", language: "en")],
            backgroundTransform: StoryBackgroundTransform(scale: 1.2, offsetX: 4),
            slideDuration: 6, timelineDuration: 7,
            clipTransitions: [StoryClipTransition(id: "transition", fromClipId: "a", toClipId: "b",
                                                  kind: StoryTransitionKind.allCases[0], duration: 0.5)],
            canvasAspectRatio: 16.0 / 9.0
        )
        .with { $0.thumbHash = "hash" }
    }

    private static func heavyEffects() -> StoryEffects {
        var effects = richEffects()
        effects.mediaObjects = (0..<400).map { media(id: "media-\($0)") }
        effects.textObjects = (0..<200).map { StoryTextObject(id: "texte-\($0)", text: "Ligne \($0)") }
        effects.drawingData = Data(repeating: 7, count: 300_000)
        return effects
    }

    private static func media(id: String) -> StoryMediaObject {
        StoryMediaObject(id: id, postMediaId: "pm-\(id)", mediaURL: "https://cdn/\(id).jpg", aspectRatio: 0.75)
    }

    private static var mutations: [(String, (inout StoryEffects) -> Void)] { [
        ("background", { $0.background = "#000000" }),
        ("textStyle", { $0.textStyle = "neon" }),
        ("textColor", { $0.textColor = "000000" }),
        ("textPosition", { $0.textPosition = "bottom" }),
        ("filter", { $0.filter = "mono" }),
        ("filterIntensity", { $0.filterIntensity = 0.9 }),
        ("stickers", { $0.stickers = ["💧"] }),
        ("textAlign", { $0.textAlign = "left" }),
        ("textSize", { $0.textSize = 40 }),
        ("textBg", { $0.textBg = nil }),
        ("textOffsetY", { $0.textOffsetY = 0 }),
        ("stickerObjects", { $0.stickerObjects?[0].x = 0.1 }),
        ("textPositionPoint", { $0.textPositionPoint = StoryTextPosition(x: 0.1, y: 0.1) }),
        ("drawingData", { $0.drawingData = Data([9]) }),
        ("drawingStrokes", { $0.drawingStrokes?[0].width = 9 }),
        ("backgroundAudioId", { $0.backgroundAudioId = "autre" }),
        ("backgroundAudioVolume", { $0.backgroundAudioVolume = 0.1 }),
        ("backgroundAudioStart", { $0.backgroundAudioStart = 2 }),
        ("backgroundAudioEnd", { $0.backgroundAudioEnd = 3 }),
        ("voiceAttachmentId", { $0.voiceAttachmentId = "autre" }),
        ("voiceTranscriptions", { $0.voiceTranscriptions = [StoryVoiceTranscription(language: "en", content: "hi")] }),
        ("opening", { $0.opening = nil }),
        ("closing", { $0.closing = nil }),
        ("textObjects", { $0.textObjects[0].text = "Autre" }),
        ("locationObjects", { $0.locationObjects[0].x = 0.1 }),
        ("mediaObjects", { $0.mediaObjects?[0].rotation = 45 }),
        ("audioPlayerObjects", { $0.audioPlayerObjects?[0].volume = 0.2 }),
        ("backgroundAudioVariants", { $0.backgroundAudioVariants?[0].language = "es" }),
        ("thumbHash", { $0.thumbHash = "autre" }),
        ("backgroundTransform", { $0.backgroundTransform?.rotation = 30 }),
        ("slideDuration", { $0.slideDuration = 1 }),
        ("timelineDuration", { $0.timelineDuration = 2 }),
        ("clipTransitions", { $0.clipTransitions = [] }),
        ("canvasAspectRatio", { $0.canvasAspectRatio = 1 }),
    ] }
}

private extension StoryEffects {
    func with(_ change: (inout StoryEffects) -> Void) -> StoryEffects {
        var copie = self
        change(&copie)
        return copie
    }
}
