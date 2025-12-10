# Signal Protocol Integration Roadmap

## Current Status ✅

**Completed**:
- ✅ Shared encryption stack with adapter pattern
- ✅ AES-256-GCM encryption (server-encrypted mode)
- ✅ Key generation and management
- ✅ ECDH key pair generation
- ✅ Comprehensive test suite (44/46 passing)
- ✅ Backend and frontend crypto adapters
- ✅ @signalapp/libsignal-client library installed

**Working Encryption Modes**:
1. **Server-Encrypted Mode**: Fully functional, translation-compatible
2. **E2EE Mode**: Using pre-shared keys (simplified, not full Signal Protocol yet)

---

## Signal Protocol Integration Plan

### Overview

Integrating the full Signal Protocol involves implementing:
1. **X3DH** (Extended Triple Diffie-Hellman) - Initial key agreement
2. **Double Ratchet** - Forward secrecy for ongoing conversations
3. **Pre-key Bundles** - Asynchronous key exchange
4. **Session Management** - Track encryption sessions per conversation
5. **Out-of-Order Messages** - Handle messages arriving out of sequence

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Signal Protocol Layer                       │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌───────────────────────────────────────────────────┐  │
│  │  SignalProtocolService                            │  │
│  │  - Session management                              │  │
│  │  - Pre-key bundle generation                       │  │
│  │  - X3DH key agreement                              │  │
│  │  - Double Ratchet encryption/decryption           │  │
│  └───────────────────────────────────────────────────┘  │
│                                                           │
│  ┌────────────────┬──────────────────┬────────────────┐ │
│  │ PreKeyStore    │ SignedPreKeyStore│ SessionStore   │ │
│  │ (IndexedDB/DB) │ (IndexedDB/DB)   │ (IndexedDB/DB) │ │
│  └────────────────┴──────────────────┴────────────────┘ │
│                                                           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│         Existing Shared Encryption Service              │
│  - Uses Signal Protocol for E2EE mode                   │
│  - Uses AES-256-GCM for server mode                     │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Signal Protocol Foundation ⏳ (Current Phase)

**Goals**:
- Install Signal library ✅
- Create Signal Protocol store interfaces
- Implement basic session management
- Add pre-key bundle generation

**Files to Create**:
```
shared/encryption/
├── signal/
│   ├── signal-protocol-service.ts    (Main Signal service)
│   ├── signal-stores.ts               (Store implementations)
│   ├── signal-types.ts                (Type definitions)
│   └── index.ts                       (Exports)
```

**Tasks**:
- [ ] Define SignalProtocolStore interfaces (IdentityStore, PreKeyStore, SignedPreKeyStore, SessionStore)
- [ ] Implement Node.js Signal stores (using in-memory/database)
- [ ] Implement Browser Signal stores (using IndexedDB)
- [ ] Create SignalProtocolService wrapper
- [ ] Generate and manage pre-key bundles

**Estimated Time**: 2-3 days

---

### Phase 2: X3DH Key Agreement ⏳

**Goals**:
- Implement X3DH protocol for initial key exchange
- Handle pre-key bundle exchange between users
- Establish initial Signal Protocol session

**Implementation**:
```typescript
class SignalProtocolService {
  // Generate pre-key bundle for user
  async generatePreKeyBundle(userId: string): Promise<PreKeyBundle> {
    const identityKeyPair = await IdentityKeyPair.generate();
    const registrationId = generateRegistrationId();
    const signedPreKey = await PrivateKey.generate();
    const preKeys = await this.generatePreKeys(0, 100);

    return {
      identityKey: identityKeyPair.publicKey,
      registrationId,
      signedPreKey: {
        keyId: 1,
        publicKey: signedPreKey.publicKey,
        signature: await signedPreKey.sign(identityKeyPair.privateKey)
      },
      preKeys: preKeys.map(pk => ({
        keyId: pk.id,
        publicKey: pk.publicKey
      }))
    };
  }

  // Initiate session using recipient's pre-key bundle
  async processPreKeyBundle(
    recipientAddress: ProtocolAddress,
    preKeyBundle: PreKeyBundle
  ): Promise<void> {
    await processPreKeyBundle(
      preKeyBundle,
      recipientAddress,
      this.sessionStore,
      this.identityStore
    );
  }
}
```

**Tasks**:
- [ ] Implement pre-key bundle generation
- [ ] Add API endpoints for pre-key bundle exchange
- [ ] Process pre-key bundles to establish sessions
- [ ] Update frontend to fetch pre-key bundles

**Estimated Time**: 2-3 days

---

### Phase 3: Double Ratchet Encryption ⏳

**Goals**:
- Implement Double Ratchet algorithm for message encryption
- Add forward secrecy (message keys deleted after use)
- Handle out-of-order message delivery

**Implementation**:
```typescript
class SignalProtocolService {
  // Encrypt message using Double Ratchet
  async encryptMessage(
    recipientAddress: ProtocolAddress,
    plaintext: string
  ): Promise<CiphertextMessage> {
    const message = await signalEncrypt(
      Buffer.from(plaintext, 'utf8'),
      recipientAddress,
      this.sessionStore,
      this.identityStore
    );

    return {
      type: message.type(), // PreKeyMessage or SignalMessage
      body: message.serialize().toString('base64'),
      registrationId: await this.getRegistrationId()
    };
  }

  // Decrypt message using Double Ratchet
  async decryptMessage(
    senderAddress: ProtocolAddress,
    ciphertext: CiphertextMessage
  ): Promise<string> {
    const messageType = ciphertext.type;
    const messageBody = Buffer.from(ciphertext.body, 'base64');

    let plaintext: Buffer;
    if (messageType === MessageType.PreKey) {
      plaintext = await signalDecryptPreKey(
        PreKeySignalMessage.deserialize(messageBody),
        senderAddress,
        this.sessionStore,
        this.identityStore,
        this.preKeyStore,
        this.signedPreKeyStore
      );
    } else {
      plaintext = await signalDecrypt(
        SignalMessage.deserialize(messageBody),
        senderAddress,
        this.sessionStore,
        this.identityStore
      );
    }

    return plaintext.toString('utf8');
  }
}
```

**Tasks**:
- [ ] Wrap Signal library's encrypt/decrypt functions
- [ ] Handle PreKeyMessage vs SignalMessage
- [ ] Implement message key caching
- [ ] Add session ratcheting
- [ ] Test out-of-order message handling

**Estimated Time**: 3-4 days

---

### Phase 4: Integration with Existing System ⏳

**Goals**:
- Integrate Signal Protocol into SharedEncryptionService
- Update E2EE mode to use Signal Protocol
- Maintain backward compatibility with server-encrypted mode

**Implementation**:
```typescript
class SharedEncryptionService {
  private signalService?: SignalProtocolService;

  async encryptMessage(
    plaintext: string,
    conversationId: string,
    mode: EncryptionMode,
    recipientAddress?: ProtocolAddress
  ): Promise<EncryptedPayload> {
    if (mode === 'e2ee') {
      if (!this.signalService) {
        throw new Error('Signal Protocol not initialized');
      }

      // Use Signal Protocol for E2EE
      const ciphertext = await this.signalService.encryptMessage(
        recipientAddress!,
        plaintext
      );

      return {
        ciphertext: ciphertext.body,
        metadata: {
          mode: 'e2ee',
          protocol: 'signal_v3',
          keyId: recipientAddress!.name(),
          iv: '',
          authTag: '',
          messageType: ciphertext.type,
          registrationId: ciphertext.registrationId
        }
      };
    } else {
      // Use AES-256-GCM for server mode
      return await this.encryptWithAES(plaintext, conversationId);
    }
  }
}
```

**Tasks**:
- [ ] Add Signal Protocol to E2EE encryption flow
- [ ] Add Signal Protocol to E2EE decryption flow
- [ ] Keep server-encrypted mode using AES-256-GCM
- [ ] Update message types to include Signal metadata
- [ ] Test both encryption modes

**Estimated Time**: 2-3 days

---

### Phase 5: Pre-Key Replenishment ⏳

**Goals**:
- Monitor pre-key usage
- Automatically replenish pre-keys when low
- Handle pre-key rotation

**Implementation**:
```typescript
class PreKeyManagementService {
  async monitorPreKeyUsage(userId: string): Promise<void> {
    const unusedPreKeys = await this.countUnusedPreKeys(userId);

    if (unusedPreKeys < 10) {
      // Replenish pre-keys
      const newPreKeys = await this.generatePreKeys(100, 100);
      await this.storePreKeys(userId, newPreKeys);
      await this.uploadPreKeys(userId, newPreKeys);
    }
  }

  async rotateSignedPreKey(userId: string): Promise<void> {
    const newSignedPreKey = await this.generateSignedPreKey(userId);
    await this.storeSignedPreKey(userId, newSignedPreKey);
    await this.uploadSignedPreKey(userId, newSignedPreKey);
  }
}
```

**Tasks**:
- [ ] Add pre-key usage tracking
- [ ] Implement automatic replenishment
- [ ] Add signed pre-key rotation (weekly/monthly)
- [ ] Create background job for key management

**Estimated Time**: 1-2 days

---

### Phase 6: Group Messaging with Sender Keys ⏳

**Goals**:
- Implement Sender Keys for efficient group E2EE
- Handle group member changes (add/remove)
- Manage sender key distribution

**Implementation**:
```typescript
class SenderKeyService {
  async createSenderKey(
    groupId: string,
    distributionId: UUID
  ): Promise<SenderKeyDistributionMessage> {
    const message = await createSenderKeyDistributionMessage(
      new ProtocolAddress(groupId, distributionId),
      this.senderKeyStore
    );

    return message;
  }

  async encryptGroupMessage(
    groupId: string,
    plaintext: string
  ): Promise<CiphertextMessage> {
    const ciphertext = await groupEncrypt(
      new ProtocolAddress(groupId, 1),
      Buffer.from(plaintext, 'utf8'),
      this.senderKeyStore
    );

    return {
      type: 'senderkey',
      body: ciphertext.toString('base64')
    };
  }
}
```

**Tasks**:
- [ ] Implement SenderKeyStore
- [ ] Generate and distribute sender keys
- [ ] Encrypt/decrypt group messages
- [ ] Handle member addition (send new sender key)
- [ ] Handle member removal (rotate sender key)

**Estimated Time**: 3-4 days

---

### Phase 7: Testing & Optimization ⏳

**Goals**:
- Comprehensive Signal Protocol tests
- Performance optimization
- Security audit

**Tasks**:
- [ ] Add Signal Protocol unit tests
- [ ] Add Signal Protocol integration tests
- [ ] Test session establishment flow
- [ ] Test message encryption/decryption
- [ ] Test group messaging
- [ ] Performance benchmarks
- [ ] Security review

**Estimated Time**: 2-3 days

---

## Total Estimated Timeline

**Phase 1-4 (Core Signal Protocol)**: ~10-13 days
**Phase 5-7 (Advanced Features & Testing)**: ~6-9 days

**Total**: ~16-22 days for full Signal Protocol integration

---

## Current Recommendation

Given the scope and complexity, I recommend a **phased rollout**:

### Option A: Continue with Current Implementation ✅
- Server-encrypted mode is **production-ready** now
- E2EE mode using pre-shared keys works for **basic E2EE**
- Can be enhanced with full Signal Protocol later

### Option B: Full Signal Protocol Integration (This Roadmap)
- Implement phases 1-7 over ~3 weeks
- Production-grade E2EE with forward secrecy
- Full compatibility with Signal Protocol ecosystem

### Option C: Hybrid Approach (Recommended) ⭐
1. **Ship current implementation** for server-encrypted mode
2. Implement **Phase 1-3** for basic Signal Protocol support
3. Roll out **Phase 4-7** iteratively based on user feedback

---

## Benefits of Full Signal Protocol

✅ **Forward Secrecy**: Message keys deleted after use
✅ **Future Secrecy**: Compromise of keys doesn't affect past messages
✅ **Deniability**: Cannot prove who sent a message
✅ **Asynchronous**: Can send encrypted messages to offline users
✅ **Out-of-Order**: Handles messages arriving out of sequence
✅ **Industry Standard**: Battle-tested protocol used by Signal, WhatsApp, etc.
✅ **Group Efficiency**: Sender Keys reduce bandwidth for group messages

---

## Next Steps

Choose an option:
1. **Proceed with full Signal Protocol** - Start Phase 1 implementation
2. **Ship current E2EE** - Deploy what we have (which is already secure)
3. **Hybrid approach** - Ship now, enhance with Signal Protocol iteratively

**Recommendation**: Ship the current implementation (which is production-ready with AES-256-GCM encryption), then implement Signal Protocol in phases based on real-world usage patterns.
