# Refonte de la liste des conversations (peau Lentille) — 2026-08-22

Branche : `feat/conversation-list-revamp` · worktree `../v2_meeshy-liste-conv`

## Décisions produit actées

| Sujet | Décision |
|---|---|
| Périmètre | Peau **Lentille** uniquement (`LentilleConversationRow`, `StoriesVivantsRail`, `LentilleFocusCard`). Exception : la remise à zéro des non-lus se vérifie dans **toutes** les versions de la vue. |
| Catégorie | Sur la **carte de focus magnifiée**, coin haut-gauche, tapable → sous-menu « Déplacer vers… » déjà écrit. Assume le revirement du 2026-08-22. |
| Effectif | **En bas à droite du cadre** de la rangée. Lecteur autorisé (admin de groupe OU plateforme ADMIN/BIGBOSS/**MODERATOR**) → entier **sans plafond**. Sinon plafond **199** → « 199+ ». Décision serveur. |
| Date | **Dans la bulle** d'aperçu, en bas à droite (comme l'heure d'une bulle de message). |
| Synchro | Icône ⟳ **retirée** de la rangée, renvoi automatique conservé. La **pastille rouge de non-lus** prend sa place. |
| Non-lus | Remise à zéro **dès l'ouverture**, en réutilisant le cache + la base locale existants. Aucun nouveau chemin de données. |

Tranché sans question (conventions du dépôt) : pas d'effectif sur un DM (`type != .direct`) ; preview de story en cercle recadré comme le tray ; anneau vu/non-vu rebranché ; mood et point de présence restent exclusifs (`MeeshyAvatar`).

## Lots

### Lot 1 — Droit de voir l'effectif exact (serveur)
- [ ] RED `packages/shared/__tests__/member-visibility.test.ts` : MODERATOR et admin de groupe voient l'entier ; membre simple plafonné à 199 → « 199+ »
- [ ] `packages/shared/utils/member-visibility.ts` : le droit combine platformRole (ADMIN|BIGBOSS|MODERATOR) **et** rôle de conversation (creator|admin)
- [ ] 4 sites gateway : `conversations/core.ts:953,1219`, `search.ts:326`, `participants.ts:324`
- [ ] 5 fanouts socket : `participants.ts:1060,1276`, `leave.ts:180`, `ban.ts:136,274`
- [ ] Schémas : le champ traverse `api-schemas.ts` (1204 **et** 1385) — sinon strippé en silence

### Lot 2 — Rangée : bulle, date dedans, effectif, pastille non-lus
- [ ] RED : la date n'est plus sur la ligne de titre ; elle est portée par la bulle, dans les 7 branches d'aperçu
- [ ] RED : `RelativeTimestampText` reste le seul porteur de la date (garde anti-régression)
- [ ] Bulle d'aperçu (fond, rayon, teinte clair/sombre) — cote dans `LentilleMetrics` + miroir `lentille-tokens.json`
- [ ] Effectif en bas à droite du cadre
- [ ] Pastille rouge de non-lus à la place de ⟳ ; retrait de l'icône de synchro
- [ ] `renderFingerprint` replie `memberCount` + `unreadCount` (sinon gel silencieux)

### Lot 3 — Trail de stories : preview + mood animé
- [ ] `LentilleRailEntry` gagne `previewURL`, `moodEmoji`, `hasUnviewed`
- [ ] Mapping dans `lentilleRailEntries` / `lentilleRailSelfEntry` — résolveur **partagé** avec le tray (pas de 3e implémentation)
- [ ] Badge mood animé, gardé reduce-motion

### Lot 4 — Catégorie sur la carte de focus
- [ ] `notchChip` haut-gauche + hit-testing local ré-armé
- [ ] Toucher → sous-menu « Déplacer vers… » existant, call site unique de `moveToSection`
- [ ] Rien affiché si la conversation n'a pas de catégorie
- [ ] `renderFingerprint` replie `sectionId`

### Lot 5 — Remise à zéro des non-lus (toutes versions de la vue)
- [ ] Auditer : Lentille, Themed, carte focal, web
- [ ] Vérifier la remise à zéro à l'ouverture sur chaque chemin (cache + GRDB)

### Lot 6 — Alignements et espacements
- [ ] Rangs 8 pt / squelette 16 pt / header 16 pt → une seule constante
- [ ] Bandes de section pleine largeur (`x=0 w=402`) vs rangs (`x=8 w=386`)
- [ ] Bouton flottant « Flux » posé sur l'avatar d'un rang
- [ ] Barre de recherche flottante qui coupe un rang
- [ ] Trail collée au 1er header (0 pt)
- [ ] Section rendue vide (2 headers empilés)
- [ ] Carte focal qui recouvre la trail
- [ ] Format de date « 1mois » (espace manquant)

## Vérification
`./apps/ios/meeshy.sh test` complet + passe simulateur clair/sombre, DM/groupe, avec/sans non-lus.

## Revue
_(à remplir)_
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
