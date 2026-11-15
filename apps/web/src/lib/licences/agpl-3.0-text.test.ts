import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AGPL_3_0_TEXT } from './agpl-3.0-text';

test('le texte AGPL du bundle est LICENSES/AGPL-3.0.txt à l octet près (#14628)', () => {
  const official = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'LICENSES', 'AGPL-3.0.txt'), 'utf8');
  expect(AGPL_3_0_TEXT).toBe(official);
});
