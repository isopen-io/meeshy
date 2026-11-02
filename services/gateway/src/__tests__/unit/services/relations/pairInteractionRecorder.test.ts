/**
 * L'AGRÉGAT PAR PAIRE ET PAR JOUR (#13932) — ce que l'enregistreur compte, et ce
 * qu'il refuse de compter. Les témoins lisent l'ÉTAT de la collection après coup.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  PAIR_INTERACTION_RETENTION_DAYS,
  notePairInteraction,
  recordPairInteraction,
} from '../../../../services/relations/pairInteractionRecorder';
import { pairInteractionStore } from '../../../helpers/pair-interaction-store';

const LOW = '5f0000000000000000000001';
const HIGH = '5f0000000000000000000002';
const THIRD = '5f0000000000000000000003';
const NOW = new Date('2026-10-31T10:30:00Z');
const MIDNIGHT = new Date('2026-10-31T00:00:00Z');

describe('recordPairInteraction — un compteur par paire, par jour UTC et par sens', () => {
  it('crée la ligne du jour et compte du côté de L’AUTEUR, quel que soit l’ordre low/high', async () => {
    const store = pairInteractionStore();

    const outcome = await recordPairInteraction(store.prisma, { actorId: HIGH, otherId: LOW, nature: 'message', at: NOW });

    expect(outcome).toBe('recorded');
    expect(store.days()).toHaveLength(1);
    expect(store.days()[0]).toMatchObject({ userLowId: LOW, userHighId: HIGH, day: MIDNIGHT, byHighMessage: 1 });
    expect(store.days()[0].byLowMessage).toBeUndefined();
  });

  it('incrémente la même ligne dans la journée : deux messages, une ligne, un compteur à deux', async () => {
    const store = pairInteractionStore();
    await recordPairInteraction(store.prisma, { actorId: LOW, otherId: HIGH, nature: 'message', at: NOW });
    await recordPairInteraction(store.prisma, { actorId: LOW, otherId: HIGH, nature: 'message', at: new Date('2026-10-31T23:59:00Z') });

    expect(store.days()).toHaveLength(1);
    expect(store.days()[0].byLowMessage).toBe(2);
  });

  it('sépare les natures et les sens sur la même ligne', async () => {
    const store = pairInteractionStore();
    await recordPairInteraction(store.prisma, { actorId: LOW, otherId: HIGH, nature: 'audio', at: NOW });
    await recordPairInteraction(store.prisma, { actorId: HIGH, otherId: LOW, nature: 'postView', at: NOW });
    await recordPairInteraction(store.prisma, { actorId: HIGH, otherId: LOW, nature: 'storyReply', at: NOW });

    expect(store.days()).toHaveLength(1);
    expect(store.days()[0]).toMatchObject({ byLowAudio: 1, byHighPostView: 1, byHighStoryReply: 1 });
  });

  it('ouvre une ligne par jour UTC : 23 h 59 et 00 h 00 ne se mélangent pas', async () => {
    const store = pairInteractionStore();
    await recordPairInteraction(store.prisma, { actorId: LOW, otherId: HIGH, nature: 'reaction', at: new Date('2026-10-31T23:59:59Z') });
    await recordPairInteraction(store.prisma, { actorId: LOW, otherId: HIGH, nature: 'reaction', at: new Date('2026-11-01T00:00:00Z') });

    expect(store.days().map((d) => d.day)).toEqual([MIDNIGHT, new Date('2026-11-01T00:00:00Z')]);
  });

  it('date l’expiration (index TTL) à la conservation après la fin du jour', async () => {
    const store = pairInteractionStore();
    await recordPairInteraction(store.prisma, { actorId: LOW, otherId: HIGH, nature: 'call', at: NOW });

    const expected = new Date(MIDNIGHT.getTime() + PAIR_INTERACTION_RETENTION_DAYS * 86_400_000);
    expect(store.days()[0].expiresAt).toEqual(expected);
    expect(PAIR_INTERACTION_RETENTION_DAYS).toBeGreaterThanOrEqual(98);
  });

  it('ne perd aucun compte quand un écrivain concurrent crée la ligne juste avant : reprise en incrément', async () => {
    const store = pairInteractionStore({ racesOnFirstCreate: true });

    const outcome = await recordPairInteraction(store.prisma, { actorId: LOW, otherId: HIGH, nature: 'message', at: NOW });

    expect(outcome).toBe('recorded');
    expect(store.days()).toHaveLength(1);
    expect(store.days()[0].byLowMessage).toBe(1);
  });

  it('ignore soi-même, un identifiant vide et une nature inconnue : rien n’est écrit', async () => {
    const store = pairInteractionStore();

    expect(await recordPairInteraction(store.prisma, { actorId: LOW, otherId: LOW, nature: 'message', at: NOW })).toBe('ignored');
    expect(await recordPairInteraction(store.prisma, { actorId: '', otherId: HIGH, nature: 'message', at: NOW })).toBe('ignored');
    expect(
      await recordPairInteraction(store.prisma, { actorId: LOW, otherId: HIGH, nature: 'clair' as never, at: NOW }),
    ).toBe('ignored');
    expect(store.days()).toHaveLength(0);
  });

  it('ne reçoit AUCUN contenu : la signature ne porte que l’auteur, l’autre, la nature et l’instant', async () => {
    const store = pairInteractionStore();
    await recordPairInteraction(store.prisma, {
      actorId: LOW, otherId: HIGH, nature: 'message', at: NOW, content: 'secret', text: 'secret',
    } as never);

    expect(JSON.stringify(store.days())).not.toContain('secret');
  });
});

describe('notePairInteraction — fire-and-forget, jamais sur le chemin critique', () => {
  it('compte sans rien rendre à attendre', async () => {
    const store = pairInteractionStore();
    const result = notePairInteraction(store.prisma, { actorId: LOW, otherId: HIGH, nature: 'mention', at: NOW });
    await new Promise((resolve) => setImmediate(resolve));

    expect(result).toBeUndefined();
    expect(store.days()[0]).toMatchObject({ byLowMention: 1 });
  });

  it('avale l’échec d’écriture (journalisé) : l’envoi du message n’échoue jamais pour un compteur', async () => {
    const store = pairInteractionStore({ failCreate: new Error('mongo down') });

    expect(() => notePairInteraction(store.prisma, { actorId: LOW, otherId: HIGH, nature: 'message', at: NOW })).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(store.days()).toHaveLength(0);
  });

  it('compte plusieurs destinataires d’une même action (mentions de groupe)', async () => {
    const store = pairInteractionStore();
    notePairInteraction(store.prisma, { actorId: LOW, otherId: HIGH, nature: 'mention', at: NOW });
    notePairInteraction(store.prisma, { actorId: LOW, otherId: THIRD, nature: 'mention', at: NOW });
    await new Promise((resolve) => setImmediate(resolve));

    expect(store.days()).toHaveLength(2);
  });
});
