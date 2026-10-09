import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, test } from 'bun:test';

import { ADMIN_LANGUAGES, loadAdminInterfaceCatalog, translateAdmin } from '@/lib/i18n-admin-catalog';

import { KNOWN_AUDIT_FIELDS, auditFieldLabel, auditValue, summarizeUserAgent } from './audit-fields';
import { OBJECT_ID, servedAuditPerson } from './audit-fixtures';
import { interpretReportAction } from './interpret/enums';

/**
 * **LES CHAMPS MODIFIÉS, DITS EN MOTS** (#8876, #6727) — le libellé du champ (traduit
 * s'il est connu, humanisé sinon), la valeur avant et après (booléen dit en mots, date
 * en clair, énumération nommée, langue nommée, secret masqué tel que servi), et le
 * navigateur résumé d'un agent utilisateur.
 */
const NOW = new Date('2026-09-30T12:00:00.000Z');
const AUDIT_FR = fileURLToPath(new URL('../interface-catalogs/admin/audit-reglages-fr.ts', import.meta.url));

beforeAll(async () => {
  await Promise.all(ADMIN_LANGUAGES.map((language) => loadAdminInterfaceCatalog(language)));
});

describe('auditFieldLabel — le champ en mots', () => {
  test('un champ connu est traduit', () => {
    expect(auditFieldLabel('role', 'fr')).toBe('Rôle');
    expect(auditFieldLabel('systemLanguage', 'fr')).toBe('Langue principale');
    expect(auditFieldLabel('twoFactorEnabled', 'en')).toBe('Two-factor authentication');
  });

  test('toute la table des champs connus est dite dans les quatre langues de l’administration', () => {
    for (const language of ADMIN_LANGUAGES) {
      for (const field of KNOWN_AUDIT_FIELDS) expect(auditFieldLabel(field, language).trim()).not.toBe('');
    }
  });

  test('le fragment français ne porte aucun champ que la table ne connaît pas, et la table aucun champ sans libellé', () => {
    const source = readFileSync(AUDIT_FR, 'utf8');
    const declared = [...source.matchAll(/'admin\.audit\.field\.([A-Za-z]+)'/g)].map((match) => match[1]);

    expect([...declared].sort()).toEqual([...KNOWN_AUDIT_FIELDS].sort());
  });

  test('un champ inconnu est humanisé, jamais peint en camelCase ni en identifiant', () => {
    expect(auditFieldLabel('slowModeSeconds', 'fr')).toBe('Slow mode seconds');
    expect(auditFieldLabel('default_write_role', 'fr')).toBe('Default write role');
  });

  test('un champ imbriqué garde son chemin, segment par segment', () => {
    expect(auditFieldLabel('settings.notificationLevel', 'fr')).toBe('Settings › notification level');
  });

  test('une décision de signalement se lit : action retenue, notes, modérateur (audit 2026-10-04)', () => {
    expect(auditFieldLabel('actionTaken', 'fr')).toBe('Action retenue');
    expect(auditFieldLabel('moderatorNotes', 'fr')).toBe('Notes du modérateur');
    expect(auditFieldLabel('moderatorId', 'fr')).toBe('Modérateur');
  });

  test('le diff à plat du barème se lit par opération et par réglage, jamais par chemin brut', () => {
    expect(auditFieldLabel('operations.content.text_message.points', 'fr', 'EngagementScaleConfig')).toBe('Points — Envoyer un message texte');
    expect(auditFieldLabel('operations.content.text_message.multiplied', 'fr', 'EngagementScaleConfig')).toBe('Multiplié par l’élan — Envoyer un message texte');
    expect(auditFieldLabel('operations.content.text_message.cap', 'fr', 'EngagementScaleConfig')).toBe('Actes crédités au plus — Envoyer un message texte');
    expect(auditFieldLabel('operations.content.text_message.variantPoints.global', 'fr', 'EngagementScaleConfig')).toBe('Points (globale) — Envoyer un message texte');
    expect(auditFieldLabel('multiplier.windowDays', 'fr', 'EngagementScaleConfig')).toBe('Multiplicateur › Fenêtre glissante (jours)');
    expect(auditFieldLabel('multiplier.levelCaps', 'fr', 'EngagementScaleConfig')).toBe('Multiplicateur maximal par niveau');
    expect(auditFieldLabel('streakBonuses', 'fr', 'EngagementScaleConfig')).toBe(translateAdmin('fr', 'admin.scale.streak.title'));
    expect(auditFieldLabel('abuse.heavyPoints', 'fr', 'EngagementScaleConfig')).toContain(translateAdmin('fr', 'admin.scale.abuse.heavyPoints'));
    expect(auditFieldLabel('linkVisits.basePoints', 'fr', 'EngagementScaleConfig')).toContain(translateAdmin('fr', 'admin.scale.links.basePoints'));
  });

  test('un chemin du barème inconnu reste humanisé', () => {
    expect(auditFieldLabel('operations.unknown_op.points', 'fr', 'EngagementScaleConfig')).toBe('Operations › unknown op › points');
  });

  test('un champ vide ne plante pas', () => {
    expect(auditFieldLabel('', 'fr')).toBe('—');
  });
});

describe('auditValue — la valeur en mots', () => {
  const value = (field: string, served: string | null, entity = 'User', language: 'fr' | 'en' = 'fr') =>
    auditValue({ field, value: served, entity }, language, NOW);

  test('une valeur absente se dit « Aucune valeur »', () => {
    expect(value('bio', null)).toEqual({ kind: 'empty', text: 'Aucune valeur' });
  });

  test('un secret masqué par la passerelle reste masqué tel que servi', () => {
    expect(value('email', '•••')).toEqual({ kind: 'masked', text: '•••' });
  });

  test('un booléen se dit en mots : jamais true ni false', () => {
    expect(value('isActive', 'true')).toEqual({ kind: 'text', text: 'Oui' });
    expect(value('isActive', 'false')).toEqual({ kind: 'text', text: 'Non' });
    expect(value('isActive', 'true', 'User', 'en').text).toBe('Yes');
  });

  test('un instant ISO se dit en date lisible, jamais brut', () => {
    const shown = value('unlock', '2026-09-30T14:03:00.000Z').text;

    expect(shown).not.toContain('T14:03');
    expect(shown).toMatch(/2026/);
  });

  test('un rôle de compte se dit par son nom', () => {
    expect(value('role', 'MODERATOR')).toEqual({ kind: 'text', text: 'Modérateur' });
    expect(value('role', 'BIGBOSS').text).toBe('Créateur');
  });

  test('le rôle d’un participant de conversation n’est pas un rôle de compte', () => {
    expect(value('role', 'admin', 'Conversation').text).toBe('Administrateur');
    expect(value('role', 'member', 'Conversation').text).toBe('Membre');
  });

  test('une langue se dit par son nom', () => {
    expect(value('systemLanguage', 'fr').text).toBe('français');
    expect(value('regionalLanguage', 'es').text).toBe('espagnol');
    expect(value('customDestinationLanguage', 'en', 'User', 'en').text).toBe('English');
  });

  test('le statut dépend de ce qui change : signalement ou demande de contact', () => {
    expect(value('status', 'under_review', 'Report').text).toBe('En cours d’examen');
    expect(value('status', 'accepted', 'FriendRequest').text).toBe('Acceptée');
  });

  test('le motif et le genre d’un signalement se disent par leur nom', () => {
    expect(value('reportType', 'harassment', 'Report').text).toBe('Harcèlement');
    expect(value('reportedType', 'user', 'Report').text).toBe('Membre');
  });

  test('un entier servi en chaîne se formate : un compte d’effacement se lit', () => {
    expect(value('redisKeys', '12408', 'Agent').text).toMatch(/12\s?408/);
  });

  test('un texte libre est laissé tel quel', () => {
    expect(value('bio', 'Développeuse à Dakar')).toEqual({ kind: 'text', text: 'Développeuse à Dakar' });
  });

  test('l’action retenue d’une décision se dit par son nom', () => {
    expect(value('actionTaken', 'warning_sent', 'Report').text).toBe(interpretReportAction('warning_sent', 'fr').label);
    expect(value('actionTaken', 'warning_sent', 'Report').text).not.toContain('warning_sent');
  });

  test('le modérateur se nomme par la personne servie, sinon « Modérateur » — jamais un identifiant', () => {
    const admin = servedAuditPerson(7, { displayName: 'Awa Diop' });
    const named = auditValue({ field: 'moderatorId', value: OBJECT_ID(7), entity: 'Report', people: [admin] }, 'fr', NOW);
    const unknown = auditValue({ field: 'moderatorId', value: OBJECT_ID(9), entity: 'Report', people: [admin] }, 'fr', NOW);

    expect(named).toEqual({ kind: 'text', text: 'Awa Diop' });
    expect(unknown).toEqual({ kind: 'text', text: 'Modérateur' });
    expect(value('moderatorId', OBJECT_ID(9), 'Report').text).toBe('Modérateur');
  });

  test('une énumération inconnue se dit « Non reconnu », jamais son code brut', () => {
    expect(value('role', 'OVERLORD').text).toBe('Non reconnu');
  });
});

describe('summarizeUserAgent — le navigateur résumé', () => {
  const CASES: readonly (readonly [string, string, string])[] = [
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'Safari', 'iPhone'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36', 'Chrome', 'Android'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0', 'Edge', 'Windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; rv:128.0) Gecko/20100101 Firefox/128.0', 'Firefox', 'macOS'],
    ['Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'Safari', 'iPad'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', 'Chrome', 'Linux'],
    ['Meeshy/2.0 (iOS 17.5; iPhone15,2)', 'Meeshy', 'iPhone'],
  ];

  for (const [agent, browser, os] of CASES) {
    test(`${browser} sur ${os}`, () => {
      expect(summarizeUserAgent(agent)).toEqual({ browser, os });
    });
  }

  test('un agent que rien ne permet de reconnaître est null : l’écran le dit, il n’invente pas', () => {
    expect(summarizeUserAgent('curl/8.4.0')).toBeNull();
    expect(summarizeUserAgent('')).toBeNull();
    expect(summarizeUserAgent(null)).toBeNull();
  });
});
