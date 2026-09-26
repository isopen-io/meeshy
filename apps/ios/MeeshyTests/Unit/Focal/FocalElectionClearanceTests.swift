import XCTest
@testable import Meeshy

/// **Aucune pastille du message magnifié ne recouvre de texte** (#7953).
///
/// Recette du 2026-09-25 : en SUITE de groupe, la pastille d'identité (34 pt,
/// centrée sur la ligne haute de la carte) mangeait la dernière ligne du
/// message précédent ET la première du sien — aucune hauteur n'était réservée
/// sous elle, et la rangée ne doit pas changer de taille à l'élection.
///
/// Le témoin pose la disposition dans le repère du BLOC de contenu de la
/// rangée magnifiée (y = 0 à son haut, `blockHeight` à son bas) et vérifie,
/// cote par cote, que chaque pastille reste hors du texte de ses voisines et
/// du sien : pastille d'identité en haut, bande basse en bas, en tête comme
/// en suite de groupe, loupe comprise.
final class FocalElectionClearanceTests: XCTestCase {

    private let pad = FocalMetrics.Row.paddingVertical
    private let blockHeight: CGFloat = 60

    private struct Layout {
        let identityChip: ClosedRange<CGFloat>
        let ownTextTop: CGFloat
        let ownTextBottom: CGFloat
        let bottomStrip: ClosedRange<CGFloat>
        let previousTextBottom: CGFloat
        let nextTextTop: CGFloat
    }

    private func layout(isFirstInGroup: Bool, nextIsFirstInGroup: Bool = false, loupeGrowth: CGFloat = 0) -> Layout {
        let strip = FocalMetrics.FocusStrip.self
        let lift = strip.contentLift(isFirstInGroup: isFirstInGroup)
        let clearance = FocalScrollPerspective.electionClearance(isFirstInGroup: isFirstInGroup)
        let above = FocalScrollPerspective.electionShift(cellMidY: -1_000, magnifiedMidY: 0, clearance: clearance, loupeGrowth: loupeGrowth)
        let below = FocalScrollPerspective.electionShift(cellMidY: 1_000, magnifiedMidY: 0, clearance: clearance, loupeGrowth: loupeGrowth)
        let ownTop = pad + (isFirstInGroup ? FocalMetrics.Row.groupTopPadding : 0)
        let nextTop = pad + (nextIsFirstInGroup ? FocalMetrics.Row.groupTopPadding : 0)
        let chipTop = -strip.identityOverhang - loupeGrowth
        let stripBottom = blockHeight + lift + strip.stripDrop + strip.overhang + loupeGrowth
        // En tête de groupe, l'en-tête — effacé en focus, toujours réservé —
        // précède le texte ; en suite, le texte commence au bloc, descendu.
        let header = isFirstInGroup ? FocalMetrics.Focus.avatarSize : 0
        return Layout(
            identityChip: chipTop...(chipTop + strip.identityChipHeight),
            ownTextTop: lift + header,
            ownTextBottom: blockHeight + lift,
            bottomStrip: (stripBottom - strip.chipHeight)...stripBottom,
            previousTextBottom: -ownTop - pad + above,
            nextTextTop: blockHeight + pad + nextTop + below
        )
    }

    func test_theIdentityChip_neverCoversThePreviousMessage() {
        for head in [true, false] {
            for growth in [CGFloat(0), FocalMetrics.FocusCard.marginVertical] {
                let l = layout(isFirstInGroup: head, loupeGrowth: growth)
                XCTAssertLessThan(l.previousTextBottom, l.identityChip.lowerBound,
                                  "tête=\(head), loupe=\(growth) : la pastille d'identité mord le message précédent")
            }
        }
    }

    func test_theIdentityChip_neverCoversItsOwnText() {
        for head in [true, false] {
            let l = layout(isFirstInGroup: head)
            XCTAssertLessThanOrEqual(l.identityChip.upperBound, l.ownTextTop,
                                     "tête=\(head) : la pastille d'identité mord la première ligne de son propre message")
        }
    }

    func test_theBottomStrip_neverCoversItsOwnLastLine() {
        for head in [true, false] {
            let l = layout(isFirstInGroup: head)
            XCTAssertGreaterThanOrEqual(l.bottomStrip.lowerBound, l.ownTextBottom,
                                        "tête=\(head) : la bande basse mord la dernière ligne de son propre message")
        }
    }

    func test_theBottomStrip_neverCoversTheNextMessage() {
        for head in [true, false] {
            for nextHead in [true, false] {
                for growth in [CGFloat(0), FocalMetrics.FocusCard.marginVertical] {
                    let l = layout(isFirstInGroup: head, nextIsFirstInGroup: nextHead, loupeGrowth: growth)
                    XCTAssertLessThan(l.bottomStrip.upperBound, l.nextTextTop,
                                      "tête=\(head), suivante en tête=\(nextHead), loupe=\(growth) : la bande basse mord le message suivant")
                }
            }
        }
    }

    /// La rangée ne change pas de taille à l'élection : la descente d'une
    /// suite est un RENDU, et le passage s'ouvre par translation des voisines.
    func test_theMagnifiedRow_keepsItsHeight_andOnlyItsNeighboursMove() {
        let clearance = FocalScrollPerspective.electionClearance(isFirstInGroup: false)
        XCTAssertEqual(FocalScrollPerspective.electionShift(cellMidY: 10, magnifiedMidY: 10, clearance: clearance, loupeGrowth: 4), 0)
        XCTAssertLessThan(FocalScrollPerspective.electionShift(cellMidY: 0, magnifiedMidY: 10, clearance: clearance, loupeGrowth: 0), 0, "le dessus monte")
        XCTAssertGreaterThan(FocalScrollPerspective.electionShift(cellMidY: 20, magnifiedMidY: 10, clearance: clearance, loupeGrowth: 0), 0, "le dessous descend")
        XCTAssertEqual(FocalScrollPerspective.electionShift(cellMidY: 20, magnifiedMidY: nil, clearance: clearance, loupeGrowth: 0), 0,
                       "aucune rangée magnifiée à l'écran : aucun passage")
    }

    /// Le passage s'ouvre autour de la rangée qui REND ses pastilles — lue sur
    /// l'étiquette de sa cellule. L'identifiant « détaillé » change avant que
    /// la reconfiguration ne les pose : mesuré au simulateur, le passage
    /// s'ouvrait autour de la rangée SUIVANTE pendant que la précédente
    /// portait encore ses pastilles.
    func test_theCellTag_carriesBothTheGroupHeadAndTheRenderedFocusDetails() {
        for head in [true, false] {
            for details in [true, false] {
                let tag = FocalScrollPerspective.cellTag(isFirstInGroup: head, showsFocusDetails: details)
                XCTAssertEqual(FocalScrollPerspective.isGroupHead(cellTag: tag), head)
                XCTAssertEqual(FocalScrollPerspective.showsFocusDetails(cellTag: tag), details)
            }
        }
    }

    /// Mesuré au simulateur : le passage était CALCULÉ mais pas RENDU, la
    /// mise en page de la cellule recalant son `contentView` par son `frame`,
    /// ce qui annule une translation. La pose doit survivre à la mise en page.
    @MainActor
    func test_theFocalPose_survivesTheCellLayout() {
        let cell = MessageListCell(frame: CGRect(x: 0, y: 0, width: 390, height: 80))
        cell.layoutIfNeeded()
        let pose = CATransform3DMakeTranslation(0, -30, 0)
        cell.contentView.layer.transform = pose
        cell.frame = CGRect(x: 0, y: 0, width: 390, height: 96)
        cell.setNeedsLayout()
        cell.layoutIfNeeded()
        XCTAssertTrue(CATransform3DEqualToTransform(cell.contentView.layer.transform, pose), "la pose reste posée")
        XCTAssertEqual(cell.contentView.center.y, 48, accuracy: 0.001, "le contenu reste centré : la translation n'est pas annulée")
        XCTAssertEqual(cell.contentView.bounds.height, 96, accuracy: 0.001)
    }

    /// Le passage se pose dans le repère RENVERSÉ du fil, avec la loupe.
    @MainActor
    func test_magnify_composesThePassageWithTheLoupe() {
        let layer = CALayer()
        layer.bounds = CGRect(x: 0, y: 0, width: 390, height: 60)
        FocalScrollPerspective.magnify(layer, isFocused: false, shift: 12, animated: false)
        XCTAssertEqual(layer.transform.m42, -12, accuracy: 0.0001, "vers le bas visuel = −y du layer renversé")
        XCTAssertEqual(layer.transform.m11, 1, accuracy: 0.0001)
        FocalScrollPerspective.magnify(layer, isFocused: false, shift: 0, animated: false)
        XCTAssertTrue(CATransform3DIsIdentity(layer.transform))
    }
}
