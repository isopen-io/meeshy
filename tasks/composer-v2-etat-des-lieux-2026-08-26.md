# MeeshyComposer v2 — état des lieux formel (2026-08-26, reprise)

> Mesuré sur `main == ccbd78a328` par un audit read-only de 8 agents (workflow
> `composer-v2-etat-des-lieux`) + 1 agent de rattrapage (lot H). Réconcilié avec la
> planche P0 (`docs/superpowers/specs/2026-08-19-meeshy-composer-views.html`, portée
> à **rév. 25** : lot 2-3 éclaté en 12 tâches comptées, lede 104→121, ligne rattrapage soldée).

## Compte du bord de pilotage (rév. 25)
**95 fait / 8 partiel / 18 à-planifier = 121 tâches** (78,5 % fait). Le saut 109→121 vient
de l'éclatement du lot 2-3, jusque-là une NOTE non comptée : le plus gros front restant
était invisible à l'arc.

## Ce qui est FAIT (vérifié sur main)
- **Lots A→H (v1)** : A/B/F/D/E/C intégral. Lecture v3 + `X-Canvas-Caps:3` (iOS pose, gateway lit `caps>=3`).
- **Émission v3 iOS** : FAITE et en production (`StoryEffects.encode → CanvasV3(migrating:)`,
  câblée `POST /posts` via `PostService.createCanvasPost`). Drapeaux serveur `CANVAS_V3_READ` /
  `CANVAS_V3_WRITE_STRICT` OFF (déploiement lockstep — voulu).
- **Lot 7** : 7.1/7.5/7.7/7.8 fait ; 7.2/7.3/7.4 partiel.
- **Vague 1c** (famille deinit iOS 26.1) : mergée `ccbd78a328`.

## Ce qui RESTE — par priorité de reprise

### P1 — Défauts GATEWAY (confidentialité + publication silencieuse) — ÉCONOMIQUE (jest, pas d'iOS)
`POST /posts/from-attachment` (`services/gateway/src/routes/posts/`) :
- **iOS-01 (confidentialité)** : ne refuse ni `isViewOnce`/`isBlurred`/`isEncrypted` — la garde
  n'existe QUE côté client. Un appel HTTP direct publie un média à vue unique. Défense en profondeur absente.
- **iOS-02** : visibilité par défaut `PUBLIC` pour tous les types (STORY comprise) ; publie EN SILENCE
  (aucun `socialEvents.broadcast*`, aucun `resolvePostMentions/withMentions`, aucune notification) ;
  aucun test de route HTTP. Arbitrage O13 rétrogradé partiel.

### P2 — Lot 2 → Lot 3 (le vrai front produit iOS) — 12 tâches, toutes à-planifier
- Lot 2 : rangée d'outils (5/6 `effect:nil`), langue constante `fr` (impact Prisme), `DocumentComposerDoor`
  sans site de montage. Plan `docs/superpowers/plans/2026-08-25-meeshy-composer-v2-lots-2-3-execution.md`
  (1 correction BLOQUANTE connue : `path(hasLocalMedia:true, isOffline:false)` rend `.upload` → refus du cas nominal).
- Lot 3 : le fil monte encore `FeedComposerSheet` (3 sites) ; overlay iPad inline sans garde ; `routesToLegacy`
  est une donnée orpheline (aucun lecteur de présentation). Web déjà basculé (asymétrie réelle).

### P3 — Reliquats
- **7.6** (double publication story) : deux magasins, deux pilotes réseau, aucun verrou mutuel — risque ouvert.
- **Scène 9:16 fixe** (directive 2026-08-25) : NON portée — composer/migration/lecteur restent sur la règle 2026-07-14.
- **V0** : aucune garde mécanique ne confronte `ComposerIntent.swift` au contrat TS (`composer-contract.ts`).
- Gardes vacuous : `iOS-15` (routesToLegacy), `iOS-18` (showsSlides/showsTimeline sans lecteur).

## Lot H — CLARIFIÉ : Android, pas iOS
Le lot H = Android. La suspension du 2026-08-23 vise Android (émission v3 Android absente : `CreatePostRequest`
sans `storyEffects`). AUCUN trou d'émission iOS. La ligne « H — Android » de la planche est correcte.

## Séquence de reprise (workflows économiques)
1. **Vague A** — P1 gateway (TDD jest, sans iOS) : garde serveur média protégé + visibilité par type +
   broadcast/mentions + test de route HTTP. Revue Opus, gate `bun run test:coverage`.
2. **Vague B** — P2 lot 2 → lot 3 (iOS, worktree + sim dédié + gate.sh). Chaque T-tâche flippe sa ligne P0.
3. **Vague C** — P3 reliquats (7.6, scène 9:16, gardes V0).
