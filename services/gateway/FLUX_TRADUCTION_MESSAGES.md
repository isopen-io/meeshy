# Flux de traduction des messages texte

## Vue d'ensemble

Les messages texte (sans attachement) suivent un flux différent des messages audio. Voici la chaîne complète :

```
User envoie message
    ↓
Gateway: MessageTranslationService
    ↓
ZMQ PUSH (port 5555) → type: 'translation'
    ↓
Translator: TranslationHandler
    ↓
Translation Pool Manager
    ↓
Workers Pool (3-25 workers)
    ↓
TranslationService.translate()
    ↓
ZMQ PUB (port 5558) → type: 'translation_completed'
    ↓
Gateway: MessageTranslationService._handleTranslationCompleted()
    ↓
Sauvegarde DB + notification utilisateurs
```

---

## 📤 Étape 1 : Gateway reçoit le message

### Route HTTP POST
**Fichier** : `src/routes/conversations/messages.ts`

Quand un utilisateur envoie un message texte via l'API REST :

```typescript
POST /api/v1/conversations/:conversationId/messages
{
  "content": "Bonjour tout le monde",
  "originalLanguage": "fr",
  "conversationId": "abc123",
  "senderId": "user123"
}
```

### MessageTranslationService.handleNewMessage()
**Fichier** : `src/services/message-translation/MessageTranslationService.ts:107-186`

```typescript
async handleNewMessage(messageData: MessageData) {
  // 1. Skip si E2EE
  if (messageData.encryptionMode === 'e2ee') {
    return { status: 'e2ee_skipped' };
  }

  // 2. Sauvegarder en DB
  const savedMessage = await this._saveMessageToDatabase(messageData);

  // 3. Traiter les traductions en asynchrone
  setImmediate(async () => {
    await this._processTranslationsAsync(savedMessage);
  });

  return { messageId: savedMessage.id, status: 'message_saved' };
}
```

---

## 📋 Étape 2 : Extraction des langues cibles

### MessageTranslationService._processTranslationsAsync()
**Fichier** : `src/services/message-translation/MessageTranslationService.ts:315-377`

```typescript
private async _processTranslationsAsync(message, targetLanguage?, modelType?) {
  // 1. DÉTERMINER LES LANGUES CIBLES
  let targetLanguages: string[];

  if (targetLanguage) {
    // Langue spécifiée explicitement
    targetLanguages = [targetLanguage];
  } else {
    // Extraire depuis les participants de la conversation
    targetLanguages = await this._extractConversationLanguages(conversationId);
  }

  // 2. FILTRER pour éviter traductions inutiles (ex: fr → fr)
  const filtered = targetLanguages.filter(lang =>
    lang !== message.originalLanguage
  );

  if (filtered.length === 0) return;  // Rien à traduire

  // 3. DÉTERMINER LE MODEL TYPE
  // Priorité: paramètre > message > auto (< 80 chars = medium, >= 80 = premium)
  const finalModelType = modelType
    || message.modelType
    || (message.content.length < 80 ? 'medium' : 'premium');

  // 4. ENVOYER VIA ZMQ
  const request: TranslationRequest = {
    messageId: message.id,
    text: message.content,
    sourceLanguage: message.originalLanguage,
    targetLanguages: filtered,
    conversationId: message.conversationId,
    modelType: finalModelType
  };

  const taskId = await this.zmqClient.sendTranslationRequest(request);
}
```

### Comment les langues cibles sont extraites ?
**Fichier** : `src/services/message-translation/MessageTranslationService.ts:475-555`

```typescript
private async _extractConversationLanguages(conversationId: string): Promise<string[]> {
  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId },
    include: {
      user: {
        select: { preferredLanguage: true }
      }
    }
  });

  // Extraire les langues préférées des participants
  const languages = participants
    .map(p => p.user.preferredLanguage)
    .filter(Boolean);

  // Dédupliquer
  return [...new Set(languages)];
}
```

**Exemple** :
- Conversation avec 3 participants
- User A préfère `fr`
- User B préfère `en`
- User C préfère `es`
- → targetLanguages = `['fr', 'en', 'es']`

Si User A (fr) envoie un message :
- Filtré pour exclure `fr` (langue source)
- → Traduction vers `['en', 'es']`

---

## 🚀 Étape 3 : Envoi vers Translator via ZMQ

### ZmqRequestSender.sendTranslationRequest()
**Fichier** : `src/services/zmq-translation/ZmqRequestSender.ts:58-98`

```typescript
async sendTranslationRequest(request: TranslationRequest): Promise<string> {
  const taskId = randomUUID();

  const requestMessage = {
    type: 'translation',  // ← Type explicite ajouté dans corrections
    taskId: taskId,
    messageId: request.messageId,
    text: request.text,
    sourceLanguage: request.sourceLanguage,
    targetLanguages: request.targetLanguages,
    conversationId: request.conversationId,
    modelType: request.modelType || 'basic',
    timestamp: Date.now()
  };

  // Envoyer via PUSH socket (port 5555)
  await this.connectionManager.send(requestMessage);

  return taskId;
}
```

**Format ZMQ** :
- **Single frame** (pas multipart comme audio)
- JSON encodé en UTF-8
- Via socket PUSH connecté au port 5555

---

## 🔄 Étape 4 : Translator reçoit et route la requête

### ZMQTranslationServer._handle_translation_request_multipart()
**Fichier** : `src/services/zmq_server_core.py:248-278`

```python
async def _handle_translation_request_multipart(self, frames):
    # Parser le JSON
    request_data = json.loads(frames[0].decode('utf-8'))
    request_type = request_data.get('type', 'translation')

    # Router selon le type
    if request_type == 'translation':
        await self.translation_handler._handle_translation_request_multipart(frames)
    elif request_type == 'audio_process':
        await self.audio_handler._handle_audio_process_request(request_data)
    # ... autres types
```

### TranslationHandler._handle_translation_request_multipart()
**Fichier** : `src/services/zmq_translation_handler.py:218-299`

```python
async def _handle_translation_request_multipart(self, frames):
    request_data = json.loads(frames[0].decode('utf-8'))
    message_type = request_data.get('type', None)

    # Validation
    if message_type == 'translation' or message_type is None:
        if not request_data.get('text') or not request_data.get('targetLanguages'):
            logger.warning("Requête invalide")
            return

    # Vérifier longueur du message
    message_text = request_data.get('text', '')
    if not can_translate_message(message_text):  # Max 10000 chars
        await self._send_translation_skipped(request_data)
        return

    # Créer la tâche de traduction
    task = TranslationTask(
        task_id=str(uuid.uuid4()),
        message_id=request_data.get('messageId'),
        text=message_text,
        source_language=request_data.get('sourceLanguage', 'fr'),
        target_languages=request_data.get('targetLanguages', []),
        conversation_id=request_data.get('conversationId'),
        model_type=request_data.get('modelType', 'basic')
    )

    # Enfiler dans le pool approprié
    success = await self.pool_manager.enqueue_task(task)

    if not success:
        # Pool pleine
        await self._send_translation_error(task, 'pool full')
```

---

## ⚙️ Étape 5 : Translation Pool Manager

### Architecture du pool
**Fichier** : `src/services/zmq_pool/zmq_pool_manager.py`

Le pool manager gère deux pools de workers :

1. **Normal Pool** (langues "normales")
   - Langues : en, fr, es, de, it, pt, nl, pl, ru, ja, ko, zh, ar
   - Workers : 3-25 (scaling dynamique)
   - Prioritaire pour les langues courantes

2. **Any Pool** (langues rares)
   - Toutes les autres langues
   - Workers : 2-12
   - Pour langues moins fréquentes

### Enqueue task
```python
async def enqueue_task(self, task: TranslationTask) -> bool:
    # Déterminer le pool approprié
    if all(lang in NORMAL_LANGUAGES for lang in task.target_languages):
        pool = self.normal_pool
    else:
        pool = self.any_pool

    # Enfiler la tâche
    return await pool.enqueue(task)
```

### Workers processing
Chaque worker tourne en boucle :

```python
async def _worker_loop(pool_name: str):
    while running:
        # Récupérer une tâche depuis la queue
        task = await queue.get()

        # Traiter la tâche
        await process_translation_task(task)

        queue.task_done()
```

---

## 🧠 Étape 6 : Traduction ML

### TranslationProcessor.process_single_translation()
**Fichier** : `src/services/zmq_pool/translation_processor.py:22-85`

```python
async def process_single_translation(
    task: TranslationTask,
    target_language: str,
    translation_service: Any,
    pub_socket: Any,
    cache_service: Any = None
):
    try:
        # 1. Vérifier le cache Redis (si disponible)
        if cache_service:
            cached = await cache_service.get_translation(
                text=task.text,
                source_lang=task.source_language,
                target_lang=target_language,
                model_type=task.model_type
            )
            if cached:
                # Cache hit !
                await _publish_result(pub_socket, task, target_language, cached)
                return

        # 2. Traduire avec le modèle ML
        result = await translation_service.translate_with_structure(
            text=task.text,
            source_lang=task.source_language,
            target_lang=target_language,
            model_type=task.model_type
        )

        # 3. Mettre en cache (si disponible)
        if cache_service:
            await cache_service.set_translation(
                text=task.text,
                source_lang=task.source_language,
                target_lang=target_language,
                model_type=task.model_type,
                translation=result.translated_text,
                ttl=86400  # 24h
            )

        # 4. Publier le résultat
        await _publish_result(pub_socket, task, target_language, result)

    except Exception as e:
        logger.error(f"Erreur traduction: {e}")
        await _publish_error(pub_socket, task, target_language, str(e))
```

### TranslationService.translate_with_structure()
**Fichier** : `src/services/translation_ml/translation_service.py:248-290`

```python
async def translate_with_structure(
    self,
    text: str,
    source_lang: str,
    target_lang: str,
    model_type: str = 'basic'
) -> TranslationResult:
    # Obtenir le modèle approprié
    translator = self._get_translator(model_type)

    if not translator:
        raise ValueError(f"Modèle {model_type} non disponible")

    # Traduire
    translated_text = await translator.translate(
        text=text,
        source_lang=source_lang,
        target_lang=target_lang
    )

    return TranslationResult(
        translated_text=translated_text,
        source_language=source_lang,
        target_language=target_lang,
        model_type=model_type,
        confidence=0.95
    )
```

**Modèles disponibles** :
- `basic` : Helsinki NLP Opus MT (rapide, léger)
- `medium` : Facebook M2M100 (bon équilibre)
- `premium` : Facebook NLLB-200 (haute qualité, 200 langues)

---

## 📡 Étape 7 : Publication du résultat

### Format du résultat
**ZMQ PUB (port 5558) → Gateway SUB**

```python
result_message = {
    'type': 'translation_completed',
    'taskId': task.task_id,
    'messageId': task.message_id,
    'conversationId': task.conversation_id,
    'sourceLanguage': task.source_language,
    'targetLanguage': target_language,
    'translatedText': result.translated_text,
    'modelType': task.model_type,
    'confidence': result.confidence,
    'cached': False,  # True si depuis cache Redis
    'processingTimeMs': 234,
    'timestamp': time.time()
}

await pub_socket.send(json.dumps(result_message).encode('utf-8'))
```

---

## 💾 Étape 8 : Gateway sauvegarde et notifie

### MessageTranslationService._handleTranslationCompleted()
**Fichier** : `src/services/message-translation/MessageTranslationService.ts:571-633`

```typescript
private async _handleTranslationCompleted(data: {
  taskId: string;
  messageId: string;
  targetLanguage: string;
  translatedText: string;
  sourceLanguage: string;
  modelType: string;
  conversationId: string;
}) {
  try {
    // 1. Vérifier si déjà traité (déduplication)
    if (this.processedTasks.has(data.taskId)) {
      return;
    }
    this.processedTasks.add(data.taskId);

    // 2. Chiffrer si conversation E2EE serveur
    let finalText = data.translatedText;
    const shouldEncrypt = await this._shouldEncryptTranslation(data.messageId);

    if (shouldEncrypt.shouldEncrypt) {
      const encKey = await this._getConversationEncryptionKey(conversationId);
      finalText = await this._encryptTranslation(data.translatedText, encKey);
    }

    // 3. Sauvegarder en DB
    const translation = await prisma.messageTranslation.create({
      data: {
        messageId: data.messageId,
        sourceLanguage: data.sourceLanguage,
        targetLanguage: data.targetLanguage,
        translatedText: finalText,
        modelType: data.modelType,
        status: 'completed'
      }
    });

    // 4. Notifier les utilisateurs via WebSocket
    await this._notifyTranslationComplete(data);

    this.stats.incrementTranslationsCompleted();

  } catch (error) {
    logger.error(`Erreur sauvegarde traduction: ${error}`);
  }
}
```

### Notification WebSocket
**Via Socket.IO** :

```typescript
socket.to(`conversation:${conversationId}`).emit('translation:completed', {
  messageId: data.messageId,
  targetLanguage: data.targetLanguage,
  translatedText: data.translatedText
});
```

---

## 🔍 Optimisations

### 1. Cache Redis
**Évite les retraductions identiques**

- Clé : `translation:${hash(text)}:${sourceLang}:${targetLang}:${modelType}`
- TTL : 24h
- Hit rate typique : ~30-40%

### 2. Scaling dynamique
**Ajuste le nombre de workers selon la charge**

```python
# Scaling UP si queue > 50% capacité
if queue_size > max_size * 0.5:
    add_workers(2)

# Scaling DOWN si idle > 30s
if idle_time > 30:
    remove_workers(2)
```

### 3. Batch processing
**Groupe plusieurs traductions similaires**

```python
# Si 5+ requêtes pour même langue cible
if len(pending_tasks_for_lang) >= 5:
    results = await translate_batch(texts, source, target)
```

### 4. Filtrage intelligent
**Évite traductions inutiles**

- Langue source = langue cible → skip
- Message E2EE → skip translation
- Message trop long (>10K chars) → skip

---

## 📊 Métriques disponibles

### Gateway stats
```typescript
const stats = messageTranslationService.getStats();
// {
//   messagesSaved: 1234,
//   requestsSent: 5678,
//   translationsCompleted: 5432,
//   translationsFailed: 12,
//   errors: 3
// }
```

### Translator stats
```bash
GET http://localhost:8000/health/stats
```

```json
{
  "normal_workers": 8,
  "any_workers": 3,
  "normal_queue_size": 12,
  "any_queue_size": 2,
  "total_tasks_processed": 45678,
  "cache_hit_rate": 0.38
}
```

---

## 🧪 Test complet du flux

### 1. Envoyer un message via API

```bash
curl -X POST https://gate.meeshy.local/api/v1/conversations/abc123/messages \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Bonjour, comment allez-vous ?",
    "originalLanguage": "fr"
  }'
```

### 2. Surveiller les logs Gateway

```bash
tmux attach -t meeshy:gateway
```

**Logs attendus** :
```
[GATEWAY] 🔍 PRÉPARATION ENVOI PUSH:
[GATEWAY]    📋 taskId: 12345-67890
[GATEWAY]    📋 messageId: msg_abc
[GATEWAY]    📋 text: "Bonjour, comment allez-vous ?"
[GATEWAY]    📋 sourceLanguage: fr
[GATEWAY]    📋 targetLanguages: [en, es]
[GATEWAY]    🎨 modelType: medium
[GATEWAY] 📤 [ZMQ-Client] Commande PUSH envoyée
```

### 3. Surveiller les logs Translator

```bash
tmux attach -t meeshy:translator
```

**Logs attendus** :
```
[TRANSLATOR] 🔧 Tâche créée: 12345-67890 pour abc123 (2 langues)
[TRANSLATOR] 📝 Détails: texte='Bonjour, comment allez-vous ?...', source=fr, target=['en', 'es'], modèle=medium
[WORKER-3] 🔄 Traduction: fr → en (medium)
[WORKER-3] ✅ Traduction terminée: "Hello, how are you?" (234ms)
[WORKER-5] 🔄 Traduction: fr → es (medium)
[WORKER-5] ✅ Traduction terminée: "Hola, ¿cómo estás?" (187ms)
```

### 4. Vérifier en DB

```typescript
const translations = await prisma.messageTranslation.findMany({
  where: { messageId: 'msg_abc' }
});

console.log(translations);
// [
//   { targetLanguage: 'en', translatedText: 'Hello, how are you?', status: 'completed' },
//   { targetLanguage: 'es', translatedText: 'Hola, ¿cómo estás?', status: 'completed' }
// ]
```

---

## ⚠️ Cas particuliers

### Messages E2EE
**Skip traduction côté serveur**

```typescript
if (message.encryptionMode === 'e2ee') {
  return { status: 'e2ee_skipped' };
}
```

### Messages trop longs
**Max 10,000 caractères**

```python
if len(text) > MessageLimits.MAX_TRANSLATION_LENGTH:
    return translation_skipped_event()
```

### Pool pleine
**Erreur si queue saturée**

```python
if queue.full():
    return translation_error_event('pool full')
```

### Langue source = cible
**Filtré automatiquement**

```typescript
const filtered = targetLanguages.filter(lang =>
  lang !== message.originalLanguage
);
```

---

## 🔗 Liens avec audio

**Différences clés** :

| Aspect | Messages texte | Messages audio |
|--------|---------------|----------------|
| **Type ZMQ** | `translation` | `audio_process` |
| **Format** | Single frame JSON | Multipart (JSON + Binary) |
| **Handler** | TranslationHandler | AudioHandler |
| **Pipeline** | Translation Pool | AudioMessagePipeline |
| **Résultat** | `translation_completed` | `audio_process_completed` |
| **Cache** | Redis (texte) | Aucun |
| **Workers** | 3-25 | N/A (séquentiel) |

**Point commun** :
- Même architecture ZMQ PUSH/PULL + PUB/SUB
- Même Gateway ZmqTranslationClient
- Résultats publiés sur même socket SUB

---

## ✅ Checklist de validation

- [x] Type `'translation'` explicite dans requête ✓
- [x] TranslationHandler reçoit et route correctement ✓
- [x] TranslationTask créée avec tous les champs ✓
- [x] Pool manager enqueue dans le bon pool ✓
- [x] Workers traitent les tâches ✓
- [x] TranslationService.translate() appelé ✓
- [x] Résultat publié via PUB socket ✓
- [x] Gateway reçoit via SUB socket ✓
- [x] Sauvegarde en DB réussie ✓
- [x] Notification WebSocket envoyée ✓

---

**Le système de traduction texte est ENTIÈREMENT FONCTIONNEL !** 🎉
