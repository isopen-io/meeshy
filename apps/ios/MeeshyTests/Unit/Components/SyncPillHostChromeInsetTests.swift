import XCTest
import SwiftUI
import MeeshyUI
@testable import Meeshy

/// **La marge haute de la pastille se lit sur ce que l'HÔTE pose en haut, pas
/// sur la route** (#5944).
///
/// La décision se prenait sur un booléen — « suis-je dans une conversation ? » —
/// et servait 8 pt à tout le reste. Or « tout le reste » porte au moins deux
/// géographies :
///
///  · **sept écrans montent un `CollapsibleHeader`** (liste, flux, réglages,
///    profil, détail de post, hub de liens) dont la barre monte à 64 pt : la
///    pastille s'y posait EN PLEIN DEDANS, par-dessus « Meeshy Chats » ;
///  · **une vingtaine de routes n'en montent aucun**, et 8 pt y est juste.
///
/// Un booléen ne peut pas dire trois cas. Le troisième — l'hôte qui déclare sa
/// hauteur — est celui qui manquait.
///
/// **Et la valeur de repli était justifiée par un hôte qui ne la reçoit
/// jamais** : le commentaire du site d'appel invoquait « la valeur que le
/// viewer de story portait », alors que la pastille est GATÉE dans le viewer
/// de story (`isStoryViewerPresenting`) et n'y est plus rendue du tout.
/// `@MainActor` : `MeeshySpacing` et la clé de préférence sont isolées comme
/// tout le reste de l'app (`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`), et le
/// bundle de tests, lui, compile en `nonisolated`.
@MainActor
final class SyncPillHostChromeInsetTests: XCTestCase {

    // MARK: - Le cas qui était faux

    func test_unHoteQuiDeclareSonChromeRepousseLaPastilleSousLui() {
        let marge = ConnectionBanner.topPadding(
            inConversation: false,
            hostChromeBottom: CollapsibleHeaderMetrics.expandedHeight
        )
        XCTAssertGreaterThan(
            marge, CollapsibleHeaderMetrics.expandedHeight,
            "Posée à 8 pt, la pastille recouvrait le titre « Meeshy Chats » : elle doit passer SOUS la barre."
        )
        XCTAssertEqual(marge, CollapsibleHeaderMetrics.expandedHeight + MeeshySpacing.sm)
    }

    // MARK: - Les cas qui marchaient, et qui doivent continuer

    /// Un écran sans en-tête ne déclare rien : la pastille garde son assise.
    /// Servir 72 pt là aussi la ferait flotter en plein vide.
    func test_unHoteQuiNeDeclareRienGardeSonAssise() {
        XCTAssertEqual(
            ConnectionBanner.topPadding(inConversation: false, hostChromeBottom: 0),
            MeeshySpacing.sm
        )
    }

    /// La conversation ne monte pas de `CollapsibleHeader` — son chrome est
    /// flottant, et sa constante (#5941) reste la seule autorité pour elle.
    func test_laConversationGardeSaConstante() {
        XCTAssertEqual(
            ConnectionBanner.topPadding(inConversation: true, hostChromeBottom: 0),
            ConnectionBanner.conversationTopPadding
        )
    }

    /// **La conversation GAGNE sur une déclaration résiduelle.** La liste reste
    /// montée sous la conversation poussée : sa préférence continue de remonter.
    /// Si l'hôte l'emportait, la pastille repasserait à 72 pt et recouvrirait le
    /// chrome flottant — le défaut que #5941 vient de fermer.
    func test_laConversationGagneSurUneDeclarationResiduelleDeLaListe() {
        XCTAssertEqual(
            ConnectionBanner.topPadding(
                inConversation: true,
                hostChromeBottom: CollapsibleHeaderMetrics.expandedHeight
            ),
            ConnectionBanner.conversationTopPadding
        )
    }

    // MARK: - La déclaration ATTEINT bien la pastille

    /// Une préférence que personne n'écrit vaut zéro, donc le repli — et le
    /// correctif serait sans effet, sans qu'aucun témoin de décision ne tombe.
    /// Ce témoin garde le fait que `CollapsibleHeader` la POSE.
    func test_lEnTeteRepliableDeclareSaHauteur() throws {
        let source = try AppSourceGuard.unit("../../packages/MeeshySDK/Sources/MeeshyUI/Navigation/CollapsibleHeader.swift")
        XCTAssertTrue(
            source.contains("SyncPillHostChromeKey"),
            "Sept écrans héritent de cette déclaration par leur en-tête : sans elle, la marge retombe à 8 pt partout."
        )
    }

    /// La réduction est un MAXIMUM : deux hôtes empilés (une feuille au-dessus
    /// d'une liste) ne doivent pas s'annuler, c'est le plus haut qui borne.
    func test_deuxDeclarationsSeReduisentAuMaximum() {
        var valeur = SyncPillHostChromeKey.defaultValue
        SyncPillHostChromeKey.reduce(value: &valeur) { 44 }
        SyncPillHostChromeKey.reduce(value: &valeur) { 64 }
        XCTAssertEqual(valeur, 64)
    }
}
