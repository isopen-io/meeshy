import XCTest
import MeeshyUI
@testable import Meeshy

/// **Le format d'ouverture, sa règle de repli, et ce que le menu de publication
/// en montre.**
///
/// Ce fichier éprouvait l'ÉVENTAIL du haut (C3). L'éventail est retiré au #6502
/// (directive porteur 2026-09-14) : le format se choisit sur la flèche Publier.
/// Ce qui survit est ce que le menu et la surface lisent encore — la règle de
/// repli du format d'ouverture, le pont vers le type envoyé, les libellés — et
/// les deux gardes de source qui interdisaient qu'un refus soit muet ou que la
/// vue double la table, repointées sur le menu.
@MainActor
final class ComposerFormatSelectionTests: XCTestCase {

    // MARK: - Le format d'ouverture ne sort jamais de l'offre

    func test_selection_staysPut_whenItIsStillOffered() {
        XCTAssertEqual(
            ComposerFormatFanPolicy.resolvedSelection(current: .post, offeredFormats: [.story, .post]),
            .post
        )
    }

    func test_selection_fallsBackToTheFirstOfferedFormat_whenItIsWithdrawn() {
        XCTAssertEqual(
            ComposerFormatFanPolicy.resolvedSelection(current: .reel, offeredFormats: [.story, .post]),
            .story
        )
    }

    /// Rien d'offert : la politique ne fabrique pas un format. Inventer `.post`
    /// ferait publier un format que la porte n'a jamais offert.
    func test_selection_isNeverInvented_whenNothingIsOffered() {
        XCTAssertEqual(
            ComposerFormatFanPolicy.resolvedSelection(current: .story, offeredFormats: []),
            .story
        )
    }

    /// Une porte ouverte en réel (édition d'un réel) dont la composition cesse
    /// de qualifier revient au format propre de la porte.
    func test_theHostFallback_bringsTheChoiceBack_whenTheReelGateCloses() {
        let qualifying = ComposerProfile.profile(for: .storyTray, compositionQualifiesAsReel: true)
        XCTAssertEqual(
            ComposerFormatFanPolicy.resolvedSelection(current: .reel,
                                                      offeredFormats: qualifying.offeredFormats),
            .reel
        )

        let withdrawn = ComposerProfile.profile(for: .storyTray, compositionQualifiesAsReel: false)
        XCTAssertEqual(
            ComposerFormatFanPolicy.resolvedSelection(current: .reel,
                                                      offeredFormats: withdrawn.offeredFormats),
            .story
        )
    }

    /// L'invariant qui rend le repli sûr, éprouvé sur les portes plutôt que
    /// supposé : le premier format offert est toujours celui de la porte.
    func test_theFallbackTarget_isAlwaysTheDoorOwnFormat() {
        let doors: [ComposerOrigin] = [
            .storyTray, .feedComposer, .moodChip,
            .repost(ofPostId: "p1", sourceFormat: .story),
            .edit(postId: "p2", documentFormat: .reel),
            .draft(id: "d1"), .share,
            .conversationMedia(messageId: "m1", attachmentId: "a1"),
            .socialMedia(postId: "p9", mediaId: "m9")
        ]

        for door in doors {
            for gate in [true, false] {
                let profile = ComposerProfile.profile(for: door, compositionQualifiesAsReel: gate)
                XCTAssertEqual(
                    ComposerFormatFanPolicy.resolvedSelection(current: .status,
                                                              offeredFormats: profile.offeredFormats),
                    profile.initialFormat,
                    "Un format hors offre doit retomber sur le format propre de la porte \(door)."
                )
            }
        }
    }

    func test_theResolvedFormat_translatesToTheWireType() {
        XCTAssertEqual(ComposerFormat.story.postType, .story)
        XCTAssertEqual(ComposerFormat.post.postType, .post)
        XCTAssertEqual(ComposerFormat.reel.postType, .reel)
        XCTAssertEqual(ComposerFormat.status.postType, .status)
    }

    // MARK: - Les libellés sont localisés, pas des identifiants nus

    func test_everyFormatCarriesADistinctNonRawLabel() {
        let formats: [ComposerFormat] = [.story, .post, .reel, .status]
        let labels = formats.map(ComposerFormatCopy.label)

        for (format, label) in zip(formats, labels) {
            XCTAssertFalse(label.isEmpty, "\(format) n'a aucun libellé")
            XCTAssertFalse(label.hasPrefix("composer.format."),
                           "\(format) rend sa CLÉ (\(label)) — le menu afficherait un identifiant nu")
        }
        XCTAssertEqual(Set(labels).count, formats.count,
                       "Deux formats partagent le même libellé — le menu devient illisible")
    }

    func test_leMenu_nommeSonTitreEtSonIndice_parLeCatalogue() {
        for texte in [ComposerPublishMenuCopy.title, ComposerPublishMenuCopy.hint] {
            XCTAssertFalse(texte.isEmpty)
            XCTAssertFalse(texte.hasPrefix("composer.publish.menu."), "Clé non résolue : \(texte)")
        }
    }

    func test_unRefus_porteSaRaisonDansSonLibelle() {
        let refus = ComposerPublishMenuRule.Entry(format: .reel, isChoosable: false,
                                                  reason: "raison", layouts: [])
        XCTAssertTrue(ComposerPublishMenuCopy.entryTitle(refus).contains("raison"))
        let offert = ComposerPublishMenuRule.Entry(format: .post, isChoosable: true, reason: nil, layouts: [])
        XCTAssertEqual(ComposerPublishMenuCopy.entryTitle(offert), ComposerFormatCopy.label(.post))
    }

    // MARK: - Gardes de SOURCE, repointées sur le menu

    private func menuSource() throws -> String {
        AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Composer/ComposerPublishMenu.swift"))
    }

    func test_theGuardsReadANonEmptySource() throws {
        let code = try menuSource()
        XCTAssertGreaterThan(code.count, 400, "La source du menu est introuvable ou vide — les gardes ne mesureraient RIEN")
        XCTAssertTrue(code.contains("struct ComposerPublishMenu"), "Le fichier lu n'est pas celui du menu")
    }

    /// Un format impossible est GRISÉ AVEC SA RAISON (#4030), et l'extinction
    /// passe par `.disabled`, jamais par un filtre visuel qui laisserait l'item
    /// tapable.
    func test_menu_greysAnImpossibleFormat_andAlwaysSaysWhy() throws {
        let code = try menuSource()
        XCTAssertTrue(code.contains(".disabled(!entry.isChoosable)"))
        XCTAssertTrue(code.contains("ComposerPublishMenuCopy.entryTitle(entry)"))
        XCTAssertFalse(code.contains(".grayscale("))
    }

    /// Le menu LIT la table par les verdicts ; une liste de formats écrite dans
    /// la vue deviendrait une seconde source de vérité.
    func test_menu_iteratesTheVerdicts_ratherThanEnumeratingFormatsItself() throws {
        let code = try menuSource()
        XCTAssertTrue(code.contains("ComposerFormatAvailability.verdicts("))
        XCTAssertFalse(code.contains("[.story, .post, .reel, .status]"))
    }
}
