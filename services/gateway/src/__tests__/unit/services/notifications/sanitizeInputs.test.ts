/**
 * Défense en profondeur des entrées d'une notification — les règles PURES.
 *
 * Les témoins de bout en bout vivent dans `notifications-security.test.ts` (ils
 * passent par `createNotification`). Ceux-ci tiennent ce que le doc-comment
 * AFFIRME et que rien ne vérifiait : l'ORDRE sanitisation → troncature, et la
 * table du chemin relatif.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  sanitizeNotificationInputs,
  persistedNotificationTitle,
} from '../../../../services/notifications/sanitizeInputs';

describe('persistedNotificationTitle', () => {
  it('préfère le libellé localisé au titre de l appelant', () => {
    expect(persistedNotificationTitle('Localisé', 'Appelant')).toBe('Localisé');
  });

  it('retombe sur le titre de l appelant quand le libellé manque', () => {
    expect(persistedNotificationTitle(null, 'Appelant')).toBe('Appelant');
  });

  it('rend null quand les deux manquent, et quand il ne reste rien', () => {
    expect(persistedNotificationTitle(null, null)).toBeNull();
    expect(persistedNotificationTitle(null, '   ')).toBeNull();
  });

  it('sanitise le titre — #7159', () => {
    const titre = persistedNotificationTitle(null, '<script>alert(1)</script>Sujet');
    expect(titre).not.toContain('<script>');
    expect(titre).toContain('Sujet');
  });

  it('sanitise AVANT de tronquer, jamais l inverse', () => {
    // 200 caractères de balises suivis du texte utile. Tronquer d'abord ne
    // laisserait QUE des balises, et la sanitisation rendrait une chaîne vide —
    // donc un titre absent là où il y en a un.
    const bruit = '<b></b>'.repeat(30); // 210 caractères, zéro texte
    const titre = persistedNotificationTitle(null, `${bruit}Sujet lisible`);

    expect(titre).toBe('Sujet lisible');
  });

  it('borne le titre à 160 caractères une fois sain', () => {
    const titre = persistedNotificationTitle(null, 'a'.repeat(500));
    expect(titre).toHaveLength(160);
  });
});

describe('sanitizeNotificationInputs', () => {
  const base = { content: 'Contenu', metadata: {} as never, context: {} };

  it('laisse passer un avatar servi en chemin relatif — #7157', () => {
    const { actor } = sanitizeNotificationInputs({
      ...base,
      actor: { id: 'u1', username: 'u', avatar: '/uploads/a.png' },
    });
    expect(actor?.avatar).toBe('/uploads/a.png');
  });

  it.each([
    ['protocole refusé', 'javascript:alert(1)'],
    ['data URL', 'data:text/html,<script>alert(1)</script>'],
    ['protocol-relative', '//evil.example/x.png'],
    ['antislash normalisé en barre', '/\\evil.example/x.png'],
    ['blanc supprimé par l analyseur', '/\t/evil.example/x.png'],
  ])('abandonne un avatar qui s échappe de son origine (%s)', (_cas, avatar) => {
    const { actor } = sanitizeNotificationInputs({
      ...base,
      actor: { id: 'u1', username: 'u', avatar },
    });
    expect(actor?.avatar ?? null).toBeNull();
  });

  it('garde une URL absolue sûre', () => {
    const { actor } = sanitizeNotificationInputs({
      ...base,
      actor: { id: 'u1', username: 'u', avatar: 'https://cdn.example/a.png' },
    });
    expect(actor?.avatar).toBe('https://cdn.example/a.png');
  });

  it('sanitise le nom affiché de l acteur, et laisse l acteur absent absent', () => {
    const { actor } = sanitizeNotificationInputs({
      ...base,
      actor: { id: 'u1', username: 'u', displayName: '<b>Bold</b>Nom' },
    });
    expect(actor?.displayName).not.toContain('<b>');

    expect(sanitizeNotificationInputs(base).actor).toBeUndefined();
  });
});

/**
 * #17177 — le SECOND VERROU de l'enveloppe chiffrée, en règle PURE.
 *
 * Les témoins de bout en bout (ce qui part réellement vers APNs, sur les trois
 * éventails) vivent dans `deviceEnvelopeThreeFanOuts.test.ts`. Ceux-ci tiennent
 * la table : quelle clé de protection laisse passer un chiffré, et laquelle le
 * retient. `protectedPreview` est l'unique producteur de cette clé dans tout le
 * dépôt, donc les quatre valeurs ci-dessous sont exhaustives.
 */
describe('sanitizeNotificationInputs — le verrou de l enveloppe chiffrée', () => {
  const base = { content: 'Contenu', metadata: {} as never };
  const ENVELOPE = 'YmFzZTY0';

  it.each([
    ['notification.view_once_message'],
    ['notification.hidden_message'],
    ['notification.ephemeral_message'],
  ])('retient le chiffré sous la clé %s', (notificationLocKey) => {
    const { context } = sanitizeNotificationInputs({
      ...base,
      context: { encryptedContent: ENVELOPE, notificationLocKey },
    });

    expect(context).not.toHaveProperty('encryptedContent');
  });

  it('laisse passer sous la clé du CHIFFREMENT — c est elle que la NSE remplace', () => {
    const { context } = sanitizeNotificationInputs({
      ...base,
      context: { encryptedContent: ENVELOPE, notificationLocKey: 'notification.encrypted_message' },
    });

    expect(context.encryptedContent).toBe(ENVELOPE);
  });

  it('laisse passer quand AUCUNE protection n est déclarée', () => {
    // Mode d'échec du correctif : un verrou qui mord sans déclaration
    // retirerait le déchiffrement local à toute conversation chiffrée.
    const { context } = sanitizeNotificationInputs({
      ...base,
      context: { encryptedContent: ENVELOPE },
    });

    expect(context.encryptedContent).toBe(ENVELOPE);
  });

  it('retient sous une clé INCONNUE — une porte échoue en montrant moins', () => {
    const { context } = sanitizeNotificationInputs({
      ...base,
      context: { encryptedContent: ENVELOPE, notificationLocKey: 'notification.quelque_chose_de_neuf' },
    });

    expect(context).not.toHaveProperty('encryptedContent');
  });

  it('rend le contexte INCHANGÉ quand il ne porte aucune enveloppe', () => {
    const context = { conversationId: 'c1', notificationLocKey: 'notification.view_once_message' };

    expect(sanitizeNotificationInputs({ ...base, context }).context).toBe(context);
  });
});
