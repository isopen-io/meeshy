import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { SERVER_FORWARD_REFUSALS, sendRefusalOf } from './forward-refusal';

/**
 * LE REFUS DU SERVEUR, RECONNU (#9573) — la passerelle rend un 400 dont
 * `error` est la phrase de `describeForwardRefusal`, sans `code`. Le client la
 * reconnaît pour DIRE pourquoi, dans la langue du lecteur.
 */
describe('sendRefusalOf', () => {
  test('les trois motifs du transfert sont reconnus à leur phrase', () => {
    expect(sendRefusalOf({ message: 'Un message à vue unique ne peut pas être transféré' })).toBe('view-once');
    expect(sendRefusalOf({ message: 'Un message qui disparaît après lecture ne peut pas être transféré' })).toBe('after-read');
    expect(sendRefusalOf({ message: 'Le message d’origine n’est plus disponible : rien à transférer' })).toBe('unavailable');
  });

  test('le motif est reconnu aussi s’il arrive un jour comme `code`', () => {
    expect(sendRefusalOf({ message: 'x', code: 'ephemeral-not-forwardable' })).toBe('after-read');
    expect(sendRefusalOf({ message: 'x', code: 'view-once-not-forwardable' })).toBe('view-once');
    expect(sendRefusalOf({ message: 'x', code: 'forward-source-unavailable' })).toBe('unavailable');
  });

  test('un média protégé refusé à la publication', () => {
    expect(sendRefusalOf({ message: 'This media is protected and cannot be published', code: 'PROTECTED_MEDIA' })).toBe('protected-media');
  });

  test('tout autre refus reste un refus sans motif connu', () => {
    expect(sendRefusalOf({ message: 'You are not a participant of this conversation' })).toBeNull();
  });

  test('les phrases reconnues sont CELLES que la passerelle écrit', () => {
    const gateway = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../../../services/gateway/src/services/messaging/forwardAdmission.ts'), 'utf8');
    SERVER_FORWARD_REFUSALS.forEach(({ sentence, reason }) => {
      expect(gateway).toContain(`'${sentence}'`);
      expect(gateway).toContain(`'${reason}'`);
    });
  });
});
