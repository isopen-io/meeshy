import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LE FIL DIT AUX DEUX HOOKS DE TRADUCTION CE QUE LE SERVEUR LIT (#9899) — la
 * traduction de l'appareil et la lecture des traductions partagées jugent
 * chacune ce que le serveur lit du message (`offeredMessagesOf`), et ce verdict
 * dépend du mode de chiffrement de la CONVERSATION autant que de celui du
 * message : un clair d'une conversation chiffrée de bout en bout se traduit sur
 * l'appareil, mais ne se partage ni ne se demande. Un hook qui n'en reçoit pas le
 * mode juge à moitié, sans qu'aucun type ne le dise quand l'hôte l'omet.
 *
 * Un témoin de SOURCE, comme `thread-hooks-order.test.ts` : aucun écran de ce
 * dépôt n'a de témoin de rendu intégral, et ce défaut est un défaut de CÂBLAGE,
 * pas de valeur rendue. Le mode absent se lit `null` (la conversation ne le dit
 * pas : le message tranche seul), jamais un mode inventé.
 */

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'thread.tsx'), 'utf8');

const code = source.replace(/\/\*[\s\S]*?\*\//g, (match) => ' '.repeat(match.length)).replace(/\/\/[^\n]*/g, (match) => ' '.repeat(match.length));

const callOf = (hook: string): string => code.match(new RegExp(`${hook}\\(\\{[^}]*\\}\\)`))?.[0] ?? '';

describe('ThreadScreen — le mode de chiffrement de la conversation atteint la traduction de l’appareil (#9899)', () => {
  test('il se lit sur la conversation chargée, et son absence vaut null', () => {
    expect(code).toMatch(/const conversationEncryptionMode\s*=\s*conversation\?\.encryptionMode\s*\?\?\s*null;/);
  });

  test('la traduction de l’appareil le reçoit', () => {
    expect(callOf('useDeviceTranslation')).toMatch(/\bconversationEncryptionMode\b/);
  });

  test('la lecture des traductions partagées le reçoit', () => {
    expect(callOf('useSharedTranslations')).toMatch(/\bconversationEncryptionMode\b/);
  });
});
