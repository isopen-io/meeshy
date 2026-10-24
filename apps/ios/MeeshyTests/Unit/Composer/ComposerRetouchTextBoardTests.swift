import XCTest
import UIKit
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// #12591 — **la planche de texte de la retouche est le composer** : mêmes valeurs par défaut,
/// même plafond, même suppression d'une coquille vide. Chaque témoin observe un EFFET.
@MainActor
final class ComposerRetouchTextBoardTests: XCTestCase {

    private func ecrire(_ texte: String, in planche: ComposerRetouchTextBoard) throws {
        let id = try XCTUnwrap(planche.typingId)
        planche.write(texte, in: id)
    }

    // MARK: - La règle

    func test_rule_enteringWithoutText_createsOne_withTextRevealsThem() {
        XCTAssertEqual(ComposerRetouchTextRule.entry(textCount: 0), .createAndType)
        XCTAssertEqual(ComposerRetouchTextRule.entry(textCount: 2), .reveal)
    }

    func test_rule_backgroundTap_endsTheTyping_orAddsUpToTheCap() {
        XCTAssertEqual(ComposerRetouchTextRule.backgroundTap(typing: true, textCount: 1), .endTyping)
        XCTAssertEqual(ComposerRetouchTextRule.backgroundTap(typing: false, textCount: 1), .addText)
        XCTAssertEqual(ComposerRetouchTextRule.backgroundTap(typing: false, textCount: ComposerRetouchTextRule.cap), .none)
    }

    // MARK: - La planche

    func test_begin_withoutText_createsATextWithTheComposerDefaults_andOpensTheTyping() throws {
        let planche = ComposerRetouchTextBoard()
        planche.begin()
        let id = try XCTUnwrap(planche.typingId)
        let texte = try XCTUnwrap(planche.texts.first { $0.id == id })
        XCTAssertEqual(texte.fontSize, 96)
        XCTAssertEqual(texte.textStyle, "classic")
        XCTAssertEqual(texte.textColor, "FFFFFF")
        XCTAssertEqual(texte.textAlign, "center")
        XCTAssertEqual(planche.texts.count, 1)
    }

    func test_begin_withTexts_createsNone() throws {
        let planche = ComposerRetouchTextBoard()
        planche.begin()
        try ecrire("Bonjour", in: planche)
        planche.endTyping()
        planche.begin()
        XCTAssertEqual(planche.texts.count, 1, "des textes sont là : on ne pose rien de plus")
        XCTAssertNil(planche.typingId)
    }

    func test_tapBackground_whileTyping_endsTheTyping() throws {
        let planche = ComposerRetouchTextBoard()
        planche.begin()
        try ecrire("Bonjour", in: planche)
        planche.tapBackground()
        XCTAssertNil(planche.typingId)
        XCTAssertEqual(planche.texts.count, 1)
    }

    func test_tapBackground_outsideTyping_addsATextUpToFive() throws {
        let planche = ComposerRetouchTextBoard()
        planche.begin()
        for rang in 1 ... 5 {
            try ecrire("t\(rang)", in: planche)
            planche.endTyping()
            planche.tapBackground()
        }
        XCTAssertEqual(planche.texts.filter { !$0.text.isEmpty }.count, 5, "cinq textes, comme le composer")
        planche.endTyping()
        planche.tapBackground()
        XCTAssertEqual(planche.texts.count, 5, "au plafond, rien de plus")
    }

    func test_anEmptyText_isRemoved_whenTheTypingEnds() {
        let planche = ComposerRetouchTextBoard()
        planche.begin()
        planche.endTyping()
        XCTAssertTrue(planche.texts.isEmpty)
        XCTAssertTrue(planche.isEmpty)
    }

    func test_tapAText_reopensItForTyping() throws {
        let planche = ComposerRetouchTextBoard()
        planche.begin()
        let id = try XCTUnwrap(planche.typingId)
        try ecrire("Bonjour", in: planche)
        planche.endTyping()
        planche.tap(id)
        XCTAssertEqual(planche.typingId, id)
    }

    func test_addText_endsTheCurrentTyping_andOpensANewOne() throws {
        let planche = ComposerRetouchTextBoard()
        planche.begin()
        try ecrire("Un", in: planche)
        let premier = try XCTUnwrap(planche.typingId)
        planche.addText()
        XCTAssertNotEqual(planche.typingId, premier)
        XCTAssertEqual(planche.texts.count, 2)
    }

    func test_reset_emptiesTheBoard() throws {
        let planche = ComposerRetouchTextBoard()
        planche.begin()
        try ecrire("Bonjour", in: planche)
        planche.reset()
        XCTAssertTrue(planche.isEmpty)
        XCTAssertNil(planche.typingId)
        XCTAssertTrue(planche.texts.isEmpty, "aucune fuite vers la prise suivante")
    }

    func test_fingerprint_changesWithTheContent_theStyle_andThePosition() throws {
        let planche = ComposerRetouchTextBoard()
        planche.begin()
        try ecrire("Bonjour", in: planche)
        let contenu = planche.fingerprint
        try ecrire("Bonsoir", in: planche)
        XCTAssertNotEqual(planche.fingerprint, contenu)
        let avantStyle = planche.fingerprint
        var slide = planche.scene.currentSlide
        slide.effects.textObjects[0].textColor = "FF0000"
        planche.scene.currentSlide = slide
        XCTAssertNotEqual(planche.fingerprint, avantStyle)
        let avantPosition = planche.fingerprint
        slide.effects.textObjects[0].x = 0.2
        planche.scene.currentSlide = slide
        XCTAssertNotEqual(planche.fingerprint, avantPosition)
    }

    func test_overlay_isNilWithoutText_andPaintsTheTextOtherwise() throws {
        let planche = ComposerRetouchTextBoard()
        XCTAssertNil(planche.overlay(canvas: CGSize(width: 216, height: 384)))
        planche.begin()
        XCTAssertNil(planche.overlay(canvas: CGSize(width: 216, height: 384)), "une coquille vide ne se cuit pas")
        try ecrire("Bonjour", in: planche)
        let calque = try XCTUnwrap(planche.overlay(canvas: CGSize(width: 216, height: 384)))
        XCTAssertEqual(calque.width, 216)
        XCTAssertEqual(calque.height, 384)
    }
}
