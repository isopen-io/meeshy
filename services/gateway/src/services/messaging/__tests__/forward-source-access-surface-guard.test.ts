/**
 * LA SURFACE du droit de lire la source d'un transfert (#9579).
 *
 * Les témoins de COMPORTEMENT sont ailleurs (`forwardSourceReadAccess.test.ts`,
 * `MessagingService.forwardSourceAccess.test.ts`) et ce sont eux qui prouvent
 * la règle. Ce balayage garde ce qu'aucun d'eux ne peut voir : qu'il n'existe
 * qu'UNE entrée vers l'écriture d'un message, donc qu'une seule admission à
 * franchir, et qu'aucun échappement de type ne revient sur ce chemin.
 *
 * Il ne remplace pas un témoin : une garde de source reste verte sur un
 * correctif annulé. Elle rougit, elle, le jour où un second appelant
 * contourne l'admission sans qu'aucun comportement existant ne change.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const GATEWAY_SRC = join(__dirname, '..', '..', '..');

const sourcesUnder = (root: string): string[] =>
  readdirSync(root).flatMap((name) => {
    if (name === 'node_modules' || name === 'dist' || name === '__tests__') return [];
    const path = join(root, name);
    if (statSync(path).isDirectory()) return sourcesUnder(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) && !/\.d\.ts$/.test(name) ? [path] : [];
  });

/** Le code sans ses commentaires : une règle CITÉE n'est pas une règle APPELÉE. */
const codeOf = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const filesCalling = (call: RegExp): string[] =>
  sourcesUnder(GATEWAY_SRC)
    .filter((path) => call.test(codeOf(path)))
    .map((path) => relative(GATEWAY_SRC, path))
    .sort();

const SERVICE = 'services/messaging/MessagingService.ts';
const PROCESSOR = 'services/messaging/MessageProcessor.ts';
const ADMISSION = 'services/messaging/forwardAdmission.ts';
const READ_LAW = 'services/messaging/messageReadAccess.ts';

describe('le droit de lire la source d’un transfert — une seule entrée, aucun échappement', () => {
  it('balaie bien la passerelle', () => {
    expect(sourcesUnder(GATEWAY_SRC).length).toBeGreaterThan(500);
  });

  it('`saveMessage` n’a qu’UN appelant : le service, qui passe par l’admission', () => {
    expect(filesCalling(/\.saveMessage\s*\(/)).toEqual([SERVICE]);
  });

  it('l’admission du transfert n’est consultée qu’au site où les transports convergent', () => {
    const definedAndCalled = [ADMISSION, SERVICE].sort();

    expect(filesCalling(/\badmitMessageForward\s*\(/)).toEqual(definedAndCalled);
    expect(filesCalling(/\bforwardedCopyRequest\s*\(/)).toEqual(definedAndCalled);
  });

  it('la copie des pièces d’une source ne s’appelle que depuis l’écriture du message', () => {
    expect(filesCalling(/\bcopyForwardedAttachments\s*\(/)).toEqual([PROCESSOR]);
  });

  it('l’admission remet l’EXPÉDITEUR au garde, et la conversation qu’il déclare', () => {
    const service = codeOf(join(GATEWAY_SRC, SERVICE));
    const call = service.slice(service.indexOf('admitMessageForward(this.prisma'));
    const args = call.slice(0, call.indexOf('});'));

    expect(args).toContain('senderParticipantId: participant.id');
    expect(args).toContain('forwardedFromConversationId: request.forwardedFromConversationId');
  });

  it.each([ADMISSION, READ_LAW])('aucun `any` dans %s', (file) => {
    const code = codeOf(join(GATEWAY_SRC, file));

    expect(code).not.toMatch(/\bas\s+any\b/);
    expect(code).not.toMatch(/:\s*any\b/);
    expect(code).not.toMatch(/<any>/);
  });
});
