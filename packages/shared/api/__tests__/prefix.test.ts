import { describe, it, expect } from 'vitest';
import { apiVersion, apiBasePath, apiPath, stripApiPrefix } from '../prefix';

/**
 * Le préfixe d'API se CONSTRUIT. Ces témoins gardent la propriété que le dépôt
 * n'avait pas : qu'un changement de version ou de forme de déploiement se
 * propage, au lieu de laisser derrière lui des littéraux divergents.
 */
describe('La version vient de la configuration, jamais du code', () => {
  it('vaut v1 par défaut — un défaut, pas une vérité', () => {
    expect(apiVersion({})).toBe('v1');
    expect(apiBasePath({})).toBe('/api/v1');
  });

  it('suit MEESHY_API_VERSION quand elle est posée', () => {
    expect(apiBasePath({ MEESHY_API_VERSION: 'v2' })).toBe('/api/v2');
    expect(apiPath('/conversations', { MEESHY_API_VERSION: 'v2' })).toBe('/api/v2/conversations');
  });

  it('ignore une version vide ou faite d’espaces — sinon le préfixe deviendrait /api/', () => {
    expect(apiBasePath({ MEESHY_API_VERSION: '' })).toBe('/api/v1');
    expect(apiBasePath({ MEESHY_API_VERSION: '   ' })).toBe('/api/v1');
  });
});

describe('Le déploiement peut porter le préfixe autrement', () => {
  it('MEESHY_API_BASE_PATH remplace le chemin ENTIER, segment /api compris', () => {
    expect(apiBasePath({ MEESHY_API_BASE_PATH: '/v2' })).toBe('/v2');
    expect(apiPath('/conversations', { MEESHY_API_BASE_PATH: '/v2' })).toBe('/v2/conversations');
  });

  it('accepte un préfixe VIDE — une API servie à la racine d’un sous-domaine dédié', () => {
    expect(apiBasePath({ MEESHY_API_BASE_PATH: '' })).toBe('');
    expect(apiPath('/conversations', { MEESHY_API_BASE_PATH: '' })).toBe('/conversations');
  });

  it('tolère une barre oblique finale sans la doubler', () => {
    expect(apiPath('/conversations', { MEESHY_API_BASE_PATH: '/v2/' })).toBe('/v2/conversations');
  });

  it('prime sur MEESHY_API_VERSION', () => {
    expect(apiBasePath({ MEESHY_API_BASE_PATH: '/edge', MEESHY_API_VERSION: 'v9' })).toBe('/edge');
  });
});

describe('apiPath compose sans dépendre de la forme du chemin relatif', () => {
  it('accepte un chemin avec ou sans barre initiale', () => {
    expect(apiPath('conversations', {})).toBe('/api/v1/conversations');
    expect(apiPath('/conversations', {})).toBe('/api/v1/conversations');
  });
});

describe('stripApiPrefix distingue « relatif » de « préfixé par une AUTRE version »', () => {
  it('retire le préfixe attendu', () => {
    expect(stripApiPrefix('/api/v1/attachments/file/x.jpg', {})).toBe('/attachments/file/x.jpg');
  });

  it('rend null sur un préfixe ÉTRANGER plutôt que de le laisser passer', () => {
    // C'est l'ambiguïté qui a laissé 305 documents porter /api/v1 sans qu'on le
    // voie : un repli silencieux aurait rendu le chemin inchangé, donc « valide ».
    expect(stripApiPrefix('/api/v2/attachments/file/x.jpg', {})).toBeNull();
    expect(stripApiPrefix('/attachments/file/x.jpg', {})).toBeNull();
  });

  it('sous un préfixe vide, tout chemin est déjà relatif', () => {
    expect(stripApiPrefix('/attachments/file/x.jpg', { MEESHY_API_BASE_PATH: '' })).toBe(
      '/attachments/file/x.jpg'
    );
  });
});
