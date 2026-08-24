# MeeshyComposer v2 — Une seule entrée pour créer et pour éditer

> **Statut** : conception approuvée section par section, non implémentée.
> **Périmètre** : iOS en PRIORITÉ, web en seconde priorité (directive du
> 2026-08-23). **Android est mis de côté** — le lot H de la spec d'exécution est
> suspendu, sans tâche ni gate, tant que cette directive tient.
> **Prédécesseur** : `2026-08-20-meeshy-composer-execution-spec.md` (lots A→H,
> A/B/D/E/F et chrome C1–C8 livrés sur `main`).

---

## A. Ce que ce chantier est, et ce qu'il n'est pas

Ce n'est **pas** un nouveau projet. La spec d'exécution v1 possède une section
`F. Hors v1` déclarée « EXHAUSTIVE — un comportement ni implémenté par un lot ni
listé ici est un défaut de spec, pas une licence d'interprétation ». Ce chantier
est la **promotion d'un sous-ensemble nommé de cette liste**, plus trois lois
produit arrêtées le 2026-08-23.

| Ligne promue depuis « Hors v1 » | Devient |
|---|---|
| porte `.feedComposer` vers le host *(conditionnée à la surface « document sans scène », C4)* | lot 3 |
| surface « document sans scène » du host (I6) | lot 2 |
| Mood dans le composer unifié (S3) | lot 4 |
| porte `.reelTab` | absorbée par l'éventail (lot 1) |
| composer web complet | lot 6 |
| pont serveur `MessageAttachment`→`PostMedia` (O13) | lot 5 |
| file de publication UNIQUE (`PublishIntent`, S2) | lot 7 |

Tout le reste de `F. Hors v1` **reste hors périmètre** et garde son opposabilité.

---

## A bis. Conciliation avec l'existant documentaire *(2026-08-23)*

Ce document n'est **pas** le premier sur le sujet, et il ne remplace rien. Trois
artefacts le précèdent, avec des rôles distincts qu'il faut nommer avant d'y
ajouter quoi que ce soit.

| Artefact | Rôle | État |
|---|---|---|
| `2026-08-19-meeshy-composer-design.md` | la conception d'origine | figée |
| `2026-08-20-meeshy-composer-execution-spec.md` | le **contrat gelé** inter-lots (A→H, « Hors v1 » opposable) | figée |
| `2026-08-19-meeshy-composer-views.html` — *Planches MeeshyComposer*, 351 Ko | la **source vivante** : doctrine, inventaire, matrice maîtresse, **et le tableau de bord d'avancement** | rév. 10, 2026-08-22 — **77 %, 50/65 tâches** |
| **ce document** | l'**extension** : promotion de « Hors v1 » + lois nouvelles | en revue |

### La règle de maintenance que ce chantier hérite

Les planches portent une contrainte explicite, et elle s'applique à nos lots :

> « Chaque tâche dont le gate passe met à jour cette planche — camembert ET
> matrice — dans le MÊME commit que son gate ; un P0 périmé est un défaut
> bloquant au sens de §E de la spec, exactement comme une ligne d'inventaire
> perdue. »

Le tableau de bord compte déjà `carrierAspect` (`b82ebbc17`) comme l'une de ses
65 tâches. **Nos lots en deviennent la suite, pas un compte parallèle** — un
second décompte qui ignorerait le premier reproduirait exactement le défaut que
cette règle combat.

### Nos six lois face aux onze de la doctrine

La doctrine des planches est **antérieure et souveraine** : « quand deux
planches semblent se contredire, c'est la loi qui tranche ». Confrontation
faite, une par une :

| Loi de ce document | Statut face à la doctrine |
|---|---|
| 1 — contrat partagé mince | **neuve** — la doctrine est iOS ; rien n'y traite du contrat inter-plateformes |
| 2 — hydratation à deux sources | **neuve** |
| 3 — on n'écrit que ce qu'on sait complet et qu'on a su rendre | **neuve** |
| 4 — la porte déclare un éventail | **RAFFINEMENT de la loi 9**, pas une loi neuve — voir ci-dessous |
| 5 — le repost miroite ; changer de format est l'ancrage | **neuve**, mais bornée par la loi 10 |
| 6 — la fiche de forward est le « où va ceci ? » universel | **neuve** |

### Trois contraintes que la doctrine impose à ce chantier

**Loi 9 — « La porte ne fixe que l'état initial ».** Notre loi 4 n'invente donc
rien : elle **nomme la structure** de ce que la loi 9 énonce déjà (« les
capacités visibles sont `f(format COURANT, seed)` »). `offeredFormats` est la
forme donnée à ce `f`, plus le gate `qualifiesAsReel`. Elle se lit comme une
précision de la loi 9, jamais comme une douzième loi.

**Loi 4 — « Rien à l'écran sans raison ».** Conséquence directe et non
négociable pour l'éventail : **un format non offert est ABSENT, jamais grisé.**
Un réel non qualifiant ne se montre pas en gris avec une infobulle — il n'est
pas là. La seule exception nommée par la doctrine est le sélecteur d'audience
d'un repost, qui montre ses niveaux bornés verrouillés AVEC leur raison (P10).

**Loi 10 — « L'audience se souvient PAR FORMAT ».** Elle borne notre loi 5 :
quand un repost miroite le format de sa source, c'est la **mémoire d'audience
de ce format-là** qui s'applique — puis la loi d'audience du repost la
rétrécit encore (`StoryRepostAudience`, un repost ne peut jamais être plus large
que sa source). Les deux se composent ; aucune ne prime.

### Le lecteur : il EXISTE, et il est l'aperçu

Vérification demandée avant d'ouvrir le chantier :

- **`MeeshyComposerHost` n'existe pas.** `apps/ios/.../Composer/` ne contient
  que `ComposerIntent.swift` (194 l.). Le host est à construire — c'est le
  lot C2 de la session qui le prend.
- **Le lecteur existe et il est éprouvé.** `MeeshyScenePlayer` (274 l.) +
  `ScenePlayerMode` (37 l.), livrés au lot B4, couverts par **881 lignes de
  tests SDK** (`ScenePlayerModeTests`, `ScenePlayerReaderContractTests`,
  `ScenePlayerIdentityRootTests`) et **975 lignes de gardes app**
  (`StoryViewerScenePlayerGuardTests`, `…DocumentGuardTests`,
  `FeedPostCardScenePlayerGuardTests`).

Et la **loi 6 — « Le lecteur EST l'aperçu »** en tire la conséquence qui nous
concerne : composer et viewers partagent le MÊME registre de rendu. **Aucun lot
de ce document ne construit d'aperçu.** L'aperçu du socle, la carte de feed et
le viewer plein écran sont trois chromes d'un seul moteur — en ajouter un
quatrième casserait le WYSIWYG par construction.

## B. Les six lois

### Loi 1 — Le contrat partagé porte la loi produit, jamais les affordances

`packages/shared` ne descend que ce que les deux plateformes doivent honorer à
l'identique :

1. les portes, comme données ;
2. le format initial **et l'éventail** de chacune (loi 4) ;
3. `buildUpdatePayload(known, draft)` (loi 3).

Ne descendent **pas** : `showsSlides`, `showsTimeline`, `opensWith`,
`allowsCapture`. Le web n'a pas d'atelier ; lui faire porter ce vocabulaire
promettrait des affordances inexistantes, et un vocabulaire non honoré diverge
en silence.

### Loi 2 — L'hydratation de l'édition a deux sources

`StoryComposerViewModel+Edit.swift` (123 l.) fait déjà, pour les stories iOS,
tout ce qu'exige une édition fidèle : `editingPostId` route vers `PUT /posts/:id`,
`editingOriginalMediaIds` se diffe en `removeMediaIds`,
`editingHydratedBackgroundImage` se compare par **identité** (`===`) pour
qu'un fond inchangé ne soit jamais ré-uploadé, `editingInitialVisibility`
préserve l'audience — le tout derrière un préchargement 3-tier qui repeint le
canevas immédiatement.

Son septième champ raconte le piège déjà payé :

```swift
public internal(set) var editingKnowsDeclaredReferences = false
```

La charge utile du tray porte des mentions **amputées par construction** — le
`select` du fil écarte les mentions silencieuses. Les republier au PUT
révoquerait celles que l'auteur avait posées discrètement. Le composer se **tait**
donc sur ce champ jusqu'à ce que la lecture unitaire lui donne le jeu autoritaire
(`adoptDeclaredReferences`).

**Généralisation** : l'hydratation ouvre sur la charge de liste (immédiate,
incomplète) et se met à niveau sur la lecture unitaire (autoritaire, plus lente).
Cache-first appliqué non à l'affichage, mais à la **sûreté d'écriture**.

### Loi 3 — On n'écrit que ce qu'on sait complet et qu'on a su rendre

Deux raisons indépendantes rendent un champ non-écrivable :

1. **le composer ne l'a pas rendu** — le formulaire web n'a jamais peint le
   canevas iOS, il ne peut pas le réécrire ;
2. **le composer ne le connaît qu'amputé** — cf. loi 2.

Sanction unique : **la clé est omise du PUT**.

Ce n'est pas une invention : `UpdatePostSchema`
(`services/gateway/src/routes/posts/types.ts:329`) l'écrit déjà pour `mentions`
et `location` — « clé ABSENTE = inchangées, `[]` = plus aucune référence
déclarée, liste = remplace ». Le tri-état existe ; il lui manque une forme
générale côté client.

```ts
buildUpdatePayload(known, draft)   // packages/shared — une fonction, testée une fois
```

iOS déclare tout connu **sauf** ce que l'hydratation n'a pas confirmé ; le web
déclare connu ce que son formulaire rend, et rien d'autre. C'est ce qui permet
au web d'ouvrir une édition sans jamais effacer un canevas composé sur iOS.

### Loi 4 — La porte déclare un éventail, pas un format

```
initialFormat:  ComposerFormat
offeredFormats: [ComposerFormat]   // contient toujours initialFormat
```

L'option **Réel** n'est offerte que si la composition qualifie —
`qualifiesAsReel` : vidéo ≥ 3 s, audio ≥ 3 s, ou ≥ 2 images. Source unique
déjà partagée : `packages/shared/utils/reel-composition.ts`, miroir SDK
`ReelComposition.qualifiesAsReel`, appliquée côté serveur par dégradation
silencieuse d'un réel non qualifiant en post.

Retirer un média qui dé-qualifie **rebascule la sélection** — jamais une
sélection pointant sur une option absente.

### Loi 5 — Le repost miroite ; changer de format est l'ancrage

> **Reposter conserve le format. Reposter dans un AUTRE format, c'est garder la
> chose pour de bon.**

L'éphémère reste éphémère (story → story, 20 h dans le tray ; status → status,
1 h). Le repost cross-format est le geste explicite d'ancrage.

Deux fichiers du gateway avaient déjà écrit cette loi en prose avant qu'elle
soit formulée — `detachReposts.ts` et `ExpiredStoriesCleanupService.ts` :
« reposter un STATUS en POST PERMANENT — le chemin `status→post` — est le geste
"je garde ça sur mon fil" ».

Toute la machinerie qui rend l'ancrage réel **existe déjà côté serveur** :

| Exigence | État |
|---|---|
| copier les octets, ne pas référencer | ✅ `repostPost` duplique médias, audio, `storyEffects` de toute source éphémère |
| aucune échéance sur l'ancre | ✅ `computeExpiresAt(POST)` → `undefined` |
| survivre au balayage de la source | ✅ `detachReposts` — le repost est **détaché**, jamais détruit |
| pouvoir demander un autre format | ✅ `targetType` au protocole (`types.ts:418`), laissé ouvert « pour un futur reposter en story » |

Le manque est **entièrement côté clients** : `targetType: .post` n'est envoyé
que depuis `StoryViewerView.swift:874` et `:1275` ; aucun client n'envoie jamais
`targetType: STORY`.

**Le web est le cas le plus grave, et le plus simple à refermer.**
`RepostRequest` (`apps/web/services/posts.service.ts:68`) ne porte que
`content` et `isQuote` — **le champ `targetType` n'existe pas côté web**. Le
viewer de story envoie littéralement `{ isQuote: false }`
(`app/story/[postId]/page.tsx:118`), le gateway retombe sur `POST`, et
**reposter une story sur le web fabrique silencieusement un post permanent**.
L'utilisateur croyait repartager une story ; il a ancré. La loi 5 est violée
dans le sens le plus coûteux — celui qui rend permanent ce qui devait
disparaître, sans jamais l'avoir demandé.

Directive produit du 2026-08-23 : **le web reposte un post en post, une story
en story, un mood en mood — et le viewer de story offre en plus « reposter en
post »**, qui est l'ancrage nommé par cette même loi.

État mesuré des quatre cas côté web, avant correctif :

| Source | Aujourd'hui | Verdict |
|---|---|---|
| post | POST | ✅ juste — **par défaut, pas par intention** |
| **réel** | **POST** | ❌ **rétrogradation silencieuse** : le repost quitte le fil des réels |
| **story** | **POST permanent** | ❌ le cas coûteux — on ancre sans l'avoir demandé |
| mood | *(aucune surface web)* | loi sans site : le fil web ne sert que `[POST, REEL]` |

Le cas du réel n'était pas nommé dans la directive, mais la loi le couvre et le
défaut est réel : `app/reel/[postId]/page.tsx:199` envoie lui aussi
`{ isQuote: false }`.

#### Recensement exhaustif des émetteurs (2026-08-23) — RIEN n'est implémenté

« Aucun client n'envoie `targetType` » est une quantification universelle : elle
se prouve en énumérant les écrivains, pas en en sondant deux. Le dépôt compte
**exactement trois** appelants de `POST /posts/:id/repost` — aucun script,
aucune extension, aucun bot :

| Écrivain | Le champ existe-t-il ? | Est-il envoyé ? |
|---|---|---|
| **web** (`posts.service.ts:326`) | **non** — absent de `RepostRequest` | jamais |
| **iOS** (SDK `PostService.swift:383`) | oui | **`nil` à 6 sites**, `.post` à 2 |
| **Android** (`PostApi.kt:213`, `StoryApi.kt:58`) | oui — plomberie complète jusqu'à `RepostPostRequest` | **jamais** — aucun site d'appel ne le renseigne |

Les six sites iOS qui passent `nil` : `ReelsViewModel:430`, `FeedViewModel:881`,
`PostDetailView:301`, `ProfileUserPostsList:969`, `RootViewComponents:329`,
`FeedView:449`. Les deux qui passent `.post` — `StoryViewerView:874` et `:1275`
— sont les seuls **déjà conformes** à la loi 5 : ils deviennent l'option
explicite « reposter en post », ils ne changent pas.

`FeedViewModel:881` porte même le commentaire `nil = le serveur cree un POST
(2026-08-19)` : le défaut est délibéré et documenté, c'est l'arbitrage que la
loi 5 renverse. Il faudra retirer ce commentaire en même temps que la ligne —
[[un commentaire qui survit à son correctif devient la loi lue par la suivante]].

Recherche historique sur 1 680 refs : `git log --all -S targetType -- apps/web`
ne rend qu'un commit, celui du routage `/l/[token]` (le `targetType` d'un
TrackingLink, sans rapport). **Le miroir n'a jamais existé nulle part.**

Le type de la source est **déjà en main à chaque site d'appel** (`stories`,
`current`, `post.type`) : le miroir ne coûte aucune requête.

### Loi 6 — La fiche de forward est le « où va ceci ? » universel

Aujourd'hui `ForwardPickerModel.swift` ne connaît que des **cibles** (des
conversations) et leur état d'envoi. Elle gagne des destinations qui ne sont pas
des conversations : **ma story · mon fil · mes réels**, gatées par la loi 4.

Ce n'est pas une dixième porte : c'est un **second point d'entrée** de
`.conversationMedia` — même graine (un média + son message d'origine), même
éventail.

---

## C. La table des portes

| Porte | Ouvre sur | Éventail offert |
|---|---|---|
| `storyTray` | story | story · post · réel\* |
| `feedComposer` | post | post · story · réel\* |
| `reelTab` | réel | réel · post |
| `moodChip` | status | status |
| `repost(source)` | **format de la source** | source · **post** (l'ancrage, loi 5) |
| `edit(document)` | **format du document** | post · réel\* si le document est l'un des deux ; **aucun choix** s'il est story ou status — voir contrainte ci-dessous |
| `draft` / `share` | transitoire | selon le document chargé |
| `conversationMedia` | **story** | story · post · réel\* |
| `forward(média)` | **story** | story · post · réel\* |

\* si `qualifiesAsReel`.

**Deux portes doivent PORTER leur format**, elles ne peuvent pas le deviner :
`.repost(ofPostId:)` et `.edit(postId:)` ne transportent aujourd'hui qu'un id.
L'appelant connaît pourtant le format à coût nul — on tape « reposter » ou
« modifier » sur une carte déjà rendue.

**Contrainte serveur sur `edit`** : `UpdatePostSchema` n'autorise que
`type: 'POST' | 'REEL'`. Convertir une story ou un status **par l'édition** est
donc hors de portée sans changement gateway — et c'est cohérent : changer le
format d'un contenu publié est le rôle du **repost** (loi 5), pas de l'édition.

---

## D. Ce qui existe déjà et qu'on hisse

Le chantier réutilise plus qu'il ne crée.

| Mécanisme éprouvé | Où | Ce qu'on en fait |
|---|---|---|
| éventail gaté + repli automatique | `EditPostSheet.swift:120-122, 297-308, 478-479` | monte dans `ComposerProfile` (loi 4) |
| « n'envoyer que ce qui a changé » | `EditPostSheet.swift:490` — `typeChanged ? selectedType : nil` | devient `buildUpdatePayload` (loi 3) |
| hydratation d'édition 7 champs | `StoryComposerViewModel+Edit.swift` | se généralise aux posts et réels (loi 2) |
| `qualifiesAsReel` | `packages/shared/utils/reel-composition.ts` + miroir SDK | consommé tel quel |
| snapshot + `detachReposts` + `targetType` | gateway | consommés tels quels (loi 5) |
| les 9 profils | `ComposerIntent.swift` + 447 l. de tests | étendus, pas réécrits |

---

## E. Les lots

Ordre contraint par les dépendances, pas par la taille.

### Lot 0 — Le contrat partagé *(démarre en premier)*
`packages/shared` : les portes, `initialFormat` + `offeredFormats`,
`buildUpdatePayload(known, draft)`. `ComposerIntent.swift` devient le **miroir**
du contrat, et cesse d'en être la source. **DoD** : la fonction testée une fois, les deux
plateformes compilent contre elle.

### Lot 0 bis — Le repost web miroite *(aucune dépendance — livrable immédiatement)*
Défaut vivant, indépendant de tout le reste du chantier, et de coût minime.

1. `RepostRequest` gagne `targetType?: 'POST' | 'REEL' | 'STORY' | 'STATUS'` ;
2. chaque site d'appel passe **le type de la source** — il l'a déjà ;
3. le viewer de story ajoute l'option **« reposter en post »** (l'ancrage).

**Ne dépend ni du lot 0 ni d'aucun autre.** Peut partir avant que la première
ligne du composer unifié soit écrite, et referme immédiatement la violation la
plus coûteuse de la loi 5.

**Le même geste vaut pour iOS**, où six sites passent `nil` (recensement
ci-dessus) — le lot 4 le prévoit, mais rien n'oblige à attendre : le correctif
est le même, et les deux sites `.post` du viewer de story n'y touchent pas.
**DoD** : un test RED par cas cassé — story → `POST` et réel → `POST` sont
constatés avant d'être corrigés —, puis vert. Le cas `mood` est écrit dans le
contrat même s'il n'a pas encore de surface web : la loi précède son site.

### Lot 1 — L'éventail
`ComposerProfile` gagne `offeredFormats` ; le sélecteur de format monte dans le
host MeeshyComposer, gaté par `qualifiesAsReel`, avec le repli automatique
d'`EditPostSheet`. `.repost` et `.edit` portent désormais leur format.
**DoD** : `.reelTab` cesse d'être conditionnée à un onglet Réels — l'éventail EST
le point d'entrée.

### Lot 2 — La surface « document sans scène » (I6)
Le host absorbe ce que `FeedComposerSheet` (`FeedView+Attachments.swift:765`,
3 appelants) sait faire : clavier sur `content`, rangée
photo·caméra·emoji·document·lieu·micro, envoi durable offline.
**Condition bloquante du lot 3** — la spec v1 l'a explicitement posée comme telle.

### Lot 3 — La porte la plus utilisée
`.feedComposer` cesse de router (`routesToLegacy: nil`). **Ne démarre qu'après
le lot 2** : recâbler la porte la plus utilisée sans sa surface serait une
régression sèche.

### Lot 4 — Mood (S3) et repost
`.moodChip` et `.repost` cessent de router. La loi 5 est câblée : le format
miroite, l'ancrage cross-format devient un choix explicite de l'éventail, et le
client envoie enfin `targetType`.
**Retrait** : `StatusComposerView.swift` (361 l.), `UnifiedPostComposer.swift`
(739 l., 1 seul appelant).

### Lot 5 — Média reçu et forward (O13)
`.conversationMedia` câblée ; la fiche de forward gagne ses trois destinations
(loi 6). Le pont serveur `MessageAttachment`→`PostMedia` remplace le re-upload
local de v1.

### Lot 6 — Web
Le composer web complet : une entrée, quatre formats, l'éventail, l'édition.
**Retrait** : `PostComposer.tsx` (535 l.), `StatusComposer.tsx` (230 l.),
`AudioPostComposer.tsx` (535 l.), `RepostModal.tsx` (114 l.).
`StoryComposer.tsx` (749 l.) est absorbé, pas retiré — il porte le canevas v3.

### Lot 7 — File de publication unique (`PublishIntent`, S2)
Un seul chemin de publication pour les quatre formats, offline compris.
**Retrait** : `EditPostSheet.swift` (498 l.), dernier legacy.

## E bis. Les plans d'exécution v2 *(2026-08-24)*

Les lots ci-dessus sont une **conception**. Quatre d'entre eux ont désormais un
plan d'exécution écrit, sur le gabarit des six plans v1
(`2026-08-20-meeshy-composer-lot-{a..f}.md`) : contraintes globales, tâches
numérotées nommées d'une phrase produit, gate final, « hors périmètre » dit une
fois.

| Lot | Plan | État du plan |
|---|---|---|
| 0 — le contrat partagé | *aucun plan dédié* | livré (`packages/shared/utils/composer-contract.ts`, commit `1e6837b6d`) ; suivi dans `tasks/todo-composer-lot-c-et-v2-2026-08-23.md` (V0) |
| 0 bis — le repost web miroite | *aucun plan dédié* | suivi dans le même fichier de tâches (V0 bis) |
| 1 — l'éventail | *aucun plan dédié* | une ligne de tâche (V1) |
| 2 — la surface « document sans scène » | *aucun plan dédié* | une ligne de tâche (V2) |
| 3 — la porte la plus utilisée | *aucun plan dédié* | une ligne de tâche (V3) |
| **4 — Mood (S3) et repost** | `docs/superpowers/plans/2026-08-24-meeshy-composer-v2-lot-4.md` | **écrit**, 9 tâches — **rév. 2, audit adversarial du 2026-08-24** |
| **5 — média reçu et forward (O13)** | `docs/superpowers/plans/2026-08-24-meeshy-composer-v2-lot-5.md` | **écrit**, 7 tâches — **rév. 2, audit adversarial du 2026-08-24** |
| **6 — web** | `docs/superpowers/plans/2026-08-24-meeshy-composer-v2-lot-6.md` | **écrit**, 9 tâches — **rév. 2, audit adversarial du 2026-08-24** |
| **7 — file de publication unique** | `docs/superpowers/plans/2026-08-24-meeshy-composer-v2-lot-7.md` | **écrit**, 9 tâches — **rév. 2, audit adversarial du 2026-08-24** |

*(Les décomptes de LIGNES qui figuraient ici — 424 · 679 · 619 · 569 — ont été
retirés : ils étaient déjà faux le jour même, et un compte de lignes de document
périme à la première correction. Le nombre de TÂCHES, lui, est structurel.)*

**Un plan n'est pas une livraison.** Les quatre plans ci-dessus n'ont aucune
ligne de code derrière eux au 2026-08-24 ; ils portent en revanche des
corrections OPPOSABLES au §E de ce document, mesurées fichier par fichier au
moment de leur rédaction — notamment que plusieurs des retraits annoncés ici
coûtent plus que les fichiers qu'ils nomment, et que certains décomptes de
lignes du §E sont périmés. **Chaque plan prime sur le paragraphe de §E qu'il
détaille** : le §E dit l'intention, le plan dit l'état mesuré.

**Et un plan n'est pas une mesure PERMANENTE.** Les quatre ont été rédigés
pendant que les lots 3 et 0 bis étaient en vol ; ces deux-là ont mergé le jour
même (`96b707da6`, `d4a40f600`), ce qui a déplacé une partie des ancres citées et
rendu caduques trois affirmations d'état. Un **audit adversarial du 2026-08-24** a
relu les quatre plans contre le code et les a corrigés en place ; chaque
correction y est datée et encadrée. Quatre points valent d'être connus sans
ouvrir les plans :

1. **`viaUsername` ne doit être ajouté nulle part.** Le champ a **zéro
   occurrence** dans `services/gateway` et `packages/shared`, `schema.prisma`
   compris : un `z.object()` l'écarte en silence depuis trois versions.
   L'attribution d'un repost passe par **`repostOfId`**, et par rien d'autre. Le
   lot 4 le retire du fil (4.2) ; le lot 7 ne l'ajoute **pas** à la charge
   durable (7.2, quatre champs et non cinq).
2. **Le retrait d'`UnifiedPostComposer.swift` n'a AUCUN exécutant.** Le fichier
   vit sous `packages/MeeshySDK/Sources/MeeshyUI/Story/` (739 l.) ; le lot 4 s'y
   interdit d'écrire, le lot 7 aussi. Le §E lot 4 promet donc un retrait que
   personne ne porte : il attend le lot qui possédera `MeeshyUI`.
3. **Le retrait d'`EditPostSheet.swift` est hors du lot 7** (658 l. et non 498 —
   `690e575f7` l'a agrandi le 2026-08-23), derrière un STOP nommé et un
   inventaire de sept capacités.
4. **Le tableau de bord `2026-08-19-meeshy-composer-views.html` se contredit
   lui-même** au 2026-08-24 (rév. 22 : arc `62 / 70`, puce verte « 57 tâches,
   81,4 % ») et il est **modifié non committé**. Le gate du premier lot qui y
   touchera doit réconcilier les deux, ou dire lequel fait foi — pas en choisir
   un en silence.

---

## F. Compatibilité — les anciens POSTs et RÉELs restent affichables

Non négociable, et déjà largement tenu.

- **Aucune migration de masse.** Le convertisseur v1→v3 reste le chemin, à la
  lecture (`storyEffectsV3.ts`) comme au rendu (`CanvasV3Migration.swift`).
- **Un document v1 rouvert dans le composer migre en v3 à la sauvegarde**, et
  seulement là — décision antérieure, maintenue.
- **`carrierAspect` est livré** (2026-08-22) : le ratio du porteur v1 est
  journalisé sur la scène v3, ce qui rend le letterbox **inversible** et le
  round-trip fidèle. Sans lui, rouvrir un post v1 recadrait définitivement ses
  ancres.
- **La négociation `X-Canvas-Caps: 3`** protège les clients du passé : le
  gateway leur sert la sentinelle plutôt qu'un canevas qu'ils ne savent pas
  peindre.

---

## G. Hors v2 — dit une fois, opposable

Tout ce que `F. Hors v1` de la spec du 2026-08-20 liste et que la section A ne
promeut pas explicitement. S'y ajoute :

- **la conversion de format par l'ÉDITION** au-delà de POST↔REEL — c'est le rôle
  du repost (loi 5) ;
- **Android** — **mis de côté** par directive du 2026-08-23 ; le lot H est suspendu, sans tâche ni gate ;
- **le retrait de `StoryComposer.tsx`** — absorbé, pas supprimé.
