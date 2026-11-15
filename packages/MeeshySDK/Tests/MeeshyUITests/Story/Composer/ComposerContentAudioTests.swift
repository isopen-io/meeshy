import XCTest
import AVFoundation
@testable import MeeshyUI
import MeeshySDK

/// **#4052 — le son de fond est le TROISIÈME emplacement d'une scène.**
///
/// Le modèle (§ 4) le dit : « une scène peut avoir un média de fond **et** un
/// audio en fond ». Le SDK refusait pourtant l'audio, et son refus était écrit :
/// « un son n'a pas de place de FOND sur un canvas ». C'était juste d'un fond
/// VISUEL, et faux du son — un post « 2 photos + 1 vocal » ne produisait que
/// 2 slides, et le vocal n'atteignait jamais la scène.
final class ComposerContentAudioTests: XCTestCase {

    // MARK: - La règle, extraite de `addAudioObject`

    func test_uneSceneSansSon_adopteLePremierAudioCommeFond() {
        XCTAssertEqual(
            ComposerAudioPlacement.isBackground(sceneAlreadyHasBackgroundAudio: false), true)
    }

    /// **Le second n'écrase pas le premier.** Le modèle dit « s'il n'y en a
    /// pas » — remplacer en silence la bande-son que l'auteur venait de choisir
    /// serait pire qu'un refus : rien ne le lui dirait.
    func test_unSecondAudio_neRemplacePasLaBandeSonEnPlace() {
        XCTAssertNotEqual(
            ComposerAudioPlacement.isBackground(sceneAlreadyHasBackgroundAudio: true), true)
    }

    // MARK: - Le canal

    @MainActor
    func test_unVocalPorte_devientLeSonDeFondDeLaSceneCourante() throws {
        let composer = StoryComposerViewModel()
        let son = try fichierAudio()
        defer { try? FileManager.default.removeItem(at: son) }

        composer.applyContentAudio([
            ComposerContentMedia(sourceURL: son, kind: .audio, durationMs: 4200)
        ])

        let audios = composer.currentSlide.effects.audioPlayerObjects ?? []
        let pose = try XCTUnwrap(audios.first, "Le vocal n'a pas atteint la scène.")
        XCTAssertEqual(pose.isBackground, true, "Le premier son d'une scène en est le FOND (§ 4-3).")
        XCTAssertEqual(composer.loadedAudioURLs[pose.id], son,
                       "Le fichier doit être indexé par l'id de l'objet — sans quoi rien ne le jouera.")
        XCTAssertEqual(try XCTUnwrap(pose.duration), 4.2, accuracy: 0.001,
                       "La durée déclarée doit voyager : sans elle, la timeline ignore la voix.")
    }

    /// **Le témoin que l'issue demande** : une scène porte SIMULTANÉMENT un fond
    /// visuel et un son de fond.
    @MainActor
    func test_uneScene_porteAlaFois_unFondVisuel_etUnSonDeFond() throws {
        let composer = StoryComposerViewModel()
        let image = try fichierImage()
        let son = try fichierAudio()
        defer {
            try? FileManager.default.removeItem(at: image)
            try? FileManager.default.removeItem(at: son)
        }

        composer.applyContentMedia([
            ComposerContentMedia(sourceURL: image, kind: .image, mimeType: "image/png")
        ])
        composer.applyContentAudio([
            ComposerContentMedia(sourceURL: son, kind: .audio)
        ])

        let effets = composer.currentSlide.effects
        XCTAssertNotNil(effets.resolvedBackgroundMedia, "Le fond VISUEL doit être là.")
        XCTAssertNotNil(effets.resolvedBackgroundAudio, "…et le son de fond AUSSI, sur la même scène.")
        XCTAssertEqual(composer.slides.count, 1, "Le son ne crée AUCUNE slide — ce n'est pas une page.")
    }

    /// Un second vocal se pose quand même — il n'est simplement pas le fond. Le
    /// perdre serait pire : l'auteur l'a choisi.
    @MainActor
    func test_unSecondVocal_sePoseQuandMeme_maisPasEnFond() throws {
        let composer = StoryComposerViewModel()
        let a = try fichierAudio(), b = try fichierAudio()
        defer {
            try? FileManager.default.removeItem(at: a)
            try? FileManager.default.removeItem(at: b)
        }

        composer.applyContentAudio([
            ComposerContentMedia(sourceURL: a, kind: .audio),
            ComposerContentMedia(sourceURL: b, kind: .audio)
        ])

        let audios = composer.currentSlide.effects.audioPlayerObjects ?? []
        XCTAssertEqual(audios.count, 2, "Les deux vocaux sont posés — aucun n'est jeté.")
        XCTAssertEqual(audios.filter { $0.isBackground == true }.count, 1,
                       "…et UN SEUL est en fond : l'invariant « un son de fond par slide » tient.")
    }

    /// L'idempotence, par la même mémoire que le média : un aller-retour de mode
    /// ne pose pas deux fois le même vocal.
    @MainActor
    func test_porterDeuxFoisLeMemeVocal_neLeDoublePas() throws {
        let composer = StoryComposerViewModel()
        let son = try fichierAudio()
        defer { try? FileManager.default.removeItem(at: son) }
        let item = ComposerContentMedia(sourceURL: son, kind: .audio)

        composer.applyContentAudio([item])
        composer.applyContentAudio([item])

        XCTAssertEqual(composer.currentSlide.effects.audioPlayerObjects?.count, 1)
    }

    /// Une source ABSENTE ne pose rien : un objet audio sans fichier serait une
    /// piste déclarée que personne ne pourrait jouer.
    @MainActor
    func test_unFichierAbsent_nePoseAucunObjet() {
        let composer = StoryComposerViewModel()
        let fantome = FileManager.default.temporaryDirectory
            .appendingPathComponent("absent-\(UUID().uuidString).m4a")

        composer.applyContentAudio([ComposerContentMedia(sourceURL: fantome, kind: .audio)])

        XCTAssertTrue((composer.currentSlide.effects.audioPlayerObjects ?? []).isEmpty)
    }

    /// Le canal VISUEL ignore le son : les deux emplacements restent distincts.
    @MainActor
    func test_leCanalVisuel_neRamassePasUnAudio() throws {
        let composer = StoryComposerViewModel()
        let son = try fichierAudio()
        defer { try? FileManager.default.removeItem(at: son) }

        composer.applyContentMedia([ComposerContentMedia(sourceURL: son, kind: .audio)])

        XCTAssertTrue((composer.currentSlide.effects.mediaObjects ?? []).isEmpty)
        XCTAssertTrue((composer.currentSlide.effects.audioPlayerObjects ?? []).isEmpty,
                      "…et il ne le range pas non plus dans l'autre file : chaque canal a le sien.")
    }

    // MARK: - Fixtures

    private func fichierAudio() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("son-\(UUID().uuidString).m4a")
        try Data([0x00, 0x00, 0x00, 0x20]).write(to: url)
        return url
    }

    private func fichierImage() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("img-\(UUID().uuidString).png")
        let base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        try XCTUnwrap(Data(base64Encoded: base64)).write(to: url)
        return url
    }
}
