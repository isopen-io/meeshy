# Plan — Iteration-248i · `MediaKindLabel`, source unique des étiquettes de média

**Date** : 2026-08-27 · **Piste** : iOS · **Base** : `main` `40ea0579`
**Branche** : `claude/intelligent-noether-do61b0`
**Analyse** : `docs/analyses/uiux/2026-08-27-iteration-248i-media-kind-label.md`

---

## 1. Objectif

Ramener à **UNE** table la réponse à « comment s'appelle ce média ? », et poser
la garde de forme qui empêche la dixième.

Contrainte de piste : **iOS seulement**. Les deux copies du SDK
(`AttachmentKind.swift`, `NotificationModels.swift`) ne sont pas touchées — et
ce sont elles qui décident quelles clés du catalogue peuvent partir.

---

## 2. Inventaire de départ, mesuré (`origin/main`)

### 2.1 Règle 1 — étiquettes gravées : **17**

| fichier:ligne | littéral |
|---|---|
| `ComposerModels.swift:45` | `"Position actuelle"` |
| `ConversationViewModel.swift:2439` | `"📍 Position"` |
| `ConversationViewModel.swift:2442` | `"📷 Photo"` |
| `ConversationViewModel.swift:2443` | `"🎥 Vidéo"` |
| `ConversationViewModel.swift:2444` | `"🎙️ Message vocal"` |
| `ConversationViewModel.swift:2445` | `"📎 Fichier"` |
| `ConversationViewModel.swift:2446` | `"📍 Position"` |
| `ConversationViewModel.swift:3153` | `"\u{1F4F7} Photo"` |
| `ConversationViewModel.swift:3154` | `"\u{1F3AC} Video"` |
| `ConversationViewModel.swift:3155` | `"\u{1F3B5} Message vocal"` |
| `ConversationViewModel.swift:3156` | `"\u{1F4CE} Fichier"` |
| `ConversationViewModel.swift:3157` | `"\u{1F4CE} Piece jointe"` |
| `ConversationViewModel.swift:3318` | `"\u{1F4F7} Photo"` |
| `ConversationViewModel.swift:3319` | `"\u{1F3AC} Video"` |
| `ConversationViewModel.swift:3320` | `"\u{1F3B5} Message vocal"` |
| `ConversationViewModel.swift:3321` | `"\u{1F4CE} Fichier"` |
| `ConversationViewModel.swift:3322` | `"\u{1F4CD} Localisation"` |

Les six premières (2439-2446) sont des `defaultValue` — **légitimes au site
unique, illégitimes ailleurs** : c'est ce qui les fait figurer ici et disparaître
en migrant dans `MediaKindLabel.swift`, le seul fichier exempté.

Les onze suivantes sont du **français gravé pur**, sous forme échappée. Deux
d'entre elles (`"\u{1F3AC} Video"`, `"\u{1F4CE} Piece jointe"`) ne sont ni
français ni anglais correct : « Video » sans accent, « Piece jointe » sans
accent ni cédille.

### 2.2 Règle 2 — clés d'étiquette citées hors source unique : **44**

| fichier | occurrences |
|---|---|
| `ConversationViewModel.swift` | 6 (`media.summary.*`) |
| `ConversationView+Composer.swift` | 6 (`attachment.label.*`) |
| `ConversationView+ScrollIndicators.swift` | 5 |
| `FeedView+Attachments.swift` | 11 (deux tables + deux puces de lieu) |
| `ConversationInfoSheet.swift` | 5 (`attachment.kind.*`) |
| `AttachmentLoadingTile.swift` | 5 (`attachment.kind.*`) |
| `FeedCommentsSheet.swift` | 3 |
| `CommentMediaView.swift` | 1 |
| `MeeshyComposerHost.swift` | 1 |
| `CommentComposerMedia.swift` | 1 (`name: "Video"`, anglais gravé) |

---

## 3. Étapes

1. **Écrire `Meeshy/Features/Main/Components/MediaKindLabel.swift`** —
   `nonisolated enum`, `Kind` = image exacte d'`AttachmentType` (cinq cas, aucun
   fourre-tout), deux registres (`name` / `summary`), trois cas nommés
   (`attachmentLabel(for:)`, `placeLabel(_:)`, `voiceRecording(duration:)`),
   trois passerelles de type.
   ⚠️ `kind(for:)` est surchargé sur deux types de départ : ne jamais le passer
   en **référence non appliquée** (`.map(kind(for:))`) — résolution ambiguë.
2. **Convertir les neuf tables**, les six puces de lieu, les deux tables de type
   sérialisé et les cinq noms de fabrique.
3. **Catalogue** : renommer `starred.messages.unknown_user` → `common.unknown_user`
   (deux consommateurs, dont un qui gravait « Utilisateur ») ; ajouter
   `composer.attachment.voice` (`%@`, sept locales) ; retirer les **deux** clés
   réellement orphelines.
   ⚠️ Édition **textuelle** à ordre préservé (`object_pairs_hook=OrderedDict`,
   `indent=2`, `ensure_ascii=False`, `\n` final) : un `json.dump` trié rend
   70 238/70 472 pour le même contenu.
4. **Garde** `MediaLabelSourceGuardTests` — deux règles, deux bornes.
5. **Comportement** `MediaKindLabelTests` — registres, passerelles, cas nommés,
   et la vérification que la puce du composeur porte bien le nom de la source
   unique.
6. **`project.pbxproj`** : trois références ajoutées. Le fichier est un
   ARTEFACT (`project.yml` fait foi, sources globbées récursivement) et CI
   régénère avant de builder — les lignes qui ajoutent un fichier neuf se
   committent quand même, pour qu'un build local n'ait pas à dériver d'abord.

---

## 4. Le piège rencontré, et la règle qu'il donne

L'étape 3 visait **six** suppressions. Le balayage de contrôle, lancé sur tous
les `sourceRoots` du cliquet et pas seulement sur `apps/ios/Meeshy`, a montré
que quatre d'entre elles sont lues par le **SDK**, `bundle: .main` — donc sur le
catalogue de l'app. Quatre surfaces auraient rendu leur identifiant brut.

> **« Cette clé n'a plus de consommateur » est une affirmation sur le DÉPÔT, pas
> sur le répertoire qu'on édite.** Un catalogue est une ressource de bundle : il
> est lu par tout ce qui se lie à ce bundle, y compris depuis des cibles que la
> piste courante interdit de toucher.

---

## 5. Vérification

Aucune toolchain Swift disponible : les deux cliquets ont été **répliqués**
(mêmes racines, même scan à parenthèses équilibrées, même reconnaissance des
entrées plurielles) et exécutés sur `origin/main` **et** sur la branche.

| garde | avant | après |
|---|---|---|
| étiquettes gravées | 17 | **0** |
| clés citées hors source unique | 44 | **0** |
| clés brutes | 0 | **0** |
| clés orphelines | 0 | **0** |
| backlog non traduit (plafond 1545) | 102 | **102** |

1265 fichiers, 4930 appels `String(localized:)`. Catalogue : 3377 → 3376 clés,
JSON revalidé par parse, diff **48/95** en `--diff-algorithm=histogram`.

**Gate réel = CI `iOS Tests`.** Relire le NOM du check avant sa couleur
(leçon 240i) : c'est `Build app + tests unitaires` avec `COMPILE_ONLY=false`
qui fait foi, pas la compile seule.

---

## 6. Doutes assumés, à solder au retour de CI

1. **Surcharge `kind(for:)`** sur `AttachmentType` / `MessageType` avec des
   retours différents (`Kind` / `Kind?`). Légal, et tous les appels sont
   appliqués et typés — mais c'est la compile qui tranche.
2. **Défaut d'argument** `name: String = MediaKindLabel.name(.photo)` sur une
   fabrique d'un type isolé `MainActor`. `MediaKindLabel` est `nonisolated`,
   donc l'expression est évaluable depuis n'importe quelle isolation — à
   confirmer par la compile.
3. **`@MainActor` sur `MediaKindLabelTests`** : nécessaire pour atteindre
   `ComposerAttachment` (cible app isolée `MainActor`, bundle de tests
   `nonisolated`). Si la classe devait rester `nonisolated`, les deux derniers
   tests seraient à déplacer, pas à supprimer.
