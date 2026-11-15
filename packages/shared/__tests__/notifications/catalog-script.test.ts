/**
 * Le catalogue de notifications parle la langue de chaque table : une chaîne
 * chinoise n'est jamais écrite en alphabet arabe (copie de table à table,
 * 5036951adf), une chaîne arabe jamais en idéogrammes.
 */

import { describe, it, expect } from 'vitest';
import { TEMPLATES } from '../../utils/notification-string-templates.js';

const ARABIC = /[؀-ۿ]/;
const HAN = /[一-鿿]/;

describe('le catalogue de notifications, écriture par langue', () => {
  it('la table zh-Hans ne contient aucune chaîne en alphabet arabe', () => {
    const misplaced = Object.entries(TEMPLATES['zh-Hans']).filter(([, text]) => ARABIC.test(String(text))).map(([key]) => key);
    expect(misplaced).toEqual([]);
  });

  it('la table ar ne contient aucune chaîne en idéogrammes', () => {
    const misplaced = Object.entries(TEMPLATES.ar).filter(([, text]) => HAN.test(String(text))).map(([key]) => key);
    expect(misplaced).toEqual([]);
  });
});
