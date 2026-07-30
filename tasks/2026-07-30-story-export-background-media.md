# Export story — le fond (image ET vidéo) n'entre pas dans le MP4

## Symptôme (user, 2026-07-30)
« Lors de l'export de ma story, la vidéo et image de background ne semblent pas
être intégrées à la vidéo. »

## Racine (Phase 1-2 systematic-debugging)

Le pipeline d'export résout les médias par un `URL(string: media.mediaURL)` NU,
là où le canvas live passe par une cascade complète
(`StoryBackgroundLayer.directURLIfAny` → `MeeshyConfig.resolveMediaURL` →
`resolver(postMediaId)` → `CacheCoordinator` avec téléchargement).

Une story PUBLIÉE porte une `mediaURL` **distante** (CDN https, ou chemin
relatif `/api/v1/attachments/...` — `StoryViewModel` flippe le `file://` local
vers `result.fileUrl` à la publication ; `toRenderableSlide` n'hydrate rien pour
`mediaObjects`). Conséquences, par média :

| Média | Site | Effet aujourd'hui |
|---|---|---|
| Fond IMAGE | `StoryAVCompositor.resolveBackgroundImage` | `UIImage(contentsOfFile: "https://…")` → nil → **fond noir** |
| Fond legacy (`slide.mediaURL`) | idem | jamais lu (ne regarde que `mediaObjects`) → **fond noir** |
| Fond VIDÉO | `StoryExporter.export` | `AVURLAsset` distant : décodage réseau par frame, ou `backgroundAssetVideoTrackMissing` si URL relative → **export en échec / fond noir** |
| Overlay VIDÉO | `StoryForegroundVideoFrameSource.frame` | `AVAssetImageGenerator` sur URL distante/relative → nil → **overlay absent** |
| Overlay IMAGE | `StoryMediaLayer.configureImage` | chemin réseau ASYNC → arrive après `layer.render(in:)` → **absent des 1ères frames** |

4ᵉ occurrence du même piège (watermark, lanes audio, `StoryAudioPlayerObject.mediaURL`) :
**câblage manquant, pas suppression**. Fix par le MODÈLE, pas par le site d'appel.

## Plan

- [x] Phase 1 — racine tracée jusqu'à la source (aucun fix avant)
- [x] RED — tests pixel sur MP4 (fixtures de COULEUR connue, jamais noires) :
      fond image distant, fond vidéo distant, fond legacy `slide.mediaURL`,
      overlay premier plan distant
- [x] `CacheCoordinator.imageLocalFileURLAwait(for:)` — miroir exact des
      variantes vidéo/audio existantes (SDK core, service low-level)
- [x] `StoryExporter.resolveVisualURL` — point de résolution UNIQUE des médias
      visuels, miroir de `resolveLaneURL`
- [x] `StoryExporter.hydratingLocalMedia` — pré-passe async qui réécrit
      `mediaObjects[].mediaURL` + `slide.mediaURL` en `file://` locaux AVANT de
      composer. Tout l'aval (piste vidéo, compositor, frame source, media layer)
      fonctionne déjà sur `file://` — c'est ce que prouve le chemin composer.
      Ne JAMAIS nullifier sur échec : on garde l'URL d'origine.
- [x] `StoryAVCompositor.resolveBackgroundImage` — repli sur `slide.mediaURL`
      (parité avec la priorité de `StoryRenderer.renderBackground`) + mémoïsation
      du bitmap décodé (sinon un décode JPEG plein cadre PAR FRAME)
- [x] GREEN — suite export SDK verte

## Review

### Baseline RED mesurée (corrections neutralisées, mêmes tests)
| Test | Sans le fix | Avec le fix |
|---|---|---|
| fond image distant | `r=0 g=0 b=0` — **frame noire** | bleu baké |
| fond legacy `slide.mediaURL` | `r=0 g=0 b=0` — **frame noire** | vert baké |
| fond vidéo distant | export **en échec** (piste introuvable) | rouge baké |
| overlay vidéo distant | — | vert baké sur fond bleu |

La frame `r=0 g=0 b=0` EST le symptôme rapporté : le substrat synthétique est
encodé en noir opaque (H.264 ne conserve pas l'alpha), donc un fond non peint
sort noir.

### Ce qui a été corrigé
1. `CacheCoordinator.imageLocalFileURLAwait(for:)` — le maillon qui manquait à
   côté de ses jumeaux vidéo/audio.
2. `StoryExporter.resolveVisualURL(_:kind:)` — point de résolution UNIQUE :
   `file://` (vérifié existant) · `https://` · chemin relatif normalisé par
   `MeeshyConfig.resolveMediaURL` (garde SSRF) → fichier local, téléchargé si
   absent.
3. `StoryExporter.hydratingLocalMedia(_:)` — pré-passe appliquée dans `export()`,
   dans la fenêtre de `beginBackgroundTask`. Répare d'un coup les QUATRE
   consommateurs de `mediaURL` en aval.
4. `StoryAVCompositor.resolveBackgroundImage` — repli legacy + mémo du bitmap.

### Décisions et contreparties
- **Fix par le MODÈLE, pas par le câblage** : c'est la 4ᵉ occurrence du piège
  (filigrane, lanes audio, `StoryAudioPlayerObject.mediaURL`). Résoudre une fois
  en amont rend impossible qu'un futur consommateur naisse cassé.
- **Ne nullifie jamais** : une adresse irrésolvable reste en place ; le
  comportement est au pire celui d'avant, jamais pire. Test dédié.
- **Le mémo du fond retient un bitmap (≈ 8 Mo) après le dernier export**, faute
  de `deinit` (SE-0466 / double-free iOS < 26). Assumé et documenté : le prix de
  300 décodes JPEG plein cadre évités sur une story de 10 s.
- Le fond legacy est traité comme une IMAGE, exactement comme le fait
  `StoryRenderer.renderBackground` — un legacy vidéo reste hors rendu, comme
  avant.

### Hors périmètre (constaté, non traité)
- `StorySlideRenderer.renderComposite` — 2ᵉ pipeline du dépôt (cover du tray +
  ThumbHash). Non concerné par la plainte (vidéo exportée), non touché.
- Le coût d'export reste dominé par le bake (cf. mémoire export) ; la mémoïsation
  du fond ne fait qu'éviter d'en ajouter.

---

# Lot 2 — le MP4 pesait 314 Mo (2026-07-31)

## Racine
`AVAssetExportSession` n'expose **aucun** réglage d'encodage : ses presets bornent
la DÉFINITION, jamais le débit. Mesuré sur source à forte entropie (1080×1920) :

| Preset | Débit | Sortie | 1 min |
|---|---|---|---|
| `HighestQuality` | 58,8 Mbps | 1080×1920 | **441 Mo** |
| `1920x1080` | 58,8 Mbps | 1080×1920 | **441 Mo** — strictement identique |
| `HEVC1920x1080` | 23,6 Mbps | 1080×1920 | 177 Mo |
| `1280x720` | 11,1 Mbps | 720×1280 | 84 Mo, au prix de la définition |

Aucun preset ne plafonne le débit en pleine définition → 314 Mo ≈ une minute de
contenu détaillé. **Changer de preset ne servait à rien** : c'est la mesure qui a
écarté le correctif d'une ligne et justifié la refonte.

## Correctif
`AVAssetReader` + `AVAssetWriter` remplacent la session à preset — seul couple qui
accepte un `AVVideoAverageBitRateKey`. `StoryExportVideoSettings` dérive le débit
de la surface (0,12 bit/pixel/image, H.264 High, bornes 2,5–12 Mbps) ;
`AVAssetReaderVideoCompositionOutput` continue de piloter le compositor custom.

Mesuré après : **7,5 Mbps quelle que soit la source** (4K comprise) — le débit ne
suit plus la définition d'entrée. **58,8 → 7,5 Mbps, soit ÷7,8.** Les 314 Mo
signalés retombent à ≈ 40 Mo.

## Le piège de ce lot : la fixture décide du verdict
Trois fixtures, trois verdicts contradictoires sur le MÊME pipeline :
- **aplat de couleur** → 0,1 Mbps : « tout va bien » sur un pipeline à 300 Mo ;
- **bruit blanc par pixel** → incompressible, l'encodeur défonce toute cible
  (cible 2 Mbps → 42,7 Mbps réels) : « le correctif ne marche pas », faux ;
- **dégradé animé** (contenu structuré, régime d'une vraie vidéo) → cible 2 Mbps
  → 2,1 réels ; cible 7,5 → 7,4. C'est la seule qui mesure quelque chose.

## H.264 et pas HEVC
HEVC diviserait encore par ~2 (23,6 vs 58,8 sur la même source), mais l'export
part vers Photos / WhatsApp / AirDrop / Android / Windows, où il n'est pas
universel. Le plafond apporte déjà ÷7,8 sans toucher à la compatibilité. HEVC
resterait une option à exposer, pas un défaut à imposer.

## Reste ouvert
Une story de 4 min pèsera ~226 Mo : c'est la physique du 1080p à 7,5 Mbps, pas un
défaut. Les leviers, si le besoin se confirme : abaisser `bitsPerPixelPerFrame`
(0,08 → ~5 Mbps, ce que fait Instagram) ou proposer HEVC en option.

### Dette croisée rencontrée
`StoryModelsTests.swift:457` ne compilait plus : une session concurrente ajoute
`location: SharedPlace?` à `APIRepostOf` (`PostModels.swift` modifié, pas par
moi) sans avoir mis à jour ce site d'appel. Ajout minimal `location: nil` pour
débloquer le bundle — aucun fichier de la session concurrente n'a été touché.
