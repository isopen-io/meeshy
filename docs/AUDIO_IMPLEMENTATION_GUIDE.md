# Guide d'Implémentation - Messages Audio

## 📋 Résumé

Ce guide explique comment implémenter la fonctionnalité d'envoi et de lecture de messages audio dans l'application. L'interface est **SIMPLE et MODERNE**, sans complications inutiles.

## 🎯 Principe de Fonctionnement

### Enregistrement Audio
1. **Cliquer** sur le bouton microphone pour commencer l'enregistrement
2. **Cliquer sur "Arrêter"** pour arrêter l'enregistrement et prévisualiser
3. **Cliquer sur "Envoyer"** directement pendant l'enregistrement pour arrêter ET envoyer
4. Après arrêt : **"Supprimer"** ou **"Envoyer"**

### Lecture Audio
- Bouton Play/Pause central et clair
- Barre de progression cliquable
- Durée affichée (temps actuel / durée totale)
- Bouton télécharger

## 🚀 Étape 1 : Composants Créés

### SimpleAudioRecorder
**Fichier:** `frontend/components/audio/SimpleAudioRecorder.tsx`

Interface simple :
- Grand bouton "Enregistrer" pour commencer
- Pendant l'enregistrement : "Arrêter" ou "Envoyer"
- Après enregistrement : "Supprimer" ou "Envoyer"
- Timer bien visible
- Visualisation sonore animée

### SimpleAudioPlayer
**Fichier:** `frontend/components/audio/SimpleAudioPlayer.tsx`

Lecteur moderne :
- Bouton Play/Pause rond et central
- Barre de progression interactive
- Temps affiché clairement
- Bouton télécharger
- Version compacte disponible (`CompactAudioPlayer`)

## 🔧 Étape 2 : Intégration dans MessageComposer

### 2.1 Ajouter le bouton microphone

**Fichier:** `frontend/components/common/message-composer.tsx`

```typescript
// Importer le composant
import { SimpleAudioRecorder } from '@/components/audio/SimpleAudioRecorder';
import { Mic } from 'lucide-react';

// Ajouter l'état
const [showAudioRecorder, setShowAudioRecorder] = useState(false);
const [isUploadingAudio, setIsUploadingAudio] = useState(false);
```

### 2.2 Handler pour l'audio

```typescript
// Handler pour l'enregistrement audio terminé
const handleAudioRecordingComplete = async (audioBlob: Blob, duration: number) => {
  try {
    setIsUploadingAudio(true);

    // Créer un FormData pour l'upload
    const formData = new FormData();
    const filename = `audio_${Date.now()}.webm`;
    formData.append('file', audioBlob, filename);

    // Upload du fichier audio
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/attachments/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData
    });

    if (!response.ok) throw new Error('Upload failed');

    const uploadedAttachment = await response.json();

    // Ajouter à la liste des attachments
    setUploadedAttachments(prev => [...prev, uploadedAttachment]);

    // Fermer le recorder
    setShowAudioRecorder(false);

    console.log('✅ Audio message uploaded:', uploadedAttachment);
  } catch (error) {
    console.error('Failed to send audio message:', error);
    alert('Erreur lors de l\'envoi du message audio');
  } finally {
    setIsUploadingAudio(false);
  }
};
```

### 2.3 Ajouter le bouton microphone dans le JSX

Ajouter à côté du bouton d'attachement (ligne ~519) :

```typescript
{/* Bouton Microphone (Audio) */}
<Button
  onClick={() => setShowAudioRecorder(!showAudioRecorder)}
  disabled={!isComposingEnabled || isUploadingAudio}
  size="sm"
  variant="ghost"
  className="h-7 w-7 sm:h-8 sm:w-8 p-0 rounded-full hover:bg-gray-100 relative"
  title="Enregistrer un message vocal"
>
  <Mic className={`h-3 w-3 sm:h-4 sm:w-4 ${showAudioRecorder ? 'text-blue-600' : 'text-gray-600'}`} />
</Button>
```

### 2.4 Afficher le recorder audio

Ajouter après le `AttachmentCarousel` (ligne ~461) :

```typescript
{/* Recorder audio - affiché quand activé */}
{showAudioRecorder && (
  <div className="p-2 border-t border-gray-200 dark:border-gray-700">
    <SimpleAudioRecorder
      onRecordingComplete={handleAudioRecordingComplete}
      onCancel={() => setShowAudioRecorder(false)}
      maxDuration={600} // 10 minutes max
    />
  </div>
)}
```

## 🎨 Étape 3 : Intégration dans MessageAttachments

### 3.1 Afficher le lecteur audio

**Fichier:** `frontend/components/attachments/MessageAttachments.tsx`

```typescript
// Importer le composant
import { SimpleAudioPlayer } from '@/components/audio/SimpleAudioPlayer';

// Dans le rendu des attachments, ajouter la condition pour les audios
{attachment.mimeType.startsWith('audio/') && (
  <SimpleAudioPlayer
    attachment={attachment}
    className="my-2"
  />
)}
```

### 3.2 Exemple d'intégration complète

```typescript
export const MessageAttachments: React.FC<Props> = ({ attachments, messageId, onDelete }) => {
  return (
    <div className="space-y-2">
      {attachments.map((attachment) => {
        // Images
        if (attachment.mimeType.startsWith('image/')) {
          return <ImageAttachment key={attachment.id} attachment={attachment} />;
        }

        // Audio - NOUVEAU !
        if (attachment.mimeType.startsWith('audio/')) {
          return (
            <SimpleAudioPlayer
              key={attachment.id}
              attachment={attachment}
              className="my-2"
            />
          );
        }

        // Vidéos
        if (attachment.mimeType.startsWith('video/')) {
          return <VideoAttachment key={attachment.id} attachment={attachment} />;
        }

        // Autres fichiers
        return <FileAttachment key={attachment.id} attachment={attachment} />;
      })}
    </div>
  );
};
```

## 🔍 Étape 4 : Vérifier le Type de Message selon l'Attachement

**IMPORTANT:** Le type du message doit correspondre au type de l'attachement principal.

### 4.1 Logique Actuelle

Le `MessageService` (backend) accepte déjà le `messageType`, mais le frontend ne l'envoie pas automatiquement basé sur les attachments.

**Fichier backend:** `gateway/src/services/MessageService.ts` (ligne 66)
```typescript
messageType: request.messageType || 'text',
```

### 4.2 Correction Nécessaire - Frontend

Dans le composant qui envoie les messages (probablement dans une page conversation), ajouter cette logique :

```typescript
// Fonction pour déterminer le type de message basé sur les attachments
const getMessageTypeFromAttachments = (attachments: UploadedAttachmentResponse[]): string => {
  if (!attachments || attachments.length === 0) {
    return 'text';
  }

  // Prendre le type du premier attachment
  const firstAttachment = attachments[0];
  const mimeType = firstAttachment.mimeType;

  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf') return 'file';
  if (mimeType.startsWith('text/')) return 'text';

  return 'file'; // Par défaut pour les autres types
};

// Lors de l'envoi du message
const sendMessage = async () => {
  const messageType = getMessageTypeFromAttachments(uploadedAttachments);

  const payload = {
    conversationId,
    content: messageContent,
    messageType, // ✅ Ajouter le type déterminé
    originalLanguage: selectedLanguage,
    attachments: uploadedAttachments.map(a => a.id),
    replyToId: replyingTo?.id
  };

  await fetch('/api/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
};
```

### 4.3 Vérification dans le Backend (Optionnel)

Si vous voulez que le backend détermine automatiquement le type basé sur les attachments :

**Fichier:** `gateway/src/services/MessageService.ts`

Ajouter cette méthode privée :

```typescript
private async determineMessageType(
  request: MessageRequest,
  attachmentIds?: string[]
): Promise<string> {
  // Si le type est explicitement fourni, l'utiliser
  if (request.messageType && request.messageType !== 'text') {
    return request.messageType;
  }

  // Si pas d'attachments, c'est un message texte
  if (!attachmentIds || attachmentIds.length === 0) {
    return 'text';
  }

  // Récupérer le premier attachment pour déterminer le type
  const firstAttachment = await this.prisma.messageAttachment.findUnique({
    where: { id: attachmentIds[0] },
    select: { mimeType: true }
  });

  if (!firstAttachment) return 'text';

  const mimeType = firstAttachment.mimeType;

  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf') return 'file';
  if (mimeType.startsWith('text/')) return 'text';

  return 'file';
}
```

Puis modifier la ligne 66 pour utiliser cette méthode :

```typescript
messageType: await this.determineMessageType(request, request.attachments),
```

## 📊 Étape 5 : Lier les Attachments aux Messages

Les attachments audio doivent être liés au message créé.

### 5.1 Backend - Route de création de message

**Fichier:** `gateway/src/routes/messages.ts`

S'assurer que lors de la création du message, les attachments sont liés :

```typescript
fastify.post('/messages', async (request, reply) => {
  const { conversationId, content, messageType, attachments } = request.body;

  // 1. Créer le message
  const message = await messageService.handleMessage({
    conversationId,
    content,
    messageType,
    originalLanguage: request.body.originalLanguage || 'fr'
  }, request.user.id);

  // 2. Lier les attachments au message
  if (attachments && attachments.length > 0) {
    await prisma.messageAttachment.updateMany({
      where: { id: { in: attachments } },
      data: { messageId: message.data.id }
    });
  }

  return message;
});
```

### 5.2 Alternative : Lier au moment de l'upload

Vous pouvez aussi passer le `messageId` lors de l'upload si le message existe déjà :

```typescript
// Frontend
const formData = new FormData();
formData.append('file', audioBlob, filename);
if (existingMessageId) {
  formData.append('messageId', existingMessageId);
}
```

## 🎨 Étape 6 : Styling et UX

### 6.1 CSS Animations (Optionnel)

Ajouter dans `globals.css` si besoin :

```css
/* Animation pour les barres audio */
@keyframes audioWave {
  0%, 100% { height: 20%; }
  50% { height: 80%; }
}

.audio-wave-bar {
  animation: audioWave 0.6s ease-in-out infinite;
}

/* Bouton pulsant pour l'enregistrement */
.recording-pulse {
  animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
```

### 6.2 Responsive Design

Les composants sont déjà responsive avec Tailwind :
- Tailles adaptatives (`sm:`, `md:`)
- Touch-friendly (boutons ≥ 44px)
- Mobile-first

## ✅ Étape 7 : Tests

### 7.1 Tests Fonctionnels

- [ ] Cliquer sur microphone ouvre le recorder
- [ ] Enregistrement démarre correctement
- [ ] Timer s'affiche et s'incrémente
- [ ] Bouton "Arrêter" fonctionne
- [ ] Bouton "Envoyer" pendant enregistrement fonctionne
- [ ] Prévisualisation audio fonctionne après arrêt
- [ ] Upload vers le backend réussit
- [ ] Message avec audio s'affiche dans la conversation
- [ ] Lecteur audio lit correctement le fichier
- [ ] Barre de progression fonctionne
- [ ] Téléchargement fonctionne

### 7.2 Tests de Permissions

```typescript
// Test des permissions microphone
const testMicrophoneAccess = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('✅ Microphone access granted');
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch (error) {
    console.error('❌ Microphone access denied:', error);
    return false;
  }
};
```

### 7.3 Tests de Compatibilité

Tester sur :
- ✅ Chrome/Edge (WebM Opus)
- ✅ Firefox (WebM Opus)
- ✅ Safari (MP4/AAC)
- ✅ Mobile Chrome
- ✅ Mobile Safari

## 🐛 Troubleshooting

### Problème : Microphone ne fonctionne pas

**Solution :**
1. Vérifier que le site est en HTTPS (requis pour getUserMedia)
2. Vérifier les permissions dans les paramètres du navigateur
3. Vérifier que le microphone n'est pas utilisé par une autre application

### Problème : Audio ne se lit pas

**Solution :**
1. Vérifier que le fichier est correctement uploadé (URL accessible)
2. Vérifier le MIME type (audio/webm, audio/mpeg, etc.)
3. Vérifier que le backend retourne bien le fichier avec les bons headers

### Problème : Enregistrement trop volumineux

**Solution :**
1. Réduire le bitrate lors de l'enregistrement
2. Limiter la durée maximale (actuellement 10 min)
3. Implémenter une compression côté client avant upload

## 📚 Références

### APIs Utilisées
- **MediaRecorder API:** Enregistrement audio
- **Web Audio API:** Manipulation audio (optionnel)
- **Audio Element:** Lecture audio

### Documentation
- [MediaRecorder MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [getUserMedia MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [Audio Element MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/audio)

## 🎯 Résumé des Fichiers Modifiés/Créés

### Nouveaux Fichiers
1. ✅ `frontend/components/audio/SimpleAudioRecorder.tsx`
2. ✅ `frontend/components/audio/SimpleAudioPlayer.tsx`
3. ✅ `docs/AUDIO_IMPLEMENTATION_GUIDE.md` (ce fichier)

### Fichiers à Modifier
1. `frontend/components/common/message-composer.tsx`
   - Ajouter bouton microphone
   - Ajouter état pour le recorder
   - Ajouter handler pour l'audio

2. `frontend/components/attachments/MessageAttachments.tsx`
   - Ajouter rendu pour les attachments audio

3. Fichier de page conversation (ex: `app/conversations/[id]/page.tsx`)
   - Ajouter logique pour déterminer `messageType` basé sur les attachments

4. `gateway/src/services/MessageService.ts` (optionnel)
   - Ajouter méthode pour déterminer automatiquement le type

## 🚀 Déploiement

### Avant de déployer

1. ✅ Tester sur tous les navigateurs
2. ✅ Vérifier les permissions microphone
3. ✅ Tester l'upload et le streaming
4. ✅ Vérifier les limites de taille
5. ✅ Tester sur mobile
6. ✅ Vérifier les logs backend

### Configuration Production

```bash
# Variables d'environnement
NEXT_PUBLIC_API_URL=https://api.votre-domaine.com
MAX_AUDIO_SIZE=104857600 # 100MB
MAX_AUDIO_DURATION=600 # 10 minutes
```

---

**Version:** 1.0.0
**Date:** 2025-11-01
**Auteur:** Équipe de Développement
**Statut:** Guide d'implémentation complet
