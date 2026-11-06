# Problèmes signalés pour un fil dédié (caméra et appels, iOS)

Les deux routines horaires (Sonnet) ne corrigent pas ces problèmes : elles les documentent ici en détail et passent au point suivant. Jacques les fait traiter par des fils dédiés (Opus) dans le projet « Outil camera et appels vidéo ». Le fil qui corrige met le statut à `fait (#PR)`.

Un problème va ici quand il touche la session caméra (`CameraModel`, `CameraInputInstaller`), le pipeline vidéo (`VideoFilterPipeline`), la signalisation ou WebRTC (`CallManager`, `WebRTCService`), les budgets de chauffe, demande une recette sur iPhone réel, attend une décision produit, ou dépasse une PR lisible (plus de ~300 lignes hors tests).

## Modèle d'entrée (obligatoire, toutes les rubriques)

```
## OPUS-<n> — <titre en une phrase, du point de vue de l'utilisateur>
- Statut : à faire | décision attendue | en cours (#PR) | fait (#PR)
- Signalé par : routine caméra | routine appels | audit, le AAAA-MM-JJ
- Point d'origine : CAM-x / APP-x / ticket #n
- Constat : ce que voit l'utilisateur, et ce que dit le code (fichier:ligne, extrait court).
- Reproduction : étapes sur iPhone ou simulateur, ou test qui échoue.
- Pourquoi la routine ne l'a pas fait : périmètre interdit, taille, recette réelle, décision.
- Piste de correction : approche proposée, fichiers à changer, risques (chauffe, latence, régressions).
- Critères d'acceptation : ce qui prouve que c'est corrigé (tests, mesure, recette).
- Liens : tickets GitHub, PR, docs.
```

---

## OPUS-1 — La photo du viseur sort en définition vidéo
- Statut : à faire
- Signalé par : audit, le 2026-11-06
- Point d'origine : audit B1 ; recoupe #16482, #16504, #16505, #16506
- Constat : `apps/ios/Meeshy/Features/Main/Components/CameraModel.swift` règle la session en `.high` (format vidéo 1080p, ~243) et `takePhoto` prend la photo avec `AVCapturePhotoSettings()` nu (~511) : ni `maxPhotoDimensions`, ni `photoQualityPrioritization`, ni capture réactive / zéro décalage (iOS 17), ni stabilisation vidéo explicite.
- Reproduction : prendre une photo au viseur du composeur, ouvrir ses métadonnées dans Photos : environ 1920×1080 au lieu de 12 ou 48 Mpx.
- Pourquoi la routine ne l'a pas fait : session caméra interdite, recette sur iPhone nécessaire (délai, chauffe).
- Piste de correction : format actif compatible photo et vidéo, `maxPhotoDimensions` au plus grand supporté, priorisation `.balanced` en avant et `.quality` en arrière si le délai toucher → photo reste dans le budget, `isResponsiveCaptureEnabled` et `isZeroShutterLagEnabled` quand supportés, stabilisation `cinematicExtended` en vidéo arrière. Garder la session chaude (#16504).
- Critères d'acceptation : définition native en photo, délai toucher → flash mesuré sur iPhone 12 et récent, aperçu identique à la photo, `thermalState` ≤ fair sur 10 min de viseur.
- Liens : #16482, #16504, #16505, #16506.

## OPUS-2 — Le catalogue de filtres est trop mince pour dépasser le marché
- Statut : décision attendue
- Signalé par : audit, le 2026-11-06
- Point d'origine : audit B3
- Constat : `VideoFilterPreset` (`Main/Services/VideoFilterPipeline.swift:74`) n'a que 5 couleurs (Naturel, Chaud, Froid, Vif, Doux) partagées par l'appel et le viseur ; `CallFaceEffect` 4 effets stylisés.
- Reproduction : ouvrir le rail Filtres du viseur ou le carrousel Couleur en appel.
- Pourquoi la routine ne l'a pas fait : choix produit et pipeline vidéo.
- Piste de correction : 8 à 12 looks signés Meeshy en LUT 3D (`CIColorCube`, coût constant), intensité réglable, validés sur peaux claires et foncées, même catalogue appel et viseur.
- Critères d'acceptation : liste validée par Jacques ; coût ≤ budget de 4 ms GPU/image (doc 00 du projet) ; vignettes vivantes dans le rail et le carrousel.
- Liens : #9500.

## OPUS-3 — Tickets caméra et appel ouverts qui demandent un fil dédié
- Statut : à faire (un fil par ticket)
- Signalé par : audit, le 2026-11-06
- Constat et liens : #16506 photo en paysage ou inclinée enregistrée de travers ; #16504 viseur qui rouvre sur une session chaude sans armer le micro ; #16482 armement et déclenchement rapides ; #9778 bascule vers l'arrière en moins de 400 ms ; #9777 contrôles posés sur un cadre lisibles sans cacher son texte ; #11305 lens dans l'échelle de dégradation en appel ; #9174 cycle AttributeGraph au second toucher du viseur en scène ; #11043 PiP d'appel avec les deux flux.
- Pourquoi la routine ne les fait pas : session caméra, WebRTC ou recette sur iPhone réel.
- Piste : lire chaque ticket, vérifier qu'il n'est pas déjà corrigé sur dev, puis le traiter ou le fermer avec la preuve.
