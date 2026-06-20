/**
 * FirebaseStatusChecker and FirebaseNotificationService tests.
 *
 * Both classes depend on:
 *   - module-level `admin` var (populated by `require('firebase-admin')` at import time)
 *   - module-level `firebaseInitialized` flag
 *   - FirebaseStatusChecker static `checked` / `firebaseAvailable` fields
 *
 * All three must be reset between tests. We use jest.resetModules() + jest.doMock()
 * + require() so every `it` block starts from a clean module registry.
 */

type FirebaseModuleType = typeof import('../../../../services/notifications/FirebaseNotificationService');

function loadModule(mocks: {
  adminModule?: Record<string, unknown> | null;
  fsExists?: boolean;
  fsContent?: string;
  credPath?: string;
}): FirebaseModuleType {
  jest.resetModules();

  const { adminModule = {
    initializeApp: jest.fn(),
    credential: { cert: jest.fn().mockReturnValue({}) },
    messaging: jest.fn().mockReturnValue({ send: jest.fn().mockResolvedValue('msg-id') }),
  }, fsExists = true, fsContent = '{"type":"service_account"}', credPath } = mocks;

  if (credPath !== undefined) {
    process.env['FIREBASE_ADMIN_CREDENTIALS_PATH'] = credPath;
  } else {
    delete process.env['FIREBASE_ADMIN_CREDENTIALS_PATH'];
  }

  if (adminModule === null) {
    jest.doMock('firebase-admin', () => { throw new Error('firebase-admin not installed'); });
  } else {
    jest.doMock('firebase-admin', () => adminModule);
  }

  jest.doMock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(fsExists),
    readFileSync: jest.fn().mockReturnValue(fsContent),
  }));

  jest.doMock('../../../../utils/logger', () => ({
    logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));

  return require('../../../../services/notifications/FirebaseNotificationService');
}

afterEach(() => {
  delete process.env['FIREBASE_ADMIN_CREDENTIALS_PATH'];
  jest.resetModules();
});

describe('FirebaseStatusChecker', () => {
  describe('checkFirebase', () => {
    it('returns false when firebase-admin module is not installed', () => {
      const { FirebaseStatusChecker } = loadModule({ adminModule: null });
      expect(FirebaseStatusChecker.checkFirebase()).toBe(false);
    });

    it('returns false when FIREBASE_ADMIN_CREDENTIALS_PATH env var is not set', () => {
      const { FirebaseStatusChecker } = loadModule({});
      expect(FirebaseStatusChecker.checkFirebase()).toBe(false);
    });

    it('returns false when credentials file does not exist', () => {
      const { FirebaseStatusChecker } = loadModule({ credPath: '/path/creds.json', fsExists: false });
      expect(FirebaseStatusChecker.checkFirebase()).toBe(false);
    });

    it('returns false when credentials file contains invalid JSON', () => {
      const { FirebaseStatusChecker } = loadModule({
        credPath: '/path/creds.json',
        fsContent: 'not-json',
      });
      expect(FirebaseStatusChecker.checkFirebase()).toBe(false);
    });

    it('returns true when credentials are valid and initializeApp succeeds', () => {
      const initializeApp = jest.fn().mockReturnValue({});
      const { FirebaseStatusChecker } = loadModule({
        credPath: '/path/creds.json',
        adminModule: {
          initializeApp,
          credential: { cert: jest.fn().mockReturnValue({}) },
          messaging: jest.fn(),
        },
      });
      expect(FirebaseStatusChecker.checkFirebase()).toBe(true);
      expect(initializeApp).toHaveBeenCalledTimes(1);
    });

    it('returns false when initializeApp throws', () => {
      const initializeApp = jest.fn().mockImplementation(() => { throw new Error('init failed'); });
      const { FirebaseStatusChecker } = loadModule({
        credPath: '/path/creds.json',
        adminModule: {
          initializeApp,
          credential: { cert: jest.fn().mockReturnValue({}) },
          messaging: jest.fn(),
        },
      });
      expect(FirebaseStatusChecker.checkFirebase()).toBe(false);
    });

    it('returns false when fs.existsSync throws unexpectedly (outer catch)', () => {
      jest.resetModules();

      process.env['FIREBASE_ADMIN_CREDENTIALS_PATH'] = '/path/creds.json';

      jest.doMock('firebase-admin', () => ({
        initializeApp: jest.fn(),
        credential: { cert: jest.fn().mockReturnValue({}) },
        messaging: jest.fn(),
      }));
      jest.doMock('fs', () => ({
        existsSync: jest.fn().mockImplementation(() => { throw new Error('fs crash'); }),
        readFileSync: jest.fn(),
      }));
      jest.doMock('../../../../utils/logger', () => ({
        logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
      }));

      const { FirebaseStatusChecker } = require('../../../../services/notifications/FirebaseNotificationService') as FirebaseModuleType;
      expect(FirebaseStatusChecker.checkFirebase()).toBe(false);
    });

    it('caches the result: initializeApp called only once across multiple checkFirebase calls', () => {
      const initializeApp = jest.fn().mockReturnValue({});
      const { FirebaseStatusChecker } = loadModule({
        credPath: '/path/creds.json',
        adminModule: {
          initializeApp,
          credential: { cert: jest.fn().mockReturnValue({}) },
          messaging: jest.fn(),
        },
      });
      const first = FirebaseStatusChecker.checkFirebase();
      const second = FirebaseStatusChecker.checkFirebase();
      expect(first).toBe(true);
      expect(second).toBe(true);
      expect(initializeApp).toHaveBeenCalledTimes(1);
    });
  });

  describe('isFirebaseAvailable', () => {
    it('calls checkFirebase on first invocation and returns false when not configured', () => {
      const { FirebaseStatusChecker } = loadModule({});
      expect(FirebaseStatusChecker.isFirebaseAvailable()).toBe(false);
    });

    it('returns true when checkFirebase has already succeeded', () => {
      const { FirebaseStatusChecker } = loadModule({
        credPath: '/path/creds.json',
        adminModule: {
          initializeApp: jest.fn().mockReturnValue({}),
          credential: { cert: jest.fn().mockReturnValue({}) },
          messaging: jest.fn(),
        },
      });
      FirebaseStatusChecker.checkFirebase();
      expect(FirebaseStatusChecker.isFirebaseAvailable()).toBe(true);
    });

    it('does not reinitialize Firebase on subsequent isFirebaseAvailable calls', () => {
      const initializeApp = jest.fn().mockReturnValue({});
      const { FirebaseStatusChecker } = loadModule({
        credPath: '/path/creds.json',
        adminModule: {
          initializeApp,
          credential: { cert: jest.fn().mockReturnValue({}) },
          messaging: jest.fn(),
        },
      });
      FirebaseStatusChecker.isFirebaseAvailable();
      FirebaseStatusChecker.isFirebaseAvailable();
      expect(initializeApp).toHaveBeenCalledTimes(1);
    });
  });
});

describe('FirebaseNotificationService', () => {
  function makePrisma(userExists = true) {
    return {
      user: {
        findUnique: jest.fn().mockResolvedValue(userExists ? { id: 'user-1' } : null),
      },
    } as any;
  }

  function makeNotification(overrides: Partial<Record<string, unknown>> = {}): any {
    return {
      id: 'notif-1',
      type: 'new_message',
      title: 'Hello',
      content: 'World',
      conversationId: 'conv-1',
      messageId: 'msg-1',
      ...overrides,
    };
  }

  it('isAvailable returns false when Firebase is not configured', () => {
    const { FirebaseNotificationService } = loadModule({});
    const service = new FirebaseNotificationService(makePrisma());
    expect(service.isAvailable()).toBe(false);
  });

  it('isAvailable returns true when Firebase initializes successfully', () => {
    const { FirebaseNotificationService } = loadModule({
      credPath: '/path/creds.json',
      adminModule: {
        initializeApp: jest.fn().mockReturnValue({}),
        credential: { cert: jest.fn().mockReturnValue({}) },
        messaging: jest.fn(),
      },
    });
    const service = new FirebaseNotificationService(makePrisma());
    expect(service.isAvailable()).toBe(true);
  });

  it('sendPushNotification returns false when Firebase is not available', async () => {
    const { FirebaseNotificationService } = loadModule({});
    const service = new FirebaseNotificationService(makePrisma());
    const result = await service.sendPushNotification('user-1', makeNotification());
    expect(result).toBe(false);
  });

  it('sendPushNotification returns false when user is not found in DB', async () => {
    const { FirebaseNotificationService } = loadModule({
      credPath: '/path/creds.json',
      adminModule: {
        initializeApp: jest.fn().mockReturnValue({}),
        credential: { cert: jest.fn().mockReturnValue({}) },
        messaging: jest.fn(),
      },
    });
    const service = new FirebaseNotificationService(makePrisma(false));
    const result = await service.sendPushNotification('user-1', makeNotification());
    expect(result).toBe(false);
  });

  it('sendPushNotification returns false when fcmToken is null (current TODO state)', async () => {
    const { FirebaseNotificationService } = loadModule({
      credPath: '/path/creds.json',
      adminModule: {
        initializeApp: jest.fn().mockReturnValue({}),
        credential: { cert: jest.fn().mockReturnValue({}) },
        messaging: jest.fn().mockReturnValue({ send: jest.fn().mockResolvedValue('ok') }),
      },
    });
    const prisma = makePrisma(true);
    const service = new FirebaseNotificationService(prisma);
    const result = await service.sendPushNotification('user-1', makeNotification());
    expect(result).toBe(false);
  });

  it('sendPushNotification does not throw on messaging/invalid-registration-token error', async () => {
    const sendFn = jest.fn().mockRejectedValue(
      Object.assign(new Error('invalid token'), { code: 'messaging/invalid-registration-token' })
    );
    const { FirebaseNotificationService, FirebaseStatusChecker } = loadModule({
      credPath: '/path/creds.json',
      adminModule: {
        initializeApp: jest.fn().mockReturnValue({}),
        credential: { cert: jest.fn().mockReturnValue({}) },
        messaging: jest.fn().mockReturnValue({ send: sendFn }),
      },
    });
    FirebaseStatusChecker.checkFirebase();

    const service = new FirebaseNotificationService(makePrisma());
    await expect(service.sendPushNotification('user-1', makeNotification())).resolves.toBe(false);
  });
});
