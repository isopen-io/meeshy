import Foundation
import MeeshySDK

// MARK: - Transcription vocale

@MainActor
extension StoryComposerViewModel {

    /// Rattache à la slide courante les transcriptions produites par l'éditeur
    /// audio, pour que le lecteur puisse les restituer.
    ///
    /// Sans ce maillon, la chaîne était rompue au dernier mètre :
    /// `AudioEditorController.finalize()` construit bien un
    /// `StoryVoiceTranscription`, `MeeshyAudioEditorView` le transmet à son
    /// `onConfirm` — mais le composer story ignorait le paramètre. Résultat :
    /// `voiceTranscriptions` n'était écrit NULLE PART dans le dépôt, et
    /// l'entrée « Afficher la transcription » du menu « … » ne pouvait
    /// apparaître pour aucune story.
    ///
    /// Fusion par langue plutôt qu'écrasement : enregistrer un vocal français
    /// puis un anglais enrichit le Prisme, alors que ré-enregistrer en français
    /// remplace — laisser une transcription périmée à côté de l'audio
    /// réellement joué serait pire que ne rien afficher.
    func attachVoiceTranscriptions(_ incoming: [StoryVoiceTranscription]) {
        let usable = incoming.filter {
            !$0.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
        guard !usable.isEmpty else { return }

        var merged = currentEffects.voiceTranscriptions ?? []
        for transcript in usable {
            let key = Self.normalisedWritingLanguage(transcript.language)
            if let existing = merged.firstIndex(where: {
                Self.normalisedWritingLanguage($0.language) == key
            }) {
                merged[existing] = transcript
            } else {
                merged.append(transcript)
            }
        }

        var effects = currentEffects
        effects.voiceTranscriptions = merged
        currentEffects = effects
    }
}
