import { describe, it, expect } from 'vitest';
import {
  ADDRESS_GLYPHS,
  ADDRESS_TITLE_MAX_LENGTH,
  isAddressGlyph,
  normalizeAddressTitle,
  normalizeAddressUrl,
  servedAddresses,
  addressesSeenAs,
  addressOpensTo,
  lockedAddressCounts,
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

describe('addressesSeenAs : « Voir comme » rend ce que lirait un lecteur du cercle', () => {
  it('filtre sur le cercle et retire le réglage', () => {
    const own = servedAddresses(
      [adresse({ id: 'p', circle: 'PUBLIC' }), adresse({ id: 'a', circle: 'FRIEND', position: 1 }), adresse({ id: 's', circle: 'BLOOD', position: 2 })],
      { isSelf: true, viewerLevel: 'PUBLIC' },
    );
    const vues = addressesSeenAs(own, 'FRIEND');
    expect(vues.map((v) => v.id)).toEqual(['p', 'a']);
    expect(vues.every((v) => !('circle' in v))).toBe(true);
  });
});

describe('addressOpensTo : la loi que la fiche et le lien de suivi d’une adresse partagent', () => {
  it('cercle Ami : ouvert à Ami et au-dessus, fermé en dessous', () => {
    expect(addressOpensTo('FRIEND', { isSelf: false, viewerLevel: 'FRIEND' })).toBe(true);
    expect(addressOpensTo('FRIEND', { isSelf: false, viewerLevel: 'BLOOD' })).toBe(true);
    expect(addressOpensTo('FRIEND', { isSelf: false, viewerLevel: 'ACQUAINTANCE' })).toBe(false);
  });

  it('un cercle illisible ne s’ouvre qu’au propriétaire', () => {
    expect(addressOpensTo('EVERYONE', { isSelf: false, viewerLevel: 'BLOOD' })).toBe(false);
    expect(addressOpensTo('EVERYONE', { isSelf: true, viewerLevel: 'PUBLIC' })).toBe(true);
  });
});

describe('lockedAddressCounts : ce qui est fermé se voit, compté par cercle, sans rien porter de l’adresse (#19274)', () => {
  const fiche = [
    adresse({ id: 'pub', circle: 'PUBLIC', title: 'Public' }),
    adresse({ id: 'ami', circle: 'FRIEND', title: 'Amis', url: 'https://ami.example.com/', trackingToken: 'tokAmi' }),
    adresse({ id: 'proche', circle: 'CLOSE', title: 'Proches' }),
    adresse({ id: 'sang1', circle: 'BLOOD', title: 'Sang 1', position: 3 }),
    adresse({ id: 'sang2', circle: 'BLOOD', title: 'Sang 2', position: 4 }),
    adresse({ id: 'cachee', circle: 'BLOOD', isShown: false }),
    adresse({ id: 'illisible', circle: 'ATOM' }),
  ];

  it('un Ami (cercle autre que le premier) lit le compte des cercles au-dessus du sien, rangés du plus proche au plus intime', () => {
    expect(lockedAddressCounts(fiche, { isSelf: false, viewerLevel: 'FRIEND', reachable: true })).toEqual([
      { circle: 'CLOSE', count: 1 },
      { circle: 'BLOOD', count: 2 },
    ]);
  });

  it('chaque entrée ne porte QUE le cercle et le compte : ni titre, ni URL, ni glyphe, ni jeton, ni identifiant', () => {
    const counts = lockedAddressCounts(fiche, { isSelf: false, viewerLevel: 'COMMUNITY', reachable: true });
    for (const entry of counts) expect(Object.keys(entry).sort()).toEqual(['circle', 'count']);
    const text = JSON.stringify(counts);
    for (const voisin of ['Amis', 'ami.example.com', 'tokAmi', 'site', 'ami', 'proche', 'sang1']) expect(text).not.toContain(voisin);
  });

  it('une adresse masquée ou à cercle illisible ne se compte pas', () => {
    const counts = lockedAddressCounts(fiche, { isSelf: false, viewerLevel: 'CLOSE', reachable: true });
    expect(counts).toEqual([{ circle: 'BLOOD', count: 2 }]);
  });

  it('un Sang n’a plus rien de fermé : la liste est vide', () => {
    expect(lockedAddressCounts(fiche, { isSelf: false, viewerLevel: 'BLOOD', reachable: true })).toEqual([]);
  });

  it('le propriétaire lit tout : rien n’est verrouillé pour lui', () => {
    expect(lockedAddressCounts(fiche, { isSelf: true, viewerLevel: 'PUBLIC', reachable: true })).toEqual([]);
  });

  it('un lecteur qui ne peut atteindre aucun cercle (blocage, compte désactivé) ne lit aucun compte', () => {
    expect(lockedAddressCounts(fiche, { isSelf: false, viewerLevel: 'PUBLIC', reachable: false })).toEqual([]);
  });

  it('se lit par la MÊME loi que la fiche : une adresse servie n’est jamais aussi comptée fermée', () => {
    for (const viewerLevel of RELATION_LEVELS) {
      const reader = { isSelf: false, viewerLevel, reachable: true };
      const served = servedAddresses(fiche, reader).length;
      const locked = lockedAddressCounts(fiche, reader).reduce((sum, entry) => sum + entry.count, 0);
      expect(served + locked).toBe(5);
    }
  });
});
