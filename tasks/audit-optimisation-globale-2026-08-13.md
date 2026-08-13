# Audit d'optimisation globale Meeshy — 2026-08-13

> **Méthode** : 6 explorations parallèles (iOS UI, iOS data/réseau/cache, web, gateway, translator, infra/architecture) sur HEAD `a98bad80`. Chaque constat est ancré sur un `fichier:ligne` vérifié. Ce document est le catalogue ; le plan d'exécution iOS est dans `tasks/plan-optimisation-ios-2026-08-13.md`.
>
> **Antériorité** : ne pas re-proposer ce qui est déjà livré — cf. `ios-bandwidth-audit-2026-05-21.md` (BW1 outbox gate + inventaire), `payload-weight-sprint-2026-06-07.md`, `realtime-hotspots-analysis.md`, `reels-thermal-todo.md`, `conversation-rendering-fixes-2026-05-19.md`. Côté web, `AUDIT_PERFORMANCE_VERCEL.md` / `AUDIT_HOOKS_REACT.md` / `CORRECTIONS_HOOKS_PROPOSEES.md` sont **consommés** (appliqués ou rendus obsolètes par la migration React Query) et peuvent être archivés.

---

## 1. Taxonomie — les formes d'optimisation applicables à une app comme Meeshy

### A. Frontend (iOS & web)
| Forme | Principe | Où c'est utile dans Meeshy |
|---|---|---|
| **Hygiène de re-render** | Une vue feuille ne doit se ré-évaluer que si SES entrées changent (Equatable/memo, primitives, pas d'observation de singletons globaux) | Bulles, rangées de listes, story tray, tab bar (iOS) ; message list, feed, sidebar (web) |
| **Travail hors du chemin de rendu** | Zéro IO/décodage/formatage dans `body`/render : décodage image, `stat()`, DateFormatter, JSON | Cellules stories, avatars, notification rows |
| **Coalescing / debounce des événements** | N événements socket → 1 mise à jour UI par fenêtre (~50–80 ms) | Refresh du MessageStore, applySnapshot, typing/presence |
| **Rendu paresseux & virtualisation** | Lazy stacks, fenêtres bornées, `content-visibility` | Listes longues (messages, feed, notifications) |
| **Budget mémoire média** | Downsampling à la taille d'affichage, caches bornés, streaming vers disque (jamais des vidéos en `Data`) | Covers de stories, avatars, prefetch vidéo |
| **Chemin critique de démarrage** | Paralléliser les fetches indépendants, différer le non-visible, pas de travail synchrone d'actor au boot | `RootView` boot chain, `CacheCoordinator.start()` |
| **Poids du bundle (web)** | SSR réel, imports dynamiques, barrels supprimés, fonts à la demande | `layout.tsx`, landing page, `@/components/v2` |
| **Perception** | Optimistic updates, skeletons, stale-while-revalidate (déjà des principes maison — les faire respecter partout) | Tous les ViewModels |

### B. Backend (gateway, translator)
| Forme | Principe | Où c'est utile |
|---|---|---|
| **Élimination des N+1** | 1 requête agrégée au lieu de N requêtes par entité | Unread counts (`MessageReadStatusService`), participants |
| **Index alignés sur les requêtes chaudes** | Chaque shape `where/orderBy` chaude couverte par un index | `Participant[conversationId,isActive]`, `Conversation.identifier` |
| **Narrowing des selects** | Ne jamais hydrater un document entier pour 4 champs | `user: true` → `user: { select: … }`, `findFirst` sans select |
| **Caching des lookups répétés** | Auth/prefs/membership en cache Redis, pas re-lus par requête | Middleware auth, userPrefs re-fetchés |
| **Réduction du fanout** | Émettre par groupe de langue, pas par participant ; payloads par langue lue | Boucles d'emit `conversation:updated`, `SOCKET_LANG_FILTER` |
| **Event loop propre** | Aucun appel bloquant (subprocess, locks tenus à travers await, psutil interval) dans la loop | Translator : `cpu_percent(interval=1.0)`, ffmpeg sync, lock Chatterbox |
| **Batching d'inférence ML** | Batcher les textes courts, décoder par lot par langue, quantization int8/fp16 | NLLB (le batching actuel ne se déclenche jamais pour <100 chars) |
| **Logging à coût nul** | Pas de parse/stringify par ligne, redaction seulement si niveau actif | `logger-enhanced.ts`, FileHandler translator |
| **Écritures différées/throttlées** | Writes non critiques fire-and-forget et débouncés | `userSession.lastActivityAt`, deviceLocale/Country |

### C. Architecture
| Forme | Principe | Où |
|---|---|---|
| **Traduction lazy vs eager** | Traduire à la première lecture par langue (+ eager si destinataire connecté) au lieu de messages × langues | `MessageTranslationService` — plus gros levier compute du système |
| **Scalabilité horizontale réelle** | Adapter Redis Socket.IO + état hors process + pas de volume local | Gateway (aujourd'hui plafonné à 1 replica) |
| **Object storage + CDN pour les médias** | Le gateway ne doit pas streamer les vidéos depuis un volume Docker | `attachments/download.ts`, nginx static-files |
| **Observabilité d'abord** | Sans /metrics, aucun gain n'est mesurable | prom-client gateway + instrumentator translator + Grafana |
| **Backpressure explicite** | HWM/timeout ZMQ, rejets visibles plutôt que drops silencieux | Gateway↔translator (frames audio multi-MB) |

### D. Infrastructure
| Forme | Principe | Où |
|---|---|---|
| **Caches CI** | bun cache, turbo remote cache (configuré mais jamais invoqué !), .next/cache, Playwright | `.github/workflows/ci.yml` |
| **Layers Docker stables** | package.json seul avant install, cache mounts, .dockerignore effectif | Dockerfiles gateway/web, contexte racine |
| **Edge tuning** | HTTP/3 (gros gain mobile iOS), compress sur tous les routers, middlewares réellement câblés | Traefik `dynamic.yaml` + labels prod |
| **Datastores bornés** | Redis maxmemory+policy+AOF, index TTL Mongo, maxPoolSize | compose prod, schema.prisma |
| **Parité repo↔prod** | Le compose du repo doit être déployable (bind-mounts cassés aujourd'hui) | `docker-compose.prod.yml` |

---

## 2. Constats par couche (condensé, avec emplacements)

### 2.1 iOS — UI/rendu (détail et plan dans le doc jumeau)
Sévérité haute : `ScrollOffsetRelay` adopté sur 1 seul écran sur 9 (les 8 autres ré-évaluent tout leur body à ~120 Hz au scroll) ; décodage `UIImage(contentsOfFile:)` plein format dans les cellules `MyStoryCard` ; `stat()` par ring de story par render ; cellules feuilles observant `StatusViewModel` global ; `MessageListView` invalidé par chaque typing/mood global ; double `repeatForever` (`AnimatedLogoView`) = bug `DefaultCombiningAnimation` documenté.

### 2.2 iOS — data/réseau/cache (détail et plan dans le doc jumeau)
Cadre : persistance mi-migration (2 bases SQLite, messages écrits 2×, `@Published messages` copie RAM). Sévérité haute : refresh store non coalescé (29 sites) + `fetchMessageWindow` synchrone MainActor ; pas d'index `cache_entries.itemId` (full scan par event social) ; écritures cache = réécriture + re-chiffrement full-list ; re-déchiffrement de toute la fenêtre par event ; boot sériel (4 awaits) ; `loadTranslationCaches` synchrone au boot ; TUS 10 MB en RAM sans background session ; prefetch vidéo stories en `Data`.

### 2.3 Web (Next.js 15)
| Sév. | Constat | Emplacement |
|---|---|---|
| 🔴 | **SSR désactivé globalement** : `<ClientOnly>` autour de tout `{children}` → LCP ~4s mobile, CLS max, `loading.tsx`/Suspense morts | `app/layout.tsx:104`, `components/common/client-only.tsx` |
| 🔴 | **MutationObserver document-wide PAR bulle de message** (querySelectorAll ×2 par mutation DOM ×50 bulles) — cause dominante du jank de scroll | `bubble-message/BubbleMessageNormalView.tsx:101` → `hooks/use-fix-z-index.ts:111-171` |
| 🔴 | `useFixRadixZIndex` monté 4× + `setInterval` 1s avec 6 querySelectorAll document-wide chacun | `ThemeProvider.tsx:17`, `messages-display.tsx:81`, `ConversationMessages.tsx:84`, `bubble-stream-page.tsx:96` |
| 🔴 | Landing publique importe statiquement tout le stack chat (react-markdown, syntax-highlighter, tinyld ~250-400 KB, socketio) | `app/page.tsx:1-11` |
| 🟠 | `displayMessages` clone chaque message par render → toutes les `memo()` des 16 sous-vues bulles inopérantes | `messages-display.tsx:218-245` |
| 🟠 | Sort complet + `new Date()` ×2 par comparaison à chaque event socket (régression survivante de la migration RQ) | `hooks/queries/use-conversation-messages-rq.ts:244-256` |
| 🟠 | Barrel `@/components/v2` (124 exports) tiré par le layout connecté et 5 pages pour `useToast` | `app/(connected)/layout.tsx:3`, `components/v2/index.ts` |
| 🟠 | `CallManager` (stack WebRTC ~100-150 KB) monté statiquement sur toutes les routes, `/login` inclus | `app/layout.tsx:16,111` |
| 🟠 | 10 familles Google Fonts préchargées sur chaque route | `lib/fonts.ts:5-81` |
| 🟠 | `preloadCriticalComponents` télécharge le stack chat sur toutes les routes 1s après load | `components/common/CriticalPreloader.tsx`, `lib/lazy-components.tsx:139` |
| 🟡 | Feed sans virtualisation ni memo, ref callback instable (impressions gonflées) | `PostsFeedScreen.tsx:763,771`, `v2/PostCard.tsx:687` |
| 🟡 | `measureElement` = getBoundingClientRect par row par frame (reflow forcé) | `messages-display.tsx:319` |
| 🟡 | i18n async par composant (445 sites) → double render + flash de clés systématique | `hooks/use-i18n.ts:56-136` |
| 🟡 | Subscriptions Zustand sans selector sur les stores les plus chauds (`useCallStore()` dans le layout racine) | `CallManager.tsx:71`, `compatibility-hooks.ts:16-26` |
| 🟡 | `AvatarImage` (110 sites) sans `loading="lazy"` | `components/ui/avatar.tsx:25-49` |
| 🟡 | Prism + react-markdown statiques dans le chemin de rendu de chaque message texte | `messages/MarkdownMessage.tsx:11-16` |
| 🟢 | Dead code (ancien hook 531 L, markdown-parser 1054 L, useVirtualizedList jamais consommé), avatar 2.7 MB commité dans `public/`, `modularizeImports` vs `optimizePackageImports` en conflit, `maxPages` absent des infinite queries, 154 console.log non strippés | divers |

**Ordre d'attaque web** : 1) ClientOnly racine (~5 lignes, plus gros gain LCP) ; 2) observers z-index (~20 lignes, plus gros gain jank) ; 3) landing + CallManager + preloader ; 4) clone displayMessages + sort ; 5) fonts + avatars lazy ; 6) barrels/config.

### 2.4 Gateway (Fastify)
| Sév. | Constat | Emplacement |
|---|---|---|
| 🔴 | N+1 `message.count()` par conversation sur `GET /conversations` (jusqu'à 100 counts concurrents/requête) | `MessageReadStatusService.ts:482-496` |
| 🔴 | Recompute unread par message = scan potentiel de tout l'historique (floor `null` → aucune borne) | `MessageReadStatusService.ts:381-389` |
| 🔴 | **Pas d'adapter Redis Socket.IO** — le code multi-node (`.except(localSocketIds)`) est mort ; scale horizontal impossible | `MeeshySocketIOManager.ts:279-318`, `package.json` |
| 🔴 | Boucle d'emit par participant (~1000 emits/message pour un groupe de 500) au lieu de grouper par langue résolue | `MessageHandler.ts:1381-1387`, `MeeshySocketIOManager.ts:2310` |
| 🔴 | Double sérialisation + SHA-256 de chaque body GET (hook global + `sendWithETag` par route) | `utils/etag.ts:14`, `server.ts:325` |
| 🔴 | Pino neutralisé : JSON.parse + re-stringify + stdout **synchrone** par ligne ; redactPII (deep clone + sha256) même niveau désactivé | `logger-enhanced.ts:192-208, 31-62` |
| 🟠 | Index manquant `[conversationId, isActive]` sur Participant (3+ requêtes/message) | `schema.prisma:556` |
| 🟠 | `user: true` (doc complet, password hash inclus) par participant pour 4 champs langue + 1 logger.info/participant | `MessageTranslationService.ts:844-868` |
| 🟠 | `user.update` awaité en preHandler (deviceLocale + deviceCountry, jamais court-circuité) ; `userSession.update` par requête sans throttle ; 4 RTT Redis séquentiels dans l'auth | `middleware/deviceLocale.ts:181`, `deviceCountry.ts:168`, `auth.ts:312, 121-306` |
| 🟠 | `GET /messages` = 8–12 round-trips DB séquentiels ; userPrefs re-fetchés alors qu'en cache auth | `routes/conversations/messages.ts` (tracé :570→:1472) |
| 🟠 | Translations complètes broadcast à tous (`SOCKET_LANG_FILTER` off par défaut alors que le filtre est testé) | `MeeshySocketIOManager.ts:2102, 1865` |
| 🟢 | ZMQ sans HWM/sendTimeout ; JSON.stringify pour logger la taille ; mentions résolues 2× ; `include` complet sur GET /conversations/:id ; bodyLimit 50 MB global | divers |

Vérifié sain : E2EE côté client (zéro coût gateway), `perMessageDeflate` bien réglé, index de la page messages correct.

### 2.5 Translator (FastAPI ML)
| Sév. | Constat | Emplacement |
|---|---|---|
| 🔴 | `psutil.cpu_percent(interval=1.0)` **bloque l'event loop 1 s toutes les 5 s** (~20 % du wall time) | `zmq_server_core.py:134` |
| 🔴 | `threading.Lock` tenu à travers des `await` pendant la synthèse TTS (loop gelée 5–60 s) | `chatterbox_backend.py:498-576` |
| 🔴 | `subprocess.run(ffmpeg)` synchrones dans des handlers async (diarization, multi-speaker) | `diarization_service.py:238`, `multi_speaker_processor.py:731,935` |
| 🔴 | Device `'cuda:0'` comparé à `== 'cuda'` → GPU jamais utilisé ; dtype figé avant init → fp32 partout, `QUANTIZATION_LEVEL` ignoré (~7.6 GB RSS) | `translator_engine.py:283`, `model_loader.py:107,239` |
| 🔴 | ThreadPoolExecutor + event loop **neufs par langue par message audio** ; chaque sortie TTS re-transcrite par Whisper par langue (2–3× le coût pipeline) | `translation_stage.py:421-489, 592-611` |
| 🟠 | Les textes <100 chars (la majorité) court-circuitent le batching NLLB → jamais batché ; N langues strictement séquentielles ; chunks 200 chars sérialisés | `connection_manager.py:133`, `translation_processor.py:77`, `translator_engine.py:355` |
| 🟠 | Escalade auto vers NLLB-1.3B dès 200 chars (2.5× plus lent CPU) ; `WHISPER_MODEL` default large-v3 (Settings distil ignoré) ; compute_type float16 non supporté CPU → float32 | `translation_service.py:279`, `transcription_service.py:133`, `.env.example:83` |
| 🟠 | 1 GET Redis par segment (pas de MGET) ; write cache awaité avant publication ; uvloop présent mais jamais installé ; logs INFO par chunk + FileHandler | `translation_cache.py:185`, `translation_processor.py:326`, `main.py:538,19` |
| 🟡 | 30–50 workers → 1 lock modèle (concurrence effective 1) ; ZMQ sans HWM (drop silencieux de frames audio) ; batch jeté silencieusement quand pool plein ; psutil+gethostname+uuid4 par résultat publié ; scaling no-op appelé à chaque itération | `main.py:144`, `zmq_server_core.py:58`, `connection_manager.py:226`, `zmq_translation_handler.py:385-433`, `worker_pool.py:189` |

**Top fixes classés** : 1) cpu_percent non bloquant ; 2) batcher textes courts + chunks ; 3) int8/fp16 + fix device ; 4) subprocess/locks hors loop ; 5) gather+Semaphore par langue + gater la re-transcription ; 6) uvloop + MGET + writes fire-and-forget.

### 2.6 Infrastructure & architecture
| Sév. | Constat | Emplacement |
|---|---|---|
| 🔴 | **Zéro observabilité** (pas de /metrics, pas d'OTel) — rien n'est mesurable, à faire EN PREMIER | tout le repo |
| 🔴 | Pas de scale-out possible : adapter Redis absent (cf. 2.4) + `container_name` pinné partout + uploads sur volume local — à traiter EN BLOC | `docker-compose.prod.yml:6-531` |
| 🔴 | Turbo remote cache configuré mais la CI n'invoque **jamais** turbo (8 builds bruts séquentiels) ; `bun install` jamais caché (9 jobs à froid) | `ci.yml:1039-1078, 80-1014`, `turbo.json:3` |
| 🔴 | compose prod bind-mount 4 chemins inexistants (drift repo↔prod structurel) | `docker-compose.prod.yml:65-68,336,449` |
| 🟠 | **Fanout traduction eager messages × langues** — plus gros poste compute ; passer lazy-on-first-read (+ eager si destinataire connecté) après instrumentation | `MessageTranslationService.ts:469-778` |
| 🟠 | Aucune limite ressources prod (translator peut OOM-kill Mongo/Redis) ; Redis prod sans maxmemory/policy et sans AOF (inversé vs docs) ; aucun index TTL (sessions 365 j, PostView…) ; pas de maxPoolSize Mongo | `docker-compose.prod.yml`, `schema.prisma` |
| 🟠 | Docker : tests translator (21 MB) dans l'image, .dockerignore par service jamais lus, négation pyannote inopérante (re-download 31 MB/cold start), COPY shared complet avant install (layer busting), cache Next.js jamais persisté | `.dockerignore:20-93`, Dockerfiles |
| 🟠 | Traefik : middlewares secure-headers/rate-limit/cors définis mais câblés nulle part ; pas de compress translator/agent ; **HTTP/3 absent** (gain mobile iOS direct) | `dynamic.yaml:17-71`, `docker-compose.prod.yml:22` |
| 🟡 | Healthchecks 30 s uniformes (mongosh lourd) ; CI Python 3.10 vs prod 3.11 ; nginx static MIME images-only sans gzip | divers |
| 🟢 | 4 symlinks racine cassés ; Caddyfile mort portant les seuls CSP/HSTS ; `--no-frozen-lockfile` ; Playwright re-téléchargé ; prose collée dans un .dockerignore | divers |

---

## 3. Séquencement global recommandé

1. **Mesurer avant tout** : prom-client gateway + instrumentator translator + baselines Instruments iOS (sinon aucun gain n'est démontrable).
2. **iOS (frontend prioritaire)** : suivre `tasks/plan-optimisation-ios-2026-08-13.md`.
3. **Quick wins backend à fort levier** (chacun ≤ 1 journée) : cpu_percent non bloquant, index `[conversationId,isActive]`, groupBy unread au lieu du N+1, pino async, turbo en CI, bun cache CI, compress+HTTP/3 Traefik, Redis maxmemory.
4. **Chantiers architecture** (à spécifier séparément) : traduction lazy-on-read, scale-out gateway (adapter+container_name+object storage en bloc), batching NLLB.
