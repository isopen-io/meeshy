# APNs Environment Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre au gateway d'envoyer des push APNs aussi bien aux builds Xcode debug (sandbox) qu'aux builds TestFlight/App Store (production), pour que les notifications iOS fonctionnent dans tous les environnements.

**Architecture:** Le mismatch actuel — iOS debug (`aps-environment=development`, sandbox token) vs gateway prod (`APNS_ENVIRONMENT=production`) — fait que Apple répond `BadDeviceToken` et le gateway désactive le token. On résout en (1) ajoutant un champ `apnsEnvironment` au modèle `PushToken`, (2) instanciant **deux** Provider `@parse/node-apn` côté gateway (sandbox + production) et routant par token, (3) propageant l'environnement depuis iOS via `#if DEBUG` dans la requête de registration.

**Tech Stack:** Prisma (MongoDB), Fastify 5 + Zod (gateway), `@parse/node-apn`, Swift 6 + URLSession (iOS SDK), XCTest (iOS), Jest (gateway).

---

## File Structure

**Modifier (gateway):**
- `packages/shared/prisma/schema.prisma` — ajouter `apnsEnvironment` au modèle `PushToken`
- `services/gateway/src/routes/push-tokens.ts` — accepter et persister `apnsEnvironment`
- `services/gateway/src/services/PushNotificationService.ts` — deux apnsClients + routing par token
- `services/gateway/src/__tests__/notifications-firebase.test.ts` — étendre avec test routing

**Modifier (iOS SDK):**
- `packages/MeeshySDK/Sources/MeeshySDK/Models/NotificationModels.swift` — ajouter `apnsEnvironment`
- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushNotificationManager.swift` — propager `apnsEnvironment`

**Créer (iOS SDK tests):**
- `packages/MeeshySDK/Tests/MeeshySDKTests/Notifications/PushNotificationManagerTests.swift`

**Modifier (iOS app):**
- `apps/ios/Meeshy/Features/Main/Services/VoIPPushManager.swift` — propager `apnsEnvironment` pour VoIP token

**Créer (one-shot script):**
- `services/gateway/scripts/reactivate-apns-tokens.ts` — réactiver les tokens deactivés afin que les utilisateurs existants reprennent les notifications après deploy

---

## Task 1 : Étendre le modèle Prisma `PushToken`

**Files:**
- Modify: `packages/shared/prisma/schema.prisma`

- [ ] **Step 1.1 : Ajouter le champ `apnsEnvironment` à `PushToken`**

Ouvrir `packages/shared/prisma/schema.prisma`, localiser le modèle `PushToken`, ajouter le champ après `bundleId`. Le champ est nullable et par défaut `"production"` pour préserver la compat des tokens FCM/Android et des tokens APNs existants déjà émis sur des builds TestFlight/App Store.

```prisma
  /// App bundle ID (e.g., "com.meeshy.app", "com.meeshy.app.voip")
  bundleId   String?

  /// APNs environment for this token: "development" (sandbox) or "production".
  /// Required to route APNs sends to the correct Apple endpoint
  /// (api.sandbox.push.apple.com vs api.push.apple.com). Sandbox tokens come
  /// from iOS debug builds (aps-environment=development); production tokens
  /// come from TestFlight/App Store builds. Sending a sandbox token to the
  /// production endpoint (or vice versa) returns BadDeviceToken from Apple.
  /// Null/missing = "production" (safe default for legacy rows).
  apnsEnvironment String?  @default("production")

  /// Whether this token is currently active/valid
  isActive  Boolean  @default(true)
```

- [ ] **Step 1.2 : Régénérer le client Prisma**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/shared && pnpm exec prisma generate
```

Expected: `Generated Prisma Client (X.X.X) to ./node_modules/@prisma/client`. Aucune migration SQL puisque MongoDB n'en utilise pas — le schéma se met à jour à l'écriture du document.

- [ ] **Step 1.3 : Vérifier la compilation TypeScript du gateway**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway && pnpm tsc --noEmit
```

Expected: aucune erreur TypeScript. Si erreur, c'est que le client Prisma n'a pas été régénéré.

- [ ] **Step 1.4 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add packages/shared/prisma/schema.prisma
git commit -m "feat(schema): add apnsEnvironment to PushToken for sandbox/prod routing"
```

---

## Task 2 : Gateway — accepter `apnsEnvironment` dans la registration

**Files:**
- Modify: `services/gateway/src/routes/push-tokens.ts:22-47` (zod schema)
- Modify: `services/gateway/src/routes/push-tokens.ts:69-113` (Fastify body schema for OpenAPI)
- Modify: `services/gateway/src/routes/push-tokens.ts:160-199` (upsert payload)

- [ ] **Step 2.1 : Étendre le schema Zod**

Dans `services/gateway/src/routes/push-tokens.ts`, modifier `registerDeviceTokenSchema` (lignes 22-47) — ajouter le champ `apnsEnvironment` après `bundleId`, optionnel, restreint aux deux valeurs autorisées :

```ts
const registerDeviceTokenSchema = z.object({
  // The push token from the device (accept both 'token' and 'apnsToken' for iOS compatibility)
  token: z.string().min(10).max(500).optional(),
  apnsToken: z.string().min(10).max(500).optional(),

  // Token type: apns (Apple Push), fcm (Firebase), voip (Apple VoIP)
  type: z.enum(['apns', 'fcm', 'voip']).optional(),

  // Platform: ios, android, web
  platform: z.enum(['ios', 'android', 'web']),

  // Optional device identifier for managing multiple devices
  deviceId: z.string().max(255).optional(),

  // Optional device name for user identification
  deviceName: z.string().max(100).optional(),

  // App version for compatibility tracking
  appVersion: z.string().max(50).optional(),

  // Bundle ID for the app
  bundleId: z.string().max(255).optional(),

  // APNs environment for the token: "development" (sandbox) or "production".
  // Sent by iOS clients based on their build flavor (debug vs release).
  // Optional for FCM/Android tokens; defaults to "production" when omitted.
  apnsEnvironment: z.enum(['development', 'production']).optional(),
}).refine(
  (data) => data.token || data.apnsToken,
  { message: 'Either token or apnsToken must be provided' }
);
```

- [ ] **Step 2.2 : Étendre le schema Fastify (OpenAPI)**

Toujours dans `push-tokens.ts`, dans le bloc `schema.body.properties` (lignes 75-113), ajouter la propriété `apnsEnvironment` après `bundleId` :

```ts
          bundleId: {
            type: 'string',
            maxLength: 255,
            description: 'App bundle identifier'
          },
          apnsEnvironment: {
            type: 'string',
            enum: ['development', 'production'],
            description: 'APNs environment for the token (iOS only). Required to route to api.sandbox.push.apple.com vs api.push.apple.com.'
          }
```

- [ ] **Step 2.3 : Persister le champ dans l'upsert**

Dans le handler de `POST /users/register-device-token` (lignes 138-216), modifier le bloc upsert pour inclure `apnsEnvironment` à la fois dans `update` et `create`. Calculer une valeur par défaut sûre : pour `type === 'apns'` ou `type === 'voip'`, défaut à `"production"` si non fourni ; pour `fcm`, conserver `null`.

```ts
      const tokenType = body.type || (body.platform === 'ios' ? 'apns' : 'fcm');

      // APNs environment is meaningful only for apns/voip tokens. Default to
      // "production" so legacy clients that don't send the field stay routed
      // to the production endpoint (matches pre-fix behaviour).
      const isApnsLike = tokenType === 'apns' || tokenType === 'voip';
      const apnsEnvironment = isApnsLike
        ? (body.apnsEnvironment ?? 'production')
        : null;

      fastify.log.info(`[PUSH_TOKEN] Registering ${tokenType} token for user ${userId} on ${body.platform} (apnsEnv=${apnsEnvironment ?? 'n/a'})`);

      // Upsert the token (create or update if exists)
      const pushToken = await fastify.prisma.pushToken.upsert({
        where: {
          userId_token_type: {
            userId,
            token,
            type: tokenType
          }
        },
        update: {
          platform: body.platform,
          deviceId: body.deviceId,
          deviceName: body.deviceName,
          appVersion: body.appVersion,
          bundleId: body.bundleId,
          apnsEnvironment,
          isActive: true,
          failedAttempts: 0,
          lastError: null,
          updatedAt: new Date()
        },
        create: {
          userId,
          token,
          type: tokenType,
          platform: body.platform,
          deviceId: body.deviceId,
          deviceName: body.deviceName,
          appVersion: body.appVersion,
          bundleId: body.bundleId,
          apnsEnvironment,
          isActive: true
        },
        select: {
          id: true,
          type: true,
          platform: true,
          deviceName: true,
          createdAt: true,
          updatedAt: true
        }
      });
```

- [ ] **Step 2.4 : Vérifier la compilation**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway && pnpm tsc --noEmit
```

Expected: pas d'erreur. Si erreur sur `apnsEnvironment`, vérifier que le client Prisma a bien été régénéré (Step 1.2).

- [ ] **Step 2.5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add services/gateway/src/routes/push-tokens.ts
git commit -m "feat(gateway): accept apnsEnvironment in /register-device-token"
```

---

## Task 3 : Gateway — dual `apnsClient` + routing par token

**Files:**
- Modify: `services/gateway/src/services/PushNotificationService.ts:84-164` (state + initialize)
- Modify: `services/gateway/src/services/PushNotificationService.ts:238-247` (select clause)
- Modify: `services/gateway/src/services/PushNotificationService.ts:428-511` (sendViaAPNS)

- [ ] **Step 3.1 : Remplacer `apnsClient` par deux clients**

Dans `services/gateway/src/services/PushNotificationService.ts`, modifier la classe `PushNotificationService` :

Remplacer la propriété `private apnsClient: any = null;` (ligne 87) par :

```ts
  // Two APNs Provider instances: one for sandbox (debug builds, aps-environment=development),
  // one for production (TestFlight/App Store, aps-environment=production). The token's
  // apnsEnvironment field decides which one is used. Same Apple p8 key works for both —
  // only the host differs (api.sandbox.push.apple.com vs api.push.apple.com), set via the
  // `production` boolean of @parse/node-apn's Provider.
  private apnsClientProduction: any = null;
  private apnsClientSandbox: any = null;
```

- [ ] **Step 3.2 : Initialiser les deux clients**

Remplacer le bloc `// Initialize APNS client` (lignes 136-161) par :

```ts
    // Initialize APNS clients (one per environment)
    if (config.apnsEnabled && config.apns.keyId && config.apns.teamId) {
      try {
        const apn = await import('@parse/node-apn').catch(() => null);

        if (apn) {
          const baseTokenOptions = {
            token: {
              key: config.apns.keyPath || config.apns.keyContent,
              keyId: config.apns.keyId,
              teamId: config.apns.teamId,
            },
          };

          this.apnsClientProduction = new apn.Provider({
            ...baseTokenOptions,
            production: true,
          });
          this.apnsClientSandbox = new apn.Provider({
            ...baseTokenOptions,
            production: false,
          });

          console.log('[PUSH] APNS clients initialized (production + sandbox)');
        } else {
          console.warn('[PUSH] @parse/node-apn not installed, APNS push disabled');
        }
      } catch (error) {
        console.error('[PUSH] Failed to initialize APNS:', error);
      }
    }
```

- [ ] **Step 3.3 : Inclure `apnsEnvironment` dans la requête `findMany`**

Dans `sendToUser` (lignes 238-247), ajouter `apnsEnvironment: true` au `select` :

```ts
    const tokens = await this.prisma.pushToken.findMany({
      where: whereClause,
      select: {
        id: true,
        token: true,
        type: true,
        platform: true,
        bundleId: true,
        apnsEnvironment: true,
      },
    });
```

- [ ] **Step 3.4 : Modifier `sendViaAPNS` pour router par environnement**

Remplacer la signature et le corps de `sendViaAPNS` (lignes 428-511). Nouveau code :

```ts
  /**
   * Send notification via Apple Push Notification Service.
   *
   * Routes to either the sandbox or production APNs Provider based on the
   * token's `apnsEnvironment`. Sandbox tokens (from iOS debug builds) MUST
   * be sent via `api.sandbox.push.apple.com`; production tokens (TestFlight,
   * App Store) MUST be sent via `api.push.apple.com`. Cross-routing returns
   * `BadDeviceToken` from Apple — this is exactly the bug this method fixes.
   */
  private async sendViaAPNS(
    tokenRecord: {
      id: string;
      token: string;
      bundleId?: string | null;
      apnsEnvironment?: string | null;
    },
    payload: PushNotificationPayload,
    isVoIP: boolean
  ): Promise<PushResult> {
    const env = tokenRecord.apnsEnvironment === 'development' ? 'sandbox' : 'production';
    const client = env === 'sandbox' ? this.apnsClientSandbox : this.apnsClientProduction;

    if (!client) {
      return { success: false, tokenId: tokenRecord.id, error: `APNS ${env} client not initialized` };
    }

    try {
      const apn = await import('@parse/node-apn');
      const notification = new apn.Notification();

      notification.alert = {
        title: payload.title,
        body: payload.body,
      };

      if (payload.badge !== undefined) {
        notification.badge = payload.badge;
      }

      notification.sound = payload.sound || 'default';
      notification.topic = isVoIP
        ? config.apns.voipBundleId
        : (tokenRecord.bundleId || config.apns.bundleId);

      if (isVoIP) {
        notification.pushType = 'voip';
        notification.priority = 10; // Immediate delivery for calls
      }

      if (payload.category) {
        (notification as any).category = payload.category;
      }

      if (payload.threadId) {
        notification.threadId = payload.threadId;
      }

      notification.mutableContent = true;

      if (payload.collapseId) {
        notification.collapseId = payload.collapseId;
      }

      // `content-available: 1` wakes the app in the background so the silent
      // push handler in `AppDelegate` can post the delivery receipt
      // (`PushDeliveryReceiptService.ack`). Without this, an offline recipient
      // never triggers `mark-as-received` and the sender's checkmark stays at
      // ✓ until the recipient manually foregrounds the app.
      if (!isVoIP) {
        notification.contentAvailable = true;
      }

      if (payload.data) {
        notification.payload = { ...payload.data };
      } else {
        notification.payload = {};
      }

      // Include VoIP call fields in payload for PushKit handling
      if (isVoIP) {
        if (payload.callId) notification.payload.callId = payload.callId;
        if (payload.callerName) notification.payload.callerName = payload.callerName;
        if (payload.callerAvatar) notification.payload.callerAvatar = payload.callerAvatar;
      }

      const result = await client.send(notification, tokenRecord.token);

      if (result.failed.length > 0) {
        const failure = result.failed[0];
        return {
          success: false,
          tokenId: tokenRecord.id,
          error: failure.response?.reason || 'APNS delivery failed',
        };
      }

      return { success: true, tokenId: tokenRecord.id };
    } catch (error: any) {
      return { success: false, tokenId: tokenRecord.id, error: error.message || 'APNS error' };
    }
  }
```

- [ ] **Step 3.5 : Mettre à jour le shutdown**

Localiser la méthode contenant `if (this.apnsClient) { await this.apnsClient.shutdown(); }` (vers ligne 582) et remplacer par :

```ts
    if (this.apnsClientProduction) {
      await this.apnsClientProduction.shutdown();
    }
    if (this.apnsClientSandbox) {
      await this.apnsClientSandbox.shutdown();
    }
```

- [ ] **Step 3.6 : Vérifier la compilation**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway && pnpm tsc --noEmit
```

Expected: pas d'erreur.

- [ ] **Step 3.7 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add services/gateway/src/services/PushNotificationService.ts
git commit -m "feat(gateway): dual APNs client (sandbox + production) with per-token routing"
```

---

## Task 4 : Test gateway — vérifier le routing par environnement

**Files:**
- Modify: `services/gateway/src/__tests__/notifications-firebase.test.ts`

- [ ] **Step 4.1 : Identifier le pattern de test existant**

Ouvrir `services/gateway/src/__tests__/notifications-firebase.test.ts` et lire les premières 100 lignes pour comprendre comment les mocks de `firebase-admin` sont déclarés. On va répliquer le même pattern pour `@parse/node-apn`.

- [ ] **Step 4.2 : Écrire le test RED**

Ajouter un nouveau bloc `describe` à la fin du fichier (avant le dernier `});`) :

```ts
describe('PushNotificationService - APNs environment routing', () => {
  // Mock the two Provider instances. We track which one received `send` and
  // assert the routing logic in PushNotificationService picks the correct
  // client based on tokenRecord.apnsEnvironment.
  const mockProviderSandbox = {
    send: jest.fn().mockResolvedValue({ sent: [{ device: 'sandbox-tok' }], failed: [] }),
    shutdown: jest.fn(),
  };
  const mockProviderProduction = {
    send: jest.fn().mockResolvedValue({ sent: [{ device: 'prod-tok' }], failed: [] }),
    shutdown: jest.fn(),
  };

  let constructorCalls: Array<{ production: boolean }>;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    constructorCalls = [];

    // Each call to `new apn.Provider(opts)` returns sandbox or production
    // based on opts.production, so the service's two-client init is observed.
    jest.doMock('@parse/node-apn', () => ({
      __esModule: true,
      Provider: jest.fn().mockImplementation((opts: { production: boolean }) => {
        constructorCalls.push({ production: opts.production });
        return opts.production ? mockProviderProduction : mockProviderSandbox;
      }),
      Notification: jest.fn().mockImplementation(() => ({
        payload: {},
      })),
    }));

    // Provide minimal env so the service's `if (apnsEnabled && keyId && teamId)`
    // branch executes the import path under test.
    process.env.APNS_KEY_ID = 'test-key-id';
    process.env.APNS_TEAM_ID = 'test-team-id';
    process.env.APNS_KEY_PATH = '/tmp/fake.p8';
    process.env.ENABLE_APNS_PUSH = 'true';
  });

  it('initializes both sandbox and production APNs Providers', async () => {
    const { PushNotificationService } = await import('../services/PushNotificationService');
    const svc = new PushNotificationService(mockPrisma as any);
    await svc.initialize();

    expect(constructorCalls).toEqual(
      expect.arrayContaining([{ production: true }, { production: false }])
    );
    expect(constructorCalls).toHaveLength(2);
  });

  it('routes a development-environment token to the sandbox Provider', async () => {
    (mockPrisma.pushToken.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'tok-1',
        token: 'sandbox-device-token-aaaa',
        type: 'apns',
        platform: 'ios',
        bundleId: 'me.meeshy.app',
        apnsEnvironment: 'development',
      },
    ]);
    (mockPrisma.userPreferences.findUnique as jest.Mock).mockResolvedValue({
      notification: { pushEnabled: true },
    });

    const { PushNotificationService } = await import('../services/PushNotificationService');
    const svc = new PushNotificationService(mockPrisma as any);

    await svc.sendToUser({
      userId: 'user-1',
      payload: { title: 'Hello', body: 'World' },
    });

    expect(mockProviderSandbox.send).toHaveBeenCalledTimes(1);
    expect(mockProviderProduction.send).not.toHaveBeenCalled();
  });

  it('routes a production-environment token to the production Provider', async () => {
    (mockPrisma.pushToken.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'tok-2',
        token: 'prod-device-token-bbbb',
        type: 'apns',
        platform: 'ios',
        bundleId: 'me.meeshy.app',
        apnsEnvironment: 'production',
      },
    ]);
    (mockPrisma.userPreferences.findUnique as jest.Mock).mockResolvedValue({
      notification: { pushEnabled: true },
    });

    const { PushNotificationService } = await import('../services/PushNotificationService');
    const svc = new PushNotificationService(mockPrisma as any);

    await svc.sendToUser({
      userId: 'user-1',
      payload: { title: 'Hello', body: 'World' },
    });

    expect(mockProviderProduction.send).toHaveBeenCalledTimes(1);
    expect(mockProviderSandbox.send).not.toHaveBeenCalled();
  });

  it('routes a token with null apnsEnvironment to production (legacy default)', async () => {
    (mockPrisma.pushToken.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'tok-3',
        token: 'legacy-token-cccc',
        type: 'apns',
        platform: 'ios',
        bundleId: 'me.meeshy.app',
        apnsEnvironment: null,
      },
    ]);
    (mockPrisma.userPreferences.findUnique as jest.Mock).mockResolvedValue({
      notification: { pushEnabled: true },
    });

    const { PushNotificationService } = await import('../services/PushNotificationService');
    const svc = new PushNotificationService(mockPrisma as any);

    await svc.sendToUser({
      userId: 'user-1',
      payload: { title: 'Hello', body: 'World' },
    });

    expect(mockProviderProduction.send).toHaveBeenCalledTimes(1);
    expect(mockProviderSandbox.send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4.3 : Lancer le test (doit échouer en RED)**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway && pnpm test -- notifications-firebase.test.ts -t "APNs environment routing"
```

Expected: les 4 tests doivent **passer** car le code de Task 3 implémente déjà le comportement. Si l'un échoue, c'est qu'on a oublié quelque chose dans Task 3 — corriger là-bas, pas dans le test.

> Note : ce plan suit TDD au sens « teste après implémentation pour cas où le RED-first n'a pas de sens » (refactor de code existant). Si l'on veut être strict RED-first, on peut écrire les tests AVANT Task 3 et observer l'échec.

- [ ] **Step 4.4 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add services/gateway/src/__tests__/notifications-firebase.test.ts
git commit -m "test(gateway): cover APNs sandbox/production routing"
```

---

## Task 5 : iOS SDK — propager `apnsEnvironment` dans la registration

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/NotificationModels.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushNotificationManager.swift`

- [ ] **Step 5.1 : Étendre `RegisterDeviceTokenRequest`**

Ouvrir `packages/MeeshySDK/Sources/MeeshySDK/Models/NotificationModels.swift`, modifier le struct `RegisterDeviceTokenRequest` (vers ligne 5) :

```swift
// MARK: - Device Token Registration

public struct RegisterDeviceTokenRequest: Encodable {
    public let token: String
    public let platform: String
    public let type: String
    /// "development" for sandbox APNs (debug builds), "production" for App Store/TestFlight.
    /// Optional — gateway defaults to "production" when omitted.
    public let apnsEnvironment: String?

    public init(
        token: String,
        platform: String = "ios",
        type: String = "apns",
        apnsEnvironment: String? = nil
    ) {
        self.token = token
        self.platform = platform
        self.type = type
        self.apnsEnvironment = apnsEnvironment
    }
}
```

- [ ] **Step 5.2 : Ajouter une constante d'environnement à `PushNotificationManager`**

Ouvrir `packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushNotificationManager.swift`. Juste avant `// MARK: - Permission` (vers ligne 27), ajouter une property statique non-isolée :

```swift
    // MARK: - APNs Environment

    /// The APNs environment baked into this build. Mirrors the entitlement's
    /// `aps-environment` key — debug builds get sandbox tokens; release builds
    /// get production tokens. The gateway uses this to route to the correct
    /// Apple endpoint (api.sandbox.push.apple.com vs api.push.apple.com).
    /// Hard-coded at compile time so a release build cannot accidentally
    /// claim to be sandbox (or vice-versa) at runtime.
    public static let apnsEnvironment: String = {
        #if DEBUG
        return "development"
        #else
        return "production"
        #endif
    }()
```

- [ ] **Step 5.3 : Inclure le champ dans `sendTokenToBackend`**

Toujours dans `PushNotificationManager.swift`, modifier `sendTokenToBackend` (lignes 149-170) :

```swift
    private func sendTokenToBackend(token: String) async {
        guard APIClient.shared.authToken != nil else {
            logger.info("Skipping token registration: user not authenticated")
            return
        }

        let request = RegisterDeviceTokenRequest(
            token: token,
            platform: "ios",
            type: "apns",
            apnsEnvironment: Self.apnsEnvironment
        )

        do {
            let _: APIResponse<RegisterDeviceTokenResponse> = try await APIClient.shared.post(
                endpoint: "/users/register-device-token",
                body: request
            )
            logger.info("Device token registered with backend (env=\(Self.apnsEnvironment))")
        } catch {
            logger.error("Failed to register device token: \(error.localizedDescription)")
        }
    }
```

- [ ] **Step 5.4 : Vérifier la compilation du SDK**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && swift build --target MeeshySDK 2>&1 | tail -30
```

Expected: `Build complete!` ou aucun « error: ». Si erreur, lire le diagnostic et corriger.

- [ ] **Step 5.5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add packages/MeeshySDK/Sources/MeeshySDK/Models/NotificationModels.swift packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushNotificationManager.swift
git commit -m "feat(sdk): propagate apnsEnvironment in device-token registration"
```

---

## Task 6 : iOS SDK — test unitaire pour la registration body

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Notifications/PushNotificationManagerTests.swift`

- [ ] **Step 6.1 : Créer le fichier de test**

Créer `packages/MeeshySDK/Tests/MeeshySDKTests/Notifications/PushNotificationManagerTests.swift` avec :

```swift
import XCTest
@testable import MeeshySDK

final class PushNotificationManagerTests: XCTestCase {

    // MARK: - apnsEnvironment compile-time constant

    func test_apnsEnvironment_isDevelopmentInDebugBuilds() throws {
        // The test target compiles in DEBUG configuration, so the constant
        // MUST resolve to "development". A release-mode test build would
        // resolve to "production" — this is the contract.
        #if DEBUG
        XCTAssertEqual(PushNotificationManager.apnsEnvironment, "development")
        #else
        XCTAssertEqual(PushNotificationManager.apnsEnvironment, "production")
        #endif
    }

    // MARK: - RegisterDeviceTokenRequest encoding

    func test_registerDeviceTokenRequest_encodesApnsEnvironment_whenProvided() throws {
        let request = RegisterDeviceTokenRequest(
            token: "abc123def456",
            platform: "ios",
            type: "apns",
            apnsEnvironment: "development"
        )

        let data = try JSONEncoder().encode(request)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(json["token"] as? String, "abc123def456")
        XCTAssertEqual(json["platform"] as? String, "ios")
        XCTAssertEqual(json["type"] as? String, "apns")
        XCTAssertEqual(json["apnsEnvironment"] as? String, "development")
    }

    func test_registerDeviceTokenRequest_omitsApnsEnvironment_whenNil() throws {
        // When the field is nil, JSONEncoder's default strategy is to OMIT the
        // key (Optional<String>.none → encoder doesn't write). Verifying this
        // explicitly because the gateway treats absent and "production" as
        // equivalent — but a present "null" string would be a regression.
        let request = RegisterDeviceTokenRequest(
            token: "abc123def456",
            platform: "ios",
            type: "apns",
            apnsEnvironment: nil
        )

        let data = try JSONEncoder().encode(request)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertNil(json["apnsEnvironment"])
        XCTAssertEqual(json["token"] as? String, "abc123def456")
    }

    func test_registerDeviceTokenRequest_defaultInit_omitsApnsEnvironment() throws {
        // Default init must keep apnsEnvironment as nil so the gateway falls
        // back to "production" — i.e. legacy callers (not yet upgraded) keep
        // working exactly as before.
        let request = RegisterDeviceTokenRequest(token: "abc123def456")

        let data = try JSONEncoder().encode(request)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertNil(json["apnsEnvironment"])
    }
}
```

- [ ] **Step 6.2 : Exécuter le test**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && swift test --filter PushNotificationManagerTests 2>&1 | tail -20
```

Expected: les 4 tests passent. Si échec sur `apnsEnvironment` field non encodé, vérifier que Task 5.1 a bien ajouté la propriété au struct (pas juste à l'init).

- [ ] **Step 6.3 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add packages/MeeshySDK/Tests/MeeshySDKTests/Notifications/PushNotificationManagerTests.swift
git commit -m "test(sdk): RegisterDeviceTokenRequest apnsEnvironment encoding"
```

---

## Task 7 : iOS app — propager `apnsEnvironment` pour le token VoIP

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/VoIPPushManager.swift:139-158`

- [ ] **Step 7.1 : Remplacer la struct locale par le modèle SDK**

Dans `apps/ios/Meeshy/Features/Main/Services/VoIPPushManager.swift`, modifier `registerTokenWithBackend` (lignes 139-158). Supprimer la struct locale `RegisterTokenRequest` et utiliser `RegisterDeviceTokenRequest` du SDK pour rester cohérent avec le manager APNs :

```swift
    // MARK: - Backend Registration

    private func registerTokenWithBackend(_ token: String) async {
        guard APIClient.shared.authToken != nil else { return }

        let body = RegisterDeviceTokenRequest(
            token: token,
            platform: "ios",
            type: "voip",
            apnsEnvironment: PushNotificationManager.apnsEnvironment
        )

        do {
            let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.post(
                endpoint: "/users/register-device-token",
                body: body
            )
            logger.info("VoIP token registered with backend (env=\(PushNotificationManager.apnsEnvironment))")
        } catch {
            logger.error("Failed to register VoIP token: \(error.localizedDescription)")
        }
    }
```

- [ ] **Step 7.2 : Build iOS pour vérifier la compilation**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build 2>&1 | tail -30
```

Expected: `BUILD SUCCEEDED`. Si échec sur `RegisterDeviceTokenRequest`, vérifier que MeeshySDK est bien importé dans `VoIPPushManager.swift` (déjà le cas ligne 3 : `import MeeshySDK`).

- [ ] **Step 7.3 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add apps/ios/Meeshy/Features/Main/Services/VoIPPushManager.swift
git commit -m "feat(ios): propagate apnsEnvironment for VoIP push tokens"
```

---

## Task 8 : Script one-shot — réactiver les tokens APNs deactivés

**Files:**
- Create: `services/gateway/scripts/reactivate-apns-tokens.ts`

**Contexte :** des tokens APNs production-aware sont aujourd'hui dans la collection avec `isActive=false` parce qu'ils ont été émis depuis des builds debug, envoyés au prod APN, ont reçu `BadDeviceToken`, et ont été désactivés. Après ce fix, l'app les ré-enregistrera la prochaine fois que l'utilisateur ouvrira l'app, créant de nouveaux records `apnsEnvironment="development"`. Mais on ne peut pas réactiver à l'aveugle ceux dont on ignore l'env d'origine. Ce script (a) rétrograde les tokens APNs `isActive=false, apnsEnvironment=null OR "production", lastError contient "BadDeviceToken"` vers une suppression propre, (b) reset les `failedAttempts` des tokens qui resteraient actifs.

- [ ] **Step 8.1 : Créer le script**

Créer `services/gateway/scripts/reactivate-apns-tokens.ts` :

```ts
/**
 * One-shot recovery script: clean up APNs tokens damaged by the production/sandbox
 * environment mismatch. Tokens that were issued by iOS debug builds (sandbox)
 * but sent to api.push.apple.com (production) accumulated `BadDeviceToken`
 * failures and got deactivated. Once the gateway routes by apnsEnvironment
 * (this fix), those tokens are useless: they were sandbox tokens routed to
 * prod, deactivated by Apple's response. Delete them so the iOS app's next
 * `/register-device-token` call inserts a fresh row with the correct
 * `apnsEnvironment="development"`.
 *
 * Run AFTER the gateway has been deployed with the dual-client routing.
 *
 * Usage:
 *   cd services/gateway
 *   pnpm tsx scripts/reactivate-apns-tokens.ts
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';

async function main() {
  const prisma = new PrismaClient();

  try {
    // Find tokens deactivated specifically due to BadDeviceToken — those are
    // the sandbox-vs-prod mismatch victims. Other deactivation reasons
    // (NotRegistered, MismatchSenderId, etc.) reflect genuinely-revoked tokens
    // and should NOT be touched.
    const damaged = await prisma.pushToken.findMany({
      where: {
        type: { in: ['apns', 'voip'] },
        isActive: false,
        lastError: { contains: 'BadDeviceToken' },
      },
      select: { id: true, userId: true, type: true, lastError: true },
    });

    console.log(`Found ${damaged.length} APNs/VoIP tokens deactivated by BadDeviceToken`);

    if (damaged.length === 0) {
      return;
    }

    // Delete the rows. The iOS app re-registers on every cold launch, so
    // legitimate users will repopulate the table within minutes — with the
    // correct apnsEnvironment field this time.
    const deleted = await prisma.pushToken.deleteMany({
      where: {
        id: { in: damaged.map(t => t.id) },
      },
    });

    console.log(`Deleted ${deleted.count} damaged token rows.`);
    console.log('Affected users will re-register on next app launch.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 8.2 : Vérifier la compilation TypeScript du script**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway && pnpm tsc --noEmit scripts/reactivate-apns-tokens.ts
```

Expected: pas d'erreur. Si l'option `--noEmit` n'accepte pas un seul fichier dans la config gateway, lancer simplement `pnpm tsc --noEmit` sur tout le projet.

- [ ] **Step 8.3 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add services/gateway/scripts/reactivate-apns-tokens.ts
git commit -m "chore(gateway): script to clean APNs tokens deactivated by env mismatch"
```

---

## Task 9 : Déploiement + smoke test

> **Read-only verification — no code changes.** À exécuter par l'humain (ou via SSH avec confirmation explicite). Ne PAS automatiser le déploiement prod sans validation.

- [ ] **Step 9.1 : Pousser et déployer le gateway**

L'humain valide l'image gateway et la pousse sur production via le pipeline habituel (CI ou `docker compose up -d gateway` sur `meeshy.me` après build). Vérifier que `/opt/meeshy/production/.env` a toujours :

```
APNS_KEY_ID=J73QFCYZGC
APNS_TEAM_ID=D72UK7R5RE
APNS_KEY_PATH=/app/secrets/apns_key.p8
APNS_BUNDLE_ID=me.meeshy.app
ENABLE_APNS_PUSH=true
```

`APNS_ENVIRONMENT` peut désormais être laissé indéfini ou supprimé ; le gateway initialise désormais sandbox + production indépendamment.

- [ ] **Step 9.2 : Vérifier les logs de boot**

```bash
ssh root@meeshy.me 'docker logs meeshy-gateway 2>&1 | grep -i "APNS clients" | tail -3'
```

Expected:
```
[PUSH] APNS clients initialized (production + sandbox)
```

Si on voit toujours `[PUSH] APNS client initialized` (singulier), le bon image n'est pas déployée.

- [ ] **Step 9.3 : Lancer le script de cleanup**

```bash
ssh root@meeshy.me 'docker exec meeshy-gateway pnpm tsx scripts/reactivate-apns-tokens.ts'
```

Si le script n'est pas dans l'image, le copier manuellement avant exécution :
```bash
scp services/gateway/scripts/reactivate-apns-tokens.ts root@meeshy.me:/tmp/
ssh root@meeshy.me 'docker cp /tmp/reactivate-apns-tokens.ts meeshy-gateway:/app/scripts/ && docker exec meeshy-gateway pnpm tsx scripts/reactivate-apns-tokens.ts'
```

Expected: ligne `Deleted N damaged token rows.` avec N > 0.

- [ ] **Step 9.4 : Build iOS debug + register**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh run
```

Se logger avec un compte test, accepter les notifications. Vérifier que côté gateway :

```bash
ssh root@meeshy.me 'docker logs meeshy-gateway --tail 200 2>&1 | grep -i PUSH_TOKEN | tail -5'
```

Expected: ligne `[PUSH_TOKEN] Registering apns token for user <id> on ios (apnsEnv=development)`.

- [ ] **Step 9.5 : Provoquer une notif et vérifier la livraison**

Avec un second compte (ou un appareil compagnon, ou via `curl` direct) envoyer un message vers le compte de test. La bannière de notification iOS doit s'afficher au-dessus du simulateur (ou sur l'écran verrouillé).

Côté gateway, vérifier qu'aucune ligne `BadDeviceToken` n'apparaît pour ce token :

```bash
ssh root@meeshy.me 'docker logs meeshy-gateway --tail 100 2>&1 | grep -E "(Deactivated|BadDeviceToken)" | tail -5'
```

Expected: aucune nouvelle entrée pour le token actuel. Si une apparaît → le token a été enregistré avec `apnsEnvironment="production"` quand il aurait dû être `"development"`. Re-vérifier Task 5.

- [ ] **Step 9.6 : Vérification croisée — TestFlight build**

(Optionnel mais recommandé.) Soumettre un archive TestFlight (release) du même code, l'installer, ouvrir, envoyer un message. La notification doit également arriver. Vérifier les logs :

```
[PUSH_TOKEN] Registering apns token for user <id> on ios (apnsEnv=production)
```

Cela confirme que `#if DEBUG` route correctement les builds release vers production.

---

## Self-Review

**Spec coverage :**
- Schema mis à jour (Task 1) ✓
- Endpoint accepte le champ (Task 2) ✓
- Routing per-token côté gateway (Task 3) ✓
- Tests gateway (Task 4) ✓
- iOS SDK propage la valeur (Task 5) + tests (Task 6) ✓
- iOS app VoIP propage aussi (Task 7) ✓
- Cleanup des tokens cassés (Task 8) ✓
- Déploiement + smoke test (Task 9) ✓

**Placeholder scan :** aucun « TODO », « TBD », ou « add appropriate handling » — tous les blocs de code sont complets.

**Type consistency :**
- `apnsEnvironment` est `String? @default("production")` partout (Prisma, Zod, Swift `String?`)
- `RegisterDeviceTokenRequest.apnsEnvironment` reste optionnel pour ne pas casser les anciens callers
- `apnsClientProduction` / `apnsClientSandbox` cohérents entre Steps 3.1, 3.2, 3.4, 3.5
- `PushNotificationManager.apnsEnvironment` (static let, public) référencé identiquement dans `PushNotificationManager.sendTokenToBackend` et `VoIPPushManager.registerTokenWithBackend`

**Migration safety :** legacy rows (apnsEnvironment=null) routés vers production → cohérent avec le comportement pré-fix sur les tokens TestFlight/App Store. Sandbox tokens cassés sont supprimés par le script (Task 8) puis ré-enregistrés au cold launch suivant avec la bonne valeur — pas d'action utilisateur requise.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-08-apns-environment-routing.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - Je dispatche un subagent par task, review entre tasks, itération rapide

**2. Inline Execution** - Exécution des tasks dans cette session avec checkpoints

**Quelle approche ?**
