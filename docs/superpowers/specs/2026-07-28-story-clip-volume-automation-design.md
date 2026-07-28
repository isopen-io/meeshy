# Volume par clip, automation et ducking — Timeline story

Date : 2026-07-28
Statut : design validé, prêt pour le plan d'implémentation
Chantier : **A — Son & volume** (le chantier B, navigation timeline, fait l'objet d'un spec séparé)

## 1. Origine

Un utilisateur signale qu'un audio de fond « ne se joue pas » dans le lecteur de story.

L'investigation a écarté toute la moitié « données » de la chaîne, preuves à l'appui, sur une
story réelle (`6a67b3f0181d4a213de35a27`, 2026-07-27) :

| Maillon | Constat |
|---|---|
| `audioPlayerObjects[0].isBackground` | `true` |
| `postMediaId` | présent dans `media[]`, `mimeType: audio/mp4` |
| `startTime` / `fadeIn` / `fadeOut` | absents → 0, donc pas de démarrage différé |
| Fichier HTTP | `200`, 5,5 Mo, accessible |
| Décodage `AVAudioFile` | 239,6 s, 48 kHz stéréo, amplitude crête 0,47 |

Le son jouait donc bien. Le vrai symptôme : la **vidéo de fond de la même slide**
(`volume: 1`) le couvrait, sans aucun moyen de l'atténuer.

## 2. Ce qui existe déjà

Une part notable du besoin est déjà en place et ne doit pas être réécrite :

- **Slider de volume par clip** — `ClipInspector` section `.volume`, relié à
  `setClipVolume`, undoable via `SetClipPropertyCommand`. Exposé pour les clips
  vidéo et audio, y compris de fond (`hasAudioAffordances`).
- **Pistes audio de fond et d'avant-plan** — `resolveAllTracks` produit déjà les
  sections FOND (`bgImages`, `bgAudios`, `bgVideos`) et AVANT-PLAN
  (`fgImages`, `fgAudios`, `fgVideos`, `texts`, `stickers`).
- **Waveform** — `AudioWaveform.samples(url:count:)`, asynchrone et mise en cache,
  déjà rendue par `AudioClipBar`.
- **Keyframes** — `StoryKeyframe` (champs optionnels), `KeyframeInterpolator`
  générique sur `Lerpable` (**`Float` est déjà conforme**), commandes undoables
  `AddKeyframe` / `MoveKeyframe` / `DeleteKeyframe`, marqueurs (`KeyframeMarkerView`,
  `LaneKeyframeOverlays`), application au rendu par `StoryRenderer.keyframeOverrides`.
- **Volume à l'export** — `StoryExporter` construit déjà un `AVAudioMix` à partir du
  `volume` du clip et de ses fondus ; `VideoCompositionBuilder` sait faire
  `setVolumeRamp`.

### Défauts constatés dans l'existant

1. **Le volume d'une vidéo de fond est ignoré à la lecture.**
   `StoryBackgroundLayer.attachBackgroundPlayer` force `avPlayer?.volume = 1.0` et ne
   lit jamais `StoryMediaObject.volume`. La couche n'expose que `isMuted`, pas de
   `volume`. `StoryMediaLayer` (avant-plan) respecte bien `media.volume`.
   Asymétrie révélatrice : **l'export applique ce volume, la lecture non**.
2. **`ReaderAudioMixer.duckingEnabled` / `duckedBackgroundVolume` sont du code mort** —
   câblés nulle part. Leur sémantique est de surcroît inverse du besoin : ils atténuent
   le *fond* quand un audio d'*avant-plan* joue. Ils ne sont pas réutilisés.
3. **`ReaderKeyframeResolver` est un doublon mort** — appelé uniquement par ses tests.
   Le chemin vivant est `StoryRenderer.keyframeOverrides`.
4. **`StoryAudioPlayerObject` n'a pas de `keyframes`** (`StoryMediaObject` si).

## 3. Décisions

| Sujet | Décision |
|---|---|
| Nature du contrôle | Automation par keyframes, pas un simple niveau constant |
| Geste d'édition | Depuis la fiche du clip ; la courbe sur la piste est en lecture seule |
| Comportement par défaut | Ducking automatique |
| Intensité du ducking | Facteur **0,25** (la vidéo joue à un quart), **désactivable** par clip |
| Modèle | Étendre `StoryKeyframe` plutôt qu'un champ d'automation dédié |
| Plage de volume | **0 % à 200 %** |
| Découpage | Chantier A ici ; navigation timeline (règle + scroll) dans un spec séparé |

Le modèle partagé l'emporte parce que l'interpolation, les commandes undoables, les
marqueurs et la persistance existent déjà. L'objection sémantique — un volume n'est pas
une transformation visuelle — est neutralisée en filtrant sur `volume != nil` pour
dessiner la courbe séparément : le modèle est commun, la représentation ne l'est pas.

## 4. Périmètre

| | Contenu |
|---|---|
| **A1** | Rebrancher le volume de la vidéo de fond |
| **A2** | Ducking automatique vidéo ↔ audio de fond |
| **A3** | Automation du volume par keyframes |
| **A4** | Waveform sous les lignes vidéo |
| **A5** | Plage de volume étendue à 200 % |
| **A6** | Waveform fidèle à l'amplitude réelle, mise en cache sur disque |

Hors périmètre : graduation de la règle, contrôleur de scroll global, limiteur
anti-saturation, parité web et Android.

## 5. Modèle

Deux ajouts, tous deux optionnels — aucune story existante n'est affectée :

```swift
StoryKeyframe.volume: Float?                        // 5ᵉ canal, à côté de x/y/scale/opacity
StoryAudioPlayerObject.keyframes: [StoryKeyframe]?  // parité avec StoryMediaObject
```

Les deux rejoignent `CodingKeys` et `StoryEffects.toJSON()`. Le schéma Zod de la
gateway est en `.passthrough()` : aucun champ n'est supprimé au passage.

`keyframe.time` reste **relatif au `startTime` du clip** — convention déjà en vigueur,
elle n'est pas modifiée.

## 6. Resolver unique

Une fonction pure, seule source de vérité pour les trois surfaces :

```swift
StoryVolumeResolver.effectiveVolume(base: Float,
                                    keyframes: [StoryKeyframe]?,
                                    at time: Float) -> Float
```

Règles, calquées sur le *gating* que `StoryRenderer` applique déjà aux autres canaux :

- aucun keyframe portant un `volume` → retourne `base` ;
- playhead **avant** le premier point de volume → retourne `base` (pas de saut à
  l'ouverture) ;
- sinon → `KeyframeInterpolator` avec l'easing du point d'origine ;
- résultat borné à `[0, 2]` ;
- les points reçus non triés sont ordonnés avant interpolation.

## 7. Application

Le volume n'est pas une propriété de `CALayer` : il ne transite donc pas par
`keyframeOverrides` mais par un chemin parallèle vers les lecteurs. C'est la seule
nouveauté structurelle du chantier.

| Surface | Point d'injection |
|---|---|
| Lecture + composer | Tick du `CADisplayLink` existant |
| Export vidéo | `setVolumeRamp` entre points consécutifs, dans l'`AVAudioMix` de `StoryExporter` |
| Preview timeline | `AudioMixer` du `StoryTimelineEngine`, même resolver |

**A1** en découle : `StoryBackgroundLayer` gagne une propriété `volume` avec `didSet`
vers `avPlayer` — exactement la forme de son `isMuted` actuel — alimentée par
`resolvedBackgroundMedia.volume`. Le `avPlayer?.volume = 1.0` codé en dur disparaît, et
une garde de source empêche sa réintroduction.

**A2** s'applique comme un **multiplicateur**, calculé au même point d'injection et
**jamais écrit dans le modèle**. Deux conséquences voulues : l'auteur garde la main, et
l'atténuation bénéficie aussi aux stories **déjà publiées**. Le ducking ne se déclenche
que si la slide porte un audio de fond *et* une vidéo dont la piste audio existe
réellement. Une bascule par clip permet de le désactiver.

**Détecter la présence d'une piste audio.** `StoryAudioAvailability.videoAudioTracks`
ne convient pas comme source de vérité : c'est une table alimentée **uniquement par
`StoryViewerView`**, absente du composer et de l'export — deux des trois surfaces
concernées. La présence d'une piste se détermine donc par
`AVAsset.loadTracks(withMediaType: .audio)`, disponible partout, la table du viewer
restant au mieux un cache opportuniste. Sonde à faire une fois par clip et à mémoriser,
pas à chaque tick.

Ordre de composition, du modèle vers le matériel :

```
base → automation (keyframes) → ducking (×0,25) → mute global (×0) → gain matériel
```

## 8. Volume jusqu'à 200 %

`AVPlayer.volume` et `AVAudioPlayerNode.volume` sont documentés par Apple sur
`0.0...1.0` : y écrire `2.0` n'amplifie pas. Dépasser 100 % impose donc deux chemins
distincts, tandis que la plage `0...1` conserve le chemin actuel :

- **vidéos** → `AVPlayerItem.audioMix` avec `AVMutableAudioMixInputParameters.setVolume`,
  qui n'est pas borné à 1 ;
- **audios du mixer** → un `AVAudioUnitEQ` inséré dans la chaîne du node, piloté en
  décibels (`gain_dB = 20·log₁₀(facteur)`, soit +6 dB à 200 %) ;
- **export** → déjà compatible, `AVAudioMix` accepte les gains supérieurs à 1.

Les huit plafonds à lever :

| Fichier | Emplacement |
|---|---|
| `services/gateway/src/routes/posts/types.ts` | l. 90 et 140 — `max(1)` → `max(2)` |
| `ClipInspector.swift` | l. 281 (clamp) et 650 (`in: 0...1`) |
| `ReaderAudioMixer.swift` | l. 241 |
| `AudioMixer.swift` | l. 63 et 222 |
| `StoryExporter.swift` | l. 478 |

Le changement Zod est **bloquant** : sans lui, publier une story portant un volume
supérieur à 1 renvoie `400`. Il impose un déploiement de la gateway.

### Saturation : capacité assumée, pas défaut à corriger

Amplifier ×2 un fichier déjà mastérisé près de 0 dBFS écrête. C'est **voulu** : l'auteur
doit pouvoir pousser un son au-delà de son niveau nominal quand la composition l'exige,
quitte à saturer. Aucun limiteur, aucune correction automatique, aucun avertissement
bloquant. Le slider signale simplement que la zone au-delà de 100 % est un gain.

Le réglage se fait à la composition et **se persiste dans le JSON de la story**
(`storyEffects`), au même titre que les autres propriétés de clip : la valeur est donc
partagée avec tous les clients qui liront cette story.

Le plafond vit dans **une constante unique et documentée** (`StoryVolume.maxGain = 2.0`),
consommée par le slider, les clamps et la validation. Le ramener à `1.0` plus tard est
un changement d'une ligne côté app, plus l'ajustement symétrique du schéma Zod.

### Comportement des autres clients

| Client | Valeur > 1 |
|---|---|
| iOS antérieur | Bornée à 1,0 — le clip joue moins fort |
| Web | Bornée à 1,0 par `Math.min` (`StoryViewer.tsx`) |
| Android | Décodée sans erreur (`Story.kt`, `volume: Float`) |

Aucun client n'échoue : tous dégradent vers 100 %. La parité web au-delà de 100 %
resterait de toute façon impossible en l'état — la spec HTML borne
`HTMLMediaElement.volume` à `[0, 1]` et lève `IndexSizeError` au-delà ; il faudrait
passer par un `GainNode` Web Audio. Hors périmètre de ce chantier.

## 9. Interface

### Fiche du clip (A3, A5)

La section `.volume` de `ClipInspector` conserve son slider, dont la plage passe à
`0...2` avec repère visuel à 100 %. Elle gagne :

- un bouton **« Ajouter un point à *T* »** créant un `StoryKeyframe(time:, volume:)`
  *volume seul*, sans toucher `x/y/scale/opacity` ;
- la **liste des points** posés (temps + niveau), chacun modifiable et supprimable ;
- l'**interrupteur de ducking** (A2).

Tout passe par les commandes undoables existantes : l'annulation ne demande pas de code
nouveau.

### Pistes (A3, A4)

`VideoClipBar` gagne une bande de waveform sous son filmstrip, alimentée par
`AudioWaveform.samples(url:count:)` — même rendu que `AudioClipBar`.

Cette réutilisation a été **vérifiée empiriquement** plutôt que supposée :
`AudioWaveform` repose sur `AVAudioFile(forReading:)`, dont on pouvait craindre qu'il
refuse un conteneur vidéo. Mesure faite sur la vidéo de fond d'une story de production
(MP4/AAC) : lecture réussie, 1 canal, 44,1 kHz, 37,5 s, amplitude crête 0,499. Aucun
extracteur `AVAssetReader` dédié n'est donc nécessaire.

Le retour vide couvre d'un même geste les deux cas dégradés — vidéo sans piste audio, et
conteneur qu'`ExtAudioFile` ne sait pas ouvrir : aucune waveform n'est dessinée, sans
erreur ni bande vide trompeuse.

Par-dessus, sur les pistes vidéo **et** audio, une **courbe de volume en lecture seule**
tracée à partir des keyframes dont `volume != nil`.

Contrainte à surveiller : la piste fait 52 pt de haut et doit désormais loger filmstrip,
waveform et courbe. C'est le point d'intégration visuelle le plus délicat du chantier ;
il se valide sur device, pas au jugé.

## 9 bis. Waveform fidèle et cache persistant (A6)

L'implémentation actuelle présente trois défauts qui la rendent inexploitable pour
régler des volumes.

### Amplitude réelle plutôt que normalisée au pic

`computeRMSBuckets` termine aujourd'hui par `normalize(rms)`, qui divise toutes les
valeurs par le pic. Conséquence : **une piste douce et une piste forte se dessinent
exactement à la même hauteur**, et baisser un clip ne change rien à son tracé.

L'appel à `normalize` est retiré du chemin par défaut ; les valeurs RMS restent
absolues. La fonction elle-même est **conservée** — elle est pure, testée, et n'a qu'un
seul appelant de production : rien à supprimer, seulement à ne plus invoquer.

Le stockage reste en RMS **linéaire** (fidèle et réutilisable), mais le rendu applique
une **échelle logarithmique en dB, plancher à −60 dB**. Motif : un RMS linéaire absolu
est visuellement plat, la plupart des contenus vivant entre 0,05 et 0,3 — la bande
paraîtrait vide alors que la mesure serait juste. L'échelle dB restitue la dynamique
sans mentir sur les niveaux ; c'est la convention des éditeurs audio.

### Résolution suivant le zoom

`count` vaut 80, quelle que soit la durée : pour un audio de 240 s, cela écrase
3 secondes par barre. Il est désormais dérivé de la largeur réelle de la barre
multipliée par l'échelle de l'écran.

Cette valeur est **quantifiée par paliers** (128, 256, 512, 1024, 2048). Sans
quantification, un `count` variant continûment avec le pincement de zoom multiplierait
les entrées de cache et relancerait un calcul complet à chaque image — le cache ne
servirait plus à rien.

### Cache sur disque

Le cache actuel est un `NSCache`, donc en mémoire seule : évincé sous pression, perdu à
chaque lancement. On conserve ce niveau en première ligne et on ajoute une persistance
via **`DiskCacheStore`** (déjà présent dans le SDK, avec éviction LRU), clé
`hash(URL) + palier`, valeurs `[Float]` sérialisées en `Data`. Un fichier déjà analysé
ne l'est jamais deux fois, même après redémarrage.

### Priorité des sources, à inverser

`AudioClipBar.effectiveSamples` fait aujourd'hui primer `waveformSamples` — les
80 valeurs du modèle, normalisées au pic et publiées dans le JSON — sur le calcul local.
La priorité s'inverse : le calcul local haute résolution l'emporte dès que l'URL est
disponible, `waveformSamples` restant le repli utile (repost, brouillon restauré,
fichier introuvable).

La sémantique des 80 valeurs du modèle **ne change pas** : les stories déjà publiées
continuent de s'afficher comme aujourd'hui, sans migration.

## 10. Cas limites

- Le mute global reste prioritaire sur tout (facteur 0).
- Valeurs bornées à `[0, 2]`.
- Points non triés → ordonnés par le resolver.
- Vidéo sans piste audio → aucun ducking, aucune waveform.
- Clip sans keyframe de volume → comportement strictement identique à aujourd'hui.

## 11. Tests

- **Resolver pur** — table de cas : aucun point, un seul, N points, playhead avant le
  premier, chaque easing, valeurs hors bornes.
- **Test de signal** — exporter une story vidéo + musique et **mesurer l'amplitude RMS
  réelle** de la piste sur deux fenêtres temporelles, pour prouver que le ducking et
  l'automation s'entendent. Un test vérifiant seulement que `volume == 0.25` dans le
  modèle ne prouverait rien d'audible.
- **Gain > 100 %** — mesurer l'amplitude de sortie à 200 % et vérifier qu'elle est
  supérieure à celle obtenue à 100 % : c'est le seul moyen de prouver que le chemin
  `audioMix` / `AVAudioUnitEQ` fonctionne, puisque écrire `volume = 2.0` sur un node
  échouerait silencieusement.
- **Garde de source** — interdire la réintroduction d'un `avPlayer?.volume = 1.0` en dur
  dans `StoryBackgroundLayer`.
- **Round-trip** `Codable` + `toJSON()` pour `StoryKeyframe.volume` et
  `StoryAudioPlayerObject.keyframes`.
- **Gateway** — un volume à 2,0 est accepté ; à 2,1, rejeté.
- **Amplitude fidèle** — deux fichiers de niveaux différents produisent des hauteurs
  différentes. C'est le test qui manquait : les tests actuels de `normalize` ne
  pouvaient pas le détecter, puisqu'ils valident précisément le comportement qu'on
  retire du chemin par défaut.
- **Paliers de résolution** — deux zooms voisins retombent sur le même palier et ne
  déclenchent qu'un seul calcul.
- **Cache disque** — après vidage du cache mémoire, un second affichage ne relance
  aucune analyse.

## 12. Suites

Le chantier B (graduation de `RulerView` selon la durée du contenu, contrôleur de scroll
horizontal global au-dessus des pistes) fera l'objet de son propre spec. Ses fichiers
(`RulerView`, `TimelineScrubArea`, `TimelineGeometry`) sont disjoints de ceux du présent
chantier : les deux peuvent avancer en parallèle sans collision.
