# Timeline Editor V2 — Design

## Objectif
Refonte complète du timeline editor story avec deux modes distincts (Simple TikTok + Avancé NLE), zoom logarithmique ms→min, visuels médias riches, et playback réel des médias.

## Mode Simple (TikTok)
- Rail unique horizontal, segments bout à bout
- Chaque segment montre son contenu visuel (thumbnail image, frames vidéo, waveform audio)
- Tap = sélectionner → mini toolbar (edit, durée, delete)
- Pinch sur segment sélectionné = redimensionner durée
- Long press + drag = réordonner
- Progress bar linéaire, pas de ruler/grid/playhead vertical

## Mode Avancé (Full NLE)
- Multi-track avec groupes FOND/FRONT
- Edit icon sur chaque segment → ouvre éditeur dédié
- Image thumbnails comme fond de track bar
- Spectrogramme audio via Accelerate vDSP FFT
- Zoom logarithmique 0.01x→100x
- Ruler adaptatif (10ms→1min selon zoom)
- Time display précision milliseconde

## Zoom Logarithmique
```
pixelsPerSecond = basePixelsPerSecond × zoomScale
base = 50px/s
Range: 0.01x (0.5px/s, ~1min/écran) → 100x (5000px/s, ~50ms/écran)
```
Pinch applique facteur logarithmique pour transitions naturelles aux extrêmes.

## Ruler Adaptatif
| pps     | Tick mineur | Tick majeur | Format      |
|---------|-------------|-------------|-------------|
| < 2     | 10s         | 30s         | `0:30`      |
| 2–10    | 5s          | 15s         | `0:15`      |
| 10–50   | 1s          | 5s          | `1s`        |
| 50–200  | 0.5s        | 2s          | `0.5s`      |
| 200–1000| 100ms       | 500ms       | `100ms`     |
| > 1000  | 10ms        | 100ms       | `10ms`      |

## Playback Réel des Médias
- TimelinePlaybackEngine coordonne AVPlayer (vidéo) et AVAudioPlayer (audio)
- Play avec élément sélectionné → seek au startTime de l'élément, play depuis là
- Sync playhead avec lecture média réelle
- Play sans sélection → play depuis position courante du playhead

## GPU Acceleration
- Video frame strip: AVAssetImageGenerator (thumbnails statiques)
- Spectrogramme: Accelerate vDSP FFT → Canvas (GPU-backed Core Animation)
- Image thumbnails: UIGraphicsImageRenderer downscale à 44pt

## Fichiers
- `TimelinePanel.swift` — Split simple/avancé, ruler adaptatif, zoom log
- `TimelineTrackView.swift` — Edit icon, image thumbnail, spectrogramme
- `StoryComposerViewModel.swift` — Zoom range étendu, état mode simple
- **NEW** `SimpleTimelineView.swift` — Mode TikTok rail unique
- **NEW** `AudioSpectrogramView.swift` — Rendu spectrogram FFT

## Tests Unitaires
- Zoom logarithmique clamping
- Ruler ticks adaptatifs par plage pps
- Format time précision ms
- Simple mode layout séquentiel
- Pinch resize segment sélectionné
- Edit icon présent sur tracks
- Image thumbnail chargé
- FFT spectrogramme samples valides
- Duration handle extend/shrink
- Sync track→model préserve tous les champs
- Play déclenche lecture média de l'élément sélectionné
