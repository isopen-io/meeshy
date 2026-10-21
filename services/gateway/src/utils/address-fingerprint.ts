import { createHmac } from 'crypto';
import { readerKeySecret } from '../services/posts/readerKey';

/**
 * L'EMPREINTE D'ADRESSE d'un lecteur sans compte (#10483) — ce que la
 * passerelle garde d'une adresse IP pour borner un débit et repérer un abus,
 * sans jamais l'écrire en clair.
 *
 * `HMAC(HMAC(secret, "address-day:<jour UTC>"), ip)` en hex : une clé SECRÈTE
 * (celle des clés de lecteur, exigée en production) et TOURNANTE chaque jour.
 * Un condensé sans clé d'une adresse se retrouve en essayant les adresses ;
 * celui-ci ne se recalcule qu'avec le secret, et deux jours ne se relient pas.
 *
 * L'agent utilisateur n'y entre PAS : changer de navigateur ne doit pas ouvrir
 * un nouveau seau, et une famille derrière une box reste UNE adresse.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export const addressFingerprintDay = (now: number = Date.now()): number => Math.floor(now / DAY_MS);

export function addressFingerprintOf(params: { readonly ip: string; readonly now?: number }): string {
  const dayKey = createHmac('sha256', readerKeySecret()).update(`address-day:${addressFingerprintDay(params.now)}`).digest();
  return createHmac('sha256', dayKey).update(params.ip).digest('hex');
}
