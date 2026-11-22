# Cycle 211 — la quatrième famille de traduction en direct : le TEXTE D'UNE SCÈNE de story (#20287)

*Routine « amélioration continue du temps réel ». Lot développé sur la tête de
`dev` `c57460f50`, à la suite du cycle 210 (#20272).*

## Ce que le cycle a trouvé, et comment

En instruisant la dernière famille non mesurée du cliquet de parité
(`socket-event-platform-parity-gate`, dont la raison « pas encore porté » couvrait
trois noms que le cycle 208 n'avait PAS remesurés), un des trois s'est révélé
n'être pas un retard de chantier mais un écouteur manquant sur un fait qui arrive
déjà :

| mesure | résultat |
|---|---|
| le web est-il dans la room où part `story:translation-updated` ? | **oui** — `AuthHandler.ts:397`, `socket.join(ROOMS.feed(user.id))` à l'authentification |
| le web sait-il rendre une traduction de texte de scène ? | **oui** — `resolveSceneText` → `served()` → `resolvePrismTranslation` |
| applique-t-il les événements FRÈRES ? | **oui** — `post:translation-updated` et `comment:translation-updated` |
| écoutait-il celui-ci ? | **non** — aucune citation du nom dans `apps/web/src` |

Conséquence pour le lecteur : une story ouverte pendant que sa traduction
atterrissait restait dans la langue d'origine jusqu'au prochain fetch, là où un
POST basculait. La LÉGENDE, elle, basculait déjà — le même service diffuse
`post:translation-updated` pour l'index recomposé (`StoryTextObjectTranslationService.ts`).

## Ce que le lot écrit

- **`apps/web/src/lib/stories/text-object-translations.ts`** — la fusion d'une
  carte `{ langue: texte }` dans l'objet texte de rang `textObjectIndex`. Blob
  inchangé (identité préservée) quand rien ne bouge.
- **`applyStoryTextObjectTranslation`** (`lib/api/feed-realtime.ts`) — les caisses.
  Une story vit dans TROIS familles, comme le réglage des commentaires
  (`comment-settings.ts#writeCommentsDisabled`) : les cartes, le corpus du lecteur
  (`STORY_FEED_QUERY_KEY`) et la fiche unitaire (`storyPostQueryKey`).
  **Seul le corpus porte le canvas d'une SOURCE republiée** : `FeedRepostOf` ne
  déclare pas `storyEffects` (mesuré), donc le chemin des cartes ne prétend pas
  l'atteindre.
- **Le branchement** (`lib/api/realtime-social.ts`), et la sortie de l'inventaire
  du cliquet de parité.

## La preuve de ROUGE, dans les deux sens

| mutation | témoins qui tombent |
|---|---|
| l'écouteur débranché (l'état d'avant ce lot) | **7 sur 9** |
| le parcours réutilise l'énumération voisine, qui écarte les textes blancs | **1** — le témoin de l'index, et lui seul |
| `story:translation-updated` remis dans l'inventaire de parité | le cliquet rougit : « lu par cette plateforme … à sortir de l'inventaire » |

Le second est la raison d'être du lot et sa leçon : **l'index qui voyage est celui
de `storyTranslatableTexts` — tous les objets `text`, blancs compris, puces de
crédit retirées par `servedTextIndex` — et la seule énumération que le web
possédait (`sceneTextObjects`) écarte les blancs.** Les deux rendent le même
tableau sur une story ordinaire ; la réutiliser aurait eu l'air d'une économie et
aurait fusionné dans le mauvais objet dès qu'un texte vide traîne dans la scène.
Leçon : `tasks/lessons/2026-11-22-deux-enumerations-qui-divergent-par-un-filtre-faussent-l-index-qui-voyage-entre-elles.md`.

## Les deux voisines, instruites plutôt que portées

Elles partageaient la raison « pas encore porté », qui envoie écrire un écouteur
(leçon du cycle 208). Mesuré, aucune des deux n'est un retard :

- **`location:live-started` / `-updated` / `-stopped`** — les positions vivantes
  DANS UNE CONVERSATION (room `conversation:<id>`, `LocationHandler`). Le web sert
  une AUTRE famille pour un autre besoin : le partage de position des CERCLES
  (`location:share-changed` / `share-ended`, room `user:<moi>`, #16984 / #18345),
  qu'il reçoit ET émet. Deux audiences distinctes — un périmètre produit, pas une
  dette de portage de CE nom.
- **`e2ee:envelope`** — audience unique : la room d'APPAREIL
  (`envelope-delivery.ts:51`). Le web n'appelle que `devices`, `devicesByDeviceId`
  et `keysByUserIdDevices` : **il ne s'enrôle pas**, n'a aucune `registrationId`
  à lui, n'est dans aucune room d'appareil. L'absence est par CONSTRUCTION, et
  l'écouteur appartient au lot qui livrera l'enrôlement.

**Une affirmation périmée corrigée au passage** : le doc-comment de
`lib/api/e2ee-devices.ts` justifiait l'absence d'enrôlement par « le navigateur n'a
aucune pile libsignal (#12975) ». La conclusion tient, la raison non — le pont WASM
libsignal du web existe depuis #17114 (pont v2, #18992→#18995). C'est l'enrôlement
qui manque, pas la pile.

## Gates

| gate | résultat |
|---|---|
| `bun test src/lib/api/socket-story-translation-realtime.test.ts` | 9 verts / 0 rouge |
| `bun test src/lib/api/ src/lib/stories/` | **5557 verts / 0 rouge**, 430 fichiers |
| `tsc --noEmit` (web) | **0** |
| `vitest socket-event-platform-parity-gate` | 5 verts, et rouge sur la remise en inventaire |
