# MeeshyComposer — Spécification d'exécution v1

Date : 2026-08-20
Statut : **spécifié — arbitrages TOUS tranchés**, prêt pour `writing-plans` par lot
Rév. 4 (2026-08-20) : revue totale à 4 axes — arbitrages O12–O16 (collage,
porte e9, partage entrant, drapeau d'écriture, continuité de lecture), loi 8,
`translations`/`transcriptions` au contrat, lot G, §F exhaustif
Rév. 5 (2026-08-20) : O17 négociation de forme à la LECTURE (« personne ne lit
du vide ») — `X-Canvas-Caps`, sentinelle v1 localisée, garantie de restitution
de l'archive posée en loi 11
Rév. 6 (2026-08-20) : revue d'intégration — note de numérotation B3.N (I3),
tranche I6 (doc sans média → FeedComposerSheet), architecture lot F réécrite (I8)
Rév. 7 (2026-08-20) : cycle final — point d'attache de la négociation TRANCHÉ
(threading du lecteur à travers les SERVICES, F1), exception temps réel (F3),
ligne « v3 invalide » (F5), `volume?` au payload media (F10)
Rév. 8 (2026-08-20) : P0 tableau de bord vivant (règle de maintenance en §E) ;
lot A EXÉCUTÉ — 10/10 tâches TDD, gate 795 suites vertes, branche
`feat/composer-lot-a` en attente de merge
Design source : `./2026-08-19-meeshy-composer-design.md` (+ planches P1–P24)
Ce document est la sortie de la revue totale : il fige les décisions, définit le
contrat commun, et découpe l'exécution en **huit lots** (six parallélisables
A–F + le lot G d'entrées externes séquencé après C + le lot H Android en
lockstep, hors chaîne de merge iOS/web mais condition d'armement des deux
drapeaux) avec interfaces gelées.
Chaque lot est raffinable puis exécutable dans son worktree.

---

## A. Verdict de revue — solide et réalisable, après six correctifs

Le design est solide : la doctrine (onze lois — 7 stables depuis P1, 8-10 ajoutées en rév. 4, 11 en rév. 5) tient depuis P1, l'inventaire
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
| R6 | Fenêtre de rupture web | le web se déploie en lockstep (pas de binaire retardataire) : le plancher de version ne gate que le natif. **Amendé rév. 4 (revue totale C5)** : « fenêtre de retardataires » était un euphémisme — au merge de A, AUCUN écrivain n'émet v3 (100 % du parc iOS, le composer web `StoryComposer.tsx:252`, Android). L'écriture stricte passe donc SOUS DRAPEAU (`CANVAS_V3_WRITE_STRICT`, §C3) ; le 426 ne sert que la longue traîne post-armement |

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

### B1. Les arbitrages — tranchés

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
| O12 | **Collage : la surface décide** (revue totale C2). Le `PasteButton` de la SCÈNE produit TOUJOURS un objet `media` (≤ 2 048 px) ; celui du panneau STICKERS produit un sticker (PNG ≤ 512 px) + entrée « Mes stickers » ; la promotion média→sticker est une action EXPLICITE d'inspecteur (« Garder dans Mes stickers »). Même phrase dans P7×2, §6b, P13, et la garde de source C5 | C |
| O13 | **Porte e9 `.conversationMedia(messageId:attachmentId:)`** (revue totale C1) : appui long sur un média REÇU → « Créer un post » → composer préconfiguré, média posé — 2 gestes. v1 = matérialisation cache-first (`AttachmentMediaSaveResolver.resolveLocalFile(for:)`) + re-upload TUS depuis le cache local (zéro téléchargement dans le cas nominal, offline OK) ; pont serveur MessageAttachment→PostMedia (modèle `copyForwardedAttachments`) = post-v1 §F. Gardes : `!isViewOnce` (même règle que `isForwardable`), jamais `.location` ; `isEncrypted` passe par le seul chemin re-upload local. **AUCUNE référence automatique vers l'expéditeur** — un média reçu en privé n'est pas une publication : l'attribuer d'office exposerait la relation privée (le repost pose une SILENT parce que la source est PUBLIQUE ; ici, mention manuelle seulement) | G |
| O14 | **Partage entrant : destination « Post / Story »** (revue totale C9) dans `MeeshyShareExtension` à côté des conversations : fiche versionnée `share_pending_posts/` (motif exact `SharePendingShare`, répertoire SÉPARÉ — rétro-compat triviale), AUCUN envoi réseau depuis l'extension (elle DÉCRIT, l'app compose) ; côté app un `SharePendingPostConsumer` (décalqué de `SharePendingSendConsumer` — boot + avant-plan, ses deux points d'appel repris ; `NSEPendingPostConsumer` prouve le motif pour les posts) convertit la fiche en BROUILLON de l'Étagère + bannière discrète « votre partage vous attend » au foreground — JAMAIS de modale au boot (un lancement appartient à sa cause : notification, appel). N fiches = N brouillons ; TTL 7 j, wipe-logout, plafonds `ShareLimits` conservés. **Rév. 6 (I6, tranché)** : en v1, la reprise d'un brouillon SANS média (texte/URL seuls — un document sans scène) route vers `FeedComposerSheet` préremplie, exactement comme la porte feed (C4) ; la surface « document sans scène » du host reste §F, et O12 « carte de carrousel si Post sans scène » ne s'applique qu'au host cible | G |
| O15 | **Écriture stricte SOUS DRAPEAU** (revue totale C5) : `CANVAS_V3_WRITE_STRICT` (env, défaut OFF — le merge de A est inerte à l'écriture COMME en lecture), armé par acte de déploiement quand les TROIS écrivains émettent v3 (parc iOS large + composer web F5b + Android) ; après armement, le 426 ne sert que la longue traîne | A |
| O17 | **Négociation de forme à la LECTURE** (porteur produit, rév. 5 : « les anciens posts/réels toujours restitués ; tout client à jour reçoit les données ; tout client ancien reçoit une donnée qui l'invite à mettre à jour »). Chaque client v3-capable annonce `X-Canvas-Caps: 3` (posé au MÊME funnel que `X-App-Version` : iOS lot C, Android lot H, **web lot F — la couche fetch, une ligne**) ; l'ABSENCE de l'en-tête ne bloque JAMAIS (contrairement au plancher O2) — elle sert la forme compatible. Règles : (1) blob v1 + client sans caps ⇒ v1 TEL QUEL — l'archive est restituée dans sa forme d'origine, garantie par construction ; (2) blob v1 + caps ≥ 3 + `CANVAS_V3_READ` armé ⇒ converti v3 ; (3) blob v3-natif + caps ≥ 3 ⇒ v3 (toujours — il n'a pas d'autre forme) ; (4) **blob v3-natif + client SANS caps ⇒ SENTINELLE v1** : un `storyEffects` v1 minimal généré à la lecture — fond sobre + un `textObject` « Mets à jour Meeshy pour voir ce contenu », localisé via `resolveUserLanguage` du LECTEUR (le Prisme s'applique même à l'invite) — jamais un canvas VIDE, jamais une erreur ; (5) un post/réel dont le PORTEUR est un attachment média reste servi tel quel aux clients sans caps (le média se lit, seuls les overlays v3 manquent — dégradation douce, pas de sentinelle par-dessus une vidéo). Les vieux RÉELS sont de purs posts vidéo : restitution garantie sans même passer par O17. **Rév. 7 (cycle final F1) — le POINT D'ATTACHE est tranché** : la majorité des sites `withMentions` vivent dans les SERVICES (`PostFeedService.ts` ×10 — feed, tray stories, réels, user posts, community, bookmarks — et `PostAudioService.ts:332`), pas dans les routes ; le paramètre lecteur `{ canvasCaps, readerLanguage }` est donc THREADÉ des routes aux services (signatures étendues), avec **défaut = « sans caps » (la forme compatible : jamais vide, au pire dégradée)** et une GARDE DE SOURCE : aucun appel `withMentions(` sans paramètre lecteur dans les fichiers listés. **Exception temps réel (F3, nommée)** : le broadcast (`post:new`, `story:created`) fane UNE charge à une audience hétérogène — il porte le blob tel quel ; un vieux client peut rendre un fond par défaut TRANSITOIRE sur une story-scène v3-native (jamais un crash — décodage tout-optionnel), corrigé au premier fetch REST négocié (le tray se recharge au foreground) ; les contenus à média porteur s'affichent, eux, par construction (règle 5) | A (négociation + sentinelle), C/F/H (en-tête) |
| O16 | **Continuité de lecture : « un seul temps, celui du contenu »** (revue totale C10) : la clé de continuité est l'IDENTITÉ du média (attachmentId/postMediaId), le moteur est `SharedAVPlayerManager` (le handoff par identité d'URL existe et est prouvé en prod — feed→Réels, inline→fullscreen, fullscreen→PiP), position froide `VideoPlaybackPositionStore`, PiP opt-in PAR SURFACE (`configurePip`), arbitrage avec le PiP d'appel = flux événementiel existant (call start → `stopAll()`). Le ScenePlayer FORMALISE ce contrat, il ne le duplique jamais | B (contrat), E |

### B2. Les simplifications retenues (S2–S8)

S2 pas de nouveau verbe de publication (le composer appelle les trois chemins
d'envoi existants — le PAYLOAD `storyEffects` passe v3, la route ne change pas) ·
S3 Mood hors v1 (StatusComposer conservé) · S4 timeline v1 sans édition de
keyframes dans le plan · S5 trois ancres · S6 « Mes stickers » = récents LRU ·
S7 Étagère = MyStoriesView étendue · S8 pas de `Scene.ratio`.
S1 est remplacée par O2/A′ : la forme unique vit dans le convertisseur serveur.

### B3. Les lois produit du 2026-08-20 (directives, non négociables)

> **Numérotation (rév. 6, revue d'intégration I3)** : cette liste se cite
> « **B3.N** » — jamais « loi N » nu. Les « loi N » nus des planches et du
> design visent la DOCTRINE P1, dont les rangs 1-7 divergent (P1.4 =
> apparition, P1.5 = socle, P1.7 = icône ↔ B3.4 = provenance, B3.5 =
> existence, B3.7 = bibliothèque). Les rangs 8-11 sont identiques dans les
> deux listes.

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
8. **Un seul temps, celui du contenu** (O16) : la position de lecture et l'état
   de piste SURVIVENT au changement de chrome — carte → détail → plein écran →
   PiP. Le contenu ne rembobine jamais parce que l'écran a changé.
9. **La porte ne fixe que l'état INITIAL** (U2) : capacités = f(format courant,
   seed), recalculées à chaque bascule ; le texte ne migre JAMAIS (objets de
   scène ↔ `content` : aucune conversion silencieuse) ; le `content`
   nouvellement disponible naît vide.
10. **Audience « dernière utilisée » PAR FORMAT** (U7) : mémoires S/P/R/M
   séparées (préservation de `StoryVisibilityPreferenceStore` et
   `lastStatusVisibility`) — un post Public ne contamine jamais la story
   intime suivante.
11. **Personne ne lit du vide** (O17) : l'archive éternelle est TOUJOURS
   restituée (v1 aux anciens clients — sa forme d'origine ; v3 converti aux
   clients à jour) ; un contenu v3-natif servi à un client qui ne sait pas le
   lire devient une SENTINELLE lisible qui invite à mettre à jour — dans la
   langue du lecteur. Jamais un canvas vide, jamais une erreur de lecture.

---

## C. Le contrat v3 — LE gel inter-lots

Tout le parallélisme repose sur ce gel : les fixtures de §C4 sont écrites au
jour 1 et deviennent la source de vérité de tous les lots.

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
  payload: <par kind>                   // text: les 18 styles INCHANGÉS
}                                       //   + translations?: {lang: contenu}
                                        //   (le Prisme par objet a un LOGEMENT
                                        //   — revue totale C6 ; résolution
                                        //   lecteur = ordre du prisme, JAMAIS
                                        //   translations.first) ;
                                        // sticker: {emoji} | {mediaId} ;
                                        // media: {mediaId, muted?, loop?,
                                        //         volume?} — rév. 7 (F10) :
                                        //   v1 StoryMediaObject.volume est un
                                        //   champ VIVANT (règle U21) ;
                                        // place: {place, precision} ;
                                        // mention: {userId} ; audio: {…bornes}
BackgroundSound {
  source: {t:'original'} | {t:'library', soundId},   // ← la PROVENANCE (B3.4)
  volume, bounds?: {start, end},
  transcriptions?: [{language, content}]  // sous-titres voix par langue
}                                          // (karaoké = Prisme audio — revue
                                           // totale C7 : v1 `voiceTranscriptions`
                                           // racine trouve ici son logement)
Keyframe { time, x?, y?, scale?, opacity?, volume?, easing? }   // existant, inchangé
```

### C2. Table de conversion v1→v3 (le contrat du convertisseur)

| v1 (familles) | v3 | Règle |
|---|---|---|
| `textObjects[i]` | `ObjectV3(kind:text, plane:fg)` | styles/couleur/fond/align/size → payload inchangé ; `textPosition/textOffsetY` → `anchor.free` ; `startTime/keyframes` → `timing` ; `sourceLanguage` → `locale` ; **`translations` → `payload.translations` (conservées — l'archive garde son Prisme, C6)** |
| `mediaObjects` / fond image-vidéo (`background`, `backgroundTransform`) | `kind:media` — porteur en `plane:content`, fond en `plane:bg` ; `volume` → `payload.volume`, muet → `payload.muted` (rév. 7, F10) | `canvasAspectRatio` DISPARAÎT : le porteur garde son ratio intrinsèque, la scène letterboxe (bandes). **Rév. 4 (U20) : les ancres `.free` des objets v1 sont REMAPPÉES dans le rect letterboxé du porteur** — les coordonnées v1 sont normalisées au canvas de ratio `canvasAspectRatio` ; converties telles quelles, un texte posé SUR le média atterrirait dans une bande. Golden : cas ratio 1.7777 avec coordonnées remappées assertées |
| `stickerObjects` | `kind:sticker {emoji, baseSize, anchorPoint, fadeIn, fadeOut}` | **rév. 4 (U21) : les champs vivants SURVIVENT** — taille rendue = baseSize × scale (défaut 140 ; un sticker historique à baseSize 300 rendrait à moitié sans lui), pivot, fondus. La tolérance « champ inconnu ignoré » ne vaut que pour l'INCONNU, jamais pour le recensé |
| `locationObjects` | `kind:place, plane:fg` | precision conservée |
| `audioPlayerObjects` | `kind:audio, plane:content` | chips premier plan (B3.3) |
| `backgroundAudioId/Volume/Start/End` (+ `musicTrackId` déprécié) | `sound{source:library}` | piste propre (`voiceAttachmentId`…) → `source:original` |
| `voiceTranscriptions` (racine) | `sound.transcriptions` | par langue, ordre conservé — le karaoké survit à la conversion ET à l'encodage neuf (règle B7, C7) |
| `opening/closing/clipTransitions/timelineDuration` | copiés tels quels | |
| `slideDuration` (legacy) | IGNORÉ | `computedTotalDuration()` reste l'autorité |
| `filter`/`filterIntensity` (racine) | payload du média PORTEUR (à défaut, du fond `bg`) | **rév. 4 (G3)** : chaque story filtrée de l'archive gardait P2 « Filtres — liste inchangée » sans ligne de conversion — le golden l'asserte désormais |
| `textStyle`/`textColor`/`textPosition` (racine, stylage legacy du content) | `ObjectV3(kind:text)` synthétisé portant le `content` — SEULEMENT si `textObjects` est vide | **rév. 4 (G3)** : les très vieilles stories stylaient le texte racine ; un doc avec textObjects ignore ces champs (ils y sont redondants) |
| `stickers: [String]` (racine legacy) | un `kind:sticker {emoji}` par entrée | **rév. 4 (G3)** — transform/timing neutres |
| champ inconnu | IGNORÉ + compteur de télémétrie | tolérant par contrat : rendu dégradé, jamais d'échec |

### C3. La rupture propre (O2/A′)

- **Écriture** (rév. 2, revue Fable n°4-5 ; rév. 4, revue totale C5) :
  `POST/PUT /posts` valide `storyEffects` en v3 STRICT (Zod), DERRIÈRE le
  drapeau `CANVAS_V3_WRITE_STRICT` (env, défaut OFF ⇒ le merge de A est inerte
  à l'écriture ; l'armement est un acte de déploiement, POSTÉRIEUR à la
  disponibilité des trois écrivains v3 — parc iOS, web F5b, Android). Drapeau
  armé : deux refus DISTINCTS :
  blob **sans `v:3`** (client du passé) ⇒ `426` avec, À LA RACINE de la réponse
  (forme réelle de `sendError` : `error` chaîne, détails étalés) :
  `{ success:false, error, message, code:'UPGRADE_REQUIRED', minVersion, storeUrl }` —
  `storeUrl` résolu par `X-App-Platform` (`ios`/`android` ; défaut Apple si
  absent — rév. 4, G1 : un 426 Android avec un lien App Store serait absurde) ;
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
- **Lecture** (rév. 5 — O17, la NÉGOCIATION subsume le simple drapeau) :
  `convertStoryEffectsForWire(post, readerCaps)` — UN helper, appliqué aux
  mêmes points d'aplatissement que `withMentions` (chaîne connue et testée :
  les ROUTES ont `request` en portée, la capacité y est lue et passée en
  argument). Table de décision :
  | blob stocké | client `X-Canvas-Caps ≥ 3` | client SANS caps |
  |---|---|---|
  | v1 (archive) | v3 converti si `CANVAS_V3_READ` armé, **sinon v1** (qu'il lit aussi) | **v1 TEL QUEL — restitution garantie** |
  | v3-natif (`blob.v >= 3` — le prédicat est la MARQUE, jamais la validité) | v3 (toujours) | **SENTINELLE v1 localisée** (contenus-scène) · post/réel à média porteur : `storyEffects` OMIS (nil — le média se lit, pas d'overlays, pas d'invite par-dessus une vidéo ; rév. 7, arbitrage du cas ambigu) |
  | v3 au SCHÉMA invalide (fenêtre B7-émet-avant-armement-O15) | servi TEL QUEL — le rendu client est best-effort (résilience de décodage en place iOS ; le web try/catch `CanvasV3Scene`) | sentinelle (même prédicat `v >= 3`) — rév. 7 (F5) |

  La sentinelle est un blob v1 GRAMMATICALEMENT VALIDE pour les vieux parseurs
  (fond `"1E1B4B"` — la forme v1 réelle, sans préfixe `color:` ni `#` ; rév. 7).
  `CANVAS_V3_READ` (défaut OFF) ne gouverne QUE la conversion de l'archive ;
  son armement exige lot F déployé ET lecteur Android v3 (G1). La sentinelle,
  elle, est active dès le merge de A : c'est elle qui garantit qu'aucun client
  ne rend un canvas vide quand les binaires neufs (B7) commencent à émettre du
  v3-natif. Permanent : l'archive est éternelle, `/republish` copie des blobs
  v1 (R5).
- **Brouillons locaux** : `StoryDraftStore` migre one-shot v1→v3 au premier
  lancement (même table de conversion, portée Swift, testée sur fixtures).

### C4. Fixtures gelées (jour 1)

`packages/shared/fixtures/canvas-v3/*.json` : `minimal-text`, `story-3-slides`,
`reel-16x9-bands`, `post-carousel-sound-library`, `post-sound-original`,
`v1-legacy-full` (entrée) + `v1-legacy-full.v3.json` (sortie golden du
convertisseur — généré, relu à la main mapping par mapping, puis GELÉ **à la
clôture de la Task A3** ; B2 et F ne démarrent qu'après ce commit, B1 après la
Task A2). Tout lot code contre ces fichiers ; les changer exige un commit dédié
touchant tous les lots — c'est voulu, c'est le gel. La fixture v1 est RÉALISTE :
ses formes sont celles des modèles Swift v1 vérifiés (place objet SharedPlace
requis, postMediaId, clipTransitions à cinq clés), jamais des clés inventées.

---

## D. Les lots

Règles worktree (CLAUDE.md) : jamais deux lots sur le même fichier ;
`project.pbxproj` géré par le DERNIER lot à merger ; chaque lot passe son gate
dans son worktree.

### Lot A — Contrat & rupture (gateway + shared) — DÉMARRE EN PREMIER
- **Mission** : schéma Zod v3 + fixtures §C4 ; convertisseur v1→v3 + golden
  tests ; validation stricte à l'écriture + 426 **sous `CANVAS_V3_WRITE_STRICT`
  (O15)** ; `X-App-Version` + plancher + config ; réservation des kinds O10 ;
  claim des stickers posés (O8, réutilise `claimableMediaWhere`) ;
  **négociation de forme à la lecture + sentinelle v1 localisée (O17 —
  `X-Canvas-Caps` lu aux routes, `resolveUserLanguage` du lecteur pour le
  texte de l'invite)** ; **migration
  du pipeline de traduction des objets texte** (revue totale C6 :
  `StoryTextObjectTranslationService.ts:98` écrit
  `storyEffects.textObjects.$i.translations.$lang` — chemin v1 MORT dans un
  document v3 ; le trigger, les chemins de persistance `scenes[].objects[]` et
  le broadcast passent v3, derrière le même drapeau d'écriture).
- **Possède** : `packages/shared/types/canvas-v3.ts` (types/ — jamais un
  dossier neuf hors build), `fixtures/canvas-v3/*`,
  `services/gateway/src/services/posts/storyEffectsV3.ts` (+ tests),
  `utils/appVersion.ts` (env lus inline — `env.ts` est un loader dotenv
  side-effect, rien à y modifier), retouches des routes posts (validation/426).
- **Produit** : fixtures gelées, contrat 426, helper de conversion branché.
- **DoD** : suites gateway vertes (bun) ; golden v1→v3 ; drapeau ARMÉ :
  création avec blob v1 ⇒ 426 (format), en-tête présent sous plancher armé ⇒
  426 ; drapeau OFF (défaut) : le blob v1 passe TEL QUEL — A merge inerte aux
  deux sens ; **absence d'en-tête ⇒ passe** (web exempt, R6) ; traduction d'un
  texte v3 persiste dans `scenes[].objects[]` ; **négociation O17 : blob v1 →
  client sans caps ⇒ `toEqual` l'original (restitution) ; blob v3-natif →
  client sans caps ⇒ sentinelle v1 dans la langue du lecteur ; caps ≥ 3 ⇒
  v3** ; `dist/types/canvas-v3.js`
  existe après build ; `tsc --noEmit` propre.

### Lot B — Noyau SDK : modèle v3 + ScenePlayer (packages/MeeshySDK)
- **Mission** : `CanvasV3` Swift (miroir manuel, convention du dépôt) ;
  `MeeshyScenePlayer(document:mode:)` modes `.reader/.preview/.card` en
  refactorant le moteur existant (A du §A) ; lois de lecture reprises (né en
  pause, cache/fade, boucle=fond, rail figé) ; résolveur audio promu (B3.4/5) ;
  migration `StoryDraftStore` ; garde de source anti-profondeur-de-type.
- **Possède** : `MeeshySDK/Models/CanvasV3*.swift`, `MeeshySDK/Models/StoryModels.swift` (B7 — décodage du fil), `MeeshyUI/Story/Canvas/*`,
  `MeeshyUI/Story/ScenePlayer*.swift`, `MeeshyUI/Story/Controls/AudioChipDisplay.swift` (B5), `StoryDraftStore`.
- **Consomme** : fixtures §C4. **Produit** : l'API ScenePlayer + les types `CanvasV3` (`ObjectV3`…)
  (les signatures ci-dessus SONT le gel pour C/D/E). Le contrat ScenePlayer
  intègre O16 : pour le kind `media` porteur en lecture, le rendu passe par
  `SharedAVPlayerManager` (clé = identité du média) — jamais un AVPlayer privé
  qui perdrait continuité, télémétrie (WatchSample) et arbitrage
  (`PlaybackCoordinator`). La résolution des `translations` d'un texte suit
  l'ordre du Prisme du lecteur — JAMAIS `translations.first` (règle critique
  du dépôt).
- **DoD** : scheme `MeeshySDK-Package` vert ; fixtures décodées et rendues ;
  gardes source vertes.

### Lot C — Composer chrome & intentions (apps/ios)
- **Mission** : plateau (3 jetons) / scène / socle permanent ; `ComposerIntent`
  9 profils DÉFINIS (dont e9 `.conversationMedia`, O13 — câblage lot G), portes
  CÂBLÉES v1 = tray (mood route vers son composer, S3 ; **`.feedComposer` route
  vers `FeedComposerSheet` via `routesToLegacy` — rév. 4, revue totale C4 : le
  host n'a pas de surface « document sans scène » (clavier sur content, rangée
  photo·caméra·emoji·document·lieu·micro, envoi durable offline) et recâbler la
  porte la plus utilisée sans elle serait une régression ; la bascule du feed
  vers le host est post-v1, conditionnée à cette surface** ; `.reelTab` HORS
  v1 — aucun point d'entrée réels n'existe au dépôt, les Réels sont un overlay
  sans bouton de création — rév. 3, revue Fable n°5) ; garde anti-UI-morte PAR PROFIL (les capacités refusées ne sont
  pas montées — la zone contextuelle elle-même reste celle du composer SDK,
  « rien par défaut » complet = post-v1, rév. 3 n°10) ; capture appui long ;
  collage `PasteButton` + « Mes stickers » récents (store app-side, LRU 64 Mo
  sur `DiskCacheStore`, règle de surface O12) ; Étagère = MyStoriesView +
  onglets file & archive ; porte bloquante 426/plancher ; en-têtes
  `X-App-Version` + `X-Canvas-Caps: 3` au funnel unique (O17) ; **deux repêchages v1
  quasi gratuits (revue totale C12) : alt text (champ d'inspecteur média —
  `PostMedia.alt` existe côté serveur, orphelin) et `allowSoundExtraction`
  enfin transmis (le champ existe, aucun appelant)**.
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
  annonce du fond (B3.3-5) + bouton 🔇 trois surfaces ; `↻` (déjà conforme
  iOS) ; **le chrome de carte RESTE teinté par l'accent déterministe du post
  (`post.authorColor` — revue totale C8 : `FeedPostCard.swift:93/498/501`) et
  `accentHex` du badge son = cet accent** ; le transport vidéo existant
  (PiP · AirPlay · vitesse · scrubber · ±10 s · plein écran,
  `MeeshyVideoPlayer+Controls.swift:84`) est PRÉSERVÉ tel quel (C10).
- **Possède** : `StoryViewerView*`, `FeedPostCard`, `PostDetailView`,
  `ReelsView*`.
- **Consomme** : ScenePlayer (B), contrat A. **DoD** : `meeshy.sh test` vert ;
  captures avant/après des trois surfaces.

### Lot G — Entrées externes (apps/ios + MeeshyShareExtension) — APRÈS C
- **Mission** : O13 (porte e9 : action « Créer un post » dans
  `MessageActionResolver`/`MessageMoreSheet`, matérialisation cache-first,
  composer préconfiguré, re-upload TUS local) + O14 (destination Post/Story de
  l'extension : fiche `share_pending_posts/`, `SharePendingPostConsumer` →
  brouillon Étagère + bannière). Plan détaillé À ÉCRIRE au lancement (même
  cycle revue Fable) — les planches P18 et §6f du design sont sa spécification.
- **Possède** : `MeeshyShareExtension/*`, `MessageActionResolver`,
  `MessageMoreSheet`, `SharePendingPostConsumer` (nouveau). Séquencé APRÈS le
  lot C (dépend du host, de l'Étagère, du seed du composer).
- **DoD** : `meeshy.sh test` vert ; test de contrat jumeau de
  `SharePendingSendContractTests` pour la fiche post ; les 4 gardes UI ;
  cycle de vie des octets branché (grâce 1 h, TTL 7 j, wipe-logout).

### Lot F — Web (apps/web)
- **Mission** : lecteur v3 (portage minimal du registre : rendu statique +
  timings simples en v1 web), annonce du fond + 🔇, `↻` sans verbe,
  `originalLanguage` enfin envoyé, **F5b : le composer web ÉMET v3**
  (`StoryComposer.tsx:252` publie aujourd'hui `{backgroundColor, textStyle,
  mediaObjects, audioPlayerObjects}` sans `v:3` — deux familles à migrer,
  condition d'armement d'O15), **F2b : la couche fetch web annonce
  `X-Canvas-Caps: 3` (une ligne — sans elle, le gateway servirait au web la
  SENTINELLE pour les contenus v3-natifs, O17)**, collage/stickers HORS v1
  web.
- **Possède** : `apps/web/components/v2/StoryViewer.tsx`, `PostCard`, services.
- **Consomme** : fixtures §C4. **DoD** : `bun run test` web vert ; lockstep au
  déploiement de A.

### Lot H — Android (apps/android) — LOCKSTEP, équipe Android
- **Mission** (rév. 4, G1) : lecture v3 (le viewer Android résout les familles
  v1 aujourd'hui — un blob v3 le vide de ses textes/stickers ; d'ici là, la
  SENTINELLE O17 le couvre : sans `X-Canvas-Caps`, Android reçoit v1 + invite)
  + émission v3 du composer story Android + en-tête `X-Canvas-Caps: 3`. Condition d'ARMEMENT des deux drapeaux :
  `CANVAS_V3_READ` exige la lecture Android en prod ; `CANVAS_V3_WRITE_STRICT`
  exige son émission. Plan détaillé côté Android, hors des lots iOS/web —
  fixtures §C4 = même gel.
- **DoD** : golden partagé décodé/rendu ; suites Android vertes.

### Dépendances & ordre de merge

```
A (contrat, fixtures J1) ──► B (SDK) ──► C, D, E (parallèles)
A ──────────────────────────► F (parallèle à B)
C ──► G (entrées externes — host, Étagère, seed)
Merge : A → B → F → D → E → C → G (C ferme le chantier noyau : pbxproj +
porte 426 ; G est un chantier suiveur, plan à écrire à son lancement)
```
Après le dernier merge : clean build depuis main + gate iOS complet + suites
gateway/web — la règle du dépôt.

---

## E. Non-régression : l'inventaire EST la checklist

La définition de fini du chantier entier : **chaque ligne de la planche P2**
(inventaire vérifié, deux passes) est pointée verte sur la build finale —
transitions, undo/redo, transfert interne, trail épinglé, transcription
embarquée, flash, variantes TTS, 18 styles, tri-état des références, fenêtre
référencé-expiré, offline, republication, édition avec reset,
**accent déterministe par post (`authorColor` — chrome de carte, C8), transport
vidéo complet (PiP · AirPlay · vitesse · scrubber · ±10 s · plein écran, C10)**…
Une ligne perdue = un défaut bloquant, pas une note.

**P0 est le tableau de bord vivant (rév. 8, demande du porteur produit).**
La planche P0 des views (camembert + matrice fait·testé·sur-main·reste) se
maintient STRICTEMENT : chaque tâche dont le gate passe la met à jour dans le
MÊME commit que son gate ; le camembert ne compte une tâche qu'au gate PROUVÉ
(rouge puis vert au runner). Un P0 périmé est un défaut bloquant au même titre
qu'une ligne d'inventaire perdue — c'est un item du DoD de CHAQUE lot.

## F. Hors v1 — dit une fois, opposable

**Rév. 4 (revue totale C12) : cette liste est EXHAUSTIVE — un comportement des
planches ni implémenté par un lot ni listé ici est un défaut de spec, pas une
licence d'interprétation.** Les descopes jusqu'ici éparpillés dans les lots y
sont rapatriés.

Stickers interactifs (kind réservé, votes O10) · programmation (O11, prémisse
best-effort INCLUSE) · hashtag-objet · `.pinned`/`annotation` · duet ·
co-auteur · beat-sync · Mood dans le composer unifié (S3) · rendu-du-registre
pour l'export (O7 cible) · composer web complet · **porte `.reelTab`
(conditionnée à un point d'entrée produit Réels) · porte `.feedComposer` vers
le host (conditionnée à la surface « document sans scène », C4) · « rien par
défaut » complet de la zone contextuelle · **états AMORCE/INSPECTEUR nommés
(I7 — v1 : zone du composer SDK)** · **surface « document sans scène » du
host (I6 — v1 : `FeedComposerSheet` sert les documents texte/URL, y compris
les brouillons de partage sans média)** · sticker collé `{mediaId}` (v1 : le
collage de scène pose un objet média, O12) · vitesse `timing.rate` (champ gelé
au contrat, AUCUNE UI v1) · détourage sujet VisionKit · GIF animés · presets
d'animation de texte · layouts multi-textes · réponse privée P·R (P14) ·
brouillons + file offline étendus P·R · généralisation du `locale` par objet
aux kinds non-texte (v1 : textes seuls) · pont serveur
MessageAttachment→PostMedia (O13 — v1 re-upload local) · handoff de POSITION
composer→lecture (les players privés du canvas restent, O16 ne couvre que la
lecture) · PiP sur le ScenePlayer `.reader` de story (le kind media porteur
plein écran GARDE son PiP existant via MeeshyVideoPlayer) · sticker-lien
(payload sticker `{url}` tappable — prémisse P16) · file de publication UNIQUE
(PublishIntent, S2) · double capture avant+arrière (Dual)**. Non-buts : AR
visage, live, voice changer, retardateur/mains-libres.
