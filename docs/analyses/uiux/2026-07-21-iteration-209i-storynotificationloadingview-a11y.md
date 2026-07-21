# UI/UX Analysis — Iteration 209i (2026-07-21)

## Surface

`apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationLoadingView.swift`

Skeleton de premier plan affiché par `StoryNotificationTargetViewModel.state == .loading`
et par `StoryActiveBridge` pendant la résolution réseau du post story ciblé par une
notification (`storyReaction` / `statusReaction` / `postComment` story-flavoré). Rare
(cache-hit = handoff en une frame) mais visible au **cold-start**.

Écran **jamais audité** : 0 mention dans `docs/plans/uiux/branch-tracking.md`, 0 test le
référence.

## Constat — VoiceOver : état de chargement fragmenté (WCAG 1.3.1 / 4.1.2)

Le corps compose, sans regroupement a11y :

```swift
VStack(spacing: 16) {
    ProgressView().progressViewStyle(.circular).tint(.white)   // nœud VoiceOver #1 (indéterminé)
    Text(String(localized: "loading.message", defaultValue: "Loading…"))  // nœud VoiceOver #2
}
```

VoiceOver expose **deux éléments disjoints** : le `ProgressView` circulaire (annonce
générique d'activité indéterminée) puis le texte « Loading… ». L'état de chargement
n'est pas présenté comme une unité sémantique unique et l'annonce d'activité brute
précède un texte redondant.

## Correctif

Idiome établi dans la codebase — `BlockedTab.swift:24-25` collapse exactement ce cas :

```swift
.accessibilityElement(children: .ignore)
.accessibilityLabel(<message de chargement localisé>)
```

Appliqué au `VStack` de `StoryNotificationLoadingView`, avec le message localisé hissé
en `private var loadingMessage` (réutilisé par le `Text` visible ET le label a11y → un
seul point de vérité, **0 clé i18n neuve**, la clé `loading.message` existante est
partagée). Résultat : un seul élément VoiceOver annonçant « Loading… ».

- **0 changement visuel** (couche a11y uniquement), 0 logique, 0 réseau, 0 SDK, 0 test neuf, 1 fichier.
- `.accessibilityElement` / `.accessibilityLabel` (iOS 14+) sous plancher app 16 → pas de garde.

## Statut

✅ **Résolu 209i.** Ne plus re-flagger l'annonce VoiceOver de `StoryNotificationLoadingView`.

Piste 209i+ (surfaces fraîches, 1/itération, vérifier collision essaim) :
`StoryExpiredContent` empty-state (déjà largement travaillé, 15 mentions — prudence) ;
`StoryActiveBridge`/`StoryNotificationTargetScreen` = pur pass-through (rien à polir).
