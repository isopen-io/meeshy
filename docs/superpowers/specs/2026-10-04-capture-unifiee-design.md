# Capture unifiée — un seul objet pour viser, filmer et retoucher

> Spec validée en brainstorming avec le porteur le 2026-10-04. Suit #9295 (photo, filtres et cadres de l'appel) et #9329 (filtres et cadres en direct). L'état des tâches vit dans les issues GitHub, jamais ici.

## 1. Le problème

La caméra de la barre de composition montre DEUX restitutions : le viseur en direct, puis une revue (`ComposerPhotoLookReview`) où la photo, réduite (aspect-fit), est repeinte par un AUTRE peintre. Avant et après la prise, l'image n'est pas la même.

Causes mesurées (analyse du 2026-10-04) :

| écart | direct | photo (revue) |
|---|---|---|
| peintre du cadre | `CallLiveFrameCompositor` (GPU, Core Image) | `CallFrameRenderer` / `CallMontageRenderer` (CPU, CoreGraphics) |
| formule des tons | `toned` (CIPhotoEffectNoir…) | `applyTone` (modes de fusion CG) |
| géométrie sans cadre | remplit l'écran | garde le format du capteur |
| géométrie avec cadre | 9:16 ajusté, bandes noires | 1080×1920 |
| date gravée | `lookDate` de la session | `Date()` au moment de la revue |

S'y ajoutent : les cadres « classiques » (`CallMontageChoice.classic`) existent en revue mais pas en direct (choix de règle, `ComposerLiveLookRule.isLive`, pas une limite technique) ; le zoom s'arrête à ×1 (objectif grand-angle physique seul) ; un effet actif peint DEUX fois chaque image (couche système + vue Metal par-dessus) ; le composer ignore l'état thermique ; la galerie ne reçoit que du brut, segment par segment.

## 2. Le résultat attendu

**Un seul objet — `ComposerCaptureStage` — pour viser, filmer et retoucher**, monté :
- en plein écran par la barre de composition de conversation (`ComposerViewfinder`) ;
- par le composer story / post / réel, en scène (carte) ou en plein écran — la SEULE différence est le bouton réduire / plein écran (`offersSizeToggle`, déjà présent). Même objet, même code, mêmes fonctions.

**Ce qu'on voit est ce qui part**, garanti par construction : un seul peintre sert l'aperçu, la photo, l'export vidéo, la vidéo en boucle et les miniatures.

**Rien ne chauffe** : Metal partout, un seul passage par image, rien quand rien ne change, dégradation par palier thermique.

## 3. Disposition et gestes

### 3.1 Capture, viseur armé

| zone / geste | effet |
|---|---|
| toucher sur la scène | mise au point (anneau) |
| **double toucher sur la scène** | photo → **mode édition** |
| **appui long n'importe où** (hors rail et bande) | filme un segment (logique de segments actuelle) |
| pincement | zoom caméra, de ×0,5 (si ultra grand-angle) au maximum ; pastille ×0,5 / ×1 / ×2 |
| glissé vers le bas (rien en cours) | ferme, comme aujourd'hui |
| rail vertical, en bas à gauche : **Filtres**, **Cadres** | ouvre la bande horizontale sur toute la largeur |
| bande | défile horizontalement ; chaque miniature = le flux caméra peint avec cet effet, EN DIRECT ; « Aucun » en tête |
| toucher une miniature | la choisit ; elle s'encadre |
| **double toucher sur la miniature choisie** | photo → **galerie directement** (brut + rendu), on reste en capture |
| **appui long sur la miniature choisie** | filme (verrouillable à droite) → à l'arrêt, la vidéo rendue part **en galerie directement** (brut + rendu), on reste en capture |
| rangée haute | flash, fermer, retourner (le bouton « Filtres et cadres » part : le rail le remplace) |

Le déclencheur ( o ) est RETIRÉ (changement assumé par le porteur).

**Filtre et cadre se COMBINENT.** Le look est toujours la paire `(filtre, cadre)` (`ComposerPhotoLook`) : choisir un filtre garde le cadre, choisir un cadre garde le filtre. Chaque miniature montre la combinaison qu'elle produirait — la bande Filtres peint chaque filtre AVEC le cadre en cours, la bande Cadres chaque cadre AVEC le filtre en cours — et la miniature choisie montre la paire exacte. Toute prise (galerie directe, édition, envoi) porte cette paire complète.

### 3.2 Capture, enregistrement en cours

- La bande se réduit à la SEULE miniature choisie, qui continue d'afficher le direct ; les autres disparaissent, le rail se cache (aucun effet n'est choisissable pendant l'enregistrement).
- Dans cette miniature : point rouge clignotant + chronomètre, DÈS le premier segment.
- Cadenas à DROITE, verrouillé par glissé à droite — inchangé. Le glissé vertical zoome (jusqu'à ×0,5).
- Arrêt : relâcher (non verrouillé) ou retoucher la miniature (verrouillé).
- Enregistrement lancé AILLEURS sur la scène : c'est un segment ; relance des segments, ⌫ (retirer le dernier) et ✓ (valider) inchangés ; ✓ assemble les segments et passe en **mode édition**.
- Enregistrement lancé SUR la miniature choisie : à l'arrêt, la vidéo est rendue avec l'effet choisi et part en galerie (brut + rendu) ; aucun segment n'est retenu, on reste en capture.

### 3.3 Mode édition — même interface

- Source : la photo figée, ou la vidéo assemblée en boucle.
- Rail et bande identiques ; les miniatures sont peintes sur le média (image figée pour une photo, image courante pour une vidéo).
- **Seul ajout : un bouton ✓ « Terminé ».**
- **Cadrage final** : déplacer le média d'un doigt, le zoomer / dézoomer au pincement dans le canevas 9:16. Le cadrage s'applique au rendu qui part dans la conversation / la story ET à celui qui part en galerie.
- **Vidéo — piste de découpe**, posée AU-DESSUS du rail et de la bande : `[poignée] ── vignettes de la vidéo (forme d'onde en filigrane si son) ── [poignée]`.
  - Une tête de lecture parcourt la plage en boucle ; toucher la piste y place la tête, la boucle repart de là.
  - **Appui long sur une poignée ⇒ précision à la milliseconde** : la piste se dilate autour de la poignée, sous un repère fixe (principe de `MeeshyAudioTrimmer`, #4657 : amener l'instant sous le trait plutôt que viser un trait) ; le temps se lit `0:03.482`.
  - Les vignettes de la piste se calculent une fois pour la plage, puis seulement à la fin d'un geste.

### 3.4 Galerie

| moment | ce qui part |
|---|---|
| à la prise (photo ou segment) | le BRUT, comme aujourd'hui (`CameraModel`) |
| double toucher sur la miniature choisie | + le RENDU de la photo (filtre ET cadre choisis), immédiatement |
| appui long sur la miniature choisie, à l'arrêt | + le RENDU de la vidéo (filtre ET cadre choisis), immédiatement |
| « Terminé » | + le RENDU final (effet, cadrage, découpe) |

## 4. Architecture

### 4.1 `ComposerLookPainter` — le peintre unique

```swift
nonisolated enum ComposerLookPainter {
    static func scene(for look: ComposerPhotoLook, canvas: CGSize, date: Date) -> CallLiveFrameScene?
    static func paint(_ source: CIImage, look: ComposerPhotoLook, framing: ComposerFraming,
                      scene: CallLiveFrameScene?, canvas: CGSize) -> CIImage
}
```

- `scene` prépare, HORS du fil principal et UNE fois par (look, taille, date), les couches statiques : fond, masque de la découpe, calque (texte, trait, grain, vignette). Cache borné (`NSCache`), vidé à la fermeture.
- `paint` est un graphe Core Image pur, en UN passage : colorimétrie (`VideoFilterColorimetry`) → cadrage (`ComposerFraming` : décalage + échelle, remplissage du canevas) → ton de la découpe → composition fond / découpe / calque.
- Canevas canonique : **9:16, 1080×1920, rempli**, avec ou sans cadre. L'écran montre ce canevas par une seule transformation d'ajustement.
- La date gravée est toujours `lookDate` de la session.
- Consommateurs : aperçu direct (vue Metal), photo (`createCGImage` dans l'espace couleur de la photo, #9327), export vidéo (`ComposerLookVideoExporter`, gestionnaire `AVVideoComposition`), lecture en boucle, miniatures.

### 4.2 Les cadres classiques en couches

Chaque style de `CallMontageRenderer` se découpe en `backdrop(ctx)` / slot (chemin de la découpe) / `overlay(ctx)` dans `CallMontageRenderer+Layers.swift`, cuits par `CallLiveFrameCompositor.baked` / `paintPatch`, et rejoint `CallLiveFrameScene`. Avec une personne, une seule découpe. `ComposerLiveLookRule.isLive` admet alors les classiques.

Le montage photo des APPELS garde son chemin CPU (`CallFrameRenderer.render`, `CallCaptureController+Frames`) ; seul le chemin composer le quitte. Les tons GPU (`toned`) deviennent la référence ; tout alignement de `applyTone` est un choix explicite, testé, parce qu'il change aussi ce que montrent les appels.

### 4.3 `ComposerCaptureStage`

Vue + état (`ComposerCaptureSession` étendue), deux phases :
- `.capturing(source: caméra)` ;
- `.editing(source: .photo(CIImage) | .video(boucle))`.

Le chrome (`ComposerCaptureChrome`) devient : rail + bande + élément-déclencheur + cadenas + piste de découpe (édition vidéo) + ✓ Terminé (édition). Monté tel quel par `ComposerViewfinder` et par `MeeshyComposerHost+Viewfinder`.

Retraits : `ComposerPhotoLookReview`, le paramètre `reviewsPhoto`, le déclencheur ( o ) de `ComposerSceneCameraBar`, `ComposerPhotoLookThumbnails` (CPU), `ComposerPhotoLookRenderer` sur le chemin composer, `ComposerLiveLookPanel` (onglets) remplacé par rail + bande. Rien de ce que la revue offrait ne se perd : miniatures rendues et cadres classiques vivent désormais en direct ET en édition.

### 4.4 Lecture en boucle (édition vidéo)

`AVQueuePlayer` + `AVPlayerLooper` → `AVPlayerItemVideoOutput` (attributs IOSurface / Metal) lu au tick de la vue Metal, peint par `ComposerLookPainter.paint`. Changer de look = changer de `scene`, sans reconstruire l'élément de lecture. La découpe pose `forwardPlaybackEndTime` / la plage du looper.

### 4.5 Zoom ×0,5

`AVCaptureDevice.DiscoverySession` sur `[.builtInTripleCamera, .builtInDualWideCamera, .builtInDualCamera, .builtInWideAngleCamera]`, premier trouvé. Facteur affiché = `videoZoomFactor / virtualDeviceSwitchOverVideoZoomFactors.first` ; ouverture à ×1 affiché. `ComposerCaptureZoom.range` perd sa butée `max(1, …)` et raisonne en facteur affiché. Caméra avant et appareils à un objectif : `1…max`.

## 5. Performance et thermique

- Sans effet : la couche système `AVCaptureVideoPreviewLayer` seule (aucun rendu).
- Avec effet : la vue Metal SEULE (couche système détachée) — un passage par image, jamais deux.
- La vue Metal dessine à l'arrivée d'une image (`enableSetNeedsDisplay`), jamais sur une horloge libre ; en pause sur une photo figée tant que rien ne change.
- Un seul `CIContext` Metal partagé. Aucune copie CPU (`CIImage(cvPixelBuffer:)` sur IOSurface).
- Miniatures : une source réduite UNE fois (~160×284) partagée par toutes les cases ; un seul atlas Metal pour la bande ; cases visibles ±1 seulement ; pause pendant un défilement ; couches de cadre en cache.
- `ThermalStateMonitor` (existant, `Services/ThermalStateMonitor.swift`) injecté par protocole dans la session :

| état | aperçu | miniatures |
|---|---|---|
| nominal | 30 i/s | 12 i/s, 8 cases |
| fair | 24 i/s | 6 i/s, 5 cases |
| serious | 15 i/s, surface ×0,75 | figées |
| critical | couche système seule, mention visible | coupées |

  Pendant l'enregistrement, seule la miniature choisie vit (au rythme du palier). Dans tous les états, photo et export reçoivent l'effet complet.
- Mesure (Instruments, iPhone 12 ou plus ancien disponible) : Metal System Trace (ms GPU par image, passages par image), Energy Log + état thermique (5 min de viseur avec effet et bande ouverte ⇒ rester `nominal`/`fair`), Time Profiler (pics de cuisson), Allocations (cache de scènes).

## 6. Compatibilité

iOS 16 → 26. Toute fermeture async nouvelle est annotée (`@MainActor` / `@concurrent`) — leçon du plantage iOS 16/17 sous `NonisolatedNonsendingByDefault`. Le simulateur n'a pas de caméra : les lois se testent pures, le rendu se mesure sur appareil réel.

## 7. Tests (TDD)

Lois pures, sans caméra :
- `ComposerLookPainter` : pour une source donnée, photo et aperçu produisent le même `CIImage` (mêmes dimensions, mêmes pixels sur un échantillon) ; la date est `lookDate` ; sans look, `paint` est l'identité recadrée.
- Classiques en couches : chaque style produit une scène ; rendu couches ≈ rendu CPU historique à tolérance près (garde de non-régression visuelle).
- Combinaison : choisir un filtre conserve le cadre et inversement ; la miniature d'un filtre est peinte avec le cadre courant (et inversement) ; le rendu galerie porte la paire.
- Gestes : table de décision (zone × geste × phase × verrou) → action (mise au point, photo-édition, photo-galerie, segment, arrêt, zoom, fermer).
- Phases : capture → édition (photo, ✓ segments) ; « Terminé » livre le rendu et déclenche l'enregistrement galerie ; double toucher OU appui long sur la miniature ⇒ deux enregistrements (brut + rendu) sans changer de phase ni retenir de segment.
- Zoom : facteur affiché ↔ facteur appareil, butées par type d'appareil.
- Découpe : plage bornée, durée minimale, précision ms, tête de lecture repositionnée.
- Thermique : palier → (i/s aperçu, i/s miniatures, cases, couche système).
- Garde de câblage : `ComposerPhotoLookReview` et `reviewsPhoto` absents ; `ComposerViewfinder` et `MeeshyComposerHost+Viewfinder` montent le même `ComposerCaptureStage`.

Preuve : suite iOS sur la CI (branche `ci/…`), puis mesure Instruments sur appareil réel pour la fluidité et la chauffe.

## 8. Hors périmètre, suivi par issue

- Web (`apps/web`, `story-compose-camera.tsx`) : même capture unifiée — issue jumelle dans la même vague (un comportement voulu par le porteur est multiplateforme).
- Android Kotlin : gelé ; la coque suit le web.

## 9. Découpage en lots

1. Peintre unique + canevas canonique + date de session (corrige « deux rendus »).
2. Classiques en couches, admis en direct.
3. Budget thermique + aperçu en un passage.
4. Zoom ×0,5 (caméra virtuelle).
5. `ComposerCaptureStage` : rail, bande à miniatures vivantes, élément-déclencheur, gestes, retrait de la revue et du ( o ).
6. Mode édition : photo figée, vidéo en boucle, cadrage, ✓ Terminé, galerie brut + rendu.
7. Piste de découpe vidéo avec précision milliseconde.
8. Montage dans le composer story / post / réel (même objet, bouton réduire / plein écran).
9. Web : issue jumelle.
