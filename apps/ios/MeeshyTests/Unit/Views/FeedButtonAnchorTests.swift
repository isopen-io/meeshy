import XCTest
import SwiftUI
@testable import Meeshy
import MeeshyUI

/// Verrouille `FeedButtonAnchor` — le centre du bouton Flux d'où naît le
/// disque des réels. Il se lit dans `FloatingButtonGeometry`, la source que le
/// conteneur des boutons emploie pour poser le bouton (#9679) : si les deux
/// divergeaient, le disque naîtrait à côté du bouton.
@MainActor
final class FeedButtonAnchorTests: XCTestCase {

    private let geometry = FloatingButtonGeometry(
        screenSize: CGSize(width: 390, height: 844),
        safeArea: EdgeInsets(top: 59, leading: 0, bottom: 34, trailing: 0)
    )

    // MARK: - L'ancre est le centre que le conteneur pose

    func test_screenPoint_isTheFeedCenterOfTheContainerLayout() {
        for raw in ["0.0,0.0", "1.0,1.0", "0.0,0.5", "v2,L,0.0000", "v2,R,1.0000", "garbage"] {
            let layout = geometry.layout(feedStorage: raw, menuStorage: FloatingButtonGeometry.defaultMenuStorage)
            XCTAssertEqual(FeedButtonAnchor.screenPoint(fromRaw: raw, geometry: geometry), layout.feed, raw)
        }
    }

    func test_screenPoint_reachesTheTopOfTheScreen() {
        let p = FeedButtonAnchor.screenPoint(fromRaw: "v2,L,0.0000", geometry: geometry)
        XCTAssertEqual(p.y, geometry.minY, accuracy: 0.001)
        XCTAssertLessThan(p.y, 120)
    }

    // MARK: - unitPoint

    func test_unitPoint_isScreenPointFraction() {
        let p = FeedButtonAnchor.screenPoint(fromRaw: "v2,R,0.5000", geometry: geometry)
        let u = FeedButtonAnchor.unitPoint(
            fromRaw: "v2,R,0.5000", geometry: geometry, in: CGRect(x: 0, y: 0, width: 390, height: 844)
        )
        XCTAssertEqual(u.x, p.x / 390, accuracy: 0.0001)
        XCTAssertEqual(u.y, p.y / 844, accuracy: 0.0001)
    }

    /// La vue des réels peut, comme le conteneur des boutons, commencer sous la
    /// bannière du joueur : le disque naît quand même au centre du bouton.
    func test_unitPoint_inAFramePushedDownByTheBanner_staysOnTheButton() {
        let frame = CGRect(x: 0, y: 80, width: 390, height: 764)
        let p = FeedButtonAnchor.screenPoint(fromRaw: "v3,L,0.500000", geometry: geometry)
        let u = FeedButtonAnchor.unitPoint(fromRaw: "v3,L,0.500000", geometry: geometry, in: frame)
        XCTAssertEqual(frame.minY + u.y * frame.height, p.y, accuracy: 0.001)
    }

    func test_unitPoint_zeroSize_returnsTopLeading() {
        XCTAssertEqual(FeedButtonAnchor.unitPoint(fromRaw: "v2,R,0.5000", geometry: geometry, in: .zero), .topLeading)
    }

    // MARK: - #9363 — les bulles ne recouvrent plus le « + » de la story

    /// Un appareil pris en charge, avec son encoche RÉELLE : le conteneur, lui,
    /// reçoit une safe area nulle et majore l'encoche.
    private struct Device {
        let name: String
        let size: CGSize
        let topInset: CGFloat
    }

    private let devices = [
        Device(name: "375 SE", size: CGSize(width: 375, height: 667), topInset: 20),
        Device(name: "375 mini", size: CGSize(width: 375, height: 812), topInset: 50),
        Device(name: "402 17 Pro", size: CGSize(width: 402, height: 874), topInset: 62),
    ]

    /// Le disque d'une bulle à sa position persistée PAR DÉFAUT, tel que le
    /// conteneur le pose — avec la zone sûre réelle de l'appareil (#9679).
    private func disc(_ raw: String, on device: Device) -> CGRect {
        let geometry = FloatingButtonGeometry(
            screenSize: device.size,
            safeArea: EdgeInsets(top: device.topInset, leading: 0, bottom: 0, trailing: 0)
        )
        let center = geometry.center(forStorage: raw, default: raw)
        let side = FloatingButtonGeometry.buttonSize
        return CGRect(x: center.x - side / 2, y: center.y - side / 2, width: side, height: side)
    }

    /// La cible de 44 pt du « + », au coin haut-gauche de l'avatar « moi », sous
    /// l'en-tête étendu : le tray du flux (`StoryTrayView`, marge `sm`) et le
    /// rail de la liste (`StoriesVivantsRail`, marge `Rail.paddingVertical`).
    private func plusTargets(on device: Device) -> [(screen: String, frame: CGRect)] {
        let bandTop = device.topInset + CollapsibleHeaderMetrics.expandedHeight
        let side = MeeshyControlSize.tapTarget
        return [
            ("flux", CGRect(x: MeeshySpacing.lg, y: bandTop + MeeshySpacing.sm, width: side, height: side)),
            ("liste", CGRect(x: MeeshySpacing.lg, y: bandTop + LentilleMetrics.Rail.paddingVertical, width: side, height: side)),
        ]
    }

    func test_defaultBubbles_neverCoverTheStoryPlusTarget_on375And402() {
        for device in devices {
            for raw in ["0.0,0.0", "1.0,0.0"] {
                let bubble = disc(raw, on: device)
                for target in plusTargets(on: device) {
                    XCTAssertFalse(
                        bubble.intersects(target.frame),
                        "\(device.name) : la bulle \(raw) \(bubble) recouvre le « + » du \(target.screen) \(target.frame)"
                    )
                }
            }
        }
    }

    /// Les cadres RELEVÉS à la recette (iPhone 17 Pro, iOS 26.1, 2026-10-04) : le
    /// disque Flux 19,125 53×53 recouvrait le « + » de la liste (16,142) et
    /// celui du flux (15,132). Leur cible de 44 pt, au même coin, est libre.
    func test_measuredPlusFrames_onTheRecette_areNoLongerCovered() {
        let bubble = disc("0.0,0.0", on: devices[2])
        let side = MeeshyControlSize.tapTarget
        for target in [CGRect(x: 16, y: 142, width: side, height: side), CGRect(x: 15, y: 132, width: side, height: side)] {
            XCTAssertFalse(bubble.intersects(target), "le disque \(bubble) recouvre encore \(target)")
        }
    }

    /// La réserve du SDK est une COTE, pas une lecture : chaque bande de
    /// stories de l'app doit y tenir, sinon la bulle remord ses anneaux.
    func test_everyStoryBand_fitsTheReservedClearance() {
        XCTAssertLessThanOrEqual(StoryTrayView.trayHeight, FloatingButtonSafeZone.storyBand)
        let caption = UIFont.preferredFont(forTextStyle: .caption1).lineHeight
        let railBand = LentilleMetrics.Rail.paddingVertical * 2 + LentilleMetrics.Rail.size + MeeshySpacing.xs + caption
        XCTAssertLessThanOrEqual(railBand, FloatingButtonSafeZone.storyBand)
    }
}
