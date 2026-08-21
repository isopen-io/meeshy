# Focal Grandeur Nature §5 — réécriture fidèle du défilement iOS (2026-08-18)

Contrat : `docs/design/2026-08-15-focal-spec-integration.html` §5 fait foi (demande user 18/08).
Les acquis d'architecture (six sites d'appel, `FocalPerspectiveCell` qui repose en
`layoutSubviews`, `MessageListLayout` compensation d'offset, décoration CALayer,
épingle d'élection, chrome escamoté, hauteur de rangée invariante à l'élection)
sont CONSERVÉS — ils ne contredisent pas la spec, ils la font tenir à 120 Hz.

## Lot 1 — Cœur du défilement (loi + pass + bogues)

- [ ] 1.1 Loi partagée : `FOCUS_CURVE_CONSTANTS.thread` → `{ maxDistance: 380, scaleDecay: 0.40, alphaDecay: 0.82 }`
      (`packages/shared/utils/focus-curve.ts`) + bande thread dédiée
      `THREAD_FOCUS_BAND_OFFSET = 150`, `THREAD_FOCUS_BAND_HYSTERESIS = 95`
      (la bande `list` 140/45 de la Lentille/Rivière ne bouge PAS). Régénérer
      vecteurs + tests TS.
- [ ] 1.2 Miroir Swift `FocalFocusCurve` : mêmes constantes, pivot horizontal
      0.18 → **0.16** (spec anchorPoint (0.16, 1.0) — mécanisme translation
      équivalente conservé, documenté). `FocalPerspectiveGeometry.standard` :
      bandLift 150, focusTolerance 95. Forme dynamique
      `focusY = H − max(150, composeur + 8)` conservée (clavier).
- [ ] 1.3 Fondu de distance RÉTABLI (spec) : `alpha = min(alphaCeiling, courbe.alpha)`
      — plancher 0.18 par construction, optimiste = `min(0.7, alphaPerspective)`
      littéralement. Supprimer `neighbourAlphaFloor` (mort).
- [ ] 1.4 LOUPE SUPPRIMÉE (spec : échelle ≤ 1, l'élu est à 1.0 + carte + tenue de
      focus) : retirer `magnification*` (constantes, geometry, zPosition
      d'élévation, `magnifiedTrailingReserve`, réserve trailing de section →
      retour à 12). `FocalCellTransform` sans zPosition (écrit 0).
- [ ] 1.5 Bogue « chrome de focus fantôme » : `isFocused` à la config de cellule
      gated par `!scrollingActive` ; à l'arrêt, reconfigure [ancien élu, élu].
- [ ] 1.6 Bogue « atterrissage sans tenue » : drapeau d'atterrissage programmatique ;
      `scrollViewDidEndScrollingAnimation` gère nudge ET atterrissage (rejoue le
      pass, re-cible UNE fois si |visualMidY − focusY| > 8 — hauteurs estimées —
      puis pose chrome + typographie + flush).
- [ ] 1.7 Pose après auto-scroll message entrant : `scrollToBottom` animé passe
      par le même chemin de pose (typographie du nouvel élu).
- [ ] 1.8 Coûts par frame : suppression du double balayage d'inset
      (`applyBottomInset` n'appelle plus le pass en propre), `syncFocalPassTheme`
      hors chemin chaud (aux changements seulement), garde d'égalité
      `ScrollTimePillState.isVisible`, code mort pilule flottante retiré
      (`configureScrollTimePillOverlay` sans appelant).
- [ ] 1.9 Rotation / changement de taille : rejouer pass + insets sur changement
      de bounds (`viewDidLayoutSubviews` gardé par delta), typographie ensuite.
- [ ] 1.10 Tests : mise à jour de la liste `wouldBreakOnSpecReturn` (géométrie,
      write, magnificence supprimée, élection 95, focusY 150) + nouveaux tests
      RED d'abord pour 1.3/1.5/1.6/1.7/1.9.

## Lot 2 — Matrice temps réel

- [ ] 2.1 Reconfigures ciblés (traductions, transcriptions, audios traduits)
      DIFFÉRÉS pendant le geste (§4.7ter), flush à la pose.
- [ ] 2.2 Swap de traduction tardive : cross-fade 150 ms sur le bloc texte
      (animation scopée au changement de texte effectif) + chip 🌐 INTERACTIF
      (tap = V.O., appui long = sélecteur).
- [ ] 2.3 Présence live : canal d'observation → reconfigure des rangées visibles
      (différé pendant geste).
- [ ] 2.4 Pilule non-lus : ne plus compter ses PROPRES messages.
- [ ] 2.5 Typing indicator PLAT en Focal/Script (pastille 22 auteur + 3 points
      accent, sans capsule) ; capsule conservée en bulles.
- [ ] 2.6 Effets de message : `effects` réellement passé à `FocalRowInput`
      (aujourd'hui jamais fourni — feature morte).
- [ ] 2.7 Échec d'envoi : bande retry rendue en Focal (`onRetry` déjà câblé),
      exclue de la perspective (plafond alpha inchangé pour .failed = 1).
- [ ] 2.8 Élection : messages supprimés / système / appel / éphémère expiré
      NON candidats et sans carte ; rangées système/appel CENTRÉES (spec).

## Lot 3 — Parité contenu & accessibilité

- [ ] 3.1 Flou de message (`content.isBlurred`) appliqué au bloc contenu en
      Focal avec révélation (parité bulle).
- [ ] 3.2 Lieu / fichier : rendu réel (carte lieu, carte fichier + badge de
      téléchargement + tap ouvrir) au lieu du repli texte inerte.
- [ ] 3.3 Long-press iOS 26 : préview native = rangée Focal (pixels), plus
      jamais une bulle en mode Focal.
- [ ] 3.4 « Début de la conversation · {date} » (date du premier message).
- [ ] 3.5 VoiceOver : libellés d'état d'envoi localisés (plus de français en dur
      sans accents dans `MessageAccessibilityLabelComposer`).

## Écarts spec ASSUMÉS (conservés, documentés au rapport)
- Carte de focus = fond accent translucide SANS anneau (choix user 17/08,
  postérieur à la spec) — `ringSize` 1.5 reste à une ligne.
- Texte 15→16 remplacé par la tenue de focus à hauteur constante (pastille 34,
  nom +2, barre) — la variation de corps re-mesurait la cellule à chaque arrêt.
- Pilule « jour · heure » remplacée par le révélé d'heures (amendement P2).
- Chrome escamoté pendant le défilement (demande user, absent de la spec).
- `focusY` dynamique (suit clavier/composeur) plutôt que littéral H−150.
- Carrousel audio multi-pistes : « inchangé » (spec) — garde sa carte.
- Orchestrateur `noteOpened` jamais appelé (isReaderAbsent toujours vrai) —
  hors périmètre défilement, signalé au rapport.

## Review (2026-08-18, fin de passe)

**Livré** : lots 1 et 2 COMPLETS + 3.1/3.5, plus deux correctifs de crash
découverts en vérification :
- Loi partagée réancrée spec §5 : thread 380/0.40/0.82 (fondu RÉTABLI),
  bande fil 150/95 (`THREAD_FOCUS_BAND_*`), pivot 0.16 ; vecteurs régénérés,
  parité TS/Swift verte, web intact (aucun consommateur production du thread).
- Loupe Magnificence SUPPRIMÉE (échelle ≤ 1, réserve trailing retirée,
  zPosition sans écrivain) ; `FocalSpecCurveTests` remplace
  `FocalMagnificenceTests`.
- Bogues de défilement corrigés : chrome de focus fantôme (gate
  anti-recyclage), pose d'atterrissage programmatique (drapeau + re-ciblage
  unique + épilogue commun de `scrollViewDidEndScrollingAnimation`),
  double balayage d'inset, travail mort par frame (pilule, thème).
- **CRASH long fling (SIGTRAP `_updateVisibleCellsNow` ×7, 3 .ips le
  18/08)** : cascade compensation d'offset × solveur self-sizing — plafonné
  à 3 compensations/transaction CA (`MessageListLayout`), réarmé au tour
  suivant. 60 flings violents post-fix : zéro crash. Reconfigures (globaux,
  ciblés, visibles/présence) TOUS différés pendant le geste.
- Matrice : effets câblés (feature morte), flou de message en Focal
  (`FocalProtectedContent`, conditionnel), bande retry, chip 🌐 interactif +
  cross-fade 150 ms, présence vivante (refreshSignal), badge non-lus sans
  ses propres envois, typing plat, fantômes/système exclus de l'élection,
  notices centrées, VoiceOver localisé.
- 581 tests Focal/Lentille verts ; garde `BetaFeatures…` (rouge sur main,
  préexistant) résolue par exception étroite agent-grammar.

**Restes (prochaine passe)** :
- Starvation de rendu hosting sur fling EXTRÊME (frames clairsemées à très
  haute vélocité — préexistant, atténué par les reports ; piste : pré-chauffe
  de cellules/`UICollectionViewDataSourcePrefetching`, simplification du
  corps de FocalRow).
- Lot 3 restant : lieu/fichier réels (3.2), préview iOS 26 en rangée plate
  (3.3), date du premier message dans « Début de la conversation » (3.4).
- `noteOpened` jamais appelé (orchestrateur : `isReaderAbsent` toujours
  vrai) — hors périmètre défilement, signalé.
- « Crash à l'ouverture » signalé en fin de passe = artefact d'installation
  build-for-testing (dylib widget absente du bundle installé), PAS un défaut
  du code — réinstallé via `meeshy.sh build`, lancement sain vérifié.

## Revue — Retrait du mode Focal iOS (2026-08-18, fin de chantier)

- [x] Mode Focal retiré de la compilation (Scroll/**, contrôles de focus,
      12 suites de tests) ; Script = mode nominal ; clamp `.focal→.script`
      à la consommation (`ReadingModeController.clampRetiredModes`), loi
      partagée + vecteurs TS↔Swift INTACTS ; restauration : `bce87148c`.
- [x] SIGTRAP fling/repos DÉFINITIVEMENT clos (4 itérations) : entonnoir
      `MessageListLayout.invalidateLayout(with:)` — invalidations partielles
      avalées au-delà de 4/transaction, rattrapage complet au tour suivant.
      Vérifié : 2 × 100 flings violents + 90 s repos, zéro crash.
- [x] Retours user : chrome de retour DÈS la levée du doigt (isDragging
      seul) ; pagination haut cache-FIRST (fenêtre GRDB avant REST) ;
      ouverture conversation mesurée < 1 s (cache-first sain — la lenteur
      restante vient de la gateway locale éteinte).
- [x] 568 tests Focal/Lentille + suites touchées verts ; docstrings périmées
      purgées (aucune suite supprimée citée comme preuve vivante).
- [x] Documentation : `docs/focal-retrait-ios-2026-08-18.md` +
      `apps/ios/decisions.md` (entrée 2026-08-18) + mémoire mise à jour.

---

# Lecteur de stories — directives user 2026-08-20 (session story-viewer)

- [x] 1. Réaction : longpress-scrub du cœur supprimé — tap simple ouvre/ferme la barre d'émojis (la barre de langues garde son scrub)
- [x] 2. Interlude : UNIQUEMENT au changement de groupe (lecture à la suite), plus jamais à la première ouverture du viewer
- [x] 3. Interlude : durée nominale 500 ms (2,2 s avant) — recouvrement 200 ms conservé, slide révélé à 300 ms
- [x] 4. Interlude : après « @ », le pseudo — `StoryGroup.username` portait `APIAuthor.name` (displayName) ; `applyIntroProfile` écrase désormais `intro.username` avec le vrai handle du profil
- [x] 5. Prefetch : fenêtre d'entrée (`entryIndex` + 1 slide) des 2 groupes suivants pendant la lecture ; ouverture instantanée quand le média est local

Note : le lecteur web fait DÉJÀ « clic = barre » (handleToggleReactionPicker) et n'a pas d'interlude — seul iOS divergeait, aucun changement web.

## Review
- Build app : vert (67 s). Tests ciblés : en cours (build-for-testing puis suites Story*).

---

# Listes iOS — fluidité du défilement + modes Bulles / Script / Focal (2026-08-21)

Demande user (21/08) : « revoir entièrement les effets des listings de conversations et de
messages, défilement le plus fluide possible, arranger et compléter la vue Script, Bulle et
Focal pour la liste de conversation, itérer sur le simulateur Meeshy-iOS26 ».

Lecture retenue (cartes Lentille / fil / docs du 21/08) : le triptyque Script · Bulles · Focal
est celui du FIL (parité web `LensSwitcher`) ; il se choisit depuis la LISTE (encoche de la carte
de focus, sous-menu, aperçu) et depuis le chip du fil. La liste elle-même (Lentille) n'a qu'une
présentation (rangées plates + perspective douce + carte de focus) — ses effets sont revus ici.

Branche `feat/ios-list-scroll-fluidity` (worktree `../v2_meeshy-ios-list-fluidity`, base
`origin/main` bfd152fe2). Simulateur cible : `Meeshy-iOS26` `C295B364-8CA6-4214-BC52-E411A97EBFE2`.

## Lot A — harnais de mesure (sans code produit)
- [x] Script de scène reproductible (idb) : liste 4 swipes, fil 4 swipes
- [x] Métrique objective : `simctl io recordVideo` + `ffmpeg mpdecimate` (frames dupliquées
      = hitches) + Time Profiler (`xctrace`, CPU main thread pendant le geste)
- [x] Référence chiffrée sur `origin/main` (liste Lentille, fil Script, fil Bulles)

## Lot B — liste de conversations (Lentille + peau historique)
Fluidité (cartes H1-H19) :
- [x] H1/H2 `LentilleFeatureFlag.isEnabled` : plus de `ProcessInfo.environment` par appel
      (instantané d'environnement unique par processus) ; drapeau lu UNE fois par passe et
      descendu aux rangs (`usesLentilleSkin`)
- [x] H3 menu contextuel natif : construit À L'OUVERTURE (closure), plus à chaque passe
- [x] H4 `preferredContentLanguages` hissé une fois par passe
- [x] H18 `shouldAutoLoadPreview` O(1) (index) au lieu de `firstIndex` O(n) par rang
- [x] H6 avatar Lentille : contexte dédié sans ressort `repeatForever` par rang
- [x] H8 candidature focale via `onGeometryChange` (plus de `GeometryReader`+`onChange`/rang)
- [x] H15/H17 aplatissement + tableau de candidats : pas d'allocation O(liste) par passe/tick
- [~] H10 libellés `RelativeTimeFormatter` — ÉVALUÉ, NON FAIT : une lecture `String(localized:)` par appel
      (~µs, table de chaînes déjà mise en cache par Foundation) contre le risque d'un libellé figé au
      changement de langue in-app ; pas de gain mesurable, non modifié
Effets :
- [x] L1 carte de focus : suit la rangée élue à CHAQUE tick (position vivante), peinte
      DERRIÈRE le contenu de la rangée (plus de masquage de la 2ᵉ ligne), jamais dans le vide
- [x] L2 encoche : libellé cohérent avec les modes réellement offerts
- [x] L4 pilule de section : libellé = section du haut de l'écran (plus de libellé périmé)
- [x] L5 sticker épinglé vs en-tête replié (trail de stories) : plus de chevauchement
- [x] L7 queue de liste : 400 pt de vide → juste ce qu'exigent barre de recherche + bande
- [x] Vérification simulateur (captures avant/après, métrique Lot A)

## Lot C — fil de messages (Bulles + Script)
- [x] Verrou de scène : plus de `layoutAttributesForItem` ×2n par frame
- [x] `FocalRowInput.==` sans allocation ; `statusForUser` O(1) ; direction de layout et
      résolution de langue mises en cache par instantané (plus par cellule)
- [x] Bulles : `BubbleContent` construit à la configuration, plus dans `body`
- [x] Menu contextuel iOS 26 : vérifié — `nativeMessageContextMenu` passe `menu()` et `preview()` en
      closures au `.contextMenu` natif (paresseux), la bulle/rangée est construite UNE fois et réutilisée
- [x] `GeometryReader` par cellule (`MessageFramePreferenceKey`) → `onGeometryChange` ou retrait
- [~] `MessageListView` : objets d'environnement (P1-5) — ÉVALUÉ : `updateUIViewController` n'est que
      des affectations gardées (`didSet` à égalité) + insets gardés ; sans mesure d'un coût, non modifié
- [x] Chrome (boutons/composeur/pilule) : retour à la levée du doigt vérifié au simulateur
- [x] Vérification simulateur (3 modes, chrome, pose) — métrique Lot A non rejouée après le lot D

## Lot D — modes Bulles · Script · Focal complets et sélectionnables
- [x] Bulles : entrée des menus (liste + chip) ; choix collant rendu en `.bubbles` drapeau ON
      (règle de CONSOMMATION, loi partagée intacte — même chemin que le web)
- [x] Focal : passe de perspective MINIMALE (transform + opacity CALayer sur les cellules
      visibles, loi `.thread` partagée, zéro relayout, zéro élection/atterrissage/carte) ;
      retrait du clamp `.focal → .script` ; retour dans `displayOrder` et `LentilleModeMenu`
- [x] Script : bouton (+) réaction rapide (`FocalRowInput.isLastReceivedMessage`, règle unique
      `BubbleReactionsOverlay.isMounted` partagée avec la bulle) ; `revealsTimestamp` SUPPRIMÉ (aucun
      écrivain, aucun lecteur)
- [x] Docs : `apps/ios/decisions.md` (entrée 2026-08-21), `docs/focal-retrait-ios-2026-08-18.md`
      (addendum « réintroduction minimale »)
- [x] Vérification simulateur des 3 modes (ouverture, défilement, bascule live par le chip) — captures
      21/08 16:5x ; Focal à l'OUVERTURE réparé (carte + détails + heure permanente + sur-réserve)

Ajouts 21/08 (retours user en cours de session) :
- [x] Pull-to-refresh coincé sous Lentille (offset relatif à l'inset, SDK)
- [x] Rail « moi » : 💭 / (+) / tap = listing « Mes stories »
- [x] Carte de focus MAGNIFIÉE (contenu réel, suit le doigt, menu natif)
- [x] Focal : compaction (proportions), carte accent du message en focus, détails à la pose
- [x] `MessageListLayout` : plus de boucle dispatch du rattrapage (Time Profiler)
- [ ] Mesure Instruments après (CPU main thread) — non rejouée
- [x] Aperçu long-press = carte des DERNIERS MESSAGES (`ConversationPreviewView`) sur les deux chemins,
      `LentillePeekView` (menu des modes dans l'aperçu) SUPPRIMÉE — décision user 21/08
- [x] Pilule de section = sticker qui TIENT la ligne d'épinglage (plus « le plus haut », périmé)
- [x] Focal : toute reconfiguration repose la perspective (carte perdue à l'ouverture) ; détails
      synchronisés au repos ; `focalOverscan` posé au premier layout ; heure permanente en focus

## Review — session 2 du 21/08 (simulateur Meeshy-iOS26 + iPhone physique)

**Livré** :
- Déploiement device (`meeshy.sh device`, « Services CEO i16pm », build 1791) du code du simulateur.
- Aperçu d'appui long = carte des DERNIERS MESSAGES (`ConversationPreviewView`) sur les deux
  chemins OS ; `LentillePeekView` supprimée (décision user : le menu des modes dans l'aperçu
  « ne sert à rien ») ; `LongPressPreviewGuardTests` ; recette L12 amendée.
- Pilule de section périmée (« AUJOURD'HUI » sous « PLUS ANCIEN ») : règle « sticker qui tient
  la ligne », ligne mesurée une fois sur le conteneur (6 tests).
- Focal à l'ouverture : carte absente avant tout défilement (reconfigurations de cellule sans
  repose) → repose en complétion de chaque apply ; détails synchronisés au repos ;
  `focalOverscan` au premier layout ; heure du message en focus PERMANENTE
  (`FocalIdentityHeader.revealsTimeAlways`, elle passait par le révélé) — 2 gardes.
- Script/Focal : (+) d'ajout rapide de réaction (`isLastReceivedMessage`), règle unique
  `BubbleReactionsOverlay.isMounted` ; `revealsTimestamp` supprimé (champ mort).
- Bundle de tests de la branche : 2 erreurs de compilation héritées (b7c3adb08/87edb34a4,
  jamais compilé) + 8 tests rouges jamais exécutés (chemin `#filePath` à 3 remontées, fixture
  hors portée de la loi, attentes du clamp retiré, structure `passContext`, inset
  `accessoryCollapsedHeight`) — corrigés.
- Vérifié au simulateur : liste (carte magnifiée, pilule, aperçu), fil (ouverture, défilement,
  bascule live Focal → Script → Bulles → Focal par le chip).

**Évalué, non modifié** : H10 (gain ~µs contre libellé figé au changement de langue), P1-5
(`update` borné à des affectations gardées), menu contextuel iOS 26 du fil (déjà paresseux).

**Observations hors périmètre** : le header replié (`CollapsibleHeader`, SDK) laisse voir le
sticker qui passe dessous (dégradé 0.75 → 0, design) ; la pilule de section double le libellé du
sticker épinglé sur la même ligne (design I-063, à trancher) ; mesure Instruments après lot D non
rejouée ; `meeshy.sh test` complet non rejoué (25 suites ciblées seulement).

## Review — session 3 du 21/08 (directives « magnificence au défilement »)

**Livré** (vérifié au simulateur, modes clair ET sombre) :
- Fil : perspective SEULEMENT sur geste utilisateur, aplatissement animé 2 s après la pose, ligne de
  focus au centre (bord bas au repos sur le dernier message), compaction symétrique, sur-réserve
  des deux côtés, plancher d'opacité (plus d'« arrivée/sortie » par fondu), entrée animée.
- Liste : carte de focus et perspective des rangées SEULEMENT pendant le défilement (scène
  `LentilleSceneActivity`), bande au centre qui remonte vers la première conversation au repos en
  haut, accès rapides en queue (et état vide) — nouveau message, story, mood, post, invitation
  (parrainage), lien raccourci — hauteur d'une demi-région visible.
- Texte blanc en mode clair (rangée plate « Toi ») corrigé à la racine ; chip de mode lisible.
- « Publier un post » réparé aussi pour le tableau de bord (drapeau `Router.pendingOpenFeedComposer`).

**Évalué, non modifié** : loi partagée `FOCUS_CURVE_CONSTANTS` (règles de consommation iOS à la
place) ; détails du message en focus (toujours à la pose, rendus à l'aplatissement).

**Restes** : mesure Instruments (CPU main thread, frames distinctes/s) sur la nouvelle scène ;
`meeshy.sh test` complet ; déploiement device du résultat final.

## Review — session 4 du 21/08 (carte de focus, favoris, état vide, répertoire, bordure du focus)
- [x] Carte de focus Lentille : date complète « à » (`FocalFocusTimestamp.listLabel`), dernier expéditeur
      pour TOUTES les conversations, encoche CATÉGORIE haut-gauche (Menu → `moveToSection`), chips
      d'étiquettes bord bas (filtrer / retirer le filtre / supprimer) ; `activeTagFilter` dans le VM
      (`filterConversations(_:searchText:filter:tag:)`), callbacks passés par `LentilleFocusCardHost`.
      Vérifié simulateur (Meeshy-iOS26) : « J. Charles N. M. · Lundi à 17:36 », « CATÉGORIE », expéditeur
      sur un direct. Chips de tags NON vues (aucune conversation étiquetée dans le compte de test).
- [x] Feuille d'infos · Options : « Réaction » → « Favori » (`star.fill`) ; champ Catégorie : retour = OK
      (`submitLabel(.done)`, teinte système — limite iOS).
- [x] État vide : deux gros boutons (membres à qui écrire → découverte ; mes contacts → répertoire) +
      tuiles dégradées façon Dashboard ; 8 portes routées (garde `LentilleSceneActivityTests` mise à jour).
- [x] Répertoire > 200 : `listAll` paginé (`DirectoryPaging.hasMore`, filet 25 pages) sur Phonebook et
      Discover ; `DirectoryPagingTests` (450 contacts ⇒ 3 pages ; multiple exact ⇒ page vide qui clôt ; cap).
- [x] Espace entre groupes : `groupTopPadding` 8 → 4, fin de groupe 10 → 6.
- [x] Message en focus : bordure basse (drapeaux dispo + icône traduction + (+) emoji + réactions),
      coches de l'en-tête → détails de lecture. Vérifié simulateur : « Aujourd'hui 14:36 », chips 🇫🇷 / 🅰 /
      😂 / ☺ sur la bordure. Limite : la bordure arrive au POSÉ (détails synchronisés au repos).
- [x] Lot 6 (directives 22/08) : chips du focus SUR la ligne de la carte (`FocusStrip.overhang`, cellule
      sans clip + zPosition) — vérifié simulateur ; pastille de présence sur la carte (même source que la
      rangée) — vérifié ; respiration ×3 autour de la rangée élue (`LentilleFocusBreathing`, 12 pt,
      rampe) — vérifié ; « Conversations avec ce tag » ; héros « Voir mes affiliations » → `.affiliate` ;
      badge non-lus non compressible.
- [x] Lot 7 (directives 22/08 bis) : détails du focus INSTANTANÉS (superpositions sur les lignes, sync
      au tick d'élection, date pré-calculée `FocalRowInput.focusTimestamp`) — vérifié simulateur pendant la
      décélération (tête de groupe et continuation) ; ordre traduction → drapeaux → (+) → réactions (fond
      plein si j'ai réagi) ; carte de liste : effectif + sync (bouton → `flushOutbox`) sur la ligne basse à
      droite, nom original centré en haut si nom personnalisé (non vus : aucune conversation renommée /
      groupe non élu pendant la capture).
- [x] Lot 8 (retour capture 22/08) : carte du focus = FOND SwiftUI de la rangée (fini la dérive carte UIKit /
      chips avant la pose) — chips et identité consolidées sur les lignes, vérifié en mouvement et au posé ;
      crash `APPLYING_SNAPSHOTS_REENTRANTLY` corrigé (sync différée + coalescée, un apply en vol) — stress
      6 balayages sans crash ; méta-rangée = heure seule.
- [x] Lot 9 (directives 22/08 ter) : effectif → feuille des participants (vérifié) ; carte de liste 104 pt,
      padding 14, respiration 18 (jeton partagé mis à jour) ; aperçu « Auteur : texte » sur 2 lignes (vérifié) ;
      chips uniformes sur toutes les bulles en focus — identité à gauche, date + coche à droite, capsules en bas
      (vérifié tête de groupe).
- [x] Lot 10 (22/08) : scène désarmée à 4,5 s ; chips d'étiquettes 8 pt, respiration 30 (vérifiée) ; garde
      aperçu vide. NON revérifié : chip d'étiquette sur une carte (élection de Meeshy Global impossible à la
      main), carte vide observée 2× sur « charlie amah » (hypothèse `Text` vide + fixedSize, garde posée).
- [ ] Rivière lots 2–5 inchangés (ci-dessous).

## Chantier Rivière iOS — lancé le 21/08 (soir), branche `feat/ios-list-scroll-fluidity`

État trouvé : loi miroir `RiverLaneResolver` + vecteurs (R-132 ✅), peau `RiverStreamHost`/canvas/
en-têtes/navigation (R-133 partiel), porte `RiverModeGate`, menu de liste dégrisé par capacités (R-135
liste ✅) — mais AUCUN point d'entrée (garde `RiverScreenNotMountedTests`, « position B ») et le
drapeau `riviere_mode` non câblé dans le fil.

- [x] Lot 1 — branchement : `RiverConversationMapping` (fil → loi, messages système EXCLUS des voix —
      exigence produit 2026-08-20), `RiverConversationHost` (navigation possédée, géométrie recalculée
      sur empreinte, texte Prisme injecté), `ConversationView` câble `isRiverFlagEnabled` et monte
      l'hôte derrière `mode == .river` ; garde « non monté » basculée en garde « monté ensemble » ;
      `RiverConversationMappingTests`.
- [ ] Lot 2 — messages système « gravés » DANS la Rivière : rangée centrée pleine largeur, heure en
      tête (`BubbleSystemNoticeView`/`BubbleJoinNoticeView`), entre les rangs — la grille `LazyVGrid`
      ne sait pas étendre une cellule sur toutes les colonnes : passer `RiverStreamHost` à des rangs
      (`VStack` de `HStack`), le canvas lit déjà les cadres mesurés.
- [ ] Lot 3 — gestes et retours : tap sur une bulle = ouvrir le message (retour Script + atterrissage,
      comme Résumé) ; rebond au bord (`edgeBounceToken`) ; heure en base ; vérification simulateur sur
      une conversation ≥ 5 voix (Meeshy Global) en clair/sombre.
- [ ] Lot 4 — éligibilité réelle : `activeParticipantCount` = voix ACTIVES (fenêtre de silence) plutôt
      que `memberCount` ; direct jamais ; a11y (ordre VoiceOver = chronologique), reduce motion.
- [ ] Lot 5 — recette R-136 : snapshot OFF identique, connecteur pointe le bon message, parité web
      (`components/conversations/riviere/`), REV-5.

## Lot E — clôture
- [ ] Suites iOS touchées vertes (`xcodebuild test` ciblé, 24 classes, simulateur dédié) puis `meeshy.sh test`
- [ ] `tasks/lessons.md` si correction user ; revue finale ; commits par lot
