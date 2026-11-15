import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extname, join } from 'node:path';

import { CLIENT_EVENTS, SERVER_EVENTS } from '../../types/socketio-events';
import { CALL_EVENTS } from '../../types/video-call';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const ENUM_PATH = 'packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocketEvent.swift';
const ACK_EMITTER_PATH = 'packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocketAckEmitting.swift';

const DECLARED: ReadonlySet<string> = new Set<string>([
  ...Object.values(SERVER_EVENTS),
  ...Object.values(CLIENT_EVENTS),
  ...Object.values(CALL_EVENTS),
]);

const SPELLED_OUT: ReadonlyArray<RegExp> = [
  /\bsocket\??\.on\(\s*"([^"]+)"/g,
  /\bsocket\??\.emit\(\s*"([^"]+)"/g,
  /\bemitWithAck\(\s*"([^"]+)"/g,
  /(?<![.\w])emit\(\s*"([^"]+)"/g,
  /\bemitCallControl\(\s*"([^"]+)"/g,
  /\bemitCallRecording\(\s*"([^"]+)"/g,
  /\bsafeEmit\(\s*"([^"]+)"/g,
  /\bemitActivitySignal\(\s*"([^"]+)"/g,
  /\bemitEncodable\([^)]*event:\s*"([^"]+)"/g,
];

const SCANNED_ROOTS: ReadonlyArray<string> = ['packages/MeeshySDK/Sources', 'apps/ios/Meeshy'];
const TEST_PATH_MARKERS: ReadonlyArray<string> = ['/Tests/', 'Tests.swift', 'Test.swift'];

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const camelCase = (rawValue: string): string =>
  rawValue
    .split(/[:-]/)
    .map((segment, index) => (index === 0 ? segment : segment.charAt(0).toUpperCase() + segment.slice(1)))
    .join('');

const swiftFiles = (absoluteRoot: string): ReadonlyArray<string> =>
  readdirSync(absoluteRoot).flatMap((entry) => {
    const absolute = join(absoluteRoot, entry);
    if (statSync(absolute).isDirectory()) return swiftFiles(absolute);
    if (extname(absolute) !== '.swift') return [];
    return TEST_PATH_MARKERS.some((marker) => absolute.includes(marker)) ? [] : [absolute];
  });

const enumCases = (): ReadonlyArray<{ readonly name: string; readonly rawValue: string }> =>
  [...stripComments(readFileSync(join(REPO_ROOT, ENUM_PATH), 'utf8')).matchAll(/case (\w+) = "([^"]+)"/g)].map(
    (match) => ({ name: match[1], rawValue: match[2] })
  );

const spelledOutLiterals = (): ReadonlyArray<{ readonly file: string; readonly literal: string }> =>
  SCANNED_ROOTS.flatMap((root) =>
    swiftFiles(join(REPO_ROOT, root)).flatMap((file) => {
      const source = stripComments(readFileSync(file, 'utf8'));
      return SPELLED_OUT.flatMap((pattern) =>
        [...source.matchAll(new RegExp(pattern.source, pattern.flags))].map((match) => ({
          file: file.replace(REPO_ROOT, ''),
          literal: match[1],
        }))
      );
    })
  );

describe('SocketEvent (iOS) face au contrat socket partagé', () => {
  it('chaque rawValue de SocketEvent appartient au contrat partagé', () => {
    const intruders = enumCases().filter(({ rawValue }) => !DECLARED.has(rawValue));
    expect(intruders.map(({ rawValue }) => rawValue)).toEqual([]);
  });

  it('le nom de cas dérive de la rawValue', () => {
    const misnamed = enumCases().filter(({ name, rawValue }) => name !== camelCase(rawValue));
    expect(misnamed.map(({ name, rawValue }) => `${name} ≠ ${camelCase(rawValue)} (${rawValue})`)).toEqual([]);
  });

  it('rawValues et noms de cas sont uniques', () => {
    const cases = enumCases();
    expect(cases.length).toBeGreaterThan(150);
    expect(new Set(cases.map(({ rawValue }) => rawValue)).size).toBe(cases.length);
    expect(new Set(cases.map(({ name }) => name)).size).toBe(cases.length);
  });

  it("tout nom que iOS épelle encore en clair est un cas de SocketEvent", () => {
    const known = new Set(enumCases().map(({ rawValue }) => rawValue));
    const missing = spelledOutLiterals().filter(({ literal }) => literal.includes(':') && !known.has(literal));
    expect(missing.map(({ file, literal }) => `${file} — ajouter le cas pour "${literal}"`).sort()).toEqual([]);
  });

  it("aucun site SDK n'épelle plus un nom dans emitWithAck(\"…\")", () => {
    const spelled = swiftFiles(join(REPO_ROOT, 'packages/MeeshySDK/Sources'))
      .filter((file) => !file.endsWith(ACK_EMITTER_PATH))
      .filter((file) => /\bemitWithAck\(\s*"/.test(stripComments(readFileSync(file, 'utf8'))));
    expect(spelled.map((file) => file.replace(REPO_ROOT, ''))).toEqual([]);
  });
});
