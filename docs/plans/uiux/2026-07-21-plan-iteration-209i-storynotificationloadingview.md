# Plan Iteration-209i — StoryNotificationLoadingView : annonce VoiceOver de l'état de chargement

**Branche de travail** : `claude/laughing-thompson-chy3fk`
**Base** : `main` HEAD `22465a5` (207i `CallJournalRow` #… mergé)
**Piste** : iOS (`i`)

## Objectif

Doter `StoryNotificationLoadingView` (skeleton affiché au cold-start quand
l'utilisateur tape une notification story et que le post sous-jacent se résout
côté réseau) d'une annonce VoiceOver cohérente. La vue compose un `ProgressView`
indéterminé + un `Text("Loading…")` **non groupés** → VoiceOver énonce deux
éléments disjoints (le tour indéterminé « En cours » du `ProgressView` **puis**
le texte), sans signaler l'état de chargement comme une unité.

## Constat

`StoryNotificationLoadingView.body` :

```swift
VStack(spacing: 16) {
    ProgressView().progressViewStyle(.circular).tint(.white)   // annonce indéterminée
    Text(String(localized: "loading.message", defaultValue: "Loading…"))
}
```

Aucun `.accessibilityElement` / `.accessibilityLabel` → deux nœuds VoiceOver
séparés pour un seul état sémantique. L'idiome établi dans la codebase
(`BlockedTab.swift:24-25`) collapse ce cas : `.accessibilityElement(children:
.ignore)` + `.accessibilityLabel(<message de chargement>)`.

## Étapes

1. [x] Resync branche depuis `origin/main` (207i `CallJournalRow` mergé, HEAD `22465a5`).
2. [x] Vérifier fraîcheur : `StoryNotificationLoadingView` = **0 mention** dans
   `branch-tracking.md` (619 KB d'historique), **0 test** ne le référence, clé
   `loading.message` utilisée **inline** dans ce seul fichier. Numéro **209i** >
   plus haut référencé (208i, simple pointeur de base — non réclamé).
3. [x] Hisser le message localisé en `private var loadingMessage` (DRY : réutilisé
   par le `Text` visible ET le label a11y → un seul point de vérité, 0 clé neuve).
4. [x] `VStack` : `.accessibilityElement(children: .ignore)` + `.accessibilityLabel(loadingMessage)`
   → un seul élément VoiceOver annonçant « Loading… » (miroir `BlockedTab`).
5. [x] Analyse + plan + tracking.
6. [ ] Commit + push ; gate CI `iOS Tests`.

## Contraintes

- 0 changement visuel, 0 logique, 0 réseau, 0 clé i18n neuve, 0 SDK, 0 test neuf, 1 fichier.
- APIs `.accessibilityElement`/`.accessibilityLabel` (iOS 14+) sous plancher app 16 → pas de garde de disponibilité.
- Auteur en conteneur Linux → build/VoiceOver validés en CI.
