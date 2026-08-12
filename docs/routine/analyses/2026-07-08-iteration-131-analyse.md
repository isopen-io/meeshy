# Iteration 131 — Analyse d'optimisation (2026-07-08)

## Protocole (démarrage)
`main` @ `132c0fa` (dernier merge PR #1641, itération 130). Branche `claude/brave-archimedes-g2yvdr`
recréée depuis `origin/main`. Numérotation : docs `main` jusqu'à **130** → ce cycle prend **131**.

PR ouvertes au démarrage (strictement évitées) : uniquement dependabot (#1549/#1542/#1539/#1536/#1532).
Aucune PR humaine ouverte.

Cible retenue : **F94** — flake CI horaire diagnostiqué à l'itération 130 (le run CI de la PR #1641 a
échoué sur `Test gateway` à ~23:59 UTC ; réussi au re-kick). Bug réel de **fiabilité CI** : il bloque
**toute** PR pendant la minute 23:59 UTC.

## Cible : F94 — tests DND de `NotificationService` dépendants de l'horloge murale

### Current state
`services/gateway/src/__tests__/unit/services/NotificationService.uncovered-paths.test.ts`, describe
`shouldCreateNotification — DND active` (l.386-436) contient trois tests qui lisent l'**horloge système
réelle** :

- l.387 `should return false when DND is active (no time restriction)` — fenêtre `00:00`–`23:59`,
  `dndDays: null`.
- l.402 `should block DND when current day is in dndDays` — `dndDays: [dayMap[new Date().getUTCDay()]]`.
- l.419 `should allow when current day is NOT in dndDays` — `dndDays: [otherDay]`.

`NotificationService.isDNDActive` (l.558-581) évalue la fenêtre diurne par
`currentTime >= start && currentTime < end` (borne haute **exclusive**), avec
`currentTime = HH:MM` en **UTC** courant.

### Problems identified
Les tests l.387 et l.402 utilisent `dndEndTime: '23:59'` comme proxy « toute la journée ». Or la borne
haute est exclusive : à la minute **23:59 UTC**, `'23:59' < '23:59'` est **faux** → `isDNDActive` renvoie
`false` → `shouldCreateNotification` renvoie `true` → les deux `expect(allowed).toBe(false)` échouent.

Preuve terrain : le run CI de la PR #1641 (`Test gateway`, job 85756426717) a échoué exactement sur ces
deux tests ; la suite dure ~5 min 45 s et le log a été écrit à `00:03 UTC`, plaçant l'exécution DND vers
**23:59 UTC**. Le re-kick à ~00:15 UTC est passé (`132c0fa` mergé vert). Flake **strictement horaire** :
une minute par jour.

### Root cause
Les trois tests lisent `new Date()` sans **figer l'horloge**, alors que les tests frères `isDNDActive`
(l.523-560) du **même fichier** figent systématiquement le temps via
`jest.useFakeTimers().setSystemTime(...)`. L'incohérence de pattern est la cause directe : le sous-groupe
`DND active` a été écrit sans horloge figée.

### Business / Technical impact
- **CI** : n'importe quelle PR dont la suite `Test gateway` traverse la minute 23:59 UTC échoue,
  imposant un re-kick manuel — friction récurrente pour tout contributeur, y compris cette routine
  autonome (déjà subie itération 130).
- **Qualité** : test non déterministe = signal CI non fiable. `isDNDActive` lui-même n'est **pas**
  bogué (borne exclusive = choix de conception défendable) ; le défaut est purement côté test.

### Risk assessment
Nul côté production (aucun code de service modifié). Fix **test-only** : figer l'horloge à un instant
déterministe **dans la fenêtre** DND, en miroir exact du pattern déjà présent dans le fichier.

### Proposed improvement
Envelopper les trois tests `DND active` de `jest.useFakeTimers().setSystemTime(new Date('2024-01-15T12:00:00Z'))`
→ `jest.useRealTimers()` (comme l.529-559). Pour les tests dépendant du jour (l.402/419), calculer
`today`/`otherDay` **après** avoir figé l'horloge, à partir du même `new Date()` figé — la sémantique
« jour courant dans/hors dndDays » reste exacte et devient déterministe.

### Expected benefits
- Élimination définitive du flake horaire → `Test gateway` vert quelle que soit l'heure d'exécution.
- Convergence de style : le sous-groupe `DND active` s'aligne sur le pattern d'horloge figée déjà établi
  dans le fichier.

### Implementation complexity
Très faible — 1 fichier de test, 3 tests enveloppés. 0 changement de production.

### Validation criteria
- Les trois tests passent quelle que soit l'heure murale (prouvé en figeant l'horloge à 23:59 UTC : ils
  échouaient avant, passent après).
- Suite `NotificationService.uncovered-paths.test.ts` intégralement verte.
- Zéro changement de comportement de `NotificationService` (aucun code de production touché).
