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
 * **Éphémère → propager.** La copie hérite de la DURÉE de l'original — la
 * colonne `ephemeralDuration` depuis #7451, `expiresAt − createdAt` en repli
 * pour les lignes écrites avant qu'elle n'ait un écrivain. Le compte repart de
 * zéro parce que les nouveaux destinataires n'ont rien vu : leur servir les
 * 3 secondes résiduelles d'un minuteur de 24 h ne voudrait rien dire. La copie
 * meurt, la promesse tient, et elle tient TRANSITIVEMENT — un transfert de
 * transfert reste éphémère.
 *
 * **Et ce qui voyage est bien une DURÉE, jamais une échéance (#7451).** Le
 * serveur décide de l'échéance à la réception de CHAQUE destinataire ; rendre
 * ici un `expiresAt` le court-circuiterait. La bascule de ce module est ce qui
 * empêche un défaut silencieux : `Message.expiresAt` porte désormais l'heure de
 * DESTRUCTION, qui vaut le plafond de rétention (sept jours) tant que personne
 * n'a reçu — le repli legacy appliqué à une ligne NEUVE aurait donc fait d'un
 * éphémère de trente secondes une copie de sept jours.
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
  ephemeralDuration: null,
  expiresAt: null,
  createdAt: new Date('2026-08-12T11:00:00.000Z'),
  // Compté par la MÊME lecture que l'héritage éphémère : c'est ce qui dit si
  // la copie serveur des pièces jointes donnera un corps au transfert.
  _count: { attachments: 0 },
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

      // 30 s de durée d'origine. Une DURÉE, pas une échéance : le décompte de
      // la copie repartira de la réception de chaque nouveau destinataire.
      expect(admission).toEqual({ admitted: true, ephemeralDuration: 30 });
    });

    it('lit la COLONNE, jamais la distance à `expiresAt`, dès qu\'elle existe (#7451)', async () => {
      // Le défaut que ce témoin ferme : sur une ligne écrite APRÈS #7451,
      // `expiresAt` porte l'heure de DESTRUCTION — le plafond de rétention de
      // sept jours tant que personne n'a reçu. Le repli legacy y aurait lu
      // « sept jours » et transformé un éphémère de trente secondes en copie
      // d'une semaine, sans qu'aucun autre témoin ne tombe.
      messageFindUnique.mockResolvedValue(
        source({
          createdAt: AT,
          ephemeralDuration: 30,
          expiresAt: new Date(AT.getTime() + 7 * 24 * 60 * 60 * 1000),
        }),
      );

      const admission = await admitMessageForward(prisma, { forwardedFromId: SOURCE_ID, at: AT });

      expect(admission).toEqual({ admitted: true, ephemeralDuration: 30 });
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

      expect(admission).toEqual({ admitted: true, ephemeralDuration: 3600 });
    });

    it('ne propage AUCUNE durée quand la source legacy naît déjà expirée', async () => {
      // Décalage d'horloge ou client qui envoyait une échéance passée : la
      // distance est nulle, donc ce n'est pas une durée. La copie dégénère en
      // message ordinaire — le seul comportement qui ne la fait pas vivre PLUS
      // que l'original, là où une durée nulle l'aurait rendue immortelle.
      messageFindUnique.mockResolvedValue(
        source({
          createdAt: new Date('2026-08-12T11:00:00.000Z'),
          expiresAt: new Date('2026-08-12T10:59:00.000Z'),
        }),
      );

      const admission = await admitMessageForward(prisma, { forwardedFromId: SOURCE_ID, at: AT });

      expect(admission).toEqual({ admitted: true });
    });

    it('reste transitif — la copie éphémère est elle-même une source éphémère', async () => {
      // La copie du premier transfert porte sa propre `ephemeralDuration`.
      // La transférer à son tour doit rendre la même durée, sans érosion — et
      // sans que le module ait à remonter la chaîne.
      messageFindUnique.mockResolvedValue(
        source({ createdAt: AT, ephemeralDuration: 30, expiresAt: null }),
      );

      const secondForwardAt = new Date(AT.getTime() + 10_000);
      const admission = await admitMessageForward(prisma, {
        forwardedFromId: SOURCE_ID,
        at: secondForwardAt,
      });

      expect(admission).toEqual({ admitted: true, ephemeralDuration: 30 });
    });
  });

  describe('corps entièrement emprunté à la source — refuser plutôt que diffuser une bulle vide', () => {
    // Un transfert de MÉDIA n'envoie ni texte, ni `attachmentIds`, ni payload
    // chiffré : son corps n'existera que par la copie serveur des pièces
    // jointes de la source. Quand la source a disparu entre-temps (éphémère
    // balayé, rejeu hors-ligne tardif) ou ne porte aucune pièce jointe, la
    // copie ne rend RIEN — et une ligne `Message` sans contenu, sans pièce
    // jointe et sans chiffré était créée puis diffusée : une bulle vide,
    // irrécupérable, chez tous les destinataires.
    //
    // Le savoir est déjà payé : c'est la MÊME lecture que celle de l'héritage
    // éphémère, qui compte les pièces jointes de la source au passage.
    const BODY_ONLY_FROM_SOURCE = { forwardedFromId: SOURCE_ID, at: AT, bodyOnlyFromSource: true };

    it('refuse quand la source est introuvable', async () => {
      messageFindUnique.mockResolvedValue(null);

      const admission = await admitMessageForward(prisma, BODY_ONLY_FROM_SOURCE);

      expect(admission).toEqual({ admitted: false, reason: 'forward-source-unavailable' });
    });

    it('refuse quand la source existe mais ne porte aucune pièce jointe', async () => {
      messageFindUnique.mockResolvedValue(source({ _count: { attachments: 0 } }));

      const admission = await admitMessageForward(prisma, BODY_ONLY_FROM_SOURCE);

      expect(admission).toEqual({ admitted: false, reason: 'forward-source-unavailable' });
    });

    it('refuse quand la lecture de la source échoue — rien ne pourra remplir le corps', async () => {
      messageFindUnique.mockRejectedValue(new Error('mongo down'));

      const admission = await admitMessageForward(prisma, BODY_ONLY_FROM_SOURCE);

      expect(admission).toEqual({ admitted: false, reason: 'forward-source-unavailable' });
    });

    it('admet le cas NOMINAL — la source porte bien des pièces jointes à copier', async () => {
      messageFindUnique.mockResolvedValue(source({ _count: { attachments: 2 } }));

      const admission = await admitMessageForward(prisma, BODY_ONLY_FROM_SOURCE);

      expect(admission).toEqual({ admitted: true });
    });

    it('fait toujours hériter l’échéance éphémère d’une source qui porte un média', async () => {
      messageFindUnique.mockResolvedValue(
        source({
          _count: { attachments: 1 },
          createdAt: new Date('2026-08-12T11:00:00.000Z'),
          expiresAt: new Date('2026-08-12T11:00:30.000Z'),
        }),
      );

      const admission = await admitMessageForward(prisma, BODY_ONLY_FROM_SOURCE);

      expect(admission).toEqual({ admitted: true, ephemeralDuration: 30 });
    });

    it('dit d’abord la vue unique — le motif le plus informatif gagne', async () => {
      messageFindUnique.mockResolvedValue(source({ isViewOnce: true, _count: { attachments: 1 } }));

      const admission = await admitMessageForward(prisma, BODY_ONLY_FROM_SOURCE);

      expect(admission).toEqual({ admitted: false, reason: 'view-once-not-forwardable' });
    });

    it('ne refuse RIEN quand le message porte déjà son propre corps (défaut)', async () => {
      // Un transfert de texte envoie le texte ; une source sans pièce jointe
      // est alors parfaitement normale.
      messageFindUnique.mockResolvedValue(source({ _count: { attachments: 0 } }));

      const admission = await admitMessageForward(prisma, { forwardedFromId: SOURCE_ID, at: AT });

      expect(admission).toEqual({ admitted: true });
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
