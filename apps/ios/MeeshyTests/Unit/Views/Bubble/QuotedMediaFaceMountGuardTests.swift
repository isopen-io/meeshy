import XCTest
import MeeshySDK
@testable import Meeshy

/// #8230 — les faces du média cité sont MONTÉES par les deux peaux, et le
/// plein écran audio est MONTÉ par la conversation.
///
/// Une règle juste que personne ne consomme ne rougit nulle part : les faces
/// décidées par `QuotedReplyPresentation.mediaFace(for:)` doivent atteindre
/// le pixel dans la bulle ET dans la rangée plate, et la pièce audio que la
/// citation remet à `onMediaTap` doit ouvrir un plein écran qui sait la
/// jouer — la galerie ne rend que l'image et la vidéo.
final class QuotedMediaFaceMountGuardTests: XCTestCase {

    private func source(_ relativeToAppRoot: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Views/Bubble
            .deletingLastPathComponent()   // .../Unit/Views
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent(relativeToAppRoot)
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        XCTAssertGreaterThan(code.count, 1_000, "\(relativeToAppRoot) ne s'ancre pas — garde inopérante")
        return code
    }

    func test_lesDeuxPeaux_montentLePosterEtLApercuAudio_parLaRegle() throws {
        let skins = [
            "Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift",
            "Meeshy/Features/Main/Focal/Row/FocalQuotedReplyView.swift"
        ]
        for path in skins {
            let code = try source(path)
            XCTAssertTrue(code.contains("QuotedReplyPresentation.mediaFace(for:"),
                          "\(path) doit lire la face du média par la règle partagée, qui tranche la protection d'abord")
            XCTAssertTrue(code.contains("QuotedVideoPoster("),
                          "\(path) doit monter le poster d'une vidéo citée sans vignette")
            XCTAssertTrue(code.contains("QuotedAudioPreview("),
                          "\(path) doit monter l'aperçu d'un vocal cité")
            XCTAssertTrue(code.contains("reference.quotedAttachment") || code.contains("reply.quotedAttachment"),
                          "\(path) : le poster s'extrait de la pièce RECONSTRUITE, qui n'existe jamais pour un secret")
        }
    }

    /// #8283 — la Rivière monte les MÊMES atomes, par la MÊME règle, et ouvre
    /// le MÊME plein écran : aucune jumelle de face ni d'élection de pièce.
    func test_laRiviere_monteLesMemesFaces_etOuvreLeMemePleinEcran() throws {
        let face = try source("Meeshy/Features/Main/Riviere/View/RiverQuotedMediaFace.swift")
        XCTAssertTrue(face.contains("QuotedReplyPresentation.mediaFace(for:"),
                      "la face se lit par la règle partagée, qui tranche la protection d'abord")
        XCTAssertTrue(face.contains("QuotedVideoPoster("))
        XCTAssertTrue(face.contains("QuotedAudioPreview("))
        XCTAssertTrue(face.contains("reference.quotedAttachment"),
                      "le poster s'extrait de la pièce RECONSTRUITE, qui n'existe jamais pour un secret")

        let mapping = try source("Meeshy/Features/Main/Riviere/Core/RiverConversationMapping.swift")
        XCTAssertTrue(mapping.contains("media: RiverQuotedMedia.resolve("),
                      "la projection alimente la face — une vue montée sur ses défauts ne rougit nulle part")

        let bubble = try source("Meeshy/Features/Main/Riviere/View/RiverBubbleView.swift")
        XCTAssertTrue(bubble.contains("RiverQuotedMediaFace("))
        let stream = try source("Meeshy/Features/Main/Riviere/View/RiverStreamHost.swift")
        XCTAssertTrue(stream.contains("onQuotedMediaTap: quotedMediaTap"))
        let host = try source("Meeshy/Features/Main/Riviere/View/RiverConversationHost.swift")
        XCTAssertTrue(host.contains("onOpenQuotedMedia: openQuotedMedia"),
                      "l'hôte remet l'ouverture à la peau")
        XCTAssertTrue(host.contains("onMediaTap(attachment)"),
                      "la pièce citée s'ouvre par le MÊME geste que le toucher d'un média")
        let conversation = try source("Meeshy/Features/Main/Views/ConversationView.swift")
        XCTAssertTrue(conversation.contains("onMediaTap: openMediaFullscreen"),
                      "la conversation relaie son ouvreur unique jusqu'à la Rivière")

        // Lecture directe : le plancher de `source(_:)` refuserait le plus petit,
        // l'ancre ci-dessous suffit à prouver qu'ils sont lus.
        let appRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
        for path in [
            "Meeshy/Features/Main/Riviere/View/RiverConversationHost.swift",
            "Meeshy/Features/Main/Views/MessageListViewController+QuotedMedia.swift"
        ] {
            let code = AppSourceGuard.stripComments(
                try String(contentsOf: appRoot.appendingPathComponent(path), encoding: .utf8))
            XCTAssertTrue(code.contains("QuotedMediaOpening.gesture(for: reference"),
                          "\(path) décide du geste par la règle UNIQUE du Fil et de la Rivière")
        }
    }

    /// #8283 après #8320 — en Rivière comme en Script, un vocal cité se JOUE
    /// sur place par le lecteur PARTAGÉ et sa capsule montre la lecture ; il
    /// n'ouvre plus le plein écran audio.
    func test_laRiviere_joueUnVocalCiteSurPlace_parLeLecteurPartage() throws {
        let host = try source("Meeshy/Features/Main/Riviere/View/RiverConversationHost.swift")
        XCTAssertTrue(host.contains("case .playInPlace:"),
                      "l'hôte de la Rivière route l'audio cité vers la lecture sur place")
        XCTAssertTrue(host.contains("onPlayQuotedAudio?(reference)"),
                      "la lecture est DITE par l'appelant, l'hôte ne connaît pas le VM")
        let conversation = try source("Meeshy/Features/Main/Views/ConversationView.swift")
        XCTAssertTrue(conversation.contains("onPlayQuotedAudio: { viewModel.toggleQuotedAudio($0) }"),
                      "la Rivière joue par le MÊME `toggleQuotedAudio` que le Fil — aucun second lecteur")
        let face = try source("Meeshy/Features/Main/Riviere/View/RiverQuotedMediaFace.swift")
        XCTAssertTrue(face.contains("playbackMessageId: reference.messageId"),
                      "la capsule suit la lecture de SON message, comme dans les autres modes")
        let bubble = try source("Meeshy/Features/Main/Riviere/View/RiverBubbleView.swift")
        XCTAssertTrue(bubble.contains("QuotedZoneAccessibility.mediaActionLabel(for: media.reference)"),
                      "VoiceOver nomme la zone « Écouter le message cité » pour un vocal, comme dans les autres modes")
    }

    func test_laConversation_ouvreUnVocalCiteEnPleinEcranAudio_jamaisDansLaGalerie() throws {
        let layer = try source("Meeshy/Features/Main/Views/ConversationView+MediaGallery.swift")
        XCTAssertTrue(layer.contains("if startAttachment.type == .audio {"),
                      "le plein écran de la conversation doit distinguer l'audio : la galerie ne sait pas le rendre")
        XCTAssertTrue(layer.contains("audioFullscreen(start: startAttachment)"))

        let audio = try source("Meeshy/Features/Main/Views/ConversationView+AudioFullscreen.swift")
        XCTAssertTrue(audio.contains("AudioFullscreenView("),
                      "le vocal cité s'ouvre dans le MÊME plein écran que celui de la bulle audio")
        XCTAssertTrue(audio.contains("viewModel.allAudioItems"),
                      "les vocaux voisins restent balayables depuis le plein écran ouvert par une citation")
    }
}
