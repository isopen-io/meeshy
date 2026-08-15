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

**Contrainte dure — l'horloge est l'activation, pas l'apparition.** En rangée plate, un effet d'apparition se déclenche quand le message **devient actif** (élection de focus, §3.4), pas quand la cellule entre à l'écran. La loi complète, et surtout sa réserve sur les drapeaux protecteurs — un message flouté ne se révèle **jamais** par simple défilement — sont en §4.1 et §4.2. WS-12 rend les comportements ; WS-13 leur donne cette horloge. Un implémenteur de WS-12 qui câblerait `onAppear` produirait un rejeu à chaque passage de cellule recyclée : lire §4 avant d'écrire.

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

## 2 bis. État de la conception bitfield — conforme sur trois axes, incomplète sur le quatrième

Vérification des quatre sites (`message-effect-flags.ts`, `MessageEffects.swift`, `MessageProcessor.ts`, `message-effects.ts`).

**Conforme.** Le bitfield est réel et symétrique : `MessageEffectFlags` (`UInt32`, OptionSet) et `MESSAGE_EFFECT_FLAGS` portent des bits **identiques**, la combinaison est native (`OptionSet` / `mergeEffects` + `hasEffect`), et la classification existe en trois axes masqués — cycle de vie (bits 0-7), apparition one-shot (8-15), persistants (16-23). Le gateway **recompose** le champ depuis les colonnes historiques (`MessageProcessor.ts:348-352`), donc les messages antérieurs héritent de la classification sans migration.

**Incomplet — le 4ᵉ axe « interface » n'existe pas.** Les dix effets visuels sont appliqués à la **vue du message** : `MessageEffectsModifier` (`MessageEffectModifiers.swift:435-465`) empile les modifiers sur le contenu de bulle, et confetti/fireworks passent par un `.overlay` borné aux limites de la bulle. Aucun effet ne s'exerce à l'échelle de l'écran. Les bits 24-31 sont libres.

### 2 bis. 1 — Contrainte d'encodage du futur axe

Le 4ᵉ axe doit tenir sur les **bits 24-30** (sept emplacements), **jamais sur le bit 31** :
- Prisma stocke `effectFlags` en `Int` signé 32 bits ; `1 << 31` dépasse `Int32.max`.
- En TypeScript, les opérateurs bit-à-bit travaillent en int32 signé : `1 << 31` vaut **−2147483648**, pas 2147483648. Un drapeau posé là serait négatif côté web et positif côté Swift (`UInt32`) — divergence silencieuse entre les deux sources de vérité jumelles.

### 2 bis. 2 — Défaut : deux systèmes de particules morts

`ExplodeOverlay` (`:256`) et `WaooOverlay` (`:283`) sont déclarés et jamais montés — seul l'`.overlay` de `ConfettiOverlay` / `FireworksOverlay` est branché (`:460-463`). `explode` et `waoo` jouent donc leur transform (`ExplodeEffect`, `WaooEffect`) mais **leurs particules ne s'exécutent jamais**.

**À trancher, pas à deviner** : soit les deux overlays sont branchés (l'effet devient ce qu'il prétend être), soit ils sont supprimés (le transform seul est l'effet assumé). Laisser du code de particules non monté est la troisième option, et c'est la seule qui soit fausse — elle fait croire à une capacité qui n'existe pas.

### 2 bis. 3 — Extension du périmètre de WS-12

S'ajoutent aux critères d'acceptation de §2.3 :

7. **Parité de rendu des dix drapeaux** entre rangée plate et bulle — un test par drapeau, pas un test global. C'est ce qui aurait attrapé les deux overlays morts.
8. **Décision tracée sur `explode` / `waoo`** : overlays branchés ou supprimés, avec le test correspondant.

**Hors périmètre WS-12, à ouvrir séparément — le 4ᵉ axe `interface` (bits 24-30).** Il n'est pas un simple ajout de bits : un effet plein écran est **imposé par l'expéditeur à l'écran du destinataire**. Trois règles conditionnent son ouverture, et elles relèvent d'une décision produit, pas d'implémentation :
- le `reduceMotion` du **destinataire** l'emporte toujours sur l'intention de l'expéditeur ;
- un effet d'interface ne doit jamais masquer le contenu ni bloquer l'interaction ;
- la règle doit naître **jumelée** (`MessageEffectPlan` Swift ↔ `resolveMessageEffectPlan` TS), sans quoi un message pétillerait sur iPhone et resterait inerte dans le navigateur.

## 3. Le formatage de texte : non livrable, et pourquoi

§6.4 du contrat décline le formatage sur trois affirmations. **Les trois sont vérifiées et exactes** :

1. `Message.content` est bien un `String` nu — `packages/shared/prisma/schema.prisma` ne porte aucun champ de spans ; seul `effectFlags Int @default(0)` (`:689`) accompagne le contenu.
2. `SendMessageRequest` ne transporte aucun span.
3. `showFormattingToolbar` n'a **aucun consommateur de rendu** : il n'existe que comme champ Zod (`packages/shared/types/preferences/message.ts:11`), comme propriété SDK (`PreferenceModels.swift:318`) et comme **interrupteur de réglages** dans deux écrans web (`MessageSettings.tsx:200`, `message-settings.tsx:125`). Aucune barre de formatage n'existe nulle part dans le dépôt.

**Position retenue : non livrable en l'état** — troisième branche de l'alternative. Motif : une représentation sérialisée dans la chaîne de contenu (option b) produirait un iOS qui affiche du gras là où le web affiche des astérisques, sur la **même** chaîne. Le Prisme Linguistique aggrave le défaut : le contenu traverse NLLB, et rien ne garantit qu'un balisage inséré survive à la traduction — un message formaté puis traduit afficherait ses marqueurs en clair chez le destinataire.

**Ce qu'on livre à la place : rien, explicitement.** Pas de barre grisée, pas de bouton inerte. Le modèle `ComposerRichTextModel` / `ComposerEffectSelection` reste **déclaré et testé** (contrat §3.10) pour que le chantier de transport n'ait rien à renommer. Le préalable est un champ de spans en base et dans `SendMessageRequest`, avec un rendu jumelé iOS/web — chantier gateway + shared, hors périmètre de cette branche.

---

## 4. WS-13 — Le plaisir de la mise au point

### 4.1 La loi : le plan focal est l'horloge

En mode Focal, **le défilement est la mise au point**. Il existe donc, à chaque instant, exactement un message **actif** : celui que `FocalFocusElector.elect(...)` (§3.4) a élu. C'est l'événement le plus riche de l'écran, et il est aujourd'hui inexploité — il ne sert qu'à décorer une carte.

> **Loi de WS-13.** Quand un message devient actif, son comportement se déclenche. Rien d'autre ne déclenche rien.

Trois conséquences, et c'est la loi qui les rend cohérentes plutôt qu'arbitraires :

1. **Une activation = une récompense.** Jamais deux ressorts, jamais haptique *et* animation *et* son sur la même prise de focus. Le budget d'attention est la contrainte qui sépare une app joyeuse d'une app épuisante.
2. **La fréquence est gouvernée par le lecteur, pas par le produit.** Personne ne subit un effet : on le provoque en amenant le message au point. C'est ce qui empêche la fatigue à la centième fois — on ne se lasse pas de ce qu'on déclenche soi-même.
3. **Rien ne disparaît en Focal.** Effets et modes d'affichage se comportent comme en bulle ; seule leur **horloge** change — l'activation remplace la venue à l'écran.

### 4.2 La ligne à ne pas franchir : expressif ≠ protecteur

La loi s'applique aux comportements **expressifs**. Elle ne s'applique **jamais** aux comportements **protecteurs**.

| Famille | Drapeaux | L'activation… |
|---|---|---|
| Expressif | `shake` `zoom` `explode` `confetti` `fireworks` `waoo` `glow` `pulse` `rainbow` `sparkle` | **déclenche** l'effet |
| Protecteur | `blurred` `viewOnce` `ephemeral` | **arme l'affordance**, ne consomme rien |

Un message flouté qui se révélerait en atteignant la focale serait révélé par un simple défilement — l'inverse exact de son intention. Un `viewOnce` consommé au passage serait détruit sans avoir été lu. **L'activation rend le geste possible ; seul le geste délibéré consomme.** C'est le piège que la loi, énoncée sans cette réserve, produirait mécaniquement.

### 4.3 Périmètre

**But.** Faire de l'activation focale l'horloge unique des comportements de message, et en tirer le grain tactile qui rend la lecture agréable à manipuler.

**Fichiers possédés** (disjoints de WS-0…WS-12) :
- `apps/ios/Meeshy/Features/Main/Views/Focal/Delight/FocalActivationLaw.swift`
- `apps/ios/Meeshy/Features/Main/Views/Focal/Delight/FocalHapticGovernor.swift`
- `apps/ios/Meeshy/Features/Main/Views/Focal/Delight/FocalAccentRing.swift`

**Les six comportements.**

**D1 — L'effet joue à la prise de focus.** Les effets d'apparition se déclenchent quand le message atteint le plan focal, pas quand la cellule entre à l'écran. Aucune mémoire de lecture (règle 1 de `CLAUDE.md` § Effets) : redescendre puis remonter rejoue. *Réutilise* `MessageEffectPlan` + l'élection de focus. *Ne fatigue pas* : c'est le lecteur qui décide, message par message.

**D2 — Le cran de la focale.** Impact haptique léger à chaque prise de focus, **uniquement en défilement délibéré** ; silence total sur un lancer rapide. `HapticFeedback` (`MeeshyUI/Utilities/HapticFeedback.swift`) n'expose **aucun throttle** — les générateurs sont des singletons `@MainActor` réchauffés par `prepare()`, rien ne borne la cadence. `FocalHapticGovernor` est donc le type manquant : entrée `(vitesse, franchissements, temps écoulé)`, sortie `Bool`, seuil de vitesse + plafond d'impulsions par seconde. Pur, testable sans simulateur. *Ne fatigue pas* précisément grâce au seuil : un lancer à travers 200 messages ne produit rien.

**D3 — La carte se pose.** Le ring accent 1,5 de la carte de focus (WS-4) monte avec la courbe `f` de WS-5 au lieu d'apparaître d'un coup. *Réutilise* `f`, déjà calculé, zéro coût. *Ne fatigue pas* : c'est de la matière continue, pas un événement — au bout d'une semaine on ne le voit plus, et c'est la preuve que ça marche.

**D4 — Le Prisme se révèle à la focale.** Quand le message actif est affiché via une traduction, son drapeau de langue prend un souligné accent — **seulement tant qu'il est actif**. Rend visible le travail du Prisme sans jamais l'annoncer : ni popup, ni bannière (règle du Prisme). *Réutilise* `FocalRowInput.activeDisplayLangCode`.

**D5 — Les modes d'affichage survivent.** Flou, éphémère et vue-unique gardent en rangée plate le comportement qu'ils ont en bulle (c'est WS-12), et l'activation **arme** leur affordance sans la consommer (§4.2).

**D6 — L'accent d'ouverture.** À l'ouverture d'une conversation, la teinte d'accent lave l'écran ~250 ms puis se retire dans l'en-tête. *Réutilise* `conversation.accentColor` + la transition de navigation. *Ne fatigue pas* : 250 ms sur une trajectoire que l'œil suit déjà ; au bout de trois jours c'est sous-perceptif, et ça installe une attente de couleur qui rend chaque conversation reconnaissable avant le premier mot lu.

**Contrat d'accessibilité — opposable aux six.**
- **Reduce motion** : chaque comportement définit son **état statique équivalent**, jamais son absence. D1 délègue à `MessageEffectPlan` (déjà juste) ; D3 rend le ring fixe à pleine intensité ; D6 pose la couleur d'en-tête sans lavage ; D2 **survit** (une haptique n'est pas du mouvement visuel) ; D4 est un souligné, il survit aussi.
- **Dynamic Type XL** : aucune cote fixe autour de texte. Le souligné de D4 se dimensionne sur la métrique typographique courante.
- **VoiceOver** : D3 et D6 sont de la matière → `accessibilityHidden`. D4 est porteur de sens → il s'énonce dans le label composé de la rangée, jamais comme élément séparé.
- **Contraste AA** : l'accent généré est une couleur de **surface et de signal**, jamais de texte, sauf passage par un correcteur de luminance.

**Types purs à extraire.**
- `FocalActivationLaw.behaviors(activating: FocalRowInput, plan: MessageEffectPlan, reduceMotion: Bool) -> FocalActivationBehaviors` — décide ce qui se déclenche à l'activation, et **exclut par construction** les drapeaux protecteurs.
- `FocalHapticGovernor.shouldFire(velocity:crossingsInWindow:since:) -> Bool`.
- `FocalAccentRing.intensity(focusCurve f: CGFloat, reduceMotion: Bool) -> Double`.

**Fichiers de test.**
- `apps/ios/MeeshyTests/Unit/Focal/FocalActivationLawTests.swift`
- `apps/ios/MeeshyTests/Unit/Focal/FocalHapticGovernorTests.swift`
- `apps/ios/MeeshyTests/Unit/Focal/FocalAccentRingTests.swift`

**Critères d'acceptation.**
1. Un message portant un drapeau expressif déclenche son effet **à l'activation**, et le rejoue si on le réactive.
2. Un message portant `blurred` / `viewOnce` / `ephemeral` **ne consomme rien** à l'activation — test explicite par drapeau protecteur. C'est le critère de confidentialité de WS-13.
3. Une activation ne produit **jamais** plus d'un événement remarquable (budget d'attention) — vérifié sur `FocalActivationBehaviors`.
4. Au-delà du seuil de vitesse, `FocalHapticGovernor.shouldFire` renvoie `false` pour toute la traversée, et le plafond par seconde tient sur une rafale.
5. `reduceMotion` ⇒ chaque comportement rend son état statique, aucun n'est simplement absent.
6. Dynamic Type `.accessibility5` ⇒ aucune troncature sur la rangée active (harnais WS-11).

### 4.4 Ce que WS-13 n'emporte pas

- **Aucun nouveau drapeau, aucun nouveau bit.** WS-13 change l'**horloge** des comportements existants ; il n'invente pas d'effet. Le 4ᵉ axe reste à son chantier (§2 bis. 3).
- **Aucun son.** Une messagerie s'utilise dans le métro, en réunion, à côté d'un enfant qui dort. Muet par défaut, sans exception.
- **Aucune série, aucun point, aucun badge.** Une série transforme un plaisir en dette : le jour où on la casse, le produit devient une source de culpabilité.
- **Aucune donnée fabriquée.** Pas d'anniversaire de conversation, pas de « votre 1000ᵉ message » — le produit n'a pas à décréter que quelque chose compte.

---

## 5. Ce qu'on ne fait pas, et pourquoi

- **Un nouveau composeur** — six des sept capacités demandées existent (§1). Le coût est la remise en jeu de huit comportements stabilisés ; le gain est nul.
- **Un plan de création dépliable, un composeur tout-en-ligne** — les deux répondent à un problème d'accessibilité des effets qui n'existe pas : le bouton est dans la barre, à deux taps.
- **Le formatage de texte** — bloqué au transport (§3). Déclaré bloqué, pas simulé.
- **Les stickers de conversation** — le système de stickers est côté story. Le porter suppose de vérifier que les assets sont teintables ; non vérifié, donc non promis.

---

## 6. Ordre

```
WS-4 (rangée plate) ──── WS-12 (effets + cycle de vie) ──── WS-13 (horloge d'activation)
                              │                                      │
WS-5 (perspective) ───────────┴──────────────────────────────────────┘
       ↑ test de non-interférence transform/alpha        ↑ fournit la courbe f et l'élection de focus
```

**WS-12 est bloquant pour la recette §7** : sans lui, activer le drapeau `reading_modes` expose en clair des messages que leur auteur a envoyés floutés.

**WS-13 dépend de WS-12, pas l'inverse.** Le plaisir se pose sur des comportements qui existent ; il ne les remplace pas. Ses trois types purs (`FocalActivationLaw`, `FocalHapticGovernor`, `FocalAccentRing`) sont en revanche écrivables et testables **immédiatement**, sans attendre WS-12 — ils ne dépendent que des signatures gelées par WS-0.
