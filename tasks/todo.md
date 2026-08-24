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

### Ce qui est livré (branche `feat/conversation-list-revamp`, poussée)

| Lot | État | Preuve |
|---|---|---|
| 1 — droit de voir l'effectif exact (serveur) | livré | jest vert · **réserve A4** ci-dessous |
| 2 — rangée : bulle, date dedans, effectif, pastille | livré | 236 tests iOS, `Row.height` 64→88 |
| 3 — trail : preview + mood animé | livré | SDK vert, `MoodBadge` neuf |
| 4 — catégorie sur la carte de focus | livré | 34/34, `renderFingerprint` replie `sectionId` |
| 5 — audit des non-lus | rendu | I1–I4, W1–W2 documentés |
| 6 — alignements | **3 vrais défauts sur 8** | ci-dessous |

Gate complet du 2026-08-22 : **15 400 tests iOS, 0 échec**, web 490/0, `check-law-literals` vert.
`origin/main` intégré (61 commits, sans conflit), build de validation `exit 0`.

### Lot 6 — le résultat le plus instructif du chantier

**3 défauts réels, corrigés :**
- **D8** — `RelativeTimeFormatter` rendait « 1mois ». « mois » est un MOT entier, pas une
  abréviation comme `s`/`h`/`j`. Android écrivait déjà `%1$d mois`
  (`sdk-ui/values-fr/strings.xml:63`) : **c'est iOS qui divergeait de la référence en
  place**, pas une préférence de goût. Corrigé au `defaultValue` ET au catalogue (fr, it) ;
  diff catalogue de 2 lignes exactement, aucune resérialisation.
- **D1-squelette** — `.padding(.horizontal, 16)` posé sur le CONTENEUR du `LazyVStack`
  s'appliquait aux DEUX branches du mux, alors que le mux ne portait que sur le type de
  rangée. La liste sautait de 8 pt latéralement au démarrage à froid.
- **D2** — les boutons flottants mordaient la Dynamic Island (disque à `y=50`) et
  recouvraient 60 % / 57 % de deux boutons du header. Voir la cause racine ci-dessous.

**6 faux positifs** — et c'est la leçon : *six défauts sur huit venaient de ma méthode de
mesure ou d'une lecture trop rapide.*
- D1-header, D5 : comportements **documentés** (fond pleine largeur du sticker épinglé ;
  section repliée)
- D3 : la barre de recherche se masque d'elle-même au défilement
- D4, D6, D7 : cotes prises sur une liste **en mouvement**

### Pièges mesurés, à ne pas repayer

1. **`simctl install` par-dessus une app existante ne remplace pas le dylib.** Deux
   mesures fausses avant de comprendre : je jugeais une UI antérieure aux lots.
   `simctl uninstall` d'abord, toujours.
2. **`idb` rend le cadre TRANSFORMÉ, pas le cadre de layout.** L'effet de scène met les
   rangées à l'échelle : mesurer pendant un défilement fabrique des chevauchements qui
   n'existent pas. Mesurer AU REPOS, et vérifier qu'on est bien en position 0 (si le
   premier élément a un `y` négatif, la liste est défilée).
3. **Un dialogue système réduit l'arbre d'accessibilité à ~5 éléments.** Ce n'est pas un
   écran vide.
4. **`grep -c` qui compte 0 rend exit 1.** Lu comme « build failed » alors que le build
   disait `BUILD SUCCEEDED`.
5. **`-only-testing` ne matche pas Swift Testing comme XCTest** : « Executed 0 tests » +
   « TEST SUCCEEDED ». Toujours extraire le compte réel.
6. **Un test peut passer en choisissant lui-même l'entrée que l'appelant ne fournit pas.**
   Voir D2 ci-dessous — le cas le plus coûteux du lot.

### D2 — la cause racine, et pourquoi aucun test ne l'a vue

`FreeFloatingButtonsContainer` (`FloatingButtons.swift:124-176`) calcule
`minY = safeArea.top + topSafeZone + halfButton` à partir du `GeometryReader` de son
`body` — que le `.ignoresSafeArea()` de la ligne suivante étend à l'écran entier,
ramenant les insets à **zéro**. La formule est juste ; son ENTRÉE est nulle en production.
Les 50 pt censés protéger le haut étaient donc comptés depuis le bord PHYSIQUE, dont 59
déjà mangés par l'encoche.

`test_screenPoint_topLeft_matchesBoundsMinCorner` ne l'a jamais vu **parce qu'il choisit
lui-même `safeArea.top = 59`**. Il valide la formule sur une entrée que l'appelant ne
fournit pas : vert, pendant que le produit est faux. Le témoin neuf assied la garantie sur
l'entrée RÉELLE (`EdgeInsets()` nul).

Le `50` vivait en **trois copies** devant rester d'accord au point près (`FloatingButtons`,
`RootView.menuLadder`, `RootView.FeedButtonAnchor` — ce dernier se documente comme miroir
EXACT du calcul du conteneur). Elles lisent maintenant `FloatingButtonSafeZone.top`
= `maxTopInset` (62) + `CollapsibleHeaderMetrics.expandedHeight` (64) = **126**, cote
dérivée et non magique.

### Restes assumés

- **D2 résiduel — décision produit en attente.** Flux recouvre désormais les commandes de
  la trail (82-87 %). Dégager la trail (fin `y=199.3`) demanderait `topSafeZone = 173.3`,
  ce qui poserait le disque sur la 1re rangée (228.7-316.7) : **impasse géométrique**. En
  position « coin haut », un bouton flottant recouvre forcément quelque chose. Recommandé :
  passer la position par défaut en bas (idiome FAB), qui libère tout l'en-tête. 2 constantes.
- **`.ignoresSafeArea()` non corrigé.** Faire remonter la vraie safe area demande une
  refonte du conteneur, non validable sans passe visuelle. Symptôme majoré, cause racine
  documentée sur `FloatingButtonSafeZone`.
- **A4 — le correctif serveur est inatteignable en production.** `core.ts:401` et `:454`
  filtrent sur `participants.some.userId`, or `Participant.userId` est **null** pour un
  anonyme : `findMany` ne remonte rien et la boucle ne tourne jamais. Les 2 tests ne
  passent que parce que `mockResolvedValue` **ignore le `where`**. Corriger « pour de
  vrai » demande de brancher `whereClause` sur `isAnonymousViewer`, ce qui change ce que
  la route rend aux anonymes — au-delà du périmètre demandé. **À arbitrer.**
- **`list.row.height` est partagé avec le web** : les rangées web passent à 88 px avec
  leur ancien contenu à 2 bandes. À désolidariser ou à faire suivre.
- **Doublon header épinglé / pilule** : jamais diagnostiqué, en cours de contre-expertise.

### Rectification du 2026-08-23 — la contre-expertise renverse 3 des 6 faux positifs

Un agent adversaire a contesté mes classements. **Le bilan réel est 7 vrais défauts sur 8,
pas 3.** Les 3 faux positifs confirmés le sont pour de MEILLEURES raisons que les miennes.

| | Mon classement | Verdict | État |
|---|---|---|---|
| D4 trail collée | faux positif | **VRAI DÉFAUT** | corrigé, mesuré 8,0 pt |
| D5 section repliée | faux positif | **VRAI DÉFAUT** | corrigé (chevron) |
| D7 chevauchement | faux positif | **VRAI DÉFAUT** | diagnostiqué, arbitrage |
| D1-header, D3, D6 | faux positifs | confirmés | — |
| doublon pilule | jamais diagnostiqué | **VRAI DÉFAUT** | correctif prêt, non appliqué |

**D7 — ma dispense était fausse.** J'avais invoqué « `idb` rend le cadre transformé par
l'échelle ». Or l'échelle ne PEUT PAS mordre un header : `scale = 1 − 0.04f ≤ 1`, ancrée,
donc une rangée qui rétrécit ÉLOIGNE ses bords de ses voisins. Le coupable est
`LentilleFocusBreathing`, une TRANSLATION de ±18 pt posée sur les rangs seuls et jamais sur
les headers. Deux relevés indépendants (9,6/8,9 puis 9,2/9,1 pt) et l'arithmétique boucle :
`18 − 8 − (88 − h)/2 = 9,6` pour `h = 87,3`.

Mon correctif — faire porter la même loi au sticker — a été **rejeté par la mesure** : sur
un élément ÉPINGLÉ, l'`.offset` étend le cadre d'accessibilité de façon durable (h 21,3 →
39,3, encore à 3 s). J'ai failli conclure « aggravation » sur ce chiffre : le même piège que
la contre-expertise venait de me reprocher, en sens inverse. **Critère de validité retenu :
`h` du header == 21,3, sinon la mesure ne vaut rien.**

Les deux issues restantes touchent un réglage PRODUIT — écrêter la respiration à la marge
(18 → 8, effet réduit) ou porter le gap de section à 18 (densité réduite). Non tranché.

**D4 s'est réfuté avec mon propre chiffre** : ma note d'origine mesurait déjà 199,3/199,3
AU REPOS ; l'argument « liste défilée » valait pour D6, pas pour D4. Cause : le rail iOS
n'avait aucun padding vertical là où le jumeau web porte `py-2`. Corrigé par jeton +
2 miroirs ; jonction re-mesurée à **8,0 pt**.

**D5 — le sticker taisait ce qu'il savait.** `LentilleSticker` DÉCLARAIT et STOCKAIT
`isExpanded` sans jamais le lire : paramètre mort, zéro test. Replier une section rendait
deux bandes identiques empilées, indiscernables d'un défaut de rendu. Corrigé par un chevron
conditionné à `onToggle != nil` (`chevron.forward`, qui s'inverse en RTL).

**Rectification documentaire** : le commentaire justifiant la pleine largeur du sticker par
« sinon les rangs réapparaissent dans les gouttières » est FAUX — rien n'entre jamais dans
ces 8 pt. Bonne conclusion, mauvaise preuve ; le vrai motif est la parité avec la peau web.

### Collision de chantier — DEUX implémentations de la même demande

`feat/lentille-row-chrome` (autre session) est déjà sur `main` (`266fcb765`) et recouvre mes
lots 2/3/4 fichier pour fichier. Les deux lisent des directives différentes données à des
moments différents : « la date à l'intérieur de la bulle » (moi) contre « enlever le contour
sur le dernier message » (eux). Captures comparées envoyées au porteur produit ; **ma branche
ne peut pas remonter tant que ce n'est pas tranché**. Ni l'un ni l'autre lot ne re-merge sur
ces fichiers en attendant.

### Non-régression après D2/D8/D1

63 suites, **736 tests exécutés**, aucune à 0 test. Les échecs sont tous PRÉEXISTANTS : le
crash `malloc 0x262c5a6f0` est daté à 17:13, 1 h 34 avant le premier commit, même adresse,
même test.
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


## Cycle 97 (2026-08-22) — les deux bouts de X3DH dérivent les mêmes clés

Journal complet : `tasks/realtime-sync-audit-2026-08-22-cycle97.md`.

- [x] Constat : l'`info` du HKDF de X3DH porte un identifiant d'enregistrement, et
      les deux bouts n'y mettaient PAS le même — l'initiateur celui du
      DESTINATAIRE (`recipientBundle.registrationId`), le répondeur celui de
      l'INITIATEUR. Deux entiers tirés au hasard par identité (`randomInt(1, 16383)`).
- [x] Conséquence exacte : les quatre DH étant correctement disposés, **le secret
      partagé COÏNCIDE et toutes les clés qui en sortent DIVERGENT** (racine,
      chaîne d'émission, chaîne de réception). Toute session DMA nouvelle
      s'établissait sans erreur, et aucun message n'y était déchiffrable.
- [x] Ce qui rend le défaut lisible : **le répondeur ÉNONÇAIT l'invariant que
      l'initiateur violait**, trois lignes au-dessus de son propre appel — « both
      parties must use the same registration ID (initiator's) ». Le côté qui
      portait la règle était le côté conforme.
- [x] Pourquoi rien ne le voyait : `X3DHKeyAgreement.test.ts` exerce chaque côté
      SEUL, et un côté seul est toujours cohérent avec lui-même. C'est la
      « quatrième famille » que le cycle 94 déclarait non outillée.
- [x] Autoritatif = l'identifiant de l'INITIATEUR, et pas par convention : celui
      du destinataire ne voyage QUE dans le paquet de pré-clés, un champ que la
      signature NE COUVRE PAS — le lier donnait à l'annuaire un levier pour
      désaccorder deux pairs sans franchir la vérification du cycle 96.
- [x] Second défaut, même famille : `initiatorRegistrationId ?? 0` fabriquait
      silencieusement une session que le pair ne retrouverait jamais, en déplaçant
      le diagnostic vers la couche GCM — sous les traits d'une ATTAQUE. Fail-closed
      (`assertInitiatorRegistrationId`), paramètre REQUIS au typage, garde runtime
      conservée pour la frontière que le typage ne couvre pas (colonne Prisma).
- [x] Troisième : `ISignalProtocolAdapter.performX3DH` taisait `ourRegistrationId`,
      sans lequel le pair ne peut rien dériver — exactement ce que le cycle 96
      avait corrigé pour la clé éphémère publique. Ajouté.
- [x] **Le suivi `registrationId: 0` du cycle 96 est refermé, et pas comme il
      l'annonçait** : ce `0` n'était pas à « porter », il était à retirer de la
      dérivation. Il reste comme étiquette de session, avec l'interdiction écrite
      d'y injecter l'identifiant du pair.
- [x] Témoins : `dma-x3dh-derivation-symmetry.test.ts` (5), confrontant deux
      PRODUCTIONS réelles. Le premier sépare volontairement « le secret partagé
      coïncide » de « les clés dérivées coïncident » — la séparation EST le
      diagnostic. **ROUGE prouvé deux fois séparément** : état initial ⇒ 4/5
      tombent (seul le secret partagé passe) ; retour de la seule ligne initiateur
      ⇒ 3/5 tombent.
- [x] Gates : `tsc --noEmit` gateway 0 · suites ciblées 16/16 · suite complète gateway.
- [ ] Suivi — préfixe `F` et sel du HKDF (hérité c96). Note ajoutée : l'`info` de
      libsignal ne porte AUCUN identifiant d'enregistrement, donc le lot de
      conformité retirera ce que ce cycle rend cohérent. Bon ordre : cohérent
      d'abord, conforme ensuite.
- [ ] Suivi — les 3 suites du sous-arbre restent ignorées par jest (hérité c96).
- [ ] Suivi — `SignalKeyManager.registrationId` est tiré au hasard dans le
      CONSTRUCTEUR, remplacé par la valeur persistée seulement au chargement : même
      forme que le `?? 0` fermé ici, une valeur par défaut plausible là où
      l'absence devrait se déclarer.
- [ ] Suivi — la quatrième famille reste non outillée. Formulation la plus nette à
      ce jour : rien ne garde contre deux moitiés d'un même protocole chacune
      cohérente avec elle-même et fausses l'une contre l'autre. Paires à instruire :
      chiffrement/déchiffrement du Double Ratchet, sérialiseur/décodeur Socket.IO,
      producteur gateway / décodeurs iOS-Android.


## Cycle 98 (2026-08-22) — un message chiffré par un bout se déchiffre enfin à l'autre

Journal complet : `tasks/realtime-sync-audit-2026-08-22-cycle98.md`.

- [x] Construit le témoin que la « quatrième famille » réclamait depuis le cycle 94 :
      `dma-session-roundtrip.test.ts` fait chiffrer un message par une PRODUCTION
      réelle et le fait déchiffrer par une autre (deux `SignalProtocolEngine`
      distincts). **Il est tombé du premier coup ; QUATRE défauts ont dû être
      réparés pour le faire passer.**
- [x] Défaut 1 — `encryptMessage` omettait la paire de clés DH au montage de la
      session : le message partait avec `Buffer.alloc(0)` en clé éphémère, et le
      répondeur ne pouvait calculer ni DH2, ni DH3, ni DH4. **Mot pour mot le
      défaut corrigé au cycle 96 sur `SignalProtocolAdapter`, la JUMELLE du moteur.**
- [x] Défaut 2 — le répondeur croisait les chaînes DEUX FOIS (X3DH les livre déjà
      croisées, `decryptMessage` recroisait), donc pas du tout. **Ce défaut ANNULAIT
      le cycle 97** : sa convergence des HKDF était défaite à la ligne suivante.
- [x] Défaut 3 — l'initiateur consommait une pré-clé unique et calculait un vrai
      DH4 pendant que le répondeur repliait sur 32 octets nuls (`undefined,
      // preKeyId - optional`). Trou de CONTRAT : `EncryptedMessage` ne portait
      aucun identifiant de pré-clé. Champ `preKeyId` ajouté et porté par chaque
      message. Le symptôme sortait à la couche GCM, sous les traits d'une ATTAQUE.
- [x] Défaut 4 — `DoubleRatchet.asymmetricRatchet` n'appliquait aucun croisement :
      les deux bouts prenaient la même moitié du bloc dérivé dans le même rôle.
      Sans appelant de production (piège armé, pas panne), traité dans le même lot
      au titre de la règle de la JUMELLE.
- [x] Débloqué `SignalProtocolEngine.initialize()`, qui ne pouvait PAS aboutir
      (aucune identité transmise au gestionnaire de clés) — d'où, vraisemblablement,
      l'absence de tout témoin de bout en bout jusqu'ici.
- [x] **ROUGE prouvé séparément pour chacun des 4** : mutation appliquée, suite
      rouge, mutation revertie. Sur le ratchet, 3/4 tombent et la clé racine reste
      verte — la séparation localise la panne.
- [x] Gates : `tsc --noEmit` 0 · suite complète passerelle **832 suites / 19197
      témoins / 0 échec** · suites exclues du sous-arbre inchangées (56/114 avant
      comme après, mesuré).
- [x] **Fait matériel absent des journaux 95-97** : le sous-arbre
      `dma-interoperability` n'est importé de NULLE PART — compilé, jamais exécuté.
      La gravité de ces trois cycles est POTENTIELLE, pas subie.
- [ ] Suivi — les 3 suites du sous-arbre sont rouges (56/114) et exclues de jest.
- [ ] Suivi — `asymmetricRatchet` : suivi des clés distantes au-delà d'un pas.
- [ ] Suivi — `SignalKeyManager.registrationId` tiré au hasard au CONSTRUCTEUR.
- [ ] Suivi — préfixe `F` et sel du HKDF (conformité libsignal).
- [ ] Suivi — quatrième famille : restent le sérialiseur/décodeur Socket.IO et le
      couple producteur passerelle / décodeurs iOS-Android.


## Cycle 99 (2026-08-22) — un refus de jonction TRANSITOIRE effaçait la conversation

Journal complet : `tasks/realtime-sync-audit-2026-08-22-cycle99.md`.

- [x] Suivi du cycle 98 « sérialiseur/décodeur Socket.IO » **retiré, pas porté** :
      vérifié, le dépôt n'a aucun parser Socket.IO personnalisé. Il n'y avait rien
      à instruire là.
- [x] L'autre moitié du suivi — producteur passerelle / décodeurs clients — a livré
      un défaut **en PRODUCTION**, contrairement aux cycles 95-98 dont le
      sous-arbre n'est appelé de nulle part.
- [x] `conversation:join-error` n'était déclaré NULLE PART : ni type de payload, ni
      entrée dans `ServerToClientEvents`. Ses DEUX consommateurs (web, iOS) en
      avaient donc transcrit la forme en lisant le producteur, et tous deux avaient
      conclu la même chose de travers.
- [x] **Le défaut** : la passerelle émet SEPT motifs de refus, dont quatre
      transitoires (`rate_limited`, `server_error`, `not_authenticated`,
      `invalid_payload`). Les deux clients lisaient `reason` et n'en faisaient
      rien — le web purgeait la conversation et TOUT son historique de messages,
      iOS y ajoutait la fermeture de la vue ouverte sous « accès révoqué ».
      Une limite de débit franchie par une tempête de reconnexion éjectait donc
      l'utilisateur du fil qu'il lisait, et détruisait le cache qui porte la
      promesse de lecture hors ligne.
- [x] **Cause structurelle** : les handlers importaient le `Socket` NU de
      socket.io (`DefaultEventsMap`), sur lequel `emit(n'importe quoi)` compile.
      Seul l'`io` de `MeeshySocketIOManager` était typé. Un contrat que seul
      l'orchestrateur honore n'est pas un contrat.
- [x] **Pourquoi les témoins ne l'ont pas vu** : le web en avait trois sur ce
      gestionnaire — ils exerçaient `banned` et `not_a_member`, les deux seuls
      motifs où purger est JUSTE. Ils attestaient que la purge a lieu, jamais
      qu'elle est conditionnelle.
- [x] Contrat déclaré (`CONVERSATION_JOIN_ERROR_REASONS`,
      `ConversationJoinErrorEventData`, entrée dans `ServerToClientEvents`) et
      règle unique partagée `isMembershipDeniedJoinError()`.
- [x] `MeeshySocket` (`socketio/typed-socket.ts`) contraint le producteur.
      **Mesuré** : `reason: 'bnned'` fait désormais échouer `tsc` en nommant les
      sept valeurs admises.
- [x] L'INCONNU ne détruit pas — liste d'autorisation, jamais d'exclusion. Même
      règle de maison que `BridgeAnnouncement` : « ne pas savoir lire n'autorise
      pas à détruire ».
- [x] **ROUGE prouvé** : web 4/4 tombent avant correctif (`Received array: []`) ;
      passerelle rouge sous mutation du motif ; shared ne se charge pas sans le
      module.
- [x] Gates : `tsc` passerelle 0 · `tsc` web **identique à la baseline** (diff vide,
      mesuré par `git stash` — 1241 erreurs préexistantes) · shared 2449/2449 +
      tous seuils de couverture · web ciblé 144/144 · suite complète passerelle.
- [ ] Suivi — **un seul handler est typé.** Basculer les autres un par un sur
      `MeeshySocket` ; chacun peut révéler un événement non déclaré.
- [ ] Suivi — après un refus transitoire, iOS ne RE-TENTE pas la jonction. Le fil
      et son cache survivent (le gain), mais la room n'est rejointe qu'au prochain
      cycle de reconnexion. Un re-essai borné sur les seuls motifs transitoires
      est la suite naturelle.
- [ ] Suivi — **Android n'a pas été instruit** (cf. cycle 92 bis : un consommateur
      Android peut exister et n'avoir jamais fonctionné).
- [ ] Suivi — ce cycle n'a instruit qu'UN événement sur les ~158 du contrat.
- [ ] Suivis hérités du cycle 98, non touchés : 3 suites `dma-interoperability`
      rouges et exclues (56/114) ; clés distantes d'`asymmetricRatchet` ; pré-clé
      unique non consommée par le répondeur ; `SignalKeyManager.registrationId`
      tiré au hasard au constructeur ; préfixe `F` et sel du HKDF.

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

## Cycle 99 bis (2026-08-22) — `message:new` a deux producteurs, et ils avaient cessé de dire la même chose

Journal complet : `tasks/realtime-sync-audit-2026-08-22-cycle99-bis.md`.
(Numéroté **bis** : un autre lot a porté le numéro 99 le même jour — voir la
section ci-dessus. Les deux sont indépendants.)

- [x] Pris la cible que le cycle 98 nommait en premier parmi les restantes de la
      « quatrième famille » : le **sérialiseur/décodeur Socket.IO**.
- [x] Constat : `message:new` a **DEUX producteurs** — `MessageHandler`
      (transport socket) et `MeeshySocketIOManager` (transport REST/ZMQ) — qui
      construisaient leur charge utile À LA MAIN, chacun dans son fichier, sous
      deux commentaires jumeaux avertissant que « c'est la 3e fois que cette
      duplication cause un bug de parité ». Chaque commentaire n'a gardé que
      l'exemplaire qui le portait (leçon du cycle 85, une couche plus haut).
- [x] **SIX familles de champs divergeaient.** Le chemin REST perdait l'enveloppe
      E2EE entière, le plafond de vue-unique, la provenance d'un transfert et la
      réponse à un post ; le chemin socket perdait `messageSource`, `updatedAt`
      et le pseudo d'un expéditeur sans compte.
- [x] **Ce n'est pas un piège armé, c'est une panne en production.** Le chemin
      REST porte, côté iOS, TOUT envoi non éligible au socket-first — dont les DM
      chiffrés. `MessageProcessor` écrit `content: ''` pour un message chiffré ;
      le web décrypte en lisant `socketMsg.encryptedContent` +
      `encryptionMetadata`, absents du fil REST, et sort au premier garde.
      **web → web marchait, iOS → web non : bulle VIDE, sans erreur.** Côté iOS
      la garde `apiMsg.isEncrypted == true` de `ConversationSocketHandler` — dont
      le commentaire dit qu'elle existe pour empêcher exactement ce symptôme —
      ne se déclenchait jamais sur ce transport.
- [x] RED : `message-new-producer-parity.test.ts` (6 témoins) fait se rencontrer
      les DEUX PRODUCTIONS RÉELLES (un manager construit, on lui prend le vrai
      `MessageHandler` qu'il porte). **6/6 tombent** contre la production d'avant.
- [x] **ROUGE prouvé séparément pour chacune des 6 mutations** — chaque mutation
      en fait tomber EXACTEMENT UN, et c'est celui qui nomme sa famille.
- [x] Correctif : `socketio/messageNewPayload.ts` — `buildMessageNewPayload`,
      source UNIQUE des champs dérivés de la ligne message, appelée par les deux.
      `replyTo` / `attachments` / `translations` restent paramètres (formes
      délibérément différentes) ; `originalContent` et `metadata` restent hors
      contrat PAR DÉCISION écrite. **Le lot entier est ADDITIF** — aucun champ ne
      disparaît d'aucun transport.
- [x] Gates : `tsc --noEmit` passerelle 0 erreur · suite complète passerelle.
- [ ] Suivi — **iOS ne lit PAS `encryptedContent` du fil** (il tire le chiffré de
      `content`, que la passerelle laisse vide). Le correctif de ce cycle est une
      PRÉCONDITION, pas une garantie côté iOS. C'est la quatrième famille sur le
      couple producteur passerelle / décodeur iOS — le second que le cycle 98
      nommait, et il reste ouvert.
- [ ] Suivi — `originalContent` : alias hérité qui DUPLIQUE `content` sur chaque
      message du chemin REST. À retirer après relevé de ses consommateurs web.
- [ ] Suivi — `attachments` normalisés d'un côté, bruts de l'autre : unifier est
      un CHANGEMENT de forme, à instruire contre les trois clients.
- [ ] Suivi — quatrième famille : reste le couple passerelle / décodeurs Android.

## Cycle 101 (2026-08-22) — le transport d'édition PRIMAIRE servait une charge que le décodeur iOS REJETTE

Journal complet : `tasks/realtime-sync-audit-2026-08-22-cycle101.md`.

- [x] Instruit le suivi nommé du cycle 100 — les QUATRE handlers restés sur le
      `Socket` nu. Flip tenté et MESURÉ : `tsc` nomme douze émissions.
- [x] **Onze relevaient de dettes connues ; la douzième était une panne.**
      `message:edited` a TROIS producteurs, et celui du transport socket — celui
      qu'emploie le WEB, que son propre commentaire nomme « le transport
      d'édition PRIMAIRE » — omettait `senderId`, `messageType` et `createdAt`,
      trois des SEPT champs que `SocketIOMessage` déclare requis.
- [x] **Ce n'était pas un piège armé.** `APIMessage.init(from:)` lit `senderId`
      et `createdAt` en `try c.decode` (NON tolérant, contrairement à ses
      voisins) : la clé absente fait échouer le décodage du message ENTIER, et
      `MessageSocketManager.decode` abandonne en silence. **Toute édition faite
      depuis le web n'apparaissait jamais en direct sur aucun client iOS du
      salon.** Web → web marchait (écouteur `any`), Android aussi
      (`senderId`/`createdAt` optionnels) — seul le client le plus strict
      tombait. Signature exacte du cycle 99 bis, un événement plus loin.
- [x] RED prouvé : `MessageHandlerEditedContract.test.ts`, 5 témoins, **4
      tombent** contre la production d'avant. Le 5e — « ne perd RIEN » — passe
      AVANT comme APRÈS : c'est le témoin d'ADDITIVITÉ, et c'est lui qui rend la
      mesure vérifiable.
- [x] Correctif : `socketio/messageEditedPayload.ts` — `buildMessageEditedCore`,
      source UNIQUE des champs requis, appelée par les deux producteurs
      en-process. `sender` / `translations` / `attachments` / `metadata` restent
      hors contrat PAR DÉCISION écrite (formes propres au transport).
      **Le lot entier est ADDITIF** — le manager passe à l'unité sans qu'une
      seule clé de sa charge change.
- [x] `resolveWireSenderId` : une seule résolution `User.id` pour `message:new`
      ET `message:edited` — sinon la MÊME bulle est « la mienne » puis « celle
      d'un autre » selon l'événement qui l'a touchée en dernier.
- [x] Deux seams `unknown` de plus fermés (`ReactionHandler`,
      `PostReactionHandler`) ; `AuthenticatedEventData` cesse de déclarer un
      `SocketIOUser` que ses deux seuls émetteurs n'ont jamais servi. **Trois
      handlers de plus sur `MeeshySocket`** — il n'en reste qu'un.
- [x] Cliquet à la COMPILATION dans `messageEditedPayload.ts`. **Sa première
      formulation était VACANTE** (`undefined extends T` est vrai partout sous
      `strictNullChecks: false`) et ne tombait sous aucune mutation ; reformulée
      sur le modificateur `?`. **ROUGE prouvé séparément pour les trois champs.**
      Leçon 246.
- [x] Gates : `tsc --noEmit` passerelle **0 erreur** · `src/socketio` **49
      suites / 1605 tests verts** · suite complète passerelle.
- [ ] Suivi — **le flip du `MessageHandler` reste ouvert, et son blocage est
      mesuré** : au-delà de `_buildMessagePayload: unknown`, le seul reste est
      `messageType` servi en `string` quand le contrat déclare l'union
      `MessageType`. Le caster blanchirait ce que la garde existe pour voir.
- [ ] Suivi — `broadcastMessageMutation` prend `payload: Record<string, unknown>` :
      le 3e producteur sert le contrat par ACCIDENT (`include` large), pas par
      construction.
- [ ] Suivi — `senderId` : le chemin REST sert le `Participant.id` brut là où les
      deux autres servent le `User.id`. Non destructeur côté iOS (vérifié :
      `markEdited` n'écrit jamais `senderId`) ; à instruire côté web.

## Cycle 102 (2026-08-22) — `messageType` : une règle écrite QUATRE fois, et un client qui ne peut pas la dire

Journal complet : `tasks/realtime-sync-audit-2026-08-22-cycle102.md`.

- [x] Instruit le suivi nommé du cycle 101 — `messageType` servi en `string`
      quand le contrat déclare l'union `MessageType`. En ouvrant la colonne, une
      panne de produit est apparue AVANT la question de typage.
- [x] **`Message.messageType` était renseigné depuis un champ de requête que le
      client fournit — et `SendMessageRequest` du SDK iOS n'a pas ce champ.**
      Ni lui, ni `ShareSendBody` de l'extension de partage. Or le chemin REST est
      celui de TOUT envoi iOS non éligible au socket-first (pièce jointe, DM
      chiffré, vue unique, éphémère) : **toute photo, vidéo et note vocale partie
      d'iOS se persistait `'text'`**.
- [x] **La règle canonique existait, câblée à UN chemin sur quatre.**
      `messageTypeFromMimeTypes` servait le handler socket ; la liaison REST par
      `attachmentIds` ne dérivait rien, la copie de DIFFUSION non plus, et la
      copie de TRANSFERT réécrivait la règle À LA MAIN — en ne lisant que
      `createdAttachments[0]` et en ne connaissant que le préfixe `application/`.
- [x] **Les deux exemplaires avaient chacun leur témoin, et les deux exigeaient
      des réponses OPPOSÉES pour `text/plain`** (`'file'` d'un côté, « ne met pas
      à jour » de l'autre), verts tous les deux. Le second n'attestait pas une
      règle : il gelait le trou de l'exemplaire qu'il gardait.
- [x] Coût aval mesuré : `protectedPreview` → `contentTypeIcon` sert `💬` au lieu
      de `🖼️` sur la notification d'une photo vue-unique iOS ; et la diffusion
      donnait DEUX types différents aux deux copies du même partage.
- [x] RED prouvé : 7 témoins, **5 tombent**. Les 2 qui passent sont exactement
      les témoins d'ADDITIVITÉ. « lot hétérogène » recevait `"image"` — preuve
      directe que la règle manuscrite ne lisait que la première pièce jointe.
- [x] Correctif : UNE dérivation, au seul point où les pièces jointes FINALES
      sont connues (`saveMessage`, après l'ÉTAPE 4 bis qui relit déjà pour les
      trois chemins). `deriveMessageTypeForAttachments` ne parle que si la
      colonne porte encore son défaut — **le lot entier est ADDITIF**.
- [x] La règle DÉMÉNAGE de `socketio/utils/` vers `services/messaging/` : elle
      appartient au domaine du message, pas à un transport. C'est ce qui rend
      « source unique » structurellement vrai plutôt que simplement écrit.
      L'exemplaire manuscrit est supprimé.
- [x] Quatre témoins de transfert préexistants rendus FIDÈLES : ils mockaient la
      relecture de l'ÉTAPE 4 bis à `[]`, ce que la production ne fait jamais.
- [x] Gates : `tsc --noEmit` **0 erreur** · nouveaux + `MessageProcessor`
      **112/112** · socketio + messagerie **74 suites / 2369 tests verts** ·
      suite complète passerelle.
- [ ] Suivi — **le web porte le CINQUIÈME exemplaire de la règle**
      (`determineMessageTypeFromMime(mimeTypes[0])`, deux sites) : un lot
      hétérogène y part en `'image'` là où la canonique dit `'file'`. La
      dérivation serveur ne le corrige pas — la valeur est explicite, donc
      respectée par construction. Retrait = changement de contrat client.
- [ ] Suivi — un message de LIEU sans pièce jointe reste `'text'` quand le client
      se tait, et iOS se tait toujours : les lieux sont sous-comptés par
      `ConversationMessageStatsService` pour toute la population iOS.
- [ ] Suivi — le flip du `MessageHandler` reste ouvert : ce cycle a réparé ce que
      la colonne CONTIENT, pas ce qu'elle DÉCLARE. Les deux se suivent dans cet
      ordre.

## Cycle 103 (2026-08-23) — `message:edited` : le transport que le contrat ne gouvernait pas

Journal complet : `tasks/realtime-sync-audit-2026-08-23-cycle103.md`.

- [x] Instruit les suivis nommés du cycle 101/102. Le suivi « flip du
      `MessageHandler` » était PÉRIMÉ — il a atterri au cycle 101 bis (PR #3359),
      et l'en-tête du fichier le dit. Ce qui restait ouvert, c'est son voisin :
      `broadcastMessageMutation` prend `Record<string, unknown>`, et le chemin
      REST sert un `Participant.id` là où les deux autres servent un `User.id`.
      Les deux lignes décrivent UNE seule chose : un transport hors contrat, et
      la valeur fausse qui y vivait parce que rien ne le gouvernait.
- [x] **D1 — les TROIS entrées REST de `message:edited` servaient le
      `Participant.id` comme `senderId`.** `PUT /messages/:messageId` (iOS),
      `PUT /conversations/:id/messages/:messageId` (web) et
      `PATCH /messages/:messageId` (Android) étalaient la ligne Prisma BRUTE.
      Le contrat déclare `SocketIOMessage`, dont `senderId` est ce que les
      clients comparent à leur propre identité.
- [x] **La cause est structurelle, pas un oubli.** `payload:
      Record<string, unknown>` + un `PreviewEmitIO` dont l'`emit` prend
      `unknown` : le cliquet de `messageEditedPayload.ts` n'avait AUCUNE prise
      sur ce transport. Il servait le contrat par ACCIDENT — l'`include` large
      apportait les sept clés requises, avec la mauvaise VALEUR dans l'une.
- [x] Coût relevé sur les TROIS clients, pas supposé : **web mode Focal** est le
      seul chemin vivant (`FocalRow` calcule `isMe = message.senderId ===
      currentUser.id`, et `handleMessageEdited` fusionne la charge dans le
      cache) ; la bulle CLASSIQUE y échappe (`getSenderUserId`) ; iOS indemne
      (`markEdited` n'écrit jamais `senderId`) ; Android indemne (il relit par
      REST). Un chemin vivant, et un contrat que 4 producteurs sur 5 honoraient.
- [x] **D2 — une garde que la couche AU-DESSUS rendait inatteignable.**
      Découvert par un témoin d'additivité qui attendait `'en'` et recevait
      `'fr'`. `PUT /conversations/:id/messages/:messageId` est la seule des
      quatre entrées à réécrire `originalLanguage`, et sa garde
      (`claimedLanguage === undefined ? …`) ne pouvait pas se déclencher : son
      schéma de requête portait `default: 'fr'`, et Fastify active `useDefaults`
      d'AJV. **Un `default` de schéma de REQUÊTE est une ÉCRITURE dans
      `request.body`, pas une documentation** — mesuré sous les options AJV
      exactes de `server.ts`.
- [x] D2 est un **piège armé, pas une panne**, et la distinction est MESURÉE :
      le web passe `originalLanguage` en paramètre requis, iOS et Android
      éditent par deux routes qui ne portent pas ce champ. Personne ne le
      déclenche — jusqu'au premier appelant qui omettra la clé en lisant une
      garde qui a l'air de le couvrir (règle du cycle 84).
- [x] Jumelle CHERCHÉE : balayage des 95 `default:` de schémas de requête du
      dépôt. Que des défauts de pagination, plus un candidat
      (`conversations/messages.ts:1640`) qui n'est PAS le même défaut —
      `MessageProcessor` déclare `originalLanguage` REQUIS, il n'y a aucune
      branche d'absence à défaire.
- [x] Correctif 1 : `broadcastMessageMutation.payload` discriminé par
      `eventType` — le NOYAU du contrat pour `edited`, `MessageDeletedEventData`
      pour `deleted`. Exiger le noyau et non le contrat entier est délibéré :
      l'étalement échappe au contrôle des propriétés excédentaires, donc les
      extras de chaque transport restent libres et **le lot reste ADDITIF**.
- [x] Correctif 2 : les trois entrées passent par `buildMessageEditedCore`. Les
      deux `as unknown as Record<string, unknown>` disparaissent — ils n'étaient
      pas une commodité de typage, ils étaient la MARQUE du transport hors
      contrat.
- [x] Correctif 3 : `default: 'fr'` retiré du schéma de requête. La garde
      devient atteignable ; un appelant qui envoie la clé est traité comme avant.
- [x] RED prouvé, dans les deux sens. D1 : les trois transports rendent
      `Participant.id` là où le témoin attend `User.id` ; les témoins de repli
      ANONYME passent AVANT comme APRÈS. D2 : 2 tombent, le témoin
      d'additivité passe dans les deux états.
- [x] **Le cliquet a des dents, et ce qu'il nomme est le 3e suivi du cycle 102**
      — en rétablissant l'ancienne forme : `Type 'string' is not assignable to
      type 'MessageType'`. Le cycle 102 a réparé ce que la colonne CONTIENT ;
      ce lot contraint ce qu'elle DÉCLARE, dans l'ordre qu'il avait fixé.
- [x] Gates : `tsc --noEmit` **0 erreur** · nouveaux témoins **12/12** ·
      7 suites adjacentes **234/234** · suite complète passerelle.
- [ ] Suivi — **la RÉPONSE HTTP des trois routes d'édition sert toujours le
      `Participant.id`** là où la LISTE REST sert le `User.id`
      (`messages.ts:1076`). Écarté de ce lot sur MESURE, pas par préférence :
      aucun des trois clients ne lit ce corps (iOS `_ = try await …`, Android
      ne lit que le succès, les deux appelants web `await` sans utiliser la
      valeur). Changement de contrat REST sans consommateur à servir.
- [ ] Suivi — la règle du `senderId` du fil a maintenant DEUX exemplaires :
      `resolveWireSenderId` et la résolution manuscrite de
      `conversations/messages.ts:1076`, qui sert en plus `senderParticipantId`.
- [ ] Suivi — `PreviewEmitIO.emit(event: string, payload: unknown)` reste la
      porte non typée de toute diffusion d'aperçu. Ce lot a gouverné la CHARGE ;
      l'ÉMISSION n'est toujours pas vérifiée contre `ServerToClientEvents`.
- [ ] Suivi hérité — le web porte le 5e exemplaire de la règle `messageType`.
- [ ] Suivi hérité — un message de LIEU sans pièce jointe reste `'text'`.
- [ ] Suivi — un cliquet sur les `default:` de schémas de REQUÊTE. Le
      discriminant n'est pas syntaxique (il faut savoir si le gestionnaire
      distingue l'absence), donc l'outil ne peut pas trancher seul — mais il
      pourrait geler la liste et forcer à instruire tout site NEUF.

## Cycle 104 — la porte d'émission : huit copies d'une déclaration qui ne dit rien

Journal complet : `tasks/realtime-sync-audit-2026-08-23-cycle104.md`

- [x] Instruit le suivi nommé du cycle 103 : « `PreviewEmitIO.emit(event: string,
      payload: unknown)` reste la porte non typée de toute diffusion ». Le suivi
      était juste et **sous-estimait son objet d'un facteur huit** — la même
      déclaration était écrite HUIT fois à la main, dans huit fichiers qui ne se
      citent pas. Plus deux exemplaires des mêmes dérivations de type dans
      `SocialEventsHandler` (cycle 100), qui avait trouvé la bonne réponse sans
      qu'elle soit disponible ailleurs.
- [x] **Découverte MESURÉE : socket.io ne garde pas ce qu'on croit.** Sur un nom
      d'événement UNION, son `EventParams` s'effondre en union de tuples et une
      charge correspondant à N'IMPORTE lequel des membres passe sous n'importe
      quel autre. Un nom d'événement CALCULÉ est exactement la forme qu'ont les
      quatre émetteurs qui n'avaient pas de porte à eux (`ReactionHandler`,
      `AttachmentReactionHandler`, `PostReactionHandler`, `SocialEventsHandler`).
      **Ils avaient l'air gardés et ne l'étaient pas** — pire qu'ouvertement non
      typés, parce que personne ne va les vérifier.
- [x] **Aucune charge fausse sur le fil** — piège armé, pas panne, et c'est
      mesuré et non supposé (règle du cycle 103). Les douze appelants de
      `broadcastToUser`, ceux d'`emitToConversationParticipants`, les quatre
      routes de réaction et les quatre émetteurs sociaux passent tous au contrat
      sans une correction de valeur.
- [x] **La JUMELLE portait la marque exacte du cycle précédent.**
      `broadcastReactionMutation` déclarait le `Record<string, unknown>` que le
      cycle 103 venait de retirer de `broadcastMessageMutation`, et ses QUATRE
      sites d'appel portaient le double cast qui le dit
      (`updateEvent as unknown as Record<string, unknown>`). Les quatre sont
      partis ; la charge était déjà juste.
- [x] **Défaut de HARNAIS bien réel, 3e exemplaire du patron (91, 93, 104).**
      `SocialEventsHandler.test.ts` portait un double PARTIEL de
      `socketio-events` : 27 constantes à la main, pas la 28e
      (`COMMENT_UNLIKED`). `broadcastCommentUnliked` émettait donc un événement
      au nom **`undefined`** sur ses deux adresses, avec un témoin VERT — il
      n'assertait que les rooms, jamais le NOM. Double retiré, assertion posée.
- [x] Correctif : `socketio/serverEmit.ts`, la porte dérivée de
      `ServerToClientEvents` en **union de tuples** (la forme générique, celle
      qu'on écrit spontanément, n'est pas satisfaite par le `Server` de
      production — socket.io décore sa carte avant d'en dériver ses paramètres).
- [x] **DEUX erasures nommées, et deux seulement** (TS#30581) : `emitServerEvent`,
      derrière un paramètre dont le type EST la garantie qu'il est sans
      conséquence. Les émetteurs dont le couple relève du flot de CONTRÔLE
      gardent leur `switch`, qui corrèle sans rien effacer.
- [x] **Deux frontières de désérialisation NOMMÉES** plutôt que fermées :
      `linkMessageEmissions` et `_drainedEmissions` (charge relue de Redis).
- [x] **Deux cliquets, aucun ne subsume l'autre.** Au TYPE (`ServerEmitRatchet`,
      4 assertions, 0 ligne exécutable) contre une porte RELÂCHÉE ; au BALAYAGE
      (inventaire VIDE, `src/` entier) contre une porte CONTOURNÉE — la 8e copie
      vivait dans `utils/`, à deux répertoires de la 7e.
- [x] **Le cliquet de type vit dans le module qu'il garde, PAS dans `__tests__/`,
      et la raison est mesurée** : `tsconfig` EXCLUT les tests et n'inclut
      `src/socketio/**` que par ATTEIGNABILITÉ. Un cliquet dans un fichier que
      personne n'importe n'est jamais lu par le compilateur — donc jamais rouge.
- [x] RED prouvé sur les deux cliquets, et les 4 assertions de type ne sont pas
      redondantes : la mutation « relâchée en `[string, unknown]` » fait tomber
      2/3/4, la mutation « corrélation retirée » fait tomber 2/3 seulement.
- [x] Gates : `tsc --noEmit` **0 erreur** · suite complète passerelle
      **836/836 suites, 19253/19253 témoins**.
- [ ] Suivi — `ReactionUpdateEvent` et `ReactionUpdateEventData` sont DEUX
      exemplaires structurellement identiques de la même déclaration, jusqu'au
      commentaire de `userId`. Écarté par SCOPE : la seconde est importée par le
      SDK web et les services, donc lot de dépendances, pas d'émission.
- [ ] Suivi — **la charge REJOUÉE n'est pas vérifiée contre la charge ÉMISE.**
      `QueuedMessagePayload.payload` est un `Record<string, unknown>` unique pour
      onze `eventType`. L'indexer fermerait la dernière frontière que ce lot n'a
      que NOMMÉE, et c'est le seul endroit où un rejeu hors ligne peut diverger
      en silence de la diffusion directe.
- [ ] Suivi — `ConversationUpdatedEventData` porte une signature d'index, donc la
      porte n'y vérifie que les trois champs REQUIS. `lastMessagePreview` y
      voyage sans contrat alors que trois émetteurs le posent — même famille que
      `location` avant le cycle qui l'a déclaré.
- [x] ~~Suivi — le miroir client→serveur n'est pas gouverné.~~ **MESURÉ FAUX au
      cycle 107.** Le constat de départ était exact (`ClientToServerEvents` n'a
      pas de porte de type) ; la conclusion ne l'était pas — pour de l'ENTRANT
      une porte de type ne garde rien, seule l'exécution garde, et elle existait
      déjà (37 validations zod + gardes manuscrites + limiteur de débit partout).

## Cycle 104 bis (2026-08-23) — `messageType` : la moitié CLIENT que le serveur ne peut pas corriger

Journal complet : `tasks/realtime-sync-audit-2026-08-23-cycle104-bis.md`.

- [x] Instruit le suivi nommé des cycles 102 et 103 — « le web porte le
      CINQUIÈME exemplaire de la règle ». Sa note « retrait = changement de
      contrat client » l'avait tenu ouvert deux cycles : elle décrit le geste
      qu'il ne faut PAS faire (retirer le champ du fil) et masquait le geste
      additif — faire écrire au client la MÊME règle, pas une autre.
- [x] **La duplication n'est pas de style : elle est AUTORITATIVE.** La
      dérivation serveur (`deriveMessageTypeForAttachments`) est délibérément
      ADDITIVE — elle se tait dès que la colonne porte autre chose que `'text'`.
      Corollaire jamais écrit, et écrit maintenant : **ce que le client DÉCLARE,
      personne ne le corrige.** C'est ce qui sépare cette duplication de celles
      des cycles 102/103, où les copies se rattrapaient entre elles.
- [x] **TROIS sites, pas deux.** Le balayage a trouvé le troisième, absent du
      suivi et le seul que l'utilisateur VOIE :
      `ConversationLayout.tsx:593` compose le `messageType` de la ligne
      OPTIMISTE avec un ternaire manuscrit — donc un flip visible dès que sa
      règle diverge de celle que le serveur écrira.
- [x] **D1 (persisté)** — les trois exemplaires lisaient `mimeTypes[0]`. Un lot
      photo + PDF partait en `'image'` là où la canonique dit `'file'`, et le
      repli REST le persistait sans que rien ne le corrige. Aval mesurable :
      `contentTypeIcon` notifie 🖼️ au lieu de 📎 ;
      `ConversationMessageStatsService` compte par la même colonne.
- [x] **D2 (affichage)** — `text/*` et un MIME inconnu rendaient `'text'` : un
      ballon de conversation sur un message qui porte un fichier. Distinction
      MESURÉE, pas supposée : sur ces formes-là le serveur RATTRAPE le repli
      REST (la colonne porte `'text'`, donc l'additif se déclenche). D2 n'est
      persisté nulle part — c'est un défaut de ligne optimiste, et un piège
      armé ailleurs. D1, lui, est persisté.
- [x] **Le chemin socket ne pesait pas ce qu'on croyait** :
      `SocketMessageSendWithAttachmentsSchema` n'a AUCUN champ `messageType`,
      donc `z.object` le strippe et `MessageHandler` dérive lui-même. Le repli
      REST est le SEUL des deux à atteindre la base.
- [x] Correctif : la règle REMONTE dans
      `packages/shared/utils/attachment-message-type.ts`. La passerelle garde
      son module comme point d'import (ré-export de trois lignes) ; les
      appelants n'ont pas à savoir où la règle habite.
- [x] Une fonction AJOUTÉE, sans jumelle serveur et délibérément :
      `messageTypeForClientAttachments({ hasAttachments, mimeTypes })` porte les
      deux choses que seul un client sait — des pièces jointes sans MIME connu
      ⇒ `'file'` (jamais `'text'`), et aucune pièce jointe ⇒ `'text'` (le seul
      cas où il est vrai, et c'est `attachmentIds` qui le dit).
- [x] RED prouvé dans les deux sens : ancienne règle rétablie ⇒ **5 témoins
      tombent, 112 passent**. Les catégories homogènes et le cas sans pièce
      jointe passent AVANT comme APRÈS — le lot est strictement additif sur eux.
- [x] Gates : `tsc --noEmit` shared **0** · gateway **0** · web **1241
      inchangé** (préexistantes, fichiers de test, aucune sur les 3 fichiers
      touchés) · shared **103 suites / 2467 tests** (18 nouveaux) · web
      messaging **117/117** + ConversationLayout · gateway 39 suites adjacentes
      **1274/1274** puis suite complète VERTE (exit 0).
- [ ] Suivi — un message de LIEU sans pièce jointe reste `'text'`, et iOS se
      tait toujours. Non traité ici sur MESURE : `'location'` n'est pas dans
      l'enum de la route REST, donc le combler touche la route, l'enum, iOS et
      le service de stats — son propre lot.
- [ ] Suivi — **`conversation:updated.senderId` est servi dans DEUX espaces
      d'id** (WS = `User.id`, REST/ZMQ + aperçu = `Participant.id`). Piège ARMÉ,
      pas panne : aucun client ne le lit — mesuré sur les trois.
- [ ] Suivi — **`ConversationUpdatedEventData` ne déclare que 3 champs + une
      signature d'index** ; tout le groupe d'aperçu voyage sans contrat. Le
      suivi ci-dessus en est le premier symptôme mesuré.
- [x] Corrigé dans ce lot — le commentaire de `MessageHandler.ts:1453` était
      PÉRIMÉ (`io` EST typé `MeeshyIOServer`). Ce qui reste vrai, c'est que le
      typage n'attrape rien ici — à cause de la signature d'index, pas d'un type
      manquant. Un mauvais diagnostic écrit dans le code coûte plus qu'aucun.
- [x] Suivi hérité `PreviewEmitIO.emit` non typé : **CLOS par le lot voisin**
      (cycle 104, PR #3366), qui en a trouvé huit copies là où le suivi n'en
      nommait qu'une. Deux lots du même jour, instruits en parallèle.
- [ ] Suivis hérités restants — la règle du `senderId` du fil en QUATRE
      exemplaires (dont un en `||` là où trois sont en `??`) ; un cliquet sur
      les `default:` de schémas de REQUÊTE.

## Cycle 105 — un cast est une porte, et `_seq` n'était déclaré nulle part

Journal complet : `tasks/realtime-sync-audit-2026-08-23-cycle105.md`

- [x] Part de la question que le cycle 104 n'a pas posée : son balayage cherche
      des DÉCLARATIONS — **qu'est-ce qu'il ne peut PAS voir ?**
- [x] **D1 — la NEUVIÈME porte, ouverte par ASSERTION DE TYPE.** Sur le rejeu
      hors ligne (`_drainPendingMessages`) :
      `as unknown as { emit: (event: string, payload: unknown) => void }`.
      Un cast produit exactement la liberté d'une déclaration, sur exactement le
      même appel, et il est plus discret : il ne crée aucun type nommé qu'on
      puisse chercher.
- [x] **Le commentaire qui la couvrait était une AFFIRMATION devenue fausse** —
      « les revérifier ici est IMPOSSIBLE ». Vrai à l'écriture ; le cycle 104 l'a
      périmé sans s'en apercevoir (`_drainedEmissions` rend des couples
      CORRÉLÉS, `emitServerEvent` existe pour ça). **Un commentaire
      d'impossibilité ne rougit jamais.**
- [x] **D2 — trois émetteurs à nom CALCULÉ** que le cycle 104 n'avait pas
      balayés (il les avait cherchés à la main) : le rejeu, les trois événements
      de traduction AUDIO, et `emitWithSeq`.
- [x] **D3 — `_seq` : lu par les TROIS clients, déclaré NULLE PART.** Curseur
      monotone par utilisateur, signal de détection de trou du SyncEngine — web
      (`observeSyncSeq`), iOS (`case seq = "_seq"`), Android. Il ne voyageait
      que parce que la porte prenait `Record<string, unknown>` et que les deux
      sites d'appel portaient le double cast. Exactement `location` sur
      `ConversationUpdatedEventData` avant sa déclaration.
- [x] **D4 — `context` déclaré `Record<string, unknown>`** alors que
      `NotificationContext` (18 champs nommés) vit dans le MÊME paquet. Tombé en
      une ligne au premier typage de l'émission. Une carte ouverte dans un
      contrat est une absence de déclaration qui a l'air d'en être une — version
      « carte » du `{ type: 'object' }` nu. Idem `metadata`.
- [x] Le balayage voit désormais les DEUX formes (`emit(ev: string` et
      `emit: (ev: string`), fixture à trois formes fautives.
- [x] **RED prouvé de la façon la plus directe** : en réintroduisant le cast que
      le cycle 104 avait laissé vivre, le balayage tombe EN NOMMANT
      `socketio/MeeshySocketIOManager.ts`.
- [x] Gates : `tsc` passerelle **0 erreur** · **836/836 suites, 19253/19253** ·
      `packages/shared` **102/102 fichiers, 2449/2449** · `apps/web` aucune
      erreur ajoutée (grep ciblé sur la surface du lot).
- [ ] Suivi — **la charge REJOUÉE est AFFIRMÉE, pas PROUVÉE.**
      `QueuedMessagePayload.payload` reste un `Record<string, unknown>` unique
      pour onze `eventType` ; `_drainedEmissions` asserte le couple à la
      frontière Redis. L'indexer par `eventType` remplacerait l'affirmation par
      une vérification.
- [ ] Suivi — `_seq` n'est déclaré que sur `NotificationEventData`, le seul
      événement qui passe par `emitWithSeq` aujourd'hui. Un second l'y ferait
      entrer sans que rien ne rappelle de le déclarer.
- [ ] Suivi hérité — `ReactionUpdateEvent` / `ReactionUpdateEventData`, deux
      exemplaires de la même déclaration.
- [ ] Suivi hérité — `ConversationUpdatedEventData` porte une signature d'index ;
      `lastMessagePreview` y voyage sans contrat.
- [x] ~~Suivi hérité — le miroir client→serveur n'est pas gouverné.~~ **MESURÉ FAUX au cycle 107.**

## Cycle 106 — la file rejoint le contrat : ce qu'on ENFILE est tenu à ce qu'on ÉMET

Journal complet : `tasks/realtime-sync-audit-2026-08-23-cycle106.md`

- [x] Instruit le suivi nommé DEUX fois (cycles 104 et 105) : « la charge REJOUÉE
      n'est pas vérifiée contre la charge ÉMISE ». C'était le plus urgent des
      quatre restants, pour une raison précise : **le seul témoin d'une
      divergence entre l'émission directe et le rejeu est un destinataire qui
      était hors ligne au mauvais moment** — c'est-à-dire personne.
- [x] `socketio/queuedEventContract.ts` : **la** table `eventType` → événement
      serveur (`DRAINED_EVENT`), et la charge qui s'en dérive
      (`QueuedPayloadFor`, `QueuedEventVariant`).
- [x] **Une chaîne de onze `if` n'est pas une table.** `_drainedEventName`
      portait un repli final (`return MESSAGE_NEW`) : un `eventType` neuf s'y
      serait rejoué sous le mauvais nom, sans bruit. `as const satisfies
      Record<Union, …>` rend la couverture exhaustive au compilateur.
- [x] **La corrélation devait remonter SEPT relais** — chacun redéclarait un
      `eventType` en union ET un `payload: Record<string, unknown>`, donc deux
      unions indépendantes de plus par étage. Le contrat se perdait AVANT
      d'atteindre la file. Même leçon que le cycle 98, appliquée en amont :
      gouverner une frontière ne sert à rien tant que ses relais ne la relaient
      pas.
- [x] 5 doubles casts de plus retirés (`editedPayload`, `updateEvent` ×3,
      `translationData`).
- [x] **Une erreur commise, mesurée, transformée en cliquet.** `'link-message'`
      d'abord mappé vers `MESSAGE_NEW` : faux, la file stocke l'ENVELOPPE
      `{ message }`, pas le message nu. Le typage aurait été un cran trop bas, et
      un appelant enfilant le message nu aurait compilé pour produire un rejeu
      NON ROUTABLE. Une erreur commise en écrivant un cliquet est le meilleur cas
      de test qu'il aura jamais.
- [x] **`satisfies` garde la TOTALITÉ, jamais la JUSTESSE** : 5 assertions
      d'assignabilité ancrent les correspondances dont une inversion serait
      SILENCIEUSE (les deux réactions, `new`/`edited`, l'enveloppe du lien).
- [x] **Aucun écrivain n'enfilait une charge divergente**, et aucune fixture
      n'est tombée — sur un lot qui resserre un type, c'est la mesure elle-même.
      Piège armé, pas panne : 3e fois de suite (104, 105, 106), et le dire chaque
      fois est ce qui rendra crédible le cycle où ce ne sera pas le cas.
- [x] RED prouvé sur 3 mutations : réactions croisées (2 assertions), link-message
      repointé (1 assertion), `eventType` retiré (exhaustivité `satisfies`).
- [x] Gates : `tsc` **0 erreur** · **836/836 suites, 19253/19253 témoins**.
- [ ] Suivi — la LECTURE depuis Redis reste non validée à l'exécution. Le typage
      borne ce qu'on ÉCRIT, pas ce qu'on RELIT. Un `zod.parse` par `eventType` au
      drain la transformerait en vérification, mais coûte une validation par
      entrée rejouée sur le chemin de reconnexion : décision de PERFORMANCE avant
      d'être une décision de typage, et elle demande une mesure.
- [ ] Suivi — `_seq` n'est déclaré que sur `NotificationEventData` (cycle 105).
- [ ] Suivi hérité — `ReactionUpdateEvent` / `ReactionUpdateEventData`.
- [ ] Suivi hérité — `ConversationUpdatedEventData` et son index signature.
- [x] ~~Suivi — le miroir client→serveur, reporté TROIS cycles, est désormais le
      plus gros restant.~~ **MESURÉ FAUX au cycle 107** — et c'est cette ligne-ci,
      recopiée sans mesure pour la troisième fois, qui a fait du suivi « le plus
      gros restant » alors qu'il n'existait pas.

## Cycle 106 bis — retirer la carte ouverte ne ferme rien : c'est le SPREAD qui fait taire le compilateur

Journal complet : `tasks/realtime-sync-audit-2026-08-23-cycle106-bis.md`
Homonyme : un lot « cycle 106 » (PR #3372) a atterri sur main pendant
celui-ci — instruits en parallèle depuis la MÊME liste de suivis du cycle 105,
sans chevauchement de code.

- [x] Part du suivi hérité (« `ConversationUpdatedEventData` porte une signature
      d'index ») en **l'exécutant d'abord pour le mesurer** : retrait de
      `readonly [key: string]: unknown` ⇒ **0 erreur** sur shared + passerelle.
      La prescription héritée était INERTE.
- [x] **D1 — une clé venue d'un SPREAD est invisible au contrôle des propriétés
      excédentaires** (mesuré sous `--strict`). Les QUATRE émetteurs de
      `conversation:updated` composent leur charge dans une variable avant de la
      répandre : le contrôle n'avait jamais lieu. La signature d'index ne
      supprimait qu'un contrôle que le spread supprimait déjà.
- [x] **Ce qui SURVIT au spread** : champ requis ABSENT et champ déclaré de TYPE
      FAUX, tous deux attrapés. **Le levier n'est donc pas de fermer la carte,
      c'est de DÉCLARER les champs** — deux gestes qui se ressemblent et ne font
      pas le même travail.
- [x] **D2 — le contrat déclarait 7 champs, les clients en lisent 17.** Les
      douze non déclarés (4 porteurs du groupe d'aperçu + 8 réglages métadonnées)
      voyagent depuis toujours et iOS les décode tous. Déclarés TELS QU'ILS SONT
      SERVIS (règle du cycle 94).
- [x] **D3 — `lastMessageAt` était le seul horodatage du payload dont le type
      était décidé par l'ENCODEUR** (objet `Date`, quand son jumeau `updatedAt`
      est une chaîne ISO). Aucun octet ne change sur le fil — aucun parseur
      socket.io personnalisé, `JSON.stringify(Date)` ≡ `toISOString()`. Ce que
      ça coûtait : un témoin attestait une forme que personne ne reçoit, et il
      est tombé au premier typage. Repli dans `toIsoOrNull`, une fois.
- [x] **D4 — le suivi du cycle 104 bis se trompait sur les lecteurs de
      `senderId`** : le web LE LIT (`neutralLastMessage`) et iOS LE DÉCODE. Ce
      qui sauve le cas est l'étage d'après (aucun rendu n'en dépend).
      « Personne ne le lit » ≠ « personne n'en tire de rendu ». Conclusion
      inchangée, preuve refaite.
- [x] **Cliquet = balayage, pas type** : le typage ne peut pas voir un champ
      NOUVEAU non déclaré (spread). `conversation-updated-declared-fields.ts` lit
      les champs déclarés À LA SOURCE du contrat et les confronte aux clés
      réellement émises par les TROIS émetteurs.
- [x] **ROUGE prouvé, et c'est l'argument du cycle** : sur la même mutation
      (`probeUndeclaredField`), `tsc --noEmit` rend **0 erreur** pendant que le
      balayage tombe **en nommant** le transport et le champ.
- [x] Gates : `tsc` passerelle **0** · passerelle **836/836 suites,
      19258/19258** · `packages/shared` **103/103, 2467/2467** · `apps/web`
      **1241 avant / 1241 après**, mesuré des deux côtés au `git stash`.
- [ ] Suivi — **`senderId` sous DEUX espaces d'ids** (`Participant.id` canonique,
      `User.id` sur le chemin socket). Déclaré + averti ici ; l'unifier est un
      changement de sémantique sur le chemin le plus chaud du service.
- [ ] Suivi — les autres contrats à signature d'index (`LinkMessagePayload`,
      `SocketIOMessage` à vérifier). Le balayage est écrit POUR
      `conversation:updated`.
- [x] Suivi hérité — la charge REJOUÉE est AFFIRMÉE, pas PROUVÉE
      (`QueuedMessagePayload.payload`) : **CLOS par le lot homonyme** (PR #3372).
      Même famille que celui-ci — deux cartes ouvertes, deux lots du même jour.
- [ ] Suivis hérités — `_seq` déclaré sur le seul `NotificationEventData` ;
      `ReactionUpdateEvent` / `ReactionUpdateEventData` en double ; le miroir
      client→serveur non gouverné.

## Cycle 107 — le suivi porté trois cycles était FAUX, et je l'ai mesuré

Journal complet : `tasks/realtime-sync-audit-2026-08-23-cycle107.md`

- [x] Instruit « le miroir client→serveur n'est pas gouverné », clos identique
      par les cycles 104, 105 et 106 — le dernier le disant « le plus gros
      restant ». **La première mesure l'a démenti.**
- [x] Mesure : 37 validations zod (`validateSocketEvent`) sur 8 familles, gardes
      manuscrites sur 2 autres (`_validateCoordinates`, `OBJECT_ID.test`), et un
      limiteur de débit sur CHAQUE famille. La surface entrante est gouvernée, et
      l'était déjà quand j'ai écrit pour la première fois qu'elle ne l'était pas.
- [x] **La cause : typage et VALIDATION ne sont pas la même chose.** Pour du
      SORTANT une porte de type est la seule garde (aucun sérialiseur sur une
      diffusion Socket.IO) ; pour de l'ENTRANT elle ne garde RIEN — le client
      n'est pas compilé par nous. La symétrie était LEXICALE (« le miroir »), et
      elle a suffi à transposer la conclusion sans ré-instruire la question.
- [x] **Un suivi hérité est une AFFIRMATION**, comme un compte (cycle 93) ou un
      tri (cycle 86 bis) : il se mesure avant d'être recopié. Le recopier trois
      fois ne le rend pas vrai.
- [x] **Mon propre balayage a rendu SEPT faux positifs** en cherchant un seul
      idiome — règle du cycle 84 rejouée par inadvertance. Le balayage a été
      JETÉ, pas gelé : geler un inventaire faux aurait transformé une erreur de
      mesure en vérité de dépôt, et un cliquet ment plus longtemps qu'un journal.
- [x] Aucun changement de production — lot de MESURE et de correction du dossier.
- [ ] Suivi, à sa taille : 2 familles sur 12 valident à la main. Écart de
      CONSISTANCE, pas de couverture. La question utile n'est pas « sont-elles
      gardées ? » mais « la douzième le sera-t-elle ? ».
- [x] **Limite de mon cycle 106, trouvée par le cycle 106 bis parallèle** : une
      clé venue d'un SPREAD échappe au contrôle des propriétés excédentaires. La
      file vérifie donc les champs REQUIS et leur TYPE (l'assignabilité traverse
      le spread), mais PAS les clés en trop d'une charge composée en variable.
      Le journal du cycle 106 surestimait d'un cran ; corrigé dans celui du 107.

## Cycle 107 bis — ce que le CAST ouvrait dans les DEUX sens

Journal complet : `tasks/realtime-sync-audit-2026-08-23-cycle107-bis.md`
Écrit en parallèle du cycle 107 ci-dessus, sur le MÊME suivi, par une autre session.

- [x] **Le cycle 107 a raison sur la prémisse, et je souscris** : une porte
      d'écoute typée ne garde RIEN à l'exécution, la surface entrante est déjà
      gouvernée par zod, et « le miroir » était une symétrie LEXICALE. Ce lot-ci
      l'avait mesuré de son côté sans en tirer la formulation — son tableau de
      portée montre une porte qui refuse un nom d'événement non déclaré et laisse
      passer une charge divergente (bivariance, `strictFunctionTypes: false`).
- [x] **Mais le cast n'effaçait pas la moitié entrante : il effaçait les DEUX.**
      `this.io as SocketIOServer` (SIX sites) prive `CallEventsHandler` du contrat
      pour ce qu'il écoute ET pour ce qu'il émet — donc précisément la moitié dont
      le cycle 107 établit lui-même qu'aucune autre garde ne la couvre. D'où le
      seul point de divergence entre les deux lots : « aucun changement de
      production » d'un côté, six défauts réels de l'autre.
- [x] **Une piste peut être fausse sur son MOTIF et juste sur son ADRESSE.**
      Mesurer la prémisse fait abandonner la piste ; mesurer le SITE la résout. La
      conclusion complète n'est pas « le suivi est faux, on passe » mais « le
      suivi est faux, ET voilà ce qu'il y a effectivement là ».
- [x] **4 divergences SORTANTES tombées à la première compilation** sous la porte.
      Dont `iceServers` sur `call:initiated` : les identifiants TURN calculés par
      destinataire, que le SDK iOS décode pour traverser un NAT dès la SONNERIE,
      émis par les deux producteurs et déclarés par aucun contrat (famille `_seq` /
      `location`). Et `CallEndedEvent.endedBy`, promis par le contrat alors que
      l'émetteur l'élargit délibérément.
- [x] **`call:analytics` : validé par zod (donc GARDÉ) et pourtant absent du
      contrat**, 19 champs transcrits dans la signature du listener, trois clients
      émetteurs avec chacun sa transcription. Garde d'exécution et dérive de
      contrat sont deux propriétés DISJOINTES — il en faut une garde chacune.
- [x] `socketSignalSchema` en union DISCRIMINÉE : un `.refine` ne restreint pas
      `z.infer`. Mêmes contraintes d'exécution (78 témoins inchangés), et zod
      retire désormais les champs de l'autre membre — ce dont le relais dépend
      déjà pour sa sécurité.
- [x] Balayage-cliquet au périmètre VOLONTAIREMENT étroit (écouter **et** importer
      le type nu), en réponse directe aux sept faux positifs du cycle 107 :
      inventaire vide, aucune liste d'exemptions.
- [x] RED prouvé sur 5 mutations ; les 6 casts retirés. `tsc` 0 ; suite passerelle
      837/837 (2 workers SIGKILL par OOM concurrent, repassés isolément 39/39) ;
      cliquet de dette web resserré 1241 → 1239.
- [x] **Un gate rend DEUX verdicts et ils peuvent se contredire** : deux fois dans
      ce cycle un seul des deux a été lu (un build échoué vers `/dev/null` ; un
      `| tail` qui rend le code de sortie de `tail`). Ne jamais interroger le code
      de sortie d'un gate à travers un pipe.
- [ ] Suivi — **la bivariance est la limite du lot, et elle est générale.** Aucune
      porte typée n'attrapera une charge divergente tant que `strictFunctionTypes`
      vaut `false`. Décision à instruire, elle dépasse Socket.IO.
- [ ] Suivi — **le même cast, côté WEB** : `apps/web` déclare un `TypedSocket` et
      l'ouvre trois fois par `(socket as unknown).emit(…)` dans
      `VideoCallInterface.tsx`. Le défaut de ce lot, reproduit côté client.
- [ ] Suivi — trois services prennent encore un `Server` NU pour ÉMETTRE ; ni le
      balayage de réception (par construction) ni celui d'émission ne les couvre.

## Cycle 108 bis — la panne n'était dans aucun environnement : elle était dans l'horloge

Journal complet : `tasks/realtime-sync-audit-2026-08-23-cycle108-bis.md`
Écrit en parallèle du cycle 108 (PR #3385) par une autre session, sur le MÊME
symptôme et avec une conclusion opposée.

- [x] **Ce lot n'a pas commencé par un suivi : `main` était ROUGE.** Le job
      *Test gateway* échouait sur `MessageHandlerEditDelete.test.ts`, 2 témoins,
      835 autres suites vertes. Reproduit localement, déterministe.
- [x] **Une bombe à retardement de 24 heures.** Les deux témoins fabriquaient
      leur message avec `createdAt: new Date('2026-08-22T10:00:00Z')`, et
      `admitMessageEdit` refuse l'auteur au-delà de `MESSAGE_EDIT_WINDOW_MS`
      (24 h) comptées depuis `Date.now()`. La CI a tourné le 08-23 à 10:15Z —
      **24 h 15 min** plus tard. Écrits verts au cycle 101, rouges par la seule
      horloge : aucun commit n'est coupable.
- [x] **Le littéral n'était pas la faute mais sa conséquence.**
      `makeMessageRecord` ne portait ni `createdAt` ni `messageType` ; or
      `NaN > w` est faux, donc un `createdAt` absent **ADMET**. Presque tous les
      témoins franchissaient la fenêtre par ABSENCE de date — la porte était
      traversée sans être exercée. Le seul témoin vérifiant les sept champs
      requis devait donc s'écrire une date, et l'a écrite en absolu.
- [x] **Correctif structurel** : la fabrique porte un message FRAIS et complet ;
      les deux surcharges disparaissent ; les cinq témoins de fenêtre gardent
      leurs offsets RELATIFS, idiome déjà employé partout ailleurs dans le
      fichier. Repousser le littéral d'un jour aurait réarmé la bombe.
- [x] **Le message d'échec accusait la mauvaise étape.** `Received array: []`
      désignait la DIFFUSION alors que la panne était dans l'ADMISSION. Vérifié
      plutôt que supposé : `buildMessageEditedCore` replie les deux champs
      (`|| new Date()`, `|| 'text'`) — la charge utile était INTACTE. Une
      première rédaction du commentaire l'avait affirmé faux ; c'est le code du
      constructeur qui a tranché.
- [x] **ROUGE prouvé sur 2 mutations**, une par garde, chacune faisant tomber
      exactement son témoin et aucun autre.
- [x] **Le désaccord avec la PR #3385, et sa résolution.** Cette session-là a vu
      les deux mêmes témoins rouges et a conclu « ce n'est pas une régression de
      `main` : ils échouent à l'identique au commit `f69cbd26`, dont le job Test
      gateway est vert ». Raisonnement correct, prémisse tacite fausse : **un
      vert de CI est une propriété du commit ET de l'INSTANT du run.** Pour une
      panne datée les deux se séparent — la CI de `f69cbd26` avait tourné AVANT
      l'expiration. Le run de `main` à HEAD (10:15Z) est rouge sur exactement ces
      deux témoins. Un défaut attribué à l'outil de mesure cesse d'être cherché
      dans le produit.
- [x] **Le +3 du cliquet de dette : trouvé, mesuré, et LAISSÉ à #3385.** Cause
      identifiée (`shared-law-dist-parity.test.ts` importe `packages/shared/dist`
      en chemin relatif ⇒ 1242 sans build, 1239 avec), mais #3385 la corrige
      mieux — en résolvant la déclaration `.d.ts` consultée par TypeScript, ce
      qui détecte aussi un build partiel, là où ma version ne testait qu'un
      répertoire. Correctif retiré de ce lot : deux PR sur le même bloc d'en-tête
      = conflit certain pour zéro gain.
- [x] Leçons 252 et 253.
- [ ] Suivi — **dépendance** : si #3385 ne fusionne pas, le défaut du cliquet
      reste ouvert.
- [ ] Suivi — recomptage du cast web : le cycle 107 bis annonçait **trois**
      sites, j'en compte **cinq** dans `VideoCallInterface.tsx` (229, 488, 522,
      549, 638) et #3385 en recense **13** sur 4 fichiers. Le motif
      `(x as unknown).m` est un `TS2571` franc — **108** occurrences dans la
      dette web, cicatrice d'un codemod `any` → `unknown` rendue invisible par
      `ignoreBuildErrors: true`. Les fermer FAIT DESCENDRE le cliquet.
- [ ] Suivi hérité — bivariance / `strictFunctionTypes`.
- [ ] Suivi hérité — trois services prenant un `Server` NU pour émettre.
## Cycle 108 — le garde disait « RÉGRESSION » sur un arbre intact

Journal complet : `tasks/realtime-sync-audit-2026-08-23-cycle108.md`

- [x] **Le cliquet de dette de types rendait un verdict FAUX, en rouge, sur un
      arbre que personne n'avait touché.** Sur un clone frais aux commandes que
      le `CLAUDE.md` prescrit (`bun install --ignore-scripts`), il annonçait
      « RÉGRESSION : 1242 erreurs, baseline 1239 (+3) » — alors que `main` était
      vert, la CI l'ayant prouvé au même arbre. Les dix fichiers qu'il désignait
      comme « les plus touchés » n'avaient aucun rapport avec les trois erreurs.
- [x] **Le tiers exact, mesuré** : `packages/shared/dist` absent → 1242 ;
      présent → 1239. Le delta est constitué des trois seuls TS2307 de
      `__tests__/lentille/shared-law-dist-parity.test.ts`, qui importe
      `packages/shared/dist/utils/*.js` par chemin RELATIF.
- [x] **Un invariant documenté peut être exact sur le mécanisme qu'il inspecte
      et faux sur le système.** L'en-tête jurait que le build de `shared` ne
      change rien, « puisque les `paths` résolvent vers la SOURCE ». Vrai du
      spécificateur — et c'est exactement pourquoi le fichier de parité le
      contourne par chemin relatif, comme son propre en-tête l'explique. La
      dérive passait par la porte que le raisonnement déclarait infranchissable.
- [x] Octave suivante de la leçon du cycle 107 bis : là, la sortie du gate était
      silencée ; ici elle est lue, le code de sortie honnête, le compteur
      self-testé — et le verdict faux quand même, parce que la PRÉCONDITION de
      la mesure n'était ni vérifiée ni vérifiable.
- [x] `unresolved_dist_imports()` : le garde REFUSE DE MESURER tant que les
      artefacts manquent, et nomme les modules non résolus + la commande qui y
      remédie. Ni les chemins ni le fichier ne sont codés en dur — un import
      ajouté demain est couvert sans retouche. C'est la déclaration `.d.ts` qui
      est consultée, pas le `.js` : un build partiel reste détecté.
- [x] 3 cas de self-test neufs ; **RED prouvé sur 4 mutations**, chacune tombant
      sur le cas écrit pour elle, + RED sur l'arbre réel (`dist/` mis de côté).
      Gates : self-test 6/6, cliquet ✓ 1239 inchangé, `bash -n` propre.
- [x] **Recensement corrigé du suivi web** : le cycle 107 bis annonçait « trois
      casts d'émission » ; il y en a **13**, dans 4 fichiers (`CallManager.tsx`
      6, `VideoCallInterface.tsx` 5, `use-video-call.ts` 1,
      `messaging.service.ts` 1).
- [ ] Suivi — les 13 casts sont eux-mêmes des ERREURS de type (TS2571) comptées
      dans les 1239 et tolérées par le cliquet. Les fermer fait DESCENDRE la
      dette.
- [x] **Lot 2 du même cycle — les quatre acks que le contrat exigeait et que
      personne n'envoie.** `ClientToServerEvents` déclarait 4 acks REQUIS contre
      18 optionnels, et les quatre étaient les événements d'appel
      (INITIATE/JOIN/SIGNAL/END). Les deux moitiés du fil les contredisent : la
      passerelle déclare `ack?` sur les quatre et les appelle en `ack?.(…)` ;
      cinq émetteurs sur sept n'en envoient aucun (3 web, 2 iOS). Le MÊME
      fichier iOS émet `call:end` avec ET sans ack — l'optionalité est une
      CONCEPTION, pas un oubli.
- [x] **Le prix du mensonge se lisait dans le code appelant.** Les 4 émissions
      `call:signal` du web sont typées (pas de cast) : le compilateur exigeait
      le second argument, elles fabriquent donc un `() => {}` VIDE
      (`use-webrtc-p2p.ts` 290/329/674/761). Le serveur acquitte bien
      (`ack?.({success:true})`), donc chaque candidat ICE paie un paquet d'ACK
      pour une fonction qui ne fait rien. Là où la cérémonie n'a pas été écrite,
      c'est un cast qui soustrait le site. **Un contrat que tout site d'appel
      doit contourner pour dire la vérité ne gouverne plus rien.**
- [x] Les quatre passent à `ack?`, motif écrit au-dessus avec les numéros de
      ligne des handlers ET des émetteurs. Cliquet de type
      `_CallAcksAreOptional` + témoin NÉGATIF ; RED prouvé sur 2 mutations.
      Gates : tsc shared 0, tsc passerelle 0, suites d'appel passerelle 36/36
      (608), shared 2467, suites d'appel web 46/46 (598), cliquet web ✓ 1239.
- [ ] Suivi — les 4 `() => {}` de `use-webrtc-p2p.ts` sont retirables ; les
      retirer supprime un aller-retour d'ACK par candidat ICE. Changement de
      COMPORTEMENT sur la signalisation d'appel : mérite sa propre mesure.
- [ ] Suivi neuf — **`CallJoinAck` transcrit en ligne DEUX fois dans le même
      fichier** (`CallManager.tsx:810` et `:1005`), divergentes, et toutes deux
      rendant `success` optionnel là où le contrat le déclare requis.

### Lot 3 du cycle 108 — le témoin qui a viré au rouge tout seul, à 10:00:00Z

- [x] **`main` était ROUGE, et personne ne pouvait le savoir.** `Test gateway`
      échouait sur `main` @ `e87b7b0d` (2 failed / 19214 passed / 836 suites) —
      chiffres IDENTIQUES à ceux de la PR de ce cycle, donc la PR n'y ajoutait
      rien. Entre `f69cbd26` (dernier vert PROUVÉ) et `e87b7b0d`, **tous les runs
      de `main` ont été ANNULÉS par concurrence** : « main est-il vert ? » n'était
      pas une question à laquelle le dépôt pouvait répondre.
- [x] **La cause n'est aucun commit : c'est l'HORLOGE.** Les 2 témoins portaient
      `createdAt: new Date('2026-08-22T10:00:00Z')`, et `admitMessageEdit` refuse
      l'auteur au-delà de `MESSAGE_EDIT_WINDOW_MS` (24 h). Verts exactement 24
      heures, rouges ensuite pour toujours, sur TOUTE branche. Bascule prouvée à
      la minute : run 09:12 vert, run 10:15 rouge.
- [x] **Un témoin dont le verdict dépend de l'horloge murale n'est pas un témoin,
      il est une bombe à retardement.** Il ne tombe pas quand la production casse,
      il tombe quand l'heure tourne — indiscernable d'une régression de la base.
- [x] Corrigé par `withinEditWindow()` (`Date.now() - 60_000`), commenté avec
      l'horaire de bascule et les deux runs qui l'encadrent. **66/66** (contre
      64/66).
- [x] **La signature d'une bombe n'est pas « une date en dur »** mais « une date
      en dur ENCORE dans une fenêtre » — seule celle-là a un instant de bascule
      devant elle. Les dates de 2025/2026-01 du sous-arbre sont inertes (déjà
      expirées, ou hors de toute règle de fenêtre).
- [x] **Deux rouges lus de travers dans le même cycle, même remède.** Le `+3` du
      lot 1 (cru régression, en fait défaut du garde) et ces 2 témoins (crus
      environnementaux, en fait bombes). Rejouer un arbre historique **ne rejoue
      pas son environnement** : l'heure fait partie de l'entrée, et une
      bissection qui change l'arbre en gardant l'horloge ne peut pas distinguer
      « le code a changé » de « le temps a passé ». Ce qui tranche : remonter au
      dernier verdict que la CI a PROUVÉ, et comparer des runs CI entre eux.
- [ ] Suivi — aucun garde n'empêche la prochaine bombe. Un balayage « date en dur
      passée à une règle de fenêtre » est possible mais demande de relier un
      littéral à la règle qui le consomme : à instruire, pas à improviser.
## Cycle 108 — le contrat citait un test qui prouvait l'inverse

Journal complet : `tasks/realtime-sync-audit-2026-08-23-cycle108.md` · PR #3381

- [x] Instruit le suivi hérité « `_seq` déclaré sur le seul
      `NotificationEventData` » en posant la seule question dont dépend la
      validité du dispositif : **qui lit ce champ ?**
- [x] Le contrat partagé affirmait « **les trois clients le lisent** » en citant
      `MessageSocketManagerNotificationTest` pour Android. Mesuré : Android le
      **jetait** (`Json.ignoreUnknownKeys`, dit par son propre commentaire), et
      `grep "SyncSeq\|detectGap\|lastSeq" apps/android` rendait **zéro fichier**.
- [x] **Le test cité prouvait l'INVERSE** : `"_seq":42` en fixture, assertions sur
      `id`/`type`/`state.isRead` seulement — il prouve que le décodage SURVIT au
      champ, jamais qu'il le lit.
- [x] `emitWithSeq.ts` disait la vérité pendant ce temps (« les DEUX clients »).
      **Deux documents, un champ, deux comptes.** Celui qui comptait trois était
      le contrat — celui qu'on lit en premier.
- [x] **Leçon : une CITATION n'est pas une MESURE.** Le cycle 107 avait établi
      qu'un suivi hérité se mesure avant d'être recopié ; voici la variante plus
      coûteuse — l'affirmation accompagnée d'une preuve qui n'en est pas une.
      Elle résiste plus longtemps parce qu'elle a déjà l'air d'avoir été mesurée.
      Citer un test comme preuve d'une LECTURE exige de vérifier qu'il l'ASSERTE.
- [x] Conséquence réelle : Android n'avait **aucune détection de trou exacte**, et
      la règle LOCKSTEP aurait fait juger sûre l'extension de l'estampillage à
      une 2ᵉ famille — le 3ᵉ client aurait vu un faux trou à CHAQUE event.
- [x] Fermé le trou, pas la phrase : 3ᵉ miroir Kotlin de la règle pure
      (`SyncSeqState.kt`), lecture de `_seq` sur la charge BRUTE avant décodage,
      trou ⇒ `refresh()` idempotent app-side, `reset()` au logout.
- [ ] **Gate distant** : le toolchain Android n'est pas exécutable dans le
      conteneur (`dl.google.com` refusé). Le workflow `android.yml` EST le gate —
      noté plutôt que de laisser croire à une vérification locale.
- [ ] Suivi — l'estampillage reste limité à `notification:new` ; l'étendre oblige
      à étendre l'observation sur les TROIS clients dans le même train.
- [ ] Suivi — Android consomme le trou à la portée de l'écran (là où iOS le câble
      au boot). Limitation DÉJÀ existante de son temps réel, pas une nouvelle.

### Cycle 108 bis — `main` était rouge pour tout le monde, et ce n'était pas ce lot

- [x] Le merge de `main` a rendu « Test gateway » rouge sur 2 cas de
      `MessageHandlerEditDelete.test.ts`. **Mesuré sur une copie VIERGE
      d'`origin/main` : les deux mêmes cas y tombent**, sans une ligne de la
      branche (dont l'écart avec `main` hors `apps/android` est exclusivement
      fait de commentaires — vérifié mécaniquement).
- [x] Cause : `createdAt` épinglé à `2026-08-22T10:00:00Z` sous une garde
      `admitMessageEdit` de **24 h**. Vert vingt-quatre heures, rouge le
      2026-08-23 à 10:00 UTC, pour toutes les branches et définitivement.
- [x] Le symptôme désignait le mauvais coupable : `emitsTo(...)` rendait `[]`,
      qui se lit « le producteur n'émet plus ». Le producteur va bien — le
      `callback` portait la vraie cause, jamais assertée
      (`24-hour limit exceeded`).
- [x] Le cas VOISIN restait vert parce que sa fixture n'a pas de `createdAt` :
      les cas qui tombaient étaient ceux qui en AJOUTAIENT un. C'est ce
      contraste qui a désigné la fenêtre.
- [x] Corrigé en rendant l'instant RELATIF — ces cas portent sur la FORME de la
      charge et l'identité de `senderId`, jamais sur l'âge du message.
- [x] Gates : `MessageHandlerEditDelete` **66/66** · passerelle complète
      **836/836 suites, 19216/19216**, en local sous bun.
- [x] Leçon consignée dans `tasks/lessons.md`.
## Cycle 108 — le garde avait raison, et il gardait plus qu'un chiffre

Journal complet : `tasks/realtime-sync-audit-2026-08-23-cycle108.md`

- [x] **`main` était ROUGE**, et pas d'un lint : le job `Quality (bun)` garde
      tous les autres, donc Build et TOUTES les suites étaient `skipped`. Un
      job-portier qui tombe ne dit pas « une vérification a échoué » mais « les
      vérifications n'ont pas eu lieu » — bien plus grave que la couleur.
- [x] **Le +1 du cliquet était le défaut PRODUIT**, pas une coquille. Le commit
      précédent câblait `targetType` sur quatre sites et laissait le fil derrière
      en écrivant « rien d'observable ne change ici » : l'inverse exact, puisque
      le fil sert REEL et qu'un réel repartagé y devenait un POST. Relever la
      baseline d'un cran l'aurait enterré.
- [x] **Un garde qui attrape une occurrence n'a pas attrapé la famille.** Le
      geste SEC était signalé (il LISAIT `.type` absent) ; la CITATION, elle,
      OMETTAIT le champ — licite, donc silencieuse. Seule la relecture des deux
      gestes côte à côte l'a montrée.
- [x] **Le cliquet dérivait de 3 avec l'état du BUILD.** Son en-tête déclarait la
      dérive absente parce que `paths` résout vers la source — vrai de l'ALIAS,
      faux du PAQUET : un test de parité importe `packages/shared/dist` par
      chemin RELATIF. 1243 sans build, 1240 avec. État ÉPINGLÉ (refus de mesurer)
      plutôt qu'erreurs exclues, pour ne pas rendre ce fichier libre de dette.
- [x] **Seize casts de socket côté web, DEUX formes.** Forme A
      (`(socket as unknown).emit`) : pas une échappatoire mais une ERREUR de
      compilation, 30 points de dette. Forme B
      (`as unknown as { emit: (e: string, d: unknown) }`) : elle COMPILE et
      fabrique un faux contrat permissif — aucun compteur ne la voit.
- [x] **`call:end` : même symptôme qu'au 107 bis, résolution INVERSE.** L'ack y
      avait été RETIRÉ (personne ne l'envoyait) ; ici la passerelle l'invoque et
      iOS s'en sert par `emitWithAck`, donc il devient OPTIONNEL. Le réflexe
      « retirer, comme la dernière fois » aurait cassé iOS.
- [x] **Six casts de `messaging.service.ts` recopiaient le contrat à côté du
      contrat** — partis sans une seule erreur, le contrat déclarait déjà tout.
- [x] Gates : `tsc` passerelle/shared/agent 0 ; cliquet 1240 → **1209** sans
      aucun fichier en hausse ; web 39/39+11/11+54/54+1/1 ; passerelle 2/2 (302).
- [ ] Suivi — **la forme B est hors de portée du cliquet** : elle peut revenir
      sans que rien ne rougisse. Un balayage textuel est la réponse, non écrit
      ici pour ne pas ajouter un garde non éprouvé en fin de cycle.
- [ ] Suivi — **`messageData` naît `Record<string, unknown>` et mute** : racine
      du dernier cast, et mise en conformité avec la règle d'immuabilité. Touche
      le chemin E2EE.
- [ ] Suivi — **79 autres `(x as unknown).membre` dans `apps/web`**, hors socket.
      ~1/3 de la dette web, mais chacun demande une décision de domaine.

## Cycle 108 ter — le `Server` NU, la porte qu'aucun balayage ne pouvait voir

Journal complet : `tasks/realtime-sync-audit-2026-08-23-cycle108-ter.md`
Écrit en PARALLÈLE des cycles 108 et 108 bis, sur le MÊME suivi, par une TROISIÈME session.
Suite directe des DEUX suivis du cycle 107 bis, tous deux instruits et réels.

- [x] **Les deux suivis étaient bas sur le COMPTE.** Cinq casts côté web (pas
      trois), et cinq porteurs du `Server` nu côté passerelle (pas trois) — les
      trois services nommés, plus `AgentAdminRelay`, plus le helper PARTAGÉ
      `emitWithSeq` qui prenait le `Server` nu pour tous ses appelants. Un suivi
      hérité est une affirmation (cycle 107) ; son compte en est une aussi
      (cycle 93). Les deux se remesurent.
- [x] **`Server` nu = absence TOTALE de contrat, mesuré.** Sans paramètres de
      type il retombe sur `DefaultEventsMap` — `emit(ev: string, ...args: any[])`.
      Un nom d'événement INVENTÉ (`"totally:invented-event"`) et une charge de
      forme FAUSSE compilent tous deux à **zéro erreur**. ~16 émissions temps
      réel traversaient ces portes : les 4 familles de demande d'ami,
      `user:updated`, les compteurs/suppressions de notification, `call:ended`
      vers l'audience de terminaison complète, les 2 traductions de story.
- [x] **Ni l'un ni l'autre des deux cliquets existants ne pouvait le voir** : le
      cliquet de TYPE garde `serverEmit.ts`, que ces services n'importaient pas ;
      le balayage cherche une signature `emit` RÉÉCRITE, et ici **rien n'est
      réécrit**. Troisième instance de « chercher une forme fautive par sa
      DÉCLARATION, c'est manquer tous les sites qui l'obtiennent autrement »
      (cycle 105) — et la plus discrète des trois : ni déclaration ni assertion,
      seulement un import qui a l'air normal.
- [x] Porte élargie à la MESURE des porteurs : `to(string | string[])` (audience
      de terminaison complète en une émission, élargissement CONTRAVARIANT donc
      sans effet sur les sites existants) et `ServerEmitIOWithRooms` avec
      `in().fetchSockets()`. `ServerRoomSocket` réduit à `leave` — tout ce qu'on
      en lit ; `NotificationService` n'en lit que la LONGUEUR.
- [x] **`tsc` 0 erreur à la fermeture — les ~16 charges étaient déjà justes.**
      C'est le résultat honnête, et il ne rend pas le lot vide : ce qui était vrai
      par ACCIDENT est désormais vrai par CONSTRUCTION. Le 107 bis a trouvé 4
      divergences en fermant sa porte, celui-ci aucune — même geste, deux issues,
      et annoncer une divergence non mesurée coûte la confiance (cycle 103).
- [x] **RED prouvé deux fois** : la même mutation rend 0 erreur avant / 2 après ;
      et `AgentAdminRelay` rendu à son `Server` nu fait tomber le balayage en le
      NOMMANT. Gardes disjointes — porte RELÂCHÉE vs porte CONTOURNÉE.
- [x] `sweepRawServerEmitters` — inventaire VIDE, **aucune liste d'exemptions**.
      Discriminant étroit par DÉCISION (`import type` + `.emit(`), en réponse
      directe aux 7 faux positifs du cycle 107 : `MeeshySocketIOManager` importe
      `Server` en VALEUR parce qu'il le CONSTRUIT, et un détenteur qui n'émet pas
      sort par construction, pas par exemption.
- [x] **La fixture a pris le cliquet en défaut** : `rawServerAliases` écrit avec
      un `exec` simple ne rendait que le PREMIER import du fichier. Une erreur
      commise en écrivant un cliquet est le meilleur cas de test qu'il aura
      jamais (cycle 104) — la fixture porte les deux formes pour cette raison.
- [x] **Miroir web : le cycle 107 bis avait déjà rendu les 5 casts INUTILES sans
      le savoir.** Ils existaient pour taire une divergence réelle
      (`CallMediaToggleClientEvent` exigeait `mediaType`/`participantId`/ack, le
      web n'envoie que `{callId, enabled}`) ; le 107 bis a corrigé le contrat
      contre les émetteurs réels le jour même. Variante douce de la règle du
      cycle 105 : **un lot peut rendre un contournement inutile sans le faire
      disparaître** — il reste alors, soustrayant son site à toute vérification
      pour une raison qui n'existe plus.
- [x] Dette web **1239 → 1234**, cinq points, **un par cast** — la mesure exacte
      de ce qu'un `as unknown` coûtait.
- [ ] Suivi — **la bivariance** (hérité 107 bis) : `strictFunctionTypes: false`
      ⇒ aucune porte typée n'attrape une charge divergente assignable dans un
      seul sens. Décision à instruire, elle dépasse Socket.IO.
- [ ] Suivi — **neuf** : les 6 `as unknown` restants de `VideoCallInterface.tsx`
      (`window.__preauthorizedMediaStream`, `constraints.facingMode`, `event`).
      Hors contrat Socket.IO ; le premier nomme un canal window-global entre deux
      composants, qui mérite un type.
- [ ] Suivi — **neuf** : l'en-tête de `check-type-debt.sh` affirme que l'absence
      du client Prisma « ne change rien » pour web. Mesuré : **1242 sans, 1239
      avec**. Fausse de trois points, sans conséquence (la CI génère toujours),
      mais jamais confrontée — famille du cycle 94.

## Train d'intégration beta du 2026-08-23 — 9 PR alignées, `main` déverrouillé

Contexte : un merge forcé avait laissé `main` rouge et désynchronisé les 7 PR
ouvertes (6 sur 7 en conflit). Deux PR se sont ajoutées en cours de route.

### Ce que le rouge était vraiment

- [x] **`main` rouge — cause unique bloquante** : `PostsFeedScreen.tsx` lisait
      `repostingPost.type` sur un état qui ne portait pas ce champ. `targetType`
      partait donc à `undefined` à CHAQUE repost, le gateway retombait sur son
      défaut `?? POST`, et un REEL republié depuis le fil quittait le fil des
      reels — **le défaut même que le lot annonçait corriger**. Le compilateur
      était seul à le voir, noyé dans une dette de 1239 erreurs où le cliquet ne
      montre qu'un total : le `+1` faisait rougir sans nommer la cause.
- [x] **Le step `Lint` est `continue-on-error: true`** — le « eslint: not found »
      de `@meeshy/shared` était donc du BRUIT, jamais la cause. Diagnostiquer
      dessus aurait coûté une demi-journée pour rien.

### Trois gardes qui ne gardaient rien

- [x] `CommentDraftStoreTests.swift` et `CompactCountConsolidationSourceGuardTests.swift`
      vivaient hors du `pbxproj` : **vertes en ne s'exécutant jamais**.
- [x] Le cliquet de dette appelait `unresolved_dist_imports`, fonction que la
      fusion de deux lots concurrents avait emportée en gardant la DÉFINITION de
      l'autre. Il mourait AVANT de compter, donc rendait non-zéro **en nommant
      une régression de dette qui n'existait pas** — le faux verdict exact que
      le cycle 108 avait fermé.
- [x] Les scripts `lint` de `shared`, `gateway` et `agent` déclaraient
      `eslint src/` sans eslint, sans config, et pour `shared` **sans `src/`**.

### Une fuite de confidentialité laissée ouverte par contrat

- [x] Le témoin adversaire `messages-list-forward-source-attachment-url-leak`
      était ROUGE en permanence sur `main`, le commit qui le pose annonçant
      lui-même « FUITE ENCORE OUVERTE ». Un transfert réutilise le chemin de
      stockage de l'original, qui porte le `User.id` de son auteur : la réponse
      qui refusait de NOMMER la source livrait son identifiant par `fileUrl`.
      Fermée par ADRESSAGE (`/attachments/:id`) sur les **quatre** émissions —
      un canal fermé et l'autre ouvert ne ferme rien.
      **Un RED intentionnel qui survit au lot qui le pose cesse d'être un
      marqueur : on apprend à lire le rouge comme normal.**

### Lots produit livrés dans le même train

- [x] **Le corps d'un post s'affichait en DOUBLE** : `PostDetail` montait
      `TranslationToggle` en variante `block` avec `showContent={false}`, drapeau
      que cette variante IGNORAIT. Rangée de drapeaux (une par langue servie,
      sans plafond) sous le corps, rendu une seule fois.
- [x] **Un transfert peut porter un mot** — envoyé APRÈS le transfert, et
      seulement s'il a abouti.
- [x] **Publier une pièce jointe reçue** (`POST /posts/from-attachment`) sans la
      retélécharger. Le fichier est **dupliqué, jamais partagé** :
      `reclaimMediaRowBytes` n'interroge que la table `Sound` avant d'effacer des
      octets, donc un `PostMedia` pointant sur le fichier d'un
      `MessageAttachment` aurait fait de la suppression d'un post une
      suppression DANS la conversation.
- [x] **Publier une capture se confirme** — la provenance ne peut pas être
      décidée par le serveur : rien dans un fichier ne distingue une photo prise
      à l'instant d'une photo importée.

### Reste ouvert

- [ ] **iOS n'a pas la publication depuis le partage** : la règle est dans
      `packages/shared/utils/forward-to-publication.ts`, prête pour les trois
      clients, mais seule la feuille web l'appelle.
- [ ] **8 rouges iOS ANTÉRIEURS** (gardes du chantier Lentille) : pilule de
      section non montée, `LentilleBridgeLine` dimensionnant son point par un
      littéral, L06/L09 du rang plat, littéral « 900 » dans
      `ConversationListView`, `call:join` non ré-émis à la reconnexion. Vérifiés
      présents sur `main` avant ce train, qui en portait 13.

## Cycle 114 bis (2026-08-23) — la garde de publication n'a jamais eu de quoi se déclencher

Le cycle précédent laissait deux choses : un lot livré (« publier une capture se
confirme ») et un point ouvert (« iOS n'a pas la publication depuis le
partage »). Instruire le second a fait tomber le premier.

### `capturedInApp` n'existait que dans la règle qui le lit

- [x] Le champ n'apparaissait **nulle part ailleurs** que dans
      `forward-to-publication.ts` : pas de colonne Prisma, pas de champ de
      contrat, aucun chemin d'écriture. Le web le lisait par un CAST —
      `(message as { attachments?: Array<{ …; capturedInApp?: boolean }> })` —
      donc toujours `undefined`, donc `publicationNeedsCaptureConfirmation`
      toujours `false`. **La confirmation était décorative.**
- [x] Les témoins étaient verts parce qu'ils posaient `capturedInApp: true` À LA
      MAIN dans leurs fixtures : ils attestaient une valeur que la production ne
      peut pas produire. Même famille que le `MagicMock` nu (cycle 90) — le
      double accepte ce que le monde n'envoie jamais.
- [x] Le schéma Zod de la passerelle l'ÉNONÇAIT : « `capturedInApp` est DÉCLARÉ
      par le client, et il est le seul à pouvoir le faire ». Vrai sur le
      principe, faux en fait — aucun client n'avait de quoi le déclarer.
- [x] Cause racine : **la provenance n'est connaissable qu'À LA CAPTURE**, et
      rien ne la retenait. Le web tentait de la relire sur un attachement
      redescendu du serveur, où l'information était perdue depuis longtemps.

### Ce qui la fait voyager

- [x] `MessageAttachment.capturedInApp` (Prisma, défaut `false`).
- [x] Les DEUX chemins d'écriture d'`UploadProcessor` (clair et chiffré) la
      persistent, lue **strictement** (`=== true`) : `providedMetadata` vient
      d'un corps multipart non typé où la chaîne `'false'` est véridique, et une
      garde de confidentialité qu'une coercition ouvre ne garde rien.
- [x] `attachmentMediaSelect` (28 → **29** champs) — c'est la LISTE de messages
      que la feuille lit, pas une requête de détail.
- [x] `messageAttachmentSchema`, sans quoi fast-json-stringify la retire du fil.
- [x] `Attachment.capturedInApp` **REQUIS** : le compilateur a désigné les cinq
      fixtures web et — le défaut le plus discret — `transformers.service.ts`,
      seul chemin entre la réponse et l'objet que la feuille lit. Un champ qu'un
      mapping ne recopie pas est **indistinguable d'un champ que le serveur
      n'envoie pas**.

### iOS : le troisième client rejoint la règle

- [x] `PublicationTargetRule` (SDK) — jumelle Swift de la règle partagée, dérivée
      d'`AttachmentKind` (source de vérité MIME déjà présente), jamais de
      l'extension du nom. Un témoin gèle les valeurs brutes contre l'énumération
      Zod : un cas mal orthographié sortirait en 400 sans qu'un témoin tombe.
- [x] La section « Publier » dans `ForwardPickerSheet`, avec la confirmation de
      capture — qui a maintenant de quoi se déclencher.
- [x] `capturedInApp` porté sur les TROIS étages iOS et les DEUX mappings qui
      les relient (message + écriture GRDB) : ne pas réintroduire, trois lignes
      plus loin, le défaut que ce train répare.
- [x] HIG : cibles à 44 pt posées par `minHeight` (et non par du padding
      vertical, qui grossit avec le corps sous Dynamic Type) ; la rangée de
      pilules DÉFILE plutôt que de se laisser comprimer aux tailles accessibles.

### Vérifié / non vérifié — la distinction est la mesure

- [x] shared 2550/2550 · gateway `tsc` 0 erreur · shared `tsc` 0 erreur ·
      apps/web **1196 = baseline** du cliquet (une régression posée puis rendue :
      le transformateur était le +1).
- [x] RED prouvé sur les trois gardes neuves — dont le témoin du transformateur,
      qui tombe quand on retire la ligne qu'il garde.
- [ ] **Swift non compilé** : aucune chaîne d'outils sur cette machine. Le
      verdict vient de `sdk-tests.yml` / `ios.yml`, pas d'ici — et c'est écrit
      dans le message de commit plutôt que passé sous silence.

### Faux positif instruit, et écarté

- [x] Trois écrans d'admin lisent `cacheInvalidation` par cast — même forme que
      le défaut du jour. Ouvert : `successDataResponse` déclare
      `additionalProperties: true`, le champ traverse. **Un cast n'est pas une
      preuve de fuite** ; il faut traverser le sérialiseur (règle du cycle 84).

### Le tuyau posé sans personne pour y verser — rattrapé dans le même train

- [x] Après les deux premiers lots, la garde était TOUJOURS inerte : la
      provenance survivait à l'envoi, mais **aucun chemin de capture ne la
      déclarait**, donc la colonne valait `false` partout. C'était reproduire le
      défaut du cycle précédent un étage plus haut — une règle juste que rien ne
      peut déclencher. Repéré en RELISANT ce que je venais d'écrire dans
      « reste ouvert » : la phrase disait la panne à voix haute.
- [x] `useAudioRecorder` — **unique** capture in-app du web (les autres
      `getUserMedia` servent les appels ; rien n'attache de photo prise sur
      place). Une note vocale qu'on vient d'enregistrer est l'exemple que la
      règle partagée nomme elle-même.
- [x] La déclaration s'AJOUTE aux métadonnées au lieu de les remplacer :
      `audioEffectsTimeline` voyage par le même canal, et l'écraser retirerait
      la timeline d'effets de toute note vocale qui en porte une. Deux témoins,
      un par moitié.
- [x] Le drapeau traverse les DEUX services d'upload du web sans travail
      supplémentaire — les deux sérialisent en `metadata_<index>`, que la route
      parse déjà.
- [x] **Chaîne complète et vérifiable de bout en bout côté web** : enregistrer →
      déclarer → persister → charger → déclarer au schéma → recopier au
      transformateur → lire dans la feuille → confirmer.

### Reste ouvert

- [ ] **iOS ne DÉCLARE pas encore `capturedInApp` à l'envoi** (caméra / micro).
      Le sens serveur → client est fait et gardé ; le sens client → serveur
      demande de toucher le chemin de capture et l'en-tête `Upload-Metadata` du
      pipeline TUS — donc du Swift, qu'aucune chaîne d'outils ne peut compiler
      ici. Lot séparé, à instruire là où il peut être MESURÉ.
- [ ] **8 rouges iOS ANTÉRIEURS** (gardes du chantier Lentille) — hérités,
      non touchés par ce train.


# Cycle 123 — le Prisme ANNONCÉ sans être APPLIQUÉ (web)

## Point de départ
Suivi mesuré des cycles 120/122 : trois surfaces web restées au rang 1
(commentaires, stories, status), qualifiées « CORRECTES, seulement pas encore
rang-conscientes ». Solder ce suivi EN ENTIER (leçon 265).

## Ce que le suivi décrivait mal
Deux des trois l'étaient. La troisième — `StoryViewer` — ne l'était pas : son
corps de story rendait `story.content` (l'ORIGINAL) pendant que la puce de
`TranslationToggle` (montée `showContent={false}`) annonçait la langue résolue.
Le relais prévu pour ce cas (`onDisplayedChange`) n'était branché nulle part.

Chercher le motif — `showContent={false}` SANS `onDisplayedChange` — a rendu
une QUATRIÈME surface : `PostCard`, le corps d'un post dans le FIL, rangé dans
« fait » depuis le cycle 120. Défaut pire : la zone « traductions disponibles »
y est cliquable, et cliquer ne changeait RIEN — contrôle inerte.

## Lots
1. `StoryViewer` corps legacy — relais `onDisplayedChange` + `preferredLanguages`
2. `StoryViewer` overlays legacy — `resolvePrismeText` délègue à la SSOT
   `resolvePrismTranslation` (rang 1 seul + préfixe sur-matchant → chaîne ordonnée)
3. `PostCard` corps du fil — relais `onDisplayedChange`
4. `CommentItem`/`CommentList`/`CommentReplies`/`CommentThread` + `StatusBar` —
   prop `preferredLanguages`, câblée chez les 4 hôtes
5. `TranslationToggle` — effet de notification sur les 3 PRIMITIVES servies
   (une prop tableau non mémoïsée bouclait sans fin)

## Témoins (9, tous mesurés)
- 4 de RANG (rang 2 servi quand le rang 1 manque) — StoryViewer corps + overlay,
  CommentItem, StatusBar
- 3 anti-régression (original quand aucune langue du prisme n'est servie)
- 1 de PIXEL (le corps du post sert la traduction, pas seulement la puce)
- 1 d'INERTIE (cliquer une traduction change le texte lu)

Le témoin StatusBar a été vérifié falsifiable par mutation (retrait de la prop
→ il tombe), n'ayant jamais tourné proprement en RED.
