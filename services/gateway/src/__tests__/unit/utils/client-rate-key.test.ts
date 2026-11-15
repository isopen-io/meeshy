/**
 * La clé de débit ne se laisse pas choisir par l'appelant (#4158).
 *
 * Le témoin vit sur `clientRateKey` et non sur une route : une garde posée sur
 * une seule route repasserait au vert le jour où un AUTRE limiteur du module
 * réintroduirait une lecture d'en-tête.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { clientRateKey, callerRateKey } from '../../../utils/client-rate-key';

const requete = (ip: string, headers: Record<string, string> = {}, authContext?: unknown) =>
  ({ ip, headers, authContext }) as never;

describe('clientRateKey — deux appelants, deux seaux', () => {
  it('sépare deux adresses distinctes', () => {
    expect(clientRateKey(requete('203.0.113.1'))).not.toBe(clientRateKey(requete('203.0.113.2')));
  });

  it('IGNORE les en-têtes que l’appelant écrit lui-même', () => {
    // C'est l'affirmation centrale. `x-forwarded-for`, `x-real-ip` et
    // `cf-connecting-ip` sont fournis par le client : les prendre pour clé
    // laisserait n'importe qui changer de seau à chaque requête, et le limiteur
    // ne compterait plus rien. `request.ip` est, lui, résolu par Fastify sous
    // `trustProxy`, borné au nombre de maillons de notre infrastructure (#4137).
    const usurpation = {
      'x-forwarded-for': '198.51.100.7',
      'x-real-ip': '198.51.100.8',
      'cf-connecting-ip': '198.51.100.9',
    };

    expect(clientRateKey(requete('203.0.113.1', usurpation)))
      .toBe(clientRateKey(requete('203.0.113.1')));
  });

  it('rend une clé stable pour une même adresse', () => {
    expect(clientRateKey(requete('203.0.113.1'))).toBe(clientRateKey(requete('203.0.113.1')));
  });
});

describe('callerRateKey — un compte se compte sur son identifiant', () => {
  it('préfère l’identifiant du compte à l’adresse', () => {
    const cle = callerRateKey(requete('203.0.113.1', {}, { userId: 'u-1' }));
    expect(cle).toBe('user:u-1');
  });

  it('ne fait pas dépendre le quota d’un compte de son réseau', () => {
    const auBureau = callerRateKey(requete('203.0.113.1', {}, { userId: 'u-1' }));
    const enMobilite = callerRateKey(requete('198.51.100.4', {}, { userId: 'u-1' }));
    expect(auBureau).toBe(enMobilite);
  });

  it('retombe sur l’adresse quand personne n’est authentifié', () => {
    expect(callerRateKey(requete('203.0.113.1'))).toBe('ip:203.0.113.1');
  });
});
