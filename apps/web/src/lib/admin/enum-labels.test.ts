import { beforeAll, describe, expect, test } from 'bun:test';

import { loadAdminInterfaceCatalog, translateAdmin } from '@/lib/i18n-admin-catalog';

import { adminConversationTypeLabel, adminEnumLabel } from './enum-labels';

/**
 * Une valeur servie se DIT dans la langue de l'écran — jamais `under_review`
 * dans l'interface arabe — et une valeur inconnue se montre telle quelle
 * plutôt que de disparaître.
 */
beforeAll(async () => {
  await loadAdminInterfaceCatalog('fr');
  await loadAdminInterfaceCatalog('ar');
});

describe('adminEnumLabel', () => {
  test('chaque famille traduit ses valeurs connues', () => {
    expect(adminConversationTypeLabel('fr', 'group')).toBe(translateAdmin('fr', 'admin.conv.type.group'));
    expect(adminEnumLabel('fr', 'severity', 'HIGH')).toBe(translateAdmin('fr', 'admin.security.severity.high'));
    expect(adminEnumLabel('ar', 'status', 'under_review')).toBe(translateAdmin('ar', 'admin.status.underReview'));
    expect(adminEnumLabel('fr', 'reportType', 'hate_speech')).toBe(translateAdmin('fr', 'admin.report.type.hateSpeech'));
    expect(adminEnumLabel('fr', 'eventStatus', 'FAILED')).toBe(translateAdmin('fr', 'admin.status.failed'));
    expect(adminEnumLabel('fr', 'reportedType', 'message')).toBe(translateAdmin('fr', 'admin.report.target.message'));
  });

  test('aucun libellé traduit ne recopie la valeur brute', () => {
    expect(adminEnumLabel('ar', 'status', 'under_review')).not.toBe('under_review');
    expect(adminEnumLabel('fr', 'severity', 'CRITICAL')).not.toBe('CRITICAL');
  });

  test('une valeur inconnue se montre telle quelle — ni vide, ni une clé', () => {
    expect(adminEnumLabel('fr', 'status', 'escalated')).toBe('escalated');
    expect(adminEnumLabel('fr', 'conversationType', 'toString')).toBe('toString');
  });
});
