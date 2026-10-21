import XCTest
import GRDB
import MeeshySDK
@testable import Meeshy

/// Les suites de l'audit des appuis longs (2026-10-20) côté iOS :
/// « Copier » copie le texte AFFICHÉ (#11233), une action se nomme d'UNE table
/// (#11234), et la Rivière ouvre le menu unifié (#11224). « Supprimer pour
/// moi » partout (#11221) : l'ordre réseau ⇄ base est tenu par
/// `ConversationCommandHandlerTests`, la projection du fil et la sélection ici.
@MainActor
final class MessageMenuFollowupsTests: XCTestCase {

    // MARK: - Fabriques

    private func message(_ content: String = "Bonjour", originalLanguage: String = "fr") -> Message {
        Message(id: "m1", conversationId: "c1", senderId: "u2", content: content, originalLanguage: originalLanguage)
    }

    private func translation(_ language: String, _ text: String) -> MessageTranslation {
        MessageTranslation(
            id: "t-\(language)", messageId: "m1", sourceLanguage: "fr", targetLanguage: language,
            translatedContent: text, translationModel: "nllb", confidenceScore: nil
        )
    }

    private var translations: [MessageTranslation] {
        [translation("en", "Hello"), translation("es", "Hola")]
    }

    private func source(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/\(path)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    // MARK: - #11233 — « Copier » copie ce que la bulle AFFICHE

    func test_displayedText_withoutFlag_isThePreferredTranslation() {
        let text = BubbleContent.displayedText(
            of: message(), translations: translations,
            preferredTranslation: translation("en", "Hello"), activeDisplayLangCode: nil
        )
        XCTAssertEqual(text, "Hello")
    }

    func test_displayedText_flagSwitchedToAnotherLanguage_isThatTranslation() {
        let text = BubbleContent.displayedText(
            of: message(), translations: translations,
            preferredTranslation: translation("en", "Hello"), activeDisplayLangCode: "es"
        )
        XCTAssertEqual(text, "Hola", "le drapeau a basculé en espagnol : la bulle lit « Hola », Copier aussi")
    }

    func test_displayedText_flagSwitchedBackToTheOriginal_isTheOriginal() {
        let text = BubbleContent.displayedText(
            of: message(), translations: translations,
            preferredTranslation: translation("en", "Hello"), activeDisplayLangCode: "fr"
        )
        XCTAssertEqual(text, "Bonjour", "la bulle montre l'original : jamais la traduction préférée")
    }

    func test_displayedText_withoutAnyTranslation_isTheOriginal() {
        let text = BubbleContent.displayedText(
            of: message(), translations: [], preferredTranslation: nil, activeDisplayLangCode: nil
        )
        XCTAssertEqual(text, "Bonjour")
    }

    func test_copySites_readTheDisplayedText_neverThePreferredTranslationAlone() throws {
        let sites = [
            "Features/Main/Views/ConversationView+OverlayMenu.swift",
            "Features/Main/Views/ConversationView+MessageSheets.swift",
            "Features/Main/Views/ConversationView+MessageRow.swift",
        ]
        for path in sites {
            let code = try source(path)
            XCTAssertFalse(
                code.contains("?.translatedContent ?? msg.content, of: msg"),
                "`\(path)` copie la traduction préférée, pas le texte affiché (#11233)"
            )
            XCTAssertTrue(code.contains("MessageExitTransport.copyDisplayed("), "`\(path)` doit copier par le site unique")
        }
    }

    // MARK: - #11234 — une action, UN libellé, UN symbole

    private func doubleTap(peutEditer: Bool = true) -> [MessageEditMenuAction] {
        MessageEditMenuAction.primaires(
            messageId: "m1", peutEditer: peutEditer, editer: { _ in }, selectionner: { _ in },
            composer: { _ in }, imager: nil, repondre: { _ in }, transferer: { _ in }, plus: { _ in }
        )
    }

    func test_edit_isNamedAlikeInTheThreeMenus() {
        let edit = doubleTap().first { $0.id == "edit" }
        XCTAssertEqual(PrimaryAction.edit.verb, .edit)
        XCTAssertEqual(MoreItem.edit.verb, .edit)
        XCTAssertEqual(edit?.title, MessageActionVerb.edit.label, "« Éditer » au double toucher, « Modifier » ailleurs : un acte, un mot")
        XCTAssertEqual(edit?.systemImage, MessageActionVerb.edit.symbol)
    }

    func test_doubleTap_everyEntryReadsTheTable() {
        let expected: [String: MessageActionVerb] = [
            "edit": .edit, "select": .select, "compose": .compose,
            "reply": .reply, "forward": .forward, "more": .more,
        ]
        for action in doubleTap() {
            guard let verb = expected[action.id] else { continue }
            XCTAssertEqual(action.title, verb.label, "« \(action.id) » ne lit pas la table")
            XCTAssertEqual(action.systemImage, verb.symbol, "« \(action.id) » ne lit pas la table")
        }
    }

    func test_theSameActOnTwoTargets_isOneVerb() {
        XCTAssertEqual(PrimaryAction.replyToPiece.verb, PrimaryAction.reply.verb)
        XCTAssertEqual(MoreItem.reply.verb, PrimaryAction.reply.verb)
        XCTAssertEqual(PrimaryAction.forwardPiece.verb, MoreItem.forward.verb)
        XCTAssertEqual(MoreItem.language.verb, PrimaryAction.translate.verb)
        XCTAssertEqual(MoreItem.imager.verb, PrimaryAction.exportImage.verb)
        XCTAssertEqual(MoreItem.copy.verb, PrimaryAction.copy.verb)
    }

    func test_everyVerb_hasALabelAndASymbol() {
        for verb in MessageActionVerb.allCases {
            XCTAssertFalse(verb.label.isEmpty, "\(verb) sans libellé")
            XCTAssertFalse(verb.symbol.isEmpty, "\(verb) sans symbole")
        }
    }

    func test_menus_neverSpellAnActionThemselves() throws {
        let menus = [
            "Features/Main/Components/MessageActionsMenu.swift",
            "Features/Main/Views/NativeMessageEditMenu.swift",
        ]
        for path in menus {
            XCTAssertFalse(try source(path).contains("String(localized:"), "`\(path)` nomme une action hors de la table (#11234)")
        }
        let sheet = try source("Features/Main/Components/MessageMoreSheet.swift")
        XCTAssertFalse(sheet.contains("func labelText(_ item: MoreItem)"), "« Plus… » garde sa propre table de libellés")
        XCTAssertFalse(sheet.contains("func symbol(_ item: MoreItem)"), "« Plus… » garde sa propre table de symboles")
        for key in ["\"media.save.title\"", "\"message-detail.tab.forward\"", "\"action.delete_media\""] {
            XCTAssertFalse(sheet.contains(key), "la boîte « Ce média » de « Plus… » nomme \(key) hors de la table")
        }
    }

    func test_quickBar_namesItsActionsFromTheTable() throws {
        let row = try source("Features/Main/Views/ConversationView+MessageRow.swift")
        for key in ["\"action.reply\"", "\"action.copy\"", "\"action.forward\"", "\"action.delete\""] {
            XCTAssertFalse(row.contains(key), "la barre rapide nomme \(key) hors de la table (#11234)")
        }
        for verb in ["reply", "copy", "forward", "delete"] {
            XCTAssertTrue(row.contains("MessageActionVerb.\(verb).filledSymbol"), "la barre rapide dessine « \(verb) » depuis la table")
        }
        XCTAssertEqual(MessageActionVerb.forward.filledSymbol, "\(MessageActionVerb.forward.symbol).fill")
    }

    // MARK: - #11224 — la Rivière ouvre le menu unifié

    func test_river_hasNoMenuOfItsOwn() throws {
        let bubble = try source("Features/Main/Riviere/View/RiverBubbleView.swift")
        XCTAssertFalse(bubble.contains(".contextMenu"), "la Rivière ne compose plus son propre menu à trois actions")
        XCTAssertTrue(bubble.contains("MessagePressClaim.rowMinimumDuration"), "l'appui long d'une bulle dure ce que dure celui d'une rangée")
        XCTAssertTrue(bubble.contains("onLongPress(content.bubble.messageId)"), "l'appui long rend la main à l'hôte")
    }

    func test_river_longPressReachesTheSinglePresentation() throws {
        let layer = try source("Features/Main/Views/ConversationView+ReaderLayers.swift")
        XCTAssertTrue(layer.contains("onLongPress:"), "la couche Rivière branche l'appui long")
        XCTAssertTrue(layer.contains("presentMenu(msg)"), "la couche Rivière présente le menu par l'hôte")
        XCTAssertTrue(layer.contains("overlayState.longPressEnabled"), "mêmes gardes que la liste")
        let host = try source("Features/Main/Views/ConversationView.swift")
        XCTAssertTrue(host.contains("presentMenu: { presentLongPressMenu(for: $0, cellFrame: nil) }"),
                      "la Rivière ouvre le menu par `presentLongPressMenu`, le point d'entrée unique")
    }

    func test_river_isReadableWithoutTheLongPress_byVoiceOver() throws {
        let bubble = try source("Features/Main/Riviere/View/RiverBubbleView.swift")
        XCTAssertTrue(bubble.contains("\"a11y.message.actions.long_press\""),
                      "VoiceOver ouvre le menu de la bulle par une action nommée, comme la rangée du Fil")
    }

    /// #11233 dans la Rivière : elle affiche ce que « Copier » copie — le
    /// drapeau basculé compris —, jamais la seule traduction préférée.
    func test_river_showsWhatCopyCopies() throws {
        let layer = try source("Features/Main/Views/ConversationView+ReaderLayers.swift")
        XCTAssertFalse(layer.contains("preferredTranslation(for: message.id)?.translatedContent ?? message.content"),
                       "la Rivière lit la seule traduction préférée : Copier copierait autre chose")
        XCTAssertTrue(layer.contains("MessageExitTransport.displayedText(message, in: viewModel)"))
        let transport = try source("Features/Main/Services/MessageExitTransport.swift")
        XCTAssertTrue(transport.contains("copy(displayedText(message, in: viewModel), of: message)"),
                      "Copier et la Rivière lisent le même site")
    }

    // MARK: - #11224 — « Sélectionner » ne s'ouvre jamais derrière la Rivière

    func test_selection_landsInTheScript_fromAReaderWithoutSelection() {
        XCTAssertEqual(ConversationSelectionHost.landing(from: .river), .script, "la Rivière n'a ni coche ni toucher de sélection")
        XCTAssertEqual(ConversationSelectionHost.landing(from: .summary), .script)
        XCTAssertNil(ConversationSelectionHost.landing(from: .script))
        XCTAssertNil(ConversationSelectionHost.landing(from: .focal))
        XCTAssertNil(ConversationSelectionHost.landing(from: .bubbles))
    }

    func test_beginSelection_switchesToTheScript_andLandsOnTheMessage() throws {
        let selection = try source("Features/Main/Views/ConversationView+Selection.swift")
        XCTAssertTrue(selection.contains("ConversationSelectionHost.landing(from: readingModeController.mode)"))
        XCTAssertTrue(selection.contains("readingModeController.select(landing)"))
        XCTAssertTrue(selection.contains("scrollState.scrollToMessageId = messageId"))
    }

    // MARK: - #11221 — le retrait « pour moi » se fait dans la PROJECTION, jamais en base

    private func dated(_ id: String, _ seconds: TimeInterval) -> Message {
        Message(id: id, conversationId: "c1", content: id, createdAt: Date(timeIntervalSince1970: seconds))
    }

    private func record(_ localId: String, serverId: String? = nil, at seconds: TimeInterval = 0) -> MessageRecord {
        var row = MessageStoreObservationHelper.makeRecord(
            localId: localId, conversationId: "conv-for-me", createdAt: Date(timeIntervalSince1970: 1_700_000_000 + seconds)
        )
        row.serverId = serverId
        return row
    }

    func test_concealment_filtersARow_byItsLocalOrItsServerId() {
        var concealment = PersonalConcealment()
        concealment.conceal(["srv-b", "c"])
        let kept = [record("a"), record("cid-b", serverId: "srv-b"), record("c")].filter { !concealment.conceals($0) }
        XCTAssertEqual(kept.map(\.localId), ["a"], "un message envoyé par soi garde son id optimiste : l'id serveur le désigne aussi")
        concealment.reveal(["srv-b"])
        XCTAssertFalse(concealment.conceals(record("cid-b", serverId: "srv-b")))
    }

    private func seededStore(_ ids: [String]) async throws -> (store: MessageStore, db: DatabaseQueue) {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        let persistence = MessagePersistenceActor(dbWriter: db)
        for (index, id) in ids.enumerated() {
            try await MessageStoreObservationHelper.insertRecord(record(id, at: TimeInterval(index)), into: persistence)
        }
        let store = MessageStore(conversationId: "conv-for-me", persistence: persistence)
        await store.refreshFromDB()
        return (store, db)
    }

    /// Le constat de la revue : purger AVANT la réponse rendait un refus
    /// irréparable dès que la relecture réseau échouait aussi. Le fil perd le
    /// message tout de suite ; la base le garde.
    func test_store_concealed_leavesTheThread_andARereadCannotBringItBack_whileTheRowStays() async throws {
        let (store, db) = try await seededStore(["a", "b", "c"])

        store.conceal(["b"])
        XCTAssertEqual(store.messages.map(\.localId), ["a", "c"], "optimiste : la bulle part avant la réponse du serveur")

        await store.refreshFromDB(mergeInMemory: true)
        XCTAssertEqual(store.messages.map(\.localId), ["a", "c"], "une relecture de la base ne ramène pas un message caché")
        let row = try await db.read { try MessageRecord.fetchOne($0, key: "b") }
        XCTAssertNotNil(row, "la ligne n'est jamais purgée avant l'accord du serveur")
    }

    func test_store_revealed_bringsTheMessageBackFromTheBase_withoutAnyNetwork() async throws {
        let (store, _) = try await seededStore(["a", "b", "c"])
        store.conceal(["b"])

        await store.reveal(["b"])

        XCTAssertEqual(store.messages.map(\.localId), ["a", "b", "c"], "refus du serveur : le message revient à sa place")
    }

    func test_restoredFromAnotherDevice_liftsTheConcealment() throws {
        let load = try source("Features/Main/ViewModels/ConversationViewModel+InitialLoad.swift")
        XCTAssertTrue(load.contains("await messageStore.reveal(ids)"), "un retour en vue venu du web n'est plus filtré")
        let removal = try source("Features/Main/ViewModels/Conversation/ConversationForMeRemoval.swift")
        XCTAssertTrue(removal.contains("viewModel.messageStore.conceal(ids)"), "le fil (le store) perd le message, pas seulement la Rivière")
    }

    func test_selectionForMe_unsentLeaveLocally_refusedStay_admittedLeaveTogether() {
        let plan = ForMeSelectionPlan.make(
            selected: [dated("a", 1), dated("draft", 2), dated("sending", 3), dated("b", 4)],
            isUnsent: { $0 == "draft" },
            admits: { !["draft", "sending"].contains($0.id) },
            serverId: { "srv-\($0)" }
        )
        XCTAssertEqual(plan.unsent, ["draft"], "un envoi raté n'a pas d'id serveur : il se retire localement")
        XCTAssertEqual(plan.targets, [ForMeTarget(messageId: "a", serverId: "srv-a"), ForMeTarget(messageId: "b", serverId: "srv-b")],
                       "un envoi en cours n'est pas admis par la loi : il reste")
        XCTAssertFalse(plan.isEmpty)
    }

    func test_selectionForMe_guestSelection_offersNothing() {
        let plan = ForMeSelectionPlan.make(
            selected: [dated("a", 1)], isUnsent: { _ in false }, admits: { _ in false }, serverId: { $0 }
        )
        XCTAssertTrue(plan.isEmpty, "rien n'est admis (invité, ancien membre) : « pour moi » n'est pas proposé")
    }

    func test_selectionForMe_goesThroughTheLaw_inOneGesture() throws {
        let selection = try source("Features/Main/Views/ConversationView+Selection.swift")
        XCTAssertTrue(selection.contains("removal.runSelection(ids, authority: authority)"),
                      "la sélection part en un geste, jamais message par message")
        let removal = try source("Features/Main/ViewModels/Conversation/ConversationForMeRemoval.swift")
        XCTAssertTrue(removal.contains("authority: authority).canDeleteForMe"), "chaque message passe par le verdict de la loi")
        let dialog = try source("Features/Main/Views/ConversationView+LongPressMenu.swift")
        XCTAssertTrue(dialog.contains("if selectionAllowsDeleteForMe"), "« pour moi » n'est offert que si un message au moins est admis")
    }
}
