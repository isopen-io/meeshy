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
        XCTAssertFalse(plan.flatTranscriptionFollowsPlayback, "hors périmètre : .card a déjà SON bloc karaoké (transcriptionBlock)")
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
        XCTAssertFalse(plan.flatTranscriptionFollowsPlayback, "un karaoké coupé à 2 lignes n'aurait rien à surligner passé la coupe — la tenue minimale garde sa citation statique")
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
        XCTAssertTrue(
            plan.flatTranscriptionFollowsPlayback,
            "user 2026-08-18 : la transcription de la tenue plate complète SUIT la lecture — " +
            "segments karaoké interactifs synchronisés, plus jamais une citation statique"
        )
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

    /// RETRAIT FOCAL iOS (2026-08-18) : sans élection, la tenue plate
    /// COMPLÈTE (vitesse/drapeaux/%/re-transcrire) sert TOUTES les rangées —
    /// la matrice voulait « le player rendu nu dans la rangée », pas une
    /// version amputée réservée à un élu disparu.
    func test_focalAudioBlock_flatChrome_isTheFullFlatDress() {
        XCTAssertEqual(
            FocalAudioBlock.flatChrome, .flatFocused,
            "toutes les rangées plates reçoivent la tenue plate complète — la décision de tenue vit côté app, jamais dans le SDK"
        )
    }

    private func makeAudioContent() -> BubbleContent {
        BubbleContent(
            messageId: "m1", kind: .standard, text: nil, translation: nil, reply: nil,
            attachments: .audio([MeeshyMessageAttachment(id: "au1", fileName: "a", originalName: "a", mimeType: "audio/mpeg", fileSize: 1)]),
            location: nil, ephemeral: nil, isBlurred: false,
            isViewOnce: false, isPinned: false, forwardAttribution: nil, editedAt: nil,
            isEditSaving: false, hasEditHistory: false, reactions: [],
            meta: BubbleContent.Meta(timeString: "10:41", deliveryStatus: nil),
            isMe: false, senderName: "Ali", callNotice: nil, joinNotice: nil
        )
    }

    func test_focalAudioBlock_equatable_sameInputs_areEqual() {
        let content = makeAudioContent()
        let a = FocalAudioBlock(
            content: content, accentHex: "#31B6BA", isDark: false,
            allAudioItems: [], translatedAudios: [], mentionDisplayNames: [:], conversationName: "Conv"
        )
        let b = FocalAudioBlock(
            content: content, accentHex: "#31B6BA", isDark: false,
            allAudioItems: [], translatedAudios: [], mentionDisplayNames: [:], conversationName: "Conv"
        )
        XCTAssertEqual(a, b, "mêmes entrées ⇒ égal — le gate Equatable ne doit pas re-rendre pour rien")
    }
}
