// apps/ios/MeeshyTests/Unit/Focal/FocalAudioFlatTests.swift

import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// Audio Focal À PLAT (maquette + arbitrage user 2026-08-16/17) — deux tenues
/// du même bloc, décidées par l'ÉLECTION de la rangée :
/// - rangée ordinaire : bande lecteur minimale (play + waveform + durée) +
///   transcription à plat en italique « … », AUCUNE carte ;
/// - rangée élue : la même bande garde EN PLUS la vitesse de lecture, les
///   glyphes + drapeaux de traduction, le pourcentage d'avancement et le
///   bouton re-transcrire.
///
/// Le SDK reste agnostique : `AudioPlayerChrome` est un paramètre OPAQUE de
/// `AudioPlayerView` (le plan de tenue est une fonction pure) ; la décision
/// « quelle tenue pour quelle rangée » vit côté app (`FocalAudioBlock`).
@MainActor
final class FocalAudioFlatTests: XCTestCase {

    // MARK: - Plan de tenue (SDK, pur)

    func test_chromePlan_card_keepsCardChrome_noFlatTranscription() {
        let plan = AudioPlayerChromePlan.plan(for: .card)
        XCTAssertTrue(plan.showsCardBackground, "la tenue .card est le rendu historique — fond de carte conservé, aucun site d'appel existant ne doit changer")
        XCTAssertTrue(plan.showsRightChips)
        XCTAssertTrue(plan.showsLanguageStrip)
        XCTAssertTrue(plan.showsRetranscribe)
        XCTAssertTrue(plan.showsTranscribeCTA)
        XCTAssertFalse(plan.rendersFlatTranscription, "en .card la transcription reste le bloc karaoké historique")
        XCTAssertNil(plan.flatTranscriptionLineLimit)
    }

    func test_chromePlan_flatMinimal_isBareBand_twoLineItalicTranscription() {
        let plan = AudioPlayerChromePlan.plan(for: .flatMinimal)
        XCTAssertFalse(plan.showsCardBackground, "rangée ordinaire = bande NUE : play + waveform + durée, aucune carte (maquette)")
        XCTAssertFalse(plan.showsRightChips, "vitesse et pourcentage sont réservés à la rangée élue")
        XCTAssertFalse(plan.showsLanguageStrip, "les glyphes/drapeaux de traduction sont réservés à la rangée élue")
        XCTAssertFalse(plan.showsRetranscribe)
        XCTAssertFalse(plan.showsTranscribeCTA, "pas d'affordance Transcrire sur une rangée ordinaire — la bande reste minimale")
        XCTAssertTrue(plan.rendersFlatTranscription, "transcription à plat en italique « … », jamais le bloc karaoké de la carte")
        XCTAssertEqual(plan.flatTranscriptionLineLimit, 2, "une rangée ordinaire tronque à 2 lignes — la lecture complète appartient à l'élue")
    }

    func test_chromePlan_flatFocused_keepsSpeedFlagsPercentRetranscribe_fullTranscription() {
        let plan = AudioPlayerChromePlan.plan(for: .flatFocused)
        XCTAssertFalse(plan.showsCardBackground, "l'élue reste À PLAT — elle garde les contrôles, jamais la carte")
        XCTAssertTrue(plan.showsRightChips, "l'élue garde vitesse (1×) et pourcentage d'avancement")
        XCTAssertTrue(plan.showsLanguageStrip, "l'élue garde les glyphes + drapeaux de traduction")
        XCTAssertTrue(plan.showsRetranscribe, "l'élue garde re-transcrire")
        XCTAssertTrue(plan.showsTranscribeCTA)
        XCTAssertTrue(plan.rendersFlatTranscription)
        XCTAssertNil(plan.flatTranscriptionLineLimit, "l'élue déroule la transcription entière")
    }

    // MARK: - Guillemets français du texte à plat (SDK, pur)

    func test_flatTranscriptionQuote_wrapsInFrenchGuillemets_withNoBreakSpaces() {
        XCTAssertEqual(
            AudioPlayerView.flatTranscriptionQuote("Bonjour tout le monde"),
            "«\u{00A0}Bonjour tout le monde\u{00A0}»",
            "la maquette écrit la transcription entre guillemets français — espaces insécables comprises"
        )
    }

    // MARK: - Décision de tenue (app — FocalAudioBlock)

    func test_focalAudioBlock_chrome_ordinaryRow_isFlatMinimal() {
        XCTAssertEqual(
            FocalAudioBlock.chrome(isFocused: false), .flatMinimal,
            "rangée ordinaire ⇒ bande minimale — la décision de tenue vit côté app, jamais dans le SDK"
        )
    }

    func test_focalAudioBlock_chrome_focusedRow_isFlatFocused() {
        XCTAssertEqual(
            FocalAudioBlock.chrome(isFocused: true), .flatFocused,
            "rangée élue ⇒ tenue enrichie (vitesse/drapeaux/%/re-transcrire)"
        )
    }

    // MARK: - Equatable : l'élection doit re-rendre le bloc

    private func makeAudioContent() -> BubbleContent {
        BubbleContent(
            messageId: "m1", kind: .standard, text: nil, translation: nil, reply: nil,
            attachments: .audio([MeeshyMessageAttachment(id: "au1", fileName: "a", originalName: "a", mimeType: "audio/mpeg", fileSize: 1)]),
            location: nil, ephemeral: nil, isBlurred: false,
            isViewOnce: false, isPinned: false, isForwarded: false, editedAt: nil,
            isEditSaving: false, hasEditHistory: false, reactions: [],
            meta: BubbleContent.Meta(timeString: "10:41", deliveryStatus: nil),
            isMe: false, senderName: "Ali", callNotice: nil
        )
    }

    func test_focalAudioBlock_equatable_distinguishesFocus() {
        let content = makeAudioContent()
        let ordinary = FocalAudioBlock(
            content: content, accentHex: "#31B6BA", isDark: false, isFocused: false,
            allAudioItems: [], translatedAudios: [], mentionDisplayNames: [:], conversationName: "Conv"
        )
        let focused = FocalAudioBlock(
            content: content, accentHex: "#31B6BA", isDark: false, isFocused: true,
            allAudioItems: [], translatedAudios: [], mentionDisplayNames: [:], conversationName: "Conv"
        )
        XCTAssertNotEqual(
            ordinary, focused,
            "un changement d'élection doit invalider le gate Equatable — sinon la rangée élue garderait la tenue minimale jusqu'au prochain re-render fortuit"
        )
    }

    // MARK: - Câblage : FocalRow transmet l'élection au bloc audio

    func test_focalRow_passesElectionToAudioBlock() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        let stripped = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        guard let callStart = stripped.range(of: "FocalAudioBlock(") else {
            return XCTFail("FocalRow doit toujours construire FocalAudioBlock")
        }
        let window = String(stripped[callStart.lowerBound...].prefix(1200))
        XCTAssertTrue(
            window.contains("isFocused: input.isFocused"),
            "FocalRow doit transmettre input.isFocused au bloc audio — sans ce câblage les deux tenues n'existent pas à l'écran"
        )
    }
}
