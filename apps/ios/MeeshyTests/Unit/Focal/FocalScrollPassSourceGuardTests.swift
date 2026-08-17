import XCTest
@testable import Meeshy

/// F-084 (WS-5) — les critères §7 « Fluidité » et la garde R15 qui ne se
/// prouvent pas en exécutant une assertion sur une valeur, mais en inspectant
/// le CODE du pass (même patron que `FocalRowSourceGuardTests`, F-083).
final class FocalScrollPassSourceGuardTests: XCTestCase {

    /// Les trois fichiers de CALCUL / d'ÉCRITURE du pass. `FocalPassConstants`
    /// en est volontairement absent : c'est le domicile déclaré des cotes du
    /// §4 absentes du miroir et du token, donc le seul fichier autorisé à
    /// porter des nombres.
    private static let passFiles = [
        "FocalScrollPass.swift",
        "FocalFocusDecoration.swift",
        "FocalPerspectiveGeometry.swift"
    ]

    private func source(_ fileName: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Focal/Scroll/\(fileName)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func strippedSource(_ fileName: String) throws -> String {
        AppSourceGuard.stripComments(try source(fileName))
    }

    // MARK: - « Aucun relayout » (critère §WS-5)

    func test_passFiles_containNoLayoutInvalidation() throws {
        // `invalidate` nu (et pas seulement `invalidateLayout`) : même garde
        // que LWS-8 côté Lentille — toute invalidation, quelle qu'en soit la
        // cible, sort du « pur compositor ».
        let forbidden = ["invalidate", "setNeedsLayout", "layoutIfNeeded", "reconfigureItems", "frame(height:"]
        for file in Self.passFiles {
            let code = try strippedSource(file)
            for symbol in forbidden {
                XCTAssertFalse(
                    code.contains(symbol),
                    "\(file) contient `\(symbol)` — le pass est PUR COMPOSITOR (opacity/scale seuls) : aucun relayout, aucune invalidation (critère §WS-5)"
                )
            }
        }
    }

    /// La typographie 15 → 16 de la rangée nette (§4.6) appartient à WS-6, à
    /// l'ARRÊT du défilement : la faire par frame violerait le même critère.
    func test_pass_neverReconfiguresItems() throws {
        XCTAssertFalse(
            try strippedSource("FocalScrollPass.swift").contains("reconfigure"),
            "FocalScrollPass.swift ne doit jamais reconfigurer un item — la typographie 15→16 est reportée à l'arrêt du défilement, côté WS-6 (§4.6)"
        )
    }

    // MARK: - Contrainte dure §WS-5 : le pass ne connaît pas l'hôte

    func test_passFiles_doNotReferenceTheHost() throws {
        let hostTypes = ["MessageListViewController", "MessageStore", "MessageListItem", "ConversationViewModel"]
        for file in Self.passFiles {
            let code = try strippedSource(file)
            for type in hostTypes {
                XCTAssertFalse(
                    code.contains(type),
                    "\(file) référence `\(type)` — WS-5 reçoit une UICollectionView et une closure de description, rien d'autre (contrainte dure §WS-5)"
                )
            }
        }
    }

    // MARK: - Garde R15 : aucune constante de loi en dur

    /// Les nombres de la courbe, de la bande et des plafonds vivent dans le
    /// miroir GELÉ ou dans `FocalPassConstants` — jamais dans un fichier de
    /// calcul ou d'écriture.
    func test_passFiles_carryNoLawLiteral() throws {
        let forbidden = ["380", "520", "0.82", "0.45", "0.40", "0.7", "0.8", "150", "140", "95"]
        for file in Self.passFiles {
            let code = try strippedSource(file)
            for literal in forbidden {
                XCTAssertFalse(
                    code.contains(literal),
                    "\(file) contient le littéral `\(literal)` — garde R15 : les constantes viennent de FocalFocusCurve (GELÉ), de FocalMetrics ou de FocalPassConstants"
                )
            }
        }
    }

    /// `FocalPassConstants` est le domicile UNIQUE des cotes du §4 absentes
    /// des miroirs et du token — et chacune porte son TODO contractuel
    /// (patron F-082 : une valeur hors-token se signale, ne se dissout pas).
    func test_passConstants_declareEveryOrphanValueWithItsContractualTodo() throws {
        let code = try source("FocalPassConstants.swift")
        for symbol in ["optimisticAlphaCeiling", "bandGap", "headInsetMaxRatio", "landingTolerance"] {
            XCTAssertTrue(
                code.contains(symbol),
                "FocalPassConstants.swift doit déclarer `\(symbol)` — sinon la valeur repart en dur dans une vue"
            )
        }
        XCTAssertGreaterThanOrEqual(
            code.components(separatedBy: "TODO CONTRACTUEL").count - 1, 4,
            "chaque cote hors-token de FocalPassConstants.swift doit porter son TODO CONTRACTUEL (extension de contrat à demander — le token est gelé)"
        )
    }

    // MARK: - La courbe se CONSOMME, ne se réécrit jamais

    func test_geometry_consumesTheFrozenMirror() throws {
        let code = try strippedSource("FocalPerspectiveGeometry.swift")
        for symbol in [
            "FocalFocusCurve.focusCurve(",
            "FocalFocusCurve.electFocusRow(",
            "FocalFocusCurve.focusBandOffset",
            "FocalFocusCurve.focusBandHalfHeight"
        ] {
            XCTAssertTrue(
                code.contains(symbol),
                "FocalPerspectiveGeometry.swift doit consommer `\(symbol)` du miroir GELÉ — la courbe, la bande et l'hystérésis ne se recalculent jamais ici"
            )
        }
    }

    func test_geometry_usesTheThreadVariantNotTheListOne() throws {
        let code = try strippedSource("FocalPerspectiveGeometry.swift")
        XCTAssertTrue(code.contains("variant: .thread"),
                      "FocalPerspectiveGeometry.swift doit consommer le variant .thread (courbe du FIL, A3)")
        XCTAssertFalse(code.contains("variant: .list"),
                       "FocalPerspectiveGeometry.swift ne doit jamais consommer le variant .list — c'est la courbe de la Lentille")
    }

    // MARK: - §4.3 : la correction d'ancrage, pas `anchorPoint`

    func test_pass_neverTouchesAnchorPoint() throws {
        for file in Self.passFiles {
            XCTAssertFalse(
                try strippedSource(file).contains("anchorPoint"),
                "\(file) modifie `anchorPoint` — §4.3 exige la translation compensatoire (m41/m42) à la place : anchorPoint déplace le layer et exigerait un prepareForReuse qui n'existe pas"
            )
        }
    }

    func test_pass_writesTheTransformOnTheLayerWithBothTranslationComponents() throws {
        let code = try strippedSource("FocalScrollPass.swift")
        XCTAssertTrue(code.contains("cell.layer.transform"),
                      "FocalScrollPass.swift doit écrire cell.layer.transform (CATransform3D), pas cell.transform (CGAffineTransform)")
        XCTAssertTrue(code.contains(".m41") && code.contains(".m42"),
                      "FocalScrollPass.swift doit poser les DEUX composantes de la translation compensatoire (§4.3)")
        XCTAssertFalse(code.contains("cell.transform"),
                       "FocalScrollPass.swift ne doit jamais écrire cell.transform — le CGAffineTransform de la cellule se battrait avec l'inversion parentale")
    }

    /// Idempotence (§4.2) : l'ARITHMÉTIQUE du pass lit `cell.center` /
    /// `cell.bounds`, jamais `cell.frame` — le getter de `frame` intègre le
    /// transform déjà posé, ce qui ferait dériver le résultat à chaque nouvel
    /// appel (et il y en a six).
    ///
    /// **Recalibré — déplacé par `20c7b738` (« la base de la carte devient la
    /// rangée d'action ») puis `38781d0e` (« la garde “entièrement visible”
    /// comparait deux repères qui ne coïncidaient pas »), l'invariant est
    /// inchangé : rien de ce qui NOURRIT le transform ne lit `frame`.**
    ///
    /// Ces commits ont introduit `isFullyVisible(_:in:)`, qui décide si la
    /// rangée élue est assez dégagée pour porter sa carte, et qui lit `frame`
    /// DÉLIBÉRÉMENT — sa doc le dit : « on teste ce que l'œil voit, pas la
    /// boîte de layout ». Ce choix se tient, et il ne casse pas
    /// l'idempotence :
    ///
    ///   - la lecture a lieu APRÈS l'écriture du transform de la MÊME passe
    ///     (`apply` écrit toutes les cellules dans sa première boucle, et
    ///     n'appelle `decoration.update` que dans la seconde), donc elle ne
    ///     lit jamais la sortie de la frame PRÉCÉDENTE ;
    ///   - le transform étant une fonction déterministe d'entrées elles-mêmes
    ///     invariantes (`center`, `bounds`, `contentOffset`, `contentInset`),
    ///     rejouer la passe rend le même `frame`, donc le même verdict ;
    ///   - la correction d'ancrage du §4.3 (`ty = −(h/2)(1−s)`) laisse de
    ///     surcroît `frame.minY` RIGOUREUSEMENT égal au bord de layout — seul
    ///     `frame.maxY` diffère, de `(1−s)·h`, et c'est précisément le bord
    ///     dont on veut la mesure RENDUE puisque la carte est dessinée à
    ///     l'intérieur de la cellule mise à l'échelle.
    ///
    /// L'interdit reste donc ABSOLU partout où il protège l'arithmétique, et
    /// l'exception est ÉPINGLÉE à sa seule fonction : le témoin découpe
    /// `isFullyVisible` et exige zéro `cell.frame` dans tout le reste du
    /// fichier. Un `cell.frame` qui reparaîtrait dans `apply`, `transform`,
    /// `write` ou `reset` fait tomber ce test comme avant — ce qui a changé,
    /// c'est qu'on sait maintenant NOMMER l'endroit où il est permis.
    func test_pass_readsCenterAndBounds_neverFrame() throws {
        let code = try strippedSource("FocalScrollPass.swift")
        XCTAssertTrue(code.contains("cell.center"),
                      "FocalScrollPass.swift doit lire cell.center (invariant par layer.transform) pour l'ordonnée de contenu")
        XCTAssertTrue(code.contains("cell.bounds"),
                      "FocalScrollPass.swift doit lire cell.bounds pour la taille (invariante par layer.transform)")

        // La SEULE exception admise, découpée puis retirée du fichier.
        let marker = "func isFullyVisible(_ cell: UICollectionViewCell, in collectionView: UICollectionView) -> Bool {"
        guard let start = code.range(of: marker) else {
            XCTFail("`isFullyVisible` introuvable dans FocalScrollPass.swift — la garde du §4.6 a-t-elle été renommée ? L'exception `cell.frame` doit rester nommée pour rester bornée.")
            return
        }
        guard let end = code.range(of: "\n    }\n", range: start.upperBound..<code.endIndex) else {
            XCTFail("Fin du corps d'`isFullyVisible` introuvable.")
            return
        }
        let isFullyVisibleBody = String(code[start.upperBound..<end.lowerBound])
        let rest = String(code[code.startIndex..<start.lowerBound]) + String(code[end.upperBound...])

        XCTAssertFalse(
            rest.contains("cell.frame"),
            "FocalScrollPass.swift lit `cell.frame` HORS d'`isFullyVisible` — le getter intègre le transform déjà écrit et rendrait le pass NON idempotent (§4.2). Seule la garde « entièrement visible » a le droit de mesurer la boîte de RENDU, et seulement parce qu'elle décide d'un dessin, jamais d'un calcul."
        )

        // L'exception est bornée aux DEUX bords, et à eux seuls : elle ne doit
        // pas devenir un guichet ouvert dans lequel d'autres lectures se
        // glissent au fil des passages.
        let framesInGuard = isFullyVisibleBody.components(separatedBy: "cell.frame").count - 1
        XCTAssertLessThanOrEqual(
            framesInGuard, 2,
            "`isFullyVisible` lit `cell.frame` \(framesInGuard) fois — deux au plus sont admises (les deux bords, `minY` et `maxY`). Toute lecture supplémentaire doit se justifier, ou passer par `center`/`bounds` comme le reste du pass."
        )
    }

    // MARK: - §4.4 : un seul écrivain sur `cell.alpha`

    func test_decoration_writesNeitherCellAlphaNorCellTransform() throws {
        let code = try strippedSource("FocalFocusDecoration.swift")
        XCTAssertFalse(code.contains("cell.alpha"),
                       "FocalFocusDecoration.swift écrit cell.alpha — cette propriété appartient au pass (§4.4 : deux écrivains est le bug n°1 du chantier)")
        XCTAssertFalse(code.contains("cell.transform") || code.contains("cell.layer.transform"),
                       "FocalFocusDecoration.swift écrit le transform de la cellule — c'est le rôle du pass, pas de la décoration (§4.7)")
    }

    /// Aucune animation implicite : un `CALayer` posé à la main n'est pas
    /// adossé à une vue, ses écritures déclenchent les actions par défaut de
    /// CoreAnimation. Sans cette garde, la carte traîne derrière le doigt.
    func test_decoration_disablesImplicitAnimations() throws {
        let code = try strippedSource("FocalFocusDecoration.swift")
        XCTAssertTrue(
            code.contains("CATransaction.setDisableActions(true)"),
            "FocalFocusDecoration.swift doit désactiver les actions implicites autour de ses écritures de layer — sinon chaque frame anime la carte sur ~0,25 s"
        )
    }

    // MARK: - §4.6 : la carte lit ses cotes dans le token

    func test_decoration_readsItsGeometryFromFocalMetrics() throws {
        let code = try strippedSource("FocalFocusDecoration.swift")
        for symbol in [
            "FocalMetrics.FocusCard.radius",
            "FocalMetrics.FocusCard.ringSize",
            "FocalMetrics.FocusCard.marginHorizontal",
            "FocalMetrics.FocusCard.marginVertical"
        ] {
            XCTAssertTrue(
                code.contains(symbol),
                "FocalFocusDecoration.swift doit lire `\(symbol)` (miroir du token thread.focusCard) — aucune cote de carte en dur"
            )
        }
    }

    // MARK: - §4.9 : les DEUX sources de Reduce Motion

    func test_pass_readsBothReduceMotionSourcesThroughTheSharedLaw() throws {
        let code = try strippedSource("FocalScrollPass.swift")
        XCTAssertTrue(
            code.contains("MeeshyMotion.shouldReduce("),
            "FocalScrollPass.swift doit passer par MeeshyMotion.shouldReduce(system:userForced:) — lire UIAccessibility.isReduceMotionEnabled seul ignore la bascule in-app (§4.9)"
        )
        XCTAssertFalse(
            code.contains("UIAccessibility.isReduceMotionEnabled"),
            "FocalScrollPass.swift ne doit pas lire la clé système directement — la décision est fournie par l'hôte, à travers la loi partagée (§4.9)"
        )
    }

    // MARK: - §5.1 : aucune seconde source d'identité invité

    func test_passFiles_neverProbeGuestIdentity() throws {
        let forbidden = ["anonymousSession", "isAnonymous", "authManager.currentUser"]
        for file in Self.passFiles {
            let code = try strippedSource(file)
            for probe in forbidden {
                XCTAssertFalse(
                    code.contains(probe),
                    "\(file) teste `\(probe)` — §5.1 : ConversationViewerIdentityResolver est le seul point de branchement invité de tout Focal/**"
                )
            }
        }
    }
}
