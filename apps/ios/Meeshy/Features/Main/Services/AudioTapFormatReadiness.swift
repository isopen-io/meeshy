import Foundation

/// **A-t-on le DROIT de poser un tap sur ce format audio ?**
///
/// ## Le défaut qui la fait naître (2026-09-18, #7002)
///
/// Retirer ses AirPods pendant un appel sous-titré tuait l'application :
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
/// `installTap(onBus: 0, format: inputNode.outputFormat(forBus: 0))` sans
/// condition. Quand la session audio n'est plus active ou que la route micro
/// vient de disparaître, `outputFormat(forBus:)` rend un format à **0 Hz et
/// 0 canal** — et c'est là que ce défaut se distingue d'un appel qui échoue :
/// **AVAudioEngine ne rend pas d'erreur ici, il lève une exception
/// Objective-C.** Aucun `do/catch` Swift ne la rattrape, aucun `guard` en aval
/// ne la voit passer. Le seul résultat possible est la mort du processus.
///
/// > Une API qui répond par une exception ObjC n'offre pas le choix entre
/// > « gérer l'erreur » et « prévenir l'erreur ». Il n'y a que la prévention —
/// > et une prévention ne s'écrit qu'à un seul endroit : devant l'appel.
///
/// C'est la leçon de `CameraRecordingReadiness` (#6984), portée d'AVFoundation
/// capture à AVAudioEngine.
///
/// ## Pourquoi c'est un geste COURANT
///
/// `reinstallTap` est rejoué à CHAQUE `.AVAudioEngineConfigurationChange` et à
/// chaque fin d'interruption — c'est-à-dire précisément quand le format est le
/// plus souvent invalide :
///
/// | ce que fait l'utilisateur | ce que devient `outputFormat(forBus: 0)` |
/// |---|---|
/// | retire ses AirPods | la route d'entrée disparaît le temps du basculement |
/// | branche des écouteurs | le matériel se reconfigure, le nœud est transitoire |
/// | reçoit un appel GSM | iOS désactive la session ; le nœud rend 0 Hz |
/// | déclenche Siri, une alarme | même interruption, même fenêtre |
///
/// La fenêtre est courte, l'occasion est quotidienne.
///
/// ## Pourquoi les DEUX conditions
///
/// Le nom de l'exception les nomme toutes les deux :
/// *IsFormat**SampleRate**And**ChannelCount**Valid*. Un format peut porter une
/// fréquence pendant que le compte de canaux retombe à zéro — c'est l'état
/// transitoire d'un changement de route. La règle reprend les mots de l'erreur
/// plutôt que de les paraphraser.
///
/// `sampleRate` doit être un nombre **fini et strictement positif** : un nœud
/// interrogé pendant la reconfiguration de son moteur peut rendre `nan` ou
/// `infinity`, que `> 0` seul laisserait passer pour l'infini.
///
/// ## Pourquoi une règle PURE, pour deux nombres
///
/// Parce que c'est le seul moyen de l'éprouver. Un `guard` écrit en ligne dans
/// `CallTranscriptionService` n'est testable qu'avec un vrai `AVAudioEngine` —
/// indisponible dans l'hôte de test unitaire (voir le commentaire de
/// `applyRecognitionResult`). La règle sortie, les cas se posent en une
/// seconde, et le CÂBLAGE se garde à la source
/// (`AudioTapFormatReadinessTests`).
nonisolated enum AudioTapFormatReadiness {

    /// `channelCount` est un `UInt32` parce que c'est le type
    /// d'`AVAudioFormat.channelCount` (`AVAudioChannelCount`) : la règle prend
    /// la valeur telle que le format la porte, sans conversion qui pourrait
    /// masquer un zéro.
    static func mayInstall(sampleRate: Double, channelCount: UInt32) -> Bool {
        sampleRate.isFinite && sampleRate > 0 && channelCount > 0
    }
}
