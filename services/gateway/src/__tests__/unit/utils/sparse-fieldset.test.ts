/**
 * La grammaire PARTAGÉE de `?fields=` / `?expand=` et sa traduction en `select`
 * Prisma (#4356).
 *
 * Quatre analyseurs coexistaient — `directory/person.ts`, `me/get-me.ts`,
 * `links/user.ts` et la sélection de préférences — sur TROIS sémantiques. Ce
 * module porte la première : la projection LAXISTE d'un objet servi. Les deux
 * autres restent chez elles, et le § « Ce que ce module ne fait PAS » du
 * doc-comment dit pourquoi.
 *
 * Les témoins ci-dessous gardent les BORNES, qui sont le seul endroit où trois
 * sites peuvent diverger sans qu'on le voie : liste absente, liste vide, jeton
 * inconnu, jeton pointé, doublon — et la propriété qui rend le lot sûr, à
 * savoir qu'une projection SANS paramètre rend le `select` complet PAR
 * IDENTITÉ, donc qu'aucune requête ne peut changer sans qu'on l'ait demandé.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  parseFieldList,
  parseTokenList,
  parseTokenSet,
  restrictFields,
  isFieldServed,
  selectForFields,
  type ColumnPlan,
} from '../../../utils/sparse-fieldset';

// ─── `?fields=` : la liste ──────────────────────────────────────────────────

describe('parseFieldList — la liste des champs demandés', () => {
  it('un paramètre ABSENT ne restreint rien (null, jamais un ensemble vide)', () => {
    expect(parseFieldList(undefined)).toBeNull();
  });

  it('une liste VIDE vaut absente — jamais « aucun champ »', () => {
    // `?fields=` rendu comme « zéro champ servi » servirait une réponse vide
    // qui a l'air d'une vérité. Les trois sites laxistes le lisent déjà ainsi.
    expect(parseFieldList('')).toBeNull();
    expect(parseFieldList(',')).toBeNull();
    expect(parseFieldList('  ,  , ')).toBeNull();
  });

  it('une valeur NON-string ne restreint rien (la querystring peut être contournée)', () => {
    expect(parseFieldList(42)).toBeNull();
    expect(parseFieldList(null)).toBeNull();
    expect(parseFieldList(['id'])).toBeNull();
  });

  it('découpe sur la virgule, coupe les espaces, écarte les jetons vides', () => {
    expect([...(parseFieldList('id, username ,,role') ?? [])]).toEqual(['id', 'username', 'role']);
  });

  it('déduplique — deux fois le même champ ne le sert pas deux fois', () => {
    expect([...(parseFieldList('id,id,id') ?? [])]).toEqual(['id']);
  });
});

// ─── `?expand=` : le vocabulaire fermé ──────────────────────────────────────

describe('parseTokenList — les expansions', () => {
  const KNOWN = ['stats', 'presence', 'relation'] as const;

  it('rend la liste VIDE sans paramètre', () => {
    expect(parseTokenList(undefined, KNOWN)).toEqual([]);
    expect(parseTokenList('', KNOWN)).toEqual([]);
  });

  it('ignore un jeton INCONNU sans jamais refuser — un client plus récent que le serveur reste servi', () => {
    expect(parseTokenList('stats,quelquechose-de-futur', KNOWN)).toEqual(['stats']);
  });

  it("préserve l'ordre de la DEMANDE, pas celui du vocabulaire", () => {
    expect(parseTokenList('relation,stats', KNOWN)).toEqual(['relation', 'stats']);
  });

  it('déduplique', () => {
    expect(parseTokenList('stats,stats', KNOWN)).toEqual(['stats']);
  });

  it('parseTokenSet en rend la forme ensembliste', () => {
    const set = parseTokenSet('stats,inconnu', KNOWN);
    expect(set.has('stats')).toBe(true);
    expect(set.size).toBe(1);
  });
});

// ─── La restriction d'un objet SERVI ────────────────────────────────────────

describe('restrictFields — ce qui est SERVI', () => {
  const objet = { id: 'u1', username: 'ada', role: 'USER', bio: null };

  it('sans champs, rend l\'objet TEL QUEL — la MÊME référence, aucune copie', () => {
    expect(restrictFields(objet, null)).toBe(objet);
  });

  it('ne garde que les clés demandées', () => {
    expect(restrictFields(objet, new Set(['username']))).toEqual({ username: 'ada' });
  });

  it('un champ INCONNU ne fabrique rien — `fields` ne peut que RESTREINDRE', () => {
    // La borne la plus chère du lot : si `fields` pouvait ÉLARGIR, il
    // suffirait de demander `fields=email` pour que la garde posée à la
    // source devienne décorative.
    expect(restrictFields(objet, new Set(['email', 'password']))).toEqual({});
  });

  it('un jeton POINTÉ est un nom opaque — il ne descend dans aucun sous-arbre', () => {
    // `catégorie.clé` est la grammaire STRICTE des préférences, pas celle-ci.
    expect(restrictFields({ a: { b: 1 } }, new Set(['a.b']))).toEqual({});
  });

  it('les clés ÉPINGLÉES survivent à toute liste', () => {
    expect(restrictFields(objet, new Set(['username']), ['id'])).toEqual({ id: 'u1', username: 'ada' });
  });

  it('une clé demandée mais absente de l\'objet est simplement omise', () => {
    expect(restrictFields(objet, new Set(['username', 'jamais-vu']))).toEqual({ username: 'ada' });
  });
});

describe('isFieldServed — une clé survivra-t-elle ?', () => {
  it('sans liste, tout est servi', () => {
    expect(isFieldServed(null, 'creator')).toBe(true);
  });

  it('avec une liste, seules ses clés (et les épinglées) le sont', () => {
    expect(isFieldServed(new Set(['id']), 'creator')).toBe(false);
    expect(isFieldServed(new Set(['id']), 'creator', ['creator'])).toBe(true);
  });
});

// ─── La traduction en `select` Prisma ───────────────────────────────────────

const PLAN: ColumnPlan<{
  id: true;
  username: true;
  isOnline: true;
  voiceModel: { select: { qualityScore: true } };
}> = {
  full: {
    id: true,
    username: true,
    isOnline: true,
    voiceModel: { select: { qualityScore: true } },
  },
  pinned: ['id', 'isOnline'],
  columns: {
    voicePublic: ['voiceModel'],
    voiceQuality: ['voiceModel'],
    isMeeshyer: [],
  },
};

describe('selectForFields — ce qui est CHARGÉ', () => {
  it('sans champs, rend le `select` COMPLET par IDENTITÉ — la requête ne peut pas changer', () => {
    // La ligne rouge du lot #4356 : le comportement par DÉFAUT ne bouge pas.
    // L'identité de référence le prouve mieux qu'une égalité profonde — il
    // n'y a pas d'objet reconstruit dans lequel un champ pourrait manquer.
    expect(selectForFields(PLAN, null)).toBe(PLAN.full);
  });

  it('réduit aux colonnes des champs demandés, épinglées comprises', () => {
    expect(selectForFields(PLAN, new Set(['username']))).toEqual({
      id: true,
      isOnline: true,
      username: true,
    });
  });

  it('une clé DÉRIVÉE charge sa relation — et deux clés dérivées ne la chargent qu\'une fois', () => {
    expect(selectForFields(PLAN, new Set(['voicePublic', 'voiceQuality']))).toEqual({
      id: true,
      isOnline: true,
      voiceModel: { select: { qualityScore: true } },
    });
  });

  it('une clé FABRIQUÉE (aucune colonne) ne charge rien de plus', () => {
    expect(selectForFields(PLAN, new Set(['isMeeshyer']))).toEqual({ id: true, isOnline: true });
  });

  it('un champ INCONNU ne charge rien — jamais une colonne que le plan ne déclare pas', () => {
    const reduit = selectForFields(PLAN, new Set(['email', 'password']));
    expect(reduit).toEqual({ id: true, isOnline: true });
    expect(Object.keys(reduit).every((c) => c in PLAN.full)).toBe(true);
  });

  it('un ensemble VIDE laisse les épinglées — jamais un `select` vide, que Prisma lirait comme « tout »', () => {
    expect(selectForFields(PLAN, new Set())).toEqual({ id: true, isOnline: true });
  });

  it('le `select` réduit est toujours un SOUS-ENSEMBLE du complet, valeurs comprises', () => {
    const reduit = selectForFields(PLAN, new Set(['voiceQuality', 'username']));
    for (const [colonne, valeur] of Object.entries(reduit)) {
      expect(PLAN.full[colonne as keyof typeof PLAN.full]).toBe(valeur);
    }
  });
});
