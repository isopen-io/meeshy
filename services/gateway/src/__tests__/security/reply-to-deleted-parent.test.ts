/**
 * #7927 — un message SUPPRIMÉ ne se relit dans AUCUNE citation.
 *
 * La suppression pose `deletedAt` et vide les traductions, mais GARDE
 * `content` en base (`messages-writes.ts`, `messages-advanced-delete.ts`,
 * `MessageHandler`). Les quatre sites qui servent un `replyTo` répandaient la
 * ligne citée : répondre à un message puis le supprimer laissait son texte
 * entier lisible dans la bulle-citation de chaque réponse, pour tout lecteur
 * qui rechargeait le fil.
 *
 * La garde vit dans `servedQuotedMessage`, le site UNIQUE que les quatre
 * transports appellent (#4952) : elle y est fail-closed — texte vide, ni
 * traductions, ni pièces, ni métadonnées hissables (position, sticker), ni
 * ancre de pièce — et la citation DIT qu'elle est supprimée (`deletedAt`), pour
 * que le client rende « Message supprimé » plutôt qu'une citation vide.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import fastJson from 'fast-json-stringify';
import { messageSchema } from '@meeshy/shared/types/api-schemas';
import { servedQuotedMessage } from '../../services/messaging/servedQuotedMessage';
import { hoistLocationOnto } from '../../services/location/sharedPlace';

const GATEWAY_SRC = join(__dirname, '../..');

const citeSupprime = (overrides: Record<string, unknown> = {}) => ({
  id: '507f1f77bcf86cd799439014',
  content: 'le code du coffre est 4271',
  messageType: 'image',
  deletedAt: new Date('2026-09-25T10:00:00.000Z'),
  translations: { en: { text: 'the vault code is 4271', translationModel: 'basic' as const, createdAt: new Date() } },
  attachments: [{ id: 'a1', fileUrl: 'https://cdn/x.jpg', thumbnailUrl: 'https://cdn/x-thumb.jpg' }],
  metadata: { location: { latitude: 48.85, longitude: 2.35, name: 'Chez moi' } },
  validatedMentions: ['507f1f77bcf86cd799439099'],
  ...overrides,
});

const serialize = fastJson({
  type: 'object',
  properties: { data: messageSchema as Record<string, unknown> },
} as never);

describe('servedQuotedMessage — la citation d’un message supprimé ne transporte rien de lui', () => {
  const served = servedQuotedMessage(citeSupprime(), {
    includeTranslations: true,
    attachmentReplyTo: { attachmentId: 'a1', kind: 'image' },
  });

  it('vide le texte', () => {
    expect(served['content']).toBe('');
  });

  it('ne sert ni traductions ni pièces jointes', () => {
    expect(served['translations']).toBeUndefined();
    expect(served['attachments']).toEqual([]);
  });

  it('écrase les métadonnées et ce qui en est hissé (position, sticker)', () => {
    expect('metadata' in served && served['metadata'] === undefined).toBe(true);
    expect('location' in served && served['location'] === undefined).toBe(true);
    expect('sticker' in served && served['sticker'] === undefined).toBe(true);
    const citation = hoistLocationOnto({ ...citeSupprime(), ...served });
    expect(citation['location']).toBeUndefined();
  });

  it('ne sert ni mentions ni ancre de pièce', () => {
    expect(served['validatedMentions']).toEqual([]);
    expect(served['attachmentReplyTo']).toBeUndefined();
  });

  it('DIT qu’elle est supprimée', () => {
    expect(served['deletedAt']).toEqual(new Date('2026-09-25T10:00:00.000Z'));
  });

  it('une citation vivante n’est pas touchée', () => {
    const vivant = servedQuotedMessage(citeSupprime({ deletedAt: null, metadata: undefined }));
    expect(vivant['content']).toBeUndefined();
    expect(vivant['deletedAt']).toBeUndefined();
  });

  it('le schéma sert `replyTo.deletedAt` (sinon fast-json-stringify le retire en silence)', () => {
    const out = JSON.parse(
      serialize({
        data: {
          id: '507f1f77bcf86cd799439011',
          content: 'ma réponse',
          replyTo: { ...citeSupprime(), ...served },
        },
      } as never),
    ).data.replyTo;
    expect(out.deletedAt).toBe('2026-09-25T10:00:00.000Z');
    expect(out.content).toBe('');
    expect(JSON.stringify(out)).not.toContain('4271');
  });
});

/**
 * Les deux sites à `select` NOMMÉ doivent DEMANDER `deletedAt` au message cité :
 * sans lui, la garde ci-dessus lit `undefined` et sert le texte en croyant
 * appliquer la règle. Les deux autres (`include`) reçoivent la ligne entière.
 */
describe('les select nommés du message cité demandent deletedAt', () => {
  const blocApres = (source: string, ancre: string): string => {
    const debut = source.indexOf(ancre);
    if (debut === -1) throw new Error(`ancre introuvable : ${ancre}`);
    let profondeur = 0;
    for (let i = source.indexOf('{', debut); i < source.length; i += 1) {
      if (source[i] === '{') profondeur += 1;
      if (source[i] === '}') {
        profondeur -= 1;
        if (profondeur === 0) return source.slice(debut, i + 1);
      }
    }
    throw new Error('bloc non refermé');
  };

  it('liste REST — messages-list-query.ts', () => {
    const source = readFileSync(join(GATEWAY_SRC, 'routes/conversations/messages-list-query.ts'), 'utf-8');
    expect(blocApres(source, 'messageSelect.replyTo = {')).toContain('deletedAt: true');
  });

  it('fil de réponses — threads.ts', () => {
    const source = readFileSync(join(GATEWAY_SRC, 'routes/conversations/threads.ts'), 'utf-8');
    expect(blocApres(source, '  replyTo: {')).toContain('deletedAt: true');
  });

  it('lien de partage — le formateur sert deletedAt', () => {
    const source = readFileSync(join(GATEWAY_SRC, 'routes/links/utils/message-formatters.ts'), 'utf-8');
    expect(blocApres(source, 'function formatReplyToMessage')).toMatch(/deletedAt/);
  });
});
