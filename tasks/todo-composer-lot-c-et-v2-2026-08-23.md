# Composer — lot C (chrome) + chantier v2 · plan exécutable

> Écrit le 2026-08-23 pour combler un trou constaté : les lots **B, D, F** ont
> chacun leur fichier de tâches (`tasks/composer-lot-{b,d,f}-revue-opus.md`),
> **le lot C n'en avait aucun** — alors qu'il est TOUT ce qui reste du chantier.
> Sa définition ne vivait que comme lignes de matrice dans les 351 Ko de
> `docs/superpowers/specs/2026-08-19-meeshy-composer-views.html`.

## Sources — trois, avec des rôles distincts

| Source | Rôle |
|---|---|
| `2026-08-20-meeshy-composer-execution-spec.md` | contrat **gelé** inter-lots, « Hors v1 » opposable |
| `2026-08-19-meeshy-composer-views.html` | source **vivante** : doctrine (11 lois), inventaire, matrice, **tableau de bord** — rév. 10, **77 %, 50/65** |
| `2026-08-23-meeshy-composer-v2-design.md` | **extension** : promotion de « Hors v1 » + lois nouvelles |

**Règle de maintenance héritée, non négociable.** Chaque tâche dont le gate
passe met à jour la planche — **camembert ET matrice** — dans le MÊME commit que
son gate. Un tableau de bord périmé est un défaut **bloquant**.

⚠️ **Deux sessions éditent ce HTML.** Convention à tenir : chacun ne touche que
**les lignes de matrice de ses propres tâches** ; le camembert est recalculé par
le dernier qui merge.

---

## Partie 1 — Ce qui reste du lot C  *(propriétaire : session composer iOS)*

Extrait de la matrice. Colonne « exécution » = `tout` pour chacune : le plan est
revu, **rien n'est écrit**.

- [x] **C2** ✅ *(livrée 2026-08-23)* — `MeeshyComposerHost` : plateau
      (`PlateauTint`, 3 teintes-jetons, `@AppStorage`), scène (l'atelier SDK
      ENVELOPPÉ, jamais réécrit), socle permanent (audience → œil → publier).
      L'œil est `MeeshyScenePlayer(.preview)` — loi 6. **65/65 verts.**
      Deux frontières SDK bougées : `currentEffects` en `public internal(set)`
      (lecture seule hors module) et deux jetons `MeeshyColors` ajoutés.
      Constat consigné : `textMuted` mesure **4,41:1** sur le violet profond,
      sous AA — témoin négatif posé.
- [ ] **C3** — le CÂBLAGE des portes vers le host (tray iPhone/iPad ; *le feed
      reste la sheet v1*). Une part est déjà sur main (`eafead645`, les portes
      portent leur format).
- [ ] **C4b** — Rupture cliente restante : `UpgradeGateView` (426) + porte iPad
      + porte de mise à jour
- [ ] **C5** — Collage O12 (la surface décide) + « Mes stickers » LRU.
      **PÉRIMÈTRE ÉLARGI par la directive produit du 2026-08-23** : *« on doit
      pouvoir coller des images, des documents dont les stickers, et ça doit
      être pris en compte et propagé — sous iOS ET iPadOS. »* Le plan d'origine
      ne nommait que des IMAGES ; or le composer sert quatre formats, dont le
      post, qui porte des documents. Un collage limité aux images les aurait
      avalés EN SILENCE — le pire comportement, le presse-papier ne disant
      jamais pourquoi rien ne s'est passé.
      **Le pipeline n'est pas à écrire, il est à RÉUTILISER** : constat vérifié
      le 2026-08-23 — `ComposerDropResolver` + `ComposerIngestRouter`
      (`apps/ios/Meeshy/Features/Main/Components/`) résolvent DÉJÀ image avec ou
      sans fichier sous-jacent, document, vidéo, audio, refus des dossiers,
      autorisation sandbox et toast nommant le fichier en échec. Ils sont
      branchés sur la barre de conversation (`UniversalComposerBar`) et
      `PostDetailView`. **Le composer de story/post/réel, lui, n'a AUCUN chemin
      de collage** — zéro occurrence de `Paste`/`pasteboard` dans tout
      `packages/MeeshySDK/Sources/MeeshyUI/Story/`. En écrire un second serait
      se condamner à corriger deux fois chaque cas limite du presse-papier iOS.
      **La règle a donc DEUX axes indépendants**, et non une table croisée : la
      SURFACE décide du budget et de la mémorisation (`.scene` ⇒ 2048 px, pas
      d'écriture bibliothèque ; `.stickers` ⇒ 512 px, écriture), le TYPE COLLÉ
      décide du produit (image ⇒ objet média ou sticker ; vidéo/audio ⇒ objet
      média ; **document ⇒ pièce jointe**, jamais un rejet muet). Une surface ne
      peut pas transformer la NATURE de ce qui est collé.
      **iPadOS fait partie de la définition de terminé**, pas d'un lot ultérieur.
- [ ] **C2-C3** — Portes de présentation consommant `ComposerIntent`
      (tray iPhone/iPad ; *le feed reste la sheet v1*)
- [x] **C4b** — Rupture cliente restante ✅ *(gate vert 2026-08-23)*
      `AppVersionHeader` (SDK) miroite ligne à ligne le comparateur du gateway
      (`services/gateway/src/utils/appVersion.ts`) ; `X-App-Version` +
      `X-App-Platform: ios` posés dans `ClientInfoProvider.staticHeaders()`, au
      même point unique que `X-Canvas-Caps` ; sur `426` le funnel poste
      `meeshyUpgradeRequired` **avant** de jeter, `minVersion`/`storeUrl` lus À
      LA RACINE. `UpgradeGateView` sans aucun bouton de fermeture, montée en
      `fullScreenCover` par `RootView` **et** `iPadRootView`, pilotée par la
      notification OU par le bootstrap `GET /app/min-version` (best-effort,
      silencieux). 4 libellés au catalogue en 7 langues.
      Gate : `meeshy.sh test` COMPLET — phase 0 (SDK) 3751 + 3405 tests, 0 échec ; phase 1 3282 tests, **8 échecs tous antérieurs** (3 crashes de contention, verts en isolation ; 5 gardes Lentille lisant des fichiers identiques sur `origin/main`, que cette branche ne touche pas) ; phase 2 4321 tests, 0 échec ; phase 3 sautée (DEMO_USER absent). Suites C4b : SDK 40/40, app UpgradeGateTests 14/14. Les deux gardes négatives sont **prouvées rouges par réintroduction**.
      **Renseignements laissés** : (1) le catalogue `Localizable.xcstrings`
      porte une clé EN DOUBLE — `reading_mode.bubbles.subtitle`, deux valeurs
      `de` DIVERGENTES ; un `json.load`/`json.dump` ne perdrait pas seulement
      une entrée, il **changerait une traduction allemande en silence** — toute
      édition scriptée de ce fichier doit être TEXTUELLE. (2) `is_build_running`
      de `meeshy.sh` cherche `xcodebuild.*-derivedDataPath.*Build`, or la
      **phase 0 ne passe aucun `-derivedDataPath`** : elle est INVISIBLE au
      détecteur en plus d'échapper à l'isolation, d'où deux gates qui démarrent
      en parallèle sans se voir et ne se découvrent qu'en phase 1.
      **Dette laissée** : `TusUploadManager` construit ses requêtes à la main
      (lignes 316-319, 447-449, 480-481) et ne passe pas par
      `ClientInfoProvider.buildHeaders()` — le chemin d'upload tus ne porte donc
      ni `X-App-Version` ni `X-App-Platform`. Inoffensif tant que la porte
      serveur ne juge que `POST /posts` ; à refermer le jour où une porte est
      posée sur la route d'upload.
- [ ] **C5** — Collage O12 (la surface décide) + « Mes stickers » LRU
- [ ] **C6-C6b** — Capture appui long + AUTO-BROUILLON (fermeture & 426)
- [ ] **C7-C7b** — Étagère 4 onglets + alt text + `allowSoundExtraction`

**Déjà fait, ne pas refaire** : C0a/C0b/C0c (delta d'API B4, `4c937e078`),
C1 (`ComposerIntent`, `ff41657b9`, 25/25), C4a (`X-Canvas-Caps: 3`,
`cf05538d9`), correction `carrierAspect` (`b82ebbc17`).

**Existe déjà, ne pas reconstruire** : le **lecteur**. `MeeshyScenePlayer`
(274 l.) + `ScenePlayerMode` (37 l.), 881 l. de tests SDK, 975 l. de gardes app.
**Loi 6 — « Le lecteur EST l'aperçu »** : composer et viewers partagent un seul
registre de rendu. Aucune tâche ne construit d'aperçu.

---

## Priorité — directive du 2026-08-23

**iOS d'abord. Web en seconde priorité. Android mis de côté.**

Cela ordonne l'intérieur des lots autant que les lots eux-mêmes : quand une
tâche a deux moitiés (V0 bis en a une iOS et une web), **la moitié iOS part la
première**. Le lot H (Android) de la spec d'exécution est **suspendu** — ni
tâche, ni gate, ni ligne de matrice tant que cette directive tient.

`V0` fait exception à l'ordre : il sert les deux plateformes ET débloque C2-C3
côté iOS, donc il reste en tête.

---

## Partie 2 — Le chantier v2  *(propriétaire : session conception/web)*

Ces tâches **étendent** le dénominateur au-delà de 65. Elles ne remplacent
aucune tâche C.

- [x] **V0 — Le contrat partagé** ✅ *(gate vert 2026-08-23)*
      `packages/shared/utils/composer-contract.ts` + 23 tests
      (`__tests__/composer-contract.test.ts`). Gate : **104 fichiers / 2 490
      tests verts**, `tsc --noEmit` propre. Forme FIGÉE, consommable :
      `COMPOSER_DOORS` (9), `composerOpening(door, ctx)` →
      `{ initialFormat, offeredFormats }`, `buildUpdatePayload(known, draft)`.
      *(détail de la mission d'origine ci-dessous)*
- [x] **V0 — Le contrat partagé** *(démarre en premier — attendu par C2-C3)*
      `packages/shared` : les portes comme données, `initialFormat` +
      `offeredFormats`, `buildUpdatePayload(known, draft)`.
      `ComposerIntent.swift` devient le miroir du contrat, et cesse d'en être la
      source. **Bloquant pour C2-C3** : la session composer construit le
      sélecteur derrière une frontière étroite en l'attendant.
- [x] **V0 bis — Le repost miroite** ✅ *(les deux moitiés livrées, 2026-08-23)*
      - [x] **iOS d'abord** — les six sites qui passent `targetType: nil`
            (`ReelsViewModel:430`, `FeedViewModel:881`, `PostDetailView:301`,
            `ProfileUserPostsList:969`, `RootViewComponents:329`,
            `FeedView:449`) passent le format de leur source. Les deux sites
            `.post` du viewer de story ne changent PAS : ils deviennent
            l'option d'ancrage. Retirer au passage le commentaire périmé
            `nil = le serveur cree un POST (2026-08-19)`, qui énonce
            l'arbitrage renversé.
      - [x] **Web ensuite** ✅ — `RepostRequest` gagne `targetType`, les quatre
            sites passent le type de leur source, et le viewer de story ajoute
            l'ancrage « garder sur mon fil ». Gate : **749/749 suites,
            13 969 tests verts**.
            *Deux trous du WIP d'origine, trouvés au gate et refermés* :
            `PostsFeedScreen.storyRepost.test.tsx` GRAVAIT le défaut (il
            assertait `{ isQuote: false }` sans `targetType`), et le repost
            **CITÉ** du fil ne miroitait pas — `repostingPost` ne transportait
            même pas le type, ce que `tsc` a attrapé et qu'aucun test ne
            couvrait (`PostsFeedScreen.repostMirror.test.tsx`, neuf).
- [ ] **V1 — L'éventail** — `offeredFormats` gaté par `qualifiesAsReel`.
      *N'est pas une loi neuve* : c'est le raffinement de la **loi 9**. Contrainte
      de la **loi 4** : un format non offert est **ABSENT, jamais grisé**.
      Se pose SUR C2-C3, ne le remplace pas.
- [ ] **V2 — La surface « document sans scène » (I6)** — absorbée depuis
      `FeedComposerSheet`. **Condition bloquante de V3**, posée comme telle par
      la spec v1.
- [ ] **V3 — `.feedComposer` cesse de router** — inverse le « feed reste sheet
      v1 » de C2-C3. **Ne démarre qu'après V2.**
- [ ] **V4 — Mood (S3) + repost** — `.moodChip` et `.repost` cessent de router.
      Retrait de `StatusComposerView` (361 l.) et `UnifiedPostComposer` (739 l.,
      1 seul appelant). Borné par la **loi 10** : l'audience se souvient PAR
      FORMAT, puis la loi du repost la rétrécit encore.
- [ ] **V5 — Média reçu + forward (O13)** — `.conversationMedia` câblée, la
      fiche de forward gagne ses destinations non-conversation.
- [ ] **V6 — Web complet** — retrait de `PostComposer.tsx`,
      `StatusComposer.tsx`, `AudioPostComposer.tsx`, `RepostModal.tsx`.
      `StoryComposer.tsx` est **absorbé, pas retiré** (il porte le canevas v3).
- [ ] **V7 — File de publication unique (`PublishIntent`, S2)** — retrait
      d'`EditPostSheet.swift` (498 l.), dernier legacy.

---

## Partie 3 — Parité iOS ⇄ Web  *(rattrapages du lot F, dénominateur 65 → 67)*

Directive du 2026-08-23 : **iOS et le web doivent fonctionner ISO.** Deux dettes
du lot F, classées « lot futur » tant que la parité n'était pas l'objectif,
deviennent des tâches. Audit croisé matrice ⇄ code, vérifié des deux côtés.

- [x] **W1 — les deux kinds muets du web** ✅ *(livrée 2026-08-23)*
      `place` et `drawing` sont peints, en miroir des constantes du SDK
      (`StoryLocationLayer` pour la pastille, `StoryStrokeRasterizer` +
      `StrokeWidthMapping` pour les traits). 10 tests, oracle = le golden
      PARTAGÉ. **Renseignement** : le plafond de `effectiveWidth` passe APRÈS
      son plancher — un trait de base < 1 reste sous l'unité. Miroiter le CODE,
      pas l'intention de son commentaire.
      <details><summary>énoncé d'origine</summary>
      `CanvasV3Scene.tsx:591-599` ne dispatche que `text · media · audio ·
      sticker` ; `place` et `drawing` tombent sur un `return null` documenté
      « ignoré EN SILENCE ». Or iOS **émet les deux**
      (`CanvasV3Migration.swift:263` pour `drawing`, `:269` pour `place`) et le
      golden PARTAGÉ porte un `('L1','place','fg')`.
      **Symptôme** : une story composée sur iOS avec une épingle de lieu
      s'affiche sur le web **sans son lieu, sans rien signaler**.
      **Oracle** : `packages/shared/fixtures/canvas-v3/v1-legacy-full.v3.json`.
      </details>
- [x] **W2 — enchaînement multi-scènes au web** ✅ *(livrée 2026-08-23, AVANT
      le lot C comme sa contrainte l'exigeait)* — `StoryViewer` avance le rang
      au fil des durées cumulées ; `computeStoryDurationMs` devient la SOMME
      des scènes et la tête de lecture servie à la scène devient RELATIVE.
      **750/750 suites, 13 980 tests verts.**
      *Dette laissée, dite une fois* : les transitions inter-scènes
      (`scene.opening`/`closing`) ne sont pas peintes — le web ne les a JAMAIS
      peintes, pas même en legacy ; leur donner un rendu serait du neuf, pas de
      la parité.
      <details><summary>énoncé d'origine</summary>
      Le web ne rend que `scenes[sceneIndex]` — le contrat en autorise 10.
      Inoffensif tant qu'iOS n'émet qu'une scène ; **devient live le jour du
      multi-slides**, qui appartient au lot C. Livrer W2 après C serait
      fabriquer soi-même la régression.
      </details>
- [x] **W2 — enchaînement multi-scènes au web** ✅ *(livrée 2026-08-23, avant le
      lot C comme exigé)*
      Le partage est celui d'iOS, pas un partage neuf : `CanvasV3Scene` peint le
      SEUL rang demandé — miroir de `MeeshyScenePlayer`, qui reçoit lui aussi
      `sceneIndex` en Binding et n'en change jamais de lui-même — et c'est
      `StoryViewer` qui l'avance au fil de sa tête de lecture. La durée d'une
      scène n'est pas inventée non plus : une scène projetée en familles v1 EST
      une slide (`StoryEffects(rendering:sceneIndex:)` iOS ⇄ `v1ViewOfScene`
      web), donc sa durée est `computedTotalDuration()` — pin `timelineDuration`
      d'abord, sinon les trois termes du contenu. W2 l'applique à CHAQUE scène
      (`canvasV3SceneDurationsMs`) au lieu de la seule première. Gate :
      **750/750 suites, 13 980 tests verts**, `tsc --noEmit` sans erreur neuve.
      **Deux conséquences câblées, l'une et l'autre correctrices** :
      `computeStoryDurationMs` devient la SOMME des scènes (sans quoi le timer
      coupait la story à la fin de la scène 1 et les suivantes n'étaient jamais
      peintes), et la tête de lecture servie à la scène devient RELATIVE à celle
      qui joue — repère dans lequel les `timing`/`keyframes` des objets sont
      écrits, une scène démarrant toujours à 0.
      **Décidé seul, faute de source** : (1) le tap gauche/droite garde sa
      sémantique story ↔ story, il ne parcourt pas les scènes — rien dans le
      code ni les tâches ne le fixe, et le changer serait un arbitrage produit ;
      (2) la barre de progression garde UN segment par story, la scène restant
      l'intérieur d'une story ; (3) les transitions inter-scènes
      (`scene.opening`/`closing`) restent hors périmètre — le web ne les a
      jamais peintes, pas même en legacy.
      **Trouvé au passage, non corrigé** : le golden PARTAGÉ
      `story-3-slides.json` écrit son objet `place` en `payload: {name,
      precision}`, alors qu'iOS émet `payload: {place: {...}}`
      (`CanvasV3Migration.swift:269`, forme confirmée par `v1-legacy-full.v3.json`).
      Sa scène 2 ne peint donc RIEN au web. Fixture partagée avec les tests
      Swift — à trancher hors W2.

> **Nuance relevée en vérifiant l'audit** : le contrat déclare **sept** kinds
> actifs (`text, media, sticker, audio, place, drawing, mention`) mais **aucun
> écrivain n'émet `mention`** — iOS fait `continue` à la lecture
> (`CanvasV3Migration.swift:576`). Deux écarts vivants, pas trois. Ne pas
> écrire de rendu `mention` au web : il n'arrivera jamais.

> **A5 — ne pas cocher.** Sa colonne « reste » exige « armement post-B/C/F5b/**H** ».
> B et F5b sont faits ; H a livré la **lecture v3 + caps** mais **pas
> l'émission v3**. La condition d'armement de `CANVAS_V3_READ`/`WRITE` n'est
> donc PAS remplie.

---

## Partage de propriété — pour qu'aucune tâche n'ait deux auteurs

| Domaine | Propriétaire |
|---|---|
| `apps/ios/.../Composer/*` — host, portes, porte de mise à jour | session composer iOS (C2→C8) |
| `packages/shared` — contrat, lois produit | session conception |
| `apps/web/**` | session conception |
| Lignes de matrice de la planche | **chacun les siennes** |

**Point de contact unique** : `ComposerProfile.offeredFormats`. Côté contrat →
conception ; côté sélecteur dans le host → composer iOS.

**Décidé le 2026-08-23** : `ComposerOrigin.repost` et `.edit` **portent leur
format** dès C3 — l'appelant l'a déjà en main (on tape « reposter » sur une
carte rendue). Figer la signature sans lui obligerait à la rouvrir aussitôt.

---

## Revue

*(à remplir au fil des gates — un P0 périmé est un défaut bloquant)*

---

## Trouvé en chemin, à trancher hors des tâches ci-dessus

- **Le golden PARTAGÉ `packages/shared/fixtures/canvas-v3/story-3-slides.json`
  écrit son objet `place` sous une forme qu'aucun client ne lit** : `payload:
  {name, precision}`, là où iOS émet `payload: {place: {...}}`
  (`CanvasV3Migration.swift:269`, forme confirmée par `v1-legacy-full.v3.json`).
  **Sa scène 2 ne peint donc rien au web.** La fixture est consommée par des
  suites Swift (`CanvasV3DecodingTests`, `ScenePlayerIdentityRootTests`) :
  corriger la fixture demande de rejouer ces suites, ce qui dépasse W1/W2.
- **`Localizable.xcstrings` contient une clé EN DOUBLE**
  (`reading_mode.bubbles.subtitle`, deux entrées). Tout script qui relit puis
  réécrit ce JSON en détruit une **sans rien signaler** — c'est pourquoi les
  clés de C2 y ont été insérées par ancrage TEXTUEL, avec preuve que le reste du
  fichier est intact octet pour octet. Laquelle des deux entrées fait foi reste
  à trancher.
- **`CommentDraftStoreTests.swift` était sur `main` sans être enregistré au
  projet** — sa suite ne s'exécutait pas. `xcodegen` l'a ramassée au lot C2 ;
  elle tourne désormais.

- **Le chemin d'upload tus échappe au funnel d'en-têtes.**
  `packages/MeeshySDK/Sources/MeeshySDK/Networking/TusUploadManager.swift`
  construit ses requêtes À LA MAIN (lignes 316-319, 447-449, 480-481) et
  n'appelle JAMAIS `ClientInfoProvider.buildHeaders()` — vérifié : zéro
  occurrence. Il ne pose donc que l'auth et les en-têtes `Tus-*`, et **aucun**
  des en-têtes de plateforme : ni `X-App-Version`, ni `X-App-Platform`, ni
  `X-Canvas-Caps`.
  **Inoffensif aujourd'hui** — la porte serveur de rupture ne juge que
  `POST /posts`, et `isBelowFloor` rend `false` sur l'absence, donc un upload
  n'est jamais bloqué à tort. **Le jour où une porte serait posée sur la route
  d'upload, les binaires périmés passeraient au travers sans être vus.**
  Non corrigé par C4b : hors des fichiers nommés par son plan, et le correctif
  demande ses propres tests plus un gate. À arbitrer — la question est de savoir
  si le funnel d'en-têtes doit être une garantie du CLIENT (un seul chemin
  sortant, garde de source à l'appui) ou une simple convention.

- **SEPT gardes du chantier Lentille sont ROUGES sur `main`** *(mesuré le
  2026-08-23 sur un worktree `main` PUR, sans aucun diff composer)* :
  `LentilleRowBehaviourAnchorTests` 3 (L06 badge de non-lus comptés absent, L09
  glyphe outbox encore rendu par le rang plat), `ScrollPillStateTests` 2,
  `LentilleRowSourceGuardTests` 1 (le point du pont dimensionné par un littéral
  au lieu de `LentilleMetrics.UnreadDot.size`), `LentilleChromeSourceGuardTests` 1.
  Elles n'appartiennent à aucune tâche du composer et ne sont corrigées par
  aucune — elles sont consignées ICI parce qu'un gate complet du lot C les
  rencontre et qu'il faut savoir, en les voyant, qu'elles PRÉCÈDENT le diff.
  Le message de `ScrollPillStateTests` mérite d'être lu en entier : « I-061
  l'avait écrite et testée SANS LA MONTER : une vue juste, compilée,
  invisible. » C'est le motif que cette session a rencontré quatre fois dans la
  même journée — du code juste que rien n'exécute, et un vert qui ne veut plus
  rien dire.
  **À trancher** : soit le chantier Lentille les reprend, soit elles deviennent
  du bruit permanent qui masquera la prochaine vraie régression.

---

## Piste ouverte — un réglage d'envoi dans les Paramètres *(porteur produit, 2026-08-23)*

En tranchant L09 (« l'icône ⟳ doit-elle rester sur la rangée ? » → **NON**), le
porteur produit a ouvert une piste : *« mettre dans les paramètres peut-être une
configuration pour push »*.

**Ce que le retrait de ⟳ laisse effectivement sans surface.** Le glyphe était la
seule trace visible qu'un envoi attendait — l'outbox, elle, continue de renvoyer
toute seule (`OfflineQueue`, flush FIFO à la reconnexion). Après retrait, un
message en attente ne se voit plus *nulle part dans la liste*. Ce n'est pas une
perte de mécanisme, c'est une perte d'INFORMATION — et c'était l'intention : une
rangée disait l'état d'un envoi pour toutes les conversations à la fois, sans
rien offrir à en faire.

**Ce qu'il faut cadrer avant d'écrire une ligne** — la formulation « configuration
pour push » recouvre au moins trois choses différentes, et elles n'ont ni le même
écran, ni le même coût :

1. **Un réglage de RENVOI** — quand l'outbox rejoue sa file : toujours, seulement
   en Wi-Fi, à la demande. Touche `OfflineQueue` et la politique réseau.
2. **Un état d'ENVOIS EN ATTENTE consultable** — un écran qui liste ce qui n'est
   pas parti, avec « réessayer maintenant ». C'est l'affordance que ⟳ promettait
   sans la tenir.
3. **Les notifications PUSH** — préférences APNs par type d'événement. Rien à voir
   avec l'outbox, mais le mot « push » les désigne aussi.

**Question à trancher, une phrase :** *le réglage doit-il gouverner le RENVOI des
messages en attente, offrir un ÉCRAN pour les consulter et les relancer, ou
concerner les notifications push — ou plusieurs de ces trois ?*

Hors périmètre du lot C tant que la réponse n'est pas connue : écrire un réglage
avant de savoir ce qu'il gouverne produirait exactement l'affordance sans effet
que le retrait de ⟳ vient de supprimer.

---

## Mesure plan ⇄ code du 2026-08-23 *(12 agents : 6 constats + 6 réfutations adverses)*

Chaque ligne ci-dessous a été **mesurée**, puis **contredite** par un second agent.
Ce qui suit est ce qui a survécu à la réfutation. Les numéros de ligne valent au
commit `e2ac267b8`.

### Le constat qui commande tous les autres : le meuble est INERTE

`MeeshyComposerHost` (C2, 202 l.) **a ZÉRO appelant de production** — 0 occurrence
de `MeeshyComposerHost(` dans tout `apps/ios`. Et il n'est pas seul :

- `ComposerIntent(` n'est **construit nulle part** en production (3 sites, tous
  dans `ComposerIntentTests`).
- `ComposerProfile.profile(for:)` n'a que **2 appelants, tous deux DANS le host**
  (`MeeshyComposerHost.swift:60` et `:200`). La table des 9 portes ne gouverne
  RIEN à l'exécution.
- `offeredFormats`, `initialFormat`, `opensWith`, `routesToLegacy` : **aucun
  lecteur** hors `ComposerIntent.swift` et les tests. Zéro occurrence des trois
  premiers dans le host lui-même — **il n'existe aucun sélecteur de format**.
- Le contrat partagé V0 (`packages/shared/utils/composer-contract.ts`) **n'a
  aucun importateur** hors son propre test.
- Le bouton « Publier » du socle est **VIDE** : `MeeshyComposerHost.swift:177-187`,
  le corps du `Button` ne contient que trois lignes de commentaire.
- Le jeton caméra du plateau est de l'**UI morte** : `:97-100` peint l'icône sous
  `if profile.allowsCapture`, mais le host **n'injecte pas** la caméra (0
  occurrence de `storyCameraCaptureProvided` dans `Composer/`).

**C1, C2 et V0 ont donc livré un modèle juste, testé, et que rien n'exécute.**
C'est le motif que ce dépôt répète — du code juste, compilé, invisible — et il
est ici à l'échelle d'un lot entier. **C3 n'est pas « une tâche parmi quatre » :
c'est la clé de voûte.** Tant qu'elle n'est pas posée, aucune des autres n'a de
surface où atterrir.

### Ce que C3 doit RÉCUPÉRER, et que le host perd aujourd'hui

Le montage actuel passe par `StoryComposerCover` (`StoryTrayActions.swift:153`),
appliqué aux 2 racines (`RootView.swift:847`, `iPadRootView+Sheets.swift:148`).
Il donne trois choses que le host **n'a pas** :

1. **L'audience mémorisée** — `initialVisibility: viewModel.lastComposerVisibility`
   (`StoryTrayActions.swift:177`). 0 occurrence des deux dans le host.
   **Piège majeur** : `StoryComposerView.swift:291` donne à `initialVisibility` une
   valeur par défaut (`PostVisibility.friends`). Monter le host tel quel ne
   produit **aucune erreur de compilation** — la mémoire d'audience disparaît
   EN SILENCE, et la loi 10 avec elle.
2. **L'adoption de brouillon** — `makeComposerViewModel()` / `composer.adoptDraft(id:)`
   (`:165-169`). 0 occurrence d'`adoptDraft`/`pendingDraftId` dans le host, qui
   crée son VM en dur (`@StateObject … = StoryComposerViewModel()`, `:44`).
3. **Les 3 fournisseurs d'environnement** — `storyLocationPickerProvided()`,
   `storyCameraCaptureProvided()`, `storyRecentCameraRollProvided()`
   (`:208-210`). 0 occurrence des trois dans `Composer/`.
   **Garde à respecter** : `AppInitWireupTests.swift:148-184` exige
   `injections == presentations` **fichier par fichier** — un nouveau site de
   présentation fait rougir la garde s'il n'injecte pas.

**Dette de chrome** : le socle du host (audience → œil → publier) se superpose au
chrome que `StoryComposerView+TopBar` peint déjà. Le brancher sans trancher
produit un DOUBLE chrome.

### Lot C — taille du reste, mesurée

| Tâche | Ampleur | Ce qui existe déjà et sert de socle | Ce qui manque vraiment |
|---|---|---|---|
| **C3** | moyenne | tray unique (`StoryTrayView.swift:82`, 3 hôtes), cover unique, garde d'unicité (`AppInitWireupTests:204`) | monter le host ; lui rendre audience + brouillon + 3 providers ; écrire le sélecteur de format ; trancher le double chrome |
| **C5** | grosse | **tout le pipeline presse-papier existe et tourne** (`ComposerDropResolver`/`ComposerIngestRouter`, 6 sites de prod) ; `DiskCacheStore` fait déjà l'éviction LRU (`evictOverBudget:557`, tri mtime, `noteAccess`) | `StickerLibraryStore` + `PasteIntoComposer` (0 occurrence de `StickerLibrary` et de `PasteInto` dans tout le dépôt) ; l'injection dans `MeeshyUI/Story/` (**0 occurrence de `pasteboard` / `Paste`** — le composer n'a AUCUN chemin de collage) ; **`DiskCacheStore` n'énumère pas ses clés** (34 `public func`, aucune n'indexe) ⇒ l'index des stickers récents est à écrire à côté, sur le patron du sidecar `.pins.json` |
| **C6/C6b** | moyenne | `CameraView` (734 l.) réutilisable ; `insertForegroundImage/Video` **extraits POUR un futur point d'entrée caméra** ; magasin de brouillons COMPLET (2 autosaves, `saveDraft`, `restoreDraft`, gate unique `mayOverwriteStoredDraft`) ; funnel 426 câblé | **0 occurrence de `onLongPress`/`LongPressGesture`** dans tout le composer ; l'accroche auto-brouillon au 426 ; **et le RETRAIT du `confirmationDialog` de sortie** (`StoryComposerView.swift:366-38x`) que **deux gardes de source verrouillent** — M10 exige zéro question |
| **C7/C7b** | grosse | `MyStoriesTab` n'a que 2 cas (`published`, `drafts`) mais **la matière des 2 manquants existe déjà** : `activeUploads`, `failedItems`, `loadMyStoriesArchive()` — aujourd'hui entassés dans « Brouillons » | les 2 onglets + leurs clés (`story.mine.tab.queue`/`.archive` **absentes** du catalogue) ; le champ alt d'inspecteur ; `allowSoundExtraction` |

**Deux repêchages, deux verdicts opposés** *(la réfutation a corrigé le constat)* :
- **`alt` n'est PAS orphelin de bout en bout** : le champ existe en base
  (`schema.prisma:3350` pour `PostMedia`, `:849-850` pour `MessageAttachment`) et
  un **canal d'ingestion serveur existe**. Ce qui manque est le champ d'UI, pas la
  porte.
- **`allowSoundExtraction` est bien SANS consommateur** : les deux sites qu'on
  croyait consommateurs (`SoundCaptureService.ts:72`, `mediaCaptureTracks.ts:41`)
  sont des **commentaires**.

### Chantier v2 — état réel

- **V1** : `qualifiesAsReel` existe aux 3 domiciles et est consommé en production
  (gateway, web, iOS) ; `offeredFormats` est gaté dans les deux tables. Mais les
  **2 seuls sites de production passent `compositionQualifiesAsReel: false` EN
  DUR** (`MeeshyComposerHost.swift:60` et `:200`). L'éventail est écrit et
  débranché.
- **V2** : `FeedComposerSheet` existe (`FeedView+Attachments.swift:765`) et porte
  bien les 3 capacités que la spec nomme. Le host n'en a **rien** absorbé (0
  `TextEditor`, 0 `photosPicker`, 0 `fileImporter`) ; `plateauTools` ne monte que
  3 `Image(systemName:)` décoratifs. V2 = absorber cette sheet.
- **V3** : `.feedComposer` route toujours vers le legacy (`ComposerIntent.swift:159`).
  **Bloqué par V2**, comme la spec le pose.
- **V4→V7** : rien d'écrit. Piège mesuré : **8 fichiers de tests épinglent les
  composers legacy par chemin en dur ou par compte d'occurrences** — les retirer
  fera rougir ces gardes, qui sont à migrer, pas à supprimer.

### Ce que « fini » exige — et le trou dans la DoD

DoD du lot C, mot pour mot (`execution-spec.md:417-418`) :
> « **DoD** : `meeshy.sh test` vert ; les 4 gardes UI neuves du dépôt (catalogue
> 7 langues, clés mortes, RTL, `==` manuel). »

DoD globale (`spec:491-493`) : « Après le dernier merge : clean build depuis main
+ gate iOS complet + suites gateway/web. » Ordre de merge : `A → B → F → D → E`.

**Trou mesuré, à connaître avant de déclarer vert** : `meeshy.sh:1743` — quand
`DEMO_USER`/`DEMO_PASSWORD` manquent dans `fastlane/.env`, la **phase 3 se saute
en silence par `XCTSkip` et le gate reste VERT**. Tous les gates récents de ce
chantier ont sauté la phase 3. Ce n'est pas une régression, c'est un angle mort
qu'il faut nommer chaque fois qu'on écrit « gate vert ».

---

## Arbitrages APPROPRIÉS — décisions prises par l'agent, 2026-08-23

> Directive du porteur produit : *« Les lignes qui ne sont pas à toi tu te les
> appropries. Prends les décisions à prendre et consigne-les clairement avec un
> warning, et décris les autres possibilités écartées. »*
>
> Chaque décision ci-dessous est RÉVERSIBLE et nommée. Les options écartées sont
> écrites pour qu'un désaccord puisse se formuler sans re-instruire le dossier.

### A1 — Le réglage d'envoi → **un ÉCRAN des envois en attente**

**Décidé** : le réglage prend la forme d'un écran listant ce qui n'est pas parti,
avec « réessayer maintenant ». C'est l'affordance que le glyphe ⟳ promettait sans
la tenir.

**Pourquoi** : retirer ⟳ a supprimé une INFORMATION, pas un mécanisme —
l'outbox rejoue déjà seule (FIFO à la reconnexion). Ce qui manque est de VOIR et
d'AGIR, pas de régler.

**Écarté — une politique de renvoi** (toujours / Wi-Fi seul / à la demande) :
ajoute un mode de défaillance que personne n'a demandé. « Wi-Fi seul » retarde
silencieusement des messages, ce qui est PIRE que le glyphe qu'on vient de retirer.
**Écarté — les préférences de notifications APNs** : le mot « push » est un
homonyme. Elles existent déjà ailleurs et n'ont aucun rapport avec l'outbox.

### A2 — Le golden `story-3-slides.json` → **corriger la FIXTURE**

**Décidé** : l'objet `place` du golden passe de `payload: {name, precision}` à
`payload: {place: {...}}`, la forme qu'iOS émet réellement
(`CanvasV3Migration.swift:269`, confirmée par `v1-legacy-full.v3.json`).

**Pourquoi** : un golden PARTAGÉ qui décrit une forme qu'aucun écrivain ne produit
n'est pas un oracle, c'est un piège. Sa scène 2 ne peint rien au web, et le golden
ment donc sur la parité qu'il est censé prouver.

**Écarté — faire lire les deux formes au web** : graverait dans le lecteur une
forme du fil que personne n'émet, pour un bug de fixture. Une branche permanente
payée éternellement pour une erreur ponctuelle.
**Écarté — ne rien faire** : laisse un oracle faux dans un fichier partagé par les
suites Swift ET web.
**Coût assumé** : rejouer `CanvasV3DecodingTests` et `ScenePlayerIdentityRootTests`.

### A3 — La clé EN DOUBLE du catalogue → **garder « Sprechblasen »**

⚠️ **AVERTISSEMENT — CE N'EST PAS COSMÉTIQUE, ET C'EST VISIBLE PAR L'UTILISATEUR.**

`reading_mode.bubbles.subtitle` existe DEUX fois dans
`apps/ios/Meeshy/Localizable.xcstrings`, avec deux valeurs `de` divergentes :

| entrée | ligne | valeur `de` |
|---|---|---|
| #1 | ~17 620 | **« Die klassischen Sprechblasen »** |
| #2 | ~149 121 | « Die klassischen Blasen » |

**Décidé** : #1 fait foi, #2 est supprimée.

**Pourquoi** : *Sprechblasen* est le mot allemand pour les bulles de DIALOGUE.
*Blasen* seul désigne des bulles physiques — et, en allemand courant, le terme est
surtout connu comme argot vulgaire. Un lecteur germanophone lit donc, sur un écran
de réglages, un mot que personne n'a voulu y mettre.
**Aggravant** : un analyseur JSON qui rencontre une clé en double retient
généralement la DERNIÈRE. La valeur servie aujourd'hui est donc probablement #2 —
la mauvaise.

**Écarté — garder #2** : aucun argument, c'est une traduction fautive.
**Écarté — trancher plus tard** : chaque jour d'attente est un jour où un
utilisateur allemand lit ce mot.
**Contrainte de méthode** : la suppression est TEXTUELLE. Un `json.load`/`json.dump`
détruirait une entrée en silence — c'est le piège même que cette clé incarne.

### A4 — `TusUploadManager` hors du funnel d'en-têtes → **garantie CLIENT**

**Décidé** : le chemin d'upload tus passe par `ClientInfoProvider.buildHeaders()`,
et une garde de source interdit les requêtes construites à la main dans le SDK.

**Pourquoi** : l'alternative — « le funnel est une convention » — est exactement ce
qui a produit l'écart. Trois sites construisent leurs requêtes à la main et ne
portent ni `X-App-Version`, ni `X-App-Platform`, ni `X-Canvas-Caps`. Une convention
que rien ne vérifie n'est pas une convention, c'est un souhait.

**Écarté — attendre qu'une porte serveur soit posée sur la route d'upload** : parie
que la porte arrivera avant qu'un binaire périmé passe au travers. Le jour où elle
arrive, l'écart est déjà en production sur tous les binaires installés.

### A5 — Les 5 gardes Lentille perdues → **GREFFER**

**Décidé** : les 5 témoins restants de `LentilleRowSourceGuardTests` (17 à
`35f28209d`, 12 à HEAD) sont restaurés depuis le commit de leur auteur.

**Pourquoi** : elles ont été écrites, revues, puis perdues dans une fusion — pas
retirées par décision. Personne n'a jamais montré qu'elles étaient obsolètes.

**Écarté — les déclarer périmées** : demanderait de prouver, une par une, que
l'invariant qu'elles protègent n'existe plus. Personne ne l'a fait, et le coût de
la greffe est inférieur au coût de cette démonstration.
