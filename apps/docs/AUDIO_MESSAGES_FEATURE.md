# Fonctionnalité des Messages Audio

## Vue d'ensemble

Cette documentation décrit la fonctionnalité d'envoi et de lecture de messages audio dans l'application de messagerie. Le système permet aux utilisateurs d'enregistrer, d'envoyer et d'écouter des messages vocaux dans leurs conversations.

## Table des matières

1. [Architecture Globale](#architecture-globale)
2. [Infrastructure Existante](#infrastructure-existante)
3. [Implémentation Backend](#implémentation-backend)
4. [Implémentation Frontend](#implémentation-frontend)
5. [Guide d'Utilisation](#guide-dutilisation)
6. [Considérations Techniques](#considérations-techniques)
7. [Sécurité et Limitations](#sécurité-et-limitations)

---

## Architecture Globale

### Schéma de Flux

```
┌─────────────────┐
│   Utilisateur   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│           Frontend (Next.js)                │
│  ┌────────────────────────────────────────┐ │
│  │  Enregistrement Audio (MediaRecorder)  │ │
│  └──────────────┬─────────────────────────┘ │
│                 │                            │
│                 ▼                            │
│  ┌────────────────────────────────────────┐ │
│  │    Upload via AttachmentService        │ │
│  └──────────────┬─────────────────────────┘ │
└─────────────────┼─────────────────────────┬─┘
                  │                         │
                  ▼                         ▼
         ┌────────────────┐      ┌──────────────────┐
         │  API Gateway   │      │  WebSocket (IO)  │
         │   (Fastify)    │      │                  │
         └────────┬───────┘      └──────────────────┘
                  │                         │
                  ▼                         │
         ┌────────────────┐                │
         │ MessageService │                │
         └────────┬───────┘                │
                  │                         │
                  ▼                         │
         ┌────────────────┐                │
         │  Base de       │                │
         │  Données       │◄───────────────┘
         │  (MongoDB)     │
         └────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │  Stockage      │
         │  Fichiers      │
         │  (/uploads)    │
         └────────────────┘
```

---

## Infrastructure Existante

### 1. Schéma de Base de Données

Le schéma Prisma supporte déjà les messages audio :

**Fichier:** `shared/schema.prisma`

#### Message Model (lignes 198-226)
```prisma
model Message {
  id                String                @id @default(auto()) @map("_id") @db.ObjectId
  conversationId    String                @db.ObjectId
  senderId          String?               @db.ObjectId
  anonymousSenderId String?               @db.ObjectId
  content           String
  originalLanguage  String                @default("fr")
  messageType       String                @default("text")  // ✅ 'audio' déjà supporté
  isEdited          Boolean               @default(false)
  editedAt          DateTime?
  isDeleted         Boolean               @default(false)
  deletedAt         DateTime?
  replyToId         String?               @db.ObjectId
  createdAt         DateTime              @default(now())
  updatedAt         DateTime              @updatedAt

  attachments       MessageAttachment[]   // ✅ Relation existante
  translations      MessageTranslation[]
  reactions         Reaction[]
  status            MessageStatus[]
  sender            User?
  anonymousSender   AnonymousParticipant?
  conversation      Conversation
  replyTo           Message?
  replies           Message[]
}
```

#### MessageAttachment Model (lignes 251-281)
```prisma
model MessageAttachment {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  messageId       String   @db.ObjectId
  fileName        String   // Nom unique généré
  originalName    String   // Nom original du fichier
  mimeType        String   // ✅ audio/mpeg, audio/wav, audio/ogg, audio/webm
  fileSize        Int      // Taille en octets
  filePath        String   // Chemin relatif: attachments/YYYY/mm/userId/filename
  fileUrl         String   // URL complète d'accès

  // Métadonnées image
  width           Int?
  height          Int?
  thumbnailPath   String?
  thumbnailUrl    String?

  // ✅ Métadonnées audio/vidéo déjà supportées
  duration        Int?     // Durée en secondes

  // Métadonnées générales
  uploadedBy      String   @db.ObjectId
  isAnonymous     Boolean  @default(false)
  createdAt       DateTime @default(now())

  message         Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)
}
```

**✅ Aucune modification de schéma nécessaire !**

### 2. Types et Configurations

**Fichier:** `shared/types/attachment.ts`

#### Types Audio Supportés
```typescript
type AttachmentType = 'image' | 'document' | 'audio' | 'video' | 'text' | 'code';

// Limites d'upload (lignes 149-156)
UPLOAD_LIMITS = {
  AUDIO: 104857600,    // 100MB max pour les fichiers audio
}

// MIME Types acceptés
ACCEPTED_AUDIO_TYPES = {
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/ogg': ['.ogg'],
  'audio/webm': ['.webm'],
}
```

### 3. Backend (Fastify)

**Fichier:** `gateway/src/services/AttachmentService.ts`

Le service d'attachement gère déjà les fichiers audio :

```typescript
class AttachmentService {
  // ✅ Validation des types audio
  async validateFile(file: MultipartFile): Promise<void>

  // ✅ Upload avec métadonnées
  async uploadFile(file: MultipartFile, userId: string, isAnonymous: boolean)

  // ✅ Extraction de la durée audio (peut nécessiter amélioration)
  private async extractAudioMetadata(filePath: string)

  // ✅ Streaming des fichiers
  async streamFile(attachmentId: string): Promise<Stream>

  // ✅ Suppression
  async deleteAttachment(attachmentId: string, userId: string)
}
```

**Routes disponibles** (`gateway/src/routes/attachments.ts`) :
- `POST /attachments/upload` - Upload de fichiers (✅ audio supporté)
- `GET /attachments/:attachmentId` - Stream du fichier audio
- `DELETE /attachments/:attachmentId` - Suppression
- `GET /conversations/:conversationId/attachments` - Liste des attachments

---

## Implémentation Backend

### 1. Amélioration de l'Extraction des Métadonnées Audio

**Fichier à modifier:** `gateway/src/services/AttachmentService.ts`

#### Installation des dépendances
```bash
npm install music-metadata --workspace=gateway
```

#### Code d'extraction de métadonnées

```typescript
import { parseFile } from 'music-metadata';

private async extractAudioMetadata(filePath: string): Promise<{ duration?: number }> {
  try {
    const metadata = await parseFile(filePath);
    return {
      duration: metadata.format.duration
        ? Math.round(metadata.format.duration)
        : undefined
    };
  } catch (error) {
    this.logger.error('Failed to extract audio metadata:', error);
    return {};
  }
}
```

### 2. Validation Spécifique Audio

**Ajout dans AttachmentService:**

```typescript
private validateAudioFile(file: MultipartFile): void {
  const maxSize = UPLOAD_LIMITS.AUDIO; // 100MB
  const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm'];

  if (file.size > maxSize) {
    throw new Error(`Audio file too large. Maximum size: ${maxSize / 1024 / 1024}MB`);
  }

  if (!allowedTypes.includes(file.mimetype)) {
    throw new Error('Unsupported audio format. Supported: MP3, WAV, OGG, WebM');
  }

  // Validation de la durée maximale (optionnel)
  const maxDuration = 600; // 10 minutes
  // Note: la durée sera vérifiée après l'upload
}
```

### 3. Service de Message avec Support Audio

**Le MessageService existant gère déjà les messages audio !**

**Fichier:** `gateway/src/services/MessageService.ts`

```typescript
// Exemple d'utilisation pour créer un message audio
const message = await messageService.sendMessage({
  conversationId: 'xxx',
  senderId: 'yyy',
  content: 'Message vocal',  // Description optionnelle
  messageType: 'audio',      // ✅ Type déjà supporté
  originalLanguage: 'fr'
});

// L'attachment est lié séparément via la relation
await prisma.messageAttachment.update({
  where: { id: attachmentId },
  data: { messageId: message.id }
});
```

### 4. Événements WebSocket

**Fichier:** `gateway/src/sockets/message.socket.ts`

Les événements existants gèrent déjà tous les types de messages :

```typescript
// ✅ Événements déjà en place
socket.on('message:new', (message) => {
  // Diffusé automatiquement pour tous types (text, audio, image, etc.)
});

socket.on('message:edited', (message) => {
  // Diffusé lors d'éditions
});

socket.on('message:deleted', (messageId) => {
  // Diffusé lors de suppressions
});
```

---

## Implémentation Frontend

### 1. Composant d'Enregistrement Audio

**Fichier à créer:** `frontend/components/audio/AudioRecorder.tsx`

```typescript
'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Mic, Square, Trash2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AudioRecorderProps {
  onRecordingComplete: (audioBlob: Blob, duration: number) => void;
  onCancel: () => void;
  maxDuration?: number; // en secondes, défaut: 600 (10 min)
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({
  onRecordingComplete,
  onCancel,
  maxDuration = 600
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Démarrer l'enregistrement
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Choisir le meilleur codec disponible
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);

        // Arrêter tous les tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(100); // Capture par chunks de 100ms
      setIsRecording(true);
      setRecordingTime(0);

      // Timer pour la durée
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          const newTime = prev + 1;
          if (newTime >= maxDuration) {
            stopRecording();
          }
          return newTime;
        });
      }, 1000);

    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Impossible d\'accéder au microphone. Veuillez vérifier les permissions.');
    }
  }, [maxDuration]);

  // Arrêter l'enregistrement
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  // Annuler l'enregistrement
  const cancelRecording = useCallback(() => {
    stopRecording();
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    chunksRef.current = [];
    onCancel();
  }, [stopRecording, onCancel]);

  // Envoyer l'enregistrement
  const sendRecording = useCallback(() => {
    if (audioBlob) {
      onRecordingComplete(audioBlob, recordingTime);
      // Reset
      setAudioBlob(null);
      setAudioUrl(null);
      setRecordingTime(0);
    }
  }, [audioBlob, recordingTime, onRecordingComplete]);

  // Formater le temps
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-gray-50 rounded-lg">
      {/* Affichage du temps */}
      <div className="text-center">
        <div className="text-2xl font-mono font-bold">
          {formatTime(recordingTime)}
        </div>
        {isRecording && (
          <div className="text-sm text-red-500 animate-pulse">
            Enregistrement en cours...
          </div>
        )}
      </div>

      {/* Waveform visuel (optionnel) */}
      {isRecording && (
        <div className="flex items-center justify-center gap-1 h-12">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="w-1 bg-red-500 rounded-full animate-pulse"
              style={{
                height: `${Math.random() * 100}%`,
                animationDelay: `${i * 0.05}s`
              }}
            />
          ))}
        </div>
      )}

      {/* Lecteur audio (après enregistrement) */}
      {audioUrl && !isRecording && (
        <audio
          src={audioUrl}
          controls
          className="w-full"
        />
      )}

      {/* Boutons de contrôle */}
      <div className="flex items-center justify-center gap-2">
        {!isRecording && !audioBlob && (
          <Button
            onClick={startRecording}
            className="flex items-center gap-2"
            variant="default"
          >
            <Mic className="w-5 h-5" />
            Enregistrer
          </Button>
        )}

        {isRecording && (
          <Button
            onClick={stopRecording}
            className="flex items-center gap-2"
            variant="destructive"
          >
            <Square className="w-5 h-5" />
            Arrêter
          </Button>
        )}

        {audioBlob && !isRecording && (
          <>
            <Button
              onClick={cancelRecording}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Supprimer
            </Button>
            <Button
              onClick={sendRecording}
              className="flex items-center gap-2"
              variant="default"
            >
              <Send className="w-4 h-4" />
              Envoyer
            </Button>
          </>
        )}
      </div>

      {/* Limite de durée */}
      <div className="text-xs text-gray-500 text-center">
        Durée maximale: {Math.floor(maxDuration / 60)} minutes
      </div>
    </div>
  );
};
```

### 2. Intégration dans MessageComposer

**Fichier à modifier:** `frontend/components/common/message-composer.tsx`

Ajouter le bouton d'enregistrement audio et l'intégration :

```typescript
import { AudioRecorder } from '@/components/audio/AudioRecorder';
import { Mic } from 'lucide-react';

// Dans le composant MessageComposer
const [showAudioRecorder, setShowAudioRecorder] = useState(false);
const [isUploadingAudio, setIsUploadingAudio] = useState(false);

// Handler pour l'enregistrement audio
const handleAudioRecordingComplete = async (audioBlob: Blob, duration: number) => {
  try {
    setIsUploadingAudio(true);

    // Créer un FormData pour l'upload
    const formData = new FormData();
    const filename = `audio_${Date.now()}.webm`;
    formData.append('file', audioBlob, filename);

    // Upload du fichier audio
    const response = await fetch(`${API_BASE_URL}/attachments/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData
    });

    if (!response.ok) throw new Error('Upload failed');

    const attachment = await response.json();

    // Créer un message avec le type 'audio'
    await sendMessage({
      conversationId,
      content: `Message vocal (${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')})`,
      messageType: 'audio',
      attachmentId: attachment.id
    });

    setShowAudioRecorder(false);
  } catch (error) {
    console.error('Failed to send audio message:', error);
    alert('Erreur lors de l\'envoi du message audio');
  } finally {
    setIsUploadingAudio(false);
  }
};

// Dans le JSX, ajouter le bouton micro
<Button
  type="button"
  variant="ghost"
  size="icon"
  onClick={() => setShowAudioRecorder(true)}
  disabled={isUploadingAudio}
  title="Enregistrer un message vocal"
>
  <Mic className="w-5 h-5" />
</Button>

// Afficher le recorder en modal ou inline
{showAudioRecorder && (
  <div className="mb-4">
    <AudioRecorder
      onRecordingComplete={handleAudioRecordingComplete}
      onCancel={() => setShowAudioRecorder(false)}
      maxDuration={600} // 10 minutes
    />
  </div>
)}
```

### 3. Lecteur Audio dans les Messages

**Fichier à modifier:** `frontend/components/attachments/MessageAttachments.tsx`

Ajouter le rendu des attachments audio :

```typescript
const AudioPlayer: React.FC<{ attachment: MessageAttachment }> = ({ attachment }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(attachment.duration || 0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-100 rounded-lg">
      {/* Bouton Play/Pause */}
      <button
        onClick={togglePlay}
        className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-blue-500 text-white rounded-full hover:bg-blue-600 transition"
      >
        {isPlaying ? (
          <Square className="w-5 h-5" />
        ) : (
          <Play className="w-5 h-5 ml-0.5" />
        )}
      </button>

      {/* Waveform / Progress bar */}
      <div className="flex-1">
        <input
          type="range"
          min="0"
          max={duration || 100}
          value={currentTime}
          onChange={(e) => {
            const time = parseFloat(e.target.value);
            setCurrentTime(time);
            if (audioRef.current) {
              audioRef.current.currentTime = time;
            }
          }}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Audio element caché */}
      <audio
        ref={audioRef}
        src={attachment.fileUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
        preload="metadata"
      />

      {/* Bouton télécharger */}
      <a
        href={attachment.fileUrl}
        download={attachment.originalName}
        className="flex-shrink-0 p-2 hover:bg-gray-200 rounded transition"
        title="Télécharger"
      >
        <Download className="w-4 h-4" />
      </a>
    </div>
  );
};

// Dans le rendu principal de MessageAttachments
{attachment.mimeType.startsWith('audio/') && (
  <AudioPlayer attachment={attachment} />
)}
```

### 4. Visualisation de Waveform (Optionnel)

Pour une meilleure UX, vous pouvez ajouter une visualisation de la forme d'onde :

```bash
npm install wavesurfer.js --workspace=frontend
```

**Composant WaveformPlayer:**

```typescript
'use client';

import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Play, Pause, Volume2 } from 'lucide-react';

interface WaveformPlayerProps {
  audioUrl: string;
  duration?: number;
}

export const WaveformPlayer: React.FC<WaveformPlayerProps> = ({
  audioUrl,
  duration
}) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (waveformRef.current) {
      wavesurferRef.current = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#ddd',
        progressColor: '#3b82f6',
        cursorColor: '#3b82f6',
        barWidth: 2,
        barRadius: 3,
        height: 60,
        normalize: true,
      });

      wavesurferRef.current.load(audioUrl);

      wavesurferRef.current.on('play', () => setIsPlaying(true));
      wavesurferRef.current.on('pause', () => setIsPlaying(false));
      wavesurferRef.current.on('audioprocess', (time) => setCurrentTime(time));

      return () => {
        wavesurferRef.current?.destroy();
      };
    }
  }, [audioUrl]);

  const togglePlayPause = () => {
    wavesurferRef.current?.playPause();
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-100 rounded-lg">
      <button
        onClick={togglePlayPause}
        className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-blue-500 text-white rounded-full hover:bg-blue-600 transition"
      >
        {isPlaying ? (
          <Pause className="w-5 h-5" />
        ) : (
          <Play className="w-5 h-5 ml-0.5" />
        )}
      </button>

      <div className="flex-1">
        <div ref={waveformRef} />
        <div className="text-xs text-gray-500 mt-1">
          {formatTime(currentTime)} / {formatTime(duration || 0)}
        </div>
      </div>
    </div>
  );
};
```

---

## Guide d'Utilisation

### Pour les Développeurs

#### 1. Envoyer un message audio

```typescript
// Étape 1: Enregistrer l'audio (navigateur)
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const mediaRecorder = new MediaRecorder(stream);
// ... enregistrement ...

// Étape 2: Uploader le fichier audio
const formData = new FormData();
formData.append('file', audioBlob, 'audio.webm');

const uploadResponse = await fetch('/attachments/upload', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});

const { id: attachmentId } = await uploadResponse.json();

// Étape 3: Créer le message
const messageResponse = await fetch('/messages', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    conversationId: 'xxx',
    content: 'Message vocal',
    messageType: 'audio',
    attachmentId
  })
});
```

#### 2. Récupérer et lire un message audio

```typescript
// Récupérer le message
const message = await fetch(`/messages/${messageId}`).then(r => r.json());

// Récupérer l'attachment audio
const audioAttachment = message.attachments.find(
  a => a.mimeType.startsWith('audio/')
);

// Lire l'audio
const audio = new Audio(audioAttachment.fileUrl);
audio.play();
```

#### 3. WebSocket pour les messages audio en temps réel

```typescript
import { io } from 'socket.io-client';

const socket = io(SOCKET_URL, {
  auth: { token }
});

socket.on('message:new', (message) => {
  if (message.messageType === 'audio') {
    // Afficher le nouveau message audio
    console.log('New audio message:', message);
    // Jouer un son de notification (optionnel)
    playNotificationSound();
  }
});
```

### Pour les Utilisateurs Finaux

#### Envoyer un message vocal

1. Ouvrir une conversation
2. Cliquer sur l'icône de microphone (🎤)
3. Autoriser l'accès au microphone si demandé
4. Cliquer sur "Enregistrer" pour commencer
5. Parler dans le microphone
6. Cliquer sur "Arrêter" quand terminé
7. Prévisualiser l'audio (optionnel)
8. Cliquer sur "Envoyer" ou "Supprimer" pour annuler

#### Écouter un message vocal

1. Trouver un message avec une icône audio
2. Cliquer sur le bouton Play ▶️
3. Utiliser la barre de progression pour naviguer
4. Ajuster le volume si nécessaire
5. Télécharger l'audio si besoin (icône téléchargement)

---

## Considérations Techniques

### 1. Formats Audio Supportés

| Format | MIME Type | Extension | Support Navigateur | Qualité | Taille |
|--------|-----------|-----------|-------------------|---------|--------|
| WebM   | audio/webm | .webm    | Chrome, Firefox, Edge | Excellente | Petite |
| Opus   | audio/webm;codecs=opus | .webm | Chrome, Firefox | Excellente | Très petite |
| MP3    | audio/mpeg | .mp3     | Tous | Bonne | Moyenne |
| WAV    | audio/wav  | .wav     | Tous | Excellente | Très grande |
| OGG    | audio/ogg  | .ogg     | Firefox, Chrome | Bonne | Petite |

**Recommandation:** WebM avec codec Opus (meilleur ratio qualité/taille)

### 2. Gestion de la Bande Passante

**Optimisations:**
- Compression automatique côté client avant upload
- Bitrate adaptatif (32-128 kbps selon la qualité réseau)
- Streaming progressif (pas de téléchargement complet avant lecture)
- Cache des fichiers audio fréquemment écoutés

**Code d'optimisation:**

```typescript
// Compresser l'audio avant upload
const compressAudio = async (blob: Blob): Promise<Blob> => {
  const audioContext = new AudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Ré-encoder avec bitrate plus bas
  const offlineContext = new OfflineAudioContext(
    1, // mono
    audioBuffer.length,
    22050 // sample rate réduit
  );

  // ... compression logic ...

  return compressedBlob;
};
```

### 3. Extraction de Métadonnées

**Backend (Node.js):**

```typescript
import { parseFile } from 'music-metadata';

const extractAudioMetadata = async (filePath: string) => {
  const metadata = await parseFile(filePath);

  return {
    duration: Math.round(metadata.format.duration || 0),
    bitrate: metadata.format.bitrate,
    sampleRate: metadata.format.sampleRate,
    codec: metadata.format.codec,
    numberOfChannels: metadata.format.numberOfChannels
  };
};
```

### 4. Gestion du Cache

**Frontend:**

```typescript
// Service Worker pour le cache des audios
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/attachments/')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request).then((response) => {
          return caches.open('audio-cache').then((cache) => {
            cache.put(event.request, response.clone());
            return response;
          });
        });
      })
    );
  }
});
```

### 5. Tests de Performance

**Métriques à surveiller:**
- Temps d'upload moyen
- Temps de première lecture
- Taux d'échec d'enregistrement
- Utilisation de la bande passante
- Taille moyenne des fichiers

**Code de monitoring:**

```typescript
// Instrumentation
const uploadMetrics = {
  start: Date.now(),
  fileSize: audioBlob.size,
  duration: recordingDuration
};

try {
  await uploadAudio(audioBlob);
  uploadMetrics.uploadTime = Date.now() - uploadMetrics.start;

  // Envoyer à votre système d'analytics
  trackEvent('audio_upload_success', uploadMetrics);
} catch (error) {
  trackEvent('audio_upload_failure', {
    ...uploadMetrics,
    error: error.message
  });
}
```

---

## Sécurité et Limitations

### 1. Permissions Navigateur

**Gestion des permissions microphone:**

```typescript
const checkMicrophonePermission = async (): Promise<boolean> => {
  try {
    const permissionStatus = await navigator.permissions.query({
      name: 'microphone' as PermissionName
    });

    if (permissionStatus.state === 'granted') {
      return true;
    } else if (permissionStatus.state === 'prompt') {
      // L'utilisateur sera invité lors de l'appel getUserMedia
      return true;
    } else {
      // Permission refusée
      alert('Accès au microphone refusé. Veuillez autoriser l\'accès dans les paramètres de votre navigateur.');
      return false;
    }
  } catch (error) {
    console.error('Failed to check microphone permission:', error);
    return true; // Continuer quand même, getUserMedia demandera
  }
};
```

### 2. Validation Backend

**Fichier:** `gateway/src/services/AttachmentService.ts`

```typescript
// Validation stricte
private async validateAudioUpload(file: MultipartFile, userId: string): Promise<void> {
  // Vérifier la taille
  if (file.size > UPLOAD_LIMITS.AUDIO) {
    throw new Error('Audio file exceeds maximum size (100MB)');
  }

  // Vérifier le MIME type
  const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm'];
  if (!allowedTypes.includes(file.mimetype)) {
    throw new Error('Invalid audio format');
  }

  // Vérifier l'extension
  const ext = file.filename.split('.').pop()?.toLowerCase();
  const allowedExtensions = ['mp3', 'wav', 'ogg', 'webm'];
  if (!ext || !allowedExtensions.includes(ext)) {
    throw new Error('Invalid file extension');
  }

  // Vérifier le quota utilisateur (optionnel)
  const userQuota = await this.getUserStorageQuota(userId);
  if (userQuota.used + file.size > userQuota.limit) {
    throw new Error('Storage quota exceeded');
  }

  // Scanner antivirus (optionnel, via service externe)
  // await this.scanFileForMalware(file);
}
```

### 3. Rate Limiting

**Prévenir les abus:**

```typescript
// Middleware de rate limiting pour les uploads audio
import rateLimit from 'fastify-rate-limit';

fastify.register(rateLimit, {
  max: 10, // 10 uploads audio max
  timeWindow: '15 minutes',
  cache: 10000,
  allowList: (req) => {
    // Exemptions pour les utilisateurs premium
    return req.user?.role === 'PREMIUM';
  },
  skipOnError: true,
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  }
});
```

### 4. Limites de Durée

**Contrôle de la durée maximale:**

```typescript
// Frontend: arrêt automatique après durée max
const MAX_RECORDING_DURATION = 600; // 10 minutes

useEffect(() => {
  if (isRecording && recordingTime >= MAX_RECORDING_DURATION) {
    stopRecording();
    alert('Durée maximale d\'enregistrement atteinte (10 minutes)');
  }
}, [recordingTime, isRecording]);

// Backend: validation de la durée
private async validateAudioDuration(filePath: string): Promise<void> {
  const metadata = await this.extractAudioMetadata(filePath);

  if (metadata.duration && metadata.duration > MAX_RECORDING_DURATION) {
    // Supprimer le fichier
    await fs.unlink(filePath);
    throw new Error(`Audio duration exceeds maximum (${MAX_RECORDING_DURATION / 60} minutes)`);
  }
}
```

### 5. Stockage et Nettoyage

**Politique de rétention:**

```typescript
// Tâche cron pour nettoyer les vieux fichiers audio
import cron from 'node-cron';

// Tous les jours à 2h du matin
cron.schedule('0 2 * * *', async () => {
  const retentionDays = 365; // 1 an
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  // Trouver les attachments audio anciens
  const oldAudioAttachments = await prisma.messageAttachment.findMany({
    where: {
      mimeType: { startsWith: 'audio/' },
      createdAt: { lt: cutoffDate }
    }
  });

  // Supprimer les fichiers et les entrées DB
  for (const attachment of oldAudioAttachments) {
    await attachmentService.deleteAttachment(attachment.id);
  }

  console.log(`Cleaned up ${oldAudioAttachments.length} old audio attachments`);
});
```

### 6. Chiffrement (Optionnel)

**Chiffrer les fichiers audio au repos:**

```typescript
import crypto from 'crypto';
import fs from 'fs/promises';

const encryptAudioFile = async (filePath: string, key: Buffer): Promise<void> => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const input = await fs.readFile(filePath);
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Sauvegarder: IV + AuthTag + Données chiffrées
  const output = Buffer.concat([iv, authTag, encrypted]);
  await fs.writeFile(filePath + '.enc', output);
  await fs.unlink(filePath); // Supprimer l'original
};

const decryptAudioFile = async (filePath: string, key: Buffer): Promise<Buffer> => {
  const encrypted = await fs.readFile(filePath);

  const iv = encrypted.subarray(0, 16);
  const authTag = encrypted.subarray(16, 32);
  const data = encrypted.subarray(32);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(data), decipher.final()]);
};
```

---

## Feuille de Route

### Phase 1: Implémentation de Base ✅
- [x] Schéma de base de données (déjà en place)
- [x] Service backend pour upload audio (déjà en place)
- [ ] Composant AudioRecorder
- [ ] Intégration dans MessageComposer
- [ ] Lecteur audio basique

### Phase 2: Améliorations UX
- [ ] Visualisation waveform
- [ ] Compression audio côté client
- [ ] Indicateur de progression d'upload
- [ ] Prévisualisation avant envoi
- [ ] Réduction de bruit automatique

### Phase 3: Fonctionnalités Avancées
- [ ] Vitesse de lecture variable (0.5x, 1x, 1.5x, 2x)
- [ ] Marqueurs de temps dans l'audio
- [ ] Transcription automatique (Speech-to-Text)
- [ ] Résumé automatique des messages vocaux
- [ ] Support multi-langue pour transcription

### Phase 4: Optimisations
- [ ] Cache intelligent des audios
- [ ] Streaming adaptatif
- [ ] Conversion de format côté serveur
- [ ] CDN pour les fichiers audio
- [ ] Analytics et métriques

---

## Ressources

### Documentation
- [MDN Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [Fastify Multipart](https://github.com/fastify/fastify-multipart)
- [Prisma Docs](https://www.prisma.io/docs)

### Librairies Recommandées
- `music-metadata` - Extraction de métadonnées audio (Node.js)
- `wavesurfer.js` - Visualisation waveform
- `lamejs` - Encodage MP3 côté client
- `ffmpeg` - Conversion et traitement audio (serveur)

### Services Externes
- **Transcription:** Google Speech-to-Text, AWS Transcribe, Azure Speech
- **Stockage:** AWS S3, Google Cloud Storage, Azure Blob
- **CDN:** CloudFlare, Fastly, AWS CloudFront
- **Analytics:** Mixpanel, Amplitude, Google Analytics

---

## Support

Pour toute question ou problème concernant la fonctionnalité audio :

1. Consulter cette documentation
2. Vérifier les logs du serveur (`gateway/logs`)
3. Vérifier la console navigateur (F12)
4. Créer un ticket dans le système de tracking
5. Contacter l'équipe de développement

---

**Version:** 1.0.0
**Date:** 2025-11-01
**Auteurs:** Équipe de Développement
**Statut:** Documentation de conception et implémentation
