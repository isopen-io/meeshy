import XCTest
import SwiftUI
import MeeshyUI
@testable import Meeshy

/// F-090 (WS-11) — contraste WCAG AA (≥ 4,5:1) des couleurs réellement
/// peintes par la rangée plate du Fil (contrat §WS-11 : « `WCAGContrast` sur
/// les 6 paires du design (texte/fond en clair et sombre, ✓✓ lu, méta,
/// nom) »).
///
/// **Lecture retenue des « 6 paires »** (le texte du contrat est ambigu sur
/// le découpage exact — RE-PREUVE consignée ici plutôt que devinée en
/// silence) : `texte/fond` et `✓✓ lu` sont les deux catégories qui possèdent
/// RÉELLEMENT une paire clair ET une paire sombre distinctes dans le code
/// (`MeeshyColors.textPrimary(isDark:)`, `readTint` de `FocalMetaRow`/
/// `FocalIdentityHeader`) — 2 + 2 = 4 paires. `nom` complète avec une paire
/// (thème clair, translucide — voir son test). `méta` en porte DEUX plutôt
/// qu'une seule (7 tests de contraste au total, pas 6) : la mesure a
/// découvert un DÉFAUT RÉEL sur les DEUX thèmes de `FocalMetaRow.metaTint`
/// (voir §5 ci-dessous) — le documenter correctement exige les deux, pas un
/// représentant unique. Aucun de ces tests n'est un test de RENDU (R15) :
/// `WCAGContrast` mesure une grandeur (rapport de luminance), jamais une
/// comparaison de `Color` par égalité structurelle.
///
/// **✅ Défaut réel corrigé — F-083ter.** `FocalMetaRow.swift` utilisait
/// `isDark ? .white.opacity(0.45) : .black.opacity(0.4)`, qui échouait AA
/// sur les DEUX thèmes : **2,85:1 en clair** (loin sous 4,5:1) et **4,49:1
/// en sombre** (sous le seuil, de justesse). `FocalIdentityHeader.metaTint`,
/// à trois lignes de là, utilisait `0.5`/`0.55` pour le MÊME rôle sémantique
/// (méta discrète) — les MÊMES valeurs que `BubbleFooter` (bulle
/// historique) — et ne régressait PAS. `FocalMetaRow` avait donc introduit
/// une opacité PLUS BASSE que sa propre rangée-sœur ET que la bulle qu'elle
/// remplace, sans raison apparente — régression F-083, non héritée.
///
/// **Remède appliqué — écart calculé vs la consigne littérale** : la
/// consigne de correction suggérait d'aligner sur `0.5`/`0.55` (les valeurs
/// historiques de `FocalIdentityHeader`/`BubbleFooter`). Calcul vérifié
/// AVANT d'appliquer : `0.5` clair (sur `#FFFFFF` pur) ne mesure que
/// **3,98:1** — encore SOUS AA. `0.55` clair mesure **4,76:1** (conforme) ;
/// `0.55` sombre mesure **6,26:1** (largement conforme). Retenu :
/// `FocalMetrics.MetaText.lightOpacity`/`.darkOpacity` = `0.55` pour LES
/// DEUX thèmes — une seule constante nommée, lue par les DEUX
/// rangées-sœurs (`FocalMetaRow` ET `FocalIdentityHeader`, qui abandonne
/// son ancien `0.5` clair au passage), plus de dérive silencieuse possible
/// entre elles (`test_citedOpacityLiterals_…` ancre désormais ce NOM, pas
/// un littéral). Les deux tests ci-dessous mesurent `0.55` et sont VERTS.
/// Effet de bord positif documenté, jamais demandé mais jamais une
/// régression : le déficit clair préexistant de `FocalIdentityHeader`
/// (3,98:1 → 4,76:1) est corrigé EN PRIME par le partage de la constante —
/// `BubbleFooter` (bulle historique, `§1.3`, hors `Focal/**`, jamais
/// modifiée) reste à `0.5`/3,98:1, hors périmètre de ce chantier.
///
/// Comme `ReportMessageSheetPaletteTests`/`StoryExportShareSheetPaletteTests` :
/// `@MainActor` (le pont `UIColor(_: Color)` de `WCAGContrast` est appelé
/// depuis ce contexte dans tout le dépôt), fonds RECONSTRUITS explicitement
/// (RE-PREUVE `ThemeManager.backgroundPrimary` : sombre `#09090B`, clair
/// `#FFFFFF`) plutôt que lus sur le singleton `ThemeManager.shared` — un
/// test de contraste doit être déterministe, indépendant de l'état système
/// du simulateur qui l'exécute.
@MainActor
final class FocalPaletteContrastTests: XCTestCase {

    private var aa: Double { WCAGContrast.aaThreshold }

    /// RE-PREUVE : `ThemeManager.backgroundPrimary` (`ThemeManager.swift`) —
    /// `mode.isDark ? Color(hex: "09090B") : Color(hex: "FFFFFF")`. La
    /// rangée plate n'a AUCUN fond de bulle (§WS-11 « aucune bulle ») : son
    /// texte se lit directement sur ce fond de conversation.
    private func background(isDark: Bool) -> Color {
        isDark ? Color(hex: "09090B") : Color(hex: "FFFFFF")
    }

    // MARK: - 1-2. texte/fond — `MeeshyColors.textPrimary(isDark:)`, clair et sombre
    //
    // Source : `BubbleExpandableText.body` (§1.3, lu par FocalRow.textBlock) —
    // `isMe ? .white : MeeshyColors.textPrimary(isDark: isDark)`. La branche
    // testée est celle du corps du contenu (`FocalRow`, WS-4), pas `isMe`
    // (blanc pur sur fond sombre/clair est un cas trivialement conforme).

    func test_bodyText_lightTheme_meetsAA() {
        let ratio = WCAGContrast.ratio(MeeshyColors.textPrimary(isDark: false), background(isDark: false))
        XCTAssertGreaterThanOrEqual(
            ratio, aa,
            "texte/fond CLAIR (MeeshyColors.textPrimary(isDark: false) sur #FFFFFF) : " +
            "\(WCAGContrast.fmt(ratio)):1 — sous le seuil AA \(aa):1"
        )
    }

    func test_bodyText_darkTheme_meetsAA() {
        let ratio = WCAGContrast.ratio(MeeshyColors.textPrimary(isDark: true), background(isDark: true))
        XCTAssertGreaterThanOrEqual(
            ratio, aa,
            "texte/fond SOMBRE (MeeshyColors.textPrimary(isDark: true) sur #09090B) : " +
            "\(WCAGContrast.fmt(ratio)):1 — sous le seuil AA \(aa):1"
        )
    }

    // MARK: - 3-4. ✓✓ lu — `indigo600` clair / `indigo400` sombre
    //
    // Source : `FocalMetaRow.readTint`/`FocalIdentityHeader.readTint` —
    // paire ACTÉE conforme par le contrat §0 (« on garde la paire réelle du
    // dépôt : indigo400 en sombre / indigo600 en clair, BubbleFooter.readColor ;
    // le ✓✓ #A5B4FC de la spec est un échec WCAG AA sur #F8F7FF »). Ces deux
    // tests reconfirment cette paire sur le fond RÉEL de la rangée plate
    // (`#FFFFFF`/`#09090B`), pas sur le `#F8F7FF` cité par la spec.

    func test_readReceipt_lightTheme_indigo600_meetsAA() {
        let ratio = WCAGContrast.ratio(MeeshyColors.indigo600, background(isDark: false))
        XCTAssertGreaterThanOrEqual(
            ratio, aa,
            "✓✓ lu CLAIR (MeeshyColors.indigo600 sur #FFFFFF) : \(WCAGContrast.fmt(ratio)):1 — " +
            "sous le seuil AA \(aa):1 (contrat §0 : paire actée conforme, à reconfirmer sur le fond réel de la rangée)"
        )
    }

    func test_readReceipt_darkTheme_indigo400_meetsAA() {
        let ratio = WCAGContrast.ratio(MeeshyColors.indigo400, background(isDark: true))
        XCTAssertGreaterThanOrEqual(
            ratio, aa,
            "✓✓ lu SOMBRE (MeeshyColors.indigo400 sur #09090B) : \(WCAGContrast.fmt(ratio)):1 — " +
            "sous le seuil AA \(aa):1 (contrat §0 : paire actée conforme, à reconfirmer sur le fond réel de la rangée)"
        )
    }

    // MARK: - 5-6. méta — `FocalMetaRow.metaTint` (CORRIGÉ F-083ter, clair ET sombre)
    //
    // Couleur translucide (`Color.opacity(_:)`) : `WCAGContrast.ratio` seul
    // mesurerait la couleur non composée, jamais affichée telle quelle — il
    // faut `ratioOfTranslucentForeground` (composite « source over » sur le
    // fond AVANT de mesurer). Les DEUX thèmes sont testés ici (voir la note
    // de tête de fichier).
    //
    // **F-083ter — corrigé, les deux tests sont maintenant VERTS.**
    // `FocalMetaRow.metaTint` lit désormais `FocalMetrics.MetaText.lightOpacity`/
    // `.darkOpacity` (`0.55` les deux thèmes — PAS `0.5`/`0.55` comme
    // suggéré littéralement : `0.5` clair ne mesure que 3,98:1, encore sous
    // AA, calcul vérifié — voir la doc de `FocalMetrics.MetaText`). Ces
    // tests mesurent directement `0.55` (la valeur RÉELLE désormais peinte),
    // pas une référence à la constante — `test_citedOpacityLiterals_…`
    // ci-dessous ancre cette valeur au fichier source réel.

    func test_meta_lightTheme_blackOpacityPoint55_meetsAA() {
        let ratio = WCAGContrast.ratioOfTranslucentForeground(Color.black.opacity(0.55), on: background(isDark: false))
        XCTAssertGreaterThanOrEqual(
            ratio, aa,
            "méta CLAIR (FocalMetaRow.metaTint = .black.opacity(FocalMetrics.MetaText.lightOpacity) sur " +
            "#FFFFFF, composé) : \(WCAGContrast.fmt(ratio)):1 — sous le seuil AA \(aa):1"
        )
    }

    func test_meta_darkTheme_whiteOpacityPoint55_meetsAA() {
        let ratio = WCAGContrast.ratioOfTranslucentForeground(Color.white.opacity(0.55), on: background(isDark: true))
        XCTAssertGreaterThanOrEqual(
            ratio, aa,
            "méta SOMBRE (FocalMetaRow.metaTint = .white.opacity(FocalMetrics.MetaText.darkOpacity) sur " +
            "#09090B, composé) : \(WCAGContrast.fmt(ratio)):1 — sous le seuil AA \(aa):1"
        )
    }

    // MARK: - 6. nom — `FocalIdentityHeader.nameColor` (branche non-`isMe`)
    //
    // `isMe` peint le nom en `indigo500` (couleur d'accent pleine, non
    // translucide, cas trivialement conforme sur les deux fonds) — la
    // branche testée est la branche NON-`isMe`, translucide, thème CLAIR
    // (`black.opacity(0.88)`, la formule la plus proche du seuil des deux
    // thèmes de `FocalIdentityHeader.nameColor`).

    func test_name_lightTheme_blackOpacityPoint88_meetsAA() {
        let ratio = WCAGContrast.ratioOfTranslucentForeground(Color.black.opacity(0.88), on: background(isDark: false))
        XCTAssertGreaterThanOrEqual(
            ratio, aa,
            "nom CLAIR (FocalIdentityHeader.nameColor, branche non-isMe = .black.opacity(0.88) sur #FFFFFF, composé) : " +
            "\(WCAGContrast.fmt(ratio)):1 — sous le seuil AA \(aa):1"
        )
    }

    // MARK: - RE-PREUVE : les littéraux d'opacité cités ci-dessus existent bien dans le code réel

    /// Si `FocalMetaRow`/`FocalIdentityHeader` changent leurs formules
    /// d'opacité sans que ce fichier ne soit mis à jour, les tests ci-dessus
    /// mesureraient un contraste qui ne correspond plus à rien de réellement
    /// peint — silencieusement. Cette garde ancre les littéraux cités aux
    /// fichiers qui les portent réellement.
    func test_citedOpacityLiterals_stillMatchTheRealSourceFiles() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Focal/Row")

        // F-083ter : FocalMetaRow ne porte plus de littéral d'opacité — il
        // lit FocalMetrics.MetaText (garde R15). L'ancre suit : elle
        // vérifie que le fichier référence bien la constante nommée, pas un
        // littéral concurrent qui aurait pu se réinviter silencieusement.
        let metaRow = AppSourceGuard.stripComments(
            try String(contentsOf: root.appendingPathComponent("FocalMetaRow.swift"), encoding: .utf8)
        )
        XCTAssertTrue(
            metaRow.contains("FocalMetrics.MetaText.lightOpacity") && metaRow.contains("FocalMetrics.MetaText.darkOpacity"),
            "FocalMetaRow.swift ne référence plus FocalMetrics.MetaText.lightOpacity/darkOpacity — " +
            "test_meta_lightTheme_…/test_meta_darkTheme_… mesurent une valeur qui ne correspond plus au " +
            "code réel (garde R15 : plus jamais de littéral d'opacité en dur ici), à réaligner"
        )
        XCTAssertFalse(
            metaRow.contains(".opacity(0.4)") || metaRow.contains(".opacity(0.45)"),
            "FocalMetaRow.swift a réintroduit un littéral d'opacité concurrent (0.4/0.45) — régression F-083 de retour"
        )

        let identityHeader = AppSourceGuard.stripComments(
            try String(contentsOf: root.appendingPathComponent("FocalIdentityHeader.swift"), encoding: .utf8)
        )
        XCTAssertTrue(
            identityHeader.contains(".black.opacity(0.88)"),
            "FocalIdentityHeader.swift ne contient plus `.black.opacity(0.88)` — test_name_lightTheme_… mesure " +
            "une valeur qui ne correspond plus au code réel, à réaligner"
        )
        // Directive 2026-08-23 : l'en-tête ne porte plus de méta — l'heure et
        // les coches sont descendues dans `FocalMetaRow`. La constante
        // partagée n'a donc plus qu'UN lecteur, et c'est lui qu'on garde :
        // exiger encore la référence dans l'en-tête ferait rougir le test
        // pour une teinte que ce fichier n'utilise plus.
        XCTAssertFalse(
            identityHeader.contains("FocalMetrics.MetaText"),
            "FocalIdentityHeader.swift ne porte plus de texte méta — s'il relit MetaText, c'est que " +
            "l'heure ou les coches y sont revenues (directive « toujours en bas »)"
        )
        XCTAssertTrue(
            metaRow.contains("FocalMetrics.MetaText.lightOpacity") && metaRow.contains("FocalMetrics.MetaText.darkOpacity"),
            "FocalMetaRow.swift ne référence plus FocalMetrics.MetaText — la constante partagée qui tient " +
            "la teinte méta au niveau AA (régression F-083)"
        )
    }
}
