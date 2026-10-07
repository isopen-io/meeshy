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
        exits: MessageExitOffer = .unrestricted
    ) -> MessageMenuContext {
        MessageMenuContext(isMine: isMine, canEdit: canEdit, canDelete: canDelete,
            hasText: hasText, hasMedia: hasMedia, hasTimebasedMedia: hasTimebasedMedia,
            isPinned: isPinned, isStarred: isStarred, isEdited: isEdited,
            hasEditRevisions: hasEditRevisions,
            saveableAttachmentCount: saveableAttachmentCount,
            canComposeMedia: canComposeMedia,
            showReadReceipts: showReadReceipts,
            exits: exits)
    }

    private let afterRead = MessageExitOffer(law: .afterReadFlame, holdsBlur: false, isEncrypted: false)
    private let timedFlame = MessageExitOffer(law: .timedFlame(seconds: 30), holdsBlur: false, isEncrypted: false)

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
        XCTAssertEqual(a, [.select, .translate, .copy, .exportImage, .more])
    }

    func test_primaryActions_ownEditableText_isEditTranslateCopyMore() {
        let a = MessageActionResolver.primaryActions(ctx(isMine: true, canEdit: true, canDelete: true))
        XCTAssertEqual(a, [.edit, .select, .translate, .copy, .exportImage, .more])
    }

    // MARK: - Exporter en image

    func test_primaryActions_quickExport_onlyWithASavedDefaultFormat() {
        var withDefault = ctx()
        withDefault.hasDefaultExportFormat = true
        XCTAssertEqual(MessageActionResolver.primaryActions(withDefault), [.select, .translate, .copy, .exportImage, .exportQuick, .more])
        XCTAssertFalse(MessageActionResolver.primaryActions(ctx()).contains(.exportQuick))
    }

    func test_primaryActions_noText_offersNoImageExport() {
        var media = ctx(hasText: false, hasMedia: true, saveableAttachmentCount: 1)
        media.hasDefaultExportFormat = true
        let a = MessageActionResolver.primaryActions(media)
        XCTAssertFalse(a.contains(.exportImage))
        XCTAssertFalse(a.contains(.exportQuick))
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

    /// **Le résolveur ne connaît QUE le fait, jamais le mime.** Ce témoin
    /// s'appelait « l'audio s'enregistre et ne se compose jamais » ; le #4461 a
    /// levé ce refus au niveau de la RÈGLE (`ComposableAttachment.form`), pas
    /// ici. Ce qu'il vérifie survit intact et se nomme désormais pour ce qu'il
    /// est : `canComposeMedia == false` retire « Composer », quelle que soit la
    /// raison du refus — c'est précisément parce que le résolveur ne la connaît
    /// pas qu'il n'a pas eu à changer.
    func test_primaryActions_whenTheRuleRefuses_composeIsAbsent() {
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

    /// **Une VUE UNIQUE ne se compose pas** — clause O13, lue sur la loi de
    /// sortie (`Message.exitOffer`), qui l'énonce une fois.
    func test_offers_viewOnceMessage_isRefused() {
        XCTAssertFalse(ComposableAttachment.offers(
            message: msg(attachments: [piece("image/jpeg")], isViewOnce: true)))
    }

    /// **La protection se lit aux DEUX niveaux qui la déclarent.**
    ///
    /// La loi de sortie juge la disparition. Le dépôt déclare une autre
    /// protection sur la PIÈCE JOINTE
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
    /// l'ignore. La vue unique passe déjà par la loi de sortie ; le flou n'avait
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

    /// Chaque refus vaut par sa RAISON, pas par la liste : le lieu parce
    /// qu'`AttachmentKind` le range en `.other` — ce qui tient la garde O13
    /// « jamais `.location` » GRATUITEMENT, sans condition qu'on puisse oublier
    /// de recopier —, les documents parce qu'il n'y a rien à en poser.
    ///
    /// **L'AUDIO a quitté cette liste au #4461**, et c'est un retournement, pas
    /// une suppression : son refus venait de ce que la graine ne savait poser
    /// que des bitmaps et des pistes vidéo. `StoryComposerSeed.audio` a levé ce
    /// refus de TRANSPORT en empruntant le chemin du collage
    /// (`attachPastedAudio`) — le son devient le SON de la scène. Son
    /// acceptation est désormais vérifiée par le témoin ci-dessous.
    func test_composableForm_refusesLocationAndDocuments() {
        for mime in ["application/x-location",
                     "application/pdf", "application/msword", "text/plain",
                     "application/zip", "text/csv", "application/json", ""] {
            XCTAssertNil(ComposableAttachment.form(mimeType: mime), mime)
        }
    }

    /// #4461 — le son est une forme À PART ENTIÈRE, distincte de l'image et de
    /// la vidéo : il ne se pose pas sur le canvas, il devient la piste sonore.
    /// Le distinguer ici est ce qui permet à la porte de le router sans
    /// interroger le mime une seconde fois.
    func test_composableForm_acceptsAudioAsItsOwnForm() {
        XCTAssertEqual(ComposableAttachment.form(mimeType: "audio/m4a"), .audio)
        XCTAssertEqual(ComposableAttachment.form(mimeType: "audio/mpeg"), .audio)
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

    // Le serveur refuse le transfert d'une vue unique et d'une flamme après
    // lecture (`forwardAdmission`) — offrir l'action condamnait l'utilisateur à
    // un échec. Spec 2026-08-19, Volet A.2 ; loi de sortie #9573.
    func test_moreSections_notForwardable_omitsForward() {
        let items = actionItems(MessageActionResolver.moreSections(ctx(hasText: false, hasMedia: true, exits: afterRead)))
        XCTAssertFalse(items.contains(.forward),
                       "Une flamme après lecture n'offre pas un transfert que le serveur refuse")
        XCTAssertEqual(Array(items.prefix(2)), [.reply, .thread])
    }

    /// Une flamme après lecture ne perd QUE ses sorties : répondre, discussion,
    /// épingler, favori, supprimer restent.
    func test_moreSections_afterReadFlame_losesOnlyItsExits() {
        let normal = actionItems(MessageActionResolver.moreSections(ctx(canDelete: true, hasText: true, hasMedia: true)))
        let flame = actionItems(MessageActionResolver.moreSections(ctx(canDelete: true, hasText: true, hasMedia: true, exits: afterRead)))
        XCTAssertEqual(flame, normal.filter { ![MoreItem.forward, .copy, .share, .imager].contains($0) })
    }

    /// Une flamme à durée garde le transfert, et lui seul.
    func test_moreSections_timedFlame_keepsForwardOnly() {
        let normal = actionItems(MessageActionResolver.moreSections(ctx(canDelete: true, hasText: true, hasMedia: true)))
        let flame = actionItems(MessageActionResolver.moreSections(ctx(canDelete: true, hasText: true, hasMedia: true, exits: timedFlame)))
        XCTAssertEqual(flame, normal.filter { ![MoreItem.copy, .share, .imager].contains($0) })
        XCTAssertTrue(flame.contains(.forward))
    }

    // MARK: - Prédicat de transférabilité (projection de la loi de sortie)

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
            ctx(hasText: true, exits: message(isViewOnce: true).exitOffer)
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

// MARK: - La loi de sortie, projetée sur l'application (#9573)

/// **La matrice nature × sortie × surface.** Chaque case a son témoin : ce que
/// `MessageExitOffer` offre, puis ce que chaque surface qui la lit rend — menu
/// d'appui long, feuille « Plus », sélection multiple, feuille de transfert,
/// visionneuses, « Composer », enregistrement automatique.
@MainActor
final class MessageExitOfferTests: XCTestCase {

    private enum Nature: CaseIterable {
        case ordinary, timedFlame, afterReadFlame, viewOnce
    }

    private func photo(_ id: String = "p1", isViewOnce: Bool = false, isBlurred: Bool = false,
                       isEncrypted: Bool = false, effectFlags: UInt32? = nil) -> MessageAttachment {
        MeeshyMessageAttachment(id: id, mimeType: "image/jpeg", fileUrl: "https://cdn.example/\(id).jpg",
                                isViewOnce: isViewOnce, isBlurred: isBlurred, effectFlags: effectFlags,
                                isEncrypted: isEncrypted)
    }

    private func message(_ id: String = "m1", effects: MessageEffects = .none, expiresAt: Date? = nil,
                         attachments: [MessageAttachment] = [], isEncrypted: Bool = false,
                         isMe: Bool = false) -> Message {
        MeeshyMessage(id: id, conversationId: "c1", senderId: "u2", content: "secret",
                      expiresAt: expiresAt, effects: effects, isEncrypted: isEncrypted,
                      attachments: attachments, isMe: isMe)
    }

    private func message(of nature: Nature, id: String = "m1", attachments: [MessageAttachment] = []) -> Message {
        switch nature {
        case .ordinary:
            return message(id, attachments: attachments)
        case .timedFlame:
            return message(id, effects: MessageEffects(flags: .ephemeral, ephemeralDuration: 300), attachments: attachments)
        case .afterReadFlame:
            return message(id, effects: MessageEffects(flags: [.ephemeral, .ephemeralAfterRead]), attachments: attachments)
        case .viewOnce:
            return message(id, effects: MessageEffects(flags: .viewOnce), attachments: attachments)
        }
    }

    private func offered(_ offer: MessageExitOffer) -> Set<MessageExit> {
        Set(MessageExit.allCases.filter(offer.offers))
    }

    // MARK: - La matrice nature × sortie

    func test_matrix_ordinary_offersEveryExit() {
        XCTAssertEqual(offered(message(of: .ordinary).exitOffer), Set(MessageExit.allCases))
    }

    func test_matrix_timedFlame_offersForwardOnly() {
        XCTAssertEqual(offered(message(of: .timedFlame).exitOffer), [.forward])
    }

    func test_matrix_afterReadFlame_offersNothing() {
        XCTAssertEqual(offered(message(of: .afterReadFlame).exitOffer), [])
    }

    func test_matrix_viewOnce_offersNothing() {
        XCTAssertEqual(offered(message(of: .viewOnce).exitOffer), [])
    }

    func test_matrix_theNatureIsTheOneTheLawReads() {
        XCTAssertEqual(message(of: .ordinary).exitOffer.nature, .ordinary)
        XCTAssertEqual(message(of: .timedFlame).exitOffer.nature, .timedFlame)
        XCTAssertEqual(message(of: .afterReadFlame).exitOffer.nature, .afterReadFlame)
        XCTAssertEqual(message(of: .viewOnce).exitOffer.nature, .viewOnce)
    }

    /// Fermé par défaut : un éphémère déclaré sans durée lisible est jugé
    /// « après lecture » — `expiresAt` est l'heure interne de destruction.
    func test_matrix_ephemeralWithoutReadableDuration_offersNothing() {
        XCTAssertEqual(offered(message(effects: MessageEffects(flags: .ephemeral)).exitOffer), [])
        XCTAssertEqual(offered(message(expiresAt: Date().addingTimeInterval(3600)).exitOffer), [])
    }

    /// La copie transférée d'une flamme porte durée ET après lecture : elle ne
    /// se retransfère pas.
    func test_matrix_forwardedCopy_isNotForwardableAgain() {
        let copy = message(effects: MessageEffects(flags: [.ephemeral, .ephemeralAfterRead], ephemeralDuration: 30))
        XCTAssertEqual(offered(copy.exitOffer), [])
    }

    /// La plus restrictive gagne, pièce comprise.
    func test_matrix_theMostRestrictivePieceWins() {
        XCTAssertEqual(offered(message(attachments: [photo(), photo("p2", isViewOnce: true)]).exitOffer), [])
        let afterReadBit = MessageEffectFlags.ephemeralAfterRead.rawValue
        XCTAssertEqual(offered(message(of: .timedFlame, attachments: [photo(effectFlags: afterReadBit)]).exitOffer), [])
    }

    /// Le flou et le chiffrement gardent leurs restrictions, composées avec la loi.
    func test_matrix_blurAndEncryption_composeWithTheLaw() {
        XCTAssertEqual(offered(message(effects: MessageEffects(flags: .blurred)).exitOffer), [],
                       "un message flouté ne laisse rien sortir (#8009)")
        XCTAssertEqual(offered(message(attachments: [photo(isBlurred: true)]).exitOffer), [])
        XCTAssertEqual(offered(message(isEncrypted: true).exitOffer), Set(MessageExit.allCases).subtracting([.publish]),
                       "un message chiffré ne se publie pas")
        XCTAssertEqual(offered(message(attachments: [photo(isEncrypted: true)]).exitOffer),
                       Set(MessageExit.allCases).subtracting([.publish]))
    }

    /// Le verdict de capture voyage tel que la loi le rend (#9574 le consomme).
    func test_capture_followsTheLaw() {
        XCTAssertEqual(message(of: .ordinary).exitOffer.capture, .free)
        for nature in [Nature.timedFlame, .afterReadFlame, .viewOnce] {
            XCTAssertEqual(message(of: nature).exitOffer.capture, .blocked)
        }
    }

    // MARK: - Menu d'appui long et feuille « Plus »

    private func context(_ message: Message) -> MessageMenuContext {
        MessageMenuContext(isMine: false, canEdit: false, canDelete: true, hasText: true, hasMedia: true,
                           hasTimebasedMedia: false, isPinned: false, isStarred: false, isEdited: false,
                           hasEditRevisions: false, saveableAttachmentCount: 1, canComposeMedia: true,
                           exits: message.exitOffer, isViewOnce: message.holdsViewOnce, isBlurred: message.holdsBlur,
                           hasDefaultExportFormat: true, hasPaintableMedia: true)
    }

    private let exitActions: Set<PrimaryAction> = [.copy, .exportImage, .exportQuick, .saveMedia, .compose]
    private let exitItems: Set<MoreItem> = [.forward, .copy, .share, .imager]

    private func primaryExits(_ message: Message) -> Set<PrimaryAction> {
        Set(MessageActionResolver.primaryActions(context(message))).intersection(exitActions)
    }

    private func moreExits(_ message: Message) -> Set<MoreItem> {
        let items = MessageActionResolver.moreSections(context(message)).flatMap { section -> [MoreItem] in
            if case .actions(let items) = section { return items }
            return []
        }
        return Set(items).intersection(exitItems)
    }

    func test_menus_ordinary_renderEveryExit() {
        let ordinary = message(of: .ordinary, attachments: [photo()])
        XCTAssertEqual(primaryExits(ordinary), exitActions)
        XCTAssertEqual(moreExits(ordinary), exitItems)
    }

    func test_menus_timedFlame_renderForwardOnly() {
        let flame = message(of: .timedFlame, attachments: [photo()])
        XCTAssertEqual(primaryExits(flame), [])
        XCTAssertEqual(moreExits(flame), [.forward])
    }

    func test_menus_afterReadFlame_renderNoExit() {
        let flame = message(of: .afterReadFlame, attachments: [photo()])
        XCTAssertEqual(primaryExits(flame), [])
        XCTAssertEqual(moreExits(flame), [])
    }

    func test_menus_viewOnce_renderNoExit() {
        let once = message(of: .viewOnce, attachments: [photo()])
        XCTAssertEqual(primaryExits(once), [])
        XCTAssertEqual(moreExits(once), [])
    }

    /// Ce qui n'est pas une sortie reste : traduire, sélectionner, répondre.
    func test_menus_flame_keepsWhatIsNotAnExit() {
        let flame = message(of: .afterReadFlame, attachments: [photo()])
        let primary = MessageActionResolver.primaryActions(context(flame))
        XCTAssertTrue(primary.contains(.translate))
        XCTAssertTrue(primary.contains(.select))
        XCTAssertEqual(primary.last, .more)
    }

    // MARK: - « Composer » et publication

    func test_compose_isOfferedOnlyOnAnOrdinaryMessage() {
        XCTAssertTrue(ComposableAttachment.offers(message: message(of: .ordinary, attachments: [photo()])))
        for nature in [Nature.timedFlame, .afterReadFlame, .viewOnce] {
            XCTAssertFalse(ComposableAttachment.offers(message: message(of: nature, attachments: [photo()])),
                           "\(nature) : publier ce qui disparaît le ferait sortir de Meeshy")
        }
    }

    // MARK: - Sélection multiple

    func test_selection_offersForward_onlyWhenEveryMessageForwards() {
        let ordinary = message(of: .ordinary, id: "a")
        let timed = message(of: .timedFlame, id: "b")
        XCTAssertTrue(MessageExitOffer.selectionOffersForward([]))
        XCTAssertTrue(MessageExitOffer.selectionOffersForward([ordinary, timed]))
        for nature in [Nature.afterReadFlame, .viewOnce] {
            XCTAssertFalse(MessageExitOffer.selectionOffersForward([ordinary, message(of: nature, id: "c"), timed]),
                           "\(nature) : un seul message non transférable retire l'action")
        }
        XCTAssertFalse(MessageExitOffer.selectionOffersForward([ordinary, message("d", effects: MessageEffects(flags: .blurred))]))
    }

    // MARK: - Feuille de transfert

    func test_forwardSheet_ordinary_hasNoDurationRow_andPublishes() {
        let offer = ForwardSheetOffer(message: message(of: .ordinary))
        XCTAssertTrue(offer.durationChoices.isEmpty)
        XCTAssertNil(offer.selectedDuration(chosen: nil))
        XCTAssertTrue(offer.publishes)
        XCTAssertTrue(offer.imaginesDiscussion)
    }

    func test_forwardSheet_timedFlame_offersTiersUpToTheSource_preselected_andNothingElse() {
        let offer = ForwardSheetOffer(message: message(of: .timedFlame))
        XCTAssertEqual(offer.durationChoices.map(\.seconds), [15, 30, 60, 300])
        XCTAssertEqual(offer.selectedDuration(chosen: nil), 300, "la durée de la source est présélectionnée")
        XCTAssertEqual(offer.selectedDuration(chosen: 30), 30)
        XCTAssertEqual(offer.selectedDuration(chosen: 3600), 300, "un palier au-dessus de la source n'est pas un choix")
        XCTAssertFalse(offer.publishes)
        XCTAssertFalse(offer.imaginesDiscussion)
    }

    func test_forwardSheet_offTierSource_showsItsDurationFirst() {
        let flame = message(effects: MessageEffects(flags: .ephemeral, ephemeralDuration: 45))
        let offer = ForwardSheetOffer(message: flame)
        XCTAssertEqual(offer.durationChoices.map(\.seconds), [45, 15, 30])
        XCTAssertEqual(offer.selectedDuration(chosen: nil), 45)
    }

    func test_forwardSheet_batch_isBoundedByItsLongestFlame() {
        let short = message("a", effects: MessageEffects(flags: .ephemeral, ephemeralDuration: 30))
        let long = message("b", effects: MessageEffects(flags: .ephemeral, ephemeralDuration: 300))
        let offer = ForwardSheetOffer(message: short, additionalMessages: [message(of: .ordinary, id: "c"), long])
        XCTAssertEqual(offer.durationChoices.map(\.seconds), [15, 30, 60, 300])
        XCTAssertFalse(offer.publishes, "le message désigné est une flamme")
    }

    func test_forwardSheet_refusedBatch_hasNoDurationRow() {
        let offer = ForwardSheetOffer(message: message(of: .timedFlame, id: "a"),
                                      additionalMessages: [message(of: .viewOnce, id: "b")])
        XCTAssertFalse(offer.forward.isAllowed)
        XCTAssertTrue(offer.durationChoices.isEmpty)
    }

    func test_durationRow_speaksAWholeDuration() {
        XCTAssertFalse(ForwardDurationRow.spokenDuration(seconds: 30).isEmpty)
        XCTAssertNotEqual(ForwardDurationRow.spokenDuration(seconds: 30), ForwardDurationRow.spokenDuration(seconds: 300))
    }

    // MARK: - Visionneuses

    func test_viewerGate_letsOutOnlyThePiecesOfAMessageThatSaves() {
        let gate = MessageExitOffer.mediaExitGate(for: [
            message(of: .ordinary, id: "a", attachments: [photo("ordinaire")]),
            message(of: .timedFlame, id: "b", attachments: [photo("flamme")]),
            message(of: .afterReadFlame, id: "c", attachments: [photo("apres-lecture")]),
            message(of: .viewOnce, id: "d", attachments: [photo("vue-unique")]),
            message("e", attachments: [photo("floutee", isBlurred: true)]),
        ])
        XCTAssertTrue(gate.mayLeave("ordinaire"))
        for sealed in ["flamme", "apres-lecture", "vue-unique", "floutee", "inconnue"] {
            XCTAssertFalse(gate.mayLeave(sealed), "\(sealed) : ni Enregistrer ni Partager dans la visionneuse")
        }
    }

    func test_messageGate_isOpenOnlyForAMessageThatSaves() {
        XCTAssertEqual(message(of: .ordinary).exitGate, .open)
        for nature in [Nature.timedFlame, .afterReadFlame, .viewOnce] {
            XCTAssertEqual(message(of: nature).exitGate, .sealed)
        }
        XCTAssertEqual(message(effects: MessageEffects(flags: .blurred)).exitGate, .sealed)
    }

    func test_bubbleContent_carriesTheGateOfItsMessage() {
        // Le portillon du modèle de bulle est celui du message : c'est lui que
        // la rangée Focal pose sur ses visionneuses.
        func gate(_ message: Message) -> ContentExitGate {
            BubbleContent(message: message, translations: [], preferredTranslation: nil, currentUserId: "u1").exitGate
        }
        XCTAssertEqual(gate(message(of: .ordinary)), .open)
        XCTAssertEqual(gate(message(of: .timedFlame)), .sealed)
        XCTAssertEqual(gate(message(of: .viewOnce)), .sealed)
    }

    // MARK: - Enregistrement automatique

    func test_autoSave_neverTakesAContentThatDisappears() {
        XCTAssertEqual(ReceivedMediaAutoSavePolicy.eligibleMedia(in: message(of: .ordinary, attachments: [photo()])).map(\.id), ["p1"])
        for nature in [Nature.timedFlame, .afterReadFlame, .viewOnce] {
            XCTAssertTrue(ReceivedMediaAutoSavePolicy.eligibleMedia(in: message(of: nature, attachments: [photo()])).isEmpty,
                          "\(nature) : l'album ne garde pas ce qui disparaît")
        }
    }

    // MARK: - Le geste lui-même : second verrou (#9573)

    private var sealedNatures: [Message] {
        [message(of: .timedFlame, attachments: [photo()]), message(of: .afterReadFlame, attachments: [photo()]),
         message(of: .viewOnce, attachments: [photo()]), message(attachments: [photo(isBlurred: true)])]
    }

    func test_transport_copy_writesNothingForAContentThatMayNotLeave() {
        let pasteboard = UIPasteboard.withUniqueName()
        pasteboard.string = "avant"
        for sealed in sealedNatures {
            XCTAssertFalse(MessageExitTransport.copy("secret", of: sealed, to: pasteboard))
            XCTAssertEqual(pasteboard.string, "avant", "le presse-papiers n'est pas touché")
        }
        XCTAssertTrue(MessageExitTransport.copy("bonjour", of: message(of: .ordinary), to: pasteboard))
        XCTAssertEqual(pasteboard.string, "bonjour")
    }

    func test_transport_save_composesNoRequestForAContentThatMayNotLeave() {
        for sealed in sealedNatures {
            XCTAssertNil(MessageExitTransport.saveRequest(for: sealed))
        }
        let request = MessageExitTransport.saveRequest(for: message(of: .ordinary, attachments: [photo()]))
        XCTAssertEqual(request?.attachmentId, "p1")
        XCTAssertNil(MessageExitTransport.saveRequest(for: message(of: .ordinary)), "sans pièce, rien à enregistrer")
    }

    func test_transport_share_followsTheOffer() {
        XCTAssertTrue(MessageExitTransport.mayShare(message(of: .ordinary)))
        XCTAssertTrue(sealedNatures.allSatisfy { !MessageExitTransport.mayShare($0) })
    }

    private func audioRequest(_ id: String?) -> MediaSaveRequest {
        MediaSaveRequest(kind: .audio, origin: .transmitted, remoteURLString: "https://cdn.example/a.m4a", attachmentId: id)
    }

    /// Le coordinateur d'une visionneuse refuse ce que son portillon retient :
    /// ni feuille de destinations, ni traitement.
    func test_saveCoordinator_underASealedGate_acceptsNoRequest() async {
        let coordinator = MediaSaveCoordinator(exitGate: .sealed)
        coordinator.requestSave(audioRequest("a1"))
        XCTAssertNil(coordinator.pendingRequest)
        coordinator.save(audioRequest("a1"))
        XCTAssertNil(coordinator.pendingRequest)
        await coordinator.pick(.share, request: audioRequest("a1"))
        XCTAssertNil(coordinator.shareURL)
        XCTAssertNil(coordinator.lastOutcome, "rien n'a été tenté, donc rien n'a échoué")
        XCTAssertFalse(coordinator.isProcessing)
    }

    func test_saveCoordinator_underAListedGate_isClosedByDefault() {
        let coordinator = MediaSaveCoordinator(exitGate: .only(["a1"]))
        coordinator.requestSave(audioRequest("a2"))
        XCTAssertNil(coordinator.pendingRequest, "une pièce absente de la liste ne sort pas")
        coordinator.requestSave(audioRequest(nil))
        XCTAssertNil(coordinator.pendingRequest, "une pièce sans identifiant non plus")
        coordinator.requestSave(audioRequest("a1"))
        XCTAssertEqual(coordinator.pendingRequest?.attachmentId, "a1")
    }

    /// `nil` ⇒ FERMÉ : un hôte qui oublie de poser le portillon n'enregistre rien.
    func test_saveCoordinator_withoutAGate_isClosed() async {
        let coordinator = MediaSaveCoordinator()
        XCTAssertFalse(coordinator.mayLeave("a1"))
        coordinator.requestSave(audioRequest("a1"))
        coordinator.save(audioRequest("a1"))
        await coordinator.pick(.share, request: audioRequest("a1"))
        XCTAssertNil(coordinator.pendingRequest)
        XCTAssertNil(coordinator.shareURL)
        XCTAssertNil(coordinator.lastOutcome)
    }

    func test_saveCoordinator_openedByAPublicationHost_serves() {
        let coordinator = MediaSaveCoordinator(exitGate: .open)
        coordinator.requestSave(audioRequest("a1"))
        XCTAssertEqual(coordinator.pendingRequest?.attachmentId, "a1")
    }

    /// Le menu d'un message remet au coordinateur le portillon DE CE MESSAGE :
    /// même resté ouvert par le message précédent, il se referme.
    func test_transport_save_handsTheMessageGateToTheCoordinator() {
        let coordinator = MediaSaveCoordinator(exitGate: .open)
        for sealed in sealedNatures {
            XCTAssertFalse(MessageExitTransport.save(sealed, through: coordinator))
            XCTAssertEqual(coordinator.exitGate, .sealed)
            coordinator.requestSave(audioRequest("p1"))
            XCTAssertNil(coordinator.pendingRequest, "le coordinateur refuse de lui-même")
        }
        let document = MeeshyMessageAttachment(id: "d1", mimeType: "application/pdf", fileUrl: "https://cdn.example/d.pdf")
        XCTAssertTrue(MessageExitTransport.save(message(of: .ordinary, attachments: [document]), through: coordinator))
        XCTAssertEqual(coordinator.exitGate, .open)
        XCTAssertEqual(coordinator.pendingRequest?.attachmentId, "d1", "un document ouvre la feuille de destinations")
    }

    /// Le plein écran d'un média : la pièce d'une flamme, d'une flamme après
    /// lecture, d'une vue unique, et la pièce CITÉE par un message ordinaire —
    /// présente ou non dans la fenêtre — n'ont ni sortie offerte ni exécutable.
    func test_fullscreen_noExitOfferedNorExecutable_forProtectedOrQuotedPieces() {
        let quotedFlame = message(of: .timedFlame, id: "q", attachments: [photo("citee")])
        var citing = message(of: .ordinary, id: "r", attachments: [photo("propre")])
        citing.replyTo = ReplyReference(messageId: "q", authorName: "Awa", previewText: "📷", attachmentId: "citee")
        let carriers = [message(of: .timedFlame, id: "a", attachments: [photo("flamme")]),
                        message(of: .afterReadFlame, id: "b", attachments: [photo("apres-lecture")]),
                        message(of: .viewOnce, id: "c", attachments: [photo("vue-unique")]),
                        quotedFlame, citing]
        for gate in [MessageExitOffer.mediaExitGate(for: carriers),
                     MessageExitOffer.mediaExitGate(for: [citing])] {
            let coordinator = MediaSaveCoordinator(exitGate: gate)
            for piece in ["flamme", "apres-lecture", "vue-unique", "citee"] {
                XCTAssertFalse(gate.mayLeave(piece), "\(piece) : aucun bouton")
                XCTAssertFalse(gate.perform(piece) { XCTFail("\(piece) : le geste s'est exécuté") })
                coordinator.requestSave(MediaSaveRequest(kind: .audio, origin: .transmitted, remoteURLString: "https://x/\(piece)", attachmentId: piece))
                XCTAssertNil(coordinator.pendingRequest, "\(piece) : le coordinateur refuse")
            }
            XCTAssertTrue(gate.mayLeave("propre"), "la pièce propre du message citant, ordinaire, sort")
        }
    }

    // MARK: - Chaque surface passe par un verrou (gardes de source)

    private func source(_ relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Components
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main")
        let code = AppSourceGuard.stripComments(
            try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
        )
        XCTAssertGreaterThan(code.count, 200, "\(relativePath) introuvable — ce témoin ne mesurerait rien")
        return code.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// Aucun site de conversation n'écrit dans le presse-papiers ni ne compose
    /// une requête d'enregistrement lui-même : tous passent par le transport.
    func test_conversationSurfaces_neverExitWithoutTheTransport() throws {
        for path in ["Views/ConversationView.swift", "Views/ConversationView+MessageRow.swift",
                     "Views/ConversationView+NativeMessageMenu.swift", "Components/MessageOverlayMenu.swift",
                     "Components/MessageMoreSheet.swift"] {
            let code = try source(path)
            XCTAssertFalse(code.contains("UIPasteboard.general.string="), "\(path) : la copie passe par MessageExitTransport.copy")
            XCTAssertFalse(code.contains("mediaSaveCoordinator.save("),
                           "\(path) : l'enregistrement passe par MessageExitTransport.save")
        }
        let host = try source("Views/ConversationView.swift")
        XCTAssertEqual(host.components(separatedBy: "MessageExitTransport.copy(").count - 1, 2)
        XCTAssertEqual(host.components(separatedBy: "MessageExitTransport.save(msg,through:mediaSaveCoordinator)").count - 1, 2)
        XCTAssertTrue(host.contains("onShare:{ifMessageExitTransport.mayShare(msg){overlayState.shareMessage=msg}}"))
    }

    func test_river_copyIsGuardedInTheGestureToo() throws {
        let code = try source("Riviere/View/RiverBubbleView.swift")
        XCTAssertTrue(code.contains("ifcontent.viewOnceChip==nil,content.offersCopy{Button{ifcontent.offersCopy{UIPasteboard.general.string=content.text}}"))
        XCTAssertEqual(code.components(separatedBy: "UIPasteboard").count - 1, 1)
    }

    func test_gallery_bothTransportsAskTheGate_andTheMenuHandsItToTheCoordinator() throws {
        let code = try source("Views/ConversationMediaGalleryView+Menu.swift")
        XCTAssertTrue(code.contains("funcrequestSaveCurrent(){guardletsubject=currentSaveSubject,saveCoordinator.mayLeave(currentExitContentId)else{return}"))
        XCTAssertTrue(code.contains("funcshareCurrentOutsideMeeshy(){guardletrequest=currentSaveRequest,saveCoordinator.mayLeave(currentExitContentId)else{return}"))
        XCTAssertTrue(code.contains("GalleryExitGatedMenu(contentId:currentExitContentId,coordinator:saveCoordinator)"))
        XCTAssertTrue(code.contains(".onAppear{coordinator.exitGate=exitGate}"))
        XCTAssertTrue(code.contains("ifletcontentId,exitGate.mayLeave(contentId){menu()}"))
    }

    func test_audioFullscreen_saveIsGatedInButtonAndGesture() throws {
        let code = try source("Views/AudioFullscreenView.swift")
        XCTAssertTrue(code.contains("ContentExitGated(contentId:attachment.id){downloadButton}"))
        XCTAssertTrue(code.contains("privatefuncrequestSave(){saveCoordinator.exitGate=exitGateguardexitGate.mayLeave(attachment.id)else{return}"))
        XCTAssertEqual(code.components(separatedBy: "saveCoordinator.requestSave(").count - 1, 1)
    }

    func test_bubbleFullscreen_saveIsGatedInTheGesture() throws {
        let code = try source("Components/MediaSaveFlowHost.swift")
        XCTAssertTrue(code.contains("privatefuncrequestSave(){saveCoordinator.exitGate=exitGateguardexitGate.mayLeave(attachment.id)else{return}"))
    }

    /// **Aucun `.open` n'est posé en dur sur un site de conversation.** Les
    /// seuls portillons ouverts du dépôt sont ceux d'un contenu qui n'est pas
    /// un contenu de conversation, chacun justifié par son site ; tout nouveau
    /// site rougit ici et doit dire pourquoi.
    func test_everyOpenGate_isAPublicationOrAPreSendPreview() throws {
        let legitimate: [String: Int] = [
            "Views/SocialMediaGalleryPresentation.swift": 1,   // pièces d'une publication
            "Views/CommentMediaView.swift": 1,                 // pièce d'un commentaire
            "Views/AudioFullscreenView.swift": 1,              // `audioFullscreenCover` : son de publication
        ]
        let coordinators: [String: Int] = [
            "Views/PostDetailView.swift": 1, "Views/ReelFeedCard.swift": 1,
            "Views/ReelsPlayerView.swift": 1, "Views/FeedPostCard.swift": 1,
        ]
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
        let files = (FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)?
            .compactMap { $0 as? URL } ?? []).filter { $0.pathExtension == "swift" }
        XCTAssertGreaterThan(files.count, 500, "l'arbre de l'application est introuvable — ce témoin ne mesurerait rien")
        var gates: [String: Int] = [:]
        var openCoordinators: [String: Int] = [:]
        let prefix = root.appendingPathComponent("Features/Main").path + "/"
        for file in files {
            let code = AppSourceGuard.stripComments(try String(contentsOf: file, encoding: .utf8))
                .components(separatedBy: .whitespacesAndNewlines).joined()
            let name = file.path.replacingOccurrences(of: prefix, with: "")
            let posed = code.components(separatedBy: "contentExitGate(.open)").count - 1
                + code.components(separatedBy: "contentExitGate(ContentExitGate.open)").count - 1
            if posed > 0 { gates[name] = posed }
            let opened = code.components(separatedBy: "MediaSaveCoordinator(exitGate:.open").count - 1
            if opened > 0 { openCoordinators[name] = opened }
            XCTAssertFalse(code.contains("exitGate=.open"), "\(name) : un portillon ne se rouvre pas par affectation")
        }
        XCTAssertEqual(gates, legitimate)
        XCTAssertEqual(openCoordinators, coordinators)
        // L'aperçu AVANT envoi : le seul portillon ouvert de l'écran de
        // conversation, nommé par son type et réservé au média du composeur.
        let host = try source("Views/ConversationView.swift")
        XCTAssertEqual(host.components(separatedBy: "ComposerPreviewExit.gate").count - 1, 1)
        XCTAssertTrue(host.contains(".conversationCover(item:$composerState.previewMedia)"))
        XCTAssertTrue(host.contains("ImageFullscreen(imageUrl:media.url,accentColor:accentColor).contentExitGate(ComposerPreviewExit.gate)"))
    }

    /// Le portillon est fermé par défaut : chaque hôte de conversation pose
    /// celui de son porteur, et seuls les hôtes de PUBLICATION ouvrent.
    func test_hosts_poseTheGateOfTheirCarrier() throws {
        XCTAssertTrue(try source("Views/ThemedMessageBubble.swift").contains(".contentExitGate(message.exitGate)"))
        XCTAssertTrue(try source("Focal/Row/FocalRow.swift").contains(".contentExitGate(content.exitGate)"))
        XCTAssertTrue(try source("Views/ConversationView+MediaGallery.swift").contains(".contentExitGate(mediaExitGate)"))
        XCTAssertTrue(try source("Views/ConversationMediaViews.swift").contains(".mediaExitGate(carriers:allAudioItems.map(\\.message))"))
        let hub = try source("Components/MediaHub/ConversationMediaHubView.swift")
        XCTAssertTrue(hub.contains(".contentExitGate(model.carrier(item.messageId)?.exitGate??.sealed)"))
        XCTAssertFalse(hub.contains(".contentExitGate(.open)"))
        for conversationHost in ["Views/ThemedMessageBubble.swift", "Focal/Row/FocalRow.swift",
                                 "Views/ConversationView+MediaGallery.swift", "Views/ConversationMediaViews.swift"] {
            XCTAssertFalse(try source(conversationHost).contains(".contentExitGate(.open)"),
                           "\(conversationHost) : un hôte de conversation n'ouvre jamais d'office")
        }
    }

    // MARK: - Rivière

    func test_river_copyFollowsTheOffer() {
        XCTAssertTrue(message(of: .ordinary).exitOffer.offers(.copy))
        XCTAssertFalse(message(of: .timedFlame).exitOffer.offers(.copy))
    }
}
