/**
 * Audit adversarial du lot #9608 (2026-10-08) — deux trous de l'alerte
 * « nouvelle connexion », rejoués ici depuis les preuves de l'audit.
 *
 * A1 — le SDK iOS envoie l'agent PAR DÉFAUT de CFNetwork
 * (`Meeshy/1874 CFNetwork/… Darwin/…`), que le serveur réduit à
 * `desktop|||ios|` pour TOUS les iPhone. Le lot avait fait du modèle déclaré
 * un critère qui ne pouvait qu'AJOUTER une alerte — et le taisait quand la
 * connexion n'en déclarait aucun. Un voleur muni de n'importe quel agent
 * CFNetwork, sans un seul en-tête, se faisait reconnaître comme l'iPhone de
 * sa victime depuis son pays, ou partout quand la géolocalisation échoue.
 * Avant le lot, il était signalé.
 *
 * P1 (préexistant, #7035) — l'historique relu pour reconnaître l'appareil
 * comptait les sessions que la victime venait de RÉVOQUER. Elle clique
 * « déconnecter partout » ; le voleur se reconnecte, son appareil est
 * « connu », aucune alerte.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { mergeClientHeaders, parseUserAgent } from '../../../../services/GeoIPService';
import { deviceIdentityFromInfo, isLoginFromUnrecognisedDevice } from '../../../../utils/new-device';
import { notifyIfLoginFromNewDevice, SESSION_REVOCATION_REASONS } from '../../../../routes/auth/notify-new-device';
import { createUserSessionStore, makeSession } from './user-session-store';

const VICTIME_UA = 'Meeshy/1874 CFNetwork/1568.100.1 Darwin/24.0.0';
const VOLEUR_UA = 'Evil/1 CFNetwork/1 Darwin/1';
const CHROME_LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const USER = 'a'.repeat(24);

function sessionIphoneVictime() {
  const appareil = mergeClientHeaders(parseUserAgent(VICTIME_UA), null, {
    'x-meeshy-platform': 'ios', 'x-meeshy-device': 'iPhone15,2', 'x-meeshy-os': '18.0',
  }).deviceInfo;
  return { ...deviceIdentityFromInfo(appareil, VICTIME_UA), country: 'FR' };
}

describe('A1 — un agent CFNetwork sans en-tête ne passe pas pour l’iPhone de la victime', () => {
  it('depuis le pays de la victime : alerte', () => {
    expect(isLoginFromUnrecognisedDevice(
      [sessionIphoneVictime()],
      { userAgent: VOLEUR_UA, declaredModel: null, attestedCountry: 'FR' },
      parseUserAgent
    )).toBe(true);
  });

  it('quand la géolocalisation échoue : alerte', () => {
    expect(isLoginFromUnrecognisedDevice(
      [sessionIphoneVictime()],
      { userAgent: VOLEUR_UA, declaredModel: null, attestedCountry: null },
      parseUserAgent
    )).toBe(true);
  });

  it('CONTRE-ÉPREUVE — l’iPhone de la victime, qui déclare toujours son modèle, reste reconnu', () => {
    expect(isLoginFromUnrecognisedDevice(
      [sessionIphoneVictime()],
      { userAgent: VICTIME_UA, declaredModel: 'iPhone15,2', attestedCountry: 'FR' },
      parseUserAgent
    )).toBe(false);
  });

  it('CONTRE-ÉPREUVE — un navigateur sans modèle d’un côté comme de l’autre reste reconnu', () => {
    expect(isLoginFromUnrecognisedDevice(
      [{ ...deviceIdentityFromInfo(parseUserAgent(CHROME_LINUX), CHROME_LINUX), country: 'FR' }],
      { userAgent: CHROME_LINUX, declaredModel: parseUserAgent(CHROME_LINUX)?.model ?? null, attestedCountry: 'FR' },
      parseUserAgent
    )).toBe(false);
  });
});

async function reconnexionApres(reason: string, valide = false) {
  const store = createUserSessionStore([
    makeSession({ id: 'b'.repeat(24), userId: USER, sessionToken: 'h-voleur', userAgent: CHROME_LINUX, country: 'RU',
      isValid: valide, invalidatedAt: valide ? null : new Date(), invalidatedReason: valide ? null : reason }),
    makeSession({ id: 'c'.repeat(24), userId: USER, sessionToken: 'h-victime', userAgent: VICTIME_UA, deviceModel: 'iPhone15,2', country: 'FR' }),
  ]);
  const createLoginNewDeviceNotification = jest.fn(async () => undefined);
  const verdict = await notifyIfLoginFromNewDevice(store, { createLoginNewDeviceNotification }, 'secret', {
    userId: USER, currentSessionId: 'd'.repeat(24),
    deviceInfo: parseUserAgent(CHROME_LINUX), userAgent: CHROME_LINUX,
    ipAddress: '198.51.100.9', geoData: { country: 'RU' },
  });
  return { verdict, envoyees: createLoginNewDeviceNotification.mock.calls.length };
}

describe('P1 — une session RÉVOQUÉE ne fait pas reconnaître l’appareil qui revient', () => {
  it.each([...SESSION_REVOCATION_REASONS])('révoquée pour « %s » : la reconnexion alerte', async (reason) => {
    const { verdict, envoyees } = await reconnexionApres(reason);
    expect(verdict).toBe('alerte-emise');
    expect(envoyees).toBe(1);
  });

  it('les motifs couvrent chaque révocation écrite par la passerelle', () => {
    expect([...SESSION_REVOCATION_REASONS].sort()).toEqual(
      ['PASSWORD_RESET', 'admin_revoke', 'email_revoke_all', 'password_changed', 'user_revoked', 'user_revoked_all'].sort()
    );
  });

  it.each(['logout', 'expired', 'session_limit_exceeded'])(
    'CONTRE-ÉPREUVE — close pour « %s » (fin ordinaire), l’appareil reste connu',
    async (reason) => {
      const { verdict } = await reconnexionApres(reason);
      expect(verdict).toBe('appareil-connu');
    }
  );

  it('CONTRE-ÉPREUVE — une session encore valide fait reconnaître l’appareil', async () => {
    const { verdict } = await reconnexionApres('', true);
    expect(verdict).toBe('appareil-connu');
  });
});
