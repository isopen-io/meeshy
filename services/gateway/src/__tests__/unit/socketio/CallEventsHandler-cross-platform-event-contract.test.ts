/**
 * Cross-platform `call:*` event literal contract (iOS/Android) — audit
 * calls-fonctionnel Vague 50 "reste ouvert" item.
 *
 * `CallEventsHandler-event-contract.test.ts` only scans the gateway's own
 * `socket.on(...)` registrations against the shared contract
 * (`CALL_EVENTS`/`CLIENT_EVENTS`/`SERVER_EVENTS` in `@meeshy/shared`). It
 * says nothing about the iOS (Swift) and Android (Kotlin) clients, which
 * each hardcode their own `"call:..."` string literals for `emit`/`on`
 * rather than importing the TypeScript contract — a client can drift
 * (typo a literal, or invent an event nobody on the other side listens
 * for/emits) without any compiler on either side ever catching it.
 *
 * Source-scan guard, same technique as the gateway contract test: read the
 * known call-signaling source files as raw text and assert every
 * `call:`-prefixed string literal they contain exists in the shared
 * contract. No Swift/Kotlin toolchain required.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const REPO_ROOT = join(__dirname, '../../../../../..');

const CALL_SIGNALING_SOURCE_FILES = [
  'apps/ios/Meeshy/Features/Main/Services/CallManager.swift',
  'packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift',
  'apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/CallSignalManager.kt',
];

const sharedContract = new Set<string>([
  ...Object.values(CALL_EVENTS),
  ...Object.values(CLIENT_EVENTS),
  ...Object.values(SERVER_EVENTS),
]);

function extractCallEventLiterals(source: string): string[] {
  return [...source.matchAll(/"(call:[a-z0-9-]+)"/g)].map((m) => m[1]);
}

describe('cross-platform call:* event literal contract (iOS/Android)', () => {
  it('extraction catches a literal that is off the shared contract (detector sanity check)', () => {
    const fixture = 'socket.emit("call:definitely-not-a-real-event")';

    const literals = extractCallEventLiterals(fixture);

    expect(literals).toEqual(['call:definitely-not-a-real-event']);
    expect(sharedContract.has('call:definitely-not-a-real-event')).toBe(false);
  });

  it.each(CALL_SIGNALING_SOURCE_FILES)(
    'every call:* literal in %s exists in the shared contract',
    (relativePath) => {
      const source = readFileSync(join(REPO_ROOT, relativePath), 'utf-8');
      const literals = extractCallEventLiterals(source);

      expect(literals.length).toBeGreaterThan(0);

      const offContract = [...new Set(literals)].filter((name) => !sharedContract.has(name));
      expect(offContract).toEqual([]);
    }
  );
});
