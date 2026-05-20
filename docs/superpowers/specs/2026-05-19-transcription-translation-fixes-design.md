# Design — Fiabilité transcription & traduction des messages

Date : 2026-05-19
Statut : Design révisé (post-revue Opus) — prêt pour planification
Auteur : J. Charles N. M. (+ Claude)

## 1. Contexte

Diagnostic production (2026-05-19) sur les 270 pièces jointes audio en base :

| État | Nb | Détail |
|------|----|--------|
| ✅ Transcription correcte | 64 | — |
| ❌ Segments-stubs vides | 4 | `text` correct, mais 19/40/47/79 segments tous `{text:"", startMs:0, endMs:0, confidence:null}` |
| ❌ Objet `transcription` à texte vide | 8 | `confidence:0.6947…`, souvent micro-audios |
| ❌ Aucun champ `transcription` | 194 | transcription jamais persistée |

Symptôme utilisateur : « certains audios n'affichent pas de transcription ». De plus, les boutons « Traduire » du menu Langue d'un message ne produisent **rien** — ni sur les audios, ni sur les textes.

Incident résolu en amont de ce design : le conteneur `meeshy-translator` était gelé (deadlock, CPU 0 %, ~1 h 30, health check en échec). Redémarré → production rétablie. La cause du deadlock n'est **pas** couverte ici (suivi séparé — voir §9).

## 2. Périmètre

5 chantiers : 4 correctifs de bugs root-causés + 1 fonctionnalité.

**Hors-scope** (explicite) :
- Les 194 audios sans champ `transcription` — non root-causés (données legacy pré-fonctionnalité ou perte ZMQ). Récupération non demandée.
- Script de re-transcription en masse — l'utilisateur a choisi la récupération **à la demande** (décision #2).
- Abonnement socket live des traductions dans `MessageDetailSheet` — les correctifs C/D s'appuient sur la réponse HTTP synchrone, pas sur un flux socket.
- Cause du deadlock translator — suivi séparé (§9).
- Refactor du type ambigu `TranscriptionStageResult.segments` (`List[Dict] | List[TranscriptionSegment]`) — on corrige le consommateur bugué, on ne refait pas le type.

## 3. Décisions de conception

- **#1 — « Traduire » sur un message audio** = traduction audio **complète** (transcription + traduction + TTS → audio traduit jouable), via `POST /attachments/:id/translate`.
- **#2 — Récupération des 206 audios cassés** = **à la demande**. Le chantier B réaffiche les 4 audios à segments-stubs instantanément ; les autres se rattrapent via le bouton de re-transcription (chantier E) quand un utilisateur ouvre l'audio. Aucun script de masse.
- **#3 — Persistance des traductions texte** = on s'appuie sur le chemin REST `/translate-blocking` (chantier D) ; l'appel socket `onRequestTranslation` redondant est supprimé pour éviter la double persistance.

## 4. Les 5 chantiers

### Chantier A — Translator : sérialisation des segments dict-safe

**Cause racine (confirmée, un seul sérialiseur)** : `services/translator/src/services/zmq_audio_handler.py`, méthode `_publish_transcription_result` (événement `transcription_ready`), sérialiseur de segments aux lignes ~622-633, utilise `getattr(seg, 'text', '')`. `getattr` lit des attributs d'objet, jamais des clés de dict. Sur un cache-hit, `TranscriptionStageResult.segments` contient des **dicts** (issus de `_get_cached_transcription`, `transcription_stage.py:328` ; le cache Redis stocke des dicts camelCase via `_cache_transcription` lignes 388-399). Ce `TranscriptionStageResult` brut est passé au callback `on_transcription_ready` (`audio_message_pipeline.py:424`) **avant** toute normalisation. `getattr(dict, 'text', '')` → `''` pour chaque segment → stubs. L'événement `transcription_ready` est publié au gateway ; `_handleTranscriptionReady` (`MessageTranslationService.ts`) persiste et **écrase** le champ `transcription` de l'attachment en MongoDB.

**Preuve** : les 4 audios touchés ont tous `transcription.source == "cache"` en base de production → confirme le chemin cache-hit. Ils n'ont jamais reçu d'événement `audio_process_completed` correct ensuite (translation/TTS interrompue — cohérent avec l'incident deadlock) ; le `transcription_ready` bugué est donc resté l'état final.

Le cache Redis contient des données **correctes** — c'est l'émetteur qui les lit mal. **Aucune purge de cache nécessaire.**

**Périmètre exact du correctif** :
- **Le seul vrai bug** : le sérialiseur `_publish_transcription_result` (`zmq_audio_handler.py` ~622-633).
- **Durcissement défensif** : `_cache_transcription` (`transcription_stage.py:388`) utilise `seg.text` nu — aujourd'hui appelé uniquement avec des dataclasses, mais fragile ; à sécuriser par cohérence.
- **Non concernés, ne pas toucher** : `audio_process_completed` (`zmq_audio_handler.py:516-527`) et les segments traduits (lignes 444-456) sont **déjà dict-safe** ; `zmq_transcription_handler.py` (chemin `transcription_only`) n'utilise **aucun cache** et reçoit toujours des dataclasses fraîches → non bugué.

**Correctif** : extraire un helper unique `_segment_to_dict(seg)` dict-or-object safe (pattern `seg.text if hasattr(seg,'text') else seg.get('text','')`, identique au sérialiseur déjà correct lignes 516-527) et l'employer dans le sérialiseur bugué `_publish_transcription_result` + en durcissement dans `_cache_transcription`.

**Tests (pytest)** : `_segment_to_dict` avec un dict puis une dataclass → valeurs identiques préservées ; `_publish_transcription_result` alimenté de segments dict → `text`/`startMs`/`endMs` non vides.

### Chantier B — iOS : fallback sur le texte quand les segments sont vides (transcription ET audio traduit)

**Cause racine** : `AudioPlayerView.displaySegments` (`packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift:279-297`) construit les segments via `TranscriptionDisplaySegment.buildFrom` (`MediaTypes.swift:184-195`) qui mappe 1:1 sans filtrer. Un tableau de N segments à texte vide reste **non-vide** → le fallback « si vide, synthétiser un segment depuis le texte complet » est sauté → la bande de transcription rend N lignes blanches.

**Correctif** :
1. Dans `buildFrom`, filtrer les segments dont le texte est vide/whitespace. Si tous les segments sont vides, le tableau résultant est vide → le fallback se déclenche.
2. **Branche transcription originale** (`displaySegments` lignes ~287-296) : le fallback existant sur `transcription.text` s'active alors automatiquement.
3. **Branche audio traduit** (`displaySegments` lignes ~280-283) : actuellement `buildFrom(segments: translated.segments)` **sans aucun fallback**. Ajouter un fallback symétrique : si `buildFrom` renvoie `[]`, synthétiser un segment depuis `translated.transcription` (`MessageTranslatedAudio.transcription`, `TranscriptionModels.swift:44`). Sans cela, le chantier B introduirait une **régression** (bande blanche) sur les audios traduits à segments-stubs.

**Bénéfice immédiat** : les 4 audios à segments-stubs déjà en base réaffichent leur transcription correcte (leur `text` est intact) sans aucune re-transcription.

**Tests (MeeshyUI)** : `buildFrom` segments tous vides → `[]` ; mélange vide/plein → ne garde que les pleins ; `displaySegments` transcription originale à segments vides + `text` non vide → 1 segment plein ; `displaySegments` audio traduit à segments vides + `translated.transcription` non vide → 1 segment plein.

### Chantier C — « Traduire » sur un message audio → traduction audio complète

**Cause racine** : `MessageDetailSheet.translateTo` (`apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift:668`) commence par `guard !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }`. Un message audio a `content` vide (le texte est dans `transcription`) → abandon silencieux.

**Mécanisme réel de l'endpoint** : `POST /attachments/:id/translate` (`services/gateway/src/routes/attachments/translation.ts`) est **synchrone par défaut** (`async:false`). Il exécute traduction + TTS via `AudioTranslateService.translateSync` et **renvoie le résultat dans le corps de la réponse HTTP** (`data.translations`). Il **n'émet PAS** l'événement socket `audio:translation-ready` (cet événement provient d'un chemin distinct, le pipeline `message:send-with-attachments`). Body attendu : `{ targetLanguages: [lang], sourceLanguage?, generateVoiceClone? }`. Auth : middleware unifié — utilisateurs inscrits **et** anonymes authentifiés passent le gate ; ce sont les checks de consentement qui filtrent.

**Correctif** (décision #1) :
- SDK : ajouter `AttachmentService.translate(attachmentId:targetLanguages:sourceLanguage:generateVoiceClone:)` → `POST /attachments/:id/translate`. Le retour décode `data.translations` (forme `messageAttachmentSchema` / résultats de traduction audio).
- App : dans `MessageDetailSheet.languageRow`, la branche « non traduit » détecte un message audio (`transcription` non nil) et appelle le nouveau service avec `transcription.attachmentId`. **Au retour HTTP**, l'app fusionne `data.translations` dans son état local `translatedAudios` et sélectionne la langue — pas d'attente d'événement socket.
- **Consentement** : l'endpoint renvoie **403** avec `error` + `requiredConsents` si l'utilisateur n'a pas `canTranscribeAudio` / `canTranslateAudio` (ou le consentement voice-cloning si `generateVoiceClone`). L'app doit décoder ce 403 et afficher un message explicite (idéalement renvoyer vers l'écran de consentement). Sans ce traitement, l'action échouerait silencieusement pour les utilisateurs sans consentement.
- UI : spinner pendant la requête (la traduction audio + TTS peut prendre plusieurs dizaines de secondes — voir risque §7).

**Tests** : SDK — `AttachmentService.translate` POST le bon endpoint + body ; décodage de la réponse ; décodage du 403/`requiredConsents`. App — la branche audio de `languageRow` invoque le service audio (mock), fusionne le résultat, gère le 403.

### Chantier D — « Traduire » sur un message texte → passer `messageId`

**Cause racine** : `TranslateRequest` (`packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift:185`) n'a que `text`, `source_language`, `target_language` — ni `message_id` ni `conversation_id`. `/translate-blocking` sans `message_id` part en branche « nouveau message » qui exige `conversation_id` → **HTTP 400 systématique** (`services/gateway/src/routes/translation.ts:430-435`). Le 400 lève une erreur avalée par `MessageDetailSheet.swift:696` `catch { HapticFeedback.error() }` — aucun retour visible. Le schema Zod et le schema Fastify acceptent **déjà** `message_id`.

**Correctif** :
- SDK : ajouter un champ optionnel `messageId` (clé JSON `message_id`) à `TranslateRequest` ; `TranslationService.translate` accepte `messageId`.
- App : `translateTo` passe `message.id` → le gateway route en branche « retraduction » (Case 1, `translation.ts:315`) qui n'exige ni `text` ni `conversation_id`, persiste et diffuse via `message:translation`.
- App : **supprimer** l'appel socket `onRequestTranslation?(message.id, targetLang)` (`MessageDetailSheet.swift:694`) — il déclenche une seconde persistance redondante (décision #3). Le chemin REST Case 1 persiste et diffuse déjà.
- App : surfacer l'échec — ajouter un `@State translationError: String?` à `MessageDetailSheet`, affiché de façon discrète dans l'onglet Langue ; le bloc `catch` le renseigne.
- Gateway : aucun changement.

**Tests** : SDK — `TranslateRequest` encode `message_id` quand fourni, l'omet sinon. App — `translateTo` en succès peuple `translations` ; en échec renseigne `translationError` ; aucun appel `onRequestTranslation` résiduel.

### Chantier E — Bouton de re-transcription (indépendant de A)

**Indépendance** : la re-transcription passe par `transcription_only` → `transcribeAttachment` → `sendTranscriptionOnlyRequest` → `zmq_transcription_handler`, qui **n'utilise aucun cache** et reçoit toujours des dataclasses fraîches. Ce chemin n'est **pas** affecté par le bug du chantier A. E peut être livré et testé seul.

**Backend** : `POST /attachments/:id/transcribe` court-circuite et renvoie la transcription existante quand elle existe (`services/gateway/src/routes/attachments/translation.ts:418-429`). Ajouter un flag optionnel `force` (body `{ force: true }`) qui saute ce court-circuit et envoie toujours une requête ZMQ `transcription_only` fraîche.

**SDK** : `AttachmentService.requestTranscription(attachmentId:force:)` — paramètre `force` (défaut `false`), envoyé dans le body.

**UI (MeeshyUI)** : `AudioPlayerView` — ajouter `onRetranscribe: (() -> Void)?`. Rendre un petit bouton « Re-transcrire » (`arrow.clockwise`) dans `transcriptionFooterRow` (sous une transcription existante) et dans la branche état-vide. Style aligné sur le bouton « Transcrire » existant (spinner pendant la requête, `disabled` pendant).

**App** : câbler `onRetranscribe` à travers `AudioMediaView` → `BubbleStandardLayout.mediaStandaloneView` / `BubbleAttachmentView` → le callback appelle `AttachmentService.requestTranscription(attachmentId:force:true)`. Le résultat revient via le socket `audio:transcription-ready` → `messageTranscriptions` se met à jour, la bulle se re-rend.

**Tests** : Gateway — `force:true` saute le court-circuit, `force` absent/false conserve le comportement actuel. SDK — `force` présent dans le body. MeeshyUI — le bouton rend sous une transcription et invoque le callback.

## 5. Fichiers touchés

- **Translator** : `zmq_audio_handler.py`, `audio_pipeline/transcription_stage.py` (+ tests pytest).
- **Gateway** : `routes/attachments/translation.ts`, `routes/attachments/types.ts` (+ tests).
- **SDK `MeeshySDK`** : `Services/AttachmentService.swift`, `Services/TranslationService.swift`, `Services/ServiceModels.swift` (+ tests).
- **SDK `MeeshyUI`** : `Media/AudioPlayerView.swift`, `Media/MediaTypes.swift` (+ tests).
- **App** : `Components/MessageDetailSheet.swift`, `Views/ConversationMediaViews.swift`, `Views/Bubble/BubbleStandardLayout.swift`, `Views/Bubble/BubbleAttachmentView.swift` (+ tests XCTest).

Règle repo : toute modification de models/types/UI réutilisables va dans `packages/MeeshySDK/`, jamais directement dans `apps/ios/`.

## 6. Stratégie de test (TDD)

Chaque chantier suit RED → GREEN → REFACTOR : test en échec d'abord. pytest (translator), Jest/Vitest (gateway), Swift Testing/XCTest (SDK), XCTest (app). `./apps/ios/meeshy.sh test` doit passer avant tout commit iOS ; `pytest tests/` pour le translator ; `tsc` + tests pour le gateway.

## 7. Risques

- **A** : le helper dict-safe est sur le chemin chaud — la TDD couvre les deux formes (dict + dataclass) pour ne pas régresser le cas dataclass frais.
- **B** : ne pas masquer des segments à pause légitime — on ne filtre que le texte vide/whitespace, jamais un segment à texte réel. La branche audio traduit doit recevoir son fallback (sinon régression).
- **C — durée** : `POST /attachments/:id/translate` synchrone exécute un TTS, qui peut prendre plusieurs dizaines de secondes. La requête HTTP doit autoriser un timeout généreux ; si la latence se révèle trop longue pour une requête HTTP maintenue, basculer vers `async:true` + polling de statut (à traiter en planification / suivi). Le serveur déduplique déjà les langues déjà traduites (`AttachmentTranslateService`), donc pas de sur-protection côté client nécessaire.
- **E** : un `force` re-transcription spammé pourrait re-saturer le translator — bouton désactivé pendant la requête en cours.

## 8. Ordre d'implémentation suggéré

1. **A** (translator dict-safe) — corrige la cause racine serveur.
2. **B** (iOS displaySegments + fallback symétrique) — réaffiche les 4 audios stub immédiatement ; indépendant de A.
3. **E** (backend `force` → SDK → UI) — bouton de re-transcription ; indépendant de A et B.
4. **D** (texte) — `TranslateRequest.messageId`, suppression de l'appel socket redondant, erreur visible.
5. **C** (audio) — `AttachmentService.translate`, lecture de la réponse HTTP, gestion du 403 consentement, branche audio du menu.

A, B et E sont indépendants ; A et B sont à fort impact immédiat → en premier.

## 9. Suivi séparé

- **Deadlock translator** : le gel du conteneur `meeshy-translator` (CPU 0 %, ~1 h 30) n'est pas root-causé. Un translator qui peut se bloquer sans auto-récupération est une faille de fiabilité. À tracer comme incident/ticket dédié (cause du deadlock + health-check avec restart automatique).
