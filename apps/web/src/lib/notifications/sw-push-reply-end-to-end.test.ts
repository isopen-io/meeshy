import { describe, expect, test } from 'bun:test';

import { CODE, mount } from '@/test-support/sw-push-harness';

/**
 * #13171 — « RÉPONDRE » DEPUIS LA NOTIFICATION DU SERVICE WORKER N'ENVOIE RIEN
 * PAR LUI-MÊME : il ouvre le fil, où le verrou d'écriture et la garde unique
 * de l'envoi (`canSendPlaintext`) décident. Une réponse saisie dans la
 * bannière (`event.reply`, Chrome) ne part jamais du worker : dans une
 * conversation chiffrée de bout en bout, aucun clair ne quitte l'appareil.
 */
const click = (data: Record<string, unknown>, action: string, reply: string) => ({
  notification: { data, close: () => undefined },
  action,
  reply,
});

describe('« Répondre » sur une bannière de message (#13171)', () => {
  test('un texte saisi dans la bannière ne part pas du worker : seul le fil s’ouvre', async () => {
    const worker = mount();
    await worker.dispatch('notificationclick', click({ type: 'new_message', conversationId: 'conv-e2ee' }, 'reply', 'clair-saisi'));

    expect(worker.opened.length).toBe(1);
    expect(worker.opened[0]).toContain('/c/conv-e2ee');
    expect(JSON.stringify(worker.deliveries)).not.toContain('clair-saisi');
  });

  test('le worker n’écrit aucun message : aucune route d’envoi dans son code', () => {
    expect(CODE).not.toMatch(/\/messages['"]?\s*[,+)]/);
    expect(CODE).not.toContain('evenement.reply');
  });
});
