import XCTest
@testable import MeeshyUI

/// #19433 — la face Actions d'un autre suit la hiérarchie de la planche `Autre-Actions` : Parler, Talkie, Ensemble,
/// Où il est, Son téléphone, Sa fiche, puis bloquer et signaler. « Notre cercle » n'est plus qu'une rangée de
/// « Sa fiche » dès qu'un lien est servi ; tant qu'il ne l'est pas, la demande de connexion garde sa section.
@MainActor
final class ProfileActionsHierarchyTests: XCTestCase {

    func test_sections_followThePlanche_fromTalkToSafety() {
        XCTAssertEqual(ProfileActionsSection.order, [
            .talk, .part(.talkie), .part(.together), .whereTheyAre, .circle, .part(.phone), .card, .safety,
        ])
    }

    func test_card_readsSendCopyQR_thenNews_thenOurCircle() {
        XCTAssertEqual(ProfileActionsCardRow.rows(hasLink: true, hasParts: true), [
            .sendProfile, .copyLink, .qr, .part(.newsNotify), .part(.circle),
        ])
    }

    func test_card_withoutAHandle_keepsOnlyWhatTheAppReads() {
        XCTAssertEqual(ProfileActionsCardRow.rows(hasLink: false, hasParts: true), [.part(.newsNotify), .part(.circle)])
    }

    func test_card_withoutTheApp_keepsTheLinkRows() {
        XCTAssertEqual(ProfileActionsCardRow.rows(hasLink: true, hasParts: false), [.sendProfile, .copyLink, .qr])
        XCTAssertTrue(ProfileActionsCardRow.rows(hasLink: false, hasParts: false).isEmpty)
    }

    func test_circleTitle_staysWhileNoLinkIsShown_andLeavesOnceLinked() {
        XCTAssertTrue(ProfileActionsSection.showsCircleTitle(linked: false))
        XCTAssertFalse(ProfileActionsSection.showsCircleTitle(linked: true))
    }

    func test_everyPart_isReadByTheApp_onlyOnce() {
        let placed = ProfileActionsSection.order.compactMap(\.part)
            + ProfileActionsCardRow.rows(hasLink: true, hasParts: true).compactMap(\.part)
        XCTAssertEqual(placed.sorted { $0.rawValue < $1.rawValue }, ProfileActionsPart.allCases.sorted { $0.rawValue < $1.rawValue })
    }

    func test_theirQR_hasItsTitle() {
        XCTAssertFalse(ProfileActionsCardCopy.theirQR.isEmpty)
    }
}
