# iOS UI/UX — Iteration 208i

**Date** : 2026-07-21
**Surface** : `apps/ios/Meeshy/Features/Contacts/ContactsListTab.swift`
**Axe** : accessibilité VoiceOver — label de rangée surchargeant `children: .combine` (perte d'info)
**Base** : `main` HEAD (resync post-merge #2198 / 195i)

## Contexte

`ContactsListTab.contactRow` est la rangée de la liste de contacts (onglet
Contacts). Chaque rangée est un `Button` (ouvre le profil) composant : avatar +
nom + `@username` + une 3e ligne d'état (**« En ligne »** vert, ou **« Vu {il y
a X} »** quand hors ligne avec `lastActiveAt`) + chevron de disclosure.

## Constat — label VoiceOver appauvri (doctrine 207i)

La rangée applique :

```swift
.accessibilityElement(children: .combine)
.accessibilityLabel("\(name), \(isOnline ? "en ligne" : "hors ligne")")
```

Par sémantique SwiftUI, un `.accessibilityLabel` explicite **remplace** le texte
agrégé par `children: .combine`. Le label composé ne restitue donc que **nom +
en ligne/hors ligne**, en **perdant deux informations que l'utilisateur voyant
lit** :

1. **`@username`** — le handle, seul désambiguïsateur quand deux contacts
   partagent le même nom d'affichage. Un utilisateur VoiceOver ne peut pas
   distinguer deux « Jean Dupont ».
2. **Ancienneté « Vu {il y a X} »** — la rangée hors ligne avec `lastActiveAt`
   affiche visuellement le dernier passage, mais VoiceOver n'entendait qu'un
   « hors ligne » nu (voire, dans la branche `isOnline == false`, l'ancienneté
   n'était jamais annoncée).

C'est exactement le défaut soldé en **207i** pour `CallJournalRow`
(`CallsTab.swift`) : un `.accessibilityLabel` explicite écrasant un
`children: .combine` doit **re-énoncer tout ce que la rangée montre**.

## Correctif (208i)

Helper pur `contactRowAccessibilityLabel(name:username:isOnline:lastActive:)`
recomposant `[name, "@username", état]` où l'état est :

- **en ligne** → `contacts.list.online.lower` (« en ligne ») ;
- **hors ligne avec `lastActive`** → `contacts.list.last-seen` (« Vu %@ ») +
  `relativeTimeString.lowercased()` — **parité stricte avec le texte visible** ;
- **hors ligne sans `lastActive`** → `contacts.list.offline.lower` (« hors
  ligne »).

Miroir exact de `CallsTab.rowAccessibilityLabel` (207i). Le scope
`.combine` est **conservé** (nécessaire : la rangée compose plusieurs `Text`).

## Portée

- **2 fichiers** : `ContactsListTab.swift` (helper + swap du label) +
  `ContactsListTabAccessibilityTests.swift` (garde source-level neuf, miroir de
  `CallsTabAccessibilityTests`).
- **0 clé i18n neuve** — réutilise `contacts.list.online.lower`,
  `contacts.list.offline.lower`, `contacts.list.last-seen`, **déjà présentes
  inline** dans ce fichier.
- **0 logique / 0 réseau / 0 layout / 0 changement visuel.**

## Vérification

- Build iOS non exécutable ici (hôte Linux, pas de toolchain Swift). Revue
  statique : `relativeTimeString` (extension `Date`) et les 3 clés réutilisées
  étaient déjà consommées par ce même fichier → aucune API neuve.
- Garde source-level ajoutée (`test_contactRow_accessibilityLabelIncludesHandleAndLastSeen`,
  `test_contactRow_labelDelegatesToComposedHelper`).
- Gate = CI `iOS Tests`.
- Collision essaim : `search_pull_requests … ContactsListTab` → 0 PR ouverte.
  207i porte sur `CallsTab.swift` (fichier distinct), pas de chevauchement.
