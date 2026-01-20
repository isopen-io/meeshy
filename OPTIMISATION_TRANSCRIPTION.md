# Optimisation - Réutilisation des Transcriptions Existantes

**Date:** 2026-01-19
**Priorité:** ⚡ HAUTE (Performance & Coûts)
**Impact:** Chaque traduction audio refait la transcription (15-30s gaspillées)

---

## 🔍 Problème Identifié

### Comportement Actuel

Lors de la traduction d'un audio :
1. ✅ Transcription Whisper (15-30s)
2. ✅ Traduction ML (1-2s)
3. ✅ Synthèse TTS (5-15s)

**Total : ~25-45 secondes**

Si l'audio est retraduit vers une autre langue :
1. ❌ **REFAIT la transcription** (15-30s gaspillées)
2. ✅ Traduction ML (1-2s)
3. ✅ Synthèse TTS (5-15s)

**Total : ~25-45 secondes (alors que ça devrait être ~7-17s)**

### Logs Observés

```
2026-01-19 10:05:02 - [TRANSCRIPTION] 🎤 Transcription Whisper de: /var/folders/.../tmp....wav
2026-01-19 10:05:17 - [TRANSCRIPTION] ✅ Transcrit: 'Bonjour à tous...' (18011ms)
```

La transcription prend **18 secondes** alors qu'elle existe déjà dans la base de données !

---

## 📊 Impact Business

### Performance
- ❌ **Latence inutile** : +15-30s par retraduction
- ❌ **Charge CPU** : Whisper consomme beaucoup de ressources
- ❌ **Mauvaise UX** : L'utilisateur attend 2x plus longtemps

### Coûts
- ❌ **GPU/CPU gaspillés** : Whisper est gourmand
- ❌ **Scalabilité réduite** : Moins de traductions/seconde possibles

### Cas d'Usage Impactés

1. **Traductions multiples** : Un audio en français traduit vers EN, ES, DE
   - Actuellement : 3 transcriptions identiques (45-90s perdues)
   - Devrait être : 1 transcription réutilisée 3 fois

2. **Messages transférés** : Audio transféré à plusieurs personnes
   - Actuellement : Transcription refaite pour chaque destinataire
   - Devrait être : Transcription copiée de l'original

3. **Retraduction** : L'utilisateur change de langue cible
   - Actuellement : Retranscription complète
   - Devrait être : Réutilisation immédiate

---

## ✅ Solution

### Infrastructure Disponible

L'infrastructure pour envoyer la transcription existante est **DÉJÀ EN PLACE** :

#### 1. Type ZMQ (`services/gateway/src/services/zmq-translation/types.ts:97-104`)
```typescript
export interface AudioProcessRequest {
  // ... autres champs ...
  mobileTranscription?: {
    text: string;
    language: string;
    confidence: number;
    source: string;
    segments?: Array<{ text: string; startMs: number; endMs: number }>;
  };
  // ... autres champs ...
}
```

#### 2. Transmission ZMQ (`ZmqRequestSender.ts:141`)
```typescript
mobileTranscription: request.mobileTranscription,  // ✅ Déjà transmis
```

#### 3. Base de Données Prisma
```prisma
model MessageAudioTranscription {
  id                String   @id @default(uuid())
  attachmentId      String   @unique
  messageId         String
  transcribedText   String
  language          String
  confidence        Float
  source            String   // "whisper" ou "mobile"
  segments          Json?
  audioDurationMs   Int?
  // ... autres champs ...
}
```

### Modification Nécessaire

**Fichier** : `services/gateway/src/services/AttachmentTranslateService.ts`

#### Avant (ligne ~350)
```typescript
private async translateAudio(userId: string, attachment: any, options: TranslateOptions) {
  // ... vérification cache traductions ...

  // Lit le fichier audio
  const audioBuffer = await this.readAttachmentFile(attachment.filePath);
  const audioBase64 = audioBuffer.toString('base64');

  // ❌ N'envoie PAS la transcription existante
  const syncResult = await this.audioTranslateService.translateSync(userId, {
    audioBase64,
    targetLanguages: languagesToTranslate,
    sourceLanguage: options.sourceLanguage,
    generateVoiceClone: options.generateVoiceClone,
    originalSenderId: originalSenderId || undefined,
    existingVoiceProfile: voiceProfile || undefined,
    useOriginalVoice
  });
}
```

#### Après (à implémenter)
```typescript
private async translateAudio(userId: string, attachment: any, options: TranslateOptions) {
  // ... vérification cache traductions ...

  // ✅ NOUVEAU: Récupérer la transcription existante si disponible
  const existingTranscription = await this.prisma.messageAudioTranscription.findUnique({
    where: { attachmentId: originalAttachmentId },
    select: {
      transcribedText: true,
      language: true,
      confidence: true,
      source: true,
      segments: true,
      audioDurationMs: true
    }
  });

  // Log pour visibilité
  if (existingTranscription) {
    console.log(`   📝 Transcription existante trouvée: "${existingTranscription.transcribedText.substring(0, 50)}..."`);
    console.log(`   ⚡ Économie: ~15-30s de transcription Whisper`);
  } else {
    console.log(`   🎤 Pas de transcription existante, Whisper sera utilisé`);
  }

  // Lit le fichier audio
  const audioBuffer = await this.readAttachmentFile(attachment.filePath);
  const audioBase64 = audioBuffer.toString('base64');

  // ✅ Envoyer la transcription existante au translator
  const syncResult = await this.audioTranslateService.translateSync(userId, {
    audioBase64,
    targetLanguages: languagesToTranslate,
    sourceLanguage: options.sourceLanguage,
    generateVoiceClone: options.generateVoiceClone,
    originalSenderId: originalSenderId || undefined,
    existingVoiceProfile: voiceProfile || undefined,
    useOriginalVoice,
    // ✅ NOUVEAU: Passer la transcription existante
    existingTranscription: existingTranscription ? {
      text: existingTranscription.transcribedText,
      language: existingTranscription.language,
      confidence: existingTranscription.confidence,
      source: existingTranscription.source,
      segments: existingTranscription.segments as any
    } : undefined
  });
}
```

### Modification dans AudioTranslateService

**Fichier** : `services/gateway/src/services/AudioTranslateService.ts:367-390`

#### Interface AudioTranslationOptions
```typescript
export interface AudioTranslationOptions {
  audioBase64?: string;
  audioPath?: string;
  attachmentId?: string;
  targetLanguages: string[];
  sourceLanguage?: string;
  generateVoiceClone?: boolean;
  saveToDatabase?: boolean;
  originalSenderId?: string;
  existingVoiceProfile?: VoiceProfileData;
  useOriginalVoice?: boolean;
  // ✅ NOUVEAU
  existingTranscription?: {
    text: string;
    language: string;
    confidence: number;
    source: string;
    segments?: Array<{ text: string; startMs: number; endMs: number }>;
  };
}
```

#### Méthode translateSync
```typescript
async translateSync(userId: string, options: AudioTranslationOptions): Promise<VoiceTranslationResult> {
  const request: VoiceTranslateRequest = {
    type: 'voice_translate',
    taskId: randomUUID(),
    userId,
    audioBase64: options.audioBase64,
    audioPath: options.audioPath,
    targetLanguages: options.targetLanguages,
    sourceLanguage: options.sourceLanguage,
    generateVoiceClone: options.generateVoiceClone ?? true,
    // ✅ NOUVEAU: Passer la transcription existante
    mobileTranscription: options.existingTranscription
  };

  // ... reste du code ...
}
```

### Modification dans ZmqTranslationClient

**Fichier** : `services/gateway/src/services/zmq-translation/ZmqTranslationClient.ts`

La méthode `sendVoiceAPIRequest` doit être adaptée pour transmettre `mobileTranscription` :

```typescript
async sendVoiceAPIRequest(request: VoiceAPIRequest): Promise<void> {
  // ... code existant ...

  // Construire le message audio process
  const audioProcessRequest: AudioProcessRequest = {
    type: 'audio_process',
    messageId: request.messageId || randomUUID(),
    attachmentId: request.attachmentId || randomUUID(),
    // ... autres champs ...
    // ✅ Transmettre la transcription si fournie
    mobileTranscription: (request as any).mobileTranscription,
    targetLanguages: request.targetLanguages,
    generateVoiceClone: request.generateVoiceClone
  };

  // Envoyer via ZMQ
  await this.requestSender.sendAudioProcessRequest(audioProcessRequest);
}
```

---

## 🧪 Validation

### Test 1 : Première traduction (pas de transcription existante)
```bash
# Envoyer un audio en français vers EN
POST /attachments/{id}/translate
{ "targetLanguages": ["en"] }

# Logs attendus :
[GATEWAY] 🎤 Pas de transcription existante, Whisper sera utilisé
[TRANSLATOR] 🎤 Transcription Whisper de: /tmp/...
[TRANSLATOR] ✅ Transcrit: "Bonjour..." (18000ms)
```

### Test 2 : Retraduction (transcription existante)
```bash
# Retraduire le même audio vers ES (transcription existe déjà)
POST /attachments/{id}/translate
{ "targetLanguages": ["es"] }

# Logs attendus :
[GATEWAY] 📝 Transcription existante trouvée: "Bonjour à tous, ceci est..."
[GATEWAY] ⚡ Économie: ~15-30s de transcription Whisper
[TRANSLATOR] ⏩ Transcription fournie par gateway, skip Whisper
[TRANSLATOR] ✅ Traduction: "Hola a todos..." (2000ms)
# ✅ Temps total: ~7s au lieu de ~25s
```

### Test 3 : Traductions multiples simultanées
```bash
# Traduire vers 3 langues d'un coup
POST /attachments/{id}/translate
{ "targetLanguages": ["en", "es", "de"] }

# Comportement :
# - Transcription faite 1 seule fois (18s)
# - 3 traductions + 3 TTS en parallèle (~15s)
# Total: ~33s au lieu de ~75s (3x 25s)
```

---

## 📈 Gains Attendus

### Latence
- **Première traduction** : 25-45s (inchangé)
- **Retraduction** : 7-17s (au lieu de 25-45s) → **-60% à -70%**
- **3 langues simultanées** : 33s (au lieu de 75s) → **-56%**

### Ressources
- **CPU Whisper économisé** : ~80% sur les retraductions
- **Throughput** : +2-3x traductions/seconde possibles
- **Coûts** : Réduction proportionnelle des coûts de transcription

### UX
- ⚡ Réponse quasi-instantanée pour les retraductions
- ✅ Meilleure scalabilité du service
- 🎯 Prévisibilité des temps de réponse

---

## 🚀 Implémentation

### Étapes

1. ✅ **Audit de l'infrastructure existante** (FAIT)
2. ⏳ **Modifier AttachmentTranslateService** :
   - Récupérer `MessageAudioTranscription` avant traduction
   - Passer au paramètre `existingTranscription`
3. ⏳ **Modifier AudioTranslateService** :
   - Ajouter `existingTranscription` à `AudioTranslationOptions`
   - Transmettre à `VoiceTranslateRequest` comme `mobileTranscription`
4. ⏳ **Modifier ZmqTranslationClient** :
   - S'assurer que `mobileTranscription` est bien transmis
5. ⏳ **Vérifier le service Translator Python** :
   - Confirmer qu'il utilise bien `mobileTranscription` s'il est fourni
   - Skip Whisper si transcription fournie

### Tests
- Test unitaire : Vérifier que la transcription est récupérée
- Test d'intégration : Vérifier que le translator la reçoit
- Test E2E : Mesurer les gains de temps réels

---

## 🔗 Fichiers Concernés

### Gateway (TypeScript)
1. `services/gateway/src/services/AttachmentTranslateService.ts:258-433`
   - Méthode `translateAudio()` - Ajouter récupération transcription
2. `services/gateway/src/services/AudioTranslateService.ts:367-390`
   - Interface `AudioTranslationOptions` - Ajouter `existingTranscription`
   - Méthode `translateSync()` - Transmettre `mobileTranscription`
3. `services/gateway/src/services/zmq-translation/ZmqTranslationClient.ts`
   - Méthode `sendVoiceAPIRequest()` - S'assurer transmission correcte

### Translator (Python)
4. `services/translator/src/services/zmq_audio_handler.py`
   - Vérifier utilisation de `mobileTranscription` si présent
   - Skip Whisper si fourni

---

## 📝 Notes

### Comportement Attendu Translator

Le service translator devrait déjà gérer `mobileTranscription` :

```python
# Si mobileTranscription est fourni
if request.get('mobileTranscription'):
    transcription = request['mobileTranscription']['text']
    language = request['mobileTranscription']['language']
    logger.info(f"[TRANSLATOR] ⏩ Transcription fournie, skip Whisper")
else:
    # Faire la transcription Whisper
    transcription = await whisper_transcribe(audio_path)
    logger.info(f"[TRANSLATOR] 🎤 Transcription Whisper: {transcription[:50]}...")
```

### Compatibilité

- ✅ **Backward compatible** : Le champ `mobileTranscription` est optionnel
- ✅ **Pas de migration DB** : Utilise les données existantes
- ✅ **Pas de breaking change** : Fonctionne avec/sans transcription fournie

---

**Créé par:** Claude Sonnet 4.5
**Date:** 2026-01-19
**Priorité:** ⚡ HAUTE
