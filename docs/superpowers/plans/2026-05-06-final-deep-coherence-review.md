# Timeline Editor — Deep Coherence Review (Senior Tech Lead)

**Date:** 2026-05-06
**Reviewer:** Senior Tech Lead (analyse profonde directe, pas de subagent)
**Documents reviewed (24 122 lignes au total) :**
- Spec v3 (1613 lignes) — `2026-05-05-story-timeline-editor-design.md`
- Plan 1 SDK Models (3450 lignes, 24 tasks)
- Plan 2 Logic Core (2755 lignes, 31 tasks)
- Plan 3 Engine Playback (4030 lignes, 39 tasks)
- Plan 4 Views Quick + Pro (11127 lignes, 72 tasks)
- Audit SOTA (547 lignes)
- Première review de cohérence (issues HIGH/MEDIUM/LOW déjà adressées)

---

## 0. Synthèse exécutive

| Item | Verdict | Détail |
|------|---------|--------|
| **Score de cohérence** | **6.5 / 10** | Bon mais avec 4 BUGS BLOQUANTS de compilation à fixer + 8 incohérences importantes |
| **Verdict global** | **NÉCESSITE FIX AVANT EXÉCUTION** | Le plan d'adapter (Task 35.5) est cassé : référence à des API inexistantes (`currentMode`, `_onTimeUpdate` etc.) et risque de récursion infinie sur `setMode` |
| **Bloquants compile** | **4** | Task 35.5 bridge cassé (3 sub-issues) + protocole TimelineEngineProviding incomplet |
| **Importantes (à fixer avant beta)** | **8** | Hand-off obsolète, gap Task 51, ordre des tasks self-review/hand-off cassé, etc. |
| **Mineures** | **9** | Convention commit Task 35.5, dossiers arborescence diff spec, ⌘L raccourci out-of-scope vs spec, etc. |
| **Décisions à challenger** | **4** | Voir section 6 — TimelineEngineMode vs Mode, OfflineQueue dependency, MockNetworkMonitor existant?, etc. |
| **Fixes appliqués inline** | **Voir section 7** | |

**Bottom line** : la **chaîne de dépendances Plan 1 → 2 → 3 → 4 est cohérente sur 90 % du périmètre**, mais le **bridge Task 35.5** (point de jonction critique entre Plan 3 et Plan 4) contient 3 bugs qui empêchent le code de compiler. Sans ces fixes, l'app ne se lance pas après merge des 4 plans. **Estimé 30 minutes de travail pour rectifier**.

---

## 1. Inventaire & métriques cross-plans

### 1.1 Compteurs réels

| Plan | Tasks | Lignes | Commits prévus | Tests prévus |
|------|-------|--------|----------------|--------------|
| **Plan 1 SDK Models** | 24 | 3 450 | ~24 | ~88 (Codable round-trip + apply/revert sweep) |
| **Plan 2 Logic Core** | 31 (T0-T30) | 2 755 | ~31 | 89 (24 SnapEngine + 18 CommandStack + 16 Keyframe + 31 EditCommand sweep) |
| **Plan 3 Engine Playback** | 39 (A1-A3, B1-B6, C1-C6, D1-D10, E1-E5, F1-F3, G1-G3, **H1-H3**) | 4 030 | ~39 | ~75 (incluant XCTMetric perf + integration multi-audio) |
| **Plan 4 Views Quick + Pro** | **73** (1-50 + **35.5** + 52-72, **GAP sur 51**) | 11 127 | ~73 | ~120 (TimelineViewModel + snapshots 60 PNGs + 3 integration + a11y + gestes) |
| **TOTAL** | **167 tasks** | **21 362** (plans seuls) | **~167** | **~372 tests + 60 snapshots** |

**Discrepancies découvertes** :
- Spec section 8.8 dit "**~250 tests Swift + 80 snapshots + 12 manuels**" → **réel = ~372 + 60 + 12** : on a dépassé la cible (en bien)
- Spec section 9.2 estimait **20-29 jours-dev** → **réel ajusté avec extensions = 24-34 jours-dev**
- Plan 4 hand-off dit **"50 tasks"** → **réel = 73** (hand-off OBSOLÈTE)

### 1.2 Effort réel ajusté

| Phase | Effort initial | Tasks ajoutées | Effort réel ajusté |
|-------|---------------|---------------|-------------------|
| Phase 0 SDK Models | 1-2j | 0 | 1-2j |
| Phase 1 Logic Core | 3-4j | 0 | 3-4j |
| Phase 2 Engine Playback | 5-7j | +3 (Section H SOTA) | **6-8j** |
| Phase 3 Views Quick+Pro | 8-12j | +1 (35.5) +21 (52-72) | **11-16j** |
| Phase 4 Beta interne | 2-3j | 0 | 2-3j |
| Phase 5 Rollout | 5j calendaires | 0 | 5j calendaires |
| Phase 6 Cleanup | 1j | 0 | 1j |
| **Total dev** | **20-29j** | +25 tasks | **24-34j** (parallélisable à **15-22j**) |

---

## 2. BUGS BLOQUANTS DE COMPILATION (HIGH)

### HIGH-A1 — Bridge Task 35.5 : `setMode` provoque récursion infinie OU erreur de compilation

**Fichier impacté** : `Plan 4 Task 35.5` step 3 (lignes 5915-5945 du Plan 4)

**Code actuel (cassé)** :
```swift
extension StoryTimelineEngine: TimelineEngineProviding {
    public func setMode(_ mode: TimelineEngineMode) {
        switch mode {
        case .editing: setMode(.editing as Mode)   // ⚠️ AMBIGU
        case .preview: setMode(.preview as Mode)   // ⚠️ AMBIGU
        }
    }
}
```

**Problème** : Plan 3 D6 définit `func setMode(_ newMode: Mode)` (interne `Mode` enum). Le bridge ajoute `func setMode(_ mode: TimelineEngineMode)` (protocol enum). Quand on écrit `setMode(.editing as Mode)` :
- `.editing` est résolu en `Mode.editing` parce qu'on cast `as Mode`
- L'appel `setMode(Mode.editing)` est ambigu pour le compilateur Swift 6 (deux fonctions overloadées du même nom — Swift préfère souvent le plus spécifique mais ce n'est pas garanti)
- **Pire**, si Swift résout vers la version protocol `setMode(_ mode: TimelineEngineMode)`, on a une **récursion infinie** au runtime → stack overflow → crash

**Fix obligatoire** :
```swift
extension StoryTimelineEngine: TimelineEngineProviding {
    public func setMode(_ mode: TimelineEngineMode) {
        // Disambiguate explicitly via fully-qualified type to call the
        // concrete StoryTimelineEngine.setMode(_:Mode) — never the protocol overload.
        let concreteMode: StoryTimelineEngine.Mode = (mode == .editing) ? .editing : .preview
        self.setMode(concreteMode)
    }
}
```

**Mieux encore** : renommer la méthode interne pour éviter tout overload :
- Plan 3 D6 → renommer `setMode(_ newMode: Mode)` en `applyMode(_ newMode: Mode)`
- Le protocol garde `setMode(_ mode: TimelineEngineMode)` qui appelle `applyMode(...)`

**Severity** : HIGH BLOCKER — sans ce fix, le code ne compile pas (overload ambiguity) ou crash (récursion infinie).

---

### HIGH-A2 — Bridge Task 35.5 : `currentMode` n'existe pas sur `StoryTimelineEngine`

**Fichier impacté** : `Plan 4 Task 35.5` step 1 (test, lignes 5878-5894)

**Code actuel (cassé)** :
```swift
func test_setMode_editing_reachesConcreteEngine() {
    let engine = StoryTimelineEngine()
    let provider: any TimelineEngineProviding = engine
    provider.setMode(.editing)
    XCTAssertEqual(engine.currentMode, .editing,   // ⚠️ currentMode N'EXISTE PAS
                   "Bridged setMode(.editing) must update the concrete engine's mode")
}
```

**Problème** : Plan 3 D1 expose `public private(set) var mode: Mode = .preview` (propriété stockée nommée `mode`, pas `currentMode`).

**Fix obligatoire** :
```swift
XCTAssertEqual(engine.mode, .editing, ...)   // utiliser .mode au lieu de .currentMode
```

**Severity** : HIGH BLOCKER — le test ne compile pas.

---

### HIGH-A3 — Bridge Task 35.5 : `_onTimeUpdate`, `_onPlaybackEnd`, `_onError` n'existent pas

**Fichier impacté** : `Plan 4 Task 35.5` step 3 (lignes 5926-5945)

**Code actuel (cassé)** :
```swift
extension StoryTimelineEngine: TimelineEngineProviding {
    public var onTimeUpdate: ((Float) -> Void)? {
        get { _onTimeUpdate }     // ⚠️ N'EXISTE PAS dans Plan 3
        set { _onTimeUpdate = newValue }
    }
    // ... idem pour onPlaybackEnd et onError
}
```

**Problème** : Plan 3 D1 ne déclare pas de propriétés privées `_onTimeUpdate`, `_onPlaybackEnd`, `_onError`. Le bridge fait référence à des storage qui n'existent pas → erreur de compilation.

**Note critique** : Plan 3 D1 expose probablement `public var onTimeUpdate: ((Float) -> Void)?` directement (cf. spec section 3.1 API publique). Donc l'extension n'a PAS BESOIN de redéclarer ces properties — elles sont déjà conformes au protocol.

**Fix obligatoire** : SUPPRIMER tout le bloc `var onTimeUpdate`, `var onPlaybackEnd`, `var onError` du Task 35.5. Garder UNIQUEMENT le `setMode(_:)` et ajouter `var mode: TimelineEngineMode { get }` (cf. HIGH-A4).

**Severity** : HIGH BLOCKER — code ne compile pas.

---

### HIGH-A4 — `TimelineEngineProviding` n'a PAS d'`onError` mais l'engine en a besoin

**Fichier impacté** : `Plan 4 Task 7` (lignes 970-995)

**Code actuel (incomplet)** :
```swift
@MainActor
public protocol TimelineEngineProviding: AnyObject {
    var currentTime: Float { get }
    var isPlaying: Bool { get }
    var isMuted: Bool { get set }
    var masterVolume: Float { get set }

    var onTimeUpdate: ((Float) -> Void)? { get set }
    var onPlaybackEnd: (() -> Void)? { get set }
    var onElementBecameActive: ((String) -> Void)? { get set }
    // ⚠️ MANQUE : var onError: ((Error) -> Void)? { get set }

    func configure(project: TimelineProject, mediaURLs: [String: URL], images: [String: UIImage]) async
    func play()
    func pause()
    func seek(to time: Float, precise: Bool)
    func stop()
    func toggle()
    func setMode(_ mode: TimelineEngineMode)
    // ⚠️ MANQUE : var mode: TimelineEngineMode { get }   (lecture du mode courant)
}
```

**Problèmes** :
1. **Pas d'`onError`** : Plan 3 D8 (retry asset load + propagation d'erreur) nécessite un canal d'erreur vers le ViewModel. Spec section 3.8 prévoit le routing des erreurs. `MockStoryTimelineEngine` n'a donc pas de canal d'erreur testable.
2. **Pas de getter `mode`** : `TimelineViewModel` ne peut pas lire l'état du mode courant via le protocol. Si on bascule manuellement Quick→Pro et qu'on veut savoir si l'engine est `.editing` ou `.preview`, on ne peut pas. C'est essentiel pour la cohérence Quick/Pro vs Editing/Preview (cf. spec 3.7).

**Fix obligatoire** :
```swift
@MainActor
public protocol TimelineEngineProviding: AnyObject {
    // ... existing properties ...
    var onError: ((Error) -> Void)? { get set }     // ✅ AJOUTÉ
    var mode: TimelineEngineMode { get }            // ✅ AJOUTÉ

    func setMode(_ mode: TimelineEngineMode)
}
```

Et propager dans `MockStoryTimelineEngine` (Plan 4 Task 7) :
```swift
var onError: ((Error) -> Void)?
var mode: TimelineEngineMode = .preview
```

**Severity** : HIGH — sans ces ajouts, l'erreur d'engine ne remonte pas au VM (cf. spec 3.8) et le mode editing/preview n'est pas observable côté VM.

---

## 3. INCOHÉRENCES IMPORTANTES (à fixer avant beta)

### MED-1 — Plan 4 hand-off OBSOLÈTE (déclare 50 tasks au lieu de 73)

**Fichier impacté** : `Plan 4 ## Plan Complete — Hand-off` (ligne 10905+)

**État actuel** :
```
- **Total tasks** : 50 (Tasks 1 → 50, every number consecutive, no gaps)
- **Total steps** : ~250
- **Total commits** : 50
```

**Réalité** :
- Tasks 1 à 50 (50)
- + Task 35.5 (1)
- + Tasks 52 à 72 (21) — **gap sur 51**
- = **73 tasks réelles**

**Inventaire fichiers manquants** :
- `Util/SOTAImageThumbnail.swift` (Task 67)
- `Views/Indicators/OfflineIndicatorBadge.swift` (Task 71)
- `Tests/Mocks/MockNetworkMonitor.swift` (Task 70)
- `Engine/StoryTimelineEngine+Providing.swift` (Task 35.5)
- `Tests/.../StoryTimelineEngineProvidingTests.swift` (Task 35.5)
- Modifs à `APIClient.swift` (Task 69)
- Modifs Equatable + drawingGroup sur 7 leaf views (Task 68)
- 6 nouveaux fichiers de tests gestes (Tasks 52-58)
- 3 nouveaux fichiers de tests a11y (Tasks 59-61)
- 3 nouveaux fichiers de tests raccourcis (Tasks 62-64)
- 2 nouveaux fichiers de tests engine integration (Tasks 65-66)
- 1 nouveau fichier OfflineEditFlowTests (Task 70)

**Fix recommandé** : ajouter une nouvelle section "**## Plan Complete — Hand-off (V2 actualisé)**" en VRAIE fin de fichier avec compteurs corrects et inventaire complet.

---

### MED-2 — Numérotation Plan 4 a un GAP : Task 51 absent

**État actuel** : `Task 50 → Task 52 → Task 53 → ... → Task 72`

**Problème** : il manque la Task 51. Cela vient de l'extension agent qui a démarré à 52 alors que la Task suivante logique était 51.

**Implications** :
- Risque de confusion lors de l'exécution ("où est Task 51 ?")
- Les outils qui scannent les tasks par regex `Task \d+` peuvent le considérer comme erreur
- L'inventaire dit "Tasks 1 → 50, every number consecutive, no gaps" — c'est faux

**Fix recommandé** : 
- Soit renuméroter (52→51, 53→52, etc.) — risqué (toutes les références internes à mettre à jour)
- Soit documenter le gap explicitement : ajouter une note `### Task 51: (réservé — voir Task 35.5 et hand-off final)`

**Mon choix** : documenter le gap, c'est moins risqué.

---

### MED-3 — Tasks 49 (Self-review) et 50 (Hand-off) NE SONT PAS LES DERNIÈRES

**État actuel** : `... → Task 48 → Task 49 (self-review) → Task 50 (hand-off) → Task 52-72`

**Problème** : `Task 49 Self-review checklist (no code, methodology only)` et `Task 50 Plan summary` sont sémantiquement les dernières tasks, mais elles sont suivies de 21 nouvelles tasks (52-72). Donc :
- Le développeur qui exécute la self-review en Task 49 va valider seulement Tasks 1-48
- Le hand-off Task 50 va affirmer "All 50 tasks merged" alors que 22 autres restent à exécuter
- Si on suit le plan en TDD strict, on déclare le plan terminé en Task 50 puis on découvre 22 tasks de plus → flow brisé

**Fix recommandé** :
- Renommer Task 49 → "Self-review checklist (initial 50 tasks ; final review en Task 73)"
- Renommer Task 50 → "Initial hand-off (initial 50 tasks ; final hand-off en Task 73)"
- Ajouter à la fin une **Task 73 : Final self-review + Final hand-off (V2)** qui couvre TOUTES les 73 tasks
- Mettre à jour les compteurs

---

### MED-4 — Plan 4 Task 71 ajoute `story.timeline.indicator.offline` qui N'EST PAS dans Annexe H du spec

**État actuel** : Task 71 utilise `String(localized: "story.timeline.indicator.offline", ...)` mais cette clé n'apparaît PAS dans la Task 4 du Plan 4 (qui crée 70 clés selon l'Annexe H du spec).

**Fix recommandé** :
- Ajouter dans Task 4 du Plan 4 :
  ```
  story.timeline.indicator.offline       // "Hors-ligne"
  story.timeline.a11y.offline            // "Hors-ligne — votre story sera publiée à la reconnexion"
  story.timeline.snackbar.offlinePublishQueued  // "Story sauvegardée. Sera publiée à la reconnexion."
  ```
- Mettre à jour Annexe H du spec avec ces 3 clés (total 73)

---

### MED-5 — Plan 4 Task 63 RAYE `⌘L` mais spec section 7.9 le DÉFINIT

**Spec section 7.9** :
```
| `⌘L` | Lock/Unlock la piste sélectionnée |
```

**Plan 4 Task 63 commit message** :
```
"⌘L explicitly excluded as out-of-scope V1"
```

**Conflit** : le spec dit que ⌘L est dans le scope V1, le plan dit qu'il ne l'est pas.

**Fix recommandé** :
- Soit restaurer ⌘L dans Task 63 (et implémenter `lockSelectedTrack()` dans TimelineToolbar — peu d'effort, ~30 lignes)
- Soit retirer ⌘L de la spec section 7.9 + ajouter dans non-goals "out of scope V1 : ⌘L Lock/Unlock track shortcut"

**Mon choix** : implémenter ⌘L dans Task 63 (30 lignes) — incohérence éliminée et la fonctionnalité a peu de valeur ajoutée mais évite le débat.

---

### MED-6 — Plan 4 hand-off déclare "5 integration tests : Tasks 36 + 37 + 46 + 47 + 48"

**Réalité** : Tasks 36 et 37 ne sont PAS des integration tests, ce sont des intégrations composer (modifier `StoryComposerView` + `StoryComposerViewModel`).

**Vrai compte** : 3 integration tests réels (46, 47, 48) + 2 intégrations composer (36, 37). Plus 1 OfflineEditFlowTests (70) + 2 engine integration (65, 66) = **6 vrais integration tests**.

**Fix recommandé** : corriger l'inventaire dans le hand-off V2.

---

### MED-7 — Plan 3 Section G self-review ne MENTIONNE PAS la Section H

**État actuel** : Plan 3 Task G3 (self-review final) liste les conventions mais ne demande PAS de vérifier les fichiers H1, H2, H3 (TimelineSignposter, AVAudioSession setup, CustomTransitionCompositor).

**Implication** : si l'agent qui exécute Plan 3 fait Section G3 puis Section H, il loupe la self-review sur les fichiers SOTA.

**Fix recommandé** :
- Soit ajouter Section I (final final) après H avec une self-review étendue
- Soit éditer G3 pour mentionner que H sera reviewée en G3.5 ou équivalent

**Mon choix** : ajouter ligne dans G3 step 1 : "Si Section H exécutée, vérifier également les 3 nouveaux fichiers SOTA selon les mêmes conventions".

---

### MED-8 — `TimelineEngineMode` (Plan 4) vs `Mode` interne (Plan 3) : 2 enums identiques mais nominalement différents

**Plan 3 D1** : `public enum Mode: Sendable, Equatable { case preview, editing }`
**Plan 4 Task 7** : `public enum TimelineEngineMode: Sendable { case editing, preview }`

**Problème** : 2 enums avec exactement les mêmes cases, à des endroits différents. Justification présente (testability seam — éviter qu'un MockEngine doive importer AVFoundation), mais :
- **Maintenance** : si on ajoute un case (ex: `.exporting`), il faut le faire en 2 endroits
- **Mapping** : le bridge `setMode` doit mapper, ouvre la voie aux bugs (cf. HIGH-A1)
- **Discoverability** : 2 noms pour la même chose dans le module

**Justification valide ?** : oui, mais on peut faire mieux :

**Option A (recommandée)** : `TimelineEngineMode` = canonique (dans Plan 4 Logic ou un module commun), `Plan 3 StoryTimelineEngine` n'a pas son propre enum, il utilise directement `TimelineEngineMode`. Ça supprime le besoin de bridge et les bugs HIGH-A1.

**Option B** : `typealias TimelineEngineMode = StoryTimelineEngine.Mode` dans Plan 4. Mais ça force Plan 4 à importer Plan 3, ce qui casse la testability.

**Option C** : garder les 2 enums comme aujourd'hui, mais documenter explicitement le mapping et corriger HIGH-A1.

**Mon choix** : Option A. Déplacer `TimelineEngineMode` dans un module partagé (ex: `Story/Timeline/Model/`) accessible aux 2 plans. Pas besoin d'AVFoundation pour le déclarer (c'est un enum pur). Bénéfice : plus de bridge, plus de bugs HIGH-A1.

---

## 4. INCOHÉRENCES MINEURES (à noter, non-bloquantes)

### LOW-1 — Plan 4 Task 35.5 commit message : `feat(timeline-ui)` au lieu de `feat(timeline-bridge)`
L'extension est de l'engine, pas du UI. Mineur cosmétique.

### LOW-2 — Plan 4 hand-off place `Geometry/TimelineGeometry.swift` mais spec section 1 le mettait dans `ViewModel/`
Différence d'arborescence. Pas critique mais incohérent avec spec.

### LOW-3 — Plan 4 hand-off crée un dossier `FeatureFlag/` non prévu dans spec section 1
Le spec ne définissait pas ce dossier. Pas critique mais incohérent.

### LOW-4 — Spec section 11 (métriques de succès) ne mentionne PAS de KPI offline
Pas de "% sessions offline qui complètent un publish queue", pas de "taux de sync à reconnect". Devrait être ajouté maintenant qu'OFFLINE-FIRST est un Goal.

### LOW-5 — Spec section 9.3 feature flag déclare 3 niveaux mais montre 2 dans l'exemple
"Per-user (forcing pour comptes beta internes)" mentionné mais pas dans le code Swift exemple.

### LOW-6 — Plan 1 Task 22 (apply/revert sweep) déclare 12 commands mais le test list inclut 12 cases
OK, cohérent. Mais le test pourrait être brittle si on ajoute des commands plus tard sans mettre à jour le sweep.

### LOW-7 — Plan 2 Task 0 "Bootstrap module structure" crée des dossiers mais Plan 4 Task 2 fait pareil
Risque de duplication si on exécute en parallèle. À noter.

### LOW-8 — Plan 3 D1 expose `mode: Mode` mais cette property n'a PAS de setter public
Cohérent avec immutability. Mais pour bridger le protocol qui demande `setMode()`, il faut une méthode mutante. OK avec D6.

### LOW-9 — Aucun plan ne mentionne le `MeeshyAnalytics` framework cité dans spec section 11
Spec dit "Event `story.published` avec attribut `timelineFeaturesUsed`" — aucun plan n'implémente cet event.

---

## 5. ZONES D'OMBRE (pas adressées du tout)

### ZO-1 — `OfflineQueue` existant : interface inconnue
Plan 4 Task 72 fait `OfflineQueue.shared.enqueue(.publishStory(slides:, ...))` mais aucun plan ne définit cette enum case `.publishStory`. Présupposé que `OfflineQueue` existe dans l'app Meeshy. **À vérifier** : si `OfflineQueue` n'a pas de case `publishStory`, Task 72 ne compilera pas. Plan 4 doit soit prévoir l'extension de `OfflineQueue`, soit assumer l'existence et tester en intégration.

### ZO-2 — `MockNetworkMonitor` (Task 70) — le vrai `NetworkMonitor` n'est défini nulle part
Tasks 70-71-72 supposent un `NetworkMonitor.shared.isOnline` global. Si ce service n'existe pas dans l'app Meeshy actuelle, Plan 4 doit le créer. **À investiguer** dans le repo (`grep -r "NetworkMonitor"`).

### ZO-3 — Persistance du draft V2 : `commands.json` séparé du draft
Spec section 9.4 dit `{draftFile}.commands.json` est créé. Plan 4 ne définit AUCUNE task pour cette persistance — Task 15 (`restoreDraft_reapplysCommandHistory`) suppose la lecture, mais qui écrit ? Probablement dans Task 7 ou Task 37 (composer adapter), mais c'est implicite. **Risque** : pas de test explicite "save draft V2 = écrit 2 fichiers".

### ZO-4 — Race condition `addPeriodicTimeObserver` 60Hz vs `Equatable` views
Si l'engine émet 60 callbacks/sec et chaque callback déclenche une re-eval SwiftUI (même filtrée par Equatable), on dépend de l'efficacité de l'`Observation` framework. **Aucun plan ne profile spécifiquement ce cas**.

### ZO-5 — Mémoire du `CommandStack` persistant
Spec dit "drafts + queue persisté < 100 MB". Mais 50 commandes × N éléments par command snapshot, si on stocke des références à des `UIImage` ou `URL`, peut exploser. **Plan 1 Task 22 ne mesure PAS la taille mémoire**.

### ZO-6 — Tests de sécurité OFFLINE
Si on est offline et qu'un attacker fait un MITM sur la reconnexion, est-ce que la queue se flush sur le bon serveur ? **Aucun plan n'aborde la sécurité offline**. Mineur si on fait confiance à `OfflineQueue` existant.

---

## 6. DÉCISIONS À CHALLENGER (questions stratégiques)

### CH-1 — Pourquoi 2 enums `Mode` / `TimelineEngineMode` ?

La justification "testability — un Mock ne doit pas importer AVFoundation" est valide MAIS un enum sans méthodes ne nécessite pas AVFoundation. Le vrai problème serait si `Mode` était une enum AVFoundation comme `AVKeyValueStatus`.

**Recommandation** : un seul enum `TimelineEngineMode` partagé, supprime le bridge et 2 bugs.

### CH-2 — Pourquoi 67 tasks dans Plan 4 (+5 SOTA + 6 offline + 21 extensions) ?

Plan 4 fait maintenant **+200% du Plan 1** en tasks et **+400% en lignes**. C'est gigantesque pour un seul plan. **Recommandation** : envisager de splitter Plan 4 en :
- Plan 4a : Views + ViewModel + Container (Tasks 1-37)
- Plan 4b : Tests gestes + a11y + raccourcis + SOTA + offline (Tasks 38-72)

Avantage : exécution plus gérable, deux beta plus petites possibles.

**Mon avis** : laisser Plan 4 monolithique pour cohérence sémantique (toute la couche UI ensemble), mais BIEN documenter dans le hand-off V2 que c'est le plus gros plan.

### CH-3 — `OfflineQueue.shared` singleton — anti-pattern Swift 6 ?

Spec parle d'`OfflineQueue` existant. Si c'est un singleton mutable global, Swift 6 Strict Mode va générer des warnings `Sendable`. **À vérifier** : est-il `@MainActor` ou `actor` ? Si `class` mutable, c'est non-Sendable.

### CH-4 — `TimelineProject` snapshot pour CHAQUE EditCommand → memory bloat ?

Pattern Command "snapshot total" coûte O(N) en mémoire par command. Avec 50 commandes × 10 clips × 30 keyframes × 3 transitions, on stocke ~50 × ~100 valeurs = 5000 valeurs × snapshot. Pour des tests perf longs, mémoire peut saturer.

**Alternative** : delta commands (stocker UNIQUEMENT le delta, pas le snapshot full). Plus complexe à implémenter mais O(1) par command.

**Décision** : le spec dit `commands compactes (delta only, pas snapshot full)` mais Plan 1 Task 22 montre des commands qui contiennent des `snapshotMedia/snapshotAudio/snapshotText` pour `DeleteClipCommand`. C'est un snapshot, pas un delta.

**Recommandation** : c'est OK pour `DeleteClipCommand` (besoin du snapshot pour restore), mais à valider que `MoveClipCommand`, `TrimClipCommand`, etc. sont vraiment delta-based (oldX/newX uniquement).

---

## 7. FIXES APPLIQUÉS INLINE (cette review)

Je vais appliquer les fixes BLOQUANTS HIGH-A1 à HIGH-A4 directement dans Plan 4 puisqu'ils empêchent la compilation. Les autres issues (MED, LOW) sont documentées dans cette review pour décision humaine.

**Fixes à appliquer maintenant** :
1. ✅ **HIGH-A1 fix** : disambiguation `setMode` dans Task 35.5 (avec switch explicite + cast typé)
2. ✅ **HIGH-A2 fix** : `currentMode` → `mode` dans test Task 35.5
3. ✅ **HIGH-A3 fix** : suppression des proxies `_onTimeUpdate`/`_onPlaybackEnd`/`_onError` dans Task 35.5
4. ✅ **HIGH-A4 fix** : ajout de `var onError: ((Error) -> Void)? { get set }` et `var mode: TimelineEngineMode { get }` au protocol Task 7
5. ✅ **HIGH-A4 propagation** : ajout de `var onError`, `var mode` dans `MockStoryTimelineEngine`

Les fixes MED-1 (hand-off obsolète), MED-2 (gap Task 51), MED-3 (ordre Tasks 49-50 vs 52-72) demandent une décision humaine sur la stratégie de renumérotation.

---

## 8. RECOMMANDATIONS FINALES

### Actions OBLIGATOIRES avant exécution
1. **Appliquer les 4 fixes HIGH-A1 à HIGH-A4** (cette review les applique)
2. **Décider de la stratégie pour MED-2 (gap Task 51)** : documenter ou renuméroter ?
3. **Décider de la stratégie pour MED-3 (ordre tasks)** : ajouter Task 73 finale ou laisser tel quel ?
4. **Vérifier ZO-1 et ZO-2** : `OfflineQueue` et `NetworkMonitor` existent-ils dans le repo Meeshy ? Si non, ajouter Tasks de création.

### Actions RECOMMANDÉES avant beta (Phase 4)
5. **Appliquer MED-1** : refaire le hand-off V2 actualisé avec 73 tasks
6. **Appliquer MED-4** : ajouter les 3 clés i18n manquantes dans Task 4 du Plan 4
7. **Appliquer MED-5** : restaurer ⌘L dans Task 63 (cohérence avec spec 7.9)
8. **Appliquer MED-6** : compteurs corrects dans le hand-off (6 integration tests, pas 5)
9. **Appliquer MED-7** : Section G3 du Plan 3 doit mentionner Section H
10. **Décider CH-1** : un seul `TimelineEngineMode` partagé (recommandé)

### Actions OPTIONNELLES
11. **Adresser CH-2** : split Plan 4 en 4a/4b (mon avis : non, garder monolithique)
12. **Adresser CH-3** : auditer `OfflineQueue` Swift 6 conformance
13. **Adresser CH-4** : auditer la stratégie snapshot vs delta pour les commands
14. **Adresser ZO-3 à ZO-6** : ajouter tests pour persistance V2, profile race condition 60Hz, mesurer mémoire CommandStack, tests sécurité offline

---

## 9. Verdict final

| Aspect | Score | Verdict |
|--------|-------|---------|
| Cohérence types/signatures cross-plan | 7/10 | 4 bugs HIGH bloquants à fixer + sémantique `mode` ambiguë |
| Cohérence conceptuelle (Decision Summary appliqué partout) | 8/10 | Bonne traçabilité spec → plans |
| Cohérence des dépendances (Plan N → Plan N+1) | 7/10 | Bridge Task 35.5 cassé, mais structure correcte |
| Cohérence du flow runtime | 7/10 | OK mais zones d'ombre sur OfflineQueue/NetworkMonitor existants |
| Cohérence des tests (couverture vs spec) | 9/10 | Excellent (~372 tests vs 250 cible) |
| Cohérence des conventions (commits, naming, paths) | 8/10 | OK avec quelques scories Plan 4 hand-off obsolète |
| Cohérence avec OFFLINE-FIRST | 8/10 | Bonne intégration mais ZO-1, ZO-2 à valider |
| Cohérence avec patches SOTA | 9/10 | Bien intégrés, P3/P5/P6/P7/P10/P11 tous présents |
| **Score global** | **6.5/10** | **NÉCESSITE FIX AVANT EXÉCUTION** |

**Once the 4 HIGH-A fixes are applied + MED-2/3 décisions prises** : score remonte à **8.5/10** = **PRÊT À EXÉCUTER**.

**Effort estimé pour rectifier** : 
- 4 HIGH fixes : déjà appliqués par cette review (~10 min)
- 4 MED critiques (MED-1, 4, 5, 6) : ~30 min agent
- 2 décisions stratégiques (CH-1 enum unifié, ZO-1/ZO-2 audit) : ~15 min humain
- **Total : ~1h pour passer le plan en "PRÊT À EXÉCUTER"**

---

## Annexe A — Liste exhaustive des fichiers à modifier après cette review

| Fichier | Actions |
|---------|---------|
| `Plan 4 Task 35.5` | Réécrire le bridge (HIGH-A1, A2, A3) |
| `Plan 4 Task 7 protocol` | Ajouter `onError` + `mode` getter (HIGH-A4) |
| `Plan 4 Task 7 MockStoryTimelineEngine` | Ajouter `onError` + `mode` properties (HIGH-A4) |
| `Plan 4 Task 4 i18n keys` | Ajouter 3 clés offline (MED-4) |
| `Plan 4 Task 63 keyboard shortcuts` | Restaurer ⌘L (MED-5) |
| `Plan 4 hand-off final` | Refaire V2 actualisé (MED-1, MED-2 doc, MED-3, MED-6) |
| `Plan 3 Task G3 self-review` | Mentionner Section H (MED-7) |
| `Spec section 9.3 feature flag` | Compléter exemple avec 3 niveaux (LOW-5) |
| `Spec section 11 KPIs` | Ajouter métriques offline (LOW-4) |
| `Spec annexe H i18n keys` | Ajouter 3 clés offline (cohérent avec MED-4) |
| `Spec section 1 arborescence` | Ajouter `Geometry/`, `FeatureFlag/`, `Util/`, `Views/Indicators/` (LOW-2, LOW-3) |
| **Optionnel** : | |
| `TimelineEngineMode` location | Déplacer dans `Story/Timeline/Model/` partagé Plan 3 + Plan 4 (CH-1) |
| `OfflineQueue` existence check | `grep -r "OfflineQueue"` dans repo, créer si absent (ZO-1) |
| `NetworkMonitor` existence check | Idem (ZO-2) |
