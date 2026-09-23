/**
 * Un message à vue unique dont le budget est épuisé n'était détruit NULLE PART.
 *
 * `recordViewOnceConsumption` compte les spectateurs exactement, la route
 * calcule `isFullyConsumed`, l'annonce `message:consumed` le porte à toute la
 * room et les clients masquent le média. Toute la chaîne a l'air branchée — et
 * il manque la seule pièce qui ne produit aucun événement : personne n'efface.
 * `content`, `encryptedContent` et les pièces jointes restent servis par les
 * ~119 lectures du modèle, qui sont toutes gardées par `deletedAt` seul. Le
 * client web, qui n'a AUCUN traitement de la vue unique, rend la photo comme
 * n'importe quelle autre, indéfiniment.
 *
 * C'est la même forme de promesse cosmétique que `expiresAt` avant le cycle 92 :
 * un champ que le schéma promet, que les clients respectent, et que le serveur
 * n'a jamais fait respecter.
 *
 * ─── POURQUOI DÉCIDER ICI ET DÉTRUIRE AILLEURS ──────────────────────────────
 *
 * La consommation est la SEULE à savoir que le budget vient de s'épuiser ; elle
 * est aussi la plus mauvaise place pour détruire, parce que le spectateur qui
 * vient de payer sa vue n'a pas encore fini de regarder — `consumeViewOnce` est
 * attendu AVANT la révélation de la bulle sur iOS. Détruire dans la foulée
 * prendrait le média des mains de celui à qui il était destiné.
 *
 * Ce module ne détruit donc pas : il pose l'ÉCHÉANCE de purge
 * (`viewOnceBurnAt`), et le balayage (`purgeDueViewOnceContent`) purge le
 * CONTENU en gardant la bulle (#7578). Jamais `expiresAt` : c'est la colonne de
 * l'éphémère, et elle supprimait la bulle pour tous.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import {
  scheduleViewOnceBurn,
  VIEW_ONCE_BURN_GRACE_MS,
} from '../scheduleViewOnceBurn';

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const AT = new Date('2026-08-12T12:00:00.000Z');

const messageUpdateMany = jest.fn<any>();

const prisma = { message: { updateMany: messageUpdateMany } } as any;

beforeEach(() => {
  messageUpdateMany.mockReset();
  messageUpdateMany.mockResolvedValue({ count: 1 });
});

describe('scheduleViewOnceBurn', () => {
  it('pose une échéance de grâce à compter de la consommation qui a épuisé le budget', async () => {
    const result = await scheduleViewOnceBurn(prisma, { messageId: MESSAGE_ID, at: AT });

    const expected = new Date(AT.getTime() + VIEW_ONCE_BURN_GRACE_MS);
    expect(result).toEqual({ scheduled: true, viewOnceBurnAt: expected });
    expect(messageUpdateMany).toHaveBeenCalledTimes(1);
    expect(messageUpdateMany.mock.calls[0][0].data).toEqual({ viewOnceBurnAt: expected });
  });

  it("n'écrit JAMAIS expiresAt — la colonne de l'éphémère supprimerait la bulle pour tous (#7578)", async () => {
    await scheduleViewOnceBurn(prisma, { messageId: MESSAGE_ID, at: AT });

    const { where, data } = messageUpdateMany.mock.calls[0][0];
    expect(data).not.toHaveProperty('expiresAt');
    expect(JSON.stringify(where)).not.toContain('expiresAt');
  });

  it('laisse au spectateur qui vient de payer sa vue le temps de la regarder', () => {
    // Le média n'est pas toujours déjà en cache : `consumeViewOnce` est attendu
    // avant la révélation, et une vidéo peut rester à télécharger. Une grâce
    // plus courte que la période du balayage lui-même ne voudrait rien dire.
    expect(VIEW_ONCE_BURN_GRACE_MS).toBeGreaterThanOrEqual(60 * 1000);
  });

  it("n'apparie que le message visé", async () => {
    await scheduleViewOnceBurn(prisma, { messageId: MESSAGE_ID, at: AT });

    expect(messageUpdateMany.mock.calls[0][0].where.id).toBe(MESSAGE_ID);
  });

  it('apparie les deux états « pas d’échéance » — la colonne absente et la colonne nulle', async () => {
    await scheduleViewOnceBurn(prisma, { messageId: MESSAGE_ID, at: AT });

    const { OR } = messageUpdateMany.mock.calls[0][0].where;
    expect(OR).toEqual(
      expect.arrayContaining([{ viewOnceBurnAt: null }, { viewOnceBurnAt: { isSet: false } }]),
    );
  });

  it('apparie une échéance POSTÉRIEURE, qu’il faut rapprocher', async () => {
    await scheduleViewOnceBurn(prisma, { messageId: MESSAGE_ID, at: AT });

    const { OR } = messageUpdateMany.mock.calls[0][0].where;
    const deadline = new Date(AT.getTime() + VIEW_ONCE_BURN_GRACE_MS);
    expect(OR).toEqual(expect.arrayContaining([{ viewOnceBurnAt: { gt: deadline } }]));
  });

  it("ne repousse JAMAIS une échéance déjà plus proche — le prédicat ne l'apparie pas", async () => {
    messageUpdateMany.mockResolvedValue({ count: 0 });

    const result = await scheduleViewOnceBurn(prisma, { messageId: MESSAGE_ID, at: AT });

    // Rien d'apparié : une échéance plus proche garde la main. La grâce ne
    // rallonge jamais la vie d'un contenu.
    expect(result.scheduled).toBe(false);
  });

  it('est idempotent — une seconde tentative sur le même message ne réécrit rien', async () => {
    messageUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const first = await scheduleViewOnceBurn(prisma, { messageId: MESSAGE_ID, at: AT });
    const second = await scheduleViewOnceBurn(prisma, {
      messageId: MESSAGE_ID,
      at: new Date(AT.getTime() + 1000),
    });

    expect(first.scheduled).toBe(true);
    expect(second.scheduled).toBe(false);
  });

  it('remonte la panne d’écriture — un budget épuisé sans échéance est un contenu qui survit', async () => {
    messageUpdateMany.mockRejectedValue(new Error('mongo down'));

    await expect(scheduleViewOnceBurn(prisma, { messageId: MESSAGE_ID, at: AT })).rejects.toThrow(
      'mongo down',
    );
  });
});
