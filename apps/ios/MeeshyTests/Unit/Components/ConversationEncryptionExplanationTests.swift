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
        for absent: ConversationEncryptionExplanation.Fact in [
            .noServerTranscription, .noNotificationPreview, .noSearch, .noEdit, .noForward, .noOfflineSending
        ] {
            XCTAssertTrue(facts.contains(absent), "\(absent)")
        }
        for notYet: ConversationEncryptionExplanation.Fact in [
            .notYetAttachments, .notYetDecryptedNotifications, .notYetGroups, .notYetSafetyNumbers
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

    func test_chaqueMode_ditQuiPeutBasculer_etCeQueFaitLaBascule() {
        for mode in [nil, "server", "hybrid", "e2ee"] {
            let facts = facts(mode)
            XCTAssertTrue(facts.contains(.whoMayToggle), "\(String(describing: mode))")
            XCTAssertTrue(facts.contains(.switchKeepsHistory), "\(String(describing: mode))")
            XCTAssertTrue(facts.contains(.switchIsShownInThread), "\(String(describing: mode))")
        }
        XCTAssertTrue(facts("e2ee").contains(.switchNeverResendsInClear))
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

    /// #12918 — la fiche range les vocaux sous « Pas encore disponible » : le
    /// composeur de la même conversation n'offre donc ni micro ni tuile
    /// « Vocal », comme il retire déjà photos et fichiers.
    func test_boutEnBout_leComposeurNOffreAucunGesteQueLaFicheDitIndisponible() {
        let allowance = GuestAttachmentAllowance.unrestricted.sealing(.contentUnsealable)
        let composer = UniversalComposerBar(
            mode: .message,
            forceHideVoice: !allowance.offersVoiceRecording,
            onStartRecording: {}, onStopRecordingToAttachment: {}, onSendRecording: {}, onCancelRecording: {},
            externalIsRecording: false, externalRecordingDuration: 0
        )

        XCTAssertTrue(facts("e2ee").contains(.notYetAttachments), "la fiche dit que vocaux, photos et fichiers attendent")
        XCTAssertFalse(composer.resolvedShowVoice, "aucune entrée vocale")
        XCTAssertFalse(allowance.offersVisualMedia)
        XCTAssertFalse(allowance.offersFiles)
    }

    func test_sansChiffrement_leComposeurGardeLeVocal() {
        let allowance = GuestAttachmentAllowance.unrestricted.sealing(nil)
        let composer = UniversalComposerBar(
            mode: .message,
            forceHideVoice: !allowance.offersVoiceRecording,
            onStartRecording: {}, onStopRecordingToAttachment: {}, onSendRecording: {}, onCancelRecording: {},
            externalIsRecording: false, externalRecordingDuration: 0
        )

        XCTAssertTrue(composer.resolvedShowVoice)
    }

}
