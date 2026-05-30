# Refactoring & simplification de l'app iOS — sans perte de feature

**Date** : 2026-05-30
**Invariant absolu** : **zéro feature perdue.** Chaque lot est iso-comportement, livré en RED→GREEN→REFACTOR, et laisse le build vert (`./apps/ios/meeshy.sh build && ./apps/ios/meeshy.sh test`).

> Ce document est un **plan d'attaque priorisé**, pas une réécriture. Chaque item cite un fichier réel + une métrique, et propose une décomposition mécanique (déplacements + extractions), jamais une refonte fonctionnelle.

---

## 0. Principes directeurs (rappel CLAUDE.md)

1. **Iso-comportement** : on déplace/extrait, on ne change pas la logique. Tests existants restent verts.
2. **Bubble pattern** : toute sous-vue extraite est `Equatable`, inputs primitifs (`isMe: Bool`, `accentHex: String`), **pas** d'`@ObservedObject` sur singletons (cf. « Zero Unnecessary Re-render »).
3. **SDK Purity** : on ne migre vers le SDK que les **atomes** ; l'orchestration UX reste app-side (test du grain).
4. **Pas de god object** : un fichier = une responsabilité. Cible souple : < 600 lignes / fichier de vue.
5. **Single Source of Truth** : avant de créer, chercher l'existant (`resolveUserLanguage`, `MeeshyColors`, `sendSuccess/Error`, `CacheCoordinator`).

---

## 1. État des lieux mesuré (2026-05-30)

| Signal | Valeur | Lecture |
|---|---|---|
| Fichiers Swift (app + SDK) | 768 | — |
| Fichiers > 40 KB | **41** | god objects à décomposer |
| Plus gros fichier | `StoryCanvasUIView.swift` **164 KB** | priorité 1 |
| `AnyView` | **55** | anti-pattern perf SwiftUI (casse l'identité structurelle) |
| Singletons `.shared` distincts | **138** | couplage fort ; injection à introduire |
| `print(` (devrait être `os.Logger`) | **28** | dette de logging |
| `as!` (cast forcé) | 2 | OK (faible) |
| `TODO/FIXME/HACK` | 10 | OK (faible) |

---

## 2. God objects — décomposition prioritaire (lot par lot)

> Stratégie commune : repérer les `// MARK:` internes → extraire chaque section en `extension` (même fichier d'abord, puis fichier dédié), puis isoler les sous-vues `Equatable`. Aucun changement de signature publique.

### P1 — `StoryCanvasUIView.swift` (164 KB) — SDK
- **Quoi** : `UIView` canvas Story (layers bg/fg/texte/audio + gestes pinch/pan/rotation).
- **Découpe** : `StoryCanvasUIView+Layers.swift`, `+Gestures.swift`, `+Playback.swift`, `+Export.swift`. Les state machines internes (`VideoPlaybackController`) restent internal SDK.
- **Garde-fou** : aucune logique de gesture ne change (cf. commit `12c30f7` « unify bg pinch/pan/rotation single source of truth » — ne pas re-disperser).

### P1 — `ConversationViewModel.swift` (158 KB) — app
- **Le cœur** du Prisme Linguistique + cache-first + audio atomicity.
- **Découpe par responsabilité** (extensions du même type, pas de nouveau VM) :
  - `+Loading.swift` (`loadMessages`, snapshot/apply/hydrate — **garder l'atomicité** : aucun `await` entre `messages =` et `messageTranscriptions =`).
  - `+Translation.swift` (`preferredTranslation`, `activeTranslationOverrides`, miroir `resolveUserLanguage`).
  - `+Realtime.swift` (`applyAttachmentUpdate`, `injectAttachmentMetadata`, listeners socket).
  - `+Sending.swift` (optimistic updates, OfflineQueue).
- **Garde-fou** : la règle « pas d'`await` entre pose messages et métadonnées audio » (cf. CLAUDE.md « Attachment Enrichment Atomicity ») doit survivre à l'extraction.

### P1 — `MessageDetailSheet.swift` (103 KB) — app
- Onglets (Language / Info / Reactions…). **Découpe par onglet** : `MessageDetailSheet+Language.swift` (seul point d'entrée d'exploration des traductions — ne pas dupliquer ailleurs), `+Info.swift`, `+Reactions.swift`.

### P2 — `CallManager.swift` (99 KB) — app · `MessageSocketManager.swift` (99 KB) — SDK
- `CallManager` : séparer signaling / WebRTC peer / UI-state. `MessageSocketManager` : séparer connexion-réticulation / parsing événements / publishers Combine. **Attention** : `emit()` n'await pas (cf. « Async EventEmitter Hazard ») — conserver les try/catch.

### P2 — `StoryComposerView.swift` (98 KB) + `StoryComposerViewModel.swift` (70 KB) — SDK
- 38 `@Published` sur le VM (Session 2). Découpe vue par panneau (`+Toolbar`, `+Canvas`, `+MediaPicker`). **Ne JAMAIS** appeler `prepareExport`/`StoryExporter.export` depuis `runStoryUpload` (règle absolue RAW publish).

### P2 — `StoryViewerView*` (4 partials, 80+72+59 KB) — app
- Déjà partiellement splitté (`+Content`, `+Canvas`, `+Sidebar`). Continuer : extraire les sous-vues `Equatable` du `+Content` (rows commentaires, sidebar counts).

### P3 — `OfflineQueue.swift` (82 KB), `MessagePersistenceActor.swift` (74 KB), `StoryModels.swift` (131 KB), `CoreModels.swift` (65 KB) — SDK
- `StoryModels`/`CoreModels` : découper par entité (`StoryModels+Commands.swift`, `+Effects.swift` ; `CoreModels+User.swift`, `+Conversation.swift`). Pur déplacement de `struct`/`enum`.

**Lots P1 d'abord (3 fichiers, ~425 KB), un fichier par PR, build vert entre chaque.**

---

## 3. Élimination des `AnyView` (55 sites)

`AnyView` casse l'optimisation d'identité structurelle de SwiftUI (re-render inutiles). Remplacer par :
- `@ViewBuilder` sur les fonctions/computed properties retournant conditionnellement.
- `Group { if … else … }` pour les branches.
- Génériques `some View` quand le type est unique.

**Action** : `grep -rn "AnyView" apps/ios/Meeshy packages/MeeshySDK/Sources` → traiter par fichier, en commençant par les vues de liste/cellules (impact perf maximal : `Bubble*`, `*Row`, `Feed*`).

---

## 4. Couplage aux singletons (138 `.shared`)

Top : `CacheCoordinator` (247), `ThemeManager` (179), `AuthManager` (175), `APIClient` (133), `FeedbackToastManager` (129).

**Problème** : ViewModels et vues référencent les singletons en dur → non testables, re-renders globaux.

**Refactoring iso-comportement** (déjà le pattern documenté) :
- ViewModels : **injection par init avec défaut `.shared`** (`init(api: APIClientProviding = APIClient.shared)`). Permet le mock sans changer les call-sites.
- Leaf views : remplacer `@ObservedObject var theme = ThemeManager.shared` par `let isDark: Bool` / `@Environment(\.colorScheme)` (cf. « Leaf Views — Zero @ObservedObject Singleton »). Cible : `ThemeManager.shared` dans les cellules de liste.
- Protocoliser les services les plus injectés (`{Service}Providing`) là où un mock manque encore.

**Ordre** : commencer par les leaf views (gain perf + faible risque), puis les VMs sans protocole.

### Avancement L1 (PR #307)
Pattern appliqué = celui de l'audit **P1-16** (`IncomingCallView`) : `@ObservedObject private var theme = ThemeManager.shared` → `@Environment(\.colorScheme) private var colorScheme` + `private var theme: ThemeManager { ThemeManager.shared }` (accès non-observant). La réactivité dark/light reste assurée par `.preferredColorScheme` posé à la racine de l'app → `\.colorScheme` → re-render → recalcul des couleurs `theme.*`. Zéro changement de call-site, zéro perte de feature.

Premiers leaf primitives migrés :
- `Primitives/AchievementBadge.swift` — `@ObservedObject theme` **mort** (jamais utilisé) → supprimé.
- `Primitives/ChatBubble.swift` — `isDark` dérivé de `colorScheme` ; `theme.textPrimary` via accès non-observant.
- `Primitives/ProfileCompletionRing.swift`, `Primitives/StatsCard.swift`, `Primitives/UserIdentityBar.swift` — accès non-observant + `colorScheme` pour la réactivité.

Reste à traiter (même pattern, par PR) : autres `@ObservedObject … = ThemeManager.shared` en vues **leaf** (cf. `grep`), en distinguant containers (où l'observation est légitime) des cellules. Vérif build : macOS.

---

## 5. Dette de logging (28 `print`)

Remplacer chaque `print(...)` par `os.Logger` catégorisé (`Logger.network/.auth/.messages/.media/.socket`). Bénéfice : redaction auto des données sensibles en release, filtrage, zéro coût si niveau filtré. Pur remplacement mécanique.

---

## 6. Réglages de concurrence Swift 6.2 (lié au crash iOS 16)

Cf. `tasks/ios16-compatibilite-tracage-2026-05-30.md` §5. Les features « Approachable Concurrency » (SE-0461/0466/0470) sont **bleeding-edge** et corrélées au crash dyld iOS 16.

**Recommandation de simplification prudente** (après confirmation par la ligne dyld) :
- Conserver `defaultIsolation(MainActor)` (SE-0466) — il supprime une classe de data races et son retrait casse la compilation.
- **Évaluer le retrait de SE-0461** (`NonisolatedNonsendingByDefault`) si confirmé comme cause du crash : c'est le réglage le plus risqué pour le back-deployment et le moins structurant. Réversible sans erreur d'isolation.
- Centraliser ces réglages : ils sont dupliqués dans 3 endroits (`apps/ios/Package.swift`, `packages/MeeshySDK/Package.swift`, `apps/ios/project.yml`) — toute évolution doit toucher les 3 (risque de dérive).

---

## 7. Hygiène ciblée (faible effort, bon ratio)

- **Fichiers/scripts legacy obsolètes à la racine `apps/ios/`** : `WebRTCStubs.swift` (non compilé, absent du `pbxproj`), `create_real_ios_app.sh`, `setup_xcode_project*.sh`, ~20 `add_*.rb` (antérieurs à XcodeGen). Le projet est piloté par `project.yml` + SPM. → **supprimer** dans un lot « cleanup » dédié (cf. `tasks/ios16-support` §résidus).
- **Docs markdown racine** (`PROJECT_COMPLETE.md`, `LAUNCH_SUCCESS.md`, `MASTER_ACTION_PLAN.md`…) : consolider sous `apps/ios/Documentation/`.
- **`build_output.txt`, `screenshot_*.png`, `master_*.png`** versionnés à la racine → déplacer/ignorer.

---

## 8. Roadmap proposée (PR atomiques, build vert entre chaque)

| Lot | Contenu | Risque | Gain |
|---|---|---|---|
| L1 | Leaf views : retrait `@ObservedObject` singletons → primitifs (§4) | Faible | Perf liste |
| L2 | `AnyView` → `@ViewBuilder`/`Group` sur cellules (§3) | Faible | Perf |
| L3 | `print` → `Logger` (§5) | Très faible | Hygiène |
| L4 | Cleanup fichiers legacy racine (§7) | Très faible | Lisibilité repo |
| L5 | Décomposition P1 : `MessageDetailSheet` (par onglet) | Moyen | Maintenabilité |
| L6 | Décomposition P1 : `ConversationViewModel` (extensions) | Moyen-élevé | Cœur produit |
| L7 | Décomposition P1 : `StoryCanvasUIView` (extensions) | Élevé | Plus gros fichier |
| L8 | Injection init des VMs très couplés (§4) | Moyen | Testabilité |
| L9 | Décomposition P2/P3 (Call, Sockets, Composer, Models) | Moyen | Long terme |
| L10 | Décision concurrence SE-0461 (après diagnostic dyld) | Voir §6 | Stabilité iOS 16 |

**Démarrer par L1→L4** : gains immédiats, risque quasi nul, met le terrain en ordre avant les gros découpages.

---

## 9. Définition de « fait » pour chaque lot

1. Iso-comportement prouvé : aucun test existant ne change de résultat.
2. `meeshy.sh build` + `meeshy.sh test` verts (simulateurs 16 / 17 / 26 pour les lots UI).
3. Diff = déplacements/extractions, **pas** de logique modifiée (revue : « est-ce qu'un staff engineer signerait ça comme un refactor pur ? »).
4. Aucune feature retirée — vérification manuelle de l'écran touché.
