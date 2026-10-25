import XCTest
@testable import Meeshy

/// **Un message vidéo lourd TUAIT l'extension de notification, en silence**
/// (audit iOS du 2026-09-18, issue #7003).
///
/// `NotificationService.downloadData` téléchargeait le média par
/// `URLSession.dataTask` — tout le corps en mémoire, sans plafond — pendant que
/// le gateway posait `firstAttachmentUrl` pour TOUT type de pièce jointe,
/// `video/*` compris. Une NSE dispose d'environ 24 Mo : un message vidéo de
/// 40 Mo la faisait dépasser, iOS la tuait par jetsam.
///
/// > **Un jetsam n'est pas un crash.** Aucun rapport, aucune trace, aucune
/// > alerte : l'utilisateur voit une bannière sans enrichissement, exactement
/// > ce qu'il verrait sur un réseau lent. C'est ce qui a laissé ce défaut vivre
/// > en production sans que rien ne le signale.
final class NSEAttachmentPolicyTests: XCTestCase {

    // MARK: - La règle

    func test_uneImageLegere_estAttachable() {
        XCTAssertTrue(NSEAttachmentPolicy.mayAttach(mimeType: "image/jpeg", fileSize: 240_000))
    }

    func test_unVocal_estAttachable() {
        XCTAssertTrue(NSEAttachmentPolicy.mayAttach(mimeType: "audio/mp4", fileSize: 120_000))
    }

    /// Le cas MESURÉ : le gateway sert `video/mp4` dès qu'un média peut voyager,
    /// et `fileHints` l'accepte. C'est celui qui tuait l'extension.
    func test_uneVideo_estRefusee_quelleQueSoitSaTaille() {
        XCTAssertFalse(NSEAttachmentPolicy.mayAttach(mimeType: "video/mp4", fileSize: 40_000_000))
        XCTAssertFalse(NSEAttachmentPolicy.mayAttach(mimeType: "video/mp4", fileSize: 300_000))
        XCTAssertFalse(NSEAttachmentPolicy.mayAttach(mimeType: "video/quicktime", fileSize: nil))
    }

    func test_unDocument_estRefuse() {
        XCTAssertFalse(NSEAttachmentPolicy.mayAttach(mimeType: "application/pdf", fileSize: 10_000))
        XCTAssertFalse(NSEAttachmentPolicy.mayAttach(mimeType: "text/csv", fileSize: 200))
        XCTAssertFalse(NSEAttachmentPolicy.mayAttach(mimeType: "", fileSize: 200))
    }

    /// Une image de 12 Mo est parfaitement ordinaire depuis un appareil photo
    /// moderne, et elle n'a rien à faire dans l'enveloppe de la NSE.
    func test_uneImageAuDelaDuPlafond_estRefusee() {
        XCTAssertFalse(NSEAttachmentPolicy.mayAttach(
            mimeType: "image/heic", fileSize: NSEAttachmentPolicy.maxAttachmentBytes + 1))
        XCTAssertTrue(NSEAttachmentPolicy.mayAttach(
            mimeType: "image/heic", fileSize: NSEAttachmentPolicy.maxAttachmentBytes))
    }

    func test_unePlafondALaHauteurDeLEnveloppe() {
        XCTAssertEqual(NSEAttachmentPolicy.maxAttachmentBytes, 8 * 1024 * 1024)
        XCTAssertLessThan(NSEAttachmentPolicy.maxAttachmentBytes, 24 * 1024 * 1024 / 2,
                          "Le plafond doit laisser de la place aux téléchargements CONCURRENTS.")
    }

    /// **Une taille ABSENTE ouvre le pré-vol, elle ne le ferme pas.** Un
    /// gateway plus ancien que l'app ne pose pas encore le champ ; refuser ici
    /// priverait toute une flotte de rich-push pour une information manquante.
    /// C'est l'étage d'APRÈS-VOL, sur la taille MESURÉE du fichier descendu sur
    /// DISQUE, qui tient le plafond dans ce cas.
    func test_uneTailleAbsente_laisseLaFamilleDecider() {
        XCTAssertTrue(NSEAttachmentPolicy.mayAttach(mimeType: "image/png", fileSize: nil))
        XCTAssertTrue(NSEAttachmentPolicy.mayAttach(mimeType: "audio/mpeg", fileSize: nil))
        XCTAssertFalse(NSEAttachmentPolicy.mayAttach(mimeType: "application/zip", fileSize: nil))
    }

    /// Une taille NULLE ou négative n'est pas une taille : c'est un champ mal
    /// rempli, et il ne doit pas valoir « attachement autorisé » par défaut.
    func test_uneTailleNulleOuNegative_estRefusee() {
        XCTAssertFalse(NSEAttachmentPolicy.mayAttach(mimeType: "image/jpeg", fileSize: 0))
        XCTAssertFalse(NSEAttachmentPolicy.mayAttach(mimeType: "image/jpeg", fileSize: -1))
    }

    /// Ce qui arrive ici vient d'une charge RÉSEAU, pas d'une constante du
    /// dépôt : casse quelconque et paramètres de type doivent passer.
    func test_leMimeEstLuTelQuIlArriveDuReseau() {
        XCTAssertTrue(NSEAttachmentPolicy.isRenderableFamily("Audio/MP4; codecs=mp4a.40.2"))
        XCTAssertTrue(NSEAttachmentPolicy.isRenderableFamily("  IMAGE/JPEG  "))
        XCTAssertFalse(NSEAttachmentPolicy.isRenderableFamily("videoimage/mp4"))
    }

    // MARK: - #11328 — la NSE n'attache que ce qu'elle sait décoder

    /// **Le serveur fabrique des rendus AVIF** (#11262). Un AVIF qu'on
    /// attacherait sans le décoder ne produit aucune image sur l'écran
    /// verrouillé : la notification part sans enrichissement, sans rien dire.
    func test_unAvif_estRefuse_quelleQueSoitSaTailleOuSaFacon() {
        XCTAssertFalse(NSEAttachmentPolicy.mayAttach(mimeType: "image/avif", fileSize: 240_000))
        XCTAssertFalse(NSEAttachmentPolicy.mayAttach(mimeType: "image/avif", fileSize: nil))
        XCTAssertFalse(NSEAttachmentPolicy.mayAttach(mimeType: "IMAGE/AVIF; charset=binary", fileSize: 240_000))
    }

    /// Une image que la NSE ne sait pas ouvrir n'a rien à faire dans
    /// l'enveloppe : la liste blanche refuse ce qu'elle ne nomme pas.
    func test_unFormatImageQueLaNSENeSaitPasDecoder_estRefuse() {
        XCTAssertFalse(NSEAttachmentPolicy.mayAttach(mimeType: "image/svg+xml", fileSize: 4_000))
        XCTAssertFalse(NSEAttachmentPolicy.mayAttach(mimeType: "image/bmp", fileSize: 240_000))
        XCTAssertFalse(NSEAttachmentPolicy.mayAttach(mimeType: "image/tiff", fileSize: nil))
    }

    /// Les formats que la NSE décode restent attachables, casse et paramètres
    /// de type compris : la liste blanche ne doit pas casser ce qui marche.
    func test_lesFormatsImageQueLaNSEDecode_sontAcceptes() {
        for mimeType in ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"] {
            XCTAssertTrue(NSEAttachmentPolicy.mayAttach(mimeType: mimeType, fileSize: 240_000), mimeType)
        }
        XCTAssertTrue(NSEAttachmentPolicy.mayAttach(mimeType: "Image/WebP; codecs=vp8", fileSize: nil))
    }

    /// Le serveur ACCEPTE `image/jpg` et le range tel quel (il n'est pas dans
    /// les formats qu'il convertit), et les pièces jointes `image/heif`
    /// antérieures à la conversion (#11263) sont toujours en base : la liste
    /// blanche ne doit pas retirer l'aperçu d'une photo que la NSE décode.
    func test_lesAliasDeFormatsDecodes_restentAttachables() {
        XCTAssertTrue(NSEAttachmentPolicy.mayAttach(mimeType: "image/jpg", fileSize: 240_000))
        XCTAssertTrue(NSEAttachmentPolicy.mayAttach(mimeType: "IMAGE/HEIF", fileSize: nil))
    }

    // MARK: - La taille telle qu'elle voyage

    /// Le gateway sérialise les nombres de sa charge `data` en CHAÎNES (cf.
    /// `attachmentDurationMs`). Les deux formes se lisent, à un seul endroit.
    func test_laTailleSeLitEnChaineCommeEnNombre() {
        XCTAssertEqual(NSEAttachmentPolicy.declaredFileSize("240000"), 240_000)
        XCTAssertEqual(NSEAttachmentPolicy.declaredFileSize(240_000), 240_000)
        XCTAssertEqual(NSEAttachmentPolicy.declaredFileSize(" 240000 "), 240_000)
    }

    /// Le gateway pose `''` quand le média est protégé ou la taille inconnue —
    /// et une chaîne vide n'est pas un zéro.
    func test_uneTailleAbsenteOuIllisible_rendNil() {
        XCTAssertNil(NSEAttachmentPolicy.declaredFileSize(nil))
        XCTAssertNil(NSEAttachmentPolicy.declaredFileSize(""))
        XCTAssertNil(NSEAttachmentPolicy.declaredFileSize("   "))
        XCTAssertNil(NSEAttachmentPolicy.declaredFileSize("gros"))
    }

    // MARK: - Le CÂBLAGE, faute de pouvoir recevoir un push en test

    /// `NotificationService.swift` ET ce qui en est sorti (`NSEEnrichmentPlan.swift` et
    /// `NotificationService+Enrichment.swift`, LOT-03 ; `NSEMessagePrePersister.swift`,
    /// #10988), dans cet ordre : un interdit lu sur le seul fichier principal ne verrait
    /// pas le code déplacé. `NSEDataSync.swift` reste hors de la lecture — ses `dataTask`
    /// sont des lectures JSON, pas des corps de pièce jointe.
    private func nseSource() throws -> String {
        let folder = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("MeeshyNotificationExtension")
        return try [
            "NotificationService.swift",
            "NSEEnrichmentPlan.swift",
            "NotificationService+Enrichment.swift",
            "NSEMessagePrePersister.swift",
        ]
            .map { try String(contentsOf: folder.appendingPathComponent($0), encoding: .utf8) }
            .joined(separator: "\n")
    }

    /// **Plus aucun corps de réponse ne transite par la mémoire.** C'est le
    /// correctif de FOND : `downloadTask` écrit sur disque, et un fichier de
    /// 40 Mo posé sur disque ne fait pas dépasser une enveloppe de 24 Mo.
    func test_aucunTelechargementNeGardeLeCorpsEnMemoire() throws {
        let source = try nseSource()
        XCTAssertFalse(source.contains("dataTask(with:"),
                       "Un `dataTask` ramène tout le corps en mémoire — l'enveloppe de la NSE "
                       + "est d'environ 24 Mo, et les téléchargements y sont CONCURRENTS.")
        XCTAssertTrue(source.contains("download(for:"),
                      "Le téléchargement doit écrire sur DISQUE (`URLSession.download(for:)`).")
    }

    /// **La loi précède la requête, et elle la précède DANS la branche du
    /// média.** Une garde posée ailleurs laisserait exactement le chemin qui
    /// tuait l'extension.
    func test_leTelechargementDuMedia_estPrecedeDeLaLoi() throws {
        let source = try nseSource()
        XCTAssertTrue(source.contains("NSEAttachmentPolicy.mayAttach"),
                      "La NSE doit demander à la loi avant de descendre un média.")
        guard let debut = source.range(of: "userInfo[\"attachmentUrl\"]"),
              let fin = source.range(of: "downloadFile(from: source.url",
                                     range: debut.upperBound..<source.endIndex) else {
            return XCTFail("La branche du média du message a changé de forme.")
        }
        let corps = String(source[debut.upperBound..<fin.lowerBound])
        XCTAssertTrue(corps.contains("NSEAttachmentPolicy.mayAttach"),
                      "La loi doit être consultée AVANT la requête, dans cette branche même.")
        XCTAssertTrue(corps.contains("attachmentFileSize"),
                      "La taille posée sur le fil doit être LUE — elle y était déjà ignorée.")
    }

    /// **Le second étage existe.** Un serveur n'est pas tenu par ce qu'il
    /// annonce : la taille MESURÉE du fichier descendu est repassée à la même
    /// loi avant tout attachement.
    func test_laTailleMesuree_estRepasseeALaLoi() throws {
        let source = try nseSource()
        let consultations = source.components(separatedBy: "NSEAttachmentPolicy.mayAttach").count - 1
        XCTAssertGreaterThanOrEqual(consultations, 2,
            "Deux étages attendus : pré-vol sur la taille DÉCLARÉE, après-vol sur la taille MESURÉE.")
    }

    // MARK: - Aucun média sous une protection

    /// **Le second verrou.** Le serveur ne pose déjà plus d'URL de média pour
    /// un message protégé (`mediaMayTravel`, cycle 125) — mais un champ de
    /// service qui DÉCLARE une restriction ne la fait pas respecter, et c'est
    /// l'hôte qui rend. Une photo à vue unique s'est affichée ENTIÈRE sur un
    /// écran verrouillé sous une bannière qui disait « 👁️ 🖼️ ».
    func test_declaresProtection_reconnaîtLesDeuxDéclarations() {
        XCTAssertTrue(NSEAttachmentPolicy.declaresProtection(userInfo: ["effectFlags": "4"]))   // viewOnce
        XCTAssertTrue(NSEAttachmentPolicy.declaresProtection(userInfo: ["effectFlags": "2"]))   // blurred
        XCTAssertTrue(NSEAttachmentPolicy.declaresProtection(userInfo: ["effectFlags": "1"]))   // ephemeral
        XCTAssertTrue(NSEAttachmentPolicy.declaresProtection(
            userInfo: ["notificationLocKey": "notification.view_once_message"]
        ))
    }

    /// Un effet purement VISUEL (arc-en-ciel, bit 18) n'est pas une
    /// protection : le confondre priverait de vignette un message ordinaire.
    func test_declaresProtection_ignoreLesEffetsQuiNeProtègentRien() {
        XCTAssertFalse(NSEAttachmentPolicy.declaresProtection(userInfo: [:]))
        XCTAssertFalse(NSEAttachmentPolicy.declaresProtection(userInfo: ["effectFlags": "0"]))
        XCTAssertFalse(NSEAttachmentPolicy.declaresProtection(userInfo: ["effectFlags": "\(1 << 18)"]))
        XCTAssertFalse(NSEAttachmentPolicy.declaresProtection(userInfo: ["notificationLocKey": "  "]))
    }

    /// **Le verrou est CONSULTÉ, pas seulement écrit.** Une loi pure que le
    /// site d'appel n'interroge pas est une loi qui ne protège rien — c'est la
    /// même raison qui a fait naître les deux gardes de câblage ci-dessus.
    func test_leVerrouDeProtection_estConsulteAvantLaRequete() throws {
        let source = try nseSource()
        XCTAssertTrue(source.contains("NSEAttachmentPolicy.declaresProtection"),
                      "La branche du média du message doit refuser un message protégé.")
    }

    // MARK: - #11387 — une conversation verrouillée par PIN ne livre rien

    /// Le verrou PIN protège le CONTENU (décision porteur 2026-10-24) : la
    /// notification d'une conversation verrouillée DÉCLARE une protection, et
    /// tous les seconds verrous (média, détail, vignette, lecteur audio) la
    /// lisent sans qu'aucun n'ait à connaître le PIN.
    func test_lockedConversation_declaresProtection_andKeepsTheRoutingKeys() {
        let payload: [AnyHashable: Any] = [
            "conversationId": "c1", "messageId": "m1",
            "attachmentUrl": "https://cdn/x.jpg", "attachmentMimeType": "image/jpeg",
        ]
        let sealed = NSEAttachmentPolicy.sealingLockedConversation(payload, isLocked: true)

        XCTAssertTrue(NSEAttachmentPolicy.declaresProtection(userInfo: sealed))
        XCTAssertEqual(sealed["notificationLocKey"] as? String, NSEAttachmentPolicy.lockedConversationLocKey)
        XCTAssertEqual(sealed["conversationId"] as? String, "c1", "le toucher route toujours vers la conversation (et son PIN)")
        XCTAssertEqual(sealed["messageId"] as? String, "m1")
    }

    func test_unlockedConversation_payloadIsUntouched() {
        let payload: [AnyHashable: Any] = ["conversationId": "c1", "attachmentMimeType": "image/jpeg"]
        let served = NSEAttachmentPolicy.sealingLockedConversation(payload, isLocked: false)

        XCTAssertFalse(NSEAttachmentPolicy.declaresProtection(userInfo: served))
        XCTAssertNil(served["notificationLocKey"])
    }

    // MARK: - #11387 — le verrou se lit au MIROIR complet, pas à la liste chargée

    /// Une conversation verrouillée HORS de la liste publiée (au-delà des 100
    /// premières) n'a pas de cliché : seul le miroir la dit verrouillée.
    func test_isContentLocked_aConversationAbsentFromTheSnapshot_isLockedByTheMirror() {
        XCTAssertTrue(NSEAttachmentPolicy.isContentLocked(
            conversationId: "coffre", mirroredLockedIds: ["coffre"], mirrorDomainReadable: true, snapshotDeclaresLock: false
        ))
    }

    func test_isContentLocked_neitherMirrorNorSnapshot_isOpen() {
        XCTAssertFalse(NSEAttachmentPolicy.isContentLocked(
            conversationId: "c1", mirroredLockedIds: ["autre"], mirrorDomainReadable: true, snapshotDeclaresLock: false
        ))
        XCTAssertFalse(NSEAttachmentPolicy.isContentLocked(
            conversationId: "c1", mirroredLockedIds: nil, mirrorDomainReadable: true, snapshotDeclaresLock: false
        ))
        XCTAssertFalse(NSEAttachmentPolicy.isContentLocked(
            conversationId: nil, mirroredLockedIds: ["c1"], mirrorDomainReadable: true, snapshotDeclaresLock: true
        ))
    }

    func test_isContentLocked_theSnapshotFlagStillLocks() {
        XCTAssertTrue(NSEAttachmentPolicy.isContentLocked(
            conversationId: "c1", mirroredLockedIds: nil, mirrorDomainReadable: false, snapshotDeclaresLock: true
        ))
    }

    func test_mirrorLockedConversationIds_writesTheFullSet_andAnEmptySetSaysNoLock() throws {
        let suite = "nse-lock-mirror-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }

        NSEAttachmentPolicy.mirrorLockedConversationIds(["b", "a"], into: defaults)
        XCTAssertEqual(defaults.stringArray(forKey: NSEAttachmentPolicy.lockedConversationIdsKey), ["a", "b"])

        NSEAttachmentPolicy.mirrorLockedConversationIds([], into: defaults)
        XCTAssertEqual(
            defaults.stringArray(forKey: NSEAttachmentPolicy.lockedConversationIdsKey), [],
            "un jeu vide est un SAVOIR (aucun verrou), pas une absence (#12655)"
        )
    }

    // MARK: - #11387 — l'ordre de préparation d'une bannière

    /// Scellée AVANT toute décision (catégorie, préférences, média) : sinon la
    /// catégorie et l'enrichissement liraient une charge non protégée.
    func test_plan_lockedConversation_sealsBeforeEveryDecision() {
        let plan = NSEPreparationStep.plan(isLockedConversation: true)
        XCTAssertEqual(plan.first, .sealLockedConversation)
    }

    /// Le corps est remplacé EN DERNIER : aucune réécriture (déchiffrement,
    /// repli audio, détail, échéance) ne remet du contenu sous le verrou.
    func test_plan_lockedConversation_replacesTheBodyAfterEveryRewrite() throws {
        let plan = NSEPreparationStep.plan(isLockedConversation: true)
        XCTAssertEqual(plan.last, .replaceBodyWithLockLabel)
        let replace = try XCTUnwrap(plan.firstIndex(of: .replaceBodyWithLockLabel))
        for rewrite in [NSEPreparationStep.rewriteBody, .applyEphemeralDeadline] {
            let index = try XCTUnwrap(plan.firstIndex(of: rewrite), "\(rewrite) reste au plan")
            XCTAssertLessThan(index, replace, "\(rewrite) avant le scellé du corps")
        }
    }

    /// « Aucun préchargement ne met en cache les messages d'une conversation
    /// verrouillée » (décision porteur 2026-10-24) : l'extension ne télécharge
    /// ni ne pré-enregistre le message.
    func test_plan_lockedConversation_stagesNothingOfTheMessage() {
        let plan = NSEPreparationStep.plan(isLockedConversation: true)
        XCTAssertFalse(plan.contains(.syncMessage))
        XCTAssertFalse(plan.contains(.prePersistMessage))
    }

    func test_plan_openConversation_isTheHistoricalPipeline() {
        XCTAssertEqual(NSEPreparationStep.plan(isLockedConversation: false), [
            .applyCategory, .applyBadge, .applyThreading, .applyPreferences, .updateUnreadCount,
            .syncMessage, .prefetchSocial, .prePersistMessage,
            .postDeliveryReceipt, .rewriteBody, .applyEphemeralDeadline, .sweepExpiredBanners,
        ])
    }

    /// L'extension EXÉCUTE le plan — jamais une séquence recopiée à la main
    /// qui pourrait s'en écarter — et lit le verrou au miroir complet.
    func test_extension_executesThePlan_andReadsTheMirror() throws {
        let source = try nseSource()
        XCTAssertTrue(source.contains("NSEPreparationStep.plan(isLockedConversation:"))
        XCTAssertTrue(source.contains("NSEAttachmentPolicy.lockedConversationIdsKey"))
        XCTAssertTrue(source.contains("NSEAttachmentPolicy.conversationLock("))
    }

    // MARK: - #12655 — une conversation sous PIN n'accepte aucune action depuis l'écran verrouillé

    private let conversationCategories = [
        "MEESHY_MESSAGE", "MEESHY_MENTION", "MEESHY_AUDIO", "MEESHY_EPHEMERAL",
        "MEESHY_LOCATION", "MEESHY_CONTACT", "MEESHY_INVITE",
    ]

    func test_conversationLock_distinguishesOpenLockedAndUnknown() {
        XCTAssertEqual(NSEAttachmentPolicy.conversationLock(
            conversationId: "c1", mirroredLockedIds: ["c1"], mirrorDomainReadable: true, snapshotDeclaresLock: false
        ), .locked)
        XCTAssertEqual(NSEAttachmentPolicy.conversationLock(
            conversationId: "c1", mirroredLockedIds: [], mirrorDomainReadable: true, snapshotDeclaresLock: false
        ), .open)
        XCTAssertEqual(NSEAttachmentPolicy.conversationLock(
            conversationId: "c1", mirroredLockedIds: nil, mirrorDomainReadable: false, snapshotDeclaresLock: false
        ), .unknown, "un domaine illisible ne dit pas « ouverte »")
        XCTAssertEqual(NSEAttachmentPolicy.conversationLock(
            conversationId: "c1", mirroredLockedIds: nil, mirrorDomainReadable: false, snapshotDeclaresLock: true
        ), .locked)
        XCTAssertEqual(NSEAttachmentPolicy.conversationLock(
            conversationId: nil, mirroredLockedIds: nil, mirrorDomainReadable: false, snapshotDeclaresLock: false
        ), .noConversation)
    }

    // MARK: - #12655, transition #9223 — la clé absente d'une version antérieure

    /// L'ancienne version RETIRAIT `locked_conversation_ids` faute de verrou.
    /// Après la mise à jour, avant le premier lancement de la nouvelle, un
    /// domaine LISIBLE sans cette clé dit « aucun verrou » : un utilisateur
    /// sans PIN garde Répondre et Marquer comme lu.
    func test_aMirrorNeverWrittenByTheOldVersion_inAReadableDomain_keepsTheMessageCategory() {
        let lock = NSEAttachmentPolicy.conversationLock(
            conversationId: "c1", mirroredLockedIds: nil, mirrorDomainReadable: true, snapshotDeclaresLock: false
        )
        let payload: [AnyHashable: Any] = ["type": "new_message", "conversationId": "c1"]

        XCTAssertEqual(lock, .open)
        XCTAssertEqual(NSEAttachmentPolicy.category("MEESHY_MESSAGE", under: lock, userInfo: payload), "MEESHY_MESSAGE")
    }

    func test_anUnreadableDomain_withoutTheMirror_isUnknown_andLosesItsActions() {
        let lock = NSEAttachmentPolicy.conversationLock(
            conversationId: "c1", mirroredLockedIds: nil, mirrorDomainReadable: false, snapshotDeclaresLock: false
        )

        XCTAssertEqual(lock, .unknown)
        XCTAssertEqual(
            NSEAttachmentPolicy.category("MEESHY_MESSAGE", under: lock, userInfo: ["conversationId": "c1"]),
            NSEAttachmentPolicy.lockedConversationCategory
        )
    }

    func test_isAppGroupDomainReadable_opensTheDomainFile() throws {
        let container = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: container) }
        let preferences = container.appendingPathComponent("Library/Preferences", isDirectory: true)
        try FileManager.default.createDirectory(at: preferences, withIntermediateDirectories: true)

        XCTAssertFalse(NSEAttachmentPolicy.isAppGroupDomainReadable(containerURL: container, suiteName: "group.test"),
                       "aucun domaine écrit : l'extension ne sait pas")
        try Data("<plist/>".utf8).write(to: preferences.appendingPathComponent("group.test.plist"))
        XCTAssertTrue(NSEAttachmentPolicy.isAppGroupDomainReadable(containerURL: container, suiteName: "group.test"))
        XCTAssertFalse(NSEAttachmentPolicy.isAppGroupDomainReadable(containerURL: nil, suiteName: "group.test"))
    }

    /// Un verrou INCONNU ne scelle pas le contenu (aucune preuve de verrou),
    /// mais retire les actions rapides (fail-closed).
    func test_anUnknownLock_sealsNothing_butOffersNoQuickAction() {
        XCTAssertFalse(NSEConversationLock.unknown.sealsContent)
        XCTAssertFalse(NSEConversationLock.unknown.offersQuickActions)
        XCTAssertFalse(NSEConversationLock.locked.offersQuickActions)
        XCTAssertTrue(NSEConversationLock.open.offersQuickActions)
        XCTAssertTrue(NSEConversationLock.noConversation.offersQuickActions)
    }

    /// Le témoin de la décision : la charge SCELLÉE d'une conversation sous
    /// PIN prend la catégorie sans action, quelle que soit celle choisie avant.
    func test_aSealedPayload_getsTheCategoryWithoutAnyAction() {
        let sealed = NSEAttachmentPolicy.sealingLockedConversation(
            ["type": "new_message", "conversationId": "c1", "messageId": "m1"], isLocked: true
        )

        for chosen in conversationCategories {
            XCTAssertEqual(
                NSEAttachmentPolicy.category(chosen, under: .locked, userInfo: sealed),
                NSEAttachmentPolicy.lockedConversationCategory, chosen
            )
        }
    }

    func test_aSealedPayload_losesItsActions_evenWhenTheMirrorSaysOpen() {
        let sealed = NSEAttachmentPolicy.sealingLockedConversation(["conversationId": "c1"], isLocked: true)

        XCTAssertEqual(
            NSEAttachmentPolicy.category("MEESHY_MESSAGE", under: .open, userInfo: sealed),
            NSEAttachmentPolicy.lockedConversationCategory
        )
    }

    func test_anUnknownLock_fallsBackToTheCategoryWithoutAnyAction() {
        let payload: [AnyHashable: Any] = ["type": "mention", "conversationId": "c1"]

        XCTAssertEqual(
            NSEAttachmentPolicy.category("MEESHY_MENTION", under: .unknown, userInfo: payload),
            NSEAttachmentPolicy.lockedConversationCategory
        )
    }

    func test_anOpenConversation_keepsItsCategory() {
        let payload: [AnyHashable: Any] = ["type": "new_message", "conversationId": "c1"]

        for chosen in conversationCategories {
            XCTAssertEqual(NSEAttachmentPolicy.category(chosen, under: .open, userInfo: payload), chosen)
        }
        XCTAssertEqual(
            NSEAttachmentPolicy.category("MEESHY_SOCIAL", under: .noConversation, userInfo: [:]), "MEESHY_SOCIAL"
        )
    }

    func test_callsAndUncategorizedBanners_areLeftAsTheyAre() {
        for chosen in ["MEESHY_CALL_INCOMING", "MEESHY_CALL_MISSED", "MEESHY_CALL", ""] {
            XCTAssertEqual(NSEAttachmentPolicy.category(chosen, under: .locked, userInfo: [:]), chosen)
        }
    }

    /// L'extension applique la loi à la catégorie qu'elle vient de choisir.
    func test_extension_gatesTheCategoryItChose() throws {
        XCTAssertTrue(try nseSource().contains("NSEAttachmentPolicy.category("))
    }
}
