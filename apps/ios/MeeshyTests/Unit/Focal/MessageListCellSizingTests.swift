// apps/ios/MeeshyTests/Unit/Focal/MessageListCellSizingTests.swift

import XCTest
import UIKit
import SwiftUI
@testable import Meeshy

/// #7624 — une cellule du fil ne redemande JAMAIS une taille pour un bruit
/// de flottant.
///
/// Mesuré au simulateur (fil « Meeshy Global », sonde sur
/// `preferredLayoutAttributesFitting`) : sur 1 723 corrections self-sizing en
/// deux séries de flings, 1 046 rendaient une hauteur égale à la hauteur
/// courante à 10⁻⁶ près (`in=36.333333 out=36.333333` : le séparateur de jour,
/// 759 fois). UIKit compare les attributs EXACTEMENT : chaque écart de
/// flottant invalidait le layout et jouait une passe de mise à jour — une par
/// image, pendant tout le défilement.
@MainActor
final class MessageListCellSizingTests: XCTestCase {

    func test_stabilizedHeight_floatNoiseOnTheSameHeight_keepsCurrent() {
        let current: CGFloat = 109.0 / 3.0
        let fitted = current + 0.000_000_4
        XCTAssertEqual(
            MessageListCellSizingLaw.stabilizedHeight(fitted: fitted, current: current, scale: 3),
            current,
            "un bruit de flottant n'est pas une nouvelle hauteur : la hauteur COURANTE, à l'identique"
        )
    }

    func test_stabilizedHeight_subPixelDrift_keepsCurrent() {
        XCTAssertEqual(
            MessageListCellSizingLaw.stabilizedHeight(fitted: 50.4, current: 50.333_333, scale: 3),
            50.333_333,
            "un écart qui tombe sur le même pixel physique ne se voit pas — il ne coûte donc pas une passe de layout"
        )
    }

    func test_stabilizedHeight_realGrowth_returnsThePixelSnappedHeight() {
        let result = MessageListCellSizingLaw.stabilizedHeight(fitted: 70.333_335, current: 36.333_333, scale: 3)
        XCTAssertEqual(result, 211.0 / 3.0, accuracy: 0.000_001, "une vraie croissance passe, calée sur la grille des pixels")
    }

    func test_stabilizedHeight_snappedResult_isAFixedPoint() {
        let first = MessageListCellSizingLaw.stabilizedHeight(fitted: 70.333_335, current: 36.333_333, scale: 3)
        XCTAssertEqual(
            MessageListCellSizingLaw.stabilizedHeight(fitted: 70.333_335, current: first, scale: 3),
            first,
            "re-mesurée avec sa nouvelle hauteur, la cellule ne propose plus rien — sinon elle ré-invaliderait à chaque passe"
        )
    }

    /// La cellule du fil applique la loi à la taille que son contenu propose :
    /// les attributs rendus sont ceux du layout, À L'IDENTIQUE, quand la
    /// différence n'est que du bruit.
    func test_preferredLayoutAttributesFitting_noiseOnly_returnsTheLayoutHeight() {
        let cell = MessageListCell(frame: CGRect(x: 0, y: 0, width: 390, height: 36.333_333))
        let height = cell.contentView.heightAnchor.constraint(equalToConstant: 36.333_334)
        height.priority = .init(999)
        height.isActive = true
        let attributes = UICollectionViewLayoutAttributes(forCellWith: IndexPath(item: 0, section: 0))
        attributes.frame = CGRect(x: 0, y: 0, width: 390, height: 36.333_333)

        let preferred = cell.preferredLayoutAttributesFitting(attributes)

        XCTAssertEqual(preferred.frame.height, 36.333_333, "aucune correction pour un bruit de flottant")
    }

    /// #7660 — la hauteur d'une rangée ne dépend pas de l'ENDROIT de l'écran
    /// où elle passe.
    ///
    /// Le fil s'étend sous la bande de l'îlot et sous l'indicateur d'accueil ;
    /// une cellule qui y passe reçoit un `safeAreaInsets` non nul, et le
    /// contenu `UIHostingConfiguration` l'AJOUTE à sa taille. Mesuré au
    /// simulateur : un séparateur de jour de 36 pt re-mesuré à 98 pt sous
    /// l'îlot (36 + 62), et 1 362 redimensionnements réels par série de
    /// flings, chacun joué en passe de mise à jour animée, pendant que la
    /// rangée traverse la bande.
    func test_preferredLayoutAttributesFitting_underTheUnsafeBand_measuresAsInTheMiddle() throws {
        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first,
            "la suite tourne dans l'app hôte : une scène existe"
        )
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 402, height: 874)
        let host = UIViewController()
        host.additionalSafeAreaInsets = UIEdgeInsets(top: 62, left: 0, bottom: 34, right: 0)
        window.rootViewController = host
        window.isHidden = false
        defer { window.isHidden = true }

        func measuredHeight(atY y: CGFloat) -> CGFloat {
            let cell = MessageListCell(frame: CGRect(x: 0, y: y, width: 402, height: 36))
            cell.contentConfiguration = UIHostingConfiguration {
                MessageDaySeparator(label: "Aujourd'hui", isDark: false)
            }
            .margins(.all, 0)
            host.view.addSubview(cell)
            host.view.layoutIfNeeded()
            defer { cell.removeFromSuperview() }
            let attributes = UICollectionViewLayoutAttributes(forCellWith: IndexPath(item: 0, section: 0))
            attributes.frame = cell.frame
            return cell.preferredLayoutAttributesFitting(attributes).frame.height
        }

        let inTheMiddle = measuredHeight(atY: 400)
        XCTAssertEqual(measuredHeight(atY: 0), inTheMiddle, "sous la bande de l'îlot, la rangée garde sa hauteur")
        XCTAssertEqual(measuredHeight(atY: 874 - 36), inTheMiddle, "sur l'indicateur d'accueil, la rangée garde sa hauteur")
    }
}
