# iOS UI/UX — Iteration 217i

**Date** : 2026-07-26
**Surfaces** :
- `apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingAnimations.swift`
- `apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingFlowView.swift`
- `apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift`
- `apps/ios/Meeshy/MeeshyApp.swift`

**Axe** : Design system / retour haptique — consolidation des 9 derniers sites
qui court-circuitent `HapticFeedback` (SSOT MeeshyUI)
**Base** : `main` HEAD `ffef1339e` (dernier merge PR #2325)

## Contexte

L'app possède **une** abstraction haptique, `HapticFeedback`
(`packages/MeeshySDK/Sources/MeeshyUI/Utilities/HapticFeedback.swift`), citée
comme composant du design system dans `apps/ios/CLAUDE.md`
(« Haptics: `HapticFeedback.light()`, `.medium()`, `.success()`, `.error()` »).
Elle est consommée par ~90 fichiers de l'app.

Elle fait **deux** choses qu'un `UIImpactFeedbackGenerator` construit à la volée
ne fait pas :

```swift
@MainActor private static let lightGenerator = UIImpactFeedbackGenerator(style: .light)

@MainActor
public static func light() {
    #if canImport(UIKit) && os(iOS)
    lightGenerator.prepare()
    lightGenerator.impactOccurred()
    #endif
}
```

1. **Le générateur est un singleton `@MainActor` gardé chaud.** Son doc-comment
   dit explicitement pourquoi : « `prepare()` is invoked before each event so the
   engine stays warm — without it the very first tap feels missing. »
2. **Le corps est gardé `#if canImport(UIKit) && os(iOS)`**, donc l'appel compile
   en no-op hors iOS.

## Le défaut

Neuf sites — **huit d'entre eux dans le parcours d'onboarding**, c'est-à-dire
la toute première impression tactile de l'app — reconstruisent le générateur à
chaque tap et déclenchent sans `prepare()` :

```swift
Button(action: {
    onStepTapped(step)
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
}) { … }
```

| Fichier | Sites | Style |
|---|---|---|
| `OnboardingAnimations.swift` | l.432 (`StepIndicator`), l.495 (CTA principal) | `.light`, `.medium` |
| `OnboardingFlowView.swift` | l.134 (retour), l.151 (fermer) | `.light` ×2 |
| `OnboardingStepViews.swift` | l.216 (suggestion de pseudo), l.892 (onglet langue), l.925 (choix de langue), l.1277 (case CGU) | `.light` ×4 |
| `MeeshyApp.swift` | l.205 (`NotificationToastManager.hapticPlayer`) | `.light` |

Trois conséquences, par ordre d'importance :

### A. Le taptic est peu fiable — précisément là où il compte le plus

Le générateur est alloué, utilisé et **détruit dans la même expression**. Le
Taptic Engine n'est donc jamais préchauffé : *chaque* tap est un « premier
tap ». Apple documente `prepare()` exactement pour ce cas (réduire la latence
entre l'appel et le retour physique) — sans lui, le moteur peut être au repos et
le retour arrive en retard ou pas du tout. Le reste de l'app ne souffre pas de ça
puisqu'elle passe par `HapticFeedback` ; **l'onboarding est le seul parcours où
les taps sonnent creux**, et c'est le premier que l'utilisateur traverse.

C'est un défaut de *feedback après action* au sens de la revue UX : l'affordance
promet une réponse tactile et ne la tient pas de façon déterministe.

### B. Allocation à chaque tap

`StepIndicator`, la liste de langues et la grille de suggestions sont des
surfaces à taps répétés. Chaque tap alloue puis détruit un objet UIKit là où le
reste de l'app réutilise un singleton chaud.

### C. Duplication du design system

Neuf réimplémentations d'un helper qui existe, est importé (`import MeeshyUI` est
déjà présent dans les 4 fichiers) et n'était simplement pas appelé — aucun des
4 fichiers ne contenait une seule occurrence de `HapticFeedback.`. Le
`#if os(iOS)` du wrapper est également perdu à chaque site.

## Correctif (217i)

Remplacement 1:1 des 9 sites :

```swift
- UIImpactFeedbackGenerator(style: .light).impactOccurred()
+ HapticFeedback.light()

- UIImpactFeedbackGenerator(style: .medium).impactOccurred()
+ HapticFeedback.medium()
```

Aucun `import` ajouté ni retiré : `MeeshyUI` est déjà importé par les 4 fichiers,
et `UIKit` n'y était jamais importé explicitement (il arrivait via SwiftUI).

**Isolation d'acteur** — les 9 sites sont déjà `@MainActor` :
- 8 sont des closures d'action de `Button` formées dans un contexte
  `@MainActor` (corps de `View` ou `private func … -> some View`), le patron
  exact de `KeypadTab.keyButton` qui appelle `HapticFeedback.light()` et compile
  aujourd'hui en mode Swift 6 ;
- `MeeshyApp.hapticPlayer` est typé `(@MainActor () -> Void)?` côté SDK
  (`NotificationToastManager.swift:51`).

**Aucun changement de style haptique** : `.light` → `light()`, `.medium` →
`medium()`. L'intensité perçue est identique, la fiabilité ne l'est pas.

## Hors périmètre (délibéré)

`CallManager.swift` conserve ses deux wrappers privés (`playHaptic(_ style:)`
l.2879 et `playNotificationHaptic(_ type:)` l.2883) : ils sont **paramétrés par
le style/type**, or `HapticFeedback` n'expose que des points d'entrée fixes. Les
convertir demanderait soit d'élargir l'API du SDK, soit d'aplatir les appelants —
deux décisions qui débordent d'un correctif de surface. C'est un service, pas une
vue ; il est noté en suite 218i+ et **le verrou de test ne le couvre pas**.

## Tests

`apps/ios/MeeshyTests/Unit/Views/OnboardingHapticDesignSystemTests.swift`
(neuf, idiome source-introspection déjà en place — 215i/216i).

6 tests / 17 assertions :

1. `OnboardingAnimations` : 1 `light()` + 1 `medium()`, ancrés sur leur closure
   (`onStepTapped(step)` puis le haptique ; `guard isEnabled` puis le haptique)
   — une assertion `contains` nue serait verte même si les deux sites avaient
   fusionné sur le mauvais style.
2. `OnboardingFlowView` : exactement 2 `light()`, ancrés sur `previousStep()` et
   sur `dismiss()`.
3. `OnboardingStepViews` : exactement 4 `light()`, ancrés sur
   `selectSuggestion`, `editingTarget = target`, `acceptTerms.toggle()`.
4. `MeeshyApp` : le `hapticPlayer` affecté au SDK est bien
   `{ HapticFeedback.light() }` (assertion sur la chaîne multi-ligne exacte).
5. **Verrou SSOT** : aucun des 4 fichiers ne contient
   `UIImpactFeedbackGenerator(` ni `UINotificationFeedbackGenerator(`
   (lignes de commentaire retirées — l'analyse et les doc-comments nomment
   volontairement l'API supprimée).
6. **Conservation** : le nombre total d'appels `HapticFeedback.` par fichier
   égale le nombre de générateurs retirés (1+1, 2, 4, 1). Prouve un remplacement
   **1:1** — une suppression sans remplacement (haptique perdu) vire au rouge.

**RED prouvé** : les 17 assertions échouent contre `main` `ffef1339e` — les 4
fichiers ne contenaient aucune occurrence de `HapticFeedback.`. **GREEN** :
17/17 après correctif.

## Vérification

- Pas de toolchain Swift (Linux) → assertions vérifiées **déterministement** par
  correspondance de chaînes sur les fichiers modifiés ; équilibre des accolades
  des 4 fichiers de production contrôlé au tokenizer (chaînes retirées **avant**
  les commentaires) : **0**. Gate réel = CI `iOS Tests`, qui exécute
  `xcodegen generate` → le test neuf est enregistré automatiquement,
  **0 édition de `project.pbxproj`**.
- Nom de classe `OnboardingHapticDesignSystemTests` : ne matche aucun token de
  `FINAL_PHASE_CLASS_PATTERN` (Story/Post/Feed/Draft/Language/Auth/Session/
  Bubble/Conversation/Message) → phase 1 (suites isolées), aucun effet sur
  l'état de session.
- Collision essaim : `list_pull_requests` (open) → **0 PR ouverte** sur le dépôt.

## Bilan

**4 fichiers de production : 9 lignes remplacées (9+/9−).** 9 réimplémentations
du wrapper haptique supprimées, le parcours d'onboarding rejoint le générateur
chaud du design system. 0 clé i18n, 0 couleur, 0 layout, 0 logique, 0 réseau,
0 `import` touché.

## Suites (218i+)

1. `CallManager.playHaptic(_:)` / `playNotificationHaptic(_:)` — demandent
   d'élargir l'API `HapticFeedback` avec une surcharge paramétrée par style
   avant de converger. Une fois soldé : élargir le verrou SSOT en balayage
   repo-wide.
2. `sensoryFeedback` (iOS 17+) : **0 usage** app-wide. Adoption native possible
   *derrière* `HapticFeedback` (le wrapper reste le SSOT, il choisit
   l'implémentation selon `@available`) — jamais site par site.
3. `StoryViewerView+Content.shareStory()` — code mort, 0 site d'appel ;
   suppression + élargissement du verrou `UIActivityViewController` en balayage
   repo-wide (hérité de la suite 216i, toujours ouvert).
4. `MeeshyShareExtension` sans `Localizable.xcstrings` propre → 3 chaînes brutes.
