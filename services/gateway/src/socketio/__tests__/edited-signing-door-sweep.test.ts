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

  /**
   * **Les deux formes que l'audit adversarial de #19977 a fait passer**, et qui
   * sont les plus chères parce que le cliquet restait VERT dessus :
   *
   * 1. une SIGNATURE MULTI-LIGNES — l'idiome dominant du dépôt — faisait rendre
   *    le FICHIER entier à `enclosingUnit`, donc la mesure de popularité que ce
   *    module affirme avoir éliminée ;
   * 2. une CHARGE COMPOSÉE AILLEURS ne nomme `attachments` dans aucune unité
   *    émettrice, donc le site sortait de la portée sans un mot — et c'est
   *    exactement la forme que ce lot vient de créer en sortant
   *    `callSummaryEditedPayload` de son émetteur.
   */
  it('rougit sur un producteur dont la SIGNATURE est multi-lignes', () => {
    const root = mkdtempSync(join(tmpdir(), 'edited-sweep-multiline-'));
    try {
      mkdirSync(join(root, 'socketio'), { recursive: true });
      writeFileSync(
        join(root, 'socketio', 'multiline.ts'),
        [
          'export class Fake {',
          '  async broadcastEdited(params: {',
          '    readonly message: Message;',
          '    readonly conversationId: string;',
          '  }): Promise<void> {',
          '    const payload = { id: params.message.id, attachments: serialize(params.message.attachments) };',
          '    this.io.to(ROOMS.conversation(params.conversationId)).emit(SERVER_EVENTS.MESSAGE_EDITED, payload);',
          "    await this.enqueue({ eventType: 'edited', payload });",
          '  }',
          '}',
        ].join('\n'),
        'utf8',
      );
      const { inScope, offenders } = sweepEditedSigningDoors(root);
      expect(inScope).toEqual([join('socketio', 'multiline.ts')]);
      expect(offenders.map((o) => o.missing)).toEqual(['both', 'both']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rougit quand la charge est COMPOSÉE AILLEURS — l'unité émettrice ne nomme aucune pièce", () => {
    const root = mkdtempSync(join(tmpdir(), 'edited-sweep-composed-'));
    try {
      mkdirSync(join(root, 'socketio'), { recursive: true });
      writeFileSync(
        join(root, 'socketio', 'composed.ts'),
        [
          'export function buildPayload(message: Message) {',
          '  return { id: message.id, attachments: serialize(message.attachments) };',
          '}',
          '',
          'export async function deliver(io: Io, conversationId: string, message: Message) {',
          '  const payload = buildPayload(message);',
          '  io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.MESSAGE_EDITED, payload);',
          "  await enqueueOfflineMessageMutation({ conversationId, eventType: 'edited', payload });",
          '}',
        ].join('\n'),
        'utf8',
      );
      const { inScope, offenders } = sweepEditedSigningDoors(root);
      expect(inScope).toEqual([join('socketio', 'composed.ts')]);
      expect(offenders.map((o) => o.missing)).toEqual(['both', 'both']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /**
   * Un fichier qui ne parle JAMAIS de pièces jointes sort par CONSTRUCTION, et
   * non par une ligne d'inventaire qui le ferait passer pour une dette —
   * `emitArrivalsLineUpdate` en est le cas réel.
   */
  it("laisse dehors un producteur dont le FICHIER ne nomme aucune pièce jointe", () => {
    const root = mkdtempSync(join(tmpdir(), 'edited-sweep-nomedia-'));
    try {
      mkdirSync(join(root, 'services'), { recursive: true });
      writeFileSync(
        join(root, 'services', 'arrivals.ts'),
        [
          'export function emitArrivalsLineUpdate(io: Io, message: Message, conversationId: string) {',
          '  io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.MESSAGE_EDITED, {',
          '    ...buildMessageEditedCore(message, { conversationId }),',
          "    messageSource: 'system',",
          '  });',
          '}',
        ].join('\n'),
        'utf8',
      );
      expect(sweepEditedSigningDoors(root)).toEqual({ inScope: [], offenders: [] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /**
   * **Une chaîne qui contient `/*` n'ouvre pas un commentaire.** La première
   * rédaction effaçait 612 lignes de code réel de `services/gateway/src/` sur
   * cet idiome (`'/api/attachments/file/*'`), et l'erreur DISPENSAIT.
   */
  it("ne se laisse pas aveugler par un `/*` à l'intérieur d'une chaîne", () => {
    const root = mkdtempSync(join(tmpdir(), 'edited-sweep-string-'));
    try {
      mkdirSync(join(root, 'routes'), { recursive: true });
      writeFileSync(
        join(root, 'routes', 'strings.ts'),
        [
          "const ROUTE = '/api/attachments/file/*';",
          'export async function leak(io: Io, conversationId: string, message: Message) {',
          '  const payload = { id: message.id, attachments: message.attachments };',
          '  io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.MESSAGE_EDITED, payload);',
          '}',
          "const TAIL = 'x */';",
        ].join('\n'),
        'utf8',
      );
      const { inScope, offenders } = sweepEditedSigningDoors(root);
      expect(inScope).toEqual([join('routes', 'strings.ts')]);
      expect(offenders).toEqual([{ file: join('routes', 'strings.ts'), missing: 'both' }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
