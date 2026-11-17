import { describe, it, expect } from 'vitest';
import {
  ADDRESS_GLYPHS,
  ADDRESS_TITLE_MAX_LENGTH,
  isAddressGlyph,
  normalizeAddressTitle,
  normalizeAddressUrl,
  servedAddresses,
  type AddressColumns,
} from '../utils/profile-addresses';
import { RELATION_LEVELS } from '../types/relation';

const adresse = (over: Partial<AddressColumns> = {}): AddressColumns => ({
  id: 'a1',
  title: 'Site',
  url: 'https://aissandiaye.studio',
  glyph: 'site',
  circle: 'PUBLIC',
  position: 0,
  isShown: true,
  ...over,
});

describe('normalizeAddressUrl : http(s) seulement, jamais une adresse interne', () => {
  it.each([
    ['https://aissandiaye.studio', 'https://aissandiaye.studio/'],
    ['http://soundcloud.com/aissa', 'http://soundcloud.com/aissa'],
    ['  youtube.com/@aissa.snd ', 'https://youtube.com/@aissa.snd'],
    ['HTTPS://Instagram.com/aissa.snd', 'https://instagram.com/aissa.snd'],
  ])('accepte %s', (entree, attendu) => {
    expect(normalizeAddressUrl(entree)).toBe(attendu);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<b>x</b>',
    'file:///etc/passwd',
    'ftp://example.com/a',
    'intent://x#Intent;end',
    'mailto:a@b.co',
    'https://user:pass@example.com/',
    'https://localhost/admin',
    'https://app.localhost/',
    'http://127.0.0.1:3000/',
    'http://10.0.0.5/',
    'http://172.16.4.1/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data',
    'http://0.0.0.0/',
    'http://[::1]/',
    'http://[fd00::1]/',
    'http://2130706433/',
    'http://0x7f.0.0.1/',
    'https://intranet/',
    'https://gateway.internal/',
    'https://nas.local/',
    '',
    '   ',
    'https://',
    'pas une adresse',
    'https://exa mple.com/',
  ])('refuse %s', (entree) => {
    expect(normalizeAddressUrl(entree)).toBeNull();
  });

  it('refuse une adresse trop longue', () => {
    expect(normalizeAddressUrl(`https://example.com/${'a'.repeat(2100)}`)).toBeNull();
  });
});

describe('titre et glyphe', () => {
  it('rogne le titre et refuse vide, trop long ou balisé', () => {
    expect(normalizeAddressTitle('  Vidéos ')).toBe('Vidéos');
    expect(normalizeAddressTitle('   ')).toBeNull();
    expect(normalizeAddressTitle('a'.repeat(ADDRESS_TITLE_MAX_LENGTH + 1))).toBeNull();
    expect(normalizeAddressTitle('a'.repeat(ADDRESS_TITLE_MAX_LENGTH))).not.toBeNull();
    expect(normalizeAddressTitle('<b>x</b>')).toBeNull();
  });

  it('connaît les huit glyphes de la planche', () => {
    expect([...ADDRESS_GLYPHS]).toEqual(['site', 'music', 'photos', 'videos', 'shop', 'contact', 'agenda', 'favorite']);
    expect(isAddressGlyph('videos')).toBe(true);
    expect(isAddressGlyph('skull')).toBe(false);
  });
});

describe('servedAddresses : une adresse ne part que vers le cercle choisi', () => {
  it('le propriétaire lit toutes ses adresses affichées, quel que soit le cercle, dans l’ordre', () => {
    const rows = [adresse({ id: 'b', position: 1, circle: 'BLOOD' }), adresse({ id: 'a', position: 0, circle: 'FRIEND' })];
    expect(servedAddresses(rows, { isSelf: true, viewerLevel: 'PUBLIC' }).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('une adresse non affichée ne part vers personne, pas même vers le propriétaire de la fiche', () => {
    const rows = [adresse({ isShown: false })];
    for (const level of RELATION_LEVELS) {
      expect(servedAddresses(rows, { isSelf: false, viewerLevel: level })).toEqual([]);
    }
    expect(servedAddresses(rows, { isSelf: true, viewerLevel: 'BLOOD' })).toEqual([]);
  });

  it('lecteur sous le cercle : rien ; au cercle ou au-dessus : servie', () => {
    const rows = [adresse({ circle: 'FRIEND' })];
    expect(servedAddresses(rows, { isSelf: false, viewerLevel: 'ACQUAINTANCE' })).toEqual([]);
    expect(servedAddresses(rows, { isSelf: false, viewerLevel: 'FRIEND' })).toHaveLength(1);
    expect(servedAddresses(rows, { isSelf: false, viewerLevel: 'BLOOD' })).toHaveLength(1);
  });

  it('un cercle illisible ferme (jamais public par défaut)', () => {
    const rows = [adresse({ circle: 'ATOM' }), adresse({ circle: '' }), adresse({ circle: 'n’importe quoi' })];
    expect(servedAddresses(rows, { isSelf: false, viewerLevel: 'BLOOD' })).toEqual([]);
  });

  it('ne sert que le contenu public d’une adresse : ni cercle, ni position, ni clics', () => {
    const [servie] = servedAddresses([adresse({ trackingToken: 'a1b2c3' })], { isSelf: false, viewerLevel: 'PUBLIC' });
    expect(servie).toEqual({ id: 'a1', title: 'Site', url: 'https://aissandiaye.studio', glyph: 'site', trackedPath: '/l/a1b2c3' });
  });

  it('sans lien de suivi, pas de trackedPath', () => {
    const [servie] = servedAddresses([adresse()], { isSelf: false, viewerLevel: 'PUBLIC' });
    expect('trackedPath' in servie).toBe(false);
  });
});
