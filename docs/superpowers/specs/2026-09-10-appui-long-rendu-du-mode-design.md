# L'appui long montre le message tel qu'on le lit — conception

- **Date** : 2026-09-10 · **Statut** : conception validée par le porteur le 2026-09-10
- **Plateforme** : iOS (`apps/ios`, `packages/MeeshySDK/Sources/MeeshyUI`)
- **Pilotage** : milestone #89 « L'appui long montre le message tel qu'on le lit, dans les quatre modes »
- **Issues** : #5980 clavier · #5981 rendu du mode · #5982 barre 2× · #5983 Rivière · #5984 double tap Script · #5985 retraits différés
- **Mesures** : lues sur `origin/dev` 09e4a1a10c

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

| Fait | Preuve |
|---|---|
| Aucun mode ne montre la vraie rangée. L'overlay reçoit `frameTracker.frame(for:) ?? .zero`, et la liste standard ne publie plus de cadre : il prend la branche `!useSourceFrame` et reconstruit un aperçu (lecteur vidéo 16:9, images plafonnées à 200 pt, texte coupé à 500 caractères). | `ConversationView.swift:2559` ; `MessageListView.swift:163-168` ; `MessageOverlayMenu.swift:306-369`, `584-898` |
| La branche `useSourceFrame` réduit la bulle jusqu'à ×0,4. | `MessageOverlayMenu.swift:243-275` |
| Le clavier ne se ferme pas : `isTyping` est un `@FocusState` qu'aucun `.focused` ne lie ; `presentLongPressMenu` écrit dans le vide, la restauration aussi. | `ConversationView.swift:272` ; `ConversationView+LongPressMenu.swift:56-58`, `106` ; `git grep 'focused($isTyping'` vide |
| Le vrai focus est celui du composer ; son réveil `focusTrigger` existe mais `ConversationView` ne le passe pas. | `UniversalComposerBar.swift:286` ; `UniversalComposerBar+Layout.swift:305-308` ; `ConversationView+Composer.swift:76` |
| Bulle, Focal et Script partagent une cellule UIKit `BubbleSwipeContainer { FocalRow \| bulle }`, non rognée (`clipsToBounds = false`). | `MessageListViewController.swift:1559`, `1712`, `1728-1760` |
| La Rivière ouvre un `.contextMenu` natif de trois actions, sans barre de réactions. Ses cadres sont publiés dans le repère du pane, pas de la fenêtre. | `RiverBubbleView.swift:385-423` ; `RiverStreamHost.swift:172-173`, `362` |
| Focal et Script n'ont aucun double tap sur une rangée standard. Les avis système gardent le leur (rappeler, rejoindre). | aucun `onTapGesture(count:` sous `Focal/` ; `b322ace2a7` |
| `EmojiReactionPicker` sait changer d'échelle (`scale`) mais pose sa capsule sans condition ; six autres surfaces l'utilisent. | `EmojiReactionPicker.swift:73`, `190`, `221` |
| Les options d'un message sont résolues par `MessageActionResolver`, mais aiguillées en deux sites. | `MessageActionResolver.swift:253-317` ; `MessageMoreSheet.swift:255-285` ; `ConversationView.swift:2545-2640` |

## 3. Décisions

**D1 — La même rangée, construite par le même code, remontée au-dessus du voile.**
- La liste remet à l'overlay la rangée que sa cellule affiche, construite par une méthode unique.
- L'overlay la pose au cadre de la cellule, non rognée, à l'échelle 1.
- La cellule d'origine se masque par le mécanisme existant (`isHiddenForOverlay`).

Alternatives écartées :
- **Élever la vraie cellule sur place** : deux voiles à raccorder sous un en-tête et un composer flottants en verre, flou perdu, chaque calque flottant devient une exception.
- **Capturer la cellule en image élargie** : c'est le chemin retiré le 2026-08-23 (vidéos noires, rendu figé).

Limite assumée de D1 : la copie est une seconde instance. Un média en lecture peut y repartir de sa vignette, et le contenu est figé à l'ouverture du menu.

**D2 — Un drapeau garde l'ancien chemin vivant.** `MeeshyFeatureFlags.isLiftedRowLongPressEnabled`, **activé par défaut**. Il se résout comme `isAgentGrammarEnabled` : `MEESHY_FLAG_LIFTED_ROW_LONG_PRESS` (`1`/`0`) prime sur la clé `meeshy.flag.lifted_row_long_press`, sinon `true`. Drapeau éteint : l'overlay actuel, le `.contextMenu` Rivière et l'absence de double tap servent à l'identique.

**D3 — Rien n'est retiré avant validation.** L'aperçu reconstruit, `buildNativeMessageMenu` (mort) et le menu natif Rivière restent dans le code. Leur retrait est l'objet de #5985.

**D4 — Aucun ajout net aux fichiers hors budget.** `FileSizeBudgetGuardTests` refuse qu'un fichier de la dette héritée s'allonge. Le nouveau code vit donc dans des fichiers neufs, et chaque ligne de câblage ajoutée à `ConversationView`, `MessageListViewController` ou `MessageOverlayMenu` est compensée par une relocalisation pure (code déplacé tel quel). Le vrai retour sous le plafond est dans #5985.

**D5 — La Rivière rejoint l'overlay commun.** Sa liste compacte ajoute « Ouvrir dans le fil » et « Répondre », faute de glissé de réponse dans ce mode.

**D6 — Le double tap en Script ouvre toutes les options.** L'appui long garde la liste compacte ; le double tap est la porte complète.

**D7 — La fermeture du clavier n'est pas sous drapeau.** C'est un correctif : l'ancien comportement est inerte.

## 4. Unités

Chaque unité a une responsabilité, une interface, et se teste seule.

| Unité | Nature | Responsabilité | Fichier |
|---|---|---|---|
| `LongPressPresentationPlan` | loi pure | Ordonner clavier → recentrage → présentation. La décision de recentrer se prend sur le cadre relu **après** la baisse du clavier. | neuf |
| `LiftedMessageRow` | valeur | `messageId`, `content: AnyView` (la rangée, avec les objets d'environnement de la cellule), `frameInWindow: CGRect`, `alignment` (`.leading` · `.trailing` · `.fullWidth`). | neuf |
| `LiftedRowProviding` | protocole `@MainActor` | `func liftedRow(for messageId: String) -> LiftedMessageRow?` — rend `nil` si la cellule n'est pas matérialisée. | neuf |
| `LiftedRowProviderLink` | boîte de référence (faible) | Tenue par `ConversationView`, passée à la liste et à l'hôte Rivière, qui s'y enregistrent. N'altère la signature d'aucun callback existant. | neuf |
| `MessageListViewController+RowContent` | constructeur unique | La construction du contenu de rangée (bulle, `FocalRow`) sort de la fermeture de cellule ; la cellule et `liftedRow(for:)` l'appellent. Relocalisation pure. | neuf (code déplacé) |
| `RiverLiftedRowProvider` | adaptateur | `RiverBubbleView(content:contentWidth:)` construite comme par `RiverStreamHost`, cadre converti du repère du pane vers la fenêtre. | neuf |
| `LiftedOverlayLayout` | loi pure | Géométrie de la barre, de la rangée et du menu (§6). | neuf |
| `LiftedMessageOverlay` | vue | Voile existant, barre, copie de la rangée, menu ; reprend `MessageOverlayDragLaw`, `MessageActionsMenu`, la fermeture et la modale VoiceOver. | neuf |
| `EmojiReactionPicker.chrome` | option SDK | `.capsule` (défaut, inchangé) ou `.none` ; plus `static func stripHeight(scale:) -> CGFloat`. La montée de la vague suit `scale`. | `MeeshyUI/Primitives/EmojiReactionPicker.swift` |
| `MessageActionResolver.allOptionSections(_:)` | loi pure | Sections du menu complet (§7.2). | `MessageActionResolver.swift` |
| `MessageOptionsGlassMenu` | vue | Menu Liquid Glass en sections, hauteur bornée, défilement ; `adaptiveGlass` sur iOS 26, matière avant. | neuf |
| `MessageActionRouter` | valeur de closures | UN aiguillage des actions d'un message, partagé par le menu compact, le menu glass et la feuille « Plus… ». | neuf (`ConversationView+MessageActionRouter.swift`) |
| `ScriptDoubleTapEligibility` | loi pure | `accepts(mode:kind:flag:)` : `.script`, contenu `.standard`, drapeau actif. | neuf |
| `ScriptMessageDoubleTap` | modificateur | `onTapGesture(count: 2)` posé sur la rangée éligible ; haptique légère ; remonte `onScriptDoubleTap(messageId)`. | neuf |
| Réveil du composer | câblage | `focusTrigger` passé à `UniversalComposerBar` ; baisse par `resignFirstResponder` derrière un protocole `KeyboardDismissing` injectable. | `ConversationView+Composer.swift`, `+LongPressMenu.swift` |

## 5. Flux

### 5.1 Appui long — Bulle, Focal, Script, Rivière

1. Le geste existant se déclenche (0,35 s, haptique moyenne). En Rivière, drapeau actif, un `LongPressGesture` simultané remplace le `.contextMenu`.
2. Clavier levé : il se baisse ; la suite attend la fin de son animation (durée annoncée par `KeyboardTransition`).
3. Le cadre de la cellule est relu. Si son milieu dépasse 60 % de la fenêtre, la liste recentre le message (mécanisme existant), puis le cadre est relu à nouveau.
4. `LiftedRowProviding.liftedRow(for:)` rend la rangée. `nil` : repli explicite sur l'overlay actuel.
5. Le fond se floute et s'assombrit (existant). La cellule d'origine se masque, la copie apparaît à son cadre.
6. La barre 2× sans fond entre en vague au-dessus ; la liste d'actions compacte entre dessous.
7. Glissé haut fort : « Plus… » ; glissé bas : fermeture (`MessageOverlayDragLaw`, inchangée).

### 5.2 Double tap — Script, messages standard

1. `ScriptMessageDoubleTap` reconnaît le double tap (haptique légère). Les zones internes (citation, média, boutons) gardent leur tap simple ; l'absence de délai se mesure au simulateur.
2. Mêmes étapes 2 à 5 que l'appui long.
3. La barre 2× **avec** sa capsule se pose à cheval sur le bord haut de la rangée.
4. `MessageOptionsGlassMenu` se pose juste sous la rangée.

### 5.3 Fermeture

- Sans action : le clavier se relève s'il était levé.
- Après Éditer : le clavier est levé (règle existante).
- Après Sélectionner : il reste baissé (règle existante).
- Une action « Infos » ferme le menu et ouvre « Plus… » sur son panneau.

## 6. Géométrie — `LiftedOverlayLayout`

Entrées : cadre de la rangée (repère fenêtre, converti vers l'hôte), taille de l'hôte, zones sûres, hauteur et largeur de la barre, taille du menu, présentation (`.longPress` · `.scriptDoubleTap`), alignement.

1. **Échelle** : toujours 1. Aucune entrée ne la fait varier.
2. **Barre** : hauteur `stripHeight(scale: 2)`. Largeur = largeur de l'hôte moins 16 pt de chaque côté ; défilement horizontal, « + » épinglé à droite. Appui long : bord bas de la barre 8 pt au-dessus de la rangée. Double tap : centre de la barre sur le bord haut de la rangée.
3. **Menu** : bord haut 6 pt sous la rangée, abscisse alignée sur la rangée (droite pour mes bulles, gauche sinon, bord de lecture pour une rangée pleine largeur), bornée à 16 pt des bords.
4. **Tenir dans l'écran** : si l'ensemble déborde, il glisse d'un seul bloc (la rangée comprise) au plus court, borné par la zone sûre haute pour la barre et basse pour le menu.
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

`MessageActionResolver.primaryActions`, inchangée. En Rivière seulement, « Ouvrir dans le fil » et « Répondre » s'ajoutent en tête, portés par le contexte (`MessageMenuContext`), jamais par une branche de vue.

### 7.2 Toutes les options (double tap Script)

`allOptionSections(ctx)` rend, dans l'ordre, les sections non vides :

1. **Rapides** : `primaryActions` sans `.more`.
2. **Faire** : les actions de `moreSections`, moins celles déjà présentes en Rapides (`edit`, `copy`). `delete` en dernier, isolé, en rouge. `media` ouvre la confirmation que « Plus… » présente déjà (jamais de suppression directe).
3. **Infos** : les infos de `moreSections`. `language` disparaît quand `translate` est déjà en Rapides (même destination).
4. **Modération** : `report`.

Les entrées « Faire » s'exécutent et ferment le menu. Les entrées « Infos » et « Modération » ferment le menu et ouvrent « Plus… » sur leur panneau, qui garde ses contenus (langues, réactions, motifs de signalement). Chaque action passe par `MessageActionRouter`, le même aiguillage que la feuille « Plus… ».

## 8. Cas limites

- **Cellule non matérialisée ou cadre inconnu** : repli sur l'overlay actuel.
- **Mode sélection actif** : appui long et double tap coupés (règle existante).
- **Barre rapide déjà ouverte** : exclusivité existante conservée.
- **Message système** :
  - appui long : l'overlay s'ouvre (règle du 2026-08-24) ;
  - double tap : l'action propre de la carte, inchangée.
- **Rivière** : aucun conflit avec le balayage des couloirs (`DragGesture` 40 pt) ni le tap curseur ; vérifié au simulateur.
- **VoiceOver** : overlay modal, geste d'échappement ; l'action « options du message » existante reste ; en Script, une action nommée ouvre le menu complet.
- **Clair et sombre, iOS 16 à 26** : verre sur iOS 26, matière avant ; la barre sans fond reste lisible sur le voile dans les deux thèmes.

## 9. Vérification

### 9.1 TDD (XCTest, `test_{méthode}_{condition}_{résultat}`)

- `LongPressPresentationPlan` : clavier levé ⇒ baisse puis attente ; message bas ⇒ recentrage décidé sur le cadre relu ; ni l'un ni l'autre ⇒ présentation directe.
- `LiftedOverlayLayout` : échelle 1 pour toute entrée ; débordement haut et bas ; message plus haut que l'écran ; barre à cheval en double tap ; conversion iPad.
- `allOptionSections` : dédoublonnage `edit`/`copy`/`language` ; filtrage par contexte (vue unique, pas de texte, pas d'édition) ; ordre et sections vides retirées.
- `ScriptDoubleTapEligibility` : `.script` × `.standard` × drapeau ; faux en Focal, en Bulle, pour un avis système, drapeau éteint.
- `MeeshyFeatureFlags.isLiftedRowLongPressEnabled(defaults:environment:)` : défaut vrai, environnement prioritaire.
- SDK : `EmojiReactionPicker.stripHeight(scale:)` à 1 et à 2 ; `chrome` par défaut `.capsule`.
- Résolveur de présentation : drapeau éteint ou rangée absente ⇒ overlay actuel.

### 9.2 Gates

`./apps/ios/meeshy.sh test` vert, `FileSizeBudgetGuardTests` compris (D4) ; tests du SDK verts.

### 9.3 Simulateur (`Meeshy-iOS26` + un iOS 17 ou 18)

| | Bulle | Focal | Script | Rivière |
|---|---|---|---|---|
| texte court, texte long (plus haut que l'écran) | ✓ | ✓ | ✓ | ✓ |
| image, vidéo, audio, fichier | ✓ | ✓ | ✓ | selon ce que la Rivière rend (#3594) |
| clavier levé à l'appui long | ✓ | ✓ | ✓ | ✓ |
| message en bas d'écran | ✓ | ✓ | ✓ | ✓ |
| double tap | barre rapide inchangée | rien | menu complet | rien |
| drapeau éteint | comportement actuel | idem | idem | `.contextMenu` actuel |

Captures jointes aux commentaires de clôture des issues.

## 10. Hors périmètre

- Les retraits et le retour sous le plafond (#5985).
- Le double tap en Bulle et en Focal ; celui des avis système.
- Ce que la bulle Rivière ne rend pas encore (#3594, #4604).
- La parité web-v3 (#5804) et Android.
- Les défauts de status (#5975 à #5979).

## 11. Dimensions visées

Cohérence de positionnement (6), Expérience utilisateur (8), Facilité d'usage (7), Complétude (13), Fluidité (4), Facilité d'accès (5), Compatibilité (9). Maintenabilité (11) : portée par #5985 après validation.
