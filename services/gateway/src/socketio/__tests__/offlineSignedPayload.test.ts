/**
 * Ce que la FILE fait d'un message dont une pièce se lit PAR LECTEUR (#18619).
 *
 * L'émission directe est par destinataire, adresses signées pour SA ligne
 * `Participant`. L'enfilement, trente lignes plus bas, stockait le
 * `peerPayload` GÉNÉRIQUE — non signé — et rien dans le drain ne le signait.
 *
 * ─── Le sous-cas net, et c'est lui qui nomme la règle ────────────────────────
 *
 * Quand la lecture du plan ÉCHOUE, l'émission directe rend **sans avoir rien
 * émis**, pour la raison écrite dans `planOutcome.ts` :
 *
 * > « l'adresse nue d'une pièce peut-être protégée partirait à toute la room »
 *
 * L'enfilement était HORS de cette décision et tournait quand même : la charge
 * nue était écrite dans Redis pour chaque participant hors ligne et rejouée
 * telle quelle, jusqu'à 48 h plus tard. **La justification du refus en direct
 * s'applique à l'identique à une entrée adressée à un destinataire NOMMÉ** —
 * elle s'y applique même PLUS fort, la file survivant à la fenêtre pendant
 * laquelle la protection de la pièce peut changer.
 *
 * ─── Les deux conséquences, selon le drapeau ────────────────────────────────
 *
 * `ATTACHMENT_URL_SIGNATURE_ENFORCE` vaut `false` par défaut dans les deux
 * environnements :
 *
 * | drapeau | ce que l'entrée nue produit |
 * |---|---|
 * | `false` (aujourd'hui) | l'adresse nue est SERVIE à qui la détient — un destinataire qui a déjà consommé une pièce à vue unique en relit les octets depuis l'URL enfilée |
 * | `true` | chaque rejeu d'une pièce protégée devient un 404, pendant que les destinataires EN LIGNE du même événement la voient : une divergence entre les deux canaux d'un seul événement |
 *
 * Et la sortie de transition est inatteignable : `UNSIGNED_READER_BOUND_FILE_EVENT`
 * ne peut pas tomber à zéro tant que la file fabrique des URL nues liées au
 * lecteur, donc le drapeau ne peut jamais être basculé.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

import { PLAN_UNAVAILABLE } from '../planOutcome';
import { offlineSignedPayload } from '../offlineSignedPayload';

const BASE = { id: 'm-1', attachments: [{ id: 'att-1', fileUrl: 'https://cdn/nu.jpg' }] };
const base = () => BASE as Record<string, unknown>;

/** Le plan réel ne rend que ces deux capacités à ce site. */
const planSignant = () => ({
  targets: [],
  signFor: jest.fn((payload: object, participantId: string) => ({ ...payload, signedFor: participantId })),
  signAttachment: jest.fn((a: object) => a),
}) as never;

describe('offlineSignedPayload (#18619)', () => {
  /**
   * LE témoin du lot. `PLAN_UNAVAILABLE` gouverne les DEUX canaux, pas le seul
   * direct : ne pas savoir adresser une pièce protégée n'autorise pas à
   * l'écrire en clair dans Redis pour 48 h.
   */
  it('RETIENT tout quand le plan est illisible', () => {
    expect(offlineSignedPayload({ plan: PLAN_UNAVAILABLE, base }).kind).toBe('withhold');
  });

  /**
   * L'autre moitié, et elle garde contre le correctif trop large : un message
   * ORDINAIRE n'a pas de pièce liée au lecteur, son plan vaut `null`, et le
   * retenir casserait le rattrapage hors ligne de tout le produit.
   */
  it('laisse passer TEL QUEL quand aucune pièce ne se lit par lecteur', () => {
    expect(offlineSignedPayload({ plan: null, base }).kind).toBe('as-is');
  });

  it('signe PAR DESTINATAIRE quand une pièce se lit par lecteur', () => {
    const decision = offlineSignedPayload({ plan: planSignant(), base });

    expect(decision.kind).toBe('per-reader');
    if (decision.kind !== 'per-reader') throw new Error('forme attendue');
    expect(decision.resolve('u-bob', 'p-bob')).toEqual({ ...BASE, signedFor: 'p-bob' });
  });

  /**
   * La signature est PAR PARTICIPANT, pas par clé de file : deux lecteurs
   * d'une même entrée ne doivent jamais recevoir la même adresse. Un témoin
   * sur un seul lecteur ne peut pas distinguer la forme juste du défaut.
   */
  it('ne sert pas à deux lecteurs la MÊME adresse', () => {
    const decision = offlineSignedPayload({ plan: planSignant(), base });
    if (decision.kind !== 'per-reader') throw new Error('forme attendue');

    expect(decision.resolve('u-bob', 'p-bob')).not.toEqual(decision.resolve('u-ana', 'p-ana'));
  });

  /**
   * La base reste celle du LECTEUR : le retrait des sources de transfert
   * refusées et le scellement d'une citation d'éphémère (`payloadForKey`)
   * précèdent la signature, ils ne la remplacent pas. Les composer dans
   * l'autre sens signerait une charge que ce lecteur n'a pas le droit de voir.
   */
  it('signe la base DU LECTEUR, pas la charge générique', () => {
    const parLecteur = jest.fn((key: string) => ({ id: 'm-1', pour: key }) as Record<string, unknown>);

    const decision = offlineSignedPayload({ plan: planSignant(), base: parLecteur });
    if (decision.kind !== 'per-reader') throw new Error('forme attendue');

    expect(decision.resolve('u-bob', 'p-bob')).toEqual({ id: 'm-1', pour: 'u-bob', signedFor: 'p-bob' });
    expect(parLecteur).toHaveBeenCalledWith('u-bob');
  });
});
