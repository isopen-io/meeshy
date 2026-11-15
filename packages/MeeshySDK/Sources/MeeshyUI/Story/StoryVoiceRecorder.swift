import SwiftUI
import MeeshySDK

// MARK: - Story Voice Recorder (alias de compatibilité)

/// La feuille d'enregistrement des stories EST la feuille unifiée depuis
/// 2026-08-13 (`AudioRecorderSheet`, MeeshyUI/Media) — stories, posts
/// et réels partagent le même composant. L'alias préserve les call sites et
/// tests existants ; le nouveau code cible directement le nom unifié.
@available(*, deprecated, renamed: "AudioRecorderSheet")
public typealias StoryVoiceRecorder<Recorder> = AudioRecorderSheet<Recorder>
    where Recorder: AudioRecordingProviding

/// Ancien nom de la rangée de chips « Fichiers / Bibliothèque ».
typealias StoryVoiceRecorderSourceChips = AudioRecorderSourceChips
