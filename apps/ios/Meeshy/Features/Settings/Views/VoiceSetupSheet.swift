import SwiftUI
import MeeshySDK
import MeeshyUI

/// La configuration de la voix présentée PAR-DESSUS une feuille (la vue Langue,
/// #16418) : la même destination que les Réglages ouvrent pour une note de bulle.
struct VoiceSetupSheet: View {
    let destination: VoiceSetupDestination

    var body: some View {
        switch destination {
        case .manageProfile:
            VoiceProfileManageView(accentColor: MeeshyColors.trackingAccentHex, opensWizardWhenEmpty: true)
        case .createProfile:
            VoiceProfileWizardView(accentColor: MeeshyColors.trackingAccentHex)
        case .transcription:
            VoiceTranscriptionSetupView()
        }
    }
}

/// La transcription de ses propres vocaux, seule : le réglage que la passerelle
/// exige à côté du consentement vocal (`AUDIO_TRANSCRIPTION_NOT_ENABLED`).
private struct VoiceTranscriptionSetupView: View {
    @ObservedObject private var prefs: UserPreferencesManager
    @Environment(\.dismiss) private var dismiss

    init(prefs: UserPreferencesManager = .shared) {
        self.prefs = prefs
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Toggle(String(localized: "settings.transcription.mine", defaultValue: "Mes messages vocaux", bundle: .main), isOn: Binding(
                        get: { prefs.audio.transcriptionEnabled },
                        set: { value in prefs.updateAudio { $0.transcriptionEnabled = value } }
                    ))
                    .tint(MeeshyColors.brandPrimary)
                } footer: {
                    Text(String(localized: "settings.transcription.mine.footer", defaultValue: "Transcrits pour être traduits dans la langue de chaque destinataire.", bundle: .main))
                }
            }
            .navigationTitle(String(localized: "settings.section.transcription", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done", defaultValue: "Terminé", bundle: .main)) { dismiss() }
                }
            }
        }
    }
}
