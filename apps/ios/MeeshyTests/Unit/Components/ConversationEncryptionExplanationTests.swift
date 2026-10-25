import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Ce que la fiche Chiffrement explique de la conversation ouverte** (#12880,
/// directive porteur 2026-10-25) : le mode en mots simples, qui peut lire, ce
/// qui manque et pourquoi, la bascule, les appareils, et ce qui n'est pas
/// encore livré — l'interface le dit au lieu de le cacher.
@MainActor
final class ConversationEncryptionExplanationTests: XCTestCase {

    private func facts(_ mode: String?, isDirect: Bool = true) -> [ConversationEncryptionExplanation.Fact] {
        ConversationEncryptionExplanation(mode: mode, isDirect: isDirect).sections.flatMap(\.facts)
    }

    func test_regime_seLitSansCasseNiBlancs_unModeInconnuSeLitCommeBoutEnBout() {
        XCTAssertEqual(ConversationEncryptionRegime(mode: nil), .none)
        XCTAssertEqual(ConversationEncryptionRegime(mode: " "), .none)
        XCTAssertEqual(ConversationEncryptionRegime(mode: " Server "), .server)
        XCTAssertEqual(ConversationEncryptionRegime(mode: "HYBRID"), .hybrid)
        XCTAssertEqual(ConversationEncryptionRegime(mode: "e2ee"), .endToEnd)
        XCTAssertEqual(ConversationEncryptionRegime(mode: "signal_v9"), .endToEnd, "en cas de doute, le serveur n'y lit rien")
    }

    func test_sansChiffrement_leServeurLitEtStockeSansChiffrement() {
        let facts = facts(nil)
        XCTAssertTrue(facts.contains(.storedWithoutEncryption))
        XCTAssertTrue(facts.contains(.everyServerFeature))
        XCTAssertFalse(facts.contains(.onlyParticipantsRead))
    }

    func test_serveur_chiffreAuRepos_leServeurLit_toutesLesFonctions() {
        let facts = facts("server")
        XCTAssertTrue(facts.contains(.encryptedOnServerServerReads))
        XCTAssertTrue(facts.contains(.everyServerFeature))
        XCTAssertFalse(facts.contains(.translatedOnDevice))
    }

    /// `hybrid` n'a aujourd'hui aucune couche de bout en bout : la fiche le dit.
    func test_hybride_estDitIdentiqueAuServeur_jamaisBoutEnBout() {
        let facts = facts("hybrid")
        XCTAssertTrue(facts.contains(.hybridIsServerToday))
        XCTAssertTrue(facts.contains(.encryptedOnServerServerReads))
        XCTAssertFalse(facts.contains(.onlyParticipantsRead))
    }

    func test_boutEnBout_seulsLesAppareilsLisent_traductionSurLAppareil_etCeQuiManque() {
        let facts = facts("e2ee")
        XCTAssertTrue(facts.contains(.onlyParticipantsRead))
        XCTAssertTrue(facts.contains(.translatedOnDevice))
        XCTAssertTrue(facts.contains(.attachmentsEncryptedOnDevice), "#10789 — les pièces partent chiffrées sur l'appareil")
        for absent: ConversationEncryptionExplanation.Fact in [
            .noServerTranscription, .noNotificationPreview, .noSearch, .noEdit, .noForward, .noOfflineSending
        ] {
            XCTAssertTrue(facts.contains(absent), "\(absent)")
        }
        for notYet: ConversationEncryptionExplanation.Fact in [
            .notYetPlacesAndStickers, .notYetDecryptedNotifications, .notYetGroups, .notYetSafetyNumbers
        ] {
            XCTAssertTrue(facts.contains(notYet), "\(notYet)")
        }
        XCTAssertTrue(facts.contains(.oneKeyPerDevice))
        XCTAssertTrue(facts.contains(.deviceLimit))
        XCTAssertTrue(facts.contains(.restoredDeviceIsNew))
        XCTAssertFalse(facts.contains(.everyServerFeature))
    }

    func test_boutEnBout_dansUnGroupe_ditQueLEnvoiNEstPasEncorePossible() {
        XCTAssertTrue(facts("e2ee", isDirect: false).contains(.groupSendingUnavailable))
        XCTAssertFalse(facts("e2ee", isDirect: true).contains(.groupSendingUnavailable))
    }

    /// Une conversation que le serveur lit dit qui peut activer, ce que fait la
    /// bascule, et que le bout en bout est définitif ; une conversation chiffrée
    /// de bout en bout dit qu'elle le reste (#12949).
    func test_chaqueMode_ditQuiPeutActiver_etCeQuiEstDefinitif() {
        for mode in [nil, "server", "hybrid"] {
            let facts = facts(mode)
            XCTAssertTrue(facts.contains(.whoMayToggle), "\(String(describing: mode))")
            XCTAssertTrue(facts.contains(.switchKeepsHistory), "\(String(describing: mode))")
            XCTAssertTrue(facts.contains(.switchIsShownInThread), "\(String(describing: mode))")
            XCTAssertTrue(facts.contains(.endToEndIsFinal), "\(String(describing: mode))")
        }
        XCTAssertEqual(facts("e2ee", isDirect: true).suffix(2), [.endToEndNeverTurnedOffDirect, .serverCannotTurnItOff])
        XCTAssertEqual(facts("e2ee", isDirect: false).suffix(2), [.endToEndNeverTurnedOff, .serverCannotTurnItOff])
        XCTAssertFalse(facts("e2ee").contains(.whoMayToggle), "rien ne se bascule dans une conversation chiffrée de bout en bout")
    }

    /// #12949 — le bout en bout ne se désactive pas, et la fiche le dit.
    func test_irreversible_unTeteATeteChiffre_resteChiffre_etNePromeutAucuneDesactivation() {
        let facts = facts("e2ee", isDirect: true)
        XCTAssertTrue(facts.contains(.endToEndNeverTurnedOffDirect))
        XCTAssertFalse(facts.contains(.endToEndNeverTurnedOff), "un tête-à-tête ne promet pas de nouvelle conversation (#12966)")
    }

    func test_irreversible_unGroupeChiffre_ditDeCreerUneNouvelleConversation() {
        XCTAssertTrue(facts("e2ee", isDirect: false).contains(.endToEndNeverTurnedOff))
    }

    func test_irreversible_avantDActiver_laFicheDitQueLeBoutEnBoutEstDefinitif() {
        for mode in [nil, "server", "hybrid"] {
            XCTAssertTrue(facts(mode).contains(.endToEndIsFinal), "\(String(describing: mode))")
        }
    }

    /// Aucun texte en dur : chaque fait et chaque titre se lit dans le catalogue,
    /// jamais sous sa clé.
    func test_chaqueTexte_estLocalise() {
        for fact in ConversationEncryptionExplanation.Fact.allCases {
            XCTAssertFalse(fact.text.isEmpty, "\(fact)")
            XCTAssertFalse(fact.text.hasPrefix("conversation.encryption."), "\(fact) n'a pas de traduction")
            XCTAssertFalse(fact.systemImage.isEmpty, "\(fact)")
        }
        for topic in ConversationEncryptionExplanation.Topic.allCases {
            XCTAssertFalse(topic.title.hasPrefix("conversation.encryption."), "\(topic) n'a pas de traduction")
        }
        for regime in [ConversationEncryptionRegime.none, .server, .hybrid, .endToEnd] {
            XCTAssertFalse(regime.summary.hasPrefix("conversation.encryption."), "\(regime)")
        }
    }

    /// #10789 (consigne du coordinateur, 2026-10-25) : ce que le bout en bout
    /// retire aux pièces jointes se dit dans la fiche ET au moment d'activer.
    func test_boutEnBout_laFicheDitCeQueLeModeRetireAuxPiecesJointes() {
        let absent = ConversationEncryptionExplanation(mode: "e2ee", isDirect: true).sections
            .first { $0.topic == .absent }?.facts ?? []
        XCTAssertEqual(
            ConversationEncryptionExplanation.attachmentTradeOffs,
            [.voiceTranslatedAsTextOnDevice, .noLockScreenMediaPreview, .noWebPlayback, .noServerModeration]
        )
        for fact in ConversationEncryptionExplanation.attachmentTradeOffs {
            XCTAssertTrue(absent.contains(fact), "\(fact)")
            XCTAssertFalse(facts(nil).contains(fact), "un mode que le serveur lit ne perd rien de cela : \(fact)")
        }
    }

    func test_activation_choisirLeBoutEnBout_annonceCeQuIlRetireAuxPiecesJointes() {
        XCTAssertEqual(
            ConversationEncryptionExplanation.activationTradeOffs(for: .e2ee),
            ConversationEncryptionExplanation.attachmentTradeOffs
        )
        XCTAssertTrue(ConversationEncryptionExplanation.activationTradeOffs(for: .server).isEmpty)
        XCTAssertTrue(ConversationEncryptionExplanation.activationTradeOffs(for: .hybrid).isEmpty)
    }

    /// Les sept langues du catalogue disent chacune ces retraits, et la phrase
    /// de l'activation : aucune ne retombe sur la clé ni sur le français.
    func test_lesRetraitsDuBoutEnBout_seDisentDansLesSeptLangues() throws {
        let keys = [
            "conversation.encryption.fact.voiceTranslatedAsTextOnDevice",
            "conversation.encryption.fact.noLockScreenMediaPreview",
            "conversation.encryption.fact.noWebPlayback",
            "conversation.encryption.fact.noServerModeration",
            "conversation.encryption.detail.activationTradeOffsHeader",
            "conversation.encryption.fact.attachmentsEncryptedOnDevice",
            "conversation.encryption.fact.notYetPlacesAndStickers",
            "conversation.send.e2ee.pieceUploadFailed",
        ]
        let french = try XCTUnwrap(Bundle.main.path(forResource: "fr", ofType: "lproj").flatMap(Bundle.init(path:)))
        for language in ["fr", "en", "es", "de", "it", "pt-BR", "ar"] {
            let bundle = try XCTUnwrap(Bundle.main.path(forResource: language, ofType: "lproj").flatMap(Bundle.init(path:)), language)
            for key in keys {
                let text = bundle.localizedString(forKey: key, value: nil, table: "Localizable")
                XCTAssertNotEqual(text, key, "\(language) \(key)")
                if language != "fr" {
                    XCTAssertNotEqual(text, french.localizedString(forKey: key, value: nil, table: "Localizable"), "\(language) \(key)")
                }
            }
        }
    }

    /// #10789 (qui succède à #12918) — la fiche dit que photos, vidéos, fichiers
    /// et vocaux partent chiffrés sur l'appareil, et que lieux, fiches et
    /// stickers attendent : le composeur offre exactement les premiers, et
    /// aucune porte vers les seconds.
    func test_boutEnBout_leComposeurOffreCeQueLaFicheDitDisponible_etRienDAutre() {
        let allowance = GuestAttachmentAllowance.unrestricted.sealedEndToEnd(true)
        let composer = UniversalComposerBar(
            mode: .message,
            voiceDoor: allowance.offersVoiceRecording ? .byMode : .closed,
            onStartRecording: {}, onStopRecordingToAttachment: {}, onSendRecording: {}, onCancelRecording: {},
            externalIsRecording: false, externalRecordingDuration: 0
        )

        XCTAssertTrue(facts("e2ee").contains(.attachmentsEncryptedOnDevice))
        XCTAssertTrue(facts("e2ee").contains(.notYetPlacesAndStickers))
        XCTAssertTrue(composer.resolvedShowVoice, "le vocal part chiffré sur l'appareil")
        XCTAssertTrue(allowance.offersVisualMedia)
        XCTAssertTrue(allowance.offersFiles)
        XCTAssertFalse(allowance.offersStickers)
        XCTAssertFalse(allowance.offersContactsAndPlaces)
    }

    func test_sansChiffrement_leComposeurGardeLeVocal() {
        let allowance = GuestAttachmentAllowance.unrestricted.sealedEndToEnd(false)
        let composer = UniversalComposerBar(
            mode: .message,
            voiceDoor: allowance.offersVoiceRecording ? .byMode : .closed,
            onStartRecording: {}, onStopRecordingToAttachment: {}, onSendRecording: {}, onCancelRecording: {},
            externalIsRecording: false, externalRecordingDuration: 0
        )

        XCTAssertTrue(composer.resolvedShowVoice)
    }

}
