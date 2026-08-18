import XCTest
@testable import Meeshy

/// Citations riches (directive user 2026-08-18) — trois zones de tap dans le
/// bloc citation de la rangée plate, chacune avec sa destination :
/// 1. le NOM de l'auteur cité → profil (`onQuotedAuthorTap`, résolution hôte) ;
/// 2. la zone MÉDIA (miniature image/vidéo, glyphe audio/document) →
///    plein écran / lecture (`onQuotedMediaTap`, résolution hôte) ;
/// 3. le reste du bloc → saut à l'original (comportement historique,
///    re-prouvé par `FocalRealtimeMatrixTests.test_F09`).
///
/// Patron « garde de source » du dossier : preuves par lecture du code
/// strippé de ses commentaires — ces zones sont des gestes SwiftUI qu'aucun
/// test d'exécution ne peut presser sans rendu.
final class FocalQuotedReplyRichTests: XCTestCase {

    private func source(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent(path)
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func quotedReplySource() throws -> String {
        try source("Meeshy/Features/Main/Focal/Row/FocalQuotedReplyView.swift")
    }

    private func hostSource() throws -> String {
        try source("Meeshy/Features/Main/Views/MessageListViewController.swift")
    }

    // MARK: - Zone 1 : le nom → profil

    func test_authorName_tapOpensQuotedAuthorProfile() throws {
        let code = try quotedReplySource()
        XCTAssertTrue(
            code.contains(".onTapGesture { onQuotedAuthorTap?(reference) }"),
            "Le NOM de l'auteur cité doit porter son propre tap → onQuotedAuthorTap — sans lui, aucun chemin vers le profil de l'auteur cité."
        )
    }

    func test_host_resolvesQuotedAuthor_fromLocalStore_withNameOnlyFallback() throws {
        let code = try hostSource()
        XCTAssertTrue(
            code.contains("func openQuotedAuthorProfile(_ reference: ReplyReference)"),
            "L'hôte doit résoudre l'auteur cité — la vue ne porte que la référence, jamais l'identité complète."
        )
        XCTAssertTrue(
            code.contains("store.domainMessage(for: localId, currentUserId: currentUserId)"),
            "La résolution passe par le store local (message cité → sender réel), jamais par une seconde source de vérité."
        )
        XCTAssertTrue(
            code.contains("username: reference.authorName"),
            "Repli nom-seul obligatoire : un message cité hors fenêtre locale doit quand même ouvrir une fiche profil."
        )
    }

    // MARK: - Zone 2 : le média → plein écran / lecture

    func test_thumbnail_rendersFromReferenceThumbnailUrl_withVideoPlayBadge() throws {
        let code = try quotedReplySource()
        XCTAssertTrue(
            code.contains("reference.attachmentThumbnailUrl ?? reference.storyThumbnailUrl"),
            "La miniature doit lire les URL DÉJÀ portées par ReplyReference — jamais une seconde résolution d'attachment."
        )
        XCTAssertTrue(
            code.contains("CachedAsyncImage(url: thumbnailURL.absoluteString)"),
            "La vignette passe par CachedAsyncImage (3-tier) — jamais un AsyncImage nu qui re-télécharge à chaque réutilisation de cellule."
        )
        XCTAssertTrue(
            code.contains("reference.attachmentType == \"video\""),
            "Une vidéo citée porte le badge play — c'est l'affordance « toucher pour jouer »."
        )
    }

    func test_mediaZoneTap_firesQuotedMediaTap_notTheJump() throws {
        let code = try quotedReplySource()
        XCTAssertTrue(
            code.contains("onQuotedMediaTap?(reference)"),
            "La zone média doit router vers onQuotedMediaTap — le saut à l'original reste au bloc, jamais à la vignette."
        )
    }

    func test_host_routesQuotedMedia_byAttachmentType_withJumpFallback() throws {
        let code = try hostSource()
        guard let start = code.range(of: "func openQuotedMedia(_ reference: ReplyReference)"),
              let end = code.range(of: "\n    }", range: start.upperBound..<code.endIndex)
        else {
            XCTFail("`openQuotedMedia` est introuvable dans l'hôte.")
            return
        }
        let body = code[start.lowerBound..<end.upperBound]
        XCTAssertTrue(
            body.contains("onMediaTap?(attachment)"),
            "Image/vidéo citée → la MÊME galerie plein écran que la rangée (onMediaTap), jamais une surface parallèle."
        )
        XCTAssertTrue(
            body.contains("playAudio(attachmentId: attachment.id)"),
            "Audio cité → la MÊME file de lecture que la rangée (playAudio)."
        )
        XCTAssertTrue(
            body.contains("scrollToMessage(localId: localId)"),
            "Document ou cité hors fenêtre → repli sur le saut à l'original — jamais un no-op silencieux."
        )
    }

    // MARK: - Câblage jusqu'à la rangée

    func test_focalRow_passesBothCallbacksToTheQuotedReplyView() throws {
        let code = try source("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        XCTAssertTrue(
            code.contains("onQuotedAuthorTap: actions.onQuotedAuthorTap"),
            "FocalRow doit transmettre onQuotedAuthorTap — sans ce fil, le tap du nom est mort."
        )
        XCTAssertTrue(
            code.contains("onQuotedMediaTap: actions.onQuotedMediaTap"),
            "FocalRow doit transmettre onQuotedMediaTap — sans ce fil, la vignette est décorative."
        )
    }

    func test_host_mountsBothQuotedCallbacks() throws {
        let code = try hostSource()
        XCTAssertTrue(
            code.contains("focalActions.onQuotedAuthorTap"),
            "L'hôte doit monter onQuotedAuthorTap sur les actions de la rangée."
        )
        XCTAssertTrue(
            code.contains("focalActions.onQuotedMediaTap"),
            "L'hôte doit monter onQuotedMediaTap sur les actions de la rangée."
        )
    }
}
