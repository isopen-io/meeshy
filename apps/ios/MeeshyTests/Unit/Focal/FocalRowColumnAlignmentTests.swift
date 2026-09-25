import XCTest
import SwiftUI
import MeeshySDK
@testable import Meeshy

/// **En Script et en Focal, le CONTENU PROPRE d'un message s'aligne sous
/// l'AVATAR ; seules les CITATIONS se décalent, toutes du même retrait**
/// (directive porteur 2026-09-25, #7928).
///
/// La capture iPhone montrait l'inverse : la carte d'une story citée collée au
/// bord de l'avatar, et le texte qu'elle introduit parti 41 pt plus loin.
/// Chaque section de `FocalRow` posait son propre retrait — 0 pour la carte,
/// 29 pour la citation de message, 29 pour les médias, 41 pour le texte — et
/// aucune garde de source ne pouvait le voir : chaque section était MONTÉE,
/// au bon endroit de la pile.
///
/// ## Pourquoi un rendu, et pas une relecture
///
/// Le témoin MESURE : il rend la rangée réelle en image et cherche la
/// première colonne de pixels encrée. Une rangée HORS tête de groupe
/// (`isFirstInGroup: false`) n'a ni avatar ni nom : la seule chose qui encre
/// sa gauche est la section qu'on veut mesurer. Deux lois, deux mesures :
///
/// - le texte seul commence au bord de l'avatar (`Row.contentIndent`) ;
/// - une citation seule — message, humeur, vocal, image, story, story
///   disparue — commence au retrait de citation (`Quote.indent`), le MÊME
///   pour tous les types.
@MainActor
final class FocalRowColumnAlignmentTests: XCTestCase {

    /// La largeur que la rangée REÇOIT dans le fil : l'écran de l'iPhone 16 Pro
    /// (402) moins les deux marges de section (`MessageListViewController`).
    /// Mesurer à 402 laissait au média la place qu'il n'a jamais au téléphone.
    private static let rowWidth: CGFloat = 402 - 2 * MessageListViewController.sectionHorizontalInset

    // MARK: - Fabrique

    private func content(
        text: String?,
        reply: ReplyReference? = nil,
        attachments: BubbleContent.Attachments = .none,
        isMe: Bool = false,
        editedAt: Date? = nil
    ) -> BubbleContent {
        BubbleContent(
            messageId: "m1", kind: .standard,
            text: text.map {
                BubbleContent.Text(
                    raw: $0, isEmojiOnly: false, emojiFontSize: nil,
                    firstLinkURL: nil, embeddedVideo: nil, trackedLinks: [:], embedTrackedURL: nil
                )
            },
            translation: nil,
            reply: reply.map { BubbleContent.Reply(reference: $0, isStory: $0.isStoryReply) },
            attachments: attachments, location: nil, protection: .unprotected, isBlurred: false,
            isViewOnce: false, isPinned: false, forwardAttribution: nil, editedAt: editedAt,
            isEditSaving: false, hasEditHistory: false, reactions: [],
            meta: BubbleContent.Meta(timeString: "10:41", deliveryStatus: nil),
            isMe: isMe, senderName: "Ali", callNotice: nil, joinNotice: nil
        )
    }

    private func row(_ content: BubbleContent, density: FocalRowInput.Density) -> some View {
        FocalRow(
            input: FocalRowInput(
                localId: "m1", serverId: "s1", content: content, density: density,
                isFirstInGroup: false, senderId: "u1", senderDisplayName: "Ali", senderUsername: "ali",
                senderAvatarURL: nil, senderThumbHash: nil, senderColorHex: "#31B6BA",
                senderPresence: .online, senderStoryRing: .none, senderMoodEmoji: nil,
                accentHex: "#31B6BA", isDark: false, isDirect: true, isRightToLeft: false,
                isOptimistic: false, isAgentAuthored: false, showsAgentGrammar: false,
                highlightSearchTerm: nil, mentionDisplayNames: [:], userLanguages: (nil, nil),
                activeDisplayLangCode: "fr", secondaryLangCode: nil, voiceConsentMissing: false,
                transcription: nil, translatedAudios: [], allAudioItems: [],
                conversationName: "Conv",
                availableWidth: Self.rowWidth
            ),
            actions: FocalRowActions()
        )
    }

    private static let citations: [(String, ReplyReference)] = [
        ("la citation d'un message", ReplyReference(messageId: "m0", authorName: "Bea", previewText: "Désolé pour hier")),
        ("la citation d'une image", ReplyReference(messageId: "m0", authorName: "Bea", previewText: "", attachmentType: "image")),
        ("la citation d'un vocal", ReplyReference(messageId: "m0", authorName: "Bea", previewText: "", attachmentType: "audio")),
        ("la citation d'une vidéo", ReplyReference(messageId: "m0", authorName: "Bea", previewText: "", attachmentType: "video")),
        ("la citation d'une humeur", ReplyReference(messageId: "mood-1", authorName: "Bea", previewText: "en forme",
                                                    isStoryReply: true, moodEmoji: "😴")),
        ("la carte d'une story citée", ReplyReference(messageId: "story-1", authorName: "Story", previewText: "Dernier soir",
                                                     isStoryReply: true, storyPublishedAt: Date(timeIntervalSince1970: 1_700_000_000))),
        ("la carte « Story indisponible »", .unavailableStory(storyId: "story-9")),
    ]

    // MARK: - La mesure

    private struct Ink {
        let pixels: [UInt8]
        let width: Int
        let height: Int

        func isInked(x: Int, y: Int) -> Bool {
            let offset = (y * width + x) * 4
            return pixels[offset] < 235 || pixels[offset + 1] < 235 || pixels[offset + 2] < 235
        }

        /// Un pixel encré, sur n'importe quelle ligne, dans `columns`.
        func hasInk(columns: Range<Int>) -> Bool {
            (0..<height).contains { y in columns.contains { x in isInked(x: x, y: y) } }
        }

        /// Première colonne encrée parmi les lignes `rows`.
        func leftmostColumn(in rows: Range<Int>) -> Int? {
            (0..<width).first { x in rows.contains { y in isInked(x: x, y: y) } }
        }

        var firstInkedRow: Int? {
            (0..<height).first { y in (0..<width).contains { x in isInked(x: x, y: y) } }
        }
    }

    /// Première colonne de pixels NON blanche, en points (rendu à l'échelle 1).
    private func leftmostInk(of view: some View) throws -> CGFloat {
        let ink = try render(view)
        let column = try XCTUnwrap(ink.leftmostColumn(in: 0..<ink.height), "aucun pixel encré : la rangée n'a rien rendu")
        return CGFloat(column)
    }

    private func render(_ view: some View) throws -> Ink {
        let renderer = ImageRenderer(
            content: view
                .frame(width: Self.rowWidth)
                .background(Color.white)
                .environment(\.colorScheme, .light)
                .environmentObject(FocalTimestampRevealState())
        )
        renderer.scale = 1
        let image = try XCTUnwrap(renderer.cgImage, "le rendu n'a produit aucune image")
        let width = image.width
        let height = image.height
        XCTAssertGreaterThan(height, 10, "une rangée rendue sans hauteur ne prouve rien")

        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let context = try XCTUnwrap(CGContext(
            data: &pixels, width: width, height: height, bitsPerComponent: 8,
            bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ))
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))

        return Ink(pixels: pixels, width: width, height: height)
    }

    // MARK: - Le contenu propre, sous l'avatar

    func test_theMessageText_startsOnTheAvatarEdge() throws {
        let avatarEdge = FocalMetrics.Row.paddingHorizontal + FocalMetrics.Row.contentIndent
        for density in [FocalRowInput.Density.script, .focal] {
            let x = try leftmostInk(of: row(content(text: "Le texte du message"), density: density))
            XCTAssertEqual(x, avatarEdge, accuracy: 2,
                           "le texte (\(density)) doit commencer au bord de l'avatar, pas à x=\(x)")
        }
    }

    /// Recette iPhone du 2026-09-25 (#7881) : l'image, la grille et la vidéo
    /// partaient 11 pt à GAUCHE de l'avatar. La grille gardait sa largeur fixe
    /// de 300 pt alors que la colonne de contenu, amputée de la colonne de
    /// l'heure, n'en offre que 278 : la rangée débordait et SwiftUI la
    /// recentrait.
    func test_aMediaGrid_startsOnTheAvatarEdge_withinTheRealRowWidth() throws {
        let avatarEdge = FocalMetrics.Row.paddingHorizontal + FocalMetrics.Row.contentIndent
        for count in [1, 2] {
            let items = (0..<count).map { image(id: "i\($0)") }
            for density in [FocalRowInput.Density.script, .focal] {
                let x = try leftmostInk(of: row(content(text: nil, attachments: .visualGrid(items)), density: density))
                XCTAssertEqual(x, avatarEdge, accuracy: 2,
                               "\(count) média(s) (\(density)) commence(nt) à x=\(x) — le média part sous l'avatar, comme le texte.")
            }
        }
    }

    // MARK: - La marque « modifié »

    /// Recette iPhone du 2026-09-25 (#7881) : en Script et en Focal, le crayon
    /// d'un message MODIFIÉ n'apparaissait que sur les messages des AUTRES. La
    /// colonne de l'heure le teintait comme sur MA bulle d'accent — blanc — sur
    /// une rangée plate qui n'a aucun fond : invisible en mode clair.
    func test_theEditedMarkOfMyOwnMessage_isVisibleOnTheFlatRow() throws {
        let edited = content(text: "Texte après modification", isMe: true, editedAt: Date(timeIntervalSince1970: 1_700_000_000))
        let metaColumn = Int(Self.rowWidth - FocalMetrics.Row.paddingHorizontal - FocalMetrics.MetaColumn.reservedWidth)..<Int(Self.rowWidth)
        for density in [FocalRowInput.Density.script, .focal] {
            let ink = try render(row(edited, density: density))
            XCTAssertTrue(ink.hasInk(columns: metaColumn),
                          "(\(density)) aucun pixel dans la colonne de l'heure : le crayon « modifié » de mon message ne se voit pas.")
        }
    }

    // MARK: - Les citations, toutes au même retrait

    func test_everyCitation_startsOnTheCitationIndent_inScriptAndFocal() throws {
        let citationEdge = FocalMetrics.Row.paddingHorizontal + FocalMetrics.Quote.indent
        for density in [FocalRowInput.Density.script, .focal] {
            for (label, reference) in Self.citations {
                let x = try leftmostInk(of: row(content(text: nil, reply: reference), density: density))
                XCTAssertEqual(x, citationEdge, accuracy: 1,
                               "\(label) (\(density)) commence à x=\(x) — toute citation prend le retrait de citation.")
            }
        }
    }

    // MARK: - Un message MÉDIA qui répond garde sa citation (#7928)

    private func image(id: String = "i1") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: id, fileName: "p.jpg", originalName: "p.jpg", mimeType: "image/jpeg", fileSize: 1)
    }

    private static let quotedMessage = ReplyReference(messageId: "m0", authorName: "Bea", previewText: "Désolé pour hier")

    /// La bulle loge la citation d'un média DANS son conteneur unifié
    /// (`visualHostsReply`) ; le bloc média nu de la rangée plate n'en loge
    /// aucune. Lire la règle de la bulle faisait disparaître la citation.
    func test_aMediaOnlyReply_isQuotedByTheFlatRow() {
        let media = content(text: nil, reply: Self.quotedMessage, attachments: .visualGrid([image()]))
        XCTAssertTrue(media.visualHostsReply, "prémisse : dans la bulle, la grille héberge la citation")
        XCTAssertTrue(media.flatRowDrawsQuote, "la rangée plate doit dessiner la citation d'un message média")
    }

    func test_aStoryReplyWithMedia_keepsItsSceneCard_inTheFlatRow() {
        let story = ReplyReference(messageId: "story-1", authorName: "Story", previewText: "Dernier soir", isStoryReply: true)
        let media = content(text: nil, reply: story, attachments: .visualGrid([image()]))
        XCTAssertNil(media.detachedStoryCitation, "prémisse : la bulle la loge dans son conteneur média")
        XCTAssertEqual(media.flatRowStoryCitation?.messageId, "story-1")
    }

    /// Le vocal, lui, héberge TOUJOURS sa citation : la rangée ne la double pas.
    func test_aVoiceReply_isQuotedByItsPlayerOnly() {
        let voice = MeeshyMessageAttachment(id: "a1", fileName: "v.m4a", originalName: "v.m4a", mimeType: "audio/mpeg", fileSize: 1)
        XCTAssertFalse(content(text: nil, reply: Self.quotedMessage, attachments: .audio([voice])).flatRowDrawsQuote)
    }

    /// Mesuré sur le rendu : la PREMIÈRE chose encrée de la rangée est la
    /// citation, posée au retrait de citation, au-dessus du média.
    func test_aMediaOnlyReply_drawsItsQuoteAboveTheMedia_onTheCitationIndent() throws {
        let citationEdge = Int(FocalMetrics.Row.paddingHorizontal + FocalMetrics.Quote.indent)
        let media = content(text: nil, reply: Self.quotedMessage, attachments: .visualGrid([image()]))
        for density in [FocalRowInput.Density.script, .focal] {
            let ink = try render(row(media, density: density))
            let top = try XCTUnwrap(ink.firstInkedRow, "la rangée n'a rien rendu")
            let x = try XCTUnwrap(ink.leftmostColumn(in: top..<min(top + 4, ink.height)))
            XCTAssertEqual(x, citationEdge, accuracy: 1,
                           "(\(density)) le haut de la rangée commence à x=\(x) : la citation doit coiffer le média, au retrait de citation.")
        }
    }

    /// Le fusible : les deux lois ne se confondent pas. Si les deux cotes
    /// étaient égales, le témoin des citations ne distinguerait plus une
    /// citation d'un contenu propre.
    func test_theCitationIndent_isDistinctFromTheContentIndent() {
        XCTAssertGreaterThan(FocalMetrics.Quote.indent, FocalMetrics.Row.contentIndent)
    }
}
