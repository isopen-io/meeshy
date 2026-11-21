import { sharedLocationFixOf, type SharedLocationFix } from './shared-location-sending';

/**
 * **MA DERNIÈRE POSITION CONNUE, SANS RIEN DEMANDER** (#20242, iso `OwnLastPositionReader`) — seulement si la permission
 * de localisation est DÉJÀ accordée (jamais de demande depuis une fiche) : la position que le navigateur garde, quel
 * que soit son âge, avec son instant. `null` : aucune position connue, ou pas le droit de la lire.
 */
export type OwnLastPosition = { readonly fix: SharedLocationFix; readonly at: number };

const LAST_KNOWN: PositionOptions = { enableHighAccuracy: false, maximumAge: Number.POSITIVE_INFINITY, timeout: 10_000 };

export async function browserOwnLastPosition(
  geolocation: Geolocation | undefined = globalThis.navigator?.geolocation,
  permissions: Permissions | undefined = globalThis.navigator?.permissions,
): Promise<OwnLastPosition | null> {
  if (geolocation === undefined || permissions === undefined) return null;
  const granted = await permissions.query({ name: 'geolocation' }).then(
    (status) => status.state === 'granted',
    () => false,
  );
  if (!granted) return null;
  return new Promise((resolve) => {
    geolocation.getCurrentPosition(
      (position) => {
        const fix = sharedLocationFixOf({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy });
        resolve(fix === null ? null : { fix, at: position.timestamp });
      },
      () => resolve(null),
      LAST_KNOWN,
    );
  });
}
