import Testing
@testable import MeeshySDK

/// Jumelle de `packages/shared/__tests__/forward-to-publication.test.ts` — les
/// deux règles doivent rendre le même verdict sur les mêmes types MIME, sans
/// quoi la feuille de partage propose des destinations différentes selon le
/// client depuis lequel on partage le MÊME message.
@Suite("PublicationTargetRule")
struct PublicationTargetTests {

    // MARK: - Le format DÉCOULE du média

    @Test("une image devient un POST")
    func image_defaults_to_post() {
        #expect(PublicationTargetRule.defaultTarget(forMimeType: "image/jpeg") == .post)
        #expect(PublicationTargetRule.defaultTarget(forMimeType: "image/png") == .post)
        #expect(PublicationTargetRule.defaultTarget(forMimeType: "image/heic") == .post)
    }

    @Test("une vidéo devient un REEL — c'est le fil qui sait la jouer")
    func video_defaults_to_reel() {
        #expect(PublicationTargetRule.defaultTarget(forMimeType: "video/mp4") == .reel)
        #expect(PublicationTargetRule.defaultTarget(forMimeType: "video/quicktime") == .reel)
    }

    @Test("un son devient un REEL — un POST n'a aucune surface pour l'écouter")
    func audio_defaults_to_reel() {
        #expect(PublicationTargetRule.defaultTarget(forMimeType: "audio/mpeg") == .reel)
        #expect(PublicationTargetRule.defaultTarget(forMimeType: "audio/mp4") == .reel)
    }

    @Test("un document n'a aucune destination publique")
    func documents_have_no_public_surface() {
        #expect(PublicationTargetRule.defaultTarget(forMimeType: "application/pdf") == nil)
        #expect(PublicationTargetRule.defaultTarget(forMimeType: "application/json") == nil)
        #expect(PublicationTargetRule.defaultTarget(forMimeType: "text/csv") == nil)
        #expect(PublicationTargetRule.defaultTarget(forMimeType: "application/zip") == nil)
    }

    @Test("un mimeType absent ou vide ne propose rien")
    func missing_mime_proposes_nothing() {
        #expect(PublicationTargetRule.defaultTarget(forMimeType: nil) == nil)
        #expect(PublicationTargetRule.defaultTarget(forMimeType: "") == nil)
    }

    @Test("la casse du mimeType ne change pas le verdict (RFC 2045 §5.1)")
    func mime_is_case_insensitive() {
        #expect(PublicationTargetRule.defaultTarget(forMimeType: "Image/JPEG") == .post)
        #expect(PublicationTargetRule.defaultTarget(forMimeType: "VIDEO/MP4") == .reel)
    }

    // MARK: - Ce que la feuille PROPOSE

    @Test("la STORY est offerte à côté du format déduit, jamais déduite elle-même")
    func story_is_offered_never_deduced() {
        #expect(PublicationTargetRule.targets(forMimeType: "image/jpeg") == [.post, .story])
        #expect(PublicationTargetRule.targets(forMimeType: "video/mp4") == [.reel, .story])
        #expect(PublicationTargetRule.targets(forMimeType: "audio/mpeg") == [.reel, .story])

        // Elle expire en 24 h : la proposer par déduction ferait disparaître un
        // média que personne n'a choisi de rendre éphémère.
        #expect(PublicationTargetRule.defaultTarget(forMimeType: "image/jpeg") != .story)
    }

    @Test("un média sans surface publique ne propose AUCUNE destination")
    func unpublishable_media_offers_nothing() {
        // Vide, pas « une section vide » : l'appelant n'affiche alors rien.
        #expect(PublicationTargetRule.targets(forMimeType: "application/pdf").isEmpty)
        #expect(PublicationTargetRule.targets(forMimeType: nil).isEmpty)
    }

    // MARK: - La confirmation de capture

    @Test("publier une capture se confirme, quelle que soit la destination")
    func capture_needs_confirmation_on_every_target() {
        for target in PublicationTarget.allCases {
            #expect(
                PublicationTargetRule.needsCaptureConfirmation(capturedInApp: true, target: target),
                "une capture publiée en \(target.rawValue) doit se confirmer"
            )
        }
    }

    @Test("un média choisi dans la galerie ne demande RIEN")
    func imported_media_needs_no_confirmation() {
        // Il a déjà été gardé, regardé, éventuellement partagé. Demander à
        // chaque publication userait la question jusqu'à ce qu'on ne la lise
        // plus — y compris le jour où elle porte.
        for target in PublicationTarget.allCases {
            #expect(!PublicationTargetRule.needsCaptureConfirmation(capturedInApp: false, target: target))
        }
    }

    // MARK: - Parité avec la règle partagée

    @Test("les valeurs brutes sont celles que la passerelle attend")
    func raw_values_match_the_wire_contract() {
        // `POST /posts/from-attachment` valide `target` contre l'énumération
        // Zod `['POST','REEL','STORY']` : un cas mal orthographié ici sort en
        // 400 sans qu'aucun témoin Swift ne tombe.
        #expect(PublicationTarget.post.rawValue == "POST")
        #expect(PublicationTarget.reel.rawValue == "REEL")
        #expect(PublicationTarget.story.rawValue == "STORY")
    }
}
