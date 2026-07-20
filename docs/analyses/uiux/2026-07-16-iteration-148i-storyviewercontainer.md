# Itération 148i — Analyse UI/UX iOS : `StoryViewerContainer`

**Date** : 2026-07-16
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/StoryViewerContainer.swift`
**Base** : `main` HEAD (`e19c523`)
**Branche** : `claude/laughing-thompson-ogqlku`
**Gate** : CI `iOS Tests`

## Contexte

`StoryViewerContainer` héberge deux overlays d'état plein écran posés sur le fond sombre du
viewer de stories :
- **`loadingOverlay`** — spinner + « Loading… » pendant la résolution du groupe de stories.
- **`notFoundOverlay`** — **état d'erreur** affiché quand la story est introuvable / expirée :
  glyphe hero `exclamationmark.circle`, titre, description, boutons « Réessayer » / « Fermer ».

Les deux overlays partagent le même `closeButton` (croix flottante en haut-droite).

Surface **fraîche** : 2 `.font(.system(size:))`, 0 commentaire doctrine, 0 `MeeshyFont.relative`.
**Aucune PR ouverte ne touche ce fichier** (essaim iOS en vol 140i→147i : `ThemedBackButton`,
`MyStoriesView`, `FriendRequestListView`, `StoryExpiredContent`, `MessageViewsDetailView`,
`ConversationDashboard`, `VoiceProfileManageView`, `StatsTimelineChart`) → **0 contention**.
Numéro **148i** (strictement > 147i, plus haut en vol #1980).

## Constat (avant 148i)

Le corps de texte est déjà entièrement sur polices sémantiques (`.subheadline`, `.headline`,
`.footnote`, `.subheadline.weight(.semibold)`) → **Dynamic Type déjà couvert** pour tout le
contenu lisible. i18n complet (toutes les chaînes passent par `String(localized:)`).

**2 sites `.font(.system(size:))`** — tous deux des **cas de gel légitimes**, mais porteurs de
**2 lacunes VoiceOver réelles** :

1. **`closeButton` — croix icône-only NON labellisée (défaut a11y réel).**
   Le bouton `xmark` (16pt, cadre de tap fixe 32×32) n'avait **aucun** `.accessibilityLabel`.
   VoiceOver annonçait « bouton » sans nom → l'utilisateur ne pouvait pas savoir que c'est la
   fermeture. **C'est le seul moyen de sortir de l'état d'erreur** au clavier/VoiceOver quand le
   viewer est en échec → gap critique.

2. **`notFoundOverlay` — glyphe hero d'erreur exposé à VoiceOver.**
   `exclamationmark.circle` (38pt) n'était pas masqué → VoiceOver le lisait comme un élément
   distinct (« point d'exclamation entouré ») avant le titre, doublant le sens porté par le
   titre « Story introuvable ».

## Correctifs 148i

| Site | Avant | Après |
|------|-------|-------|
| `closeButton` `xmark` (32×32 fixe) | figé, **sans label** | **figé + commenté (doctrine 82i)** ; **`.accessibilityLabel(common.close)` ajouté** (clé existante réutilisée, 0 clé neuve) |
| `notFoundOverlay` `exclamationmark.circle` 38pt | décoratif, exposé | **figé + commenté (doctrine 84i/86i)** ; **`.accessibilityHidden(true)` ajouté** |

- **Gel des 2 `.font(.system(size:))`** justifié + commenté : glyphe dans cadre de tap fixe
  (32×32) et hero d'erreur décoratif (~38pt) — un scaler XXXL déborderait du cercle / du layout.
- **0 clé i18n neuve** : `common.close` est déjà utilisée dans le même fichier (bouton capsule
  ligne 142) → réutilisée pour le label VoiceOver de la croix.
- **0 logique** modifiée, **0 test neuf**, **1 fichier**. Parité doctrinale 55i/74i/86i/93i/104i.

## Vérification

- **Sémantique préservée** : aucune police visible changée (les 2 glyphes figés gardent leur
  taille exacte) → 0 régression visuelle, snapshots inchangés.
- **VoiceOver** : la croix annonce désormais « Fermer, bouton » ; le glyphe d'erreur ne pollue
  plus le focus. Le titre + description + boutons restent des éléments distincts navigables.
- **Gate** : CI `iOS Tests` (compile Xcode 26.1.1 / run simu iOS 18.2). Changement purement
  additif (2 modificateurs a11y + 2 commentaires) → aucun risque de compile.

## Complétion

✅ **Résolu 148i** — `StoryViewerContainer` : lacune VoiceOver de la croix de fermeture comblée
(icône-only désormais labellisée), glyphe hero d'erreur masqué, 2 gels doctrinés/commentés.

**NE PLUS re-flagger** `StoryViewerContainer` : Dynamic Type déjà sémantique partout ailleurs,
les 2 `.system(size:)` figés à dessein (croix 32×32 + hero erreur ~38pt), croix labellisée.

**Restant / différé 149i+** (fresh surfaces à vérifier vs collision essaim) :
`StoryViewerView+Content` (31, ⚠️ i18n #1174), `ConversationAnimatedBackground` (12, décoratif),
`ConversationBackgroundComponents` (2), `BubbleStandardLayout` (2, ⚠️ Zero-re-render leaf).
`FeedView` (7) et `IncomingCallView` (3) sont **déjà mûrs** (tous glyphes en cadres fixes figés,
a11y complète) → écarter.
