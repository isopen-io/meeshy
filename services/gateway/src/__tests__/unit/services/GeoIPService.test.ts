import { mergeClientHeaders } from '../../../services/GeoIPService';

describe('GeoIPService — mergeClientHeaders', () => {
  it('enrichit deviceInfo avec les headers X-Meeshy-*', () => {
    const deviceInfo = {
      type: 'mobile', vendor: null, model: null,
      os: null, osVersion: null, browser: null, browserVersion: null,
      isMobile: true, isTablet: false, rawUserAgent: 'Meeshy-iOS/1.0.0',
    };
    const result = mergeClientHeaders(deviceInfo, null, {
      'x-meeshy-device': 'iPhone16,1',
      'x-meeshy-os': '17.5.1',
      'x-meeshy-platform': 'ios',
    });
    expect(result.deviceInfo?.model).toBe('iPhone16,1');
    expect(result.deviceInfo?.osVersion).toBe('17.5.1');
    expect(result.deviceInfo?.vendor).toBe('Apple');
  });

  // #9608 — le LIEU vient de l'adresse attestée ; les en-têtes ne le décident plus.
  it('ne fabrique aucun lieu depuis X-Meeshy-Country/City/Region ; le fuseau reste remis par le client', () => {
    const result = mergeClientHeaders(null, null, {
      'x-meeshy-country': 'FR',
      'x-meeshy-city': 'Paris',
      'x-meeshy-timezone': 'Europe/Paris',
      'x-meeshy-region': 'Île-de-France',
    });
    expect(result.geoData?.country).toBeNull();
    expect(result.geoData?.city).toBeNull();
    expect(result.geoData?.region).toBeNull();
    expect(result.geoData?.location).toBeNull();
    expect(result.geoData?.timezone).toBe('Europe/Paris');
  });

  it('conserve les valeurs geoData existantes quand aucun header geo présent', () => {
    const geoData = {
      ip: '1.2.3.4', country: 'US', countryName: 'United States',
      city: 'New York', region: 'NY', timezone: 'America/New_York',
      location: 'New York, US',
    };
    const result = mergeClientHeaders(null, geoData, {});
    expect(result.geoData?.country).toBe('US');
    expect(result.geoData?.city).toBe('New York');
  });

  it("un en-tête de pays ou de ville n'écrase pas le lieu déduit de l'IP — même un utilisateur VPN", () => {
    const geoData = {
      ip: '1.2.3.4', country: 'FR', countryName: 'France',
      city: 'Paris', region: 'IDF', timezone: 'Europe/Paris',
      location: 'Paris, France',
    };
    const result = mergeClientHeaders(null, geoData, {
      'x-meeshy-country': 'US', 'x-meeshy-city': 'Boston', 'x-meeshy-region': 'MA',
    });
    expect(result.geoData).toEqual(geoData);
  });
});
