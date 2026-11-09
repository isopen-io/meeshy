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
- Relu le 2026-11-08 (audit 09) : la recette de #16506 doit aussi couvrir OPUS-14 (effets de visage en paysage), une vidéo qui change de tenue entre deux segments (mise en bandes sur la toile du premier, `CameraSegmentOrientation.swift:44-60`) et, pour #16505, l'écart de teinte d'un même look entre l'aperçu (trames vidéo) et la photo (traitement photo).

## OPUS-2 — Le catalogue de filtres est trop mince pour dépasser le marché
- Statut : en cours (#17000, #17001) — les huit ambiances (Naturel, Doré, Pellicule, Nuit douce, Clair, Velours, Ciel, Noir et blanc) livrées en cube 3D au viseur et en appel ; restent le pavé 2D chaleur/contraste, le curseur d'intensité et la recette sur peaux claires et foncées sur iPhone
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
- Relu le 2026-11-08 (audit 09) : `CameraPhotoTuning.swift` pose déjà `maxPhotoDimensions`, la priorité `.balanced`, l'obturateur sans latence et la capture réactive. Reste : la définition volontairement bornée à 2560 px (OPUS-12) et la stabilisation (OPUS-10).

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
- Statut : en cours (#16818, #16821) — zoom et exposition livrés, tests verts (`CameraSystemControlsTests`) ; restent le sélecteur « Ambiance » au Camera Control (les huit ambiances existent depuis #17001) et la recette sur iPhone 16
- Signalé par : audit, le 2026-11-08
- Point d'origine : doc 08 § R7 (recherche état de l'art)
- Constat : aucun `AVCaptureControl` n'est ajouté à la session (`grep AVCaptureSlider\|AVCaptureIndexPicker\|AVCaptureSystemZoomSlider` vide dans `apps/ios`) ; le bouton latéral ouvre au mieux l'app sans rien piloter.
- Reproduction : iPhone 16, viseur du composeur ouvert, glisser sur Camera Control : rien ne se passe.
- Pourquoi la routine ne l'a pas fait : touche `AVCaptureSession` (`addControl`, délégué des contrôles) dans `CameraModel` ; recette sur iPhone 16 obligatoire.
- Piste de correction : `AVCaptureSystemZoomSlider` et `AVCaptureSystemExposureBiasSlider` sur l'objectif en place, plus un `AVCaptureIndexPicker` « Ambiance » qui fait défiler les looks du viseur (ceux du rail Filtres) ; contrôles recréés à chaque bascule d'objectif ; `supportsControls` vérifié ; délégué sur la file de la session.
- Critères d'acceptation : zoom, exposition et look pilotables au bouton sur iPhone 16 ; rien ne change sur un iPhone sans bouton ; pas de délai ajouté à l'ouverture du viseur.
- Liens : CAM-6 (boutons de volume, côté interface).

## OPUS-10 — Vidéo du viseur : stabilisation, cadence et basse lumière laissées au hasard
- Statut : en cours (#16816, #16817) — stabilisation `standard` et basse lumière livrées, tests verts (`ComposerCaptureMirrorRuleTests`) ; restent les modes `cinematic` et la cadence 60 i/s, après recette sur iPhone
- Signalé par : audit, le 2026-11-08
- Point d'origine : doc 08 § R9 et R10
- Constat : ni `preferredVideoStabilizationMode`, ni cadence choisie (`activeVideoMinFrameDuration`), ni `isLowLightBoostEnabled` dans `Main/Components/` ; le système décide, souvent sans stabilisation en caméra avant.
- Reproduction : filmer en marchant, objectif arrière puis avant ; filmer dans une pièce sombre.
- Pourquoi la routine ne l'a pas fait : session caméra et format actif (`CameraModel`, `CameraInputInstaller`), chauffe à mesurer sur iPhone réel.
- Piste de correction : `cinematicExtended` en arrière quand le format le sert, `standard` en avant ; 30 i/s par défaut, 60 i/s proposé dans le menu `⋯` ; `isLowLightBoostEnabled` en vidéo quand supporté ; ne pas couper l'exposition pilotée par le visage après un toucher sans visage.
- Critères d'acceptation : vidéo stable en marchant (arrière), recadrage avant acceptable, latence d'aperçu inchangée, `thermalState` ≤ fair sur 5 min de vidéo, rendu plus clair en basse lumière.
- Liens : OPUS-1, #16482.

## OPUS-11 — Une vidéo interrompue (appel, arrière-plan, Siri) est jetée en entier
- Statut : fait (#16807), recette iPhone à faire
- Signalé par : audit, le 2026-11-08
- Point d'origine : audit 09 § S1
- Constat : `CameraModel.handleSegmentFinished` jette TOUS les segments dès que `error != nil` (`Main/Components/CameraModel.swift:823-830`, `endRecordingWithoutOutput`). AVFoundation clôt pourtant la prise avec une erreur ET un fichier valide (`userInfo[AVErrorRecordingSuccessfullyFinishedKey] == true`) en cas d'appel entrant, de passage en arrière-plan, de Siri, de durée ou de taille maximale, de disque presque plein. Si l'assemblage de plusieurs segments échoue, seul le dernier est livré et les autres restent dans `tmp/` (`:892-903`). La photo sans données sort aussi en silence (`:948-951`).
- Reproduction : iPhone réel, filmer 20 s dans le viseur du composeur, se faire appeler (ou passer l'app en arrière-plan) : aucune vidéo n'arrive en retouche ni dans Photos, aucun message.
- Pourquoi la routine ne l'a pas fait : `CameraModel.swift` interdit, recette sur iPhone réel (interruptions).
- Piste de correction : lire `AVErrorRecordingSuccessfullyFinishedKey` ; si vrai, traiter le segment comme fini (le garder, livrer la prise avec les segments déjà pris) ; sinon garder les segments précédents valides plutôt que tout jeter. Repli d'assemblage : livrer le premier segment et dire que la prise a été coupée, ou assembler sans ré-encodage ; effacer les segments non livrés. Photo sans données : `HapticFeedback.error()` et message. Règle pure (erreur + clé → garder / jeter) testée.
- Critères d'acceptation : test de la règle sur les codes d'interruption ; sur iPhone, une vidéo coupée par un appel ou l'arrière-plan arrive en retouche avec ce qui a été filmé ; aucun fichier ne reste dans `tmp/` ; un échec réel se dit.
- Liens : `/mnt/project-files/frames/09-audit-bogues-capture-camera.md` § S1, #9684 (aucune prise ne se perd).

## OPUS-12 — « Enregistrer l'original » met dans Photos une copie réduite à 2560 px, débruitée et rognée en 16:9
- Statut : à faire
- Décision : Jacques, le 2026-11-08 : l'original enregistré à la définition native et en 4:3 en photo ; la version bornée ne sert qu'à l'envoi. Plein écran : la prise garde son format, le viseur remplit l'écran, les boutons se posent dessus ; la photo n'est plus rognée aux proportions de l'écran.
- Signalé par : audit, le 2026-11-08
- Point d'origine : audit 09 § F1 ; recoupe OPUS-1
- Constat : le délégué photo traite la prise avec `PhotoCaptureSettings.capture` (`CameraModel.swift:952` ; `packages/MeeshySDK/Sources/MeeshySDK/Media/PhotoCaptureProcessor.swift:61` : 2560 px, débruitage et netteté `:220-224`), puis c'est ce fichier que le réglage « enregistrer l'original » écrit dans Photos (`CameraModel.swift:967-976`). La session est en `.high` (`:275`), donc la photo est au 16:9 : le capteur 4:3 perd un quart de son champ. Le traitement tourne de façon synchrone dans le délégué d'AVFoundation.
- Reproduction : activer Réglages › Médias « enregistrer l'original », prendre une photo, ouvrir ses informations dans Photos : ~2560×1440 au lieu de 4032×3024.
- Pourquoi la routine ne l'a pas fait : décision produit (définition et format de l'original), session caméra, recette chauffe et délai.
- Piste de correction : garder les octets natifs de `fileDataRepresentation()` pour Photos, n'appliquer `PhotoCaptureSettings.capture` qu'à la copie de travail et à l'envoi ; traiter hors du délégué (file dédiée) ; si Jacques veut un vrai mode photo, format 4:3 actif en photo et 16:9 en vidéo (bascule de format à mesurer, #16504).
- Critères d'acceptation : définition native dans Photos ; délai toucher → photo suivante inchangé ; aperçu et photo de mêmes proportions ; `thermalState` ≤ fair sur 10 min de viseur.
- Liens : OPUS-1, #16505.

## OPUS-13 — Aucune photo prise dans Meeshy ne porte de lieu
- Statut : à faire
- Décision : Jacques, le 2026-11-08 : la copie dans Photos garde la position précise ; à l'envoi, la position est réduite selon le réglage de précision du lieu (jusqu'à rien).
- Signalé par : audit, le 2026-11-08
- Point d'origine : audit 09 § I1
- Constat : `AVCapturePhotoOutput` n'écrit jamais de GPS ; rien dans `CameraModel`, `PhotoCaptureProcessor` ni `PhotosAssetCreator` (`PhotoLibraryManager.swift:308-327`, pas de `location`) ne l'ajoute. Deux commentaires disent le contraire (`Features/Composer/ComposerCaptureOrientation.swift:56-57`, `PhotoCaptureProcessor.swift:14`). Les cadres n'ont pas d'élément « lieu ». La décision du projet (précision du lieu réglée par l'utilisateur, aussi pour les posts) n'est pas appliquée.
- Reproduction : prendre une photo au viseur avec « enregistrer l'original », l'ouvrir dans Photos : aucun lieu.
- Pourquoi la routine ne l'a pas fait : décision produit (vie privée), localisation et session caméra.
- Piste de correction : selon le réglage de précision, poser la position (arrondie à la précision choisie) dans les métadonnées de la copie de Photos (`AVCapturePhotoFileDataRepresentationCustomizer` ou `PHAssetCreationRequest.location`) ; l'envoi la retire déjà selon la politique (`OutgoingImagePreparer.swift:161-166`, `:324-325`) ; corriger les deux commentaires ; l'élément « lieu » des cadres lit la même source.
- Critères d'acceptation : lieu présent dans Photos quand le réglage le permet, absent sinon ; jamais envoyé sans accord (test de `OutgoingImagePreparer`) ; pas de demande de localisation sans geste de l'utilisateur.
- Liens : `/mnt/project-files/frames/01-spec-frames-et-packs.md` (éléments lieu), #9347.

## OPUS-14 — Le lissage et les effets de visage s'éteignent probablement dans l'aperçu quand l'iPhone est couché
- Statut : à faire (recette d'abord)
- Signalé par : audit, le 2026-11-08
- Point d'origine : audit 09 § R2
- Constat : les trames de l'aperçu sont redressées pour un appareil debout (`Features/Composer/ComposerLiveLook.swift:74-76`) et le visage y est cherché avec `rotation: 0` et `orientation: .up` (`Features/Composer/ComposerFaceEffects.swift:61`, `:75`). En paysage, le visage est de travers dans la trame ; la photo, redressée à l'horizon, reçoit l'effet. L'aperçu ne montrerait plus ce qui part.
- Reproduction : iPhone réel, viseur du composeur, effet « Lissage de peau », tourner l'appareil en paysage : vérifier si l'effet disparaît de l'aperçu ; prendre la photo et comparer.
- Pourquoi la routine ne l'a pas fait : moteur partagé avec l'appel (`CallFaceEffectsRenderer`, `Features/Call/`), recette sur iPhone.
- Piste de correction : passer l'angle de l'horizon (`ComposerCaptureHorizon.captureAngle`) au suivi du visage : orientation Vision et `rotation` dérivées de l'angle, sonde inchangée ; même correction côté appel si l'appel a le même défaut.
- Critères d'acceptation : effet visible dans l'aperçu dans les quatre tenues ; test de la règle angle → orientation Vision ; coût du suivi inchangé.
- Liens : #16506, OPUS-3.

## OPUS-15 — Au viseur, le lissage est figé à 0,4 et le Teint naturel n'existe pas
- Statut : à faire
- Décision : Jacques, le 2026-11-08 : un seul réglage de peau (force du lissage + Teint naturel) pour l'appel et le viseur, sauf contre-indication technique à documenter ici.
- Signalé par : audit, le 2026-11-08
- Point d'origine : audit 09 § I2
- Constat : `ComposerFaceEffects.intensity` lit un `VideoFilterConfig()` neuf (`Features/Composer/ComposerFaceEffects.swift:32`, valeur par défaut `skinSmoothingIntensity = 0.4`, `Main/Services/VideoFilterPipeline.swift:32`), jamais le réglage du curseur de l'appel (`Features/Call/Views/CallModeControls.swift:209`). Le Teint naturel (décision du 2026-10-02 : filtre permanent imperceptible) n'est appliqué qu'en appel (`Features/Call/Services/CallSkinRetouch.swift`).
- Reproduction : régler le lissage à 80 % en appel, prendre une photo au viseur avec « Lissage de peau » : le lissage est à 40 % ; pas de Teint naturel.
- Pourquoi la routine ne l'a pas fait : décision produit (un réglage commun ou deux), `VideoFilterPipeline` interdit.
- Piste de correction : un réglage de peau unique (force + Teint naturel) lu par l'appel et le viseur, persistant ; curseur dans la miniature « Lissage » du rail Effets ; le Teint naturel peint par le peintre unique (`ComposerLookPainter.paint`, étage `.face`) ; mêmes rendus dans l'aperçu, la photo et la vidéo.
- Critères d'acceptation : même force et même teint en appel et au viseur ; test de la lecture du réglage ; budget GPU inchangé.
- Liens : `/mnt/project-files/frames/03-peau-teint-naturel-et-lissage.md`, #9199.

## OPUS-16 — Une prise en retouche est perdue si l'app est tuée avant « Terminé »
- Statut : à faire
- Décision : Jacques, le 2026-11-08 : la prise est copiée dans le brouillon (dans l'app, pas dans Photos) dès son arrivée ; au relancement la retouche se rouvre ; la copie s'efface à « Terminé » ou à l'abandon.
- Signalé par : audit, le 2026-11-08
- Point d'origine : audit 09 § S4
- Constat : par défaut l'original ne rejoint pas Photos (`CaptureSavePolicy.standard`, `Features/Composer/ComposerGallery.swift:56`) ; la prise vit dans `ComposerCaptureSession` (`editPhoto`, `editPhotoData`) et dans `tmp/` jusqu'à « Terminé ». Le brouillon du composeur (`ComposerAutosave*`) ne la connaît qu'après la remise à l'hôte. App tuée en arrière-plan (pression mémoire, fréquente avec la caméra), plantage ou balayage : la prise disparaît.
- Reproduction : prendre une photo ou une vidéo, rester en retouche, passer en arrière-plan et forcer la fermeture : rien au relancement, rien dans Photos.
- Pourquoi la routine ne l'a pas fait : décision (garder la prise sans la mettre dans Photos), brouillon du composeur hors périmètre, plus de 300 lignes.
- Piste de correction : à l'arrivée de la prise, l'écrire dans le dossier du brouillon (même mécanique que `ComposerAutosaveSnapshot` : nom de fichier, jamais URL de `tmp/`) avec le look et le cadrage ; au relancement, rouvrir la retouche ; effacer à « Terminé » ou à l'abandon explicite.
- Critères d'acceptation : prise retrouvée après fermeture forcée ; aucun fichier orphelin après « Terminé » ou abandon ; tests du cycle de vie du fichier.
- Liens : #9684.

## OPUS-17 — Le HDR de la photo disparaît dès qu'on peint un filtre, un cadre ou un texte
- Statut : à faire
- Signalé par : audit, le 2026-11-08
- Point d'origine : audit 09 § F2
- Constat : sans look, la prise garde sa carte de gain (`PhotoCaptureProcessor.swift:119-131`). Avec un look, un cadre ou un texte, la prise est décodée sans carte de gain (`Features/Composer/ComposerCaptureSession+Takes.swift:275-282`) et peinte en RGBA8 (`Features/Composer/ComposerLookPainter.swift:251-259`) : la photo sort SDR. La vidéo, elle, garde HLG/PQ (`ComposerLookVideoExporter.swift:100-107`).
- Reproduction : iPhone 12 ou plus, scène lumineuse, photo avec le cadre de son choix enregistrée dans Photos, comparée à la même sans cadre : la première est terne sur écran HDR.
- Pourquoi la routine ne l'a pas fait : chaîne HDR (gain map, espace PQ) et recette sur écran HDR.
- Piste de correction : décoder avec `.expandToHDR`, peindre en demi-flottants Display P3 PQ comme `renderHDR`, encoder avec `kCGImageDestinationEncodeToISOGainmap` ; le cadre et le texte restent au blanc de référence (pas d'éblouissement).
- Critères d'acceptation : photo avec look et cadre HDR dans Photos ; cadre au blanc SDR ; coût du rendu mesuré.
- Liens : #11247, #11847.

## OPUS-18 — Une photo prise pour un commentaire perd son EXIF et passe en JPEG
- Statut : à faire (petit, hors périmètre de la routine)
- Signalé par : audit, le 2026-11-08
- Point d'origine : audit 09 § I3
- Constat : `ComposerReturnedMedia(capture:)` jette les octets de la prise (`Features/Composer/ComposerReturnMedia.swift:19`) et `CommentAttachmentIntake.stage` ré-encode l'image en JPEG 0,9 (`Features/Main/Views/CommentAttachmentIntake.swift:220`) : date, appareil, HDR et HEIC perdus, une compression de plus. La conversation et le composeur gardent les octets (`Main/Views/ConversationView+SceneRetouch.swift:85`, `Composer/MeeshyComposerHost+Ingestion.swift:122-136`).
- Reproduction : commentaire, viseur, photo, publier ; télécharger la pièce : JPEG sans EXIF de prise.
- Pourquoi la routine ne l'a pas fait : fichiers hors du périmètre de la routine.
- Piste de correction : `stage(capture:)` lit `.photo(_, data:)` et passe par `ComposerCapturePayload.bytes(original:fallback:)` comme le composeur ; garde de source contre `jpegData` sur une prise.
- Critères d'acceptation : test : les octets écrits sont ceux de la prise (EXIF présent, extension lue dans les octets) ; repli JPEG seulement sans octets.
- Liens : #4080, #9347.

## OPUS-19 — Au viseur, l'état parle à cinq endroits à la fois au lieu d'une seule ligne
- Statut : décision attendue
- Signalé par : routine caméra, le 2026-11-08
- Point d'origine : CAM-9 (doc 08 § R4)
- Constat : les messages d'état du viseur vivent à cinq endroits, sur deux couches du montage, et peuvent s'afficher ensemble. (1) Le chrono de prise est une puce dans la rangée haute, à droite de la croix (`ComposerSceneCameraBar.swift:164`, `:187`, `chronoChip` `:475`, règle `ComposerCaptureTopRow.showsChrono` `:82`). (2) Il se répète sur la miniature choisie (`ComposerLookStrip.swift:332`, `chosenOverlay`, posé `:314` et `:464`). (3) Le retardateur est un grand chiffre de 96 pt au centre du viseur (`ComposerCaptureCountdown`, `ComposerSceneCameraBar.swift:595`, monté `ComposerCaptureViews.swift:598`), une forme voulue par CAM-4. (4) L'alerte thermique est peinte sur la couche IMAGE (`ComposerCaptureViews.swift:95-97`, règle `ComposerFramePacing.swift:100`), pas sur celle des commandes. (5) L'astuce de geste est sous le déclencheur (`ComposerCaptureBottomRow.swift:222`, `:238`).
- Reproduction : au simulateur, filtre lourd sous un état thermique `.serious` simulé, retardateur 10 s puis prise vidéo : chrono en haut, chrono sur la miniature, compte au centre et alerte thermique sont visibles en même temps.
- Pourquoi la routine ne l'a pas fait : décision produit et taille. Ramener ces messages dans une capsule unique déplace le grand compte au centre (choix de CAM-4), retire un des deux chronos et fait passer l'alerte thermique de la couche image à celle des commandes. Le diff touche quatre vues sur deux couches et dépasse une PR lisible.
- Piste de correction : (a) Jacques tranche ce qui reste hors de la capsule : le grand compte au centre (recommandé, il se lit de loin pour une photo de groupe) et la puce du chrono à droite de la croix ou sur la miniature. (b) Règle pure `ComposerCaptureStatusLine.message(recording:elapsed:timerRemaining:thermal:hint:) -> Message?` avec l'ordre fixe enregistrement + chrono > retardateur > alerte thermique > astuce de geste, et `nil` quand tout va bien. (c) Une capsule sous la rangée haute, dans `ComposerCaptureChrome`, qui rend les textes existants (`ComposerCaptureCopy.thermalNotice`, `ComposerSceneCameraCopy.hint`, chrono `ComposerCaptureSegments.elapsed`) sans en changer un mot, et qui garde l'annonce VoiceOver thermique (`ComposerCaptureViews.swift:131-132`). (d) Retirer les doublons au même commit. Risques : la capsule ne doit pas passer sous l'encoche en plein écran, et elle doit rester lisible sous un cadre clair (voile de #9777).
- Critères d'acceptation : tests de la règle (chaque paire de messages simultanés rend le plus prioritaire, rien quand tout va bien) ; au simulateur, une seule ligne d'état visible dans le scénario de reproduction ; mêmes textes et mêmes annonces VoiceOver qu'avant ; Dynamic Type XXL sans troncature du chrono.
- Liens : `routine-camera.md` CAM-9, CAM-4 (#16760), #9777, doc 08 § R4 (`/mnt/project-files/frames/08-sota-camera-optimisations.md`).
