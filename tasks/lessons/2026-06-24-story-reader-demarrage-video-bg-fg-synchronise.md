## 2026-06-24 — Story reader : démarrage vidéo bg/fg synchronisé

1. **Une vidéo foreground NE DOIT PAS démarrer dès l'attach — elle attend le « GO » du canvas.** `StoryMediaLayer.attachPlayer` jouait `player.play()` inconditionnellement en `.play`, donc une vidéo foreground attachée avant le content-ready démarrait EN AVANCE sur la vidéo de fond + l'audio (désync de démarrage). Le fond avait déjà ce gate (`StoryBackgroundLayer.isPlaybackActive`) ; le foreground ne l'avait pas — asymétrie exposée par le merge qui a fait démarrer le fond sans attendre le foreground (PR #915 / `257493438`).

2. **Invariant : fond, foreground et mixer audio démarrent au MÊME instant (content-ready).** Source de vérité côté canvas : `foregroundVideosPlaybackActive`, tenu en phase avec `backgroundLayer.isPlaybackActive` à chaque transition (GO, pause/resume, lifecycle, start/stopPlayback, préemption). Sticky + re-propagé dans `rebuildLayers()` pour qu'une vidéo dont les octets arrivent APRÈS le GO démarre immédiatement à son tour.

3. **Mirror le pattern background quand on ajoute un média gated.** `isPlaybackActive` (intention sticky) + `handleAppLifecycle(active:)` (pause/reprise transitoire respectant l'intention) doivent exister des DEUX côtés. Un `forEachAVPlayer { play/pause }` direct ne suffit pas : il n'affecte que les players déjà attachés, pas l'intention que consulte le prochain attach.
