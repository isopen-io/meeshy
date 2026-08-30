import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class MessageActionResolverTests: XCTestCase {
    private func ctx(
        isMine: Bool = false, canEdit: Bool = false, canDelete: Bool = false,
        hasText: Bool = true, hasMedia: Bool = false, hasTimebasedMedia: Bool = false,
        isPinned: Bool = false, isStarred: Bool = false,
        isEdited: Bool = false, hasEditRevisions: Bool = false,
        saveableAttachmentCount: Int = 0,
        canComposeMedia: Bool = false,
        showReadReceipts: Bool = true,
        isForwardable: Bool = true
    ) -> MessageMenuContext {
        MessageMenuContext(isMine: isMine, canEdit: canEdit, canDelete: canDelete,
            hasText: hasText, hasMedia: hasMedia, hasTimebasedMedia: hasTimebasedMedia,
            isPinned: isPinned, isStarred: isStarred, isEdited: isEdited,
            hasEditRevisions: hasEditRevisions,
            saveableAttachmentCount: saveableAttachmentCount,
            canComposeMedia: canComposeMedia,
            showReadReceipts: showReadReceipts,
            isForwardable: isForwardable)
    }

    private func message(isViewOnce: Bool) -> Message {
        var msg = Message(
            id: "6a0ad86a6e21a483b4443d11",
            conversationId: "6a0ad86a6e21a483b4443d99",
            senderId: "sender-1",
            content: "coucou",
            createdAt: Date(),
            updatedAt: Date()
        )
        msg.isViewOnce = isViewOnce
        return msg
    }

    // MARK: - primaryActions : liste COMPACTE de l'overlay (≤ actions clés + .more)

    func test_primaryActions_receivedText_isTranslateCopyMore() {
        let a = MessageActionResolver.primaryActions(ctx())
        XCTAssertEqual(a, [.select, .translate, .copy, .more])
    }

    func test_primaryActions_ownEditableText_isEditTranslateCopyMore() {
        let a = MessageActionResolver.primaryActions(ctx(isMine: true, canEdit: true, canDelete: true))
        XCTAssertEqual(a, [.edit, .select, .translate, .copy, .more])
    }

    func test_primaryActions_neverContainsDelete_evenWhenDeletable() {
        let a = MessageActionResolver.primaryActions(ctx(isMine: true, canEdit: true, canDelete: true))
        XCTAssertFalse(a.contains(.delete), "Supprimer vit dans « Plus… », jamais dans le menu compact")
    }

    func test_primaryActions_neverContainsPinStar_movedToMore() {
        let unpinned = MessageActionResolver.primaryActions(ctx())
        XCTAssertFalse(unpinned.contains(.pin))
        XCTAssertFalse(unpinned.contains(.star))
        let pinnedStarred = MessageActionResolver.primaryActions(ctx(isPinned: true, isStarred: true))
        XCTAssertFalse(pinnedStarred.contains(.unpin))
        XCTAssertFalse(pinnedStarred.contains(.unstar))
    }

    func test_primaryActions_alwaysEndsWithMore() {
        XCTAssertEqual(MessageActionResolver.primaryActions(ctx()).last, .more)
        XCTAssertEqual(MessageActionResolver.primaryActions(ctx(hasText: false, hasMedia: true, saveableAttachmentCount: 1)).last, .more)
        XCTAssertEqual(MessageActionResolver.primaryActions(ctx(hasText: false, hasMedia: true, saveableAttachmentCount: 5)).last, .more)
    }

    func test_primaryActions_singleMediaNoText_isSaveMediaMore() {
        let a = MessageActionResolver.primaryActions(ctx(hasText: false, hasMedia: true, saveableAttachmentCount: 1))
        XCTAssertEqual(a, [.select, .saveMedia, .more])
    }

    func test_primaryActions_multiMediaNoText_dropsSaveMedia_selectCoversTheFallback() {
        let a = MessageActionResolver.primaryActions(ctx(hasText: false, hasMedia: true, saveableAttachmentCount: 3))
        XCTAssertFalse(a.contains(.saveMedia), "multi-attachment passe par la galerie, pas le menu")
        // Le repli pin est SANS OBJET depuis que `.select` garantit `out`
        // non vide (voir le résolveur) — la liste se limite à Sélectionner + Plus…
        XCTAssertEqual(a, [.select, .more], "aucune action clé au-delà de Sélectionner, toujours offerte")
    }

    func test_primaryActions_imageOnly_dropsTranslate() {
        let a = MessageActionResolver.primaryActions(ctx(hasText: false, hasMedia: true, saveableAttachmentCount: 1))
        XCTAssertFalse(a.contains(.translate), "Traduire n'a pas de sens sur un média sans texte")
    }

    func test_primaryActions_isNeverEmptyBesidesMore() {
        // Contexte dégénéré : ni texte, ni média enregistrable, ni rien
        let a = MessageActionResolver.primaryActions(ctx(hasText: false))
        XCTAssertGreaterThanOrEqual(a.count, 2)
        XCTAssertEqual(a.last, .more)
    }

    // MARK: - Lot 5 (O13) — « Composer » : DEUX gestes, jamais trois

    /// Fabrique de messages pour la RÈGLE d'offre. Elle prend des pièces jointes
    /// RÉELLES parce que la règle lit leurs drapeaux de protection : un contexte
    /// de primitives ne pourrait pas la mesurer.
    private func msg(
        attachments: [MessageAttachment] = [],
        content: String = "",
        isViewOnce: Bool = false,
        isBlurred: Bool = false,
        isEncrypted: Bool = false
    ) -> Message {
        var m = MeeshyMessage(
            conversationId: "conv-1", content: content,
            isEncrypted: isEncrypted, attachments: attachments)
        m.isViewOnce = isViewOnce
        m.isBlurred = isBlurred
        return m
    }

    private func piece(
        _ mimeType: String,
        isViewOnce: Bool = false,
        isBlurred: Bool = false,
        isEncrypted: Bool = false
    ) -> MessageAttachment {
        MeeshyMessageAttachment(
            mimeType: mimeType, fileUrl: "https://cdn.example/x",
            isViewOnce: isViewOnce, isBlurred: isBlurred, isEncrypted: isEncrypted)
    }

    /// O13 fixe le budget : **2 gestes**. La feuille « Plus… » en coûte trois
    /// (appui long → « Plus… » → « Composer »), la liste verticale de l'overlay
    /// en coûte deux — et elle porte déjà le voisin naturel de ce geste,
    /// « Enregistrer », gaté sur la même forme de contexte.
    func test_primaryActions_singleComposableMedia_offersCompose() {
        let a = MessageActionResolver.primaryActions(
            ctx(hasText: false, hasMedia: true,
                saveableAttachmentCount: 1, canComposeMedia: true))

        XCTAssertEqual(a, [.select, .saveMedia, .compose, .more])
    }

    /// Le voisinage n'est pas décoratif : « Composer » suit immédiatement
    /// « Enregistrer », parce que ce sont les deux gestes qui EMPORTENT le
    /// média hors de la conversation. Le placer après « Plus… » le sortirait de
    /// ce voisinage — et personne ne le trouverait.
    func test_primaryActions_compose_followsSaveMedia() throws {
        let a = MessageActionResolver.primaryActions(
            ctx(hasText: false, hasMedia: true,
                saveableAttachmentCount: 1, canComposeMedia: true))
        let save = try XCTUnwrap(a.firstIndex(of: .saveMedia))
        let compose = try XCTUnwrap(a.firstIndex(of: .compose))

        XCTAssertEqual(compose, save + 1)
    }

    /// **Le cas qui SÉPARE composabilité et publiabilité : l'AUDIO.** Une note
    /// vocale s'enregistre (`saveableAttachmentCount == 1`) et ne se compose
    /// pas — la graine ne sait pas la poser sur un canvas.
    func test_primaryActions_audioOnly_offersSave_butNeverCompose() {
        let a = MessageActionResolver.primaryActions(
            ctx(hasText: false, hasMedia: true,
                saveableAttachmentCount: 1, canComposeMedia: false))

        XCTAssertEqual(a, [.select, .saveMedia, .more])
    }

    // MARK: - LA règle d'offre : UN site, trois lecteurs

    /// **`ComposableAttachment.offers` est la règle, et le résolveur n'en tient
    /// qu'un FAIT.** Elle vit ici plutôt qu'en trois exemplaires parce que ses
    /// trois lecteurs — le menu d'appui long, le menu natif et la feuille de
    /// transfert — mènent au MÊME plein écran : une conjonction recopiée dans
    /// une `private var` de `View` n'est mesurable par aucun test, et diverge au
    /// premier `&&` devenu `||`.
    func test_offers_singleImage_isOffered() {
        XCTAssertTrue(ComposableAttachment.offers(message: msg(attachments: [piece("image/jpeg")])))
    }

    /// **Un LOT ne se compose pas.** La première pièce déciderait pour toutes,
    /// et le composer mentirait sur ce qui part — la même raison qui tient
    /// « Enregistrer » à exactement UNE pièce.
    func test_offers_aBatchIsRefused() {
        XCTAssertFalse(ComposableAttachment.offers(
            message: msg(attachments: [piece("image/jpeg"), piece("video/mp4")])))
    }

    /// **Une VUE UNIQUE ne se compose pas** — clause O13, lue par le prédicat
    /// qui l'énonce déjà une fois (`Message.isForwardable`).
    func test_offers_viewOnceMessage_isRefused() {
        XCTAssertFalse(ComposableAttachment.offers(
            message: msg(attachments: [piece("image/jpeg")], isViewOnce: true)))
    }

    /// **La protection se lit aux DEUX niveaux qui la déclarent.**
    ///
    /// `Message.isForwardable` ne dit que la vue unique du MESSAGE. Le dépôt
    /// déclare la protection une seconde fois sur la PIÈCE JOINTE
    /// (`MeeshyMessageAttachment.isViewOnce` / `.isBlurred`), et cinq gardes de
    /// production la lisent déjà sous ce nom — `attachmentIsProtected`. Sans ce
    /// second niveau, une photo FLOUTÉE offrait « Composer », et la porte
    /// matérialisait le fichier D'ORIGINE : le flou n'est qu'un masque de rendu,
    /// jamais une transformation du blob. Le média serait parti EN CLAIR vers un
    /// fil public.
    func test_offers_protectedAttachment_isRefused_atBothLevels() {
        let protegees: [(nom: String, piece: MessageAttachment)] = [
            ("vue unique", piece("image/jpeg", isViewOnce: true)),
            ("floutée", piece("image/jpeg", isBlurred: true)),
            ("chiffrée", piece("image/jpeg", isEncrypted: true))
        ]
        for cas in protegees {
            XCTAssertFalse(
                ComposableAttachment.offers(message: msg(attachments: [cas.piece])),
                "\(cas.nom) : la porte publierait l'original en clair sur un fil public."
            )
        }
    }

    /// Le MESSAGE flouté, lui aussi : `BubbleContentBuilder` le lit et le rend
    /// masqué, et « Composer » n'a aucune raison d'être la seule surface qui
    /// l'ignore. La vue unique passe déjà par `isForwardable` ; le flou n'avait
    /// AUCUN lecteur dans les trois portes de « Composer ».
    func test_offers_blurredMessage_isRefused() {
        XCTAssertFalse(ComposableAttachment.offers(
            message: msg(attachments: [piece("image/jpeg")], isBlurred: true)))
    }

    func test_offers_encryptedMessage_isRefused() {
        XCTAssertFalse(ComposableAttachment.offers(
            message: msg(attachments: [piece("image/jpeg")], isEncrypted: true)))
    }

    /// Une pièce PROTÉGÉE qui voyage à côté de la composable suffit à tout
    /// refuser : la graine n'emporterait qu'une pièce, mais l'offre porterait sur
    /// un message dont une partie est masquée.
    func test_offers_aProtectedNeighbourIsEnoughToRefuse() {
        XCTAssertFalse(ComposableAttachment.offers(
            message: msg(attachments: [piece("image/jpeg"), piece("application/pdf", isViewOnce: true)])))
    }

    /// La CIBLE est l'unique pièce composable, où qu'elle soit dans le lot —
    /// et c'est la MÊME décision que l'offre, jamais une seconde.
    func test_target_isTheSingleComposablePiece_whereverItSits() throws {
        let image = piece("image/jpeg")
        let cible = try XCTUnwrap(ComposableAttachment.target(
            in: msg(attachments: [piece("application/pdf"), image])))

        XCTAssertEqual(cible.id, image.id)
    }

    func test_target_isNilWheneverTheOfferIsRefused() {
        XCTAssertNil(ComposableAttachment.target(
            in: msg(attachments: [piece("image/jpeg", isBlurred: true)])))
    }

    // MARK: - La règle de COMPOSABILITÉ, éprouvée sur les mimes réels

    func test_composableForm_acceptsImagesAndVideos_only() {
        XCTAssertEqual(ComposableAttachment.form(mimeType: "image/jpeg"), .image)
        XCTAssertEqual(ComposableAttachment.form(mimeType: "image/HEIC"), .image)
        XCTAssertEqual(ComposableAttachment.form(mimeType: "video/mp4"), .video)
        XCTAssertEqual(ComposableAttachment.form(mimeType: "video/quicktime"), .video)
    }

    /// Chaque refus vaut par sa RAISON, pas par la liste : l'audio parce que
    /// l'atelier n'a pas de place pour lui, le lieu parce qu'`AttachmentKind` le
    /// range en `.other` — ce qui tient la garde O13 « jamais `.location` »
    /// GRATUITEMENT, sans condition qu'on puisse oublier de recopier.
    func test_composableForm_refusesAudioLocationAndDocuments() {
        for mime in ["audio/m4a", "audio/mpeg", "application/x-location",
                     "application/pdf", "application/msword", "text/plain",
                     "application/zip", "text/csv", "application/json", ""] {
            XCTAssertNil(ComposableAttachment.form(mimeType: mime), mime)
        }
    }

    // MARK: - moreSections : « Sélectionner » (#4005) — toujours offert, en fin de liste

    // MARK: - primaryActions : « Sélectionner » promu en primaire (retour porteur 2026-08-27)

    func test_primaryActions_alwaysIncludesSelect() {
        XCTAssertTrue(MessageActionResolver.primaryActions(ctx()).contains(.select),
            "« Sélectionner » doit toujours être offert, comme .compose/.edit — aucune condition de contexte.")
        XCTAssertTrue(
            MessageActionResolver.primaryActions(ctx(hasText: false)).contains(.select),
            "Toujours offert même sans texte — utilitaire de LISTE, pas une action sur CE message."
        )
    }

    // `MoreItem` n'a plus DU TOUT de cas `.select` (retiré, pas seulement
    // filtré) — le type system garantit déjà qu'aucune section « Plus… » ne
    // peut le porter. Aucun test runtime n'a de sens pour cet invariant.

    // MARK: - moreSections : SSOT « Plus… » (accueille pin/star/delete sortis du primaire)

    func test_moreSections_actionsIncludePinAndStar() {
        let items = actionItems(MessageActionResolver.moreSections(ctx()))
        XCTAssertTrue(items.contains(.pin))
        XCTAssertTrue(items.contains(.star))
    }

    func test_moreSections_pinnedStarred_showUnpinUnstar() {
        let items = actionItems(MessageActionResolver.moreSections(ctx(isPinned: true, isStarred: true)))
        XCTAssertTrue(items.contains(.unpin))
        XCTAssertTrue(items.contains(.unstar))
        XCTAssertFalse(items.contains(.pin))
        XCTAssertFalse(items.contains(.star))
    }

    func test_moreSections_canDelete_includesMessageDelete() {
        let items = actionItems(MessageActionResolver.moreSections(ctx(isMine: true, canDelete: true)))
        XCTAssertTrue(items.contains(.delete), "la suppression du message est routée vers « Plus… »")
    }

    func test_moreSections_cannotDelete_omitsMessageDelete() {
        let items = actionItems(MessageActionResolver.moreSections(ctx(canDelete: false)))
        XCTAssertFalse(items.contains(.delete))
    }

    func test_moreSections_startsWithReplyForwardThread() {
        let items = actionItems(MessageActionResolver.moreSections(ctx()))
        XCTAssertEqual(Array(items.prefix(3)), [.reply, .forward, .thread])
    }

    // Le serveur refuse le transfert d'une vue unique (`forwardAdmission`,
    // `view-once-not-forwardable`) — offrir l'action condamnait l'utilisateur
    // à un échec muet. Spec 2026-08-19, Volet A.2.
    func test_moreSections_notForwardable_omitsForward() {
        let items = actionItems(MessageActionResolver.moreSections(ctx(hasText: false, hasMedia: true, isForwardable: false)))
        XCTAssertFalse(items.contains(.forward),
                       "Une vue unique n'offre pas un transfert que le serveur refuse")
        XCTAssertEqual(Array(items.prefix(2)), [.reply, .thread])
    }

    func test_moreSections_notForwardable_keepsEveryOtherAction() {
        let normal = actionItems(MessageActionResolver.moreSections(ctx(hasText: false, hasMedia: true)))
        let viewOnce = actionItems(MessageActionResolver.moreSections(ctx(hasText: false, hasMedia: true, isForwardable: false)))
        XCTAssertEqual(viewOnce, normal.filter { $0 != .forward })
    }

    // MARK: - Prédicat de transférabilité (site d'énonciation UNIQUE)

    /// La règle « vue unique ⇒ pas de transfert » vivait ré-encodée en six
    /// points d'UI. Elle se nomme désormais une fois, sur le message ; le
    /// résolveur n'en reçoit que le verdict.
    func test_isForwardable_viewOnce_isFalse() {
        XCTAssertFalse(message(isViewOnce: true).isForwardable,
                       "Le serveur refuse le transfert d'une vue unique — l'UI ne doit pas l'offrir")
    }

    func test_isForwardable_ordinaryMessage_isTrue() {
        XCTAssertTrue(message(isViewOnce: false).isForwardable)
    }

    /// Le verdict alimente le résolveur tel quel — aucune seconde énonciation
    /// de la règle entre le message et le menu.
    func test_moreSections_viewOnceMessage_omitsForward_endToEnd() {
        let items = actionItems(MessageActionResolver.moreSections(
            ctx(hasText: true, isForwardable: message(isViewOnce: true).isForwardable)
        ))
        XCTAssertFalse(items.contains(.forward))
    }

    func test_moreSections_mediaBeforeMessageDelete_whenBothPresent() {
        let items = actionItems(MessageActionResolver.moreSections(ctx(isMine: true, canDelete: true, hasMedia: true)))
        guard let mediaIdx = items.firstIndex(of: .media), let msgIdx = items.firstIndex(of: .delete) else {
            return XCTFail("media et delete attendus")
        }
        XCTAssertLessThan(mediaIdx, msgIdx)
    }

    func test_moreSections_timebasedMedia_showsTranscriptionNotSentiment() {
        let sections = MessageActionResolver.moreSections(ctx(hasText: false, hasMedia: true, hasTimebasedMedia: true))
        let info = infoItems(sections)
        XCTAssertTrue(info.contains(.transcription))
        XCTAssertFalse(info.contains(.sentiment))
    }

    func test_moreSections_editedWithRevisions_showsHistory() {
        let sections = MessageActionResolver.moreSections(ctx(isEdited: true, hasEditRevisions: true))
        XCTAssertTrue(infoItems(sections).contains(.history))
    }

    func test_moreSections_alwaysHasReportInModeration() {
        let sections = MessageActionResolver.moreSections(ctx())
        guard case .moderation(let items)? = sections.first(where: { if case .moderation = $0 { return true }; return false }) else {
            return XCTFail("moderation section missing")
        }
        XCTAssertEqual(items, [.report])
    }

    // « Plus… » enrichi (req 2026-07-24) : éditer / copier / partager / traduire /
    // transcription y sont désormais disponibles (menu complet).

    func test_moreSections_actionsIncludeShare() {
        let items = actionItems(MessageActionResolver.moreSections(ctx()))
        XCTAssertTrue(items.contains(.share), "« Partager » disponible dans « Plus… »")
    }

    func test_moreSections_ownEditableText_actionsIncludeEditAndCopy() {
        let items = actionItems(MessageActionResolver.moreSections(ctx(isMine: true, canEdit: true)))
        XCTAssertTrue(items.contains(.edit))
        XCTAssertTrue(items.contains(.copy))
    }

    func test_moreSections_receivedText_actionsOmitEdit_keepCopy() {
        let items = actionItems(MessageActionResolver.moreSections(ctx(isMine: false)))
        XCTAssertFalse(items.contains(.edit), "pas d'édition d'un message reçu")
        XCTAssertTrue(items.contains(.copy))
    }

    func test_moreSections_text_infoIncludesLanguageAndReactions() {
        let items = infoItems(MessageActionResolver.moreSections(ctx()))
        XCTAssertTrue(items.contains(.language), "Traduire (langue) explorable dans « Plus… »")
        XCTAssertTrue(items.contains(.reactions), "Réactions explorables (voir + ajouter) dans « Plus… »")
    }

    func test_moreSections_mediaNoText_infoOmitsLanguageAndSentiment() {
        let items = infoItems(MessageActionResolver.moreSections(ctx(hasText: false, hasMedia: true)))
        XCTAssertFalse(items.contains(.language), "pas de traduction sans texte ni piste temporelle")
        XCTAssertFalse(items.contains(.sentiment))
    }

    func test_moreSections_timebasedMedia_infoIncludesLanguage() {
        let items = infoItems(MessageActionResolver.moreSections(ctx(hasText: false, hasMedia: true, hasTimebasedMedia: true)))
        XCTAssertTrue(items.contains(.language), "audio/vidéo → traduction (langue) disponible")
    }

    // MARK: - Helpers

    private func actionItems(_ sections: [MoreSection]) -> [MoreItem] {
        for s in sections { if case .actions(let items) = s { return items } }
        return []
    }

    private func infoItems(_ sections: [MoreSection]) -> [MoreItem] {
        for s in sections { if case .info(let items) = s { return items } }
        return []
    }
    // MARK: - Réciprocité showReadReceipts
    //
    // Qui ne partage pas ses accusés ne voit pas ceux des autres. On masque
    // l'entrée de menu plutôt que d'ouvrir une feuille vide — le serveur ne
    // renverrait rien de toute façon.
    // Voir `docs/superpowers/specs/2026-07-24-read-exactness-design.md`.

    func test_moreSections_sharing_offersViews() {
        let sections = MessageActionResolver.moreSections(ctx(showReadReceipts: true))
        XCTAssertTrue(sections.contains { section in
            if case .info(let items) = section { return items.contains(.views) }
            return false
        })
    }

    func test_moreSections_optedOut_hidesViews() {
        let sections = MessageActionResolver.moreSections(ctx(showReadReceipts: false))
        XCTAssertFalse(sections.contains { section in
            if case .info(let items) = section { return items.contains(.views) }
            return false
        })
    }

    func test_moreSections_optedOut_keepsTheOtherInfoEntries() {
        let sections = MessageActionResolver.moreSections(ctx(hasText: true, showReadReceipts: false))
        let info = sections.compactMap { section -> [MoreItem]? in
            if case .info(let items) = section { return items }
            return nil
        }.first
        XCTAssertNotNil(info)
        XCTAssertTrue(info?.contains(.reactions) ?? false)
        XCTAssertTrue(info?.contains(.language) ?? false)
    }

    // MARK: - #4025 — « Composer » est offert sur TOUT message, et le PLAN dit comment

    /// **Le défaut.** « Composer » n'apparaissait que sur un message portant un
    /// média posable sur un canvas. Un message TEXTE — le cas le plus courant —
    /// ne l'offrait pas, alors que son texte a une destination évidente dans
    /// l'atelier : la DESCRIPTION de la slide.
    ///
    /// La règle ne rend donc plus « quelle pièce » mais un PLAN : ce qui se pose
    /// sur le canvas, et ce qui pré-remplit la description. Deux questions que
    /// `target(in:)` seul ne pouvait pas porter — il rendait un `MessageAttachment?`,
    /// un type qui n'a aucun endroit où loger du texte.
    func test_seedPlan_textOnlyMessage_seedsTheDescription() {
        let plan = ComposableAttachment.seedPlan(in: msg(content: "On se voit à 18h"))
        XCTAssertEqual(plan?.description, "On se voit à 18h")
        XCTAssertNil(plan?.media, "un message texte ne pose rien sur le canvas")
    }

    func test_offers_textOnlyMessage_isNowOffered() {
        XCTAssertTrue(ComposableAttachment.offers(message: msg(content: "salut")))
    }

    /// **Un message VIDE n'offre rien** — ni texte, ni média : le contre-témoin
    /// sans lequel « offert sur tout message » se lirait « offert toujours »,
    /// et l'atelier s'ouvrirait sur rien.
    func test_offers_emptyMessage_isRefused() {
        XCTAssertFalse(ComposableAttachment.offers(message: msg()))
    }

    /// Un texte fait d'espaces n'est pas un texte.
    func test_offers_blankText_isRefused() {
        XCTAssertFalse(ComposableAttachment.offers(message: msg(content: "   \n\t ")))
    }

    /// **Le texte porte les MÊMES protections que le média.** Publier au-delà
    /// de la conversation ce qui est masqué DANS la conversation est une
    /// divulgation — que la chose masquée soit une image ou une phrase.
    /// Sans ces trois cas, l'extension au texte ouvrirait une porte que le
    /// média avait fermée.
    func test_offers_protectedTextIsRefused_onAllThreeDeclarations() {
        XCTAssertFalse(ComposableAttachment.offers(message: msg(content: "secret", isViewOnce: true)),
                       "vue unique : clause O13")
        XCTAssertFalse(ComposableAttachment.offers(message: msg(content: "secret", isBlurred: true)),
                       "flouté : le masque n'est qu'un rendu, le texte partirait en clair")
        XCTAssertFalse(ComposableAttachment.offers(message: msg(content: "secret", isEncrypted: true)),
                       "chiffré : ce qui ne se lit que dans la conversation n'en sort pas")
    }

    /// **Un message qui porte les DEUX sème les deux.** Le média va sur le
    /// canvas, le texte dans la description — c'est exactement la légende que
    /// l'auteur avait déjà écrite, et la lui redemander serait un geste de plus
    /// pour rien.
    func test_seedPlan_mediaWithText_seedsBoth() {
        let plan = ComposableAttachment.seedPlan(
            in: msg(attachments: [piece("image/jpeg")], content: "au bord du lac"))
        XCTAssertNotNil(plan?.media, "le média reste ce qui se pose sur le canvas")
        XCTAssertEqual(plan?.description, "au bord du lac")
    }

    /// Un LOT reste refusé — mais son TEXTE, lui, reste semable : le refus
    /// portait sur « quelle pièce part », pas sur la phrase qui l'accompagne.
    func test_seedPlan_aBatchKeepsItsTextButPosesNoMedia() {
        let plan = ComposableAttachment.seedPlan(
            in: msg(attachments: [piece("image/jpeg"), piece("video/mp4")], content: "nos vacances"))
        XCTAssertNil(plan?.media, "un lot mentirait sur ce qui part")
        XCTAssertEqual(plan?.description, "nos vacances")
    }

    /// `target(in:)` survit comme PROJECTION du plan, pour ses deux lecteurs
    /// qui n'ont besoin que de la pièce. Deux implémentations de la même
    /// conjonction seraient deux règles qui ont commencé à diverger.
    func test_target_isAProjectionOfTheSamePlan() {
        let message = msg(attachments: [piece("image/jpeg")], content: "x")
        XCTAssertEqual(ComposableAttachment.target(in: message)?.id,
                       ComposableAttachment.seedPlan(in: message)?.media?.id)
    }
}
