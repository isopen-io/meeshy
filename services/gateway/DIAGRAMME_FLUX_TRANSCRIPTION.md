# Diagrammes de Flux - Transcription Audio Meeshy

## 1. Flux Actuel (Avec Problème)

```mermaid
graph TD
    Start[🎵 Message Audio Envoyé] --> DB[(💾 Base de Données)]

    subgraph "Phase 1: Demande de Transcription"
        A[👤 Utilisateur demande transcription] --> B[📤 POST /attachments/:id/transcribe]
        B --> C[⚙️ Gateway traite la requête]
        C --> D[🤖 Service Whisper STT]
        D --> E[💾 Sauvegarde MessageAudioTranscription]
        E --> F[📡 Émet AUDIO_TRANSLATION_READY via WebSocket]
    end

    subgraph "Phase 2: Réception WebSocket - ✅ FONCTIONNE"
        F --> G[🎧 Frontend écoute WebSocket]
        G --> H{data.attachmentId correspond?}
        H -->|Oui| I[✅ setTranscription]
        H -->|Non| J[❌ Ignore]
        I --> K[🎨 Re-render SimpleAudioPlayer]
        K --> L[✨ Transcription affichée!]
    end

    subgraph "Phase 3: Rechargement Page - ❌ PROBLÈME"
        M[🔄 Utilisateur recharge la page] --> N[📥 GET /conversations/:id/messages]
        N --> O[⚙️ Gateway - Requête Prisma]
        O --> P{Include transcription?}
        P -->|❌ NON| Q[Transcription pas récupérée]
        P -->|✅ OUI| R[Transcription dans réponse]
        Q --> S[📦 Réponse API sans transcription]
        R --> S
        S --> T[🔄 Transformateur Frontend]
        T --> U{Mappe transcription?}
        U -->|❌ NON| V[attachment.transcription = undefined]
        U -->|✅ OUI| W[attachment.transcription défini]
        V --> X[🎨 SimpleAudioPlayer rendu]
        W --> X
        X --> Y{initialTranscription existe?}
        Y -->|❌ NON| Z[❌ Pas de transcription affichée]
        Y -->|✅ OUI| AA[✨ Transcription affichée!]
    end

    style L fill:#90EE90
    style Z fill:#FFB6C1
    style AA fill:#90EE90
    style Q fill:#FFB6C1
    style V fill:#FFB6C1
```

## 2. Flux Cible (Après Correction)

```mermaid
graph TD
    Start[🎵 Message Audio Envoyé] --> DB[(💾 Base de Données)]

    subgraph "Phase 1: Demande de Transcription - Inchangé"
        A[👤 Utilisateur demande transcription] --> B[📤 POST /attachments/:id/transcribe]
        B --> C[⚙️ Gateway traite la requête]
        C --> D[🤖 Service Whisper STT]
        D --> E[💾 Sauvegarde MessageAudioTranscription]
        E --> F[📡 Émet AUDIO_TRANSLATION_READY via WebSocket]
    end

    subgraph "Phase 2: Réception WebSocket - ✅ Fonctionne Déjà"
        F --> G[🎧 Frontend écoute WebSocket]
        G --> H{data.attachmentId correspond?}
        H -->|Oui| I[✅ setTranscription]
        I --> K[🎨 Re-render SimpleAudioPlayer]
        K --> L[✨ Transcription affichée!]
    end

    subgraph "Phase 3: Rechargement Page - ✅ CORRIGÉ"
        M[🔄 Utilisateur recharge la page] --> N[📥 GET /conversations/:id/messages]
        N --> O[⚙️ Gateway - Requête Prisma]
        O --> P[✅ Include transcription: true]
        P --> R[✅ Transcription dans réponse API]
        R --> T[🔄 Transformateur Frontend]
        T --> U[✅ Mappe transcription vers attachment]
        U --> W[✅ attachment.transcription défini]
        W --> X[🎨 SimpleAudioPlayer rendu]
        X --> AA[✨ Transcription affichée immédiatement!]
    end

    style L fill:#90EE90
    style AA fill:#90EE90
    style P fill:#87CEEB
    style U fill:#87CEEB
    style W fill:#87CEEB
```

## 3. Architecture des Composants

```mermaid
graph TB
    subgraph "🎨 UI Layer"
        SAP[SimpleAudioPlayer]
        ATP[AudioTranscriptionPanel]
        AA[AudioAttachment]
    end

    subgraph "🔧 Hooks Layer"
        UAT[useAudioTranslation]
        UAP[useAudioPlayback]
    end

    subgraph "🌐 Services Layer"
        WS[WebSocket Service<br/>TranslationService]
        API[API Service]
        TRANS[Transformers Service]
    end

    subgraph "📡 Backend - Gateway"
        ROUTES[Conversations Routes]
        PRISMA[Prisma ORM]
        WHISPER[Whisper STT Service]
    end

    subgraph "💾 Database"
        MSG[Message]
        ATT[MessageAttachment]
        ATRANS[MessageAudioTranscription]
    end

    %% UI to Hooks
    SAP -->|uses| UAT
    SAP -->|uses| UAP
    AA -->|passes initialTranscription| SAP
    SAP -->|passes transcription| ATP

    %% Hooks to Services
    UAT -->|requestTranscription| API
    UAT -->|onAudioTranslation| WS

    %% Services to Backend
    API -->|GET/POST| ROUTES
    WS -->|Socket.IO| ROUTES
    ROUTES -->|transform| TRANS

    %% Backend to Database
    ROUTES -->|query with include| PRISMA
    PRISMA -->|fetch| MSG
    PRISMA -->|fetch| ATT
    PRISMA -->|❌ PROBLÈME: pas fetch| ATRANS

    %% Database Relations
    MSG -.->|has many| ATT
    ATT -.->|has one| ATRANS

    %% Data Flow
    WHISPER -->|creates| ATRANS
    ROUTES -->|emits event| WS

    style ATRANS fill:#FFB6C1
    style PRISMA fill:#FFB6C1
    style TRANS fill:#FFB6C1
```

## 4. Structure de Données - Message avec Attachment

### Backend (Prisma Schema)

```typescript
Message {
  id: string
  content: string
  attachments: MessageAttachment[] // Relation
  // ...
}

MessageAttachment {
  id: string
  messageId: string
  fileName: string
  fileUrl: string
  // ... metadata
  transcription: MessageAudioTranscription? // ⚠️ Relation optionnelle
  translationsJson: Json? // Stocke les traductions audio
}

MessageAudioTranscription {
  id: string
  attachmentId: string // Relation 1:1
  transcribedText: string
  language: string
  confidence: number
  model: string?
  // ...
}
```

### Frontend (TypeScript Interface)

```typescript
interface Message {
  id: string;
  content: string;
  attachments?: Attachment[];
  // ...
}

interface Attachment {
  id: string;
  messageId: string;
  fileName: string;
  fileUrl: string;
  // ... metadata

  // ⚠️ Ces champs doivent être mappés!
  transcription?: AttachmentTranscription;
  transcriptionText?: string;
  translationsJson?: Record<string, AttachmentTranslation>;
}

interface AttachmentTranscription {
  type: 'audio' | 'video' | 'document' | 'image';
  transcribedText: string;  // Pour audio
  language: string;
  confidence: number;
  // ...
}
```

## 5. Points de Passage des Données

```mermaid
sequenceDiagram
    participant DB as 💾 Database
    participant GW as ⚙️ Gateway
    participant Trans as 🔄 Transformer
    participant API as 🌐 API Client
    participant Hook as 🔧 useAudioTranslation
    participant UI as 🎨 SimpleAudioPlayer

    Note over DB,UI: Scénario: Rechargement de Page

    UI->>API: GET /conversations/:id/messages
    API->>GW: HTTP Request

    rect rgb(255, 200, 200)
    Note over GW,DB: ❌ PROBLÈME 1: Include manquant
    GW->>DB: findMany({ include: { attachments: true } })
    Note over DB: transcription NOT included
    DB-->>GW: Messages + Attachments (sans transcription)
    end

    GW-->>API: Response JSON

    rect rgb(255, 200, 200)
    Note over Trans,API: ❌ PROBLÈME 2: Mapping manquant
    API->>Trans: transformMessageData(message)
    Trans->>Trans: transformAttachments(attachments)
    Note over Trans: transcription field NOT mapped
    Trans-->>API: Messages transformés (sans transcription)
    end

    API-->>Hook: Messages
    Hook->>Hook: initialTranscription = message.attachments[0].transcription
    Note over Hook: initialTranscription = undefined ❌

    Hook-->>UI: { transcription: undefined }
    UI->>UI: Render
    Note over UI: Pas de transcription affichée ❌
```

## 6. Comparaison: WebSocket vs HTTP

### WebSocket (Fonctionne ✅)

```mermaid
graph LR
    A[🤖 Whisper Service] -->|Transcription complétée| B[⚙️ Gateway]
    B -->|AUDIO_TRANSLATION_READY| C[📡 Socket.IO]
    C -->|Event avec data complète| D[🎧 Frontend Listener]
    D -->|setTranscription| E[🔧 useAudioTranslation]
    E -->|Re-render| F[🎨 UI]

    style F fill:#90EE90
```

**Pourquoi ça fonctionne:**
1. ✅ L'événement contient TOUTES les données nécessaires
2. ✅ Pas de transformation intermédiaire
3. ✅ Mise à jour directe de l'état React

### HTTP (Ne fonctionne pas ❌)

```mermaid
graph LR
    A[💾 Database] -->|Query Prisma| B[⚙️ Gateway]
    B -->|❌ Transcription manquante| C[🌐 API]
    C -->|Response JSON| D[🔄 Transformer]
    D -->|❌ Mapping incomplet| E[🔧 React Query]
    E -->|Messages sans transcription| F[🎨 UI]

    style F fill:#FFB6C1
```

**Pourquoi ça ne fonctionne pas:**
1. ❌ Prisma n'inclut pas la relation transcription
2. ❌ Le transformer ne mappe pas le champ
3. ❌ L'UI reçoit des données incomplètes

---

## 7. Checklist de Vérification

### ✅ Backend (Gateway)

```typescript
// ✅ TODO: Vérifier dans conversations.routes.ts
const messages = await prisma.message.findMany({
  include: {
    attachments: {
      include: {
        transcription: true,  // ← Ajouter ceci
      }
    }
  }
});
```

### ✅ Frontend (Transformer)

```typescript
// ✅ TODO: Modifier dans transformers.service.ts
private transformAttachments(...): Attachment[] {
  return attachments.map(att => ({
    // ... tous les champs existants

    // ✅ Ajouter ces lignes
    transcription: att.transcription || undefined,
    transcriptionText: att.transcriptionText
      ? String(att.transcriptionText)
      : undefined,
    translationsJson: att.translationsJson || undefined,
  }));
}
```

### ✅ Tests de Validation

1. **Test Backend:**
   ```bash
   # Vérifier la réponse API
   curl http://localhost:3000/api/conversations/CONV_ID/messages \
     -H "Authorization: Bearer TOKEN" | jq '.data[0].attachments[0].transcription'

   # Devrait retourner l'objet transcription, pas null
   ```

2. **Test Frontend:**
   ```typescript
   // Dans la console du navigateur
   console.log(message.attachments[0].transcription);
   // Devrait afficher: { type: 'audio', transcribedText: '...', ... }
   ```

3. **Test E2E:**
   - Envoyer un message audio
   - Demander la transcription
   - Recharger la page
   - Vérifier que la transcription s'affiche immédiatement

---

**Diagrammes créés le:** 2026-01-18
**Version:** 1.0
**Status:** Documentation technique
