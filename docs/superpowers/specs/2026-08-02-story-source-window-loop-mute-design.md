# Fenêtre de source, boucle et mute des pistes de story

Date : 2026-08-02
Statut : design corrigé après trois revues Opus, à valider avant plan
Portée : `packages/MeeshySDK` (SDK + UI), `services/gateway`, miroirs `apps/android`, `apps/web`

> **Révision 2.** La révision 1 a été soumise à trois revues Opus sur des angles
> disjoints (architecture/modèle, interfaces/contrats, doctrines/SOTA). Verdict
> unanime : non implémentable. Six défauts bloquants, tous recoupés au code par
> l'orchestrateur avant réécriture. Le § 13 en tient le journal — il est là pour
> que la prochaine session ne réintroduise pas ce qui a été écarté.

## 1. Ce qu'on veut obtenir

1. **Choisir la zone d'un son** — n'utiliser qu'un extrait d'un fichier (le
   refrain, pas l'intro), vite et clairement.
2. **Boucler l'extrait sur la durée de la timeline**, avec le **nombre de tours
   annoncé**.
3. **Couper le son d'une vidéo d'un geste**, et qu'une piste coupée ne joue
   nulle part : canvas d'édition, aperçu, lecteur, export.

Une seule cause commune : **aucune piste ne sait où entrer dans sa source, ni
quelle est la longueur de cette source.**

## 2. État des lieux vérifié

Chaque affirmation est recoupée au code. Les citations ont été re-vérifiées une à
une après revue ; celles de la révision 1 qui étaient fausses sont corrigées ici
et listées au § 13.

### 2.1 La vidéo est rognée d'un seul côté — et c'est le mauvais

Le plafond de durée existe : `nativeDurationLimit` lit `intrinsicDuration` et
interdit d'étirer un clip au-delà de sa source
(`TimelineViewModel+Plan4Helpers.swift:55`). Mais **quatre** consommateurs
entrent dans la source à `t = 0` :

| Consommateur | Site | Comportement |
|---|---|---|
| Canvas, lecture | `StoryMediaLayer.swift:736` | `target = slidePlayheadSeconds − startTime` |
| Canvas, scrub | `StoryMediaLayer.swift:727` | idem, chemin de l'aperçu timeline |
| Canvas, édition | `StoryMediaLayer.swift:641` | `player.seek(to: .zero)` |
| Aperçu timeline | `StoryTimelineEngine.swift:225` | `insertTimeRange(CMTimeRange(start: .zero, …), at: start)` |

Et un cinquième, **le seul chemin d'export d'une vidéo d'avant-plan** :
`StoryForegroundVideoFrameSource.frame(for:at:)` calcule
`clipTime = slideSeconds − start` (`StoryForegroundVideoFrameSource.swift:62`) et
le compositeur peint ces images. `StoryExporter` ne compose de piste vidéo que
pour le **fond** (`StoryExporter.swift:174-175`, branches `:205` bouclée et
`:221` non bouclée).

Conséquence mécanique : tirer la poignée **gauche** applique
`ClipWindowResolver.Edit.setStart` — la fin reste fixe, la durée rétrécit — et le
moteur joue `source[0 … durée réduite]`. **L'auteur tire le bord gauche et perd
la fin de sa vidéo.**

### 2.2 L'audio n'a aucune mémoire de la longueur de sa source

`nativeDurationLimit` ne lit que `project.mediaObjects`
(`TimelineViewModel+Plan4Helpers.swift:56`) et son commentaire le dit : « `nil`
[…] pour l'audio, qui ne porte pas ce champ ». C'est **cette échappatoire qui
rend la boucle authorable aujourd'hui** — point capital pour le § 5.3.

`addBorrowedSound` écrit la longueur du son dans `duration`
(`StoryComposerViewModel+Elements.swift:458`), c'est-à-dire dans la fenêtre
timeline. Au premier étirement, la longueur de la source est perdue.

### 2.3 Le compteur de tours n'est pas calculable

`LoopRepeatOverlay` déclare `nativeDuration`, alimenté par
`TimelineGeometry.effectiveClipDuration` — la fenêtre timeline
(`StoryTimelineView.swift:712` audio, `:638` vidéo), qui retourne `duration` dès
qu'elle est posée (`TimelineGeometry.swift:69`). Le nom ment. Dès qu'une piste
est étirée pour boucler, `repeatStartTimes` retourne `[]` : l'interface affirme
« aucune boucle » pendant que le lecteur boucle.

### 2.4 Le lecteur ne s'arrête jamais à la fin de sa fenêtre

`ReaderAudioMixer.scheduleEntry` (`:403`) et `rescheduleLoopedEntry` (`:414`)
appellent `scheduleFile` : fichier entier, depuis 0. `entry.duration` ne sert
qu'à ancrer un fondu (`:434`, `:693`).

### 2.5 L'aperçu timeline ne boucle pas

`AudioMixer.scheduleNodeFromTimelineTime` : `completionHandler: nil` sur les deux
branches (`AudioMixer.swift:124-154`). Le lecteur boucle, l'export boucle,
l'aperçu non.

### 2.6 L'export réserve la boucle au fond

`StoryExporter` ne boucle que si `isBackground == true && loop == true`
(`:1033`), dans `composeAudioLanes` (`:1006`). Une piste d'avant-plan `loop` ne
boucle pas dans le MP4.

### 2.7 La vidéo de fond n'a pas de bouton de coupure

`foregroundVideoBindings` filtre `obj.isBackground == false`
(`StoryComposerView+Canvas.swift:1256`), alors que le volume du fond est bien lu
au rendu (`StoryCanvasUIView+Rendering.swift:196`).

### 2.8 Ouvrir la timeline détruit la durée épinglée par l'auteur

Bug préexistant, sans rapport avec l'audio, mais qui touche la grandeur servant
de dénominateur au compteur de tours. Scénario reproduit :

1. L'auteur rogne sa slide à 20 s sur 30 s de contenu →
   `effects.timelineDuration = 20` (`StoryComposerViewModel+Slides.swift:42`), et
   le lecteur rogne bien (`StoryModels.swift:1376`).
2. Il rouvre la timeline. `TimelineProject(from:)` part du calculé, donc 20 s
   (`StoryModels.swift:2722`).
3. Premier `recomputeSlideDuration()` : `derived = 30` ; `authoredDuration(in:)`
   retourne `nil` car elle ne reconnaît qu'un pin **au-dessus** du contenu
   (`TimelineViewModel.swift:127`) ⟹ `auto = 30`, la timeline saute à 30 s.
4. Au commit, `apply(to:)` repose `timelineDuration = nil` car
   `|30 − 30| < 0.05` (`StoryModels.swift:2765`).

**Le réglage de l'auteur est effacé par la simple ouverture de l'écran.**

### 2.9 La fenêtre de source existe déjà côté serveur, remplie avec la mauvaise valeur

`SoundUsage.startMs` / `endMs` (`packages/shared/prisma/schema.prisma:3081-3082`)
sont censés dire **quelle part du son a été utilisée**. `extractCaptureTracks` les
dérive de la fenêtre **timeline** (`services/gateway/src/services/posts/captureTracks.ts:25-28`) :

```ts
startMs: Math.round(o['startTime'] * 1000),
endMs:   Math.round((o['startTime'] + o['duration']) * 1000),
```

Chaque story publiée écrit donc une ligne d'attribution fausse. C'est la cause
racine du § 3, déjà commise en production.

### 2.10 Le miroir web est déjà cassé, indépendamment de ce lot

`parseAudioObjects` (`apps/web/lib/story-transforms.ts:131-149`) ne lit **ni**
`startTime`, **ni** `duration`, **ni** `loop`. Et `computeStoryDurationMs`
(`:264-267`) prend `max(m.duration)` des médias d'avant-plan **sans** `startTime`
et ignore les fenêtres audio, là où iOS mesure `startTime + duration` sur les
deux (`StoryModels.swift:1323-1327`).

## 3. Principe directeur

> Une piste a **deux** fenêtres : *où elle vit sur la timeline*, et *où elle entre
> dans son fichier*. Un seul champ nouveau par type, **un seul propriétaire par
> champ**.

| Champ | Signification | Propriétaire du clamp |
|---|---|---|
| `startTime` | quand la piste démarre sur la timeline | `ClipWindowResolver` |
| `duration` | combien de temps la piste occupe la timeline | `ClipWindowResolver` |
| `sourceStart` | où l'on entre dans le fichier | `SourceWindowResolver` |
| `intrinsicDuration` | longueur totale du fichier (donnée, non éditable) | — |

**`SourceWindowResolver` ne possède pas `duration`.** C'est la correction la plus
importante de cette révision : la révision 1 lui faisait porter une `Window`
contenant `duration`, avec un plancher de 0,3 s là où `ClipWindowResolver` en
applique un de 0,05 s (`ClipWindowResolver.swift:46`) — deux résolveurs, un
champ, deux règles. Exactement le défaut que `ClipWindowResolver` documente avoir
fermé (`:5-13`), réintroduit par la signature censée l'éviter.

`duration` entre donc en **paramètre** partout où le calcul en a besoin.

### 3.1 Pas de champ `sourceEnd`

La longueur jouée se déduit ; un champ de plus créerait une troisième durée et
la question « que faire quand elles divergent ». Règle unique :

> **`excerptDuration = min(duration, intrinsicDuration − sourceStart)`**

- Fenêtre plus courte que ce qui reste de source → l'extrait est tronqué, pas de
  boucle.
- Fenêtre plus longue → l'extrait se répète si `loop`, laisse du silence sinon
  (pour l'image : dernière frame figée, cf. § 5.3).
- `intrinsicDuration` inconnue ⟹ `excerptDuration = duration`, `loopCount = 1`,
  aucun clamp. Une story antérieure se comporte comme avant.

*(La révision 1 invoquait ici la règle « no redundant boolean + timestamp » du
CLAUDE.md racine. Cet appel était abusif — la règle vise les paires
booléen+horodatage — et le dépôt ships déjà une paire début/fin pour ce concept
même : `SoundUsage.startMs`/`endMs`. L'argument est retiré ; la règle ci-dessus
se suffit.)*

## 4. Modèle de données

### 4.1 `StoryAudioPlayerObject` — deux champs, deux sites

```swift
public var sourceStart: Float?          // nil ≡ 0
public var intrinsicDuration: Float?    // longueur totale du fichier
```

Ce type a une conformance `Codable` **synthétisée**, pilotée par un `CodingKeys`
explicite (`StoryModels.swift:935-947`) — il n'a **ni** `init(from:)` **ni**
`encode(to:)` custom. Deux sites à toucher :

1. `CodingKeys` (`:935-947`) — son propre commentaire avertit qu'un `case`
   oublié fait disparaître le champ à la publication sans avertissement.
2. **L'init public mémberwise** (`:949-976`) — il n'est **pas** exhaustif, il
   omet déjà `mutedVolumeMemento`. Sans ces deux paramètres, aucun des chemins
   d'ajout ne peut poser les champs à la construction.

### 4.2 `StoryMediaObject` — un champ, cinq sites

```swift
public var sourceStart: Double?         // nil ≡ 0
```

C'est **ce** type qui porte un `Codable` manuel. Cinq sites : `CodingKeys`
(`:684-692`), init mémberwise (`:694-738`), `init(from:)` (`:741-782`),
`encode(to:)` (`:784-812`), et l'init de convenance `kind:` (`:823-867`).
`intrinsicDuration` existe déjà (`:632`).

*(La révision 1 avait interverti les deux types.)*

### 4.3 Écrivains d'`intrinsicDuration` sur l'audio

Le champ n'existe que s'il est écrit. Aujourd'hui l'unique écrivain est
médias-seulement (`StoryComposerViewModel+Elements.swift:382-383`). Trois
chemins créent des pistes audio et doivent le renseigner :

- `addBorrowedSound` → `sound.durationSeconds` (`Elements.swift:450`) — **et
  cesser d'écrire cette valeur dans `duration`**, ce qui ferme le § 2.2 ;
- `addAudioObject` / import de fichier / vocal → mesuré à l'import ;
- `AddClipCommand.apply` (`StoryModels.swift:2877`) → propagé par l'appelant.

Le fond synthétisé depuis les champs legacy (`StoryModels.swift:1844`) reste sans
`intrinsicDuration` : c'est un cas « source inconnue » assumé, qui dégrade
proprement (§ 3.1).

### 4.4 Commande d'annulation — deux chemins, pas deux commandes par geste

La révision 1 proposait un cas `SetClipPropertyCommand.sourceWindow` portant un
type défini dans `MeeshyUI`. Impossible : `MeeshyUI` dépend de `MeeshySDK`,
jamais l'inverse (`Package.swift:54-56`). Et l'empiler par frame pendant un
glissement aurait détruit la coalescence — le jeu coalesçable est explicitement
`MoveClip` / `TrimClip` / `MoveKeyframe`, précisément parce qu'ils sont émis à
~60 fps et satureraient la pile de 50 en moins d'une seconde
(`CommandStack.swift:113-117`, `:58`). Une commande non coalesçable intercalée
par tick évince l'état d'avant-geste et rend « Annuler » inopérant.

Décision, deux chemins distincts :

**Geste continu (poignée).** `TrimClipCommand` reçoit
`oldSourceStart` / `newSourceStart: Float?` (`StoryModels.swift:3041-3067`), son
`mutate` les applique (`:3077-3104`), son `revert` les restaure, et la règle de
fusion les propage (`CommandStack.swift:142-151`, patron `p.old* + n.new*`).
Décodage en `decodeIfPresent` : la pile est persistée et relue
(`StoryComposerViewModel+Timeline.swift:89`), une pile antérieure doit continuer
à se décoder.

**Affordance discrète (feuille, champs de la fiche).** Un cas
`SetClipPropertyCommand.ClipProperty.sourceStart(old: Float?, new: Float?)`.
Une paire de `Float?` **entre dans les `CodingKeys` existantes** `oldFloat` /
`newFloat` (`StoryModels.swift:3629-3632`) : seul le `Tag` (`:3634-3637`) reçoit
un cas, plus une branche dans `init(from:)`, `encode(to:)` et les **trois**
`apply(property:to:)` (`:3773` média, `:3805` audio, `:3837` texte). Zéro type
nouveau, zéro clé nouvelle.

`applySetClipProperty` (`Plan4Helpers.swift:415-423`) n'a **pas** de garde de
no-op — chaque setter porte le sien (`:409`). Le nouveau devra poser le sien.

## 5. `SourceWindowResolver`

Pur, sans état, `nonisolated enum`, dans `MeeshyUI/Story/Timeline/Logic/`, à côté
de `ClipWindowResolver`. Agnostique du type de média : il prend des nombres.

```swift
public nonisolated enum SourceWindowResolver {

    /// Plancher d'un EXTRAIT audible. Ne s'applique jamais à `duration`, qui
    /// reste au plancher de `ClipWindowResolver` (0,05 s).
    public static let minimumExcerpt: Float = 0.3

    /// Clampe l'entrée dans la source. Retourne le `sourceStart` résolu.
    /// `sourceDuration == nil` ⟹ seul `≥ 0` est appliqué.
    public static func resolveSourceStart(_ proposed: Float,
                                          sourceDuration: Float?) -> Float

    /// `min(duration, sourceDuration − sourceStart)`, ou `duration` si la
    /// source est inconnue.
    public static func excerptDuration(sourceStart: Float,
                                       duration: Float,
                                       sourceDuration: Float?) -> Float

    /// `duration / excerptDuration`, borné à `1` par le bas — une fenêtre plus
    /// courte que l'extrait ne « boucle » pas 0,6 fois.
    public static func loopCount(sourceStart: Float,
                                 duration: Float,
                                 sourceDuration: Float?) -> Float
}
```

`Edit.fill(reference:)` de la révision 1 est **supprimé** : affordance jamais
spécifiée ailleurs, et sur un fond décalé elle faisait diverger la durée de slide
(`recomputeSlideDuration` arrondit à un multiple entier de la période, donc
`S → 2S − 6` à chaque appui).

**Invariants** (chacun devient un test) :

- `sourceStart ∈ [0, sourceDuration − minimumExcerpt]` si la source est connue ;
  `≥ 0` sinon.
- `sourceDuration == nil` ⟹ `excerptDuration == duration` et `loopCount == 1`.
- `duration < excerptDuration` ⟹ `loopCount == 1`.
- Entrées non finies ⟹ valeur d'entrée rendue inchangée (garde de
  `ClipWindowResolver.resolve`).

### 5.1 Le dénominateur du compteur est `duration`, pas la slide

Trois candidats existaient dans la révision 1 (la fenêtre, une référence en
paramètre, `slideDuration` via le code de l'overlay). Un seul est cohérent avec
un résolveur pur : **`duration`, la fenêtre du clip**. Le nombre de tours répond
à « combien de fois l'extrait rentre dans la piste », pas dans la slide.

Conséquence obligatoire au § 7.2 : `LoopRepeatOverlay` doit paver jusqu'à
`clipStartTime + duration`, pas jusqu'à `slideDuration`.

### 5.2 Ce que devient la durée de référence de la slide

`contentDerivedDuration` prend comme **période de boucle** du fond son `duration`
(`StoryModels.swift:1305-1310`, `:1329-1334`) pour finir la slide sur une
répétition complète. Avec une fenêtre de source, la vraie période est
`excerptDuration`. La fonction reçoit donc la période corrigée — sinon la
dernière répétition est coupée, ce qui contredit sa propre doctrine. Miroir web
identique (`apps/web/lib/story-transforms.ts:233-235`, `:255-260`).

### 5.3 Le plafond `nativeDurationLimit` devient conditionnel

`applyWindow` rabote toute fenêtre au-delà de la durée native
(`Plan4Helpers.swift:70-72`). Étendre ce plafond à l'audio — geste naturel une
fois `intrinsicDuration` posée — rendrait `duration > excerptDuration`
**impossible**, donc la boucle inauthorable : le lot s'annulerait lui-même. Et le
laisser tel quel pour la vidéo interdit d'étirer une vidéo d'avant-plan bouclée,
alors que le § 7.2 lui promet une affordance de boucle.

Règle retenue, valable pour les deux types :

```
limite = loop ? (aucune) : (intrinsicDuration − sourceStart)
```

Le `− sourceStart` est le second correctif : sans lui, la fin d'un clip non
bouclé entré à `sourceStart > 0` est une image figée.

## 6. Les moteurs apprennent la fenêtre de source

Inventaire **complet** — la révision 1 en oubliait cinq, dont le seul chemin
d'export des vidéos d'avant-plan.

### 6.1 Audio

| Site | Après |
|---|---|
| `ReaderAudioMixer.scheduleEntry` (`:403`) | `scheduleSegment(startingFrame:frameCount:)` sur l'extrait |
| `ReaderAudioMixer.rescheduleLoopedEntry` (`:414`) | ré-arme **le même** extrait |
| `ReaderAudioMixer.scheduleBackgroundFile` | idem |
| `ReaderAudioMixer.configure` — durée par défaut (`:144`) | défaut = `longueur du fichier − sourceStart`, sinon la fenêtre déborde de `sourceStart` au-delà de la fin |
| `AudioMixer.scheduleNodeFromTimelineTime` (`:124-154`) | extrait dans les deux branches ; ré-armement par `completionHandler` (parité avec le lecteur) |

Conversion secondes → frames dans **une** fonction utilitaire :
`frame = round(seconds × processingFormat.sampleRate)`, bornée à `file.length`.
Une frame de départ au-delà de la fin ne planifie rien plutôt que de lever
(`scheduleSegment` piège sur `frameCount == 0`).

Le lecteur **s'arrête à la fin de sa fenêtre** : total de frames plafonné à
`excerptDuration × sampleRate`. Ferme le § 2.4 sans timer.

### 6.2 Vidéo

| Site | Après |
|---|---|
| `StoryMediaLayer.alignToTimelineThenPlay` (`:736`) | `target = sourceStart + (playhead − startTime)` |
| `StoryMediaLayer.alignPausedToSlidePlayhead` (`:727`) | idem — chemin du **scrub** |
| `StoryMediaLayer` seek `.edit` (`:641`) | `seek(to: sourceStart)` — le canvas d'édition doit montrer l'extrait |
| `StoryMediaLayer` boucle (`:653-660`) | rejoue depuis `sourceStart`. **Note** : `attachPlayer(url:mode:loop:)` reçoit `loop: mode != .play` (`:498, 526, 543`) — la boucle d'avant-plan n'existe qu'en `.edit` et n'est jamais pilotée par `media.loop`. Le câbler est dans le lot, sans quoi le § 7.2 annoncerait des tours pour une piste qui ne boucle nulle part ailleurs. |
| `StoryBackgroundLayer` — looper (`:800`) | `AVPlayerLooper(player:templateItem:timeRange:)` |
| `StoryBackgroundLayer` — observateur de fin (`:892-899`) | `seek(to: sourceStart)`. Armé dans la **même** branche que le looper : le corriger seul laisse le fond rembobiner à 0 à chaque fin d'item |
| `StoryTimelineEngine` (`:225`) | `insertTimeRange(start: sourceStart, …)` |
| **`StoryForegroundVideoFrameSource.frame(for:at:)`** (`:62`) | `clipTime = sourceStart + (slideSeconds − start)`, modulo `excerptDuration` si `loop`. **Seul chemin d'export d'une vidéo d'avant-plan** |

### 6.3 Export

`StoryExporter` : `insertTimeRange` part de `sourceStart` pour la vidéo de fond
(`:205` bouclée, `:221` non bouclée), la piste audio du fond
(`composeBackgroundVideoAudio`, `:852`, `:864`) et les pistes audio
(`composeAudioLanes`, `:1052`, `:1062`). La boucle cesse d'être réservée au fond :
la condition devient `loop == true` seul (`:1033`), ce qui ferme le § 2.6. La
période de boucle devient `excerptDuration` et non `assetDuration` (`:1051`).

### 6.4 Découpe

`SplitClipCommand.apply` copie l'objet entier (`StoryModels.swift:3145-3148`,
`:3157-3160`) : sans correction, les deux moitiés rejouent le **même** extrait.
`right.sourceStart = sourceStart + splitAtRelativeTime`, pour les médias comme
pour l'audio.

### 6.5 Vignettes et forme d'onde

- `VideoFilmstrip.frames` reçoit un `range` — **et le range entre dans la clé de
  cache** (`VideoFilmstrip.swift:12-13`), sans quoi la bande sert les vignettes
  de l'ancienne fenêtre et l'auteur règle à l'aveugle.
- `WaveformStrip` / `AudioClipBar` décalent leur lecture des échantillons de
  `sourceStart`.

## 7. Boucle et compteur de tours

### 7.1 `LoopRepeatOverlay` reçoit la bonne valeur ET la bonne borne

Deux changements, pas un :

1. `nativeDuration` → `excerptDuration` (`SourceWindowResolver.excerptDuration`),
   aux deux sites (`StoryTimelineView.swift:702` vidéo, `:769` audio).
2. Le pavage s'arrête à `clipStartTime + duration` et non à `slideDuration`
   (`LoopRepeatOverlay.swift:43-51`) — l'overlay reçoit donc `duration`, qu'il
   n'a pas aujourd'hui (signature `:11-17`). Sans ce second point, un clip
   d'avant-plan bouclé sur `[0, 4]` d'une slide de 20 s dessinerait des tuiles
   jusqu'à 20 s, et un extrait au plancher sur une slide de 60 s en produirait
   ~199.

Condition d'affichage : `loop == true` seul, en cohérence avec § 6.3. Côté vidéo
la garde actuelle est `isImmovableBackground, media.loop == true` où
`isImmovableBackground = isSynthetic || media.isBackground == true`
(`StoryTimelineView.swift:630, 700`) — c'est cette expression-là qui est relâchée.

Performance : `LoopRepeatOverlay` devient `Equatable` et le badge est une
sous-vue à entrées primitives, sinon le `ForEach` reconstruit tout le tableau de
tuiles à chaque frame de glissement (`CLAUDE.md` — Zero Unnecessary Re-render).

### 7.2 L'annonce du nombre de tours

Source unique : `SourceWindowResolver.loopCount`. Deux surfaces : la ligne de la
feuille, et un badge sur la piste.

`LoopRepeatOverlay` se termine par `.accessibilityHidden(true)` (vue décorative) :
le badge **ne peut pas** y vivre pour VoiceOver. Il est posé comme élément frère,
avec son propre libellé accessible sur la barre du clip.

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
│  Slide 8,0 s · extrait 5,3 s  │
│  ↺ 1,5 tour                   │
│                               │
│  [ Annuler ]       [ Poser ]  │
└───────────────────────────────┘
```

Forme d'onde défilant sous une fenêtre fixe ; l'extrait joue en boucle pendant le
défilement. Composants existants : `AudioWaveform`, `WaveformStrip`,
`SoundPreviewPlayer`. Pendant l'extraction de la forme d'onde ou des vignettes :
squelette, jamais de spinner sur cache chaud (doctrine Instant App).

Pour une **vidéo**, même feuille avec une bande de vignettes.

**Ouverture.** Depuis la fiche de la timeline et depuis la chip du canvas, pour
toute piste. Et **automatiquement au moment du choix** pour un **son emprunté**
(`soundId != nil`) — le seul cas où l'auteur choisit un fichier qu'il n'a pas
enregistré lui-même, donc le seul où la zone est le geste attendu. Les chemins
vocal et import de fichier gardent leur éditeur destructif existant
(`MeeshyAudioEditorView`) : y empiler une seconde édition de zone donnerait deux
éditeurs pour un même besoin.

*(La révision 1 promettait l'ouverture automatique sur les quatre chemins, ce qui
créait ce doublon sur le vocal.)*

### 8.2 Placement SDK / app

La feuille prend des paramètres opaques (URL locale, longueur de source, fenêtre,
durée de référence) et rend une fenêtre : aucun singleton nommé Meeshy, aucune
résolution d'URL, aucune règle « quand faire X ». Elle passe le test du grain
(`packages/MeeshySDK/CLAUDE.md:34-39`) → SDK.

**La décision d'ouverture** (§ 8.1 : « automatiquement pour un son emprunté »)
est une règle produit. Elle vit dans le composer, aux côtés des autres décisions
de présentation. Ce composer est aujourd'hui dans `MeeshyUI/Story/`, en écart
avec la ligne « ViewModels → APP » du `packages/MeeshySDK/CLAUDE.md:31`. **Ce lot
ne déplace pas le composer**, mais inscrit l'exception dans
`packages/MeeshySDK/decisions.md` — sinon la prochaine session rejouera
l'arbitrage à partir de zéro, comme celle-ci l'a fait.

### 8.3 Les poignées — la poignée gauche cesse de mentir

Sémantique universelle des montages non linéaires (Premiere, Final Cut, Resolve,
CapCut) :

| Geste | Effet |
|---|---|
| Poignée **droite** — *trim out* | `duration` change. `sourceStart` inchangé. |
| Poignée **gauche** — *ripple trim in* | `startTime += δ`, `duration −= δ`, **et `sourceStart += δ`**. |

Ce que le doigt retire du bord gauche, il le retire du début du fichier.

Implémentation dans `applyWindow` (`Plan4Helpers.swift:59`), qui est le point de
passage unique du **trim** — pas du déplacement, qui passe par `dragClipMoved` →
`applyClipPosition` (`TimelineViewModel.swift:312-338`, `:437-457`) et n'a pas à
toucher `sourceStart`. L'aimantation ne concerne que le déplacement
(`SnapEngine` appelé en `:323-327`), donc rien à traiter côté trim.

**Ordre de résolution, et il n'est pas commutatif** : `ClipWindowResolver`
résout d'abord la fenêtre timeline ; le δ **effectivement retenu**
(`résolu.start − courant.start`) est ensuite proposé à
`SourceWindowResolver.resolveSourceStart`. Si ce dernier clampe (on ne peut pas
entrer plus loin que `sourceDuration − minimumExcerpt`), **c'est le clamp de
source qui gagne** et la fenêtre timeline est recalculée à partir du δ réellement
appliqué. Un seul `TrimClipCommand` est empilé, portant les quatre valeurs
cohérentes.

Exemple chiffré, à reprendre tel quel en test : source 5 s, fenêtre `[0, 5]`,
l'auteur tire la poignée gauche de +4,9 s. `ClipWindowResolver` rendrait
`start = 4.95, duration = 0.05` (légal pour lui). `resolveSourceStart(4.9, 5)`
rend `4.7` (plancher d'extrait 0,3 s). δ retenu = 4,7 ⟹ fenêtre finale
`start = 4.7, duration = 0.3, sourceStart = 4.7`.

**Piste bouclée** : quand `duration > excerptDuration`, la poignée droite allonge
la répétition, pas l'extrait. Le badge de tours suit pendant le glissement.

### 8.4 Le mute

Acquis, vérifié : `volume == 0` est l'état muet persistant, avec
`mutedVolumeMemento` pour restaurer le niveau de l'auteur (`StoryVolumeCarrying`,
`StoryModels.swift:1008`) ; honoré par canvas, aperçu, lecteur et export ; bouton
un-tap sur les vidéos d'avant-plan et les chips audio.

**Une seule correction : la vidéo de fond reçoit le même bouton.** Même icône,
même geste, en coin haut-droit du canvas. Le binding est un `Binding` **optionnel
unique** (`first(where: { $0.isBackground && $0.kind == .video })`), pas un
tableau filtré : le modèle ne contraint pas l'unicité du fond, et un tableau
rendrait deux boutons superposés.

**Ce que la révision 1 proposait et qui est retiré** : « ne plus planifier une
piste à `volume == 0` ». Trois raisons, chacune décisive.

1. Le volume effectif n'est pas `audio.volume` mais
   `StoryVolumeResolver.effectiveVolume(base:keyframes:at:)`, où **les keyframes
   l'emportent sur la base** (`StoryVolumeResolver.swift:53-70`). Une piste à
   base 0 avec un keyframe montant est un fondu d'entrée banal ; la sauter la
   rendrait muette à vie.
2. `setVolume(_:for:)` est un no-op sans entrée (`ReaderAudioMixer.swift:244`) et
   `reconfigureAudioForPlayback` est gaté sur la **composition**
   (`StoryCanvasUIView+Audio.swift:179`) : un changement de volume seul ne le
   franchit pas. Un unmute ne rendrait donc plus jamais le son.
3. Un test vert existant l'assert : `test_editRebuild_afterUnmute_restoresLiveMixerEntry`
   (`CanvasEditMuteLivePropagationTests.swift:83-98`) configure une piste **déjà
   mutée**, attend `intendedVolume == 0`, puis `0.6` après unmute. Les deux
   assertions tomberaient.

La garantie « aucune fuite sonore » est déjà tenue par `effectiveVolume`
(`ReaderAudioMixer.swift:302-304`), qui n'a aucun chemin de contournement.
L'économie annoncée (un `AVAudioFile` + un nœud) ne couvrait de toute façon pas
l'octet téléchargé, le pré-cache ayant lieu avant `configure`
(`StoryCanvasUIView+Audio.swift:215-250`).

## 9. Serveur

### 9.1 La sémantique de `SoundUsage.startMs` / `endMs` est tranchée

Ces champs disent **quelle part du son a été utilisée**, en coordonnées de
**source**. `extractCaptureTracks` (`captureTracks.ts:25-28`) devient :

```
startMs = round(sourceStart × 1000)
endMs   = round((sourceStart + excerptDuration) × 1000)
```

Les lignes déjà écrites portent des coordonnées de timeline et sont
inexploitables ; on ne les migre pas (aucune fonctionnalité ne les lit
aujourd'hui), mais on cesse d'en produire de fausses. C'est ce qui rendra
possible, plus tard, le hook par défaut d'un son emprunté — la fonctionnalité que
TikTok et Instagram bâtissent sur cet agrégat.

### 9.2 Validation d'entrée

La preuve de la révision 1 (« `services/gateway/src/schemas` ne mentionne rien »)
portait sur un répertoire **inexistant**. La vraie porte est
`StoryAudioObjectSchema` (`services/gateway/src/routes/posts/types.ts:139-158`) et
`StoryEffectsSchema` (`:166-183`). Les champs passent grâce à `.passthrough()`
(`:158`) — sans lui, Zod les dépouillerait au publish.

Tous les champs numériques frères sont bornés (`startTime`/`duration` :
`min(0).max(86400)`, `:147-148`). Les nouveaux le sont donc aussi :
`sourceStart` et `intrinsicDuration` en `z.number().min(0).max(86400).optional()`.
Le blob est « entièrement contrôlé par le client », c'est le motif que le fichier
applique partout.

## 10. Ports et compatibilité

**Story antérieure** : `sourceStart == nil ≡ 0`, `intrinsicDuration == nil` ⟹
aucun clamp, `excerptDuration == duration`, `loopCount == 1`. Comportement
identique à aujourd'hui — les bugs des § 2.4 à § 2.6 étant, eux, corrigés pour
tous.

**Lecture par une version antérieure** : champs ignorés, entrée à zéro.
Dégradation gracieuse. Côté Android ce n'est vrai que grâce à
`ignoreUnknownKeys = true` (`apps/android/core/network/…/MeeshyApi.kt:57`) —
kotlinx.serialization **lève** sur clé inconnue par défaut. À citer, sinon la
prochaine session qui crée un `Json` local casse le port.

**Pile d'annulation persistée** : `ClipProperty.init(from:)` fait un `decode` strict
du `Tag` (`StoryModels.swift:3641`) et `AnyEditCommand.init(from:)` lève sur tag
inconnu (`:4065-4069`). Une version antérieure lisant une pile contenant
`sourceStart` perdrait **tout** l'historique. Le décodeur devient tolérant : un
tag inconnu fait sauter l'entrée, pas la pile.

**Ports à mettre à jour** :

- Android : `StoryAudioPlayerObject` et `StoryMediaObject`
  (`apps/android/core/model/…/Story.kt:149, 184`).
- Web : `parseAudioObjects` (`apps/web/lib/story-transforms.ts:131-149`) ne lit
  **ni** `startTime`, **ni** `duration`, **ni** `loop`. Ajouter `sourceStart`
  n'a de sens qu'après avoir réparé ça.
- Web : `computeStoryDurationMs` (`:222`) doit redevenir le miroir de
  `computedTotalDuration()` — il ignore `startTime` sur les médias
  d'avant-plan et toutes les fenêtres audio (`:264-267`). Le miroir est **déjà**
  rouge, indépendamment de ce lot.

## 11. Localisation et accessibilité

**Clés.** Toute chaîne de `MeeshyUI` porte `bundle: .module`. Les nouvelles clés
rejoignent le registre explicite de `TimelineLocalizationTests.swift`.

**Pluriel.** « ↺ 1,5 tour » est juste en français (CLDR fr : `one` couvre
`i = 0,1`) et **faux en anglais** (`one` exige `i = 1 && v = 0`, donc 1.5 tombe
en `other` → « 1.5 turns ») et en arabe. Le catalogue porte **7** locales
(`ar, de, en, es, fr, it, pt-BR`) ; l'arabe demande ses six catégories. Précédent
à copier : `story.sound.library.playCount`. Un libellé écrit au singulier fuirait
dans 6 langues sur 7.

**Format numérique.** `String(format: "%.1f")` rend « 1.5 » dans toutes les
locales. Le nombre passe par un `FormatStyle` localisé.

**Accessibilité.** Le badge de tours ne peut pas vivre dans `LoopRepeatOverlay`
(`.accessibilityHidden(true)`) : élément frère avec libellé propre. La feuille
respecte le Dynamic Type et expose son geste de défilement par un contrôle
accessible (le geste seul n'est pas actionnable à VoiceOver).

*(Note annexe hors lot : `LocalizedStringsBacklogTests.swift:28-30` déclare encore
5 locales produit alors que le catalogue en porte 7 — garde périmée.)*

## 12. Tests

TDD strict, RED d'abord, le pur avant le branché.

1. **`SourceWindowResolver`** : chaque invariant du § 5, plus source inconnue,
   entrée au-delà de la fin, extrait sous le plancher, valeurs non finies.
2. **`loopCount`** : 8 s de fenêtre sur 5,3 s d'extrait → 1,5 ; fenêtre plus
   courte que l'extrait → 1 ; source inconnue → 1.
3. **Round-trip `Codable`** : les champs survivent sur les deux types, et une
   charge sans ces clés décode en `nil`. Garde contre le `CodingKeys` explicite
   de l'audio et le `Codable` manuel du média.
4. **Ripple trim in — fonction pure.** Le cas chiffré du § 8.3 (source 5 s,
   δ = 4,9 → `sourceStart = 4.7`, `duration = 0.3`). Sur la décision pure, pas
   sur une frame décodée : ce dépôt sait qu'une comparaison d'image est flaky.
5. **Annulation** : après un ripple trim, `undo` restaure `startTime`, `duration`
   **et** `sourceStart`. Et une pile de N frames de glissement fusionne en **une**
   entrée (garde de coalescence, `CommandStack`).
6. **Un test par moteur** : frame de départ planifiée pour les deux mixers ;
   `CMTimeRange` partant de `sourceStart` pour `StoryTimelineEngine` et
   `StoryExporter` ; cible de seek incluant `sourceStart` pour les trois chemins
   de `StoryMediaLayer` ; `clipTime` pour `StoryForegroundVideoFrameSource`.
7. **Découpe** : `SplitClipCommand` sur un clip entré à `sourceStart = 2`
   produit deux moitiés d'extraits **différents**.
8. **`LoopRepeatOverlay`** : une piste étirée de 4× produit 3 tuiles, et
   **aucune** au-delà de `clipStartTime + duration`.
9. **Garde de parité** : à modèle égal, extrait et nombre de tours identiques au
   canvas, à l'aperçu, au lecteur et à l'export. C'est le test qui empêche les
   moteurs de re-diverger.
10. **Mute** : le bouton de la vidéo de fond écrit `volume == 0` et le rend au
    niveau mémorisé ; les tests existants de `CanvasEditMuteLivePropagationTests`
    restent verts (ils sont la garde contre le retour de l'optimisation écartée
    au § 8.4).
11. **Clé de cache du filmstrip** : deux `range` différents sur la même URL
    rendent des vignettes différentes.
12. **Localisation** : la clé du compteur existe dans les 7 locales avec ses
    catégories de pluriel.

**Piège de chemin** : le nombre de `deletingLastPathComponent` d'une garde de
source dépend de la **profondeur du fichier de test**, pas du dépôt. Quatre
depuis `Tests/MeeshyUITests/Story/`, davantage depuis
`Tests/MeeshyUITests/Story/Timeline/` — où iront ces tests. Un compte erroné ne
rougit pas : il fait passer la garde par son `XCTSkip`.

## 13. Journal des décisions écartées

Écrit pour que la prochaine session ne les réintroduise pas.

| Écarté | Raison |
|---|---|
| `SourceWindowResolver.Window` portant `duration` | Deux résolveurs, un champ, deux planchers (0,05 vs 0,3). Le défaut que `ClipWindowResolver:5-13` documente avoir fermé. |
| `SetClipPropertyCommand.sourceWindow` avec un type `MeeshyUI` | `MeeshyUI` dépend de `MeeshySDK`, jamais l'inverse (`Package.swift:54-56`). |
| Une commande de propriété par frame de glissement | Non coalesçable → pile de 50 saturée en < 1 s → l'état d'avant-geste est évincé (`CommandStack.swift:113-117`). |
| Ne plus planifier une piste à `volume == 0` | Casse l'automation de volume depuis le silence, rend l'unmute inopérant, et fait rougir un test vert (§ 8.4). |
| `Edit.fill(reference:)` | Jamais spécifiée ; sur un fond décalé, faisait doubler la durée de slide à chaque appui. |
| Ouverture automatique de la feuille sur les 4 chemins d'ajout | Doublon d'éditeur sur le vocal, qui a déjà `MeeshyAudioEditorView`. |
| Invoquer « no redundant boolean + timestamp » pour refuser `sourceEnd` | La règle vise les paires booléen+horodatage, et le dépôt ships `SoundUsage.startMs`/`endMs`. |
| « Rien à faire côté serveur » | Faux : `captureTracks.ts` écrit des coordonnées de timeline dans les champs de source (§ 9.1). |

## 14. Décisions ouvertes

Trois points qui changent le périmètre et ne m'appartiennent pas.

**14.1 — Fenêtre de source par variante de langue.** La résolution par langue
tourne **déjà** en production : `resolvedPostMediaId(preferredLanguages:)`
(`StoryModels.swift:984-995`) est appelée aux deux sites de lecture audio
(`StoryCanvasUIView+Audio.swift:222`, `:264`), et la clé de configuration inclut
les langues (`:26`). Une variante est un autre fichier, donc une autre durée :
un `sourceStart` porté par la piste devient faux au changement de langue.

Le faire maintenant : deux champs sur `StoryAudioVariant`
(`StoryModels.swift:1048-1061`) et le remplacement de `resolvedPostMediaId` par
un `resolvedSource(preferredLanguages:)` rendant `(postMediaId, sourceStart,
sourceDuration)` — **trois appelants**. Le faire plus tard : migration de blobs
`storyEffects` **publiés**, sur un déploiement dont l'entrypoint ne lance aucune
migration, avec le piège `field: null ≠ champ absent` déjà payé ici.

**Recommandation : dedans.** *Écrit ici comme hypothèse de travail, à confirmer.*
Repli minimal si c'est dehors : clamper `sourceStart` à la durée de la variante
résolue, et n'ouvrir la feuille que sur les pistes sans variante possible.

**14.2 — `Sound.bpm Int?`, non peuplé.** L'aimantation sur le tempo est SOTA
(TikTok, CapCut) et `SnapEngine` n'accroche aujourd'hui que des bords de clip et
le playhead. Le champ est bon marché ; ce qui coûte, c'est l'analyse rétroactive
de la bibliothèque déjà stockée. Le poser maintenant évite une seconde passe sur
la table. Aucune UI dans ce lot.

**14.3 — Le bug du § 2.8 (pin détruit à l'ouverture de la timeline).** Préexistant,
sans rapport avec l'audio, mais il touche la grandeur qui sert de référence de
slide. Lot séparé recommandé ; à décider avant le plan, car le test 9 le
rencontrera.
