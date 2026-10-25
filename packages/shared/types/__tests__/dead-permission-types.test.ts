import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import * as messageDeletion from '../message-deletion';

const source = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8');

describe('Les verdicts de permission d’un message ont UNE source : la loi d’actions (#11235)', () => {
  it('la fenêtre de 60 minutes de « supprimer pour tous » a quitté le paquet', () => {
    expect(Object.keys(messageDeletion)).not.toContain('canDeleteForEveryone');
  });

  it('le type MessagePermissions, sans consommateur, ne revient pas', () => {
    expect(source('message-types.ts')).not.toMatch(/\bMessagePermissions\b/);
  });
});
