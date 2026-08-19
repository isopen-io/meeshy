# Republication de story + partage en poste — plan (2026-08-19)

Demande utilisateur : « Il faut permettre la republication de story ! Actuellement
on a le partage mais il faut plutôt mettre la republication (ça ouvre le story
composeur permettant d'ajouter plus du texte). Une story se republie avec la MÊME
audience ou une audience plus restreinte, jamais une audience plus large ! Mettre
l'option partage dans le menu en haut à droite (...) sous deux formes Republier en
poste […] ou Citer en poste […] et enfin le partager qui existe déjà. »

## État constaté (lecture du code, 2026-08-19)

Beaucoup de briques existent déjà — le travail est surtout du CÂBLAGE et une
règle d'audience, pas une construction.

| Brique | État |
|---|---|
| `StoryComposerViewModel.init(reposting:authorHandle:)` — canvas prérempli avec la slide source + badge d'attribution verrouillé | **EXISTE, AUCUN site d'appel de production** |
| `StoryComposerView.init(viewModel:…)` « repost-aware » (C.1) | EXISTE |
| `StoryComposerView(initialVisibility:)` | EXISTE — mais aucun PLAFOND d'audience |
| Menu (...) → « Republier en post » (`repostAsPostDirect`) | EXISTE |
| Menu (...) → « Éditer et republier en post » (`editAndRepostAsPostSource`) | EXISTE — c'est le « Citer en poste » demandé, à renommer |
| Menu (...) → « Partager hors Meeshy » (share sheet système) | EXISTE |
| Rail → « Partager » interne (`sharedContentWrapper`, vers conversation/contact) | EXISTE, dans le RAIL et non dans (...) |
| Rail → bouton repost | EXISTE mais **un seul tap, côté serveur, sans composeur ni choix d'audience** — et son libellé affiche « Partager » (`story.viewer.action.repost`, defaultValue « Partager ») |
| Modèle d'audience | `StoryVisibility` = `PUBLIC` > `FRIENDS` > `PRIVATE` — ordre TOTAL, donc règle encodable en fonction pure |
| Gating du repost | `showsRepost: !isOwnStory && isPublicStory` — les stories FRIENDS/PRIVATE ne sont PAS republiables aujourd'hui |

## Écarts réels à combler

1. **La republication doit ouvrir le Story composer** (aujourd'hui : un tap
   serveur). Brancher le bouton du rail sur
   `StoryComposerViewModel(reposting:authorHandle:)` — la brique attend son
   premier appelant.
2. **Règle d'audience** « même ou plus restreinte, jamais plus large ». Nouvelle
   loi pure (`StoryRepostAudience`) + PLAFOND passé au composeur
   (`maximumVisibility`) pour que le sélecteur ne puisse pas élargir. Le
   `RepostRequest.visibility` existe déjà côté SDK pour la transporter.
3. **Ouvrir la republication aux stories non publiques.** La règle d'audience
   demandée implique qu'une story FRIENDS se republie en FRIENDS ou PRIVATE.
   Le gating actuel (`isPublicStory`) l'interdit — à relâcher, ce qui est un
   ÉLARGISSEMENT de portée produit à confirmer.
4. **Déplacer le partage interne du rail vers (...)**, en 3e forme, à côté de
   « Republier en poste » et « Citer en poste ».
5. **Nommage** : le libellé du repost du rail dit « Partager » ; « Éditer et
   republier en post » devient « Citer en poste ». 7 langues à mettre à jour.

## Décisions — TRANCHÉES par l'utilisateur le 2026-08-19

- **D1 — OUI, les stories FRIENDS/PRIVATE deviennent republiables**, à audience
  égale ou plus restreinte. Le gating `showsRepost: !isOwnStory &&
  isPublicStory` est donc à relâcher en `!isOwnStory`, la restriction
  d'audience prenant le relais. FRIENDS → {FRIENDS, PRIVATE} ;
  PRIVATE → {PRIVATE}.
- **D2 — Le rail GARDE un bouton, renommé « Republier »**, qui ouvre le Story
  composer. Les 3 formes de partage vont dans (...). La republication reste à
  un geste.
- **D3 — « Republier en poste » reste DIRECT (un tap)**, sans composeur : c'est
  ce qui le distingue de « Citer en poste ». Comportement actuel de
  `repostAsPostDirect` conservé tel quel.

## Ordre d'exécution proposé (TDD)

1. Loi pure `StoryRepostAudience.allowedVisibilities(source:)` + témoins
   (PUBLIC → {PUBLIC, FRIENDS, PRIVATE}, FRIENDS → {FRIENDS, PRIVATE},
   PRIVATE → {PRIVATE}) et refus de tout élargissement.
2. `maximumVisibility` sur le sélecteur du composeur + garde de source.
3. Câblage du bouton rail → composeur repost (`init(reposting:)`).
4. Transport de `visibility` dans `RepostRequest` au publish.
5. Réorganisation du menu (...) en 3 formes + libellés 7 langues.
6. Gate : suite MeeshyTests + vérification device.

---

## Revue — ce qui a été livré (2026-08-19)

### La loi d'audience, et pourquoi ce n'est pas un rang

Le vocabulaire réel est `PostVisibility` à **SIX** cas (`PUBLIC`, `COMMUNITY`,
`FRIENDS`, `EXCEPT`, `ONLY`, `PRIVATE`), pas les trois de `StoryVisibility`.
L'hypothèse de départ d'un ordre total était donc fausse : `COMMUNITY` et
`FRIENDS` sont incomparables (un contact peut ne pas être membre, un membre peut
ne pas être un contact), idem `ONLY` face à `FRIENDS`. Un rang numérique
autoriserait des élargissements réels ayant l'air de réductions.

Trois relations seulement sont sûres sans connaître les listes ni les
appartenances : l'identité, `PRIVATE` (sous-ensemble de tout), et « depuis
`PUBLIC` ». D'où la table : `PUBLIC` ouvre tout, sinon `{ original, PRIVATE }`.

- Loi autoritaire : `packages/shared/utils/repost-audience.ts` — 12 témoins vitest.
- Miroir iOS : `StoryRepostAudience` — 10 témoins XCTest.

### Deux portes à garder, pas une

`repostPost` refusait tout original non-`PUBLIC` et en DÉDUISAIT l'invariant.
Ouvrir la republication fait tomber ce raisonnement → contrôle explicite (403
`REPOST_AUDIENCE_WIDENING`).

**Faille trouvée en chemin, antérieure à ce lot** : `POST /posts` accepte
`repostOfId` (« for StoryComposer publishing a repost via POST /posts ») et ne
lisait la source que pour sa chaîne d'IDs — aucun contrôle d'audience. Un client
pouvait publier `{ repostOfId: <story PRIVATE>, visibility: 'PUBLIC' }`. Le
chemin n'avait aucun appelant côté app ; brancher le composeur le rend vivant.
La sécurité ne peut pas dépendre de l'endpoint choisi par le client → la même
loi partagée s'applique aux deux portes.

`EXCEPT`/`ONLY` : leur portée EST la liste qui les accompagne, donc « même
audience » avec une liste plus longue est plus LARGE. La liste vient de la
source, jamais de la requête — aux deux portes.

### Le câblage, enfin fait

`StoryComposerViewModel.init(reposting:authorHandle:)` existait depuis
longtemps, avec sa docstring annonçant une « Phase C » côté app — et **aucun
site d'appel de production**. Trois conséquences, toutes corrigées :

1. Le bouton du rail republiait d'un tap côté serveur : pas de texte ajouté, pas
   de choix d'audience. Il ouvre désormais le composeur prérempli (slide source
   + badge d'attribution verrouillé).
2. `repostOfId` valait `nil` en dur sur tout le chemin de publication
   (`publishStoryInBackground` → `persistPublishIntentToQueue` →
   `StoryUploadState` → `createStory`). Une republication naissait orpheline :
   sans attribution, sans crédit de vues à l'original. La valeur descend
   maintenant de bout en bout, et **persiste dans l'item de file** — un kill
   suivi d'un rejeu au boot republie avec la même attribution.
3. Le sélecteur d'audience du composeur (`visibilityMenu`) est plafonné par
   `StoryRepostAudience.allowed(from:)`. Affordance, pas garantie.

### D1/D2/D3 appliqués

- **D1** : `showsRepost: !isOwnStory` (plus de gate `isPublicStory`). Gater là
  rendait la règle inatteignable — le bouton n'existait pas pour les seules
  stories qu'elle concerne. Le témoin assertait l'inverse ; inversé et documenté.
- **D2** : le rail garde son bouton, renommé « Republier » (il annonçait
  « Partager », source directe de la confusion signalée).
- **D3** : « Republier en poste » reste direct, un tap. « Éditer et republier en
  post » devient « Citer en post ». Le menu (...) gagne le partage INTERNE comme
  troisième forme ; le bouton « Envoyer » du rail reste en place.

Vocabulaire : le catalogue dit « post », pas « poste » — en français « poste »
désigne un emploi ou un récepteur radio. Terme conservé par cohérence.

### Dette laissée, signalée

- ~~4 clés de catalogue devenues mortes~~ **RETIRÉES.** Les toasts du repost
  un-tap (`story.viewer.repost.success` / `.unavailable` / `.forbidden` /
  `.error`) n'avaient plus d'appelant. J'avais d'abord conclu qu'« aucune garde
  ne les rejette » après n'avoir inspecté que `LocalizationCatalogGuardTests`
  (qui mesure la couverture de traduction, pas l'usage) — c'était faux :
  `LocalizationConsistencyTests
  .test_everyAppCatalogIdentifierKeyIsReferencedInCode` les a fait rougir dans
  la suite complète. La garde avait raison ; les clés sont supprimées.
- Les entrées « Republier en post » / « Citer en post » du menu (...) restent
  gatées sur `story.isPublic`, comportement INCHANGÉ. D1 ne portait que sur la
  republication en STORY ; ouvrir les formes POST aux stories non publiques est
  une décision produit distincte, non prise.
- `showsForward` de `StoryActionRailPlan` est déclaré et jamais lu — dette
  antérieure, laissée en place.
