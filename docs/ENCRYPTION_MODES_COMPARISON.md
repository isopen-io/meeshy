# Encryption Modes: E2EE vs Server-Encrypted with Translation

**Date:** November 19, 2025
**Critical Issue:** E2EE and Server-Side Translation are INCOMPATIBLE

---

## The Fundamental Conflict

### Pure E2EE (End-to-End Encryption)
```
Alice → [Encrypt with Bob's key] → Server (encrypted blob) → Bob → [Decrypt with Bob's key]
```
- ✅ **Server CANNOT read messages** (pure privacy)
- ❌ **Server CANNOT translate** (doesn't see plaintext)
- ✅ **True zero-knowledge encryption**

### Server-Side Translation
```
Alice → Server → [Read plaintext] → [Translate] → Bob
```
- ✅ **Server CAN translate** (sees plaintext)
- ❌ **Server CAN read messages** (NOT E2EE)
- ❌ **Server has access to content**

**CONCLUSION:** You must choose ONE or create TWO MODES

---

## Solution: Two Encryption Modes

### Mode 1: Pure E2EE (Maximum Privacy)

**encryptionMode: "e2ee"**

```typescript
conversation: {
  encryptionEnabledAt: "2025-11-19T14:30:00Z",
  encryptionMode: "e2ee",              // ← Pure E2EE
  encryptionProtocol: "signal_v3"
}
```

**How it works:**
1. Alice encrypts with Bob's public key (client-side)
2. Server receives encrypted blob (can't read it)
3. Server stores encrypted blob (zero-knowledge)
4. Server sends encrypted blob to Bob
5. Bob decrypts with his private key (client-side)

**Server sees:**
```json
{
  "content": "[Encrypted]",
  "encryptedContent": "aGVsbG8gd29ybGQ=...",  // ← Can't decrypt
  "encryptionMetadata": { "keyId": 123, ... }
}
```

**Features:**
- ✅ **True E2EE** - Server can't read messages
- ✅ **Perfect Forward Secrecy** - Past messages safe if keys compromised
- ✅ **Zero-knowledge** - Server stores encrypted blobs
- ❌ **NO server-side translation** - Server can't see plaintext
- ⚠️ **Client-side translation only** - Slow, large models, limited languages
- ✅ **DMA compliant** - Real E2EE for cross-platform messaging

**Translation options:**
- **Option A:** No translation (encrypted messages can't be translated)
- **Option B:** Client-side translation (browser downloads model, translates locally)
- **Option C:** User manually copies/decrypts to translate externally

---

### Mode 2: Server-Encrypted with Translation (Hybrid)

**encryptionMode: "server"**

```typescript
conversation: {
  encryptionEnabledAt: "2025-11-19T14:30:00Z",
  encryptionMode: "server",            // ← Server can decrypt
  encryptionProtocol: "aes-256-gcm",
  serverEncryptionKeyId: "key_abc123"  // ← Server's key ID
}
```

**How it works:**
1. Alice encrypts with SERVER's public key (client-side)
2. Server receives encrypted blob
3. **Server DECRYPTS with server's private key**
4. Server reads plaintext content
5. **Server TRANSLATES to target languages**
6. Server re-encrypts translations with SERVER's key
7. Server stores encrypted message + encrypted translations
8. Bob receives encrypted blob
9. Bob decrypts with client-side key (derived from server key)

**Server sees:**
```json
{
  "content": "Hello world",  // ← Server can read plaintext!
  "encryptedContent": "aGVsbG8gd29ybGQ=...",
  "originalLanguage": "en",
  "translations": {
    "fr": "Bonjour le monde",  // ← Server translated
    "es": "Hola mundo"         // ← Server translated
  }
}
```

**Features:**
- ⚠️ **NOT true E2EE** - Server can read messages
- ✅ **Server-side translation** - Fast, all languages supported
- ✅ **Encrypted in transit** - TLS encryption (server ↔ client)
- ✅ **Encrypted at rest** - Database stores encrypted blobs
- ⚠️ **Server has access** - Can read content (for translation, moderation, etc.)
- ❌ **NOT DMA compliant** - Server can decrypt (not true E2EE)

**Security model:**
- **Threat model:** Protect against database breaches, network sniffing
- **NOT protected:** Server admin, government subpoena, server compromise
- **Use case:** Users who want both encryption AND translation

---

## Comparison Table

| Feature | Pure E2EE (`e2ee`) | Server-Encrypted (`server`) | Plaintext (no encryption) |
|---------|-------------------|----------------------------|---------------------------|
| **Server can read messages** | ❌ NO | ✅ YES | ✅ YES |
| **Server-side translation** | ❌ NO | ✅ YES | ✅ YES |
| **Encrypted in database** | ✅ YES | ✅ YES | ❌ NO |
| **Encrypted in transit** | ✅ YES | ✅ YES | ✅ TLS only |
| **True E2EE** | ✅ YES | ❌ NO | ❌ NO |
| **DMA compliant** | ✅ YES | ❌ NO | ❌ NO |
| **Perfect Forward Secrecy** | ✅ YES | ❌ NO | ❌ NO |
| **Server search** | ❌ NO | ⚠️ Limited | ✅ YES |
| **Client-side translation** | ⚠️ Possible | ⚠️ Possible | ⚠️ Possible |
| **Performance** | Slower (client crypto) | Fast (server crypto) | Fastest |
| **Use case** | Maximum privacy | Privacy + features | Public/community |

---

## Schema Design (Updated)

### Conversation Model

```prisma
model Conversation {
  id                    String     @id @default(auto()) @map("_id") @db.ObjectId
  identifier            String     @unique
  type                  String

  // ENCRYPTION CONTROL
  encryptionEnabledAt   DateTime?  // null = plaintext, non-null = encrypted
  encryptionMode        String?    // "e2ee" | "server" (null if encryptionEnabledAt = null)
  encryptionProtocol    String?    // "signal_v3" (for e2ee) | "aes-256-gcm" (for server)
  encryptionEnabledBy   String?    @db.ObjectId

  // SERVER-MODE ENCRYPTION
  serverEncryptionKeyId String?    // Key ID for server-mode decryption (null for e2ee)

  // AUTO-TRANSLATION SETTING (only works in server mode)
  autoTranslateEnabled  Boolean    @default(false)

  // ... other fields
}
```

**Field Logic:**

```typescript
// Plaintext conversation
{
  encryptionEnabledAt: null,
  encryptionMode: null,
  autoTranslateEnabled: true  // ✅ Works
}

// E2EE conversation
{
  encryptionEnabledAt: "2025-11-19T14:30:00Z",
  encryptionMode: "e2ee",
  serverEncryptionKeyId: null,
  autoTranslateEnabled: false  // ❌ Can't translate (server can't decrypt)
}

// Server-encrypted conversation
{
  encryptionEnabledAt: "2025-11-19T14:30:00Z",
  encryptionMode: "server",
  serverEncryptionKeyId: "key_abc123",
  autoTranslateEnabled: true  // ✅ Works (server can decrypt)
}
```

---

## Message Flow Comparison

### Flow 1: E2EE Mode (No Translation)

```
┌─────────┐                    ┌────────┐                    ┌─────────┐
│ Alice   │                    │ Server │                    │   Bob   │
│ (en)    │                    │        │                    │ (fr)    │
└─────────┘                    └────────┘                    └─────────┘
     │                              │                              │
     │ 1. Type: "Hello"             │                              │
     │    (plaintext)               │                              │
     │                              │                              │
     │ 2. Encrypt with Bob's        │                              │
     │    public key (Signal)       │                              │
     │    → ciphertext              │                              │
     │                              │                              │
     │ 3. POST /messages            │                              │
     ├─────────────────────────────>│                              │
     │ {                            │                              │
     │   content: "[Encrypted]",    │ 4. Store encrypted blob     │
     │   encryptedContent: "a3Bh"   │    (can't read it)          │
     │ }                            │                              │
     │                              │                              │
     │                              │ 5. Forward encrypted blob   │
     │                              ├─────────────────────────────>│
     │                              │                              │
     │                              │                          6. Decrypt
     │                              │                             with Bob's
     │                              │                             private key
     │                              │                              │
     │                              │                          7. Display:
     │                              │                             "Hello"
     │                              │                             (en)
     │                              │                              │
     │                              │                          ❌ NO translation
     │                              │                             Bob sees English
```

**Server logs:**
```
[INFO] Message received: [Encrypted blob - can't read]
[INFO] Storing encrypted message
[INFO] Forwarding to recipient
```

---

### Flow 2: Server-Encrypted Mode (With Translation)

```
┌─────────┐                    ┌────────┐                    ┌─────────┐
│ Alice   │                    │ Server │                    │   Bob   │
│ (en)    │                    │        │                    │ (fr)    │
└─────────┘                    └────────┘                    └─────────┘
     │                              │                              │
     │ 1. Type: "Hello"             │                              │
     │    (plaintext)               │                              │
     │                              │                              │
     │ 2. Encrypt with server's     │                              │
     │    public key (AES-256)      │                              │
     │    → ciphertext              │                              │
     │                              │                              │
     │ 3. POST /messages            │                              │
     ├─────────────────────────────>│                              │
     │ {                            │ 4. Decrypt with server key  │
     │   encryptedContent: "a3Bh"   │    → "Hello"                │
     │ }                            │                              │
     │                              │ 5. Detect language: en      │
     │                              │                              │
     │                              │ 6. Translate to fr:         │
     │                              │    "Bonjour"                │
     │                              │                              │
     │                              │ 7. Store:                   │
     │                              │    - Original (encrypted)   │
     │                              │    - Translation (encrypted)│
     │                              │                              │
     │                              │ 8. Re-encrypt both          │
     │                              │    with server key          │
     │                              │                              │
     │                              │ 9. Forward to Bob           │
     │                              ├─────────────────────────────>│
     │                              │ {                            │
     │                              │   encryptedContent: "...",   │
     │                              │   translations: {            │
     │                              │     fr: "encrypted..."       │
     │                              │   }                          │
     │                              │ }                            │
     │                              │                          10. Decrypt
     │                              │                              │
     │                              │                          11. Display:
     │                              │                              "Bonjour"
     │                              │                              (fr)
     │                              │                              │
     │                              │                          ✅ Translated!
```

**Server logs:**
```
[INFO] Message received (encrypted)
[INFO] Decrypting with server key
[INFO] Plaintext: "Hello"
[INFO] Detected language: en
[INFO] Translating en → fr
[INFO] Translation: "Bonjour"
[INFO] Storing encrypted message + translation
[INFO] Forwarding to recipient
```

---

## Key Management

### E2EE Mode (User Keys Only)

```typescript
// User A (Alice)
{
  signalIdentityKeyPublic: "pub_key_alice",
  signalIdentityKeyPrivate: "encrypted_priv_key_alice",  // Encrypted with Alice's password
  signalRegistrationId: 12345
}

// User B (Bob)
{
  signalIdentityKeyPublic: "pub_key_bob",
  signalIdentityKeyPrivate: "encrypted_priv_key_bob",    // Encrypted with Bob's password
  signalRegistrationId: 67890
}

// Conversation
{
  encryptionMode: "e2ee",
  serverEncryptionKeyId: null  // ← Server has NO key
}
```

**Encryption:**
- Alice encrypts with Bob's `signalIdentityKeyPublic`
- Only Bob can decrypt with his `signalIdentityKeyPrivate`
- Server has NO access to private keys

---

### Server Mode (Server Key + User Keys)

```typescript
// Server (stored in vault/secrets manager)
{
  encryptionKeys: [
    {
      keyId: "key_abc123",
      algorithm: "aes-256-gcm",
      publicKey: "server_pub_key",
      privateKey: "server_priv_key",  // ← Server can decrypt
      createdAt: "2025-11-19",
      rotatedAt: null
    }
  ]
}

// Conversation
{
  encryptionMode: "server",
  serverEncryptionKeyId: "key_abc123",  // ← Points to server's key
  encryptionProtocol: "aes-256-gcm"
}
```

**Encryption:**
- Alice encrypts with server's `publicKey`
- Server decrypts with server's `privateKey`
- Server can read, translate, moderate content
- Server re-encrypts before storing/forwarding

---

## Translation Logic

### E2EE Mode

```typescript
async function sendMessage(conversationId: string, content: string) {
  const conversation = await getConversation(conversationId);

  if (conversation.encryptionMode === "e2ee") {
    // Encrypt client-side
    const encrypted = await signalProtocol.encrypt(content, recipientPublicKey);

    // Send to server
    await api.post("/messages", {
      conversationId,
      content: "[Encrypted]",
      encryptedContent: encrypted.ciphertext,
      encryptionMetadata: encrypted.metadata
    });

    // ❌ Server can't translate (doesn't see plaintext)
    // User sees encrypted message, decrypts client-side
    // Translation must happen client-side (if at all)
  }
}
```

**Translation options for E2EE:**
1. **No translation** - Accept that encrypted messages aren't translated
2. **Client-side translation** - Download model to browser, translate locally (slow, limited)
3. **Manual translation** - User copies text to external translator

---

### Server Mode

```typescript
async function sendMessage(conversationId: string, content: string) {
  const conversation = await getConversation(conversationId);

  if (conversation.encryptionMode === "server") {
    // Encrypt client-side with server's public key
    const encrypted = await aes256.encrypt(content, serverPublicKey);

    // Send to server
    await api.post("/messages", {
      conversationId,
      encryptedContent: encrypted.ciphertext
    });

    // ✅ Server decrypts, translates, re-encrypts
    // Server-side (in MessagingService):
    const serverPrivateKey = await getServerKey(conversation.serverEncryptionKeyId);
    const plaintext = await aes256.decrypt(encryptedContent, serverPrivateKey);

    // Translate
    const translations = await translateMessage(plaintext, targetLanguages);

    // Re-encrypt everything
    const encryptedMessage = await aes256.encrypt(plaintext, serverPublicKey);
    const encryptedTranslations = {};
    for (const [lang, text] of Object.entries(translations)) {
      encryptedTranslations[lang] = await aes256.encrypt(text, serverPublicKey);
    }

    // Store encrypted
    await prisma.message.create({
      data: {
        conversationId,
        content: "[Encrypted]",
        encryptedContent: encryptedMessage,
        translations: encryptedTranslations  // ← Encrypted translations
      }
    });
  }
}
```

---

## User Experience

### E2EE Mode

**UI Warning:**
```
┌──────────────────────────────────────────────────────┐
│  ⚠️  End-to-End Encryption Enabled                   │
│                                                       │
│  Messages are encrypted with maximum security.       │
│                                                       │
│  ❌ Server-side translation is DISABLED               │
│     (Server cannot read encrypted messages)          │
│                                                       │
│  You can:                                            │
│  • Read messages in original language               │
│  • Copy text to translate externally                │
│  • Switch to Server-Encrypted mode for translation  │
│                                                       │
│  [Keep E2EE]  [Switch to Server-Encrypted]          │
└──────────────────────────────────────────────────────┘
```

**Message Display:**
```
┌──────────────────────────────┐
│  🔒 Alice (English)           │
│  "Hello world"                │
│  [Original - not translated]  │
└──────────────────────────────┘
```

---

### Server Mode

**UI Indicator:**
```
┌──────────────────────────────────────────────────────┐
│  🔐 Server-Encrypted Mode Enabled                    │
│                                                       │
│  Messages are encrypted but server can translate.    │
│                                                       │
│  ✅ Server-side translation is ENABLED                │
│     (Server decrypts to translate)                   │
│                                                       │
│  ⚠️  Server can read message content                  │
│     (Not true end-to-end encryption)                 │
│                                                       │
│  [Keep Server-Encrypted]  [Upgrade to E2EE]          │
└──────────────────────────────────────────────────────┘
```

**Message Display:**
```
┌──────────────────────────────┐
│  🔐 Alice (English)           │
│  "Bonjour le monde"           │
│  [Translated to French]       │
│                               │
│  [Show Original] [Show All]   │
└──────────────────────────────┘
```

---

## Migration Between Modes

### Can user switch modes?

**E2EE → Server Mode:**
```typescript
// ⚠️ SECURITY DOWNGRADE - Warn user
async function downgradeToServerMode(conversationId: string) {
  // Show warning
  const confirmed = await showWarning({
    title: "Downgrade Encryption?",
    message:
      "Switching to Server-Encrypted mode will allow the server to read your messages. " +
      "This enables translation but reduces privacy. " +
      "This action cannot be undone.",
    type: "warning"
  });

  if (!confirmed) return;

  // Generate server key for conversation
  const serverKey = await generateServerKey();

  // Update conversation
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      encryptionMode: "server",
      serverEncryptionKeyId: serverKey.id,
      autoTranslateEnabled: true
    }
  });

  // ❌ Past E2EE messages CANNOT be translated (server doesn't have keys)
  // ✅ Future messages will be server-encrypted and translatable
}
```

**Server Mode → E2EE:**
```typescript
// ✅ SECURITY UPGRADE - Allow
async function upgradeToE2EE(conversationId: string) {
  const confirmed = await showConfirmation({
    title: "Upgrade to E2EE?",
    message:
      "Switching to End-to-End Encryption will maximize your privacy. " +
      "Server-side translation will be disabled. " +
      "Continue?",
    type: "info"
  });

  if (!confirmed) return;

  // Update conversation
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      encryptionMode: "e2ee",
      serverEncryptionKeyId: null,  // ← Remove server key
      autoTranslateEnabled: false    // ← Disable translation
    }
  });

  // ✅ Past server-encrypted messages remain readable (stored encrypted)
  // ✅ Future messages will be E2EE
}
```

---

## Recommendation

### Default per conversation type:

```typescript
const defaults = {
  // Direct messages (1:1)
  direct: {
    encryptionMode: "server",      // ← Translation useful for international chats
    autoTranslateEnabled: true
  },

  // Group chats
  group: {
    encryptionMode: "server",      // ← Translation useful for multilingual groups
    autoTranslateEnabled: true
  },

  // Public communities
  public: {
    encryptionMode: null,          // ← No encryption (searchable, public)
    autoTranslateEnabled: true
  },

  // DMA interoperability
  dma: {
    encryptionMode: "e2ee",        // ← REQUIRED for DMA compliance
    autoTranslateEnabled: false    // ← Can't translate E2EE
  }
};
```

### User choice:

```tsx
<ConversationSettings>
  <EncryptionModeSelector
    value={conversation.encryptionMode}
    onChange={handleChangeMode}
  >
    <Option value={null}>
      <NoEncryptionIcon />
      <span>Plaintext (No Encryption)</span>
      <Features>
        ✅ Server-side translation
        ✅ Search
        ✅ Fast
        ❌ Not encrypted
      </Features>
    </Option>

    <Option value="server">
      <ServerEncryptedIcon />
      <span>Server-Encrypted (Recommended)</span>
      <Features>
        ✅ Server-side translation
        ✅ Encrypted in database
        ✅ Encrypted in transit
        ⚠️ Server can read messages
      </Features>
    </Option>

    <Option value="e2ee">
      <E2EEIcon />
      <span>End-to-End Encrypted (Maximum Privacy)</span>
      <Features>
        ✅ True E2EE
        ✅ Perfect Forward Secrecy
        ✅ Zero-knowledge
        ❌ No server-side translation
        ❌ No search
      </Features>
    </Option>
  </EncryptionModeSelector>
</ConversationSettings>
```

---

## Summary

| Mode | Server can read? | Translation works? | True E2EE? | DMA Compliant? | Use Case |
|------|-----------------|-------------------|-----------|---------------|----------|
| **Plaintext** | ✅ YES | ✅ YES | ❌ NO | ❌ NO | Public communities |
| **Server-Encrypted** | ✅ YES | ✅ YES | ❌ NO | ❌ NO | Private chats with translation |
| **E2EE** | ❌ NO | ❌ NO | ✅ YES | ✅ YES | Maximum privacy, DMA |

**Recommendation:**
- **Default:** Server-Encrypted (best balance of privacy + features)
- **Option:** E2EE (for users who prioritize privacy over translation)
- **DMA:** E2EE (required for regulatory compliance)

---

**Ready to implement hybrid encryption modes?** 🚀
