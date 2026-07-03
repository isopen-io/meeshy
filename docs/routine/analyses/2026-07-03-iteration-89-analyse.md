# Iteration 89 — Analyse d'optimisation (2026-07-03)

## Protocole (démarrage)
`main` @ `9c90f496` (« feat(web/stories): foreground media-object keyframes animate too (W1
increment 2) » — HEAD au démarrage). Branche de travail `claude/brave-archimedes-yd0bs8` recréée à
neuf depuis `origin/main` (working tree propre, aucun commit non-mergé à préserver).

PR ouvertes au démarrage : #1416 (gateway realtime — enqueue offline recipients `MessageHandler`),
#1414 (calls — screen-capture spoofing + iOS a11y), #1413 (iOS bubble sending-clock debounce),
#1412 (iOS calls TURN refresh), #1410 (iOS a11y Dynamic Type overlay). Cible retenue **hors de tous
ces fichiers** : le lecteur de stories web (feature sociale la plus récente — Priorité 1).

## Cible : W4 — realtime web des stories (`story:translation-updated` + `story:deleted`)

### Current state
Le gateway diffuse aux salles `feed:{userId}` deux événements de cycle de vie des stories que le
web **ne consomme pas** dans son cache React Query :

1. **`story:translation-updated`** (`SERVER_EVENTS.STORY_TRANSLATION_UPDATED`) — émis par
   `StoryTextObjectTranslationService.handleTranslationCompleted` (it.9/it.21, gateway) quand le
   translator NLLB rend la traduction d'un `textObject`. Payload :
   `{ postId, textObjectIndex, translations: Record<lang, text> }`.
   - Le couche socket web (`use-social-socket.ts`) **enregistre déjà** le listener et expose l'option
     `onStoryTranslationUpdated`, mais le **consommateur** `useStoriesRealtime` **ne fournit aucun
     handler** → l'événement est reçu puis silencieusement jeté. Le cache feed n'est jamais muté.
2. **`story:deleted`** (`SERVER_EVENTS.STORY_DELETED`) — payload `{ storyId, authorId }`.
   - **Aucune couche web** ne l'écoute : `use-social-socket.ts` n'a ni option `onStoryDeleted` ni
     `socket.on(STORY_DELETED, …)`, et `useStoriesRealtime` n'en parle pas.

Le viewer web (`StoryViewer.tsx` → `resolvePrismeText`) lit la traduction préférée depuis
`storyEffects.textObjects[n].translations`. La chaîne de données est **live** : le viewer reçoit ses
stories via `useStoriesFeedQuery()` → `storyGroups` → `activeStoryData` (`postToStoryData` →
`parseTextObjects`). Muter le cache feed suffit donc à faire apparaître la traduction dans le viewer
ouvert, exactement comme `onStoryViewed` met déjà à jour `viewCount` en direct.

### Problems identified
- **Prisme Linguistique cassé côté web (P0 conceptuel, P3 backlog).** Un spectateur web qui regarde
  une story dont le texte est en cours de traduction reste bloqué sur le texte original tant qu'il ne
  **rafraîchit pas la page** — alors qu'iOS applique la traduction en direct (merge realtime it.9).
  C'est une **incohérence de plateforme** directe : le contenu traduit doit s'afficher comme du
  contenu natif, automatiquement et sans friction (règle #2 du Prisme).
- **Story supprimée toujours visible côté web.** Quand l'auteur supprime une story (ou qu'un
  `story:deleted` est diffusé), le feed web garde la vignette et le viewer garde la slide — état
  fantôme jusqu'au prochain refetch. iOS écoute `story:deleted` ; le web non.

### Root cause
Le câblage realtime des stories web a été construit incrémentalement (created/viewed/reacted), et les
deux événements de cycle de vie ajoutés côté gateway plus tard (translation-updated it.9, delete) ont
été **partiellement** propagés : le listener socket de bas niveau pour translation-updated existe,
mais le handler applicatif n'a jamais été branché ; delete n'a jamais été câblé du tout. Le contrat
« tout événement diffusé au feed room a un consommateur symétrique » n'est pas tenu pour ces deux.

### Business impact
Le feed social + stories est en développement actif (feature la plus récente du produit). Les stories
multilingues sont **le** cas d'usage du Prisme sur le contenu éphémère : un francophone doit voir la
story d'un lusophone en français, en direct. Aujourd'hui, sur web, il voit le portugais jusqu'au
refresh. Une story supprimée qui persiste est un bug de fraîcheur perçu directement.

### Technical impact
Deux handlers `useCallback` dans `useStoriesRealtime` + un helper pur de merge immuable
(`mergeStoryTextObjectTranslations`) ; une option `onStoryDeleted` + un `socket.on/off(STORY_DELETED)`
dans `use-social-socket`. Zéro nouvelle dépendance, zéro requête réseau (mutations de cache pures),
zéro changement de signature publique de hook (le retour de `useStoriesRealtime` est inchangé).

### Risk assessment
TRÈS FAIBLE. Mutations de cache React Query immuables gardées par des change-detections (retour de la
même référence si rien à muter → pas de re-render parasite). `story:deleted` filtre le feed ;
`story:translation-updated` merge dans un `textObject` existant (no-op si `postId` inconnu, index
hors borne, ou `storyEffects` absent/malformé). Le helper narrow `unknown` défensivement (le
`Post.storyEffects` partagé est typé `unknown`).

### Proposed improvements
1. `use-social-socket.ts` : ajouter l'option `onStoryDeleted?: (data: StoryDeletedEventData) => void`,
   importer `StoryDeletedEventData`, enregistrer `socket.on/off(SERVER_EVENTS.STORY_DELETED, …)`.
2. `use-stories-realtime.ts` :
   - `onStoryTranslationUpdated` — merge `data.translations` dans
     `storyEffects.textObjects[data.textObjectIndex].translations` de la story `data.postId`.
   - `onStoryDeleted` — retire la story `data.storyId` du cache feed.
   - helper pur exporté-testable `mergeStoryTextObjectTranslations(storyEffects, index, translations)`.

### Expected benefits
- **Parité Prisme web ↔ iOS** : une traduction NLLB qui arrive pendant qu'un spectateur web regarde
  la story s'applique en direct, sans refresh.
- **Fraîcheur** : une story supprimée disparaît du feed web en temps réel.
- **Contrat realtime rétabli** : chaque événement de cycle de vie diffusé au feed room a un
  consommateur symétrique côté web.

### Implementation complexity
FAIBLE — 2 fichiers de prod (~40 lignes), 1 fichier de test (~5 tests neufs), helper pur unit-testé.

### Validation criteria
- `use-stories-realtime.test.tsx` : suite verte (tests neufs inclus).
- RED prouvé : sans les handlers prod, les tests translation-updated / deleted échouent (cache non
  muté).
- `use-social-socket.test.tsx` : non-régression (nouveau listener enregistré/nettoyé).
- `tsc --noEmit` web : pas de nouvelle erreur.

## Améliorations futures (report)
- **W5 (P3)** : préchargement (`preload`) du média du slide suivant dans `StoryViewer.tsx`.
- **W3 (P2)** : composer web — visibilités COMMUNITY/EXCEPT/ONLY + overlays.
- **G4 (P3)** : retirer le champ mort `Post.storyViews Json?`.
