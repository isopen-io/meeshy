## Leçon 281 — un correctif câblé sur UN point d'entrée laisse son JUMEAU exactement où il était (2026-08-24, routine appels)

**Contexte.** La leçon 278 (même jour) a armé `startBackgroundMonitoring()` dans
`handleIncomingCallNotification()` — le chemin socket d'un appel entrant — parce
que l'observateur `didEnterBackground` n'était armé qu'à `transitionToConnected()`,
rendant `promoteRingingCallToCallKitIfNeeded()` inatteignable pendant toute la
fenêtre de sonnage. Le correctif a été posé au SEUL site inspecté.

**Le défaut.** `reportIncomingVoIPCall()` (`CallManager.swift`) est le JUMEAU exact
de `handleIncomingCallNotification()` — même forme (`.ringing(isOutgoing: false)`,
`configureAudioSession()` + `startReliabilityMonitor()` au même endroit), même
raison d'exister (l'entrée d'un appel entrant via push VoIP plutôt que socket) —
et n'appelait PAS `startBackgroundMonitoring()`. `promoteRingingCallToCallKitIfNeeded()`
y est un no-op (`callUsesCallKit = true` inconditionnellement pour ce chemin,
Apple l'exige), mais l'observateur porte DEUX autres effets, tous les deux vivants
pour un appel encore sonnant : `applyCameraSuspension(false, cause: "foreground")`
— le filet de sécurité documenté pour le cas où le signal de fin d'interruption
caméra n'arrive jamais tant que l'app est en arrière-plan — et l'émission
`call:backgrounded`/`call:foregrounded` vers le pair. Sans observateur armé, un
appel vidéo reçu par push VoIP qui se met en arrière-plan avant d'être décroché
peut entrer en appel connecté avec la caméra restée suspendue, et le pair
n'apprend jamais que l'appelé est passé en arrière-plan puis revenu.

**Pourquoi ça a survécu au correctif du jour même.** La leçon 278 nommait déjà le
motif — « l'armement au CONNECT ne peut pas couvrir une fenêtre qui se ferme avant
le connect » — mais l'a vérifié sur UN SEUL des deux points d'entrée d'appel
entrant. Le test qui l'a fixé (`test_handleIncomingCallNotification_armsBackgroundMonitoring_...`)
n'inspecte que le corps de cette fonction ; rien n'énumérait « quels autres sites
ont la même forme et ont donc besoin du même correctif ».

> **Un correctif vérifié par un test qui n'inspecte QUE le site corrigé ne peut
> pas voir son jumeau.** Avant de clore un correctif de lifecycle/timing, chercher
> les AUTRES points d'entrée qui partagent la même forme (`grep` la fonction
> voisine appelée juste avant/après dans le site corrigé — ici `configureAudioSession()`
> + `startReliabilityMonitor()`) et vérifier qu'ils reçoivent le même geste. C'est
> la forme de la leçon 279 (« un lot qui converge une chaîne laisse derrière ce qui
> la qualifie ») rejouée sur un armement au lieu d'un champ de charge.

**Le correctif.** `startBackgroundMonitoring()` ajouté dans `reportIncomingVoIPCall()`,
au même point relatif que dans `handleIncomingCallNotification()` (après
`startReliabilityMonitor()`, avant `joinCallRoomReliably()`). Témoin :
`test_reportIncomingVoIPCall_armsBackgroundMonitoring_soAStillRingingCallCanRecoverFromBackgrounding`
(`CallManagerAudioSessionTests.swift`), même forme d'assertion source-string que
son jumeau.

---
