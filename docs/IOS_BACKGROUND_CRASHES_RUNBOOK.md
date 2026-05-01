# iOS — Runbook de diagnostic des crashes en arriere-plan

> **Branche** : `claude/fix-ios-background-crashes-ww9IB`
> **Etat** : pipeline de diagnostic deploye (commits `9afa3f0` + `865d93d`). Aucun fix de cause-racine encore applique — on attend les premiers rapports.

## 1. Contexte

L'app iOS plante regulierement en arriere-plan sans qu'aucune information ne remonte. Apres audit :

- `FirebaseCrashlytics` est **declare dans `Package.swift`** mais **jamais importe ni initialise** (aucun `import Firebase`, aucun `FirebaseApp.configure()`, aucun `GoogleService-Info.plist`).
- Aucun `MXMetricManager`, aucun `NSSetUncaughtExceptionHandler`, aucun signal handler.
- Resultat : tous les crashes background sont silencieusement perdus.

Sans donnee, toute correction sur les sites suspects (timers, audio session, sockets, NWPathMonitor) est de la speculation.

**La seule premiere etape rentable est de capturer les crashes.** C'est ce qui a ete deploye.

## 2. Ce qui a ete deploye

| Fichier | Role |
|---------|------|
| `apps/ios/Meeshy/Features/Main/Services/CrashDiagnosticsManager.swift` | Singleton `@MainActor` qui s'abonne a `MXMetricManager` (crashes / hangs / CPU / disk-write) et installe `NSSetUncaughtExceptionHandler`. Persiste les diagnostics en JSON dans `Documents/crash_diagnostics/`. |
| `apps/ios/Meeshy/Features/Main/Services/Logger+Categories.swift` | Nouvelle categorie `Logger.crash` (subsystem `me.meeshy.app`, category `crash`). |
| `apps/ios/Meeshy/AppDelegate.swift` | Appelle `CrashDiagnosticsManager.shared.install()` des `didFinishLaunchingWithOptions`. |
| `apps/ios/Meeshy/MeeshyApp.swift` | `surfacePendingCrashReports()` en fin de `.task` : drain + log via `Logger.crash` + toast. |

**Garanties :**
- Zero dependance externe (pas de Firebase, pas de compte tiers, pas d'entitlement supplementaire).
- Capture chainee : si une integration Crashlytics/Sentry est ajoutee plus tard, elle ne sera pas masquee.
- GC automatique des fichiers au-dela de 50 (cap) — pas de fuite disque sur un crash loop.
- Re-scan disque a chaque `consumePending()` — les diagnostics MetricKit livres en pleine session ne sont pas perdus.

## 3. Validation immediate du pipeline (~10 min)

**But** : verifier que la chaine complete capture > persiste > surface > log fonctionne, sans attendre un vrai crash background.

### 3.1 Provoquer une `NSException` controlee

Ajouter temporairement un bouton de test dans une vue debug, par exemple dans `SettingsView.swift` ou `DebugMenuView.swift` :

```swift
Button("Test Crash") {
    NSException(
        name: .init("MeeshyTestCrash"),
        reason: "Validation du pipeline CrashDiagnostics",
        userInfo: nil
    ).raise()
}
```

### 3.2 Sequence de test

1. `./apps/ios/meeshy.sh run` (build + install + launch sur simulateur)
2. Naviguer jusqu'au bouton, taper dessus → l'app crashe
3. Relancer l'app via le simulateur
4. **Attendu :**
   - Au demarrage, dans Console.app filtre `subsystem:me.meeshy.app category:crash` → ligne `Restored nsException @ <timestamp>: MeeshyTestCrash: Validation du pipeline...`
   - Apres splash + session check, un toast bleu : `"Exception precedent : MeeshyTestCrash: Validation du pipeline CrashDiagnostics"`
   - Le fichier disque dans `~/Library/Developer/CoreSimulator/Devices/<UDID>/data/Containers/Data/Application/<APP_UUID>/Documents/crash_diagnostics/` a disparu (consume = delete)

### 3.3 Si le toast ne s'affiche pas

| Symptome | Cause probable | Fix |
|----------|----------------|-----|
| Aucun log `Restored nsException` | Handler pas installe | Verifier que `CrashDiagnosticsManager.shared.install()` est bien appele dans `AppDelegate.didFinishLaunching` |
| Log present mais pas de toast | `consumePending()` pas appele | Verifier `surfacePendingCrashReports()` dans `MeeshyApp.task` |
| Toast affiche mais summary vide | Bug d'encoding JSON | Lire le fichier brut dans `Documents/crash_diagnostics/` via Files.app simulateur |

### 3.4 Nettoyage

Retirer le bouton de test avant de pousser. Ne pas laisser de `NSException.raise()` en production.

## 4. Capture des vrais crashes background

### 4.1 Limitations a connaitre

- **Le simulateur ne genere PAS de `MXDiagnosticPayload`.** MetricKit ne livre les rapports que sur **device physique**. Pour reproduire les crashes background reels, deployer sur device.
- **MetricKit a un delai.** Les rapports sont livres :
  - Au prochain demarrage suivant le crash (le plus courant)
  - Parfois jusqu'a 24h apres
  - Apres le retour de l'app au foreground si la livraison est en attente
- **`NSException` est immediat** (capture synchrone sur le thread crashing). Mais sur un crash de signal (SIGSEGV, SIGABRT), seul MetricKit captera.

### 4.2 Workflow normal

1. Installer la branche sur **un device physique** : `./apps/ios/meeshy.sh run` apres avoir branche le device et selectionne dans Xcode
2. Utiliser l'app normalement, laisser tourner 1-2 jours
3. Au prochain demarrage apres un crash, surveiller :
   - Le toast : `"Crash precedent : exc=10 sig=10 reason=..."` ou `"Blocage precedent : Hang 5.3s"`
   - Console.app sur Mac avec le device branche, filtre `subsystem:me.meeshy.app category:crash`

### 4.3 Recuperer les payloads bruts

Pour analyser un diagnostic en detail, on a besoin du payload JSON complet (call stack symbolique etc.). Trois canaux :

- **Console.app** : le `details` complet est logue via `Logger.crash.error(...)`. Filtre + clic sur la ligne pour voir le message complet.
- **Xcode Devices & Simulators** : Xcode menu > Window > Devices and Simulators > select device > "View Device Logs" → liste des crashes natifs symboliques.
- **Le fichier disque** : sur device physique, recuperable via Xcode > Devices > select app > "Download Container..." → ouvrir `AppData/Documents/crash_diagnostics/*.json`.

## 5. Lire les diagnostics

### 5.1 Format JSON sur disque

```json
{
  "id": "UUID",
  "timestamp": "2026-05-01T12:34:56Z",
  "kind": "hang",
  "summary": "Hang 5.3s",
  "details": "<MXHangDiagnostic JSON brut, contient callStackTree symbolique>"
}
```

Le champ `details` pour les diagnostics MetricKit est le `jsonRepresentation()` brut d'Apple — il contient le `callStackTree` complet (frames, offsets, binaire). C'est ce qui permet la symbolication.

### 5.2 Codes a connaitre (champ `summary` pour les crashes)

| `exc` (exceptionType) | Signification |
|-----------------------|---------------|
| 1 (`EXC_BAD_ACCESS`) | Mauvais acces memoire (nil deref, dangling pointer) |
| 6 (`EXC_BREAKPOINT`) | `fatalError`, assertion Swift, force unwrap |
| 10 (`EXC_CRASH`) | Crash applicatif general (souvent watchdog) |
| 13 (`SIGABRT` indirect) | Abort signal, swift assertion failed |

| `sig` (signal) | Signification |
|----------------|---------------|
| 6 (`SIGABRT`) | Abort, force unwrap, `fatalError` |
| 10 (`SIGBUS`) | Acces memoire desaligne |
| 11 (`SIGSEGV`) | Segmentation fault |

| `reason` (terminationReason) | Signification |
|------------------------------|---------------|
| `Namespace SPRINGBOARD, Code 0x8badf00d` | **Watchdog** : main thread bloque trop longtemps au launch / scenePhase callback |
| `Namespace SPRINGBOARD, Code 0xdead10cc` | **Background watchdog** : tache background a depasse le budget OS |
| `Namespace ASSERTIOND, Code 0xbadface` | Assertion-based termination |
| `Namespace SPRINGBOARD, Code 0xbaaaaaad` | Stackshot d'Apple (pas un crash) |

### 5.3 Hang diagnostics

Format `Hang X.Xs`. Seuils a interpreter :
- **< 0.5s** : peu critique, pourrait etre du jitter
- **0.5s - 5s** : ralentissement notable, a investiguer
- **5s - 30s** : hang serieux, watchdog imminent
- **> 30s** : presque certainement le watchdog `0x8BADF00D` ou `0xDEAD10CC`

Le `callStackTree` du payload pointe le thread bloque — typiquement le **main thread**.

## 6. Triage par symptome

Une fois qu'on a un diagnostic concret, voici les correlations a faire avec les sites suspects identifies dans `apps/ios/Meeshy/Features/Main/Services/`.

### 6.1 Si `kind == "hang"` ET le call stack contient `BackgroundTransitionCoordinator`

**Cause probable** : un step de la transition prend trop de temps.

Sites a verifier dans l'ordre :
1. `CacheCoordinator.shared.flushAll()` — peut faire des ecritures GRDB synchrones lentes
2. `NotificationCoordinator.shared.syncNow()` — peut faire un appel API
3. `MessageSocketManager.shared.prepareForBackground()` — sequence de teardown Socket.IO

**Fix** : ajouter un timeout par step dans `withBudget(_:_:)` (`BackgroundTransitionCoordinator.swift:111-118`). Actuellement il logue les steps > 1s mais ne les coupe pas.

```swift
private func withBudget(_ step: String, timeout: TimeInterval = 4.0, _ work: @escaping () async -> Void) async {
    let start = Date()
    await withTaskGroup(of: Void.self) { group in
        group.addTask { await work() }
        group.addTask {
            try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
            // Le step a depasse son budget — on log mais le groupe continue
        }
        await group.next()
        group.cancelAll()
    }
    let elapsed = Date().timeIntervalSince(start)
    if elapsed > 1.0 {
        Logger.crash.error("Step \(step) took \(elapsed)s")
    }
}
```

### 6.2 Si `kind == "crash"` AVEC `sig=11 (SIGSEGV)` ET stack contient `Timer` ou `Combine`

**Cause probable** : timer qui mute du `@MainActor` state apres deallocation, ou subscription Combine sans `[weak self]`.

Sites a verifier :
- `PresenceManager.swift:29-30` — `nonisolated(unsafe) var recalcTimer: Timer?` + `persistTask: Task` qui ne sont jamais arretes au background entry
- `AudioPlayerManager.swift:14-15` — `timer: Timer?` qui peut survivre a une suspension

**Fix prioritaire (PresenceManager)** : invalider le timer dans `BackgroundTransitionCoordinator.enterBackground()` et le redemarrer dans `resumeFromBackground()`.

```swift
// Dans BackgroundTransitionCoordinator.enterBackground(), ajouter :
await withBudget("presence.suspend") {
    PresenceManager.shared.suspendForBackground()
}

// Dans resumeFromBackground(), ajouter :
await withBudget("presence.resume") {
    PresenceManager.shared.resumeFromBackground()
}
```

Et dans `PresenceManager.swift`, exposer :
```swift
func suspendForBackground() {
    recalcTimer?.invalidate()
    recalcTimer = nil
    persistTask?.cancel()
}

func resumeFromBackground() {
    guard recalcTimer == nil else { return }
    startRecalcTimer()  // extraire la creation du Timer en methode privee
}
```

### 6.3 Si `kind == "crash"` AVEC `reason` mentionnant `SecItem` ou si le stack pointe `KeychainManager`

**Cause probable** : acces Keychain quand le device est verrouille en background.

iOS retourne `errSecInteractionNotAllowed` (-25308) sur les Keychain items proteges si le device est verrouille. Si le code force-unwrap le resultat, crash.

Sites a verifier :
- `APIClient.swift` — appels `KeychainManager.shared.load(forKey: "meeshy_auth_token")`
- `ConversationLockManager.swift` — gestion de cles E2E

**Fix** : guarder tout acces Keychain en background.
```swift
guard UIApplication.shared.isProtectedDataAvailable else {
    return nil  // ou une erreur explicite
}
let token = KeychainManager.shared.load(forKey: "meeshy_auth_token")
```

### 6.4 Si `kind == "crash"` AVEC stack contenant `NWPathMonitor` ou `CallManager`

**Cause probable** : NWPathMonitor delivre un update apres deallocation ou pendant teardown.

Site : `CallManager.swift:75-76` — `private let networkMonitor = NWPathMonitor()` non arrete au background.

**Fix** : `cancel()` le monitor au background entry, en redemarrer un nouveau au foreground.

### 6.5 Si `kind == "crash"` AVEC stack contenant `AVAudioSession`

**Cause probable** : `setActive(false)` qui throws en background.

Site : `MediaSessionCoordinator.deactivateForBackground()` (appele depuis `BackgroundTransitionCoordinator.swift:51-53`).

**Fix** : enrober dans un do/catch et logguer plutot que laisser remonter.

## 7. Procedure complete : crash > fix > verification

```
[1] Capture (1-7 jours selon frequence du crash)
    └─> Recuperer ≥3 rapports concordants pour confirmer la cause-racine

[2] Hypothese
    └─> Matcher le diagnostic avec un site de la section 6
    └─> Si plusieurs sites possibles, chercher le call stack le plus profond

[3] Reproduction locale
    └─> Sur device physique : reproduire le scenario qui declenche le crash
    └─> Confirmer le crash apparait dans Console.app

[4] Fix
    └─> Ecrire le test (TDD) qui reproduit la condition
    └─> Implementer le fix minimal
    └─> Build : ./apps/ios/meeshy.sh build
    └─> Test : ./apps/ios/meeshy.sh test

[5] Validation
    └─> Deployer sur device, repeter le scenario du [3]
    └─> Pendant 48h : verifier qu'AUCUN nouveau rapport du meme `kind` + meme stack n'apparait
    └─> Si nouveau rapport : retour [2] avec hypothese affinee

[6] Cleanup
    └─> Une fois 7 jours sans recurrence : on peut considerer le fix valide
    └─> Documenter la cause + fix dans `tasks/lessons.md`
```

## 8. Hypothese principale a investiguer en premier

D'apres l'analyse statique du code, le **suspect numero 1** est le watchdog `0x8BADF00D` ou `0xDEAD10CC` declenche depuis `BackgroundTransitionCoordinator.enterBackground()`.

Raisons :
- L'app fait beaucoup de travail au passage en background : flush cache (GRDB sync), sync notifs (API call), prepareForBackground sur 2 sockets, schedule de 2 BGTasks, deactivation audio session.
- Aucun timeout n'est applique par step — `withBudget()` log les steps lents mais ne les coupe pas.
- Si une seule de ces operations bloque (par exemple un flush GRDB sur un index corrompu, un appel API qui timeout sans tomber en erreur, un socket teardown qui attend un ack), le budget OS de ~25-30s s'epuise.
- Sur un device sous pression (memoire, batterie, thermals), le budget effectif peut etre bien plus court.

**Prediction** : le premier rapport sera un `MXHangDiagnostic` avec une `hangDuration` proche de la limite OS, et le call stack pointera dans un step de `withBudget`.

## 9. Operations courantes

### Lire les crashes en temps reel sur device branche
```bash
log stream --device --predicate 'subsystem == "me.meeshy.app" AND category == "crash"' --info
```

### Effacer manuellement les crashes persistes (test/debug)
```bash
# Sur simulateur
rm -rf ~/Library/Developer/CoreSimulator/Devices/<UDID>/data/Containers/Data/Application/<APP_UUID>/Documents/crash_diagnostics/

# Sur device : passer par Xcode > Devices > Download Container
```

### Forcer une livraison MetricKit (uniquement disponible en debug Xcode)
Xcode menu > Debug > Simulate Background Fetch / Simulate MetricKit Crash Report. **Note** : ceci genere un payload synthetique, utile pour tester le code mais pas representatif des vrais crashes.

## 10. Points de vigilance

- **Ne pas activer Firebase Crashlytics tant qu'on n'a pas de `GoogleService-Info.plist` configure.** Importer Firebase sans config crashera l'app au launch (`FirebaseApp not configured`).
- **Le toast de crash s'affiche en `.info` (bleu).** S'il devenait trop frequent, considerer un mode "ne plus afficher" via UserDefaults — mais ne PAS desactiver la capture, juste le toast.
- **`Documents/crash_diagnostics/` est inclus dans le backup iCloud par defaut.** Si on veut l'exclure (rapports = donnees techniques, pas user-facing), ajouter `URLResourceValues.isExcludedFromBackup = true` dans `directoryURL()`. Pour l'instant, c'est volontairement inclus pour faciliter le diagnostic post-mortem.
- **MetricKit ne livre rien sur simulateur.** Tout test serieux doit passer par device physique.

## 11. Prochaines etapes recommandees (ordre de priorite)

1. **Maintenant** : valider le pipeline avec le test de la section 3
2. **J+1 a J+7** : deployer sur ≥1 device de test reel, accumuler des donnees
3. **Quand on a 3+ rapports concordants** : appliquer le fix correspondant via la section 6
4. **Apres premier fix valide** : envisager d'ajouter Firebase Crashlytics proprement (necessite : compte Firebase, `GoogleService-Info.plist`, init dans `AppDelegate`) — la chaine `previousExceptionHandler` du `CrashDiagnosticsManager` est deja prevue pour cohabiter avec un autre reporter.

---

**Reference code** : `apps/ios/Meeshy/Features/Main/Services/CrashDiagnosticsManager.swift`
**Reference branche** : `claude/fix-ios-background-crashes-ww9IB`
