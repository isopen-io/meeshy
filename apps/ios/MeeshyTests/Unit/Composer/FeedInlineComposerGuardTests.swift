import XCTest
@testable import Meeshy

/// **T3.3 — l'overlay inline iPad reçoit un NOM et une garde.**
///
/// Avant ce lot il sortait du radar de TOUTES les gardes existantes :
/// `LegacyComposer` ne le nommait pas, et le commentaire de `.feedComposer`
/// (`ComposerIntent.swift`) le disait lui-même. Le nommer (`feedInlineComposer`)
/// le rend mesurable, sans le migrer — c'est T3.4 (descopable) qui le fera
/// passer au meuble. En attendant, l'overlay est NOMMÉ + GARDÉ, strictement
/// mieux qu'un composer que rien ne surveille.
final class FeedInlineComposerGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        try String(contentsOf: Self.iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    private static let iosRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()   // .../Unit/Composer
        .deletingLastPathComponent()   // .../Unit
        .deletingLastPathComponent()   // .../MeeshyTests
        .deletingLastPathComponent()   // .../apps/ios

    private func compact(_ text: String) -> String {
        AppSourceGuard.stripComments(text)
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }

    // 1 — le cas existe et RESTE DÉCLARÉ, même sans porte qui y route
    //     (doctrine du « cas qui reste déclaré »). La référence de compilation
    //     ci-dessous casse le build si on le retire — c'est la garde la plus
    //     dure : la régression ne peut pas passer au vert en silence.
    func test_feedInlineComposer_resteDeclare_sansPorteQuiYRoute() throws {
        _ = LegacyComposer.feedInlineComposer
        let intent = compact(try source("Meeshy/Features/Main/Composer/ComposerIntent.swift"))
        XCTAssertTrue(
            intent.contains("feedInlineComposer"),
            "`LegacyComposer` doit DÉCLARER `feedInlineComposer` — le nom de l'overlay inline iPad. Le "
                + "retirer rendrait toute garde négative sur cet overlay inécrivable, et son retour au "
                + "routage passerait sans un mot (extinction silencieuse des gardes négatives)."
        )
    }

    // 2 — INVENTAIRE, pas compte : FeedView arme le composer inline depuis CINQ
    //     sites, chacun identifié par ce qu'il PRÉ-OUVRE, jamais par un numéro.
    func test_feedView_armeLeComposerInline_depuisCinqSitesNommes() throws {
        let feedView = compact(try source("Meeshy/Features/Main/Views/FeedView.swift"))
        let armements: Set<String> = [
            "isComposerFocused=true",   // le champ nu (clavier)
            "showPhotoPicker=true",     // photo/vidéo
            "showCamera=true",          // appareil photo
            "showFilePicker=true",      // fichier
            "showLocationPicker=true"   // position
        ]
        let présents = armements.filter { feedView.contains($0) }
        XCTAssertEqual(
            présents, armements,
            "Les CINQ armements du composer inline (chacun nommé par ce qu'il pré-ouvre) doivent tous "
                + "exister. Un compte nu passerait au vert en ajoutant puis retirant un site dans le même "
                + "lot ; ce SET, lui, change dès qu'un site apparaît ou disparaît. L'audio, lui, n'ouvre "
                + "PAS le composer inline (`showAudioComposer`), et ce n'est pas un oubli."
        )
        XCTAssertEqual(
            feedView.components(separatedBy: "showComposer=true").count - 1, 5,
            "Et exactement CINQ `showComposer = true` — la contre-épreuve du SET ci-dessus."
        )
    }

    // 3 — FeedView() n'a qu'UN hôte de production : c'est le fait qui rend cet
    //     overlay « iPad ». Un second hôte l'amènerait sur l'iPhone.
    func test_feedView_naQuUnHoteDeProduction_iPadRootView() throws {
        let appRoot = Self.iosRoot.appendingPathComponent("Meeshy")
        let fm = FileManager.default
        var hôtes: Set<String> = []
        if let it = fm.enumerator(at: appRoot, includingPropertiesForKeys: nil) {
            for case let url as URL in it where url.pathExtension == "swift" {
                let code = compact((try? String(contentsOf: url, encoding: .utf8)) ?? "")
                if code.contains("FeedView()") { hôtes.insert(url.lastPathComponent) }
            }
        }
        XCTAssertEqual(
            hôtes, ["iPadRootView.swift"],
            "`FeedView()` ne doit être monté que par `iPadRootView.swift` — le fait qui rend cet overlay "
                + "« iPad ». Un second hôte le ferait atteindre l'iPhone, et la mesure du lot serait fausse."
        )
    }

    // 4 — garde-fou : la source lue est non vide et contient l'overlay.
    func test_laSourceLue_estNonVide_etContientLOverlay() throws {
        let feedView = try source("Meeshy/Features/Main/Views/FeedView.swift")
        XCTAssertGreaterThan(feedView.count, 400, "FeedView introuvable ou vide")
        XCTAssertTrue(feedView.contains("private var composerOverlay"), "L'overlay inline a disparu de FeedView")
    }
}
