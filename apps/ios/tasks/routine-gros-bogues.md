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

## OPUS-4 — Aucune grille des tiers pour cadrer au viseur
- Statut : décision attendue
- Signalé par : routine caméra, le 2026-11-07
- Point d'origine : CAM-2 (audit B4)
- Constat : le viseur ne peint ni grille ni niveau. Le réglage demandé n'a nulle part où vivre : la rangée haute est pleine (`Meeshy/Features/Composer/ComposerCaptureTopRow.swift:36-38`, « la rangée tient alors sept contrôles, et la largeur d'un iPhone n'en porte pas huit »), le viseur n'a ni menu ni `⋯` (aucun `Menu`/`confirmationDialog` de réglage dans `ComposerCapture*`, `ComposerSceneCamera*`, `ComposerCamera*`), et l'app n'a pas d'écran de réglages caméra. Les seules préférences du viseur sont l'intensité du flash (`ComposerCaptureSession.swift:210`, `:642`) et l'astuce vue (`ComposerCaptureBottomRow.swift:33`).
- Reproduction : ouvrir le viseur du composeur sur simulateur ou iPhone : aucun contrôle ni réglage « Grille ».
- Pourquoi la routine ne l'a pas fait : il faut décider où vit l'interrupteur (décision produit). La partie technique est petite une fois ce choix fait.
- Piste de correction : choix à trancher par Jacques parmi (a) un `⋯` en bout de rangée haute qui remplace `[ ]` et ouvre un petit menu (Grille, plus tard Retardateur, voir OPUS-6), (b) un appui long sur le retournement, (c) une ligne « Grille du viseur » dans les réglages de l'app. Ensuite : clé `@AppStorage("composer.camera.grid")` à `false` ; règle pure `ComposerCaptureGrid.lines(in: CGRect) -> [CGFloat]` (tiers de l'IMAGE visible, donc du trou du cadre quand la vue Metal peint, comme `ComposerCaptureSession+Tap.swift:57-67`) ; vue `Canvas` 0,5 pt, blanc 35 % avec ombre légère, `allowsHitTesting(false)`, `accessibilityHidden(true)`, posée dans l'overlay du viseur (`ComposerCaptureViews.swift:225-245`) et jamais dans le rendu de la prise ; masquée en retouche et pendant l'enregistrement si Jacques le souhaite.
- Critères d'acceptation : désactivée par défaut ; test unitaire des lignes (image pleine et trou de cadre) ; la photo et la vidéo prises n'ont pas de grille ; réglage conservé d'une ouverture à l'autre ; libellé traduit (`String(localized:…, bundle: .main)` + `Localizable.xcstrings`) et annoncé par VoiceOver.
- Liens : `/mnt/project-files/frames/07-audit-ui-ux-camera-appels.md` § B4, `tasks/routine-camera.md` CAM-2.

## OPUS-5 — Pas de compensation d'exposition après le toucher de mise au point
- Statut : à faire
- Signalé par : routine caméra, le 2026-11-07
- Point d'origine : CAM-3 (audit)
- Constat : le toucher vise netteté et exposition (`Meeshy/Features/Composer/ComposerCaptureFocus.swift:65-80`, `ComposerCaptureSession+Tap.swift:44-53`) puis montre l'anneau (`ComposerCaptureViews.swift:238-244`), mais rien ne règle le biais d'exposition. Le protocole des commandes d'objectif n'a pas de méthode pour ça (`Meeshy/Features/Main/Components/ComposerCaptureCamera.swift:7-28` : zoom, torche, photo, mise au point seulement), et `CameraModel` n'appelle jamais `setExposureTargetBias` (aucune occurrence dans le dépôt).
- Reproduction : viseur armé, toucher un sujet en contre-jour : l'anneau paraît, aucun moyen d'éclaircir ou d'assombrir.
- Pourquoi la routine ne l'a pas fait : il faut une nouvelle commande dans `ComposerCaptureCameraProviding` et son implémentation dans `CameraModel+Lens.swift` (session caméra, interdite à la routine), plus une recette sur iPhone réel.
- Piste de correction : ajouter `setExposureBias(_ ev: Float)` au protocole, implémenté dans `CameraModel+Lens.swift` sous `lockForConfiguration` et borné à `minExposureTargetBias...maxExposureTargetBias`, remis à 0 dans `CameraFocusControl.aim` et au changement d'objectif (`switchCamera`). Côté composeur : règle pure `ComposerCaptureExposure.bias(dragY:range:)` (environ 1 EV pour 100 pt, bornée à ±2 EV), petit soleil à droite de l'anneau, glissé vertical qui DÉMARRE sur le soleil (le glissé vertical de la scène sert déjà au zoom et à la fermeture, `ComposerCaptureViews.swift:471-480`), `accessibilityAdjustableAction` pour VoiceOver. Le soleil s'efface avec l'anneau.
- Critères d'acceptation : tests de la règle (bornes, remise à zéro au toucher suivant et au retournement) ; doublure du protocole qui compte les appels ; sur iPhone, l'image s'éclaircit ou s'assombrit sans saut et revient à 0 au toucher suivant ; aucun conflit avec le zoom au glissé.
- Liens : `tasks/routine-camera.md` CAM-3, OPUS-1.

## OPUS-6 — Pas de retardateur pour une photo posée ou de groupe
- Statut : décision attendue
- Signalé par : routine caméra, le 2026-11-07
- Point d'origine : CAM-4 (audit B5)
- Constat : aucun retardateur au viseur. La rangée haute ne peut pas prendre de huitième contrôle (`Meeshy/Features/Composer/ComposerCaptureTopRow.swift:36-38`, `:56-63`) et l'audit laisse deux emplacements possibles (« sous le flash ou dans un appui long »).
- Reproduction : ouvrir le viseur : rien ne permet de différer la prise.
- Pourquoi la routine ne l'a pas fait : l'emplacement est une décision produit, et le point est de taille M (état du compte à rebours, annulation, annonces VoiceOver, sons).
- Piste de correction : à trancher avec OPUS-4 (un même `⋯` pourrait porter Grille et Retardateur). Ensuite : état pur `ComposerCaptureTimer` (off / 3 s / 10 s, compte qui décroît, annulé par un toucher, par (x), par la sortie du viseur ou par le passage en arrière-plan), testé ; grand chiffre au centre du viseur en police dynamique, sans animation sous Reduce Motion ; chaque seconde annoncée à VoiceOver (`AccessibilityNotification.Announcement`) ; le déclenchement réutilise le chemin du déclencheur existant (`ComposerCaptureSession` photo), pas de nouvelle commande caméra.
- Critères d'acceptation : tests de l'état (décompte, annulations) ; la photo part à 3 s et 10 s ; un toucher annule ; VoiceOver annonce le décompte ; textes traduits.
- Liens : `/mnt/project-files/frames/07-audit-ui-ux-camera-appels.md` § B5, `tasks/routine-camera.md` CAM-4.
