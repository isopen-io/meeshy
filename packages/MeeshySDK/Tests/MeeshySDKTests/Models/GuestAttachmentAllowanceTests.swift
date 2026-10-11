import Foundation
import Testing
@testable import MeeshySDK

/// #10006 — ce qu'un INVITÉ peut joindre se lit dans les termes de son lien
/// (#10001) : `null` ne restreint rien, un tableau est la SEULE liste offerte —
/// y compris vide, et une famille inconnue n'ouvre rien.
/// Jumelle TS : `packages/shared/types/guest-attachment-kinds.ts`.
struct GuestAttachmentAllowanceTests {

    private static let world = GuestAttachmentAllowance(kinds: [.text, .audio])

    // MARK: - Lecture tolérante des termes servis

    @Test func lesFamillesInconnues_sontIgnorees_dansLOrdreCanonique() {
        let kinds = GuestAttachmentKind.knownKinds(from: ["audio", "video", "text", "audio"])
        #expect(kinds == [.text, .audio])
    }

    @Test func unChampAbsent_neRestreintRien() {
        #expect(GuestAttachmentKind.knownKinds(from: nil) == nil)
        #expect(GuestAttachmentAllowance(kinds: nil).isRestricted == false)
    }

    @Test func uneListeDInconnues_nOuvreRien_auLieuDeToutOuvrir() {
        let allowance = GuestAttachmentAllowance(kinds: GuestAttachmentKind.knownKinds(from: ["video"]))
        #expect(allowance.isRestricted)
        #expect(allowance.offersFiles == false)
        #expect(allowance.offersVoiceRecording == false)
    }

    // MARK: - Ce que le sélecteur offre

    @Test func worldWide_offreTexteEtVocal_etRienDeVisuel() {
        #expect(Self.world.offersFiles)
        #expect(Self.world.offersVoiceRecording)
        #expect(Self.world.offersVisualMedia == false)
        #expect(Self.world.offersContactsAndPlaces == false)
    }

    @Test func sansRestriction_toutResteOffert() {
        let free = GuestAttachmentAllowance.unrestricted
        #expect(free.offersFiles)
        #expect(free.offersVoiceRecording)
        #expect(free.offersVisualMedia)
        #expect(free.offersContactsAndPlaces)
    }

    // MARK: - Le plafond de World Wide (miroir de WORLD_GUEST_ATTACHMENT_KINDS)

    @Test func lePlafondDeWorldWide_estTexteEtAudio() {
        #expect(GuestAttachmentKind.worldGuestCeiling == [.text, .audio])
    }

    @Test func desTermesAbsents_prennentLePlafond_jamaisTout() {
        let capped = GuestAttachmentAllowance.unrestricted.capped(by: GuestAttachmentKind.worldGuestCeiling)
        #expect(capped == Self.world)
    }

    @Test func desTermesPlusLarges_sontResserresAuPlafond() {
        let wide = GuestAttachmentAllowance(kinds: [.text, .audio, .image, .pdf])
        #expect(wide.capped(by: GuestAttachmentKind.worldGuestCeiling) == Self.world)
    }

    @Test func desTermesPlusEtroits_restentEtroits() {
        let narrow = GuestAttachmentAllowance(kinds: [.audio])
        #expect(narrow.capped(by: GuestAttachmentKind.worldGuestCeiling) == narrow)
    }

    // MARK: - Verdict sur un fichier choisi

    @Test func unTxt_estAdmis_dansWorldWide() {
        #expect(Self.world.verdict(fileName: "notes.TXT", byteCount: 120) == .accepted(.text))
    }

    @Test func unM4a_estAdmisCommeAudio() {
        #expect(Self.world.verdict(fileName: "voix.m4a", byteCount: 2_000) == .accepted(.audio))
    }

    @Test func unPdf_estRefuse_parSaFamille() {
        #expect(Self.world.verdict(fileName: "guide.pdf", byteCount: 10) == .refused(.kindNotAllowed))
    }

    @Test func unFichierSansExtension_estRefuse() {
        #expect(Self.world.verdict(fileName: "README", byteCount: 10) == .refused(.kindNotAllowed))
    }

    @Test func unTxtTropLourd_estRefuse_parSaTaille() {
        let tooBig = GuestAttachmentAllowance.maxBytes + 1
        #expect(Self.world.verdict(fileName: "livre.txt", byteCount: tooBig) == .refused(.tooLarge))
    }

    @Test func sansRestriction_toutFichierEstAdmis_quelleQueSoitSaTaille() {
        let free = GuestAttachmentAllowance.unrestricted
        #expect(free.verdict(fileName: "guide.pdf", byteCount: Int64.max) == .accepted(.pdf))
        #expect(free.verdict(fileName: "film.mov", byteCount: 10) == .accepted(nil))
    }

    // MARK: - Les extensions annoncées au sélecteur (miroir de GUEST_ATTACHMENT_KIND_EXTENSIONS)

    @Test func lesExtensions_suiventLeContratPartage() {
        #expect(GuestAttachmentKind.text.fileExtensions == ["txt"])
        #expect(GuestAttachmentKind.audio.fileExtensions == ["mp3", "m4a", "mp4", "aac", "ogg", "oga", "opus", "webm", "weba", "wav"])
        #expect(GuestAttachmentKind.image.fileExtensions == ["jpg", "jpeg", "png", "gif", "webp"])
        #expect(GuestAttachmentKind.pdf.fileExtensions == ["pdf"])
    }

    @Test func laFamilleDUnMime_suitLeContratPartage() {
        #expect(GuestAttachmentKind.kind(ofMimeType: "text/plain; charset=utf-8") == .text)
        #expect(GuestAttachmentKind.kind(ofMimeType: "audio/mp4") == .audio)
        #expect(GuestAttachmentKind.kind(ofMimeType: "image/heic") == nil)
        #expect(GuestAttachmentKind.kind(ofMimeType: "application/pdf") == .pdf)
        #expect(GuestAttachmentKind.kind(ofMimeType: nil) == nil)
    }

    // MARK: - Le refus du SERVEUR (tus, REST) se lit sur son code

    @Test func unRefusDeFamille_seLitDansLEnveloppeTus() throws {
        let body = Data(#"{"success":false,"error":"GUEST_ATTACHMENT_KIND_NOT_ALLOWED","message":"Refusé","code":"GUEST_ATTACHMENT_KIND_NOT_ALLOWED"}"#.utf8) + Data("\n".utf8)
        let refusal = try #require(GuestAttachmentRefusal(statusCode: 403, body: body))
        #expect(refusal.reason == .kindNotAllowed)
        #expect(refusal.serverMessage == "Refusé")
    }

    @Test func unRefusDeTaille_seLitSur413() throws {
        let body = Data(#"{"success":false,"error":"x","code":"GUEST_ATTACHMENT_TOO_LARGE"}"#.utf8)
        let refusal = try #require(GuestAttachmentRefusal(statusCode: 413, body: body))
        #expect(refusal.reason == .tooLarge)
    }

    @Test func unAutreRefus_nEstPasUnRefusDInvite() {
        let body = Data(#"{"success":false,"error":"FORBIDDEN","code":"FORBIDDEN"}"#.utf8)
        #expect(GuestAttachmentRefusal(statusCode: 403, body: body) == nil)
        #expect(GuestAttachmentRefusal(statusCode: 403, body: Data("Forbidden".utf8)) == nil)
        #expect(GuestAttachmentRefusal(statusCode: 500, body: Data(#"{"code":"GUEST_ATTACHMENT_TOO_LARGE"}"#.utf8)) == nil)
    }
}
