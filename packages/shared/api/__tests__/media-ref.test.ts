import { describe, it, expect } from 'vitest';
import {
  parseMediaRef,
  staticMediaRef,
  staticKeyFromAbsoluteUrl,
  STATIC_STORE_SCHEME,
} from '../media-ref';

/**
 * La règle que ces témoins gardent : **une clé de média dit de quel magasin
 * elle vient**, et elle le dit dans la DONNÉE — jamais par une forme que le
 * consommateur devine.
 *
 * Le témoin décisif est le dernier de la première section : deux clés dont
 * AUCUNE ne satisfait `^\d{4}/\d{2}/` et qui vont pourtant à deux magasins
 * différents. C'est le cas que l'expression régulière du web ne pouvait pas
 * trancher, et le seul qui prouve que le schéma sert à quelque chose.
 */
describe('Une référence dit son magasin', () => {
  it('un schéma static: désigne le magasin statique', () => {
    expect(parseMediaRef('static:u/i/2025/11/avatar_1763143871947_o0.jpg')).toEqual({
      kind: 'key',
      store: 'static',
      key: 'u/i/2025/11/avatar_1763143871947_o0.jpg',
    });
  });

  it('une clé nue vaut passerelle — la forme que la migration 013 a déjà écrite', () => {
    expect(parseMediaRef('2025/12/68f2a814/photo.jpg')).toEqual({
      kind: 'key',
      store: 'gateway',
      key: '2025/12/68f2a814/photo.jpg',
    });
  });

  it('sépare deux clés qu’AUCUNE forme ne distinguait', () => {
    // `avatars/user/<id>.jpg` est une clé de la PASSERELLE et ne satisfait pas
    // plus `^\d{4}/\d{2}/` que `u/i/…` : c'est exactement la paire sur laquelle
    // la reconnaissance par expression régulière envoyait les deux au même hôte.
    expect(parseMediaRef('avatars/user/68f2a814.jpg')).toMatchObject({ store: 'gateway' });
    expect(parseMediaRef('static:u/i/2025/11/a.jpg')).toMatchObject({ store: 'static' });
  });
});

describe('Les formes héritées restent lisibles — elles fonctionnent', () => {
  it('une adresse absolue porte déjà tout', () => {
    const url = 'https://static.meeshy.me/u/i/2025/11/a.jpg';
    expect(parseMediaRef(url)).toEqual({ kind: 'absolute', url });
  });

  it('un chemin absolu porte déjà sa route', () => {
    expect(parseMediaRef('/api/v1/attachments/file/2025/12/a.jpg')).toEqual({
      kind: 'path',
      path: '/api/v1/attachments/file/2025/12/a.jpg',
    });
  });
});

describe('Ce qui ne désigne aucun média rend null', () => {
  it.each([null, undefined, '', '   ', STATIC_STORE_SCHEME, 'static:/'])(
    'rend null pour %p',
    (valeur) => {
      expect(parseMediaRef(valeur as string | null | undefined)).toBeNull();
    }
  );
});

describe('Écrire et relire sont le MÊME site', () => {
  it('staticMediaRef produit exactement ce que parseMediaRef relit', () => {
    const cle = 'u/i/2025/11/avatar_1763143871947_o0.jpg';
    expect(parseMediaRef(staticMediaRef(cle))).toEqual({
      kind: 'key',
      store: 'static',
      key: cle,
    });
  });

  it('une barre initiale de trop ne change pas la clé — écriture comme lecture', () => {
    expect(staticMediaRef('/u/i/a.jpg')).toBe('static:u/i/a.jpg');
    expect(parseMediaRef('static://u/i/a.jpg')).toMatchObject({ key: 'u/i/a.jpg' });
  });
});

describe('La brique de migration retire l’hôte sans le nommer', () => {
  it('reconnaît un hôte statique par son PREMIER label, pas par un domaine écrit ici', () => {
    expect(staticKeyFromAbsoluteUrl('https://static.meeshy.me/u/i/2025/11/a.jpg')).toBe(
      'u/i/2025/11/a.jpg'
    );
    // Le témoin porte sur un domaine que le dépôt n'écrit nulle part : c'est ce
    // qui prouve que la reconnaissance n'est pas un littéral déguisé.
    expect(staticKeyFromAbsoluteUrl('https://static.exemple.test/u/i/a.jpg')).toBe('u/i/a.jpg');
  });

  it('refuse ce qui n’est pas le magasin statique', () => {
    expect(staticKeyFromAbsoluteUrl('https://gate.meeshy.me/api/v1/attachments/file/a.jpg')).toBeNull();
    expect(staticKeyFromAbsoluteUrl('https://meeshy.me/u/i/a.jpg')).toBeNull();
    expect(staticKeyFromAbsoluteUrl('pas une url')).toBeNull();
    expect(staticKeyFromAbsoluteUrl('https://static.meeshy.me/')).toBeNull();
  });
});
