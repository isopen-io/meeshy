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
- Proposition détaillée (2026-11-08) : six à huit « Ambiances » en LUT, pavé 2D sous le pouce dans la miniature, protection des teints de peau, looks réversibles ; planche de rendus à valider par Jacques avant code. Voir `/mnt/project-files/frames/08-sota-camera-optimisations.md` § R6.

## OPUS-3 — Tickets caméra et appel ouverts qui demandent un fil dédié
- Statut : à faire (un fil par ticket)
- Signalé par : audit, le 2026-11-06
- Constat et liens : #16506 photo en paysage ou inclinée enregistrée de travers ; #16504 viseur qui rouvre sur une session chaude sans armer le micro ; #16482 armement et déclenchement rapides ; #9778 bascule vers l'arrière en moins de 400 ms ; #9777 contrôles posés sur un cadre lisibles sans cacher son texte ; #11305 lens dans l'échelle de dégradation en appel ; #9174 cycle AttributeGraph au second toucher du viseur en scène ; #11043 PiP d'appel avec les deux flux.
- Pourquoi la routine ne les fait pas : session caméra, WebRTC ou recette sur iPhone réel.
- Piste : lire chaque ticket, vérifier qu'il n'est pas déjà corrigé sur dev, puis le traiter ou le fermer avec la preuve.

## OPUS-4 — Avant la connexion, « Filtres » ouvre un ancien panneau au lieu des « Effets de ma caméra »
- Statut : fait (#16668) — reste la recette iPhone listée dans la PR
- Signalé par : routine appels, le 2026-11-07
- Point d'origine : APP-5
- Constat : pendant la sonnerie sortante et la connexion d'un appel vidéo, le bouton « Filtres » (`Call/Views/CallView+States.swift:67-69` et `:122-124`, défini dans `CallView+Controls.swift:23-51`) bascule `showEffectsToolbar`, qui affiche l'ancien `CallEffectsOverlay` (`Call/Views/CallView.swift:413-421`) : une capsule à un seul bouton puis `VideoFiltersPanel` (`Main/Views/VideoFiltersPanel.swift`, curseurs et interrupteurs dans une feuille). Une fois l'appel établi, les mêmes réglages vivent dans le mode « Effets de ma caméra » (carrousel, `CallView+Mode.swift:8-33`, `CallModeControls.swift`, flou déjà présent `:214-240`). Deux interfaces pour la même chose selon le moment de l'appel. Le mode n'est monté que dans `connectedView` (`CallView+Connected.swift:39`), et sa scène lit `callManager.localVideoTrack` (`CallView+Connected.swift:588` → `CallManager+MediaControls.swift:110`, `webRTCService.localVideoTrack`).
- Reproduction : lancer un appel vidéo sortant, toucher « Filtres » avant que l'autre décroche : le panneau d'effets ancien apparaît. Décrocher, ouvrir « Effets de ma caméra » : le carrousel apparaît.
- Pourquoi la routine ne l'a pas fait : il faut savoir si la piste vidéo locale WebRTC existe déjà pendant `ringing(isOutgoing:)`, `offering` et `connecting` (sinon la scène du mode est noire et le carrousel n'a pas d'aperçu), ce qui se lit dans `WebRTCService` (interdit) et se vérifie sur iPhone réel. Les boutons de capture du mode (photo, vidéo de mon image) doivent aussi être désactivés ou cachés avant la connexion, ce qui demande une décision. Le changement touche la machine `layer` (`CallScreenLayer`) hors de l'appel établi.
- Piste de correction : 1) vérifier sur iPhone que `localVideoTrack` est non nul avant la connexion ; sinon, l'exposer tôt dans `CallManager` ou faire lire à la scène l'aperçu local de `CallPreviewCoordinator`. 2) Monter `callModeLayer` aussi dans `outgoingView` et `connectingView` (ou au niveau de `CallView.body` pour les états vidéo actifs) ; le bouton « Filtres » appelle `enterMode(.effects)`. 3) Avant la connexion, `CallEffectsModeControls` masque la capture (règle pure testée sur `callState`). 4) Retirer `CallEffectsOverlay.swift`, `surfaceEffects`, `showEffectsToolbar`, `VideoFiltersPanel.swift` et `VideoFilterControlView.swift` devenus morts, ainsi que leurs clés du catalogue. Risques : `layer` réconcilié par `currentActionSet` seulement dans `connectedView` ; vérifier qu'un mode ouvert avant la connexion survit au passage à `connected`.
- Critères d'acceptation : sur iPhone, « Filtres » avant la connexion ouvre le carrousel avec l'aperçu en direct de ma caméra ; le flou et les couleurs choisis restent appliqués après le décroché ; aucune capture possible avant la connexion ; plus aucune référence à `CallEffectsOverlay` ni `VideoFiltersPanel` ; tests de la règle de capture et garde de source contre le retour de l'ancien panneau.
- Liens : `apps/ios/tasks/routine-appels.md` (APP-5), audit `frames/07-audit-ui-ux-camera-appels.md` du projet.

## OPUS-5 — Appel vidéo entrant : pas de vignette de ma caméra, pas de « Répondre sans vidéo »
- Statut : fait (#16667, fusionnée le 2026-11-07) — reste à valider sur iPhone réel (critères ci-dessous)
- Signalé par : routine appels, le 2026-11-07
- Point d'origine : APP-6
- Constat : l'écran d'appel vidéo entrant (`Call/Views/IncomingCallView.swift`) montre l'appelant derrière la sonnerie (`CallPreviewBackdrop`, `CallPreviewViews.swift:10-27`) mais jamais ma propre image : je décroche sans savoir de quoi j'ai l'air. Les boutons (`IncomingCallView.swift:226`, `actionButtons`) n'offrent que Accepter et Refuser ; `acceptCall()` (`:36-44`) demande la caméra si `callManager.isVideoEnabled` puis appelle `callManager.answerCall()` (`Services/CallManager+Answer.swift:19`), qui répond avec la vidéo de l'appel. Couper la caméra n'existe qu'après la connexion (`Services/CallCollaborators/CallCameraActuator.swift:30`, `toggleVideo()`, qui peut exiger une renégociation : `announceVideoToggle(target:needsRenegotiation:)`, `:133`).
- Reproduction : recevoir un appel vidéo app au premier plan : ni vignette de ma caméra, ni choix de répondre en audio seul ; il faut décrocher caméra allumée puis la couper.
- Pourquoi la routine ne l'a pas fait : la vignette exige d'ouvrir la caméra avant le décroché (session caméra ou piste locale WebRTC, interdites à la routine ; chauffe et voyant vert à mesurer sur iPhone, rien ne doit être envoyé avant le décroché). « Répondre sans vidéo » exige que `answerCall` accepte un drapeau vidéo ou que la piste locale parte désactivée, et que le pair en soit averti (`call:media-toggled`) : signalisation et `CallManager`, interdits.
- Piste de correction : 1) `CallManager.answerCall(withVideo: Bool = true)` : sans vidéo, ne pas activer la piste locale (ou l'activer `isEnabled = false`) et émettre l'état média au pair dès la connexion, sans renégociation si la transceiver existe déjà. 2) Vignette locale : réutiliser la capture que la piste locale WebRTC ouvrira de toute façon, démarrée à la sonnerie mais jamais attachée à l'émetteur avant le décroché ; sinon un `AVCaptureVideoPreviewLayer` léger arrêté au décroché. 3) Vue : vignette arrondie en haut à droite (`CallSelfTile` comme modèle), bouton « Répondre sans vidéo » (`video.slash`) à côté d'Accepter, libellés `String(localized:…, bundle: .main)` et VoiceOver ; règle pure « quels boutons pour quel appel » testée.
- Critères d'acceptation : sur iPhone réel, la vignette s'affiche en moins de 500 ms après la sonnerie, rien ne part au réseau avant le décroché (vérifié par les statistiques WebRTC), « Répondre sans vidéo » connecte l'appel caméra coupée et le pair voit l'avatar ; `thermalState` inchangé sur 30 s de sonnerie ; tests de la règle des boutons.
- Liens : `apps/ios/tasks/routine-appels.md` (APP-6), #8480 (aperçu avant décroché).

## OPUS-6 — Aucune grille des tiers pour cadrer au viseur
- Statut : fait (#16734)
- Signalé par : routine caméra, le 2026-11-07
- Point d'origine : CAM-2 (audit B4)
- Constat : le viseur ne peint ni grille ni niveau. Le réglage demandé n'a nulle part où vivre : la rangée haute est pleine (`Meeshy/Features/Composer/ComposerCaptureTopRow.swift:36-38`, « la rangée tient alors sept contrôles, et la largeur d'un iPhone n'en porte pas huit »), le viseur n'a ni menu ni `⋯` (aucun `Menu`/`confirmationDialog` de réglage dans `ComposerCapture*`, `ComposerSceneCamera*`, `ComposerCamera*`), et l'app n'a pas d'écran de réglages caméra. Les seules préférences du viseur sont l'intensité du flash (`ComposerCaptureSession.swift:210`, `:642`) et l'astuce vue (`ComposerCaptureBottomRow.swift:33`).
- Reproduction : ouvrir le viseur du composeur sur simulateur ou iPhone : aucun contrôle ni réglage « Grille ».
- Pourquoi la routine ne l'a pas fait : il faut décider où vit l'interrupteur (décision produit). La partie technique est petite une fois ce choix fait.
- Décision : Jacques a choisi (a) le 2026-11-07.
- Piste de correction : choix à trancher par Jacques parmi (a) un `⋯` en bout de rangée haute qui remplace `[ ]` et ouvre un petit menu (Grille, plus tard Retardateur, voir OPUS-8), (b) un appui long sur le retournement, (c) une ligne « Grille du viseur » dans les réglages de l'app. Ensuite : clé `@AppStorage("composer.camera.grid")` à `false` ; règle pure `ComposerCaptureGrid.lines(in: CGRect) -> [CGFloat]` (tiers de l'IMAGE visible, donc du trou du cadre quand la vue Metal peint, comme `ComposerCaptureSession+Tap.swift:57-67`) ; vue `Canvas` 0,5 pt, blanc 35 % avec ombre légère, `allowsHitTesting(false)`, `accessibilityHidden(true)`, posée dans l'overlay du viseur (`ComposerCaptureViews.swift:225-245`) et jamais dans le rendu de la prise ; masquée en retouche et pendant l'enregistrement si Jacques le souhaite.
- Critères d'acceptation : désactivée par défaut ; test unitaire des lignes (image pleine et trou de cadre) ; la photo et la vidéo prises n'ont pas de grille ; réglage conservé d'une ouverture à l'autre ; libellé traduit (`String(localized:…, bundle: .main)` + `Localizable.xcstrings`) et annoncé par VoiceOver.
- Liens : `/mnt/project-files/frames/07-audit-ui-ux-camera-appels.md` § B4, `tasks/routine-camera.md` CAM-2.

## OPUS-7 — Pas de compensation d'exposition après le toucher de mise au point
- Statut : fait (#16653)
- Signalé par : routine caméra, le 2026-11-07
- Point d'origine : CAM-3 (audit)
- Constat : le toucher vise netteté et exposition (`Meeshy/Features/Composer/ComposerCaptureFocus.swift:65-80`, `ComposerCaptureSession+Tap.swift:44-53`) puis montre l'anneau (`ComposerCaptureViews.swift:238-244`), mais rien ne règle le biais d'exposition. Le protocole des commandes d'objectif n'a pas de méthode pour ça (`Meeshy/Features/Main/Components/ComposerCaptureCamera.swift:7-28` : zoom, torche, photo, mise au point seulement), et `CameraModel` n'appelle jamais `setExposureTargetBias` (aucune occurrence dans le dépôt).
- Reproduction : viseur armé, toucher un sujet en contre-jour : l'anneau paraît, aucun moyen d'éclaircir ou d'assombrir.
- Pourquoi la routine ne l'a pas fait : il faut une nouvelle commande dans `ComposerCaptureCameraProviding` et son implémentation dans `CameraModel+Lens.swift` (session caméra, interdite à la routine), plus une recette sur iPhone réel.
- Piste de correction : ajouter `setExposureBias(_ ev: Float)` au protocole, implémenté dans `CameraModel+Lens.swift` sous `lockForConfiguration` et borné à `minExposureTargetBias...maxExposureTargetBias`, remis à 0 dans `CameraFocusControl.aim` et au changement d'objectif (`switchCamera`). Côté composeur : règle pure `ComposerCaptureExposure.bias(dragY:range:)` (environ 1 EV pour 100 pt, bornée à ±2 EV), petit soleil à droite de l'anneau, glissé vertical qui DÉMARRE sur le soleil (le glissé vertical de la scène sert déjà au zoom et à la fermeture, `ComposerCaptureViews.swift:471-480`), `accessibilityAdjustableAction` pour VoiceOver. Le soleil s'efface avec l'anneau.
- Critères d'acceptation : tests de la règle (bornes, remise à zéro au toucher suivant et au retournement) ; doublure du protocole qui compte les appels ; sur iPhone, l'image s'éclaircit ou s'assombrit sans saut et revient à 0 au toucher suivant ; aucun conflit avec le zoom au glissé.
- Liens : `tasks/routine-camera.md` CAM-3, OPUS-1.

## OPUS-8 — Pas de retardateur pour une photo posée ou de groupe
- Statut : fait (#16760)
- Signalé par : routine caméra, le 2026-11-07
- Point d'origine : CAM-4 (audit B5)
- Constat : aucun retardateur au viseur. La rangée haute ne peut pas prendre de huitième contrôle (`Meeshy/Features/Composer/ComposerCaptureTopRow.swift:36-38`, `:56-63`) et l'audit laisse deux emplacements possibles (« sous le flash ou dans un appui long »).
- Reproduction : ouvrir le viseur : rien ne permet de différer la prise.
- Pourquoi la routine ne l'a pas fait : l'emplacement est une décision produit, et le point est de taille M (état du compte à rebours, annulation, annonces VoiceOver, sons).
- Piste de correction : à trancher avec OPUS-6 (un même `⋯` pourrait porter Grille et Retardateur). Ensuite : état pur `ComposerCaptureTimer` (off / 3 s / 10 s, compte qui décroît, annulé par un toucher, par (x), par la sortie du viseur ou par le passage en arrière-plan), testé ; grand chiffre au centre du viseur en police dynamique, sans animation sous Reduce Motion ; chaque seconde annoncée à VoiceOver (`AccessibilityNotification.Announcement`) ; le déclenchement réutilise le chemin du déclencheur existant (`ComposerCaptureSession` photo), pas de nouvelle commande caméra.
- Critères d'acceptation : tests de l'état (décompte, annulations) ; la photo part à 3 s et 10 s ; un toucher annule ; VoiceOver annonce le décompte ; textes traduits.
- Liens : `/mnt/project-files/frames/07-audit-ui-ux-camera-appels.md` § B5, `tasks/routine-camera.md` CAM-4.

## OPUS-9 — Le bouton Camera Control des iPhone 16 et 17 ne règle rien dans Meeshy
- Statut : à faire
- Signalé par : audit, le 2026-11-08
- Point d'origine : doc 08 § R7 (recherche état de l'art)
- Constat : aucun `AVCaptureControl` n'est ajouté à la session (`grep AVCaptureSlider\|AVCaptureIndexPicker\|AVCaptureSystemZoomSlider` vide dans `apps/ios`) ; le bouton latéral ouvre au mieux l'app sans rien piloter.
- Reproduction : iPhone 16, viseur du composeur ouvert, glisser sur Camera Control : rien ne se passe.
- Pourquoi la routine ne l'a pas fait : touche `AVCaptureSession` (`addControl`, délégué des contrôles) dans `CameraModel` ; recette sur iPhone 16 obligatoire.
- Piste de correction : `AVCaptureSystemZoomSlider` et `AVCaptureSystemExposureBiasSlider` sur l'objectif en place, plus un `AVCaptureIndexPicker` « Ambiance » qui fait défiler les looks du viseur (ceux du rail Filtres) ; contrôles recréés à chaque bascule d'objectif ; `supportsControls` vérifié ; délégué sur la file de la session.
- Critères d'acceptation : zoom, exposition et look pilotables au bouton sur iPhone 16 ; rien ne change sur un iPhone sans bouton ; pas de délai ajouté à l'ouverture du viseur.
- Liens : CAM-6 (boutons de volume, côté interface).

## OPUS-10 — Vidéo du viseur : stabilisation, cadence et basse lumière laissées au hasard
- Statut : à faire
- Signalé par : audit, le 2026-11-08
- Point d'origine : doc 08 § R9 et R10
- Constat : ni `preferredVideoStabilizationMode`, ni cadence choisie (`activeVideoMinFrameDuration`), ni `isLowLightBoostEnabled` dans `Main/Components/` ; le système décide, souvent sans stabilisation en caméra avant.
- Reproduction : filmer en marchant, objectif arrière puis avant ; filmer dans une pièce sombre.
- Pourquoi la routine ne l'a pas fait : session caméra et format actif (`CameraModel`, `CameraInputInstaller`), chauffe à mesurer sur iPhone réel.
- Piste de correction : `cinematicExtended` en arrière quand le format le sert, `standard` en avant ; 30 i/s par défaut, 60 i/s proposé dans le menu `⋯` ; `isLowLightBoostEnabled` en vidéo quand supporté ; ne pas couper l'exposition pilotée par le visage après un toucher sans visage.
- Critères d'acceptation : vidéo stable en marchant (arrière), recadrage avant acceptable, latence d'aperçu inchangée, `thermalState` ≤ fair sur 5 min de vidéo, rendu plus clair en basse lumière.
- Liens : OPUS-1, #16482.
