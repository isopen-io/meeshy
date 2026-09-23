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

    private func nseSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("MeeshyNotificationExtension/NotificationService.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// **Plus aucun corps de réponse ne transite par la mémoire.** C'est le
    /// correctif de FOND : `downloadTask` écrit sur disque, et un fichier de
    /// 40 Mo posé sur disque ne fait pas dépasser une enveloppe de 24 Mo.
    func test_aucunTelechargementNeGardeLeCorpsEnMemoire() throws {
        let source = try nseSource()
        XCTAssertFalse(source.contains("dataTask(with:"),
                       "Un `dataTask` ramène tout le corps en mémoire — l'enveloppe de la NSE "
                       + "est d'environ 24 Mo, et les téléchargements y sont CONCURRENTS.")
        XCTAssertTrue(source.contains("downloadTask(with:"),
                      "Le téléchargement doit écrire sur DISQUE.")
    }

    /// **La loi précède la requête, et elle la précède DANS la branche du
    /// média.** Une garde posée ailleurs laisserait exactement le chemin qui
    /// tuait l'extension.
    func test_leTelechargementDuMedia_estPrecedeDeLaLoi() throws {
        let source = try nseSource()
        XCTAssertTrue(source.contains("NSEAttachmentPolicy.mayAttach"),
                      "La NSE doit demander à la loi avant de descendre un média.")
        guard let debut = source.range(of: "userInfo[\"attachmentUrl\"]"),
              let fin = source.range(of: "downloadFile(from: attachmentURL",
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
}
