# Addendum au contrat Focal — Composeur & effets

**Complète** `tasks/focal-implementation-contract.md` (WS-0 → WS-11).
**Date** : 2026-08-15.
**Statut** : WS-12 est un **correctif de régression**, pas une fonctionnalité. Il est bloquant pour la recette du vol. 4.

---

## 0. Comment ce document a été établi

La demande initiale était double : « un composeur ultra avancé » (langue auto, effets accessibles, formatage, stickers/emojis, localisation, vocaux, images — « simplifié si nécessaire ; si ça complexifie trop, réutiliser l'UniversalComposerBar simplement ») et « ce qui rendrait l'application plus amusante ».

Un panel de conception a été lancé pour arbitrer entre trois architectures de composeur. **Il n'a rien produit d'exploitable** : les agents n'ont eu accès à aucun outil de lecture, et leurs conclusions étaient donc des hypothèses non vérifiées. Elles ne sont pas reprises ici.

Ce qui suit repose exclusivement sur une lecture directe du dépôt, chaque affirmation portant sa référence `fichier:ligne`. Les conclusions inversent largement la demande initiale — c'est le résultat de la vérification, pas une reformulation du besoin.

---

## 1. Ce que le composeur sait déjà faire

Sept capacités étaient demandées. **Six existent déjà** et sont câblées dans `UniversalComposerBar` :

| Capacité demandée | État | Preuve |
|---|---|---|
| Sélection auto de la langue | **existe** | `onLanguageChange` (`UniversalComposerBar.swift:86`), `TextAnalyzer`, `applyDetectedLanguage` |
| Effets | **existe** | `effectsToggleButton` (`:1334-1374`), `onRequestEffectsPicker` (`:213`), `EffectsPickerView` (`ConversationView+Composer.swift:211`) |
| Emojis | **existe** | `onRequestTextEmoji` (`:158`) |
| Localisation | **existe** | `onLocationRequest` (`:97`) |
| Vocaux | **existe** | `onVoiceRecord` (`:96`), cycle d'enregistrement complet (`:117-124`) |
| Images | **existe** | `onPhotoLibrary` / `onCamera` / `onFilePicker` (`:146-148`), `onRecentMediaSelected` (`:163`) |
| **Formatage (gras, italique)** | **absent** | voir §3 |

Les effets ne sont donc **pas** « inaccessibles » : le bouton baguette est dans la barre, il affiche le nombre d'effets actifs, il porte un label VoiceOver, et il ouvre la feuille de sélection. **Deux taps.** La prémisse « les rendre bien plus accessibles » ne survit pas à la lecture du code.

**Conséquence : le repli autorisé par le demandeur est la bonne réponse, pas un pis-aller.** Construire un nouveau composeur reconstruirait six capacités opérationnelles, en remettant en jeu huit comportements subtils déjà stabilisés (détection de langue, mentions, drop/coller, vocal, pièces jointes, réponse/édition, minimisation, clavier) — pour un gain nul sur six des sept axes. `UniversalComposerBar` reste l'hôte. Aucun composeur n'est écrit.

---

## 2. WS-12 — Les effets et le cycle de vie disparaissent en mode Focal

C'est le vrai sujet, et il n'est couvert par aucun workstream existant.

### 2.1 Le défaut

Le mux de rangée (§WS-6, contrat ligne 352) substitue `EquatableFocalRow` à `EquatableMessageBubble` quand `readingMode.usesFlatRow`. Or **trois responsabilités vivent exclusivement dans le chemin bulle** :

| Responsabilité | Site | Statut en Focal |
|---|---|---|
| Effets visuels (10 drapeaux) | `ThemedMessageBubble.swift:317` — `.messageEffects(message.effects)` | **perdu** |
| Flou de révélation | `ThemedMessageBubble.swift:171` (`@StateObject blurController`) + `BubbleStandardLayout.swift:503-514, 1397, 1446` | **perdu** |
| Compte à rebours éphémère | `ThemedMessageBubble.swift:172` (`@StateObject ephemeralController`) + `BubbleStandardLayout.swift:332-337` | **perdu** |

`FocalRowInput` (§3.6) ne porte **aucun** champ d'effet : `.messageEffects(...)` lit `message.effects`, qui n'est pas dans l'entrée. Et si `BubbleContent` transporte bien l'état de cycle de vie (`isBlurred:170`, `ephemeral:169`, `kind: .burned/.ephemeralExpired`), **personne ne possède les deux contrôleurs ni le rendu du brouillard** côté rangée plate.

### 2.2 Pourquoi c'est bloquant et non cosmétique

Perdre `confetti` est regrettable. **Perdre `blurred` est une fuite de confidentialité** : un message envoyé flouté s'afficherait en clair, immédiatement lisible, dans le mode de lecture **par défaut**. Idem pour `viewOnce` — dont l'intention est pourtant présente dans le contrat, puisque `FocalRowActions.onConsumeViewOnce` (§3.6) est déjà déclaré. Le rappel de ce callback sans l'état qui le déclenche est la signature d'un oubli, pas d'une exclusion réfléchie.

La matrice de couverture du vol. 4 §5 exige que « chaque feature de la vue actuelle se comporte à l'identique ». Ces trois-là n'y figurent pas.

### 2.3 Périmètre

**But.** Rendre les effets et le cycle de vie du message dans la rangée plate, à l'identique du chemin bulle, en réutilisant la règle existante sans la dupliquer.

**Fichiers possédés** (disjoints de WS-0…WS-11) :
- `apps/ios/Meeshy/Features/Main/Views/Focal/Row/FocalEffectLayer.swift`
- `apps/ios/Meeshy/Features/Main/Views/Focal/Row/FocalLifecycleLayer.swift`

**Fichiers modifiés** — extension du périmètre de leurs propriétaires actuels, à négocier avant démarrage :
- `Focal/Core/FocalRowInput.swift` (WS-0) : ajout de `let effects: MessageEffects`.
- `Focal/Row/FocalRow.swift` (WS-4) : branchement conditionnel des deux couches.

**Contrainte dure — aucune réimplémentation de la règle.** `MessageEffectPlan(effects:reduceMotion:)` (`packages/MeeshySDK/.../MessageEffects.swift:117-149`) est la source de vérité, jumelée à `resolveMessageEffectPlan()` côté web. `FocalEffectLayer` la **consomme**, ne la redécide pas. Les sept règles de `apps/ios/CLAUDE.md` § « Effets de message » s'appliquent intégralement — en particulier la règle 7 : `plan.isEmpty ⇒ vue intacte`, l'écrasante majorité des messages ayant `effectFlags == 0` et ne devant payer aucun modifier inerte par cellule.

**Contrainte dure — collision avec la passe de perspective.** WS-5 écrit `layer.transform` et `alpha` sur la cellule ; les effets d'apparition écrivent échelle et opacité sur le contenu. Les deux ne doivent jamais viser la même couche : la passe agit sur la **cellule**, les effets sur le **contenu contre-inversé** à l'intérieur du `UIHostingConfiguration` (contrat §4.1). Un test de non-interférence est exigé — c'est le même piège que R2 (héritage de transform sur cellule recyclée).

**Types purs à extraire.**
- `FocalEffectRouting.layers(for plan: MessageEffectPlan, isFocused: Bool) -> FocalEffectLayers` — décide quels modifiers monter, sans SwiftUI, testable sans simulateur.

**Fichiers de test.**
- `apps/ios/MeeshyTests/Unit/Focal/FocalEffectRoutingTests.swift`
- `apps/ios/MeeshyTests/Unit/Focal/FocalLifecycleParityTests.swift`

**Critères d'acceptation.**
1. `content.isBlurred == true` ⇒ la rangée plate rend le brouillard et le texte est illisible avant révélation. **Test de parité explicite avec le chemin bulle** — c'est le critère de confidentialité.
2. `content.ephemeral != nil` ⇒ compte à rebours visible ; à expiration, la rangée passe en état expiré comme la bulle.
3. `viewOnce` ⇒ `onConsumeViewOnce` déclenché aux mêmes conditions qu'en bulle.
4. `effectFlags == 0` ⇒ **zéro modifier monté** (garde source + test sur l'arbre de vue).
5. `reduceMotion` ⇒ aucune apparition, `glow`/`rainbow` fixes, `pulse`/`sparkle` retirés — délégué à `MessageEffectPlan`, jamais recodé.
6. Non-interférence : une rangée portant `zoom` et située hors du plan focal conserve l'échelle de perspective de WS-5.

**Dépendances.** WS-0 (contrat d'entrée) et WS-4 (rangée). Démarrable dès WS-4 mergé.

---

## 3. Le formatage de texte : non livrable, et pourquoi

§6.4 du contrat décline le formatage sur trois affirmations. **Les trois sont vérifiées et exactes** :

1. `Message.content` est bien un `String` nu — `packages/shared/prisma/schema.prisma` ne porte aucun champ de spans ; seul `effectFlags Int @default(0)` (`:689`) accompagne le contenu.
2. `SendMessageRequest` ne transporte aucun span.
3. `showFormattingToolbar` n'a **aucun consommateur de rendu** : il n'existe que comme champ Zod (`packages/shared/types/preferences/message.ts:11`), comme propriété SDK (`PreferenceModels.swift:318`) et comme **interrupteur de réglages** dans deux écrans web (`MessageSettings.tsx:200`, `message-settings.tsx:125`). Aucune barre de formatage n'existe nulle part dans le dépôt.

**Position retenue : non livrable en l'état** — troisième branche de l'alternative. Motif : une représentation sérialisée dans la chaîne de contenu (option b) produirait un iOS qui affiche du gras là où le web affiche des astérisques, sur la **même** chaîne. Le Prisme Linguistique aggrave le défaut : le contenu traverse NLLB, et rien ne garantit qu'un balisage inséré survive à la traduction — un message formaté puis traduit afficherait ses marqueurs en clair chez le destinataire.

**Ce qu'on livre à la place : rien, explicitement.** Pas de barre grisée, pas de bouton inerte. Le modèle `ComposerRichTextModel` / `ComposerEffectSelection` reste **déclaré et testé** (contrat §3.10) pour que le chantier de transport n'ait rien à renommer. Le préalable est un champ de spans en base et dans `SendMessageRequest`, avec un rendu jumelé iOS/web — chantier gateway + shared, hors périmètre de cette branche.

---

## 4. Ce qu'on ne fait pas, et pourquoi

- **Un nouveau composeur** — six des sept capacités demandées existent (§1). Le coût est la remise en jeu de huit comportements stabilisés ; le gain est nul.
- **Un plan de création dépliable, un composeur tout-en-ligne** — les deux répondent à un problème d'accessibilité des effets qui n'existe pas : le bouton est dans la barre, à deux taps.
- **Le formatage de texte** — bloqué au transport (§3). Déclaré bloqué, pas simulé.
- **Les stickers de conversation** — le système de stickers est côté story. Le porter suppose de vérifier que les assets sont teintables ; non vérifié, donc non promis.
- **Un lot « plaisir » (WS-13)** — écarté à ce stade. Toute idée d'agrément repose sur des moteurs (accent de conversation, haptiques, ressorts, effets) dont ce document vient d'établir qu'ils **ne sont pas rendus** dans le mode de lecture par défaut. Ajouter de l'agrément par-dessus une régression de confidentialité serait un mauvais ordre de travail. WS-12 d'abord ; le sujet se rouvre sur des bases saines ensuite.

---

## 5. Ordre

```
WS-4 (rangée plate) ──── WS-12 (effets + cycle de vie)
                              │
WS-5 (perspective) ───────────┘   ← test de non-interférence transform/alpha
```

WS-12 est **bloquant pour la recette §7** : sans lui, activer le drapeau `reading_modes` expose en clair des messages que leur auteur a envoyés floutés.
