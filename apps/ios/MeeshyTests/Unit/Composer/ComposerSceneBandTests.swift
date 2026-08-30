import XCTest
@testable import Meeshy

/// #4064 — **la rangée d'outils cesse d'être permanente, et le socle ne bouge
/// jamais.**
///
/// Ces deux moitiés ne sont pas la même phrase, et la planche insiste pour
/// qu'on l'écrive :
///
///   > « Ce qui devient conditionnel est la RANGÉE D'OUTILS, pas le socle — et
///   > il faut l'écrire ainsi, sinon le premier lot qui "libère le bas"
///   > emportera l'audience avec les outils. »
///
/// D'où la répartition des témoins ci-dessous : ceux de la RÈGLE gardent qu'une
/// bande n'apparaît que servie ; ceux de la SOURCE gardent que le socle, lui,
/// ne dépend d'aucune bande.
final class ComposerSceneBandTests: XCTestCase {

    // MARK: - La règle : au repos, le bas ne porte que le socle

    /// Le cœur de l'issue. Aucune demande ⇒ aucune bande.
    func test_auRepos_leBasNePorteQueLeSocle() {
        XCTAssertNil(ComposerSceneBand.opened(nil, served: [.palette]))
        XCTAssertNil(ComposerSceneBand.opened(nil, served: Set(ComposerSceneBand.allCases)))
    }

    /// Une bande DEMANDÉE mais non servie est absente — loi 4, appliquée à une
    /// bande. Sans ce refus, un contexte demandé avant d'avoir son contenu
    /// peindrait une bande vide sur les ≈ 170 pt que l'encastrement libère,
    /// ce que le critère de fin de l'issue interdit nommément.
    func test_uneBandeNonServie_estAbsente() {
        for absente in [ComposerSceneBand.timeline, .textStyles] {
            XCTAssertNil(ComposerSceneBand.opened(absente, served: [.palette]),
                         "`\(absente.rawValue)` n'est pas servie : elle ne doit RIEN peindre.")
        }
    }

    func test_uneBandeServie_ouvre() {
        XCTAssertEqual(ComposerSceneBand.opened(.palette, served: [.palette]), .palette)
    }

    /// **Le jeu SERVI vide est le cas nominal d'une surface sans bande**, pas
    /// un cas dégénéré : trois des quatre vues du meuble n'en ont aucune.
    func test_aucuneBandeServie_ferme_tout() {
        for demandee in ComposerSceneBand.allCases {
            XCTAssertNil(ComposerSceneBand.opened(demandee, served: []))
        }
    }

    /// La liste est celle de la planche, et elle est FERMÉE. Ce témoin rougit
    /// si un quatrième contexte s'y glisse sans que le critère
    /// — un axe horizontal, ou une comparaison latérale — ait été rediscuté.
    /// **`drawing` entre au #4092, et le critère tient sans être réécrit** : on
    /// choisit une couleur de pinceau en la voyant à côté des autres, comme un
    /// fond — c'est la COMPARAISON LATÉRALE, la seconde moitié du critère. Une
    /// cinquième entrée ferait rougir ce témoin, et c'est ce qu'on lui demande.
    func test_lesContextes_sontCeuxDeLaPlanche() {
        XCTAssertEqual(Set(ComposerSceneBand.allCases.map(\.rawValue)),
                       ["palette", "timeline", "textStyles", "drawing"])
    }

    // MARK: - Le `⋯` rouvre la palette là où la rangée d'outils a disparu

    /// Le défaut que #4064 corrige, dit par la règle : sans rangée d'outils, la
    /// palette n'avait PLUS de chemin — on pouvait retirer le fond, jamais en
    /// changer.
    func test_sansRangeeDOutils_leMenuOffreLaPalette() {
        let servies = ComposerOverflowPolicy.entries(
            hasBackground: true, hasMedia: false, hasText: false, hasLocation: false,
            backgroundPickerIsReachable: false)
        XCTAssertEqual(servies.first, .pickBackground)
        XCTAssertTrue(servies.contains(.removeBackground),
                      "Poser et retirer le même attribut se lisent au même endroit.")
    }

    /// Et l'inverse, qui compte autant : là où la rangée d'outils porte déjà
    /// l'icône de fond, le menu ne DOUBLE pas le contrôle.
    func test_avecRangeeDOutils_leMenuNeDoublePasLaPalette() {
        let servies = ComposerOverflowPolicy.entries(
            hasBackground: true, hasMedia: false, hasText: false, hasLocation: false,
            backgroundPickerIsReachable: true)
        XCTAssertFalse(servies.contains(.pickBackground))
    }

    /// **Le défaut du paramètre est le défaut SÛR.** Un appelant qui l'ignore
    /// n'obtient jamais deux contrôles pour un attribut — au pire une entrée
    /// manquante, que l'écran offre ailleurs.
    func test_leDefautDuParametre_neDoublonneJamais() {
        let servies = ComposerOverflowPolicy.entries(
            hasBackground: true, hasMedia: true, hasText: true, hasLocation: true)
        XCTAssertFalse(servies.contains(.pickBackground))
    }

    /// La palette s'offre même sans fond POSÉ : c'est elle qui en pose un. La
    /// lier à `hasBackground` aurait rendu la scène issue d'un MÉDIA
    /// définitivement sans palette.
    func test_laPalette_neDependPasDUnFondDejaPose() {
        let servies = ComposerOverflowPolicy.entries(
            hasBackground: false, hasMedia: true, hasText: false, hasLocation: false,
            backgroundPickerIsReachable: false)
        XCTAssertTrue(servies.contains(.pickBackground))
        XCTAssertFalse(servies.contains(.removeBackground),
                       "Rien à retirer tant que rien n'est posé.")
    }

    // MARK: - Les sources

    private func source(_ fichier: String) throws -> String {
        // **Le meuble est DÉCOUPÉ (#4102) : son adresse est l'UNITÉ.** Lire le
        // seul fichier principal rendrait vertes, en silence, toutes les gardes
        // négatives dont l'interdit a suivi une extension.
        if fichier == "MeeshyComposerHost.swift" {
            return AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        }
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/\(fichier)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    private func declarationBody(startingAt anchor: String, in code: String) -> String? {
        guard let start = code.range(of: anchor) else { return nil }
        var depth = 0
        var body = ""
        for character in code[start.lowerBound...] {
            body.append(character)
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { return body }
            }
        }
        return nil
    }

    /// **Le fusible.** Sans lui, les gardes NÉGATIVES qui suivent passeraient au
    /// vert sur une chaîne vide le jour où un chemin change.
    func test_lesSources_sontLisiblesEtNonVides() throws {
        XCTAssertGreaterThan(try source("MeeshyComposerHost.swift").count, 20_000)
        XCTAssertGreaterThan(try source("ComposerSceneSurface.swift").count, 1_500)
        XCTAssertTrue(try source("ComposerSceneBand.swift").contains("enum ComposerSceneBand"))
    }

    /// **LA garde de la seconde moitié de #4064.** Le socle cède à l'atelier —
    /// jamais à une bande, un outil ou un contexte. La formulation de l'issue
    /// est là pour ça : « le premier lot qui libère le bas emportera l'audience
    /// avec les outils », et l'audience est la seule erreur IRRÉVERSIBLE d'une
    /// publication.
    func test_leSocle_neCedeJamaisAUneBande() throws {
        let code = try source("MeeshyComposerHost.swift")
        guard let corps = declarationBody(startingAt: "var body: some View", in: code) else {
            return XCTFail("Le `body` du meuble est introuvable — la garde doit être re-pointée")
        }
        let compacte = compact(corps)

        XCTAssertTrue(compacte.contains("socle"),
                      "Le bloc lu n'est pas celui du body — la garde ne mesurerait RIEN")
        // Complétée au 2026-08-28 (`&& !paintedSocleZones.isEmpty`, elle aussi
        // une RÈGLE lue — `ComposerChromeOwnership.socleZones` — jamais un `if`
        // sur une bande, un outil ou un contexte) : le mood a cédé sa flèche à
        // son propre en-tête, et sans cette clause le socle peindrait une
        // `HStack` vide en dessous. Toujours PAS une bande — la garde négative
        // ci-dessous continue de le vérifier.
        XCTAssertTrue(
            compacte.contains(compact("if !chromeOwner.assembles(.publish) && !paintedSocleZones.isEmpty { socle }")),
            "Le socle est monté par la seule PROPRIÉTÉ DU CHROME (et ses zones), sur une seule ligne lisible."
        )
        // Et la bande n'apparaît PAS dans ce `body` : elle est passée à la
        // surface de scène, dans une propriété à part. Un identifiant de bande
        // ici voudrait dire qu'une condition de bande a été écrite au niveau
        // où vit le socle — le geste exact que l'issue interdit.
        for interdit in ["ComposerSceneBand", "requestedSceneBand", "toolRow"] {
            XCTAssertFalse(compacte.contains(interdit),
                           "`\(interdit)` est écrit au niveau du socle : la loi 5 est rouverte.")
        }
    }

    /// **La bande vit DANS la surface, et c'est la garantie STRUCTURELLE.** Le
    /// socle est un frère de la surface au meuble : une bande montée à
    /// l'intérieur rétrécit le canvas et ne peut pas déplacer le socle. La loi 5
    /// n'a donc pas besoin d'être promise par une animation — elle tombe de
    /// l'assemblage, et ce témoin garde l'assemblage.
    func test_laBande_estMonteeDansLaSurface_jamaisSousElle() throws {
        XCTAssertTrue(compact(try source("ComposerSceneSurface.swift"))
            .contains("ComposerSceneBandView("),
                      "La bande se monte dans la surface de scène.")
        XCTAssertFalse(compact(try source("MeeshyComposerHost.swift"))
            .contains("ComposerSceneBandView("),
                      "Montée au meuble, la bande deviendrait un frère du socle — et le socle bougerait.")
    }

    /// Aucune animation sur l'insertion : `StoryCanvasUIView` reconstruit ses
    /// layers à chaque `layoutSubviews`, donc animer la hauteur ferait varier la
    /// frame du canvas sur chaque image du ressort — la tempête perf que la
    /// zone d'inspecteur du document documente déjà.
    func test_laBande_neSInsereParAucuneAnimation() throws {
        let code = try source("ComposerSceneSurface.swift")
        guard let corps = declarationBody(startingAt: "var body: some View", in: code) else {
            return XCTFail("Le `body` de la surface de scène est introuvable")
        }
        let compacte = compact(corps)
        XCTAssertTrue(compacte.contains("ComposerSceneBandView("),
                      "Le bloc lu n'est pas celui du body — la garde ne mesurerait RIEN")
        for interdit in [".transition(", "withAnimation", ".animation("] {
            XCTAssertFalse(compacte.contains(compact(interdit)),
                           "`\(interdit)` dans le body de la scène ferait varier la frame du canvas.")
        }
    }
}

/// **La bande de fond porte les DEUX rangées du panneau « Fond »** (#4403).
///
/// Le panneau de l'atelier fait 236 pt et son commentaire dit ce qu'il
/// contient : « couleurs + rangée Ouverture ». La bande du plateau ne portait
/// que les couleurs — l'effet d'ouverture d'une scène y était inatteignable.
///
/// **Le manque ne se voyait pas en composant**, et c'est ce qui l'a laissé
/// passer : un effet d'ouverture ne se joue qu'à la LECTURE. Une absence dont
/// le symptôme n'apparaît pas sur l'écran qui la contient est la plus difficile
/// à remarquer — d'où une garde de source plutôt qu'un œil.
final class ComposerSceneBandOpeningRowGuardTests: XCTestCase {

    private func bandSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerSceneBand.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func hostSource() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// **Le fusible.**
    func test_laSourceDeLaBande_estLisible() throws {
        let s = try bandSource()
        XCTAssertGreaterThan(s.count, 800)
        XCTAssertTrue(s.contains("struct ComposerSceneBandView"))
    }

    /// **La rangée est EMPRUNTÉE au SDK, jamais recopiée.** Un corps, deux
    /// montages — règle du #4035. Une seconde rangée écrite ici aurait divergé
    /// du panneau de l'atelier au premier effet ajouté.
    func test_laRangee_estCelleDuSDK() throws {
        let source = compact(try bandSource())
        XCTAssertTrue(source.contains("OpeningEffectChips(selection:openingEffect,onSelect:onPickOpening)"))
        XCTAssertFalse(source.contains("StoryTransitionEffect.allCases"),
                       "Énumérer les effets ICI ferait une seconde liste à faire diverger.")
    }

    /// **Loi 4 — la rangée n'est montée que si l'hôte la SERT.** Sans le
    /// rappel, choisir un effet ne mènerait nulle part.
    func test_laRangee_nExistePasSansSonRappel() throws {
        let source = compact(try bandSource())
        XCTAssertTrue(source.contains("ifletonPickOpening{"))
    }

    /// Le meuble lit ET écrit le réglage — un choix qui n'atteint pas le modèle
    /// est un contrôle inerte.
    func test_leMeuble_litEtEcritLeReglage() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("bandOpeningEffect:viewModel.openingEffect"))
        XCTAssertTrue(source.contains("viewModel.openingEffect=effect"))
    }

    /// **La bande NE se referme PAS sur un effet d'ouverture**, à la différence
    /// de la couleur : une couleur se voit sur la scène dès qu'elle est posée,
    /// un effet ne se joue qu'à la lecture. Refermer laisserait l'auteur sans
    /// aucun retour sur ce qu'il vient de choisir.
    func test_choisirUnEffet_neRefermePasLaBande() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("onPickBandOpening:{effectinviewModel.openingEffect=effect"),
                      "Le rappel d'ouverture doit poser le réglage…")
        XCTAssertFalse(source.contains("viewModel.openingEffect=effectrequestedSceneBand=nil"),
                       "…et NE PAS refermer la bande, contrairement à la couleur.")
    }
}
