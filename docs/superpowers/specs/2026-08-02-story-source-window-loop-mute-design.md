# Fenêtre de source, boucle et mute des pistes de story

Date : 2026-08-02
Statut : révision 3, prête pour le plan
Portée : `packages/MeeshySDK`, `services/gateway`, miroirs `apps/android`, `apps/web`

> **Historique.** Révision 1 soumise à trois revues Opus (architecture, interfaces,
> doctrines/SOTA) : six bloquants, non implémentable. Révision 2 soumise à trois
> nouvelles relectures (SOTA produit, conformité des ~128 citations, cohérence et
> implémentabilité) : une contradiction structurelle, trois défauts neufs, cinq
> sites encore oubliés, six tests sur douze inécrivables. Cette révision 3 les
> traite tous. Le § 13 tient le journal de ce qui a été écarté et pourquoi.

## 1. Ce qu'on veut obtenir

1. **Choisir la zone d'un son** — n'utiliser qu'un extrait d'un fichier.
2. **Boucler l'extrait sur la durée de la timeline**, avec le nombre de tours
   **montré**.
3. **Couper le son d'une vidéo d'un geste**, et qu'une piste coupée ne joue
   nulle part.

Cause commune : **aucune piste ne sait où entrer dans sa source, ni quelle est la
longueur de cette source.**

## 2. État des lieux vérifié

### 2.1 La vidéo est rognée d'un seul côté — et c'est le mauvais

Le plafond de durée existe (`nativeDurationLimit`,
`TimelineViewModel+Plan4Helpers.swift:55`). Mais **sept** consommateurs entrent
dans la source à `t = 0` :

| Consommateur | Site |
|---|---|
| Canvas avant-plan, lecture | `StoryMediaLayer.swift:736` |
| Canvas avant-plan, scrub | `StoryMediaLayer.swift:727` |
| Canvas avant-plan, édition | `StoryMediaLayer.swift:641` (`seek(to: .zero)`) |
| Canvas avant-plan, boucle `.edit` | `StoryMediaLayer.swift:662` |
| **Canvas fond, lecture** | `StoryBackgroundLayer.swift:918` (`target = max(0, slidePlayheadSeconds)`) |
| **Canvas fond, scrub** | `StoryBackgroundLayer.swift:938` |
| Aperçu timeline | `StoryTimelineEngine.swift:225-226` |

Plus **le seul chemin d'export d'une vidéo d'avant-plan** :
`StoryForegroundVideoFrameSource.frame(for:at:)`, `clipTime = slideSeconds − start`
(`StoryForegroundVideoFrameSource.swift:62`). `StoryExporter` ne compose de piste
vidéo que pour le fond (`:174-175`, branches `:205` bouclée et `:221` non).

Conséquence : tirer la poignée **gauche** applique `.setStart` — la fin reste
fixe, la durée rétrécit — et le moteur joue `source[0 … durée réduite].`
**L'auteur tire le bord gauche et perd la fin de sa vidéo.**

### 2.2 L'audio n'a aucune mémoire de la longueur de sa source

`nativeDurationLimit` ne lit que `project.mediaObjects` (`Plan4Helpers.swift:56`).
**C'est cette échappatoire qui rend la boucle authorable aujourd'hui** — voir
§ 5.3. `addBorrowedSound` écrit la longueur du son dans `duration`
(`Elements.swift:458`) ; rien ne retient la longueur de la source.

### 2.3 Le compteur de tours n'est pas calculable

`LoopRepeatOverlay` déclare `nativeDuration`, alimenté par
`TimelineGeometry.effectiveClipDuration` — la fenêtre timeline
(`StoryTimelineView.swift:712` audio, `:638` vidéo ; `TimelineGeometry.swift:69`).
Dès qu'une piste est étirée, `repeatStartTimes` retourne `[]`.

### 2.4 Le lecteur ne s'arrête jamais à la fin de sa fenêtre

`scheduleEntry` (`ReaderAudioMixer.swift:403`) et `rescheduleLoopedEntry` (`:414`)
appellent `scheduleFile` : fichier entier depuis 0, ré-armement sans compteur de
passes. `entry.duration` n'ancre qu'un fondu (`:434`).

### 2.5 L'aperçu timeline ne boucle pas

`AudioMixer.scheduleNodeFromTimelineTime` : `completionHandler: nil` aux deux
branches (`:140`, `:152`).

### 2.6 L'export réserve la boucle au fond

`StoryExporter` ne boucle que si `isBackground == true && loop == true` (`:1033`),
dans `composeAudioLanes` (`:1006`).

### 2.7 La vidéo de fond n'a pas de bouton de coupure

`foregroundVideoBindings` filtre `isBackground == false`
(`StoryComposerView+Canvas.swift:1256`), alors que le volume du fond est lu au
rendu (`StoryCanvasUIView+Rendering.swift:196`).

### 2.8 Ouvrir la timeline détruit la durée épinglée par l'auteur

Bug préexistant. L'auteur rogne à 20 s sur 30 s de contenu
(`StoryComposerViewModel+Slides.swift:42`) ; il rouvre la timeline ;
`TimelineProject(from:)` part de 20 (`StoryModels.swift:2722`) ;
`recomputeSlideDuration` remonte à 30 car `authoredDuration` ne reconnaît qu'un
pin **au-dessus** du contenu (`TimelineViewModel.swift:127`) ; le commit repose
`timelineDuration = nil` (`StoryModels.swift:2765`). **Le réglage est effacé.**

### 2.9 La fenêtre de source existe déjà côté serveur, remplie faux

`SoundUsage.startMs`/`endMs` (`schema.prisma:3081-3082`) sont dérivés de la
fenêtre **timeline** (`captureTracks.ts:25-27`, avec gardes `typeof`). Chaque
story publiée écrit une attribution fausse.

### 2.10 `Sound.waveform` n'a aucun écrivain

Déclaré (`schema.prisma:3054`), lu (`sounds.ts:56`), **jamais écrit** : ni
l'upload manuel (`routes/posts/audio.ts`) ni la capture
(`SoundCaptureService.ts`) ne le posent. `APISound.waveform` vaut `[]` pour
100 % de la bibliothèque en production, et `addBorrowedSound` recopie ce vide
(`Elements.swift:456`). Le client publie pourtant `waveformSamples` (jusqu'à
2048, `types.ts:146`) — `extractCaptureTracks` ne l'extrait pas.

**Sans écrivain, toute interface de choix de zone s'ouvre sur du vide.**

### 2.11 `SoundPreviewPlayer` ne sait ni jouer une plage ni boucler

`play(_:)` appelle `playLocalFile(url:)` sur le fichier entier depuis 0, sans
`currentTime` ni `numberOfLoops` (`SoundPreviewPlayer.swift:74-96`).

### 2.12 Le miroir web est déjà cassé

`parseAudioObjects` (`story-transforms.ts:131-149`) ne lit **ni** `startTime`,
**ni** `duration`, **ni** `loop`. `computeStoryDurationMs` (`:264-267`) ignore
`startTime` sur les médias d'avant-plan et toutes les fenêtres audio, là où iOS
mesure `startTime + duration` sur les deux (`StoryModels.swift:1323-1327`).

## 3. Principe directeur

> Une piste a **deux** fenêtres : *où elle vit sur la timeline*, et *où elle entre
> dans son fichier*. Un champ nouveau par type. **`applyWindow` est l'unique
> écrivain** du triplet ; les résolveurs sont des fonctions pures qu'il compose.

| Champ | Sens | Résolveur (pur) |
|---|---|---|
| `startTime` | quand la piste démarre sur la timeline | `ClipWindowResolver` |
| `duration` | **voir § 3.1 — le sens dépend du rôle** | `ClipWindowResolver` |
| `sourceStart` | où l'on entre dans le fichier | `SourceWindowResolver` |
| `intrinsicDuration` | longueur totale du fichier (donnée) | — |

### 3.1 `duration` a deux sens selon le rôle de la piste — et le code le sait déjà

C'est la correction la plus importante de cette révision.

- **Piste d'avant-plan** : `duration` est l'**occupation** timeline.
- **Fond** : `duration` est la **période de boucle**. L'occupation est
  `slideDuration`. Preuve dans le code : `contentDerivedDuration` construit une
  variable nommée `bgLoopPeriods` à partir du `duration` des pistes de fond
  (`StoryModels.swift:1331`) pour arrondir la slide à un nombre entier de
  répétitions (`:1331-1335`), et `LoopRepeatOverlay` pave jusqu'à `slideDuration`
  précisément pour cette raison (`LoopRepeatOverlay.swift:5-10`, bug utilisateur
  du 2026-07-17).

Grandeur commune, à utiliser partout où l'on parle de répétition :

```
tilingEnd = isBackground ? slideDuration : (startTime + duration)
loopCount = (tilingEnd − startTime) / excerptDuration
```

**Ignorer cette distinction régresse le bug du 2026-07-17** : paver jusqu'à
`startTime + duration` sur un fond donne `t < startTime + duration` faux d'emblée
⟹ zéro tuile, et `loopCount` structurellement égal à 1 sur la seule surface qui
affiche des tours aujourd'hui.

### 3.2 Pas de champ `sourceEnd`, pas de troisième durée

```
excerptDuration = min(duration, intrinsicDuration − sourceStart)
```

- `intrinsicDuration` inconnue ⟹ `excerptDuration = duration`, `loopCount` calculé
  sur `tilingEnd`, aucun clamp de source. Une story antérieure se comporte comme
  avant.
- Aucun plancher n'est appliqué à `excerptDuration` : le plancher de
  `ClipWindowResolver` sur `duration` (0,05 s) reste le seul plancher de durée.

## 4. Modèle de données

### 4.1 `StoryAudioPlayerObject` — deux champs, deux sites

```swift
public var sourceStart: Float?          // nil ≡ 0
public var intrinsicDuration: Float?    // longueur totale du fichier
```

Conformance `Codable` **synthétisée**, pilotée par un `CodingKeys` explicite
(`StoryModels.swift:935-947`) — ce type n'a **ni** `init(from:)` **ni**
`encode(to:)`. Deux sites : le `CodingKeys` (avec son avertissement `:941-944`) et
**l'init public mémberwise** (`:949-976`), qui n'est pas exhaustif (il omet déjà
`mutedVolumeMemento`).

### 4.2 `StoryMediaObject` — un champ, cinq sites

```swift
public var sourceStart: Double?         // nil ≡ 0
```

`Codable` **manuel** : `CodingKeys` (`:684-692`), init mémberwise (`:694-738`),
`init(from:)` (`:741-782`), `encode(to:)` (`:784-812`), init de convenance `kind:`
(`:823-867`). `intrinsicDuration` existe déjà (`:632`).

### 4.3 `StoryAudioVariant` — deux champs

```swift
public var sourceStart: Float?          // nil ≡ hérite de la piste
public var intrinsicDuration: Float?
```

La résolution par langue tourne **déjà** en production
(`resolvedPostMediaId(preferredLanguages:)`, `StoryModels.swift:984-995`, appelée
en `StoryCanvasUIView+Audio.swift:222` et `:264`, plus
`StoryAudioSourceResolver.swift:37`). Une variante est un autre fichier, donc une
autre durée : sans ces champs, la fenêtre devient fausse au changement de langue,
et les poser plus tard exige de réécrire des blobs `storyEffects` **publiés**.

`resolvedPostMediaId` devient `resolvedSource(preferredLanguages:)` rendant
`(postMediaId, sourceStart, sourceDuration)`, avec repli sur les valeurs de la
piste. Trois appelants.

### 4.4 Écrivains d'`intrinsicDuration` sur l'audio

Unique écrivain aujourd'hui, médias seulement (`Elements.swift:382-383`). Trois
chemins créent des pistes audio :

- `addBorrowedSound` : **continue d'écrire `duration = sound.durationSeconds`**
  et **ajoute** `intrinsicDuration = sound.durationSeconds` (`Elements.swift:458`).
  *(La révision 2 prescrivait de cesser d'écrire `duration` sans dire ce qui la
  remplace, ce qui cassait `effectiveClipDuration`, l'extension de slide et la
  période de boucle du fond.)*
- Import de fichier et vocal : mesuré à l'import. La mesure est **asynchrone**
  (`AVAsset.load`) alors que le clip est créé aussitôt : le champ reste `nil`
  puis est rétro-rempli. **Le rétro-remplissage n'écrase jamais une `duration`
  déjà posée par l'auteur**, et n'applique aucun plafond rétroactif.
- `AddClipCommand.apply` (`StoryModels.swift:2877`) : la valeur est fournie par
  l'appelant ; absente, le champ reste `nil` (cas « source inconnue »).

Le fond synthétisé depuis les champs legacy (`:1844`) reste sans
`intrinsicDuration`.

### 4.5 Commande d'annulation — deux chemins, jamais deux commandes par geste

`MeeshyUI` dépend de `MeeshySDK`, jamais l'inverse (`Package.swift:54-56`) : la
commande ne peut pas porter un type défini côté UI. Et empiler une commande non
coalesçable par frame de glissement saturerait la pile de 50 en moins d'une
seconde et évincerait l'état d'avant-geste (`CommandStack.swift:113-117`, `:58`).

**Geste continu (poignées, barre tactile de la fiche).** `TrimClipCommand` reçoit
`oldSourceStart` / `newSourceStart: Float?` (`:3041-3067`), appliqués par `mutate`
(`:3077-3104`), restaurés par `revert`, propagés par la fusion (`:142-151`, patron
`p.old* + n.new*`). Décodage en `decodeIfPresent`.

**Affordance discrète (feuille « Zone », champs numériques).**
`SetClipPropertyCommand.ClipProperty.sourceStart(old: Float?, new: Float?)`. Une
paire de `Float?` entre dans les `CodingKeys` existantes `oldFloat`/`newFloat`
(`:3629-3632`) : le `Tag` (`:3634-3637`) reçoit un cas, plus une branche dans
`init(from:)`, `encode(to:)` et les **trois** `apply(property:to:)` (`:3773`
média, `:3805` audio, `:3837` texte). **La branche texte lève
`EditCommandError.unsupportedProperty`.** Les trois `switch` étant exhaustifs sans
`default`, le compilateur tient la garde.

`applySetClipProperty` (`Plan4Helpers.swift:415-423`) n'a pas de garde de no-op —
chaque setter porte la sienne (`:409`). Le nouveau pose la sienne.

## 5. `SourceWindowResolver`

Pur, sans état, `nonisolated enum`, dans **`MeeshySDK/Models/`** — et non à côté
de `ClipWindowResolver` dans `MeeshyUI` : le § 5.2 le fait appeler par
`contentDerivedDuration`, qui vit dans `MeeshySDK` (`StoryModels.swift:1298`) et
sert le lecteur et l'export. Le placer côté UI forcerait une seconde
implémentation de la règle d'extrait côté SDK — le défaut « deux implémentations,
une règle » que ce lot existe pour fermer.

```swift
public nonisolated enum SourceWindowResolver {

    /// Queue de source minimale laissée après l'entrée. NE planche PAS
    /// `excerptDuration` : le plancher de durée reste celui de
    /// `ClipWindowResolver` (0,05 s).
    public static let minimumSourceTail: Float = 0.3

    public static func resolveSourceStart(_ proposed: Float,
                                          sourceDuration: Float?) -> Float

    public static func excerptDuration(sourceStart: Float,
                                       duration: Float,
                                       sourceDuration: Float?) -> Float

    /// `(tilingEnd − startTime) / excerptDuration`, borné à 1 par le bas.
    public static func loopCount(sourceStart: Float,
                                 startTime: Float,
                                 tilingEnd: Float,
                                 sourceDuration: Float?,
                                 duration: Float) -> Float

    /// Combinateur PUR du ripple trim in (§ 8.3). Extrait ici et non laissé
    /// dans `applyWindow` (privée, `@MainActor`) pour que le test 4 existe.
    public static func rippleTrimIn(current: (start: Float, duration: Float),
                                    proposedStart: Float,
                                    sourceStart: Float,
                                    sourceDuration: Float?,
                                    isLooping: Bool)
        -> (start: Float, duration: Float, sourceStart: Float)
}
```

**Invariants** :

- Source connue ⟹ `sourceStart ∈ [0, sourceDuration − minimumSourceTail]`.
- Source inconnue ⟹ **aucun clamp autre que `≥ 0`**, et le § 8.3 neutralise le
  ripple (voir la règle δ), de sorte qu'une story antérieure garde son geste.
- `sourceDuration == nil` ⟹ `excerptDuration == duration`, `loopCount` calculé sur
  `tilingEnd`.
- Entrées non finies ⟹ la fonction rend son entrée pertinente inchangée
  (`resolveSourceStart` rend `proposed` s'il est fini, sinon le `sourceStart`
  courant ; `excerptDuration` rend `duration` ; `loopCount` rend 1).

### 5.1 Le dénominateur du compteur

`excerptDuration`. Le numérateur est `tilingEnd − startTime`, qui vaut
l'occupation réelle : la fenêtre du clip pour un avant-plan, la slide pour un
fond (§ 3.1).

### 5.2 Période de boucle de `contentDerivedDuration`

La fonction prend le `duration` du fond comme période (`StoryModels.swift:1303-1309`,
`:1331-1335`). Avec une fenêtre de source, la vraie période est `excerptDuration` :
sinon la dernière répétition est coupée, ce qui contredit sa doctrine. Miroir web
identique (`apps/web/lib/story-transforms.ts:257-261`).

### 5.3 Le plafond `nativeDurationLimit` devient conditionnel

`applyWindow` rabote au-delà de la durée native (`Plan4Helpers.swift:70-72`).
Étendre ce plafond à l'audio rendrait `duration > excerptDuration` **impossible**,
donc la boucle inauthorable : le lot s'annulerait lui-même.

```
limite = loop ? (aucune) : (intrinsicDuration − sourceStart)
```

Le plafond entre en **paramètre** de `ClipWindowResolver.resolve(_:from:maximumDuration:)`
plutôt que d'être raboté après coup — sinon « un seul propriétaire par champ »
reste une déclaration sans mécanisme.

**Désactiver `loop` sur une piste déjà étirée.** Le toggle
(`setClipLoop`, `Plan4Helpers.swift:345`) **rabote `duration` à
`intrinsicDuration − sourceStart`** dans le même geste, et empile **une** entrée
d'annulation composite (`loop` + `TrimClip`) pour qu'un seul « Annuler » restaure
les deux. Source inconnue ⟹ `duration` intacte. Sans cette règle, désactiver
`loop` laisse une piste dans l'état que le plafond vient d'interdire de créer :
silence en queue pour l'audio, image figée pour la vidéo.

**Ordre de livraison contraint.** La levée du plafond pour un **média** n'est
livrable qu'avec le câblage de `media.loop` (§ 6.2) : `attachPlayer(url:mode:loop:)`
reçoit `loop: mode != .play` (`StoryMediaLayer.swift:498, 526, 543`), jamais
`media.loop`. Lever le plafond avant permettrait d'étirer une vidéo de 3 s à 30 s
et d'obtenir 27 s d'image figée partout. Pour l'**audio**, la levée est livrable
seule : la boucle existe déjà au lecteur et à l'export.

## 6. Les moteurs

### 6.1 Audio

| Site | Après |
|---|---|
| `ReaderAudioMixer.Entry` (`:535-551`) et `BackgroundEntry` (`:553+`) | reçoivent `sourceStart` et `excerptDuration` — sans quoi les modifications ci-dessous sont inécrivables |
| `scheduleEntry` (`:385`) | `scheduleSegment(startingFrame:frameCount:)` sur l'extrait |
| `rescheduleLoopedEntry` (`:412`) | ré-arme le **même** extrait, et **s'arrête** quand le total joué atteint la fenêtre |
| `scheduleBackgroundFile` (`:662`) | idem |
| `configure` défaut de durée (`:144`) | `longueur du fichier − sourceStart` |
| **`configureBackground` défaut de durée (`:620-621`)** | idem — copie exacte du même défaut |
| `AudioMixer.scheduleNodeFromTimelineTime` (`:124-154`) | extrait dans les deux branches ; ré-armement par `completionHandler` |

**Deux grandeurs distinctes, à ne pas confondre** — c'est le défaut de la
révision 2 :

- **par passe** : `excerptDuration × sampleRate` frames ;
- **au total** : `(tilingEnd − startTime) × sampleRate` frames.

Comme `excerptDuration ≤ duration` par définition, plafonner le **total** à
`excerptDuration × sampleRate` arrêterait la lecture après un seul extrait : la
boucle ne jouerait jamais. Le ré-armement porte donc un compteur de passes ; il
cesse quand le total est atteint. C'est ce compteur qui ferme le § 2.4, sans
timer.

Conversion secondes → frames dans **une** fonction statique pure — c'est aussi le
seam du test 6a : `frame = round(seconds × sampleRate)`, bornée à `file.length` ;
`frameCount == 0` ⟹ rien n'est planifié plutôt que de lever.

### 6.2 Vidéo

| Site | Après |
|---|---|
| `StoryMediaLayer.alignToTimelineThenPlay` (`:736`) | `target = sourceStart + (playhead − startTime)` |
| `StoryMediaLayer.alignPausedToSlidePlayhead` (`:727`) | idem (scrub) |
| `StoryMediaLayer` seek `.edit` (`:641`) | `seek(to: sourceStart)` |
| `StoryMediaLayer` boucle `.edit` (`:662`) | rejoue depuis `sourceStart` |
| `StoryMediaLayer.attachPlayer` (`:498, 526, 543`) | **câbler `media.loop`** au lieu de `mode != .play` |
| **`StoryBackgroundLayer.alignToTimelineThenPlay` (`:918`)** | `target = sourceStart + playhead` |
| **`StoryBackgroundLayer.alignPausedToSlidePlayhead` (`:938`)** | idem (scrub) |
| `StoryBackgroundLayer` looper (`:800`) | `AVPlayerLooper(player:templateItem:timeRange:)` |
| `StoryBackgroundLayer` observateur de fin (`:892-899`, seek `:897`) | `seek(to: sourceStart)` |
| `StoryTimelineEngine` (`:225-226`) | `insertTimeRange(start: sourceStart, …)` |
| **`StoryForegroundVideoFrameSource`** (`:62`) | `clipTime = sourceStart + (slideSeconds − start)`, modulo `excerptDuration` si `loop`. Seul chemin d'export d'une vidéo d'avant-plan. Extraire `clipTime(for:at:) -> CMTime?` (seam du test 6f) |

### 6.3 Export

`insertTimeRange` part de `sourceStart` : fond vidéo (`:205`, `:221`), piste audio
du fond (`:852`, `:864`), pistes audio (`:1052`, `:1062`). La boucle cesse d'être
réservée au fond : condition `loop == true` seul (`:1033`). Période de boucle
`excerptDuration` et non `assetDuration` (`:1051`).

### 6.4 Découpe

`SplitClipCommand.apply` copie l'objet entier (`StoryModels.swift:3139-3150`
média, `:3155-3165` audio) : sans correction, les deux moitiés rejouent le même
extrait. `right.sourceStart = sourceStart + splitAtRelativeTime`, pour les deux
branches.

### 6.5 Vignettes et forme d'onde

- `VideoFilmstrip.frames` reçoit un `range`, **qui entre dans la clé de cache**
  (`VideoFilmstrip.swift:12-13`), plus un `_resetCacheForTesting()`.
- `WaveformStrip` / `AudioClipBar` décalent leur lecture de `sourceStart`.

## 7. Boucle et compteur de tours

### 7.1 `LoopRepeatOverlay`

Trois changements :

1. `nativeDuration` → `excerptDuration`.
2. La vue reçoit **`duration` en plus de `slideDuration`** (signature `:11-17`) et
   pave jusqu'à `tilingEnd` (§ 3.1) : `slideDuration` pour un fond,
   `startTime + duration` pour un avant-plan. Sans le premier cas, on régresse le
   bug du 2026-07-17 ; sans le second, un clip d'avant-plan bouclé sur `[0, 4]`
   d'une slide de 20 s pave jusqu'à 20 s, et un extrait au plancher sur 60 s
   produit ~199 tuiles.
3. La vue devient `Equatable` et le badge sort en sous-vue à entrées primitives —
   sinon le `ForEach` (`:59`) reconstruit tout le tableau à chaque frame de
   glissement.

Conditions d'affichage relâchées à `loop == true` seul, aux **deux** gardes :
vidéo `isImmovableBackground, media.loop == true` (`StoryTimelineView.swift:630, 700`)
et **audio `audio.isBackground == true, audio.loop == true`** (`:767`).

### 7.2 Montrer les tours plutôt que les annoncer

Aucune des références (TikTok, Instagram, Snapchat, CapCut) n'affiche un compteur
fractionnaire ; toutes **montrent** la répétition par des tuiles — ce que
`LoopRepeatOverlay` fait déjà. Un « ↺ 1,5 tour » constate sans répondre à la vraie
question de l'auteur (« mon son se coupe-t-il au milieu d'une phrase ? »).

Décision : **badge entier, à partir de ×2** (« ×3 »), plus l'action que le badge
suggère — ajuster `duration` du clip au nombre entier de tours immédiatement
inférieur ou supérieur. L'action ne touche que `duration` du clip, jamais la durée
de slide : la boucle divergente de l'`Edit.fill` écarté (§ 13) ne se rejoue pas.

Bénéfice collatéral : un entier supprime tout le problème de pluriel du § 11 — le
précédent `story.sound.library.playCount` utilise `%lld`, donc ne pouvait de toute
façon pas héberger « 1,5 ».

Le badge ne peut pas vivre dans `LoopRepeatOverlay`, qui est
`.accessibilityHidden(true)` (`:78`) : élément **frère**, avec son propre libellé
accessible sur la barre du clip.

## 8. Interface

### 8.1 La feuille « Zone »

```
┌─ Zone du son ─────────────────┐
│  Meeshy Go · @meeshy_sama     │
│                               │
│    ║│█│║│██│║│█│║│█│║│██│     │
│   ──┌────────┐────────────    │
│     │ fenêtre│  ← fixe        │
│   ──└────────┘────────────    │
│    0:00    0:12       1:30    │
│                               │
│  Piste 8,0 s · extrait 5,3 s  │
│  ×2 tours                     │
│                               │
│  [ Annuler ]       [ Poser ]  │
└───────────────────────────────┘
```

Forme d'onde défilant sous une fenêtre fixe — le geste des quatre références.
L'extrait joue **en boucle** pendant le défilement, ce qui exige d'étendre
`SoundPreviewPlayer` (§ 2.11) : lecture d'une plage et bouclage.

Le libellé nomme la grandeur réellement utilisée comme numérateur : « Piste » pour
un avant-plan, « Slide » pour un fond (§ 3.1). Il ne peut pas afficher une
grandeur dont le quotient ne fait pas le nombre montré.

**Pas d'ouverture automatique.** La révision 2 l'imposait au choix d'un son
emprunté : cela ajoutait un geste par rapport à aujourd'hui **et** aux quatre
références (4 contre 3), pour ouvrir sur 0:00 ; et sur une feuille auto-ouverte,
« Annuler » se lit « annuler le son », pas « annuler la zone ». Le son est donc
**posé immédiatement** au choix, comme aujourd'hui, et la feuille s'ouvre depuis
la chip du canvas et depuis la fiche de la timeline — deux affordances
persistantes, découvrables, sans blocage.

Pour une **vidéo**, même feuille avec une bande de vignettes.

**Retrait de `.trim` du chemin story de `MeeshyAudioEditorView`.** Cet éditeur
**cuit** le rognage dans un nouveau fichier (`AudioEditorController.swift:64`,
contrat documenté `MeeshyAudioEditorView.swift:17-19`) : après lui,
`intrinsicDuration` vaut la longueur coupée et la feuille « Zone » ne peut plus
jamais récupérer ce qui a été jeté. Le premier éditeur détruit ce que le second
promet. Il garde ce qu'il est seul à savoir faire (transcription, vitesse, fondu,
gain).

### 8.2 Placement SDK / app

La feuille prend des paramètres opaques et rend une fenêtre : test du grain passé
(`packages/MeeshySDK/CLAUDE.md:34-39`) → SDK. Ce lot ne déplace pas le composer,
qui vit dans `MeeshyUI/Story/` en écart avec la ligne « ViewModels → APP »
(`:31`) — l'exception est **inscrite dans `packages/MeeshySDK/decisions.md`**,
sinon la prochaine session rejoue l'arbitrage.

### 8.3 Les poignées — ripple trim in

| Geste | Effet |
|---|---|
| Poignée **droite** | `duration` change. `sourceStart` inchangé. |
| Poignée **gauche** | `startTime`, `duration` **et** `sourceStart` bougent ensemble. |

**Règle générale** (et non un exemple, qui ne se généralise pas) :

```
résolu = ClipWindowResolver.resolve(.setStart(current.start + δ), from: current,
                                    maximumDuration: limite(§5.3))
δ₁ = résolu.start − current.start
s' = resolveSourceStart(sourceStart + δ₁, sourceDuration)
δ₂ = s' − sourceStart
start = current.start + δ₂ ; duration = current.end − start ; sourceStart = s'
```

**Le clip se déplace donc moins que le doigt quand la source mord.** L'ordre n'est
pas commutatif : le clamp de source gagne, la fenêtre timeline est recalculée
depuis le δ réellement appliqué. Un seul `TrimClipCommand` est empilé.

**δ < 0** (poignée tirée vers la gauche, on rend du début) :
`s' = max(0, sourceStart + δ)`. Le δ timeline n'est réduit au δ source **que** si
la piste est non bouclée **et** sa source connue — on ne peut pas inventer du
média avant le début du fichier. Si la piste est `loop`, la tête est remplie par
la répétition ; si la source est inconnue, le δ complet s'applique, ce qui
préserve exactement le geste actuel sur toutes les pistes existantes.

**Sans cette règle, une implémentation littérale du clamp `≥ 0` rendrait la
poignée gauche inerte vers la gauche sur 100 % des pistes existantes**, sans
qu'aucun test ne rougisse.

**Exemple non dégénéré** (à reprendre en test ; l'exemple de la révision 2 était
faux dans son étape intermédiaire et son résultat coïncidait avec le plancher par
accident) : source 10 s, `sourceStart = 9,0`, fenêtre `[2, 3]` (durée 1,0),
δ = +0,9. → `résolu.start = 2.9`, δ₁ = 0,9 → `resolveSourceStart(9.9, 10) = 9.7`,
δ₂ = 0,7 ⟹ `start = 2.7`, `duration = 0.3`, `sourceStart = 9.7`. Le doigt a
parcouru 0,9, le clip 0,7.

**Portée.** Le ripple est gaté sur `kind ∈ {video, image, audio}` : `applyWindow`
sert aussi le texte et le sticker (`StoryTimelineView.swift:813`, `:857`), qui ne
portent pas `sourceStart`. La barre tactile de la fiche (`ClipTimingBar.swift:54`,
`case .trimStart`) produit un `TrimClipCommand` comme les poignées ; le chemin
`SetClipPropertyCommand.sourceStart` ne sert que les champs numériques et la
feuille.

**Piste bouclée, poignée gauche.** Le ripple change à la fois l'extrait et le
nombre de tours dans un seul geste. C'est assumé : le badge de tours suit en
direct, ce qui rend le double effet lisible.

**Étiquette de geste.** Pendant le trim, une étiquette affiche le point d'entrée
dans la source (« 00:03,4 / 00:12,0 »), comme CapCut. C'est ce qui enseigne la
nouvelle sémantique au premier glissement, sans avertissement ni tutoriel.

### 8.4 Le mute

Acquis : `volume == 0` est l'état muet persistant avec `mutedVolumeMemento`
(`StoryVolumeCarrying`, `StoryModels.swift:1008`), honoré partout ; bouton un-tap
sur les vidéos d'avant-plan et les chips audio.

**Une seule correction : la vidéo de fond reçoit le même bouton.** Binding
**optionnel unique** (`first(where: { $0.isBackground && $0.kind == .video })`), et
non un tableau filtré : le modèle ne contraint pas l'unicité du fond.

## 9. Serveur

### 9.1 `SoundUsage` — coordonnées de source

```
startMs = round(sourceStart × 1000)
endMs   = round((sourceStart + excerptDuration) × 1000)
```

Quand `intrinsicDuration` est absent du blob (client antérieur, fond synthétisé),
`endMs = startMs + min(duration, durée du Sound en base)` — sans quoi une piste
bouclée réécrirait une attribution fausse, le bug même que ce paragraphe corrige.

Les lignes existantes portent des coordonnées de timeline et sont inexploitables ;
on ne les migre pas (rien ne les lit), on cesse d'en produire de fausses.

**Propriété qui rend ce lot livrable en premier, seul** : un client qui ne publie
pas encore `sourceStart` donne `startMs = 0, endMs = duration` — ce qui est
**exactement juste** pour lui, puisqu'il entre la source à 0.

### 9.2 `SoundUsage.windowAdjustedAt DateTime?`

`null` = l'auteur a accepté le point d'entrée proposé ; non-null = il l'a déplacé.
Idiome nullable-DateTime du CLAUDE.md racine, pas de booléen redondant.

Sans ce champ, le jour où le point d'entrée par défaut d'un son emprunté sera
dérivé de l'agrégat, **l'agrégat se nourrira de sa propre sortie** : le hook se
fige sur le premier maximum et on ne peut plus apprendre qu'il était mauvais. Les
lignes écrites entre-temps sont inétiquetables rétroactivement.

### 9.3 `Sound.waveform` reçoit enfin un écrivain

Sans lui, la feuille du § 8.1 s'ouvre sur du vide pour 100 % de la bibliothèque
(§ 2.10).

- **Capture** : `extractCaptureTracks` (`captureTracks.ts:20-28`) extrait
  `waveformSamples` du blob — la donnée arrive déjà et est jetée — et
  `SoundCaptureService` la pose sur le `Sound` créé.
- **Upload manuel** (`routes/posts/audio.ts`) : décodage du buffer déjà en
  mémoire.

Coût aujourd'hui : quasi nul. Coût plus tard : relire et décoder **tous** les
fichiers de la bibliothèque.

### 9.4 Validation d'entrée

La porte est `StoryAudioObjectSchema` (`types.ts:139-158`) et
**`StoryMediaObjectSchema` (`:79-103`)**, tous deux `.passthrough()` (`:158`,
`:103`) — c'est ce qui laisse passer les nouveaux champs. Tous les frères
numériques sont bornés (`min(0).max(86400)` sur `startTime`/`duration`, `:147-148`
audio et `:97-98` média). Les nouveaux le sont aussi, **sur les deux schémas** :
`sourceStart` et `intrinsicDuration` en `z.number().min(0).max(86400).optional()`.

## 10. Ports et compatibilité

**Story antérieure** : `sourceStart == nil ≡ 0`, `intrinsicDuration == nil` ⟹
comportement identique, les bugs des § 2.4 à § 2.6 étant corrigés pour tous.

**Lecture par une version antérieure** : champs ignorés. Côté Android, ce n'est
vrai que grâce à `ignoreUnknownKeys = true`
(`apps/android/core/network/…/MeeshyApi.kt:58`) — kotlinx.serialization lève sur
clé inconnue par défaut.

**Pile d'annulation persistée** : `ClipProperty.init(from:)` décode le `Tag`
strictement (`StoryModels.swift:3641`), et `StoryComposerViewModel+Timeline.swift:88-92`
décode tout le dictionnaire en un seul `try` avec un `catch` qui ignore — un tag
inconnu détruit donc **tout** l'historique, toutes slides confondues. Le décodage
devient tolérant : la pile est **tronquée** au premier tag inconnu (et non
l'entrée sautée, ce qui laisserait des `revert` s'appliquer sur un état n'ayant
jamais existé), via un conteneur qui décode élément par élément.

**Ports** :

- Android : `Story.kt:149` (média), `:184` (audio), plus `StoryAudioVariant`.
- Web : `parseAudioObjects` (`story-transforms.ts:131-149`) doit d'abord lire
  `startTime`, `duration` et `loop` — ajouter `sourceStart` avant n'a pas de sens.
- Web : `computeStoryDurationMs` (`:222`, période `:257-261`) redevient le miroir
  de `computedTotalDuration()`. Il est **déjà** rouge, indépendamment de ce lot.

## 11. Localisation et accessibilité

`bundle: .module` sur toute chaîne de `MeeshyUI` ; nouvelles clés inscrites au
registre de `TimelineLocalizationTests.swift`.

Le badge étant un **entier ≥ 2** (§ 7.2), il utilise `%lld` et le précédent
`story.sound.library.playCount` s'applique directement — 7 locales
(`ar, de, en, es, fr, it, pt-BR`), 6 catégories arabes. *(Un compteur fractionnaire
aurait exigé un spécificateur flottant et fait tomber « 1.5 » en `other` en
anglais.)*

Le badge est un élément **frère** de `LoopRepeatOverlay` (`.accessibilityHidden(true)`,
`:78`), avec libellé propre. La feuille respecte le Dynamic Type et expose son
geste de défilement par un contrôle accessible.

*(Annexe hors lot : `LocalizedStringsBacklogTests.swift:29-31` déclare encore 5
locales produit alors que le catalogue en porte 7.)*

## 12. Tests et seams

Six des douze tests de la révision 2 étaient inécrivables faute de seams. Chaque
seam manquant est désormais **prescrit**, et c'est ce qui rend la liste réelle.

| # | Test | Seam requis |
|---|---|---|
| 1 | Invariants de `SourceWindowResolver`, source inconnue, non finis | — (type pur neuf) |
| 2 | `loopCount` : avant-plan et **fond** (numérateur = slide) | — |
| 3 | Round-trip `Codable` des trois types + charge sans les clés. **Rouge obtenu en posant la propriété stockée SANS son `case`** — en Swift, référencer un champ inexistant casse la compilation du bundle, pas un test. Ne pas passer par `toJSON()`, qui n'énumère pas les nouvelles clés | — |
| 4 | Ripple trim in : l'exemple non dégénéré, **δ < 0**, `sourceStart > 0`, source inconnue, piste bouclée, texte/sticker inchangés | `SourceWindowResolver.rippleTrimIn` (§ 5) |
| 5 | Undo restaure les trois valeurs ; N frames fusionnent en une entrée ; **pile antérieure sans `*SourceStart` décodée** ; **pile avec tag inconnu tronquée** | — |
| 6a | Frame de départ, `ReaderAudioMixer` | conversion secondes→frames en statique pure (§ 6.1) |
| 6b | Frame de départ, `AudioMixer` | idem |
| 6c | `CMTimeRange` de `StoryTimelineEngine` | `insertVideoTracks` testable (actuellement `private`, `:197`) |
| 6d | `CMTimeRange` de `StoryExporter` | — (`composeAudioLanes` `:1006` et `composeBackgroundVideoAudio` `:816` déjà visibles) |
| 6e | Cible de seek des **quatre** chemins `StoryMediaLayer` et des **deux** de `StoryBackgroundLayer` | statique pure `seekTarget(playhead:startTime:sourceStart:)` |
| 6f | `clipTime` de `StoryForegroundVideoFrameSource` | extraire `clipTime(for:at:) -> CMTime?` |
| 7 | Découpe : deux moitiés d'extraits différents | — |
| 8 | `LoopRepeatOverlay` : avant-plan 4× → 3 tuiles ; **fond court → tuiles jusqu'à la slide** (garde anti-régression du 2026-07-17) ; aucune tuile au-delà de `tilingEnd` | — |
| 9 | Parité 4 moteurs. **Fixture à `slideDuration` épinglée**, sinon elle rencontre le bug du § 2.8 et devient instable | somme de 6a–6f |
| 10 | Plafond conditionnel (§ 5.3) : `loop` lève la limite ; `loop` off rabote `duration`. **Sans ce test, un futur « nettoyage » qui rétablit le plafond plat tue la boucle sans faire rougir quoi que ce soit** | — |
| 11 | Écrivains d'`intrinsicDuration` : les trois chemins ; le rétro-remplissage n'écrase pas une `duration` d'auteur | — |
| 12 | Lecteur : arrêt à la fin de la fenêtre (§ 2.4) ; aperçu : bouclage (§ 2.5) ; export : boucle non réservée au fond et période = `excerptDuration` (§ 2.6) | — |
| 13 | `contentDerivedDuration` reçoit `excerptDuration` comme période — iOS **et** miroir web | — |
| 14 | Gateway : `extractCaptureTracks` en coordonnées de source, repli sans `intrinsicDuration`, `waveformSamples` extrait ; bornes Zod sur les **deux** schémas | — (fonction pure exportée exprès) |
| 15 | `SetClipPropertyCommand.sourceStart` : trois `apply`, texte qui lève, garde de no-op, encode/decode | — |
| 16 | Clé de cache du filmstrip | `_resetCacheForTesting()` |
| 17 | Localisation : clé dans 7 locales avec pluriels ; format numérique localisé | registre propre, **pas** `LocalizedStringsBacklogTests.requiredLocales` (5 locales) |
| 18 | Mute du fond vidéo ; `CanvasEditMuteLivePropagationTests` reste vert | — |

**Piège de chemin** : les gardes de source de `Tests/MeeshyUITests/Story/` comptent
**quatre** `deletingLastPathComponent`. Les tests timeline vivent dans
`Tests/MeeshyUITests/Timeline/`, à la **même** profondeur — donc quatre aussi. Un
compte erroné ne rougit pas : il fait passer la garde par son `XCTSkip`.

## 13. Journal des décisions écartées

| Écarté | Raison |
|---|---|
| `SourceWindowResolver.Window` portant `duration` | Deux résolveurs, un champ, deux planchers (0,05 vs 0,3). |
| `SourceWindowResolver` dans `MeeshyUI` | `contentDerivedDuration` (§ 5.2) vit dans `MeeshySDK` et ne peut pas l'appeler. |
| `SetClipPropertyCommand.sourceWindow` avec un type `MeeshyUI` | `Package.swift:54-56`. |
| Une commande de propriété par frame de glissement | Non coalesçable → pile saturée en < 1 s → état d'avant-geste évincé. |
| Ne plus planifier une piste à `volume == 0` | Casse l'automation de volume depuis le silence, rend l'unmute inopérant, fait rougir un test vert. |
| `Edit.fill(reference:)` | Sur un fond décalé, faisait doubler la durée de slide à chaque appui. |
| Ouverture automatique de la feuille au choix du son | 4 gestes contre 3 aujourd'hui et chez les quatre références ; ouvre sur 0:00 ; « Annuler » devient ambigu. |
| Paver jusqu'à `startTime + duration` pour un fond | Zéro tuile : régression du bug utilisateur du 2026-07-17. |
| Plafonner le total de frames à `excerptDuration × sampleRate` | `excerptDuration ≤ duration` : la boucle ne jouerait jamais. |
| Compteur de tours fractionnaire | Aucune référence ne l'affiche ; et `%lld` du précédent de pluriel ne peut pas l'héberger. |
| « Cesser d'écrire `duration` dans `addBorrowedSound` » | Cassait `effectiveClipDuration`, l'extension de slide et la période de boucle du fond. |
| Invoquer « no redundant boolean + timestamp » contre `sourceEnd` | La règle vise les paires booléen+horodatage, et le dépôt ships `SoundUsage.startMs`/`endMs`. |
| « Rien à faire côté serveur » | `captureTracks.ts` écrit des coordonnées de timeline, et `Sound.waveform` n'a aucun écrivain. |
| `Sound.bpm` seul | Sans `beatOffsetMs` (phase du premier temps) aucune aimantation n'est possible, et déclarer un champ nullable n'évite aucune passe rétroactive — seule l'analyse **à la capture** l'évite. Hors lot (§ 14.2). |

## 14. Décisions

**14.1 — Fenêtre par variante de langue : DEDANS.** Retenu au § 4.3. Les *champs*
sont irrattrapables (migration de blobs publiés, sur un déploiement dont
l'entrypoint ne lance aucune migration) ; la *résolution* fine reste rattrapable.
Argument supplémentaire : `Sound.translations Json?` existe déjà en base
(`schema.prisma:3057-3058`) sans être décodé par `APISound`
(`SoundModels.swift:58-63`) — le jour où il est exposé, un son emprunté a des
variantes de durées différentes.

**14.2 — Aimantation au tempo : HORS LOT.** Si elle est reprise plus tard, poser
`bpm Int?` **et** `beatOffsetMs Int?` ensemble, et surtout analyser **à la
capture**, au même endroit que le waveform (§ 9.3) — c'est cela, et non la
déclaration du champ, qui empêche la dette de grossir.

**14.3 — Bug du § 2.8 : LOT SÉPARÉ.** Aucun lot n'en dépend fonctionnellement,
mais la fixture du test 9 doit épingler `slideDuration`, et le correctif touche
`TimelineViewModel.swift:127` et `StoryModels.swift:2765` — que le § 5.2 touche
aussi. **Pas de worktree parallèle** entre ce lot et les lots E et I.

## 15. Découpage en lots

Critère : à la fin de chaque lot, les suites concernées passent **et** le produit
n'est dans aucun état pire qu'avant.

| Lot | Contenu | Vert parce que |
|---|---|---|
| **A — Serveur** (§ 9.1–9.4) | coordonnées de source, `windowAdjustedAt`, écrivains de `waveform`, bornes Zod ×2 | Fonctions pures testées en jest. Pour les clients actuels, le nouveau calcul est *exactement* correct — le lot corrige la production avant que le client existe. |
| **B — Miroir web** (§ 2.12, § 10) | `parseAudioObjects`, `computeStoryDurationMs` | Déjà rouge sans ce lot ; zéro couplage iOS. |
| **K — Mute du fond** (§ 8.4) | bouton + binding optionnel unique | Aucune interaction avec la fenêtre de source. Ouvre la série et valide le pipeline de PR. |
| **C — Résolveur** (§ 5) | `SourceWindowResolver` dans `MeeshySDK`, sans appelant | Tests purs ; aucun site de production touché. |
| **D — Modèle** (§ 4) | trois types, `CodingKeys`, inits, écrivains d'`intrinsicDuration`, `resolvedSource`, Android | Champs écrits, personne ne les lit ⟹ comportement identique. |
| **E — Édition** (§ 4.5, § 5.3 *audio seul*, § 8.3) | ripple, `TrimClipCommand`, `SetClipPropertyCommand`, plafond conditionnel audio, tolérance de pile | Le modèle enregistre, les moteurs ignorent encore ⟹ lecture identique. |
| **F — Moteurs audio** (§ 6.1) | `ReaderAudioMixer` ×6, `AudioMixer` ; ferme § 2.4 et § 2.5 | Sur une story legacy, `sourceStart = 0` ⟹ identique. |
| **G — Moteurs vidéo** (§ 6.2) + levée du plafond vidéo | 9 sites, **dont le câblage `media.loop`** | Le câblage et la levée **doivent être dans ce même lot** (§ 5.3). |
| **H — Export et découpe** (§ 6.3, § 6.4) | `insertTimeRange`, boucle non réservée au fond, `SplitClipCommand` | Le test 9 (parité) va ici. |
| **I — Timeline UI + localisation** (§ 7, § 11) | overlay borné par `tilingEnd`, badge entier accessible, clés ×7 | La localisation est **inséparable** : le cliquet fait rougir toute clé sans ses 7 traductions. |
| **J — Feuille « Zone »** (§ 8.1, § 8.2, § 6.5) | feuille SDK, `SoundPreviewPlayer` étendu, retrait de `.trim`, clé de cache, décalage waveform | Dernier lot : tout ce qu'elle pilote existe déjà. |

**Ordre non négociable** : A, B, K en parallèle → C → D → E → (F ∥ G) → H → I → J.
Le lot du § 14.3 reste hors série et ne se parallélise ni avec E ni avec I.
