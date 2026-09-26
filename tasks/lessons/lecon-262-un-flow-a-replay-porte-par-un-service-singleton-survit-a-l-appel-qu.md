## Leçon 262 — un flow à REPLAY porté par un service `@Singleton` survit à l'appel qu'il décrit ; le `close()` doit oublier aussi explicitement qu'il dispose (2026-08-24, routine calling, Vague 173)

**Le constat.** `WebRtcEngine` (Android, `@Singleton`, un seul process pour tous les appels
successifs) expose `remoteVideoTracks` en `MutableSharedFlow<VideoTrack>(replay = 1, …)` — pour
qu'un composable qui recompose EN COURS d'appel retrouve immédiatement la dernière frame sans
attendre un nouvel `onAddTrack`. `close()` dispose soigneusement chaque ressource native
(capturer, surface helper, pistes locales, `peerConnection`, source audio) et remet
`_iceConnectionState` à `NEW` — mais n'a jamais touché `_remoteVideoTracks`. Le buffer de replay
n'est pas une ressource native : rien dans le geste « disposer tout ce qu'on a alloué » ne le
couvre par accident. Le prochain appel, avec un pair DIFFÉRENT, réutilise le même singleton donc le
même flow — son premier abonné (`CallScreen` qui recompose à l'ouverture) reçoit le `VideoTrack`
déjà disposé de l'appel PRÉCÉDENT avant même que le nouveau pair n'émette quoi que ce soit :
`VideoRenderer.addSink()` appelé sur un objet natif déjà libéré, et une frame de l'interlocuteur
d'avant affichée pendant un appel avec quelqu'un d'autre — fuite de confidentialité, pas seulement
un défaut d'affichage.

**Le tell.** `remoteAudioTracks` voisin est en `replay = 0` (défaut) et ne fuit rien — c'est
l'ASYMÉTRIE entre les deux flows côte à côte qui aurait dû alerter : l'un porte une mémoire que
`close()` doit vider, l'autre n'en porte aucune. Un `replay > 0` sur un flow scopé à une session
(un appel, une connexion) est une dette de reset qu'il faut nommer explicitement au moment où on
lit `close()`/`cleanup()` — jamais supposé couvert parce que le reste de la fonction dispose tout
le voisinage.

**La règle.** Extrait dans `RemoteTrackRegistry`, une classe pure (aucune init native WebRTC) qui
porte les deux flows ET leur `reset()` — `WebRtcEngine.close()` appelle `remoteTracks.reset()` à
côté des dispose natifs. Le déplacer hors de `WebRtcEngine` n'est pas cosmétique : `WebRtcEngine`
construit `EglBase.create()` dans son initialiseur de champ, donc instancier la classe réelle dans
un test JVM est impraticable ici (webrtc natif absent) — c'est pourquoi aucun test n'existait pour
`WebRtcEngine` et le bug a survécu sans témoin. Une classe séparée, sans dépendance native,
rétablit la testabilité sans changer le comportement de production.

**CI reality, à nouveau.** `dl.google.com` est refusé par la policy proxy de cette session
(confirmé via `$HTTPS_PROXY/__agentproxy/status` → `connect_rejected` sur `dl.google.com:443`) —
aucun Gradle Android ne tourne ici, exactement la situation documentée par
`apps/android/tasks/android-routine/ROUTINE.md` § « CI reality » pour un autre chantier
(feature-parity Stories). Le verdict vient de `.github/workflows/android.yml`, pas d'ici — dit
explicitement dans le commit plutôt que passé sous silence.
