import { beforeAll, describe, expect, test } from 'bun:test';

import { loadAdminInterfaceCatalog, translateAdminMaybe } from '@/lib/i18n-admin-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

import { CALL_END_REASONS, CALL_ISSUES, callEndReasonLabel, callIssueLabel, formatDecimal, mergeByLabel } from './analytics-labels';

beforeAll(async () => {
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadAdminInterfaceCatalog(language)));
});

describe('les motifs de fin d’appel, dits en mots', () => {
  test('chaque motif connu se dit en français, sans jamais laisser voir son code', () => {
    const labels = CALL_END_REASONS.map((code) => callEndReasonLabel(code, 'fr'));
    expect(labels).toContain('Connexion perdue');
    expect(labels).toContain('Terminé normalement');
    for (const [index, code] of CALL_END_REASONS.entries()) expect(labels[index]).not.toBe(code);
    expect(new Set(labels).size).toBe(CALL_END_REASONS.length);
  });

  test('un motif inconnu se dit « Non reconnu » — le code brut n’est pas peint', () => {
    expect(callEndReasonLabel('teleported', 'fr')).toBe('Non reconnu');
    expect(callEndReasonLabel('', 'fr')).toBe('Non reconnu');
  });

  test('les clés du vocabulaire existent dans les sept langues — un motif ne peut pas se dire « non reconnu » faute de traduction', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      for (const code of CALL_END_REASONS) expect({ language, code, label: translateAdminMaybe(language, `admin.analytics.calls.reason.${code}`) === null }).toEqual({ language, code, label: false });
      for (const code of CALL_ISSUES) expect({ language, code, label: translateAdminMaybe(language, `admin.analytics.calls.issue.${code}`) === null }).toEqual({ language, code, label: false });
    }
  });
});

describe('les problèmes signalés après un appel', () => {
  test('chaque problème se nomme ; un problème inconnu se dit « Non reconnu »', () => {
    expect(CALL_ISSUES.map((code) => callIssueLabel(code, 'fr'))).toEqual([
      'Qualité audio',
      'Qualité vidéo',
      'Appel coupé',
      'Écho',
      'Son et image décalés',
      'Autre problème',
    ]);
    expect(callIssueLabel('smoke', 'fr')).toBe('Non reconnu');
  });
});

describe('mergeByLabel — deux codes qui se disent pareil ne font qu’une ligne', () => {
  test('somme les lignes de même libellé, du plus grand au plus petit', () => {
    expect(
      mergeByLabel([
        { key: 'macos', label: 'Ordinateur', value: 3 },
        { key: 'web', label: 'Navigateur', value: 10 },
        { key: 'windows', label: 'Ordinateur', value: 4 },
      ]),
    ).toEqual([
      { key: 'web', label: 'Navigateur', value: 10 },
      { key: 'macos', label: 'Ordinateur', value: 7 },
    ]);
  });

  test('ne mute pas son entrée', () => {
    const input = [{ key: 'a', label: 'A', value: 1 }, { key: 'b', label: 'A', value: 2 }] as const;
    mergeByLabel(input);
    expect(input).toEqual([{ key: 'a', label: 'A', value: 1 }, { key: 'b', label: 'A', value: 2 }]);
  });
});

describe('formatDecimal', () => {
  test('une décimale par défaut, selon la langue', () => {
    expect(formatDecimal(0.30000000000000004, 'fr')).toBe('0,3');
    expect(formatDecimal(4.25, 'en')).toBe('4.3');
    expect(formatDecimal(4.25, 'en', 2)).toBe('4.25');
  });

  test('l’absence se dit « — »', () => {
    expect(formatDecimal(null, 'fr')).toBe('—');
    expect(formatDecimal(Number.NaN, 'fr')).toBe('—');
  });
});
