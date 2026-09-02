import Foundation

/// **Est-ce qu'on a le DROIT de demander un enregistrement à AVFoundation ?**
///
/// ## Le défaut qui la fait naître (2026-09-02)
///
/// Toucher le bouton d'enregistrement du viseur vidéo TUAIT l'application :
///
/// ```
/// *** Terminating app due to uncaught exception 'NSInvalidArgumentException',
/// reason: '*** -[AVCaptureMovieFileOutput startRecordingToOutputFileURL:
/// recordingDelegate:] No active/enabled connections'
/// ```
///
/// `CameraModel.startSegment()` appelait `startRecording(to:recordingDelegate:)`
/// sans condition. Et c'est là que ce défaut se distingue d'un appel qui
/// échoue : **AVFoundation ne rend pas d'erreur ici, il lève une exception
/// Objective-C.** Aucun `do/catch` Swift ne la rattrape, aucun `guard` en aval
/// ne la voit passer. Le seul résultat possible est la mort du processus.
///
/// > Une API qui répond par une exception ObjC n'offre pas le choix entre
/// > « gérer l'erreur » et « prévenir l'erreur ». Il n'y a que la prévention —
/// > et une prévention ne s'écrit qu'à un seul endroit : devant l'appel.
///
/// ## Ce que la règle demande, et pourquoi les quatre
///
/// | condition | ce qui la fait tomber, sur un appareil RÉEL |
/// |---|---|
/// | la session TOURNE | le doigt bat le viseur — la session démarre en tâche de fond |
/// | une connexion vidéo EXISTE | l'entrée vidéo a échoué à s'ajouter ; appareil sans caméra |
/// | elle est ACTIVE | une autre app a préempté la caméra ; session pas en régime |
/// | elle est ACTIVÉE | l'état transitoire d'un changement de caméra |
///
/// Les deux dernières sont ce qu'un simple `connection != nil` aurait laissé
/// passer — et c'est exactement le vocabulaire de l'exception : *no
/// **active/enabled** connections*. La garde reprend les mots de l'erreur
/// plutôt que de les paraphraser.
///
/// ## Pourquoi une règle PURE, pour quatre booléens
///
/// Parce que c'est le seul moyen de l'éprouver. Un `guard` écrit en ligne dans
/// `CameraModel` n'est testable qu'avec une caméra branchée — c'est-à-dire
/// jamais, ni en CI ni au simulateur. La règle sortie, les cinq états se
/// posent en une seconde, et le CÂBLAGE se garde à la source.
///
/// **Le simulateur n'a pas de caméra, donc jamais de connexion vidéo** : il
/// reproduit le premier cas à 100 %. C'est ce qui rend ce défaut vérifiable
/// sans matériel — et ce qui aurait dû le faire trouver le jour de sa
/// livraison.
nonisolated enum CameraRecordingReadiness {

    static func mayStartRecording(sessionIsRunning: Bool,
                                  hasVideoConnection: Bool,
                                  connectionIsActive: Bool,
                                  connectionIsEnabled: Bool) -> Bool {
        sessionIsRunning && hasVideoConnection && connectionIsActive && connectionIsEnabled
    }
}
