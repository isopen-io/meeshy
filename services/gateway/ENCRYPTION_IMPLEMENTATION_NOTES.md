# E2EE Key Exchange Implementation Notes

## Summary
Implemented key exchange routes for End-to-End Encryption (E2EE) in the Meeshy gateway service.

## Files Created/Modified

### 1. Created: `/Users/smpceo/Documents/v2_meeshy/services/gateway/src/routes/encryption-keys.ts`

New route file implementing three key exchange endpoints:

#### **POST** `/api/conversations/:conversationId/keys/exchange`
- **Purpose**: Exchange public keys with other participants in a conversation
- **Functionality**:
  - Stores user's public key for E2EE
  - Returns other participants' public keys if available
  - Validates conversation membership and E2EE enablement
  - Validates key format (base64 encoding)
- **Request Body**:
  ```typescript
  {
    publicKey: string;       // Base64 encoded public key
    keyType: 'identity' | 'preKey' | 'signedPreKey';
    keyId?: number;
    signature?: string;
  }
  ```
- **Response**:
  ```typescript
  {
    success: true,
    data: {
      stored: {
        keyType: string,
        keyId: number,
        createdAt: Date
      },
      participantKeys: [
        {
          userId: string,
          username: string,
          publicKey: string,
          keyType: string,
          keyId: number,
          signature: string
        }
      ]
    }
  }
  ```

#### **GET** `/api/conversations/:conversationId/keys/bundle`
- **Purpose**: Get pre-key bundle for Signal Protocol initialization
- **Functionality**:
  - Returns user's complete pre-key bundle
  - Auto-generates bundle if none exists
  - Uses `encryptionService.generatePreKeyBundle()`
  - Validates conversation membership and E2EE enablement
- **Response**:
  ```typescript
  {
    success: true,
    data: {
      identityKey: string,
      registrationId: number,
      deviceId: number,
      preKeyId: number | null,
      preKeyPublic: string | null,
      signedPreKeyId: number,
      signedPreKeyPublic: string,
      signedPreKeySignature: string,
      kyberPreKeyId: number | null,
      kyberPreKeyPublic: string | null,
      kyberPreKeySignature: string | null,
      createdAt: Date,
      lastRotatedAt: Date
    }
  }
  ```

#### **POST** `/api/conversations/:conversationId/keys/publish`
- **Purpose**: Publish user's pre-key bundle to the server
- **Functionality**:
  - Stores client-generated pre-key bundles
  - Validates all required fields
  - Validates base64 encoding of all keys
  - Allows other participants to retrieve bundle for session establishment
- **Request Body**:
  ```typescript
  {
    identityKey: string,
    registrationId: number,
    deviceId: number,
    preKeyId: number | null,
    preKeyPublic: string | null,
    signedPreKeyId: number,
    signedPreKeyPublic: string,
    signedPreKeySignature: string,
    kyberPreKeyId?: number | null,
    kyberPreKeyPublic?: string | null,
    kyberPreKeySignature?: string | null
  }
  ```

### 2. Modified: `/Users/smpceo/Documents/v2_meeshy/services/gateway/src/server.ts`

Added imports and route registrations:

```typescript
// Added imports (lines 48-49)
import conversationEncryptionRoutes from './routes/conversation-encryption';
import encryptionKeysRoutes from './routes/encryption-keys';

// Added route registrations (lines 687-691)
await this.server.register(conversationEncryptionRoutes, { prefix: '' });
await this.server.register(encryptionKeysRoutes, { prefix: '' });
```

### 3. Modified: `/Users/smpceo/Documents/v2_meeshy/services/gateway/src/routes/conversations.ts`

Updated message sending to support encrypted messages:

#### Updated `SendMessageBody` interface (lines 266-276):
```typescript
interface SendMessageBody {
  content: string;
  originalLanguage?: string;
  messageType?: 'text' | 'image' | 'file' | 'system';
  replyToId?: string;
  // Encryption fields
  encryptedContent?: string;
  encryptionMode?: 'e2ee' | 'server' | 'hybrid';
  encryptionMetadata?: Record<string, any>;
  isEncrypted?: boolean;
}
```

#### Updated message creation logic (lines 1288-1405):
- Extracts encryption fields from request body
- Validates encrypted content when `isEncrypted` is true
- Validates encryption mode ('e2ee', 'server', or 'hybrid')
- Validates encryption metadata presence
- Skips link processing for E2EE messages (links cannot be processed server-side)
- Stores encryption fields in database when creating message

## Security Features

1. **Authentication Required**: All endpoints require authenticated users (no anonymous access)
2. **Conversation Membership Validation**: Verifies user is a member before key exchange
3. **E2EE Enablement Check**: Ensures conversation has E2EE enabled before operations
4. **Key Format Validation**: Validates base64 encoding of all public keys
5. **Required Field Validation**: Ensures all necessary encryption fields are present

## Database Schema Compatibility

The implementation uses existing Prisma models:

### Message Model (already exists)
```prisma
model Message {
  // ... other fields ...
  encryptedContent   String?   // Encrypted content (base64 encoded ciphertext)
  encryptionMode     String?   // 'server', 'e2ee', 'hybrid'
  encryptionMetadata Json?     // IV, auth tag, key version, etc.
  isEncrypted        Boolean   @default(false)
}
```

### SignalPreKeyBundle Model (already exists)
```prisma
model SignalPreKeyBundle {
  id                    String   @id @default(auto()) @map("_id") @db.ObjectId
  userId                String   @unique @db.ObjectId
  identityKey           String
  registrationId        Int
  deviceId              Int      @default(1)
  preKeyId              Int?
  preKeyPublic          String?
  signedPreKeyId        Int
  signedPreKeyPublic    String
  signedPreKeySignature String
  kyberPreKeyId         Int?
  kyberPreKeyPublic     String?
  kyberPreKeySignature  String?
  isActive              Boolean  @default(true)
  createdAt             DateTime @default(now())
  lastRotatedAt         DateTime @default(now())
  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### REQUIRED: ConversationPublicKey Model (NEEDS TO BE ADDED)

**This model is used by the `/keys/exchange` endpoint but does not exist in the schema yet.**

You need to add this model to `/Users/smpceo/Documents/v2_meeshy/packages/shared/prisma/schema.prisma`:

```prisma
/// Public keys exchanged between conversation participants for E2EE
model ConversationPublicKey {
  id             String   @id @default(auto()) @map("_id") @db.ObjectId
  userId         String   @db.ObjectId
  conversationId String   @db.ObjectId
  keyType        String   // 'identity', 'preKey', 'signedPreKey'
  publicKey      String   // Base64 encoded public key
  keyId          Int?     // Optional key ID
  signature      String?  // Optional signature
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@unique([userId, conversationId, keyType], name: "userId_conversationId_keyType")
  @@index([conversationId])
  @@index([userId])
  @@map("conversation_public_keys")
}
```

After adding this model:
1. Run `npx prisma generate` to update the Prisma client
2. Run `npx prisma db push` or create a migration to add the table to the database

## Encryption Modes

The implementation supports three encryption modes:

1. **e2ee** (End-to-End Encryption):
   - Full Signal Protocol encryption
   - Messages encrypted client-side only
   - Server cannot decrypt or translate
   - Link processing skipped (server cannot see content)

2. **server** (Server-Side Encryption):
   - AES-256-GCM encryption on server
   - Server can decrypt for translation
   - Link processing supported

3. **hybrid** (Double Encryption):
   - Both E2EE and server-side encryption
   - E2EE layer for end-to-end security
   - Server layer for translation support
   - Client encrypts with Signal Protocol, server adds AES-256-GCM layer

## Integration with EncryptionService

The routes use the existing `EncryptionService` from `/Users/smpceo/Documents/v2_meeshy/services/gateway/src/services/EncryptionService.ts`:

- `getEncryptionService(prisma)`: Gets the encryption service singleton
- `generatePreKeyBundle()`: Generates Signal Protocol pre-key bundles
- `getOrCreateConversationKey()`: Gets or creates server encryption keys

## Testing Recommendations

1. **Key Exchange Flow**:
   - Test publishing a pre-key bundle
   - Test retrieving another user's bundle
   - Test key exchange in a conversation

2. **Encrypted Message Flow**:
   - Test sending E2EE encrypted message
   - Test sending server-encrypted message
   - Test sending hybrid-encrypted message
   - Verify encrypted fields are stored correctly

3. **Validation**:
   - Test with invalid base64 keys
   - Test without required fields
   - Test with non-E2EE conversations
   - Test with non-member users

4. **Edge Cases**:
   - Test auto-generation of pre-key bundle
   - Test updating existing keys
   - Test with expired or rotated keys

## Next Steps

1. **Add ConversationPublicKey model to Prisma schema** (REQUIRED)
2. Implement client-side Signal Protocol integration
3. Implement key rotation policies
4. Add key expiration handling
5. Implement hybrid encryption translation flow
6. Add rate limiting for key exchange endpoints
7. Add audit logging for key operations
8. Implement key verification mechanisms
9. Add support for multiple devices per user
10. Implement pre-key replenishment when consumed

## API Documentation

The routes follow the existing API patterns:
- Use `createUnifiedAuthMiddleware` for authentication
- Return standard `{ success: boolean, data?: any, error?: string }` responses
- Use proper HTTP status codes (200, 400, 403, 404, 500)
- Include descriptive error messages
- Log operations with `[EncryptionKeys]` prefix

## Security Considerations

1. **Key Storage**: Pre-key bundles are stored in plaintext (public keys only)
2. **Private Keys**: Never transmitted or stored on server (client-side only)
3. **Key Rotation**: Should implement periodic rotation of signed pre-keys
4. **Key Consumption**: One-time pre-keys should be consumed after first use
5. **Audit Trail**: Consider adding audit logs for all key operations
6. **Rate Limiting**: Should add rate limiting to prevent abuse
7. **Key Verification**: Should implement out-of-band key verification

## Performance Considerations

1. Database indexes on `userId_conversationId_keyType` for fast lookups
2. Upsert operations to avoid race conditions
3. Efficient query patterns using Prisma select
4. Minimal database roundtrips

## Compatibility

- TypeScript: Fully typed interfaces and parameters
- Fastify: Uses standard Fastify route patterns
- Prisma: Compatible with existing schema (except ConversationPublicKey)
- Signal Protocol: Compatible with libsignal-client bundle format
