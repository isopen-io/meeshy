import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { UserAuditAction } from '@meeshy/shared/types';
import { beforeAll, describe, expect, test } from 'bun:test';

import { ADMIN_LANGUAGES, loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';

import {
  AUDIT_ACTIONS,
  AUDIT_FAMILIES,
  AUDIT_FILTER_FAMILIES,
  auditActionsOfFamily,
  interpretAuditAction,
  isAuditFilterFamily,
} from './audit-vocabulary';

/**
 * **LE VOCABULAIRE DU JOURNAL D'AUDIT** (#8876, #6727) — chaque code d'action que la
 * passerelle écrit a un libellé, un glyphe, un ton, une famille ; une lecture
 * souveraine le dit ; un code inconnu se dit « Action non répertoriée ».
 *
 * Le témoin qui compte est la RECONNAISSANCE : il lit les sources de la passerelle et
 * l'énumération partagée, et échoue dès qu'un code y apparaît sans libellé ici — la
 * table est figée, et c'est ce témoin qui force à la mettre à jour.
 */
const GATEWAY_SRC = fileURLToPath(new URL('../../../../../services/gateway/src', import.meta.url));

beforeAll(async () => {
  await Promise.all(ADMIN_LANGUAGES.map((language) => loadAdminInterfaceCatalog(language)));
});

const isProductionSource = (path: string): boolean => path.endsWith('.ts') && !path.includes('__tests__') && !path.includes('.test.');

const WRITES_AUDIT = /adminAuditLog|withAudit\(|UserAuditAction/;
const LITERAL_ACTION = /action:\s*(?:[\w.]+\s*\?\s*)?'([A-Z][A-Z0-9_]+)'(?:\s*:\s*'([A-Z][A-Z0-9_]+)')?/g;
const ENUM_ACTION = /UserAuditAction\.([A-Z][A-Z0-9_]+)/g;

function codesWrittenByTheGateway(): ReadonlySet<string> {
  const codes = new Set<string>();
  for (const relative of readdirSync(GATEWAY_SRC, { recursive: true, encoding: 'utf8' })) {
    if (!isProductionSource(relative)) continue;
    const source = readFileSync(`${GATEWAY_SRC}/${relative}`, 'utf8');
    if (!WRITES_AUDIT.test(source)) continue;
    for (const match of source.matchAll(LITERAL_ACTION)) {
      for (const code of [match[1], match[2]]) if (code !== undefined) codes.add(code);
    }
  }
  return codes;
}

describe('la reconnaissance — aucun code écrit par la passerelle ne reste sans libellé', () => {
  test('toutes les valeurs de l’énumération partagée UserAuditAction sont répertoriées', () => {
    const missing = Object.values(UserAuditAction).filter((code) => !(code in AUDIT_ACTIONS));

    expect(missing).toEqual([]);
  });

  test('tous les codes littéraux écrits par withAudit et adminAuditLog.create sont répertoriés', () => {
    const written = codesWrittenByTheGateway();
    expect(written.size).toBeGreaterThan(15);

    const missing = [...written].filter((code) => !(code in AUDIT_ACTIONS));

    expect(missing).toEqual([]);
  });

  test('tous les usages nommés de l’énumération dans les sources de la passerelle sont répertoriés', () => {
    const named = new Set<string>();
    for (const relative of readdirSync(GATEWAY_SRC, { recursive: true, encoding: 'utf8' })) {
      if (!isProductionSource(relative)) continue;
      for (const match of readFileSync(`${GATEWAY_SRC}/${relative}`, 'utf8').matchAll(ENUM_ACTION)) {
        if (match[1] !== undefined) named.add(match[1]);
      }
    }
    expect(named.size).toBeGreaterThan(10);

    const values = new Set<string>(Object.values(UserAuditAction));
    expect([...named].filter((code) => values.has(code) && !(code in AUDIT_ACTIONS))).toEqual([]);
  });

  test('la table ne répertorie que des codes qui existent : aucun code fantôme', () => {
    const real = new Set<string>([...Object.values(UserAuditAction), ...codesWrittenByTheGateway()]);

    expect(Object.keys(AUDIT_ACTIONS).filter((code) => !real.has(code))).toEqual([]);
  });
});

describe('chaque code est dit dans les quatre langues de l’administration', () => {
  for (const language of ADMIN_LANGUAGES) {
    test(`${language} : libellé, explication, glyphe et ton pour chacun des codes`, () => {
      for (const code of Object.keys(AUDIT_ACTIONS)) {
        const interpreted = interpretAuditAction(code, language);

        expect(interpreted.known).toBe(true);
        expect(interpreted.label.trim()).not.toBe('');
        expect(interpreted.label).not.toBe(code);
        expect(interpreted.explain?.trim() ?? '').not.toBe('');
        expect(interpreted.glyph).toBeDefined();
        expect(interpreted.raw).toBe(code);
      }
    });
  }
});

describe('interpretAuditAction — un code se dit en mots', () => {
  test('une action ordinaire : son libellé, son ton, sa famille, une explication — jamais le code', () => {
    const interpreted = interpretAuditAction('BAN_USER', 'fr');

    expect(interpreted.label).toBe('Membre banni');
    expect(interpreted.tone).toBe('danger');
    expect(interpreted.family).toBe('bans');
    expect(interpreted.sovereign).toBe(false);
    expect(interpreted.explain).toContain('suspendu');
    expect(interpreted.label).not.toContain('BAN_USER');
  });

  test('une lecture souveraine le dit : la lecture de messages, la révélation d’un lien, la fiche membre', () => {
    for (const code of ['ADMIN_CONVERSATION_MESSAGES_VIEWED', 'ADMIN_SHARE_LINK_REVEALED', 'VIEW_USER', 'VIEW_USER_LIST']) {
      expect(interpretAuditAction(code, 'fr').sovereign).toBe(true);
    }
    expect(interpretAuditAction('UPDATE_ROLE', 'fr').sovereign).toBe(false);
  });

  test('un code inconnu se dit « Action non répertoriée » et garde son code en attribut brut seulement', () => {
    const interpreted = interpretAuditAction('SOME_FUTURE_ACTION', 'fr');

    expect(interpreted.label).toBe('Action non répertoriée');
    expect(interpreted.known).toBe(false);
    expect(interpreted.family).toBeNull();
    expect(interpreted.sovereign).toBe(false);
    expect(interpreted.tone).toBe('neutral');
    expect(interpreted.raw).toBe('SOME_FUTURE_ACTION');
    expect(interpreted.label).not.toContain('FUTURE');
  });

  test('la casse compte : un code en minuscules n’est pas un code de la passerelle', () => {
    expect(interpretAuditAction('ban_user', 'fr').known).toBe(false);
  });

  test('le libellé suit la langue d’interface', () => {
    expect(interpretAuditAction('DELETE_USER', 'en').label).not.toBe(interpretAuditAction('DELETE_USER', 'fr').label);
  });
});

describe('les familles — chaque code appartient à une famille, chaque famille tient dans un filtre', () => {
  test('toutes les familles de filtre sont nommées : les onze de la spécification, plus la sécurité, plus les réglages du barème (#8906), plus la lecture souveraine', () => {
    expect([...AUDIT_FILTER_FAMILIES]).toEqual([
      'sovereign',
      'accounts',
      'security',
      'roles',
      'bans',
      'conversations',
      'links',
      'posts',
      'broadcasts',
      'agent',
      'reports',
      'communities',
      'settings',
    ]);
    expect(AUDIT_FILTER_FAMILIES.every((family) => isAuditFilterFamily(family))).toBe(true);
    expect(isAuditFilterFamily('nothing')).toBe(false);
  });

  test('chaque code appartient à exactement une famille de domaine', () => {
    for (const [code, entry] of Object.entries(AUDIT_ACTIONS)) {
      expect(AUDIT_FAMILIES).toContain(entry.family);
      expect(auditActionsOfFamily(entry.family)).toContain(code);
    }
  });

  test('la famille « lectures souveraines » traverse les domaines : tous les codes souverains, et eux seuls', () => {
    const sovereign = auditActionsOfFamily('sovereign');

    expect(new Set(sovereign)).toEqual(
      new Set(Object.entries(AUDIT_ACTIONS).filter(([, entry]) => 'sovereign' in entry).map(([code]) => code)),
    );
    expect(sovereign).toContain('ADMIN_CONVERSATION_MESSAGES_VIEWED');
    expect(sovereign).toContain('ADMIN_SHARE_LINK_REVEALED');
  });

  test('une famille de domaine garde aussi ses lectures souveraines : filtrer les liens remonte les liens révélés', () => {
    expect(auditActionsOfFamily('links')).toContain('ADMIN_SHARE_LINK_REVEALED');
    expect(auditActionsOfFamily('conversations')).toContain('ADMIN_CONVERSATION_MESSAGES_VIEWED');
  });

  test('aucune famille ne dépasse les vingt codes que la passerelle accepte dans un filtre', () => {
    for (const family of AUDIT_FILTER_FAMILIES) {
      expect(auditActionsOfFamily(family).length).toBeLessThanOrEqual(20);
      expect(auditActionsOfFamily(family).length).toBeGreaterThan(0);
    }
  });

  test('chaque famille est nommée dans le catalogue', async () => {
    const { translateAdmin } = await import('@/lib/i18n-admin-catalog');
    for (const family of AUDIT_FILTER_FAMILIES) {
      expect(translateAdmin('fr', `admin.audit.family.${family}`).trim()).not.toBe('');
    }
  });
});
