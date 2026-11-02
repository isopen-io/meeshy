/**
 * La vérification XEdDSA (T. Perrin, *The XEdDSA and VXEdDSA Signature
 * Schemes*, rév. 1) d'une pré-clé par la clé d'identité de son appareil, faite
 * par libsignal (`PublicKey.verify`) — jamais par une primitive maison.
 *
 * C'est une HYGIÈNE d'annuaire (spec § 3.2) : la garantie reste la
 * vérification par l'appareil qui consomme le bundle (`processPreKeyBundle`).
 * Elle échoue FERMÉE : une bibliothèque introuvable refuse la publication,
 * elle ne la laisse jamais passer sans vérification.
 */

export type SignatureCheck = {
  /** Clé d'identité publique sérialisée par libsignal (33 octets), base64. */
  readonly identityKey: string;
  /** Les octets signés (la clé publique sérialisée), base64. */
  readonly message: string;
  readonly signature: string;
};

export interface SignatureVerifier {
  verify(check: SignatureCheck): Promise<boolean>;
}

/** La seule surface de libsignal dont la vérification a besoin. */
export type LibsignalPublicKeyApi = {
  readonly PublicKey: {
    deserialize(bytes: Uint8Array): { verify(message: Uint8Array, signature: Uint8Array): boolean };
  };
};

const bytesOf = (base64: string): Uint8Array => new Uint8Array(Buffer.from(base64, 'base64'));

/**
 * Le vérificateur de production. Une clé qui ne se désérialise pas (mauvais
 * type, longueur) est une signature FAUSSE, pas une erreur d'infrastructure ;
 * une bibliothèque qui ne se charge pas, elle, en est une : elle se propage.
 */
export function libsignalSignatureVerifier(load: () => LibsignalPublicKeyApi): SignatureVerifier {
  return {
    verify: async ({ identityKey, message, signature }) => {
      const publicKey = load().PublicKey;
      if (typeof publicKey?.deserialize !== 'function') throw new Error('libsignal PublicKey indisponible');
      try {
        return publicKey.deserialize(bytesOf(identityKey)).verify(bytesOf(message), bytesOf(signature));
      } catch {
        return false;
      }
    },
  };
}

/**
 * Charge `@signalapp/libsignal-client` (module ESM, binaire natif) depuis
 * Node ≥ 22.12, où `require` d'un module ESM est permis. Mis en cache.
 */
let cached: LibsignalPublicKeyApi | undefined;

export function loadLibsignal(): LibsignalPublicKeyApi {
  if (!cached) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('@signalapp/libsignal-client') as LibsignalPublicKeyApi;
  }
  return cached;
}
