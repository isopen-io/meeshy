# Iteration-248i — « 🎵 Message vocal » : les étiquettes de média que le cliquet français ne pouvait pas voir

**Date** : 2026-08-27 · **Piste** : iOS (suffixe `i`)
**Surfaces** : carte de citation, messages épinglés, puces du composeur (message,
commentaire, publication), tuile de chargement, bouton de défilement, fiche de
conversation
**Base** : `main` HEAD `40ea0579` · **Branche** : `claude/intelligent-noether-do61b0`
**Précédent direct** : 247i (le Prisme des durées, `LocalizedNumber`)

---

## 1. Le point de départ : un cliquet vert sur du français gravé

Le dépôt porte depuis 225i un cliquet dédié au français non traduit,
`FrenchDefaultValueRatchetTests`, dont la promesse tient en une phrase de son
propre doc-comment :

> Une clé au `defaultValue` français absente du catalogue s'affiche en français,
> quelle que soit la langue de l'interface.

La promesse est tenue — **pour la forme qu'elle nomme**. Son extracteur ne
regarde que les appels `String(localized:)` porteurs d'un `defaultValue`. Il ne
peut, par construction, rien dire d'une chaîne française **qui n'est jamais
devenue une clé**.

C'est par là que dix-sept étiquettes de média sont restées gravées dans le code
d'app — sur des surfaces visibles — pendant que les **mêmes textes** vivaient au
catalogue, traduits en sept langues, depuis des mois.

> **Un cliquet vert prouve l'absence de la forme qu'il inspecte, jamais
> l'absence du défaut.** La question à lui poser n'est pas « passe-t-il ? » mais
> « quelle écriture du même défaut lui échappe ? ».

---

## 2. La mesure

### 2.1 Neuf tables pour une seule question

Balayage des trois cibles d'app pour la table « nature du média → étiquette » :

| # | site | famille de clés | langue |
|---|---|---|---|
| 1 | `ConversationViewModel.optimisticListPreview` | `media.summary.*` | localisée |
| 2 | `ConversationViewModel.makeReplyReference` | — | **français gravé** |
| 3 | `ConversationViewModel` (instantané épinglé) | — | **français gravé** |
| 4 | `ConversationView+ScrollIndicators.unreadAttachmentTypeLabel` | `attachment.label.*` | localisée |
| 5 | `ConversationView+Composer.labelForAttachment` | `attachment.label.*` | localisée |
| 6 | `FeedView+Attachments.feedLabelForAttachment` | `attachment.label.*` | localisée |
| 7 | `FeedComposerSheet.sheetLabelForAttachment` | `attachment.label.*` | localisée |
| 8 | `ConversationInfoSheet.attachmentLabel` | `attachment.kind.*` | localisée |
| 9 | `AttachmentLoadingTile.kindLabel` | `attachment.kind.*` | localisée |

**Les corps 5, 6 et 7 sont rigoureusement identiques, au caractère près.** Et
le 6 est surmonté de ce commentaire :

```swift
// Attachment tile labels reuse the shared `attachment.label.*` keys — the same
// SSOT `ConversationView.attachmentLabel` uses — so a pending post attachment
// reads identically to a message one across the app.
```

> **Un commentaire ne fait pas d'une copie une source unique.** Celui-ci
> *déclare* la SSOT au-dessus d'un copier-coller — et c'est exactement pourquoi
> personne ne l'a rouverte : la surface figurait déjà dans la colonne des sites
> conformes.

À ces neuf s'ajoutent, sur la même donnée :

- **six copies** de la puce de lieu, toutes écrites
  `place.name ?? String(localized: "attachment.label.location", …)` ;
- **une dixième table**, celle du vocabulaire *sérialisé* de l'instantané épinglé
  (`case .image: return "image"` …) — une réécriture à la main du `rawValue`
  d'un `enum: String` ;
- **quatre noms gravés** dans les fabriques du composeur
  (`"Message vocal (0:12)"`, `"Position actuelle"`, `"Photo"`, `"Fichier"`) et
  un cinquième, `name: "Video"`, dans `CommentComposerMedia` — anglais brut, à
  douze lignes d'un site jumeau du même fichier qui, lui, passait par la clé.

### 2.2 Deux familles de clés au contenu identique

Le catalogue portait **deux** familles nommées différemment pour la même chose :

| clé | fr | clé jumelle | fr |
|---|---|---|---|
| `attachment.label.photo` | Photo | `attachment.kind.photo` | Photo |
| `attachment.label.video` | Vidéo | `attachment.kind.video` | Vidéo |
| `attachment.label.audio` | Audio | `attachment.kind.audio` | Audio |
| `attachment.label.file` | Fichier | `attachment.kind.file` | Fichier |
| `attachment.label.location` | Position | `attachment.kind.location` | Position |

**Vérifié par parse : identiques dans les sept locales, pas seulement en
français.** Dix entrées pour cinq notions.

Et la divergence descendait jusqu'au `defaultValue` : `ConversationInfoSheet`
écrivait `defaultValue: "Fichier"` là où `AttachmentLoadingTile` écrivait
`defaultValue: "File"` — **pour la même clé**. Le catalogue ayant
`sourceLanguage: fr`, la seconde orthographe est celle qui a tort ; aucune des
deux ne s'affichait jamais, ce qui est précisément pourquoi l'écart a duré.

### 2.3 Ce que l'utilisateur voyait

| surface | interface en anglais | interface en arabe |
|---|---|---|
| carte de citation d'un vocal | « 🎵 Message vocal » | « 🎵 Message vocal » |
| carte de citation d'une vidéo | « 🎬 Video » | « 🎬 Video » |
| carte de citation d'un **lieu** | « 📎 Piece jointe » | « 📎 Piece jointe » |
| message épinglé, lieu | « 📍 Localisation » | « 📍 Localisation » |
| puce d'un vocal enregistré | « Message vocal (0:12) » | « Message vocal (0:12) » |
| puce d'une photo jointe | « Photo » | « Photo » |

La ligne du **lieu** est la pire des six, et pour une raison de forme : le
`switch` de la citation avait un `default:` là où `AttachmentType` n'a que cinq
cas. Le cinquième — `.location` — tombait donc dans le fourre-tout et
s'annonçait « pièce jointe », sans accent, pendant que la **même donnée**, une
ligne plus haut dans la liste des conversations, disait « 📍 Position ».

> **Un `default:` sur un `enum` fini n'est pas une précaution : c'est un cas
> perdu.** Il ne protège d'aucun cas futur (l'ajout d'un cas rendrait le
> `switch` non exhaustif, ce qui est exactement l'alerte qu'on veut) et il
> avale un cas présent.

---

## 3. Le correctif

### 3.1 Une source unique, deux REGISTRES

`Meeshy/Features/Main/Components/MediaKindLabel.swift`, `nonisolated enum`, pur
et testable. Ce qui rend la convergence possible, c'est d'avoir nommé la raison
pour laquelle neuf sites divergeaient : **ils ne servaient pas tous la même
surface.**

| registre | forme | où |
|---|---|---|
| `name(_:)` | « Photo », « Vidéo » | une **icône** double déjà le texte (tuile, puce, bouton de défilement) |
| `summary(_:)` | « 📷 Photo », « 🎥 Vidéo » | un **aperçu** seul en ligne (liste, citation, message épinglé) |

Un aperçu porte son emoji parce qu'aucune icône ne l'accompagne ; une étiquette
compacte ne le porte pas parce qu'elle en aurait deux. C'est la seule différence
légitime des neuf tables — les huit autres étaient des accidents.

Trois cas nommés s'y ajoutent, chacun parce qu'il porte une RÈGLE et pas
seulement un texte :

- `attachmentLabel(for:)` — une pièce jointe préfère **son identité** (durée
  d'un audio, nom d'origine d'un fichier) à son type ; le libellé de type n'est
  que le repli. C'était le corps commun des sites 5, 6 et 7.
- `placeLabel(_:)` — un lieu préfère son nom à « Position ». Les six copies
  écrivaient `??`, qui laisse passer la **chaîne vide** : un lieu au nom vide
  rendait une puce muette là où le repli existait. `isEmpty` la ferme.
- `voiceRecording(duration:)` — « Message vocal (0:12) », registre à part : ni
  « Audio » (qui perd que c'est la VOIX qu'on s'apprête à envoyer), ni l'aperçu
  (la puce porte déjà son glyphe d'onde). La durée passe par
  `LocalizedNumber.duration(seconds:)` — l'acquis de 247i, sans quoi une
  interface arabe mêlait chiffres arabo-indiens et chiffres latins sur la même
  puce.

Et **trois passerelles** depuis les trois vocabulaires de type du dépôt :
`MessageAttachment.AttachmentType` (totale — cinq cas, cinq `Kind`),
`Message.MessageType` (rend `nil` pour `.text`, qui n'est pas un média : c'est à
l'appelant de dire ce qu'il montre, pas à la table d'inventer un libellé) et le
vocabulaire sérialisé (`"image"`, `"video"`… — rend `nil` sur un jeton inconnu).

`Kind` n'a **pas** de cas fourre-tout : c'est l'image exacte d'`AttachmentType`.
C'est ce qui fait disparaître « 📎 Piece jointe » sans qu'aucun site n'ait à
choisir de le remplacer.

### 3.2 Ce que le catalogue devient

- **`starred.messages.unknown_user` → `common.unknown_user`** : le repli
  « Utilisateur » servait déjà deux surfaces (liste des épinglés, et l'auteur
  d'une citation optimiste, où il était **gravé en dur**). Une clé au nom d'un
  écran ne peut pas être réutilisée sans mentir ; renommée plutôt que doublée.
- **`composer.attachment.voice`** ajoutée, `%@` = durée, traduite dans les
  **sept** locales.
- **`attachment.kind.photo` et `attachment.kind.location` retirées** — les deux
  seules réellement orphelines une fois les sites convertis.

### 3.3 ⚠️ Le piège que la suppression a failli refermer

L'intention de départ était de retirer les **six** clés jumelles
(`attachment.kind.*` au complet, plus `media.summary.audio`, sans consommateur
apparent). Le balayage de contrôle, lancé sur **tous** les `sourceRoots` du
cliquet et pas seulement sur `apps/ios/Meeshy`, a rendu ceci :

```
packages/MeeshySDK/.../Models/AttachmentKind.swift:143  NSLocalizedString("attachment.kind.video", …)
packages/MeeshySDK/.../Models/AttachmentKind.swift:144  NSLocalizedString("attachment.kind.audio", …)
packages/MeeshySDK/.../Models/AttachmentKind.swift:152  NSLocalizedString("attachment.kind.file",  …)
packages/MeeshySDK/.../Models/NotificationModels.swift:816  String(localized: "media.summary.audio", …)
```

**Une dixième et une onzième copie de la même table vivent dans le SDK — et
elles lisent le catalogue de l'APP**, par `bundle: .main`. Quatre des six
suppressions auraient donc fait rendre l'identifiant brut à des surfaces que la
piste iOS n'a pas le droit de modifier, et rougir
`test_everyAppCatalogIdentifierKeyIsReferencedInCode` au passage.

> **« Cette clé n'a plus de consommateur » est une affirmation sur le DÉPÔT, pas
> sur le répertoire qu'on édite.** Un catalogue est une ressource de bundle : il
> est lu par tout ce qui se lie à ce bundle, y compris depuis des cibles dont la
> piste courante interdit de toucher le code. C'est le corollaire, côté
> ressources, de la règle du `CLAUDE.md` : *quand cette liste dit « jumelles »,
> compter les clients avant de la croire.*

Les deux copies du SDK restent **hors périmètre par règle de piste**. Elles sont
nommées dans le doc-comment de la garde plutôt que passées sous silence — et
c'est parce qu'elles existent que quatre des six clés restent au catalogue.

### 3.4 La garde

`MeeshyTests/Unit/Guards/MediaLabelSourceGuardTests.swift` ferme les deux
formes, par la FORME et non par l'inventaire :

1. **Aucune étiquette de média gravée** dans les sources d'app — ni française,
   ni anglaise, ni préfixée de son emoji. Le scanner **dé-échappe** les
   `\u{1F3B5}` : les deux copies soldées ici écrivaient l'emoji sous sa forme
   échappée, et une garde qui ne lirait que la forme littérale serait verte sur
   exactement la régression qu'elle prétend interdire.
2. **Aucune deuxième table** : `attachment.label.*` et `media.summary.*` ne se
   citent que depuis `MediaKindLabel.swift`. Une surface qui les rappelle en
   direct est une table jumelle en germe — c'est ce qu'étaient les neuf.

Plus deux bornes : le scanner reconnaît la forme qu'il interdit (`String`
gravée, `defaultValue` gravé, forme échappée) — sans quoi il serait vert faute
de voir — et la source unique cite bien ses dix clés, sans quoi les deux règles
resteraient vertes si elle disparaissait.

---

## 4. Preuve

Aucune toolchain Swift ici. Les deux cliquets qui gouvernent ce lot ont été
**répliqués fidèlement** (mêmes racines, même scan à parenthèses équilibrées,
même reconnaissance des entrées plurielles) et exécutés sur les deux arbres.

| garde | `origin/main` | branche |
|---|---|---|
| étiquettes de média gravées | **17** | **0** |
| clés d'étiquette citées hors source unique | **44** | **0** |
| clés brutes (`…ResolvesInDevelopmentLanguage`) | 0 | **0** |
| clés orphelines (`…IsReferencedInCode`) | 0 | **0** |
| backlog non traduit (plafond 1545) | 102 | **102** |

Les 17 gravures et les 44 citations sont listées site par site dans le plan.
1265 fichiers balayés, 4930 appels `String(localized:)` vus. Le catalogue reparse
en JSON valide ; le diff est **48 ajoutées / 95 retirées** en `--diff-algorithm=histogram`
sur 3 736 576 octets — l'édition est textuelle et l'ordre des 3376 entrées
est préservé (un `json.dump` trié rendait 70 238/70 472 pour le **même
contenu** : vérifier avec histogram ET par parse avant de conclure quoi que ce
soit d'un diff de catalogue).

**Gate réel = CI `iOS Tests`** (compile Xcode 26.1.1, run simulateur iOS 18.2).

---

## 5. Ce qui change à l'écran

**Aucun changement en français** sur huit des neuf surfaces : les textes servis
sont ceux du catalogue, déjà en place. Ce qui change :

| surface | avant | après |
|---|---|---|
| citation d'un **lieu** | 📎 Piece jointe | 📍 Position |
| citation d'une vidéo | 🎬 Video | 🎥 Vidéo |
| citation d'un vocal | 🎵 Message vocal | 🎙️ Message vocal |
| message épinglé, lieu | 📍 Localisation | 📍 Position |
| puce d'un lieu au nom vide | *(vide)* | Position |

Les trois premières lignes alignent la citation sur l'emoji et l'orthographe que
la liste des conversations servait déjà — **la cohérence de positionnement, pas
un changement de parti pris**. Et dans les six autres langues, les six lignes du
§ 2.3 passent du français au texte du lecteur.

---

## 6. Dimensions

| dimension | état |
|---|---|
| 5 · Accessibilité | mûre — VoiceOver lit désormais la nature du média dans la langue du lecteur sur les six surfaces ; `kindLabel` reste le label a11y de la tuile en échec |
| 6 · Cohérence de positionnement | mûre — même mot, même emoji pour la même donnée, dans la liste, la citation et l'épingle |
| 9 · Compatibilité | mûre — sept langues servies là où six surfaces servaient le français |
| 11 · Maintenabilité | mûre — 9 tables → 1, 10 clés → 8, garde de forme posée |
| 13 · Complétude | **partielle** — deux copies subsistent dans le SDK (§ 7.1), hors périmètre de piste |

---

## 7. Suites (249i+)

1. **Le SDK porte les deux dernières copies de cette table**
   (`MeeshySDK/Models/AttachmentKind.swift` — sept natures, pas cinq ;
   `NotificationModels.swift:816`). **Hors périmètre par règle de piste** —
   mais `MediaKindLabel` y a maintenant un jumeau évident, et le fait qu'elles
   lisent le catalogue de l'app rend la convergence naturelle le jour où une
   itération SDK s'en saisit. Les quatre clés qu'elles maintiennent en vie
   (`attachment.kind.{video,audio,file}`, `media.summary.audio`) tomberont avec
   elles, pas avant.
2. **`MessageAttachment.durationFormatted` grave `String(format: "%d:%02d")`**
   (SDK) — donc `attachmentLabel(.audio)` sert encore des chiffres latins à une
   interface arabe. C'est le défaut de 247i, sur la seule des dix-sept copies
   que 247i ne pouvait pas atteindre. Même règle de piste, même remède :
   `LocalizedNumber.duration(seconds:)` a un équivalent naturel dans
   `MediaTypes.formatDuration`.
3. **`optimisticListPreview` compose encore « 📍 \(nom) » avec l'emoji gravé**
   (deux lignes). Le texte est le nom du lieu — il n'y a rien à traduire — mais
   l'emoji, lui, diverge de celui du catalogue si le catalogue change. Seam
   connu, laissé sciemment : l'alternative (dériver le préfixe de
   `summary(.location)` moins `name(.location)`) est plus fragile que le défaut.
4. Carry-over 246i/247i, inchangés : (a) classer le bucket « appelée seulement
   par un test » ; (b) recâbler `FeedView` sur `likePost`/`bookmarkPost` ;
   (c) `isProgrammaticScroll` ; (d) les 3 copies d'`isLoadingReactions` ;
   (e) `buildNativeMessageMenu`, découvrabilité du fil de réponses, cibles
   tactiles 44 pt d'`InteractiveProgressBar`.
