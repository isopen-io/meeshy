import XCTest
@testable import Meeshy

/// **T3.3 → RETRAIT — l'overlay inline iPad a été nommé, gardé, puis retiré.**
///
/// Avant T3.3 il sortait du radar de TOUTES les gardes : `LegacyComposer` ne le
/// nommait pas, et le commentaire de `.feedComposer` le disait lui-même. Le
/// nommer (`feedInlineComposer`) l'a rendu mesurable sans le migrer.
///
/// Le 2026-09-06, la migration du fil iPad vers le meuble lui a retiré son
/// dernier appelant, et le porteur a demandé le décommissionnement. Les 346
/// lignes sont parties.
///
/// > **Nommer d'abord, mesurer ensuite, retirer en dernier.** Sans le nom posé
/// > à T3.3, ce retrait ne serait gardé par rien : **on ne peut pas écrire de
/// > témoin NÉGATIF sur une chose qui n'a pas de nom.** C'est ce qui rend cette
/// > suite utile APRÈS le retrait, alors même que son objet a disparu.
///
/// Elle épingle donc deux faits complémentaires : le nom SURVIT (pour que le
/// retour de l'overlay ait quelque chose contre quoi buter), et l'overlay,
/// lui, n'existe plus.
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

    // 3 — FeedView n'a qu'UN hôte de production : c'est le fait qui rend cet
    //     overlay « iPad ». Un second hôte l'amènerait sur l'iPhone.
    //
    //     **Le constructeur, jamais sa SIGNATURE** (2026-09-06). Cette garde
    //     cherchait la chaîne `FeedView()` — la vue n'avait alors aucun
    //     paramètre. Elle en a gagné un (`conversationListViewModel:`), et la
    //     recherche est tombée à ZÉRO : le témoin a rougi en annonçant
    //     « aucun hôte » pour une vue montée normalement.
    //
    //     Le rouge était le moindre mal. Une garde qui ne trouve plus rien ne
    //     garde plus rien : tant qu'elle a cherché `FeedView()`, un second
    //     montage `FeedView(quelqueChose:)` sur iPhone serait passé INAPERÇU —
    //     exactement la régression qu'elle existe pour interdire. Elle
    //     n'aurait rougi qu'en le disant à l'envers.
    //
    //     > Un inventaire qui épingle une SIGNATURE se périme au premier
    //     > paramètre ajouté, et se périme EN SILENCE dans le sens qui compte.
    //     > Le nom du type suivi de sa parenthèse ouvrante survit à ses
    //     > paramètres — et il n'y a qu'un type nommé `FeedView` dans l'app,
    //     > donc pas d'homonyme à écarter.
    func test_feedView_naQuUnHoteDeProduction_iPadRootView() throws {
        let appRoot = Self.iosRoot.appendingPathComponent("Meeshy")
        let fm = FileManager.default
        var hôtes: Set<String> = []
        if let it = fm.enumerator(at: appRoot, includingPropertiesForKeys: nil) {
            for case let url as URL in it where url.pathExtension == "swift" {
                let code = compact((try? String(contentsOf: url, encoding: .utf8)) ?? "")
                if code.contains("FeedView(") { hôtes.insert(url.lastPathComponent) }
            }
        }
        XCTAssertEqual(
            hôtes, ["iPadRootView.swift"],
            "`FeedView` ne doit être monté que par `iPadRootView.swift` — le fait qui rend cet overlay "
                + "« iPad ». Un second hôte le ferait atteindre l'iPhone, et la mesure du lot serait fausse."
        )
    }

    // 4 — le RETRAIT, épinglé par son ABSENCE.
    /// **L'overlay inline iPad est RETIRÉ** (directive porteur 2026-09-06 :
    /// « il faut décommissionner l'ancien composer de story et de post »).
    ///
    /// Ce témoin épinglait son EXISTENCE tant que la migration n'était pas
    /// faite ; il épingle désormais son ABSENCE. Le rôle n'a pas changé — tenir
    /// l'état RÉEL du produit — seul le sens s'est inversé le jour où l'état a
    /// basculé.
    ///
    /// Les 346 lignes retirées n'avaient **aucun appelant** : `iPadRootView`
    /// monte `FeedView`, qui monte le meuble depuis la migration du matin, et
    /// plus rien ne référençait `composerOverlay` — seulement des commentaires.
    ///
    /// > **Un composer que rien ne monte n'est pas une capacité en réserve,
    /// > c'est une seconde définition de la publication que personne ne
    /// > surveille.** Celle-ci publiait `storyEffects: nil` sur une app où toute
    /// > photo devient une scène : l'iPad fabriquait des publications d'une
    /// > autre nature que l'iPhone, sans que rien ne le dise à l'auteur.
    ///
    /// Ce qui reste de l'ancien composer n'est PAS du code mort :
    /// `FeedComposerSheet` porte encore les deux citations (le meuble refuse un
    /// repost — levée 7.5) et cinq capacités que le meuble n'a pas — progression,
    /// références, dépôt, éditeur d'image, son emprunté. Les retirer les
    /// retirerait à l'utilisateur : voir `FeedComposerSheetRetirementInventoryTests`.
    func test_lOverlayInlineIPad_estRetireDeFeedView() throws {
        let feedView = try source("Meeshy/Features/Main/Views/FeedView.swift")
        XCTAssertGreaterThan(feedView.count, 400, "FeedView introuvable ou vide")
        XCTAssertFalse(
            compact(feedView).contains("privatevarcomposerOverlay"),
            "L'overlay inline iPad a été retiré le 2026-09-06 (346 lignes, zéro appelant). Le "
                + "réintroduire rendrait à l'iPad un second écrivain de publication — celui qui "
                + "publiait `storyEffects: nil`, donc sans scène, sans légende par média et hors "
                + "mosaïque. Si un composer inline redevient nécessaire, il passe par le meuble."
        )
    }
}
