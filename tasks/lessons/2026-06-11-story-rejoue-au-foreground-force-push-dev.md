## 2026-06-11 — Story rejoue au foreground + force-push dev

27. **Reprise foreground d'un média : TOUJOURS gater sur `window != nil` ET sur le drapeau d'autorisation canonique (`isPlaybackActive`), pas seulement sur le mode.** `handleDidBecomeActive` ne vérifiait `window` que pour l'audio mixer → un canvas `.play` retenu hors écran rejouait sa vidéo/audio à la réouverture de l'app. Et `handleAppLifecycle(active: true)` court-circuitait le gate. Preuve/validation : grep CoreMedia `SetRateAndAnchorTime` (rate=1 au foreground avant fix, plus aucun après).

28. **Avant tout `push --force-with-lease` sur `dev` : `git fetch` PUIS vérifier `git log main..origin/dev`** — un agent parallèle peut avoir mergé une PR sur dev uniquement (PR #570 écrasée puis réintégrée par merge `cb3cd8a9e`). Le lease ne protège que contre ce qu'on a déjà VU ; il faut regarder ce qu'on s'apprête à effacer.
