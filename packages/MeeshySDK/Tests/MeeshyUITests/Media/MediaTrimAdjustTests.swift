import XCTest
@testable import MeeshyUI
import MeeshySDK

/// **« Rogner et régler » — un seul composant pour le son (A15), la vidéo
/// (O8) et la retouche d'une pièce (C2)** (#17110). Tout ce qu'il décide
/// se prouve ici, sans monter une vue.
@MainActor
final class MediaTrimAdjustTests: XCTestCase {

    private let posix = Locale(identifier: "en_US_POSIX")

    // MARK: - Le relevé « 0:02 / Gardé 0:07 / 0:09 »

    func test_readout_litLaTeteLaDureeGardeeEtLaSource() {
        let releve = MediaTrimReadout(playhead: 2.2, bounds: MediaTrimBounds(start: 1, end: 8),
                                      sourceDuration: 9, locale: posix)
        XCTAssertEqual(releve.position, "0:02")
        XCTAssertEqual(releve.keptDuration, "0:07")
        XCTAssertEqual(releve.total, "0:09")
        XCTAssertTrue(releve.kept.contains("0:07"), "« Gardé 0:07 » porte la durée gardée")
    }

    func test_readout_sansTete_litLeDebutDeLaFenetre() {
        let releve = MediaTrimReadout(playhead: nil, bounds: MediaTrimBounds(start: 3, end: 8),
                                      sourceDuration: 9, locale: posix)
        XCTAssertEqual(releve.position, "0:03")
    }

    func test_readout_bornesLaTeteDansLaSource() {
        let releve = MediaTrimReadout(playhead: 42, bounds: MediaTrimBounds(start: 0, end: 9),
                                      sourceDuration: 9, locale: posix)
        XCTAssertEqual(releve.position, "0:09", "une tête hors du fichier ne se lit pas au-delà")
    }

    // MARK: - La tête

    func test_playheadFraction_estBorneeEtSureSurUneSourceVide() {
        XCTAssertEqual(MediaTrimPlayhead.fraction(at: 4.5, sourceDuration: 9), 0.5, accuracy: 0.0001)
        XCTAssertEqual(MediaTrimPlayhead.fraction(at: -3, sourceDuration: 9), 0)
        XCTAssertEqual(MediaTrimPlayhead.fraction(at: 30, sourceDuration: 9), 1)
        XCTAssertEqual(MediaTrimPlayhead.fraction(at: 3, sourceDuration: 0), 0)
        XCTAssertEqual(MediaTrimPlayhead.fraction(at: .nan, sourceDuration: 9), 0)
    }

    func test_playheadTime_reciproqueDeLaFraction() {
        XCTAssertEqual(MediaTrimPlayhead.time(atX: 150, width: 300, sourceDuration: 9), 4.5, accuracy: 0.0001)
        XCTAssertEqual(MediaTrimPlayhead.time(atX: 900, width: 300, sourceDuration: 9), 9)
        XCTAssertEqual(MediaTrimPlayhead.time(atX: 10, width: 0, sourceDuration: 9), 0)
    }

    // MARK: - Les réglages : Volume, Muet, Boucle, Atténuer sous les voix

    func test_reglages_parDefaut_laissentLeNiveauDuFichier() {
        let neutre = MediaTrimAdjustments.neutral
        XCTAssertEqual(neutre.volume, 1)
        XCTAssertFalse(neutre.isMuted)
        XCTAssertFalse(neutre.loops)
        XCTAssertTrue(neutre.ducksUnderVoices, "l'atténuation est active tant qu'on ne la coupe pas")
        XCTAssertEqual(neutre.audibleGain(slideDucks: false), 1, accuracy: 0.0001)
    }

    func test_reglages_muet_rendUnGainNul_quelQueSoitLeVolume() {
        let muet = MediaTrimAdjustments(volume: 1.6, isMuted: true, loops: false, ducksUnderVoices: true)
        XCTAssertEqual(muet.audibleGain(slideDucks: true), 0)
    }

    func test_reglages_attenuerSousLesVoix_passeParLeResolveurUnique() {
        let reglage = MediaTrimAdjustments(volume: 0.8, isMuted: false, loops: false, ducksUnderVoices: true)
        XCTAssertEqual(reglage.audibleGain(slideDucks: true),
                       StoryVolumeResolver.ducked(0.8, isDucking: true), accuracy: 0.0001)
        let sansAttenuation = MediaTrimAdjustments(volume: 0.8, isMuted: false, loops: false, ducksUnderVoices: false)
        XCTAssertEqual(sansAttenuation.audibleGain(slideDucks: true), 0.8, accuracy: 0.0001,
                       "couper l'atténuation la coupe pour CE média")
    }

    func test_reglages_volumeBorneAuPlafondDeLaPasserelle() {
        let fort = MediaTrimAdjustments(volume: 9, isMuted: false, loops: false, ducksUnderVoices: false)
        XCTAssertEqual(fort.audibleGain(slideDucks: false), StoryVolume.maxGain)
    }

    func test_reglages_seLisentDepuisLeModeleEtSyEcrivent() {
        let media = MediaTrimAdjustments(volume: 0.5, isMuted: true, loops: true, isDuckingDisabled: true)
        XCTAssertFalse(media.ducksUnderVoices)
        XCTAssertEqual(media.isDuckingDisabled, true)
        XCTAssertNil(MediaTrimAdjustments.neutral.isDuckingDisabled,
                     "« atténuation active » ne s'écrit pas : nil garde le bénéfice rétroactif")
    }

    /// Le curseur est UN atome (`MediaVolumeSlider`), partagé avec le cadran
    /// « Volume » du composer : sa valeur s'écrit au pour-cent arrondi.
    func test_volumeSlider_ecritLeVolumeAuPourCentArrondi() {
        XCTAssertEqual(MediaVolumeSlider.valueText(1), (1.0).formatted(.percent.precision(.fractionLength(0))))
        XCTAssertEqual(MediaVolumeSlider.valueText(1.404), (1.4).formatted(.percent.precision(.fractionLength(0))))
        XCTAssertEqual(MediaVolumeSlider.valueText(.nan), (0.0).formatted(.percent.precision(.fractionLength(0))))
    }

    // MARK: - Ce que chaque surface montre

    func test_options_leSonPorteLaLangueEtTranscrire_laVideoNon() {
        XCTAssertTrue(MediaTrimOptions.sound.contains(.language))
        XCTAssertTrue(MediaTrimOptions.sound.contains(.transcribe))
        XCTAssertFalse(MediaTrimOptions.video.contains(.language))
        XCTAssertFalse(MediaTrimOptions.video.contains(.transcribe))
        for surface in [MediaTrimOptions.sound, .video] {
            XCTAssertTrue(surface.isSuperset(of: [.volume, .mute, .loop, .ducking]),
                          "le son et la vidéo d'une story se règlent de la même façon")
        }
        XCTAssertEqual(MediaTrimOptions.piece, [.volume, .mute],
                       "une pièce de conversation n'a ni boucle ni voix à couvrir")
    }

    // MARK: - Un seul rogneur (garde de source)

    /// **Un second rogneur est un échec de revue** (retour porteur
    /// 2026-11-08) : le son, la vidéo et la pièce passent par `MediaTrimStrip`.
    func test_garde_aucunAutreRogneurNExisteDansLeSDK() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources")
        let fichiers = try XCTUnwrap(FileManager.default.enumerator(at: racine, includingPropertiesForKeys: nil))
            .compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
        XCTAssertFalse(fichiers.isEmpty, "la garde doit balayer quelque chose")
        let interdits = ["struct MeeshyAudioTrimmer", "enum ComposerTrimThumbnails"]
        for fichier in fichiers {
            let code = try String(contentsOf: fichier, encoding: .utf8)
            for interdit in interdits {
                XCTAssertFalse(code.contains(interdit), "\(fichier.lastPathComponent) rouvre \(interdit)")
            }
            let rogneurs = code.components(separatedBy: "\n").filter {
                $0.range(of: #"(struct|class)\s+\w*(Trimmer|TrimStrip)\w*\s*[:<]"#, options: .regularExpression) != nil
            }
            let autorises = rogneurs.filter { !$0.contains("MediaTrimStrip") }
            XCTAssertTrue(autorises.isEmpty, "\(fichier.lastPathComponent) déclare un second rogneur : \(autorises)")
            let pistes = code.components(separatedBy: "\n").filter {
                $0.range(of: #"(struct|class)\s+(?!Meeshy|Composer)\w*TrimTrack\w*\s*[:<]"#, options: .regularExpression) != nil
            }
            XCTAssertTrue(pistes.isEmpty, "\(fichier.lastPathComponent) déclare une seconde piste de coupe : \(pistes) — `MeeshyTrimTrack` est la seule du kit")
        }
    }
}
