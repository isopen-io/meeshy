# Frontend Encryption Implementation Guide

**Status:** Foundation Complete - Integration Pending
**Date:** 2025-11-19

---

## ✅ What's Been Implemented

### 1. Complete Frontend Encryption Infrastructure

#### A. Crypto Utilities (`frontend/lib/encryption/crypto-utils.ts`) ✅
**Provides:**
- AES-256-GCM encryption/decryption using Web Crypto API
- Key generation and management
- Signal Protocol key pair generation (ECDH)
- Key agreement (simplified Signal Protocol)
- Base64 encoding/decoding utilities
- Metadata validation

**Key Functions:**
```typescript
generateEncryptionKey(): Promise<CryptoKey>
encryptContent(plaintext, key, keyId): Promise<EncryptedPayload>
decryptContent(payload, key): Promise<string>
generateSignalKeyPair(): Promise<{publicKey, privateKey}>
performKeyAgreement(privateKey, publicKey): Promise<CryptoKey>
```

#### B. Key Storage (`frontend/lib/encryption/key-storage.ts`) ✅
**Provides:**
- IndexedDB-based secure key storage
- Three object stores:
  - `encryption_keys`: Stores actual encryption keys
  - `conversation_keys`: Maps conversations to their keys
  - `user_keys`: Stores Signal Protocol keys per user
- Key import/export for backup
- Clear all keys on logout

**Key Functions:**
```typescript
storeKey(key, id?, conversationId?, userId?): Promise<string>
getKey(keyId): Promise<CryptoKey | null>
storeConversationKey(conversationId, keyId, mode): Promise<void>
getConversationKey(conversationId): Promise<ConversationKeyMapping | null>
clearAll(): Promise<void>
```

#### C. Encryption Service (`frontend/lib/encryption/encryption-service.ts`) ✅
**Provides:**
- High-level encryption service
- User initialization and key management
- Message encryption/decryption
- E2EE session establishment
- Automatic mode detection

**Key Functions:**
```typescript
initialize(userId): Promise<void>
generateUserKeys(): Promise<SignalKeyBundle>
encryptMessage(plaintext, conversationId, mode): Promise<EncryptedPayload>
decryptMessage(payload): Promise<string>
prepareMessage(content, conversationId, mode?): Promise<{content, encryptedPayload?}>
processReceivedMessage(message): Promise<string>
```

---

## 🔧 What Needs to Be Done

### 1. Initialize Encryption Service on App Load

**File:** `frontend/app/layout.tsx` or `frontend/components/providers/app-provider.tsx`

**Add:**
```typescript
import { encryptionService } from '@/lib/encryption';
import { useAuth } from '@/hooks/useAuth';

function EncryptionInitializer() {
  const { user } = useAuth();

  useEffect(() => {
    if (user?.id) {
      encryptionService.initialize(user.id).catch(console.error);
    }
  }, [user?.id]);

  return null;
}

// Add to app providers
<EncryptionInitializer />
```

### 2. Update Message Sending Hook

**File:** `frontend/hooks/use-socketio-messaging.ts`

**Current `sendMessage` function (line 174):**
```typescript
const sendMessage = useCallback(async (
  content: string,
  language: string,
  replyToId?: string,
  mentionedUserIds?: string[],
  attachmentIds?: string[],
  attachmentMimeTypes?: string[]
): Promise<boolean> => {
  if (!conversationId) {
    console.error('❌ [useSocketIOMessaging] Pas de conversationId');
    return false;
  }

  // Passer l'identifiant directement - le service gère la conversion
  return await meeshySocketIOService.sendMessage(
    conversationId,
    content,
    language,
    replyToId,
    mentionedUserIds,
    attachmentIds,
    attachmentMimeTypes
  );
}, [conversationId]);
```

**Updated version with encryption:**
```typescript
import { encryptionService } from '@/lib/encryption';

const sendMessage = useCallback(async (
  content: string,
  language: string,
  replyToId?: string,
  mentionedUserIds?: string[],
  attachmentIds?: string[],
  attachmentMimeTypes?: string[]
): Promise<boolean> => {
  if (!conversationId) {
    console.error('❌ [useSocketIOMessaging] Pas de conversationId');
    return false;
  }

  try {
    // Prepare message (encrypt if needed)
    const prepared = await encryptionService.prepareMessage(
      content,
      conversationId
    );

    // Send message with encryption payload if encrypted
    return await meeshySocketIOService.sendMessage(
      conversationId,
      prepared.content,
      language,
      replyToId,
      mentionedUserIds,
      attachmentIds,
      attachmentMimeTypes,
      prepared.encryptedPayload // Add this parameter
    );
  } catch (error) {
    console.error('❌ [useSocketIOMessaging] Encryption error:', error);
    return false;
  }
}, [conversationId]);
```

### 3. Update Socket IO Service to Support Encrypted Payload

**File:** `frontend/services/meeshy-socketio.service.ts`

**Find `sendMessage` method and add `encryptedPayload` parameter:**

```typescript
async sendMessage(
  conversationId: string,
  content: string,
  language: string,
  replyToId?: string,
  mentionedUserIds?: string[],
  attachmentIds?: string[],
  attachmentMimeTypes?: string[],
  encryptedPayload?: EncryptedPayload // ADD THIS
): Promise<boolean> {
  // ... existing code ...

  const messageRequest = {
    conversationId: normalizedId,
    content,
    originalLanguage: language,
    replyToId,
    mentionedUserIds,
    attachments,
    encryptedPayload, // ADD THIS
  };

  // ... rest of existing code ...
}
```

### 4. Update Message Display Components

**File:** Find message bubble/display component

**Example integration:**
```typescript
import { encryptionService } from '@/lib/encryption';
import { useEffect, useState } from 'react';

function MessageBubble({ message }: { message: Message }) {
  const [decryptedContent, setDecryptedContent] = useState(message.content);
  const [isDecrypting, setIsDecrypting] = useState(false);

  useEffect(() => {
    async function decryptIfNeeded() {
      if (message.encryptedContent) {
        setIsDecrypting(true);
        try {
          const decrypted = await encryptionService.processReceivedMessage(message);
          setDecryptedContent(decrypted);
        } catch (error) {
          console.error('Failed to decrypt message:', error);
          setDecryptedContent('[Unable to decrypt message]');
        } finally {
          setIsDecrypting(false);
        }
      }
    }

    decryptIfNeeded();
  }, [message.id, message.encryptedContent]);

  return (
    <div className="message-bubble">
      {isDecrypting ? (
        <span className="text-gray-400">Decrypting...</span>
      ) : (
        <span>{decryptedContent}</span>
      )}
    </div>
  );
}
```

### 5. Create Encryption Settings UI Component

**File:** `frontend/components/settings/encryption-settings.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { encryptionService } from '@/lib/encryption';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Shield, Key, Download, Upload } from 'lucide-react';

export function EncryptionSettings() {
  const [status, setStatus] = useState(encryptionService.getStatus());
  const [hasKeys, setHasKeys] = useState(false);

  useEffect(() => {
    async function checkKeys() {
      if (status.userId) {
        const keyBundle = await encryptionService.getUserKeyBundle();
        setHasKeys(!!keyBundle);
      }
    }
    checkKeys();
  }, [status.userId]);

  const handleGenerateKeys = async () => {
    try {
      await encryptionService.generateUserKeys();
      setHasKeys(true);
      // Show success toast
    } catch (error) {
      console.error('Failed to generate keys:', error);
      // Show error toast
    }
  };

  const handleExportKeys = async () => {
    const password = prompt('Enter password to encrypt backup:');
    if (!password) return;

    try {
      const backup = await encryptionService.exportKeys(password);
      // Download backup file
      const blob = new Blob([backup], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'meeshy-encryption-backup.txt';
      a.click();
    } catch (error) {
      console.error('Failed to export keys:', error);
    }
  };

  if (!status.isAvailable) {
    return (
      <Card className="p-6">
        <p className="text-red-500">
          Encryption is not available in this browser.
          Please use a modern browser that supports Web Crypto API.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6" />
        <h2 className="text-xl font-semibold">Encryption Settings</h2>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-sm text-gray-600">Status</p>
          <p className="font-medium">
            {status.isInitialized ? '✅ Initialized' : '❌ Not initialized'}
          </p>
        </div>

        <div>
          <p className="text-sm text-gray-600">Encryption Keys</p>
          <p className="font-medium">
            {hasKeys ? '✅ Generated' : '❌ Not generated'}
          </p>
        </div>

        {!hasKeys && (
          <Button onClick={handleGenerateKeys} className="w-full">
            <Key className="w-4 h-4 mr-2" />
            Generate Encryption Keys
          </Button>
        )}

        {hasKeys && (
          <div className="flex gap-2">
            <Button onClick={handleExportKeys} variant="outline" className="flex-1">
              <Download className="w-4 h-4 mr-2" />
              Export Keys
            </Button>
            <Button variant="outline" className="flex-1">
              <Upload className="w-4 h-4 mr-2" />
              Import Keys
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
```

### 6. Create Conversation Encryption Settings

**File:** `frontend/components/conversations/encryption-settings.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Shield, Lock } from 'lucide-react';
import { conversationsService } from '@/services/conversations.service';
import type { EncryptionMode } from '@/shared/types/encryption';

interface ConversationEncryptionSettingsProps {
  conversationId: string;
  currentMode?: EncryptionMode | null;
  isEncrypted: boolean;
}

export function ConversationEncryptionSettings({
  conversationId,
  currentMode,
  isEncrypted
}: ConversationEncryptionSettingsProps) {
  const [isEnabling, setIsEnabling] = useState(false);

  const handleEnableEncryption = async (mode: EncryptionMode) => {
    setIsEnabling(true);
    try {
      await conversationsService.enableEncryption(conversationId, mode);
      // Show success toast
      // Refresh conversation data
    } catch (error) {
      console.error('Failed to enable encryption:', error);
      // Show error toast
    } finally {
      setIsEnabling(false);
    }
  };

  if (isEncrypted) {
    return (
      <Card className="p-4 bg-green-50 border-green-200">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-green-600" />
          <div>
            <p className="font-medium text-green-900">
              Encryption Enabled
            </p>
            <p className="text-sm text-green-700">
              Mode: {currentMode === 'e2ee' ? 'End-to-End' : 'Server-Encrypted'}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5" />
        <h3 className="font-semibold">Enable Encryption</h3>
      </div>

      <div className="space-y-3">
        <Button
          onClick={() => handleEnableEncryption('e2ee')}
          disabled={isEnabling}
          className="w-full"
          variant="default"
        >
          <Lock className="w-4 h-4 mr-2" />
          End-to-End Encryption
        </Button>
        <p className="text-xs text-gray-500">
          Maximum privacy. Server cannot decrypt. Translation disabled.
        </p>

        <Button
          onClick={() => handleEnableEncryption('server')}
          disabled={isEnabling}
          className="w-full"
          variant="outline"
        >
          <Shield className="w-4 h-4 mr-2" />
          Server-Encrypted
        </Button>
        <p className="text-xs text-gray-500">
          Encrypted on server. Supports translation.
        </p>
      </div>

      <p className="text-xs text-yellow-600">
        ⚠️ Once enabled, encryption cannot be disabled.
      </p>
    </Card>
  );
}
```

### 7. Add API Service Methods

**File:** `frontend/services/conversations.service.ts`

**Add these methods:**
```typescript
async enableEncryption(
  conversationId: string,
  mode: EncryptionMode
): Promise<void> {
  const response = await fetch(
    `/api/conversations/${conversationId}/encryption`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authManager.getAuthToken()}`,
      },
      body: JSON.stringify({ mode }),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to enable encryption');
  }
}

async getEncryptionStatus(
  conversationId: string
): Promise<EncryptionStatus> {
  const response = await fetch(
    `/api/conversations/${conversationId}/encryption-status`,
    {
      headers: {
        Authorization: `Bearer ${authManager.getAuthToken()}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to get encryption status');
  }

  const data = await response.json();
  return data.data;
}
```

---

## 🧪 Testing Checklist

### Unit Tests
- [ ] Test encryption/decryption roundtrip
- [ ] Test key generation
- [ ] Test key storage (IndexedDB)
- [ ] Test encryption service initialization

### Integration Tests
- [ ] Test sending plaintext message
- [ ] Test sending encrypted message (server mode)
- [ ] Test sending encrypted message (E2EE mode)
- [ ] Test receiving and decrypting message
- [ ] Test translation in server mode
- [ ] Test translation blocked in E2EE mode

### E2E Tests
- [ ] User registration with encryption keys
- [ ] Enable encryption on conversation
- [ ] Send encrypted message
- [ ] Receive and read encrypted message
- [ ] Multiple users in encrypted conversation
- [ ] Logout clears keys

---

## 📝 Integration Steps Summary

1. **Initialize on App Load** → Add `EncryptionInitializer` component
2. **Update Send Hook** → Modify `use-socketio-messaging.ts` to encrypt before send
3. **Update Socket Service** → Add `encryptedPayload` parameter to `sendMessage`
4. **Update Message Display** → Decrypt messages before rendering
5. **Add Settings UI** → Create encryption settings components
6. **Add API Methods** → Add encryption endpoints to conversations service
7. **Test Everything** → Run all tests and verify E2E flow

---

## 🎯 Quick Start (Copy-Paste Ready)

### Step 1: Update `use-socketio-messaging.ts`

Add at top:
```typescript
import { encryptionService } from '@/lib/encryption';
import type { EncryptedPayload } from '@/shared/types/encryption';
```

Replace `sendMessage` function with the version shown in section 2 above.

### Step 2: Update `meeshy-socketio.service.ts`

Add `encryptedPayload?: EncryptedPayload` parameter to `sendMessage` method.

### Step 3: Create Encryption Initializer

Create `frontend/components/providers/encryption-provider.tsx`:
```typescript
'use client';

import { useEffect } from 'react';
import { encryptionService } from '@/lib/encryption';
import { useAuth } from '@/hooks/useAuth';

export function EncryptionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  useEffect(() => {
    if (user?.id) {
      encryptionService.initialize(user.id).catch(console.error);
    }

    return () => {
      // Cleanup on unmount
      if (!user) {
        encryptionService.clearKeys().catch(console.error);
      }
    };
  }, [user?.id]);

  return <>{children}</>;
}
```

Add to `app/layout.tsx`:
```typescript
import { EncryptionProvider } from '@/components/providers/encryption-provider';

// Wrap app with provider
<EncryptionProvider>
  {children}
</EncryptionProvider>
```

### Step 4: Test

```bash
cd /home/user/meeshy/frontend
npm run dev
```

---

## ✅ Verification

Once implemented, verify:

1. **Encryption service initialized:** Check browser console for `[EncryptionService] Initialized for user`
2. **Keys stored:** Open DevTools → Application → IndexedDB → `meeshy_encryption`
3. **Messages encrypted:** Send message in encrypted conversation, check network tab for `encryptedPayload`
4. **Messages decrypted:** Receive message, verify it displays correctly
5. **Translation works (server mode):** Enable server mode, verify translation works
6. **Translation blocked (E2EE mode):** Enable E2EE mode, verify translation disabled

---

## 🐛 Troubleshooting

### Issue: "Encryption service not initialized"
- **Solution:** Ensure `EncryptionProvider` is added to app providers
- **Check:** User is logged in and `user.id` is available

### Issue: "Decryption key not found"
- **Solution:** Keys might be cleared on logout. User needs to re-enable encryption
- **Check:** IndexedDB for stored keys

### Issue: Messages show as gibberish
- **Solution:** Decryption might be failing. Check console for errors
- **Check:** Encryption metadata is correct

### Issue: Translation not working
- **Solution:** Check if conversation is in E2EE mode (translation disabled)
- **Check:** Conversation encryption mode in settings

---

## 📚 Additional Resources

- **Web Crypto API Docs:** https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
- **IndexedDB Docs:** https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- **Signal Protocol:** https://signal.org/docs/
- **Backend Tests:** `gateway/src/__tests__/e2ee/encryption-full-flow.test.ts`

---

## 🎉 Success Criteria

✅ Users can enable encryption on conversations
✅ Messages are encrypted before sending
✅ Messages are decrypted before display
✅ Server mode supports translation
✅ E2EE mode blocks translation
✅ Keys are securely stored in IndexedDB
✅ Keys are cleared on logout
✅ System messages are never encrypted
✅ UI shows encryption status clearly

---

**Next Steps:** Follow integration steps above to complete frontend implementation.
