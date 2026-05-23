# Analyse Bande Passante Interne — Translator & Gateway

**Date**: 2026-05-21  
**Scope**: ZMQ Gateway↔Translator, pipeline audio, caching, MongoDB, stockage audio

---

## Synthèse Executive

Le transport ZMQ entre Gateway et Translator est **globalement sain** : les audios transitent en frames binaires multipart (pas de base64 sur ce chemin). Cependant, plusieurs inefficacités significatives subsistent, notamment la **re-transcription systématique des audios traduits** (Whisper lancé sur chaque sortie TTS), la **traduction vers TOUTES les langues de la conversation** sans tenir compte des préférences individuelles `translateToSystemLanguage`/`translateToRegionalLanguage`, le **TTS systématique sans demande client**, les **logs verbeux embarqués dans chaque frame JSON ZMQ**, et la **sérialisation base64 des Chatterbox conditionals** dans le profil vocal sortant du Translator.

---

## PROBLÈMES PAR ORDRE DE SÉVÉRITÉ

---

### [P1 — CRITIQUE] TTS Systématique pour toutes les langues à chaque message audio

**Fichier**: `services/translator/src/services/audio_pipeline/audio_message_pipeline.py:500-591`  
**Fichier**: `services/translator/src/services/audio_pipeline/translation_stage.py:551-588`

**Description**: Pour chaque message audio reçu, le pipeline génère automatiquement un fichier TTS (Chatterbox, voix clonée) pour **chaque langue cible de la conversation**. Il n'y a aucun mécanisme de "lazy TTS" : si une conversation a 5 participants avec 3 langues distinctes, 3 fichiers TTS sont générés pour chaque message audio, même si aucun des destinataires n'écoute en ce moment ou ne clique sur "écouter traduit".

```python
# translation_stage.py:551-588 — TTS inconditionnelle
tts_result = await self.tts_service.synthesize_with_conditionals(...)
# OU
tts_result = await self.tts_service.synthesize_with_voice(...)
# OU
tts_result = await self.tts_service.synthesize(...)
```

**Bandwidth saved**: Un fichier TTS MP3 de 10 secondes ~ 160 KB. Pour 3 langues × 100 messages/heure = 48 MB/heure de TTS inutile si personne n'écoute. En production à charge (10k messages audio/jour) : potentiellement plusieurs GB/jour de TTS non demandé.

**Sévérité**: CRITIQUE — Le TTS est l'opération la plus coûteuse du pipeline (GPU intensif, 1-5s par génération). Générer du TTS pour des utilisateurs absents ou ne désirant pas l'audio traduit est un gaspillage pur.

**Fix recommandé**: Implémenter un modèle "TTS à la demande" (lazy). Le pipeline produit uniquement la **traduction texte** + la **transcription**. Un endpoint REST dédié `POST /api/v1/attachments/:id/tts?lang=fr` déclenche la génération TTS via ZMQ uniquement quand le client appuie sur "écouter". Le fichier généré est mis en cache Redis (30 jours via `AudioCacheService`). Les clients iOS/Web demandent la version texte d'abord et chargent l'audio traduit à la demande.

---

### [P1 — CRITIQUE] Re-transcription Whisper systématique de chaque audio TTS produit

**Fichier**: `services/translator/src/services/audio_pipeline/translation_stage.py:590-668`  
**Fichier**: `services/translator/src/services/audio_pipeline/retranscription_service.py:26-141`

**Description**: Après chaque génération TTS, le service lance **systématiquement une re-transcription Whisper** de l'audio TTS produit pour obtenir des timestamps "fins" (`fine_segments`). Cela signifie que Whisper est exécuté **deux fois par langue cible** : une fois sur l'audio source (pour transcrire l'original), et une fois sur chaque audio TTS généré.

```python
# translation_stage.py:592-610 — Re-transcription après TTS
fine_segments = None
if tts_result.audio_path and os.path.exists(tts_result.audio_path):
    fine_segments = await retranscribe_translated_audio(
        audio_path=tts_result.audio_path,
        target_language=target_lang,
        turns_metadata=turns_metadata
    )
```

La retranscription relance Whisper (via `transcription_service.transcribe`) en désactivant temporairement la diarisation, puis remappe les speakers par timestamps.

**Bandwidth saved**: Pas directement de bande passante réseau, mais **CPU/GPU massif** (≈ 1-3s Whisper par langue) + surcharge du pipeline. Avec 3 langues cibles, Whisper tourne 4 fois (1 source + 3 TTS). Ce coût CPU se traduit indirectement en latence et capacité réduite.

**Sévérité**: CRITIQUE — La re-transcription TTS produit des timestamps sur un texte **connu** (le texte traduit est exactement `translated_text`). Il est possible de calculer les timestamps de manière déterministe à partir de la durée totale du TTS et du nombre de mots, sans relancer Whisper. Ou si des timestamps précis sont requis, le TTS peut exposer ses propres timestamps internes (certains modèles TTS les fournissent nativement).

**Fix recommandé**: Supprimer la re-transcription systématique. Générer un segment unique `{text: translated_text, startMs: 0, endMs: duration_ms}` en fallback. Si des timestamps mot-à-mot sont absolument nécessaires, utiliser les timestamps natifs du modèle TTS. La re-transcription Whisper d'un audio TTS (généré à partir du même texte) est redondante et coûteuse.

---

### [P1 — CRITIQUE] Traduction vers TOUTES les langues sans vérifier les préférences individuelles

**Fichier**: `services/gateway/src/services/message-translation/MessageTranslationService.ts:600-690`

**Description**: La méthode `_extractConversationLanguages` collecte `systemLanguage` et `regionalLanguage` de **tous** les participants actifs, sans vérifier les champs de préférence individuelle `translateToSystemLanguage` et `translateToRegionalLanguage` (présents dans le schéma Prisma). De plus, elle traduit vers ces langues **indépendamment de la présence en ligne** des utilisateurs. Un utilisateur avec `translateToRegionalLanguage = false` génère quand même une traduction vers sa `regionalLanguage`.

```typescript
// MessageTranslationService.ts:651-656 — Ignore translateToSystemLanguage/Regional
if (participant.user.systemLanguage) {
  languages.add(participant.user.systemLanguage);
}
if (participant.user.regionalLanguage) {
  languages.add(participant.user.regionalLanguage);
}
// translateToSystemLanguage et translateToRegionalLanguage NON VÉRIFIÉS
```

**Bandwidth saved**: Si 30% des utilisateurs ont désactivé une traduction secondaire, cela représente une économie de ~30% des requêtes NLLB envoyées au Translator. Dans une conversation de 10 personnes avec 4 langues distinctes, réduire à 2-3 langues actives = économie de 25-50% des ZMQ push.

**Sévérité**: CRITIQUE — Gaspillage CPU sur le Translator, latence allongée, et violation des préférences utilisateurs (traduire quand l'utilisateur a dit de ne pas le faire).

**Fix recommandé**: Dans `_extractConversationLanguages`, lire `participant.user.translateToSystemLanguage` et `participant.user.translateToRegionalLanguage` (champs Prisma déjà modélisés selon CLAUDE.md) et ne collecter la langue que si le flag correspondant est `true` (ou `null` = défaut actif).

---

### [P2 — ÉLEVÉ] Sérialisation base64 des Chatterbox Conditionals dans le profil vocal

**Fichier**: `services/translator/src/services/audio_pipeline/audio_message_pipeline.py:823-843`  
**Fichier**: `services/gateway/src/services/message-translation/MessageTranslationService.ts:1030-1033`

**Description**: Les `chatterbox_conditionals` (tenseurs PyTorch pré-calculés) sont sérialisés en base64 dans le JSON metadata du ZMQ (`newVoiceProfile.chatterbox_conditionals_base64`), tandis que les audios traduits et l'embedding vocal sont correctement transmis en frames binaires multipart. Ce champ peut faire plusieurs centaines de KB en base64.

```python
# audio_message_pipeline.py:824-826 — base64 pour les conditionals
if hasattr(voice_model, 'chatterbox_conditionals_bytes') and voice_model.chatterbox_conditionals_bytes:
    conditionals_base64 = base64.b64encode(voice_model.chatterbox_conditionals_bytes).decode('utf-8')
```

```typescript
// MessageTranslationService.ts:1030-1033 — décodage base64 côté gateway
if (nvp.chatterbox_conditionals_base64) {
    const chatterboxBufferRaw = Buffer.from(nvp.chatterbox_conditionals_base64, 'base64');
```

**Bandwidth saved**: Les conditionals Chatterbox sont typiquement 50-200 KB binaires. En base64, cela représente 67-267 KB. En passant ces données en frame binaire multipart comme l'embedding vocal (déjà correctement implémenté pour ce dernier), on économise ~33% sur ce champ.

**Sévérité**: ÉLEVÉ — Overhead base64 de 33% sur un champ volumineux, alors que le mécanisme multipart est déjà en place pour l'embedding.

**Fix recommandé**: Ajouter un frame binaire supplémentaire dans `_publish_audio_result` pour les conditionals Chatterbox, en suivant le même pattern que l'embedding vocal (déjà géré avec `binaryFrames_info['embedding']`). Côté Gateway, lire depuis `data._chatterboxConditionalsBinary` au lieu de décoder base64.

---

### [P2 — ÉLEVÉ] VoiceProfileAnalyzeRequest : audio en base64 dans le JSON ZMQ

**Fichier**: `services/gateway/src/services/zmq-translation/types.ts:383-413`  
**Fichier**: `services/gateway/src/services/VoiceProfileService.ts:185-244`

**Description**: Les requêtes `voice_profile_analyze` et `voice_profile_verify` transmettent l'audio en base64 dans le champ `audio_data` du JSON ZMQ, contrairement aux requêtes `audio_process` qui utilisent le multipart binaire. Un enregistrement de 30 secondes pour créer un profil vocal ~ 1-3 MB en binaire = 1.3-4 MB en base64.

```typescript
// types.ts:387-388 — audio base64 dans JSON
export interface VoiceProfileAnalyzeRequest {
  audio_data: string;  // base64 — gaspillage 33%
  audio_format: string;
}
```

```typescript
// VoiceProfileService.ts:234-235 — conversion base64
const audioBuffer = await fs.readFile(fullPath);
const audioData = audioBuffer.toString('base64');
```

**Bandwidth saved**: Pour un enregistrement de profil vocal de 30s : économie de ~33% = 0.3 à 1 MB par création de profil. Si 100 utilisateurs créent leur profil/jour : 30-100 MB économisés.

**Sévérité**: ÉLEVÉ — Incohérence avec le reste du pipeline (qui utilise correctement le multipart) et gaspillage 33% systématique.

**Fix recommandé**: Étendre `ZmqRequestSender.sendVoiceProfileRequest` pour accepter un `Buffer` audio optionnel et l'envoyer en frame binaire multipart, similaire à `sendAudioProcessRequest`. Le champ `audio_data` du JSON devient vide/omis.

---

### [P2 — ÉLEVÉ] Logs verbeux inclus dans chaque requête ZMQ (overhead JSON)

**Fichier**: `services/gateway/src/services/zmq-translation/ZmqRequestSender.ts:80-103`

**Description**: Le `ZmqRequestSender` génère entre 8 et 15 lignes de `logger.info` par requête, dont certains incluent une sérialisation complète du payload JSON (`message=${JSON.stringify(requestMessage)}`). À 100k messages/seconde (objectif Meeshy), cela représente un overhead CPU de logging non négligeable.

```typescript
// ZmqRequestSender.ts:101 — JSON.stringify dans chaque log
logger.info(`📤 [ZMQ-Client] Commande PUSH envoyée: taskId=${taskId}, ..., message=${JSON.stringify(requestMessage)}`);
```

De plus, `ZmqRequestSender.ts:230-311` génère ~15 lignes de logs `ZMQ-TRACE` pour chaque requête de transcription, incluant les 50 premiers caractères de l'audio base64.

**Bandwidth saved**: Pas de bande passante réseau directement, mais réduction significative de la charge CPU et des I/O disque du logging (le service log dans `translator.log` en mode fichier en plus de stdout).

**Sévérité**: ÉLEVÉ — À haute charge (100k msg/s), le coût CPU des `JSON.stringify` et des écritures de log dans chaque hot path est significatif.

**Fix recommandé**: Passer tous ces logs de trace à `logger.debug` (désactivés en production via `LOG_LEVEL=INFO`). Supprimer le `JSON.stringify(requestMessage)` du log INFO.

---

### [P3 — MODÉRÉ] TTL trop court pour le cache traduction Gateway (1h vs 30j Translator)

**Fichier**: `services/gateway/src/services/TranslationCache.ts:15`  
**Fichier**: `services/translator/src/services/redis_service.py:346`

**Description**: La `TranslationCache` côté Gateway (cache Redis des traductions texte pour les requêtes REST) utilise un TTL de **3600 secondes (1 heure)**. Côté Translator, le `TranslationCacheService` utilise un TTL de **2592000 secondes (30 jours)**. Cette asymétrie signifie que les traductions expirées au Gateway seront re-demandées au Translator, qui les trouvera dans son cache Redis de 30 jours — donc re-émises sans Whisper/NLLB mais avec overhead ZMQ inutile.

```typescript
// TranslationCache.ts:15 — 1 heure seulement
private readonly TTL = 3600;
```

```python
# redis_service.py:346 — 30 jours cohérent
self.ttl_translation = int(os.getenv("TRANSLATION_CACHE_TTL", "2592000"))
```

**Bandwidth saved**: Une traduction textuelle répétée (même texte, même langue) qui était en cache Gateway évite un aller-retour ZMQ complet. Avec un TTL de 7 jours au lieu de 1h, le hit-rate augmente significativement pour les messages répétés courants ("ok", "merci", etc.).

**Sévérité**: MODÉRÉ — L'impact dépend du volume de messages répétés. Le Gateway dispose aussi d'un cache mémoire `TranslationCache` (LRU 1000 entrées) qui est conservé en mémoire process, ce qui atténue partiellement le problème.

**Fix recommandé**: Aligner le TTL Redis du Gateway avec le Translator : passer de 3600s à 604800s (7 jours). Les traductions texte sont des mappings déterministes (même texte → même traduction) et peuvent être cached beaucoup plus longtemps.

---

### [P3 — MODÉRÉ] Cache mémoire de traduction Gateway sans TTL d'expiration (LRU pur)

**Fichier**: `services/gateway/src/services/message-translation/TranslationCache.ts`

**Description**: Le cache LRU mémoire interne à `MessageTranslationService` (`TranslationCache`, 1000 entrées) utilise une éviction LRU pure sans TTL. Une entrée peut rester en mémoire indéfiniment si elle est fréquemment consultée, même si la traduction sous-jacente a été mise à jour (re-traduction avec un meilleur modèle). Il n'y a pas de mécanisme d'invalidation.

```typescript
// TranslationCache.ts:9-11 — pas de TTL
export class TranslationCache {
  private cache: Map<string, TranslationResult> = new Map();
  private readonly maxSize: number;
  // PAS de TTL, PAS d'expiration
}
```

**Bandwidth saved**: Impact indirect : risque de servir des traductions stales si un message est re-traduit avec un meilleur modèle.

**Sévérité**: MODÉRÉ — Ce n'est pas un problème de bande passante directe mais peut causer des re-traductions inutiles lorsque la Gateway redémarre (cache vide).

**Fix recommandé**: Ajouter un TTL optionnel (ex: 1 heure) par entrée dans `TranslationCache`, ou utiliser le `TranslationCache` Redis existant comme source principale et réduire la taille du cache mémoire à 200 entrées.

---

### [P3 — MODÉRÉ] Double sauvegarde de l'audio traduit (cache Redis + fichier local)

**Fichier**: `services/translator/src/services/redis_service.py:617-666`  
**Fichier**: `services/translator/src/services/audio_pipeline/translation_stage.py:660-668`

**Description**: Chaque audio TTS généré est mis en cache dans Redis (`AudioCacheService.set_translated_audio`) **ET** écrit dans un fichier local (`/app/uploads/translated/`). La structure de cache Redis contient le `audio_path` et non les bytes (conforme), mais le système lit les bytes depuis le disque à chaque cache-hit pour les encoder en base64 avant de les envoyer en frame binaire multipart.

```python
# translation_stage.py:360-364 — re-lecture fichier à chaque cache-hit
with open(cached_audio_path, 'rb') as f:
    audio_bytes = f.read()
audio_data_base64 = base64.b64encode(audio_bytes).decode('utf-8')
```

**Bandwidth saved**: Pas de gaspillage réseau direct, mais I/O disque redondantes et encodage base64 inutile (voir P4 ci-dessous).

**Sévérité**: MODÉRÉ — L'encodage base64 intermédiaire dans `_load_cached_audio` est ensuite **décodé** dans `_publish_audio_result` pour recréer les bytes binaires. C'est un aller-retour base64 inutile.

**Fix recommandé**: Dans `_load_cached_audio`, retourner les bytes directement sans passer par base64 intermédiaire, en stockant le résultat dans `audio_bytes` directement au lieu de `audio_data_base64`.

---

### [P3 — MODÉRÉ] Whisper en mode full-file (pas de streaming)

**Fichier**: `services/translator/src/services/transcription_service.py:527-551`

**Description**: `faster-whisper` est appelé sur le fichier audio complet avec `vad_filter=True`. Il n'y a pas de streaming (traitement par chunks). Cela est techniquement justifié car `faster-whisper` optimise lui-même la découpe via VAD, mais cela signifie que **tout le fichier audio doit être disponible localement** avant le début de la transcription.

La transcription utilise `word_timestamps=return_timestamps` qui est **toujours `True`** (paramètre par défaut). Les timestamps mot-à-mot génèrent environ 3-5x plus de données dans la réponse de Whisper que la transcription seule.

```python
# transcription_service.py:321 — return_timestamps toujours True par défaut
async def transcribe(self, audio_path: str, ..., return_timestamps: bool = True):
```

**Bandwidth saved**: Désactiver les timestamps mot-à-mot quand ils ne sont pas nécessaires (transcription-only sans diarisation) économise 60-80% de la taille des segments retournés. Les segments Whisper avec timestamps peuvent faire 5-10x la taille du texte pur.

**Sévérité**: MODÉRÉ — Les timestamps sont utiles pour la diarisation et la synchronisation, mais pas toujours nécessaires (ex: transcription simple pour affichage texte).

**Fix recommandé**: Permettre à l'appelant de spécifier explicitement `return_timestamps=False` pour les cas transcription-only simples (pas de diarisation requise). Déjà architecturalement possible, pas toujours utilisé.

---

### [P4 — FAIBLE] Stockage audio : local filesystem, pas de CDN ni S3

**Fichier**: `services/gateway/src/services/storage/MediaStorage.ts`  
**Fichier**: `services/gateway/src/services/VoiceProfileService.ts:140`

**Description**: Les fichiers audio (originaux et traduits) sont stockés dans `UPLOAD_PATH` (volume Docker local, `/app/uploads`). Le code mentionne explicitement une migration vers S3/MinIO/Cloudflare R2 comme évolution prévue, mais non encore implémentée. Les clients téléchargent les fichiers via le Gateway qui sert directement depuis le disque.

```typescript
// MediaStorage.ts:9-10 — évolution prévue mais pas implémentée
//   2. MinIO Docker (S3-compatible, single-host) → `S3CompatibleMediaStorage`
//   3. Cloudflare R2 / AWS S3 (production) → same `S3CompatibleMediaStorage`
```

**Bandwidth saved**: Avec S3/CDN, les fichiers audio seraient servis depuis des edges proches des clients (CDN), réduisant la latence et déchargeant la bande passante sortante du Gateway. Économie estimée : 60-80% de la bande passante sortante audio.

**Sévérité**: FAIBLE pour la bande passante interne (hors scope principal), mais **ÉLEVÉ** pour la scalabilité et les coûts de bande passante externe.

**Fix recommandé**: Implémenter `S3CompatibleMediaStorage` (interface déjà définie) et générer des URLs présignées (ex: 1 heure d'expiration) côté Gateway. Les clients accèdent directement au stockage objet sans passer par le Gateway.

---

### [P4 — FAIBLE] Pas de compression ZMQ

**Fichier**: `services/gateway/src/services/zmq-translation/ZmqConnectionManager.ts:42-69`  
**Fichier**: `services/translator/src/services/zmq_server_core.py`

**Description**: Les sockets ZMQ utilisent le transport TCP par défaut sans compression. ZeroMQ ne propose pas de compression native au niveau socket, mais des options comme `ZMQ_TCP_KEEPALIVE` et des bibliothèques de compression applicative (snappy, lz4, zstd) peuvent être ajoutées manuellement sur les frames JSON.

Les frames JSON de metadata (Frame 0) contiennent les segments de transcription qui peuvent être volumineux (longs messages avec diarisation multi-speakers). Ces frames JSON pourraient bénéficier d'une compression légère (zstd).

**Bandwidth saved**: Pour les frames JSON contenant des segments volumineux (>10KB), zstd offre typiquement 60-70% de compression. Impact estimé : 100-200 KB/message complexe → 30-60 KB.

**Sévérité**: FAIBLE — La communication Gateway↔Translator est en loopback (même réseau Docker), donc la latence réseau est négligeable. La compression aurait plus d'impact sur la consommation mémoire des buffers ZMQ que sur la latence.

**Fix recommandé**: Optionnel. Si les frames JSON dépassent régulièrement 50KB, ajouter une compression zstd applicative sur Frame 0 uniquement (les frames binaires audio étant déjà compressés nativement par MP3).

---

### [P4 — FAIBLE] Requête Prisma "find + update" pour chaque traduction (2 requêtes)

**Fichier**: `services/gateway/src/services/message-translation/MessageTranslationService.ts:2644-2671`

**Description**: La méthode `_saveTranslationToDatabase` effectue systématiquement 2 requêtes MongoDB :
1. `findUnique({ select: { translations: true } })` — lire le JSON actuel
2. `update({ data: { translations: ... } })` — écrire le JSON mis à jour

Ce pattern est nécessaire car MongoDB ne supporte pas le merge atomique d'un champ JSON imbriqué directement. Cependant, avec les translations stockées dans un champ JSON (`Message.translations`), une approche MongoDB native (`$set` partiel sur le sous-document) permettrait une opération atomique en 1 requête.

```typescript
// MessageTranslationService.ts:2645-2671 — 2 requêtes par traduction
const message = await this.prisma.message.findUnique({ where: { id: result.messageId }, select: { translations: true } });
// ... modification locale du JSON ...
await this.prisma.message.update({ where: { id: result.messageId }, data: { translations: translations as any } });
```

**Bandwidth saved**: En passant à un `$set` MongoDB avec dot notation (`translations.fr`), on élimine la lecture et on réduit le payload de la requête d'écriture (envoyer seulement la nouvelle entrée, pas tout le JSON translations). Économie estimée : 50% des requêtes MongoDB pour les traductions.

**Sévérité**: FAIBLE-MODÉRÉ — À 100k messages/s avec chacun potentiellement N traductions, cela représente 200k requêtes MongoDB/s vs 100k avec l'optimisation.

**Fix recommandé**: Utiliser `prisma.$runCommandRaw` avec `$set: { "translations.fr": {...} }` pour une mise à jour atomique sans lecture préalable.

---

### [P4 — FAIBLE] Cache langage conversation (5 min) — risque de traductions obsolètes

**Fichier**: `services/gateway/src/services/message-translation/MessageTranslationService.ts:77`

**Description**: Le `LanguageCache` garde les langues cibles d'une conversation en mémoire pendant **5 minutes**. Si un nouvel utilisateur rejoint une conversation et a une langue différente, ses messages ne seront pas traduits dans sa langue pendant jusqu'à 5 minutes.

```typescript
// MessageTranslationService.ts:77 — TTL 5 minutes
this.languageCache = new LanguageCache(5 * 60 * 1000, 100);
```

**Bandwidth saved**: Pas d'impact direct, mais risque de sur-traduction (anciennes langues présentes dans le cache après qu'un utilisateur a quitté) ou sous-traduction (nouvelle langue non détectée pendant 5 minutes).

**Sévérité**: FAIBLE — Le cache est invalide au maximum 5 minutes, ce qui est acceptable pour la plupart des cas d'usage.

**Fix recommandé**: Invalider le `LanguageCache` pour une conversation lors d'un événement participant join/leave (Socket.IO). Déjà facilement réalisable via `this.languageCache.delete(conversationId)` dans les handlers correspondants.

---

## TABLEAU RÉCAPITULATIF

| ID | Fichier | Description | Bandwidth/CPU saved | Sévérité |
|----|---------|-------------|---------------------|----------|
| P1 | `translation_stage.py:551-588` | TTS systématique sans demande client | GPU ×N langues par message | CRITIQUE |
| P1 | `translation_stage.py:590-668` + `retranscription_service.py` | Re-transcription Whisper sur chaque audio TTS | CPU ×N Whisper passes par message | CRITIQUE |
| P1 | `MessageTranslationService.ts:651-656` | Traduction vers TOUTES les langues (ignore préférences individuelles) | ~30-50% ZMQ push en moins | CRITIQUE |
| P2 | `audio_message_pipeline.py:823-843` | Chatterbox conditionals en base64 dans JSON | -33% sur 50-200 KB | ÉLEVÉ |
| P2 | `types.ts:387-388` + `VoiceProfileService.ts:234-235` | Audio voix profil en base64 dans JSON ZMQ | -33% sur 1-3 MB audio | ÉLEVÉ |
| P2 | `ZmqRequestSender.ts:80-103` | Logs verbeux + JSON.stringify dans hot path | CPU logging à haute charge | ÉLEVÉ |
| P3 | `TranslationCache.ts:15` | TTL 1h vs 30j Translator (asymétrie) | Re-ZMQ inutiles | MODÉRÉ |
| P3 | `TranslationCache.ts` (LRU) | Cache mémoire Gateway sans TTL | Staleness | MODÉRÉ |
| P3 | `translation_stage.py:360-364` | base64 intermédiaire sur cache-hit audio | CPU encode/decode inutile | MODÉRÉ |
| P3 | `transcription_service.py:321` | `word_timestamps=True` systématique | -60-80% taille segments | MODÉRÉ |
| P4 | `MediaStorage.ts` | Stockage local filesystem (pas S3/CDN) | 60-80% bande passante sortante | FAIBLE (scalabilité) |
| P4 | `ZmqConnectionManager.ts` | Pas de compression ZMQ | -60-70% frames JSON volumineux | FAIBLE |
| P4 | `MessageTranslationService.ts:2644-2671` | 2 requêtes Prisma par traduction | -50% requêtes MongoDB traduction | FAIBLE |
| P4 | `MessageTranslationService.ts:77` | LanguageCache 5min non invalidé sur join/leave | Sur/sous-traduction temporaire | FAIBLE |

---

## POINTS POSITIFS CONSTATÉS

Les éléments suivants sont **correctement implémentés** :

1. **Audio source → Translator en multipart binaire** : `ZmqRequestSender.sendAudioProcessRequest` charge le fichier audio en Buffer et le transmet en frame binaire ZMQ. Pas de base64. ✅
2. **Audios TTS → Gateway en multipart binaire** : `zmq_audio_handler._publish_audio_result` construit des frames binaires pour chaque audio traduit. ✅
3. **Embedding vocal transmis en multipart binaire** : Encodé base64 pour le transit JSON initial, puis converti en frame binaire (`binaryFrames_info['embedding']`). ✅
4. **Cache Redis 30 jours sur les traductions texte** : `TranslationCacheService` avec TTL adapté et lookup par hash SHA-256 cross-conversation. ✅
5. **Cache Redis audio hash-based cross-conversation** : `AudioCacheService` indexé par hash SHA-256 du contenu audio, permettant de réutiliser transcription/TTS pour le même audio dans des conversations différentes. ✅
6. **Déduplication des messages** : `processedMessages` et `processedTasks` dans `MessageTranslationService` évitent les doubles traitements. ✅
7. **Cache-first pour les traductions** : `_processTranslationsAsync` vérifie le cache mémoire puis DB avant d'envoyer au Translator. ✅
8. **Transcription progressive (Phase 1 avant Phase 2)** : La transcription est envoyée au client avant la fin de la traduction/TTS via callback `on_transcription_ready`. ✅
9. **Voice profile embedding transmis sans base64 dans le JSON final** : L'embedding est dans un frame binaire séparé, seule la metadata JSON contient `profileId`, `qualityScore`, etc. ✅
10. **Translation via targetLanguages fourni par Gateway** : Le Translator ne détermine pas les langues lui-même (sauf fallback `["en"/"fr"]`), la Gateway envoie la liste. ✅
