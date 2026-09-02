/**
 * `?fields=` sur un vocabulaire FERMÉ — la seconde règle de l'inconnu (#4173).
 *
 * `utils/sparse-fieldset.ts` tenait UNE règle de l'inconnu : l'IGNORER. Son
 * doc-comment dit pourquoi, et il a raison — « sur un vocabulaire ouvert,
 * refuser casse un client plus récent que le serveur ». Il dit aussi que
 * l'autre règle existe, et qu'elle est juste elle aussi : « sur un vocabulaire
 * FERMÉ, ignorer une faute de frappe sert une réponse partielle qui a l'air
 * d'une vérité ».
 *
 * #4173 apporte les deux ressources qui ont un vocabulaire FERMÉ —
 * `/conversations/{id}` et `/sync` — et dont le critère 1 exige « 400 explicite
 * [sur] tout champ ou relation non déclaré ». La règle stricte rejoint donc la
 * loi plutôt que de naître une cinquième fois dans une route : c'est exactement
 * ce que `sparse-fieldset-single-law-guard.test.ts` interdit.
 *
 * Ce que ces témoins gardent, et que la relecture ne montre pas :
 *
 * - le REFUS nomme le jeton fautif (sans quoi un client ne peut pas se
 *   corriger : c'est la faute de frappe qu'on veut lui rendre lisible) ;
 * - la liste VIDE reste « aucune restriction », comme dans la règle laxiste —
 *   la fermeture du vocabulaire ne change pas le sens de l'ABSENCE ;
 * - la grammaire PORTÉE (`portée.champ`) refuse un jeton sans point, parce
 *   qu'un champ sans portée ne dit pas à quelle collection il s'applique.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  parseStrictFieldList,
  parseStrictTokenList,
  parseScopedFieldList,
} from '../../../utils/sparse-fieldset';

const CONNUS = ['id', 'title', 'type'] as const;

describe('parseStrictFieldList — vocabulaire FERMÉ, 400 sur l’inconnu', () => {
  it('rend la liste demandée quand tous les jetons sont déclarés', () => {
    const r = parseStrictFieldList('id,title', CONNUS);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('inatteignable');
    expect([...(r.fields ?? [])].sort()).toEqual(['id', 'title']);
  });

  it('REFUSE un champ non déclaré, et le NOMME', () => {
    const r = parseStrictFieldList('id,emial', CONNUS);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('inatteignable');
    expect(r.unknown).toEqual(['emial']);
  });

  it('nomme TOUS les jetons fautifs, pas seulement le premier', () => {
    const r = parseStrictFieldList('emial,id,titel', CONNUS);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('inatteignable');
    expect(r.unknown).toEqual(['emial', 'titel']);
  });

  it('paramètre ABSENT ⇒ aucune restriction (`null`), jamais un refus', () => {
    const r = parseStrictFieldList(undefined, CONNUS);
    expect(r).toEqual({ ok: true, fields: null });
  });

  it('liste VIDE ⇒ aucune restriction — la fermeture du vocabulaire ne change pas le sens de l’absence', () => {
    expect(parseStrictFieldList('', CONNUS)).toEqual({ ok: true, fields: null });
    expect(parseStrictFieldList(',,', CONNUS)).toEqual({ ok: true, fields: null });
  });

  it('déduplique — un jeton répété n’est ni une faute ni deux colonnes', () => {
    const r = parseStrictFieldList('id,id,title', CONNUS);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('inatteignable');
    expect(r.fields?.size).toBe(2);
  });
});

describe('parseStrictTokenList — le pendant strict de `parseTokenList`', () => {
  it('garde l’ORDRE de la demande', () => {
    const r = parseStrictTokenList('type,id', CONNUS);
    expect(r).toEqual({ ok: true, tokens: ['type', 'id'] });
  });

  it('REFUSE et nomme, là où `parseTokenList` ignorerait', () => {
    const r = parseStrictTokenList('id,posts', CONNUS);
    expect(r).toEqual({ ok: false, unknown: ['posts'] });
  });
});

describe('parseScopedFieldList — `portée.champ`, fermé aux DEUX niveaux', () => {
  const VOCABULAIRE = {
    messages: ['id', 'content'],
    conversations: ['id', 'title'],
  } as const;

  it('range chaque champ sous SA portée', () => {
    const r = parseScopedFieldList('messages.id,messages.content,conversations.title', VOCABULAIRE);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('inatteignable');
    expect([...(r.byScope.get('messages') ?? [])].sort()).toEqual(['content', 'id']);
    expect([...(r.byScope.get('conversations') ?? [])].sort()).toEqual(['title']);
  });

  it('une portée NON citée est absente de la carte — donc sans restriction', () => {
    const r = parseScopedFieldList('messages.id', VOCABULAIRE);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('inatteignable');
    expect(r.byScope.has('conversations')).toBe(false);
  });

  it('REFUSE une portée inconnue', () => {
    const r = parseScopedFieldList('posts.id', VOCABULAIRE);
    expect(r).toEqual({ ok: false, failure: { kind: 'unknown-scope', tokens: ['posts'] } });
  });

  it('REFUSE un champ inconnu DANS une portée connue — le second niveau est fermé lui aussi', () => {
    const r = parseScopedFieldList('messages.contnet', VOCABULAIRE);
    expect(r).toEqual({ ok: false, failure: { kind: 'unknown-field', tokens: ['messages.contnet'] } });
  });

  it('REFUSE un jeton SANS portée — il ne dit pas à quelle collection il s’applique', () => {
    const r = parseScopedFieldList('id', VOCABULAIRE);
    expect(r).toEqual({ ok: false, failure: { kind: 'unscoped', tokens: ['id'] } });
  });

  it('paramètre absent ou vide ⇒ carte VIDE, aucune restriction nulle part', () => {
    for (const raw of [undefined, '', ',,']) {
      const r = parseScopedFieldList(raw, VOCABULAIRE);
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error('inatteignable');
      expect(r.byScope.size).toBe(0);
    }
  });
});
