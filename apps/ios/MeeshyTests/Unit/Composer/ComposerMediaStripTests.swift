import XCTest
import MeeshySDK
@testable import Meeshy

/// **B (#3883) — on VOIT le média choisi, et le type POST↔RÉEL suit le média.**
///
/// Sélectionner une photo ne montrait RIEN : `documentLocalMedia` alimentait le
/// prédicat de format et partait à la publication, mais n'était jamais peint. Ce
/// lot le rend visible — un ruban de vignettes RETIRABLES (`mediaStrip`) — et
/// vérifie que le toggle POST↔RÉEL réagit à la composition (loi 4, déjà câblé au
/// T2.4). Le choix STORY dépend de la scène → LOT 2 (milestone F).
final class ComposerMediaStripTests: XCTestCase {

    private static let iosRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()

    private func source(_ relativePath: String) throws -> String {
        try String(contentsOf: Self.iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    private func compact(_ text: String) -> String {
        AppSourceGuard.stripComments(text)
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }

    // 1 — le type SUIT le média (le prédicat du toggle POST↔RÉEL), par comportement.
    func test_leType_suitLeMedia() {
        XCTAssertFalse(
            ReelComposition.qualifiesAsReel(mimeTypes: ["image/jpeg"]),
            "Une seule image reste un POST — l'interrupteur POST↔RÉEL ne doit pas apparaître."
        )
        XCTAssertTrue(
            ReelComposition.qualifiesAsReel(mimeTypes: ["image/jpeg", "image/png"]),
            "Deux images qualifient RÉEL — l'interrupteur apparaît (loi 4)."
        )
        XCTAssertTrue(
            ReelComposition.qualifiesAsReel(mimeTypes: ["video/quicktime"], durationsMs: [5000]),
            "Une vidéo ≥ 3 s qualifie RÉEL."
        )
        XCTAssertFalse(
            ReelComposition.qualifiesAsReel(mimeTypes: ["video/quicktime"], durationsMs: [1000]),
            "Une vidéo trop courte reste un POST."
        )
    }

    // 2 — la surface PEINT le média reçu, en vignettes retirables.
    func test_laSurface_peintLeMedia_enVignettesRetirables() throws {
        let raw = try source("Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift")
        XCTAssertTrue(raw.contains("private var mediaStrip"), "mediaStrip introuvable ou source vide")
        let src = compact(raw)
        XCTAssertTrue(
            src.contains("varlocalMedia:[ComposerDocumentMedia]"),
            "La surface doit RECEVOIR `localMedia` — elle reste sans état, le meuble le possède."
        )
        XCTAssertTrue(
            src.contains("ForEach(localMedia,id:\\.url)") && src.contains("ComposerMediaThumbnail("),
            "Le ruban doit peindre UNE vignette par média (`ComposerMediaThumbnail`) — la preuve visible."
        )
        XCTAssertTrue(
            src.contains("onRemoveMedia?("),
            "Chaque vignette doit pouvoir se RETIRER via `onRemoveMedia` — retirer re-juge le format."
        )
    }

    // 3 — le meuble CÂBLE son média à la surface, et le retrait ôte du modèle.
    func test_leMeuble_cableSonMediaEtLeRetrait() throws {
        let src = compact(try source("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift"))
        XCTAssertTrue(src.contains("structMeeshyComposerHost"), "MeeshyComposerHost introuvable ou vide")
        XCTAssertTrue(
            src.contains("localMedia:documentLocalMedia"),
            "Le meuble doit passer `localMedia: documentLocalMedia` à la surface — sans quoi rien n'est peint."
        )
        XCTAssertTrue(
            src.contains("documentLocalMedia.removeAll"),
            "Le retrait d'une vignette doit ôter l'élément de `documentLocalMedia` — ce qui RE-JUGE le format."
        )
    }

    // 4 — le toggle POST↔RÉEL est GATÉ sur la qualification (loi 4 : sans effet ⇒ absent).
    func test_leToggle_estGateSurLaQualification() throws {
        let src = compact(try source("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift"))
        XCTAssertTrue(
            src.contains("ifdocumentComposesReel{documentForcePlainPostToggle}"),
            "L'interrupteur POST↔RÉEL ne se peint que quand la composition QUALIFIE (loi 4) — un contrôle "
                + "sans effet est absent, jamais grisé."
        )
    }

    // 5 — le libellé du ruban est traduit dans les 7 locales (cliquet i18n).
    func test_leLibelleDuRuban_estTraduit_7Locales() throws {
        let catalog = try source("Meeshy/Localizable.xcstrings")
        let json = try JSONSerialization.jsonObject(with: Data(catalog.utf8)) as? [String: Any]
        let strings = json?["strings"] as? [String: Any]
        guard let entry = strings?["composer.document.a11y.media"] as? [String: Any],
              let locs = entry["localizations"] as? [String: Any] else {
            return XCTFail("Clé « composer.document.a11y.media » absente du catalogue")
        }
        for loc in ["ar", "de", "en", "es", "fr", "it", "pt-BR"] {
            XCTAssertNotNil(locs[loc], "Clé du ruban : locale « \(loc) » manquante (cliquet i18n)")
        }
    }
}
