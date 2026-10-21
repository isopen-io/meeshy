/**
 * LE LIEN DE CONNEXION EST LIÉ À L'APPAREIL QUI L'A DEMANDÉ (#10872).
 *
 * À la DEMANDE (`POST /auth/magic-link/request`), ce module tire un secret neuf
 * (32 octets aléatoires, base64url), le garde dans le `localStorage` de
 * l'origine — le lien de l'e-mail s'ouvre dans un NOUVEL onglet, que
 * `sessionStorage` ne verrait pas — et rend son EMPREINTE SHA-256, seule chose
 * envoyée à la passerelle, qui l'attache au jeton.
 *
 * À la CONSOMMATION (`POST /auth/verify-email` par jeton,
 * `POST /auth/magic-link/validate`), le secret est présenté : le même
 * navigateur se connecte sans question ; tout autre (lien ouvert ailleurs, lien
 * forgé par un tiers — OWASP « Login CSRF ») reçoit la question
 * « Se connecter en tant que @x ? » avant qu'aucune session n'existe.
 *
 * Un stockage indisponible (navigation privée stricte, quota, coque sans
 * `localStorage`) ne lève jamais : pas de liaison, et la confirmation couvre.
 */

export const LINK_DEVICE_SECRET_KEY = 'meeshy.linkDeviceSecret';

const SECRET_BYTES = 32;
const SECRET_SHAPE = /^[A-Za-z0-9_-]{22,256}$/;

export type LinkSecretStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type LinkDeviceSecrets = {
  /** Tire et garde un secret neuf ; rend son empreinte, `null` si rien n'a pu être gardé. */
  issue(): Promise<string | null>;
  /** Le secret gardé, à présenter avec le jeton. */
  presented(): string | null;
  /** L'issue du lien est définitive : le secret ne resservira pas. */
  forget(): void;
};

type LinkCrypto = Pick<Crypto, 'getRandomValues'> & { readonly subtle: Pick<SubtleCrypto, 'digest'> };

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const hex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

export async function linkDeviceHashOf(secret: string, crypto: LinkCrypto = globalThis.crypto): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)));
}

export function createLinkDeviceSecrets({
  storage,
  crypto,
}: {
  readonly storage: () => LinkSecretStorage | null;
  readonly crypto: () => LinkCrypto | null;
}): LinkDeviceSecrets {
  const attempt = <T>(run: () => T, fallback: T): T => {
    try {
      return run();
    } catch {
      return fallback;
    }
  };

  return {
    async issue() {
      const store = attempt(storage, null);
      const random = attempt(crypto, null);
      if (store === null || random === null) return null;
      try {
        const secret = base64url(random.getRandomValues(new Uint8Array(SECRET_BYTES)));
        const hash = await linkDeviceHashOf(secret, random);
        store.setItem(LINK_DEVICE_SECRET_KEY, secret);
        return store.getItem(LINK_DEVICE_SECRET_KEY) === secret ? hash : null;
      } catch {
        return null;
      }
    },
    presented() {
      const value = attempt(() => storage()?.getItem(LINK_DEVICE_SECRET_KEY) ?? null, null);
      return typeof value === 'string' && SECRET_SHAPE.test(value) ? value : null;
    },
    forget() {
      attempt(() => storage()?.removeItem(LINK_DEVICE_SECRET_KEY), undefined);
    },
  };
}

export const linkDeviceSecrets: LinkDeviceSecrets = createLinkDeviceSecrets({
  storage: () => (typeof localStorage === 'undefined' ? null : localStorage),
  crypto: () => (typeof globalThis.crypto?.subtle === 'undefined' ? null : globalThis.crypto),
});
