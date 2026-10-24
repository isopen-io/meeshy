import XCTest
import MeeshySDK
@testable import Meeshy

/// **L'aperçu d'une conversation tenue longuement se dessine dans son mode de
/// lecture** (#11213, décision #11204).
///
/// Il dessinait toujours des bulles, quel que soit le mode du fil : une
/// conversation lue en Script montrait, sous le doigt, une face que le fil ne
/// montre jamais. La face se lit désormais à une loi pure — rangées plates en
/// Script et en Focal, bulles en Bulles — et les modes qui ne montrent pas le
/// fil (Résumé, Rivière) s'y posent en Script, comme « Aller au message ».
@MainActor
final class ConversationRecentMessagesPreviewTests: XCTestCase {

    private let start = Date(timeIntervalSince1970: 1_800_000_000)

    private func message(
        _ id: String,
        senderId: String = "u-other",
        isMe: Bool = false,
        isEncrypted: Bool = false,
        content: String = "Bonjour",
        offset: TimeInterval = 0
    ) -> Message {
        var message = Message(
            id: id, conversationId: "c1", senderId: senderId, content: content,
            isEncrypted: isEncrypted, createdAt: start.addingTimeInterval(offset)
        )
        message.isMe = isMe
        return message
    }

    // MARK: - Un message en clair dans une conversation chiffrée (#11380)

    /// L'aperçu sans chargeur (messages figés) marque les mêmes messages que
    /// le chargeur : un clair reçu d'un membre, jamais le mien, jamais un
    /// message encore scellé, et rien hors d'une conversation chiffrée.
    func test_unencryptedIds_marksOnlyAMemberPlaintextInEndToEnd() {
        let messages = [
            message("forged"),
            message("mine", senderId: "u-me", isMe: true),
            message("sealed", isEncrypted: true, content: "Q2lwaGVydGV4dGU=")
        ]

        XCTAssertEqual(ConversationPreviewRenderer.unencryptedIds(of: messages, encryptionMode: "e2ee"), ["forged"])
        XCTAssertEqual(ConversationPreviewRenderer.unencryptedIds(of: messages, encryptionMode: nil), [])
    }

    // MARK: - La face suit le mode de lecture

    func test_kind_script_isTheFlatRow() {
        XCTAssertEqual(ConversationPreviewRenderer.kind(mode: .script), .flatRow)
    }

    func test_kind_focal_isTheFlatRow() {
        XCTAssertEqual(ConversationPreviewRenderer.kind(mode: .focal), .flatRow)
    }

    func test_kind_bubbles_isTheBubble() {
        XCTAssertEqual(ConversationPreviewRenderer.kind(mode: .bubbles), .bubble)
    }

    /// Le Résumé et la Rivière ne montrent pas le fil : l'aperçu, qui montre
    /// des messages, s'y pose comme « Aller au message » — en Script.
    func test_kind_summary_landsOnTheFlatRow() {
        XCTAssertEqual(ConversationPreviewRenderer.kind(mode: .summary), .flatRow)
    }

    func test_kind_river_landsOnTheFlatRow() {
        XCTAssertEqual(ConversationPreviewRenderer.kind(mode: .river), .flatRow)
    }

    /// La table attendue, écrite à la main et EXHAUSTIVE : un mode ajouté ne
    /// compile pas tant qu'on n'a pas dit quelle face son aperçu montre.
    private func expectedKind(_ mode: ConversationReadingMode) -> ConversationPreviewRenderer.Kind {
        switch mode {
        case .script, .focal, .summary, .river: return .flatRow
        case .bubbles: return .bubble
        }
    }

    func test_kind_everyMode_matchesTheDeclaredTable() {
        for mode in ConversationReadingMode.allCases {
            XCTAssertEqual(ConversationPreviewRenderer.kind(mode: mode), expectedKind(mode), "\(mode)")
        }
    }

    /// Les deux aperçus d'appui long — la conversation et le message — lisent la
    /// même face pour chaque mode qui MONTRE le fil. Ils ne divergent que sur
    /// le Résumé et la Rivière, et pour une raison : l'aperçu d'un message est
    /// la cellule VISIBLE, celui d'une conversation est le fil tel qu'il
    /// S'OUVRIRA (`landing`). Une troisième divergence serait une dérive.
    func test_kind_agreesWithTheMessagePreview_onEveryModeThatShowsTheThread() {
        for mode in ConversationReadingMode.allCases where mode != .summary && mode != .river {
            let message = MessageOverlayPreviewKind.resolve(readingMode: mode)
            XCTAssertEqual(ConversationPreviewRenderer.kind(mode: mode) == .flatRow, message == .flatRow, "\(mode)")
        }
    }

    /// La densité est celle que la cellule du fil reçoit.
    func test_density_followsTheThreadCell() {
        XCTAssertEqual(ConversationPreviewRenderer.density(mode: .script), .script)
        XCTAssertEqual(ConversationPreviewRenderer.density(mode: .focal), .focal)
    }

    // MARK: - Le groupement : un auteur, une identité

    func test_layout_threeConsecutiveMessagesFromOneAuthor_showOneBubbleIdentity() {
        let messages = [message("m1", offset: 0), message("m2", offset: 30), message("m3", offset: 60)]

        let layout = ConversationPreviewRenderer.layout(of: messages)

        XCTAssertEqual(layout.filter { $0.showsIdentity(kind: .bubble, isDirect: false) }.count, 1)
        XCTAssertEqual(layout.last?.isLastInGroup, true)
        XCTAssertEqual(layout.first?.isLastInGroup, false)
    }

    func test_layout_threeConsecutiveMessagesFromOneAuthor_showOneFlatRowIdentity() {
        let messages = [message("m1", offset: 0), message("m2", offset: 30), message("m3", offset: 60)]

        let layout = ConversationPreviewRenderer.layout(of: messages)

        XCTAssertEqual(layout.filter { $0.showsIdentity(kind: .flatRow, isDirect: false) }.count, 1)
        XCTAssertEqual(layout.first?.isFirstInGroup, true)
        XCTAssertEqual(layout.last?.isFirstInGroup, false)
    }

    func test_layout_alternatingAuthors_eachOpensItsGroup() {
        let messages = [
            message("m1", senderId: "a", offset: 0),
            message("m2", senderId: "b", offset: 30),
            message("m3", senderId: "a", offset: 60)
        ]

        let layout = ConversationPreviewRenderer.layout(of: messages)

        XCTAssertEqual(layout.map(\.isFirstInGroup), [true, true, true])
        XCTAssertEqual(layout.map(\.isLastInGroup), [true, true, true])
    }

    /// En conversation directe, la bulle ne porte pas l'identité de l'autre :
    /// comme le fil (`BubbleStandardLayout.showIdentityBar`).
    func test_layout_direct_bubbleShowsNoIdentity() {
        let layout = ConversationPreviewRenderer.layout(of: [message("m1")])

        XCTAssertFalse(layout[0].showsIdentity(kind: .bubble, isDirect: true))
    }

    /// Mes propres bulles ne portent pas mon avatar.
    func test_layout_mine_bubbleShowsNoIdentity() {
        let layout = ConversationPreviewRenderer.layout(of: [message("m1", senderId: "me", isMe: true)])

        XCTAssertFalse(layout[0].showsIdentity(kind: .bubble, isDirect: false))
    }

    /// L'air sépare les SUITES, pas les messages d'une même suite.
    func test_gap_separatesGroupsOnly() {
        let messages = [
            message("m1", senderId: "a", offset: 0),
            message("m2", senderId: "a", offset: 30),
            message("m3", senderId: "b", offset: 60)
        ]
        let layout = ConversationPreviewRenderer.layout(of: messages)

        let gaps = layout.indices.map { ConversationPreviewRenderer.gap(before: layout[$0], isFirst: $0 == 0) }

        XCTAssertEqual(gaps, [0, 0, ConversationPreviewRenderer.rowSpacing])
        XCTAssertEqual(ConversationPreviewRenderer.rowSpacing, 12)
    }

    // MARK: - Les états : charger n'est jamais « vide »

    func test_display_loadingWithoutMessages_isTheSkeleton() {
        XCTAssertEqual(ConversationPreviewRenderer.display(phase: .loading, messageCount: 0), .skeleton)
    }

    func test_display_loading_isNeverTheEmptyState() {
        XCTAssertNotEqual(ConversationPreviewRenderer.display(phase: .loading, messageCount: 0), .empty)
    }

    /// Ce qui est servi reste à l'écran pendant que le réseau revalide.
    func test_display_loadingWithServedMessages_showsTheMessages() {
        XCTAssertEqual(ConversationPreviewRenderer.display(phase: .loading, messageCount: 3), .messages)
    }

    func test_display_emptyConstated_isTheEmptyState() {
        XCTAssertEqual(ConversationPreviewRenderer.display(phase: .empty, messageCount: 0), .empty)
    }

    func test_display_networkFailureWithoutCache_isUnavailable() {
        XCTAssertEqual(ConversationPreviewRenderer.display(phase: .unavailable, messageCount: 0), .unavailable)
    }

    // MARK: - Un message chiffré scellé se dit chiffré

    func test_isSealed_encryptedWithoutClearText_isSealed() {
        XCTAssertTrue(ConversationPreviewRenderer.isSealed(message("m1", isEncrypted: true, content: "")))
    }

    func test_isSealed_encryptedDecryptedOnDevice_isReadable() {
        XCTAssertFalse(ConversationPreviewRenderer.isSealed(message("m1", isEncrypted: true, content: "Salut")))
    }

    func test_isSealed_clearMessage_isReadable() {
        XCTAssertFalse(ConversationPreviewRenderer.isSealed(message("m1", content: "")))
    }

    // MARK: - Les marges

    func test_contentWidth_keepsSixteenPointsOnEachSide() {
        XCTAssertEqual(ConversationPreviewRenderer.margin, 16)
        XCTAssertEqual(ConversationPreviewRenderer.contentWidth(cardWidth: 340), 308)
    }

    func test_contentWidth_neverNegative() {
        XCTAssertEqual(ConversationPreviewRenderer.contentWidth(cardWidth: 10), 0)
    }

    // MARK: - Le fondu : seulement si quelque chose est effacé

    /// Une conversation de deux messages tient dans la carte : rien n'est
    /// masqué au-dessus, la rangée du haut reste nette.
    func test_fadesTop_contentShorterThanTheViewport_staysSharp() {
        XCTAssertFalse(ConversationPreviewRenderer.fadesTop(contentHeight: 120, viewportHeight: 280))
    }

    func test_fadesTop_contentExactlyFillingTheViewport_staysSharp() {
        XCTAssertFalse(ConversationPreviewRenderer.fadesTop(contentHeight: 280, viewportHeight: 280))
    }

    /// Le fil dépasse : le haut, coupé, s'efface.
    func test_fadesTop_contentOverflowingTheViewport_fades() {
        XCTAssertTrue(ConversationPreviewRenderer.fadesTop(contentHeight: 420, viewportHeight: 280))
    }

    /// Avant la première mesure, l'aperçu est net plutôt que flou.
    func test_fadesTop_unmeasuredViewport_staysSharp() {
        XCTAssertFalse(ConversationPreviewRenderer.fadesTop(contentHeight: 420, viewportHeight: 0))
    }

    // MARK: - Le header : interactif ou non

    /// L'aperçu natif d'iOS 26 n'est pas interactif : ses boutons y seraient
    /// inertes. Il ne garde que ce qui SE LIT — non-lus, chiffrement, sourdine.
    func test_headerControls_nonInteractive_keepsOnlyTheIndicators() {
        XCTAssertFalse(ConversationPreviewRenderer.showsHeaderActions(isInteractive: false))
        XCTAssertTrue(ConversationPreviewRenderer.showsHeaderActions(isInteractive: true))
    }

    func test_headerTarget_isAtLeastFortyFourPoints() {
        XCTAssertGreaterThanOrEqual(ConversationPreviewRenderer.headerTargetSize, 44)
    }

    /// Volet gauche étroit de l'iPad : trois cibles de 44 pt ne tiennent plus
    /// sous le titre. La rangée se replie sur le cercle de 32 pt, sa cible
    /// gardant 44 pt de HAUT — elle ne déborde jamais de la carte.
    func test_headerTarget_narrowColumn_foldsToTheCompactCircle() {
        XCTAssertLessThan(ConversationPreviewRenderer.compactHeaderTargetSize, ConversationPreviewRenderer.headerTargetSize)
        XCTAssertEqual(ConversationPreviewRenderer.compactHeaderTargetSize, 32)
    }

    func test_isEndToEnd_readsTheConversationEncryptionMode() {
        var conversation = Conversation(id: "c1", identifier: "c1", type: .group, title: "T",
                                        lastMessageAt: start, createdAt: start, updatedAt: start)
        XCTAssertFalse(ConversationPreviewRenderer.isEndToEnd(conversation))
        conversation.encryptionMode = "e2ee"
        XCTAssertTrue(ConversationPreviewRenderer.isEndToEnd(conversation))
    }

    // MARK: - Le fond de la conversation sous ses bulles (#11231)

    /// L'aperçu dessinait toujours le dégradé de la carte : une conversation
    /// au fond uni, à motif ou à photo montrait, sous le doigt, des bulles sur
    /// un fond que le fil ne peint jamais. Il peint désormais le fond RÉSOLU de
    /// la conversation — la même résolution que le fil.
    private func conversation(
        _ id: String = "c-backdrop-\(UUID().uuidString)",
        appearance: ConversationAppearance?
    ) -> Conversation {
        var conversation = Conversation(id: id, identifier: id, type: .group, title: "T",
                                        lastMessageAt: start, createdAt: start, updatedAt: start)
        conversation.userState.appearance = appearance
        return conversation
    }

    private func backdrop(_ appearance: ConversationAppearance?, isDark: Bool = false) -> ConversationPreviewRenderer.Backdrop {
        ConversationPreviewRenderer.backdrop(for: conversation(appearance: appearance), computedAccentHex: "#123456", isDark: isDark)
    }

    func test_backdrop_signature_keepsTheCardsOwnBackground() {
        XCTAssertEqual(backdrop(nil).resolution, .signature)
        XCTAssertFalse(backdrop(nil).paintsOverTheCard)
    }

    func test_backdrop_solid_paintsTheConversationsColor_inBothSchemes() {
        let solid = ConversationAppearance(background: .solid(color: "indigo"))

        XCTAssertEqual(backdrop(solid).resolution, .solid(hex: "#EEF0FF"))
        XCTAssertEqual(backdrop(solid, isDark: true).resolution, .solid(hex: "#14152E"))
        XCTAssertTrue(backdrop(solid).paintsOverTheCard)
    }

    func test_backdrop_design_isTheThreadsBundledModel() {
        guard case .design(let design) = backdrop(ConversationAppearance(background: .design(pack: "heritages", design: "zellige"))).resolution else {
            return XCTFail("un motif du catalogue embarqué se peint sous les bulles de l'aperçu")
        }
        XCTAssertEqual(design.key, "zellige")
    }

    func test_backdrop_photo_keepsItsVeilAndBlur() {
        let photo = ConversationAppearance(background: .photo(attachmentId: "64b7f0c2a1b2c3d4e5f60718", veil: 0.4, blur: 6))

        XCTAssertEqual(backdrop(photo).resolution, .photo(attachmentId: "64b7f0c2a1b2c3d4e5f60718", veil: 0.4, blur: 6))
    }

    /// Un choix illisible (motif inconnu, couleur hors gamme) retombe sur la
    /// carte, jamais sur un fond vide.
    func test_backdrop_unreadableChoice_fallsBackToTheCard() {
        XCTAssertEqual(backdrop(ConversationAppearance(background: .solid(color: "fuchsia"))).resolution, .signature)
    }

    /// Le fil ouvert relève l'apparence la plus récente : l'aperçu la suit
    /// plutôt que la ligne de liste, qui peut encore porter l'ancienne.
    func test_backdrop_threadsLatestChoice_winsOverTheListRow() {
        let id = "c-backdrop-ledger-\(UUID().uuidString)"
        BubbleSkinLedger.record(ConversationAppearance(background: .solid(color: "indigo")), for: id)
        defer { BubbleSkinLedger.record(nil, for: id) }

        let resolved = ConversationPreviewRenderer.backdrop(for: conversation(id, appearance: nil), computedAccentHex: "#123456", isDark: false)

        XCTAssertEqual(resolved.resolution, .solid(hex: "#EEF0FF"))
    }

    func test_backdrop_accent_isThePersonalOneWhenChosen_otherwiseTheComputedOne() {
        XCTAssertEqual(backdrop(ConversationAppearance(accent: "corail")).accentHex, "#E0604E")
        XCTAssertEqual(backdrop(nil).accentHex, "#123456")
    }

    /// Une pièce CHIFFRÉE n'est jamais demandée au réseau : le serveur n'en sert
    /// que le chiffré. L'aperçu retombe alors sur la carte, comme le fil
    /// retombe sur Signature — jamais un aplat neutre que le fil ne montre pas.
    func test_backdropPhoto_encryptedPiece_isNeverRequested_andFallsBackToTheCard() {
        var piece = MeeshyMessageAttachment.image()
        piece.isEncrypted = true
        var carrier = message("m1")
        carrier.attachments = [piece]

        XCTAssertEqual(ConversationPreviewRenderer.backdropPhoto(
            attachmentId: piece.id, among: [carrier], remembered: nil, serverOrigin: "https://gate.test"
        ), .signature)
    }

    func test_backdropPhoto_knownClearPiece_usesItsOwnUrls() {
        let piece = MeeshyMessageAttachment.image()
        var carrier = message("m1")
        carrier.attachments = [piece]

        let photo = ConversationPreviewRenderer.backdropPhoto(
            attachmentId: piece.id, among: [carrier], remembered: nil, serverOrigin: "https://gate.test"
        )

        XCTAssertEqual(photo, .paint(ConversationBackgroundPhoto(thumbnailUrl: piece.thumbnailUrl, fullUrl: piece.fileUrl, thumbHash: piece.thumbHash)))
    }

    /// Une pièce hors des cinq derniers messages n'est connue de personne : elle
    /// se demande à la route qui vérifie l'appartenance, et c'est l'échec de
    /// son chargement, sondé comme dans le fil, qui la juge.
    func test_backdropPhoto_unknownPiece_usesTheDownloadRouteThatChecksMembership() {
        let photo = ConversationPreviewRenderer.backdropPhoto(
            attachmentId: "64b7f0c2a1b2c3d4e5f60718", among: [], remembered: nil, serverOrigin: "https://gate.test"
        )

        guard case .paint(let resolved) = photo else { return XCTFail("une pièce inconnue se demande à la route vérifiée") }
        XCTAssertEqual(resolved.fullUrl, "https://gate.test/api/v1/attachments/64b7f0c2a1b2c3d4e5f60718")
    }

    /// La sonde a déjà jugé la pièce (chiffrée, disparue, refusée) : l'aperçu
    /// ne la retélécharge pas à chaque appui long, il retombe sur la carte.
    func test_backdropPhoto_pieceAlreadyJudgedUnreadable_isNeverRequestedAgain() {
        XCTAssertEqual(ConversationPreviewRenderer.backdropPhoto(
            attachmentId: "64b7f0c2a1b2c3d4e5f60718", among: [], remembered: nil, serverOrigin: "https://gate.test",
            judgedUnreadable: true
        ), .signature)
    }

    func test_displayedBackdrop_photoFellBack_isTheCard() {
        let photo = backdrop(ConversationAppearance(background: .photo(attachmentId: "64b7f0c2a1b2c3d4e5f60718", veil: 0.4, blur: 6)))

        let shown = ConversationPreviewRenderer.displayed(photo, photoFellBack: true)

        XCTAssertFalse(shown.paintsOverTheCard, "le fil retombe sur Signature, l'aperçu sur la carte")
        XCTAssertEqual(ConversationPreviewRenderer.displayed(photo, photoFellBack: false), photo)
    }

    func test_displayedBackdrop_notAPhoto_ignoresThePhotoVerdict() {
        let solid = backdrop(ConversationAppearance(background: .solid(color: "indigo")))

        XCTAssertEqual(ConversationPreviewRenderer.displayed(solid, photoFellBack: true), solid)
    }

    /// La photo se résout UNE fois par pièce (`.task(id:)`), jamais à chaque
    /// réévaluation du corps : la clé ne change que si la pièce ou ce qu'on
    /// en sait change.
    func test_photoKey_changesOnlyWithThePieceOrWhatTheCardKnowsOfIt() {
        var piece = MeeshyMessageAttachment.image()
        piece.isEncrypted = true
        let photo = backdrop(ConversationAppearance(background: .photo(attachmentId: piece.id, veil: 0.4, blur: 6)))
        var carrier = message("m1")
        carrier.attachments = [piece]

        let unknown = ConversationPreviewRenderer.photoKey(of: photo, among: [message("m0")])
        let known = ConversationPreviewRenderer.photoKey(of: photo, among: [message("m0"), carrier])

        XCTAssertEqual(unknown, ConversationPreviewRenderer.photoKey(of: photo, among: []))
        XCTAssertNotEqual(unknown, known)
        XCTAssertNil(ConversationPreviewRenderer.photoKey(of: backdrop(nil), among: []))
    }

    func test_photoFallbacks_rememberTheVerdict_withinABound() {
        let fallbacks = ConversationPreviewPhotoFallbacks(capacity: 2)

        fallbacks.remember("a")
        fallbacks.remember("b")
        fallbacks.remember("a")
        fallbacks.remember("c")

        XCTAssertFalse(fallbacks.contains("b"), "la plus ancienne sort")
        XCTAssertTrue(fallbacks.contains("a"))
        XCTAssertTrue(fallbacks.contains("c"))
    }

    // MARK: - Le repli < iOS 26 : l'entrée sous Réduire les animations

    func test_entrance_reduceMotion_neverStartsFromTheRow() {
        XCTAssertFalse(ConversationPreviewEntranceMotion.emergesFromRow(reduceMotion: true))
        XCTAssertTrue(ConversationPreviewEntranceMotion.emergesFromRow(reduceMotion: false))
    }

    func test_entrance_reduceMotion_hasNoBlur() {
        XCTAssertEqual(ConversationPreviewEntranceMotion.blurRadius(previewScale: 0.3, reduceMotion: true), 0)
        XCTAssertGreaterThan(ConversationPreviewEntranceMotion.blurRadius(previewScale: 0.3, reduceMotion: false), 0)
    }

    func test_entrance_blur_isNeverNegativeOnOvershoot() {
        XCTAssertEqual(ConversationPreviewEntranceMotion.blurRadius(previewScale: 1.2, reduceMotion: false), 0)
    }

    func test_placement_reduceMotion_startsInPlace() {
        let start = ConversationPreviewEntranceMotion.placement(
            source: CGRect(x: 0, y: 500, width: 393, height: 76), rest: CGRect(x: 0, y: 100, width: 340, height: 380), reduceMotion: true
        )

        XCTAssertEqual(start.scale, 1.0)
        XCTAssertEqual(start.offset, 0)
    }

    /// La carte part de la ligne pressée : réduite à la hauteur de la ligne,
    /// son centre visuel posé sur celui de la ligne.
    func test_placement_fromTheRow_centersOnThePressedRow() {
        let rest = CGRect(x: 0, y: 100, width: 340, height: 380)
        let source = CGRect(x: 0, y: 500, width: 393, height: 76)

        let start = ConversationPreviewEntranceMotion.placement(source: source, rest: rest, reduceMotion: false)

        XCTAssertEqual(start.scale, 0.22, accuracy: 0.0001, "76 / 380 = 0.2, relevé au plancher 0.22")
        XCTAssertEqual(rest.maxY - start.scale * rest.height / 2 + start.offset, source.midY, accuracy: 0.0001)
    }

    func test_placement_unknownRow_zoomsFromTheCenter() {
        let start = ConversationPreviewEntranceMotion.placement(source: nil, rest: CGRect(x: 0, y: 0, width: 340, height: 380), reduceMotion: false)

        XCTAssertEqual(start.scale, 0.7)
        XCTAssertEqual(start.offset, 0)
    }

    func test_entrance_menuRise_isNullUnderReduceMotion() {
        XCTAssertEqual(ConversationPreviewEntranceMotion.menuRestOffset(reduceMotion: true), 0)
        XCTAssertGreaterThan(ConversationPreviewEntranceMotion.menuRestOffset(reduceMotion: false), 0)
    }

    /// Le ressort de pression de la rangée : à peine perceptible, à la
    /// iMessage — la rangée s'enfonce, elle ne rétrécit pas.
    func test_rowPress_scale_isASubtleSpring() {
        XCTAssertEqual(ConversationRowMetrics.pressedScale, 0.97)
    }
}
