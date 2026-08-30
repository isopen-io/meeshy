/**
 * #4337 — PushTokenService doit appeler l'adresse RÉELLEMENT SERVIE
 * (`POST`/`DELETE /api/v1/users/register-device-token`, la seule route de
 * jetons push du manifeste — `services/gateway/route-manifest.json`, module
 * `pushTokenRoutes`), jamais le littéral mort
 * `${baseURL}/api/users/push-token` (sans préfixe `/api/v1`, ne correspondant
 * à AUCUNE route montée côté gateway).
 *
 * `axios` est mocké pour capturer l'URL réellement appelée ; `buildApiUrl`
 * est mocké pour rendre cette URL absolue déterministe. `API_ENDPOINTS`
 * reste le VRAI catalogue partagé — `jest.mock('@meeshy/shared/...')` est
 * inerte sous ce `moduleNameMapper` (apps/web/CLAUDE.md, « `jest.mock` sur
 * `@meeshy/shared/…` ») — pour que l'assertion prouve l'alignement avec le
 * catalogue, jamais une chaîne recopiée à la main.
 */

import axios from 'axios';
import { API_ENDPOINTS } from '@meeshy/shared/api/endpoints';

jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => `http://localhost:3000${path}`,
}));

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { pushTokenService, resetPushTokenService } from '@/services/push-token.service';

const SERVED_PUSH_TOKEN_URL = `http://localhost:3000${API_ENDPOINTS.users.registerDeviceToken}`;

describe('pushTokenService — adresse réellement servie (#4337)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPushTokenService();
    window.localStorage.clear();
  });

  describe('register', () => {
    it('POSTs to the served push-token registration route', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { success: true } });

      await pushTokenService.register('fcm-token-abc');

      expect(mockAxios.post).toHaveBeenCalledWith(
        SERVED_PUSH_TOKEN_URL,
        expect.objectContaining({ token: 'fcm-token-abc' }),
        expect.objectContaining({ withCredentials: true })
      );
    });

    /**
     * #4337 — corriger l'ADRESSE ne suffisait pas : le schéma de la route
     * déclare `platform` REQUIS (`routes/push-tokens.ts:80`,
     * `required: ['token', 'platform']`, `z.enum(['ios','android','web'])`).
     * Sans ce champ, le lot aurait remplacé un `404` par un `400` — la même
     * panne, un code plus loin.
     *
     * Le témoin assert la valeur EXACTE, pas seulement la présence : le
     * serveur en déduit le type de jeton (`platform === 'ios'` ⇒ APNs, sinon
     * FCM), donc une valeur fausse route le jeton vers le mauvais service.
     */
    it('sends the top-level platform the route requires, set to web', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { success: true } });

      await pushTokenService.register('fcm-token-abc');

      const body = mockAxios.post.mock.calls[0]?.[1] as { platform?: unknown };
      expect(body.platform).toBe('web');
    });

    /**
     * `deviceInfo.platform` porte `navigator.platform` (« MacIntel »,
     * « Win32 »…) — même NOM, autre référentiel. Recopier le second dans le
     * premier ferait échouer l'enum côté serveur, et c'est la confusion que ce
     * témoin interdit : les deux champs coexistent et ne disent pas la même
     * chose.
     */
    it('keeps deviceInfo.platform distinct from the served platform enum', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { success: true } });

      await pushTokenService.register('fcm-token-abc');

      const body = mockAxios.post.mock.calls[0]?.[1] as {
        platform?: unknown;
        deviceInfo?: { platform?: unknown };
      };
      expect(body.platform).toBe('web');
      expect(['ios', 'android', 'web']).toContain(body.platform);
      expect(body.deviceInfo?.platform).toBe(window.navigator.platform);
    });

    it('never targets the dead /api/users/push-token literal (missing the /api/v1 prefix)', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { success: true } });

      await pushTokenService.register('fcm-token-abc');

      const calledUrl = mockAxios.post.mock.calls[0]?.[0];
      expect(calledUrl).not.toContain('/api/users/push-token');
      expect(calledUrl).toContain('/api/v1/');
    });
  });

  describe('delete', () => {
    it('DELETEs the served push-token registration route with the token in the request body', async () => {
      mockAxios.delete.mockResolvedValueOnce({ data: { success: true } });

      await pushTokenService.delete('fcm-token-abc');

      expect(mockAxios.delete).toHaveBeenCalledWith(
        SERVED_PUSH_TOKEN_URL,
        expect.objectContaining({ data: { token: 'fcm-token-abc' }, withCredentials: true })
      );
    });
  });

  it('register and delete target the SAME served route — one resource, two verbs (#4337 finding)', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: { success: true } });
    mockAxios.delete.mockResolvedValueOnce({ data: { success: true } });

    await pushTokenService.register('fcm-token-xyz');
    await pushTokenService.delete('fcm-token-xyz');

    const postedUrl = mockAxios.post.mock.calls[0]?.[0];
    const deletedUrl = mockAxios.delete.mock.calls[0]?.[0];
    expect(postedUrl).toBe(deletedUrl);
    expect(postedUrl).toBe(SERVED_PUSH_TOKEN_URL);
  });
});
