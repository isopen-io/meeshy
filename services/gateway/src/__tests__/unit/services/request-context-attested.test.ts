/**
 * #9608 — l'IP d'une session est celle que le proxy ATTESTE, et les en-têtes
 * du client ne décident ni du lieu ni de l'alerte « nouvelle connexion ».
 *
 * Avant ce lot :
 *  - `extractIpFromRequest` lisait `cf-connecting-ip`, `x-real-ip`, puis le
 *    PREMIER maillon de `x-forwarded-for` — trois en-têtes que l'appelant écrit
 *    lui-même — alors que `request.ip` est résolu par Fastify sous `trustProxy`
 *    borné (#4137, `config/trust-proxy.ts`) ;
 *  - `X-Meeshy-Country` / `-City` / `-Region` écrasaient le pays, la ville et le
 *    lieu déduits de l'IP — et `X-Meeshy-Country` est la RÉGION réglée dans
 *    iOS, pas un lieu ;
 *  - l'empreinte de l'alerte se calculait sur l'appareil enrichi par
 *    `X-Meeshy-Device` / `-Platform` : un voleur de mot de passe imitait
 *    l'appareil de la victime en deux en-têtes, et l'alerte se taisait.
 *
 * Les témoins forgent ces en-têtes et assertent sur ce qui est ENREGISTRÉ ou
 * ÉMIS — l'adresse, le pays, l'alerte.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify from 'fastify';
import {
  extractIpFromRequest,
  getRequestContext,
  mergeClientHeaders,
  resetGeoCacheForTests,
  parseUserAgent,
  useGeoIpDatabaseForTests,
  type GeoIpData,
} from '../../../services/GeoIPService';
import { resolveTrustProxy } from '../../../config/trust-proxy';
import { isLoginFromUnrecognisedDevice } from '../../../utils/new-device';
import { notifyIfLoginFromNewDevice } from '../../../routes/auth/notify-new-device';

const CLIENT_REEL = '203.0.113.9';
const TRAEFIK = '172.18.0.2';
const FORGE = {
  'cf-connecting-ip': '1.1.1.1',
  'x-real-ip': '9.9.9.9',
  'x-forwarded-for': `6.6.6.6, ${CLIENT_REEL}`,
};

const IOS_UA = 'Meeshy/1874 CFNetwork/3826.500.111.2.2 Darwin/24.4.0';
/** Ce que Traefik pose lui-même : `X-Forwarded-For` réduit à l'adresse du client. */
const POSE_PAR_TRAEFIK = { 'x-forwarded-for': CLIENT_REEL };

const VICTIME_HEADERS = {
  ...POSE_PAR_TRAEFIK,
  'user-agent': IOS_UA,
  'x-meeshy-platform': 'ios',
  'x-meeshy-device': 'iPhone16,1',
  'x-meeshy-os': '18.4',
  'x-meeshy-country': 'FR',
  'x-meeshy-city': 'Paris',
  'x-meeshy-region': 'Île-de-France',
  'x-meeshy-timezone': 'Europe/Paris',
};

/** La base LOCALE (#9609) qui situe toute adresse publique dans `country`/`city`. */
function geoApi(country: string, city: string) {
  const record = {
    country: { iso_code: country, names: { en: country === 'DE' ? 'Germany' : 'France' } },
    city: { names: { en: city } },
    subdivisions: [{ names: { en: 'R' } }],
    location: { time_zone: 'Europe/Berlin' },
  };
  return { source: async () => ({ get: () => record }) };
}

async function contextBehindTraefik(headers: Record<string, string>) {
  const app = Fastify({ logger: false, trustProxy: resolveTrustProxy('1') });
  let captured: Awaited<ReturnType<typeof getRequestContext>> | null = null;
  app.get('/probe', async (request) => {
    captured = await getRequestContext(request);
    return { ok: true };
  });
  await app.ready();
  await app.inject({ method: 'GET', url: '/probe', remoteAddress: TRAEFIK, headers });
  await app.close();
  if (!captured) throw new Error('aucun contexte capturé');
  return captured as Awaited<ReturnType<typeof getRequestContext>>;
}

describe("#9608 — l'adresse est celle que le proxy atteste", () => {
  beforeEach(() => { resetGeoCacheForTests(); });
  afterEach(() => { useGeoIpDatabaseForTests(null); });

  it('derrière Traefik (un maillon de confiance), les en-têtes forgés ne choisissent PAS l’adresse', async () => {
    useGeoIpDatabaseForTests(geoApi('DE', 'Berlin'));

    const contexte = await contextBehindTraefik({ ...FORGE });

    expect(contexte.ip).toBe(CLIENT_REEL);
  });

  it('extractIpFromRequest rend request.ip tel quel, quels que soient cf-connecting-ip / x-real-ip / x-forwarded-for', () => {
    const request = { ip: '198.51.100.4', headers: { ...FORGE } } as never;
    expect(extractIpFromRequest(request)).toBe('198.51.100.4');
  });

  it('le boucle IPv6 reste normalisé', () => {
    expect(extractIpFromRequest({ ip: '::1', headers: {} } as never)).toBe('127.0.0.1');
    expect(extractIpFromRequest({ ip: '::ffff:127.0.0.1', headers: {} } as never)).toBe('127.0.0.1');
  });

  it("le pays, la ville et le lieu viennent de l'IP — X-Meeshy-Country / City / Region n'y touchent plus", async () => {
    useGeoIpDatabaseForTests(geoApi('DE', 'Berlin'));

    const contexte = await contextBehindTraefik({ ...VICTIME_HEADERS });

    expect(contexte.geoData?.country).toBe('DE');
    expect(contexte.geoData?.city).toBe('Berlin');
    expect(contexte.geoData?.region).toBe('R');
    expect(contexte.geoData?.location).toBe('Berlin, Germany');
  });

  it('ce que le serveur ne peut pas savoir reste remis par le client : modèle, système, fuseau', async () => {
    useGeoIpDatabaseForTests(geoApi('DE', 'Berlin'));

    const contexte = await contextBehindTraefik({ ...VICTIME_HEADERS });

    expect(contexte.deviceInfo?.model).toBe('iPhone16,1');
    expect(contexte.deviceInfo?.os).toBe('iOS');
    expect(contexte.deviceInfo?.osVersion).toBe('18.4');
    expect(contexte.geoData?.timezone).toBe('Europe/Paris');
  });

  it('sans géolocalisation, les en-têtes de lieu ne fabriquent pas un lieu', () => {
    const { geoData } = mergeClientHeaders(null, null, {
      'x-meeshy-country': 'FR', 'x-meeshy-city': 'Paris', 'x-meeshy-region': 'IDF',
    });
    expect(geoData).toBeNull();
  });
});

const sessionVictime = {
  deviceType: 'mobile', deviceVendor: 'Apple', deviceModel: 'iPhone16,1', osName: 'iOS',
  browserName: null, userAgent: IOS_UA, country: 'FR',
};
const ici = (country: string | null) => (country ? ({ country } as Pick<GeoIpData, 'country'>) : null);

describe('#9608 — l’alerte « nouvelle connexion » ne se laisse pas taire par des en-têtes', () => {
  it("un voleur qui recopie l'agent ET les en-têtes de la victime, depuis un autre pays, déclenche l'alerte", () => {
    const alerte = isLoginFromUnrecognisedDevice([sessionVictime], {
      userAgent: IOS_UA, declaredModel: 'iPhone16,1', attestedCountry: 'DE',
    }, parseUserAgent);
    expect(alerte).toBe(true);
  });

  it('la victime, même agent, même modèle, même pays : aucune alerte', () => {
    const alerte = isLoginFromUnrecognisedDevice([sessionVictime], {
      userAgent: IOS_UA, declaredModel: 'iPhone16,1', attestedCountry: 'FR',
    }, parseUserAgent);
    expect(alerte).toBe(false);
  });

  it("un modèle DÉCLARÉ différent ajoute une alerte — l'en-tête peut alerter, jamais taire", () => {
    const alerte = isLoginFromUnrecognisedDevice([sessionVictime], {
      userAgent: IOS_UA, declaredModel: 'iPhone12,8', attestedCountry: 'FR',
    }, parseUserAgent);
    expect(alerte).toBe(true);
  });

  it("l'appareil se lit sur l'agent RE-LU par le serveur, jamais sur les colonnes enrichies par l'en-tête", () => {
    const enrichiParEnTete = { ...sessionVictime, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' };
    const alerte = isLoginFromUnrecognisedDevice([enrichiParEnTete], {
      userAgent: IOS_UA, declaredModel: 'iPhone16,1', attestedCountry: 'FR',
    }, parseUserAgent);
    expect(alerte).toBe(true);
  });

  it("pays inconnu (géolocalisation en échec) : la décision revient à l'appareil — ni alerte en rafale, ni silence fabriqué", () => {
    const connu = isLoginFromUnrecognisedDevice([sessionVictime], {
      userAgent: IOS_UA, declaredModel: 'iPhone16,1', attestedCountry: null,
    }, parseUserAgent);
    const inconnu = isLoginFromUnrecognisedDevice([sessionVictime], {
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', declaredModel: null, attestedCountry: null,
    }, parseUserAgent);
    expect(connu).toBe(false);
    expect(inconnu).toBe(true);
  });

  it("une session antérieure sans pays n'atteste pas le lieu d'une connexion dont le pays est connu", () => {
    const alerte = isLoginFromUnrecognisedDevice([{ ...sessionVictime, country: null }], {
      userAgent: IOS_UA, declaredModel: 'iPhone16,1', attestedCountry: 'FR',
    }, parseUserAgent);
    expect(alerte).toBe(true);
  });

  it("la porte de l'alerte relit le PAYS des sessions antérieures et émet pour le voleur", async () => {
    const findMany = jest.fn(async (args: unknown) => {
      expect((args as { select: Record<string, boolean> }).select.country).toBe(true);
      return [sessionVictime];
    });
    const createLoginNewDeviceNotification = jest.fn(async () => undefined);

    const verdict = await notifyIfLoginFromNewDevice({ findMany }, { createLoginNewDeviceNotification }, 'secret', {
      userId: 'u-1',
      currentSessionId: 's-neuve',
      deviceInfo: { type: 'mobile', vendor: 'Apple', model: 'iPhone16,1', os: 'iOS', browser: null },
      userAgent: IOS_UA,
      ipAddress: '5.5.5.5',
      geoData: ici('DE'),
    });

    expect(verdict).toBe('alerte-emise');
    expect(createLoginNewDeviceNotification).toHaveBeenCalledTimes(1);
  });
});
