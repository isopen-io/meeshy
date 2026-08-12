/**
 * Le transfert était la DERNIÈRE sortie ouverte de l'éphémère et de la vue
 * unique — et, depuis les cycles 92 et 93, la seule.
 *
 * Transférer un message crée une ligne `Message` INDÉPENDANTE :
 * `forwardedFromId` ne pointe que vers l'origine, il ne transporte rien. La
 * copie ne porte donc ni `expiresAt`, ni `isViewOnce`, ni le bit `EPHEMERAL` —
 * elle naît en clair, sans échéance et sans budget. Le balayage du cycle 92
 * détruit consciencieusement l'original à l'heure dite pendant que la copie,
 * faite deux secondes après réception, reste lisible pour toujours dans une
 * autre conversation.
 *
 * Aucun garde ne s'y opposait, à AUCUN des trois transports d'envoi (REST,
 * socket texte, socket pièces jointes) : `forwardedFromId` traverse
 * `MessagingService.handleMessage` sans qu'une seule ligne de code serveur ne
 * lise l'état de la source. Côté clients, `MessageActionResolver` propose
 * `.forward` INCONDITIONNELLEMENT — la promesse n'était donc pas même respectée
 * par convention.
 *
 * C'est exactement la question de la veine ouverte au cycle 92 : *qui, côté
 * serveur, fait respecter cette promesse ?* Ici, personne — et cette fois le
 * trou ne demandait même pas un client modifié, juste un appui long.
 *
 * ─── POURQUOI LES DEUX PROMESSES N'ONT PAS LA MÊME RÉPONSE ──────────────────
 *
 * La tête du cycle 93 laissait le choix ouvert entre « propager » et
 * « refuser ». Ce n'est pas une préférence produit : chaque promesse force sa
 * réponse, et elles diffèrent.
 *
 * **Éphémère → propager.** La copie hérite de la DURÉE de l'original
 * (`expiresAt − createdAt`), recomptée depuis l'envoi du transfert. Le compte à
 * zéro repart parce que les nouveaux destinataires n'ont rien vu : leur servir
 * les 3 secondes résiduelles d'un minuteur de 24 h ne voudrait rien dire. La
 * copie meurt, la promesse tient, et elle tient TRANSITIVEMENT — un transfert
 * de transfert reste éphémère.
 *
 * **Vue unique → refuser.** Propager ne fermerait RIEN ici : `viewOnceCount`
 * repart à zéro sur la nouvelle ligne. Se transférer à soi-même une photo à vue
 * unique rendrait un budget de vues neuf, autant de fois que voulu — la
 * propagation reconduit la promesse en la vidant de son sens. Seul le refus la
 * tient, et c'est aussi ce que font WhatsApp et Signal, qui interdisent tous
 * deux le transfert d'un contenu à vue unique.
 *
 * ─── CE QUI NE DOIT PAS CASSER ──────────────────────────────────────────────
 *
 * Un `forwardedFromId` qui ne désigne rien (source purgée, id fabriqué) ne doit
 * pas faire échouer l'envoi : le transfert d'un message déjà détruit dégénère
 * en message ordinaire, ce qui est le comportement d'avant et ne fuit rien.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { admitMessageForward, isForwardRefused } from '../forwardAdmission';

const SOURCE_ID = '507f1f77bcf86cd799439011';
const AT = new Date('2026-08-12T12:00:00.000Z');

const VIEW_ONCE_BIT = 1 << 2;
const EPHEMERAL_BIT = 1 << 0;

const messageFindUnique = jest.fn<any>();

const prisma = { message: { findUnique: messageFindUnique } } as any;

const source = (over: Record<string, unknown> = {}) => ({
  isViewOnce: false,
  effectFlags: 0,
  expiresAt: null,
  createdAt: new Date('2026-08-12T11:00:00.000Z'),
  ...over,
});

beforeEach(() => {
  messageFindUnique.mockReset();
  messageFindUnique.mockResolvedValue(source());
});

describe('admitMessageForward', () => {
  it("n'interroge la base que lorsqu'il y a une source à transférer", async () => {
    const admission = await admitMessageForward(prisma, { forwardedFromId: undefined, at: AT });

    expect(admission).toEqual({ admitted: true });
    expect(messageFindUnique).not.toHaveBeenCalled();
  });

  it('laisse passer un message ordinaire sans rien lui faire hériter', async () => {
    const admission = await admitMessageForward(prisma, { forwardedFromId: SOURCE_ID, at: AT });

    expect(admission).toEqual({ admitted: true });
  });

  describe('vue unique — refusée, parce que propager rendrait un budget neuf', () => {
    it('refuse quand la source porte `isViewOnce`', async () => {
      messageFindUnique.mockResolvedValue(source({ isViewOnce: true }));

      const admission = await admitMessageForward(prisma, { forwardedFromId: SOURCE_ID, at: AT });

      expect(admission).toEqual({ admitted: false, reason: 'view-once-not-forwardable' });
    });

    it('refuse quand seul le bit VIEW_ONCE du bitfield le dit', async () => {
      // Les deux écritures coexistent : `saveMessage` renseigne la colonne ET
      // le bit. Un client qui n'aurait envoyé que `effectFlags` doit être tenu
      // par la même règle — sinon le contournement est d'un champ.
      messageFindUnique.mockResolvedValue(source({ isViewOnce: false, effectFlags: VIEW_ONCE_BIT }));

      const admission = await admitMessageForward(prisma, { forwardedFromId: SOURCE_ID, at: AT });

      expect(isForwardRefused(admission)).toBe(true);
    });

    it('refuse un contenu à la fois éphémère et à vue unique — la promesse la plus forte gagne', async () => {
      messageFindUnique.mockResolvedValue(
        source({
          isViewOnce: true,
          expiresAt: new Date('2026-08-12T11:00:30.000Z'),
        }),
      );

      const admission = await admitMessageForward(prisma, { forwardedFromId: SOURCE_ID, at: AT });

      expect(admission).toEqual({ admitted: false, reason: 'view-once-not-forwardable' });
    });
  });

  describe('éphémère — propagé, en repartant du transfert', () => {
    it('fait hériter la DURÉE de la source, recomptée depuis le transfert', async () => {
      messageFindUnique.mockResolvedValue(
        source({
          createdAt: new Date('2026-08-12T11:00:00.000Z'),
          expiresAt: new Date('2026-08-12T11:00:30.000Z'),
        }),
      );

      const admission = await admitMessageForward(prisma, { forwardedFromId: SOURCE_ID, at: AT });

      // 30 s de durée d'origine, recomptées depuis AT — et non les 30 s
      // résiduelles d'un minuteur déjà largement écoulé.
      expect(admission).toEqual({ admitted: true, expiresAt: new Date(AT.getTime() + 30_000) });
    });

    it('propage aussi quand seul le bit EPHEMERAL est posé mais que l’échéance existe', async () => {
      messageFindUnique.mockResolvedValue(
        source({
          effectFlags: EPHEMERAL_BIT,
          createdAt: new Date('2026-08-12T11:00:00.000Z'),
          expiresAt: new Date('2026-08-12T12:00:00.000Z'),
        }),
      );

      const admission = await admitMessageForward(prisma, { forwardedFromId: SOURCE_ID, at: AT });

      expect(admission).toEqual({
        admitted: true,
        expiresAt: new Date(AT.getTime() + 60 * 60 * 1000),
      });
    });

    it('rend la copie immédiatement échue quand la source naît déjà expirée', async () => {
      // Décalage d'horloge ou client qui envoie une échéance passée : la copie
      // ne doit en aucun cas vivre PLUS que l'original. Échue à l'instant du
      // transfert, le balayage la prend à sa passe suivante.
      messageFindUnique.mockResolvedValue(
        source({
          createdAt: new Date('2026-08-12T11:00:00.000Z'),
          expiresAt: new Date('2026-08-12T10:59:00.000Z'),
        }),
      );

      const admission = await admitMessageForward(prisma, { forwardedFromId: SOURCE_ID, at: AT });

      expect(admission).toEqual({ admitted: true, expiresAt: AT });
    });

    it('reste transitif — la copie éphémère est elle-même une source éphémère', async () => {
      // La copie du premier transfert porte `createdAt = AT` et
      // `expiresAt = AT + 30 s`. La transférer à son tour doit rendre la même
      // durée, sans érosion.
      const firstHop = new Date(AT.getTime() + 30_000);
      messageFindUnique.mockResolvedValue(source({ createdAt: AT, expiresAt: firstHop }));

      const secondForwardAt = new Date(AT.getTime() + 10_000);
      const admission = await admitMessageForward(prisma, {
        forwardedFromId: SOURCE_ID,
        at: secondForwardAt,
      });

      expect(admission).toEqual({
        admitted: true,
        expiresAt: new Date(secondForwardAt.getTime() + 30_000),
      });
    });
  });

  describe('robustesse — un transfert ne doit pas casser sur une source absente', () => {
    it('laisse passer sans héritage quand la source est introuvable', async () => {
      messageFindUnique.mockResolvedValue(null);

      const admission = await admitMessageForward(prisma, { forwardedFromId: SOURCE_ID, at: AT });

      expect(admission).toEqual({ admitted: true });
    });

    it('laisse passer sans héritage quand la lecture de la source échoue', async () => {
      // Best-effort : une base indisponible ne doit pas transformer un envoi en
      // erreur. Le pire cas dégrade vers le comportement d'avant ce module.
      messageFindUnique.mockRejectedValue(new Error('mongo down'));

      const admission = await admitMessageForward(prisma, { forwardedFromId: SOURCE_ID, at: AT });

      expect(admission).toEqual({ admitted: true });
    });
  });
});
