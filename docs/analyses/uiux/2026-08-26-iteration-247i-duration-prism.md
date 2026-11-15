# Iteration-247i — « Le lien expire dans 4 heures 32 » : les durées que la garde de 241i ne pouvait pas voir

**Date** : 2026-08-26 · **Piste** : iOS (suffixe `i`)
**Surfaces** : appel, caméra, composeur vocal, lien magique, aperçus audio, fil de conversation
**Base** : `main` HEAD `4b9acd3f` · **Branche** : `claude/intelligent-noether-llro07`
**Précédent direct** : 246i (mesure d'atteignabilité, `branch-tracking.md`)

---

## 1. Le point de départ : une famille déclarée FERMÉE

241i a posé `NumericAccessibilityValueGuardTests` avec cette promesse, écrite
dans son propre doc-comment :

> 234i → 240i ont réduit sept familles de compteurs sans jamais empêcher la
> suivante. Cette garde ferme celle-ci **par la forme** plutôt que par
> l'inventaire : peu importe quel compteur naît demain, s'il interpole son
> nombre dans une valeur d'accessibilité, il tombe ici.

La promesse est tenue — pour la forme qu'elle nomme. Son extracteur est :

```swift
#"\.accessibilityValue\(\s*"[^"\n]*\\\([^\n]*"#
```

Il reconnaît un **littéral interpolé**. Onze sites de l'app servaient à VoiceOver
un nombre gravé en chiffres latins **sans jamais écrire de littéral** — et la
garde était verte sur eux depuis le jour de sa pose.

---

## 2. La mesure

### 2.1 Ce que le balayage rend

`String(format: "%d:%02d", …)` et ses deux variantes, sur les trois cibles app :

| fichier | nom du formateur | ce qu'il rend |
|---|---|---|
| `ThemedConversationRow` | `formatDurationMs` | durée d'un vocal, ligne de liste |
| `RecentMediaStrip` | `formatDuration` | durée d'une vidéo du pellicule |
| `ComposerModels` | `formatDur` | nom du fichier vocal joint |
| `UniversalComposerBar+Recording` | `formatDuration` | minuterie d'enregistrement |
| `MessageOverlayMenu` | `formatTime` | position / durée du lecteur audio |
| `CameraView` | `formatDuration` | minuterie de capture vidéo |
| `MessageViewsDetailView` | `formatDuration` | durée vue, détail de message |
| `MessageTranscriptionDetailView` | `formatDuration` | durée d'une transcription |
| `AudioPostComposerView` | `formattedDuration` | minuterie du composeur audio |
| `MagicLinkView` | `formattedCountdown` | compte à rebours d'expiration |
| `CallManager` | `formatDuration` | minuterie d'appel (2 orthographes) |

**Onze copies de la même arithmétique, sous six noms.** Aucune n'est appelée par
une autre. C'est une violation frontale du **Single Source of Truth** du dépôt
(« Each data type has ONE source. No reimplementation ») et de sa consigne de
système de design (« When two components differ only cosmetically, unify them »).

Un douzième site rend `"%02d:%02d"` et **n'est pas de cette famille** :
`NotificationSettingsView.formattedDndTime` grave « HH:mm » pour la
**PERSISTANCE** — le format que `UserNotificationPreferences.isInDoNotDisturbWindow`
relit. Le localiser corromprait la donnée. Il est le seul site du dépôt où les
chiffres latins sont la bonne réponse, et il est nommé dans la garde plutôt que
toléré en silence.

### 2.2 Les deux défauts, et pourquoi le second est le pire

**(a) Chiffres latins, partout.** `String(format:)` sans locale ne consulte
jamais la locale du lecteur. L'arabe s'écrit en chiffres arabo-indiens : une
interface arabe mêlait deux systèmes d'écriture. C'est exactement le défaut que
238i, 239i et 241i ont soldé sur les compteurs — resté intact sur les durées.

**(b) VoiceOver annonce une HEURE.** Onze sites passaient leur horloge telle
quelle à `.accessibilityValue` :

```swift
.accessibilityLabel(String(localized: "auth.magiclink.countdown.a11yLabel"))  // « Le lien expire dans »
.accessibilityValue(formattedCountdown)                                        // « 4:32 »
```

« 4:32 » est l'orthographe d'une **heure**. Le synthétiseur français le lit
« 4 heures 32 » : le lecteur d'écran entend **« Le lien expire dans 4 heures 32 »**
pour un compte à rebours de quatre minutes et demie. Ce n'est pas une nuance de
phrasé — **l'annonce se trompe d'un facteur soixante sur la seule information que
cet écran porte.**

Inventaire des onze : `CallView` ×6 · `FloatingCallPillView` ·
`AudioPostComposerView` · `CameraView` · `UniversalComposerBar+Recording` ·
`MagicLinkView`, plus l'indice VoiceOver de `MessageOverlayMenu` (« Audio de
0:12 / 1:30 » — **deux** horloges pour un indice qui ne devrait porter que la
longueur).

---

## 3. Ce que la mesure apprend sur la garde elle-même

> **Une garde qui épingle une SYNTAXE est contournée par une FONCTION.**

Le motif fautif n'a jamais disparu : il a **reculé d'un cran**. Il vit dans le
corps d'un `private func`, où il redevient un littéral ; au site d'appel, il
ressort sous la forme la plus innocente qui soit — `.accessibilityValue(formattedDuration)`.
Un identifiant. Aucune alerte possible.

Et ce recul est **invisible pour l'auteur du correctif**, parce qu'il ne se
produit pas dans son champ de vision : les onze formateurs privés existaient
déjà en 2025, bien avant 241i. La garde n'a rien laissé passer — elle a été posée
sur une surface qui ne contenait déjà plus le défaut qu'elle cherche.

**La question qui l'attrape** : *ce que ma garde interdit peut-il traverser une
fonction avant d'atteindre le site que j'inspecte ?* Si oui, il faut aller
chercher le motif à sa **SOURCE**, pas à son point d'usage.

Corollaire, déjà vu au cycle 122 côté gateway et rejoué ici : **206i, 210i et
211i avaient traité la MOITIÉ de ce défaut.** Elles ont donné son libellé à une
valeur jusque-là nue (« Durée de l'appel », « Durée d'appel », « Durée
enregistrée »), et l'ont documenté dans les vues :

```swift
// A bare monospaced "0:34" reads to VoiceOver as a context-less number.
// Name what the timer measures via the label and expose the running time
// as the value.
```

Le diagnostic était juste et le correctif partiel : **un libellé nomme la
mesure ; il ne corrige pas l'orthographe de ce qu'il introduit.** Trois
itérations ont regardé ces lignes exactes en s'arrêtant au contexte manquant.

---

## 4. Le correctif

### 4.1 Une source, deux faces

`LocalizedNumber` — dont la charte est déjà « **Les nombres que l'application
_dit_ et _montre_ — une règle de locale, un site** » — accueille les durées :

| entrée | rend | pour |
|---|---|---|
| `duration(seconds:clock:locale:)` | « 2:05 » · « 02:05 » · « 1:05:00 » | ce que l'écran MONTRE |
| `spokenDuration(seconds:locale:)` | « 2 minutes 5 secondes » | ce que VoiceOver DIT |
| `wholeSeconds(from:)` | pont `TimeInterval` → `Int`, borné | les deux |

L'implémentation est **native** : `Duration.TimeFormatStyle` et
`Duration.UnitsFormatStyle` (iOS 16+, exactement le plancher du projet). Elles
portent le système de chiffres, le séparateur, le remplissage à zéro et le nom
des unités — c'est-à-dire tout ce que les onze copies réimplémentaient de
travers.

### 4.2 Les trois orthographes sont NOMMÉES, pas unifiées

`DurationClock` reconnaît que l'app portait **déjà** deux orthographes justes,
chacune dans son contexte :

- `minuteSecond` (« 2:05 ») — minuteries média, précédent Dictaphone ;
- `paddedMinuteSecond` (« 02:05 ») — minuterie d'appel, précédent Téléphone ;
- `hourMinuteSecond` (« 1:05:00 ») — appel d'une heure et plus.

Les unifier aurait changé le rendu de dix écrans sans qu'aucun utilisateur ne
l'ait demandé. **Zéro changement visuel** en français et en anglais ; en arabe,
les chiffres deviennent enfin arabo-indiens.

Aucune horloge ne promeut les heures d'elle-même — `minuteSecond` accumule les
minutes, comme les onze formateurs remplacés. `CallManager` est le seul appelant
du dépôt à vouloir la promotion, et il la garde chez lui.

### 4.3 La face parlée

Onze `.accessibilityValue` passent à la forme parlée. Deux d'entre elles
gagnent au passage la structure que la doctrine 211i décrit sans l'avoir
appliquée partout — **libellé statique / valeur dynamique + `.updatesFrequently`** :

- `UniversalComposerBar+Recording` concaténait la durée DANS son libellé
  (`"Recording in progress" + ", 0:07"`), ce qui fait relire la phrase entière à
  chaque seconde ;
- `CameraView` posait la valeur sans le trait, même effet.

Et l'indice de `MessageOverlayMenu` ne porte plus que la **longueur** de l'audio
(`spokenTotalDuration`), pas la position courante : un indice VoiceOver se lit
une fois, après le libellé — une position qui défile n'y renseigne personne.

---

## 5. La garde

`NumericAccessibilityValueGuardTests` gagne une section « Durées » qui va
chercher le motif **à sa source** :

| test | ce qu'il interdit / exige |
|---|---|
| `test_noHandRolledClockFormatterSurvivesInTheApp` | aucun `String(format: "%…d:%02d")` dans l'app (hors le site de PERSISTANCE, nommé) |
| `test_convertedDurationHostsNameTheSingleSource` | les 11 hôtes convertis nomment toujours la source |
| `test_timerHostsSpeakTheirDurationInWords` | les 6 vues à minuterie nomment leur forme PARLÉE |
| `test_theClockExtractorFindsEveryKnownOffender` | l'extracteur reconnaît les **trois** orthographes fautives |
| `test_theClockExtractorSparesEverythingElse` | …et épargne la forme corrigée et les `String(format:)` sans rapport (faux rouge de 238i) |

Les deux derniers sont l'auto-garde imposée depuis 238i : un extracteur trop
étroit rend l'interdiction verte en silence, un extracteur trop large envoie
corriger ce qui ne l'est pas.

---

## 6. Vérification

Aucune toolchain Swift ici — **gate réel = CI `iOS Tests`**, suite complète via
l'opt-in ` — run test` **dans le SUJET du commit** (leçon 243i bis : le NOM du
check atteste ce qui a tourné, jamais sa couleur).

| contrôle déterministe rejoué hors Swift | résultat |
|---|---|
| `String(format: "%…d:%02d")` restants dans `apps/ios/Meeshy` | **0** (hors `NotificationSettingsView`, allowlisté) |
| extracteur de la garde sur les 3 formes fabriquées | **3 / 3** |
| extracteur sur les formes innocentes (`%.1f MB`, `String(localized:)`, forme corrigée) | **0** faux positif |
| les 11 hôtes nomment `LocalizedNumber.*` | **11 / 11** |
| les 6 vues à minuterie nomment leur forme parlée | **6 / 6** |
| gardes 241i pré-existantes (interpolation, glyphe `%`) rejouées sur l'arbre modifié | **vertes** |
| balayage : fichiers Swift vus sous `Meeshy/` | **578** (seuil de la garde : 400) |
| équilibre `()`/`{}`/`[]` des 17 fichiers | **écart nul vs `main`** |
| clés i18n ajoutées / retirées | **0 / 0** — catalogue non touché |
| `project.pbxproj`, `project.yml`, SDK | **non touchés** |

**Suites existantes réalignées, jamais contournées** — chaque assertion qui
épinglait `formattedDuration` dans une valeur d'accessibilité épingle désormais
`spokenDuration`, et la moitié NÉGATIVE est ajoutée (leçon 241i : épingler une
intention, et prouver les deux sens) :

- `CallViewAccessibilityTests` — 3 assertions + 1 versant négatif neuf ;
- `FloatingCallPillViewTests` — 1 assertion + 1 test neuf sur le jumeau parlé ;
- `CallManagerFormatDurationTests` — 13 assertions passent une **locale
  explicite** (`en_US`). Le formateur consultant désormais la locale, les juger
  sur `.current` reviendrait à juger celle du simulateur (leçon 234i).

---

## 7. Bilan

**14 fichiers prod** · **11 formateurs privés retirés** (−1 `DateComponentsFormatter`)
· **1 source unique étendue de 2 à 5 entrées** · **11 valeurs d'accessibilité
converties** · **2 minuteries gagnent `.updatesFrequently`** · **1 indice
VoiceOver assaini** · **3 suites réalignées** · **17 tests neufs** (11 de
comportement, 6 de garde) · **0 clé i18n** · **0 changement visuel en fr/en**.

Net : **+554 / −74**.

---

## 8. Suites (248i+)

1. **Le SDK porte 17 copies du même formateur** (`MeeshyUI/Story/Timeline/*`,
   `MeeshyUI/Media/*`, `MeeshySDK/Models/{CoreModels,CallModels,FeedModels}`).
   **Hors périmètre par règle** (piste SDK) — mais `LocalizedNumber` y a
   maintenant un jumeau évident, et `MediaTypes.formatDuration` en est le point
   de convergence naturel.
2. **`ComposerModels:35` grave une chaîne française** — `"Message vocal (\(…))"`
   compose le nom du fichier joint hors catalogue. Défaut d'i18n distinct,
   trouvé en passant, non mélangé.
3. Carry-over du pointeur 246i, inchangés : (a) classer le bucket « appelée
   seulement par un test » (241 entrées) ; (b) recâbler `FeedView` sur
   `likePost`/`bookmarkPost` ; (c) `isProgrammaticScroll` ; (d) les 3 copies
   d'`isLoadingReactions` ; (e) `buildNativeMessageMenu`, découvrabilité du fil
   de réponses, cibles tactiles 44 pt d'`InteractiveProgressBar`.

---

## 9. Clôture — MERGÉE

**PR [#3526](https://github.com/isopen-io/meeshy/pull/3526) · mergée le 2026-08-26 · `main` = `5741414e`.**

**Verdict CI, suite COMPLÈTE sur la tête `36c2d31d`** : **8449 passés / 0 échec /
5 sautés sur 8454** — check **`Build app + tests unitaires`**,
`COMPILE_ONLY=false`, `"result": "Passed"`, `testFailures: []`, simulateur
iPhone 16 Pro / iOS 18.2. Le **NOM** du check a été relu avant sa couleur
(leçon 240i (c), le piège qui s'est refermé trois fois de suite) : c'est bien la
suite qui a tourné, pas la compile seule.

**Atterrissage vérifié EN ENTIER sur `main`** (leçon 236i) : la source unique et
ses quatre entrées, les 11 hôtes convertis, la garde étendue, les 3 suites
réalignées, l'analyse et le plan. Balayage post-merge : les **seules**
occurrences de `String(format: "%…d:%02d")` restant sous `apps/ios/Meeshy` sont
les deux attendues — la citation en doc-comment de `LocalizedNumber` (mangée par
le dépouilleur de la garde) et `NotificationSettingsView`, allowlistée nommément.

### Les deux doutes assumés sont LEVÉS

Ils avaient été nommés au moment de pousser, faute de toolchain Swift ici. Les
inscrire résolus évite qu'une itération suivante les re-porte comme risques :

1. **Ambiguïté de surcharge** entre `duration(seconds: Int)` et
   `duration(seconds: TimeInterval)` sur un littéral entier — Swift élit `Int`
   (type par défaut du littéral). **La compile le confirme.**
2. **`Duration.UnitsFormatStyle` avec `zeroValueUnits: .hide` sur une durée
   NULLE** rend bien la plus petite unité autorisée, jamais la chaîne vide —
   `test_spokenDuration_zeroIsStillSpoken` est vert. La minuterie de la caméra
   et le pill d'appel, qui commencent tous deux à zéro, annoncent donc leur
   mesure et non leur seul libellé.

> **Un doute qu'on publie doit être SOLDÉ dès qu'il est mesuré.** Le laisser
> dans l'analyse sous sa forme interrogative, une fois la CI passée, c'est
> fabriquer le report que la leçon 286 décrit : la DESCRIPTION d'un risque se
> propage d'itération en itération, jamais sa vérification.
