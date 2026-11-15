# L'appui long montre le message tel qu'on le lit — conception

- **Date** : 2026-09-10
- **Statut** : conception validée par le porteur le 2026-09-10, amendée le même jour après relecture Opus (§12)
- **Plateforme** : iOS (`apps/ios`, `packages/MeeshySDK/Sources/MeeshyUI`)
- **Pilotage** : milestone #89 « L'appui long montre le message tel qu'on le lit, dans les quatre modes »
- **Issues** :
  - #5980 clavier
  - #5981 rendu du mode
  - #5982 barre 2×
  - #5983 Rivière
  - #5984 double tap Script
  - #5985 retraits différés
  - #5988 focus `isTyping` lié à rien
  - #5989 décision « Transférer »
- **Mesures** : lues sur `origin/dev` 9ca9079131

## 1. Directives du porteur (2026-09-10)

> Améliorer le long press sur un message dans une conversation en mode Bulle, Focal, Script ou Rivière. Le message doit préserver son format visuel de base pour les messages texte, vidéo, image, etc. La barre d'action rapide apparaît 2× plus grosse, sans fond, emoji par emoji avec l'animation vague actuelle ; le défilement reste là et le menu du bas aussi. Si un clavier était présent, le cacher directement avant de montrer ce menu.
>
> Pour le mode Script, messages non système : le double tap sur un message affiche la barre d'action rapide par-dessus le message, avec le fond et taille 2× ; un menu Liquid Glass juste en bas avec toutes les options en fonction du message.

Précisions tranchées le même jour :

| Question | Réponse |
|---|---|
| « Le défilement reste là » | Le défilement **horizontal de la barre d'emojis**. La conversation reste figée sous le voile. |
| « Format visuel de base » | Le **rendu de SON mode** : rangée plate en Focal et Script, bulle en Bulle, bulle Rivière en Rivière. Taille réelle, jamais réduit ni simplifié. |
| Contenu du menu du double tap | **Toutes les options** : actions rapides et contenu de « Plus… », en sections. |
| Retraits, budget | « On n'enlève rien tant que le résultat obtenu n'est pas validé. Les limites et plafond, on gère après. » |

## 2. État mesuré

### 2.1 Rendu

| Fait | Preuve |
|---|---|
| Aucun mode ne montre la vraie rangée. L'overlay reçoit `frameTracker.frame(for:) ?? .zero`, et la liste standard ne publie plus de cadre : il prend la branche `!useSourceFrame` et reconstruit un aperçu (lecteur vidéo 16:9, images plafonnées à 200 pt, texte coupé à 500 caractères). | `ConversationView.swift:2560` ; `MessageListView.swift:163-168` ; `MessageOverlayMenu.swift:306-369`, `584-898` |
| La branche `useSourceFrame` réduit la bulle jusqu'à ×0,4. | `MessageOverlayMenu.swift:243-275` |
| Bulle, Focal et Script partagent une cellule UIKit `BubbleSwipeContainer { FocalRow \| bulle }`, non rognée. Seul `BubbleSwipeContainer` porte `isHiddenForOverlay`. | `MessageListViewController.swift:1559`, `1712`, `1728-1760` ; `MessageListView.swift:169` |
| Une rangée Focal en focus (`input.isFocused`) pose des chips qui **débordent du bas de la cellule**. Le cadre fenêtre, lui, vaut `cell.bounds` : la capture retirée le 2026-08-23 les tranchait. | `MessageListViewController.swift:1651`, `1724-1730`, `2681-2706` |
| La pose Focal (transformation et opacité) s'applique au calque du `contentView`, hors de la chaîne `cell.convert(cell.bounds, to: nil)`. | `FocalScrollPerspective.swift:156-159` ; `MessageListViewController.swift:3283` |
| `MessageEffectsModifier` n'a « aucune mémoire de lecture » : toute nouvelle instance rejoue confettis, explosion et secousse (`plan.appearance`). Les effets persistants (`plan.persistent`) sont distincts. Il est monté dans `FocalRow` et `BubbleStandardLayout`. | `MessageEffectModifiers.swift:604-649` ; `FocalRow.swift:220` ; `BubbleStandardLayout.swift:602` |

### 2.2 Rivière

| Fait | Preuve |
|---|---|
| La Rivière ouvre un `.contextMenu` natif de trois actions, sans barre de réactions. Ses cadres sont publiés dans le repère du pane, gardés dans un `@State` privé de l'hôte. `RiverBubbleView` n'a aucun masquage. | `RiverBubbleView.swift:383-423` ; `RiverStreamHost.swift:346`, `362` |
| En Rivière, le contrôleur de liste reste vivant sous une vue cachée : `cellFrameInWindow` rend encore des cadres, et `scrollState.scrollToMessageId` fait défiler la liste cachée du Fil. | `MessageListView.swift:636`, `708-712`, `750` ; `MessageListViewController.swift:2694-2706` |

### 2.3 Clavier

| Fait | Preuve |
|---|---|
| `isTyping` est un `@FocusState` qu'aucun `.focused` ne lie depuis `6c994219e8` : `presentLongPressMenu`, la restauration et `triggerReply` écrivent dans le vide. Quatre lecteurs dorment, dont `typingHeaderBar` (#5988). | `ConversationView.swift:272`, `1251`, `2174`, `2208` ; `+LongPressMenu.swift:56-58`, `96`, `106` ; `+MessageRow.swift:38` ; `+AttachmentHandlers.swift:941` |
| Le vrai focus est celui du composer. Son réveil `focusTrigger` n'est pas passé par la conversation ; il se remet lui-même à `false` quand il a servi. La perte de focus enregistre le brouillon. | `UniversalComposerBar.swift:286` ; `UniversalComposerBar+Layout.swift:305-309` ; `+Composer.swift:94-101` |
| `beginEdit` ne pose aucun focus : ni Éditer ni Répondre ne lèvent le clavier aujourd'hui. | `+ComposerBanners.swift:226-233` |
| La conversation connaît le clavier par `keyboardTransition` (hauteur d'arrivée, durée, courbe, instant d'annonce, `isLive()`, `liveSlack` 0,1 s, `fallbackDuration` 0,25 s). | `ConversationView.swift:307`, `1289` ; `KeyboardTransition.swift:24-88` |

### 2.4 Gestes, menus, drapeaux, budget

| Fait | Preuve |
|---|---|
| Focal et Script n'ont aucun double tap sur une rangée standard ; les zones internes (citation, média, drapeaux, réactions, coches) ont leur propre tap. La loi du double tap existe : `QuickReactionGesture.acceptsDoubleTap(kind:)`, `.standard` seulement, portée par `QuickReactionDoubleTap` à identité stable. | `ThemedMessageBubble.swift:53-105` ; `FocalQuotedReplyView.swift:306` ; `FocalAttachmentBlock.swift:215` ; `FocalRow.swift:950-993` |
| `EmojiReactionPicker` sait changer d'échelle (`scale`) mais pose sa capsule sans condition ; six surfaces l'utilisent, overlay compris. `WaveTileModifier` ignore Reduce Motion. | `EmojiReactionPicker.swift:73`, `190`, `221`, `348-357` |
| Trois contextes de menu divergent : l'overlay pose `hasEditRevisions: true` et omet le favori de sticker ; la feuille « Plus… » lit les vraies valeurs. | `MessageOverlayMenu.swift:167-195` ; `ConversationView.swift:936-955` |
| Les options sont aiguillées en cinq sites (overlay, feuille, `nativeMenuButton` mort, barre rapide, rappels de la liste), avec deux divergences : « Transférer » (#5989) et « Copier » (texte affiché dans l'overlay, original ailleurs). | `ConversationView.swift:971`, `2550-2631`, `2736` ; `+MessageRow.swift:326` ; `MessageListViewController.swift:1760-1791` |
| `MessageMoreSheet.initialItem` n'ouvre que les explorations. La confirmation de suppression du média est un `@State` privé, posé par le seul tap. | `MessageMoreSheet.swift:15`, `57`, `102-103`, `265` |
| Focal, Script et Rivière vivent derrière le programme bêta, qui naît éteint. | `BetaFeaturesPreference.swift:42-52` ; `MeeshyFeatureFlags.swift:22-30` |
| La garde de taille mesure un **cumul** de la dette héritée (60 192 lignes pour un plafond de 60 862), jamais un fichier. `FocalRow.swift` compte 1 190 lignes pour un plafond dur de 1 200. | `FileSizeBudgetGuardTests.swift:317-329` |

## 3. Décisions

**D1 — La même rangée, construite par le même code, remontée au-dessus du voile.**
- La liste remet à l'overlay la rangée que sa cellule affiche. Une méthode unique construit ce contenu, sans contre-flip ni menu natif, et sans rien écrire sur la cellule (`tag`, interactions, `zPosition`).
- L'overlay la pose à plat au cadre de la cellule, non rognée, à l'échelle 1. La pose Focal n'est pas dans ce cadre.
- La copie est construite **hors focus** (`isFocused: false`) : les chips de focus débordent de la cellule et ne font pas partie du format du message.
- La copie reçoit les cinq objets d'environnement de la cellule : `host`, `stories`, `statuses`, `convList`, `timestampReveal`. Elle garde son emballage `Equatable` (`EquatableFocalRow`, `EquatableMessageBubble`, `RiverBubbleView`).
- Elle est inerte : `.allowsHitTesting(false)`, `.accessibilityHidden(true)`, sans menu contextuel, sans publication de cadre. Elle coupe les effets d'apparition par une valeur d'environnement lue par `MessageEffectsModifier`, et garde les effets persistants. Elle est vidée à la fermeture.
- La cellule d'origine se masque : `isHiddenForOverlay` pour la liste, le même paramètre ajouté à `RiverBubbleView` pour la Rivière. L'opacité seule change, le cadre continue d'être publié.

Alternatives écartées :
- **Élever la vraie cellule sur place** : deux voiles à raccorder sous un en-tête et un composer flottants en verre, flou perdu, chaque calque flottant devient une exception.
- **Capturer la cellule en image élargie** : c'est le chemin retiré le 2026-08-23 (vidéos noires, rendu figé, chips tranchées).

Limites assumées :
- La copie est une seconde instance. Un média en lecture peut y repartir de sa vignette ; le contenu est figé à l'ouverture.
- Un média flouté déjà révélé peut y reparaître flouté. À mesurer (§9.3).

**D2 — Un drapeau garde l'ancien chemin vivant, éteint hors bêta jusqu'à validation.**
- `MeeshyFeatureFlags.isLiftedRowLongPressEnabled` se résout ainsi :
  1. `MEESHY_FLAG_LIFTED_ROW_LONG_PRESS` (`1`/`0`) ;
  2. sinon la clé `meeshy.flag.lifted_row_long_press` si elle est posée (`object(forKey:) != nil`) ;
  3. sinon `BetaFeaturesPreference.isEnabled`.
- L'interrupteur est la bascule « Bêta » des réglages (la liste des fonctionnalités bêta n'y montre que des coches) ou la clé.
- Drapeau éteint : l'overlay actuel, le `.contextMenu` Rivière et l'absence de double tap servent à l'identique.
- L'activation pour tous est une décision du porteur après validation au simulateur. Elle précède #5985.

**D3 — Rien n'est retiré avant validation.** L'aperçu reconstruit, `buildNativeMessageMenu` (mort), `nativeMenuButton` et le menu natif Rivière restent dans le code. Leur retrait est l'objet de #5985.

**D4 — Aucun ajout net aux fichiers hors budget, prouvé par la mesure.**
- La garde ne mesure qu'un cumul. Le commit qui touche `ConversationView.swift`, `MessageListViewController.swift` ou `MessageOverlayMenu.swift` prouve donc Δ ≤ 0 par fichier (`wc -l` avant/après, dans le message de commit). Quand le cumul baisse, il abaisse `legacyLineCeiling` au cumul remesuré.
- Le nouveau code vit dans des fichiers neufs. Chaque ligne de câblage ajoutée à un fichier hors budget est compensée par une relocalisation pure (code déplacé tel quel).
- L'extraction du constructeur de rangée se fait **dans le même fichier** : les gardes de source qui lisent `MessageListViewController.swift` continuent de lire le même texte. Tout bloc qui change de fichier fait re-pointer ses gardes dans le même commit, sans affaiblir leurs assertions (§9.2).
- `FocalRow.swift` (1 190 / 1 200) n'est pas modifié.
- Le vrai retour sous le plafond est dans #5985.

**D5 — La Rivière rejoint l'overlay commun.**
- Le fournisseur de rangée se choisit **par le mode** (`readingModeController.mode == .river` ⇒ Rivière, sinon liste), jamais « le premier qui répond ».
- Pas de recentrage par `scrollState` en Rivière : la règle 4 de la géométrie suffit, et le cadre est converti du repère du pane vers la fenêtre avant toute décision.
- Drapeau actif, un `LongPressGesture` remplace le `.contextMenu`. VoiceOver reçoit les mêmes actes par `.accessibilityAction(named:)`.
- La liste compacte ajoute « Ouvrir dans le fil » et « Répondre », faute de glissé de réponse dans ce mode : deux nouveaux cas de `PrimaryAction`, placés après `.callDetail`.

**D6 — Le double tap en Script ouvre toutes les options.** L'appui long garde la liste compacte ; le double tap est la porte complète. La loi de glissé est la même dans les deux présentations (haut fort : « Plus… » ; bas : fermeture).

**D7 — Le clavier se lit par sa transition et se relève par le composer, hors drapeau.**
- « Clavier levé » = `keyboardHeight > 0`, jamais `isTyping`. `isTyping` reste non lié et inchangé : réveiller ses lecteurs est #5988.
- La baisse passe par `KeyboardDismissing` (`resignFirstResponder` envoyé à l'application). L'enregistrement du brouillon qui l'accompagne est voulu.
- L'attente avant la suite est calculée depuis la transition connue avant la baisse (§4, `LongPressPresentationPlan`). Aucun état n'est relu juste après `resignFirstResponder`.
- La relève passe par un `@State composerFocusTrigger` passé à `focusTrigger:`. Il est posé seulement si le composer est monté (pas en mode sélection) :
  - à la fermeture sans action, si le clavier était levé ;
  - après Éditer ;
  - après Répondre choisi dans un menu de l'appui long ou du double tap.
- Relever le clavier après Éditer ou Répondre est un comportement **nouveau**, avec son témoin. `triggerReply` lui-même n'est pas modifié (glissé de réponse : #5988).
- Correctif : l'ancien comportement est inerte, rien n'est gardé derrière le drapeau.

**D8 — Une fabrique unique de `MessageMenuContext`.** Le menu compact neuf, le menu glass et la feuille « Plus… » construisent leur contexte par `MessageMenuContextFactory`, avec les valeurs réelles de la feuille (révisions d'édition, favori de sticker). L'overlay actuel garde le sien jusqu'à #5985.

**D9 — `MessageActionRouter` aiguille les nouvelles portes.**
- Il sert le menu compact neuf et le menu glass. Ses closures appellent les mêmes méthodes de `ConversationView` que la feuille « Plus… ».
- La feuille garde ses closures : `MessageMoreJumpsToViewsGuardTests` les lit. La convergence de l'overlay actuel, de la barre rapide, des rappels de la liste et de la feuille sur le routeur est dans #5985.
- « Transférer » reprend l'effet de la feuille (armer la sélection) en attendant #5989.
- « Copier » copie le texte affiché, comme l'overlay servi aujourd'hui.

## 4. Unités

Chaque unité a une responsabilité, une interface, et se teste seule.

| Unité | Nature | Responsabilité | Fichier |
|---|---|---|---|
| `LongPressPresentationPlan` | loi pure | Entrées : transition clavier connue (hauteur, durée, instant, `isLive`), maintenant, mode, cadre fenêtre relu, hauteur de fenêtre. Sortie : baisse du clavier avec son attente = (reste de l'annonce en cours si elle vit) + durée annoncée + `liveSlack` ; puis recentrage (jamais en Rivière, décidé sur le cadre relu après l'attente) ; puis présentation. | neuf |
| `KeyboardDismissing` | protocole `@MainActor` | `func dismissKeyboard()` ; l'implémentation envoie `resignFirstResponder` ; un double compte les appels. | neuf |
| `LiftedMessageRow` | valeur | `messageId`, `content: AnyView`, `frameInWindow: CGRect`, `alignment` (`.leading` · `.trailing` · `.fullWidth`). | neuf |
| `LiftedRowProviding` | protocole `@MainActor` | `func liftedRow(for messageId: String) -> LiftedMessageRow?` — `nil` si la rangée n'est pas matérialisée. | neuf |
| `LiftedRowProviderLink` | boîte de référence (faible) | Tenue par `ConversationView`. La liste et l'hôte Rivière s'y enregistrent chacun sous leur mode ; la conversation interroge celui du mode courant. N'altère la signature d'aucun rappel existant. | neuf |
| Constructeur de rangée | méthode | Sort de la fermeture de cellule dans `MessageListViewController.swift` même ; rend le contenu avant contre-flip et menu natif ; paramètre `forLiftedCopy` (hors focus, inerte). La cellule et `liftedRow(for:)` l'appellent. | `MessageListViewController.swift` (extraction, Δ ≤ 0) |
| `RiverLiftedRowProvider` | classe | Alimentée par `RiverStreamHost` à chaque `onPreferenceChange` : cadres, contenus, largeur de contenu, origine globale du pane. Construit `RiverBubbleView` en présentation `.lifted` (sans `.contextMenu`, sans préférence de cadre), cadre converti vers la fenêtre. | neuf |
| `\.suppressesAppearanceEffects` | valeur d'environnement | Lue par `MessageEffectsModifier` : vraie ⇒ `plan.appearance` vide, `plan.persistent` intact. | `MessageEffectModifiers.swift` |
| `LiftedOverlayLayout` | loi pure | Géométrie de la barre, de la rangée et du menu (§6). | neuf |
| `LiftedMessageOverlay` | vue | Voile existant, barre, copie, menu ; reprend `MessageOverlayDragLaw`, `MessageActionsMenu`, la fermeture et la modale VoiceOver. Déclarée en `AnyView` au site de montage (`ConversationViewBodyTypeDepthTests`). | neuf |
| `EmojiReactionPicker.chrome` | option SDK | `.capsule` (défaut, inchangé) ou `.none`. `static func stripHeight(scale:) -> CGFloat` sert d'estimation ; la hauteur réelle est mesurée. Montée de la vague `16 * max(1, scale)`. Reduce Motion ⇒ fondu sans montée. | `MeeshyUI/Primitives/EmojiReactionPicker.swift` |
| `MessageMenuContextFactory` | fabrique | Un `MessageMenuContext` avec les vraies valeurs de la conversation (D8). | neuf |
| `MessageActionResolver.allOptionSections(_:)` | loi pure | Sections du menu complet (§7.2). | `MessageActionResolver.swift` |
| `PrimaryAction.openInThread`, `.reply` | cas d'enum | Actions Rivière (D5). `switch` exhaustifs à compléter : `MessageActionsMenu`, `MessageOverlayMenu.handlePrimaryAction`, `nativeMenuButton`. | existants |
| `MessageOptionsGlassMenu` | vue | Menu Liquid Glass en sections, hauteur bornée, défilement ; `adaptiveGlass` sur iOS 26, matière avant. | neuf |
| `MessageActionRouter` | valeur de closures | L'aiguillage des nouvelles portes (D9). | neuf (`ConversationView+MessageActionRouter.swift`) |
| `MessageMoreSheet.initialItem: .media` | entrée | Ouvre la confirmation de suppression du média dès l'apparition. | `MessageMoreSheet.swift` |
| `ScriptDoubleTapEligibility` | loi pure | `accepts(mode:kind:flag:)` = `mode == .script && QuickReactionGesture.acceptsDoubleTap(kind:) && flag`. Délègue ; ne réécrit pas la loi. | neuf |
| `ScriptMessageDoubleTap` | modificateur | `onTapGesture(count: 2)` à identité stable (`isEnabled` lu dans la fermeture, patron `QuickReactionDoubleTap`), posé sur `focalRow.equatable()` dans la cellule. Sans haptique propre. Remonte `onScriptDoubleTap(messageId)`. | neuf |
| Réveil du composer | câblage | `@State composerFocusTrigger` passé à `UniversalComposerBar(focusTrigger:)`. | `ConversationView+Composer.swift` |

## 5. Flux

### 5.1 Appui long — Bulle, Focal, Script, Rivière

1. Le geste existant se déclenche (0,35 s, haptique moyenne). En Rivière, drapeau actif, un `LongPressGesture` remplace le `.contextMenu`.
2. Si `keyboardHeight > 0`, `KeyboardDismissing` baisse le clavier et la suite attend la durée calculée par `LongPressPresentationPlan`.
3. Hors Rivière : le cadre de la cellule est relu. Si son milieu dépasse 60 % de la fenêtre, la liste recentre le message (mécanisme existant), puis le cadre est relu. En Rivière : aucun recentrage, cadre converti du pane vers la fenêtre.
4. Le fournisseur du mode courant rend la rangée. `nil` : repli explicite sur l'overlay actuel.
5. Le fond se floute et s'assombrit (existant). La cellule d'origine se masque, la copie apparaît à son cadre puis glisse avec le bloc si la règle 4 le déplace. L'overlay garde son haptique d'apparition ; aucune n'est ajoutée.
6. La barre 2× sans fond entre en vague au-dessus ; la liste d'actions compacte entre dessous.
7. Glissé haut fort : « Plus… » ; glissé bas : fermeture (`MessageOverlayDragLaw`, inchangée).

### 5.2 Double tap — Script, messages standard

1. `ScriptMessageDoubleTap` reconnaît le double tap sur les zones neutres de la rangée. Les zones internes gardent leur tap simple et gagnent au premier tap (assumé). Un message qui n'est qu'une image ou une citation passe par l'appui long ou l'action VoiceOver.
2. Mêmes étapes 2 à 5 que l'appui long.
3. La barre 2× **avec** sa capsule se pose à cheval sur le bord haut de la rangée.
4. `MessageOptionsGlassMenu` se pose juste sous la rangée.

### 5.3 Fermeture

- Sans action : si le clavier était levé et que le composer est monté, `composerFocusTrigger` le relève.
- Après Éditer, ou Répondre choisi dans le menu : le clavier se lève (nouveau, D7).
- Après Sélectionner : il reste baissé (règle existante ; le composer est démonté).
- Une entrée « Infos » ou « Modération » ferme le menu et ouvre « Plus… » sur son panneau.
- L'entrée « Supprimer le média » ferme le menu et ouvre « Plus… » sur sa confirmation.
- La cellule d'origine réapparaît ; la copie est vidée.

## 6. Géométrie — `LiftedOverlayLayout`

Entrées :
- cadre de la rangée (repère fenêtre, converti vers l'hôte) ;
- taille de l'hôte et zones sûres ;
- taille **mesurée** de la barre et taille du menu ;
- présentation (`.longPress` · `.scriptDoubleTap`) ;
- alignement ;
- `layoutDirection`.

Précédence : règle 5, puis règle 4, puis règles 3 et 6.

1. **Échelle** : toujours 1. Aucune entrée ne la fait varier.
2. **Barre** : hauteur mesurée (`stripHeight(scale: 2)` en estimation initiale). Largeur = largeur de l'hôte moins 16 pt de chaque côté, plafonnée à 520 pt (iPad). Défilement horizontal, « + » épinglé côté trailing. Appui long : bord bas de la barre 8 pt au-dessus de la rangée. Double tap : centre de la barre sur le bord haut de la rangée.
3. **Menu** : bord haut 6 pt sous la rangée. Abscisse : trailing pour mes bulles, leading sinon, bord de lecture pour une rangée pleine largeur ; bornée à 16 pt des bords. Pas de `.frame(maxWidth: 280)` hérité.
4. **Tenir dans l'écran** : si l'ensemble déborde, il glisse d'un seul bloc (la rangée comprise) au plus court, borné par la zone sûre haute pour la barre et basse pour le menu. L'entrée anime du cadre source vers le bloc glissé.
5. **Message trop haut** : si la rangée seule dépasse l'espace entre la barre et le bas, elle s'aligne sous la barre et le menu se pose en verre sur sa partie basse.
6. **Menu complet** : hauteur maximale = espace sous la rangée ; minimum 3 lignes (règle 4 sinon) ; au-delà, il défile.
7. **iPad** : le cadre fenêtre est converti dans le repère de l'hôte (colonne de détail décalée), jamais utilisé tel quel.

```
Appui long                      Double tap (Script)
░░░░░░░ voile ░░░░░░░           ░░░░░░░ voile ░░░░░░░
 😂  ❤️  👍  😮  😢  →  (+)        ╭ 😂 ❤️ 👍 😮 😢 → (+) ╮
                                ALICE · 14:02          │
ALICE · 14:02                   On se voit demain ?
On se voit demain ?             ╭────────────────────╮
   ╭────────────────╮           │ Modifier · Copier… │
   │ Modifier       │           │ Répondre · Transf… │
   │ Sélectionner   │           │ Langue · Réactions │
   │ Traduire       │           │ Signaler           │
   │ Plus…          │           │ Supprimer          │
   ╰────────────────╯           ╰────────────────────╯
```

## 7. Contenu des menus

### 7.1 Liste compacte (appui long)

`MessageActionResolver.primaryActions`, inchangée hors Rivière. En Rivière seulement, `.openInThread` et `.reply` s'ajoutent après `.callDetail`, portés par le contexte (`MessageMenuContext`), jamais par une branche de vue.

### 7.2 Toutes les options (double tap Script)

`allOptionSections(ctx)` rend, dans l'ordre, les sections non vides :

1. **Rapides** : `primaryActions` sans `.more`.
2. **Faire** : les actions de `moreSections`, moins celles déjà présentes en Rapides (`edit`, `copy`). `delete` en dernier, isolé, en rouge. `media` ouvre « Plus… » sur sa confirmation (`initialItem: .media`), jamais de suppression directe.
3. **Infos** : les infos de `moreSections`. `language` disparaît quand `translate` est déjà en Rapides (même destination).
4. **Modération** : `report`.

Destinations :
- les entrées « Faire » s'exécutent par `MessageActionRouter` et ferment le menu ;
- les entrées « Infos » et « Modération » ferment le menu et ouvrent « Plus… » sur leur panneau, qui garde ses contenus (langues, réactions, motifs de signalement).

## 8. Cas limites

- **Rangée non matérialisée ou cadre inconnu** : repli sur l'overlay actuel.
- **Mode sélection actif** : appui long et double tap coupés (règle existante). Le composer est démonté : aucun `focusTrigger` n'est posé.
- **Barre rapide déjà ouverte** : exclusivité existante conservée.
- **Message système** :
  - appui long : l'overlay s'ouvre (règle du 2026-08-24) ;
  - double tap : l'action propre de la carte, inchangée.
- **Message à effets** : la copie ne rejoue pas les effets d'apparition ; les effets persistants restent.
- **Rangée Focal en focus ou en pose** : la copie est posée à plat et hors focus.
- **Rivière** : aucun conflit avec le balayage des couloirs (`DragGesture` 40 pt) ni le tap curseur ; la liste cachée du Fil ne défile pas.
- **Clavier matériel ou flottant (iPad)** : la hauteur annoncée pilote ; une présentation sans annonce ne déclenche aucune attente.
- **VoiceOver** : overlay modal, geste d'échappement ; l'action « options du message » existante reste ; en Script, une action nommée ouvre le menu complet ; en Rivière, les actes du `.contextMenu` passent en actions nommées.
- **Clair et sombre, iOS 16 à 26** : verre sur iOS 26, matière avant ; la barre sans fond reste lisible sur le voile dans les deux thèmes.
- **Reduce Motion** : la vague devient un fondu.

## 9. Vérification

### 9.1 TDD (XCTest, `test_{méthode}_{condition}_{résultat}`)

- `LongPressPresentationPlan` :
  - clavier baissé ⇒ aucune attente ;
  - clavier levé et stable ⇒ attente = durée + `liveSlack` ;
  - clavier en train de monter ⇒ reste + durée + `liveSlack` ;
  - message bas hors Rivière ⇒ recentrage décidé sur le cadre relu ;
  - Rivière ⇒ jamais de recentrage.
- `LiftedOverlayLayout` : échelle 1 pour toute entrée ; débordement haut et bas ; message plus haut que l'écran ; barre à cheval en double tap ; précédence 5 > 4 > 3/6 ; leading/trailing en RTL ; plafond de largeur iPad ; conversion iPad.
- `allOptionSections` : dédoublonnage `edit`/`copy`/`language` ; filtrage par contexte (vue unique, pas de texte, pas d'édition) ; ordre et sections vides retirées.
- `MessageActionResolver.primaryActions` : `.openInThread` et `.reply` en Rivière seulement, après `.callDetail`.
- `MessageMenuContextFactory` : révisions d'édition et favori de sticker réels.
- `ScriptDoubleTapEligibility` : vrai pour `.script` × `.standard` × drapeau ; faux en Focal, en Bulle, pour `.system`, `.deleted`, `.burned`, `.ephemeralExpired`, drapeau éteint.
- `MeeshyFeatureFlags.isLiftedRowLongPressEnabled(defaults:environment:)` : environnement prioritaire ; clé posée prioritaire ; sans clé, suit le programme bêta.
- `LiftedRowProviderLink` : le fournisseur du mode courant répond, jamais l'autre.
- `MessageEffectsModifier` : `suppressesAppearanceEffects` vide le plan d'apparition et garde le persistant.
- `MessageMoreSheet` : `initialItem: .media` présente la confirmation.
- SDK :
  - `EmojiReactionPicker.stripHeight(scale:)` à 1 et à 2 ;
  - `chrome` par défaut `.capsule` ;
  - montée `16 * max(1, scale)` (le consommateur `scale: 0.78` garde 16 pt) ;
  - Reduce Motion ⇒ pas de montée.
- Fermeture : composer monté et clavier levé à l'ouverture ⇒ `focusTrigger` posé ; mode sélection ⇒ jamais ; Éditer et Répondre ⇒ posé.
- Résolveur de présentation : drapeau éteint ou rangée absente ⇒ overlay actuel.

### 9.2 Gates

- `./apps/ios/meeshy.sh test` vert, tests du SDK verts.
- `FileSizeBudgetGuardTests` vert, plus la preuve Δ ≤ 0 par fichier hors budget (D4) et `legacyLineCeiling` remesuré.
- `FixedFontSizeGuardTests` : aucun `.system(size:)` dans un fichier neuf.
- `ConversationViewBodyTypeDepthTests` : le nouvel overlay est déclaré en `AnyView`.
- Gardes de source à re-pointer si leur texte change de place, sans affaiblir leurs assertions :
  - `ConversationMenuSystemDesignGuardTests` : `.nativeMessageContextMenu(menu: nativeMenu)`, `enableLongPress: nativeMenu == nil`, `MessageMenuPreviewContainer`, `makeThemedBubble(true/false)` ;
  - `ConversationLongPressMenuGuardTests` : ancre `let longPressHandler…`, puis `isTyping = false`, `restoreAfterLongPress = (isTyping: …)` et `isTyping = saved.isTyping` (remplacés par D7) ;
  - `CallDetailRoutingTests` : `presentLongPressMenu(` et `overlayState.showOverlayMenu = true` (le point d'entrée reste) ;
  - `MessageMoreJumpsToViewsGuardTests` : closures `onShowMore:`, `onShowMessageInfo:`, `onShowReadStatus:` (la feuille les garde, D9) ;
  - les 25 gardes qui lisent `MessageListViewController.swift` par son nom (extraction dans le même fichier, D4) ;
  - `RiverStreamHostSourceGuardTests`, `ReadingDirectionGuardTests` (câblage du fournisseur Rivière).

### 9.3 Simulateur (`Meeshy-iOS26` + un iOS 17 ou 18)

| | Bulle | Focal | Script | Rivière |
|---|---|---|---|---|
| texte court, texte long (plus haut que l'écran) | ✓ | ✓ | ✓ | ✓ |
| image, vidéo, audio, fichier | ✓ | ✓ | ✓ | selon ce que la Rivière rend (#3594) |
| message à effet d'apparition | ✓ | ✓ | ✓ | ✓ |
| clavier levé à l'appui long, puis fermeture | ✓ | ✓ | ✓ | ✓ |
| message en bas d'écran | ✓ | ✓ | ✓ | ✓ |
| double tap | barre rapide inchangée | rien | menu complet | rien |
| drapeau éteint | comportement actuel | idem | idem | `.contextMenu` actuel |

À mesurer :
1. Sur une rangée Script : délai perçu du double tap sur la citation, le média et les boutons ; zones neutres d'un message image seule.
2. En Rivière : `cellForItem` rend-il des cellules quand la vue de la liste est cachée ?
3. Sur iPad, clavier matériel ou flottant : `keyboardWillHide` est-il émis, avec quelle durée ?
4. En Focal : la pose persiste-t-elle après l'arrêt du défilement ?
5. Dans la copie : vidéo ou audio en lecture, image hors cache mémoire (flash de vignette), média flouté déjà révélé.
6. Sur iPad, avec colonne de détail et en Split View (#3596) : placement du bloc.

Captures jointes aux commentaires de clôture des issues.

## 10. Hors périmètre

- Les retraits, la convergence des cinq aiguillages et le retour sous le plafond (#5985).
- Le réveil des lecteurs d'`isTyping`, dont `typingHeaderBar` et le clavier après glissé de réponse (#5988).
- L'effet unique de « Transférer » (#5989).
- Le double tap en Bulle et en Focal ; celui des avis système.
- Ce que la bulle Rivière ne rend pas encore (#3594, #4604).
- La parité web-v3 (#5804) et Android.
- Les défauts de status (#5975 à #5979).

## 11. Dimensions visées

- Cohérence de positionnement (6)
- Expérience utilisateur (8)
- Facilité d'usage (7)
- Complétude (13)
- Fluidité (4)
- Facilité d'accès (5)
- Compatibilité (9)
- Maintenabilité (11) : portée par #5985 après validation

## 12. Amendements de la relecture Opus (2026-09-10)

| Constat | Sévérité | Où il est porté |
|---|---|---|
| Clavier sans source de vérité, règle « après Éditer » inexistante | bloquant | §2.3, D7, §4, §5.1, §5.3, #5988 |
| Rivière hors de D1 : masquage, choix du fournisseur, recentrage, copie qui publie | bloquant | §2.2, D1, D5, §4, §5.1 |
| Seconde instance : effets rejoués, chips débordantes, pose Focal, fermeture de cellule | majeur | §2.1, D1, §4 |
| D4 non prouvable par la garde ; `FocalRow.swift` plein | majeur | §2.4, D4, §9.2 |
| Gardes de source à re-pointer | majeur | §9.2 |
| Menus : `initialItem: .media`, trois contextes, cinq aiguillages, cas Rivière | majeur | §2.4, D8, D9, §4, §7, #5989 |
| Double tap : zones internes, loi existante | majeur | §2.4, §4, §5.2 |
| Drapeau activé par défaut livré sans validation | majeur | D2 |
| Références, hauteur de barre, Reduce Motion, géométrie, haptique, performance | mineur | §2, §4, §6, §5.1, D1 |
