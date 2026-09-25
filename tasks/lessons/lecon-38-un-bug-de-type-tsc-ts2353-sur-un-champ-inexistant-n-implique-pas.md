## Leçon 38 — un bug de type (`tsc` TS2353 sur un champ inexistant) n'implique pas automatiquement l'impact runtime dramatique qu'il semble suggérer — tracer la fenêtre temporelle avant d'écrire le scénario (2026-07-07, routine calling-feature, Vague 25)

Un agent d'audit web a rapporté `apps/web/hooks/use-adaptive-degradation.ts` : les branches catch de
`suspend()`/`resume()` écrivaient `poorStreak: 0`/`goodStreak: 0` — deux champs qui n'existent PAS sur
`DegradationState` (seuls `poorSince`/`goodSince` existent). Le rapport affirmait un scénario dramatique :
un rejet de `resume()` (ex. `getUserMedia()` refusé) laisserait `goodSince` à sa valeur périmée, provoquant
un re-déclenchement immédiat de `resume-video` au tick suivant — martèlement de `getUserMedia()` toutes les
~2s. `tsc --noEmit` confirmait bien 2 erreurs TS2353 réelles (isolées par `git stash` du seul fichier
source : présentes avant, absentes après le fix, aucune erreur nouvelle ailleurs sur le reste du projet).
Mais un test noir reproduisant exactement le scénario proposé **passait identiquement sur le code bogué et
corrigé** — aucune différence de comportement observable. Cause : chaque transition optimiste
(`suspend-video`/`resume-video`) dans `reduceDegradation` met déjà `poorSince`/`goodSince` à `null` de façon
SYNCHRONE avant même l'appel async, et le flag `state.sending` (déjà basculé à sa valeur optimiste au moment
où l'action async démarre) fait que tout tick reçu PENDANT la fenêtre d'attente retombe systématiquement
dans la branche du FSM qui NE touche PAS le champ que le catch tente de réinitialiser (sending=true pendant
l'attente de `resume()` → seule la branche qui manipule `poorSince` est atteignable, jamais celle qui
manipule `goodSince`, et inversement pour `suspend()`). Le champ mal nommé est donc, dans la structure
ACTUELLE du FSM, un no-op runtime pur — un vrai bug de type/dette de code (fragile si `reduceDegradation`
change un jour sa logique de reset optimiste) mais PAS le bug comportemental décrit.

**Règle réutilisable** : une preuve `tsc`/lecture statique ("un champ n'est jamais réinitialisé") ne suffit
pas à valider un scénario de reproduction runtime — tracer explicitement TOUTE la fenêtre temporelle entre
la transition optimiste et le moment où le catch s'exécute (quels ticks/événements peuvent survenir entre
les deux, et dans quelle branche du FSM ils tombent étant donné l'état DÉJÀ optimistement modifié) avant
d'écrire un scénario de reproduction dans un rapport d'audit. Mieux : falsifier empiriquement avec un test
qui s'exécute sur le code bogué ET corrigé (`git stash` du seul fichier source, comme pour n'importe quelle
preuve RED/GREEN) — si le test passe des deux côtés, le scénario n'est pas confirmé, même si le bug de type
sous-jacent est réel et vaut d'être corrigé. Les deux affirmations (bug de type statique / impact runtime
dynamique) sont indépendantes et doivent être vérifiées et rapportées séparément — ne jamais assumer que la
seconde découle automatiquement de la première. Le fix reste justifié (dette de type réelle, corrige un
TS2353, prépare le terrain si le FSM change), mais le rapport final doit refléter la gravité réelle, pas
la gravité initialement supposée par l'agent d'audit.
