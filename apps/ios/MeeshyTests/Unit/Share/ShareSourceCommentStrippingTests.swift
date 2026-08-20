import XCTest

/// Round 4 de revue Task 6 : `ShareSourceCommentStripping.strippingComments`
/// ne tenait aucun état « dans une chaîne » — seuls `//` et `/* */` étaient
/// reconnus. Dès qu'un littéral `"https://…"` apparaissait, le `//` interne
/// était pris pour le début d'un commentaire de ligne et effaçait tout le
/// reste de la ligne, y compris du code réel qui n'a rien d'un commentaire.
///
/// Le round 3 avait CONSTATÉ ce trou (voir la doc de
/// `ShareSourceCommentStripping`) mais affirmait à tort qu'aucune source
/// actuelle de `MeeshyShareExtension` n'en contenait un exemple. Faux :
/// `ShareSession.swift` (`"https://gate.meeshy.me"` et consorts) et
/// `ShareViewController.swift:418`
/// (`content.hasPrefix("http://") || content.hasPrefix("https://")`) en
/// contiennent tous les deux — le second test ci-dessous rejoue exactement
/// cette ligne.
final class ShareSourceCommentStrippingTests: XCTestCase {

    /// Cas générique, exactement celui décrit par le round 4 : un motif
    /// recherché suit un littéral `"https://…"` SUR LA MÊME LIGNE.
    func test_strippingComments_keepsAPatternThatFollowsAURLLiteralOnTheSameLine() {
        let source = #"""
        let endpoint = "https://gate.meeshy.me"; markerAfterURLLiteral()
        """#

        let stripped = ShareSourceCommentStripping.strippingComments(source)

        XCTAssertTrue(
            stripped.contains("markerAfterURLLiteral()"),
            "un « // » À L'INTÉRIEUR d'un littéral de chaîne (\"https://…\") ne doit pas être "
            + "pris pour le début d'un commentaire de ligne — le code qui suit sur la même "
            + "ligne ne doit pas disparaître"
        )
    }

    /// Rejoue le code réel de `ShareViewController.swift:418`. Sous l'ancien
    /// comportement, le premier `//` de `"http://"` déclenche un faux
    /// commentaire de ligne qui avale ` || content.hasPrefix("https://")` —
    /// du code réel, pas un commentaire.
    func test_strippingComments_keepsTheSecondHasPrefixCall_realShareViewControllerRegressionCase() {
        let source = #"""
        private func isLink(_ content: String) -> Bool {
            content.hasPrefix("http://") || content.hasPrefix("https://")
        }
        """#

        let stripped = ShareSourceCommentStripping.strippingComments(source)

        XCTAssertTrue(
            stripped.contains(#") || content.hasPrefix("#),
            "le code entre les deux appels hasPrefix a disparu — le « // » de \"http://\" a "
            + "été pris pour un commentaire de ligne, effaçant le reste de la ligne "
            + "(ShareViewController.swift:418)"
        )
    }
}
