import XCTest
@testable import Meeshy

/// **Retirer ses AirPods pendant un appel sous-titré TUAIT l'application**
/// (audit iOS du 2026-09-18, issue #7002).
///
/// ```
/// *** Terminating app due to uncaught exception 'com.apple.coreaudio.avfaudio',
/// reason: 'required condition is false:
/// IsFormatSampleRateAndChannelCountValid(format)'
///   3  Meeshy  CallTranscriptionService.reinstallTap(for:)
///   4  Meeshy  CallTranscriptionService.handleAudioEngineConfigurationChange()
/// ```
///
/// `startLocalCapture()` et `reinstallTap(for:)` posaient
/// `installTap(onBus: 0, format: inputNode.outputFormat(forBus: 0))` **sans
/// condition**. Quand la session audio n'est plus active ou que la route micro
/// vient de disparaître, `outputFormat(forBus:)` rend un format à **0 Hz et
/// 0 canal** — et AVAudioEngine ne rend alors pas d'erreur : il lève une
/// exception Objective-C, qu'aucun `do/catch` Swift ne rattrape.
///
/// > Une API qui répond par une exception ObjC n'offre pas le choix entre
/// > « gérer l'erreur » et « prévenir l'erreur ». Il n'y a que la prévention —
/// > et une prévention ne s'écrit qu'à un seul endroit : devant l'appel.
/// > (Même leçon que `CameraRecordingReadiness`, #6984.)
///
/// ## Pourquoi c'est un geste COURANT, pas une manipulation
///
/// `reinstallTap` est rejoué à CHAQUE `.AVAudioEngineConfigurationChange` et à
/// chaque fin d'interruption — c'est-à-dire précisément quand le format est le
/// plus souvent invalide : AirPods retirés ou connectés, écouteurs branchés,
/// appel GSM entrant, Siri, alarme. La fenêtre est courte, l'occasion est
/// quotidienne.
///
/// ## Pourquoi une règle PURE
///
/// Un `guard` écrit en ligne dans le service n'est éprouvable qu'avec un vrai
/// `AVAudioEngine` — indisponible dans l'hôte de test (voir le commentaire de
/// `applyRecognitionResult`). La règle sortie, les cas se posent en une
/// seconde, et le CÂBLAGE se garde à la source.
final class AudioTapFormatReadinessTests: XCTestCase {

    // MARK: - La règle

    func test_unFormatNominal_autoriseLaPose() {
        XCTAssertTrue(AudioTapFormatReadiness.mayInstall(sampleRate: 48_000, channelCount: 1))
        XCTAssertTrue(AudioTapFormatReadiness.mayInstall(sampleRate: 44_100, channelCount: 2))
        XCTAssertTrue(AudioTapFormatReadiness.mayInstall(sampleRate: 16_000, channelCount: 1))
    }

    /// Le cas MESURÉ : la route micro vient de disparaître, `outputFormat`
    /// rend 0 Hz / 0 canal. C'est celui qui tuait le processus.
    func test_unFormatVide_refuse() {
        XCTAssertFalse(AudioTapFormatReadiness.mayInstall(sampleRate: 0, channelCount: 0))
    }

    /// **Les deux conditions sont INDÉPENDANTES** — le nom de l'exception les
    /// nomme toutes les deux (`IsFormatSampleRateAndChannelCountValid`). Un
    /// format peut porter une fréquence pendant que le compte de canaux
    /// retombe à zéro : c'est l'état transitoire d'un changement de route.
    func test_uneFrequenceSeule_neSuffitPas() {
        XCTAssertFalse(AudioTapFormatReadiness.mayInstall(sampleRate: 48_000, channelCount: 0))
    }

    func test_desCanauxSeuls_neSuffisentPas() {
        XCTAssertFalse(AudioTapFormatReadiness.mayInstall(sampleRate: 0, channelCount: 1))
    }

    /// Une fréquence NÉGATIVE ou non finie n'arrive pas d'un micro, mais elle
    /// arrive d'un `outputFormat` interrogé sur un nœud dont le moteur est en
    /// train d'être reconfiguré. La règle refuse tout ce qui n'est pas un
    /// nombre strictement positif et fini.
    func test_uneFrequenceNegativeOuNonFinie_refuse() {
        XCTAssertFalse(AudioTapFormatReadiness.mayInstall(sampleRate: -48_000, channelCount: 1))
        XCTAssertFalse(AudioTapFormatReadiness.mayInstall(sampleRate: .nan, channelCount: 1))
        XCTAssertFalse(AudioTapFormatReadiness.mayInstall(sampleRate: .infinity, channelCount: 1))
    }

    // MARK: - Le CÂBLAGE, faute de pouvoir monter un AVAudioEngine en test

    private func serviceSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallTranscriptionService.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// **Les DEUX seuls `installTap` du dépôt sont précédés de la règle.** Une
    /// garde posée ailleurs que devant l'appel laisserait exactement le chemin
    /// qui a tué le processus.
    func test_lesDeuxPosesDeTap_sontGardeesParLaRegle() throws {
        let source = try serviceSource()
        let poses = source.components(separatedBy: "installTap(onBus: 0, bufferSize:").count - 1
        XCTAssertEqual(poses, 2,
                       "Un troisième site de pose devrait porter sa propre garde — la garde suit l'appel, pas la fonction.")
        for fonction in ["private func startLocalCapture() throws {",
                         "private func reinstallTap(for newRequest:"] {
            guard let debut = source.range(of: fonction),
                  let fin = source.range(of: "installTap(onBus: 0, bufferSize:",
                                         range: debut.upperBound..<source.endIndex) else {
                return XCTFail("\(fonction) ne contient plus l'appel gardé.")
            }
            let corps = String(source[debut.upperBound..<fin.lowerBound])
            XCTAssertTrue(corps.contains("AudioTapFormatReadiness.mayInstall"),
                          "La garde doit précéder l'appel DANS \(fonction), pas seulement exister dans le fichier.")
        }
    }

    /// **Un tap refusé RETIRE les sous-titres, il ne laisse pas l'interrupteur
    /// allumé au-dessus d'un moteur muet.** C'est la même dégradation que
    /// celle déjà écrite pour un `audioEngine.start()` qui échoue : sans elle,
    /// `isTranscribing` resterait vrai et l'écran continuerait d'annoncer des
    /// sous-titres que plus rien n'alimente.
    func test_unTapRefuse_retireLesSousTitres() throws {
        let source = try serviceSource()
        XCTAssertTrue(source.contains("case tapFormatUnavailable"),
                      "Le refus doit avoir une erreur NOMMÉE, pas un return muet.")
        XCTAssertTrue(source.contains("applyRecognitionError(.tapFormatUnavailable"),
                      "Le refus doit passer par la dégradation explicite qui éteint isTranscribing.")
    }

    /// **`reinstallTap` REND son verdict, et ses trois appelants en tiennent
    /// compte.** Sans cela, le changement de configuration, la fin
    /// d'interruption et la rotation de requête repartiraient démarrer un
    /// moteur sur un tap qui n'existe pas.
    func test_lesTroisAppelantsDeReinstallTap_lisentSonVerdict() throws {
        let source = try serviceSource()
        let gardes = source.components(separatedBy: "guard reinstallTap(for:").count - 1
        XCTAssertEqual(gardes, 3,
                       "Les trois appelants (configuration, interruption, rotation) doivent lire le verdict.")
    }
}
