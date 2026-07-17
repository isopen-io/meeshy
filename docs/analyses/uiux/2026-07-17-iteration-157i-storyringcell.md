# Iteration-157i — `StoryRingCell` VoiceOver actionability (Story tray)

**Date** : 2026-07-17
**Type** : Accessibilité (VoiceOver) — surface haute fréquence
**Fichier** : `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift`
**Scope** : 1 fichier Swift + 3 clés i18n (`.a11y`). 0 logique, 0 test neuf.

## Contexte

`StoryRingCell` est l'atome partagé qui rend **chaque groupe de stories** dans la
tray (le carrousel horizontal en tête du feed). Il est utilisé à la fois par la
grande trail et par la mini-trail compacte épinglée (`context: .storyTray` /
`.storyTrayCompact`) — le corriger améliore les deux surfaces d'un coup.

La cellule ouvre le viewer de stories via un `.onTapGesture` posé sur le `VStack`
racine (avatar + nom d'utilisateur), **pas** via un `Button`.

## Problème identifié (VoiceOver)

En inspectant le rendu accessibilité de la cellule :

1. **Nom lu deux fois** — `MeeshyAvatar` expose déjà `.accessibilityLabel(name)`
   (le username), et la cellule rend en dessous un `Text(group.username)` séparé.
   VoiceOver énonce donc le nom **deux fois** (avatar puis libellé).
2. **Action primaire invisible** — le `.onTapGesture` racine (`onViewStory()`)
   n'est **pas** exposé comme action d'accessibilité et la cellule ne porte pas
   le trait `.isButton`. Un utilisateur VoiceOver ne peut atteindre la story que
   via le menu contextuel de l'avatar (« Voir les stories ») — pas le chemin
   primaire attendu, et aucune annonce « bouton ».
3. **État non-lu inaudible** — `group.hasUnviewed` ne change QUE la couleur de
   l'anneau + le poids de la police. VoiceOver n'annonce jamais qu'il y a des
   stories non lues (violation « ne jamais reposer uniquement sur la couleur »).

## Correctif

Sur la racine de `StoryRingCell` (après le `.onTapGesture`) :

```swift
.accessibilityElement(children: .combine)   // 1 seul élément → plus de nom doublé
.accessibilityLabel(accessibilityLabelText) // « {username}, Stories non lues/vues »
.accessibilityAddTraits(.isButton)          // annonce « bouton » + double-tap = onViewStory
.accessibilityHint(story.tray.a11y.open)    // « Ouvre les stories »
```

- `.combine` fusionne avatar + nom en un seul élément (résout le doublon) tout en
  **préservant** les actions du menu contextuel de l'avatar.
- `.accessibilityLabel` explicite **surcharge** le libellé fusionné → un seul nom
  propre, suffixé de l'état lu/non-lu (couleur → texte).
- `.isButton` + le `.onTapGesture` sous-jacent → double-tap VoiceOver ouvre la
  story (chemin primaire enfin disponible).

### Clés i18n neuves (toutes suffixées `.a11y`, VoiceOver-only, 5 langues)

| Clé | fr |
|---|---|
| `story.tray.a11y.unread` | Stories non lues |
| `story.tray.a11y.read` | Stories vues |
| `story.tray.a11y.open` | Ouvre les stories |

## Ce qui N'a PAS été touché (déjà correct / hors scope)

- Les **5 `.font(.system(size:))`** résiduels de `StoryTrayView` sont tous des
  glyphes/textes dans des **cercles de dimension fixe** (32×32, 34×34, 44×44,
  50×50) déjà **figés & commentés** (doctrine 86i) — migration typographique
  déjà soldée. Ne pas re-flagger.
- Les boutons `+` (add story), placeholder mood, `addStoryButton` portent déjà
  `.accessibilityLabel`.
- `MyStoryButton` porte déjà `.accessibilityLabel` (ligne 531).

## Vérification

- Build local impossible (conteneur Linux, pas de toolchain macOS) → gate = CI
  **`iOS Tests`** (compile Xcode 26.1.1 / run simu 18.2).
- Revue statique : `String(localized:defaultValue:bundle:)` identique aux usages
  existants du fichier (l. 457, 494…) ; modificateurs a11y standards SwiftUI.
- xcstrings : insertion chirurgicale (105 lignes, 0 suppression), JSON valide,
  1230 clés, 5 langues par clé.

## Statut

✅ **Résolu 157i** — VoiceOver de `StoryRingCell` : nom dédoublonné, trait bouton
+ action primaire exposés, état non-lu annoncé. Grande trail + mini-trail
compacte couvertes simultanément (atome partagé).
