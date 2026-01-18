# Persistance du Modèle de Transcription

**Date** : 2026-01-18
**Commit** : ba6421f7f

---

## ✅ Questions Résolues

### 1. Est-ce que la gateway persiste la transcription ?

**OUI** ✅

La gateway persiste **toutes** les transcriptions dans MongoDB via le modèle `MessageAudioTranscription`.

**Preuve dans les logs** :
```
✅ Transcription sauvegardée (fr)
⏱️ Persistance transcription terminée en 64ms
```

**Code** : `MessageTranslationService.ts:966-988`

### 2. Le modèle est-il persisté ?

**OUI (maintenant)** ✅

Avant ce commit, le champ `model` existait dans le schéma Prisma mais n'était jamais peuplé.

**Maintenant** :
- Translator retourne `model: "whisper_boost"` dans la réponse ZMQ
- Gateway sauvegarde ce champ dans MongoDB
- Valeur par défaut : `"whisper_boost"` si non fourni

### 3. whisper_boost est-il le modèle par défaut ?

**OUI** ✅

Le nom canonique du modèle Whisper est maintenant `"whisper_boost"`.

---

## 🔄 Pipeline Complet

```
┌─────────────────────────────────────────────────────────────┐
│ 1. WHISPER (Python)                                         │
│    - Transcrit avec le modèle Whisper large-v3             │
│    - Retourne TranscriptionResult avec model="whisper_boost"│
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. ZMQ HANDLER (Python)                                     │
│    - Sérialise en JSON avec champ "model"                  │
│    - Fallback: model or 'whisper_boost'                    │
│    - Publie via ZMQ PUB socket                             │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. GATEWAY (TypeScript)                                     │
│    - Reçoit TranscriptionCompletedEvent avec model         │
│    - Fallback: model || 'whisper_boost'                    │
│    - Upsert dans messageAudioTranscription                 │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. MONGODB                                                  │
│    Collection: messageAudioTranscription                    │
│    Champ: model: "whisper_boost"                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 📝 Changements Appliqués

### Python (Translator)

#### 1. `transcription_service.py:323`
```python
# AVANT
model=f"whisper-{self.model_size}",  # "whisper-large-v3"

# APRÈS
model="whisper_boost",  # Nom canonique du modèle
```

#### 2. `zmq_transcription_handler.py:320`
```python
'transcription': {
    'text': result.text,
    'language': result.language,
    'confidence': result.confidence,
    'durationMs': result.duration_ms,
    'source': result.source,
    'model': result.model or 'whisper_boost',  # ← NOUVEAU
    'segments': segments_dict
}
```

### TypeScript (Gateway)

#### 3. `types.ts:151,225`
```typescript
// TranscriptionData
export interface TranscriptionData {
  text: string;
  language: string;
  confidence: number;
  source: 'mobile' | 'whisper';
  model?: string;  // ← NOUVEAU
  segments?: Array<{ text: string; startMs: number; endMs: number }>;
}

// TranscriptionCompletedEvent
transcription: {
  text: string;
  language: string;
  confidence: number;
  durationMs: number;
  source: string;
  model?: string;  // ← NOUVEAU
  segments?: Array<{ text: string; startMs: number; endMs: number }>;
}
```

#### 4. `MessageTranslationService.ts:973,984`
```typescript
// Dans l'upsert
update: {
  transcribedText: data.transcription.text,
  language: data.transcription.language,
  confidence: data.transcription.confidence,
  source: data.transcription.source,
  model: data.transcription.model || 'whisper_boost',  // ← NOUVEAU
  segments: data.transcription.segments || null,
  audioDurationMs: data.transcription.durationMs || attachment.duration || 0
},
create: {
  attachmentId: data.attachmentId,
  messageId: data.messageId,
  transcribedText: data.transcription.text,
  language: data.transcription.language,
  confidence: data.transcription.confidence,
  source: data.transcription.source,
  model: data.transcription.model || 'whisper_boost',  // ← NOUVEAU
  segments: data.transcription.segments || null,
  audioDurationMs: data.transcription.durationMs || attachment.duration || 0
}
```

---

## 🗄️ Schéma MongoDB

### Collection: `messageAudioTranscription`

```prisma
model MessageAudioTranscription {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  attachmentId    String   @unique @db.ObjectId
  messageId       String   @db.ObjectId
  transcribedText String
  language        String
  confidence      Float
  source          String
  model           String?  // ← "whisper_boost"
  segments        Json?
  audioDurationMs Int
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

### Exemple de document

```javascript
{
  "_id": "696a9365bac4a21532927f3a",
  "attachmentId": "696947ea46d132d2c65153ba",
  "messageId": "msg_123",
  "transcribedText": "Oui, oui, oui, j'ai bien reçu tous les documents...",
  "language": "fr",
  "confidence": 0.94,
  "source": "whisper",
  "model": "whisper_boost",  // ← NOUVEAU CHAMP
  "segments": [
    {"text": "Oui, oui, oui,", "startMs": 0, "endMs": 1200, "confidence": 0.96},
    {"text": "j'ai bien reçu tous les documents,", "startMs": 1200, "endMs": 3500, "confidence": 0.93}
  ],
  "audioDurationMs": 5100,
  "createdAt": "2026-01-18T18:46:23.000Z"
}
```

---

## 🎯 Bénéfices

### 1. Traçabilité
- Chaque transcription indique quel modèle l'a produite
- Facilite le debugging et l'analyse de qualité
- Permet de comparer les performances entre modèles

### 2. Support Multi-Modèles
- Infrastructure prête pour ajouter d'autres modèles Whisper
- Facile d'ajouter "whisper_turbo", "whisper_precision", etc.
- Frontend peut sélectionner le modèle souhaité

### 3. Analytics
- Statistiques par modèle
- Mesure de la qualité (confidence moyenne par modèle)
- Optimisation du choix de modèle selon les langues

### 4. Cohérence
- Nom canonique uniforme : "whisper_boost"
- Utilisé partout : Python, TypeScript, MongoDB, Frontend
- Pas de confusion entre "whisper-large-v3" et "whisper_boost"

---

## 🔮 Futur : Support Frontend

Le frontend peut être étendu pour permettre la sélection du modèle :

```typescript
// Dans le hook use-audio-translation.ts
const requestTranscription = async (options?: {
  useLocalTranscription?: boolean;
  model?: 'whisper_boost' | 'whisper_turbo' | 'whisper_precision';
}) => {
  const response = await apiService.post(
    `/attachments/${attachmentId}/transcribe`,
    {
      async: true,
      model: options?.model || 'whisper_boost'  // Défaut
    }
  );
};
```

Actuellement, le frontend ne passe pas de modèle, donc le fallback `'whisper_boost'`
est toujours utilisé (comportement attendu).

---

## ✅ Validation

Après `make start-network`, vérifier qu'une nouvelle transcription contient :

```bash
# MongoDB query
db.messageAudioTranscription.findOne(
  {},
  { model: 1, source: 1, transcribedText: 1 }
).sort({ createdAt: -1 })

# Résultat attendu :
{
  "model": "whisper_boost",
  "source": "whisper",
  "transcribedText": "..."
}
```

---

## 📊 Résumé

| Question | Statut | Détail |
|----------|--------|--------|
| Transcriptions persistées ? | ✅ OUI | MongoDB via messageAudioTranscription |
| Modèle persisté ? | ✅ OUI | Champ `model` maintenant peuplé |
| whisper_boost par défaut ? | ✅ OUI | Fallback partout dans le code |
| Frontend envoie modèle ? | ⏭️ FUTUR | Possible mais pas encore implémenté |

**Tout est prêt pour `make start-network` !** 🚀
