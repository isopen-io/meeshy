import XCTest
import SwiftUI
@testable import MeeshyUI

/// S5 — A3 « aucun choix bloquant avant le canvas » : la reprise de brouillon
/// doit rester un BANDEAU. Une garde de source (`grep` d'un `VStack`) ne
/// prouverait rien ; ce qui compte est la GÉOMÉTRIE réellement rendue — un
/// bandeau qui redeviendrait une carte plein écran recouvrirait le canvas et
/// re-fermerait A3 sans qu'aucun test ne bronche.
@MainActor
final class DraftResumeBannerRenderTests: XCTestCase {

    private func makeCover() -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: 108, height: 192), format: format)
            .image { ctx in
                UIColor.systemIndigo.setFill()
                ctx.fill(CGRect(x: 0, y: 0, width: 108, height: 192))
            }
    }

    private func measuredHeight(cover: UIImage?) -> CGFloat {
        let host = UIHostingController(
            rootView: DraftResumeCard(
                cover: cover,
                slideCount: 3,
                updatedAt: Date(),
                onResume: {},
                onDiscard: {}
            )
            .frame(width: 370)
        )
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        return host.sizeThatFits(in: CGSize(width: 370, height: CGFloat.greatestFiniteMagnitude)).height
    }

    func test_draftResumeBanner_withCover_staysUnderTheBannerHeightBudget() {
        XCTAssertLessThanOrEqual(
            measuredHeight(cover: makeCover()), DraftResumeCard.bannerMaxHeight,
            """
            Le bandeau doit tenir en bas d'écran sans recouvrir le canvas : \
            au-delà de ce budget il redevient une modale déguisée.
            """
        )
    }

    func test_draftResumeBanner_withoutCover_staysUnderTheBannerHeightBudget() {
        XCTAssertLessThanOrEqual(measuredHeight(cover: nil), DraftResumeCard.bannerMaxHeight)
    }

    func test_draftResumeBanner_keepsFortyFourPointTouchTargets() {
        // Le bandeau ne peut pas descendre sous la hauteur d'un contrôle
        // tapable + son chrome : c'est la borne BASSE qui protège D1.
        XCTAssertGreaterThanOrEqual(measuredHeight(cover: nil), 44)
    }

    // MARK: - Résolution du cover

    /// Le composer rendait le cover en 270×480 pour un gabarit de 40×68, sous un
    /// commentaire qui invoquait une carte 108×192 disparue avec la modale : ~6×
    /// la surface utile, composée slide par slide puis décompressée en mémoire
    /// pour une vignette de bandeau. La contrainte RÉELLE est « couvrir le
    /// gabarit à @3x » — et elle se lit maintenant dans le code, pas dans un
    /// commentaire qui a survécu à ce qu'il décrivait.
    func test_draftResumeCoverRenderSize_coversTheSlotAtThreeX() {
        XCTAssertGreaterThanOrEqual(
            DraftResumeCard.coverRenderSize.width,
            DraftResumeCard.coverSize.width * 3,
            "En dessous, la vignette serait floue sur tous les iPhone modernes."
        )
        XCTAssertGreaterThanOrEqual(
            DraftResumeCard.coverRenderSize.height,
            DraftResumeCard.coverSize.height * 3
        )
    }

    func test_draftResumeCoverRenderSize_paysForNothingTheSlotCannotShow() {
        XCTAssertLessThanOrEqual(
            DraftResumeCard.coverRenderSize.width,
            DraftResumeCard.coverSize.width * 4,
            "Au-delà du gabarit à @4x on paie un rendu et une décompression que l'écran n'affichera jamais."
        )
    }

    /// Le rendu reste une STORY (9:16), pas le gabarit du slot (40×68, un chouïa
    /// plus large) : `StorySlideRenderer.renderComposite` compose une frame de
    /// story — la déformer pour épouser le slot décalerait textes et stickers par
    /// rapport à ce que la reprise rouvrira. C'est le `scaledToFill` du bandeau
    /// qui recadre, et lui seul.
    func test_draftResumeCoverRenderSize_keepsTheStoryAspectRatio() {
        XCTAssertEqual(
            DraftResumeCard.coverRenderSize.width / DraftResumeCard.coverRenderSize.height,
            9.0 / 16.0, accuracy: 0.001
        )
    }

    /// Le composer doit lire CE gabarit. Un littéral jumeau chez lui reproduirait
    /// exactement la dérive corrigée ici : la carte a changé deux fois de forme,
    /// le nombre en face n'a jamais bougé.
    func test_theComposerRendersTheCoverAtTheCardsOwnResolution() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+SyncRestore.swift")
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "DraftResumeCard.coverRenderSize", in: code), 1,
            "Le rendu du cover part du gabarit publié par le bandeau, jamais d'un CGSize local."
        )
    }
}
