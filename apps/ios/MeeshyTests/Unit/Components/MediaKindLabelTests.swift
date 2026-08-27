import XCTest
import MeeshySDK
@testable import Meeshy

/// Comportement de la source unique des étiquettes de média (248i).
///
/// Les libellés se résolvent par `String(localized:)`, donc depuis la langue du
/// simulateur : chaque test qui juge un TEXTE fixe la table française, sinon il
/// serait vert en local `fr` et rouge sur une CI `en` (même précaution que
/// `ConversationViewModelTests.test_optimisticListPreview_captionlessMedia…`).
///
/// `@MainActor` sur la classe : `MediaKindLabel` est `nonisolated`, mais
/// `ComposerAttachment` ne l'est pas — la cible app compile sous
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, le bundle de tests sous
/// `nonisolated`, donc ses fabriques ne sont atteignables que d'ici.
@MainActor
final class MediaKindLabelTests: XCTestCase {

    private func frenchTable() throws -> (bundle: Bundle, locale: Locale) {
        let path = try XCTUnwrap(Bundle.main.path(forResource: "fr", ofType: "lproj"),
                                 "localisation « fr » absente du bundle — régression de packaging")
        return (try XCTUnwrap(Bundle(path: path)), Locale(identifier: "fr"))
    }

    // MARK: - Les deux registres

    func test_name_rendLibelleNu_sansEmoji() throws {
        let (bundle, locale) = try frenchTable()
        func name(_ kind: MediaKindLabel.Kind) -> String {
            MediaKindLabel.name(kind, bundle: bundle, locale: locale)
        }
        XCTAssertEqual(name(.photo), "Photo")
        XCTAssertEqual(name(.video), "Vidéo")
        XCTAssertEqual(name(.audio), "Audio")
        XCTAssertEqual(name(.file), "Fichier")
        XCTAssertEqual(name(.location), "Position")
    }

    func test_summary_rendLibellePrefixeDeSonEmoji() throws {
        let (bundle, locale) = try frenchTable()
        func summary(_ kind: MediaKindLabel.Kind) -> String {
            MediaKindLabel.summary(kind, bundle: bundle, locale: locale)
        }
        XCTAssertEqual(summary(.photo), "📷 Photo")
        XCTAssertEqual(summary(.video), "🎥 Vidéo")
        XCTAssertEqual(summary(.file), "📎 Fichier")
        XCTAssertEqual(summary(.location), "📍 Position")
    }

    /// Le seul rang où les deux registres divergent au-delà de l'emoji : un
    /// attachement audio est « Audio » sur une puce (une icône d'onde
    /// l'accompagne) et « Message vocal » dans un aperçu qui tient seul.
    func test_audio_estAudioEnPuceEtMessageVocalEnApercu() throws {
        let (bundle, locale) = try frenchTable()
        XCTAssertEqual(MediaKindLabel.name(.audio, bundle: bundle, locale: locale), "Audio")
        XCTAssertEqual(MediaKindLabel.summary(.audio, bundle: bundle, locale: locale), "🎙️ Message vocal")
    }

    /// Aucun registre ne rend d'identifiant brut : une clé absente du catalogue
    /// se verrait ici, sur les cinq natures et dans les deux registres.
    func test_aucunRegistreNeRendUnIdentifiantBrut() throws {
        let (bundle, locale) = try frenchTable()
        for kind in MediaKindLabel.Kind.allCases {
            for value in [MediaKindLabel.name(kind, bundle: bundle, locale: locale),
                          MediaKindLabel.summary(kind, bundle: bundle, locale: locale)] {
                XCTAssertFalse(value.hasPrefix("attachment."), "identifiant brut rendu : \(value)")
                XCTAssertFalse(value.hasPrefix("media."), "identifiant brut rendu : \(value)")
                XCTAssertFalse(value.isEmpty, "étiquette vide pour \(kind)")
            }
        }
    }

    // MARK: - Passerelles

    func test_kindDepuisTypeDePieceJointe_couvreLesCinqCas() {
        XCTAssertEqual(MediaKindLabel.kind(for: MessageAttachment.AttachmentType.image), .photo)
        XCTAssertEqual(MediaKindLabel.kind(for: MessageAttachment.AttachmentType.video), .video)
        XCTAssertEqual(MediaKindLabel.kind(for: MessageAttachment.AttachmentType.audio), .audio)
        XCTAssertEqual(MediaKindLabel.kind(for: MessageAttachment.AttachmentType.file), .file)
        XCTAssertEqual(MediaKindLabel.kind(for: MessageAttachment.AttachmentType.location), .location)
    }

    /// `.text` n'est pas un média : la table rend `nil` plutôt qu'un libellé
    /// inventé. C'est ce `nil` qui fait rendre la chaîne vide à l'aperçu d'un
    /// message texte sans contenu, au lieu de « 📎 Pièce jointe ».
    func test_kindDepuisTypeDeMessage_texteNEstPasUnMedia() {
        XCTAssertNil(MediaKindLabel.kind(for: Message.MessageType.text))
        XCTAssertEqual(MediaKindLabel.kind(for: Message.MessageType.image), .photo)
        XCTAssertEqual(MediaKindLabel.kind(for: Message.MessageType.location), .location)
    }

    func test_kindDepuisVocabulaireSerialise_etJetonInconnu() {
        XCTAssertEqual(MediaKindLabel.kind(forAttachmentRawValue: "image"), .photo)
        XCTAssertEqual(MediaKindLabel.kind(forAttachmentRawValue: "location"), .location)
        XCTAssertNil(MediaKindLabel.kind(forAttachmentRawValue: "photo"),
                     "« photo » n'est PAS le vocabulaire sérialisé — c'est « image »")
        XCTAssertNil(MediaKindLabel.kind(forAttachmentRawValue: ""))
    }

    // MARK: - Étiquette d'une pièce jointe réelle

    func test_attachmentLabel_prefereLidentiteDeLaPieceAuLibelleDeType() throws {
        let (bundle, locale) = try frenchTable()
        func label(_ attachment: MessageAttachment) -> String {
            MediaKindLabel.attachmentLabel(for: attachment, bundle: bundle, locale: locale)
        }
        XCTAssertEqual(label(.audio(durationMs: 12_000)), "0:12", "un audio montre sa durée")
        XCTAssertEqual(label(.file(name: "contrat.pdf", size: 2048)), "contrat.pdf",
                       "un fichier montre son nom d'origine")
        XCTAssertEqual(label(.image()), "Photo")
        XCTAssertEqual(label(.video(durationMs: 5_000)), "Vidéo",
                       "une vidéo montre son type — sa durée s'affiche ailleurs")
        XCTAssertEqual(label(.location()), "Position")
    }

    func test_attachmentLabel_replieSurLeTypeQuandLidentiteManque() throws {
        let (bundle, locale) = try frenchTable()
        let fichierSansNom = MessageAttachment(mimeType: "application/octet-stream")
        XCTAssertEqual(MediaKindLabel.attachmentLabel(for: fichierSansNom, bundle: bundle, locale: locale),
                       "Fichier", "un fichier sans nom d'origine reste nommé, jamais muet")

        let audioSansDuree = MessageAttachment(mimeType: "audio/mp4")
        XCTAssertEqual(MediaKindLabel.attachmentLabel(for: audioSansDuree, bundle: bundle, locale: locale),
                       "Audio")
    }

    // MARK: - Puce de lieu

    func test_placeLabel_preferLeNomEtFermeLaChaineVide() throws {
        let (bundle, locale) = try frenchTable()
        func label(_ name: String?) -> String {
            MediaKindLabel.placeLabel(name, bundle: bundle, locale: locale)
        }
        XCTAssertEqual(label("Café de Flore"), "Café de Flore")
        XCTAssertEqual(label(nil), "Position")
        XCTAssertEqual(label(""), "Position",
                       "le `??` seul laissait passer la chaîne vide — une puce muette")
    }

    // MARK: - Puce d'un vocal fraîchement enregistré

    func test_voiceRecording_composeLeLibelleEtSaDuree() throws {
        let (bundle, locale) = try frenchTable()
        XCTAssertEqual(MediaKindLabel.voiceRecording(duration: 12, bundle: bundle, locale: locale),
                       "Message vocal (0:12)")
        XCTAssertEqual(MediaKindLabel.voiceRecording(duration: 0, bundle: bundle, locale: locale),
                       "Message vocal (0:00)",
                       "une durée nulle reste annoncée — jamais une parenthèse vide")
    }

    /// Le composeur monte cette puce par sa fabrique : le nom qu'elle grave
    /// doit être CELUI de la source unique, pas une chaîne écrite à côté.
    func test_composerVoiceAttachment_porteLeNomDeLaSourceUnique() {
        let attachment = ComposerAttachment.voice(duration: 12)
        XCTAssertEqual(attachment.name, MediaKindLabel.voiceRecording(duration: 12))
        XCTAssertEqual(attachment.type, .voice)
    }

    func test_composerImageEtFile_portentLeLibelleLocaliseParDefaut() {
        XCTAssertEqual(ComposerAttachment.image().name, MediaKindLabel.name(.photo))
        XCTAssertEqual(ComposerAttachment.file().name, MediaKindLabel.name(.file))
    }
}
