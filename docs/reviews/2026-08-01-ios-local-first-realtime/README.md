# Revue iOS — Local-First & Synchronisation Temps Réel

> **Date** : 2026-08-01 · **HEAD audité** : `901e92589` · **Périmètre** : `apps/ios` + `packages/MeeshySDK` + contrat `services/gateway` / `packages/shared`

## But

Amener l'app iOS Meeshy à l'état cible : **strictement local-first** (chaque écran rend depuis le cache immédiatement, lecture complète hors-ligne, écritures optimistes routées par une file durable) **et totalement synchronisée en temps réel** (sockets + rattrapage de gaps + delta sync ; zéro donnée périmée persistante, zéro rapatriement inutile).

Chaque écart relevé est **factuel** (preuve `fichier:ligne` du code au HEAD audité), **vérifié adversarialement** (un second agent a tenté de le réfuter avant publication), et accompagné d'un **correctif pas-à-pas applicable sans réflexion supplémentaire**, d'un **plan de test TDD** et d'une **analyse du risque de régression**.

## Méthodologie

1. **Cartographie** — 13 lecteurs parallèles, un par dimension, chacun limité à des fichiers disjoints, avec interdiction d'affirmer sans citer le code actuel. Les corrections déjà livrées par la vague local-first de juin 2026 (watermark `?after=`, purges logout, outbox reconnect, ETag gateway…) leur ont été fournies pour ne pas être « redécouvertes ».
2. **Vérification adversariale** — un vérificateur par dimension a tenté de **réfuter** chaque écart (défaut = réfuté en cas de doute), corrigé les références de lignes, arbitré les sévérités, marqué les doublons transversaux et réécrit chaque correctif en plan numéroté.
3. **Synthèse** — les écarts confirmés sont regroupés par domaine dans les fichiers `01`–`09`, et ordonnés en lots applicables dans `10-plan-d-application.md`.
4. **Revue finale de la revue** — trois relecteurs à angles disjoints (exactitude factuelle vs code ; applicabilité des correctifs ; cohérence inter-fichiers) ont audité les livrables ; leurs verdicts et les corrections induites sont dans `11-revue-finale-coherence.md`.

## Sévérités

| Niveau | Signification |
|--------|---------------|
| **P0** | Perte de données, fuite cross-compte |
| **P1** | Correctness de la synchronisation (donnée fausse/périmée servie, mutation perdue, désynchronisation visible durable) |
| **P2** | Robustesse, résilience, efficacité (sur-fetch, stall, fenêtres de perte étroites) |
| **P3** | Over-fetch marginal, dette, polish |

## Fichiers

| Fichier | Contenu |
|---------|---------|
| `00-etat-des-lieux.md` | Architecture réelle constatée (cache, persistance, sockets, sync) + forces existantes |
| `01-cache-et-persistance.md` | Cœur du cache SDK (CacheCoordinator, GRDB/Disk stores) + bases SQLite durables |
| `02-ecritures-offline-outbox.md` | Outbox unifié, files parallèles, flushers — le chemin d'écriture hors-ligne |
| `03-temps-reel-sockets.md` | Sockets messages + social : événements, reconnexion, écriture au cache |
| `04-sync-delta-et-rattrapage.md` | Moteur de sync, watermarks, tombstones, rattrapage de gaps |
| `05-stores-et-viewmodels.md` | Propagation multi-vues, conformité cache-first écran par écran |
| `06-reseau-et-contrat-gateway.md` | APIClient (ETag, retry, dédup) + capacités serveur requises |
| `07-extensions-et-appgroup.md` | Widgets, NSE, Share, App Group — cohérence hors process principal |
| `08-demarrage-et-cycle-de-vie.md` | Cold start, foreground/background, BGTasks, sessions anonymes |
| `09-pipeline-medias.md` | Téléchargements, cache disque, uploads résumables |
| `10-plan-d-application.md` | **Backlog exécutable** : lots ordonnés, dépendances, gabarit par tâche |
| `11-revue-finale-coherence.md` | Revue de la revue : verdicts des relecteurs finaux + corrections |

## Comment appliquer (contrat d'exécution)

- **Une tâche = un mini-projet** : lire la fiche de l'écart → écrire le test RED → correctif minimal → GREEN → vérifier la chaîne bout-en-bout (iOS/SDK **et** gateway quand indiqué) → commit isolé (`git add` explicite, jamais `-A`).
- **Ordre** : suivre les lots de `10-plan-d-application.md` — les P0 sont indépendants et applicables immédiatement ; les dépendances inter-tâches y sont explicites.
- **Non-régression** : chaque fiche liste ce qu'il ne faut **pas** toucher et le test qui verrouille le comportement. En cas de conflit entre une fiche et le code au moment de l'application, le code fait foi — re-vérifier la preuve avant d'appliquer.
- Gates : `./apps/ios/meeshy.sh build` + suites ciblées avant commit ; suites complètes en arrière-plan (cf. `tasks/lessons.md`).

## Liens

- Vague précédente : `tasks/local-first-todo.md` (juin 2026, T1–T17 + R1–R10)
- Doctrine : `CLAUDE.md` racine (« Instant App Principles »), `packages/MeeshySDK/CLAUDE.md` (SDK purity)
- Matière première (rapports de cartographie + verdicts bruts) : scratchpad de session `review-inputs/` (non versionné)
