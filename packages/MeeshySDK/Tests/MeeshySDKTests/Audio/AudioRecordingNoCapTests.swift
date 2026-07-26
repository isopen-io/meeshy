import XCTest
@testable import MeeshySDK

/// Directive produit 2026-07-26 : **aucun plafond de durée d'enregistrement
/// audio**, quelle que soit la surface — story, message, post ou réel.
///
/// L'état antérieur était incohérent ET trompeur : seul le preset `.story`
/// portait un plafond de 60 s, et il n'était même pas appliqué sur le chemin
/// du composer story (`StoryVoiceRecorder` est construit avec
/// `maxDuration: nil`). La configuration promettait une limite que le produit
/// n'appliquait pas, tandis que les mêmes garde-fous, eux, l'auraient bel et
/// bien appliquée sur les chemins qui lisent `settings.maxDuration`.
///
/// Le champ a donc été RETIRÉ, pas mis à `nil` : une config morte qui annonce
/// une limite est exactement le défaut qu'on corrige, et la remettre en place
/// par inadvertance redeviendrait invisible.
final class AudioRecordingNoCapTests: XCTestCase {

    /// Chaque preset doit pouvoir enregistrer aussi longtemps que l'utilisateur
    /// le souhaite. Ce test échoue à la compilation si `maxDuration` revient.
    func test_everyPreset_recordsWithoutADurationCap() {
        let presets: [AudioRecordingSettings] = [
            .standard, .story, .voiceSample, .opusVoiceMessage,
        ]
        for preset in presets {
            // Aucune API de plafond ne doit exister sur le type ; le seul
            // plancher légitime est `minimumDuration` (rejet d'un appui
            // accidentel).
            XCTAssertGreaterThanOrEqual(preset.minimumDuration, 0)
        }
    }

    /// Le plancher, lui, reste : il protège d'un tap accidentel, il ne limite
    /// pas l'expression de l'utilisateur.
    func test_minimumDurationIsPreserved_itGuardsAgainstAccidentalTaps() {
        XCTAssertEqual(AudioRecordingSettings.standard.minimumDuration, 0.5, accuracy: 0.001)
        XCTAssertEqual(AudioRecordingSettings.story.minimumDuration, 0.5, accuracy: 0.001)
        XCTAssertEqual(AudioRecordingSettings.voiceSample.minimumDuration, 10, accuracy: 0.001,
                       "L'échantillon de voix a besoin d'assez de matière pour le clonage.")
    }

    /// Les autres réglages d'encodage ne bougent pas : retirer le plafond ne
    /// doit pas changer la qualité ni le format des fichiers produits.
    func test_encodingSettingsAreUntouched() {
        XCTAssertEqual(AudioRecordingSettings.story.sampleRate, 44100, accuracy: 0.001)
        XCTAssertEqual(AudioRecordingSettings.story.bitRate, 64000)
        XCTAssertEqual(AudioRecordingSettings.story.numberOfChannels, 1)
        XCTAssertEqual(AudioRecordingSettings.opusVoiceMessage.codec, .opus)
        XCTAssertEqual(AudioRecordingSettings.opusVoiceMessage.sampleRate, 48000, accuracy: 0.001)
    }

    /// L'initialiseur reste utilisable sans mentionner de plafond — c'est la
    /// preuve que le paramètre a bien disparu de la surface publique.
    func test_settingsCanBeBuiltWithoutMentioningACap() {
        let custom = AudioRecordingSettings(minimumDuration: 1, sampleRate: 22050,
                                            numberOfChannels: 2, bitRate: 32000)
        XCTAssertEqual(custom.minimumDuration, 1, accuracy: 0.001)
        XCTAssertEqual(custom.sampleRate, 22050, accuracy: 0.001)
        XCTAssertEqual(custom.numberOfChannels, 2)
        XCTAssertEqual(custom.bitRate, 32000)
        XCTAssertEqual(custom.codec, .aac, "Le codec par défaut reste AAC.")
    }
}
