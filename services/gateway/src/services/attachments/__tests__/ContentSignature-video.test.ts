/**
 * #11266 — une vidéo est sniffée avant d'être acceptée. `verifyDeclaredMimeType`
 * croyait toute déclaration `video/*` (`verified: true` sans lecture) : un PDF
 * déclaré `video/mp4` passait par les deux portes d'envoi. Les signatures des
 * conteneurs vidéo admis réutilisent celles déjà écrites pour l'audio (ftyp,
 * EBML, Ogg) ; un type vidéo dont aucune signature n'est connue reste cru.
 */
import { matchesVideoSignature, verifyDeclaredMimeType } from '../ContentSignature';

const ftyp = (brand: string): Buffer => Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x20]),
  Buffer.from(`ftyp${brand}`, 'latin1'),
  Buffer.from([0x00, 0x00, 0x02, 0x00]),
  Buffer.from(`${brand}iso2avc1mp41`, 'latin1'),
]);

const MP4_VIDEO = ftyp('isom');
const IPHONE_MOV = ftyp('qt  ');
const THREE_GP = ftyp('3gp4');
const LEGACY_MOV = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x08]), Buffer.from('wide', 'latin1'), Buffer.from([0x00, 0x00, 0x10, 0x00]), Buffer.from('mdat', 'latin1')]);
const ebml = (docType: string): Buffer => Buffer.concat([
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82]),
  Buffer.from([0x80 | docType.length]),
  Buffer.from(docType, 'latin1'),
]);
const WEBM_VIDEO = ebml('webm');
const MKV_VIDEO = ebml('matroska');
const OGG_VIDEO = Buffer.from('OggS\x00\x02\x00\x00\x00\x00\x00\x00\x00\x00', 'binary');
const PDF = Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'binary');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const PLAIN_TEXT = Buffer.from('juste du texte, rien d’une vidéo', 'utf8');
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);

describe('matchesVideoSignature — les conteneurs vidéo admis', () => {
  it.each([
    ['un MP4 (ftyp isom)', MP4_VIDEO],
    ['un MOV d’iPhone (ftyp qt)', IPHONE_MOV],
    ['un 3GP (ftyp 3gp4)', THREE_GP],
    ['un ancien QuickTime sans ftyp (atome wide puis mdat)', LEGACY_MOV],
    ['un WebM (EBML, DocType webm)', WEBM_VIDEO],
    ['un Matroska (EBML, DocType matroska)', MKV_VIDEO],
    ['un Ogg', OGG_VIDEO],
  ])('reconnaît %s', (_label, bytes) => {
    expect(matchesVideoSignature(bytes)).toBe(true);
  });

  it.each([
    ['un PDF', PDF],
    ['un PNG', PNG],
    ['du texte', PLAIN_TEXT],
    ['une archive ZIP', ZIP],
    ['un fichier vide', Buffer.alloc(0)],
  ])('ne reconnaît pas %s', (_label, bytes) => {
    expect(matchesVideoSignature(bytes)).toBe(false);
  });
});

describe('verifyDeclaredMimeType — une vidéo déclarée se mérite par ses octets', () => {
  it.each([
    ['video/mp4', MP4_VIDEO],
    ['video/quicktime', IPHONE_MOV],
    ['video/quicktime', LEGACY_MOV],
    ['video/webm', WEBM_VIDEO],
    ['video/x-matroska', MKV_VIDEO],
    ['video/ogg', OGG_VIDEO],
    ['video/3gpp', THREE_GP],
    ['VIDEO/MP4; codecs="avc1"', MP4_VIDEO],
  ])('accepte %s sur un vrai conteneur', (mimeType, bytes) => {
    expect(verifyDeclaredMimeType(mimeType, bytes)).toEqual({ verified: true });
  });

  it.each([
    ['video/mp4', PDF],
    ['video/mp4', PLAIN_TEXT],
    ['video/quicktime', ZIP],
    ['video/webm', PNG],
    ['video/ogg', PDF],
  ])('refuse %s posé sur un contenu qui n’est pas une vidéo', (mimeType, bytes) => {
    const verdict = verifyDeclaredMimeType(mimeType, bytes);
    expect(verdict.verified).toBe(false);
    expect((verdict as { reason: string }).reason).toContain(mimeType);
  });

  it('un type vidéo dont aucune signature n’est connue reste cru — on ne rejette que ce qu’on sait faux', () => {
    expect(verifyDeclaredMimeType('video/x-flv', PLAIN_TEXT)).toEqual({ verified: true });
  });
});
