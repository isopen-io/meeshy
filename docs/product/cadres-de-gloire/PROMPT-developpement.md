# Cadres de gloire et alertes d'immortalisation — prompt de développement

> **Source datée du 2026-10-10.** Le plan et l'état vivent dans le milestone « Chaque étape du jeu s'immortalise dans un cadre digne d'elle » (créé au lot L0) et dans ses issues, qui ont raison en cas d'écart. Ce fichier ne se met pas à jour au fil des lots : il n'est pas une source de pilotage.
>
> Prompt autoportant pour une session de développement ouverte dans le dépôt Meeshy (`/home/user/meeshy`, dépôt GitHub `isopen-io/meeshy`). Rédigé le 2026-10-10, après la validation du design par le porteur (« Tout est terminé », le Néon gardé tel quel), puis révisé après trois relectures vérifiées contre le dépôt (`origin/dev` et la branche `docs/cadres-de-gloire-sources`, commit `c5b1390040`). Il est versionné sous `docs/product/cadres-de-gloire/PROMPT-developpement.md`, le fichier auquel renvoie le README des sources.
>
> Tu ne connais rien de la conversation qui a produit ce design. Tout ce qu'il te faut est ici ou dans les fichiers cités. **Le code a raison sur ce document** : chaque chemin, chaque ligne, chaque chiffre cité ici se revérifie avant d'être utilisé.

---

## 0. Avant d'écrire une ligne (30 minutes de lecture)

Lis dans cet ordre, sans tout lire de chaque dossier :

1. `CLAUDE.md` à la racine, en entier (pilotage par issues, treize dimensions, TDD, budget de 1 000 à 1 200 lignes, staging d'abord, rétrocompatibilité, Android Kotlin gelé, une seule app web).
2. `apps/ios/CLAUDE.md`, `packages/MeeshySDK/CLAUDE.md` (SDK Purity), `services/gateway/CLAUDE.md`, `packages/shared/CLAUDE.md`, `infrastructure/CLAUDE.md`. Il n'existe pas de `apps/web/CLAUDE.md` : les règles du web sont dans `apps/web/decisions.md` (lis D-1, D-4, D-13, D-14, D-49, D-52, D-84, D-96, D-97, D-154).
3. `docs/product/cadres-de-gloire/README.md`, puis les planches `docs/product/cadres-de-gloire/planches/*.jpg` (regarde-les toutes), puis `docs/product/cadres-de-gloire/generateur/lib/base.py`.
4. `docs/product/jeu-meeshy-conformite-2026-10-05.md` § B-5 et § H (H-1 à H-11), et `docs/product/jeu-meeshy-conception.html` partie VI (la photo reste sur l'appareil).
5. Le précédent à copier : `docs/superpowers/specs/2026-09-29-cadres-de-capture-d-appel-design.md`, `packages/shared/design/call-capture-frames/`, `apps/web/src/lib/calls/frames/`, `packages/shared/scripts/generate-call-frames-swift.ts`, `apps/web/scripts/generate-frame-layout-fixture.ts`.
6. Les lois du jeu : `packages/shared/utils/game/photo-catch-up.ts`, `photo-moments.ts`, `glory.ts`, `levels.ts`, `treasury.ts`, `flame.ts`, `mint.ts`, `rank-crest.ts`, `chest.ts`, et leurs miroirs `packages/MeeshySDK/Sources/MeeshySDK/Game/`. Note dès maintenant l'exception : le miroir de `photo-catch-up.ts` vit dans l'APP (`apps/ios/Meeshy/Features/Main/Game/Photo/GamePhotoCatchUp.swift`), hors des vecteurs partagés (§ 3, lot L3b).
7. La doctrine des célébrations : l'en-tête de `apps/ios/Meeshy/Features/Main/Views/EngagementRevealHost.swift` (directive porteur #5847 : seul un SUCCÈS se célèbre sans que personne ne touche rien) et `apps/ios/decisions/2026-10-05-le-jeu-cote-app-la-loi-vient-du-sdk-les-choregraphies-sont-des-fonctions-du-temps.md` (son § 4 : aucun réseau sous `Game/Photo/`).
8. Les issues, par l'API REST (le GraphQL et `gh issue view` ont rendu 403 depuis certaines sessions ; sans `gh`, par les outils GitHub MCP `issue_read`) : `gh api repos/isopen-io/meeshy/issues/<n>` pour #9382, #9963, #9964, #9965, #9972, #9973, #9974, #9975, et leurs commentaires (`/issues/<n>/comments`).
9. Les leçons de ton domaine, jamais toutes : `ls tasks/lessons | grep -E 'pbxproj|xcodegen|budget|chunk|canvas|police|font|photo|notification|precache'`. À lire sans faute : `lecon-589-…` (un budget qui nomme un chunk ne prouve rien sans l'arête d'import), `lecon-576-…` (un défaut visuel peut n'exister que sur un moteur), `lecon-182-…` (XcodeGen ignore la clé `resources:`), `lecon-231-…` (un témoin qui ne peut pas tomber n'atteste rien), `lecon-244-une-branche-qui-n-est-pas-poussee-…`.
10. La planche publiée et son prototype : https://claude.ai/artifact/QUWf5znxXcX1qGLEmGQGV2, lus par l'outil Artifact (`action: read`), jamais par curl.

Puis fais le relevé de l'arbre vivant : `git fetch origin && git log --oneline -5 origin/dev`, `git worktree list` (jamais plus de quatre worktrees ouverts, toutes sessions confondues), `git branch -r | grep -i -E 'cadre|glory|frame|photo'` (une branche vivante qui écrit déjà tes chemins a la priorité : tu cèdes, règle #5243), et `gh api 'repos/isopen-io/meeshy/pulls?state=open&per_page=50' --jq '.[].head.ref'`.

---

## 1. La mission

Développer **de bout en bout** dans Meeshy — web (`apps/web` : web, PWA et coque Android), iOS (`apps/ios` + `packages/MeeshySDK`), loi partagée (`packages/shared`), passerelle (`services/gateway`) là où il le faut — :

1. **les cadres de gloire** : de vrais cadres décoratifs pour chaque photo de moment du jeu, fidèles à la planche validée ;
2. **les alertes d'immortalisation** : à chaque étape du jeu, l'utilisateur est invité, au bon moment et sans être bousculé, à immortaliser l'étape avec Mee et Meo dans son cadre ;

jusqu'au staging, puis jusqu'à la production par les chemins que le dépôt prévoit (§ 7, L22), en **vérifiant le maintien et le bon design** à chaque lot.

### 1.1 Ce que l'utilisateur vit (le parcours cible)

- **Murmure → Polyglotte** : à chaque passage de division, l'étape lui est proposée au bon moment (§ 5.15). Le cadre est celui de la **mythologie du rang** (une mythologie du monde différente par rang, du trait le plus simple vers le plus riche). Pas encore de choix d'atmosphère.
- **Ambassadeur, le rang du choix** : la première fois, l'utilisateur **choisit son atmosphère** parmi sept, chacune montrée par son cadre d'Ambassadeur pour sa division, **en commençant par l'Afrique éternelle** (deux collections, Savane et Royaumes), puis Égypte solaire, Olympe, Empire céleste, Aurores du Nord, Abysses, Néon. Il peut « **Choisir plus tard** » : la photo part alors dans l'Afrique éternelle, sans que rien ne soit enregistré comme choix. Il change d'avis quand il veut dans les réglages du jeu (« Mon atmosphère »).
- **Orateur et ensuite** : Meeshy propose **d'abord les décorations de son atmosphère** (au moins trois par rang), et toujours « **Voir les autres atmosphères** ». Ambassadeur et Légende : une décoration par division (V→I) et par collection. Orateur, Oracle, Mythe : trois décorations A, B, C. L'Afrique domine Ambassadeur et Orateur, et **chaque autre atmosphère glisse l'Afrique dans un ou deux de ses cadres** ; le cosmos, de l'infiniment petit à l'infiniment grand, domine Oracle → Mythe (« du quark au quasar » au Mythe).
- **Les autres étapes** ont leurs cadres : paliers de niveau, niveau 100 et Prestige, Meesh frappée (n° 1 puis chaque dizaine), paliers du trésor (des bourses pour la Bourse, des escarcelles, des coffrets, une chambre forte moderne pour le Coffre, un bâtiment de banque pour la Réserve), Flamme (7, 30, 100, 365 jours), réalisation du jour.
- **Photographier** : selfie (caméra avant), photo de la **galerie** (déjà offerte des deux côtés), ou **carte seule** (la fenêtre se remplit du fond de l'atmosphère et de l'emblème du moment). L'aperçu à l'écran **est** l'image finale (H-2). La photo se déplace et se zoome dans la fenêtre. Mee et Meo sont posés autour de la fenêtre photo, **jamais dessus** ; l'utilisateur choisit leur **pose** : au pied, perchés, par les côtés, tenant le ruban, ou « selfie » (Meo entre dans la photo, seulement si l'utilisateur l'a choisi ; un guide de cadrage place le visage hors de sa zone, sans aucune analyse de l'image). Au déclenchement, Mee et Meo frappent l'emblème, comme aujourd'hui.
- **Écrire un message** (facultatif, ≤ 60 graphèmes, une ligne, police manuscrite pour l'écriture latine) sur les cadres qui ont un support : cartouche, ruban ou parchemin (#9973). Il se saisit sur l'écran de résultat, avant de garder ou de partager ; cadre, pose et message s'y changent sans reprendre la photo.
- **Garder** dans le carnet (la photo reste sur l'appareil), **partager** au format story 9:16 ou en carré 1:1, ou les deux. « Story 9:16 » désigne le FORMAT remis à la feuille de partage du système (Instagram, WhatsApp…), jamais une publication dans les stories de Meeshy. Avant de partager, il choisit d'afficher ou non sa Flamme et son lien (H-2).
- **Reprendre** une photo gardée : autre décoration, autre pose, nouveau selfie ou même photo, autre message (#9974). La reprise remplace l'entrée du même moment et garde sa date.
- **Rattraper** au carnet, dans l'ordre de chaque piste, toute étape passée sans photo (« À rattraper », livré par #9961 / PR #9971).
- **Être prévenu, sans être bousculé** :
  - une étape née d'un **geste** (frapper une Meesh, ouvrir le Coffre du jour, passer un Prestige, valider une mission qui fait monter le rang) : l'invitation est le **dernier temps de la célébration** déjà montée pour ce geste, sous la forme de sa carte photo ;
  - une étape **passive** (rang monté par des points reçus, palier atteint app fermée, Flamme constatée au réveil) : une **bannière non modale** qui ne prend pas le focus et s'efface seule ; la toucher ouvre la feuille « Immortaliser » / « Plus tard » ;
  - une étape franchie **app fermée** : au plus une notification discrète et regroupée par jour, hors des heures calmes, qu'on peut couper ;
  - un réglage « Me proposer d'immortaliser » (chaque étape, les grands moments, jamais) gouverne les invitations dans l'app ; « Jeu masqué » coupe tout.
  - Ignorer ne perd rien : l'étape reste au carnet, sans expiration, dans l'ordre, et on ne la relance jamais.

### 1.2 Fini veut dire

- Les sept atmosphères, les mythologies de Murmure → Polyglotte, les moments et le trésor sont dans l'app, web et iOS, en 9:16 et en 1:1, avec un texte vivant dans les sept langues de l'interface (fr, en, es, pt, de, it, ar ; l'arabe de droite à gauche).
- Le rendu de l'app est comparé automatiquement aux rendus de référence du générateur, avec une tolérance chiffrée (§ 8.3), et la règle d'empiètement est une garde de CI.
- Les alertes fonctionnent dans l'app (web et iOS) et hors de l'app (push), avec leurs réglages, leur rythme et leur mesure, sans jamais deux surfaces pour une même étape, ni dans le temps ni entre appareils.
- Toutes les issues sont fermées par leur commit (`Closes #n`) avec leur preuve. Le staging a été recetté avec captures.
- Production : la **passerelle** est promue par `promote-production.yml` avec le feu vert écrit du porteur (le diff touche le schéma, un index et un job, § 2) ; le **web** et **iOS**, qui ne passent pas par ce canal, ont leurs demandes de mise en production déposées par leurs chemins propres (L22), le geste final restant au porteur là où le dépôt le lui réserve.

### 1.3 Hors périmètre

- La photo à plusieurs (#9965, futur : transfert, donc E2EE et consentement). La pose `groupe` de la collection de démonstration `poses` n'est pas livrée.
- Publier la carte dans les stories de Meeshy : la photo quitterait l'appareil, ce qui demande sa propre décision.
- Le rythme du jeu lui-même (#9964, décision produit ouverte) : tu rends la politique d'alerte **paramétrable** dans une seule fonction partagée, avec des défauts prudents chiffrés (§ 5.15.1), tu ne la tranches pas.
- L'application Android native Kotlin (`apps/android`, gelée) : rien n'y est porté. Android, c'est la coque Capacitor de `apps/web`. Chaque lot qui touche une loi à miroirs note, dans son commentaire de clôture, ce que le miroir Kotlin n'a pas reçu.

---

## 2. Les règles du dépôt qui s'appliquent ici (non négociables)

- **Aucune feature sans issue.** Chaque lot du § 7 est une issue au titre SÉMANTIQUE (le résultat attendu ; les codes `L3` vont dans le corps), dans un milestone daté, inscrite au projet « Meeshy — pilotage » (https://github.com/orgs/isopen-io/projects/1) avec `Status = In Progress`. Si `gh project item-edit` rend 403 (GraphQL refusé), dis-le dans un commentaire de l'issue et continue : la branche poussée est la réservation qui fait foi (#5243).
- **Branche poussée dans les quinze minutes** (squelette ou témoin rouge), nommée `feat/glory-<lot>` depuis `origin/dev`. Deux lots qui se disputent un fichier : celui qui n'a rien écrit cède. Les fichiers régénérés partagés (`services/gateway/route-manifest.json`, `packages/shared/api/endpoints.ts`, le catalogue iOS des endpoints, `game.vectors.json`) ne s'écrivent que par un lot à la fois : enchaîne les lots qui les touchent.
- **TDD** : RED → GREEN → REFACTOR, témoins de comportement par l'API publique, fabriques plutôt que `let` muté en `beforeEach`. iOS : protocole `{Service}Providing` au-dessus du type, injection par init avec défaut `.shared`, `Mock{Service}` avec stubs `Result` et compteurs, noms `test_{method}_{condition}_{expected}`.
- **TypeScript strict**, aucun `any`, Zod aux frontières, `type` plutôt qu'`interface`, données immuables, pas de commentaires superflus. Code nommé en anglais (D-13), prose en français.
- **Budget de taille** : plafond dur de 1 200 lignes par fichier écrit à la main (Swift, TS, Python), et aussi pour le Swift généré (`FileSizeBudgetGuardTests` ne l'exempte pas, d'où le choix du § 5.3 de ne générer aucun Swift). `game-photo-flow.tsx` (571 lignes), `GamePhotoFlowView.swift` (401) et `progression-carnet.tsx` (348) sont dans le budget : tu les découpes par responsabilité parce que le chantier y ajoute des étapes, pas parce qu'ils le dépassent. **`RootView.swift` est déjà hors budget** (liste `legacyOverBudget` de `FileSizeBudgetGuardTests`, cliquet cumulatif `legacyLineCeiling`) : tu n'y ajoutes aucune ligne nette.
- **Une source de vérité par chose** : une loi dans `packages/shared/utils/game/`, son miroir Swift **dans le SDK** (`packages/MeeshySDK/Sources/MeeshySDK/Game/`, seul endroit que rejouent les vecteurs), ses vecteurs dans `packages/shared/fixtures/reading-modes/game.vectors.json` ; les quatre se livrent dans la MÊME PR. Un catalogue de cadres généré, jamais recopié à la main.
- **Instant App** : cache-first (jamais de spinner quand le cache a des données), stale-while-revalidate, optimistic update, hors-ligne en lecture, écritures hors ligne en file (OfflineQueue sur iOS, `apps/web/src/lib/offline-queue.ts` sur le web), zéro re-rendu inutile.
- **`dev` = staging** : une PR vers `dev` fusionne quand la CI est verte (`gh pr merge <n> --merge` une fois vert ; jamais `--auto`, qui fusionne sur-le-champ sur ce dépôt). Les lots de cryptographie, d'authentification et de migration de données (le carnet local, le registre et ses index) passent par l'agent `auditeur-adversarial` avant fusion.
- **Production (#9223)** : tu promeus le CODE de la passerelle quand la CI est verte, la recette staging passée et le retour arrière prêt, puis tu rends compte au porteur. Mais l'heuristique de `promote-production.yml` (étape « Portes — CI verte, code fusionné dans dev, aucun changement de données ») compte **tout** changement de `packages/shared/prisma/**`, de `services/gateway/src/jobs/**`, de `**/*migrat*` ou `**/*ensure*Index*`, et toute ligne `createIndex` ajoutée, comme un changement de données : la promotion exige alors l'input `feu_vert_porteur`, l'URL d'un commentaire écrit **par le porteur** (`…#issuecomment-…`). Ce chantier en touche (champs de `GameProfile`, collection `GamePhotoMoment`, son index, le job) : demande ce feu vert d'avance (L10a, L19), avec la liste des champs, la collection, l'index, le job et la sauvegarde vérifiée. **Un index MongoDB ne naît pas du schéma Prisma** dans ce dépôt (#9035, « sans `prisma db push` aveugle ») : il se pose par un script daté `packages/shared/prisma/migrations/<date>-*.mongodb.js` (modèle `2026-10-07-mythic-seat-indexes.mongodb.js` : idempotent, `DRY_RUN=1`, signale les doublons sans les forcer), que tu joues sur staging, et qui attend en production le feu vert et une sauvegarde vérifiée. La webapp et iOS ne passent pas par `promote-production.yml` (L22).
- **Rétrocompatibilité** : un ancien client contre le nouveau serveur, et un nouveau client contre l'ancien serveur, fonctionnent pendant la transition. Rien d'ancien ne se retire avant zéro usage mesuré : ni route, ni champ, ni fichier de couche qu'un catalogue encore servi référence, ni identifiant de cadre publié.
- **La photo ne quitte jamais l'appareil** : ni la photo, ni la photo source, ni le message, ni la composition. Seuls des fichiers de DESIGN publics (décors, vignettes, polices) voyagent, en GET anonyme, et seuls des IDENTIFIANTS d'étape (jamais une image, une date de prise ou un message) remontent à la passerelle.
- **Conformité** : H-2 (aperçu exact, choix avant partage, la carte ne porte aucun nom ; « Afficher ma Flamme » et « Partager avec mon lien » existent sur iOS, `flameOnCard` / `linkOnCard`, et **manquent sur le web**), H-3 (**aucune analyse du visage**, donc la pose selfie se place par une géométrie fixe et un guide de cadrage, jamais par détection), H-4 (la ligne de Meo sur le droit à l'image, `game.photo.image_right` : elle n'existe que sur le web, iOS ne l'a pas), H-5 (partager ne rapporte rien), H-11 (la chaîne d'usage de la caméra iOS ne parle pas des selfies du jeu), H-1 / H-6 / H-9 (parrainage et visiteurs, encore ouverts), B-5 (au plus une notification de jeu par jour, ni compte à rebours, ni pression : ni « ton ami t'attend », ni aucune forme de « t'attend »).
- **Artifacts** : seulement brouillons, design et comptes rendus. La planche et les écrans neufs peuvent être publiés comme rendu de design ; aucune page de suivi. L'état vit dans les issues.
- **Agents spécialisés** (`.claude/agents/`) : `auditeur-adversarial` (carnet v2, registre et ses index, route publique, alertes et push), `conformite-juridique` (licences OFL, motifs culturels ou sacrés et histoires des cadres, droit à l'image, textes des alertes, mesure et consentement, sauvegarde iCloud), `sre-infra` (hébergement des couches, poids de l'image Docker, interrupteur du push, mises en production). Ils outillent ; ils ne remplacent ni un audit tiers ni un avis juridique ou culturel signé, et ils le disent quand c'est cela qui est requis.
- **Leçons** : après toute correction du porteur, un fichier `tasks/lessons/<AAAA-MM-JJ>-<slug>.md`.
- **Worktrees** : jamais plus de quatre ouverts, toutes sessions confondues (`.claude/hooks/worktree-limit.sh` refuse le cinquième). Un worktree fusionné et inactif se retire.

---

## 3. Les sources de vérité

| Sujet | Source | Remarque |
|---|---|---|
| Design des cadres | `docs/product/cadres-de-gloire/` : `README.md`, `generateur/{lib,ateliers,mee,fonts,v1}`, `manifests/<collection>.json`, `planches/<collection>.jpg`, `controle/empietements-<collection>.json` ; après L0 : `reference/` (empreintes figées), `prototype/`, `ecrans/` | Poussé sur la branche `docs/cadres-de-gloire-sources` (commit `c5b1390040`, `Refs #9963`), sans PR au 2026-10-10. Premier geste du lot 0 : la PR vers `dev`. |
| Rendu publié | https://claude.ai/artifact/QUWf5znxXcX1qGLEmGQGV2 (page « Sept atmosphères » + prototype « choisir son atmosphère à Ambassadeur, puis sa décoration à Orateur ») | Éphémère : L0 versionne le prototype sous `docs/product/cadres-de-gloire/prototype/`. En cas d'écart, le dépôt a raison. |
| Parcours, règles de proposition | les issues #9963 (cadres, label `décision-produit`), #9972 (atmosphère), #9973 (message), #9974 (reprise et poses), #9975 (trésor), parente #9382 ; milestone n° 149 « Le jeu se comprend et se joue chaque jour » (échéance 2026-10-19) | #9964 (rythme) et #9965 (à plusieurs) sont dans le milestone sans être sous-issues. #9972 demande une recomposition des photos gardées que ce prompt ne fait pas sans décision (D21). |
| Loi du rattrapage et de la proposition | `packages/shared/utils/game/photo-catch-up.ts` : exportés `PHOTO_TRACKS`, `PHOTO_FLAME_THRESHOLDS`, `photoStepsReached`, `photoCatchUp`, `photoTrackOf`, `photoOfferFor` ; `OFFER_PRIORITY` est une constante PRIVÉE (non exportée). `photo-moments.ts` (vague 2 : trophée, ligue, saison, Prestige). La situation du client : `catchUpStandingOf` (`apps/web/src/lib/game-photo/moments.ts`) et son jumeau iOS `PhotoCatchUpStanding.init(game:)` | Miroir iOS côté APP : `apps/ios/Meeshy/Features/Main/Game/Photo/GamePhotoCatchUp.swift`, testé par `apps/ios/MeeshyTests/Unit/Game/GamePhotoCatchUpTests.swift`, **sans vecteurs**. Le miroir de `photo-moments.ts` est, lui, dans le SDK (`GameGuideV2.swift`, loi `photo-moment` des vecteurs). L3b déplace le premier dans le SDK. |
| Lois du jeu | `packages/shared/utils/game/` : `glory.ts` (`GLORY_RANKS` de Murmure à Légende ; le Mythe vient du type `GloryRankOrMythic`), `levels.ts` (`LEVEL_TIER_KEYS`, 20 paliers), `treasury.ts` (`TREASURY_TIERS`), `flame.ts` (`FLAME_FORMS`), `mint.ts` (`meeshEdition`), `rank-crest.ts` (blason), `chest.ts`, `personal-mission.ts` | Miroirs : `packages/MeeshySDK/Sources/MeeshySDK/Game/`. |
| Vecteurs croisés | `packages/shared/fixtures/reading-modes/game.vectors.json` (66 lois au 2026-10-10, aucune `photo-catch-up`), écrits par `packages/shared/__tests__/game/game-vectors-law.ts` et `game-vectors-law-v2.ts`, régénérés par `cd packages/shared && UPDATE_GAME_VECTORS=1 npx vitest run __tests__/vectors/game.vectors.test.ts` ; rejoués par `packages/MeeshySDK/Tests/MeeshySDKTests/Game/GameLawVectorTests.swift` + `GameLawVectorEvaluator*.swift` (`wave2Laws`) | Le test Swift exige l'ensemble EXACT des lois (`laws == wave1.union(wave2Laws)`). `sdk-tests.yml` ne se déclenche que sur `packages/MeeshySDK/**` : une PR TS seule qui ajoute une loi ferait rougir la PR SDK suivante d'un autre lot (L3b corrige). |
| Précédent de cadres en données | cadres de capture d'appel : JSON `packages/shared/design/call-capture-frames/`, schéma `apps/web/src/lib/calls/frames/frame-spec.ts` (`zod/mini`), Swift généré par `cd packages/shared && bun run generate:call-frames`, fraîcheur `packages/shared/__tests__/call-capture-frames-swift.test.ts` (vitest), fixture de géométrie `packages/shared/design/call-capture-frames-layout.fixture.json` (produite par `apps/web/scripts/generate-frame-layout-fixture.ts`), planche Playwright (`apps/web/scripts/render-frame-board.ts`) | Même chaîne, sauf le Swift généré (§ 5.3). |
| Photo web | `apps/web/src/lib/game-photo/` (`moments.ts`, `layout.ts`, `compose.ts`, `render.ts`, `art.ts`, `env.ts`, `flow.ts`, `camera.ts`, `notebook.ts`, `share.ts`, `referral.ts`), `apps/web/src/components/game-photo-{frame,flow,offer}.tsx`, `apps/web/src/routes/progression-{photo.ts,carnet.tsx,lead.tsx,succes.tsx}` | |
| Photo iOS | `apps/ios/Meeshy/Features/Main/Game/Photo/` (14 fichiers : `GamePhotoCanvasView`, `GamePhotoComposer`, `GamePhotoLayout`, `GamePhotoFlow`, `GamePhotoSession`, `GamePhotoFlowView`, `GamePhotoNotebook`, `GamePhotoCoordinator`, `GameNotebookViewModel`, `GamePhotoCatchUp`, `GamePhotoMoments`…), `apps/ios/Meeshy/Features/Main/Game/GameNotebookView.swift` | |
| Célébrations existantes | iOS : `EngagementRevealHost.swift` + `EngagementRevealQueue.swift` (posés par `.engagementReveal(router:)` dans `apps/ios/Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift:173` et `iPadRootViewLayers.swift:273`), `Game/Choreography/MintStrikeScene.swift`, `Game/Choreography/RankBlasonStage.swift`, `Game/Wave2/GameGuideV2.swift`, `Game/GameMomentPresence.swift` ; web : `components/game-mint-strike.tsx`, `components/rung-reveal.tsx` | Le coordinateur unique des alertes (§ 5.15.3) les fait passer par la même file. |
| Mee et Meo | source UNIQUE du dessin : `apps/web/src/lib/mee/` (SVG, `findMeeSticker`, `renderMeeSticker`, duos dans `catalog-duo.ts`) ; iOS reçoit des WebP filmés par `apps/web/scripts/mee-ios-stickers.ts` vers `packages/MeeshySDK/Sources/MeeshyUI/Resources/MeeStickers/` (`mee.<id>.webp`, 360×360) | Les 32 PNG de `generateur/mee/` sont ces stickers ROGNÉS à leur boîte alpha ; tous existent des deux côtés, duos compris (vérifié le 2026-10-10). |
| Conformité | `docs/product/jeu-meeshy-conformite-2026-10-05.md` | |
| Décisions | `apps/web/decisions.md`, `apps/ios/decisions/2026-10-05-le-jeu-cote-app-la-loi-vient-du-sdk-les-choregraphies-sont-des-fonctions-du-temps.md`, `packages/shared/decisions/2026-10-05-la-vague-2-du-jeu-est-additive-chaque-extension-tombe-seule-et-les-reglages.md` | |
| Notifications de jeu | `services/gateway/src/services/game/GameNotifier.ts` (plafond, `onceKey` 14 jours, `collapseId`), `services/gateway/src/services/game/gameClock.ts` (`effectiveZone`, `dayKeyOf`), `packages/shared/utils/notification-dnd.ts` (`isWithinDnd`), `packages/shared/utils/game/notifications.ts`, `packages/shared/utils/notification-string-templates.ts` (`TEMPLATES`, 8 langues), `services/gateway/src/jobs/game-mission-window.ts`, `PersonalMissionService.notifyDue` | |
| Mise en production | `.github/workflows/promote-production.yml` + `infrastructure/scripts/meeshy-promote-production.{sh,md}` (passerelle, traducteur, agent ; jamais la webapp), `.github/workflows/docker.yml` (image web de production sur un tag `v*.*.*`, `API_BASE=''`), `.github/workflows/ios-release.yml` (environnement protégé `appstore-submit`) | |

---

## 4. L'état des lieux (2026-10-10 ; à revérifier)

### 4.1 Les sources de design

- 191 cadres en SVG 540×960 (9:16 seulement), 11 collections : `savane`, `royaumes`, `egypte`, `olympe`, `celeste`, `nord`, `abysses`, `neon` (19 cadres chacune : `ambassadeur-5..1`, `orateur-a/b/c`, `oracle-a/b/c`, `legende-5..1`, `mythe-a/b/c`), `moments` (16 : paliers `lueur/aurore/galaxie/nebuleuse/supernova/singularite`, flamme 7/30/100/365, meesh 1/10/100/1000, jour a/b), `tresor` (14 : bourse a/b, escarcelle a/b, coffret a/b, coffre a/b/c, tresor a/b, reserve a/b/c), `poses` (9 : un cadre Olympe Ambassadeur I en cinq poses, trois supports de message, une photo à trois). Murmure → Polyglotte : seulement la première proposition `generateur/v1/frames.py` (deux options par rang aux mythologies mêlées, polices système, photo pleine page, sans fenêtre ni oiseaux).
- Invariant de design dessiné et écrit au README : chaque atmosphère autre qu'Afrique éternelle glisse l'Afrique dans un ou deux cadres d'Ambassadeur ou d'Orateur. Aucune garde ne le protège encore d'une régénération.
- **Texte et oiseaux sont CUITS** dans chaque SVG (oiseaux en PNG base64 : 40,9 Mo des 95 Mo). Environ 4 500 filtres SVG (`feTurbulence`, `feSpecularLighting`, `feDisplacementMap`…), jusqu'à 46 000 éléments par cadre, environ 1 s de rendu Chromium par cadre. **Inutilisable à l'exécution**, et iOS ne sait pas peindre ces filtres.
- Couches réelles mesurées : photo masquée à une fenêtre propre au cadre (une vingtaine de formes : arche, ogive, ovale, octogone, pignon, cartouche, lune, ruyi, bégonia, amande, fer à cheval, pierre runique, tronc creux…) ; des couches posées SUR la photo dans la fenêtre (`light_grade` en `mix-blend-mode: screen`, `inner_shadow`, `horizon_glow`) ; le blason du générateur (écu + losanges de division) qui n'est PAS celui de l'app (`rank-crest.ts`, #9636) ; des oiseaux dessinés avant une partie du texte dans 128 cadres et suivis d'un avant-plan dans 129 (queues de ruban au bec, herbes) ; huit implémentations de plaque, dont la hauteur change avec le message. Plusieurs cadres posent un sticker **duo** (deux oiseaux dans un seul sticker : `duo-mee-trinquer`, `duo-meo-selfie`, `duo-main-dans-la-main`, `duo-on-danse`…) comme un seul `bird(...)`.
- **Manifestes non normalisés** : `rank` mêle clés et libellés (« ambassadeur », « Ambassadeur », « Palier de niveau », « Bourse »), `option` hétérogène, `layout` en prose, aucun identifiant stable, noms et histoires en français seulement (64 221 caractères d'histoires).
- **Empiètements** : selon `controle/`, 113 cadres sur 191 hors règle (overlap > 250 px ou depth > 6 px), aucun visage touché ; seule l'Empire céleste est conforme ; Néon 18/19. Le détecteur prend aussi pour « fenêtre » les décors magenta (faux positifs au Néon). Le porteur a demandé de corriger ces empiètements (« corrige les empiètements de Mee et Meo ») ; la correction, interrompue le 2026-10-10, n'est faite que pour l'Empire céleste : **rappelle-lui cet état au lot L0**, répare le détecteur avant toute correction, et fais-lui revalider l'avant/après avant que l'app ne peigne (L2).
- Déterminisme : une génération complète est identique à l'octet ; une régénération partielle change les identifiants SVG sans changer le rendu, parce que `nid()` est un compteur global défini dans CINQ ateliers (`neon/kit.py`, `olympe/common.py`, `celeste/common.py`, `royaumes/motifs.py`, `tresor/kit.py`), pas dans `lib/`.
- `generateur/.gitignore` ne liste que `out/`, `__pycache__/`, `*.pyc` : le dossier `export/` que crée L1 n'y est pas encore.
- Polices : Cinzel, Cinzel Decorative (nom réservé « Cinzel »), Cormorant Garamond, Fraunces, Manrope, Caveat, toutes SIL OFL, en woff2 latin + latin-ext seulement (rien pour l'arabe ni pour les autres écritures). 30 fichiers anonymisés `f0…f29.woff2` dont 16 uniques, décrits par `fonts.css` / `g.css`, **sans le texte de la licence OFL ni la correspondance fichier → famille** que l'OFL exige à la redistribution. Graisses demandées mais non chargées (Manrope 600 ×143, Fraunces 700, Caveat 600) : la planche montre une graisse substituée.

### 4.2 L'app

- **Web** : l'aperçu est du DOM (`GamePhotoFrame`, texte en `cqw`), l'image finale est un canvas qui relit quatre SVG du DOM (`art.ts`, `ART_SLOTS` emblem/mee/meo/signature) et repeint le texte avec une largeur ESTIMÉE (`referral.ts`, `fitBannerLine`). La photo couvre tout le canvas. `PaintContext` (`compose.ts`) a `save`/`restore` mais ni `clip`, ni `Path2D`, ni `measureText`, ni `globalAlpha`. Sortie en PNG. Mee et Meo fixes. Le déroulé est un réducteur pur (`flow.ts` : `offer` → `camera` → `striking` → `result`, avec `selfie`, `gallery`, `card`). Le carnet (IndexedDB `meeshy-game-notebook`, NON cloisonné par compte, `NotebookEntry` sans `userId`) ne garde que les deux images composées ; « Plus tard » (`defer`) écrit un `expiresAt` à 7 jours (`PENDING_DAYS`) et le libellé `game.notebook.pending_until` dit « En attente jusqu'au {date} ». Aucun `navigator.storage.persist()`. Pas de « Reprendre ». Ni « Afficher ma Flamme » ni « Partager sans mon lien » (H-2 partiel). La ligne H-4 existe (`game.photo.image_right`).
- **iOS** : `GamePhotoCanvasView` est UNE vue pour l'aperçu et `ImageRenderer` (bonne base), avec la frappe de l'emblème au déclenchement (`strike`, état `.striking` de `GamePhotoFlow`). Mee `mee-sourire` et Meo `meo-salut` en dur ; aucune décoration ; police système arrondie ; JPEG q0,9. Interrupteurs `flameOnCard` et `linkOnCard` (H-2). Galerie par `PhotosPicker`. Le carnet (`Application Support/MeeshyGame/<userId>/Notebook`) ne garde que les deux JPEG ; « Plus tard » (`postpone`) écrit un `expiresAt` à 7 jours et `isExpired` purge ; le libellé est déjà `game.notebook.pending` (« En attente »). `MeeStickerCatalog.stillImage(id:)` relit le fichier à chaque appel, depuis le `body`. Une garde (`GameSourceGuardTests.test_thePhotoFlowNeverTouchesTheNetwork`) interdit tout réseau sous `Game/Photo/`. Aucune police embarquée dans l'app. Aucune ligne H-4 parmi les 44 clés `game.photo.*` de `Localizable.xcstrings`. `NSCameraUsageDescription` (`Info.plist:67`, localisée dans `InfoPlist.xcstrings`) parle de « messages, video calls, and AR experiences » (H-11).
- **Propositions** : web, l'offre ne vit que sur la page sommaire Progression, repliée derrière la ligne de Mee (aucune fiche ne monte `usePhotoMoments` : la 10e Meesh frappée sur sa fiche n'est jamais proposée en direct). iOS : par page de Progression, et `EngagementRevealHost` ne propose une photo que pour un succès. Comme la bannière joueur rafraîchit le cache AVANT l'ouverture de Progression, une étape franchie app fermée n'est en pratique jamais proposée en direct : seul le carnet la rattrape.
- **Serveur** : aucune détection d'étape photo, aucun événement socket de jeu. `GloryService.openLevelsIfRankRose` compare le rang avant/après (pas la division). Le rang et les paliers montent aussi APP FERMÉE (points reçus d'autrui → `EngagementService.afterScore` → `game.onScore`). `GameNotifier` : « Jeu masqué » et `notification.gameEnabled` coupent, plafond d'une notification de jeu par jour dans le fuseau (`effectiveZone`), `onceKey` retenue 14 jours **y compris quand `createNotification` refuse** (Ne pas déranger ⇒ `skipped:declined` : seul le créneau du jour est rendu). `NotificationService.createNotification` SUPPRIME sous « Ne pas déranger » au lieu de différer. `GameStandingService` sert le jeu d'un AUTRE membre (facettes filtrées, paliers jamais des comptes, Flamme réduite à sa forme) : il ne peut pas servir la détection.
- **Première peinture web** : 89,99 Ko pour un plafond de 90 (dernière mesure inscrite dans `apps/web/budgets.json`, #9848, 2026-10-10), soit une dizaine d'octets de marge ; chaque nom de chunk importé par l'entrée en coûte de 13 à 30.

### 4.3 Écarts entre catalogue et loi (chacun est traité au § 5.4 ou au § 6)

1. Paliers : 19 étapes photographiables (`LEVEL_TIER_KEYS` sauf `etincelle`) pour 6 cadres.
2. Meesh : n° 1 puis chaque dizaine (`meeshSteps`) pour 4 cadres (1, 10, 100, 1000).
3. Flamme : la loi dit 7 = `flamme`, 30 = `brasier`, 100 = `astre`, 365 = `soleil` ; le manifeste dit 7 · braise, 30 · flamme, 100 · brasier, 365 · phénix. **La loi gagne** pour le sur-titre et le titre ; seul le nom poétique du cadre vient du manifeste.
4. « Réalisation du jour » (jour a/b) : aucune piste, aucun `PhotoEmblem`, aucune détection.
5. Sans cadre dessiné : `start`, `level-100`, `prestige`, `achievement`, `trophy`, `league-up`, `season`.
6. Orateur et Oracle : cinq divisions dans la loi pour trois décorations A, B, C. Mythe : une seule étape, `rank:mythe:0`.
7. Pose par défaut « selfie » sur 11 cadres : contraire à « selfie seulement choisi exprès ».
8. Format 1:1 exigé par #9963, aucun cadre dessiné en carré.
9. Le trésor peut redescendre : `treasurySteps` lit le palier COURANT, une dépense fait disparaître l'étape du carnet.

---

## 5. L'architecture cible

Chaque point dit s'il est **tranché** (technique, à consigner dans le `decisions/` du dossier concerné et dans un commentaire de l'issue) ou **recommandé, à faire trancher** (il entre dans une issue `décision-produit` du § 6.2, et tu avances sur la recommandation en la rendant réversible, sans jamais la poser en silence).

### 5.1 Le format : des couches raster et des données vivantes (tranché)

Le texte de #9963 (étape 2) demande « une table de pièces comme `rank-crest.ts`, peinte en SVG par le web et en SwiftUI par iOS ». C'est intenable pour ces 191 cadres (filtres, milliers d'éléments, une seconde de rendu, iOS incapable). **Tranche, et consigne l'écart** (`packages/shared/decisions/<date>-un-cadre-de-gloire-est-un-jeu-de-couches-raster-et-de-donnees-vivantes.md` + commentaire sur #9963) :

- **Raster, produit par le générateur** (Chromium, moteur de référence du détecteur), pour tout ce que seul le générateur sait peindre, en WebP avec alpha, chaque couche **rognée à sa boîte** et déclarée avec son décalage (`box`) :
  - `decor` : 1080×1920, fenêtre photo à alpha 0, sans texte, sans oiseaux, sans blason ; il porte la **bande** du bandeau de parrainage dessinée complète et neutre, pour qu'un cadre sans lien ne montre aucun trou ;
  - `windowFill` : ce qui remplit la fenêtre quand il n'y a pas de photo (carte seule) : le fond de l'atmosphère, découpé à la fenêtre ; l'emblème du moment y est peint en grand par l'app (vivant) ;
  - `grade` (facultatif) : ce qui se pose SUR la photo dans la fenêtre (`light_grade`, `inner_shadow`, `horizon_glow`), avec son mode de fusion déclaré (`screen` ou `normal`), découpé à la fenêtre ;
  - `front` (facultatif) : l'avant-plan, en deux rangs possibles, `under-birds` et `over-birds` (herbes, queues du ruban) ;
  - `plate` en deux variantes, `plain` et `message`, quand la plaque est un panneau dessiné (sa hauteur change avec le message) ;
  - `thumb` : vignette 270×480 du cadre complet, pour le sélecteur et l'aperçu d'alerte.
- **Données, peintes par l'app** : le texte (localisé), Mee et Meo (depuis leurs sources uniques), le blason et l'emblème (depuis `rank-crest.ts` et les emblèmes actuels), le bandeau de parrainage. Les oiseaux vivants rendent les cadres 3 à 5 fois plus légers et permettent de changer de pose ; le texte vivant permet les sept langues ; le blason vivant garde gemmes, niveau gravé et halo du Mythe vrais.
- Ordres de grandeur mesurés : couche décor WebP q80-82 en 1080×1920 de 70 à 148 Ko (8,3 Mo une fois décodée) ; 18 à 28 Mo pour tout le catalogue en 9:16.

### 5.2 Le contrat d'un cadre (tranché, schéma Zod)

Un manifeste NORMALISÉ par collection, `packages/shared/design/glory-frames/<collection>.json`, validé par un schéma `zod/mini` dans `packages/shared/types/glory-frames.ts` (fail-closed par fichier, comme `frame-catalogue.ts:parseMotifs`). Coordonnées en pixels de l'image finale (le repère de design 540×960 multiplié par 2). Les couleurs sont des DONNÉES (`"#RRGGBBAA"`), jamais des littéraux de code. Les fichiers de couche sont **adressés par leur contenu** (`<sha16>.webp`, § 5.10). Forme cible (à affiner en RED) :

```json
{
  "schema": 1,
  "collection": "savane",
  "atmosphere": "afrique",
  "frames": [{
    "id": "savane.ambassadeur-5",
    "family": "rank",
    "appliesTo": { "rank": "ambassadeur", "division": 5 },
    "option": "V",
    "motifs": ["afrique"],
    "i18n": { "name": "game.frame.savane.ambassadeur-5.name", "story": "game.frame.savane.ambassadeur-5.story" },
    "thumb": { "src": "9c1f04ab77e2d310.webp", "bytes": 0, "sha256": "…" },
    "formats": {
      "story": {
        "size": [1080, 1920],
        "window": { "path": "M…Z", "box": [124, 524, 832, 956], "fit": "cover", "veilMaxAlpha": 0 },
        "stack": ["photo", "grade", "decor", "crest", "front:under-birds", "birds", "front:over-birds", "plate", "text", "banner"],
        "layers": {
          "decor": { "src": "…", "bytes": 0, "sha256": "…" },
          "windowFill": { "src": "…", "box": [124, 524, 832, 956] },
          "grade": { "src": "…", "box": [124, 524, 832, 956], "blend": "screen" },
          "front": { "under-birds": { "src": "…", "box": [0, 1380, 1080, 220] } },
          "plate": { "plain": { "src": "…", "box": [96, 1500, 888, 220] }, "message": { "src": "…", "box": [96, 1460, 888, 300] } }
        },
        "crest": { "cx": 540, "cy": 224, "size": 176, "gems": "division" },
        "text": {
          "kicker":  { "x": 540, "baseline": 1588, "anchor": "middle", "maxWidth": 640, "font": { "family": "Manrope", "weight": 800, "size": 26, "minSize": 18, "tracking": 0.18, "case": "upper" }, "fill": { "solid": "#F4E3B5FF" }, "effects": [{ "kind": "shadow", "dy": 2, "blur": 6, "color": "#00000099" }], "contrast": 5.4 },
          "title":   { "…": "…" },
          "date":    { "…": "…" },
          "message": { "support": "cartouche", "…": "…", "maxGraphemes": 60 }
        },
        "slots": [{ "key": "count", "i18n": "game.frame.slot.meeshes_kept", "…": "…" }],
        "birds": {
          "default": "perches",
          "layouts": {
            "perches": { "mee": { "sticker": "mee-coucou", "box": [36, 492, 180, 180], "rotate": -6, "flip": false, "z": "under-plate" }, "meo": { "…": "…" }, "validated": { "overlap": 0, "depth": 0, "face": 0 } },
            "duo":     { "pair": { "sticker": "duo-mee-trinquer", "box": [80, 1300, 300, 300], "rotate": -3, "flip": false, "z": "under-plate" }, "validated": { "overlap": 0, "depth": 0, "face": 0 } },
            "selfie":  { "meo": { "…": "…", "inWindow": true }, "faceGuide": { "cx": 420, "cy": 820, "rx": 150, "ry": 190 }, "validated": { "face": 0 } }
          }
        },
        "banner": { "box": [0, 1720, 1080, 200] }
      },
      "square": null
    }
  }]
}
```

Règles du contrat :
- `stack` déclare l'ordre des couches : **le peintre ne le devine jamais**. Sans photo, `windowFill` puis l'emblème du moment peint en grand prennent la place de `photo`.
- `appliesTo` porte les **clés de la loi**, jamais un libellé : `rank ∈ GloryRankOrMythic` (`GLORY_RANKS` + `'mythe'`, division `null` pour le Mythe), `LEVEL_TIER_KEYS`, `TREASURY_TIERS`, les seuils de `PHOTO_FLAME_THRESHOLDS`, `meeshEdition`.
- `motifs` étiquette ce que le cadre porte (`afrique`, `cosmos`…), posé par l'atelier ou une table du normaliseur : il porte l'invariant « un peu d'Afrique dans chaque atmosphère » (garde au L3).
- Un emplacement de texte décrit : position (ligne de base), ancre, `maxWidth`, taille et `minSize` (réduction pour tenir, puis ellipse), famille, graisse, style, interlettrage, `case` (ignorée en arabe), remplissage uni ou dégradé (arrêts résolus), effets (`shadow`, `glow`, `outline`, `engrave` ; partir des `TEXT_EFFECTS` de `apps/web/src/lib/calls/frames/frame-spec.ts`), `path` facultatif pour le texte courbe (`textPath` : légendes des médailles et des pièces), et `contrast`, le pire contraste mesuré à l'export contre ce qui est réellement dessous (panneau ou décor).
- Les données qui vivent deviennent des `slots` : « N Meeshes gardées », « Mythe nº 42 », sceau « Nº 42 / 100 », numéro et légende des médailles et des pièces (dont la date), « Jour 283 », liste des missions, Flamme (retirable, H-2). Les textes de décor qui dépendent de la langue (CELLULE, ATOME, TOILE COSMIQUE, DU QUARK AU QUASAR, CARNET DE BORD, Missions du jour, initiales L M M J V S D, boussole N E S O, ON AIR, RÉSERVE MEESHY) deviennent aussi des `slots` traduits. Les textes neutres (10⁻³⁵ m, Au, Fe, HUGINN) restent cuits.
- `birds.default` n'est **jamais** `selfie`. Une mise en page porte soit deux ancres (`mee`, `meo`), soit une seule (`pair`, mise en page `duo`, pour un sticker à deux oiseaux), jamais les deux. `faceGuide` (déclaré pour `selfie` ; ailleurs, le centre de la fenêtre) est une GÉOMÉTRIE fixe, jamais un résultat d'analyse (H-3).
- Identifiants : les slugs des collections et des clés de loi restent en français, comme les clés de rang de la loi (ce sont des DONNÉES qui reflètent la loi) ; le code reste en anglais (D-13). Atmosphères : `afrique` (collections `savane`, `royaumes`), `egypte`, `olympe`, `celeste`, `nord`, `abysses`, `neon`. Collections hors atmosphère : `mythologies` (Murmure → Polyglotte, à créer), `moments`, `tresor`. `poses` reste une collection de DÉMONSTRATION (référence des ancres et des supports), non livrée comme cadres.
- **Un `id` de cadre publié ne se retire jamais** : il peut seulement être masqué des suggestions (`hidden: true`), parce qu'une entrée de carnet ou une version cliente le référence.

### 5.3 La chaîne de production (tranché)

```
docs/product/cadres-de-gloire/generateur/        (sources de design, Python + Chromium épinglé)
  └─ lib/export.mjs → generateur/export/<collection>/        (couches WebP + export.json brut ; ignoré par git)
       └─ cd packages/shared && bun run import:glory-frames    (local ou job du générateur ; valide le schéma)
            ├─ packages/shared/design/glory-frames/<collection>.json        (LE contrat, versionné)
            ├─ services/gateway/assets/glory-frames/<sha16>.webp            (couches adressées par contenu, versionnées)
            └─ apps/ios/Meeshy/Resources/GloryFrames/<sha16>.webp           (socle embarqué iOS, mêmes octets)
contrat ─ cd packages/shared && bun run generate:glory-frames    (sans navigateur ; rejoué par le témoin de fraîcheur en CI)
            └─ packages/shared/design/glory-frames-layout.fixture.json      (parité de géométrie web ↔ iOS)
```

- **Deux commandes, parce que l'export exige Chromium et que la CI de `packages/shared` n'en a pas.** `import:glory-frames` (export → contrat + couches) tourne en local ou dans le job du générateur (L2) ; `generate:glory-frames` (contrat → fixture) est rejouée par le témoin de fraîcheur. En-tête « GÉNÉRÉ — ne pas éditer » sur chaque sortie textuelle.
- **iOS lit le contrat JSON comme RESSOURCE de bundle, sans Swift généré.** Le précédent des appels mesure 236 à 340 lignes de Swift pour 10 à 19 Ko de JSON ; une collection de gloire (19 cadres, chemins de fenêtre, quatre emplacements de texte et plus, jusqu'à six mises en page × deux formats) dépasserait le plafond de 1 200 lignes. Le dossier `../../packages/shared/design/glory-frames` entre dans la cible de l'app comme le dossier `../../packages/shared/design` entre déjà dans celle des tests (`apps/ios/project.yml`, `type: folder` + `buildPhase: resources`, leçon 182), et se décode en `Codable` à la demande. Un XCTest décode chaque JSON embarqué et relit la fixture de géométrie (déjà présente dans le bundle de tests par le dossier `design/`). Une source, aucun Swift à budgéter, un seul dossier à inscrire.
- Un témoin de fraîcheur (`packages/shared/__tests__/glory-frames-generated.test.ts`, vitest, sur le modèle de `call-capture-frames-swift.test.ts`) : le contrat se parse ; la fixture régénérée en mémoire égale la fixture versionnée ; les octets et sha256 déclarés égalent ceux des fichiers réels sous `services/gateway/assets/glory-frames/` et sous le socle iOS ; tout fichier présent est référencé par le contrat courant OU par un catalogue encore servi (`packages/shared/design/glory-frames/retained.json`, § 5.10).
- La fraîcheur de l'EXPORT lui-même (le contrat reflète-t-il encore le générateur ?) se juge dans le job du générateur (L2), Chromium épinglé : géométrie à l'identique, couches à la tolérance du § 8.3, jamais par leurs octets.
- Les générateurs apprennent dans `lib/` : `Card.layer(kind)` pose un `<g data-layer="…">` ; `data-slot` sur chaque `<text>` vivant ; `nid()`, aujourd'hui défini dans cinq ateliers, devient un compteur porté par `Card` (`lib/base.py`), vers lequel les ateliers pointent (seule modification d'atelier admise, avec les étiquettes de couches, d'emplacements et de `motifs`) ; les fonctions recopiées dans 8 ou 9 ateliers (`inscription`, `inner_shadow`, `cosmic_web`…) se factorisent dans `lib/` quand l'export doit les lire ; l'exportateur unique `lib/export.mjs` bascule la visibilité couche par couche, rend à `deviceScaleFactor: 2` avec `omitBackground`, rogne chaque couche à sa boîte, encode en WebP (`sharp`), mesure le contraste des emplacements de texte contre les pixels réels dessous, et lit pour chaque `data-slot` police, taille, graisse, interlettrage, ancre, remplissage, effets, chemin et `getBBox()`. Il lance Chromium par `lib/launch.mjs` (aligné sur `apps/web/scripts/lib/browser.mjs`), jamais par un chemin machine en dur.
- Les polices du générateur sont chargées dans les BONNES graisses (polices variables à plage de graisses) ; les cibles de référence (§ 8.3) sont rendues ainsi, donc ce que l'app peint.

### 5.4 La loi de proposition des cadres (recommandé ; la loi est tranchée, ses règles produit sont au § 6)

Une loi pure, `packages/shared/utils/game/glory-frames.ts`, exportée par `utils/game/index.ts`, avec son miroir Swift dans `packages/MeeshySDK/Sources/MeeshySDK/Game/GameGloryFrames.swift` (moteur de règles sans état : sa place est le SDK, comme les autres lois du jeu ; elle s'appuie sur `photoTrackOf`, que L3b amène dans le SDK) et ses vecteurs (loi `glory-frames`, déclarée dans `game-vectors-law-v2.ts` et dans `GameLawVectorEvaluatorV2.wave2Laws`).

Signature indicative : `gloryFramesFor({ stepId, atmosphere, lastChosen, catalog }) → { needsAtmosphere: boolean, suggested: FrameRef[], others: ReadonlyArray<{ atmosphere, frames: FrameRef[] }>, preselected: FrameRef | null }`.

| Étape (identité de la loi) | Cadres proposés d'abord | Ensuite |
|---|---|---|
| `rank:<murmure…polyglotte>:<d>` | les cadres A/B de la mythologie du rang (collection `mythologies`) | rien (pas d'atmosphère avant Ambassadeur) |
| `rank:<ambassadeur…legende>:<d>` ou `rank:mythe:0`, atmosphère `null` | `needsAtmosphere: true` ; `suggested` = l'Afrique éternelle (atmosphère par défaut) ; l'écran de choix montre les sept atmosphères, l'Afrique en premier, chacune par son cadre du rang et de la division | « Choisir plus tard » : photo dans l'Afrique, rien d'enregistré |
| `rank:ambassadeur:<d>` et `rank:legende:<d>` | le cadre de la division `d` de chaque collection de l'atmosphère, puis les quatre autres divisions du rang dans l'atmosphère (recommandation § 6, D3) | « Voir les autres atmosphères » |
| `rank:<orateur\|oracle>:<d>` et `rank:mythe:0` | A, B, C de l'atmosphère (six pour l'Afrique : Savane puis Royaumes), quelle que soit la division | autres atmosphères |
| `tier:<key>` | le cadre dessiné du palier atteint ou, sinon, celui du palier dessiné le plus proche en dessous (recommandation § 6, D4) | |
| `level-100:0`, `prestige:<n>`, `start`, et les moments de la vague 2 (`photo-moments.ts` : succès, trophée, ligue, saison) | les cadres du rang courant (atmosphère ou mythologie) avec la plaque du moment (recommandation § 6, D5) ; sinon la carte simple actuelle | |
| `meesh:<n>` | n = 1 → `moments.meesh-1` ; sinon par édition : argent → `meesh-10`, or (chaque 100e) → `meesh-100`, prisme (chaque 1 000e) → `meesh-1000` | |
| `treasury:<key>` | les cadres a/b(/c) du palier | |
| `flame:<7\|30\|100\|365>` | le cadre du seuil | |
| `day:<AAAA-MM-JJ>` | jour a/b (D6) | |

- **`lastChosen`** est le dernier `frameId` gardé pour la MÊME famille (rang, palier, trésor…). Il se DÉDUIT des entrées du carnet de l'appareil (le choix persistant de #9963), sans stockage supplémentaire, et l'appelant le remet à la loi. La loi ne le retient que s'il appartient à l'atmosphère COURANTE ; sinon `preselected` = le premier de `suggested`.
- Choisir le cadre d'une AUTRE atmosphère vaut pour CETTE photo seulement. L'écran de résultat propose alors « Faire de <Atmosphère> mon atmosphère » : un geste explicite, jamais implicite.
- Ordre de l'Afrique : la collection du dernier choix d'abord, sinon Savane puis Royaumes.
- La loi ne lit jamais l'horloge et ne touche jamais au réseau.

### 5.5 La composition côté client (tranché)

**Un seul peintre par plateforme, pour l'aperçu ET l'image finale.**

- **Web** : un module PARESSEUX `apps/web/src/lib/game-photo/glory/` (code anglais) : `frame-spec.ts` (relit le schéma partagé), `frame-catalog.ts` (charge les JSON et les catalogues de noms par `import()`, dans CE chunk), `frame-assets.ts` (`fetch` CORS → `createImageBitmap` → `close()` après usage), `paint-glory-frame.ts`.
  - Étends `PaintContext` (`compose.ts`), en membres OPTIONNELS, avec `clip`, `Path2D`, `measureText`, `globalAlpha`, `globalCompositeOperation` (pour `screen`) et `direction` (`save`/`restore` existent déjà).
  - `paintPhoto` devient un aiguillage : cadre décoré, ou l'ancienne carte (repli, rétrocompatibilité, hors-ligne sans décor).
  - Ordre : celui de `stack`. La photo couvre la BOÎTE de la fenêtre (`coverFit`), se décale et se zoome selon le recadrage de la recette (`crop`), et se découpe par son chemin. Sans photo : `windowFill` et l'emblème en grand.
  - La frappe de l'emblème au déclenchement se rejoue à l'ancre `crest`, puis les oiseaux reprennent leur pose.
  - Extrais `MeasureText` / `fitText` de `apps/web/src/lib/calls/frames/frame-text.ts` vers `apps/web/src/lib/canvas/` (les appels l'importent de là) plutôt que de dépendre du module des appels.
  - Aperçu : le MÊME peintre sur un `<canvas>` à la taille d'affichage, la source photo étant l'image vidéo courante (rAF), la source finale le still développé. Les couches de l'aperçu se décodent à demi-résolution (`createImageBitmap(blob, { resizeWidth, resizeHeight })`), celles de l'image finale en pleine taille. Mesure le temps par image sur la coque Android d'entrée de gamme ; sous 50 i/s, réduis la résolution de l'aperçu, jamais la fidélité de l'image finale.
  - Sortie : JPEG q0,9 (comme iOS) au lieu du PNG, déclarée dans la garde #8695.
- **iOS** : le peintre pur et agnostique (images décodées + géométrie → vue) **vit dans `packages/MeeshySDK/Sources/MeeshyUI/Game/`**, à côté de `RankBlasonView` : c'est ce qui permet ses snapshots dans `MeeshyUITests` (la cible de tests de l'app n'a pas `SnapshotTesting`). Dans l'app, `GamePhotoCanvasView` reste la vue unique (aperçu = `ImageRenderer`) ; son `GloryFrameCanvas` ne fait qu'alimenter le peintre avec des VALEURS déjà décodées (`UIImage` du décor, du grade, de l'avant-plan, de la plaque, des stickers) : **aucune lecture de fichier dans `body`**. La session PRÉCHARGE et décode avant l'écran caméra (aperçu par `CGImageSourceCreateThumbnailAtIndex` à demi-résolution, image finale en pleine taille). Le blason vient de `RankBlasonView` à l'ancre `crest`, et la frappe (`strike`) s'y rejoue. L'orchestration (quel cadre, quand télécharger) reste dans l'app.
- Le canevas reste en sens LTR ; seuls les textes en arabe s'écrivent de droite à gauche dans leur emplacement, et le bandeau de parrainage se retourne comme aujourd'hui.

### 5.6 Le texte vivant, les polices, les sept langues (tranché ; police arabe en D10)

- Sur-titre, titre, date : produits par `momentLines` (web) et son miroir iOS dans la langue de l'interface, comme aujourd'hui. Le sur-titre d'un rang devient « Nouveau rang · <Atmosphère> » via une clé traduite. Nom et histoire du cadre : clés `game.frame.<collection>.<slug>.name|story`.
- **La date de la plaque** est celle de l'ÉTAPE quand elle est connue (`detectedAt` du registre servi par l'extension `game.photo`, § 5.15.2, ou l'instant de la transition vue en direct) ; sinon c'est la date de la PHOTO, sous une clé distincte (« Immortalisé le {date} », sept langues). Une reprise garde la date de l'entrée qu'elle remplace.
- **Web** :
  - Les noms et histoires (environ 31 Ko gzip par langue) vivent dans des catalogues PAR COLLECTION et PAR LANGUE, dans des chunks nommés **hors du motif `catalog-<lang>-`** (par exemple `glory-names-<collection>-<lang>`, sinon ils tombent sous le budget `interface_catalogs`, 2,86 Ko de marge), chargés par `frame-catalog.ts`, avec une entrée `on_demand_chunks.glory_frame_catalogs` (`dynamic_only`, plafond mesuré).
  - **Précache** : ces chunks sont du JS, donc PRÉCACHÉS par Workbox (`globPatterns: ['**/*.{js,css,html,svg,woff2}', …]`) : environ 31 Ko × 7 langues à chaque installation, joueur ou non. Exclus-les par `globIgnores`, sers-les par un cache d'exécution ; hors ligne sans eux, le cadre montre son nom de repli et l'histoire se replie. Mesure le précache total avant et après.
  - **Jamais une partie de plus dans `LOADERS` de `apps/web/src/lib/i18n-game-catalog.ts`** : ce module vit dans l'entrée. Les chaînes de l'hôte d'alerte et du déroulé décoré (`game.photo.alert.*`, `game.frame.atmosphere.*`, `game.photo.pose.*`, `game.photo.message.*`, le réglage d'invitation) vivent dans une partie de catalogue chargée AVEC leur chunk paresseux, par le même mécanisme que `frame-catalog.ts` ; si cette partie manque, la surface montre Mee seul, jamais un texte français codé en dur.
  - Étends le témoin des parties (`game-catalog-parts.test.tsx` ou équivalent) : chaque clé de ces préfixes existe dans les sept langues, aucun repli.
- **iOS** : clés dans `apps/ios/Meeshy/Localizable.xcstrings` ; `GameSourceGuardTests.test_everyGameKeyIsTranslatedInTheSevenLanguages` les garde (anglais non recopié du français, placeholders identiques), préfixes neufs compris.
- **Polices** : Cinzel, Cinzel Decorative, Cormorant Garamond, Fraunces, Manrope (Caveat 700 latin existe déjà côté web, `apps/web/src/styles/fonts/caveat-700-latin.woff2`).
  - Web : woff2 sous `apps/web/src/styles/fonts/`, `@font-face` conditionnelles, chargées par `document.fonts.load` avant toute peinture (précédent : `lib/calls/frames/frame-fonts.ts:loadFrameFonts`, `lib/canvas/story-fonts.ts`), jamais précachées (`globIgnores` couvre déjà `assets/*.woff2`), licences dans `apps/web/src/styles/fonts/NOTICE.md`, une entrée de budget sur le patron de `story_fonts` (inventaire + cliquet d'octets).
  - iOS : fichiers TTF/OTF **tels que distribués en amont** (Google Fonts), sans conversion ni sous-ensemble (Cinzel Decorative réserve le nom « Cinzel » : un fichier modifié ne peut plus le porter — fais valider par `conformite-juridique`), enregistrés à la demande par `CTFontManagerRegisterFontsForURL(.process)`, licences dans un NOTICE versionné. `Font(UIFont as CTFont)` est la forme admise par `FixedFontSizeGuardTests`.
  - Arabe : pile système (comme les polices de story), sans capitales forcées ni interlettrage.
  - Ces polices d'apparat ne couvrent que le latin. Tout texte VIVANT dans une autre écriture (cyrillique, grec, hébreu, CJK, devanagari, emoji, notamment un message ou un nom d'utilisateur dans une légende) prend la pile système, choisie d'après les **plages Unicode du texte**, jamais d'après la langue de l'interface, avec une mesure réelle.
- Ajustement : `measureText` réel (web) et `NSAttributedString.size` (iOS) ; réduction jusqu'à `minSize`, puis ellipse. Les fixtures longues du jeu (`game-fixture-long.ts`) alimentent les témoins dans les sept langues.

### 5.7 Mee et Meo, les poses, les ancres (tranché ; selfie en D11)

- Les poses sont une liste FERMÉE d'identifiants de stickers présents des deux côtés. **Les 32 poses du générateur existent déjà** comme stickers web (`findMeeSticker`, duos générés par `apps/web/src/lib/mee/catalog-duo.ts`, gardés par `intents.test.ts`) et iOS (`MeeStickers/mee.<id>.webp`), vérifié le 2026-10-10 : n'en refilme aucun. Les `duo-*` (`duo-mee-selfie`, `duo-mee-trinquer`, `duo-meo-trinquer`…) sont des stickers à DEUX oiseaux. Écris la table de correspondance « identifiant du générateur → `mee.<id>` iOS / `findMeeSticker(id)` web » et un témoin qui la vérifie.
- Les ancres portent sur la **boîte 360×360 du sticker** (avec ses marges transparentes), jamais sur la boîte rognée des PNG `generateur/mee/` : le générateur se cale sur la première image non rognée des WebP, ou exporte un `contentRect` par pose. Ombre portée de `bird()` (`feDropShadow dy 6 stdDeviation 6 opacité 0,45`) reproduite à l'identique côté app.
- Chaque cadre déclare les mises en page qu'il permet, chacune avec ses ancres et son verdict `validated` : `pied`, `perches`, `cotes`, `ruban`, `selfie` (deux ancres) et `duo` (UNE ancre portant un sticker à deux oiseaux, la forme que de nombreux cadres dessinent déjà ; rien à voir avec la photo à plusieurs de #9965). La pose `ruban` n'existe que sur un cadre dont le support est un ruban, et ses queues tenues au bec sont une couche `front` exportée POUR cette pose.
- **Pose selfie** : Meo entre dans la fenêtre à une place fixe déclarée par cadre (D11). L'écran caméra affiche un **guide de cadrage** (silhouette de visage à `faceGuide`, hors de la zone de Meo ; centrée pour les autres poses), sans aucune analyse de l'image (H-3), et la photo reste déplaçable après la prise. C'est ce qui tient « sans toucher un visage » quand le visage bouge.
- **Règle d'empiètement, garde de CI** : pour chaque cadre × mise en page × format, overlap ≤ 250 px et depth ≤ 6 px mesurés à l'échelle de design (×4 en aire et ×2 en profondeur en 1080), face = 0 ; `selfie` est exempté de l'overlap, jamais du visage. Un témoin géométrique sans navigateur, dans `packages/shared` (vitest, sur le contrat), vérifie de plus : boîtes des oiseaux ∩ chemin de fenêtre = ∅ (hors selfie), pour chaque mise en page déclarée.
- Le Néon, « tel quel » : son DÉCOR ne change pas ; seules ses ancres bougent, là où un VRAI empiètement est mesuré après réparation du détecteur, et le porteur revoit l'avant/après (L2).

### 5.8 Le blason (tranché ; D2 au § 6.1)

Le blason VIVANT de l'app (`rank-crest.ts`, peint par `apps/web/src/components/game/rank-blason.tsx` et `RankBlasonView`), posé à l'ancre `crest` du cadre, sur les cadres de rang ; il remplace l'écu à losanges du générateur. Les cadres de `moments` et `tresor` gardent leurs médailles et pièces dessinées (numéros et légendes en `slots`). La comparaison de fidélité exclut la boîte du blason.

### 5.9 Les formats et le bandeau de parrainage (recommandé ; D1, et D12 au § 6.1)

- 9:16 : le format dessiné. 1:1 : recommandation D1, un MÉDAILLON produit par le générateur par atmosphère (une fonction de `lib/`, pas un dessin par cadre) : la fenêtre recadrée, la bordure et une plaque compacte de l'atmosphère. Tant que le carré d'un cadre manque (`square: null`), le carré retombe sur la carte simple actuelle, et le sélecteur le dit.
- Bandeau de parrainage + QR (#7742, #9554) : chaque cadre déclare `banner.box`, hors de la fenêtre et de la plaque, sur la bande neutre que porte le décor (D12). Sans lien, la bande reste, complète : aucune zone vide.
- **H-1, H-6 et H-9 (nom civil sur le lien public, empreinte des visiteurs, IP de `track-visit`) sont encore ouverts**, et des images faites pour être partagées multiplient les visites du lien. Vérifie leur état au L0. Tant qu'ils ne sont pas fermés, le bandeau de parrainage ne s'active pas sur les cadres DÉCORÉS en production (la bande reste neutre ; l'ancienne carte garde son comportement) ; la promotion qui l'active les déclare comme prérequis.

### 5.10 L'hébergement et la livraison des couches (tranché, avec `sre-infra`)

- **Un magasin adressé par contenu.** Les couches exportées sont versionnées sous `services/gateway/assets/glory-frames/<sha16>.webp` (sans LFS, précédent : les 56 Mo de `MeeStickers`) et servies par une route **publique** de la passerelle, `GET /api/v1/game/frames/<sha16>.webp` :
  - sans authentification, `Cache-Control: public, max-age=31536000, immutable` ;
  - `Cross-Origin-Resource-Policy: cross-origin` posé par un hook `onSend` SYNCHRONE (copie `crossOriginMediaHeaders`, `services/gateway/src/routes/attachments/download.ts`), et `Access-Control-Allow-Origin: *` DÉCLARÉ dans `PORTES_HORS_REGLE` (`services/gateway/src/config/cors-origins.ts`), sinon `cors-origin-emitter-sweep.test.ts` rougit ;
  - liste blanche stricte : seulement les empreintes référencées par le contrat courant ou par `retained.json` ; 404 sinon (aucun `..`, aucune autre forme) ;
  - **exemptée du limiteur global** (300 requêtes par minute et par IP, `middleware/rate-limiter.ts`) par la même mécanique que `HEALTH_PROBE_ALLOWLISTED_PATHS` (et sa garde `rate-limit-allowlist-inheritance-guard.test.ts`) : derrière un CGNAT mobile, les GET de couches mangeraient sinon le seau des appels d'API. L'immutabilité, puis un CDN, la protègent ;
  - jamais `/attachments/file/*` (une requête de base par fichier, `private`).
- **Rétention** : un fichier que le contrat courant ne référence plus reste servi tant qu'une version cliente l'utilise (les iOS publiés embarquent leur contrat pour toujours) ; il passe dans `packages/shared/design/glory-frames/retained.json` (version du contrat → empreintes), et ne se retire qu'à zéro usage mesuré (#9223), mesure prise sur les GET de couches agrégés par l'en-tête `X-Meeshy-Game-Version`. Le contenu adressé ne grossit le dépôt et l'image que des couches qui changent vraiment.
- **Pourquoi la passerelle** : son image est construite par `docker.yml`, validée sur staging, puis PROMUE telle quelle (`meeshy-promote-production.sh` ne promeut que passerelle, traducteur et agent). `services/gateway/**` déclenche déjà `docker.yml` : n'y ajoute rien. Ajoute au `services/gateway/Dockerfile` un `COPY` de `assets/` dans une couche **dédiée et précoce** de l'image d'exécution (pour la réutilisation des couches Docker), vérifie que `.dockerignore` (racine) ne l'exclut pas, et mesure le poids ajouté à l'image ; l'hôte partagé a déjà saturé son disque (2026-09-14) : `sre-infra` en juge. La montée à 100 000 utilisateurs ne demande qu'un CDN ou une route Traefik vers un stockage S3 devant le même chemin (#9232).
- **L'URL** se dérive de la base d'API résolue par `resolveApiConfig` (`apps/web/src/lib/api/config.ts`) sur le web et par `MeeshyConfig` sur iOS (`gate.meeshy.me`, `gate.staging.meeshy.me`), jamais de `VITE_API_BASE` brut (vide en production : la base deviendrait relative).
- **Web** :
  - jamais dans `dist` (donc jamais dans l'APK de la coque ni dans le précache Workbox, dont `globPatterns` prend tout `**/*.svg`) : une garde le prouve ;
  - un seau de cache DÉDIÉ (Cache Storage `glory-frames`), pas le seau `medias` (CacheFirst 300 entrées partagé avec avatars et scènes) ; à l'activation d'un nouveau contrat, le client supprime les entrées que le contrat courant ne référence plus (`lib/app-update/service-worker.ts`, règle « nommer ce qu'on possède ») ;
  - `fetch(url, { mode: 'cors' })` → `createImageBitmap(blob)` : un décor dessiné en `<img>` sans CORS **teinte** le canvas et `toBlob` lève `SecurityError` ;
  - vignettes : un atlas par atmosphère.
- **iOS** :
  - socle EMBARQUÉ (`apps/ios/Meeshy/Resources/GloryFrames/`, dossier `type: folder` + `buildPhase: resources`) : toutes les vignettes, les couches des collections `mythologies`, `moments`, `tresor` et les polices ;
  - les packs d'atmosphère se téléchargent à la demande par un `actor GloryFrameAssetStore` derrière `protocol GloryFrameAssetProviding`, dans `apps/ios/Meeshy/Features/Main/Game/Frames/` : bundle → `Caches/meeshy-game-frames/` → GET anonyme, contrôle SHA-256 contre le contrat ; élagage des fichiers qu'aucun contrat lu ne référence plus ;
  - **la garde réseau est amendée, pas contournée** : écris une décision qui amende le § 4 de `apps/ios/decisions/2026-10-05-…` (« le déroulé photo n'atteint le réseau que par `GloryFrameAssetProviding` : GET anonyme, aucun argument `Data`, `UIImage` ni `URL` de fichier local ») ; étends `GameSourceGuardTests` : sous `Game/Photo/`, aucune référence réseau autre que ce protocole ; une garde neuve sur `Game/Frames/` interdit POST, `upload(`, `multipart`, tout corps de requête et tout type photo ;
  - mémoire : `NSCache` borné en coût (modèle `CallFrameThumbnailCache`).
- **Préchargement, sobre** : seulement en Wi-Fi ou sur un réseau non restreint — Mode données réduites (iOS, `NWPath.isConstrained`), `navigator.connection.saveData` (web, précédent `lib/calls/call-data-profile.ts`) et préférence de téléchargement des médias (`MediaDownloadPreferencesStore`) respectés. L'atmosphère choisie se précharge après le choix ; les vignettes et couches d'une étape se préchargent quand l'utilisateur en approche (progression ≥ 80 % vers la prochaine division ou le prochain palier, lue dans le bloc `game`). Sinon, téléchargement au moment de l'aperçu, couche par couche, vignette d'abord.
- **Échec d'intégrité** : un sha256 faux ⇒ fichier supprimé, cadre composé en carte simple pour cette fois, nouvel essai à la session suivante, jamais en boucle.
- **Hors-ligne et cache-first** : l'aperçu d'alerte et le sélecteur n'attendent jamais le réseau (vignette en cache ou embarquée, sinon Mee et l'emblème de l'offre actuelle) ; un cadre dont les couches manquent se compose en carte simple, et la photo gardée pourra être recomposée plus tard depuis sa source (§ 5.12).
- **Mémoire** : un décor décodé pèse 8,3 Mo, d'où les couches rognées et l'aperçu à demi-résolution. Un seul jeu de couches pleine taille vit à la fois ; `ImageBitmap.close()` (web) et libération des `UIImage` (iOS) en quittant le déroulé ; vignettes à 270×480 au plus.

### 5.11 Le choix d'atmosphère (recommandé ; D7, D21)

Recommandation : une préférence de COMPTE, `GameProfile.frameAtmosphere String?` (null = pas encore choisie ; `packages/shared/prisma/schema.prisma`, producteur unique `services/gateway/src/services/game/GameProfileService.ts`), pour que l'alerte reçue sur un autre appareil montre le bon décor.
- **Lecture sans requête de plus** : l'extension `game.photo` du bloc `game` de `GET /api/v1/me/engagement` (§ 5.15.2 ; `buildGameBlockExtras`, `gameBlockExtensionShape` dans `packages/shared/types/game-v2.ts`, en `.optional().catch(undefined)` : une extension illisible tombe seule).
- **Écriture** : `PUT /api/v1/me/game/frames/atmosphere` (`requestId`, `gameRateLimitConfig`, `runGameWrite`, `sendSuccess` / `sendError`, 409 avec un code de `GAME_ERROR_CODES`), dans une **table de routes NEUVE**, `GAME_PHOTO_ROUTES` (jamais `GAME_ROUTES` ni `GAME_INTEGRATION_ROUTES`, dont `GameRoutesTests.swift` fige le nombre d'entrées), qui porte aussi les routes du § 5.15.2. Régénère `services/gateway/route-manifest.json` (`npm run route-manifest:generate`, Node ≥ 22.19), `packages/shared/api/endpoints.ts` (`npm run api-endpoints:generate`) et le catalogue iOS (`ios-endpoints:generate`).
- Si tu l'ajoutes aussi à `GET /me/game/privacy`, DÉCLARE-le dans `gameSettingsResponse` (`additionalProperties: false`). Export RGPD : ajoute le champ à `services/gateway/src/routes/me/export-game.ts`.
- **Clients** : optimistic + cache local (iOS dans `GameDevicePrefs`, `Game/Wave2/GameWave2Support.swift`, dont `read`/`set` énumèrent les clés à la main ; web dans le cache de la requête). Réglage « Mon atmosphère » dans `Wave2/GameSettingsViews.swift` et son pendant web. Hors ligne, l'écriture passe par la file d'écritures et se vide dans l'ordre au retour du réseau ; face à un ancien serveur, un 404 est toléré : le choix reste local.
- **L'écran de choix** : les sept atmosphères, l'Afrique éternelle en premier, chacune par sa vignette, son nom et sa courte histoire (radios étiquetées). Il offre toujours « **Choisir plus tard** » : la photo part avec l'atmosphère par défaut (Afrique éternelle, Savane puis Royaumes), sans l'enregistrer ; l'écran se repropose UNE fois, à la prochaine photo de rang, puis ne vit plus que dans les réglages (compteur de reports en mémoire appareil par compte). `needsAtmosphere` vaut pour toute étape de rang à partir d'Ambassadeur tant que l'atmosphère est `null`, y compris pour les comptes déjà au-delà d'Ambassadeur au lancement.
- **Changer d'atmosphère ne recompose rien en silence** (écart avec #9972, qui demande la recomposition : D21, et un commentaire sur #9972) : le carnet propose « Reprendre avec ma nouvelle atmosphère » sur les photos gardées du rang qui ont une source, une par une ou toutes.

### 5.12 Le carnet v2 et la reprise (tranché ; migration locale, `auditeur-adversarial`)

- **La recette** : `NotebookEntry` (web `notebook.ts`, iOS `GamePhotoNotebook.swift`) gagne des champs OPTIONNELS : `frameId`, `pose`, `message`, `crop` (décalage et zoom de la photo dans la fenêtre), `mirror` (selfie oui, galerie non), `showFlame`, `showLink`, `momentAt` (la date de l'étape, § 5.6) et `source`. Les anciennes entrées se relisent (Codable décode à `nil` ; IndexedDB clone structuré, sans `onupgradeneeded`) et ne proposent que « nouveau selfie » ou « carte seule ».
- **La place** : la source est réduite à 1 440 px de grand côté, JPEG q0,85 (web : `developPhoto`, `apps/web/src/lib/media/photo-develop.ts` ; iOS : `<stem>-source.jpg` en `.completeFileProtection`, effacé avec les autres fichiers). Une entrée NOUVELLE ne garde que l'image 9:16 composée et sa source ; le 1:1 se recompose au partage depuis la recette (couches absentes ⇒ carte simple 1:1). Les anciennes entrées gardent leurs deux images. Budget par entrée mesuré au L9 et inscrit au § 8.2. Le carnet affiche la place qu'il occupe et permet de supprimer une entrée.
- **L'échec de place** : si « Garder » échoue (IndexedDB `QuotaExceededError`, disque iOS plein), un état d'erreur dessiné (« Plus de place sur cet appareil ») propose d'enregistrer l'image dans la galerie ; l'entrée n'est pas créée ; rien ne se perd en silence.
- **« Plus tard » sans expiration** : `defer` (web) et `postpone` (iOS) cessent d'écrire `expiresAt` (déjà nullable des deux côtés), et `list` / `isExpired` cessent de purger les entrées en attente (les anciennes ne s'effacent plus). Libellé : seul le web change (`game.notebook.pending_until` → « En attente », sept langues) ; iOS affiche déjà `game.notebook.pending`.
- **Une étape n'apparaît qu'une fois** : « En attente » ne garde que les moments NON déductibles (trophée, ligue, saison, succès, réalisation du jour). Une étape de piste reportée apparaît seulement dans « À rattraper ».
- **Web, D-154** : base cloisonnée par compte (`meeshy-game-notebook-<userId>`). L'ancienne base partagée ne porte aucun `userId` : l'adopter « par le compte connecté à la première ouverture » livrerait, sur un appareil partagé, les selfies d'un compte à un autre. **N'adopte que si l'appareil n'a connu qu'UN compte** (étagère `lib/api/account-caches.ts` vide, coffre des jetons à un seul compte, aucun indice d'un autre) ; sinon, et dans le doute, **quarantaine** : la base devient illisible par tous, et le carnet propose de la supprimer. Règle écrite dans `apps/web/decisions.md`, revue par `auditeur-adversarial`, témoin « deux comptes connus ⇒ rien n'est adopté ». Purge de la base du compte à la suppression du compte et à « retirer ce compte ». `navigator.storage.persist()` au premier « Garder ».
- **iOS** : la sauvegarde iCloud du dossier `Application Support` (sources brutes comprises) décide si l'utilisateur perd son carnet en changeant de téléphone : c'est une décision produit (D23), après avis de `conformite-juridique`.
- **Multi-appareil** : les photos et leur statut « gardée » restent sur l'appareil ; une étape photographiée sur l'iPhone reste « À rattraper » sur le web. En attendant D22, le carnet le dit (« Tes photos vivent sur cet appareil », sept langues).
- **Reprise** : bouton « Reprendre » dans `KeptEntry` (`apps/web/src/routes/progression-carnet.tsx`) et `keptSection` (`GameNotebookView.swift`), qui ouvre le déroulé au moment de l'entrée avec sa recette (`frameId`, `pose`, `message`, `crop`, `source?`) ; `keep` remplace l'entrée du même moment (déjà acquis) et garde sa date. iOS : `GameNotebookViewModel.makeRetakeSession(for:)`, une session qui démarre au résultat avec la source.

### 5.13 Le message de l'auteur (#9973, tranché)

- **Où** : sur l'écran de RÉSULTAT, image fixe recomposée depuis la source, avant de garder ou de partager (#9973) ; le cadre et la pose s'y changent aussi sans reprendre la photo. Seul le déclenchement a lieu sur l'écran caméra.
- **Quoi** : ≤ 60 graphèmes (comptés par `Intl.Segmenter` sur le web, par `Character` sur iOS), une ligne, retours à la ligne et caractères de contrôle retirés, sens d'écriture isolé (FSI/PDI). Caveat 700 pour l'écriture latine seulement ; toute autre écriture prend la pile système choisie par les plages Unicode du texte (§ 5.6). Réduction jusqu'à `minSize`, puis ellipse.
- **Comment** : rendu en texte pur (`fillText` au canvas, nœud texte dans le DOM, `Text(verbatim:)` sur iOS ; jamais `dangerouslySetInnerHTML` ni `LocalizedStringKey`), aucun lien actif. Le champ n'apparaît que sur un cadre qui a un support ; le sélecteur indique les cadres qui en ont un. Aucun texte par défaut. Le message ne part jamais dans le texte de partage et ne vit que dans la recette du carnet.

### 5.14 Le partage (tranché)

Format story 9:16 (remis à la feuille de partage du système) et carré 1:1, choix avant partage (H-2), aucun gain (H-5), aucun nom sur la carte. L'aperçu de résultat porte deux choix, **sur le web ET sur iOS** : « Afficher ma Flamme » (le slot de Flamme disparaît du fichier) et « Partager avec mon lien » (le bandeau de parrainage, § 5.9), ce qui solde H-2 sur le web. Web : `sharePhoto` / `savePhoto` (`share.ts` : `navigator.share` → pont de la coque `MeeshyShare.shareFile`, limité à 32 Mo → ancre). Texte de partage : le nom du cadre et une invitation neutre, traduits. Les images doivent donner envie d'être partagées : l'aperçu de résultat montre le cadre en grand, son nom et sa courte histoire (repliable), puis les gestes Partager, Enregistrer, Garder.

### 5.15 Les alertes d'immortalisation (recommandé ; D6, D8, D9, D13, D14, D19, D20, D22, #9964)

**Principe** : une loi décide ce qui s'annonce ; un registre partagé dit ce qui a déjà été montré, quel que soit l'appareil ; la surface dépend de la NATURE de l'étape (geste ou passive) ; un seul coordinateur ordonne tout ce qui célèbre ; **jamais deux surfaces pour une même étape, ni dans le temps ni entre appareils** ; jamais de relance.

#### 5.15.1 La loi

`packages/shared/utils/game/photo-alerts.ts`, miroir Swift dans le SDK (après L3b), vecteurs (loi `photo-alert`).

- **`PHOTO_ALERT_POLICY`**, la politique PARAMÉTRABLE de #9964, lue par `photoStepsReached` (ce qui se photographie : une étape non photographiable ne verrouille pas sa piste) ET par `photoAlertFor` (ce qui s'annonce). Défauts prudents chiffrés tant que #9964 reste ouverte :
  - ce qui se photographie : toutes les étapes de la loi actuelle (aucun changement du carnet) ;
  - dans l'app : au plus UNE invitation par jour, écart minimal de 4 h, aucune invitation passive pendant les 10 premières minutes d'une session ;
  - push : au plus un par jour, dans le plafond B-5, délai de 60 minutes après la détection, fenêtre de nuit 21 h → 9 h locale quand le « Ne pas déranger » de l'utilisateur est coupé ;
  - les « grands moments » (pour le réglage d'invitation) : passage de rang (`rank:<r>:5`, `rank:mythe:0`), `level-100:0`, `prestige:*`, Meesh d'or ou prisme, `flame:100`, `flame:365`.
  Avant de fixer ces défauts, simule avec les lois du jeu le nombre d'alertes d'un compte actif sur ses 30 premiers jours, et poste le résultat sur #9964 avec la liste des paramètres.
- **`photoAlertFor({ reached, standing, kept, presented, policy, baseline })` → `{ announce, propose, reached } | null`** :
  - `announce` : l'étape la plus marquante ATTEINTE par cette transition (l'ordre de `OFFER_PRIORITY`) ;
  - `propose` : l'étape OUVERTE de sa piste, celle que `photoOfferFor` proposerait (`photo-alerts.ts` DÉLÈGUE à `photoOfferFor` plutôt que de réécrire l'ordre ; si tu exportes `OFFER_PRIORITY`, fais le même changement dans le miroir Swift) ;
  - `reached` : toutes les étapes atteintes par la transition, pour l'accusé.
  **L'étape annoncée et l'étape proposée peuvent différer** : un compte existant peut porter une cinquantaine d'étapes de rang sans photo. La surface dit alors les deux, honnêtement : « Nouveau rang · Légende II », puis « Ton carnet reprend à Écho III : on l'immortalise ? », avec l'aperçu du cadre de l'étape PROPOSÉE. Jamais « Nouveau rang » au-dessus d'une étape ancienne. D20 décide si cet arriéré verrouille toujours les étapes nouvelles.
- **`photoAlertDigest(steps)`** → le résumé groupé, qui ne compte que les étapes NON encore notifiées.
- **Trésor** : la loi lit le PLUS HAUT palier atteint quand il est servi (recommandation D14 : `GameProfile.treasuryPeakTier String?`, tenu par la passerelle), sinon le palier courant.
- **Réalisation du jour** (D6) : identité `day:<AAAA-MM-JJ>` dans `photo-moments.ts` (et son miroir `GameGuideV2.swift`, loi `photo-moment`). Elle se détecte côté client au GESTE qui la réalise (ouverture du Coffre du jour, recommandation D6), s'annonce par la célébration de ce geste, jamais par push (l'utilisateur est dans l'app), au plus une par jour, comptée dans l'écart et le plafond. « Plus tard » ne garde que la plus récente en attente.
- **L'étape `start`** n'est jamais annoncée par une alerte : elle reste proposée à la fin de l'onboarding (`progression-lead`) et au carnet.

#### 5.15.2 Le registre partagé et l'accusé

- **Le registre durable** : modèle Prisma `GamePhotoMoment { id, userId, stepId, detectedAt?, presentedAt?, notifiedAt? }`. Son `id` est **dérivé** de `(userId, stepId)` (une empreinte de 24 hex, comme `mythicSeatId` dans `MythicSeatService.ts`), pour que l'idempotence ne dépende pas de l'index ; l'index unique `(userId, stepId)` est posé par `packages/shared/prisma/migrations/<date>-game-photo-moment-indexes.mongodb.js`, sur le modèle de `2026-10-07-mythic-seat-indexes.mongodb.js`. `GameProfile.photoAlertsBaselineAt DateTime?` et `photoAlertsBaseline Json?` (la situation `PhotoCatchUpStanding` à la ligne de base : les étapes passées se déduisent sans écrire une ligne par étape). Ajoute le modèle à `GAME_PURGED_MODELS` (`GamePurge.ts`, témoin d'exhaustivité) et à l'export RGPD.
- **La lecture** : l'extension `game.photo` du bloc `game` de `GET /me/engagement`, `{ atmosphere, invitations, baselineAt, baseline, moments: { stepId, detectedAt, presentedAt?, notifiedAt? }[] }`, bornée aux 64 lignes les plus récentes, en `.optional().catch(undefined)`.
- **L'accusé** : `POST /api/v1/me/game/photo-moments/presented { stepIds }` (au plus 64, idempotent), dans `GAME_PHOTO_ROUTES`. **TOUT affichage d'une étape l'émet** : bannière, carte photo d'une célébration, carte d'offre de Progression, ligne du carnet, ouverture du déroulé ; et toutes les étapes `reached` d'une transition passent présentées avec l'étape proposée. Hors ligne, il passe par la file d'écritures (OfflineQueue sur iOS, `apps/web/src/lib/offline-queue.ts` sur le web) ; face à un ancien serveur, un 404 l'abandonne sans bruit.
- **Les règles qui en découlent** : une étape `notifiedAt` n'ouvre plus aucune bannière dans l'app (seulement la pastille si elle est nouvelle) ; une étape `presentedAt`, sur quelque appareil que ce soit, n'ouvre rien ici ; aucun push ne part pour une étape présentée.
- **Multi-appareil (D22)** : recommandation (b), le client signale aussi « immortalisée » par le seul identifiant d'étape (ni image, ni date de prise), pour que les autres appareils retirent l'étape de « À rattraper » et de la pastille, revue par `conformite-juridique` (H-5 : ce signal ne rapporte rien). En attendant : (a), carnet par appareil, dit à l'utilisateur.

#### 5.15.3 Dans l'app

- **Deux natures d'étape, deux surfaces** (D19). La nature se lit au CHEMIN : une étape remise par une célébration en cours est née d'un geste ; une étape trouvée par l'hôte à la lecture du bloc `game` est passive.
  - (a) **Étape née d'un geste** (frapper une Meesh, ouvrir le Coffre du jour, passer un Prestige, valider une mission qui fait monter le rang) : l'invitation est le DERNIER temps de la célébration déjà montée pour ce geste (`MintStrikeScene` / `game-mint-strike.tsx`, `RankBlasonStage` / `rung-reveal.tsx`, la carte photo d'`EngagementRevealHost`), sous la forme de sa carte photo. Jamais une seconde feuille après elle.
  - (b) **Étape passive** (rang monté par des points reçus, palier atteint app fermée, Flamme constatée au réveil) : une bannière NON modale (dans la bande du joueur ou en haut d'écran), qui ne prend pas le focus, s'annonce poliment aux lecteurs d'écran (région `aria-live="polite"`, `UIAccessibility.post(.announcement)`) et s'efface seule ; la toucher ouvre la feuille. C'est la règle de #5847 : seul un succès interrompt sans geste.
- **Un SEUL coordinateur** (file de un) ordonne succès, cartes du guide de la vague 2, célébrations, moments de `photo-moments.ts` et invitations photo, qui y entrent par le même chemin. iOS : étends `EngagementRevealQueue` (ou un coordinateur qui l'absorbe) plutôt que d'ouvrir une seconde file. Web : le magasin de l'hôte d'alerte est cette file, et les célébrations de geste y remettent leurs étapes.
- **Les hôtes** :
  - **iOS** : un modificateur frère de `.engagementReveal(router:)`, posé au même endroit, dans `RootLayers/RootViewLayers.swift` et `RootLayers/iPadRootViewLayers.swift` (jamais dans `RootView.swift`, hors budget). Nourri par chaque lecture fraîche du jeu à l'échelle de l'app (`PlayerBannerStore`, `apps/ios/Meeshy/Features/Main/Game/PlayerBannerHost.swift`), par le tap d'une notification et par `NotificationToastManager.newNotificationReceived` pour le type neuf. Il compare à une MÉMOIRE APPAREIL « dernière situation annoncée » par compte (patron `UserDefaultsGuideSnapshotStore`, `Wave2/GameGuideV2.swift`) et au registre servi, jamais à la lecture précédente en mémoire : c'est ce qui rattrape l'étape franchie app fermée.
  - **Web** : un magasin zustand vanille + un composant PARESSEUX monté avec la bande du haut (`top-band.tsx`) APRÈS la première peinture (import au repos), nourri par la requête `['me','engagement']` (toute page) et `onNotificationNew` ; mémoire appareil en `localStorage` par compte (enveloppée de try/catch). Il remplace la détection propre à la page de Progression (`usePhotoMoments` devient un lecteur du magasin) : une seule source, et la fiche des Meeshes est couverte. Son poids : § 8.2 et L18.
- **Ligne de base** : à la première exécution sur un compte, la situation courante est enregistrée SANS alerte (les étapes passées sont au carnet, « À rattraper »), et la ligne de base serveur est lue si elle existe.
- **Au bon moment** : jamais pendant l'onboarding, un appel, un enregistrement, le composer, une story, une saisie en cours, ni par-dessus une autre feuille (signaux existants : `OnboardingPresenceSignal`, `GameMomentPresence`, état d'appel) ; l'étape attend que le contexte se libère (file de un, l'étape reste). Écart minimal et plafond quotidien selon la politique, invitations de geste comprises ; au-delà, la célébration se termine sans carte photo, et l'étape va au carnet en silence.
- **La feuille** (ouverte par le tap de la bannière, ou carte de fin de célébration) : Mee et Meo, sur-titre et titre de l'étape ANNONCÉE, phrase de reprise si l'étape PROPOSÉE diffère (§ 5.15.1), **aperçu du cadre proposé** (vignette de l'atmosphère choisie, depuis le cache ou le bundle ; tant que les cadres ne sont pas livrés, la carte actuelle ; à partir d'Ambassadeur sans atmosphère, l'invitation à choisir avec les sept vignettes, l'Afrique en premier), « Immortaliser » (ouvre le déroulé à l'étape caméra, cadre présélectionné), « Plus tard » (mise en attente sans expiration) et un lien discret « Ne plus me proposer », qui OUVRE le réglage et n'agit jamais en silence. Glisser pour fermer = « Plus tard ». Si l'utilisateur est sur Progression, la carte d'offre existante est la surface (pas de doublon).
- **Le réglage d'invitation** « Me proposer d'immortaliser » : chaque étape (défaut) / les grands moments / jamais (le carnet garde tout). Préférence de COMPTE (`GameProfile.photoInvitations String?`, `null` = chaque étape), servie par l'extension `game.photo`, écrite par `PUT /api/v1/me/game/photo-moments/invitations` dans `GAME_PHOTO_ROUTES`, cache local, sept langues, web et iOS. Il gouverne la bannière, la feuille, la carte photo des célébrations et la pastille ; `notification.gamePhotoEnabled` gouverne le push ; « Jeu masqué » coupe les quatre.
- **La pastille du carnet** : un point neutre (couleur d'accent, jamais rouge), sans chiffre, sans animation en boucle. Elle ne s'allume que pour une étape NOUVELLE depuis la dernière visite du carnet (état « vu » tenu par compte en mémoire appareil), s'éteint dès l'ouverture du carnet, et se coupe avec le réglage d'invitation. Une relance permanente serait contraire à B-5.

#### 5.15.4 Hors de l'app (push serveur ; la coque n'a pas de notifications locales, et iOS n'en a pas besoin)

- **Interrupteur d'exécution** : le job lit `GAME_PHOTO_PUSH` (variable d'environnement de la passerelle, `off` par défaut en production jusqu'à la recette), documentée dans `infrastructure/` avec `sre-infra`. L19 se livre éteint en production et s'allume par un geste réversible, sans redéploiement de code.
- **Détection** : un seul point d'accroche marque l'utilisateur « à évaluer » (ensemble Redis) depuis les écritures de jeu (`EngagementGameHooks.onScore` / `onStreak`, `GloryService`, `MeeshService` après sa transaction, `PrestigeService.pass`, `MythicSeatService.claimIfEligible`, les gestes du trésor). Un job (`services/gateway/src/jobs/game-photo-moments.ts`, calqué sur `game-mission-window.ts`, enregistré dans `jobs/index.ts`) construit la situation depuis **les mêmes faits que `GET /me/engagement`** (`GameBlockService` ou ses lecteurs) par `catchUpStandingOf`, amenée dans `packages/shared/utils/game/` au L3b — **jamais depuis `GameStandingService`**, qui sert le jeu d'un autre membre (paliers, formes, visibilité) : deux dérivations jumelles annonceraient des étapes que le carnet ne montre pas. Il évalue `photoStepsReached`, écrit les étapes neuves (`detectedAt`), pose la ligne de base à la première évaluation. Un témoin croisé exige, pour une même fixture, le même ensemble d'étapes côté serveur et côté client.
- **Envoi** :
  - après le délai de la politique, seulement si l'étape n'a été présentée sur aucun appareil et si l'utilisateur n'a **aucune socket active** (l'hôte de l'app est alors la surface) ;
  - **heures calmes, une seule règle** : le « Ne pas déranger » de l'utilisateur se teste par `isWithinDnd` (`packages/shared/utils/notification-dnd.ts`), la fonction même que `NotificationService` applique, AVANT d'appeler `GameNotifier` (sinon la notification serait supprimée et `GameNotifier` garderait sa `onceKey` : `skipped:declined`) ; quand le DND est coupé, la fenêtre de nuit de la politique se calcule dans `effectiveZone(User.timezone)` (`gameClock.ts`), jamais dans `dndUtcOffsetMinutes` (0 par défaut sur les anciens documents) ;
  - si le créneau de jeu du jour est déjà pris (résultat de ligue, étape de saison : plafond B-5) ou si l'heure est calme, le push est **différé à la prochaine fenêtre permise**, une seule fois par étape : le registre `notifiedAt` fait foi, et la `onceKey` de ce kind porte le jour et l'empreinte des étapes du résumé ;
  - regroupé en UNE notification pour toutes les étapes en attente non encore notifiées, qui **remplace** la précédente (`collapseId` de `GameNotifier` → `apns-collapse-id` sur iOS, `tag` sur le web, même identifiant FCM), dans un fil « jeu » (`threadIdentifier`) ;
  - la coque Android déclare un canal « Jeu » (là où elle déclare déjà ses canaux : `apps/web/android/app/src/main/java/me/meeshy/app/`, ou `PushNotifications.createChannel` depuis `apps/web/src/lib/push/shell-push-runtime.ts`), pour que l'alerte se coupe aussi dans les réglages du système.
- **Type neuf `game_photo_moment`**, envoyé par `GameNotifier` (nouveau `kind`). Les fichiers à toucher sont ceux de `game_mission_window`, réparti sur cinq commits (`git show --stat` sur chacun) : `1b7cf263a0` (shared : `types/notification.ts`, `types/notification-preferences.ts`, `utils/notification-type-enum.ts`, `utils/notification-strings.ts`, **`utils/notification-string-templates.ts`** — `TEMPLATES`, huit langues dont zh-Hans —, `utils/game/notifications.ts`), `cf9c48e07a` (passerelle : `GameNotifier.ts`, `notifications/type-preference.ts`, `schema.prisma` et migration d'index), `0c0bca5f63` et `f2a33aae1a` (web : `lib/notifications/target.ts`, `public/sw-push.js` — parité gardée par `scripts/check-push-target-parity.mjs` —, `components/notification-row.tsx`, `lib/push/shell-push-runtime.ts`, `lib/view/game-copy-v2.ts`), `4129c5becd` (iOS et SDK : `NotificationModels.swift`, `UserNotificationPreferences+Filter.swift`, `NotificationRowPresentation.swift`, `MeeshyUI/Notifications/NotificationCategory.swift`, `RootView.swift`, `iPadRootView+Navigation.swift`, `Navigation/Router.swift` si l'atterrissage porte une ancre « étape mise en avant », `Localizable.xcstrings`). Ajoute `jobs/index.ts` et `GameNavigationMap.swift`. **Routage iOS** : `RootView.swift` est hors budget : ajoute le cas à une liste `case …:` existante ou passe par `GameNavigationMap`, sans ligne nette.
- **Texte** (D13) : neutre et descriptif, rien de sensible sur l'écran verrouillé, aucune pression : « Un moment de ton aventure peut rejoindre ton carnet » / « 3 moments à immortaliser dans ton carnet ». Jamais « t'attend » : un témoin de chaînes l'interdit dans les textes de jeu, huit langues. Textes soumis à `conformite-juridique`. Tap → `/me/progression/carnet` (étape mise en avant) ; la ligne `Notification` de la cloche passe lue quand le carnet s'ouvre.
- **Au premier plan** : iOS avec socket : pas de bannière système, pas de toast pour ce type ; `sw-push.js` n'affiche pas ce type quand une fenêtre cliente est visible (comme il le fait déjà pour d'autres types).
- **Rétrocompatibilité** : le filtre d'envoi lit `PushToken.appVersion` (champ optionnel posé par `routes/push-tokens.ts`), avec une version minimale par plateforme ; un jeton sans `appVersion` est exclu (fail-closed), sauf si la capacité est déclarée à l'enregistrement du jeton ; vérifie que le web et la coque posent `appVersion`. L'en-tête `X-Meeshy-Game-Version` (`knowsGameWave2`, `clientCapabilities.ts`) ne sert qu'aux réponses HTTP : rien ne le persiste par appareil.
- **Ne pas doubler `streak_milestone`** : ses seuils sont `STREAK_THRESHOLDS = [3, 7, 14, 30, 60, 100]` (`packages/shared/types/engagement.ts`, hors préférence et hors plafond) ; ils recouvrent les étapes de Flamme 7, 30 et 100, qui ne poussent pas de `game_photo_moment` le jour où `streak_milestone` part (l'invitation dans l'app reste). `flame:365` n'a pas d'équivalent.
- **Préférence** (D8) : `notification.gamePhotoEnabled` (défaut activé), sous « Jeu » ; `gameEnabled = false` et « Jeu masqué » coupent tout. Schéma `packages/shared/types/preferences/notification.ts`, les trois tables type → préférence, SDK `packages/MeeshySDK/Sources/MeeshySDK/Models/PreferenceModels.swift`, web (`apps/web/src/lib/api/app-preferences.ts`, écran de réglages du jeu), libellés admin.

#### 5.15.5 La mesure (D15, `conformite-juridique`)

Compteurs AGRÉGÉS par jour × famille d'étape × CLÉ d'étape agrégée (rang, palier, seuil de Flamme, édition de Meesh, palier de trésor ; jamais la division ni le numéro de Meesh) × événement (`presented`, `accepted`, `later`, `kept`, `shared`) × surface (`gesture`, `banner`, `carnet`, `push`), sans identifiant d'utilisateur, envoyés seulement si `privacy.allowAnalytics`. Taux d'immortalisation = `kept / presented`, par famille ET par clé. Ouverture des push par les lignes `Notification`. Restitution : une requête d'admin et un compte rendu daté (jamais une page de suivi).

#### 5.15.6 Si l'utilisateur ignore

L'étape reste au carnet (« À rattraper », ou « En attente » pour un moment non déductible), sans expiration, dans l'ordre de sa piste ; aucune relance : une présentation au plus (dans l'app ou par push, jamais les deux), puis la seule pastille, qui s'éteint à la visite du carnet.

---

## 6. Les décisions

Ne retire le label `décision-produit` de #9963 que lorsque D1, D3, D4 et D5 sont tranchées et D2 consignée.

### 6.1 Décisions techniques : tu les tranches et tu les consignes

Chacune devient un fichier sous le `decisions/` du dossier concerné, avec un commentaire d'INFORMATION sur l'issue qui l'a demandée (pas une issue `décision-produit`) :

| # | Question | Tranché |
|---|---|---|
| D2 | Blason : celui de l'app ou celui de la planche | le blason vivant de l'app (`rank-crest.ts`), à l'ancre exportée (§ 5.8) |
| D10 | Police arabe d'apparat | pile système (précédent des stories) ; même règle pour toute écriture non latine |
| D11 | Pose selfie : zone fixe ou Meo déplaçable au doigt | zone fixe déclarée par cadre + guide de cadrage (`faceGuide`), sans détection (H-3) |
| D12 | Coexistence plaque / bandeau de parrainage + QR | bande neutre dessinée par le décor sous la plaque, `banner.box` exportée ; activation du bandeau sur les cadres décorés après H-1, H-6, H-9 (§ 5.9) |
| D17 | Flamme : étiquettes du manifeste ou `FLAME_FORMS` | renommer le manifeste (7 = flamme, 30 = brasier, 100 = astre, 365 = soleil) ; la loi gagne |
| D18 | Le voile chaud dans la fenêtre (alpha 14 à 49, `savane-mythe-b`, `tresor-reserve-a`) | séparé en couche `grade` déclarée, plafonné dans le contrat |

S'y ajoutent les choix d'architecture de ce prompt, consignés de même : le format raster + données (§ 5.1), le contrat JSON comme ressource iOS (§ 5.3), le magasin adressé par contenu (§ 5.10), l'amendement de la garde réseau iOS (§ 5.10), le miroir de la loi du carnet dans le SDK (L3b), la règle d'adoption du carnet web (§ 5.12).

### 6.2 Décisions produit : issues `décision-produit`, GROUPÉES par lot

Ouvre au lot 0 une issue par groupe (cinq en tout), assignée au porteur, labellisée `décision-produit`, chacune avec, pour chaque question : le contexte, les options, ta recommandation et ce qui avance en attendant. Rattache-la aux lots qui en dépendent.

| Groupe (lots) | # | Question | Recommandation | En attendant |
|---|---|---|---|---|
| **Les cadres proposés à chaque étape** (L4, L14) | D1 | Format 1:1 d'un cadre décoré | médaillon par atmosphère produit par le générateur | carré = carte simple, annoncé |
| | D3 | Ambassadeur et Légende : à la division d, le cadre de d seul, ou les cinq du rang ? Orateur/Oracle/Mythe : quel défaut par division ? | les cinq, celui de d en premier ; défaut = dernier choisi dans l'atmosphère courante, sinon A | loi paramétrée |
| | D4 | 13 paliers sans cadre | le cadre dessiné le plus proche en dessous ; titre vivant = le vrai palier | appliquée, réversible dans la loi |
| | D5 | start, niveau 100, Prestige, succès, trophée, ligue, saison | cadres du rang courant + plaque du moment ; commande de cadres dédiés plus tard | appliquée |
| **Les mythologies de Murmure à Polyglotte** (L15) | D16 | Quelle mythologie par rang, combien de décorations | une mythologie par rang, distincte des sept atmosphères, deux décorations A/B, sans choix d'atmosphère (proposition avec planche, motifs revus par `conformite-juridique`) | rangs servis par la v1 ou la carte simple |
| **L'atmosphère et le carnet** (L9, L10a, L10b, L13) | D7 | Atmosphère : préférence de compte ou d'appareil (#9972 dit appareil) ? Changeable librement ? Défaut d'un compte qui ne choisit pas ? | compte ; changeable à tout moment ; Afrique éternelle par défaut, « Choisir plus tard » sans enregistrement, écran reproposé une fois | magasin derrière une interface ; serveur prêt |
| | D21 | Changer d'atmosphère recompose-t-il les photos déjà gardées du rang (#9972) ou les propose-t-il à la reprise ? | les proposer (« Reprendre avec ma nouvelle atmosphère », une ou toutes) : une recomposition silencieuse change un souvenir peut-être déjà partagé, et une entrée sans source ne se recompose pas | proposition ; écart commenté sur #9972 |
| | D22 | Multi-appareil : carnet par appareil, ou signal « immortalisée » (identifiant d'étape seulement) ? | (b), revu par `conformite-juridique` | (a), phrase « Tes photos vivent sur cet appareil » |
| | D23 | iOS : le carnet (sources brutes comprises) entre-t-il dans la sauvegarde iCloud ? | après avis `conformite-juridique` ; à défaut, exclure les sources, garder les images composées | état actuel, consigné |
| **Les alertes d'immortalisation** (L17, L18, L19) | D6 | « Réalisation du jour » : quel événement ? Se rattrape-t-elle ? | ouverture du Coffre du jour ; annoncée par sa célébration, jamais par push ; au plus une par jour ; « Plus tard » garde la plus récente | cadres jour a/b non branchés |
| | D8 | Préférences : sous-interrupteur push dédié, et réglage d'invitation à trois valeurs | `gamePhotoEnabled` (push) + « Me proposer d'immortaliser » (chaque étape / grands moments / jamais) | appliqués |
| | D9 | Le push photo compte-t-il dans le plafond d'une notification de jeu par jour (B-5) ? | oui, dans le plafond, regroupé, différé si le créneau est pris | appliqué |
| | D13 | Texte du push | générique, neutre, sans « t'attend » | appliqué |
| | D14 | Trésor qui redescend : garder le plus haut palier atteint | oui (`treasuryPeakTier`) | palier courant |
| | D19 | L'invitation d'une étape PASSIVE interrompt-elle (ce qui supplanterait #5847) ou reste-t-elle une bannière ? | bannière ; feuille seulement au tap, ou en fin de célébration d'un geste | bannière |
| | D20 | L'arriéré des comptes existants verrouille-t-il les étapes nouvelles ? (a) oui, comme aujourd'hui ; (b) les étapes antérieures à la ligne de base forment une section « Avant le carnet », rattrapable dans l'ordre, qui ne verrouille pas les étapes nouvelles | (b), qui amende la loi livrée par #9961 | (a), avec la phrase de reprise honnête (§ 5.15.1) |
| **La mesure** (L20) | D15 | Mesure : consentement (`allowAnalytics`) ou intérêt légitime ; agrégats seulement | agrégats, coupés par `allowAnalytics` | après avis `conformite-juridique` |

L'issue #9964 (rythme) reste celle de la politique d'alerte : commente-la avec la simulation sur 30 jours, la liste des paramètres de `PHOTO_ALERT_POLICY` et leurs défauts prudents.

---

## 7. Le plan en lots

**Milestone** : les issues neuves vont dans un milestone neuf nommé par le résultat, « Chaque étape du jeu s'immortalise dans un cadre digne d'elle », avec une échéance chiffrée que tu proposes au porteur dans un commentaire de #9963. #9963 et #9972 à #9975 sont aujourd'hui dans le milestone n° 149 (échéance 2026-10-19), alors que leur clôture dépend de ce chantier : propose au porteur, dans le même commentaire, de les déplacer dans le milestone neuf, ou d'en faire des parentes fermées en fin de chantier ; ne les déplace qu'avec son accord. Avance sans attendre sur les lots qui ne dépendent d'aucune décision.

**Pour chaque lot** : issue (titre sémantique, corps Contexte · Preuve · Critère de fin · source, dimensions visées parmi les treize) → `Status = In Progress` → branche `feat/glory-<lot>` poussée dans les quinze minutes avec le témoin rouge → GREEN → REFACTOR → gates locaux → PR vers `dev` (corps : ce qui change, preuve, gates, captures clair et sombre si l'écran change, dette Kotlin consignée) → fusion au vert → commentaire de clôture (preuve, dimensions mûres, issue par dimension non mûre).

**Ordre et chaînes.** Au plus quatre worktrees ouverts à la fois, toutes sessions confondues : dimensionne les chaînes sur `git worktree list` au démarrage. La chaîne design tourne dans le checkout principal (elle n'écrit que sous `docs/product/cadres-de-gloire/` jusqu'au L3). Les alertes ne dépendent que de la loi du carnet déjà livrée : elles partent AVANT la chaîne raster.

| Vague | Chaîne | Lots |
|---|---|---|
| 0 | fondations | L0, puis L0b (en parallèle de la vague 1) |
| 1 | design (checkout principal) | L1 → L2 → L3 → L21a |
| 1 | lois | L3b → L17 → L4 (L4 attend le type du contrat de L3) |
| 1 | passerelle | L10a → L19 (livré éteint) → L5 |
| 1 | alertes clients | L9 → L18 (après L17 et L10a ; aperçu = vignette si présente, sinon la carte actuelle) |
| 2 | peintres et déroulé | L6, L7 et L8 (après la revalidation de L2 et les cibles de L21a), L10b, L11 |
| 3 | compléments | L12, L13, L14, L15 (après D16), L16 (après la revue des motifs) |
| 4 | mesure et livraison | L20 (après D15), L21b, L22 |

### L0 — Les sources de design entrent dans `dev`, la référence est figée, et le chantier est planifié
- Ouvre la PR `docs/cadres-de-gloire-sources` → `dev` (docs seulement, `Refs #9963`) en y ajoutant : ce prompt sous `docs/product/cadres-de-gloire/PROMPT-developpement.md` ; `generateur/fonts/OFL.txt` et un `NOTICE` (fichier → famille, graisse, source, d'après `fonts.css` / `g.css`) ; `export/` dans `generateur/.gitignore` ; le prototype de la planche, relu par l'outil Artifact (`action: read`) et versionné sous `docs/product/cadres-de-gloire/prototype/`. Fusion au vert.
- **Fige la référence de fidélité** : la génération est déterministe ; rends les 191 cadres depuis `c5b1390040` et versionne `docs/product/cadres-de-gloire/reference/sha256.json` + un échantillon en WebP sans perte (un cadre par collection). C'est contre elle que L1 se juge, pas contre des cibles rendues par le générateur refactoré.
- **Relevé initial chiffré** (commentaire sur #9963) : empiètements par collection, poids des SVG, première peinture web mesurée sur `dev` (`bun run build` puis `node scripts/measure-weight.mjs`), configuration push de staging (APNs et FCM valides), environnement de la recette iOS nommé (session Mac ou Remote Control, build TestFlight pointé sur staging, sinon une étape du porteur), état des issues de H-1, H-6, H-9, H-11.
- **Écris l'état des empiètements au porteur** (même commentaire, chiffres de `controle/`) : la correction qu'il a demandée n'est faite que pour l'Empire céleste ; dis-lui le plan de L2 et qu'il revalidera l'avant/après.
- Ouvre le milestone, les issues L0b à L22 avec leurs dépendances, les cinq issues `décision-produit` du § 6.2 ; relie-les en sous-issues de #9963 ou #9382. Consigne les décisions du § 6.1. Propose le déplacement de milestone (ci-dessus).
- Fin : PR fusionnée, référence versionnée, issues et décisions ouvertes, relevé publié.

### L0b — Les écrans neufs sont dessinés et validés avant d'être codés
- Un brouillon de design (artifact de design, autorisé) dérivé de l'interface iOS : écran de choix d'atmosphère, carrousel de décors, sélecteur de pose et guide de cadrage, champ de message, écran de résultat (Flamme, lien, « Faire de <Atmosphère> mon atmosphère »), bannière et feuille d'alerte (annonce et reprise), réglage d'invitation, carnet (place occupée, erreur de place, « Tes photos vivent sur cet appareil »), texte du push ; mobile, iPad, web de bureau, 320 px, clair et sombre.
- Validé par le porteur, puis versionné sous `docs/product/cadres-de-gloire/ecrans/` (captures + source). C'est la référence des captures du § 8.3.
- Fin : validation du porteur citée dans l'issue ; aucun écran neuf de L10b, L11, L18 ne se code avant.

### L1 — Les générateurs exportent des couches et des emplacements de texte (#9963)
- `lib/` : `Card.layer`, `data-slot`, compteur `nid` porté par `Card` (et les cinq ateliers qui y pointent), étiquettes `motifs`, `lib/export.mjs` (couches WebP rognées à leur boîte : `decor` avec sa bande neutre, `windowFill`, `grade` avec son mode, `front` à deux rangs, plaque `plain`/`message`, vignettes), lecture des emplacements de texte et de leur contraste réel, ancres sur la boîte 360² des stickers, graisses de police exactes.
- Les ateliers ne changent que pour taguer couches, emplacements et motifs, et pointer vers le compteur de `Card` (le décor ne bouge pas : le Néon reste tel quel).
- RED : un script de contrôle (`node lib/export-check.mjs`) rouge tant qu'un cadre exporté a du texte ou un oiseau dans `decor`, une fenêtre à alpha > `veilMaxAlpha`, ou un emplacement sans contraste mesuré.
- Fin : les 191 cadres s'exportent en une commande ; deux exports complets sont identiques à l'octet ; la recomposition « couches exportées + texte et oiseaux aux positions cuites » égale la référence de L0 à la tolérance du § 8.3 hors boîtes de texte (les graisses corrigées ne changent que le texte) ; README mis à jour (« Exporter »).
- Preuve : sha256 de deux exports, poids par collection, trois cadres rendus couche par couche dans le commentaire.

### L2 — Mee et Meo ne recouvrent jamais la photo : la garde d'empiètement tourne en CI (#9963)
- **D'abord le détecteur** : `lib/overlap.mjs` v2, fenêtre par DIFFÉRENCE (photo #FF00FF contre photo #00FF00 : plus aucun faux positif magenta), oiseaux lus par `data-layer`, chaque cadre × chaque mise en page × chaque format, enveloppe des stickers autorisés, verdict écrit dans l'export (`validated`), Chromium par `launch.mjs`. **Re-mesure**, et publie le relevé corrigé.
- **Puis les ancres** : ne déplace que les VRAIS empiètements, jusqu'à zéro cadre hors règle (selfie exempté de l'overlap seulement) ; pose par défaut jamais selfie.
- **Revalidation** : republie la planche avant/après comme rendu de design (le Néon en premier), et obtiens la revalidation du porteur avant L7 et L8.
- CI : un job (ubuntu + Playwright, **version de Chromium épinglée**) déclenché par `docs/product/cadres-de-gloire/**`, en matrice sur les seules collections touchées (calculée sur le diff) ; le relevé complet (environ 191 × six mises en page × deux formats × 1,2 s) ne tourne que sur `workflow_dispatch` ou en nuit. Le même job juge la fraîcheur de l'export (§ 5.3). Sur les PR qui ne touchent pas le générateur, seul le témoin géométrique de `packages/shared` (vitest, § 5.7) tourne.
- Fin : 0 cadre hors règle, 0 visage touché ; `controle/` régénéré ; revalidation citée.

### L3 — Le catalogue des cadres est un contrat partagé, lu tel quel par le web et par iOS (#9963)
- Schéma `packages/shared/types/glory-frames.ts`, normaliseur `packages/shared/scripts/import-glory-frames.ts` (`import:glory-frames`), JSON `packages/shared/design/glory-frames/*.json`, `generate:glory-frames` → `packages/shared/design/glory-frames-layout.fixture.json`, `retained.json`, témoin de fraîcheur (vitest).
- iOS : le dossier `../../packages/shared/design/glory-frames` dans la cible de l'app (`project.yml`, `type: folder` + `buildPhase: resources`, et ses entrées au pbxproj, § 9) ; un XCTest décode chaque JSON embarqué et relit la fixture.
- Gardes de données (vitest, `packages/shared`) : vocabulaire ⊂ clés de la loi (attrape « braise » / « phénix ») ; octets et sha256 déclarés = réels ; textes dans leurs boîtes ; contraste déclaré ≥ 4,5:1 (≥ 3:1 au-dessus de 24 px, même calcul que `packages/design-tokens/scripts/check-jetons.mjs`), mesuré contre le panneau OU contre les pixels réels du décor sous la boîte, au pire cas (en cas d'échec, l'export ajoute l'effet déclaré, `shadow` ou `outline`, ou refuse le cadre) ; aucune pose par défaut `selfie` ; une mise en page = deux ancres ou une `pair` ; `validated` conforme ; **au moins un cadre `motifs: ['afrique', …]` par atmosphère autre qu'Afrique éternelle**.
- Matrice de couverture : chaque identité de `photoStepsReached` a au moins un cadre ou une exemption NOMMÉE (D4, D5, D6), dans un cliquet qui ne peut que se vider.
- Corrige les étiquettes de Flamme (D17).
- Fin : `cd packages/shared && bun run type-check && bun run build && bun run test` verts (`bun run test:coverage` pour la parité CI ; un fichier seul : `npx vitest run __tests__/glory-frames-generated.test.ts`) ; le bundle iOS porte les JSON (CI iOS verte).

### L3b — La loi du carnet vit dans le SDK et ses vecteurs sont rejoués des deux côtés
- Déplace le miroir de `photoStepsReached` / `photoCatchUp` / `photoTrackOf` / `photoOfferFor` (`GamePhotoCatchUp.swift`) et `PhotoCatchUpStanding.init(game:)` dans `packages/MeeshySDK/Sources/MeeshySDK/Game/` (moteur de règles sans état : conforme à SDK Purity), avec une enveloppe app inchangée pour les appelants ; retire les fichiers de l'app du pbxproj et inscris ceux du SDK là où il le faut.
- Amène `catchUpStandingOf` (`apps/web/src/lib/game-photo/moments.ts`) dans `packages/shared/utils/game/` : une seule dérivation de la situation depuis le bloc `game`, que le web, iOS et le job serveur (L19) partagent.
- Déclare les lois `photo-catch-up`, `photo-offer` et `photo-standing` dans `game-vectors-law-v2.ts`, `game.vectors.json` et `GameLawVectorEvaluatorV2` (`wave2Laws` et son évaluation ; 610 lignes, il reste de la marge).
- Ajoute `packages/shared/fixtures/reading-modes/game.vectors.json` aux `paths` de `sdk-tests.yml` (push et pull_request), et écris la règle : chaque lot de loi livre TS + vecteurs + Swift + évaluateur dans la MÊME PR.
- Consigne le choix (décision iOS et SDK).
- RED : les vecteurs actuels de `GamePhotoCatchUpTests.swift` et `moments-catch-up.test.ts` deviennent des vecteurs partagés ; une PR qui ne touche que les vecteurs déclenche les tests SDK.
- Fin : `Tests SDK — tranche N` verts, tests de l'app verts, aucune divergence de comportement (diff des sorties avant/après sur les fixtures existantes).

### L4 — Une loi partagée choisit les cadres proposés pour chaque étape (#9972)
- `glory-frames.ts` (§ 5.4), miroir SDK `GameGloryFrames.swift`, loi `glory-frames` dans les vecteurs, dans la même PR.
- RED : vecteurs pour chaque ligne du tableau du § 5.4, dont « Ambassadeur sans atmosphère », « Oracle B, atmosphère `null` → `needsAtmosphere` + `suggested` = Afrique », « choix reporté → `preselected` Afrique, rien d'écrit », « `lastChosen` d'une autre atmosphère → ignoré », « Orateur IV », « Mythe (`rank:mythe:0`) », « Afrique : Savane puis Royaumes », « meesh:200 → or », « tier:comete → aurore ».
- Si la loi est lue par un hôte de l'app entière, elle rejoint la famille `game-law` de `manualChunks` (`apps/web/vite.config.ts`) ou se prouve absente de l'entrée (leçon 589).
- Fin : vecteurs verts en TS et en Swift (`Tests SDK — tranche N`).

### L5 — Les couches des cadres sont servies par une route publique et immuable de la passerelle
- Route `GET /api/v1/game/frames/<sha16>.webp` (§ 5.10), assets sous `services/gateway/assets/glory-frames/`, couche Docker dédiée, `.dockerignore` vérifié, exemption du limiteur global.
- RED (Jest/bun) : 200 + en-têtes (immutable, CORP cross-origin, ACAO `*`) ; 404 sur une empreinte non déclarée, sur `..`, sur toute autre forme ; aucune lecture de base ; la route n'exige pas de jeton ; elle n'entame pas le seau du limiteur ; **un fichier d'un contrat précédent (`retained.json`) reste servi après l'ajout d'un nouveau contrat**.
- Régénère le manifeste de routes et les catalogues d'endpoints ; `PORTES_HORS_REGLE` déclaré.
- `auditeur-adversarial` (route publique) et `sre-infra` (poids de l'image, disque de l'hôte, CDN plus tard).
- Fin : `cd services/gateway && bun run test:coverage` vert ; sur staging, `curl -I https://gate.staging.meeshy.me/api/v1/game/frames/<un fichier>` rend les bons en-têtes (cite le sha servi) ; poids de l'image mesuré.

### L6 — Les polices des cadres sont servies sans peser sur le premier affichage
- Web et iOS selon § 5.6 ; NOTICE des licences ; avis `conformite-juridique` (OFL, nom réservé).
- RED web : une garde « aucune police de cadre précachée ni importée par l'entrée » ; budget en octets.
- RED iOS : un témoin qui enregistre la police et mesure un glyphe (la famille est bien celle demandée).
- RED des deux côtés : un texte cyrillique, CJK ou hébreu prend la pile système, choisie par ses plages Unicode.
- Fin : budgets verts ; captures d'un titre Cinzel sur web et iOS.

### L7 — Le web peint un cadre décoré, et l'aperçu est l'image finale (#9963)
- Module paresseux `apps/web/src/lib/game-photo/glory/` (§ 5.5), `PaintContext` étendu, `fitText` extrait vers `lib/canvas/`, actifs en seau dédié, `close()` des bitmaps, couches d'aperçu à demi-résolution, frappe à l'ancre `crest`, `windowFill`, recadrage, repli carte simple.
- RED : faux contexte qui enregistre les appels — ordre = `stack` ; photo découpée par la fenêtre (`clip` entre `save`/`restore`) ; `screen` borné au grade ; texte réduit puis ellipsé ; arabe en `direction = 'rtl'` ; carte seule ⇒ `windowFill` peint ; Flamme retirée ⇒ absente du fichier ; bandeau retiré ⇒ aucune zone vide dans `banner.box` ; cadre sans couches → carte simple ; aucun `toBlob` hors liste de la garde #8695.
- Budgets : chunk `dynamic_only` dans `apps/web/budgets.json`, garde « le catalogue de cadres n'est pas dans l'entrée » (arête d'import, leçon 589), entrée `glory_frames` (inventaire, octets, jamais précaché, jamais dans `dist`), `glory_frame_catalogs`.
- Fin : `cd apps/web && bun run gate` vert (ou, sans navigateur, la séquence du § 8.1) ; première peinture ≤ 90 Ko (mesurée) ; le gate de fidélité (§ 8.3) passe sur l'échantillon de L21a.

### L8 — iOS peint un cadre décoré, et l'aperçu est l'image finale (#9963)
- Peintre dans `packages/MeeshySDK/Sources/MeeshyUI/Game/` ; `GloryFrameCanvas` dans `GamePhotoCanvasView` qui l'alimente ; `GloryFrameAssetStore` dans `Game/Frames/`, la décision qui amende la garde réseau et les gardes de source étendues (§ 5.10) ; préchargement et décodage dans `GamePhotoSession` ; `MeeStickerCatalog` consommé hors du `body` (version cachée `still(at:maxPixelSize:)`) ; `GamePhotoComposing.compose` reçoit une `PhotoRecipe { frameId, pose, message, crop, mirror, showFlame, showLink }` (mets à jour `MockGamePhotoComposer` et les trois sites qui créent une session : `ProgressionViewModel`, `EngagementRevealHost`, `GameNotebookViewModel`).
- RED : témoin PIXEL sur l'image composée réelle, sur le modèle de `GameReferralCardTests.swift` (source magenta, oiseaux visibles puis masqués, zéro différence dans la fenêtre hors selfie) ; ordre des couches ; `windowFill` en carte seule ; repli carte simple ; frappe rejouée à l'ancre `crest` ; `flameOnCard` et `linkOnCard` toujours effectifs ; flux galerie vert ; pas de lecture de fichier pendant le rendu.
- Inscris chaque fichier neuf au pbxproj (§ 9).
- Fin : `Build app (produits de test)` et les tranches de tests vertes (sujet du commit de tête avec « run test ») ; snapshots du peintre dans `MeeshyUITests` comparés aux cibles de L21a (§ 8.3).

### L9 — Le carnet garde la recette de chaque photo, par compte, sans rien perdre (#9974, #9972)
- § 5.12, web et iOS ; « Plus tard » sans expiration ; une étape n'apparaît qu'une fois.
- RED : une vieille base / un vieil index se relit ; l'entrée ancienne ne propose que nouveau selfie ou carte ; la base web est cloisonnée ; **deux comptes connus ⇒ rien n'est adopté, la base est en quarantaine** ; un seul compte connu ⇒ adoption unique ; la source passe par `developPhoto` et respecte 1 440 px ; une entrée neuve ne garde que le 9:16 ; quota simulé (web) et écriture refusée (iOS) ⇒ état d'erreur, entrée non créée ; `storage.persist()` au premier « Garder » ; une entrée en attente ne disparaît plus ; une étape de piste reportée n'apparaît que dans « À rattraper ».
- `auditeur-adversarial` avant fusion (migration de données locale).
- Fin : témoins verts, revue consignée dans la PR, budget par entrée mesuré et inscrit au § 8.2.

### L10a — La passerelle sert les réglages et le registre des moments photo
- Champs `GameProfile.frameAtmosphere`, `photoInvitations`, `photoAlertsBaselineAt`, `photoAlertsBaseline`, `treasuryPeakTier` (D14, tenu aux écritures du trésor) ; modèle `GamePhotoMoment` à `id` dérivé ; migration d'index datée (DRY_RUN, idempotente, jouée par toi sur staging) ; extension `game.photo` ; table `GAME_PHOTO_ROUTES` (`PUT …/frames/atmosphere`, `PUT …/photo-moments/invitations`, `POST …/photo-moments/presented`) ; manifestes et catalogues d'endpoints régénérés ; export RGPD ; `GAME_PURGED_MODELS`.
- Demande d'avance le feu vert du porteur pour la promotion (commentaire sur #9963 : champs, collection, index, job à venir de L19, sauvegarde vérifiée).
- RED : lecture dans l'extension (et extension illisible qui tombe seule) ; écritures, 409, idempotence de l'accusé (deux POST = une ligne) ; ancien client sans le champ ; purge et export ; la migration rejouée ne change rien et signale un doublon sans le forcer.
- `auditeur-adversarial` avant fusion (registre et index).
- Fin : `bun run test:coverage` vert ; migration jouée sur staging, sortie citée.

### L10b — L'utilisateur choisit son atmosphère à Ambassadeur et la retrouve sur tous ses appareils (#9972)
- Écran de choix (§ 5.11, design de L0b), réglages « Mon atmosphère » et « Me proposer d'immortaliser », optimistic + rollback, cache hors ligne, file d'écritures.
- RED : nouveau client contre serveur sans extension → carte simple et choix gardé localement (404 toléré) ; écriture hors ligne vidée dans l'ordre au retour ; « Choisir plus tard » ⇒ Afrique, rien d'écrit, écran reproposé une fois puis jamais ; l'Afrique en premier.
- Fin : un compte change d'atmosphère sur le web, l'iPhone la montre à la lecture suivante (recette staging).

### L11 — Le déroulé photo propose le cadre et la pose avant de déclencher, et laisse tout changer après (#9963, #9974)
- Web : découpe d'abord `game-photo-flow.tsx` par responsabilité (`game-photo-frame-picker.tsx`, `game-photo-pose-picker.tsx`, `game-photo-message-field.tsx`), parce que le lot y ajoute trois étapes ; étends `FlowState` / `FlowEvent` (`flow.ts`) avec `atmosphere`, `frame`, `pose`, `message`, `crop`.
- iOS : `PhotoFlowState` / `reduce` (`GamePhotoFlow.swift`), `GamePhotoFlowView.swift` (sous-vues dans leurs fichiers).
- L'écran caméra porte le sélecteur de décor et de pose sous l'aperçu et le guide de cadrage : chemin nominal = « Immortaliser » puis déclencher (≤ 2 gestes, cadre et pose présélectionnés). « Autres atmosphères » ouvre une feuille. L'écran de résultat permet de changer cadre, pose et message sans reprendre la photo, et propose « Faire de <Atmosphère> mon atmosphère » quand le cadre vient d'une autre.
- Galerie : la photo se déplace et se zoome dans la fenêtre (doigt, souris, clavier), recadrage gardé dans la recette.
- Conformité dans ce lot : H-11 (`NSCameraUsageDescription` cite les selfies du jeu, sept langues dans `InfoPlist.xcstrings` ; `GameSourceGuardTests.test_theCameraAndPhotoAddUsageKeysAreDeclared` étendu au libellé) ; H-4 sur iOS (la ligne de Meo sur le droit à l'image, clé ajoutée à `Localizable.xcstrings`, sept langues) ; H-2 sur le web (« Afficher ma Flamme », « Partager avec mon lien »).
- Partage et sortie JPEG (§ 5.14) dans ce lot.
- RED : réducteurs purs ; `components/game-photo-flow.test.tsx` (double de `PhotoEnv`) ; `GamePhotoFlowTests` / `GamePhotoSessionTests` ; galerie ⇒ `mirror = false`, recadrage rejoué à la reprise ; frappe toujours présente.
- Fin : un parcours complet Ambassadeur IV sur fixtures web (`__FIXTURES__`, `lib/api/game-fixture.ts`) et sur simulateur.

### L12 — L'auteur écrit un message sur son cadre (#9973)
- § 5.13, sur l'écran de résultat. RED : 61 graphèmes tronqués (comptés par `Intl.Segmenter` / `Character`), retours à la ligne retirés, contrôle bidi, texte jamais interprété, absent du texte de partage, champ masqué sans support ; fixtures « Для мамы », « 給媽媽 », « माँ के लिए », « לאמא », « 🎉🎉 », un mélange latin et arabe : aucune coupe, pile système choisie par l'écriture.

### L13 — Reprendre une photo gardée avec une autre décoration ou une autre pose (#9974)
- Bouton « Reprendre », session au moment de l'entrée, même photo ou nouveau selfie, remplacement de l'entrée ; « Reprendre avec ma nouvelle atmosphère » (D21).
- RED : la reprise remplace et garde la date ; une entrée sans source propose nouveau selfie ou carte ; la pose choisie est celle qui est peinte ; date de plaque : rattrapage sans date connue (« Immortalisé le… »), rattrapage daté, reprise.

### L14 — Le trésor, les paliers, la Flamme, les Meeshes et la réalisation du jour ont leur cadre (#9975 et nouvelles issues)
- Branche les collections `tresor` et `moments` selon la loi (D4, D5, D6, D14, D17) ; `slots` vivants (compte de Meeshes, numéro de Meesh, légende datée, jour, Flamme).
- RED : vecteurs de couverture ; titre vivant du vrai palier sur un cadre de famille.

### L15 — Les rangs Murmure → Polyglotte ont leurs mythologies, au niveau des autres cadres
- Après D16 : nouvel atelier `generateur/ateliers/mythologies/` au même niveau d'exigence (fenêtre propre, oiseaux à ancres, plaque, couches), planche régénérée, rendu de design republié pour le porteur ; motifs revus par `conformite-juridique`. Puis export, import, branchement (la loi et le peintre sont déjà prêts).
- Fin : le porteur a validé la planche ; collection livrée comme les autres.

### L16 — Noms, histoires et textes de cadre dans les sept langues
- **Avant de traduire** : `conformite-juridique` revoit les motifs et les histoires des 191 cadres (exactitude, objets sacrés ou rituels présentés comme décor de selfie partagé — le Sika Dwa asante de « Le Palais du Tabouret d'or », « La Descente du Sika Dwa », « Le Trône des deux infinis », l'Achum de Bafut, Olokun, Odin et ses runes —, symboles détournés), reprises consignées sur #9963 ; l'agent dit quand un avis humain, culturel ou juridique, est requis. Une erreur de sens ou de respect, traduite, se multiplie par sept.
- Catalogues web par collection et par langue (§ 5.6), clés iOS ; slots de décor traduits. Traduction soignée (pas mot à mot), relue sur un échantillon par langue ; ar en RTL.
- Fin : gardes « sept langues » vertes web et iOS ; `check-phone-frame.mjs` étendu au déroulé, à l'alerte et au carnet, sans débordement à 320 px dans les sept langues.

### L17 — Une loi partagée décide quelle étape annoncer, une seule à la fois (alertes)
- D'abord la simulation sur 30 jours, postée sur #9964 (§ 5.15.1).
- `photo-alerts.ts` + miroir SDK + loi `photo-alert` dans les vecteurs, même PR ; `PHOTO_ALERT_POLICY` lue aussi par `photoStepsReached` ; identité `day:<AAAA-MM-JJ>` dans `photo-moments.ts` et son miroir.
- RED : ligne de base sans alerte ; une étape par transition ; l'étape ouverte remplace celle qui saute ; **« Légende II atteinte, aucune photo de rang → `announce` = `rank:legende:2`, `propose` = `rank:murmure:4`, `reached` = ['rank:legende:2'] »** (et sa variante D20 b) ; plafond, écart et délai de grâce ; étape présentée ou notifiée jamais reproposée ; politique « rang seul » ⇒ `rank:oracle:3` ni annoncée ni bloquante ; réglage « grands moments » ; trésor au plus haut palier ; `start` jamais annoncée ; une réalisation du jour au plus par jour.

### L18 — Une étape franchie fait apparaître, au bon moment, l'invitation à l'immortaliser (web et iOS)
- Coordinateur unique, deux natures (§ 5.15.3), bannière non modale, feuille, carte de fin de célébration, lecture du registre servi, accusé sur tout affichage, pastille neutre, réglage d'invitation, design de L0b ; aperçu = vignette si présente, sinon la carte actuelle.
- **Poids web, sans marge** (première peinture à 89,99 Ko pour 90) : l'hôte et ses chaînes rejoignent un chunk paresseux que l'entrée référence DÉJÀ (relevé et prouvé par l'arête d'import, leçon 589) : aucun nom de chunk neuf dans l'entrée. Si aucun ne convient, un lot préalable libère des octets de l'entrée (issue dédiée) ; en dernier recours, une issue `décision-produit` demande au porteur d'arbitrer le plafond (D-49, D-97). Tu ne montes jamais le plafond toi-même.
- Accessibilité : la bannière s'annonce poliment sans voler le focus ; la feuille prend le focus et s'annonce (« Nouveau rang : Ambassadeur IV. Immortaliser ce moment avec Mee et Meo ? ») ; cibles ≥ 44 pt ; Dynamic Type sur les textes de la feuille (l'image composée garde ses tailles fixes) ; Reduce Motion sans animation ; clavier et Échap sur le web ; RTL.
- RED : **une étape passive n'ouvre aucune feuille modale** ; **une Meesh frappée n'ouvre pas de seconde surface après `MintStrikeScene` / `game-mint-strike.tsx`** ; suspendue pendant onboarding, appel, composer, story, saisie ; une seule surface (pas de toast, pas de doublon avec la carte d'offre) ; **push déjà envoyé ⇒ pas de bannière** ; **étape présentée sur l'appareil A ⇒ rien sur l'appareil B** ; **étape immortalisée depuis le carnet ⇒ accusée, donc pas de push** ; accusé hors ligne vidé au retour ; réglage « jamais » ⇒ aucune surface, carnet intact ; visite du carnet ⇒ pastille éteinte, même avec 12 étapes ouvertes ; « Plus tard » met en attente sans expiration ; aucune requête réseau pour afficher l'aperçu.

### L19 — Une étape franchie app fermée arrive en une notification discrète et regroupée
- Interrupteur `GAME_PHOTO_PUSH`, job, type `game_photo_moment`, préférence, routage, rétrocompatibilité (§ 5.15.4) ; seed de staging versionné sous `services/gateway/scripts/`, qui refuse tout `DATABASE_URL` hors staging.
- RED (passerelle) : interrupteur `off` ⇒ rien ne part ; ligne de base ; étapes du serveur = étapes du client sur une même fixture ; pas de push si présentée ou si une socket est active ; regroupement qui ne recompte que le non notifié et remplace le précédent ; DND testé avant `GameNotifier` ; heures calmes de la politique dans `effectiveZone` ; créneau du jour pris ⇒ différé une fois ; plafond B-5 ; `gameEnabled`, `gamePhotoEnabled`, « Jeu masqué » ; jetons sans `appVersion` ou trop anciens exclus ; pas de doublon avec `streak_milestone` (7, 30, 100) ; texte sans « attend » ; purge et export. RED clients : tap → carnet (web et service worker, iOS), ligne lue à l'ouverture du carnet, `sw-push.js` muet quand une fenêtre est visible.
- `auditeur-adversarial` avant fusion ; textes chez `conformite-juridique`.
- Fin : sur staging, interrupteur allumé, un compte de recette franchit une étape app fermée et reçoit UNE notification (iOS et coque Android), dont le tap ouvre le carnet.

### L20 — On mesure combien d'étapes sont immortalisées
- Après D15 : compteurs agrégés par famille et par clé (§ 5.15.5), route d'ingestion, lecture admin ; aucune donnée personnelle.
- Fin : un compte rendu daté de la première semaine de staging.

### L21a — Les cibles de fidélité existent avant que l'app ne peigne
- Après L2 : le générateur rend les cibles d'un ÉCHANTILLON (un cadre par collection × chaque mise en page × avec et sans message × 9:16 et 1:1), en WebP sans perte, versionnées sous `docs/product/cadres-de-gloire/cible/` ; le jeu complet est produit comme artefact du job du générateur, jamais versionné.
- Fin : échantillon versionné, commande unique de régénération, Chromium épinglé.

### L21b — Le maintien du design est gardé en CI
- Gates du § 8.3 (web Playwright, iOS snapshots), inscrits explicitement dans `ci.yml` (`bun run gate` n'y est PAS lancé : chaque maillon s'énumère).
- Fin : un écart volontaire de 3 px sur une ancre ou une couleur fait tomber le gate (preuve que le témoin peut tomber, leçon 231).

### L22 — Recette staging, puis production par trois chemins
- Recette du § 8.6.
- **Ordre rétrocompatible** : la passerelle d'abord (route des couches, extensions optionnelles, routes neuves), les clients ensuite.
- **Passerelle** : `promote-production.yml`, avec l'input `feu_vert_porteur` (le diff touche `packages/shared/prisma/**` et `services/gateway/src/jobs/**`), après que la migration d'index a été jouée en production avec ce feu vert et une sauvegarde vérifiée ; `GAME_PHOTO_PUSH` reste `off` jusqu'à la recette en production, puis s'allume par un geste réversible.
- **Web** : aucun workflow ne promeut la webapp (son image de staging porte l'origine de staging, figée au build). La production web est une image `meeshy-webapp` construite sur un tag `v*.*.*` par `docker.yml` (`API_BASE=''`) ; son déploiement se cadre avec `sre-infra` et reste un geste du porteur tant qu'il n'est pas outillé. Retrouve ou ouvre l'issue « l'origine de l'API se lit à l'exécution » (la même image pour les deux environnements) et déclare-la comme dépendance ; prépare le tag et ses notes.
- **iOS** : TestFlight pour la recette, puis `ios-release.yml` / la lane fastlane `release`, dont la soumission attend l'approbation de l'environnement protégé `appstore-submit`.
- Compte rendu au porteur.
- Fin : staging recetté, passerelle promue, demandes web et iOS déposées.

---

## 8. Le protocole de vérification « maintien et bon design »

### 8.1 Les gates à garder verts

- `ci.yml` : `Changes`, `Quality (bun)` (dont l'étape « Gates web (jetons dérivés + poids de la première peinture) » et `measure-weight.mjs`), `Peaux web (institutionnel, Lentille, états et virtualisation du fil)` (tu y ajoutes `check-glory-frames.mjs`), `Coque Android (apps/web)`, `Test shared`, `Test gateway`, `Test web` (matrice `Test ${package}`), `Security`, `Prisma`, `Build (bun)`.
- `ios.yml` : `Gardes de l'outillage iOS` (inscription des témoins au pbxproj COMMITÉ, quoting), `Build app (produits de test)`, `Tests unitaires — tranche N`, `Build app + tests unitaires`. Les tests ne s'exécutent que si le SUJET du commit de tête contient « run test » (ou « smoke test », « to test »).
- `sdk-tests.yml` : `Build SDK (produits de test)`, `Tests SDK — tranche N` ; déclenché par `packages/MeeshySDK/**` et, après L3b, par `game.vectors.json`.
- `docker.yml` : `Build gateway` (le nom exact est `Build ${{ matrix.service }}`), `Deploy to staging`.
- Le job neuf du générateur (L2 : empiètement et fraîcheur de l'export).
- Un rouge PRÉEXISTANT se prouve par le run CI de `dev` et se dit dans la PR. Ne désactive jamais un témoin, ne baisse jamais un seuil.

Locaux (derrière le proxy : `bun install --ignore-scripts` ; puis `cd packages/shared && npx prisma generate --generator client && bun run build`) :
- shared (vitest, jamais `bun test`) : `cd packages/shared && bun run type-check && bun run build && bun run test`, et `bun run test:coverage` pour la parité CI ;
- passerelle : `cd services/gateway && bun run test:coverage` ;
- web : `cd apps/web && bun run gate` (il contient type-check, `bun test`, build, `measure-weight.mjs` et les `check-*.mjs` ; Chromium requis). Sans navigateur : `bun run type-check && bun test && bun run build && node scripts/measure-weight.mjs` ;
- iOS : impossible dans le conteneur Linux (ni `xcodegen`, ni `swift`, ni `xcodebuild`) : la CI macOS est la preuve ; sur un Mac, `./apps/ios/meeshy.sh build` puis les tests.

### 8.2 Les budgets

- **Première peinture web ≤ 90 Ko gzip** (D-49), à 89,99 Ko sur `dev` au 2026-10-10 (#9848) : environ dix octets de marge. Mesurée à chaque lot web ; aucun décor, aucune police de cadre, aucun catalogue de cadres, aucun nom de chunk neuf dans l'entrée (chacun coûte de 13 à 30 octets). Plan de l'hôte d'alerte : L18. Le plafond est arbitré par le porteur (D-49, D-97) : tu ne le montes jamais.
- Chunks à la demande : entrées `on_demand_chunks` en `dynamic_only`, prouvées par l'arête d'import ; `glory_frame_catalogs` neuf, nommé hors du motif `catalog-<lang>-` ; `interface_catalogs` inchangé.
- Précache Workbox : total mesuré avant et après chaque lot web ; aucune couche, aucun catalogue de cadres précaché.
- Couches : inventaire et octets par collection (`glory_frames`), jamais précachées, jamais dans `dist`, jamais dans l'APK ; poids ajouté à l'image Docker de la passerelle, mesuré.
- Carnet : octets par entrée (source + 9:16), mesurés au L9 et inscrits ici.
- iOS : mesure la croissance de l'application (socle embarqué, polices, JSON) et consigne-la dans la décision ; packs d'atmosphère hors bundle.
- Mémoire : un seul jeu de couches pleine taille décodé à la fois, aperçu à demi-résolution ; profil Instruments sur un iPhone d'entrée de gamme sous iOS 16 (iOS) et `performance.memory` / heap snapshot (web) après dix allers-retours dans le déroulé : retour au niveau de départ.

### 8.3 La fidélité à la planche (web et iOS)

- **Référence** : `docs/product/cadres-de-gloire/reference/` (L0), rendue depuis le design validé ; elle juge le générateur refactoré (L1), qui ne peut pas se juger lui-même.
- **Cibles** : l'échantillon de L21a (WebP sans perte), rendu avec une photo FIXTURE versionnée (`generateur/fixture/photo.jpg`, libre de droits, pas un visage réel identifiable), le texte français fixe, la pose par défaut et une date fixe ; le jeu complet en artefact du job. Une commande régénère tout ; Chromium est épinglé. **La fraîcheur se juge sur l'export normalisé** (contrat JSON et empreintes des couches), jamais sur les octets PNG de Chromium, qui dépendent de sa version, de l'hinting et du GPU. Aucune cible n'est posée à la main.
- **Comparaison** (l'app compose avec les MÊMES entrées) :
  - hors boîtes de texte et de blason : au moins 99,5 % des pixels avec |Δ| ≤ 6 sur chaque canal (sur 255), et aucun bloc 16×16 dont le Δ moyen dépasse 12 ;
  - boîtes de texte : SSIM ≥ 0,90 en français, et géométrie vérifiée dans les sept langues (largeur mesurée ≤ `maxWidth`, arabe en RTL, aucune coupe) ;
  - empiètement relancé sur l'image composée ;
  - Néon : le décor composé est comparé à la cible avec la même tolérance (« tel quel »).
- **Web** : `apps/web/scripts/check-glory-frames.mjs` (Chromium par `scripts/lib/browser.mjs`) compose l'échantillon avec le vrai peintre, et vérifie de plus que l'aperçu (canvas d'aperçu) et le fichier composé sont identiques sur un still. Inscrit dans le job « Peaux web ». Contrôle sur les deux moteurs quand le défaut peut être propre à l'un (leçon 576) : Chromium en CI, WebKit dans la recette.
- **iOS** : snapshots du peintre de `MeeshyUI` dans `MeeshyUITests` (`swift-snapshot-testing` 1.17.6, `perceptualPrecision: 0.98`) contre les mêmes cibles, et un XCTest de l'app qui relit la fixture de géométrie partagée et décode chaque JSON embarqué. Les références sont ré-enregistrées par `sdk-tests.yml` (`record_snapshots`), jamais à la main.
- **Les écrans neufs** (choix d'atmosphère, carrousel, poses, message, résultat, bannière et feuille d'alerte, réglage, carnet) : captures automatiques en clair et en sombre, dans les sept langues, à 320 px (`check-phone-frame.mjs`) et sur iPad, comparées au design de L0b.
- **Revue humaine** : planche régénérée depuis l'app (une capture par collection) et republiée comme rendu de design pour le porteur ; preuve dans le commentaire de clôture.

### 8.4 Les dimensions à vérifier sur chaque écran touché

| Dimension | Ce qui doit être vrai ici |
|---|---|
| Sécurité | aucune photo, source ni message ne quitte l'appareil ; seuls des identifiants d'étape remontent ; route publique en liste blanche ; texte jamais interprété ; push sans contenu sensible ; aucune donnée d'un compte lisible sous un autre (carnet web) |
| Performance | aperçu d'alerte et sélecteur sans attente réseau ; premier rendu du cadre < 300 ms sur cache chaud (mesuré) ; composition < 1,5 s sur iPhone d'entrée de gamme et coque Android |
| Mémoire | décors libérés à la sortie du déroulé ; couches rognées, aperçu à demi-résolution ; vignettes bornées ; aucun `ImageBitmap` non fermé |
| Fluidité | 60 i/s dans le carrousel de décors et pendant l'aperçu caméra ; frappe sans saccade |
| Accès | VoiceOver / TalkBack / lecteur d'écran (sélecteurs en radios étiquetées par le nom du cadre, histoire lisible, image composée décrite par son moment et son cadre, bannière annoncée sans voler le focus) ; cibles ≥ 44 pt ; Dynamic Type sur l'interface ; clavier sur le web ; contrastes ≥ 4,5:1 ; RTL |
| Positionnement | même parcours, mêmes mots, même ordre sur web et iOS (D-1) |
| Facilité | ≤ 2 gestes du chemin nominal ; présélections justes |
| Expérience | états vide, chargement (vignette d'abord), erreur (carte simple, plus de place), hors-ligne dessinés ; animation qui explique, coupée par Reduce Motion |
| Compatibilité | iOS 16 → 26 et iPad ; navigateurs courants et coque Android ; réseau lent, données réduites et hors-ligne ; clair et sombre (le chrome suit le thème, l'image composée non) ; sept langues ; ancien client contre nouveau serveur et l'inverse |
| Utilité | taux d'immortalisation mesuré par famille et par clé d'étape (L20) |
| Maintenabilité | une loi (dans le SDK pour Swift), un contrat, un peintre par plateforme, aucune jumelle ; fichiers ≤ 1 200 lignes ; décisions consignées |
| Simplicité | aucune configuration obligatoire ; l'atmosphère peut se choisir plus tard ; un réglage, trois valeurs |
| Complétude | matrice étape × cadre × format × langue × plateforme remplie ; exemptions nommées |

### 8.5 La revue

Chaque PR est relue par une seconde passe qui RELIT et CORRIGE (pas seulement commente) : cohérence avec ce prompt, gates rejoués, captures. `auditeur-adversarial` sur L5, L9, L10a, L18 (multi-appareil) et L19 ; `conformite-juridique` sur L6, L15, L16 (motifs et histoires, avant traduction et avant toute promotion), L19 (textes du push), L20, H-11 et D23 ; `sre-infra` sur L5, L19 (interrupteur) et L22.

### 8.6 La recette sur staging (avant toute promotion)

- Comptes de recette sur staging (tu gères seul les données de staging, #9226), amenés aux étapes par les voies normales du jeu ou par le seed versionné de L19 (qui refuse toute base hors staging) : Polyglotte I → Ambassadeur V (choix d'atmosphère), Orateur, Légende, Mythe, palier, Flamme 7, 10e Meesh, Bourse ; un compte « existant » avec un arriéré de rang.
- Sur Chrome (web), la coque Android et iOS (dans l'environnement nommé au L0) : choisir son atmosphère ou la reporter, photographier chaque famille (selfie, galerie, carte seule), écrire un message, reprendre avec une autre pose, partager en 9:16 et 1:1 avec et sans Flamme ni lien, rattraper au carnet, recevoir une invitation de geste, une bannière passive et une notification app fermée, deux appareils pour une seule invitation, couper le réglage et la préférence.
- Clair et sombre, sept langues (au moins fr, de, ar en entier), réseau lent (throttling), données réduites et hors-ligne.
- Captures nommées par écran et par langue, jointes au commentaire de clôture ; le sha servi par staging est cité.

---

## 9. Les pièges connus

- **Première peinture web à 89,99 Ko pour 90** : `apps/web/src/lib/i18n-game-catalog.ts` vit dans l'entrée (n'y ajoute aucune partie) ; chaque nom de chunk coûte de 13 à 30 octets dans la table de préchargement de l'entrée ; `manualChunks` (`apps/web/vite.config.ts`, famille `game-law`) capture des modules par motif de chemin : une loi neuve lue partout doit rejoindre la famille ou se prouver hors de l'entrée ; seule l'arête d'import le prouve (leçon 589).
- **Précache Workbox** : `globPatterns` prend `**/*.{js,css,html,svg,woff2}` : les catalogues de noms (du JS) y tombent sans `globIgnores` ; aucune couche dans `dist`. Le seau d'exécution `medias` est partagé : seau dédié. Un chunk nommé `catalog-<lang>-…` tombe sous le budget `interface_catalogs`.
- **Canvas teinté** : sans CORS, `toBlob` lève `SecurityError` sur la coque (origine locale). `fetch` CORS + `createImageBitmap`.
- **Garde #8695** (`apps/web/src/lib/media/photo-develop-guard.test.ts`) : tout `toBlob(` / `convertToBlob(` hors liste fait tomber le témoin ; le still du selfie lui échappe aujourd'hui par `toBlob?.(` : ne t'en sers pas comme précédent, déclare ou passe par `developPhoto`.
- **Gate d'harmonie** (`apps/web/scripts/check-design-harmony.mjs`) : aucun hex dans un `.ts/.tsx` ; les couleurs des cadres sont des DONNÉES JSON, ou le dossier du peintre rejoint les exemptions avec sa raison (précédent `lib/calls/frames/`).
- **`GameSourceGuardTests`** interdit le réseau sous `Game/Photo/` : la décision qui l'interdit s'AMENDE (le déroulé n'atteint le réseau que par `GloryFrameAssetProviding`) et la garde s'étend en conséquence ; un téléchargeur posé dans un dossier voisin pour la contourner laisserait un témoin vert qui ne garde plus rien.
- **`ImageRenderer`** ne rend pas l'asynchrone et rend à `scale = 1` : tout est décodé AVANT. `MeeStickerCatalog.stillImage(id:)` relit le fichier à chaque appel : jamais dans `body`.
- **`FileSizeBudgetGuardTests`** n'exempte pas le généré : d'où le contrat JSON en ressource de bundle plutôt qu'un Swift généré. `RootView.swift` est dans `legacyOverBudget` (cliquet cumulatif `legacyLineCeiling`) : aucune ligne nette.
- **Montage des hôtes iOS** : `EngagementRevealHost` est posé par `.engagementReveal(router:)` dans `RootLayers/RootViewLayers.swift` et `RootLayers/iPadRootViewLayers.swift` (témoin `EngagementRevealWiringTests`), pas dans `RootView.swift` ni `iPadRootView.swift`.
- **`DesignLiteralRatchetGuardTests`** borne `Color(hex:)`, `cornerRadius`, `.padding(` : couleurs en données, ou exemption justifiée.
- **xcstrings** : sept langues pour toute clé `game.*`, anglais non recopié ; la chaîne de la caméra vit dans `InfoPlist.xcstrings`.
- **pbxproj sous Linux** : pas de `xcodegen`. `project.yml` balaie récursivement `sources: - path: Meeshy` et `- path: MeeshyTests` : un `.swift` neuf n'y demande aucune ligne ; seul un dossier de RESSOURCES en demande une (`type: folder` + `buildPhase: resources`, sous `sources:`, leçon 182). Au pbxproj, ajoute à la main, quotées, pour chaque `.swift` neuf ses entrées `PBXBuildFile`, `PBXFileReference`, enfant de groupe et phase Sources (modèle `1cbfbfd9`, qui ajoute à des groupes EXISTANTS) ; pour un dossier neuf (`Game/Frames/`), ajoute aussi son `PBXGroup` et l'enfant correspondant dans le groupe parent ; pour une référence de dossier de ressources, sa `PBXFileReference` de type dossier, son `PBXBuildFile` et la phase Resources. `apps/ios/scripts/check_test_registration.sh` lit le pbxproj COMMITÉ. Sur un Mac, régénère par `xcodegen generate` et compare.
- **Tests iOS en CI** : seulement si « run test » est dans le SUJET du commit de tête.
- **Vecteurs** : `GameLawVectorTests` exige l'ensemble EXACT des lois ; `sdk-tests.yml` ne se déclenchait pas sur les vecteurs (L3b) ; une loi dont le miroir reste dans l'app n'est rejouée par rien de partagé. `packages/shared` se teste par vitest (`bun run test`), jamais par `bun test`.
- **Routes de jeu** : `GAME_ROUTES` et `GAME_INTEGRATION_ROUTES` ont un nombre d'entrées figé par `GameRoutesTests.swift` : table neuve (`GAME_PHOTO_ROUTES`). Toute route impose de régénérer le manifeste de routes (cliquet `route-manifest-ratchet.test.ts`) et les catalogues d'endpoints ; préfixe `/api/v1` obligatoire ; ces fichiers régénérés ne s'écrivent que par un lot à la fois.
- **Schéma strict** `gameSettingsResponse` (`additionalProperties: false`) : un champ non déclaré est retiré en silence.
- **RGPD** : `export-game.ts` énumère les champs à la main ; `GAME_PURGED_MODELS` doit lister toute collection de jeu par compte.
- **Index Mongo** : rien ne naît du schéma Prisma (#9035) ; un unique sans script daté n'existe pas en base. `id` dérivé pour ne pas dépendre de l'index.
- **Promotion** : tout changement de `schema.prisma`, de `jobs/` ou un `createIndex` exige le feu vert écrit du porteur ; la webapp et iOS n'ont pas de promotion par ce canal.
- **Notifications** : `NotificationService` supprime sous DND (teste `isWithinDnd` avant) ; `GameNotifier` garde la `onceKey` 14 jours même sur `skipped:declined` (le registre `notifiedAt` fait foi) ; trois tables type → préférence à tenir ensemble ; chaînes en 8 langues (zh-Hans) dans `notification-string-templates.ts` ; parité `sw-push.js` / `target.ts` gardée ; un ancien iOS décode un type inconnu en `.system` ; iOS au premier plan avec socket : le toast prend le relais, à court-circuiter pour ce type ; `dndUtcOffsetMinutes` vaut 0 sur les anciens documents.
- **Les quatre notifications legacy** (`badge_earned`, `achievement_unlocked`, `streak_milestone`, `level_up`) sont hors préférence et hors plafond : `streak_milestone` (3, 7, 14, 30, 60, 100) recouvre les Flammes 7, 30 et 100.
- **`GameStandingService`** sert le jeu d'un autre membre : jamais une source de détection.
- **Le trésor redescend** : sans plus haut palier, l'étape disparaît du carnet.
- **Manifestes de design** : libellés, pas des clés ; étiquettes de Flamme décalées ; `layout` en prose. Le normaliseur refuse tout ce qui n'est pas une clé de loi.
- **Détecteur** : le seuil magenta capte les décors magenta (Néon) jusqu'à sa réparation (L2) ; environ 1,2 s par cadre : matrice par collection touchée, relevé complet à la demande ou la nuit.
- **Ancres** : PNG rognés du générateur ≠ stickers 360² de l'app ; un `duo-*` est UN sticker à deux oiseaux, donc une seule ancre.
- **Polices** : graisses non chargées dans la planche actuelle (Manrope 600 rendue en 700) : les cibles se régénèrent avec les bonnes graisses ; aucune ne couvre l'arabe ni les autres écritures ; ne modifie pas Cinzel Decorative (nom réservé) ; l'OFL exige sa licence à côté des fichiers.
- **Le blason du générateur n'est pas celui de l'app.**
- **Carnet web** : base non cloisonnée aujourd'hui, entrées sans `userId` (D-154 : jamais d'adoption au doute), aucun `storage.persist()` (Safari efface un site non installé après 7 jours sans visite).
- **Rétrocompatibilité** : extensions optionnelles tolérantes, anciens carnets relus, nouveau client contre ancien serveur = carte simple et 404 tolérés, ancien client = ce qu'il fait aujourd'hui ; fichiers de couches et identifiants de cadre jamais retirés avant zéro usage.
- **La photo reste sur l'appareil** ; **aucune analyse du visage** (H-3).
- **Android Kotlin gelé** : aucun portage ; la dette se consigne dans les commentaires de clôture.
- **Staging** : la passerelle de staging est `gate.staging.meeshy.me` (le `CLAUDE.md` dit `staging.meeshy.me/api/v1`, c'est faux).
- **Fusion** : `gh pr merge --merge` au vert ; jamais `--auto`.
- **Projects v2** : GraphQL peut rendre 403 ; la branche poussée réserve, le commentaire d'issue trace.
- **Découpage** : `game-photo-flow.tsx`, `GamePhotoFlowView.swift` et `progression-carnet.tsx` sont dans le budget ; tu les découpes par responsabilité parce qu'ils reçoivent de nouvelles étapes, pour rester sous 1 000 lignes après ajout.

---

## 10. Comment rendre compte

- Chaque lot : commentaire de clôture de son issue (preuve : PR, gates, mesures, captures ; dimensions mûres ; issues ouvertes pour le reste ; dette Kotlin consignée).
- Chaque décision : son fichier sous le `decisions/` concerné + commentaire sur l'issue qui l'a demandée ; l'écart avec #9972 (recomposition) se commente sur #9972.
- Chaque correction du porteur : une leçon dans `tasks/lessons/`.
- Fin de chantier : un compte rendu daté au porteur (artifact autorisé : compte rendu), qui renvoie aux issues fermées, aux captures de recette, à la mesure de la première semaine et aux trois chemins de mise en production.
