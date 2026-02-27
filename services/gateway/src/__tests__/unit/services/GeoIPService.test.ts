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

  it('enrichit geoData avec les headers X-Meeshy-Country/City/Timezone', () => {
    const result = mergeClientHeaders(null, null, {
      'x-meeshy-country': 'FR',
      'x-meeshy-city': 'Paris',
      'x-meeshy-timezone': 'Europe/Paris',
      'x-meeshy-region': 'Île-de-France',
    });
    expect(result.geoData?.country).toBe('FR');
    expect(result.geoData?.city).toBe('Paris');
    expect(result.geoData?.timezone).toBe('Europe/Paris');
  });

  it('conserve les valeurs geoData existantes quand aucun header geo présent', () => {
    const geoData = {
      ip: '1.2.3.4', country: 'US', countryName: 'United States',
      city: 'New York', region: 'NY', timezone: 'America/New_York',
      location: 'New York, US', latitude: 40.7, longitude: -74.0,
    };
    const result = mergeClientHeaders(null, geoData, {});
    expect(result.geoData?.country).toBe('US');
    expect(result.geoData?.city).toBe('New York');
  });

  it('construit location depuis city + country quand les deux headers sont présents', () => {
    const result = mergeClientHeaders(null, null, {
      'x-meeshy-city': 'Lyon',
      'x-meeshy-country': 'FR',
    });
    expect(result.geoData?.location).toBe('Lyon, FR');
  });
});
