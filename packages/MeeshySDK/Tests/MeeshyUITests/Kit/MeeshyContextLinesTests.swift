import XCTest
import CoreGraphics
@testable import MeeshyUI

/// Témoins de comportement des lois pures de K24 (fiche § 3, loi 13 ; § 8).
/// Les lois se lisent sans rendu ; les vues se comparent par leurs valeurs et
/// leurs fichiers se relisent (aucun verre propre, aucune couleur en dur).
final class MeeshyContextLinesTests: XCTestCase {

    // MARK: - Énumérés et défauts

    func test_defauts_surfaceMediaAlignementCentreHapticLight() {
        XCTAssertEqual(MeeshyContextSurface.media, .media)
        XCTAssertEqual(MeeshyContextAlignment.center, .center)
        XCTAssertEqual(MeeshyContextHaptic.light, .light)
    }

    // MARK: - Onde (ligne de son)

    func test_bars_levelsNil_neRendRienDuTout() {
        XCTAssertEqual(MeeshyContextWaveRule.bars(levels: nil, count: 18), [])
    }

    func test_bars_levelsVide_rendLOndeDeRepliDeLaBonneLongueur() {
        let bars = MeeshyContextWaveRule.bars(levels: [], count: 18)
        XCTAssertEqual(bars.count, 18)
        XCTAssertTrue(bars.allSatisfy { $0 >= MeeshyContextLinesRecipe.waveFloor && $0 <= 1 })
    }

    func test_bars_releveCourt_etendLaLongueurSansInventerDeValeurHorsBornes() {
        let bars = MeeshyContextWaveRule.bars(levels: [0.2, 0.9], count: 18)
        XCTAssertEqual(bars.count, 18)
        XCTAssertTrue(bars.allSatisfy { $0 >= MeeshyContextLinesRecipe.waveFloor && $0 <= 1 })
    }

    func test_bars_releveLong_rembobineParEchantillonnageSansDepasserLeCount() {
        let levels: [Float] = (0..<100).map { Float($0) / 99 }
        let bars = MeeshyContextWaveRule.bars(levels: levels, count: 18)
        XCTAssertEqual(bars.count, 18)
        XCTAssertLessThan(bars.first ?? 1, bars.last ?? 0)
    }

    func test_bars_valeursHorsBornes_plafonnentAUnEtPlanchentAuPlancher() {
        let bars = MeeshyContextWaveRule.bars(levels: [-3, 7], count: 2)
        XCTAssertEqual(bars[0], MeeshyContextLinesRecipe.waveFloor)
        XCTAssertEqual(bars[1], 1)
    }

    // MARK: - Loi 13 : ligne de son

    func test_soundLine_sansTitreSansOndeSansDuree_nAffichePas() {
        XCTAssertFalse(MeeshyContextLinesRule.soundLineHasContent(title: "", levels: nil, detail: nil))
    }

    func test_soundLine_titreSeul_suffit() {
        XCTAssertTrue(MeeshyContextLinesRule.soundLineHasContent(title: "Afro Sunset", levels: nil, detail: nil))
    }

    func test_soundLine_dureeVideNeCompteQuePourRien() {
        XCTAssertFalse(MeeshyContextLinesRule.soundLineHasContent(title: "  ", levels: nil, detail: ""))
    }

    func test_soundLine_ondeSeuleSuffit_etOndeNulleNeSeDessinePas() {
        XCTAssertTrue(MeeshyContextLinesRule.soundLineHasContent(title: "", levels: [], detail: nil))
        XCTAssertFalse(MeeshyContextLinesRule.showsWave(levels: nil))
        XCTAssertTrue(MeeshyContextLinesRule.showsWave(levels: []))
    }

    // MARK: - Loi 13 : ligne de références

    func test_references_vides_ouBlanches_neSontPasServies() {
        XCTAssertEqual(MeeshyContextLinesRule.visibleReferences(["", "  ", "#dakar"]), ["#dakar"])
    }

    func test_references_separateursSeulementEntreDeuxServies() {
        XCTAssertEqual(MeeshyContextLinesRule.separatorCount(visible: ["#dakar", "#plage"]), 1)
        XCTAssertEqual(MeeshyContextLinesRule.separatorCount(visible: ["#dakar"]), 0)
        XCTAssertEqual(MeeshyContextLinesRule.separatorCount(visible: []), 0)
    }

    func test_references_sansReferenceAuTexteNonVide_pasDeLigne() {
        XCTAssertFalse(MeeshyContextLinesRule.referenceLineHasContent(references: ["", " "]))
        XCTAssertTrue(MeeshyContextLinesRule.referenceLineHasContent(references: ["", "Plage de Ngor"]))
    }

    // MARK: - Loi 13 : puce

    func test_chevron_sansAction_jamais_meme_si_demande() {
        XCTAssertFalse(MeeshyContextLinesRule.showsChevron(hasAction: false, requested: true))
        XCTAssertFalse(MeeshyContextLinesRule.showsChevron(hasAction: false, requested: nil))
    }

    func test_chevron_avecAction_nulVautVrai_etFauxSiRefuse() {
        XCTAssertTrue(MeeshyContextLinesRule.showsChevron(hasAction: true, requested: nil))
        XCTAssertFalse(MeeshyContextLinesRule.showsChevron(hasAction: true, requested: false))
    }

    func test_haptique_sansAction_nAttendRien() {
        XCTAssertFalse(MeeshyContextLinesRule.firesHaptic(hasAction: false, haptic: .light))
        XCTAssertFalse(MeeshyContextLinesRule.firesHaptic(hasAction: true, haptic: .none))
        XCTAssertTrue(MeeshyContextLinesRule.firesHaptic(hasAction: true, haptic: .light))
    }

    func test_puce_sansTitreNiGlyphe_nAffichePas() {
        XCTAssertFalse(MeeshyContextLinesRule.showsChip(title: "", glyph: nil))
        XCTAssertTrue(MeeshyContextLinesRule.showsChip(title: "", glyph: "globe"))
        XCTAssertTrue(MeeshyContextLinesRule.showsChip(title: "Amis", glyph: nil))
    }

    // MARK: - Estompe et ajustement

    func test_estompe_toutTient_pasDEstompe() {
        XCTAssertFalse(MeeshyContextLinesRule.needsFade(contentWidth: 200, available: 300))
        XCTAssertTrue(MeeshyContextLinesRule.needsFade(contentWidth: 400, available: 300))
    }

    func test_chipFit_titreTientOuDisque() {
        XCTAssertTrue(MeeshyContextChipFit.showsTitle(titleWidth: 80, available: 100))
        XCTAssertFalse(MeeshyContextChipFit.showsTitle(titleWidth: 120, available: 100))
    }

    // MARK: - Recette (valeurs de la fiche § 6)

    func test_recette_valeursDeLaPlanche() {
        XCTAssertEqual(MeeshyContextLinesRecipe.barCount, 18)
        XCTAssertEqual(MeeshyContextLinesRecipe.pressedOpacity, 0.7)
        XCTAssertEqual(MeeshyContextLinesRecipe.hoverOpacity, 0.85)
        XCTAssertEqual(MeeshyContextLinesRecipe.longPressDelay, 0.5)
        XCTAssertEqual(MeeshyContextLinesRecipe.fadeWidth, 44)
        XCTAssertEqual(MeeshyContextLinesRecipe.maxTextScale, 1.5)
        XCTAssertEqual(MeeshyContextLinesRecipe.chipHeight, 36)
        XCTAssertEqual(MeeshyContextLinesRecipe.minimumTarget, 44)
    }

    // MARK: - Vecteurs partagés (Android et le web lisent le même fichier)

    func test_vecteurs_recette() throws {
        let recipe = try Self.object("recette")
        XCTAssertEqual(MeeshyContextLinesRecipe.barCount, recipe["barCount"] as? Int)
        XCTAssertEqual(MeeshyContextLinesRecipe.waveFloor, try XCTUnwrap(recipe["waveFloor"] as? Double), accuracy: 1e-9)
        XCTAssertEqual(Double(MeeshyContextLinesRecipe.waveBarWidth), recipe["waveBarWidth"] as? Double)
        XCTAssertEqual(Double(MeeshyContextLinesRecipe.waveBarPitch), recipe["waveBarPitch"] as? Double)
        XCTAssertEqual(Double(MeeshyContextLinesRecipe.waveHeight), recipe["waveHeight"] as? Double)
        XCTAssertEqual(MeeshyContextLinesRecipe.textOpacity, recipe["textOpacity"] as? Double)
        XCTAssertEqual(MeeshyContextLinesRecipe.waveOpacity, recipe["waveOpacity"] as? Double)
        XCTAssertEqual(MeeshyContextLinesRecipe.pressedOpacity, recipe["pressedOpacity"] as? Double)
        XCTAssertEqual(MeeshyContextLinesRecipe.hoverOpacity, recipe["hoverOpacity"] as? Double)
        XCTAssertEqual(MeeshyContextLinesRecipe.longPressDelay, recipe["longPressDelay"] as? Double)
        XCTAssertEqual(MeeshyContextLinesRecipe.fadeDuration, recipe["fadeDuration"] as? Double)
        XCTAssertEqual(Double(MeeshyContextLinesRecipe.fadeWidth), recipe["fadeWidth"] as? Double)
        XCTAssertEqual(Double(MeeshyContextLinesRecipe.maxTextScale), recipe["maxTextScale"] as? Double)
        XCTAssertEqual(Double(MeeshyContextLinesRecipe.chipHeight), recipe["chipHeight"] as? Double)
        XCTAssertEqual(Double(MeeshyContextLinesRecipe.minimumTarget), recipe["minimumTarget"] as? Double)
        XCTAssertEqual(MeeshyContextLinesRecipe.waveSize, CGSize(width: 72, height: 12))
    }

    func test_vecteurs_loi13() throws {
        for row in try Self.loi("soundLineHasContent") {
            let levels = (row["levels"] as? [Double]).map { $0.map(Float.init) }
            XCTAssertEqual(
                MeeshyContextLinesRule.soundLineHasContent(
                    title: row["title"] as? String ?? "", levels: levels, detail: row["detail"] as? String
                ),
                row["attendu"] as? Bool, "\(row)"
            )
        }
        for row in try Self.loi("showsChevron") {
            let hasAction = try XCTUnwrap(row["hasAction"] as? Bool)
            XCTAssertEqual(MeeshyContextLinesRule.showsChevron(hasAction: hasAction, requested: row["requested"] as? Bool),
                           row["attendu"] as? Bool, "\(row)")
        }
        for row in try Self.loi("firesHaptic") {
            let haptic = try XCTUnwrap(MeeshyContextHaptic(rawValue: try XCTUnwrap(row["haptic"] as? String)))
            XCTAssertEqual(MeeshyContextLinesRule.firesHaptic(hasAction: try XCTUnwrap(row["hasAction"] as? Bool), haptic: haptic),
                           row["attendu"] as? Bool, "\(row)")
        }
        for row in try Self.loi("chipValue") {
            XCTAssertEqual(MeeshyContextLinesRule.chipValue(title: try XCTUnwrap(row["title"] as? String), detail: row["detail"] as? String),
                           row["attendu"] as? String, "\(row)")
        }
        for row in try Self.loi("chipDetailOpacity") {
            let tone = try XCTUnwrap(MeeshyGlassTone(rawValue: try XCTUnwrap(row["tone"] as? String)))
            XCTAssertEqual(MeeshyContextLinesRule.chipDetailOpacity(tone: tone), row["attendu"] as? Double, "\(row)")
        }
        for row in try Self.loi("lineOpacity") {
            XCTAssertEqual(
                MeeshyContextLinesRule.lineOpacity(
                    isPressed: try XCTUnwrap(row["isPressed"] as? Bool), isHovered: try XCTUnwrap(row["isHovered"] as? Bool)
                ),
                row["attendu"] as? Double, "\(row)"
            )
        }
    }

    // MARK: - Cible de 44 par débord, jamais sur le contenu

    func test_cible_debordeDuSeulCoteOpposeAuContenu() throws {
        let rows = try XCTUnwrap(try Self.json()["cible"] as? [[String: Any]])
        for row in rows {
            let height = CGFloat(try XCTUnwrap(row["height"] as? Double))
            let expected = try XCTUnwrap(row["attendu"] as? [String: Double])
            let edge: MeeshyContextHitEdge
            switch row["edge"] as? String {
            case "top": edge = .top
            case "bottom": edge = .bottom
            default: edge = .vertical
            }
            let hit = MeeshyContextLinesRule.hitRect(CGRect(x: 0, y: 0, width: 120, height: height), edge: edge, minimum: 44)
            XCTAssertEqual(Double(hit.minY), expected["y"], "\(row)")
            XCTAssertEqual(Double(hit.height), expected["height"], "\(row)")
            XCTAssertEqual(hit.width, 120, "la largeur ne change pas")
        }
    }

    func test_cible_estLeJetonTactileEtLaPuceSeDessineEn36() {
        XCTAssertEqual(MeeshyContextLinesRecipe.minimumTarget, MeeshyControlSize.tapTarget)
        XCTAssertEqual(MeeshyContextLinesRecipe.chipHeight, MeeshyControlSize.regular)
    }

    // MARK: - Texte servi, valeur dite

    func test_visibleText_blancsOuNul_nExistePas() {
        XCTAssertNil(MeeshyContextLinesRule.visibleText(nil))
        XCTAssertNil(MeeshyContextLinesRule.visibleText("  \n"))
        XCTAssertEqual(MeeshyContextLinesRule.visibleText("0:15"), "0:15")
    }

    func test_haptique_passeParLeSiteUniqueDeK02() {
        XCTAssertEqual(MeeshyContextHaptic.light.glassHaptic, .light)
        XCTAssertEqual(MeeshyContextHaptic.none.glassHaptic, .none)
    }

    func test_grandePolice_plafonneeAuPalierDUnFoisEtDemi() {
        XCTAssertEqual(MeeshyContextLinesRecipe.maxDynamicTypeSize, .xxxLarge)
        XCTAssertFalse(MeeshyContextLinesRecipe.maxDynamicTypeSize.isAccessibilitySize)
    }

    // MARK: - Contraste calculé depuis la recette

    func test_contraste_lignesSurLePlateau_auDessusDuPlancher() throws {
        let contrast = try Self.object("contraste")
        let plate = try XCTUnwrap(contrast["plateau"] as? [Double]).map { $0 / 255 }
        let floor = try XCTUnwrap(contrast["plancher"] as? Double)
        let plateLuminance = CanvasChromeScheme.luminance(red: plate[0], green: plate[1], blue: plate[2])
        let rows = try XCTUnwrap(contrast["lignes"] as? [[String: Double]])
        for row in rows {
            let opacity = try XCTUnwrap(row["opacite"])
            let ink = plate.map { opacity + (1 - opacity) * $0 }
            let ratio = CanvasChromeScheme.contrastRatio(
                CanvasChromeScheme.luminance(red: ink[0], green: ink[1], blue: ink[2]), plateLuminance
            )
            XCTAssertEqual(ratio, try XCTUnwrap(row["attendu"]), accuracy: 0.1)
            XCTAssertGreaterThanOrEqual(ratio, floor)
        }
        XCTAssertEqual(rows.compactMap { $0["opacite"] }, [MeeshyContextLinesRecipe.textOpacity, MeeshyContextLinesRecipe.waveOpacity])
    }

    // MARK: - Les vues se comparent par leurs valeurs (fermetures hors comparaison)

    @MainActor
    func test_ligneDeSon_egaleAValeursEgales_differenteAuTitreOuALAction() {
        let line = { (title: String, action: (() -> Void)?) in
            MeeshyContextSoundLine(label: "Son de fond", title: title, levels: [0.4], action: action)
        }
        XCTAssertTrue(line("Afro Sunset", { _ = 1 }) == line("Afro Sunset", { _ = 2 }))
        XCTAssertFalse(line("Afro Sunset", {}) == line("Lagos", {}))
        XCTAssertFalse(line("Afro Sunset", {}) == line("Afro Sunset", nil))
    }

    @MainActor
    func test_ligneDeReferences_neGardeQueLesReferencesServies() {
        let served = MeeshyContextReferenceLine(label: "Références", references: [
            MeeshyContextReference(id: "h", text: "#dakar", spokenLabel: "Hashtags : dakar"),
        ])
        let padded = MeeshyContextReferenceLine(label: "Références", references: [
            MeeshyContextReference(id: "v", text: "  ", spokenLabel: "vide"),
            MeeshyContextReference(id: "h", text: "#dakar", spokenLabel: "Hashtags : dakar"),
        ])
        XCTAssertTrue(served == padded)
    }

    @MainActor
    func test_puce_egaleAValeursEgales_differenteALaValeurOuALEtat() {
        let chip = { (title: String, expanded: Bool?) in
            MeeshyContextChip(label: "Audience", title: title, systemImage: "person.2.fill", isExpanded: expanded, action: {})
        }
        XCTAssertTrue(chip("Amis", nil) == chip("Amis", nil))
        XCTAssertFalse(chip("Amis", nil) == chip("Public", nil))
        XCTAssertFalse(chip("Amis", nil) == chip("Amis", true))
    }

    // MARK: - Source : aucun verre propre, aucune couleur en dur, aucun type du composer

    func test_source_passeParK01EtResteAgnostique() throws {
        let files = [
            "MeeshyContextLines.swift", "MeeshyContextLinesViews.swift", "MeeshyContextLinesRows.swift",
            "Catalog/MeeshyKitCatalog+K24.swift",
        ]
        let forbidden = [
            "glassEffect", "adaptiveGlass", "adaptiveLiquidGlass", "UIBlurEffect", ".blur(", "Material",
            "Color(hex:", "Color(red:", "Color(white:", "Color.white", "Color.black", "Color.gray", "#FF", "0x",
            ".shared", "Composer", "Call", "UIImpactFeedbackGenerator", "GeometryReader",
        ]
        for file in files {
            let code = try Self.code(file)
            for word in forbidden {
                XCTAssertFalse(code.contains(word), "\(file) contient \(word)")
            }
        }
        let rows = try Self.code("MeeshyContextLinesRows.swift")
        XCTAssertTrue(rows.contains("MeeshyFadingScrollView"), "le débord se lit par la loi de K04")
        XCTAssertTrue(rows.contains(".meeshyGlass(in: Capsule()"), "le verre de la puce vient de K01")
    }

    // MARK: - Aides

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func json() throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K24-MeeshyContextLines.vectors.json")
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }

    private static func object(_ key: String) throws -> [String: Any] {
        try XCTUnwrap(try json()[key] as? [String: Any])
    }

    private static func loi(_ key: String) throws -> [[String: Any]] {
        try XCTUnwrap(try object("loi13")[key] as? [[String: Any]])
    }

    /// Le code d'un fichier du kit, commentaires retirés.
    private static func code(_ file: String) throws -> String {
        let url = repositoryRoot.appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Kit/\(file)")
        return try String(contentsOf: url, encoding: .utf8)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }
}
