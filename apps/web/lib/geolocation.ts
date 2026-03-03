type GeolocationData = {
  city: string;
  country: string;
  countryCode: string;
  timezone: string;
  region: string;
};

const GEOLOCATION_TIMEOUT = 5000;
const REVERSE_GEOCODE_TIMEOUT = 5000;

let cachedGeo: GeolocationData | null = null;
let pendingRequest: Promise<GeolocationData | null> | null = null;

function getBrowserPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation not available'));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: GEOLOCATION_TIMEOUT,
      maximumAge: 300000,
    });
  });
}

async function reverseGeocode(lat: number, lng: number): Promise<GeolocationData> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REVERSE_GEOCODE_TIMEOUT);

  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=fr`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Reverse geocode failed: ${response.status}`);
    }

    const data = await response.json();

    return {
      city: data.city || data.locality || '',
      country: data.countryName || '',
      countryCode: data.countryCode || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      region: data.principalSubdivision || '',
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export async function requestBrowserGeolocation(): Promise<GeolocationData | null> {
  if (cachedGeo) return cachedGeo;
  if (pendingRequest) return pendingRequest;

  pendingRequest = (async () => {
    try {
      const position = await getBrowserPosition();
      const geo = await reverseGeocode(position.coords.latitude, position.coords.longitude);
      cachedGeo = geo;
      console.log('[GEOLOCATION] Captured:', geo.city, geo.countryCode);
      return geo;
    } catch (error) {
      console.log('[GEOLOCATION] Not available:', (error as Error).message);
      return null;
    } finally {
      pendingRequest = null;
    }
  })();

  return pendingRequest;
}

export function getCachedGeolocation(): GeolocationData | null {
  return cachedGeo;
}

export function getGeolocationHeaders(): Record<string, string> {
  if (!cachedGeo) return {};

  const headers: Record<string, string> = {
    'X-Meeshy-Platform': 'web',
  };

  if (cachedGeo.city) headers['X-Meeshy-City'] = cachedGeo.city;
  if (cachedGeo.countryCode) headers['X-Meeshy-Country'] = cachedGeo.countryCode;
  if (cachedGeo.timezone) headers['X-Meeshy-Timezone'] = cachedGeo.timezone;
  if (cachedGeo.region) headers['X-Meeshy-Region'] = cachedGeo.region;

  return headers;
}
