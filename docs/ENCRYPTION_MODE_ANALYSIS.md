# Meeshy Encryption Mode Analysis

## Complete Flow Tracing: Frontend → Backend → Database → Translator

---

## Table of Contents

1. [Encryption Modes Overview](#encryption-modes-overview)
2. [Mode 1: Plaintext (No Encryption)](#mode-1-plaintext-no-encryption)
3. [Mode 2: Server Encryption](#mode-2-server-encryption)
4. [Mode 3: E2EE (End-to-End)](#mode-3-e2ee-end-to-end)
5. [Mode 4: Hybrid Encryption](#mode-4-hybrid-encryption)
6. [Conflict Points and Issues](#conflict-points-and-issues)
7. [Data Flow Comparison Table](#data-flow-comparison-table)
8. [Recommendations](#recommendations)

---

## Encryption Modes Overview

Meeshy supports **4 encryption modes** (including plaintext):

| Mode | Type Definition | Translation | Server Readable | Client Readable |
|------|-----------------|-------------|-----------------|-----------------|
| `null` | Plaintext | YES | YES | YES |
| `server` | AES-256-GCM (server-managed keys) | YES | YES | YES (via server) |
| `e2ee` | Signal Protocol (client-side) | **NO** | **NO** | YES |
| `hybrid` | E2EE + Server layer | YES (server layer) | Partial | YES |

---

## Mode 1: Plaintext (No Encryption)

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PLAINTEXT MESSAGE FLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  FRONTEND (apps/web)                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  hooks/use-encryption.ts:277-288                                    │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │  prepareMessage(content, conversationId, encryptionMode?)     │  │    │
│  │  │                                                               │  │    │
│  │  │  1. Check: mode = await getConversationMode(conversationId)   │  │    │
│  │  │  2. If mode === null:                                         │  │    │
│  │  │     return { content: "Hello World" }  // No encryption       │  │    │
│  │  │                                                               │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  │                           │                                         │    │
│  │                           ▼                                         │    │
│  │  services/messages.service.ts:115-126                               │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │  POST /conversations/:id/messages                             │  │    │
│  │  │  Body: {                                                      │  │    │
│  │  │    content: "Hello World",                                    │  │    │
│  │  │    originalLanguage: "en",                                    │  │    │
│  │  │    messageType: "text"                                        │  │    │
│  │  │    // NO isEncrypted, encryptedContent, etc.                  │  │    │
│  │  │  }                                                            │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│  BACKEND (services/gateway)                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  routes/conversations.ts:1270-1586                                  │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │  POST /conversations/:id/messages                             │  │    │
│  │  │                                                               │  │    │
│  │  │  Line 1343: if (isEncrypted) { ... } else {                   │  │    │
│  │  │    // isEncrypted = undefined → goes to else branch           │  │    │
│  │  │    Line 1365: validate content not empty ✓                    │  │    │
│  │  │  }                                                            │  │    │
│  │  │                                                               │  │    │
│  │  │  Line 1373-1385: Process tracking links                       │  │    │
│  │  │  processedContent = trackingLinkService.processMessageLinks() │  │    │
│  │  │                                                               │  │    │
│  │  │  Line 1387-1430: Create message                               │  │    │
│  │  │  messageData = {                                              │  │    │
│  │  │    content: "Hello World",     // Plaintext stored            │  │    │
│  │  │    isEncrypted: false          // Default                     │  │    │
│  │  │    // NO encryptedContent, encryptionMode, encryptionMetadata │  │    │
│  │  │  }                                                            │  │    │
│  │  │                                                               │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│  DATABASE (MongoDB)                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Collection: messages                                               │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │  {                                                            │  │    │
│  │  │    _id: ObjectId("..."),                                      │  │    │
│  │  │    content: "Hello World",           // ✓ Readable            │  │    │
│  │  │    isEncrypted: false,               // ✓ Not encrypted       │  │    │
│  │  │    encryptedContent: null,                                    │  │    │
│  │  │    encryptionMode: null,                                      │  │    │
│  │  │    encryptionMetadata: null,                                  │  │    │
│  │  │    originalLanguage: "en"                                     │  │    │
│  │  │  }                                                            │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│  TRANSLATION SERVICE                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  routes/conversations.ts:1547-1561                                  │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │  translationService.handleNewMessage({                        │  │    │
│  │  │    id: message.id,                                            │  │    │
│  │  │    content: "Hello World",        // ✓ Readable plaintext     │  │    │
│  │  │    originalLanguage: "en"                                     │  │    │
│  │  │  })                                                           │  │    │
│  │  │                                                               │  │    │
│  │  │  → Translates to fr, es, de, etc. for each participant        │  │    │
│  │  │  → Stores in MessageTranslation collection                    │  │    │
│  │  │                                                               │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  RESULT: ✓ Translation works correctly                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Function Call Trace

```
Frontend:
  useEncryption.prepareMessage()           → hooks/use-encryption.ts:277
    └─ SharedEncryptionService.prepareMessage() → packages/shared/encryption/encryption-service.ts:465
        └─ getConversationMode() returns null
        └─ return { content }  // No encryption

  messagesService.sendMessageToConversation() → services/messages.service.ts:115
    └─ POST /conversations/:id/messages

Backend:
  POST /conversations/:id/messages          → routes/conversations.ts:1270
    ├─ Validation: content not empty        → :1365
    ├─ processMessageLinks()                → :1378
    ├─ prisma.message.create()              → :1405
    └─ translationService.handleNewMessage() → :1549
        └─ TranslationService.handleNewMessage() → services/TranslationService.ts:142
            ├─ _saveMessageToDatabase()     → :165
            └─ _processTranslationsAsync()  → :193
                └─ ZMQ translation request
```

---

## Mode 2: Server Encryption

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SERVER ENCRYPTION MESSAGE FLOW                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  FRONTEND (apps/web)                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  hooks/use-encryption.ts:277-288                                    │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │  prepareMessage(content, conversationId, 'server')            │  │    │
│  │  │                                                               │  │    │
│  │  │  1. mode = 'server'                                           │  │    │
│  │  │  2. encrypted = await encrypt(content, conversationId, mode)  │  │    │
│  │  │                                                               │  │    │
│  │  │  packages/shared/encryption/encryption-service.ts:250-330     │  │    │
│  │  │  ┌─────────────────────────────────────────────────────────┐  │  │    │
│  │  │  │  encryptMessage(plaintext, conversationId, 'server')    │  │  │    │
│  │  │  │                                                         │  │  │    │
│  │  │  │  1. Get/create conversation key from IndexedDB          │  │  │    │
│  │  │  │  2. Generate IV (12 bytes)                              │  │  │    │
│  │  │  │  3. AES-256-GCM encrypt                                 │  │  │    │
│  │  │  │                                                         │  │  │    │
│  │  │  │  return {                                               │  │  │    │
│  │  │  │    ciphertext: base64(encrypted),                       │  │  │    │
│  │  │  │    metadata: {                                          │  │  │    │
│  │  │  │      mode: 'server',                                    │  │  │    │
│  │  │  │      protocol: 'aes-256-gcm',                           │  │  │    │
│  │  │  │      keyId: 'uuid-xxx',                                 │  │  │    │
│  │  │  │      iv: base64(iv),                                    │  │  │    │
│  │  │  │      authTag: base64(tag)                               │  │  │    │
│  │  │  │    }                                                    │  │  │    │
│  │  │  │  }                                                      │  │  │    │
│  │  │  └─────────────────────────────────────────────────────────┘  │  │    │
│  │  │                                                               │  │    │
│  │  │  3. return {                                                  │  │    │
│  │  │       content: "Hello World",  // ⚠️ PLAINTEXT STILL SENT    │  │    │
│  │  │       encryptedPayload: { ... }                               │  │    │
│  │  │     }                                                         │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  │                           │                                         │    │
│  │                           ▼                                         │    │
│  │  POST /conversations/:id/messages                                   │    │
│  │  Body: {                                                            │    │
│  │    content: "Hello World",           // ⚠️ Plaintext for translation│    │
│  │    isEncrypted: true,                                               │    │
│  │    encryptedContent: "base64...",    // Ciphertext                  │    │
│  │    encryptionMode: "server",                                        │    │
│  │    encryptionMetadata: { keyId, iv, authTag, protocol }             │    │
│  │  }                                                                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│  BACKEND (services/gateway)                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  routes/conversations.ts:1270-1586                                  │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │  Line 1343: if (isEncrypted) {                                │  │    │
│  │  │    Line 1345: validate encryptedContent not empty ✓           │  │    │
│  │  │    Line 1351: validate mode in ['e2ee','server','hybrid'] ✓   │  │    │
│  │  │    Line 1357: validate encryptionMetadata exists ✓            │  │    │
│  │  │  }                                                            │  │    │
│  │  │                                                               │  │    │
│  │  │  Line 1377: if (!isEncrypted || encryptionMode !== 'e2ee') {  │  │    │
│  │  │    // 'server' mode → process links                           │  │    │
│  │  │    processedContent = processMessageLinks(content)            │  │    │
│  │  │  }                                                            │  │    │
│  │  │                                                               │  │    │
│  │  │  Line 1398-1403: Add encryption fields                        │  │    │
│  │  │  messageData = {                                              │  │    │
│  │  │    content: "Hello World",         // ⚠️ PLAINTEXT STORED     │  │    │
│  │  │    isEncrypted: true,                                         │  │    │
│  │  │    encryptedContent: "base64...",  // Ciphertext also stored  │  │    │
│  │  │    encryptionMode: "server",                                  │  │    │
│  │  │    encryptionMetadata: { ... }                                │  │    │
│  │  │  }                                                            │  │    │
│  │  │                                                               │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│  DATABASE (MongoDB)                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Collection: messages                                               │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │  {                                                            │  │    │
│  │  │    _id: ObjectId("..."),                                      │  │    │
│  │  │    content: "Hello World",           // ⚠️ PLAINTEXT STORED   │  │    │
│  │  │    isEncrypted: true,                                         │  │    │
│  │  │    encryptedContent: "aGVsbG8gd29y...", // Ciphertext         │  │    │
│  │  │    encryptionMode: "server",                                  │  │    │
│  │  │    encryptionMetadata: {                                      │  │    │
│  │  │      keyId: "uuid-xxx",                                       │  │    │
│  │  │      iv: "base64...",                                         │  │    │
│  │  │      authTag: "base64...",                                    │  │    │
│  │  │      protocol: "aes-256-gcm"                                  │  │    │
│  │  │    }                                                          │  │    │
│  │  │  }                                                            │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│  TRANSLATION SERVICE                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  translationService.handleNewMessage({                              │    │
│  │    content: "Hello World"         // ⚠️ Uses plaintext content      │    │
│  │  })                                                                 │    │
│  │                                                                     │    │
│  │  → Translation works! (but uses plaintext, not encrypted content)   │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ⚠️ ISSUE: Plaintext stored alongside encrypted content                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Issue with Server Mode

**CONFLICT IDENTIFIED**: In server mode, both plaintext AND encrypted content are stored in the database!

```
Database Record:
{
  content: "Hello World",              // ← PLAINTEXT (readable by anyone with DB access)
  encryptedContent: "aGVsbG8gd29y...", // ← ENCRYPTED (requires key)
  isEncrypted: true
}
```

This defeats the purpose of encryption because the plaintext is stored unencrypted.

---

## Mode 3: E2EE (End-to-End)

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        E2EE MESSAGE FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  FRONTEND (apps/web)                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  hooks/use-encryption.ts:277-288                                    │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │  prepareMessage(content, conversationId, 'e2ee')              │  │    │
│  │  │                                                               │  │    │
│  │  │  1. mode = 'e2ee'                                             │  │    │
│  │  │  2. encrypted = await encrypt(content, conversationId, mode)  │  │    │
│  │  │                                                               │  │    │
│  │  │  packages/shared/encryption/encryption-service.ts:260-291     │  │    │
│  │  │  ┌─────────────────────────────────────────────────────────┐  │  │    │
│  │  │  │  encryptMessage(plaintext, conversationId, 'e2ee')      │  │  │    │
│  │  │  │                                                         │  │  │    │
│  │  │  │  1. if (mode === 'e2ee' && signalService) {             │  │  │    │
│  │  │  │  2.   Check session exists with recipient               │  │  │    │
│  │  │  │  3.   plaintextBytes = TextEncoder.encode(plaintext)    │  │  │    │
│  │  │  │  4.   signalMessage = signalService.encryptMessage()    │  │  │    │
│  │  │  │       (Double Ratchet encryption)                       │  │  │    │
│  │  │  │  }                                                      │  │  │    │
│  │  │  │                                                         │  │  │    │
│  │  │  │  return {                                               │  │  │    │
│  │  │  │    ciphertext: base64(signalMessage.content),           │  │  │    │
│  │  │  │    metadata: {                                          │  │  │    │
│  │  │  │      mode: 'e2ee',                                      │  │  │    │
│  │  │  │      protocol: 'signal_v3',                             │  │  │    │
│  │  │  │      keyId: recipientUserId,                            │  │  │    │
│  │  │  │      messageType: signalMessage.type,                   │  │  │    │
│  │  │  │      registrationId: signalMessage.destinationRegId     │  │  │    │
│  │  │  │    }                                                    │  │  │    │
│  │  │  │  }                                                      │  │  │    │
│  │  │  └─────────────────────────────────────────────────────────┘  │  │    │
│  │  │                                                               │  │    │
│  │  │  :488 return {                                                │  │    │
│  │  │    content: '[Encrypted]',  // ✓ Placeholder only!            │  │    │
│  │  │    encryptedPayload: { ciphertext, metadata }                 │  │    │
│  │  │  }                                                            │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  │                           │                                         │    │
│  │                           ▼                                         │    │
│  │  POST /conversations/:id/messages                                   │    │
│  │  Body: {                                                            │    │
│  │    content: "[Encrypted]",           // ✓ No plaintext sent!        │    │
│  │    isEncrypted: true,                                               │    │
│  │    encryptedContent: "base64...",    // Signal Protocol ciphertext  │    │
│  │    encryptionMode: "e2ee",                                          │    │
│  │    encryptionMetadata: { messageType, registrationId, ... }         │    │
│  │  }                                                                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│  BACKEND (services/gateway)                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  routes/conversations.ts:1270-1586                                  │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │  Line 1377: if (!isEncrypted || encryptionMode !== 'e2ee') {  │  │    │
│  │  │    // 'e2ee' mode → SKIP link processing                      │  │    │
│  │  │    // (can't process encrypted links)                         │  │    │
│  │  │  }                                                            │  │    │
│  │  │                                                               │  │    │
│  │  │  messageData = {                                              │  │    │
│  │  │    content: "[Encrypted]",         // ✓ Placeholder stored    │  │    │
│  │  │    isEncrypted: true,                                         │  │    │
│  │  │    encryptedContent: "base64...",  // Ciphertext stored       │  │    │
│  │  │    encryptionMode: "e2ee",                                    │  │    │
│  │  │    encryptionMetadata: { ... }                                │  │    │
│  │  │  }                                                            │  │    │
│  │  │                                                               │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│  DATABASE (MongoDB)                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Collection: messages                                               │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │  {                                                            │  │    │
│  │  │    _id: ObjectId("..."),                                      │  │    │
│  │  │    content: "[Encrypted]",           // ✓ No plaintext!       │  │    │
│  │  │    isEncrypted: true,                                         │  │    │
│  │  │    encryptedContent: "signal_ciphertext...",                  │  │    │
│  │  │    encryptionMode: "e2ee",                                    │  │    │
│  │  │    encryptionMetadata: {                                      │  │    │
│  │  │      protocol: "signal_v3",                                   │  │    │
│  │  │      messageType: 3,                                          │  │    │
│  │  │      registrationId: 12345                                    │  │    │
│  │  │    }                                                          │  │    │
│  │  │  }                                                            │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│  TRANSLATION SERVICE                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  translationService.handleNewMessage({                              │    │
│  │    content: "[Encrypted]"       // ⚠️ TRANSLATES PLACEHOLDER!       │    │
│  │  })                                                                 │    │
│  │                                                                     │    │
│  │  → ZMQ sends "[Encrypted]" to translation service                   │    │
│  │  → Returns translations like:                                       │    │
│  │     fr: "[Chiffré]"                                                 │    │
│  │     es: "[Cifrado]"                                                 │    │
│  │     de: "[Verschlüsselt]"                                           │    │
│  │                                                                     │    │
│  │  ⚠️ WASTED RESOURCES: Translation of placeholder text!              │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ⚠️ ISSUE: Translation service translates "[Encrypted]" placeholder        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Issues with E2EE Mode

1. **Translation Wastes Resources**: The translation service translates the placeholder "[Encrypted]" instead of skipping E2EE messages
2. **No E2EE Check in TranslationService**: `TranslationService.ts` has NO check for `isEncrypted` or `encryptionMode`

---

## Mode 4: Hybrid Encryption

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      HYBRID ENCRYPTION MESSAGE FLOW                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  FRONTEND (apps/web)                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  hooks/use-encryption.ts:277-288                                    │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │  prepareMessage(content, conversationId, 'hybrid')            │  │    │
│  │  │                                                               │  │    │
│  │  │  1. mode = 'hybrid'                                           │  │    │
│  │  │  2. encrypted = await encrypt(content, conversationId, mode)  │  │    │
│  │  │                                                               │  │    │
│  │  │  Current implementation: Falls through to server encryption   │  │    │
│  │  │  (Signal Protocol not called for hybrid in current code)      │  │    │
│  │  │                                                               │  │    │
│  │  │  return {                                                     │  │    │
│  │  │    content: "Hello World",  // ⚠️ Same as server mode         │  │    │
│  │  │    encryptedPayload: { ciphertext, metadata: {mode:'hybrid'}} │  │    │
│  │  │  }                                                            │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│  BACKEND (services/gateway)                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  routes/conversations.ts:1270-1586                                  │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │  Line 1377: if (!isEncrypted || encryptionMode !== 'e2ee') {  │  │    │
│  │  │    // 'hybrid' mode → process links (like server mode)        │  │    │
│  │  │    processedContent = processMessageLinks(content)            │  │    │
│  │  │  }                                                            │  │    │
│  │  │                                                               │  │    │
│  │  │  messageData = {                                              │  │    │
│  │  │    content: "Hello World",         // ⚠️ PLAINTEXT STORED     │  │    │
│  │  │    isEncrypted: true,                                         │  │    │
│  │  │    encryptedContent: "base64...",                             │  │    │
│  │  │    encryptionMode: "hybrid",                                  │  │    │
│  │  │    encryptionMetadata: { ... }                                │  │    │
│  │  │  }                                                            │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│  HYBRID ENCRYPTION SERVICE (Backend)                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  services/EncryptionService.ts:596-707                              │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │  HybridEncryptedPayload structure:                            │  │    │
│  │  │  {                                                            │  │    │
│  │  │    e2ee: {              // Client-side Signal Protocol        │  │    │
│  │  │      ciphertext: "...", // Only client can decrypt            │  │    │
│  │  │      type: 3,                                                 │  │    │
│  │  │      senderRegistrationId: 123,                               │  │    │
│  │  │      recipientRegistrationId: 456                             │  │    │
│  │  │    },                                                         │  │    │
│  │  │    server: {            // Server layer for translation       │  │    │
│  │  │      ciphertext: "...", // Server can decrypt this            │  │    │
│  │  │      iv: "...",                                               │  │    │
│  │  │      authTag: "...",                                          │  │    │
│  │  │      keyId: "uuid-xxx"                                        │  │    │
│  │  │    },                                                         │  │    │
│  │  │    mode: 'hybrid',                                            │  │    │
│  │  │    canTranslate: true,  // ✓ Translation allowed              │  │    │
│  │  │    timestamp: 1704067200000                                   │  │    │
│  │  │  }                                                            │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  │                                                                     │    │
│  │  translateHybridMessage():669-707                                   │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │  1. Check payload.mode === 'hybrid' && canTranslate           │  │    │
│  │  │  2. Decrypt server layer                                      │  │    │
│  │  │  3. Translate content                                         │  │    │
│  │  │  4. Re-encrypt server layer with translated content           │  │    │
│  │  │  5. Keep E2EE layer unchanged                                 │  │    │
│  │  │  return { ...payload, server: newServerLayer }                │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│  DATABASE (MongoDB)                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  {                                                                  │    │
│  │    content: "Hello World",           // ⚠️ Still stored plaintext  │    │
│  │    isEncrypted: true,                                               │    │
│  │    encryptedContent: "hybrid_payload...",                           │    │
│  │    encryptionMode: "hybrid",                                        │    │
│  │    encryptionMetadata: {                                            │    │
│  │      e2ee: { ... },                                                 │    │
│  │      server: { ... },                                               │    │
│  │      canTranslate: true                                             │    │
│  │    }                                                                │    │
│  │  }                                                                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ⚠️ ISSUE: Same as server mode - plaintext stored in content field          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Hybrid Mode: How It's SUPPOSED to Work

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    HYBRID ENCRYPTION - IDEAL FLOW                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SENDER                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                     │    │
│  │  1. Plaintext: "Hello World"                                        │    │
│  │                │                                                    │    │
│  │                ▼                                                    │    │
│  │  2. ┌─────────────────────┐    ┌─────────────────────┐              │    │
│  │     │  E2EE LAYER         │    │  SERVER LAYER       │              │    │
│  │     │  (Signal Protocol)  │    │  (AES-256-GCM)      │              │    │
│  │     │                     │    │                     │              │    │
│  │     │  Only recipient     │    │  Server can decrypt │              │    │
│  │     │  can decrypt        │    │  for translation    │              │    │
│  │     └─────────────────────┘    └─────────────────────┘              │    │
│  │                │                         │                          │    │
│  │                └────────────┬────────────┘                          │    │
│  │                             ▼                                       │    │
│  │  3. HybridPayload: {                                                │    │
│  │       e2ee: { ciphertext: "signal_encrypted..." },                  │    │
│  │       server: { ciphertext: "aes_encrypted...", keyId, iv, tag },   │    │
│  │       canTranslate: true                                            │    │
│  │     }                                                               │    │
│  │                             │                                       │    │
│  └─────────────────────────────┼───────────────────────────────────────┘    │
│                                ▼                                            │
│  SERVER                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                     │    │
│  │  4. Store HybridPayload (NO plaintext)                              │    │
│  │                                                                     │    │
│  │  5. For translation:                                                │    │
│  │     a. Decrypt SERVER layer only                                    │    │
│  │     b. Translate content                                            │    │
│  │     c. Re-encrypt SERVER layer                                      │    │
│  │     d. E2EE layer remains unchanged                                 │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                ▼                                            │
│  RECIPIENT                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                     │    │
│  │  6. Receive HybridPayload                                           │    │
│  │                                                                     │    │
│  │  7. Two options:                                                    │    │
│  │     a. Decrypt E2EE layer → Original message (verified)             │    │
│  │     b. Request server layer → Translated version                    │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Conflict Points and Issues

### Issue #1: Plaintext Stored in Server/Hybrid Modes

**Location**: `packages/shared/encryption/encryption-service.ts:488`

```typescript
return {
  content: mode === 'e2ee' ? '[Encrypted]' : content, // ⚠️ Plaintext for non-E2EE
  encryptedPayload: encrypted,
};
```

**Problem**: For `server` and `hybrid` modes, plaintext is sent alongside encrypted content.

**Impact**:
- Database stores both plaintext AND ciphertext
- Encryption provides no protection if DB is compromised
- Violates security principles

**Fix Needed**:
```typescript
return {
  content: '[Encrypted]', // Always placeholder
  encryptedPayload: encrypted,
};
```

---

### Issue #2: Translation Service Doesn't Check Encryption Mode

**Location**: `services/gateway/src/services/TranslationService.ts:142`

```typescript
async handleNewMessage(messageData: MessageData): Promise<...> {
  // No check for isEncrypted or encryptionMode!
  // Processes ALL messages including E2EE
}
```

**Problem**:
- E2EE messages have `content: "[Encrypted]"`
- Translation service translates this placeholder
- Wasted API calls to translation service

**Fix Needed**:
```typescript
async handleNewMessage(messageData: MessageData): Promise<...> {
  // Skip E2EE messages
  if (messageData.encryptionMode === 'e2ee') {
    return { messageId: messageData.id, status: 'skipped_e2ee' };
  }
  // ... rest of function
}
```

---

### Issue #3: No Backend Validation of Encryption Mode Consistency

**Location**: `routes/conversations.ts:1343-1403`

**Problem**: Backend doesn't verify:
- That encryption mode matches conversation settings
- That client-provided encryption is valid
- That keys exist for the claimed mode

**Impact**: Client can claim any encryption mode without verification.

---

### Issue #4: Hybrid Mode Not Fully Implemented on Frontend

**Location**: `packages/shared/encryption/encryption-service.ts:250-330`

```typescript
async encryptMessage(..., mode: EncryptionMode, ...) {
  // E2EE mode with Signal Protocol
  if (mode === 'e2ee' && this.signalService && recipientUserId) {
    // Signal Protocol encryption
  }

  // Server-encrypted mode (AES-256-GCM)
  // ⚠️ This is used for BOTH 'server' AND 'hybrid' modes!
  // No double-encryption happening
}
```

**Problem**: Hybrid mode falls through to server encryption only. No E2EE layer is added.

---

### Issue #5: Link Processing for Server/Hybrid Exposes Content

**Location**: `routes/conversations.ts:1377-1385`

```typescript
if (!isEncrypted || encryptionMode !== 'e2ee') {
  // Process links for server/hybrid modes
  processedContent = trackingLinkService.processMessageLinks({
    content: content.trim(), // ⚠️ Uses plaintext content!
  });
}
```

**Problem**: For server/hybrid modes, plaintext content is processed for tracking links, which means plaintext is available on the server.

---

## Data Flow Comparison Table

| Stage | Plaintext | Server | E2EE | Hybrid |
|-------|-----------|--------|------|--------|
| **Frontend Encryption** |
| Content encrypted | No | Yes (AES) | Yes (Signal) | Yes (AES only*) |
| Content sent to server | Plaintext | Plaintext + Ciphertext | "[Encrypted]" + Ciphertext | Plaintext + Ciphertext |
| **Backend Processing** |
| Link processing | Yes | Yes | No | Yes |
| Content validation | Plaintext | Plaintext | "[Encrypted]" | Plaintext |
| **Database Storage** |
| `content` field | Plaintext | Plaintext | "[Encrypted]" | Plaintext |
| `encryptedContent` | null | Ciphertext | Ciphertext | Ciphertext |
| `encryptionMode` | null | "server" | "e2ee" | "hybrid" |
| **Translation** |
| Translated | Yes (correct) | Yes (uses plaintext) | Yes (translates placeholder!) | Yes (uses plaintext) |
| Translation source | `content` | `content` (plaintext) | `content` ("[Encrypted]") | `content` (plaintext) |
| **Security Level** |
| DB compromise protection | None | None* | Full | None* |
| Server can read | Yes | Yes | No | Yes |
| MitM protection | No | Yes (if HTTPS) | Yes | Yes |

*Note: Due to plaintext being stored alongside ciphertext

---

## Recommendations

### Critical Fixes

1. **Stop Storing Plaintext for Server/Hybrid Modes**
   - Modify `SharedEncryptionService.prepareMessage()` to always return placeholder
   - Store ONLY encrypted content in database
   - Decrypt on-demand for translation

2. **Add E2EE Check to TranslationService**
   ```typescript
   if (messageData.encryptionMode === 'e2ee') {
     logger.info('Skipping translation for E2EE message');
     return { messageId, status: 'skipped' };
   }
   ```

3. **Implement True Hybrid Encryption**
   - Add Signal Protocol E2EE layer for hybrid mode
   - Store: `{ e2ee: signalCiphertext, server: aesCiphertext }`
   - Server decrypts only AES layer for translation

4. **Backend Encryption Validation**
   - Verify encryption mode matches conversation settings
   - Validate encryption metadata format
   - Reject messages with invalid encryption claims

### Architecture Improvement

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RECOMMENDED MESSAGE FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  FRONTEND                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                     │    │
│  │  prepareMessage(content, conversationId, mode)                      │    │
│  │                                                                     │    │
│  │  → For ALL modes: return { content: '[Encrypted]', encrypted... }   │    │
│  │    (Never send plaintext to server)                                 │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│  BACKEND                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                     │    │
│  │  POST /conversations/:id/messages                                   │    │
│  │                                                                     │    │
│  │  1. Validate encryption metadata                                    │    │
│  │  2. Store ONLY encrypted content                                    │    │
│  │  3. For translation:                                                │    │
│  │     - E2EE: Skip (log and return)                                   │    │
│  │     - Server/Hybrid: Decrypt → Translate → Store translation        │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Files Modified/Affected

| File | Issue | Fix Required |
|------|-------|--------------|
| `packages/shared/encryption/encryption-service.ts:488` | Sends plaintext for server/hybrid | Return placeholder for all modes |
| `services/gateway/src/services/TranslationService.ts:142` | No E2EE check | Add encryptionMode check |
| `services/gateway/src/routes/conversations.ts:1388-1403` | Stores plaintext | Store only encrypted content |
| `services/gateway/src/routes/conversations.ts:1377` | Link processing uses plaintext | Decrypt for processing, re-encrypt |

---

*Document Version: 1.0*
*Analysis Date: January 2026*
