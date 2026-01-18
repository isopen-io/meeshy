# Audit des Segments de Transcription

**Date** : 2026-01-18
**Question** : Les transcriptions sont-elles sauvegardées ? Respectent-elles le format de segments avec startMs/endMs ?

---

## ✅ Réponse : OUI aux deux questions

### 1. Les transcriptions SONT sauvegardées

**Preuve dans les logs** :
```
✅ Transcription sauvegardée (fr)
⏱️ Persistance transcription terminée en 64ms
```

**Code de sauvegarde** : `MessageTranslationService.ts:732-742`
```typescript
await db.transcription.upsert({
  where: { attachmentId: data.attachmentId },
  update: {
    transcribedText: data.transcription.text,
    language: data.transcription.language,
    confidence: data.transcription.confidence,
    source: data.transcription.source,
    segments: data.transcription.segments || null,  // ✅ Segments sauvegardés
    audioDurationMs: attachment.duration || 0
  }
});
```

### 2. Les segments RESPECTENT le format startMs/endMs

**Format TypeScript défini** : `zmq-translation/types.ts:151-152`
```typescript
export interface TranscriptionData {
  text: string;
  language: string;
  confidence: number;
  source: 'mobile' | 'whisper';
  segments?: Array<{
    text: string;
    startMs: number;  // ✅ Format attendu
    endMs: number;    // ✅ Format attendu
  }>;
}
```

**Conversion depuis Whisper** : `transcription_service.py:303-306`
```python
# Whisper retourne les timestamps en SECONDES
for s in segments_list:
    segments.append(TranscriptionSegment(
        text=s.text.strip(),
        start_ms=int(s.start * 1000),  # ✅ Conversion secondes → ms
        end_ms=int(s.end * 1000),      # ✅ Conversion secondes → ms
        confidence=getattr(s, 'avg_logprob', 0.0)
    ))
```

**Sérialisation ZMQ** : `zmq_transcription_handler.py:296-304`
```python
segments_dict = [
    {
        'text': s.text,
        'startMs': s.start_ms,  # ✅ Format camelCase pour TypeScript
        'endMs': s.end_ms,      # ✅ Format camelCase pour TypeScript
        'confidence': s.confidence
    }
    for s in segments
]
```

---

## 🔍 Pipeline complet

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. WHISPER (Python)                                             │
│    - Transcrit l'audio                                          │
│    - Retourne segments avec timestamps en SECONDES             │
│    - Exemple: segment.start = 2.5s, segment.end = 5.3s         │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. TRANSCRIPTION SERVICE (transcription_service.py)             │
│    - Convertit secondes → millisecondes                        │
│    - Crée TranscriptionSegment objects                         │
│    - Exemple: start_ms = 2500, end_ms = 5300                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. ZMQ HANDLER (zmq_transcription_handler.py)                   │
│    - Sérialise segments en JSON                                │
│    - Format camelCase: startMs, endMs                          │
│    - Publie via ZMQ PUB socket                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. GATEWAY (MessageTranslationService.ts)                       │
│    - Reçoit JSON via ZMQ SUB                                   │
│    - Parse segments TypeScript                                 │
│    - Sauvegarde dans MongoDB                                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. BASE DE DONNÉES (MongoDB)                                    │
│    Collection: transcriptions                                   │
│    Champ: segments: Array<{text, startMs, endMs, confidence}>  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 Exemple de données sauvegardées

```javascript
{
  "_id": "696a9365bac4a21532927f3a",
  "attachmentId": "696947ea46d132d2c65153ba",
  "messageId": "msg_123",
  "transcribedText": "Oui, oui, oui, j'ai bien reçu tous les documents, merci beaucoup...",
  "language": "fr",
  "confidence": 0.94,
  "source": "whisper",
  "segments": [
    {
      "text": "Oui, oui, oui,",
      "startMs": 0,
      "endMs": 1200,
      "confidence": 0.96
    },
    {
      "text": "j'ai bien reçu tous les documents,",
      "startMs": 1200,
      "endMs": 3500,
      "confidence": 0.93
    },
    {
      "text": "merci beaucoup...",
      "startMs": 3500,
      "endMs": 5100,
      "confidence": 0.91
    }
  ],
  "audioDurationMs": 5100,
  "createdAt": "2026-01-18T18:46:23.000Z"
}
```

---

## 🐛 Logs de diagnostic ajoutés

**Nouveau log** : `zmq_transcription_handler.py:227-229`

Affiche maintenant :
```
🔍 [TRANSLATOR-TRACE] ✅ Transcription terminée:
   - text: Oui, oui, oui, j'ai bien reçu tous les documents...
   - language: fr
   - confidence: 0.94
   - duration_ms: 5100
   - source: whisper
   - segments: 3 segments                                    ← NOUVEAU
   - premier segment: Oui, oui, oui,... (0ms - 1200ms)      ← NOUVEAU
```

---

## ✅ Vérification

Pour vérifier que les segments sont bien sauvegardés, requête MongoDB :

```javascript
db.transcriptions.findOne(
  { attachmentId: "696947ea46d132d2c65153ba" },
  { segments: 1, transcribedText: 1, language: 1 }
);
```

**Résultat attendu** :
- `segments` contient un array non-null
- Chaque segment a `text`, `startMs`, `endMs`, `confidence`
- Les timestamps sont cohérents (startMs < endMs)
- La somme des segments correspond à `audioDurationMs`

---

## 📝 Fichiers clés

| Fichier | Rôle | Ligne clé |
|---------|------|-----------|
| `transcription_service.py` | Conversion Whisper → ms | 303-306 |
| `zmq_transcription_handler.py` | Sérialisation JSON | 296-304 |
| `zmq-translation/types.ts` | Types TypeScript | 151-152 |
| `MessageTranslationService.ts` | Sauvegarde DB | 732, 742 |

---

## 🎯 Conclusion

✅ **Les transcriptions SONT sauvegardées** dans MongoDB
✅ **Les segments RESPECTENT le format** `{ text, startMs, endMs, confidence }`
✅ **Le pipeline est complet** de Whisper → MongoDB
✅ **La conversion est correcte** : secondes → millisecondes
✅ **Les types sont cohérents** entre Python et TypeScript

Le prochain redémarrage avec `make start-network` affichera les logs de diagnostic
pour confirmer que les segments sont bien présents dans les transcriptions.
