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
| **A3** Filtre langue REST (opt-in) | ✅ **Livré** | `GET /messages?languages=fr,en` → un seul param filtre les traductions **texte ET audio** (Prisme). Additif, défaut = toutes les langues. Param plumbé via `transformTranslationsToArray(opts)` + `cleanAttachmentsForApi(langFilter)`. 6 tests unitaires verts. Adoption client = E3. |
| **A4** Trim participants liste conv | ✅ **Déjà fait** | `conversationListParticipantSelect` (T17) ne contient déjà ni `firstName/lastName` ni `permissions`. Sender de message aussi trimmé (T16, `messageSenderUserSelect`). Rien à faire. |
| **A5** Trim métadonnées attachement | ⚠️ **Écarté (risque>gain)** | `attachmentMediaSelect` porte `transcription`+`translations` (Prisme audio) **nécessaires** au rendu instantané en liste. Les scalaires (codec/bitrate/fps) sont petits. Le vrai poids = les traductions audio multi-langues → déjà couvert par A3. Pas de trim scalaire agressif. |

## Phase B — Filtrage par destinataire + compaction (breaking, versionné)
| Item | Statut | Détail |
|---|---|---|
| **B1** Filtre langue par socket | 🟡 **Cœur livré, flag OFF** | Fonction pure `filterMessagePayloadForLanguages` (texte + audio) + 7 tests. Câblée dans `_broadcastNewMessage` via `_emitMessageNewByLanguage` (emit groupé par langue, zéro requête DB — utilise `SocketUser.language` + `socketToUser`). **Gardée derrière `SOCKET_LANG_FILTER` (OFF par défaut)** : comportement prod inchangé jusqu'à validation staging (mesure avant/après + vérif multi-device). |

### B1 — reste à faire pour activer en prod
- Mesurer en staging avec `SOCKET_LANG_FILTER=true` (octets émis avant/après, latence emit groupé).
- `SocketUser.language` = langue primaire uniquement. Pour le Prisme complet (regional, customDestination, deviceLocale), enrichir `SocketUser` à l'auth via `resolveUserLanguage()` et filtrer sur le set complet.
- Étendre le filtrage au payload de la **delivery queue offline** (≈ ligne 1517) et au `senderSocket` re-emit (aujourd'hui payload complet — blast-radius volontairement minimal).
- Négociation client `supportsLangFilter` au handshake pour les vieux clients.

### B1 — design d'origine (référence)
Hot-path : `MeeshySocketIOManager._broadcastNewMessage` — aujourd'hui un seul
`this.io.to(room).emit(MESSAGE_NEW, payload)` (≈ ligne 1447) avec TOUTES les langues.

Plan SOTA (grouper par jeu-de-langues pour éviter N sérialisations) :
1. Extraire une fonction **pure** `filterMessagePayloadForLanguages(payload, langs)`
   → renvoie une copie avec `translations` (texte) + `attachments[].translations`
   (audio) restreints. **Unit-testable** sans Prisma/socket (à faire en TDD comme A3).
2. Construire `socketId → preferredLanguages` (cache `connectedUsers`, résolu via
   `resolveUserLanguage()` à l'auth, déjà partiellement dispo).
3. Dans le broadcast : regrouper les sockets de la room par **signature de jeu de
   langues** ; sérialiser **une fois par signature distincte** ; emit au sous-ensemble.
   Fallback `originalLanguage`-only pour sockets sans préférence connue.
4. Filtrer aussi le payload poussé dans la **delivery queue offline** (≈ ligne 1514)
   par destinataire.
5. Versionner : négociation client (handshake `supportsLangFilter`) — les vieux
   clients continuent de recevoir le payload complet.

> ⚠️ **Non implémenté dans cette session** : refactor perf-critique du chemin
> 100k msg/s, **non vérifiable** dans ce container éphémère (client Prisma non
> générable — CDN binaries.prisma.sh bloqué par cert self-signed ; pas de runtime
> socket). À exécuter contre un build complet + staging avec mesure avant/après.
> La fonction pure de l'étape 1 peut, elle, être livrée + testée dès maintenant.
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
| **D1** Opus partout (voice/TTS) | 🟡 **Encodage livré, défaut OFF**. Util pur `utils/audio_format.py::export_options` → Opus = `libopus` mono basse bande (VoIP, `-ac 1`, bitrate `TTS_OPUS_BITRATE=32k`). Câblé dans `synthesizer._convert_format`. **Défaut `TTS_DEFAULT_FORMAT` reste `mp3`** : passer à `opus` casserait les clients non encore migrés au décodage Opus (cf. décision « breaking si versionné »). Activation = flip env **après** Phase E (web + iOS). 8 tests purs verts. |
| **D2** Supprimer base64 interne TTS | ✅ **Livré (non-breaking)**. Le base64 n'était qu'un round-trip *interne* synthétiseur → handler ZMQ (la frame ZMQ vers la gateway était déjà binaire). Supprimé : `synthesizer` ne produit plus de base64 (`mime_type_for`), le cache (`translation_stage._load_cached_audio`) non plus, et `zmq_audio_handler` lit les octets via `read_audio_bytes` (disque d'abord, base64 = fallback legacy). Économie CPU + ~33 % mémoire dans le hot-path audio @100k msg/s. Embeddings vocaux (D3) gardent base64 — hors scope. |
| **D3** Embeddings binaires + quantisés | float32→float16 (ou int8) + frame binaire (pas base64) : 4 KB→1-2 KB. |
| **D4** WebP/AVIF + variantes responsive | 🟢 **Thumbnails + variantes WebP responsive livrés**. Thumbnails WebP (−25-35 % vs JPEG-80, déjà là). **Nouveau** : variantes pleine-résolution `createResponsiveVariants` (util pur `thumbnail.ts`, échelle `640/1080/1920`, jamais d'upscale, WebP q78) + `variantPathFor` ; tests jest (algo validé sur Sharp réel 0.34.5). Générées dans `MetadataManager.generateImageVariants`, persistées par `UploadProcessor` (**images NON chiffrées uniquement** — variantes serveur d'une image E2EE révéleraient le clair). Champ Prisma `MessageAttachment.imageVariants Json?` ; exposé via `attachmentMediaSelect`/`attachmentFullSelect` + `messageAttachmentSchema` (sinon Fastify strip) + `serializeAttachmentForSocket` ; REST via spread `cleanAttachmentsForApi`. Le client construit son `srcset` ; l'original (`fileUrl`) reste la plus grande entrée. **Reste** : AVIF (encodage coûteux, gated libheif/aom — util format-paramétrable prêt) ; variantes pour images E2EE (côté client) ; `prisma generate` + type-check/jest gateway en CI (non exécutables dans ce container). |
| **D5** Dédup média content-addressed | stockage par hash (SHA256) → 1 seule copie des fichiers identiques. |
| **D6** TTS à la demande, pas broadcast N langues | ne synthétiser/pousser l'audio que pour les langues réellement consommées. |

## Phase E — SDK iOS
| Item | Détail |
|---|---|
| **E1** Garantir `Accept-Encoding: br, gzip` | ✅ **Vérifié + verrouillé**. Contre-intuitif : il NE FAUT PAS poser le header à la main — `URLSession` annonce gzip/br et décompresse automatiquement ; le poser bascule en décompression manuelle (Foundation ne décode pas brotli nativement) → la sortie `@fastify/compress` arriverait encore compressée. `APIClient` ne pose aucun `Accept-Encoding` (donc gzip/br déjà actifs) ; commentaire anti-régression ajouté (jamais l'ajouter ici/`ClientInfoProvider`/headers per-request). |
| **E3** Consommer `?languages=` | 🟡 **Building block SDK livré, activation app à faire**. `MessageService.list/listBefore/listAfter/listAround` acceptent un param opaque `languages: [String]?` → sérialisé `?languages=fr,en` (miroir gateway A3, filtre texte + audio). Non-breaking : `nil`/vide = toutes langues ; overloads 4-arg/5-arg conservent tous les call sites existants ; 3 mocks conformes mis à jour ; 4 tests SDK (sérialisation, omission nil/vide, plumbing listAfter). **Reste (activation)** : `ConversationViewModel` passe `preferredLanguages` (set Prisme) aux call sites — diffère car implique un refetch on-language-switch et rend l'exploration d'une langue hors-Prisme on-demand (validation produit on-device requise). |
| **E2** Décodage sélectif traductions | ↪ **Largement subsumé par E3** : avec `?languages=` actif, le serveur n'envoie que les langues du Prisme, donc le ViewModel ne décode/stocke que celles-ci. Reste optionnel : filtrer aussi quand `?languages=` absent (gain mémoire marginal). |
| **E4** Compression upload client | déjà partiel (`MediaCompressor`) ; étendre à l'audio (Opus encode avant upload). À faire. |

> ⚠️ **Non builé dans ce container** : pas de toolchain Swift/Xcode. Les changements suivent exactement le pattern `includeTranslations` existant (prouvé) ; `./apps/ios/meeshy.sh test` + build SDK tournent en CI/local.

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
