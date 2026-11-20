/**
 * Cliquet du balayage : inventaire **VIDE** (#19977).
 *
 * Quand il tombe, la réparation est de passer par une porte partagée — ou
 * d'interroger `readerSignedPlan…` et `offlineSigned…` au site —, **jamais**
 * d'ajouter une ligne d'inventaire : il n'y a pas d'adresse nue de pièce
 * protégée qu'un producteur d'édition aurait le droit de servir.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { sweepEditedSigningDoors } from './edited-signing-door-sweep';

const SRC = join(__dirname, '..', '..');

describe('message:edited — tout producteur qui porte des pièces interroge un plan signé', () => {
  it('balaye bien quelque chose — une garde négative dont la portée est vide reste verte', () => {
    const { inScope } = sweepEditedSigningDoors(SRC);
    // Les transports connus au 2026-11-20 : socket, REST (deux fichiers de
    // routes), et la bulle d'appel. Le seuil est un PLANCHER, pas une égalité :
    // un transport de plus doit entrer dans la portée, jamais la faire rougir.
    expect(inScope.length).toBeGreaterThanOrEqual(4);
    expect(inScope).toContain(join('socketio', 'callSummaryEditedDelivery.ts'));
    expect(inScope).toContain(join('socketio', 'handlers', 'MessageHandler.ts'));
  });

  it('aucun producteur ne sert ni n’enfile une pièce sans avoir interrogé le plan', () => {
    expect(sweepEditedSigningDoors(SRC).offenders).toEqual([]);
  });

  /**
   * **La fixture NÉGATIVE — ce qui distingue ce balayage d'une décoration.**
   *
   * Elle reproduit la forme EXACTE du défaut de #19977 dans un fichier qui,
   * ailleurs, interroge un plan pour un AUTRE événement : c'est ce voisinage
   * qui rendait un balayage à l'échelle du fichier vert sur la vraie
   * passerelle. Le verdict attendu est `both` — ni le canal vivant ni le canal
   * durable n'ont consulté quoi que ce soit DANS l'unité qui sert.
   */
  it('rougit sur un producteur qui sert des pièces sans plan, même si son FICHIER en consulte un ailleurs', () => {
    const root = mkdtempSync(join(tmpdir(), 'edited-sweep-'));
    try {
      mkdirSync(join(root, 'socketio'), { recursive: true });
      writeFileSync(
        join(root, 'socketio', 'fakeProducer.ts'),
        [
          'export class Fake {',
          '  async broadcastNew(message: Message, conversationId: string) {',
          '    const plan = await readerSignedPlanBestEffort(this.prisma, { conversationId, message, attachments: message.attachments }, noop);',
          '    const signed = offlineSignedPayload({ plan, base: () => payload });',
          '    return signed;',
          '  }',
          '',
          '  async broadcastEdited(message: Message, conversationId: string) {',
          '    const payload = { id: message.id, attachments: serialize(message.attachments) };',
          '    this.io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.MESSAGE_EDITED, payload);',
          "    await this.enqueue({ conversationId, eventType: 'edited', payload });",
          '  }',
          '}',
        ].join('\n'),
        'utf8',
      );
      const { inScope, offenders } = sweepEditedSigningDoors(root);
      expect(inScope).toEqual([join('socketio', 'fakeProducer.ts')]);
      expect(offenders).toEqual([
        { file: join('socketio', 'fakeProducer.ts'), missing: 'both' },
        { file: join('socketio', 'fakeProducer.ts'), missing: 'both' },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
