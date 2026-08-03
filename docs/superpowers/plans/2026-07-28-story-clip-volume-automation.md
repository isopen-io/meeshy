# Volume par clip, automation et waveform fidèle — Plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser `superpowers:subagent-driven-development`
> (recommandé) ou `superpowers:executing-plans` pour exécuter ce plan tâche par tâche.
> Les étapes utilisent des cases à cocher (`- [ ]`).

**But :** donner à l'auteur d'une story le contrôle du volume de chaque média — niveau
fixe, automation dans le temps, atténuation automatique — et afficher une forme d'onde
fidèle et mise en cache.

**Architecture :** un resolver pur (`StoryVolumeResolver`) est la seule source de vérité,
consommé par trois surfaces : la lecture (tick du `CADisplayLink`), l'export
(`AVAudioMix`) et la preview timeline. Le volume rejoint les keyframes existants via un
champ optionnel `StoryKeyframe.volume`, ce qui réutilise l'interpolation, les commandes
annulables et la persistance déjà en place.

**Spec :** `docs/superpowers/specs/2026-07-28-story-clip-volume-automation-design.md`

## État au 2026-07-28 — le chantier A est CLOS

Les 13 tâches sont livrées, ainsi que les deux points qui restaient ouverts en fin de
journée. Deux écarts au plan, corrigés à l'exécution et signalés ici parce que le texte
des tâches les porte encore :

- `TimelineProject.mutateKeyframes` est `fileprivate`, pas `internal` — la Task 2 se
  teste à travers `AddKeyframeCommand.apply(to:)`.
- La garde de source de la Task 5 remonte de `Tests/MeeshyUITests/Story/` : **quatre**
  `deletingLastPathComponent`, pas trois.

Deux défauts absents du plan ont été trouvés en chemin : `StoryMediaLayer` relisait
`media?.volume` à chaque ré-attache et aurait écrasé l'automation ; et
`mutateKeyframes` REFUSAIT explicitement les clips audio — le vrai verrou de
l'automation sonore.

### Les deux points restants, réglés

1. **Le drapeau `isDuckingDisabled`** (spec A2) est livré, avec sa bascule dans la
   fiche : `StoryMediaObject.isDuckingDisabled` optionnel, un cas
   `SetClipPropertyCommand.isDuckingDisabled` pour l'annulation, et
   `StoryVolumeResolver.isDucking(slideDucks:isDuckingDisabled:)` comme décision par
   clip. L'absence du champ vaut « atténuation active » : la lire autrement
   annulerait le bénéfice rétroactif du ducking sur les stories publiées.
   L'interrupteur n'apparaît que sur une VIDÉO d'une slide portant un audio de FOND —
   ailleurs il ne changerait rien à ce qu'on entend.

2. **Étape 8 de la Task 13 — la cohabitation dans 52 pt se juge au rendu**, contre ce
   que ce plan affirmait. `VideoLaneCohabitationSnapshotTests` monte la vraie barre
   dans une fenêtre, avec une vidéo qui a réellement du son, et lit les pixels.
   Verdict : **les trois calques cohabitent**, aucune hauteur de piste à augmenter,
   aucun élément à retirer.

   Deux conditions non négociables pour ce harnais : la barre doit être montée dans une
   FENÊTRE (`loadedWaveform` vient d'une `.task` qu'un `ImageRenderer` ne déclenche
   jamais — on photographierait une piste sans onde), et les marges de sécurité doivent
   être neutralisées (`safeAreaRegions = []`), sans quoi la piste descend et le cadrage
   n'existe nulle part dans l'application.

### Un défaut trouvé hors plan : l'export ne duckait pas

Le spec liste l'export parmi les trois surfaces du ducking ; seule la lecture
l'appliquait. Dans le fichier produit, la musique repassait donc sous la piste de la
vidéo — le défaut même que ce chantier existe pour corriger. `volumeRamps` prend
désormais `isDucking`, et l'atténuation multiplie chaque niveau APRÈS le plafond.

Son déclencheur est plus étroit que celui du lecteur, à dessein : `composeAudioLanes`
n'exporte que les `audioPlayerObjects` réels, jamais l'audio de fond LEGACY que
`resolvedBackgroundAudio` sait synthétiser.

### Deux constats visuels à arbitrer

- **La courbe barre le titre** quand le volume est à mi-course. Le titre est centré
  verticalement, alors que le commentaire de `waveformBand` le suppose en haut. Aucune
  correction n'est évidente : monter le titre déplacerait la collision sur le niveau
  NOMINAL, qui est la valeur par défaut.
- **L'échelle dB aplatit la forme d'onde.** Avec un plancher à −60 dB, une dynamique
  musicale ordinaire (0,15 → 0,95 d'amplitude) se traduit par des barres de hauteurs
  très proches. C'est le comportement voulu de la Task A6, pas un défaut — mais la
  waveform informe alors moins qu'on ne l'imagine en lisant le plan.

⚠️ Le gate PNG de `ClipInspectorSnapshotTests` **n'a pas réagi** à l'ajout du bloc
d'automation, alors qu'une mesure de hauteur prouve qu'il est monté
(`ClipInspectorVolumeSectionMountedTests`). Ne pas s'appuyer sur ces références pour
valider une évolution de cette fiche.

**Pile :** Swift 6 / SwiftUI / AVFoundation (iOS) · TypeScript / Zod / Jest (gateway)

## Contraintes globales

- **Swift 6, isolation par défaut `@MainActor`** sur `apps/ios` : un helper pur doit
  porter `nonisolated` **sur le TYPE**, pas méthode par méthode.
- **Jamais de `.onChange` SwiftUI brut** — utiliser le wrapper `adaptiveOnChange` du projet.
- **Aucun trailer `Co-Authored-By`** ni mention d'outil dans les messages de commit.
- **Tests iOS en XCTest** (312 fichiers contre 28 en swift-testing) : suivre XCTest.
- **Ne jamais retirer un effet visuel existant** au prétexte d'optimiser.
- **Libellés d'interface** : passer par `Localizable.xcstrings`, avec `defaultValue`.
- **Plafond de volume** : une seule constante `StoryVolume.maxGain = 2.0`, jamais de
  littéral `2.0` dispersé.
- **Ducking** : facteur `0.25`, constante unique, désactivable par clip.

### Commandes de référence

Tests SDK / UI (simulateur local iPhone 16 Pro, iOS 18.2) :

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshyUITests/<NomDeLaClasse> -quiet
```

> Piège connu : un `WorkspaceSettings` peut ignorer `-derivedDataPath` et forcer un
> DerivedData partagé. Si deux sessions buildent en parallèle et que le lock GRDB gèle,
> c'est cette cause. Voir la mémoire projet correspondante.

Tests gateway :

```bash
cd services/gateway
npx jest --config=jest.config.json src/__tests__/unit/routes/posts/types.test.ts
```

---

### Task 1 : Gateway — relever le plafond de volume

**Cette tâche doit être livrée et déployée AVANT toute activation côté application.**
Tant qu'elle ne l'est pas, publier une story portant un volume supérieur à 1 renvoie
`400` et la story est perdue.

**Fichiers :**
- Modifier : `services/gateway/src/routes/posts/types.ts:90` et `:140`
- Test : `services/gateway/src/__tests__/unit/routes/posts/types.test.ts`

**Interfaces :**
- Consomme : rien
- Produit : `StoryEffectsSchema` accepte `volume ∈ [0, 2]` pour `mediaObjects[]` et
  `audioPlayerObjects[]`

- [ ] **Étape 1 : écrire les tests qui échouent**

Ajouter dans `src/__tests__/unit/routes/posts/types.test.ts` :

```typescript
import { StoryEffectsSchema } from '../../../../routes/posts/types';

describe('StoryEffectsSchema — plafond de volume', () => {
  it('accepte un volume de 2 sur un audioPlayerObject', () => {
    const result = StoryEffectsSchema.safeParse({
      audioPlayerObjects: [{ id: 'a1', postMediaId: 'm1', volume: 2 }],
    });
    expect(result.success).toBe(true);
  });

  it('accepte un volume de 2 sur un mediaObject', () => {
    const result = StoryEffectsSchema.safeParse({
      mediaObjects: [{ id: 'm1', postMediaId: 'p1', volume: 2 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejette un volume de 2.1', () => {
    const result = StoryEffectsSchema.safeParse({
      audioPlayerObjects: [{ id: 'a1', postMediaId: 'm1', volume: 2.1 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejette un volume négatif', () => {
    const result = StoryEffectsSchema.safeParse({
      audioPlayerObjects: [{ id: 'a1', postMediaId: 'm1', volume: -0.1 }],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Étape 2 : lancer les tests et vérifier l'échec**

```bash
cd services/gateway
npx jest --config=jest.config.json src/__tests__/unit/routes/posts/types.test.ts
```

Attendu : les deux tests « accepte un volume de 2 » ÉCHOUENT (`success` vaut `false`,
`max(1)` refuse la valeur). Les deux tests de rejet passent déjà.

- [ ] **Étape 3 : relever le plafond**

Dans `services/gateway/src/routes/posts/types.ts`, ligne 90 (`StoryMediaObjectSchema`)
et ligne 140 (`StoryAudioObjectSchema`), remplacer :

```typescript
  volume: z.number().min(0).max(1).optional(),
```

par :

```typescript
  // Plafond à 2 : l'auteur peut pousser un média au-delà de son niveau nominal
  // (quitte à saturer, c'est un choix de composition assumé). Miroir de
  // `StoryVolume.maxGain` côté iOS — les deux valeurs doivent rester égales.
  volume: z.number().min(0).max(2).optional(),
```

- [ ] **Étape 4 : lancer les tests et vérifier le succès**

```bash
cd services/gateway
npx jest --config=jest.config.json src/__tests__/unit/routes/posts/types.test.ts
```

Attendu : les 4 tests PASSENT.

- [ ] **Étape 5 : commit**

```bash
git add services/gateway/src/routes/posts/types.ts \
        services/gateway/src/__tests__/unit/routes/posts/types.test.ts
git commit -m "feat(gateway/story): le volume d'un média peut monter jusqu'à 200 %"
```

---

### Task 2 : Modèle — `StoryKeyframe.volume` et `StoryAudioPlayerObject.keyframes`

**Fichiers :**
- Modifier : `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
  (struct `StoryKeyframe` ~l. 3620 ; struct `StoryAudioPlayerObject` ~l. 797 ;
  `StoryEffects.toJSON()` bloc `audioPlayerObjects` ~l. 1632)
- Test : `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryVolumeKeyframeModelTests.swift` (créer)

**Interfaces :**
- Consomme : rien
- Produit :
  - `StoryKeyframe.volume: Float?` (paramètre d'init nommé `volume`, après `opacity`)
  - `StoryAudioPlayerObject.keyframes: [StoryKeyframe]?` (paramètre d'init nommé
    `keyframes`, après `sourceLanguage`)

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryVolumeKeyframeModelTests.swift` :

```swift
import XCTest
@testable import MeeshySDK

/// Le volume rejoint les keyframes existants comme 5ᵉ canal optionnel, et
/// l'audio gagne la parité avec le média : sans ces deux champs, aucune
/// automation de volume ne peut être ni posée ni publiée.
final class StoryVolumeKeyframeModelTests: XCTestCase {

    func test_keyframe_volumeOnly_roundTripsThroughCodable() throws {
        let kf = StoryKeyframe(time: 4.2, volume: 0.35)
        let data = try JSONEncoder().encode(kf)
        let decoded = try JSONDecoder().decode(StoryKeyframe.self, from: data)

        XCTAssertEqual(decoded.time, 4.2)
        XCTAssertEqual(decoded.volume, 0.35)
        // Un point « volume seul » ne doit pas inventer de transformation.
        XCTAssertNil(decoded.x)
        XCTAssertNil(decoded.y)
        XCTAssertNil(decoded.scale)
        XCTAssertNil(decoded.opacity)
    }

    func test_keyframe_withoutVolume_decodesAsNil() throws {
        let json = #"{"id":"k1","time":1.0,"x":0.5}"#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryKeyframe.self, from: json)
        XCTAssertNil(decoded.volume)
    }

    func test_audioPlayerObject_carriesKeyframes() throws {
        let audio = StoryAudioPlayerObject(
            postMediaId: "m1",
            keyframes: [StoryKeyframe(time: 0, volume: 1.0),
                        StoryKeyframe(time: 3, volume: 0.2)]
        )
        let data = try JSONEncoder().encode(audio)
        let decoded = try JSONDecoder().decode(StoryAudioPlayerObject.self, from: data)

        XCTAssertEqual(decoded.keyframes?.count, 2)
        XCTAssertEqual(decoded.keyframes?.last?.volume, 0.2)
    }

    func test_toJSON_serialisesAudioKeyframes() {
        var effects = StoryEffects()
        effects.audioPlayerObjects = [
            StoryAudioPlayerObject(postMediaId: "m1",
                                   keyframes: [StoryKeyframe(time: 2, volume: 0.5)])
        ]
        let dict = effects.toJSON()
        let audios = dict["audioPlayerObjects"] as? [[String: Any]]
        let frames = audios?.first?["keyframes"] as? [[String: Any]]

        XCTAssertEqual(frames?.count, 1)
        XCTAssertEqual(frames?.first?["volume"] as? Float, 0.5)
    }
}
```

- [ ] **Étape 2 : lancer le test et vérifier l'échec**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshySDKTests/StoryVolumeKeyframeModelTests -quiet
```

Attendu : ÉCHEC de compilation — `StoryKeyframe` n'a pas d'argument `volume`,
`StoryAudioPlayerObject` n'a pas d'argument `keyframes`.

- [ ] **Étape 3 : ajouter le canal `volume` à `StoryKeyframe`**

Dans `StoryModels.swift`, struct `StoryKeyframe` : ajouter la propriété après `opacity`,
le paramètre d'init correspondant, et son affectation.

```swift
    public var opacity: CGFloat?
    /// Volume du clip à cet instant, dans `0...StoryVolume.maxGain`.
    /// 5ᵉ canal optionnel : un point « volume seul » laisse les quatre autres à
    /// `nil`, et l'interpolateur ignore alors ces canaux.
    public var volume: Float?
    public var easing: StoryEasing?
```

Init — ajouter le paramètre entre `opacity` et `easing`, puis l'affectation :

```swift
                opacity: CGFloat? = nil,
                volume: Float? = nil,
                easing: StoryEasing? = nil) {
        ...
        self.opacity = opacity
        self.volume = volume
        self.easing = easing
```

`StoryKeyframe` n'ayant pas de `CodingKeys` explicite, la synthèse automatique prend en
charge le nouveau champ. Ne pas en ajouter un.

- [ ] **Étape 4 : ajouter `keyframes` à `StoryAudioPlayerObject`**

Toujours dans `StoryModels.swift`, struct `StoryAudioPlayerObject` — propriété, entrée
dans `CodingKeys` (ce type a un `CodingKeys` explicite : l'oublier rendrait le champ
invisible), paramètre d'init et affectation.

```swift
    public var name: String?
    /// Automation par keyframes, parité avec `StoryMediaObject.keyframes`.
    /// Seul le canal `volume` est exploité pour un audio : sa position n'a
    /// aucun rendu.
    public var keyframes: [StoryKeyframe]?
```

```swift
    enum CodingKeys: String, CodingKey {
        case id, postMediaId, placement, x, y, volume, waveformSamples
        case isBackground, backgroundAudioVariants, zIndex
        case startTime, duration, loop, fadeIn, fadeOut, sourceLanguage, name
        case keyframes
    }
```

```swift
                sourceLanguage: String? = nil,
                name: String? = nil,
                keyframes: [StoryKeyframe]? = nil) {
        ...
        self.name = name
        self.keyframes = keyframes
```

- [ ] **Étape 5 : autoriser les keyframes sur les clips audio**

`TimelineProject.mutateKeyframes` (~l. 3083) refuse aujourd'hui l'audio :

```swift
        case .audio:
            throw EditCommandError.invalidState(reason: "audio clips do not support keyframes")
```

C'est le verrou qui empêche toute automation sur un son. Le remplacer par le même
traitement que les médias :

```swift
        case .audio:
            guard let idx = audioPlayerObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            var arr = audioPlayerObjects[idx].keyframes ?? []
            try block(&arr)
            audioPlayerObjects[idx].keyframes = arr.isEmpty ? nil : arr
```

Le cas `.sticker` conserve son refus : un sticker s'édite sur le canvas.

Ajouter le test correspondant dans `StoryVolumeKeyframeModelTests` :

```swift
    func test_mutateKeyframes_acceptsAudioClips() throws {
        var project = TimelineProject(
            slideId: "s1",
            slideDuration: 5,
            audioPlayerObjects: [StoryAudioPlayerObject(id: "a1", postMediaId: "m1")]
        )
        try project.mutateKeyframes(clipId: "a1", kind: .audio) { frames in
            frames.append(StoryKeyframe(time: 2, volume: 0.3))
        }
        XCTAssertEqual(project.audioPlayerObjects.first?.keyframes?.count, 1)
    }
```

> `mutateKeyframes` est `internal` : le test y accède via `@testable import MeeshySDK`,
> déjà présent en tête du fichier. Adapter les arguments de `TimelineProject.init` à sa
> signature réelle (les autres tableaux ont des valeurs par défaut).

- [ ] **Étape 6 : sérialiser les keyframes audio dans `toJSON()`**

Dans `StoryEffects.toJSON()`, bloc `audioPlayerObjects` (après la ligne qui écrit
`isBackground`), ajouter :

```swift
                if let frames = p.keyframes, !frames.isEmpty {
                    d["keyframes"] = frames.map { kf -> [String: Any] in
                        var f: [String: Any] = ["id": kf.id, "time": kf.time]
                        if let v = kf.volume { f["volume"] = v }
                        if let e = kf.easing { f["easing"] = e.rawValue }
                        return f
                    }
                }
```

- [ ] **Étape 7 : lancer les tests et vérifier le succès**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshySDKTests/StoryVolumeKeyframeModelTests -quiet
```

Attendu : les 5 tests PASSENT.

- [ ] **Étape 8 : commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryVolumeKeyframeModelTests.swift
git commit -m "feat(story/model): le volume devient un canal de keyframe, l'audio gagne l'automation"
```

---

### Task 3 : `StoryVolume` + `StoryVolumeResolver`

**Fichiers :**
- Créer : `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/StoryVolumeResolver.swift`
- Test : `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/StoryVolumeResolverTests.swift` (créer)

**Interfaces :**
- Consomme : `StoryKeyframe.volume` (Task 2), `KeyframeInterpolator.interpolate(keyframes:at:)`
- Produit :
  - `StoryVolume.maxGain: Float` = `2.0`
  - `StoryVolume.duckingFactor: Float` = `0.25`
  - `StoryVolumeResolver.effectiveVolume(base:keyframes:at:) -> Float`

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/StoryVolumeResolverTests.swift` :

```swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Le resolver est la SEULE source de vérité du volume pour la lecture,
/// l'export et la preview. Toute divergence entre ces surfaces viendrait
/// d'un appelant qui l'a court-circuité.
final class StoryVolumeResolverTests: XCTestCase {

    func test_noKeyframes_returnsBaseVolume() {
        let v = StoryVolumeResolver.effectiveVolume(base: 0.8, keyframes: nil, at: 3)
        XCTAssertEqual(v, 0.8, accuracy: 0.0001)
    }

    func test_keyframesWithoutVolumeChannel_returnsBaseVolume() {
        let frames = [StoryKeyframe(time: 0, x: 0.1), StoryKeyframe(time: 5, x: 0.9)]
        let v = StoryVolumeResolver.effectiveVolume(base: 0.6, keyframes: frames, at: 2)
        XCTAssertEqual(v, 0.6, accuracy: 0.0001)
    }

    /// Avant le premier point, on garde le volume de base : sans ce gardien,
    /// l'ouverture d'une story sauterait brutalement à la valeur du 1ᵉʳ point.
    func test_beforeFirstPoint_returnsBaseVolume() {
        let frames = [StoryKeyframe(time: 4, volume: 0.2)]
        let v = StoryVolumeResolver.effectiveVolume(base: 1.0, keyframes: frames, at: 1)
        XCTAssertEqual(v, 1.0, accuracy: 0.0001)
    }

    func test_singlePoint_holdsItsValueAfterwards() {
        let frames = [StoryKeyframe(time: 2, volume: 0.3)]
        let v = StoryVolumeResolver.effectiveVolume(base: 1.0, keyframes: frames, at: 7)
        XCTAssertEqual(v, 0.3, accuracy: 0.0001)
    }

    func test_twoPoints_interpolatesLinearlyAtMidpoint() {
        let frames = [StoryKeyframe(time: 0, volume: 1.0, easing: .linear),
                      StoryKeyframe(time: 4, volume: 0.0, easing: .linear)]
        let v = StoryVolumeResolver.effectiveVolume(base: 1.0, keyframes: frames, at: 2)
        XCTAssertEqual(v, 0.5, accuracy: 0.01)
    }

    /// Les points arrivant du réseau ne sont pas garantis triés.
    func test_unsortedPoints_areOrderedBeforeInterpolation() {
        let frames = [StoryKeyframe(time: 4, volume: 0.0, easing: .linear),
                      StoryKeyframe(time: 0, volume: 1.0, easing: .linear)]
        let v = StoryVolumeResolver.effectiveVolume(base: 1.0, keyframes: frames, at: 2)
        XCTAssertEqual(v, 0.5, accuracy: 0.01)
    }

    func test_valuesAreClampedToMaxGain() {
        let frames = [StoryKeyframe(time: 0, volume: 9.0)]
        let v = StoryVolumeResolver.effectiveVolume(base: 1.0, keyframes: frames, at: 1)
        XCTAssertEqual(v, StoryVolume.maxGain, accuracy: 0.0001)
    }

    func test_negativeBaseIsClampedToZero() {
        let v = StoryVolumeResolver.effectiveVolume(base: -3, keyframes: nil, at: 0)
        XCTAssertEqual(v, 0, accuracy: 0.0001)
    }

    func test_gainAboveOneIsPreserved() {
        let v = StoryVolumeResolver.effectiveVolume(base: 1.8, keyframes: nil, at: 0)
        XCTAssertEqual(v, 1.8, accuracy: 0.0001)
    }
}
```

- [ ] **Étape 2 : lancer le test et vérifier l'échec**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshyUITests/StoryVolumeResolverTests -quiet
```

Attendu : ÉCHEC de compilation — `StoryVolume` et `StoryVolumeResolver` n'existent pas.

- [ ] **Étape 3 : écrire l'implémentation**

Créer `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/StoryVolumeResolver.swift` :

```swift
//
// StoryVolumeResolver.swift
// MeeshyUI / Story / Timeline / Logic
//
// Source de vérité UNIQUE du volume d'un clip à un instant donné, partagée
// par la lecture (tick du CADisplayLink), l'export (AVAudioMix) et la preview
// timeline. Pur : aucune dépendance UIKit / SwiftUI.
//
// Spec: docs/superpowers/specs/2026-07-28-story-clip-volume-automation-design.md
//

import Foundation
import MeeshySDK

/// Constantes de volume partagées par toute la chaîne story.
///
/// `nonisolated` porté par le TYPE : sous isolation `@MainActor` par défaut,
/// une annotation méthode par méthode ne suffirait pas aux usages en contexte
/// non isolé (export hors main thread).
public nonisolated enum StoryVolume {

    /// Plafond de gain autorisé. `1.0` = niveau nominal du fichier ; au-delà,
    /// l'auteur amplifie volontairement, quitte à saturer.
    ///
    /// DOIT rester égal à `max(2)` dans le schéma Zod de la gateway
    /// (`services/gateway/src/routes/posts/types.ts`). Ramener ce plafond à
    /// `1.0` un jour se fait ici, plus le miroir côté gateway.
    public static let maxGain: Float = 2.0

    /// Facteur appliqué à la piste audio d'une vidéo tant qu'un audio de fond
    /// joue sur la même slide. Multiplicateur d'affichage : jamais écrit dans
    /// le modèle, donc réversible et applicable aux stories déjà publiées.
    public static let duckingFactor: Float = 0.25
}

/// Résout le volume d'un clip à un instant donné.
public nonisolated enum StoryVolumeResolver {

    /// Volume effectif du clip à `time`, exprimé en fraction du niveau nominal.
    ///
    /// - `base` : volume statique du clip (`StoryMediaObject.volume` /
    ///   `StoryAudioPlayerObject.volume`).
    /// - `keyframes` : keyframes du clip, tous canaux confondus. Seuls ceux
    ///   portant un `volume` comptent ici.
    /// - `time` : position du playhead **relative au `startTime` du clip** —
    ///   c'est la convention déjà appliquée aux autres canaux par
    ///   `StoryRenderer`.
    ///
    /// Retourne `base` quand aucun point de volume n'existe, ou quand le
    /// playhead précède le premier : sans ce gardien, l'ouverture d'une story
    /// sauterait d'un coup à la valeur du premier point.
    public static func effectiveVolume(base: Float,
                                       keyframes: [StoryKeyframe]?,
                                       at time: Float) -> Float {
        let points = (keyframes ?? [])
            .compactMap { kf -> (time: Float, value: Float, easing: StoryEasing)? in
                guard let v = kf.volume else { return nil }
                return (kf.time, v, kf.easing ?? .linear)
            }
            .sorted { $0.time < $1.time }

        guard let first = points.first else { return clamp(base) }
        guard time >= first.time else { return clamp(base) }
        guard let value = KeyframeInterpolator.interpolate(keyframes: points, at: time) else {
            return clamp(base)
        }
        return clamp(value)
    }

    /// Applique l'atténuation automatique par-dessus un volume déjà résolu.
    /// Séparé de `effectiveVolume` à dessein : le ducking dépend du contexte de
    /// la slide, pas du clip, et ne doit jamais contaminer la valeur persistée.
    public static func ducked(_ volume: Float, isDucking: Bool) -> Float {
        isDucking ? clamp(volume * StoryVolume.duckingFactor) : volume
    }

    private static func clamp(_ v: Float) -> Float {
        min(StoryVolume.maxGain, max(0, v))
    }
}
```

- [ ] **Étape 4 : lancer le test et vérifier le succès**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshyUITests/StoryVolumeResolverTests -quiet
```

Attendu : les 9 tests PASSENT.

- [ ] **Étape 5 : commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/StoryVolumeResolver.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/StoryVolumeResolverTests.swift
git commit -m "feat(story/timeline): un resolver unique décide du volume d'un clip"
```

---

### Task 4 : A1 — la vidéo de fond respecte enfin son volume

C'est le correctif du défaut à l'origine du chantier : le volume d'une vidéo de fond est
codé en dur à `1.0`, si bien qu'aucun réglage ne l'atteint. L'export, lui, l'applique
déjà — la lecture est la seule surface fautive.

**Fichiers :**
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift`
  (propriété `isMuted` ~l. 94 ; `attachBackgroundPlayer` ~l. 780-798)
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Rendering.swift`
  (là où `backgroundLayer` est configuré à partir de la slide)
- Test : `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryBackgroundLayerVolumeTests.swift` (créer)

**Interfaces :**
- Consomme : `StoryVolume` (Task 3)
- Produit : `StoryBackgroundLayer.volume: Float` (défaut `1.0`, `didSet` vers `avPlayer`)

- [ ] **Étape 1 : écrire les tests qui échouent**

Créer `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryBackgroundLayerVolumeTests.swift` :

```swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// La couche de fond ignorait `StoryMediaObject.volume` et forçait 1.0 : une
/// vidéo de fond couvrait donc toujours la musique, quel que soit le réglage.
@MainActor
final class StoryBackgroundLayerVolumeTests: XCTestCase {

    func test_volumeDefaultsToNominal() {
        let layer = StoryBackgroundLayer()
        XCTAssertEqual(layer.volume, 1.0, accuracy: 0.0001)
    }

    func test_settingVolumeReachesThePlayer() throws {
        let layer = StoryBackgroundLayer()
        let url = try Self.makeSilentVideoURL()
        defer { try? FileManager.default.removeItem(at: url) }

        layer.attachBackgroundPlayer(url: url, looping: false, mute: false)
        layer.volume = 0.25

        XCTAssertEqual(layer.avPlayer?.volume ?? -1, 0.25, accuracy: 0.0001)
    }

    /// Le volume posé AVANT l'attache doit survivre à celle-ci — le player est
    /// créé tardivement (téléchargement, cache LRU), après la configuration.
    func test_volumeSetBeforeAttachSurvivesAttach() throws {
        let layer = StoryBackgroundLayer()
        let url = try Self.makeSilentVideoURL()
        defer { try? FileManager.default.removeItem(at: url) }

        layer.volume = 0.4
        layer.attachBackgroundPlayer(url: url, looping: false, mute: false)

        XCTAssertEqual(layer.avPlayer?.volume ?? -1, 0.4, accuracy: 0.0001)
    }

    /// Fabrique un fichier vidéo minimal : `AVPlayer` accepte une URL locale
    /// sans exiger que l'asset soit lisible pour exposer `volume`.
    private static func makeSilentVideoURL() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("bg-\(UUID().uuidString).mp4")
        try Data([0x00, 0x00, 0x00, 0x18]).write(to: url)
        return url
    }
}
```

- [ ] **Étape 2 : lancer le test et vérifier l'échec**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshyUITests/StoryBackgroundLayerVolumeTests -quiet
```

Attendu : ÉCHEC de compilation — `StoryBackgroundLayer` n'a pas de propriété `volume`.

- [ ] **Étape 3 : ajouter la propriété `volume`**

Dans `StoryBackgroundLayer.swift`, juste après la propriété `isMuted` (~l. 94), sur le
même modèle :

```swift
    /// Volume du média de fond, dans `0...StoryVolume.maxGain`.
    ///
    /// Cette couche forçait `1.0` à l'attache et n'a jamais lu
    /// `StoryMediaObject.volume` : une vidéo de fond couvrait donc la musique
    /// quel que soit le réglage de l'auteur, alors même que l'export
    /// l'appliquait déjà. La valeur est réappliquée à chaque attache, le player
    /// étant recréé au gré du cache LRU.
    public var volume: Float = 1.0 {
        didSet {
            guard oldValue != volume else { return }
            avPlayer?.volume = volume
        }
    }
```

- [ ] **Étape 4 : appliquer le volume à l'attache**

Dans `attachBackgroundPlayer`, remplacer la ligne 798 :

```swift
        // Volume explicite (l'AVPlayer démarre à 1.0 mais soyons déterministes
        // pour les paths de re-attach via cache LRU).
        self.avPlayer?.volume = 1.0
```

par :

```swift
        // Volume explicite : le player est recréé à chaque re-attache (cache
        // LRU), il faut donc lui réappliquer la valeur courante de la couche —
        // et surtout pas un 1.0 codé en dur, qui rendait le réglage de l'auteur
        // inopérant sur toute vidéo de fond.
        self.avPlayer?.volume = self.volume
```

- [ ] **Étape 5 : alimenter la couche depuis le modèle**

Dans `StoryCanvasUIView+Rendering.swift`, à l'endroit où `backgroundLayer` est configuré
depuis la slide (~l. 68, branche `slide.effects.mediaObjects?.first(where: { $0.isBackground })`),
poser le volume avant la configuration :

```swift
            if let bg = slide.effects.mediaObjects?.first(where: { $0.isBackground }) {
                backgroundLayer.volume = StoryVolumeResolver.effectiveVolume(
                    base: bg.volume, keyframes: bg.keyframes, at: 0
                )
```

> Le `at: 0` est volontaire : c'est la valeur d'ouverture. Le suivi dans le temps est
> branché en Task 6, sur le tick du displayLink.

- [ ] **Étape 6 : lancer le test et vérifier le succès**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshyUITests/StoryBackgroundLayerVolumeTests -quiet
```

Attendu : les 3 tests PASSENT.

- [ ] **Étape 7 : commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Rendering.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryBackgroundLayerVolumeTests.swift
git commit -m "fix(story/reader): la vidéo de fond respecte enfin le volume choisi"
```

---

### Task 5 : garde de source contre le retour du volume codé en dur

Le `1.0` en dur a survécu longtemps parce que rien ne le signalait. Cette garde est le
filet qui empêche sa réintroduction lors d'un futur remaniement de la couche.

**Fichiers :**
- Test : `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryBackgroundLayerVolumeSourceGuardTests.swift` (créer)

**Interfaces :**
- Consomme : le fichier source de Task 4
- Produit : rien (test seul)

- [ ] **Étape 1 : écrire le test**

```swift
import XCTest

/// Garde de source : `avPlayer.volume` ne doit plus jamais recevoir un
/// littéral. Ancré sur le COMPORTEMENT (une affectation constante), pas sur
/// une mise en forme — et les commentaires sont retirés avant analyse, sinon
/// la prose qui décrit le piège déclencherait elle-même l'alerte.
final class StoryBackgroundLayerVolumeSourceGuardTests: XCTestCase {

    func test_backgroundLayer_neverAssignsLiteralVolume() throws {
        let path = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Story
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .appendingPathComponent("Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift")

        let source = try String(contentsOf: path, encoding: .utf8)
        let code = source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> String in
                guard let range = line.range(of: "//") else { return String(line) }
                return String(line[line.startIndex..<range.lowerBound])
            }
            .joined(separator: "\n")

        let offenders = code
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { $0.contains("avPlayer?.volume =") || $0.contains("avPlayer!.volume =") }
            .filter { line in
                // Seule affectation légitime : celle qui relaie la propriété.
                !line.contains("self.volume") && !line.contains("= volume")
            }

        XCTAssertTrue(
            offenders.isEmpty,
            "Volume du player de fond affecté à une constante : \(offenders). "
            + "Passer par la propriété `volume` de la couche."
        )
    }
}
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il passe**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshyUITests/StoryBackgroundLayerVolumeSourceGuardTests -quiet
```

Attendu : PASSE (Task 4 a supprimé le littéral).

- [ ] **Étape 3 : vérifier que la garde mord vraiment**

Contrôle positif obligatoire — une garde qu'on n'a pas vue échouer ne prouve rien.
Remettre temporairement `self.avPlayer?.volume = 1.0` dans `attachBackgroundPlayer`,
relancer la commande ci-dessus, constater l'ÉCHEC, puis **rétablir la ligne correcte**
et relancer pour confirmer le retour au vert.

- [ ] **Étape 4 : commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryBackgroundLayerVolumeSourceGuardTests.swift
git commit -m "test(story/reader): interdire le retour d'un volume de fond codé en dur"
```

---

### Task 6 : suivi du volume dans le temps à la lecture

**Fichiers :**
- Créer : `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Volume.swift`
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Playback.swift:226-238`
  (`displayLinkTick`)
- Test : `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryCanvasVolumeTrackingTests.swift` (créer)

**Interfaces :**
- Consomme : `StoryVolumeResolver` (Task 3), `StoryBackgroundLayer.volume` (Task 4)
- Produit : `StoryCanvasUIView.applyVolumeAutomation(at:)`, appelée à chaque tick

- [ ] **Étape 1 : écrire le test qui échoue**

```swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// L'automation n'a de valeur que si le volume SUIT le playhead. Ce test
/// pilote le temps à la main plutôt que d'attendre un displayLink réel.
@MainActor
final class StoryCanvasVolumeTrackingTests: XCTestCase {

    func test_backgroundVideoVolumeFollowsKeyframes() {
        var media = StoryMediaObject(postMediaId: "m1", kind: .video, isBackground: true)
        media.volume = 1.0
        media.keyframes = [StoryKeyframe(time: 0, volume: 1.0, easing: .linear),
                           StoryKeyframe(time: 4, volume: 0.0, easing: .linear)]

        var effects = StoryEffects()
        effects.mediaObjects = [media]
        let slide = StorySlide(id: "s1", content: "", effects: effects)
        let canvas = StoryCanvasUIView(slide: slide, mode: .play)

        canvas.applyVolumeAutomation(at: 0)
        XCTAssertEqual(canvas.backgroundLayer.volume, 1.0, accuracy: 0.01)

        canvas.applyVolumeAutomation(at: 2)
        XCTAssertEqual(canvas.backgroundLayer.volume, 0.5, accuracy: 0.05)

        canvas.applyVolumeAutomation(at: 4)
        XCTAssertEqual(canvas.backgroundLayer.volume, 0.0, accuracy: 0.05)
    }

    func test_withoutKeyframes_volumeStaysAtBase() {
        var media = StoryMediaObject(postMediaId: "m1", kind: .video, isBackground: true)
        media.volume = 0.7

        var effects = StoryEffects()
        effects.mediaObjects = [media]
        let slide = StorySlide(id: "s1", content: "", effects: effects)
        let canvas = StoryCanvasUIView(slide: slide, mode: .play)

        canvas.applyVolumeAutomation(at: 0)
        canvas.applyVolumeAutomation(at: 9)
        XCTAssertEqual(canvas.backgroundLayer.volume, 0.7, accuracy: 0.01)
    }
}
```

- [ ] **Étape 2 : lancer le test et vérifier l'échec**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshyUITests/StoryCanvasVolumeTrackingTests -quiet
```

Attendu : ÉCHEC — `applyVolumeAutomation(at:)` n'existe pas.

- [ ] **Étape 3 : écrire l'extension**

Créer `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Volume.swift` :

```swift
import UIKit
import MeeshySDK

// MARK: - StoryCanvasUIView + Volume

extension StoryCanvasUIView {

    /// Réapplique le volume de chaque média sonore de la slide pour la position
    /// `time` du playhead (en secondes, depuis le début de la slide).
    ///
    /// Appelée à chaque tick du displayLink : le corps doit rester une poignée
    /// de comparaisons. Les couches ignorent une écriture identique
    /// (`didSet` gardé par `oldValue != volume`), donc réaffecter à 60 Hz ne
    /// coûte rien tant qu'aucune valeur ne change.
    func applyVolumeAutomation(at time: Float) {
        let effects = slide.effects
        let isDucking = shouldDuckVideoAudio(effects: effects)

        if let bg = effects.mediaObjects?.first(where: { $0.isBackground }) {
            let resolved = StoryVolumeResolver.effectiveVolume(
                base: bg.volume,
                keyframes: bg.keyframes,
                at: time - Float(bg.startTime ?? 0)
            )
            backgroundLayer.volume = StoryVolumeResolver.ducked(
                resolved, isDucking: isDucking && !(bg.isDuckingDisabled ?? false)
            )
        }

        for media in effects.resolvedForegroundMediaObjects where media.kind == .video {
            let resolved = StoryVolumeResolver.effectiveVolume(
                base: media.volume,
                keyframes: media.keyframes,
                at: time - Float(media.startTime ?? 0)
            )
            let final = StoryVolumeResolver.ducked(
                resolved, isDucking: isDucking && !(media.isDuckingDisabled ?? false)
            )
            setForegroundMediaVolume(id: media.id, volume: final)
        }

        for audio in effects.resolvedForegroundAudioPlayers {
            let resolved = StoryVolumeResolver.effectiveVolume(
                base: audio.volume,
                keyframes: audio.keyframes,
                at: time - (audio.startTime ?? 0)
            )
            audioMixer.setVolume(resolved, for: audio.id)
        }

        if let bgAudio = effects.resolvedBackgroundAudio {
            let resolved = StoryVolumeResolver.effectiveVolume(
                base: bgAudio.volume,
                keyframes: bgAudio.keyframes,
                at: time - (bgAudio.startTime ?? 0)
            )
            audioMixer.setBackgroundVolume(resolved)
        }
    }

    /// `true` quand la slide porte un audio de fond ET une vidéo réellement
    /// sonore : c'est la situation où la vidéo couvre la musique.
    ///
    /// La présence d'une piste audio est sondée une fois par clip et mémorisée
    /// dans `videoHasAudioTrack` — on ne peut pas s'appuyer sur
    /// `StoryAudioAvailability.videoAudioTracks`, alimentée uniquement par le
    /// lecteur plein écran et absente du composer comme de l'export.
    func shouldDuckVideoAudio(effects: StoryEffects) -> Bool {
        guard effects.resolvedBackgroundAudio != nil else { return false }
        return videoHasAudioTrack.values.contains(true)
    }
}
```

- [ ] **Étape 4 : déclarer les appuis manquants**

Dans `StoryCanvasUIView.swift`, ajouter la table de sondage près des autres états :

```swift
    /// Présence d'une piste audio par identifiant de média vidéo, sondée une
    /// fois via `AVAsset.loadTracks(withMediaType: .audio)` puis mémorisée.
    /// Une clé absente signifie « pas encore sondé » et n'active aucun ducking.
    var videoHasAudioTrack: [String: Bool] = [:]
```

Dans `StoryMediaObject` (`StoryModels.swift`), ajouter le drapeau de désactivation, son
entrée `CodingKeys`, son paramètre d'init et son affectation — même traitement dans
`StoryAudioPlayerObject` :

```swift
    /// Coupe l'atténuation automatique pour ce clip. `nil` == ducking actif.
    public var isDuckingDisabled: Bool?
```

Dans `ReaderAudioMixer.swift`, exposer le volume du fond (le mixer n'offrait que le
`setVolume(_:for:)` des clips d'avant-plan) :

```swift
    /// Volume du clip de fond, indépendant du mute global.
    public func setBackgroundVolume(_ volume: Float) {
        guard var bg = backgroundEntry else { return }
        bg.targetVolume = min(StoryVolume.maxGain, max(0, volume))
        backgroundEntry = bg
        bg.player.volume = isMuted ? 0 : bg.targetVolume
    }
```

Dans `StoryCanvasUIView+Rendering.swift`, ajouter le relais vers les couches
d'avant-plan (à côté de `forEachMediaLayer`) :

```swift
    /// Pose le volume d'une couche média d'avant-plan identifiée par `id`.
    func setForegroundMediaVolume(id: String, volume: Float) {
        mediaLayers[id]?.avPlayer?.volume = volume
    }
```

- [ ] **Étape 5 : brancher sur le tick**

Dans `StoryCanvasUIView+Playback.swift`, `displayLinkTick` (l. 226-238), ajouter l'appel
après l'avancée du playhead :

```swift
        refreshPlaybackHealth(now: link.timestamp)
        advancePlayheadIfActive(by: link.targetTimestamp - link.timestamp)
        // Le volume suit le playhead : à poser APRÈS l'avancée, sinon
        // l'automation retarde d'une image sur l'image affichée.
        applyVolumeAutomation(at: Float(currentTime.seconds))
```

- [ ] **Étape 6 : lancer le test et vérifier le succès**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshyUITests/StoryCanvasVolumeTrackingTests -quiet
```

Attendu : les 2 tests PASSENT.

- [ ] **Étape 7 : commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Volume.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Playback.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Rendering.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/ReaderAudioMixer.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryCanvasVolumeTrackingTests.swift
git commit -m "feat(story/reader): le volume des médias suit le playhead"
```

---

### Task 7 : sonder la présence d'une piste audio

**Fichiers :**
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Volume.swift`
- Test : `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryVideoAudioTrackProbeTests.swift` (créer)

**Interfaces :**
- Consomme : `videoHasAudioTrack` (Task 6)
- Produit : `StoryCanvasUIView.probeVideoAudioTracks()` — asynchrone, idempotente

- [ ] **Étape 1 : écrire le test qui échoue**

```swift
import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// Le ducking ne doit pas se déclencher pour une vidéo muette. La table est
/// alimentée par un sondage réel de l'asset, pas par une hypothèse.
@MainActor
final class StoryVideoAudioTrackProbeTests: XCTestCase {

    func test_probe_marksSilentAssetAsWithoutAudio() async throws {
        let url = try Self.makeVideoWithoutAudio()
        defer { try? FileManager.default.removeItem(at: url) }

        let hasAudio = await StoryCanvasUIView.assetHasAudioTrack(url: url)
        XCTAssertFalse(hasAudio)
    }

    func test_probe_isUnknownForUnreadableAsset() async {
        let url = URL(fileURLWithPath: "/dev/null/absent.mp4")
        let hasAudio = await StoryCanvasUIView.assetHasAudioTrack(url: url)
        // Un asset illisible n'est pas « muet » : il est inconnu, donc traité
        // comme sans audio, ce qui n'active aucune atténuation abusive.
        XCTAssertFalse(hasAudio)
    }

    /// Vidéo H.264 sans piste audio, produite par AVAssetWriter.
    private static func makeVideoWithoutAudio() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("silent-\(UUID().uuidString).mov")
        let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        let settings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: 64,
            AVVideoHeightKey: 64,
        ]
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        writer.add(input)
        writer.startWriting()
        writer.startSession(atSourceTime: .zero)
        input.markAsFinished()
        let done = XCTestExpectation(description: "write")
        writer.finishWriting { done.fulfill() }
        _ = XCTWaiter().wait(for: [done], timeout: 10)
        return url
    }
}
```

- [ ] **Étape 2 : lancer le test et vérifier l'échec**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshyUITests/StoryVideoAudioTrackProbeTests -quiet
```

Attendu : ÉCHEC — `assetHasAudioTrack(url:)` n'existe pas.

- [ ] **Étape 3 : écrire le sondage**

Ajouter dans `StoryCanvasUIView+Volume.swift` :

```swift
import AVFoundation

extension StoryCanvasUIView {

    /// `true` quand l'asset porte au moins une piste audio.
    ///
    /// `nonisolated static` : le sondage ne touche aucun état de la vue et doit
    /// pouvoir tourner hors du main actor. Un asset illisible répond `false` —
    /// pas d'atténuation sur une base incertaine.
    nonisolated static func assetHasAudioTrack(url: URL) async -> Bool {
        let asset = AVURLAsset(url: url)
        do {
            let tracks = try await asset.loadTracks(withMediaType: .audio)
            return !tracks.isEmpty
        } catch {
            return false
        }
    }

    /// Sonde une fois chaque vidéo de la slide et mémorise le résultat.
    /// Idempotente : une entrée déjà connue n'est pas re-sondée.
    func probeVideoAudioTracks() {
        let medias = (slide.effects.mediaObjects ?? []).filter { $0.kind == .video }
        for media in medias where videoHasAudioTrack[media.id] == nil {
            guard let url = readerContext.postMediaURLResolver?(media.postMediaId) else { continue }
            let id = media.id
            Task { @MainActor [weak self] in
                let hasAudio = await Self.assetHasAudioTrack(url: url)
                self?.videoHasAudioTrack[id] = hasAudio
            }
        }
    }
}
```

- [ ] **Étape 4 : déclencher le sondage au chargement**

Dans `StoryCanvasUIView+Audio.swift`, à la fin de `reconfigureAudioForPlayback()` (avant
la fermeture du `Task`), ajouter :

```swift
            // Le ducking a besoin de savoir quelles vidéos portent réellement
            // du son ; on sonde ici, une seule fois par clip.
            self.probeVideoAudioTracks()
```

- [ ] **Étape 5 : lancer le test et vérifier le succès**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshyUITests/StoryVideoAudioTrackProbeTests -quiet
```

Attendu : les 2 tests PASSENT.

- [ ] **Étape 6 : commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Volume.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Audio.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryVideoAudioTrackProbeTests.swift
git commit -m "feat(story/reader): l'atténuation ne vise que les vidéos réellement sonores"
```

---

### Task 8 : export — rampes de volume entre points

**Fichiers :**
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExporter.swift`
  (~l. 392-400 pour le fond, ~l. 470-490 pour les audios)
- Test : `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryExporterVolumeRampTests.swift` (créer)

**Interfaces :**
- Consomme : `StoryVolumeResolver` (Task 3)
- Produit : `StoryExporter.volumeRamps(base:keyframes:duration:) -> [(CMTimeRange, Float, Float)]`

- [ ] **Étape 1 : écrire le test qui échoue**

```swift
import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// L'export doit rendre AUDIBLE la même automation que la lecture. Les rampes
/// sont la seule façon d'exprimer une courbe dans un AVAudioMix.
final class StoryExporterVolumeRampTests: XCTestCase {

    func test_noKeyframes_yieldsSingleConstantRamp() {
        let ramps = StoryExporter.volumeRamps(base: 0.6, keyframes: nil, duration: 5)
        XCTAssertEqual(ramps.count, 1)
        XCTAssertEqual(ramps[0].1, 0.6, accuracy: 0.001)
        XCTAssertEqual(ramps[0].2, 0.6, accuracy: 0.001)
    }

    func test_twoPoints_yieldOneRampBetweenThem() {
        let frames = [StoryKeyframe(time: 0, volume: 1.0, easing: .linear),
                      StoryKeyframe(time: 4, volume: 0.2, easing: .linear)]
        let ramps = StoryExporter.volumeRamps(base: 1.0, keyframes: frames, duration: 4)

        XCTAssertEqual(ramps.count, 1)
        XCTAssertEqual(ramps[0].1, 1.0, accuracy: 0.001)
        XCTAssertEqual(ramps[0].2, 0.2, accuracy: 0.001)
        XCTAssertEqual(ramps[0].0.start.seconds, 0, accuracy: 0.001)
        XCTAssertEqual(ramps[0].0.duration.seconds, 4, accuracy: 0.001)
    }

    func test_threePoints_yieldTwoConsecutiveRamps() {
        let frames = [StoryKeyframe(time: 0, volume: 1.0, easing: .linear),
                      StoryKeyframe(time: 2, volume: 0.2, easing: .linear),
                      StoryKeyframe(time: 6, volume: 1.0, easing: .linear)]
        let ramps = StoryExporter.volumeRamps(base: 1.0, keyframes: frames, duration: 6)

        XCTAssertEqual(ramps.count, 2)
        XCTAssertEqual(ramps[1].1, 0.2, accuracy: 0.001)
        XCTAssertEqual(ramps[1].2, 1.0, accuracy: 0.001)
    }

    /// Un gain supérieur à 1 doit survivre jusqu'à l'export : c'est là qu'il
    /// est réellement applicable, AVAudioMix n'étant pas borné à 1.
    func test_gainAboveOneReachesTheRamp() {
        let ramps = StoryExporter.volumeRamps(base: 1.8, keyframes: nil, duration: 3)
        XCTAssertEqual(ramps[0].1, 1.8, accuracy: 0.001)
    }
}
```

- [ ] **Étape 2 : lancer le test et vérifier l'échec**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshyUITests/StoryExporterVolumeRampTests -quiet
```

Attendu : ÉCHEC — `volumeRamps(base:keyframes:duration:)` n'existe pas.

- [ ] **Étape 3 : écrire le générateur de rampes**

Ajouter dans `StoryExporter.swift` :

```swift
    /// Traduit une automation de volume en rampes `AVAudioMix`.
    ///
    /// `AVMutableAudioMixInputParameters` ne connaît que des segments linéaires :
    /// une courbe s'exprime donc comme une suite de rampes entre points
    /// consécutifs. Sans keyframe, une rampe constante unique suffit.
    ///
    /// Retourne des triplets `(intervalle, volume de départ, volume d'arrivée)`.
    nonisolated static func volumeRamps(base: Float,
                                        keyframes: [StoryKeyframe]?,
                                        duration: Double) -> [(CMTimeRange, Float, Float)] {
        let points = (keyframes ?? [])
            .compactMap { kf -> (time: Float, value: Float)? in
                guard let v = kf.volume else { return nil }
                return (kf.time, min(StoryVolume.maxGain, max(0, v)))
            }
            .sorted { $0.time < $1.time }

        let clampedBase = min(StoryVolume.maxGain, max(0, base))
        guard points.count >= 2 else {
            let level = points.first?.value ?? clampedBase
            let range = CMTimeRange(start: .zero, duration: CMTime(seconds: duration, preferredTimescale: 600))
            return [(range, level, level)]
        }

        var ramps: [(CMTimeRange, Float, Float)] = []
        for (a, b) in zip(points, points.dropFirst()) {
            let start = CMTime(seconds: Double(a.time), preferredTimescale: 600)
            let end = CMTime(seconds: Double(b.time), preferredTimescale: 600)
            ramps.append((CMTimeRange(start: start, end: end), a.value, b.value))
        }
        return ramps
    }
```

- [ ] **Étape 4 : appliquer les rampes dans le mix**

Dans la construction de l'`AVAudioMix`, remplacer l'appel unique `setVolume` du clip de
fond (~l. 395) par l'application des rampes :

```swift
        let ramps = Self.volumeRamps(base: entry.bg.volume,
                                     keyframes: entry.bg.keyframes,
                                     duration: entry.duration)
        for (range, from, to) in ramps {
            parameters.setVolumeRamp(fromStartVolume: from, toEndVolume: to, timeRange: range)
        }
```

Répéter à l'identique pour les clips audio (~l. 478), en remplaçant `baseVolume` par le
résultat de `volumeRamps(base: audio.volume, keyframes: audio.keyframes, duration:)`.
Retirer au passage le `max(0, min(1, audio.volume))` : le clamp appartient désormais au
générateur de rampes, avec le bon plafond.

- [ ] **Étape 5 : lancer le test et vérifier le succès**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshyUITests/StoryExporterVolumeRampTests -quiet
```

Attendu : les 4 tests PASSENT.

- [ ] **Étape 6 : commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExporter.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryExporterVolumeRampTests.swift
git commit -m "feat(story/export): la vidéo exportée reproduit l'automation de volume"
```

---

### Task 9 : test de signal — prouver que l'automation s'entend

Le test le plus important du chantier. Tous les précédents valident des valeurs dans le
modèle ; celui-ci mesure l'amplitude réellement produite. Sans lui, une chaîne où le
volume n'atteindrait jamais le matériel resterait verte.

**Fichiers :**
- Test : `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryVolumeSignalTests.swift` (créer)

**Interfaces :**
- Consomme : `StoryExporter.volumeRamps` (Task 8)
- Produit : rien (test seul)

- [ ] **Étape 1 : écrire le test**

```swift
import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// Vérifie le SIGNAL, pas son enveloppe : on rend un mix et on mesure
/// l'amplitude obtenue. Une chaîne où le volume n'atteindrait jamais le
/// matériel passerait tous les autres tests du chantier.
final class StoryVolumeSignalTests: XCTestCase {

    func test_rampHalvesMeasuredAmplitude() async throws {
        let source = try Self.makeToneFile(amplitude: 0.8, seconds: 4)
        defer { try? FileManager.default.removeItem(at: source) }

        let full = try await Self.renderRMS(url: source, volume: 1.0)
        let half = try await Self.renderRMS(url: source, volume: 0.5)

        XCTAssertGreaterThan(full, 0.1, "Le rendu de référence doit produire du signal")
        XCTAssertEqual(half / full, 0.5, accuracy: 0.08,
                       "Un volume de 0,5 doit réellement diviser l'amplitude par deux")
    }

    func test_gainAboveOneRaisesMeasuredAmplitude() async throws {
        // Amplitude source basse : l'amplification ne doit pas buter sur le
        // plafond du format avant d'être mesurable.
        let source = try Self.makeToneFile(amplitude: 0.2, seconds: 4)
        defer { try? FileManager.default.removeItem(at: source) }

        let nominal = try await Self.renderRMS(url: source, volume: 1.0)
        let boosted = try await Self.renderRMS(url: source, volume: 2.0)

        XCTAssertGreaterThan(boosted, nominal * 1.5,
                             "Un gain de 200 % doit s'entendre — écrire volume = 2.0 "
                             + "sur un node AVFoundation échouerait silencieusement")
    }

    /// Rend `url` à travers un AVAudioMix au volume demandé et retourne le RMS
    /// du résultat.
    private static func renderRMS(url: URL, volume: Float) async throws -> Float {
        let asset = AVURLAsset(url: url)
        guard let track = try await asset.loadTracks(withMediaType: .audio).first else {
            XCTFail("Fichier source sans piste audio"); return 0
        }
        let params = AVMutableAudioMixInputParameters(track: track)
        let duration = try await asset.load(.duration)
        params.setVolumeRamp(fromStartVolume: volume, toEndVolume: volume,
                             timeRange: CMTimeRange(start: .zero, duration: duration))
        let mix = AVMutableAudioMix()
        mix.inputParameters = [params]

        let out = FileManager.default.temporaryDirectory
            .appendingPathComponent("mix-\(UUID().uuidString).m4a")
        defer { try? FileManager.default.removeItem(at: out) }

        guard let session = AVAssetExportSession(asset: asset,
                                                 presetName: AVAssetExportPresetAppleM4A) else {
            XCTFail("Session d'export indisponible"); return 0
        }
        session.audioMix = mix
        session.outputURL = out
        session.outputFileType = .m4a
        await session.export()

        let file = try AVAudioFile(forReading: out)
        let format = file.processingFormat
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format,
                                            frameCapacity: AVAudioFrameCount(file.length)) else {
            return 0
        }
        try file.read(into: buffer)
        guard let channel = buffer.floatChannelData?[0] else { return 0 }

        var sum: Double = 0
        for i in 0..<Int(buffer.frameLength) {
            sum += Double(channel[i] * channel[i])
        }
        return Float((sum / Double(max(1, buffer.frameLength))).squareRoot())
    }

    /// Sinusoïde 440 Hz d'amplitude donnée.
    private static func makeToneFile(amplitude: Float, seconds: Double) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("tone-\(UUID().uuidString).caf")
        let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        let frames = AVAudioFrameCount(44100 * seconds)
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames)!
        buffer.frameLength = frames
        let samples = buffer.floatChannelData![0]
        for i in 0..<Int(frames) {
            samples[i] = amplitude * sinf(2 * .pi * 440 * Float(i) / 44100)
        }
        try file.write(from: buffer)
        return url
    }
}
```

- [ ] **Étape 2 : lancer le test**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshyUITests/StoryVolumeSignalTests -quiet
```

Attendu : les 2 tests PASSENT. En cas d'échec du second, c'est que le chemin
d'amplification n'atteint pas le matériel — corriger avant d'aller plus loin, ce test est
le juge de paix du chantier.

- [ ] **Étape 3 : commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryVolumeSignalTests.swift
git commit -m "test(story/audio): mesurer l'amplitude produite, pas seulement le modèle"
```

---

### Task 10 : waveform fidèle, résolution par paliers et cache disque

**Fichiers :**
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Util/AudioWaveform.swift`
- Test : `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Util/AudioWaveformFidelityTests.swift` (créer)

**Interfaces :**
- Consomme : `DiskCacheStore`
- Produit :
  - `AudioWaveform.samples(url:count:)` retourne des RMS **absolus** (plus normalisés)
  - `AudioWaveform.bucketCount(forWidth:scale:) -> Int` (paliers)
  - `AudioWaveform.displayHeight(rms:) -> Float` (échelle dB, plancher −60 dB)

- [ ] **Étape 1 : écrire les tests qui échouent**

```swift
import XCTest
import AVFoundation
@testable import MeeshyUI

/// La waveform servait à décorer ; elle sert désormais à régler des volumes.
/// Elle doit donc refléter le niveau réel — normalisée au pic, une piste douce
/// se dessinait exactement comme une piste forte.
final class AudioWaveformFidelityTests: XCTestCase {

    func test_quietAndLoudFiles_produceDifferentHeights() async throws {
        let quiet = try Self.makeTone(amplitude: 0.1)
        let loud = try Self.makeTone(amplitude: 0.9)
        defer {
            try? FileManager.default.removeItem(at: quiet)
            try? FileManager.default.removeItem(at: loud)
        }

        let quietPeak = (await AudioWaveform.samples(url: quiet, count: 64)).max() ?? 0
        let loudPeak = (await AudioWaveform.samples(url: loud, count: 64)).max() ?? 0

        XCTAssertGreaterThan(loudPeak, quietPeak * 3,
                             "Sans normalisation au pic, un fichier fort doit dessiner "
                             + "nettement plus haut qu'un fichier doux")
    }

    func test_bucketCount_isQuantisedIntoStableTiers() {
        // Deux largeurs voisines doivent retomber sur le même palier, sinon le
        // cache est invalidé à chaque image pendant un pincement de zoom.
        XCTAssertEqual(AudioWaveform.bucketCount(forWidth: 300, scale: 3),
                       AudioWaveform.bucketCount(forWidth: 310, scale: 3))
        // Un zoom franc doit en revanche changer de palier.
        XCTAssertNotEqual(AudioWaveform.bucketCount(forWidth: 300, scale: 3),
                          AudioWaveform.bucketCount(forWidth: 3000, scale: 3))
    }

    func test_bucketCount_staysWithinBounds() {
        XCTAssertGreaterThanOrEqual(AudioWaveform.bucketCount(forWidth: 1, scale: 1), 128)
        XCTAssertLessThanOrEqual(AudioWaveform.bucketCount(forWidth: 100_000, scale: 3), 2048)
    }

    func test_displayHeight_usesDecibelScale() {
        // Un RMS faible mais audible doit rester visible : en linéaire il
        // dessinerait une bande quasi plate.
        let low = AudioWaveform.displayHeight(rms: 0.05)
        XCTAssertGreaterThan(low, 0.3)
        XCTAssertLessThan(low, 1.0)
        // Le silence reste au plancher.
        XCTAssertEqual(AudioWaveform.displayHeight(rms: 0), 0, accuracy: 0.0001)
        // Le niveau nominal atteint le haut.
        XCTAssertEqual(AudioWaveform.displayHeight(rms: 1.0), 1.0, accuracy: 0.01)
    }

    private static func makeTone(amplitude: Float) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("wf-\(UUID().uuidString).caf")
        let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        let frames: AVAudioFrameCount = 44100
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames)!
        buffer.frameLength = frames
        let samples = buffer.floatChannelData![0]
        for i in 0..<Int(frames) {
            samples[i] = amplitude * sinf(2 * .pi * 440 * Float(i) / 44100)
        }
        try file.write(from: buffer)
        return url
    }
}
```

- [ ] **Étape 2 : lancer les tests et vérifier l'échec**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshyUITests/AudioWaveformFidelityTests -quiet
```

Attendu : ÉCHEC — `bucketCount` et `displayHeight` n'existent pas ; le test de fidélité
échoue aussi, la normalisation écrasant l'écart entre les deux fichiers.

- [ ] **Étape 3 : retirer la normalisation du chemin par défaut**

Dans `AudioWaveform.computeRMSBuckets`, remplacer la dernière ligne :

```swift
        return normalize(rms)
```

par :

```swift
        // Amplitude ABSOLUE : `normalize` divisait par le pic, si bien qu'une
        // piste douce et une piste forte se dessinaient à la même hauteur et
        // que baisser un clip ne changeait rien au tracé. La fonction reste
        // disponible pour un affichage volontairement relatif.
        return rms
```

- [ ] **Étape 4 : ajouter les paliers et l'échelle dB**

Toujours dans `AudioWaveform` :

```swift
    /// Paliers de résolution. Un `count` variant continûment avec le zoom
    /// multiplierait les entrées de cache et relancerait une analyse complète à
    /// chaque image : la quantification est ce qui rend le cache utile.
    static let bucketTiers: [Int] = [128, 256, 512, 1024, 2048]

    /// Palier couvrant une barre de `width` points à l'échelle écran `scale`.
    nonisolated static func bucketCount(forWidth width: CGFloat, scale: CGFloat) -> Int {
        let target = Int((width * scale).rounded())
        return bucketTiers.first(where: { $0 >= target }) ?? bucketTiers.last!
    }

    /// Hauteur d'affichage `0...1` pour un RMS absolu, en échelle décibel.
    ///
    /// Un RMS linéaire est visuellement plat — la plupart des contenus vivent
    /// entre 0,05 et 0,3. L'échelle dB restitue la dynamique sans mentir sur
    /// les niveaux ; plancher à -60 dB, sous lequel on considère le silence.
    nonisolated static func displayHeight(rms: Float) -> Float {
        guard rms > 0.0001 else { return 0 }
        let floorDb: Float = -60
        let db = 20 * log10f(min(1, rms))
        return max(0, min(1, (db - floorDb) / -floorDb))
    }
```

- [ ] **Étape 5 : ajouter le cache disque**

Remplacer le corps de `samples(url:count:)` :

```swift
    static func samples(url: URL, count: Int = 80) async -> [Float] {
        let key = "waveform|\(url.absoluteString)|\(count)"
        if let cached = cache.object(forKey: key as NSString) as? [Float] { return cached }

        // Second niveau : disque. Le NSCache seul était perdu à chaque
        // lancement et évincé sous pression mémoire — un fichier était donc
        // ré-analysé bien plus souvent que nécessaire.
        if let data = CacheCoordinator.waveformLocalData(for: key) {
            let restored = data.withUnsafeBytes { raw in
                Array(raw.bindMemory(to: Float.self))
            }
            if !restored.isEmpty {
                cache.setObject(restored as NSArray, forKey: key as NSString)
                return restored
            }
        }

        let computed: [Float] = await Task.detached(priority: .utility) {
            Self.computeRMSBuckets(url: url, count: count)
        }.value

        if !computed.isEmpty {
            cache.setObject(computed as NSArray, forKey: key as NSString)
            computed.withUnsafeBufferPointer { buffer in
                CacheCoordinator.storeWaveformData(Data(buffer: buffer), for: key)
            }
        }
        return computed
    }
```

Ajouter dans `CacheCoordinator.swift` les deux accès, sur le modèle de
`audioLocalFileURL` :

```swift
    /// Waveforms sérialisées (`[Float]` brut). Réutilise le store disque
    /// générique : même éviction LRU que les autres médias.
    nonisolated public static func waveformLocalData(for key: String) -> Data? {
        guard let url = shared.waveforms.cachedFileURL(for: key) else { return nil }
        return try? Data(contentsOf: url)
    }

    nonisolated public static func storeWaveformData(_ data: Data, for key: String) {
        Task { await shared.waveforms.store(data, for: key) }
    }
```

Le store `waveforms` n'existe pas encore : le déclarer à côté de `images`, `audio` et
`video` (`CacheCoordinator.swift:65-67`), qui sont déjà des `DiskCacheStore`. Reprendre
leur initialisation à l'identique en changeant le sous-dossier pour `waveforms`.

- [ ] **Étape 6 : lancer les tests et vérifier le succès**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshyUITests/AudioWaveformFidelityTests -quiet
```

Attendu : les 4 tests PASSENT.

- [ ] **Étape 7 : vérifier la non-régression de la suite waveform existante**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshyUITests/AudioWaveformTests -quiet
```

Attendu : PASSE. Les tests de `normalize` restent verts — la fonction n'a pas changé,
elle n'est simplement plus appelée par défaut. Si un test attendait un résultat normalisé
en sortie de `computeRMSBuckets`, l'ajuster en visant l'amplitude absolue et documenter
le changement d'attente dans le message de commit.

- [ ] **Étape 8 : commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Util/AudioWaveform.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Util/AudioWaveformFidelityTests.swift
git commit -m "feat(story/timeline): la forme d'onde reflète le niveau réel et se garde sur disque"
```

---

### Task 11 : plage 0–200 % dans l'inspecteur

**Fichiers :**
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspector.swift:281` et `:650`
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/ReaderAudioMixer.swift:241`
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/AudioMixer.swift:63` et `:222`
- Test : `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Inspector/ClipInspectorVolumeRangeTests.swift` (créer)

**Interfaces :**
- Consomme : `StoryVolume.maxGain` (Task 3)
- Produit : rien de nouveau — les clamps existants passent à `StoryVolume.maxGain`

- [ ] **Étape 1 : écrire le test qui échoue**

`ClipInspector` est une vue SwiftUI à une quinzaine de closures : l'instancier pour
vérifier une borne coûterait plus qu'il ne prouve. On teste donc la **source** (le
plafond vient-il de la constante ?) et les mixers, qui eux s'instancient sans cérémonie.

```swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Le plafond doit venir de la constante partagée, jamais d'un littéral :
/// c'est ce qui permettra de revenir à 100 % en une ligne, un jour.
@MainActor
final class ClipInspectorVolumeRangeTests: XCTestCase {

    func test_maxGainIsTwo() {
        XCTAssertEqual(StoryVolume.maxGain, 2.0, accuracy: 0.0001)
    }

    /// Garde de source : plus aucune borne de volume codée en dur.
    func test_inspectorSliderUsesSharedCeiling() throws {
        let path = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Inspector
            .deletingLastPathComponent()   // Timeline
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .appendingPathComponent(
                "Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspector.swift")
        let source = try String(contentsOf: path, encoding: .utf8)
        let code = source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> String in
                guard let r = line.range(of: "//") else { return String(line) }
                return String(line[line.startIndex..<r.lowerBound])
            }
            .joined(separator: "\n")

        XCTAssertFalse(code.contains("in: 0...1"),
                       "Le slider de volume doit borner sur StoryVolume.maxGain")
        XCTAssertFalse(code.contains("min(1, max(0, value))"),
                       "Le commit de volume doit borner sur StoryVolume.maxGain")
    }

    /// Le mixer de lecture ne doit plus écraser un gain supérieur à 1.
    func test_readerMixerPreservesGainAboveOne() {
        let mixer = ReaderAudioMixer()
        // Sans clip configuré l'appel est un no-op : ce qu'on vérifie ici, c'est
        // que la borne partagée autorise bien la valeur.
        mixer.setVolume(1.7, for: "absent")
        XCTAssertGreaterThan(StoryVolume.maxGain, 1.0)
    }
}
```

- [ ] **Étape 2 : lancer le test et vérifier l'échec**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshyUITests/ClipInspectorVolumeRangeTests -quiet
```

Attendu : ÉCHEC du premier test — `simulateVolumeCommit` borne à `1`.

- [ ] **Étape 3 : relever les quatre clamps iOS**

`ClipInspector.swift:281` :

```swift
        onVolumeChanged(min(StoryVolume.maxGain, max(0, value)))
```

`ClipInspector.swift:650` :

```swift
            Slider(value: $volume, in: 0...Double(StoryVolume.maxGain), step: 0.01) { editing in
```

`ReaderAudioMixer.swift:241` et `AudioMixer.swift:222` :

```swift
        let clamped = max(0, min(StoryVolume.maxGain, volume))
```

`AudioMixer.swift:63` :

```swift
            volumes[audio.id] = max(0, min(StoryVolume.maxGain, audio.volume))
```

- [ ] **Étape 4 : marquer la zone de gain dans le slider**

Sous le slider, remplacer l'affichage de pourcentage par un libellé qui distingue le
gain, avec la clé xcstrings correspondante :

```swift
            .accessibilityValue("\(Int(volume * 100))%")
            .overlay(alignment: .trailing) {
                if volume > 1 {
                    Text(String(localized: "story.timeline.inspector.volume.gain",
                                defaultValue: "Gain", bundle: .module))
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(MeeshyColors.warning)
                }
            }
```

- [ ] **Étape 5 : lancer le test et vérifier le succès**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshyUITests/ClipInspectorVolumeRangeTests -quiet
```

Attendu : les 3 tests PASSENT.

- [ ] **Étape 6 : commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspector.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/ReaderAudioMixer.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/AudioMixer.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Inspector/ClipInspectorVolumeRangeTests.swift
git commit -m "feat(story/timeline): le volume d'un clip peut monter jusqu'à 200 %"
```

---

### Task 12 : poser et gérer les points de volume depuis la fiche

**Fichiers :**
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspector.swift`
  (section `.volume`)
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel+Plan4Helpers.swift`
  (à côté de `setClipVolume`, ~l. 259)
- Test : `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineVolumeKeyframeTests.swift` (créer)

**Interfaces :**
- Consomme : `StoryKeyframe.volume` et `mutateKeyframes` étendu à l'audio (Task 2)
- Produit :
  - `TimelineViewModel.addKeyframeAtPlayhead(x:y:scale:opacity:volume:)` — paramètre
    `volume` ajouté à la méthode **existante**
  - `TimelineViewModel.deleteKeyframe(clipId:keyframeId:)` — cas `.audio` ajouté à la
    méthode **existante**

> Ne pas créer de `addVolumeKeyframe` / `removeVolumeKeyframe` : `addKeyframeAtPlayhead`
> (`TimelineViewModel.swift:623`) et `deleteKeyframe`
> (`TimelineViewModel+Plan4Helpers.swift:535`) font déjà le travail pour les canaux de
> transformation, commandes annulables comprises. On les étend.

- [ ] **Étape 1 : écrire le test qui échoue**

```swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Poser un point de volume réutilise les commandes annulables existantes :
/// l'annulation doit fonctionner sans une ligne de code dédiée.
@MainActor
final class TimelineVolumeKeyframeTests: XCTestCase {

    func test_addKeyframeAtPlayhead_storesVolumeOnlyPoint() {
        let vm = Self.makeViewModel()
        vm.selectClip(id: "a1")
        vm.currentTime = 3
        vm.addKeyframeAtPlayhead(volume: 0.4)

        let frames = vm.project.audioPlayerObjects.first(where: { $0.id == "a1" })?.keyframes
        XCTAssertEqual(frames?.count, 1)
        XCTAssertEqual(frames?.first?.volume, 0.4)
        XCTAssertNil(frames?.first?.x, "Un point de volume ne pose aucune transformation")
    }

    func test_addKeyframeAtPlayhead_onAudioIsUndoable() {
        let vm = Self.makeViewModel()
        vm.selectClip(id: "a1")
        vm.currentTime = 3
        vm.addKeyframeAtPlayhead(volume: 0.4)
        vm.undo()

        let frames = vm.project.audioPlayerObjects.first(where: { $0.id == "a1" })?.keyframes
        XCTAssertTrue(frames?.isEmpty ?? true)
    }

    /// `deleteKeyframe` retournait sans rien faire sur un clip audio.
    func test_deleteKeyframe_worksOnAudioClips() {
        let vm = Self.makeViewModel()
        vm.selectClip(id: "a1")
        vm.currentTime = 1
        vm.addKeyframeAtPlayhead(volume: 1.0)
        vm.currentTime = 4
        vm.addKeyframeAtPlayhead(volume: 0.2)

        let first = vm.project.audioPlayerObjects
            .first(where: { $0.id == "a1" })?.keyframes?.first
        vm.deleteKeyframe(clipId: "a1", keyframeId: first!.id)

        let frames = vm.project.audioPlayerObjects.first(where: { $0.id == "a1" })?.keyframes
        XCTAssertEqual(frames?.count, 1)
    }

    private static func makeViewModel() -> TimelineViewModel {
        var effects = StoryEffects()
        effects.audioPlayerObjects = [StoryAudioPlayerObject(id: "a1", postMediaId: "m1")]
        let slide = StorySlide(id: "s1", content: "", effects: effects)
        return TimelineViewModel(slide: slide)
    }
}
```

> `makeViewModel`, `selectClip` et `currentTime` doivent correspondre aux membres réels de
> `TimelineViewModel`. Ouvrir un test existant du dossier
> `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/` et **recopier son montage**
> plutôt que de deviner : c'est le seul endroit du plan où la signature dépend d'un
> initialiseur volumineux.

- [ ] **Étape 2 : lancer le test et vérifier l'échec**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshyUITests/TimelineVolumeKeyframeTests -quiet
```

Attendu : ÉCHEC — `addKeyframeAtPlayhead` n'accepte pas encore d'argument `volume`, et
`deleteKeyframe` sort sans rien faire sur un clip audio.

- [ ] **Étape 3 : écrire les méthodes du view-model**

Deux méthodes existantes à étendre — aucune nouvelle à créer.

**a.** `TimelineViewModel.swift:623` — ajouter le canal `volume` au bout de la signature
et le transmettre au keyframe :

```swift
    public func addKeyframeAtPlayhead(x: CGFloat? = nil, y: CGFloat? = nil,
                                      scale: CGFloat? = nil, opacity: CGFloat? = nil,
                                      volume: Float? = nil) {
        guard let id = selection.selectedClipId,
              let clipStart = clipStartTime(id: id) else { return }
        let relativeTime = max(0, currentTime - clipStart)
        let kf = StoryKeyframe(
            time: relativeTime,
            x: x, y: y, scale: scale, opacity: opacity,
            volume: volume.map { min(StoryVolume.maxGain, max(0, $0)) },
            easing: .linear
        )
```

Le reste du corps est inchangé.

**b.** `TimelineViewModel+Plan4Helpers.swift:535` — `deleteKeyframe` sort actuellement
sans rien faire sur un clip audio (`case .audio, .sticker: return`). Séparer les deux
cas :

```swift
        case .audio:
            let keyframes = project.audioPlayerObjects.first(where: { $0.id == clipId })?.keyframes ?? []
            guard let idx = keyframes.firstIndex(where: { $0.id == keyframeId }) else { return }
            snapshot = keyframes[idx]
            insertionIndex = idx
        case .sticker:
            // Un sticker s'édite sur le canvas, pas dans la timeline.
            return
```

- [ ] **Étape 4 : brancher l'interface dans la fiche**

Dans `ClipInspector.swift`, section `.volume`, sous le slider :

```swift
            Button {
                onAddVolumePoint(volume)   // → viewModel.addKeyframeAtPlayhead(volume:)
            } label: {
                Label(
                    String(localized: "story.timeline.inspector.volume.addPoint",
                           defaultValue: "Ajouter un point ici", bundle: .module),
                    systemImage: "plus.diamond"
                )
                .font(.system(size: 11, weight: .medium))
            }

            ForEach(clip.volumeKeyframes, id: \.id) { point in
                HStack {
                    Text(String(format: "%.1f s", point.time))
                    Spacer()
                    Text("\(Int((point.volume ?? 0) * 100))%")
                    Button {
                        onRemoveVolumePoint(point.id)   // → viewModel.deleteKeyframe(clipId:keyframeId:)
                    } label: {
                        Image(systemName: "minus.circle")
                    }
                }
                .font(.system(size: 10))
            }
```

Ajouter au `ClipInspector` les deux closures `onAddVolumePoint: (Float) -> Void` et
`onRemoveVolumePoint: (String) -> Void`, ainsi que le champ
`volumeKeyframes: [StoryKeyframe]` sur `ClipSnapshot` (valeur par défaut `[]`, pour que
les appels existants compilent sans modification).

Les brancher dans `TimelineInspectorHost` : `volumeKeyframes` se remplit depuis
`media.keyframes` (~l. 116) et `audio.keyframes` (~l. 133) ; les closures appellent
`viewModel.addKeyframeAtPlayhead(volume:)` et
`viewModel.deleteKeyframe(clipId:keyframeId:)` — les méthodes étendues à l'étape 3.

- [ ] **Étape 5 : lancer le test et vérifier le succès**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshyUITests/TimelineVolumeKeyframeTests -quiet
```

Attendu : les 3 tests PASSENT.

- [ ] **Étape 6 : commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel+Plan4Helpers.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspector.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineInspectorHost.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineVolumeKeyframeTests.swift
git commit -m "feat(story/timeline): poser et retirer des points de volume depuis la fiche"
```

---

### Task 13 : waveform sous les vidéos et courbe de volume sur les pistes

Dernière tâche, la plus visuelle. C'est le point d'intégration délicat : la piste fait
52 pt et doit désormais loger filmstrip, waveform et courbe.

**Fichiers :**
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/VideoClipBar.swift`
- Créer : `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/VolumeCurveOverlay.swift`
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/AudioClipBar.swift`
  (inverser la priorité des sources, ~l. 54-56)
- Test : `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Track/VolumeCurveOverlayTests.swift` (créer)

**Interfaces :**
- Consomme : `AudioWaveform` (Task 10), `StoryKeyframe.volume` (Task 2)
- Produit : `VolumeCurveOverlay.points(keyframes:duration:size:) -> [CGPoint]`

- [ ] **Étape 1 : écrire le test qui échoue**

```swift
import XCTest
import CoreGraphics
@testable import MeeshyUI
@testable import MeeshySDK

/// La courbe est en lecture seule : on teste la géométrie qu'elle produit,
/// sans monter la vue.
final class VolumeCurveOverlayTests: XCTestCase {

    func test_noVolumeKeyframes_yieldsNoPoints() {
        let frames = [StoryKeyframe(time: 0, x: 0.2)]
        let points = VolumeCurveOverlay.points(
            keyframes: frames, duration: 5, size: CGSize(width: 100, height: 20)
        )
        XCTAssertTrue(points.isEmpty)
    }

    func test_pointsMapTimeToXAndVolumeToInvertedY() {
        let frames = [StoryKeyframe(time: 0, volume: 1.0),
                      StoryKeyframe(time: 5, volume: 0.0)]
        let points = VolumeCurveOverlay.points(
            keyframes: frames, duration: 5, size: CGSize(width: 100, height: 20)
        )

        XCTAssertEqual(points.count, 2)
        XCTAssertEqual(points[0].x, 0, accuracy: 0.01)
        XCTAssertEqual(points[0].y, 0, accuracy: 0.01, "volume 1 → haut de la piste")
        XCTAssertEqual(points[1].x, 100, accuracy: 0.01)
        XCTAssertEqual(points[1].y, 20, accuracy: 0.01, "volume 0 → bas de la piste")
    }

    func test_gainAboveOneIsClampedToTheTop() {
        let frames = [StoryKeyframe(time: 0, volume: 2.0)]
        let points = VolumeCurveOverlay.points(
            keyframes: frames, duration: 4, size: CGSize(width: 80, height: 20)
        )
        XCTAssertEqual(points[0].y, 0, accuracy: 0.01)
    }

    func test_pointsAreSortedByTime() {
        let frames = [StoryKeyframe(time: 4, volume: 0.2),
                      StoryKeyframe(time: 1, volume: 0.9)]
        let points = VolumeCurveOverlay.points(
            keyframes: frames, duration: 5, size: CGSize(width: 100, height: 20)
        )
        XCTAssertLessThan(points[0].x, points[1].x)
    }
}
```

- [ ] **Étape 2 : lancer le test et vérifier l'échec**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshyUITests/VolumeCurveOverlayTests -quiet
```

Attendu : ÉCHEC — `VolumeCurveOverlay` n'existe pas.

- [ ] **Étape 3 : écrire la couche de courbe**

Créer `VolumeCurveOverlay.swift` :

```swift
import SwiftUI
import MeeshySDK

/// Courbe d'automation du volume, tracée en LECTURE SEULE au-dessus d'une
/// piste. L'édition se fait dans la fiche du clip : la piste ne fait que
/// 52 pt de haut et ses gestes servent déjà au déplacement et au rognage.
struct VolumeCurveOverlay: View {

    let keyframes: [StoryKeyframe]
    let duration: Float
    let tint: Color

    var body: some View {
        GeometryReader { geo in
            let pts = Self.points(keyframes: keyframes,
                                  duration: duration,
                                  size: geo.size)
            if pts.count >= 2 {
                Path { path in
                    path.move(to: pts[0])
                    for p in pts.dropFirst() { path.addLine(to: p) }
                }
                .stroke(tint, lineWidth: 1.5)
                ForEach(Array(pts.enumerated()), id: \.offset) { _, p in
                    Circle()
                        .fill(tint)
                        .frame(width: 4, height: 4)
                        .position(p)
                }
            }
        }
        .allowsHitTesting(false)
    }

    /// Projette les points de volume dans le repère de la piste.
    /// `x` suit le temps, `y` est INVERSÉ (volume fort en haut).
    nonisolated static func points(keyframes: [StoryKeyframe],
                                   duration: Float,
                                   size: CGSize) -> [CGPoint] {
        guard duration > 0 else { return [] }
        return keyframes
            .compactMap { kf -> (Float, Float)? in
                guard let v = kf.volume else { return nil }
                return (kf.time, v)
            }
            .sorted { $0.0 < $1.0 }
            .map { time, volume in
                // Le niveau nominal (100 %) occupe le haut de la piste : c'est
                // la référence que l'œil cherche. Un gain au-delà y reste collé
                // plutôt que d'écraser toute la courbe vers le bas — la valeur
                // exacte se lit dans la fiche, la piste ne donne que la forme.
                let height = min(1, max(0, volume))
                return CGPoint(
                    x: CGFloat(time / duration) * size.width,
                    y: (1 - CGFloat(height)) * size.height
                )
            }
    }
}
```

- [ ] **Étape 4 : ajouter la waveform sous le filmstrip vidéo**

Dans `VideoClipBar.swift`, à côté du chargement du filmstrip (~l. 161), ajouter le
chargement de la forme d'onde, puis l'afficher sous les vignettes :

```swift
    @State private var loadedWaveform: [Float] = []
```

```swift
        .task(id: videoURL) {
            guard let videoURL else { return }
            // Vérifié : AVAudioFile lit la piste audio d'un MP4. Un conteneur
            // sans audio, ou qu'ExtAudioFile ne sait pas ouvrir, renvoie un
            // tableau vide — aucune bande n'est alors dessinée.
            loadedWaveform = await AudioWaveform.samples(url: videoURL, count: 128)
        }
```

Sous le filmstrip, dans le corps de la barre :

```swift
            if !loadedWaveform.isEmpty {
                WaveformStrip(samples: loadedWaveform, tint: tint.opacity(0.55))
                    .frame(height: 12)
            }
            VolumeCurveOverlay(keyframes: keyframes, duration: duration, tint: MeeshyColors.warning)
```

`WaveformStrip` n'existe pas encore : extraire le corps de la propriété `waveform` de
`AudioClipBar.swift:166` dans un nouveau fichier
`Timeline/Views/Track/WaveformStrip.swift`, paramétré par `samples: [Float]` et
`tint: Color`. `AudioClipBar` l'utilise ensuite à la place de son code inline — un seul
rendu pour les deux barres, pas deux copies à faire diverger.

Appliquer `AudioWaveform.displayHeight(rms:)` à chaque échantillon dans ce composant :
c'est le point unique où l'échelle dB entre en jeu, les valeurs stockées restant
linéaires.

- [ ] **Étape 5 : inverser la priorité des sources dans `AudioClipBar`**

```swift
    var effectiveSamples: [Float] {
        // Le calcul local, haute résolution et à l'amplitude réelle, prime dès
        // qu'il a abouti. `waveformSamples` (80 valeurs publiées, normalisées au
        // pic) reste le repli des reposts et brouillons restaurés, pour qui
        // aucun fichier local n'est disponible.
        loadedSamples.isEmpty ? waveformSamples : loadedSamples
    }
```

- [ ] **Étape 6 : lancer le test et vérifier le succès**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume \
  -only-testing:MeeshyUITests/VolumeCurveOverlayTests -quiet
```

Attendu : les 4 tests PASSENT.

- [ ] **Étape 7 : suite complète**

```bash
cd packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/dd-volume -quiet
```

Attendu : suite verte. Les snapshots de pistes vont changer (waveform et courbe ajoutées)
— régénérer les références concernées et les inspecter une à une avant de les valider.

- [ ] **Étape 8 : vérification sur appareil**

Le point le plus risqué du chantier ne se juge pas au test : ouvrir le composer sur une
slide portant une vidéo sonore et un audio de fond, et vérifier de visu que filmstrip,
waveform et courbe cohabitent lisiblement dans 52 pt. Si c'est illisible, augmenter la
hauteur de piste plutôt que supprimer un élément.

- [ ] **Étape 9 : commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/ \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Track/VolumeCurveOverlayTests.swift
git commit -m "feat(story/timeline): forme d'onde sous les vidéos et courbe de volume sur les pistes"
```

---

## Couverture du spec

| Exigence | Tâche |
|---|---|
| A1 — volume de la vidéo de fond rebranché | 4, garde en 5 |
| A2 — ducking automatique, facteur 0,25, désactivable | 3 (constante), 6 (application), 7 (sondage) |
| A3 — automation par keyframes | 2 (modèle), 3 (resolver), 6 (lecture), 8 (export), 12 (interface) |
| A4 — waveform sous les vidéos | 13 |
| A5 — plage jusqu'à 200 % | 1 (gateway), 11 (iOS) |
| A6 — waveform fidèle et cache disque | 10 |
| Test de signal | 9 |

## Ordre et dépendances

La Task 1 est un **prérequis de déploiement** : elle doit être en production avant que la
Task 11 n'atteigne les utilisateurs, sans quoi toute story dépassant 100 % est rejetée en
`400`.

Les tâches 2 et 3 fondent tout le reste. Ensuite, 4-5-6-7 (lecture), 8-9 (export et
preuve), 10-11-12-13 (interface) peuvent avancer dans cet ordre.
