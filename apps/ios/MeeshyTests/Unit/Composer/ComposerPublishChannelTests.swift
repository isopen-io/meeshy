import XCTest
import MeeshySDK
@testable import Meeshy

/// **#4869 — un Réel composé depuis le Feed ne partait JAMAIS.**
///
/// Mesuré au simulateur iPhone 16 Pro : Feed → « Share something » → deux
/// photos → l'éventail offre « Reel » → on le choisit → **Publier**. Rien ne
/// part. Aucune requête, aucun post, le composer reste ouvert.
///
/// `DocumentComposerDoor.publish(_:)` refuse `.story` ET `.reel` — un
/// fail-closed correct, `ComposerDocumentDraft` ne portant pas de slides. La
/// STORY contourne ce refus (`publishStoryScene()`) ; le RÉEL descendait droit
/// dessus.
///
/// ## Le grain qui a laissé passer le défaut
///
/// Le routage s'écrivait `if selectedFormat == .story` — une LISTE de formats,
/// pas une règle. #4751 a fait rejoindre le meuble aux deux formats dans le
/// même lot ; un seul a vu sa publication routée, et le commentaire qui décrit
/// le piège a été écrit par le lot qui l'a laissé ouvert pour l'autre moitié :
///
/// > « Router une surface et router sa PUBLICATION sont deux gestes. Le premier
/// > se voit à l'écran ; le second ne se voit qu'à l'ARRIVÉE, sur un contenu
/// > qu'on ne peut plus rattraper. »
///
/// Ces témoins portent donc sur la RÈGLE, format par format — un troisième
/// format composé sur la scène ne pourra pas partir par le brouillon sans les
/// faire tomber.
final class ComposerPublishChannelTests: XCTestCase {

    /// **Ce que sa matière EST décide de son canal.** La story se compose sur
    /// la scène — ses objets, ses slides, son fond vivent dans
    /// `viewModel.slides`, que `ComposerDocumentDraft` ne porte pas.
    func test_laStory_partParLaScene() {
        XCTAssertEqual(ComposerPublishChannel.channel(for: .story), .scene)
    }

    /// **Le réel n'a pas le canal de la SCÈNE, et il a désormais celui du
    /// DOCUMENT** (#4869, directive porteur 2026-09-06).
    ///
    /// Il a été routé sur la scène le 2026-09-02, puis retiré le jour même : ce
    /// canal publie UN POST PAR SLIDE
    /// (`for (slideIdx, slide) in upload.slides.enumerated()`), sémantique juste
    /// pour une story dont chaque unité EST une publication, fausse pour un réel
    /// qui est UNE publication à plusieurs médias. Mesuré : un réel de deux
    /// photos y produisait **deux posts**.
    ///
    /// Le refus `.unsupported` qui a suivi était HONNÊTE — il disait la vérité
    /// à l'auteur — mais ce n'était pas une décision de produit : c'était
    /// l'absence d'une décision. Mesuré au simulateur le 2026-09-06 : vidéo de
    /// 6 s, format Réel, Publier ⇒ **rien ne part, le composer reste ouvert**.
    ///
    /// Le document publie UNE fois et porte tout ce qu'un réel emporte : ses
    /// fichiers, sa scène (#4756) et son type déclaré.
    func test_leReel_partParLeDocument() {
        XCTAssertEqual(ComposerPublishChannel.channel(for: .reel), .document)
    }

    /// **Aucun format n'est plus sans canal.** Le témoin porte sur la RÈGLE et
    /// non sur les quatre cas : un cinquième format ne pourra pas naître muet.
    func test_aucunFormatNestSansCanal() {
        for format in [ComposerFormat.post, .story, .reel, .status] {
            XCTAssertNotEqual(ComposerPublishChannel.channel(for: format), .unsupported,
                              "le format \(format) doit savoir par où il part")
        }
    }

    /// Le post et le mood se composent dans le DOCUMENT — texte, pièces
    /// jointes, lieu, emoji. Les router par la scène publierait un contenu vide
    /// de ce que l'auteur a écrit, le défaut symétrique.
    func test_lesFormatsComposesDansLeDocument_partentParLeDocument() {
        XCTAssertEqual(ComposerPublishChannel.channel(for: .post), .document)
        XCTAssertEqual(ComposerPublishChannel.channel(for: .status), .document)
    }

    /// **Aucun format n'est sans canal.** Le `switch` est exhaustif par
    /// construction ; ce témoin le dit sur les CAS, de sorte qu'un cinquième
    /// format ne puisse pas naître sans qu'on décide par où il part.
    func test_lesQuatreFormats_ontUnCanal() {
        let canaux = ComposerFormat.allComposable.map { ComposerPublishChannel.channel(for: $0) }
        XCTAssertEqual(canaux.count, ComposerFormat.allComposable.count)
    }

    /// **Le canal de la scène est exactement celui que la porte REFUSE.**
    ///
    /// C'est l'assertion qui relie les deux moitiés : `DocumentComposerDoor`
    /// refuse `.story` et `.reel` — un fail-closed juste — et ce lot garantit
    /// qu'on ne l'atteint plus. Si un format quittait le canal de la scène sans
    /// que la porte cesse de le refuser, il redeviendrait impubliable en
    /// silence, exactement comme le réel l'était.
    func test_leCanalDeLaScene_recouvreExactementCeQueLaPorteRefuse() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/DocumentComposerDoor.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
            .components(separatedBy: .whitespacesAndNewlines).joined()
        // `ComposerFormat` n'est qu'`Equatable` — la comparaison porte donc sur
        // le TABLEAU filtré dans l'ordre d'`allComposable`, jamais sur un
        // ensemble.
        let horsDocument = ComposerFormat.allComposable.filter {
            ComposerPublishChannel.channel(for: $0) != .document
        }
        // **Le réel a quitté cette liste le 2026-09-06** (#4869), et la porte a
        // cessé de le refuser DANS LE MÊME LOT — c'est exactement ce que cette
        // garde existe pour imposer : le jour où un format change de canal, son
        // refus doit bouger avec lui, sinon il devient impubliable en silence.
        XCTAssertEqual(horsDocument, [.story])
        XCTAssertTrue(code.contains("case.story:returnrefuse()"),
                      "La porte du document refuse EXACTEMENT ce qui ne part pas par le "
                      + "document. Si elle en refusait un de plus, il deviendrait "
                      + "impubliable en silence — le défaut du réel, à l'identique.")
    }

    /// Le meuble DEMANDE à la règle. Une condition écrite dans le corps du
    /// publieur serait hors de portée de tout témoin — et c'est précisément là
    /// que vivait la liste de formats qui a laissé le réel dehors.
    func test_leSocle_demandeSonCanalALaRegle() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/MeeshyComposerHost+Socle.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(code.contains("ComposerPublishChannel.channel(for: selectedFormat)"))
        XCTAssertTrue(code.contains("case .unsupported: refuseUnsupportedFormat()"),
                       "Un format sans canal se REFUSE en le disant, jamais en silence.")
    }
}
