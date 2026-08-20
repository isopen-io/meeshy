# MeeshyComposer — Spécification d'exécution v1

Date : 2026-08-20
Statut : **spécifié — arbitrages TOUS tranchés**, prêt pour `writing-plans` par lot
Design source : `./2026-08-19-meeshy-composer-design.md` (+ planches P1–P17)
Ce document est la sortie de la revue totale : il fige les décisions, définit le
contrat commun, et découpe l'exécution en **six lots parallélisables** avec
interfaces gelées. Chaque lot est raffinable puis exécutable dans son worktree.

---

## A. Verdict de revue — solide et réalisable, après six correctifs

Le design est solide : la doctrine (7 lois) est stable depuis P1, l'inventaire
P2 est vérifié contre le code (deux passes, la seconde a corrigé quatre ratés),
les budgets P15 sont chiffrés sur le plancher réel, et chaque risque est ancré à
un précédent documenté du dépôt. La revue de cohérence — le document a été
amendé six fois le 2026-08-20 — a trouvé et corrigé :

| # | Constat | Correctif |
|---|---|---|
| R1 | Le croquis §1 portait encore `Scene.ratio`, supprimé par S8 | ligne retirée — le ratio se lit du média porteur |
| R2 | `annotation` et `hashtag` listés comme kinds pleins alors que S5/O1 les diffèrent | annotés « réservés, hors v1 » dans le croquis |
| R3 | `.pinned(toObject:)` listé comme ancre alors que S5 le coupe | annoté « réservé, hors v1 » |
| R4 | Planche P16 : `timing.rate` dit « champ additif » — sous O2/A′ c'est un champ v3 natif | cellule corrigée |
| R5 | `/republish` duplique une ligne avec son blob v1 → la copie reste v1 | couvert PAR CONSTRUCTION : le convertisseur est à la LECTURE, permanent (§C3) |
| R6 | Fenêtre de rupture web | le web se déploie en lockstep (pas de binaire retardataire) : le plancher de version ne gate que le natif ; les vieux binaires iOS rendent dégradé jusqu'à la mise à jour forcée — fenêtre assumée par O2/A′ |

Deux décisions de réalisabilité, qui conditionnent les lots :

- **Le ScenePlayer n'est pas une réécriture.** Le lot B refactore AUTOUR du
  moteur existant (`StoryCanvasUIView`, `StoryTextLayer`, mécanisme d'encre par
  métriques, `computedTotalDuration()`) — on change le modèle qu'il lit, pas la
  façon de dessiner. C'est ce qui rend le lot livrable seul.
- **Une seule forme sur le fil sortant.** La sortie du convertisseur v1→v3 est
  octet-pour-octet le même JSON que ce que publie un client neuf : les clients
  ne connaissent qu'UNE forme, les tests golden en font foi.

---

## B. Décisions gelées

### B1. Les onze arbitrages — tranchés

| # | Décision FERME | S'exécute dans |
|---|---|---|
| O1 | Mentions/# : `content` porte l'INLINE (existant) ; PINNED = objet `mention` sur scène (existant) ; **hashtag-objet HORS v1** | B (kinds), C (UI) |
| O2 | **Rupture A′** (porteur produit) : fil v3 strict + convertisseur serveur à la lecture + version plancher/mise à jour forcée + migration one-shot des brouillons | A (contrat), C (porte bloquante) |
| O3 | `scenes: nil` tant qu'aucun objet visuel — jamais de cadre vide | B (modèle), C (composer) |
| O4 | `timing == nil` = « suit la slide » (piste fantôme), distinct d'un choix | B, D |
| O5 | Trois ancres : `.free`, `.band(.top)`, `.band(.bottom)` — `.pinned` et `annotation` **réservés, hors v1** | B |
| O6 | Plateau : 3 jetons (noir · indigo profond · violet profond), préférence d'interface | C |
| O7 | Export : pipeline actuel conservé (`StoryVideoExportService` rebranché v3) ; rendu-du-registre = cible post-v1 | B (adaptation), hors v1 (cible) |
| O8 | Sticker posé = média du contenu **claimable** (TUS/PostMedia) — jamais d'inline base64 dans le blob | A (claim), C (upload) |
| O9 | Presse-papiers : `PasteButton`/`UIPasteControl` UNIQUEMENT ; `hasImages` pour l'affordance ; zéro lecture hors geste | C |
| O10 | Stickers interactifs : kind **réservé** dans le schéma v3 ; votes = table serveur dédiée ; **implémentation HORS v1** | A (réservation), hors v1 |
| O11 | Programmation : **hors v1** — ne s'annonce que fiable (`scheduledAt` serveur), la prémisse best-effort ne se promet pas | hors v1 |

### B2. Les simplifications retenues (S2–S8)

S2 pas de nouveau verbe de publication (le composer appelle les trois chemins
d'envoi existants — le PAYLOAD `storyEffects` passe v3, la route ne change pas) ·
S3 Mood hors v1 (StatusComposer conservé) · S4 timeline v1 sans édition de
keyframes dans le plan · S5 trois ancres · S6 « Mes stickers » = récents LRU ·
S7 Étagère = MyStoriesView étendue · S8 pas de `Scene.ratio`.
S1 est remplacée par O2/A′ : la forme unique vit dans le convertisseur serveur.

### B3. Les lois produit du 2026-08-20 (directives, non négociables)

1. Plancher **iOS 16.0** — rien en dessous, nulle part.
2. **L'icône est le verbe** : `@marc · ↻ @aïcha`, jamais « a republié ».
3. **Loi des deux plans audio** : chip = premier plan seul (S·R) ; le fond
   s'annonce après l'auteur, boucle sur la timeline du contenu.
4. **Provenance** : `♫〰` si et seulement si son ORIGINAL ; crédit complet
   `« titre · @pseudo · M:SS »` si bibliothèque (résolveur unique
   `AudioChipDisplay.resolve`, promu trois formats).
5. **Existence** : l'annonce n'existe que si une piste existe — sinon rien.
6. **Bouton 🔇** sur carte, détail, plein écran — monté si piste seulement.
7. Bibliothèque de stickers **locale** — feature d'app, zéro sync ; le sticker
   POSÉ voyage comme média du contenu.

---

## C. Le contrat v3 — LE gel inter-lots

Tout le parallélisme repose sur ce gel : les fixtures de §C4 sont écrites au
jour 1 et deviennent la source de vérité des six lots.

### C1. Schéma (esquisse normative — le lot A produit le Zod exact, dans `packages/shared/types/canvas-v3.ts` : seul emplacement inclus au build, exporté et mappé)

```
CanvasV3 {
  v: 3,
  scenes: [SceneV3],                    // ≥1 dès qu'un objet visuel existe (O3)
  sound?: BackgroundSound               // fond du DOCUMENT — un futur `sound`
}                                       // PAR SCÈNE serait un champ additif v3.x
SceneV3 {
  id, objects: [ObjectV3],
  opening?, closing?: TransitionEffect, // recensés — préservés tels quels
  clipTransitions?: [ClipTransition],
  timelineDuration?: Double             // autorité existante, conservée
}
ObjectV3 {
  id, kind: 'text'|'media'|'sticker'|'audio'|'place'|'drawing'|'mention',
                                        // 'hashtag'|'annotation'|'interactive'
                                        // RÉSERVÉS (O1/S5/O10) — refusés en v1
  anchor: {t:'free',x,y} | {t:'band',edge:'top'|'bottom'},
  plane: 'bg'|'content'|'fg', z: Int,
  transform: {scale, rotation, opacity},
  timing?: {start?, end?, rate?, keyframes?: [Keyframe]},  // nil = suit la slide
  locale?: String,                      // langue d'origine (Prisme par objet)
  payload: <par kind>                   // text: les 18 styles INCHANGÉS ;
}                                       // sticker: {emoji} | {mediaId} ;
                                        // media: {mediaId, muted?, loop?} ;
                                        // place: {place, precision} ;
                                        // mention: {userId} ; audio: {…bornes}
BackgroundSound {
  source: {t:'original'} | {t:'library', soundId},   // ← la PROVENANCE (B3.4)
  volume, bounds?: {start, end}
}
Keyframe { time, x?, y?, scale?, opacity?, volume?, easing? }   // existant, inchangé
```

### C2. Table de conversion v1→v3 (le contrat du convertisseur)

| v1 (familles) | v3 | Règle |
|---|---|---|
| `textObjects[i]` | `ObjectV3(kind:text, plane:fg)` | styles/couleur/fond/align/size → payload inchangé ; `textPosition/textOffsetY` → `anchor.free` ; `startTime/keyframes` → `timing` |
| `mediaObjects` / fond image-vidéo (`background`, `backgroundTransform`) | `kind:media` — porteur en `plane:content`, fond en `plane:bg` | `canvasAspectRatio` DISPARAÎT : le porteur garde son ratio intrinsèque, la scène letterboxe (bandes) |
| `stickerObjects` | `kind:sticker {emoji}` | gagne transform/timing par défaut neutres |
| `locationObjects` | `kind:place, plane:fg` | precision conservée |
| `audioPlayerObjects` | `kind:audio, plane:content` | chips premier plan (B3.3) |
| `backgroundAudioId/Volume/Start/End` (+ `musicTrackId` déprécié) | `sound{source:library}` | piste propre (`voiceAttachmentId`…) → `source:original` |
| `opening/closing/clipTransitions/timelineDuration` | copiés tels quels | |
| `slideDuration` (legacy) | IGNORÉ | `computedTotalDuration()` reste l'autorité |
| champ inconnu | IGNORÉ + compteur de télémétrie | tolérant par contrat : rendu dégradé, jamais d'échec |

### C3. La rupture propre (O2/A′)

- **Écriture** (rév. 2, revue Fable n°4-5) : `POST/PUT /posts` valide
  `storyEffects` en v3 STRICT (Zod). Deux refus DISTINCTS :
  blob **sans `v:3`** (client du passé) ⇒ `426` avec, À LA RACINE de la réponse
  (forme réelle de `sendError` : `error` chaîne, détails étalés) :
  `{ success:false, error, message, code:'UPGRADE_REQUIRED', minVersion, storeUrl }` ;
  blob **avec `v:3` mais invalide** (client NEUF cassé — l'inviter à se mettre à
  jour serait un mensonge) ⇒ `400` `{ code:'CANVAS_INVALID', issues:[…] }`.
- **Version plancher** (rév. 2, revue Fable n°7-8) : le natif envoie
  `X-App-Version` (à CRÉER — vérifié absent). La porte d'en-tête ne juge que les
  requêtes qui EN PORTENT UN : en-tête présent sous un plancher armé ⇒ 426.
  **L'absence d'en-tête PASSE** — le web (exempt, R6) n'en enverra jamais, et
  les vieux binaires sont attrapés par le FORMAT (426 sur blob v1), pas par
  l'en-tête. Portée : les créations à scène (`storyEffects` présent ou
  `type === 'STORY'`). Défaut : plancher vide = porte désarmée. Le client, sur
  426 OU sur le plancher lu au bootstrap (`GET /app/min-version`), monte une
  porte bloquante (écran + lien App Store — l'OS n'installe pas à notre place).
- **Lecture** : `convertStoryEffectsForWire(post)` — UN helper, DERRIÈRE le
  drapeau `CANVAS_V3_READ` (défaut OFF : le merge de A est inerte en lecture ;
  l'activation est simultanée au déploiement du lot F — c'est l'acte qui rend
  le lockstep de R6 VRAI, rév. 3 n°13), appliqué aux
  mêmes points d'aplatissement que `withMentions` (chaîne connue et testée).
  Permanent : l'archive est éternelle, `/republish` copie des blobs v1 (R5).
- **Brouillons locaux** : `StoryDraftStore` migre one-shot v1→v3 au premier
  lancement (même table de conversion, portée Swift, testée sur fixtures).

### C4. Fixtures gelées (jour 1)

`packages/shared/fixtures/canvas-v3/*.json` : `minimal-text`, `story-3-slides`,
`reel-16x9-bands`, `post-carousel-sound-library`, `post-sound-original`,
`v1-legacy-full` (entrée) + `v1-legacy-full.v3.json` (sortie golden du
convertisseur — généré, relu à la main mapping par mapping, puis GELÉ **à la
clôture de la Task A3** ; B2 et F ne démarrent qu'après ce commit, B1 après la
Task A2). Tout lot code contre ces fichiers ; les changer exige un commit dédié
touchant les six lots — c'est voulu, c'est le gel. La fixture v1 est RÉALISTE :
ses formes sont celles des modèles Swift v1 vérifiés (place objet SharedPlace
requis, postMediaId, clipTransitions à cinq clés), jamais des clés inventées.

---

## D. Les six lots parallèles

Règles worktree (CLAUDE.md) : jamais deux lots sur le même fichier ;
`project.pbxproj` géré par le DERNIER lot à merger ; chaque lot passe son gate
dans son worktree.

### Lot A — Contrat & rupture (gateway + shared) — DÉMARRE EN PREMIER
- **Mission** : schéma Zod v3 + fixtures §C4 ; convertisseur v1→v3 + golden
  tests ; validation stricte à l'écriture + 426 ; `X-App-Version` + plancher +
  config ; réservation des kinds O10 ; claim des stickers posés (O8, réutilise
  `claimableMediaWhere`).
- **Possède** : `packages/shared/types/canvas-v3.ts` (types/ — jamais un
  dossier neuf hors build), `fixtures/canvas-v3/*`,
  `services/gateway/src/services/posts/storyEffectsV3.ts` (+ tests),
  `utils/appVersion.ts` (env lus inline — `env.ts` est un loader dotenv
  side-effect, rien à y modifier), retouches des routes posts (validation/426).
- **Produit** : fixtures gelées, contrat 426, helper de conversion branché.
- **DoD** : suites gateway vertes (bun) ; golden v1→v3 ; création avec blob v1
  ⇒ 426 (format) ; en-tête présent sous plancher armé ⇒ 426 ; **absence
  d'en-tête ⇒ passe** (web exempt, R6) ; `dist/types/canvas-v3.js` existe après
  build ; `tsc --noEmit` propre.

### Lot B — Noyau SDK : modèle v3 + ScenePlayer (packages/MeeshySDK)
- **Mission** : `CanvasV3` Swift (miroir manuel, convention du dépôt) ;
  `MeeshyScenePlayer(document:mode:)` modes `.reader/.preview/.card` en
  refactorant le moteur existant (A du §A) ; lois de lecture reprises (né en
  pause, cache/fade, boucle=fond, rail figé) ; résolveur audio promu (B3.4/5) ;
  migration `StoryDraftStore` ; garde de source anti-profondeur-de-type.
- **Possède** : `MeeshySDK/Models/CanvasV3*.swift`, `MeeshySDK/Models/StoryModels.swift` (B7 — décodage du fil), `MeeshyUI/Story/Canvas/*`,
  `MeeshyUI/Story/ScenePlayer*.swift`, `MeeshyUI/Story/Controls/AudioChipDisplay.swift` (B5), `StoryDraftStore`.
- **Consomme** : fixtures §C4. **Produit** : l'API ScenePlayer + les types `CanvasV3` (`ObjectV3`…)
  (les signatures ci-dessus SONT le gel pour C/D/E).
- **DoD** : scheme `MeeshySDK-Package` vert ; fixtures décodées et rendues ;
  gardes source vertes.

### Lot C — Composer chrome & intentions (apps/ios)
- **Mission** : plateau (3 jetons) / scène / socle permanent ; `ComposerIntent`
  8 profils DÉFINIS, portes CÂBLÉES v1 = tray + feed (mood route vers son
  composer, S3 ; `.reelTab` HORS v1 — aucun point d'entrée réels n'existe au
  dépôt, les Réels sont un overlay sans bouton de création — rév. 3, revue
  Fable n°5) ; garde anti-UI-morte PAR PROFIL (les capacités refusées ne sont
  pas montées — la zone contextuelle elle-même reste celle du composer SDK,
  « rien par défaut » complet = post-v1, rév. 3 n°10) ; capture appui long ;
  collage `PasteButton` + « Mes stickers » récents (store app-side, LRU 64 Mo
  sur `DiskCacheStore`) ; Étagère = MyStoriesView + onglets file & archive ;
  porte bloquante 426/plancher.
- **Possède** : `apps/ios/.../Composer/*` (nouveau), `MyStoriesView`, points
  d'entrée (tray/feed/réels/mood inchangé), `APIClient` header version (SDK —
  coordonné avec B, fichier distinct `Networking/`).
- **Consomme** : API ScenePlayer (aperçu du socle), contrat A.
- **DoD** : `meeshy.sh test` vert ; les 4 gardes UI neuves du dépôt (catalogue
  7 langues, clés mortes, RTL, `==` manuel).

### Lot D — Timeline plan 2D (MeeshyUI/Timeline)
- **Mission** : le plan (vertical=plan/z, horizontal=durée, fantômes, 2 zooms),
  dessin en un passe, keyframes AFFICHÉS (losanges) mais édités à l'inspecteur
  (S4) ; réutilise lanes 52 pt + graduation dérivée des libellés.
- **Possède** : `MeeshyUI/Story/Timeline/*` (remplacement des 32 vues).
- **Consomme** : les types `CanvasV3` (B) via un adaptateur RUNTIME (le composer édite `StoryEffects`). **DoD** : SDK vert + harnais de rendu
  existant ; mesure chronométrée sur A11/équivalent AVANT merge (le risque n° 1
  de P15 se lève ici, pas en aval).

### Lot E — Viewers & cartes (apps/ios lecture)
- **Mission** : chrome Story/carte Post sur ScenePlayer ; Réels v1 = annonce du
  fond + 🔇 (la bascule du pipeline vidéo des réels vers le ScenePlayer est
  POST-v1 — rév. 3, revue Fable n°9) ; CanvasPlayer en
  carte (budget 1 lecteur actif, hauteur explicite — jamais self-sizing) ;
  annonce du fond (B3.3-5) + bouton 🔇 trois surfaces ; `↻` (déjà conforme iOS).
- **Possède** : `StoryViewerView*`, `FeedPostCard`, `PostDetailView`,
  `ReelsView*`.
- **Consomme** : ScenePlayer (B), contrat A. **DoD** : `meeshy.sh test` vert ;
  captures avant/après des trois surfaces.

### Lot F — Web (apps/web)
- **Mission** : lecteur v3 (portage minimal du registre : rendu statique +
  timings simples en v1 web), annonce du fond + 🔇, `↻` sans verbe,
  `originalLanguage` enfin envoyé, collage/stickers HORS v1 web.
- **Possède** : `apps/web/components/v2/StoryViewer.tsx`, `PostCard`, services.
- **Consomme** : fixtures §C4. **DoD** : `bun run test` web vert ; lockstep au
  déploiement de A.

### Dépendances & ordre de merge

```
A (contrat, fixtures J1) ──► B (SDK) ──► C, D, E (parallèles)
A ──────────────────────────► F (parallèle à B)
Merge : A → B → F → D → E → C (C ferme : pbxproj + porte 426, dernier)
```
Après le dernier merge : clean build depuis main + gate iOS complet + suites
gateway/web — la règle du dépôt.

---

## E. Non-régression : l'inventaire EST la checklist

La définition de fini du chantier entier : **chaque ligne de la planche P2**
(inventaire vérifié, deux passes) est pointée verte sur la build finale —
transitions, undo/redo, transfert interne, trail épinglé, transcription
embarquée, flash, variantes TTS, 18 styles, tri-état des références, fenêtre
référencé-expiré, offline, republication, édition avec reset… Une ligne perdue
= un défaut bloquant, pas une note.

## F. Hors v1 — dit une fois, opposable

Stickers interactifs (kind réservé, votes O10) · programmation (O11) ·
hashtag-objet · `.pinned`/`annotation` · duet · co-auteur · beat-sync ·
Mood dans le composer unifié (S3) · rendu-du-registre pour l'export (O7 cible) ·
composer web complet. Non-buts : AR visage, live, voice changer.
