import XCTest
import SwiftUI
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// C0b — la RACINE de l'identité servie à l'hôte canvas ne peut jamais être
/// l'id de scène.
///
/// **Le fait gravé.** `CanvasV3(migrating:)` fabrique `SceneV3(id: "s1")` EN
/// DUR, et ce littéral n'est pas une négligence locale : son jumeau gateway
/// (`services/gateway/src/services/posts/storyEffectsV3.ts`, `const scene:
/// SceneV3 = { id: 's1', objects: remapped }`) émet le même, et le golden
/// PARTAGÉ `packages/shared/fixtures/canvas-v3/v1-legacy-full.v3.json` le grave
/// des deux côtés. Le déplacer fait rougir quatre suites Swift et le
/// `GOLDEN: output equals the frozen v1-legacy-full.v3.json byte-shape` du
/// gateway. Il RESTE donc ce qu'il est.
///
/// **Pourquoi il doit rester.** Un id de scène est une PLACE dans le document
/// (`story-3-slides.json` : s1, s2, s3), pas l'identité de ce qui est peint. Le
/// même document se monte légitimement sous plusieurs porteurs — un repost
/// embarque le document de l'original. Et `CanvasV3(migrating:)` ne reçoit
/// qu'un `StoryEffects`, qui ne porte AUCUN id : la migration ne peut
/// structurellement rien dériver, et un id dérivé ne survivrait pas au pont
/// bidirectionnel B2 (`roundTrip_v3_runtime_v3_isStableOnCoveredFields`), qui
/// repasse par `StoryEffects` et le perdrait.
///
/// **Ce qui se corrige donc ici.** L'identité est un problème de MONTAGE, pas
/// de document : elle s'enracine dans ce que le montage PEINT. Le porteur
/// quand il y en a un (C0a) ; sinon ce que la scène ADRESSE — un `postMediaId`
/// désigne un enregistrement, un `thumbHash` empreinte l'image. La place de la
/// scène ne vient qu'en dernier recours, quand le document ne porte rien qui
/// distingue.
///
/// **La surface vivante concernée.** `FeedPostCard.cardScenePlayer` monte
/// `MeeshyScenePlayer(.card)` SANS porteur. Sans cette correction, toute story
/// legacy du fil s'identifie « s1 » : `StoryReaderRepresentable.updateUIView`
/// calcule `identityChanged = newSlide.id != view.slide.id` → faux, et comme
/// l'absence de porteur laisse aussi `content` à `nil` des deux côtés, la
/// deuxième disjonction (`newSlide.content != view.slide.content`) est fausse
/// elle aussi : `view.slide` n'est JAMAIS réassignée et `setMode(.play, time:
/// .zero)` ne part jamais. Une vue canvas réemployée continuerait de peindre la
/// story précédente.
@MainActor
final class ScenePlayerIdentityRootTests: XCTestCase {

    // MARK: - (a) Le fait gravé : le littéral est partagé par toute story legacy

    func test_everyLegacyStoryMigratesToTheSameSceneId_thatIsWhyItCannotBeAnIdentity() {
        XCTAssertEqual(Self.legacyDocument(postMediaId: "media-a").scenes.first?.id, "s1")
        XCTAssertEqual(Self.legacyDocument(postMediaId: "media-b").scenes.first?.id, "s1",
                       "Le littéral est gravé par le golden PARTAGÉ (v1-legacy-full.v3.json) et "
                       + "par le jumeau gateway (storyEffectsV3.ts) : il ne bouge pas, donc "
                       + "l'identité doit venir d'ailleurs.")
    }

    // MARK: - (b) Sans porteur, l'identité vient de ce que la scène ADRESSE

    func test_twoLegacyDocumentsWithoutACarrier_doNotShareTheHostIdentity() {
        let first = Self.player(document: Self.legacyDocument(postMediaId: "media-a")).host.storyItem.id
        let second = Self.player(document: Self.legacyDocument(postMediaId: "media-b")).host.storyItem.id
        XCTAssertNotEqual(first, second,
                          "FeedPostCard monte .card SANS porteur : enracinée sur l'id de scène, "
                          + "toute story legacy du fil s'appellerait « s1 » et updateUIView ne "
                          + "verrait jamais identityChanged.")
    }

    func test_theAddressedMediaIsTheRoot_whenNoCarrierIsGiven() {
        XCTAssertEqual(Self.player(document: Self.legacyDocument(postMediaId: "media-a")).host.storyItem.id,
                       "media-a@s1",
                       "Un postMediaId désigne un ENREGISTREMENT : c'est la seule chose d'un "
                       + "document migré qui distingue deux stories. « bg », « legacy-text », "
                       + "« drawing », « s1 » sont des noms de PLACE que deux stories partagent.")
    }

    func test_theThumbHashDiscriminates_whenTheSceneAddressesNoMedia() {
        let first = Self.player(document: Self.thumbHashOnlyDocument("1QcSHQRnh493V4dIh4eXh0h4kJUI"))
        let second = Self.player(document: Self.thumbHashOnlyDocument("2QcSHQRnh493V4dIh4eXh0h4kJUI"))
        XCTAssertNotEqual(first.host.storyItem.id, second.host.storyItem.id,
                          "L'empreinte de la scène est calculée par la file hors-ligne APRÈS le "
                          + "persist : une story legacy sans média la porte souvent, et elle "
                          + "empreinte exactement ce qui est peint.")
    }

    func test_aSceneWithNothingAddressable_honestlyFallsBackOnItsPlace() {
        XCTAssertEqual(Self.player(document: CanvasV3(scenes: [SceneV3(id: "s1", objects: [])])).host.storyItem.id,
                       "s1",
                       "Dernier recours ASSUMÉ : un document qui n'adresse rien ne porte aucun "
                       + "discriminant. C'est alors au montage de donner un porteur — le viewer "
                       + "story en a toujours un.")
    }

    // MARK: - (c) Le porteur reste la racine (barrière de non-régression C0a)

    func test_theCarrierStaysTheRoot_andWinsOverTheDocumentDiscriminant() {
        let identity = Self.player(document: Self.legacyDocument(postMediaId: "media-a"),
                                   carrier: StoryItem(id: "story-1",
                                                      createdAt: Date(timeIntervalSince1970: 0))).host.storyItem.id
        XCTAssertEqual(identity, "story-1@s1",
                       "Le porteur est l'identité RÉELLE de ce qui est monté ; le discriminant du "
                       + "document n'est qu'un repli. Deux posts qui rendent le MÊME document (un "
                       + "repost et son original) doivent rester distincts.")
    }

    func test_twoStoriesSharingOneDocument_stayDistinctThroughTheirCarriers() {
        let document = Self.legacyDocument(postMediaId: "media-a")
        let original = Self.player(document: document,
                                   carrier: StoryItem(id: "story-1", createdAt: Date(timeIntervalSince1970: 0)))
        let repost = Self.player(document: document,
                                 carrier: StoryItem(id: "story-2", createdAt: Date(timeIntervalSince1970: 0)))
        XCTAssertNotEqual(original.host.storyItem.id, repost.host.storyItem.id,
                          "La preuve que l'identité n'appartient PAS au document : un repost "
                          + "embarque le document de l'original et doit rester une autre scène.")
    }

    // MARK: - (d) La scène affine toujours, et `.card` ne se relâche pas

    func test_theSceneStillRefinesTheRoot_soAMultiSceneDocumentReplaysEachScene() {
        let document = CanvasV3(scenes: [Self.mediaScene(id: "s1", postMediaId: "media-a"),
                                         Self.mediaScene(id: "s2", postMediaId: "media-a")])
        XCTAssertNotEqual(Self.player(document: document, sceneIndex: 0).host.storyItem.id,
                          Self.player(document: document, sceneIndex: 1).host.storyItem.id)
    }

    func test_theCardKeepsItsLocks_underTheNewIdentityRoot() {
        let card = Self.player(document: Self.legacyDocument(postMediaId: "media-a"))
        XCTAssertTrue(card.host.mute, "muet PAR CONSTRUCTION — E3 s'y adosse")
        XCTAssertTrue(card.host.isPaused, "née en pause")
    }

    // MARK: - Fixtures

    /// Une story legacy telle qu'elle arrive du fil : un blob `StoryEffects`
    /// v1, passé par le convertisseur RÉEL — pas une scène fabriquée à la main.
    private static func legacyDocument(postMediaId: String) -> CanvasV3 {
        var effects = StoryEffects()
        effects.background = "color:#1E1B4B"
        effects.mediaObjects = [StoryMediaObject(id: "m1",
                                                 postMediaId: postMediaId,
                                                 mediaType: "video",
                                                 aspectRatio: 1.0,
                                                 zIndex: 1)]
        return CanvasV3(migrating: effects)
    }

    /// Une story legacy dont la scène n'adresse aucun média mais porte son
    /// empreinte — la forme que produit la file hors-ligne.
    private static func thumbHashOnlyDocument(_ thumbHash: String) -> CanvasV3 {
        var effects = StoryEffects()
        effects.thumbHash = thumbHash
        return CanvasV3(migrating: effects)
    }

    private static func mediaScene(id: String, postMediaId: String) -> SceneV3 {
        SceneV3(id: id, objects: [
            ObjectV3(id: "m1", kind: .media,
                     anchor: .free(x: 0.5, y: 0.5), plane: .content, z: 1,
                     transform: TransformV3(),
                     payload: ["postMediaId": .string(postMediaId)]),
        ])
    }

    /// Le montage de la carte de fil : `.card`, sans porteur — exactement ce que
    /// `FeedPostCard.cardScenePlayer` construit.
    private static func player(document: CanvasV3,
                               carrier: StoryItem? = nil,
                               sceneIndex: Int = 0) -> MeeshyScenePlayer {
        MeeshyScenePlayer(document: document,
                          mode: .card,
                          sceneIndex: .constant(sceneIndex),
                          isPlaying: .constant(false),
                          accentColorHex: "#7C3AED",
                          carrier: carrier)
    }
}
