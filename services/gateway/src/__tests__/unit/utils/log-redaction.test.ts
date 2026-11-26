/**
 * Un journal n'écrit jamais une adresse ni un numéro en clair (#16049).
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { redactEmailForLog, redactPhoneForLog, redactIdentifierForLog } from '../../../utils/log-redaction';

describe('redactEmailForLog', () => {
  it('ne rend ni la partie locale ni le domaine entiers', () => {
    const redacted = redactEmailForLog('alice.martin@exemple.com');
    expect(redacted).not.toContain('alice');
    expect(redacted).not.toContain('exemple');
    expect(redacted).toBe('a***@e***.com');
  });

  it('rend une forme fixe pour une chaîne qui n’est pas une adresse', () => {
    expect(redactEmailForLog('pas-une-adresse')).toBe('***');
    expect(redactEmailForLog('')).toBe('***');
  });
});

describe('redactPhoneForLog', () => {
  it('ne garde que les deux derniers chiffres', () => {
    const redacted = redactPhoneForLog('+33612345678');
    expect(redacted).not.toContain('612345');
    expect(redacted).toBe('***78');
  });

  it('rend une forme fixe pour un numéro trop court', () => {
    expect(redactPhoneForLog('12')).toBe('***');
  });
});

describe('redactIdentifierForLog', () => {
  it('masque un identifiant qui est une adresse', () => {
    expect(redactIdentifierForLog('bob@exemple.org')).toBe('b***@e***.org');
  });

  it('masque un identifiant qui est un numéro', () => {
    expect(redactIdentifierForLog('+33 6 12 34 56 78')).toBe('***78');
  });

  it('laisse un pseudonyme, déjà public', () => {
    expect(redactIdentifierForLog('alice_42')).toBe('alice_42');
  });
});
