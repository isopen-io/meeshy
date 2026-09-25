## 2026-06-12 : AudioRecorderManager reste app-side — pas d'unification avec DefaultSDKAudioRecorder

**Statut**: Accepte
**Contexte**: L'audit lifecycle 2026-06-12 a corrige le meme bug (deinit CleanupHandle, self-stop a maxDuration) en double dans `AudioRecorderManager` (app) et `DefaultSDKAudioRecorder` (SDK core) — les deux conforment a `AudioRecordingProviding` et partagent ~80 % de leur code (metering, level history, timer, stop/cancel). La revue a propose de supprimer la copie app au profit du recorder SDK.

**Decision**: Les deux classes coexistent, MAIS la duplication mecanique est reduite :
- Le dictionnaire AVAudioRecorder est desormais derive de `AudioRecordingSettings.avRecorderSettings` (source unique SDK) dans les DEUX classes — plus de dict construit a la main cote app.
- Ce qui reste duplique est **volontairement app-side** car c'est de la politique produit (test du grain, SDK Purity) : session `.voiceChat` + `.allowBluetoothHFP` (audit P1-10 — chaine EC/AGC/NS, eviter le flap A2DP→HFP), refus de demarrer pendant un appel via `CallManager.shared.callState` (singleton app), rollback A3 de session sur echec d'init, callback `onMaxDurationReached` pour l'UX composer. Le recorder SDK passe par `MediaSessionCoordinator.activateRecordingSync` avec la config generique.

**Regle d'entretien**: tout fix de MECANIQUE d'enregistrement (timer, metering, deinit, fichiers) doit etre applique aux deux classes (chercher « aligné sur DefaultSDKAudioRecorder » dans le code). Tout changement de POLITIQUE session reste cote app uniquement.

**Alternatives rejetees**:
- **Suppression de la copie app / composition** : exigerait de remonter la politique session (.voiceChat/HFP, garde CallManager) dans le SDK — violation directe de la regle SDK Purity (le SDK ne lit pas les singletons produit, n'encode pas « quand faire X ») et du precedent AttachmentDownloader (rollback 83e55297c).
- **Sous-classement** : `DefaultSDKAudioRecorder` est `final` par design (pas d'inheritance dans le SDK) ; l'ouvrir pour un seul consommateur inverse le rapport cout/benefice.
