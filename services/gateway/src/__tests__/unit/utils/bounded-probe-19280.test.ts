/**
 * #19280 — `/health` est sondé toutes les 5 s, et deux échecs de 3 s rendent la
 * passerelle `unhealthy` : Traefik l'écarte, et TOUTE l'API répond 503. La sonde
 * du traducteur y passe par un PUSH ZMQ sans délai d'envoi : traducteur absent,
 * la file se remplit (1 000 messages, soit 83 min de sondes) puis l'envoi attend
 * sans fin. Une panne du traducteur ne doit jamais faire tomber la passerelle :
 * sa sonde rend `false` dans un délai borné, jamais une attente.
 *
 * @jest-environment node
 */
import { boundedProbe } from '../../../utils/bounded-probe';

describe('boundedProbe (#19280)', () => {
  it('rend la réponse de la sonde quand elle arrive à temps', async () => {
    await expect(boundedProbe(async () => true, 50)).resolves.toBe(true);
    await expect(boundedProbe(async () => false, 50)).resolves.toBe(false);
  });

  it('rend false, dans le délai, à une sonde qui ne répond jamais', async () => {
    const started = Date.now();
    await expect(boundedProbe(() => new Promise<boolean>(() => undefined), 30)).resolves.toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('rend false à une sonde qui lève', async () => {
    await expect(boundedProbe(async () => { throw new Error('zmq'); }, 50)).resolves.toBe(false);
  });

  it('rend false à une sonde qui lève avant même de rendre sa promesse', async () => {
    await expect(boundedProbe(() => { throw new Error('sync'); }, 50)).resolves.toBe(false);
  });
});
