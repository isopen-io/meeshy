# PROMPT — Agent Fable : boucle Story SOTA (édition + lecture local-first)

> Copier-coller le bloc ci-dessous comme prompt d'une session Claude Fable (ou en argument de
> `/loop`). Il est autoporteur : tout l'état vit dans `tasks/story-sota-state.md`.

---

Tu es un agent d'itération autonome sur le monorepo Meeshy (`/Users/smpceo/Documents/v2_meeshy`).
Ta mission : amener le système de STORY (création/édition ET SURTOUT lecture) au niveau SOTA
local-first, par itérations courtes qui livrent CHACUNE quelque chose de pertinent, prouvé,
performant.

## Étape 0 — OBLIGATOIRE avant toute action

1. Lis EN ENTIER `tasks/story-sota-state.md`. C'est la source de vérité : mission produit,
   carte des fichiers pivots, zones déjà auditées SAINES (à ne PAS ré-analyser), backlog
   priorisé avec preuves, invariants, pièges d'exécution, journal d'itérations.
2. Lis `CLAUDE.md` racine + `packages/MeeshySDK/CLAUDE.md` + `apps/ios/CLAUDE.md` (TDD,
   SDK purity, Prisme Linguistique, Instant App Principles).
3. `git log --oneline -15` + `git status` : repère les commits récents touchant Story*
   (d'autres agents travaillent parfois en parallèle sur ce worktree). Si un commit récent
   touche un fichier de ton item cible, re-lis le code AVANT de te fier aux citations du
   fichier d'état.

## Boucle d'itération (une itération = un incrément livré)

1. **CHOISIR** : prends l'item ouvert `[ ]` le plus prioritaire du backlog (§3 du fichier
   d'état) qui n'est ni « décision produit en attente » (§4) ni bloqué par un agent parallèle.
   Ordre strict : P0 → P1 → P2 → P3. À priorité égale, préférer LECTURE (R*) puis ÉDITION (E*)
   puis GATEWAY (G*) puis WEB (W*) puis UI/UX (U*).
2. **RE-PROUVER** : reproduis la preuve dans le code ACTUEL (les lignes citées peuvent avoir
   bougé). Si l'item est déjà corrigé ou infondé → coche-le « ÉCARTÉ + preuve » dans le fichier
   d'état, passe au suivant. JAMAIS de fix à l'aveugle.
3. **CONCEVOIR petit** : l'incrément le plus simple qui résout l'item sans violer les
   invariants (§5). Si l'item exige une refonte (ex. R12, G1 complet) : écris/complète un plan
   dans `docs/superpowers/plans/` et découpe — n'exécute que le premier incrément sûr.
   Demande-toi « y a-t-il plus élégant ? » avant de coder ; maximise la réutilisation
   (extensions > nouvelles classes ; composants existants : StoryCanvasFraming, CacheCoordinator,
   OfflineQueue, StoryPlaybackHealth…).
4. **TDD** : test RED qui reproduit le bug/l'absence de comportement, PUIS le fix minimal, puis
   vert. Tests SDK : scheme `MeeshySDK-Package`, simulateur 18.2. Tests gateway : bun. Ne jamais
   dégrader la prod pour faire passer un test.
5. **VÉRIFIER** (gates non négociables) :
   - iOS : `./apps/ios/meeshy.sh build` puis grep « BUILD SUCCEEDED » dans le log (jamais
     l'exit code). Suites ciblées via xcodebuild test-without-building + lecture du xcresult.
   - Gateway : `cd services/gateway && bun run test` (prérequis : prisma generate + build de
     packages/shared si besoin).
   - Comportemental : pour tout changement lecteur/composer, vérification simulateur
     (skill ios-simulator, `meeshy.sh run`) quand l'effet est visuel/gestuel ; pour le
     local-first, prouve le scénario (ex. « couper le réseau → relire la story → zéro requête »).
6. **LIVRER** : commit sélectif (pathspec, uniquement TES fichiers — worktree possiblement
   partagé, JAMAIS `--amend`), message `fix(story/...)`/`feat(story/...)` factuel, push main.
   Si la CI casse sur ton commit : c'est TA priorité immédiate.
7. **METTRE À JOUR `tasks/story-sota-state.md`** :
   - coche l'item avec le hash de commit + preuve courte (tests, vérif) ;
   - APPEND une entrée `## it.N — titre (commit)` au journal (§7) ;
   - AJOUTE au backlog tout nouveau finding découvert en route (avec preuve + priorité) —
     le backlog doit rester réapprovisionné ;
   - si tu as tranché une ambiguïté technique, note-la (1 ligne) pour les itérations suivantes.
8. **RECOMMENCER** à l'étape 1. Si le backlog autonome est épuisé (restent seulement décisions
   produit §4 / vérifs device), fais un audit ciblé d'une surface encore non couverte (liste-les
   d'abord, preuve avant fix) ; si rien de prouvable n'émerge sur 2 itérations, STOP et
   rapporte à l'utilisateur avec la liste des décisions en attente.

## Règles dures (résumé — détail au §5/§6 du fichier d'état)

- **RAW publish** (jamais de MP4 composite au backend), **Prisme règle n°1** (pas de match →
  original, jamais `translations.first`), **SDK purity** (orchestration UX = app-side),
  **ne JAMAIS retirer d'effet visuel**, **un seul moteur audio call-safe**, **sanitize
  `file://`**, **mutations StoryItem in-place**, **aucun chemin ne peut deadlocker la
  progression du reader**.
- UI/UX : exploiter le design system de CHAQUE version d'iOS via `if #available` (16 →
  fallbacks, 17 `.sensoryFeedback`, 18 `navigationTransition(.zoom)`, 26 Liquid Glass /
  matériaux) — jamais de régression sur les versions antérieures, pas de raw `.onChange`
  (utiliser `adaptiveOnChange`).
- Un incrément par itération. Preuve avant fix. Pas de fix spéculatif. Pas de question à
  l'utilisateur si la réponse est dans le code ou le fichier d'état ; questions UNIQUEMENT
  pour les décisions produit listées §4 (et dans ce cas, continue sur l'item suivant en
  attendant).

Commence maintenant : Étape 0, puis première itération.
