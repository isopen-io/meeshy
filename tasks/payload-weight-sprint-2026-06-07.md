# Sprint « Poids des Payloads » — optimisation SOTA de la bande passante

> **Date** : 2026-06-07
> **Branche** : `claude/pensive-bardeen-woBc4`
> **Thèse** : rendre **chaque octet transféré le plus léger possible, TOUT LE TEMPS**.
> **Hors scope (sprint 2)** : réduire la *fréquence* / le *nombre* d'échanges (ETag,
> pagination adaptative, batching, upload gates). Cf. `ios-bandwidth-audit-2026-05-21.md`.

Ce sprint est orthogonal à l'audit `ios-bandwidth-audit-2026-05-21.md` (BW1–BW8) qui
traite la *fréquence*. Ici on attaque le **poids unitaire** de chaque réponse REST,
chaque frame WebSocket, chaque blob média.

## Décisions cadrantes (validées 2026-06-07)
1. **Approche** : phasée — quick-wins JSON d'abord, puis sérialisation binaire.
2. **Compat** : breaking accepté **si versionné** (web + iOS migrés ensemble).
3. **Ordre** : **gateway d'abord** (bénéficie instantanément à tous les clients sans
   redéploiement d'app), puis translator/média, puis SDK iOS.

---

## Diagnostic — état actuel (3 explorations parallèles)

### Top tueurs de bande passante (par impact)
| # | Problème | Localisation | Coût |
|---|---|---|---|
| 1 | **REST 100 % non compressé** (pas de `@fastify/compress`) | `services/gateway/src/server.ts` | −70 à −85 % gratuits sur tout le JSON |
| 2 | **Toutes les langues à tous les clients** | `MeeshySocketIOManager.ts:1376`, `routes/conversations/messages.ts`, `utils/translation-transformer.ts` | message 10 langues = 10× la charge, par client, alors qu'1 langue lue |
| 3 | **Pipeline audio** : M4A→WAV ×15, base64 +33 %, TTS dupliqué par langue | `translator/src/services/audio_pipeline/audio_message_pipeline.py:365`, `tts/synthesizer.py:638` | poste le plus lourd en absolu |

### Gaspillages structurels secondaires
- **Participants complets** embarqués dans chaque ligne de liste de conversations
  (`firstName/lastName/isOnline/lastActiveAt` × 5 participants) — non affichés.
  `services/gateway/src/routes/conversations/core.ts:264-426`.
- **Métadonnées d'attachements** complètes (codec/bitrate/fps/sampleRate/segments) dans
  la liste de messages — seuls thumbnail + taille affichés.
  `packages/MeeshySDK/.../Models/MessageModels.swift:68-234`.
- **JSON verbeux** : clés longues répétées (`translatedContent` 16c, `conversationId` 15c,
  `voiceSimilarityScore` 19c), timestamps ISO8601 28 o, ObjectIds 24c répétés en
  `id/messageId/conversationId/senderId/...`.
- **Images** servies pleine résolution, pas de variantes WebP/AVIF.
  `services/gateway/src/services/attachments/UploadProcessor.ts`.
- **Voice embeddings** float32 → base64 (+33 %), `audio_message_pipeline.py:813`.
- **iOS** : aucune garantie `Accept-Encoding`, décode toutes les traductions en mémoire
  (~99 % inutilisées). `MessageService.swift:42-57`, `ConversationViewModel.swift:150-181`.
- **Presence snapshot** : 50 KB en burst à chaque auth socket (1 event/contact).

---

## Phase A — Quick-wins gateway (non-breaking)  ⟶ EN COURS

| Item | Statut | Détail |
|---|---|---|
| **A1** Compression REST Brotli/gzip | ✅ **Livré** | `@fastify/compress` global, br q5 / gzip 6, seuil 1 Ko. Médias auto-exclus (mime-db non-compressible) → range requests intacts. |
| **A2** Tuning deflate WebSocket | ✅ **Livré** | seuil `perMessageDeflate` 1024→256 : compresse reaction/read-status/presence/typing. Context-takeover off (mémoire @100k sockets). |
| **A3** Filtre langue REST (opt-in) | ⏳ À faire | `GET /messages?languages=fr,en` → ne sérialiser que les traductions demandées. Additif, défaut = comportement actuel. |
| **A4** Trim participants liste conv | ⏳ À faire | Retirer `firstName/lastName` du `select` participants (`core.ts`). Déjà non rendus. |
| **A5** Trim métadonnées attachement | ⏳ À faire | Liste messages : ne renvoyer que `id/mimeType/thumbnailUrl/fileSize/(w,h)`. Le reste (codec/bitrate/segments) déplacé au détail. |

## Phase B — Filtrage par destinataire + compaction (breaking, versionné)
| Item | Détail |
|---|---|
| **B1** Filtre langue par socket | `message:new` émis par socket (pas par room) avec uniquement la/les langue(s) du destinataire résolue(s) via `resolveUserLanguage()`. Économie majeure sur conversations multilingues. |
| **B2** Champs creux (`fields=`) | Sélection serveur type GraphQL sparse fieldset sur conv/messages/users. |
| **B3** Field-aliasing / compaction clés | Mapping clés courtes (`tc`→`translatedContent`) ou bascule MessagePack (voir Phase C). |
| **B4** Timestamps epoch ms (number) au lieu d'ISO8601 string | −16 o/timestamp ; gros volume sur listes. |
| **B5** Delta presence snapshot | n'envoyer que les deltas online/offline, pas le full set. |

## Phase C — Sérialisation binaire (SOTA)
| Item | Détail |
|---|---|
| **C1** MessagePack/CBOR sur Socket.IO | parser binaire Socket.IO (`socket.io-msgpack-parser`) côté gateway + web + SDK iOS. −30 à −50 % vs JSON+deflate sur payloads structurés. |
| **C2** Dictionnaire zstd entraîné | dictionnaire partagé sur clés/valeurs récurrentes (langues, modèles, rôles) → compression REST encore meilleure que brotli générique. |
| **C3** Protobuf pour endpoints chauds | message list / conversation list en `application/x-protobuf` négocié via `Accept`. |

## Phase D — Média / Translator
| Item | Détail |
|---|---|
| **D1** Opus partout (voice/TTS) | remplacer WAV intermédiaire + MP3 par Opus 24-32 kbps mono : −60 à −80 % vs MP3, −95 % vs WAV. |
| **D2** Supprimer base64 interne TTS | générer/transporter binaire de bout en bout (ZMQ frames binaires déjà là) ; économie +33 %. |
| **D3** Embeddings binaires + quantisés | float32→float16 (ou int8) + frame binaire (pas base64) : 4 KB→1-2 KB. |
| **D4** WebP/AVIF + variantes responsive | transcodage à l'upload, `srcset` / variantes par largeur. PNG 8-15 MB → AVIF 0.4-0.8 MB. |
| **D5** Dédup média content-addressed | stockage par hash (SHA256) → 1 seule copie des fichiers identiques. |
| **D6** TTS à la demande, pas broadcast N langues | ne synthétiser/pousser l'audio que pour les langues réellement consommées. |

## Phase E — SDK iOS
| Item | Détail |
|---|---|
| **E1** Garantir `Accept-Encoding: br, gzip` | explicite dans `APIClient` + vérifier décompression. |
| **E2** Décodage sélectif traductions | ne décoder/stocker que les langues du Prisme (1-4), pas toutes. |
| **E3** Consommer `?languages=` / `?fields=` | aligner les services SDK sur A3/B2. |
| **E4** Compression upload client | déjà partiel (`MediaCompressor`) ; étendre à l'audio (Opus encode avant upload). |

---

## SOTA — références appliquées
- **Compression** : Brotli (RFC 7932) pour le statique/dynamique ; zstd + dictionnaire pour
  JSON répétitif ; deflate per-message pour WS.
- **Sérialisation** : MessagePack / CBOR (RFC 8949) / Protobuf / FlatBuffers selon le chaud.
- **Audio** : Opus (RFC 6716) — référence VoIP/streaming basse latence basse bande.
- **Image** : AVIF (AV1) > WebP > JPEG ; variantes responsive + `thumbhash` (déjà présent).
- **Transport** : HTTP/3 (déjà `assumesHTTP3Capable` côté iOS), 304/ETag (sprint 2).

## Métriques avant/après (à instrumenter)
- Gateway : middleware `onSend` logguant `Content-Length` avant/après compression par route.
- Socket : compteur bytes émis/reçus par type d'event.
- iOS : `MetricKit networkTransferMetrics` (non exploité aujourd'hui — cf. audit BW).

## Vérification
- Phase A non testable en build complet dans cet environnement éphémère (prisma client non
  généré, `@meeshy/shared` non buildé). Changements minimes & conformes API
  `@fastify/compress` v8 (plugin résolu, types présents). À valider par `pnpm --filter
  @meeshy/gateway type-check` + smoke `curl -H 'Accept-Encoding: br'` en CI/local.
