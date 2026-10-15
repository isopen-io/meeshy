import { packAssetUrl } from '../packs/pack-asset-url';

/**
 * **LES CONTRATS DES PACKS OFFICIELS** (#10632, § 8) — un profil d'autrui ne
 * sert que l'adresse `<sha16>.json` du contrat (`ServedProfileDecorItem.contract`),
 * ni sa taille ni son empreinte complète : la vérification est donc celle de
 * l'ADRESSE — le contenu doit porter l'empreinte qu'elle annonce. Immuable
 * (adressé par contenu), donc retenu pour la session ; un échec ne l'est pas.
 */

const CONTRACT_ADDRESS = /^([0-9a-f]{16})\.json$/;

export type ContractLoader = { readonly load: (src: string) => Promise<unknown> };

const sha256Hex = async (bytes: ArrayBuffer): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');

async function fetchContract(src: string, params: { readonly origin: string; readonly fetcher: typeof fetch }): Promise<unknown> {
  const match = CONTRACT_ADDRESS.exec(src);
  if (match === null) return null;
  try {
    const response = await params.fetcher(packAssetUrl(src, params.origin), { mode: 'cors', credentials: 'omit' });
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    if (!(await sha256Hex(bytes)).startsWith(match[1] ?? '?')) return null;
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

export function createContractLoader(params: { readonly origin: string; readonly fetcher?: typeof fetch }): ContractLoader {
  const fetcher = params.fetcher ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const settled = new Map<string, Promise<unknown>>();
  return {
    load: (src) => {
      const known = settled.get(src);
      if (known !== undefined) return known;
      const request = fetchContract(src, { origin: params.origin, fetcher }).then((contract) => {
        if (contract === null) settled.delete(src);
        return contract;
      });
      settled.set(src, request);
      return request;
    },
  };
}
