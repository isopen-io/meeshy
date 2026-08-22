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
- [x] Rivière : plan réconcilié ci-dessous (22/08, reprise en autonomie sur `main`).

## Chantier Rivière iOS — reprise 22/08 (sur `main`, directive « poursuis en autonomie le reste des lots »)

État trouvé : lots 1 et 2 LIVRÉS par la session Rivière (`4322bae1e`, `47b2612d7`, `aa25741e9`…) —
montage au fil, avis système gravés pleine largeur (`LazyVStack` de rangs), heure en base, fenêtre
de silence cherchée, pince, en-tête transparent, badges hors-champ. Reste : `tasks/riviere-r137-montage.md`
§« Reste à faire » (R-3..R-8) + lots 3–5 ci-dessous, réconciliés. Branche distante
`claude/riviere-conversation-navigation-x51rqq` = PR #3170/#3174 déjà mergées (0 commit d'avance).

Directive produit 22/08 (prioritaire) : **deux messages consécutifs d'un même groupe partagent une
bordure JOINTE en pointillé** — jamais deux contours fermés + une couture pointillée en plus. Repli
autorisé si c'est compliqué : deux bulles distinctes.

- [x] Lot G (1a22127f2) — bulles groupées JOINTES : position de groupe (`solo/head/middle/tail`) dérivée PUREMENT
      dans `RiverConversationMapping.contents` (la loi ne dit que `isFirstInGroup`, le suivant dit le reste) ;
      `RiverBubbleView` dessine UN contour ouvert par position (coins arrondis aux seules extrémités du
      groupe, `UnevenRoundedRectangle`), bord partagé en POINTILLÉ (tirets `Row.continuationDash*`), fond
      continu, zéro espace entre les bulles d'un groupe ; vue sérialisée : barre gauche continue, barre
      basse sur la queue seule. Témoins : position de groupe (mapping), forme du contour (Shape pur).
- [x] R-6 (e96179a5f) — la citation mène à sa cible : tap sur la citation ⇒ `moveTo` + `scrollTo(rang cible)`.
      Pur : `RiverConversationMapping.cursor(forMessageId:)`.
- [x] R-5 — identité vivante : `MeeshyAvatar` (présence + cercle de story) en tête de groupe, nom et avatar
      activables ⇒ profil (`ProfileSheetUser`) / fiche visiteur (`ParticipantProfileTarget`) via le routeur,
      même chemin que le Fil (`openProfileHandler`). Présence/story INJECTÉES (pures côté mapping).
- [x] R-7 (e96179a5f) — marges du canvas : réserve basse = hauteur du composeur (`bottomInset`, `safeAreaInset`),
      aucune bulle sous une zone non atteignable ; atterrissage au présent au-dessus du composeur.
- [x] Lot 3 / R-4 (partiel) — appui long sur une bulle : « Ouvrir dans le fil » (retour Script +
      atterrissage, comme Résumé), « Répondre », « Copier » ; rebond de bord (`edgeBounceToken` ⇒ haptique) ;
      vérification simulateur clair/sombre sur Meeshy Global.
- [x] R-8 (partiel) — cadrage au présent mesuré et corrigé (scroll view de 1800 pt → bande en overlay ; curseur
      posé à la première géométrie peuplée ; offset X explicite) ; canvas dans le repère FIXE du pane + rangs non
      matérialisés (rails/connecteurs visibles cadré au présent) ; citation sur une ligne. Reste : anneau « adressé »
      de tête de segment parfois absent ; bande de couloirs entre deux rangs (non observé vide après mesure).
- [x] R-3 — plan à axe du temps avec poignée graduée (jour/semaine/mois/année selon l'amplitude réelle),
      apparaît au défilement, glisser = sauter au rang de la période. Pur : `RiverTimeScale`.
- [ ] Lot 4 — arbitré : l'ouverture reste gardée par `memberCount` (la LOI sérialise déjà quand les voix
      actives manquent — `.belowMinimum`) ; un seuil sur les messages en cache rendrait le mode
      indisponible à froid. a11y chronologique et reduce-motion tenus par construction (aucune animation).
- [ ] Lot 5 / R-4 reste — pièces jointes, réactions, traductions dans la bulle ; parité web
      (`components/conversations/riviere/`) — à ouvrir après recette.
- [ ] Recette simulateur (Meeshy-iOS26, Meeshy Global ≥ 5 voix) à chaque lot ; suites `Riviere/*` +
      gardes ; commit par lot sur `main`, push, CI.

## Lot E — clôture
- [x] MERGÉ dans `main` (f935f91bf + correctifs CI 4c605ce0d / 5a3c81b9b / 1def3504d) — CI, Docker, iOS, Xcode Cloud verts le 2026-08-22.
- [ ] Suites iOS touchées vertes (`xcodebuild test` ciblé, 24 classes, simulateur dédié) puis `meeshy.sh test`
- [ ] `tasks/lessons.md` si correction user ; revue finale ; commits par lot

# Passe de merge des PR ouvertes (2026-08-22, directive « merge sans régression ni doublon, reste synchronisé avec le remote »)

- [x] Inventaire : 23 PR ouvertes vers `main` (#3242→#3324) ; #3322 déjà MERGED par une autre session → 22 à traiter.
- [x] Revue parallèle (6 agents, groupés par fichiers communs) : 0 « déjà sur main », 0 doublon pur ; 4 chevauchements réels résolus à la main (#3242/#3243 borne stricte `playbackStretch` ; #3262/#3317 `removingHandle` = `escapeRegex` + `NAME_BOUNDARY_LEFT` ; #3320 vs #3322 redéclaration silencieuse de `editedMessageResponseSchema` ; #3299 CHANGELOG).
- [x] Greffes : miroir Swift de #3270 (`resolveRiverLaneAt` ignore `isSystem` + témoin) ; pbxproj de #3250 vérifié main + 4 lignes / 1792 ×2 ; `branch-tracking.md` réconcilié ; journaux homonymes (`cycle80-bis`, `iteration-237b…e`, `238b`) désenchevêtrés.
- [x] Gates sur l'état fusionné : law ✓ · vitest shared 2405/2405 ✓ · tsc gateway 0 ✓ · XCTest app 88/88 + SDK ✓ · gateway 19090/19093 et web 13904/13942 sous charge (timeouts), rejeu isolé 202/202 et 149/149 ✓ ; rejeu local des suites complètes inexploitable (load 43–48 : xcodebuild voisin) → discriminant = CI sur runner isolé : `Test web` vert sur `2bfaebf59` ; `Test gateway` attendu sur `a5922c05c`.
- [x] Sync remote : #3320/#3323 mergés entre-temps sur `origin/main` (940ad0c1b) → `origin/main` intégré dans `main` local, résolution du tronc retenue pour `messages-advanced.ts`. Push fast-forward `2bfaebf59`, 22 PR MERGED.
- [x] #3325 (cycle 92, enveloppes d'erreur gateway, 27 fichiers) — MERGE après revue (79 sites tronquants mesurés, superset strict, garde #3323 intacte, tsc 0, 10 suites 279/279) → `3448e97c2`.
- [x] #3326 (Android, jointure par lien partagé authentifiée) — MERGE après revue (contrat `POST /conversations/join/:linkId` JWT, même enveloppe que iOS/web, ajout pur, CI Android verte ; `apps/android` fusionné = tête de PR) → `a5922c05c`. 0 PR ouverte.

## Deuxième vague du 22/08 (après le socle lot C `4c937e078`)
- [x] #3328 (cycle 92 bis, présence gardée sur les mutations de participant — gateway/shared/iOS/SDK/Android) : fusion propre avec #3310/#3322 ; tsc 0 ; shared 48/48 ; gateway 261/261 ; SDK 85/0 (témoins `participantRoleUpdated` passed) ; app build-for-testing ✓ + 138/0 (sockets, participants, 4 gardes).
- [x] #3330 (web/calls `void negotiate().catch`), #3329 (web `sanitizeFileName`), #3332 (web hook traductions = pendant de #3324, SSOT `normalizeLanguageForDedup`) : jest ciblé 258/258 ; journaux 244/244b désenchevêtrés.
- [x] #3331 (shared `callSessionMinimalSchema.mode` p2p|sfu, aligné sur le jumeau `223e07134`) : Test gateway de la PR vert, vitest 2/2, calls-routes 86/86.
- [x] #3327 (237i, `CompactCountLabel` déplacé dans MeeshyUI après mon commentaire : `.compactName`, jumeau SDK unifié, pointeur corrigé ; plus de pbxproj) : SDK 7/7 exécutés, build incrémental ✓, app 47/0 → poussé `ab8629378` (CI ✓ gateway/web/shared, Android ✓, Docker ✓).
- [x] #3333 (cycle 94, sous-arbre DMA/Signal sous `tsc` — il était exclu et mort ; IV de fil → `SignalProtocolLimits.AES_GCM_IV_SIZE`, ferme le suivi de #3266 côté fil ; repos reste 16 volontairement) : branche privée `integ/…`, tsc 0, émission 0, jest 36/36, vitest 58/58, CI PR verte → `20f4f4f11`. **0 PR ouverte.**
- Suivis : 6ᵉ surface de présence `GET …/participants/:id/profile` non gardée ; `liveOnline` sans appelant ; `errorResponseBuilder` du rate-limit sérialise `"[object Object]"` ; exposition de `error.message` en 5xx (16 sites) ; `callSessionMinimalSchema` importé mais inutilisé dans calls.ts.
- Leçons de coordination : un commit sur `main` local n'est jamais « retenu » (ref partagée) → branche privée `integ/<date>` pour accumuler ; annoncer toute charge iOS lourde ; `uptime` > 10 ⇒ rouge local sans valeur.

## Review
- Incident : un script de résolution en échec + chaîne `&&` filtrée par `grep` a committé des marqueurs (`bce89832a`, worktree privé) → repris par `reset --hard` sur le merge précédent, rejoué proprement ; règle consignée (Leçon 243). Deuxième occurrence du motif (`grep -c` à 0 rend 1) sans dégât.
- Suivis ouverts (hors périmètre, signalés par les revues) : `SignalProtocolEngine` émet des IV de 16 octets alors que `SignalSchemas.encryptedMessage.iv` (mort) en attend 12 ; `offset` non borné dans `admin-schemas.ts` ; trois idiomes de clamp `limit` (helper Zod SSOT à créer) ; #3324 laisse le corps des messages web (`use-message-translations.ts`) comparer des codes bruts ; règle de rang du kick d'appel plus stricte que `participants.ts` ; 2 `#expect` Swift à greffer dans `ComposerMentionQueryTests` (bob@alice, marie-claire).

# Cycle 94 — Le sous-arbre DMA / Signal Protocol remis sous le compilateur (2026-08-22)

- [x] Constat : `src/dma-interoperability/` (3 231 lignes de prod + 1 642 de suites), 6 modules + 3 suites, exclu de
      `tsconfig.json` (build ET type-check), ignoré par `jest.config.json`, absent de
      `collectCoverageFrom`, et importé par AUCUN module du dépôt. Les deux lignes d'exclusion sont
      les seules occurrences de `dma-interoperability` hors du sous-arbre.
- [x] Preuve que rien ne l'avait compilé : 4 modules importaient `'../../../shared/prisma/client'`,
      chemin inexistant dans le dépôt comme dans l'image Docker → repointés sur `@meeshy/shared/prisma/client`.
- [x] Sous-arbre ajouté à l'`include` de `tsconfig.json` → 8 erreurs, dont 4 défauts d'exécution :
      X3DH construit sans dépendances (`new X3DHKeyAgreement()`), deux appels à des méthodes privées
      dont un générateur brut sans id masqué par un `(pk: any)`, et le paquet X3DH du moteur à la
      forme des colonnes `DMAEnrollment` au lieu de `PreKeyBundle` (DH1/DH3 lèvent, DH4 jamais
      calculé, `registrationId.toString()` sur `undefined`). Tous corrigés — `tsc --noEmit` à 0.
- [x] Largeur du nonce AES-GCM : les deux producteurs du FIL (`SignalProtocolEngine`,
      `SignalProtocolAdapter`) passent par `SignalProtocolLimits.AES_GCM_IV_SIZE` (12 octets) au lieu
      du littéral `16`. Aucune migration : l'IV voyage avec le chiffré.
- [x] 6 témoins neufs exécutés par jest (`src/__tests__/unit/dma-signal-wire-crypto.test.ts`).
      ROUGE prouvé deux fois : échec de chargement de suite avant correctif (TS2554/TS2341), et
      3 échecs / 6 en remettant le littéral `16`.
- [x] Gates : `tsc --noEmit` 0 · `tsc` (émission) 0 · suite ciblée 6/6.
- [ ] Suivi — `SignalKeyManager.encryptKey` : cadre auto-porté à offsets FIXES (`iv(16)|authTag(16)`),
      lecteur codé en dur ; migrer exige un préfixe de version ou un repli discriminé par
      l'authentification GCM, sous peine de rendre illisible le matériel de clé persisté. Non fait :
      bénéfice cosmétique (nonce privé, hors fil), risque sur des clés privées.
- [ ] Suivi — X3DH ne VÉRIFIE jamais `signedPreKey.signature` : c'est le lien qui rattache la pré-clé
      signée à la clé d'identité, donc l'accord de clés n'est pas authentifié. La signature est
      désormais posée à sa place dans le paquet, prête à l'être. **Le plus important des trois.**
- [ ] Suivi — les 3 suites du sous-arbre restent ignorées par jest : mesuré 56 échecs / 114 témoins
      (compteurs `DoubleRatchet` à 0, `new PrismaClient()` réel supposant une base). À instruire un
      par un, jamais en desserrant des assertions. Le sous-arbre entrera dans `collectCoverageFrom`
      quand ses suites tourneront.
- [ ] Suivi — `SignalProtocolAdapter.performX3DH` garde un `as any` : `ISignalProtocolAdapter` ne
      transporte pas la signature de la pré-clé signée que `PreKeyBundle` déclare obligatoire.

## Cycle 94 bis (2026-08-22) — la dernière enveloppe inerte, et les deux défauts qu'elle couvrait

Journal complet : `tasks/realtime-sync-audit-2026-08-22-cycle94-bis.md`.

- [x] `GET /messages/:messageId` aligné sur son enveloppe réelle (`{success, data}`) — dernière
      ligne de `FROZEN_INVENTORY`, seule de la **forme 3** (schéma décrivant le MESSAGE quand
      `sendSuccess` répond `{success, data}` : déclarations inertes, charge utile traversant
      entière et non gouvernée). 42 clés relevées MÉCANIQUEMENT depuis le `select` + les
      surcharges du handler, passées au vrai `fast-json-stringify` : 42 entrent, 42 sortent.
- [x] **Défaut 1 découvert par l'alignement** — `translations` servi en CARTE Mongo là où le
      contrat déclare un TABLEAU et où les TROIS clients décodent un tableau. Les deux autres
      transports du MÊME fichier appliquaient déjà `transformTranslationsToArray` (lignes 600,
      950) ; ce GET étalait `...message`. Chemin d'impact : extension de notification iOS →
      App Group → `NSEPendingMessageConsumer` → `APIMessage` (dont `translations` se décode
      avec un `try` NON tolérant) ⇒ décodage du message ENTIER en échec, blob SUPPRIMÉ,
      **démarrage à froid depuis une notification sans son message** pour tout message portant
      au moins une traduction.
- [x] **Défaut 2** — `encryptionMode` absent de `messageSchema` sur la foi d'un commentaire
      (« only on Conversation ») que `schema.prisma` contredit. Corrigé dans le schéma PARTAGÉ :
      la LISTE de messages le charge aussi et le servait par un `items: messageSchema` qui le
      retirait — un client E2EE recevait `isEncrypted: true` + le chiffré sans savoir sous quel
      régime déchiffrer. Aucune ligne du fichier de la liste n'a changé.
- [x] `sender` déclaré LOCALEMENT (participant + `user` imbriqué + `isOnline` gaté à la source),
      **différent** de `editedMessageSenderSchema` du cycle 93 : fusionner exigerait de porter
      `isOnline` dans un schéma commun, ce qui désarmerait sa décision fail-closed. Raison
      écrite sur les deux sites.
- [x] `conversation` et `statusSummary` DÉCLARÉS tels qu'ils sont servis, pas retirés — un
      changement de contrat se décide sur des preuves de consommation client, pas dans un lot
      dont le but est de ne rien tronquer.
- [x] Témoins : `message-detail-serialization.test.ts` (9), montant le VRAI module de route sur
      une vraie instance Fastify (`app.inject()`), double Prisma rendant la CARTE comme Mongo.
      **ROUGE prouvé isolément** : retrait du transform ⇒ 9/9 tombent (la carte ne traverse plus
      le schéma, 500) ; retrait d'`encryptionMode` ⇒ 1/9 (`Expected "e2ee", Received undefined`).
      Le piège du cycle 88 (`message-detail-sender-presence.test.ts`) reste VERT : preuve que
      `sender` et son `user` ont survécu.
- [x] `FROZEN_INVENTORY` : 1 → **0**. Les trois cliquets sont à inventaire vide en même temps.
- [x] Gates : tsc gateway 0 · vitest shared 2428/2428 · suites ciblées 24/24.
- [x] Jumelle instruite (8 sites `routes/` chargeant `Message.translations`) : liste, recherche,
      threads, édition, suppression, `GET /:id/translations` transforment déjà ; `core.ts` a son
      champ dédié `lastMessageTranslations`. **`GET /sync` porte le MÊME défaut** (carte brute,
      et AUCUN schéma de réponse) — zéro appelant sur les trois clients ⇒ piège armé, pas panne.
      NON corrigé ici par décision : lui donner sa forme exige de lui donner d'abord un contrat,
      ce qui est un lot en soi et ferait perdre la mesure « 42 entrent, 42 sortent » de ce lot-ci.
- Suivis ouverts : `GET /sync` (ci-dessus) ; `GET /messages/:messageId` n'agrège pas les réactions de pièce jointe
  (relation `reactions` brute chargée, contrat = `reactionSummary`+`currentUserReactions`) ;
  `APIMessage.translations` en `try` non tolérant quand ses trois voisins sont en `try?` (lot
  iOS) ; **le quatrième balayage n'existe pas** — rien ne garde contre une déclaration présente,
  bien formée et FAUSSE contre son producteur, ce qu'étaient les deux défauts de ce cycle.

## Cycle 96 (2026-08-22) — l'accord de clés X3DH s'authentifie

Journal complet : `tasks/realtime-sync-audit-2026-08-22-cycle96.md`.

- [x] Constat : `signedPreKey.signature` est PRODUITE (`SignalKeyManager`), PERSISTÉE
      (`DMAEnrollment.signedPreKeySignature`), RELUE et placée dans le paquet
      (`SignalProtocolEngine.initiateNewSession`), DÉCLARÉE obligatoire
      (`PreKeyBundle`) — et **jamais lue**. `initiatorKeyAgreement` accordait des
      clés contre une pré-clé signée acceptée sur la seule parole de l'annuaire,
      alors que X3DH §3.3 en fait une étape d'abandon obligatoire.
- [x] Preuve la plus courte que rien ne vérifiait : les six constructions de paquet
      de la suite du sous-arbre passent `signature: crypto.randomBytes(64)`, et
      l'accord aboutissait.
- [x] Contraste interne qui rend le défaut lisible : le moteur REJETTE strictement
      un message dont la signature de CONTENU ne vérifie pas ; la signature qui
      établit la session n'était confrontée à rien.
- [x] `initiatorKeyAgreement` authentifie le paquet en **étape 0** — avant la
      génération de l'éphémère, avant tout DH. Fail-closed sur toute la surface
      (signature absente, clé illisible, exception d'OpenSSL ⇒ REFUS).
      `X3DHSignedPreKeyRejected` distingue « paquet inauthentique » (signal
      d'attaque, ne se réessaie pas) d'un échec d'exploitation ; compteurs
      `signedPreKeysVerified` / `signedPreKeysRejected` séparés d'`agreementErrors`.
- [x] **Second défaut, même famille** — `decryptMessage` étape 2 gatait sur
      `&& encryptedMessage.signature.length > 0` : un message SANS signature ne
      franchissait aucune branche (ni vérification, ni avertissement, ni refus),
      sous un commentaire qui déclare la vérification « stricte ». Le retrait est
      moins cher que la forgerie. Gate ramené à `if (senderIdentityKey)` — c'est
      l'INTENTION de l'appelant qui décide, pas l'obligeance de l'émetteur.
- [x] Suivi du cycle 95 refermé : `ISignalProtocolAdapter.performX3DH` transporte
      la signature, ce qui **dissout** le `as any` — lequel masquait exactement
      l'absence du seul champ qui authentifie l'accord.
- [x] Deux mensonges de contrat emportés par la même réouverture de signature :
      `ourEphemeralPrivate` DÉCLARÉ et silencieusement ignoré (retiré — un
      éphémère fourni par l'appelant est réemployable, donc l'API ne doit pas
      l'offrir), et un résultat qui jetait la clé éphémère PUBLIQUE sans laquelle
      le pair ne peut rien dériver (désormais rendue).
- [x] Témoins : `dma-x3dh-authentication.test.ts` (11), dont le paquet ACCEPTÉ sort
      du producteur RÉEL (`generateAndStoreSignedPreKey`), jamais d'un signeur
      recopié. **ROUGE prouvé deux fois séparément** : retrait de la vérification
      ⇒ 7/11 tombent ; retour du gate `signature.length > 0` ⇒ 1/11.
- [x] Gates : `tsc --noEmit` gateway 0 · suite ciblée 11/11 · suite complète gateway.
- [ ] Suivi — les 3 suites du sous-arbre restent ignorées par jest. Mesuré ici :
      elles PENDENT (PrismaClient réel sans base), elles n'échouent même pas. Elles
      portent maintenant une dette de plus : leurs signatures `randomBytes(64)` sont
      désormais refusées à juste titre. Les instruire une par une en leur faisant
      produire de VRAIES signatures — jamais en desserrant la vérification.
- [ ] Suivi — `SignalProtocolAdapter.performX3DH` fige `registrationId: 0` alors que
      `deriveKeys` le mêle à l'info HKDF : deux pairs en désaccord sur cet entier
      dérivent des clés différentes. Le moteur passe la vraie valeur, l'adaptateur
      non. Le porter demande de décider qui est autoritatif — lot en soi.
- [ ] Suivi — X3DH n'inclut pas le préfixe `F` (32 octets 0xFF) dans l'entrée du
      HKDF, et le sel est nul plutôt que de longueur de hachage. Sans conséquence
      tant que les deux bouts sont ce dépôt ; en aura une à la première
      interopérabilité réelle avec libsignal.
## Bêta OFF par défaut · story legacy lisible · diffusion in-app admin (2026-08-22, branche feat/ios-beta-off-legacy-story)

Demande : (1) « Activer les bêta » naît OFF ; (2) au lancement, si ON, lire les UserDefaults pour savoir
quelles fonctionnalités bêta sont actives (tout-ou-rien aujourd'hui, une par une demain, la section
n'affichant les fonctionnalités qu'une fois l'option validée) ; (3) depuis l'espace admin, envoyer une
notification à toutes les applications connectées ; (4) l'app iOS doit pouvoir LIRE la forme « legacy
simple » d'une story (média seul, sans `storyEffects`) — code transitoire, à retirer au fil des mises à
jour jusqu'au modèle unique (canvas v3).

### Lot A — iOS, programme bêta
- [x] RED : `BetaFeaturesPreferenceGateTests` — clé absente ⇒ `false` ; `enabledFeatures` vide quand OFF,
      les 3 drapeaux couverts quand ON, un drapeau coupé par sa clé propre reste hors de la liste.
- [x] GREEN : `BetaFeaturesPreference.isEnabled` absence ⇒ OFF ; `isExplicitlySet` RETIRÉ (n'avait de sens
      que sous défaut ON) ; cascade `LentilleFeatureFlag` étage 3 = `BetaFeaturesPreference.isEnabled`.
- [x] `BetaFeaturesPreference.enabledFeatures(defaults:environment:)` + `resolveAtLaunch()` (journal
      `me.meeshy.app:beta`) appelé dans `MeeshyApp.init`.
- [x] Réglages : sous le toggle, la liste des fonctionnalités du programme n'apparaît QUE si ON
      (3 lignes : modes de lecture, liste Lentille, Rivière) — clés neuves ×7 langues, dump à blanc d'abord.
- [x] Retrait du paramètre mort `isFocalBetaPreviewEnabled` (Focal retiré le 2026-08-18).
- [x] Décors de tests qui figeaient le défaut ON : `LentilleFlagGateTests` (×4), `RiverFeatureFlagTests`.
      **Piège mesuré** : sur simulateur iOS 26.1, 7 tests instanciant `ReadingModeController` « crash abrt, 0 s »
      (malloc générique `swift_task_deinitOnExecutor`, déjà vu sur `AudienceUserPickerViewModel` dans un run voisin) ;
      sur iOS 18.2 les 96 mêmes tests passent 96/96 — le runtime, pas le diff.

### Lot B — SDK, story legacy « média seul »
- [x] RED : `StoryItemRenderableSlideTests` — média[0] vidéo sans `mediaObjects` ⇒ un `StoryMediaObject`
      de fond (`kind .video`, `isBackground`, `mediaURL`, `thumbHash`, durée) et `slide.mediaURL == nil` ;
      `.mov` déclaré image ⇒ vidéo (extension = vérité) ; image legacy ⇒ route inchangée.
- [x] GREEN : adaptateur de lecture dans `StoryItem.toRenderableSlide` (`legacyVideoCarrier`, c54e13ac9) — commenté TRANSITOIRE, à supprimer
      quand le parc ne sert plus que le canvas v3 (règle 5 du gateway + `X-Canvas-Caps`).
- [x] Marquer de même la branche legacy `slide.mediaURL` de `StoryRenderer.renderBackground`.
- [ ] Build + install sur `Meeshy-iOS26` pour constater la story `6a894bd8…`.

### Lot C — gateway + web, canal in-app des diffusions admin
- [x] RED : job `broadcast-inapp-sender` — pour chaque destinataire ciblé, `createSystemNotification`
      (`systemType: 'announcement'`, sujet/corps dans la langue du destinataire via `translated*`),
      compteurs `sentCount`/`failedCount`, statut.
- [x] Route `POST /api/admin/broadcasts/:id/send-inapp` (garde existante, audit log) ; web : bouton
      « Envoyer en notification » + méthode `adminService.sendBroadcastInApp` + i18n 4 langues.
- [x] Réception : web/iOS déjà branchés sur `notification:new` (toast + centre + push) — Android : trou
      connu (pas d'hôte de toast global), consigné.

### Gates
- [x] iOS : `MeeshyTests` complet sur iOS 18.2 — **7499/7499, 0 échec, 7 ignorés** (simulateur dédié, DerivedData privé).
- [x] Gateway : 51 suites / 1578 tests (notifications, routes admin, jobs, devices, friends) + `tsc` 0.
- [x] Web : `admin`/`services`/`use-i18n` 2079/2080 sous load 367 — le seul rouge (`admin/users/[id]`, timeout 5 s)
      passe 67/67 isolé ; `tsc` : 0 erreur sur mes fichiers, total 1290 → 1241 (page de diffusion typée).
- [x] SDK : `MeeshySDK-Package` complet sur iOS 18.2 — **7896/7896, 0 échec, 35 ignorés** (ciblé : 19/19).
- [ ] Merge `--no-ff` via `main` local (ff sur `origin/main` fait : 36937badb), push, CI, build + install sur `Meeshy-iOS26`.

## Chrome de la rangée Lentille (2026-08-22 soir, branche feat/lentille-row-chrome)

Directive produit (4 points) : « le trail a des cercles coupés, il faut réduire la taille des cercles » ·
« dans les rows de conversation normales, enlever le contour sur le dernier message, juste mettre
l'auteur : message, et puis en bas sur une nouvelle ligne à droite mettre la date (la date gardera
cette place même en magnificence) » · « la pile du nombre de message non lu sera toujours sur fond
rouge même en magnificence » · « la pile avec le nombre de membre s'affiche en bas à droite sur les
traces de la bordure et jamais dans le contenu, même au repos ».

- [x] RED : `LentilleRowChromeTests` (12 témoins) — prouvé à la COMPILATION (`authorPrefix` absent).
      **Piège payé** : le premier run rendait 29/30 verts — le fichier neuf n'était pas dans le bundle
      (`xcodebuild` direct ne régénère pas le projet). `xcodegen generate` d'abord, delta pbxproj vérifié
      (+4 réf. du seul fichier neuf, aucun enregistrement amont retiré).
- [x] Trail : `AvatarContext.storyTrayCompact` 44 → 36, `inlineAccessoryHeight` 56 → 48.
- [x] Rangée : aperçu en UN texte « Auteur : message » (`authorPrefix`, règle pure partagée), date
      sortie de la ligne du nom vers `dateLine` (Spacer + horodatage + glyphe outbox), effectif en
      `.overlay(alignment: .bottomTrailing)` avec `Row.edgeBadgeOverhang`.
- [x] Carte : même `dateLine`, même `authorPrefix`, badge de non-lus en `unreadBadgeBackground`.
- [x] Jetons : `list.row.height` 64 → 78, `list.row.edgeBadgeOverhang` = 6, `list.focusCard.height`
      104 → 124 — miroir CSS + portage web (rangée, squelette, test de grammaire de ligne 1).
- [x] Gates : Lentille iOS 112/112 · **iOS complet 7510/7510 (0 échec, 7 ignorés)** · web 202/202
      (28 suites) · `check-law-literals` vert · parité CSS verte · tsc web sans régression (4 erreurs
      « lentille » identiques sur main).
- [ ] SDK complet (`MeeshySDK-Package`) — `AvatarContextTests` et `CollapsibleHeaderRevealTests` touchés.
- [ ] Constatation visuelle sur `Meeshy-iOS26`, puis merge via `main` local + push + CI.

**Leçon** : une garde de forme vise le BLOC, jamais le FICHIER. Mes deux premières assertions
interdisaient `strokeBorder` et `Capsule(` dans tout `LentilleConversationRow.swift` et condamnaient
l'anneau d'avatar et le bouton « Rejoindre » d'un appel en cours (2 rouges sur 112).
