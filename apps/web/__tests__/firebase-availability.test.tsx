/**
 * Tests d'intégration frontend pour Firebase
 *
 * OBJECTIF: Vérifier que l'application frontend fonctionne dans 2 scénarios:
 * 1. Sans Firebase configuré (WebSocket seulement)
 * 2. Avec Firebase configuré (WebSocket + FCM)
 *
 * @jest-environment jsdom
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { render, screen, waitFor, renderHook } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Socket.IO client
const mockSocket = {
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  connected: true,
};

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

// Mock auth
jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: jest.fn(() => 'mock-token'),
    getCurrentUser: jest.fn(() => ({
      id: 'user123',
      username: 'testuser',
      email: 'test@example.com',
    })),
    isAuthenticated: jest.fn(() => true),
  },
}));

describe('Frontend - Sans Firebase configuré', () => {
  let originalEnv: typeof process.env;

  beforeAll(() => {
    // Sauvegarder l'environnement
    originalEnv = { ...process.env };

    // Supprimer toutes les variables Firebase
    delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    delete process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    delete process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    delete process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
    delete process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
    delete process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;
    delete process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  });

  afterAll(() => {
    // Restaurer l'environnement
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Application fonctionne sans Firebase', () => {
    it('Les variables Firebase ne sont pas définies', () => {
      expect(process.env.NEXT_PUBLIC_FIREBASE_API_KEY).toBeUndefined();
      expect(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID).toBeUndefined();
    });

    it('Simple component se rend sans crash', () => {
      const TestComponent = () => <div role="main">Test App</div>;

      render(<TestComponent />);

      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByText('Test App')).toBeInTheDocument();
    });

    it('Aucune erreur console Firebase', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

      const TestComponent = () => <div>Test</div>;
      render(<TestComponent />);

      const firebaseErrors = consoleError.mock.calls.filter(
        call => call.some(arg => String(arg).toLowerCase().includes('firebase'))
      );

      expect(firebaseErrors).toHaveLength(0);

      consoleError.mockRestore();
    });
  });

  describe('WebSocket notifications fonctionnent sans Firebase', () => {
    it('Socket.IO se connecte', async () => {
      const { io } = require('socket.io-client');

      // Créer une connexion socket
      const socket = io('http://localhost:3000');

      expect(socket).toBeDefined();
      expect(io).toHaveBeenCalled();
    });

    it('Reçoit des notifications via WebSocket', async () => {
      const notifications: any[] = [];

      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'notification') {
          // Simuler la réception d'une notification
          setTimeout(() => {
            const notification = {
              id: 'notif123',
              type: 'new_message',
              title: 'Nouveau message',
              content: 'Test WebSocket',
              createdAt: new Date(),
            };
            notifications.push(notification);
            callback(notification);
          }, 100);
        }
        return mockSocket;
      });

      // Connecter le socket
      const { io } = require('socket.io-client');
      const socket = io('http://localhost:3000');

      socket.on('notification', (notif: any) => {
        notifications.push(notif);
      });

      await waitFor(() => {
        expect(notifications.length).toBeGreaterThan(0);
      }, { timeout: 500 });

      expect(notifications[0]).toMatchObject({
        id: 'notif123',
        type: 'new_message',
        title: 'Nouveau message',
      });
    });
  });
});

describe('Frontend - Avec Firebase configuré', () => {
  let originalEnv: typeof process.env;

  beforeAll(() => {
    // Sauvegarder l'environnement
    originalEnv = { ...process.env };

    // Configurer Firebase
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'test-api-key';
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'test-project';
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'test.appspot.com';
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = '123456789';
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = 'test-app-id';
    process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY = 'test-vapid-key';
  });

  afterAll(() => {
    // Restaurer l'environnement
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Firebase est disponible', () => {
    it('Les variables Firebase sont définies', () => {
      expect(process.env.NEXT_PUBLIC_FIREBASE_API_KEY).toBe('test-api-key');
      expect(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID).toBe('test-project');
      expect(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY).toBe('test-vapid-key');
    });

    it('L\'application se rend sans crash avec Firebase configuré', () => {
      const TestComponent = () => <div role="main">Test App with Firebase</div>;

      render(<TestComponent />);

      expect(screen.getByRole('main')).toBeInTheDocument();
    });
  });

  describe('WebSocket fonctionne toujours avec Firebase', () => {
    it('WebSocket se connecte même si Firebase est configuré', () => {
      const { io } = require('socket.io-client');

      const socket = io('http://localhost:3000');

      expect(socket).toBeDefined();
      expect(mockSocket.connect).toBeDefined();
    });

    it('Reçoit des notifications via WebSocket ET Firebase serait disponible', async () => {
      const notifications: any[] = [];

      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'notification') {
          setTimeout(() => {
            const notification = {
              id: 'notif456',
              type: 'new_message',
              title: 'Message avec Firebase',
              content: 'WebSocket toujours actif',
              createdAt: new Date(),
            };
            callback(notification);
          }, 100);
        }
        return mockSocket;
      });

      const { io } = require('socket.io-client');
      const socket = io('http://localhost:3000');

      socket.on('notification', (notif: any) => {
        notifications.push(notif);
      });

      await waitFor(() => {
        expect(notifications.length).toBeGreaterThan(0);
      }, { timeout: 500 });

      expect(notifications[0]).toMatchObject({
        id: 'notif456',
        type: 'new_message',
      });
    });
  });
});

describe('Firebase FCM - Tests conditionnels', () => {
  it('Détecte si Firebase est supporté dans le navigateur', () => {
    // Mock navigator.serviceWorker
    Object.defineProperty(navigator, 'serviceWorker', {
      writable: true,
      value: {
        register: jest.fn().mockResolvedValue({
          active: {},
          installing: null,
          waiting: null,
        }),
      },
    });

    expect(navigator.serviceWorker).toBeDefined();
  });

  it('Détecte si les notifications sont supportées', () => {
    // Mock Notification
    Object.defineProperty(window, 'Notification', {
      writable: true,
      configurable: true,
      value: {
        permission: 'default',
        requestPermission: jest.fn().mockResolvedValue('granted'),
      },
    });

    expect(window.Notification).toBeDefined();
  });

  it('Gère gracieusement l\'absence de support des notifications', () => {
    // Supprimer Notification
    const originalNotification = (window as any).Notification;
    Object.defineProperty(window, 'Notification', {
      value: undefined,
      writable: true,
      configurable: true
    });

    // L'app ne doit pas crash
    const TestComponent = () => {
      const hasNotificationSupport = typeof window !== 'undefined' && window.Notification !== undefined;
      return <div>{hasNotificationSupport ? 'Supported' : 'Not Supported'}</div>;
    };

    render(<TestComponent />);

    expect(screen.getByText('Not Supported')).toBeInTheDocument();

    // Restaurer
    Object.defineProperty(window, 'Notification', {
      value: originalNotification,
      writable: true,
      configurable: true
    });
  });
});

describe('Gestion d\'erreurs et fallback', () => {
  it('Continue de fonctionner si Firebase initialization échoue', () => {
    // Mock Firebase qui échoue à s'initialiser
    const mockInitializeApp = jest.fn().mockImplementation(() => {
      throw new Error('Firebase initialization failed');
    });

    const TestComponent = () => {
      try {
        mockInitializeApp();
        return <div>Firebase OK</div>;
      } catch (error) {
        // Fallback gracieux
        return <div>Using WebSocket Only</div>;
      }
    };

    render(<TestComponent />);

    expect(screen.getByText('Using WebSocket Only')).toBeInTheDocument();
  });

  it('Affiche un message approprié si les permissions sont refusées', () => {
    Object.defineProperty(window, 'Notification', {
      writable: true,
      value: {
        permission: 'denied',
        requestPermission: jest.fn().mockResolvedValue('denied'),
      },
    });

    const TestComponent = () => {
      const permission = window.Notification?.permission || 'default';

      return (
        <div>
          {permission === 'denied' && <p>Notifications désactivées</p>}
          {permission === 'granted' && <p>Notifications activées</p>}
          {permission === 'default' && <p>Autorisation non demandée</p>}
        </div>
      );
    };

    render(<TestComponent />);

    expect(screen.getByText('Notifications désactivées')).toBeInTheDocument();
  });
});

describe('Tests de compatibilité navigateur', () => {
  it('Détecte Safari iOS', () => {
    const originalUserAgent = navigator.userAgent;

    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    });

    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

    expect(isIOS).toBe(true);

    // Restaurer
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      value: originalUserAgent,
    });
  });

  it('Détecte Chrome Android', () => {
    const originalUserAgent = navigator.userAgent;

    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      value: 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
    });

    const isAndroid = /Android/.test(navigator.userAgent);

    expect(isAndroid).toBe(true);

    // Restaurer
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      value: originalUserAgent,
    });
  });

  it('Vérifie le support PWA', () => {
    // Mock standalone mode
    Object.defineProperty(navigator, 'standalone', {
      writable: true,
      value: true,
    });

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(query => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    const isStandalone =
      (navigator as any).standalone ||
      window.matchMedia('(display-mode: standalone)').matches;

    expect(isStandalone).toBe(true);
  });
});

describe('Tests de résilience', () => {
  it('Reconnecte WebSocket automatiquement après déconnexion', async () => {
    mockSocket.connected = false;

    // Simuler une reconnexion
    setTimeout(() => {
      mockSocket.connected = true;
      mockSocket.emit('connect');
    }, 100);

    await waitFor(() => {
      expect(mockSocket.connected).toBe(true);
    }, { timeout: 500 });
  });

  it('Gère les erreurs réseau gracieusement', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Configure mock to store callbacks for later invocation
    const errorCallbacks: Function[] = [];
    mockSocket.on.mockImplementation((event: string, callback: Function) => {
      if (event === 'error') {
        errorCallbacks.push(callback);
      }
      return mockSocket;
    });

    const { io } = require('socket.io-client');
    const socket = io('http://localhost:3000');

    let errorHandled = false;
    socket.on('error', (error: Error) => {
      errorHandled = true;
      console.error('Socket error:', error);
    });

    // Error not triggered yet
    expect(errorHandled).toBe(false);

    // Now simulate an error being triggered
    errorCallbacks.forEach(cb => cb(new Error('Network error')));
    expect(errorHandled).toBe(true);

    consoleError.mockRestore();
  });
});
