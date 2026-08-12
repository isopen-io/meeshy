# Refonte native-lean du menu appui-long sur message (iOS)

**Date :** 2026-07-01
**Statut :** Design validé — en attente de review avant plan d'implémentation
**Surface concernée :** pile d'overlay déclenchée par appui long sur une bulle de message

---

## 1. Contexte & problème

L'interaction « appui long sur une bulle » empile aujourd'hui **trois surfaces** de plus en plus denses :

1. `MessageContextOverlay` (192 l) — backdrop flouté + bulle élevée + capsule d'actions horizontale (`ContextActionMenu`).
2. `MessageOverlayMenu` (1559 l) — surfacé par « Réagir » : barre d'emojis + preview bulle + **quick action bar** horizontale + **detail panel** drag-to-expand.
3. `MessageDetailSheet` (2501 l) — grille 5 colonnes mêlant actions et **10 onglets** (Langue, Vues avec 6 sous-filtres, Réactions, Réagir, Signaler, Supprimer, Transférer, Sentiment, Transcription, Historique).

### Symptômes de surcharge

- **Redondance triple.** *Copier / Traduire / Supprimer / Éditer* apparaissent dans la capsule d'entrée (couche 1), la quick action bar (couche 2) **et** la grille (couche 3).
- **Grille à double modèle.** Des cercles visuellement identiques mélangent des *actions* immédiates (Répondre, Copier, Épingler…) et des *onglets* qui ouvrent un sous-panneau (Langue, Vues, Signaler…). Rien ne distingue « ça agit » de « ça ouvre ».
- **Arc-en-ciel.** Chaque item porte sa propre couleur sémantique → pastilles multicolores bruyantes, éloignées du design par défaut iOS.
- **Arbre profond.** 10 onglets + 6 sous-filtres de Vues.
- **Conflit de geste audio/vidéo.** Le swipe-Répondre/Transférer (`BubbleSwipeContainer`, `.simultaneousGesture`) reçoit le drag en même temps que le scrubber de lecture → gratter la lecture déplace aussi la bulle.

## 2. Objectifs / non-objectifs

### Objectifs
- Un **menu unique**, épuré, style natif iMessage : barre de réactions + bulle élevée + **liste d'actions verticale**.
- **Zéro redondance** : chaque action existe à un seul endroit.
- **Séparer action rapide et exploration** : la liste ne contient que des actions ; l'exploration part dans une feuille native « Plus… ».
- **Nouveaux gestes** : double-tap pour réagir (toutes bulles) ; swipe « résistant » sur audio/vidéo.
- **Compatibilité iOS 16 → 26**, alignement sur le design par défaut (composants système).

### Non-objectifs
- Ne PAS toucher la logique métier des vues de contenu existantes (traduction, read-status, réactions, transcription…) — elles sont **réutilisées**, pas réécrites.
- Ne PAS toucher au comportement du tap simple existant (ouverture média, toggle drapeau langue, expand texte).
- Ne PAS toucher les autres menus overlay (context menu de la liste de conversations).

## 3. Modèle d'interaction (4 gestes)

| Geste | Résultat | Portée |
|---|---|---|
| **Tap simple** | inchangé (ouvre média, toggle drapeau langue, expand texte) | toutes bulles |
| **Double-tap** *(nouveau)* | barre de réactions rapides seule, flottante au-dessus de la bulle. Tap emoji = réagit + ferme ; tap `+` = picker complet ; tap ailleurs = ferme. **Pas** de liste d'actions ni de panneau. | **toutes bulles** (texte, audio, image, vidéo) |
| **Appui long** | overlay complet : barre réactions + bulle élevée + liste d'actions verticale | toutes bulles |
| **Swipe latéral** | Répondre (sens « retour vers l'expéditeur ») / Transférer (sens opposé) — **déjà implémenté** dans `BubbleSwipeContainer` | texte : normal ; audio/vidéo : **résistant** (§6) |

### 3.1 Double-tap — neutralisation de la latence sur média

Le tap simple ouvre le plein écran sur image/vidéo. Superposer `count: 2` sur `count: 1` force SwiftUI à attendre la fenêtre de double-tap avant le tap simple → ouverture molle.

- **Bulles texte + audio** : `.onTapGesture(count: 2)` SwiftUI natif. Le tap simple y déclenche des actions non critiques en latence (toggle drapeau, expand) — le léger délai de désambiguïsation est acceptable.
- **Bulles média (image/vidéo)** : relation native **`require(toFail:)`** entre un `UITapGestureRecognizer` double-tap et le tap simple, câblée au niveau de la cellule `UICollectionView` (`MessageListViewController`). Le tap-ouvre-plein-écran ne fait qu'attendre l'échec du double-tap — latence native standard (pattern app Photos). Le tap simple reste net.

## 4. Layout de l'overlay complet (appui long)

```
        ╭─────────────────────────╮
        │  😂  ❤️  👍  😮  😢  🔥  ➕ │   ← barre réactions (glass), ~6-7 perso + '+'
        ╰─────────────────────────╯
        ┌─────────────────────────┐
        │      bulle élevée         │   ← position source, lift adaptatif
        └─────────────────────────┘
        ╭─────────────────────────╮
        │  ✏️  Éditer               │   ← liste verticale (glass), pleine largeur
        │  🌐  Traduire             │      icône + label alignés à gauche,
        │  📋  Copier               │      lignes ≥ 44pt (cible tactile HIG)
        │  📌  Épingler             │
        │  ⭐  Favori               │
        │  ⋯   Plus…                │
        ├─────────────────────────┤   ← séparateur = zone destructive
        │  🗑   Supprimer            │      (rouge, isolé)
        ╰─────────────────────────╯
```

- **Une seule capsule d'actions**, verticale — suppression de la quick action bar horizontale redondante et de la grille 5 colonnes.
- **Icônes monochromes** à l'accent de la conversation (`conversation.accentColor`), sauf *Supprimer* en `MeeshyColors.error`. Fin de l'arc-en-ciel.
- **Lignes contextuelles** : la liste rétrécit d'elle-même selon le message (une bulle reçue basique = Traduire · Copier · Plus…).

### 4.1 Liste d'actions primaire (validée avec l'utilisateur)

Ordre fixe : **Éditer · Traduire · Copier · Épingler · Favori · Plus… · Supprimer**.

| Action | Condition d'affichage |
|---|---|
| Éditer | `canEdit && message.isMe && hasText` |
| Traduire | toujours (ouvre le sheet directement sur la destination **Langue**) |
| Copier | `hasText` |
| Épingler / Désépingler | toujours (label selon `message.pinnedAt`) |
| Favori / Retirer des favoris | toujours (label selon `isStarred`) |
| Plus… | toujours (ouvre le `.sheet` §5) |
| Supprimer | `canDelete` (rôle destructif, isolé sous séparateur) |

**Répondre** et **Transférer** ne sont pas dans la liste : ce sont les **swipes** (§6). Ils restent listés dans « Plus… » pour la découvrabilité.

### 4.2 Barre de réactions

- Réutilise `EmojiReactionPicker` + `EmojiUsageTracker` (top emojis personnalisés persistés).
- **Conserve les 20 emojis scrollables horizontalement** + bouton `+` (picker complet). L'`EmojiUsageTracker` ordonne les plus utilisés en tête ; les suivants se découvrent au swipe horizontal. Comportement actuel inchangé.

## 5. Feuille « Plus… » native (`.sheet`)

Un seul `.sheet`, `NavigationStack { List }` — 100 % composants système, compatible 16 → 26. Nouveau composant : **`MessageMoreSheet`**.

```
═══ Options ═══
┌─ Actions ──────────────────┐
│  ↩  Répondre                 │   discoverable ; swipe = raccourci
│  ↪️  Transférer              │
│  💬  Discussion              │
│  🧷  Supprimer le média       │   si média + droits
├─ Infos & Prisme ───────────┤
│  👁  Qui a vu             ›  │   NavigationLink → viewsTabContent réutilisé
│  😊  Réactions           ›  │   → reactionsTabContent
│  🌊  Transcription       ›  │   si audio/vidéo → transcriptionTabContent
│  🧠  Sentiment           ›  │   si texte → MessageDetailSentimentTab
│  🕘  Historique          ›  │   si édité → editsTabContent
├─ Modération ───────────────┤
│  ⚠️  Signaler            ›  │   → reportTabContent
└────────────────────────────┘
```

- **Réutilisation** : les vues de contenu de `MessageDetailSheet` (`languageTabContent`, `viewsTabContent`, `reactionsTabContent`, `transcriptionTabContent`, `editsTabContent`, `reportTabContent`, `MessageDetailSentimentTab`) deviennent des **destinations de navigation**. On jette la coquille « grille + 10 onglets colorés », pas la logique.
- **Traduire** (action primaire) ouvre ce sheet **directement** sur la destination **Langue** (pas de doublon « Langue » à la racine).
- **Sections contextuelles** : n'affiche que ce qui a du sens pour la bulle.
- `presentationDetents([.medium, .large])`, `presentationDragIndicator(.visible)`.

## 6. Swipe « résistant » audio/vidéo (nouveau besoin)

`BubbleSwipeContainer` (dans `MessageListView.swift`) gagne un paramètre de résistance dérivé du type de contenu.

| Réglage | Texte/autre (`.normal`) | Audio/vidéo (`.resistant`) |
|---|---|---|
| `minimumDistance` | 22pt (inchangé) | **48pt** — un petit grattage n'entre pas dans la zone de swipe |
| Dominance horizontale | `|dx| > 3·|dy|` | **`|dx| > 4·|dy|`** — un drag de scrubber légèrement diagonal ne passe plus |
| Priorité scrubber | — | **flag `isScrubbing`** : quand le doigt est sur le curseur, le player passe `isScrubbing = true` ; le container **abandonne** son drag tant que ça scrubbe |
| Commit | ≥66pt (inchangé) | ≥66pt (le seuil relevé + flag suffisent) |

- **Source unique de vérité** : le flag `isScrubbing` est exposé par le lecteur (audio via `AudioBubbleRouter` / son lecteur ; vidéo via son lecteur inline) et remonte au container. Robuste — pas de devinette d'arbitrage de gestes.
- **Ressenti** : sur un vocal/vidéo, le grattage de lecture est naturel ; il faut **« forcer »** un swipe horizontal ample et hors curseur pour déclencher Répondre/Transférer.

## 7. Architecture des composants

| Composant | Nature | Détail |
|---|---|---|
| `MessageActionsMenu` | **nouveau** | Liste verticale glass. Réutilise `ContextAction` (+ `.star`, `.thread` au besoin). Rendu via `adaptiveGlass` dans un `RoundedRectangle`. Lignes ≥ 44pt, icône monochrome accent + label, séparateur avant la zone destructive. |
| `MessageOverlayMenu` | **fort allègement** | barre réactions + bulle élevée + `MessageActionsMenu`. Suppression : quick action bar, detail panel drag-to-expand, doubles `DragGesture`. |
| `MessageMoreSheet` | **nouveau** | `.sheet` natif `NavigationStack { List }` (§5). Héberge les vues de contenu réutilisées. |
| `MessageDetailSheet` | **décomposé en fichiers dédiés** | Chaque vue de contenu part dans son propre fichier (§7.1) ; on supprime `DetailTab`/`DetailGridItem`/`unifiedGrid`/`gridButton`. |
| `MessageContextOverlay` | **ajusté** | nouveau layout (liste verticale). Machine à états `OverlayPhase` conservée. |
| `ConversationView+ContextOverlay.swift` | **ajusté** | routage actions ; présentation `MessageMoreSheet` ; wiring double-tap. |
| `BubbleSwipeContainer` (`MessageListView.swift`) | **étendu** | param résistance + lecture `isScrubbing`. |
| lecteurs audio/vidéo inline | **étendu** | exposent `isScrubbing`. |
| `MessageListViewController` | **étendu** | `UITapGestureRecognizer` double-tap `require(toFail:)` sur cellules média. |

### 7.1 Décomposition de `MessageDetailSheet` en fichiers dédiés

Chaque vue de contenu = **un fichier**, avec son `@State` encapsulé (ses propres chargements réseau, son propre état) — ce qui lève le risque de `@State` privés partagés (§12). Nouveau dossier `Meeshy/Features/Main/Components/MessageDetail/` (auto-inclus par le globbing XcodeGen).

| Nouveau fichier | Origine (dans `MessageDetailSheet`) | État encapsulé |
|---|---|---|
| `MessageLanguageDetailView.swift` | `languageTabContent` + `supportedLanguages` | translations, translatingLanguages, selectedLanguageCode, mergedTranslatedAudios… |
| `MessageViewsDetailView.swift` | `viewsTabContent` + sous-filtres `ViewsFilter` + shared views components + `ReadStatus*` models | readStatusData, attachmentStatuses, viewsFilter… |
| `MessageReactionsDetailView.swift` | `reactionsTabContent` + `ReactionUserItem` | reactionGroups, isLoadingReactions, reactionFilter |
| `MessageTranscriptionDetailView.swift` | `transcriptionTabContent` | isRequestingTranscription, translatingAudioLanguages |
| `MessageEditsDetailView.swift` | `editsTabContent` | editRevisions (injecté) |
| `MessageReportDetailView.swift` | `reportTabContent` | selectedReportType, reportReason, isSubmittingReport |
| `MessageForwardDetailView.swift` | `forwardTabContent` | conversations, forwardSearchText, sendingToId, sentToIds |
| (`MessageDetailSentimentTab` existe déjà) | `sentiment` | — |

`MessageMoreSheet` (§5) instancie ces vues comme **destinations `NavigationLink`**. `DetailActionButtonStyle` et les enums de coquille (`DetailTab`, `DetailGridItem`, `MessageAction` grid-only) sont supprimés une fois la migration terminée.

## 8. Système visuel

- **Couleur** : icônes monochromes à `conversation.accentColor` (règle CLAUDE.md « conversation-context → accentColor »). Destructif = `MeeshyColors.error` (statique). Fin des pastilles multicolores.
- **Verre** : `adaptiveGlass` (Liquid Glass iOS 26, dégrade en `.ultraThinMaterial` teinté < 26) pour la barre de réactions et la liste d'actions. Ombres d'élévation conservées (exception documentée pour overlays modaux).
- **Motion** : `withAnimationCompletion` existant (natif iOS 17, fallback `Task.sleep` iOS 16). Ressort d'ouverture inchangé.
- **A11y** : chaque ligne `accessibilityLabel` + trait bouton ; barre réactions groupée ; cibles ≥ 44pt ; double-tap et swipe déjà exposés en `accessibilityAction`.

## 9. Compatibilité iOS

| API | Dispo | Note |
|---|---|---|
| `NavigationStack` | iOS 16+ | plancher app |
| `.sheet` + `presentationDetents` | iOS 16+ | |
| `.onTapGesture(count:2)` | iOS 16+ | texte/audio |
| `require(toFail:)` (UIKit) | toutes | média, via cellule |
| `adaptiveGlass` / `glassEffect` | 26 + fallback | atome existant |
| `withAnimation completion` | 17 + fallback 16 | helper existant |

Plancher inchangé : **iOS 16.0**.

## 10. Tests

- **Helpers purs** : filtrage de la liste d'actions primaire selon `(isMine, canEdit, canDelete, hasText, hasMedia, pinnedAt, isStarred)` → fonction pure testable.
- **Sections « Plus… »** : construction des sections contextuelles → fonction pure testable.
- **Résistance swipe** : logique de seuil (`.normal` vs `.resistant`) extraite en fonction pure `shouldEngageSwipe(translation:isScrubbing:resistance:)`.
- **Non-régression gestes** : le swipe texte reste au comportement actuel ; le tap simple média reste net (test manuel + snapshot si dispo).
- Respect XCTest, factory functions, `@MainActor` sur les VM ; exécution simu iOS 18.2.

## 11. Journal de décisions

- **Native-lean** choisi vs nettoyage minimal ou refonte 2 niveaux (utilisateur, 2026-07-01).
- **Liste primaire** = Éditer · Traduire · Copier · Épingler · Favori · Plus… · Supprimer (utilisateur).
- **Répondre/Transférer** = swipes (déjà implémentés) ; listés dans « Plus… » pour découvrabilité.
- **Double-tap = toutes bulles** (utilisateur) ; latence média neutralisée via `require(toFail:)`.
- **Swipe résistant** audio/vidéo via seuil relevé + flag `isScrubbing` (utilisateur).
- **Barre de réactions** : conserve les 20 emojis scrollables + `+` (utilisateur, 2026-07-01) — pas de réduction.
- **Décomposition** de `MessageDetailSheet` en **fichiers dédiés** (un par vue de contenu), état encapsulé (utilisateur, 2026-07-01).

## 12. Risques / points ouverts

- **Décomposition de `MessageDetailSheet` (2501 l)** : gros fichier ; risque de casser des `@State` privés partagés entre vues de contenu. Mitigation : extraire les vues de contenu en composants dédiés à état encapsulé avant de rebrancher sous le `List`.
- **`require(toFail:)` en cellule UICollectionView** : vérifier la coexistence avec les gestes de scroll et le long-press existant (`maximumDistance: 6`).
- **Découvrabilité du double-tap** : envisager un onboarding léger ou un hint (hors scope de ce spec).
