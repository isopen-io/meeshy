import XCTest
import SwiftUI
import MeeshySDK
@testable import Meeshy

/// **En Script et en Focal, l'avatar occupe SEUL sa marge gauche ; le nom, le
/// CONTENU PROPRE et TOUTES les citations partent de la MÊME origine : la
/// colonne du nom** (directive porteur 2026-09-26, #7995 : « texte aligné au
/// niveau des citations toujours, permettant de distinguer avatar et auteur
/// puis son contenu ; la citation est déjà identifiable avec la barre puis le
/// fond teinté »).
///
/// Supplante la règle du 2026-09-25 (#7928 : « le contenu part sous l'avatar,
/// seules les citations sont décalées »), que ce témoin gardait jusque-là :
/// texte au bord de l'avatar, citations 29 pt plus loin. Le porteur a vu les
/// deux côte à côte et retenu celle du web : une seule colonne de lecture,
/// l'avatar hors d'elle.
///
/// ## Pourquoi un rendu, et pas une relecture
///
/// Le témoin MESURE : il rend la rangée réelle en image et cherche la
/// première colonne de pixels encrée. Une rangée HORS tête de groupe
/// (`isFirstInGroup: false`) n'a ni avatar ni nom : la seule chose qui encre
/// sa gauche est la section qu'on veut mesurer. Trois lois, trois mesures :
///
/// - le texte seul et le média seul commencent à la colonne du nom ;
/// - une citation seule — message, humeur, vocal, image, story, story
///   disparue — commence à la MÊME colonne, sans retrait propre ;
/// - en tête de groupe, rien n'encre la gouttière entre l'avatar et le nom,
///   et sous l'avatar tout commence à la colonne du nom.
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

    /// La colonne du nom, en points depuis le bord de la rangée : la marge,
    /// la pastille, la gouttière de l'en-tête (`Text.indent` = 22 + 7).
    private static let nameColumn = FocalMetrics.Row.paddingHorizontal + FocalMetrics.Text.indent

    private func row(_ content: BubbleContent, density: FocalRowInput.Density, isFirstInGroup: Bool = false) -> some View {
        FocalRow(
            input: FocalRowInput(
                localId: "m1", serverId: "s1", content: content, density: density,
                isFirstInGroup: isFirstInGroup, senderId: "u1", senderDisplayName: "Ali", senderUsername: "ali",
                senderAvatarURL: nil, senderThumbHash: nil, senderColorHex: "#31B6BA",
                senderPresence: .offline, senderStoryRing: .none, senderMoodEmoji: nil,
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

    // MARK: - Le contenu propre, sur la colonne du nom

    func test_theMessageText_startsOnTheNameColumn() throws {
        for density in [FocalRowInput.Density.script, .focal] {
            let x = try leftmostInk(of: row(content(text: "Le texte du message"), density: density))
            XCTAssertEqual(x, Self.nameColumn, accuracy: 2,
                           "le texte (\(density)) doit commencer à la colonne du nom (\(Self.nameColumn)), pas à x=\(x)")
        }
    }

    /// Recette iPhone du 2026-09-25 (#7881) : l'image, la grille et la vidéo
    /// partaient 11 pt à GAUCHE de l'avatar. La grille gardait sa largeur fixe
    /// de 300 pt alors que la colonne de contenu, amputée de la colonne de
    /// l'heure, n'en offre que 278 : la rangée débordait et SwiftUI la
    /// recentrait. La grille se borne à la colonne de contenu RÉELLE, qui part
    /// désormais de la colonne du nom (#7995).
    func test_aMediaGrid_startsOnTheNameColumn_withinTheRealRowWidth() throws {
        for count in [1, 2] {
            let items = (0..<count).map { image(id: "i\($0)") }
            for density in [FocalRowInput.Density.script, .focal] {
                let x = try leftmostInk(of: row(content(text: nil, attachments: .visualGrid(items)), density: density))
                XCTAssertEqual(x, Self.nameColumn, accuracy: 2,
                               "\(count) média(s) (\(density)) commence(nt) à x=\(x) — le média part de la colonne du nom, comme le texte.")
            }
        }
    }

    // MARK: - L'avatar, seul dans sa marge

    /// En tête de groupe : la pastille encre sa marge, puis la GOUTTIÈRE qui
    /// la sépare du nom reste blanche sur toute la hauteur de la rangée — ni
    /// le texte, ni la citation ne s'y glissent sous l'avatar — et, sous
    /// l'avatar, tout commence à la colonne du nom.
    func test_theAvatarAloneOccupiesItsMargin_andEverythingElseStartsOnTheNameColumn() throws {
        let avatarStart = Int(FocalMetrics.Row.paddingHorizontal)
        let avatarEnd = avatarStart + Int(FocalMetrics.Avatar.size)
        let gutter = (avatarEnd + 1)..<(Int(Self.nameColumn) - 1)
        let message = content(text: "Le texte du message", reply: Self.quotedMessage)
        for density in [FocalRowInput.Density.script, .focal] {
            let ink = try render(row(message, density: density, isFirstInGroup: true))
            let avatarRows = (0..<ink.height).filter { y in (avatarStart..<avatarEnd).contains { ink.isInked(x: $0, y: y) } }
            let avatarBottom = try XCTUnwrap(avatarRows.last, "(\(density)) aucune pastille rendue en tête de groupe")
            XCTAssertFalse(ink.hasInk(columns: gutter),
                           "(\(density)) la gouttière entre l'avatar et le nom est encrée : le contenu passe sous l'avatar.")
            let below = try XCTUnwrap(ink.leftmostColumn(in: (avatarBottom + 1)..<ink.height), "(\(density)) rien sous l'avatar")
            XCTAssertEqual(CGFloat(below), Self.nameColumn, accuracy: 1,
                           "(\(density)) sous l'avatar, la citation et le texte commencent à x=\(below), pas à la colonne du nom.")
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

    // MARK: - Le texte atténué suit le thème de la RANGÉE

    /// Recette sombre du 2026-09-25 (#7881) : « Message supprimé », dans la
    /// rangée comme dans une citation, s'écrivait en indigo foncé sur le fond
    /// sombre. Les deux vues lisaient `ThemeManager.shared.textMuted`, un
    /// singleton qui n'invalide pas la cellule, au lieu du `isDark` qu'elles
    /// reçoivent. Le témoin désaccorde exprès le singleton de la rangée.
    func test_mutedTexts_followTheRowTheme_notTheThemeSingleton() throws {
        let theme = ThemeManager.shared
        let saved = theme.mode
        theme.mode = .light
        defer { theme.mode = saved }

        let deletedQuote = ReplyReference(messageId: "m0", authorName: "", previewText: "Message supprimé Message supprimé Message supprimé")
        // L'aperçu se mesure à DROITE du filet et du titre (tous deux clairs
        // par construction) : seul le texte atténué y encre.
        let views: [(String, AnyView, Int)] = [
            ("la rangée « Message supprimé »", AnyView(FocalDeletedRow(isDark: true)), 0),
            ("l'aperçu d'une citation", AnyView(FocalQuotedReplyView(
                reply: BubbleContent.Reply(reference: deletedQuote, isStory: false),
                accentHex: "#31B6BA", isDark: true, mentionDisplayNames: [:]
            )), 180),
        ]
        for (label, view, fromColumn) in views {
            let brightest = try brightestLuminance(of: view, fromColumn: fromColumn)
            XCTAssertGreaterThan(brightest, 100, "\(label) en sombre culmine à \(brightest) : illisible sur le fond sombre.")
        }
    }

    private func brightestLuminance(of view: some View, fromColumn: Int) throws -> Int {
        let renderer = ImageRenderer(
            content: view
                .frame(width: Self.rowWidth)
                .background(Color.black)
                .environment(\.colorScheme, .dark)
                .environmentObject(FocalTimestampRevealState())
        )
        renderer.scale = 1
        guard let image = renderer.cgImage, image.width > 0, image.height > 0 else {
            XCTFail("le rendu n'a produit aucune image")
            return 0
        }
        let width = image.width
        let height = image.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        guard let context = CGContext(
            data: &pixels, width: width, height: height, bitsPerComponent: 8,
            bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            XCTFail("contexte bitmap indisponible")
            return 0
        }
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return stride(from: 0, to: pixels.count, by: 4)
            .filter { ($0 / 4) % width >= fromColumn }
            .map { offset in
                (299 * Int(pixels[offset]) + 587 * Int(pixels[offset + 1]) + 114 * Int(pixels[offset + 2])) / 1000
            }
            .max() ?? 0
    }

    // MARK: - Les citations, à l'origine du contenu

    func test_everyCitation_startsOnTheNameColumn_inScriptAndFocal() throws {
        for density in [FocalRowInput.Density.script, .focal] {
            for (label, reference) in Self.citations {
                let x = try leftmostInk(of: row(content(text: nil, reply: reference), density: density))
                XCTAssertEqual(x, Self.nameColumn, accuracy: 1,
                               "\(label) (\(density)) commence à x=\(x) — une citation part de la colonne du nom, comme le texte : aucun retrait propre.")
            }
        }
    }

    /// **Toutes les citations portent la MÊME barre que « Vous : … »**
    /// (porteur, 2026-09-25, #7881). La carte de story était au bon retrait
    /// mais SANS filet : collée au retrait, elle encrait les colonnes où la
    /// citation de message laisse le blanc entre son filet et son texte.
    ///
    /// Mesure : un filet encré sur `Quote.railWidth` colonnes à la colonne du
    /// nom, puis une bande BLANCHE sur la hauteur de la citation, puis la
    /// carte, qui garde sa largeur de 132 pt. C'est ce filet — et le fond
    /// teinté — qui distingue une citation depuis #7995, plus aucun retrait.
    func test_everyCitation_carriesTheSameRail_inScriptAndFocal() throws {
        let edge = Int(Self.nameColumn)
        let rail = edge..<(edge + Int(FocalMetrics.Quote.railWidth.rounded(.down)))
        let gap = (edge + Int(FocalMetrics.Quote.railWidth.rounded(.up)) + 1)..<(edge + Int(FocalMetrics.Quote.railWidth) + Int(FocalQuoteRail.spacing) - 1)
        let quotes = [Self.citations[0], Self.citations[5], Self.citations[6]]
        for density in [FocalRowInput.Density.script, .focal] {
            for (label, reference) in quotes {
                let ink = try render(row(content(text: nil, reply: reference), density: density))
                XCTAssertTrue(ink.hasInk(columns: rail), "\(label) (\(density)) n'a pas de filet à la colonne du nom.")
                XCTAssertFalse(ink.hasInk(columns: gap),
                               "\(label) (\(density)) encre l'écart entre le filet et son contenu : la barre manque ou n'est pas celle de « Vous : … ».")
            }
        }
        XCTAssertEqual(BubbleStoryCitationCard.cardWidth, 132, "la carte de story garde sa taille")
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
    /// citation, posée à la colonne du nom, au-dessus du média.
    func test_aMediaOnlyReply_drawsItsQuoteAboveTheMedia_onTheNameColumn() throws {
        let media = content(text: nil, reply: Self.quotedMessage, attachments: .visualGrid([image()]))
        for density in [FocalRowInput.Density.script, .focal] {
            let ink = try render(row(media, density: density))
            let top = try XCTUnwrap(ink.firstInkedRow, "la rangée n'a rien rendu")
            let x = try XCTUnwrap(ink.leftmostColumn(in: top..<min(top + 4, ink.height)))
            XCTAssertEqual(CGFloat(x), Self.nameColumn, accuracy: 1,
                           "(\(density)) le haut de la rangée commence à x=\(x) : la citation doit coiffer le média, à la colonne du nom.")
        }
    }

    /// UNE origine, pas deux cotes qui coïncident : le contenu et la citation
    /// lisent la même, et c'est la colonne du nom — la pastille plus la
    /// gouttière de l'en-tête. Si une cote de citation revenait, elle
    /// rouvrirait la porte au retrait que #7995 a retiré.
    func test_theContentOrigin_isTheNameColumn() {
        XCTAssertEqual(FocalMetrics.Row.contentIndent, FocalMetrics.Text.indent)
        XCTAssertGreaterThan(FocalMetrics.Row.contentIndent, FocalMetrics.Avatar.size)
    }
}
