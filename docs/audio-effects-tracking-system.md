# Audio Effects Tracking System

## Vue d'ensemble

Système complet de tracking des effets audio appliqués pendant un enregistrement audio. Permet de tracer l'historique de tous les effets et de leurs paramètres tout au long de l'enregistrement.

## Architecture

### 1. Composants du système

```
┌─────────────────────────────────────────────────────────────┐
│                  ENREGISTREMENT AUDIO                        │
│                                                              │
│  ┌─────────────────────┐      ┌──────────────────────────┐ │
│  │ Audio Recording     │      │ Effects Timeline         │ │
│  │ (MediaRecorder)     │      │ Tracker                  │ │
│  │                     │      │                          │ │
│  │ - Capture audio     │      │ - Track activations      │ │
│  │ - Apply effects     │◄────►│ - Track param changes    │ │
│  │ - Generate file     │      │ - Build timeline         │ │
│  └─────────────────────┘      └──────────────────────────┘ │
│           │                              │                   │
│           │                              │                   │
│           ▼                              ▼                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           FICHIER AUDIO + TIMELINE                     │ │
│  │                                                         │ │
│  │  Audio File (WebM/MP4)  +  Timeline JSON              │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │  BACKEND STORAGE      │
                │                       │
                │  MessageAttachment    │
                │  - audio file         │
                │  - metadata.timeline  │
                └───────────────────────┘
```

### 2. Structure de données

#### Timeline Format

```typescript
{
  "version": "1.0",
  "createdAt": "2025-01-15T10:30:00.000Z",
  "duration": 45000,  // 45 secondes en ms
  "sampleRate": 48000,
  "channels": 1,
  "events": [
    {
      "timestamp": 0,
      "effectType": "voice-coder",
      "action": "activate",
      "params": {
        "pitch": 0,
        "harmonization": false,
        "strength": 0,
        "retuneSpeed": 0,
        "scale": "chromatic",
        "key": "C",
        "naturalVibrato": 0
      }
    },
    {
      "timestamp": 2500,  // 2.5 secondes
      "effectType": "voice-coder",
      "action": "update",
      "params": {
        "pitch": 5,
        "strength": 70
      }
    },
    {
      "timestamp": 15000,  // 15 secondes
      "effectType": "baby-voice",
      "action": "activate",
      "params": {
        "pitch": 0,
        "formant": 1.0,
        "breathiness": 0
      }
    },
    {
      "timestamp": 18000,
      "effectType": "baby-voice",
      "action": "update",
      "params": {
        "pitch": 8,
        "formant": 1.3,
        "breathiness": 20
      }
    },
    {
      "timestamp": 30000,
      "effectType": "voice-coder",
      "action": "deactivate"
    }
  ],
  "metadata": {
    "totalEffectsUsed": 2,
    "totalParameterChanges": 2,
    "finalActiveEffects": ["baby-voice"]
  }
}
```

## Intégration

### 1. Dans un composant d'enregistrement audio

```typescript
import { useAudioEffects } from '@/hooks/use-audio-effects';
import { useAudioEffectsTimeline } from '@/hooks/use-audio-effects-timeline';

function AudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [inputStream, setInputStream] = useState<MediaStream | null>(null);

  // Hook des effets audio
  const {
    outputStream,
    effectsState,
    toggleEffect,
    updateEffectParams,
  } = useAudioEffects({ inputStream, onOutputStreamReady: (stream) => {...} });

  // Hook de tracking de la timeline
  const {
    startTracking,
    stopTracking,
    recordActivation,
    recordDeactivation,
    recordUpdate,
  } = useAudioEffectsTimeline();

  // Démarrer l'enregistrement
  const handleStartRecording = async () => {
    // 1. Obtenir le stream audio
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    setInputStream(stream);

    // 2. Démarrer le tracking de la timeline
    startTracking({
      sampleRate: 48000,
      channels: 1,
    });

    // 3. Démarrer MediaRecorder avec outputStream (qui contient les effets)
    // ...
    setIsRecording(true);
  };

  // Arrêter l'enregistrement
  const handleStopRecording = async () => {
    // 1. Arrêter MediaRecorder
    // ...

    // 2. Récupérer la timeline finale
    const timeline = stopTracking();

    // 3. Envoyer le fichier audio ET la timeline au backend
    const formData = new FormData();
    formData.append('audio', audioBlob);
    formData.append('timeline', JSON.stringify(timeline));

    await uploadRecording(formData);

    setIsRecording(false);
  };

  // Activer/désactiver un effet
  const handleToggleEffect = (effectType: AudioEffectType) => {
    const isCurrentlyEnabled = effectsState[getEffectKey(effectType)].enabled;

    // Toggle dans use-audio-effects
    toggleEffect(effectType);

    // Enregistrer dans la timeline
    if (isRecording) {
      if (!isCurrentlyEnabled) {
        // Activation: toujours avec paramètres à zéro
        recordActivation(effectType);
      } else {
        // Désactivation
        recordDeactivation(effectType);
      }
    }
  };

  // Modifier les paramètres d'un effet
  const handleUpdateParams = (effectType: AudioEffectType, params: any) => {
    // Mettre à jour dans use-audio-effects
    updateEffectParams(effectType, params);

    // Enregistrer dans la timeline
    if (isRecording && effectsState[getEffectKey(effectType)].enabled) {
      recordUpdate(effectType, params);
    }
  };

  return (
    <div>
      {/* UI d'enregistrement */}
      <button onClick={isRecording ? handleStopRecording : handleStartRecording}>
        {isRecording ? 'Stop' : 'Record'}
      </button>

      {/* Contrôles d'effets */}
      <AudioEffectsPanel
        effectsState={effectsState}
        onToggle={handleToggleEffect}
        onUpdateParams={handleUpdateParams}
        disabled={!isRecording}
      />
    </div>
  );
}
```

### 2. Backend - Stockage de la timeline

#### Route d'upload

```typescript
// gateway/src/routes/attachments.ts

fastify.post('/upload', async (request, reply) => {
  const data = await request.file();
  const timeline = request.body.timeline ? JSON.parse(request.body.timeline) : null;

  // Sauvegarder le fichier audio
  const attachment = await prisma.messageAttachment.create({
    data: {
      messageId,
      fileName,
      originalName,
      mimeType,
      fileSize,
      fileUrl,
      duration,
      // ... autres champs audio ...

      // Stocker la timeline dans le champ metadata JSON
      metadata: timeline ? {
        audioEffectsTimeline: timeline
      } : null,
    }
  });

  return reply.send({ success: true, attachment });
});
```

#### Récupération de la timeline

```typescript
// Lors de la récupération d'un message avec attachement audio
const message = await prisma.message.findUnique({
  where: { id },
  include: {
    attachments: {
      select: {
        id: true,
        fileName: true,
        fileUrl: true,
        duration: true,
        metadata: true,  // Contient audioEffectsTimeline
      }
    }
  }
});

// Extraire la timeline
const audioAttachment = message.attachments[0];
const timeline = audioAttachment.metadata?.audioEffectsTimeline;

if (timeline) {
  // Valider la timeline
  if (isValidAudioEffectsTimeline(timeline)) {
    // Utiliser la timeline pour analyser, rejouer, etc.
  }
}
```

### 3. Frontend - Lecture et replay des effets

```typescript
import { reconstructEffectsStateAt, calculateEffectsStats } from '@shared/types/audio-effects-timeline';

function AudioPlayer({ attachment }: { attachment: Attachment }) {
  const timeline = attachment.metadata?.audioEffectsTimeline;
  const [currentTime, setCurrentTime] = useState(0);

  // Récupérer l'état des effets à un moment donné
  useEffect(() => {
    if (!timeline) return;

    // Reconstruction de l'état à currentTime
    const snapshot = reconstructEffectsStateAt(timeline, currentTime * 1000);

    // Appliquer les effets reconstruits
    snapshot.effects.forEach(effect => {
      if (effect.enabled) {
        console.log(`Effect ${effect.effectType} was active with params:`, effect.params);
      }
    });
  }, [timeline, currentTime]);

  // Afficher les statistiques
  const stats = timeline ? calculateEffectsStats(timeline) : null;

  return (
    <div>
      <audio
        src={attachment.fileUrl}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        controls
      />

      {stats && (
        <div>
          <h4>Effets utilisés:</h4>
          <ul>
            {Object.entries(stats.byEffect).map(([effectType, effectStats]) => (
              <li key={effectType}>
                {effectType}: {effectStats.activationCount} activations,
                {(effectStats.totalDuration / 1000).toFixed(1)}s total
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

## Règles importantes

### 1. Initialisation à zéro

**TOUJOURS** initialiser les effets avec des paramètres à zéro lors de l'activation :

```typescript
// ✅ CORRECT
recordActivation('voice-coder');  // Utilise automatiquement ZERO_PARAMS

// ❌ INCORRECT - Ne jamais passer de paramètres à recordActivation
recordActivation('voice-coder', { pitch: 5, strength: 70 });
```

Pourquoi ? Pour permettre à l'utilisateur de partir d'un état neutre et d'ajuster progressivement les paramètres.

### 2. Mise à jour des paramètres

Toujours mettre à jour les paramètres **après** l'activation :

```typescript
// 1. Activer avec zéro
recordActivation('voice-coder');

// 2. Attendre un peu (facultatif)
setTimeout(() => {
  // 3. Ajuster les paramètres
  recordUpdate('voice-coder', { pitch: 5, strength: 70 });
}, 1000);
```

### 3. Ordre des événements

La timeline doit toujours respecter l'ordre chronologique :

```typescript
// ✅ CORRECT
recordActivation('effect-a');      // t=0
recordUpdate('effect-a', {...});   // t=1000
recordActivation('effect-b');      // t=2000
recordDeactivation('effect-a');    // t=3000

// Les événements sont automatiquement horodatés
```

## Cas d'usage avancés

### 1. Export/Import de configurations

```typescript
// Exporter une configuration d'effets
function exportEffectsConfig(timeline: AudioEffectsTimeline) {
  // Extraire uniquement les configurations finales
  const snapshot = reconstructEffectsStateAt(timeline, timeline.duration);

  return {
    name: 'Ma configuration',
    effects: snapshot.effects
      .filter(e => e.enabled)
      .map(e => ({
        type: e.effectType,
        params: e.params,
      })),
  };
}

// Importer et appliquer
function applyEffectsConfig(config: any) {
  config.effects.forEach((effect: any) => {
    recordActivation(effect.type);
    recordUpdate(effect.type, effect.params);
  });
}
```

### 2. Analyse de l'utilisation

```typescript
// Analyser quels effets sont les plus utilisés
function analyzeEffectUsage(timelines: AudioEffectsTimeline[]) {
  const usage = new Map<AudioEffectType, number>();

  timelines.forEach(timeline => {
    const stats = calculateEffectsStats(timeline);

    Object.entries(stats.byEffect).forEach(([effectType, effectStats]) => {
      usage.set(
        effectType as AudioEffectType,
        (usage.get(effectType as AudioEffectType) || 0) + effectStats.totalDuration
      );
    });
  });

  return Array.from(usage.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([type, duration]) => ({
      effect: type,
      totalDuration: duration,
    }));
}
```

### 3. Visualisation temporelle

```typescript
function TimelineVisualizer({ timeline }: { timeline: AudioEffectsTimeline }) {
  const [activeAtTime, setActiveAtTime] = useState<Map<AudioEffectType, boolean>>(new Map());

  const updateVisualization = (timeMs: number) => {
    const snapshot = reconstructEffectsStateAt(timeline, timeMs);
    const newActiveEffects = new Map(
      snapshot.effects.map(e => [e.effectType, e.enabled])
    );
    setActiveAtTime(newActiveEffects);
  };

  return (
    <div className="timeline-viz">
      {['voice-coder', 'baby-voice', 'demon-voice', 'back-sound'].map(effectType => (
        <div key={effectType} className="effect-track">
          <span>{effectType}</span>
          <div className="track-bar">
            {/* Visualiser les segments où l'effet est actif */}
            {timeline.events
              .filter(e => e.effectType === effectType)
              .map((event, i) => (
                <div
                  key={i}
                  className={`segment ${event.action}`}
                  style={{
                    left: `${(event.timestamp / timeline.duration) * 100}%`,
                  }}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

## Migration et évolutivité

### Versioning

Le champ `version` permet de faire évoluer le format :

```typescript
// Version 1.0 (actuelle)
{
  "version": "1.0",
  "events": [...],
  // ...
}

// Version 2.0 (future)
{
  "version": "2.0",
  "events": [...],
  "advancedFeatures": {
    // Nouvelles fonctionnalités
  }
}

// Migration
function migrateTimeline(timeline: any): AudioEffectsTimeline {
  if (timeline.version === '1.0') {
    // Migration de 1.0 vers 2.0
    return {
      ...timeline,
      version: '2.0',
      advancedFeatures: {},
    };
  }
  return timeline;
}
```

### Extensibilité

Pour ajouter un nouveau type d'effet :

1. Ajouter le type dans `shared/types/video-call.ts`:
   ```typescript
   export type AudioEffectType = 'voice-coder' | 'baby-voice' | 'demon-voice' | 'back-sound' | 'new-effect';
   ```

2. Définir les paramètres:
   ```typescript
   export interface NewEffectParams {
     param1: number;
     param2: boolean;
   }
   ```

3. Ajouter les paramètres zéro:
   ```typescript
   const ZERO_PARAMS = {
     // ...
     'new-effect': {
       param1: 0,
       param2: false,
     },
   };
   ```

4. La timeline supportera automatiquement le nouvel effet!

## Tests

### Test unitaire d'une timeline

```typescript
import { describe, it, expect } from 'vitest';
import { reconstructEffectsStateAt, calculateEffectsStats } from '@shared/types/audio-effects-timeline';

describe('AudioEffectsTimeline', () => {
  it('should reconstruct state correctly', () => {
    const timeline = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      duration: 10000,
      sampleRate: 48000,
      channels: 1,
      events: [
        {
          timestamp: 0,
          effectType: 'voice-coder',
          action: 'activate',
          params: ZERO_PARAMS['voice-coder'],
        },
        {
          timestamp: 2000,
          effectType: 'voice-coder',
          action: 'update',
          params: { pitch: 5 },
        },
      ],
    };

    const snapshot = reconstructEffectsStateAt(timeline, 5000);
    const voiceCoder = snapshot.effects.find(e => e.effectType === 'voice-coder');

    expect(voiceCoder?.enabled).toBe(true);
    expect(voiceCoder?.params.pitch).toBe(5);
  });

  it('should calculate stats correctly', () => {
    const timeline = {
      // ... timeline avec plusieurs effets
    };

    const stats = calculateEffectsStats(timeline);

    expect(stats.byEffect['voice-coder']?.activationCount).toBeGreaterThan(0);
  });
});
```

## Résumé

Le système de tracking des effets audio offre :

1. **Traçabilité complète** : Historique de tous les effets appliqués
2. **Evolutivité** : Versioning et extensibilité pour nouveaux effets
3. **Analyse** : Statistiques d'utilisation et reconstruction d'état
4. **Initialisation cohérente** : Toujours partir de zéro
5. **Stockage optimisé** : Format JSON compact dans la base de données

Ce système permet de :
- Rejouer les effets appliqués sur un enregistrement
- Analyser l'utilisation des effets
- Partager des configurations d'effets
- Déboguer les problèmes d'effets
- Créer des visualisations temporelles
