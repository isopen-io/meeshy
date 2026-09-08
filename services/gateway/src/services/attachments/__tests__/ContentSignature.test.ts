import {
  matchesAudioSignature,
  matchesImageSignature,
  classifyAnonymousAttachment,
  verifyDeclaredMimeType,
} from '../ContentSignature';

// ─── Fixtures : octets d'en-tête réels ─────────────────────────────────────────
// Mêmes constantes que `attachments-upload.test.ts` (round 1/2 sécurité) — un
// texte quelconque ne distinguerait pas la reconnaissance de signature d'un
// simple refus global.
//
// Round 2 : certaines fixtures incluent désormais la structure minimale que
// `ContentSignature.ts` vérifie au-delà du magic number nu (DocType EBML,
// chunk IHDR PNG, sous-chunk "fmt " WAV...) — voir la docstring du module
// pour la justification de chaque renfort.

const WEBM_HEADER = Buffer.concat([
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), // EBML magic
  Buffer.from([0x42, 0x82, 0x84]), // élément EBML DocType (id 0x4282, taille 4)
  Buffer.from('webm', 'ascii'),
]); // WebM — MediaRecorder Chrome/Firefox/Edge
const MP4_M4A_HEADER = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftypM4A ', 'ascii'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('M4A mp42isom', 'ascii'),
]); // MP4/M4A — AVAudioRecorder .aac par défaut (iOS), MediaRecorder Safari
const OGG_HEADER = Buffer.from('OggS\x00\x02\x00\x00', 'binary'); // Ogg — fallback web (Firefox/Chrome)
const MP3_ID3_HEADER = Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00', 'binary'); // MP3 (tag ID3v2)
const MP3_FRAMESYNC_HEADER = Buffer.from([0xff, 0xfb, 0x90, 0x64]); // MP3 sans tag ID3 (frame sync MPEG)
const WAV_HEADER = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WAVEfmt ', 'ascii'),
]); // WAV (RIFF/WAVE/fmt )
const AAC_ADTS_HEADER = Buffer.from([0xff, 0xf1, 0x50, 0x80]); // AAC brut (ADTS)

const PNG_HEADER = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // signature officielle
  Buffer.from([0x00, 0x00, 0x00, 0x0d]), // longueur du chunk IHDR = 13 (constante du format)
  Buffer.from('IHDR', 'ascii'),
]);
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const GIF_HEADER = Buffer.from('GIF89a', 'ascii');
const WEBP_HEADER = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 ', 'ascii'),
]);

const PDF_HEADER = Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'binary');
const ZIP_DOCX_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // docx/zip
const PLAIN_TEXT = Buffer.from('Bonjour, ceci est un simple fichier texte.', 'utf8');
const SVG_HEADER_PROLOG = Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8');
const SVG_HEADER_BARE = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>', 'utf8');
const SVG_HEADER_WITH_BOM = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), SVG_HEADER_BARE]);

describe('matchesAudioSignature', () => {
  it.each([
    ['WebM/EBML (MediaRecorder Chrome/Firefox/Edge)', WEBM_HEADER],
    ['MP4/M4A ftyp (AVAudioRecorder iOS .aac, MediaRecorder Safari)', MP4_M4A_HEADER],
    ['Ogg (fallback MediaRecorder)', OGG_HEADER],
    ['MP3 avec tag ID3v2', MP3_ID3_HEADER],
    ['MP3 sans tag (frame sync MPEG)', MP3_FRAMESYNC_HEADER],
    ['WAV (RIFF/WAVE/fmt )', WAV_HEADER],
    ['AAC brut (ADTS)', AAC_ADTS_HEADER],
  ])('reconnaît %s', (_label, header) => {
    expect(matchesAudioSignature(header)).toBe(true);
  });

  it.each([
    ['un PDF', PDF_HEADER],
    ['un docx/zip', ZIP_DOCX_HEADER],
    ['du texte brut', PLAIN_TEXT],
    ['une image PNG', PNG_HEADER],
    ['un buffer vide', Buffer.alloc(0)],
  ])('rejette %s', (_label, buffer) => {
    expect(matchesAudioSignature(buffer)).toBe(false);
  });
});

describe('matchesImageSignature', () => {
  it.each([
    ['PNG', PNG_HEADER],
    ['JPEG', JPEG_HEADER],
    ['GIF', GIF_HEADER],
    ['WEBP', WEBP_HEADER],
  ])('reconnaît %s', (_label, header) => {
    expect(matchesImageSignature(header)).toBe(true);
  });

  it.each([
    ['un PDF', PDF_HEADER],
    ['un docx/zip', ZIP_DOCX_HEADER],
    ['du texte brut', PLAIN_TEXT],
    ['un fichier audio WebM', WEBM_HEADER],
    ['un buffer vide', Buffer.alloc(0)],
  ])('rejette %s', (_label, buffer) => {
    expect(matchesImageSignature(buffer)).toBe(false);
  });
});

// ─── Round 2 sécurité : la signature ne contraint qu'un préfixe ────────────────
//
// Le round 1 vérifiait uniquement le magic number nu (2 à 8 octets). Une
// revue adverse a montré, PAR EXÉCUTION, que ce magic number nu suivi d'un
// contenu entièrement arbitraire (un PDF) passait pour la quasi-totalité des
// formats. Ces tests prouvent, avec de vrais octets, lesquels sont
// désormais fermés par le renfort structurel de ce module, et documentent
// honnêtement lequel ne l'est PAS (frame sync MPEG — voir la docstring du
// module pour la justification).

describe('matchesAudioSignature — round 2 : magic number nu suivi d\'un contenu arbitraire', () => {
  it('rejette EBML/WebM quand le magic nu est suivi d\'un PDF (pas de DocType "webm")', () => {
    const spoofed = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), PDF_HEADER]);
    expect(matchesAudioSignature(spoofed)).toBe(false);
  });

  it('rejette MP4/ftyp quand le magic nu est suivi d\'un PDF (taille de box absente/nulle)', () => {
    const spoofed = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x00]), Buffer.from('ftyp', 'ascii'), PDF_HEADER]);
    expect(matchesAudioSignature(spoofed)).toBe(false);
  });

  it('rejette Ogg quand le magic nu est suivi d\'un PDF (version de flux != 0)', () => {
    const spoofed = Buffer.concat([Buffer.from('OggS', 'ascii'), PDF_HEADER]);
    expect(matchesAudioSignature(spoofed)).toBe(false);
  });

  it('rejette WAV quand "RIFF"+"WAVE" est suivi d\'un PDF (pas de sous-chunk "fmt ")', () => {
    const spoofed = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('WAVE', 'ascii'),
      PDF_HEADER,
    ]);
    expect(matchesAudioSignature(spoofed)).toBe(false);
  });

  it('rejette ID3 quand le magic nu est suivi d\'un PDF (version majeure hors [2,4])', () => {
    const spoofed = Buffer.concat([Buffer.from('ID3', 'ascii'), PDF_HEADER]);
    expect(matchesAudioSignature(spoofed)).toBe(false);
  });

  it('RÉSERVE DOCUMENTÉE — la frame sync MPEG nue (2 octets) suivie d\'un PDF passe toujours', () => {
    // Volontairement NON renforcé — voir « Formats volontairement laissés au
    // magic number nu » dans ContentSignature.ts. Aucun client Meeshy ne
    // produit ce format (web = WebM/MP4/Ogg, iOS = M4A/MP4/ftyp).
    const spoofed = Buffer.concat([Buffer.from([0xff, 0xfb]), PDF_HEADER]);
    expect(matchesAudioSignature(spoofed)).toBe(true);
  });
});

describe('matchesImageSignature — round 2 : magic number nu suivi d\'un contenu arbitraire', () => {
  it('rejette PNG quand la signature officielle est suivie d\'un PDF (pas de chunk IHDR de longueur 13)', () => {
    const spoofed = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      PDF_HEADER,
    ]);
    expect(matchesImageSignature(spoofed)).toBe(false);
  });

  it('rejette WEBP quand "RIFF"+"WEBP" est suivi d\'un PDF (FourCC hors VP8 /VP8L/VP8X)', () => {
    const spoofed = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('WEBP', 'ascii'),
      PDF_HEADER,
    ]);
    expect(matchesImageSignature(spoofed)).toBe(false);
  });

  it('rejette JPEG quand `FF D8 FF` est suivi d\'un PDF (octet de marqueur hors plage valide)', () => {
    const spoofed = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), PDF_HEADER]);
    expect(matchesImageSignature(spoofed)).toBe(false);
  });

  it('RÉSERVE DOCUMENTÉE — la signature GIF nue (6 octets) suivie d\'un PDF passe toujours', () => {
    // Volontairement NON renforcé — au-delà de sa signature officielle, la
    // structure suivante (Logical Screen Descriptor) n'impose aucune valeur
    // fixe exploitable sans lire la table de couleurs (hors périmètre). Une
    // contrainte « largeur/hauteur > 0 » a été essayée puis écartée : elle
    // aurait été satisfaite par plus de 99,99 % des octets arbitraires.
    const spoofed = Buffer.concat([Buffer.from('GIF89a', 'ascii'), PDF_HEADER]);
    expect(matchesImageSignature(spoofed)).toBe(true);
  });
});

// ─── classifyAnonymousAttachment ────────────────────────────────────────────
//
// Décision UNIQUE partagée par `upload.ts` (REST) et `tus-handler.ts`
// (resumable) — task-1-fix-round-2, Critical 1.

describe('classifyAnonymousAttachment', () => {
  const OPEN: { allowAnonymousFiles: boolean; allowAnonymousImages: boolean } = {
    allowAnonymousFiles: true,
    allowAnonymousImages: true,
  };
  const LOCKED = { allowAnonymousFiles: false, allowAnonymousImages: false };

  it('autorise toujours un vocal reconnu par ses octets, même lien totalement verrouillé', () => {
    expect(classifyAnonymousAttachment('audio/webm', WEBM_HEADER, LOCKED)).toEqual({ allowed: true });
  });

  it('refuse une image reconnue par ses octets quand allowAnonymousImages est faux', () => {
    const verdict = classifyAnonymousAttachment('image/png', PNG_HEADER, {
      allowAnonymousFiles: true,
      allowAnonymousImages: false,
    });
    expect(verdict).toEqual({
      allowed: false,
      reason: 'Images are not allowed for anonymous users on this conversation',
    });
  });

  it('refuse un fichier quelconque quand allowAnonymousFiles est faux', () => {
    const verdict = classifyAnonymousAttachment('application/pdf', PDF_HEADER, {
      allowAnonymousFiles: false,
      allowAnonymousImages: true,
    });
    expect(verdict).toEqual({
      allowed: false,
      reason: 'File uploads are not allowed for anonymous users on this conversation',
    });
  });

  it('refuse un PDF déclaré audio/webm quand le lien est verrouillé (l\'exemption ne se prend pas sur parole)', () => {
    const verdict = classifyAnonymousAttachment('audio/webm', PDF_HEADER, LOCKED);
    expect(verdict.allowed).toBe(false);
  });

  it('tout autoriser sur un lien ouvert, y compris un fichier quelconque', () => {
    expect(classifyAnonymousAttachment('application/pdf', PDF_HEADER, OPEN)).toEqual({ allowed: true });
  });

  it('normalise la casse du mimeType déclaré — IMAGE/PNG reste classée image, pas "fichier"', () => {
    const verdict = classifyAnonymousAttachment('IMAGE/PNG', PNG_HEADER, {
      allowAnonymousFiles: true,
      allowAnonymousImages: false,
    });
    expect(verdict).toEqual({
      allowed: false,
      reason: 'Images are not allowed for anonymous users on this conversation',
    });
  });

  it('normalise la casse pour AUDIO/WEBM également', () => {
    expect(classifyAnonymousAttachment('AUDIO/WEBM', WEBM_HEADER, LOCKED)).toEqual({ allowed: true });
  });
});

// ─── verifyDeclaredMimeType (#5615) ─────────────────────────────────────────
//
// Contrairement à `classifyAnonymousAttachment` (qui ne s'applique qu'à
// l'exemption anonyme et retombe silencieusement sur le seau « fichier » en
// cas de signature manquante), cette fonction s'applique à TOUT upload
// (inscrit ou anonyme) et REJETTE explicitement un mimeType déclaré qui ne
// correspond pas au contenu réel — critère de fin de #5615.

describe('verifyDeclaredMimeType', () => {
  it.each([
    ['image/png déclaré sur un vrai PNG', 'image/png', PNG_HEADER],
    ['image/jpeg déclaré sur un vrai JPEG', 'image/jpeg', JPEG_HEADER],
    ['audio/webm déclaré sur un vrai WebM', 'audio/webm', WEBM_HEADER],
    ['audio/mpeg déclaré sur un vrai MP3 (ID3)', 'audio/mpeg', MP3_ID3_HEADER],
    ['application/pdf déclaré sur un vrai PDF', 'application/pdf', PDF_HEADER],
    ['image/svg+xml déclaré sur un SVG avec prologue XML', 'image/svg+xml', SVG_HEADER_PROLOG],
    ['image/svg+xml déclaré sur un SVG sans prologue', 'image/svg+xml', SVG_HEADER_BARE],
    ['image/svg+xml déclaré sur un SVG avec BOM UTF-8', 'image/svg+xml', SVG_HEADER_WITH_BOM],
    // Familles sans signature fiable connue — la déclaration est crue par décision produit.
    ['video/mp4 déclaré sur un contenu quelconque', 'video/mp4', PLAIN_TEXT],
    ['text/plain déclaré sur un contenu quelconque', 'text/plain', PDF_HEADER],
    ['application/zip déclaré sur un contenu quelconque', 'application/zip', PLAIN_TEXT],
  ])('vérifie %s', (_label, mimeType, buffer) => {
    expect(verifyDeclaredMimeType(mimeType, buffer)).toEqual({ verified: true });
  });

  it.each([
    ['image/png déclaré sur un PDF (usurpation)', 'image/png', PDF_HEADER],
    ['image/jpeg déclaré sur du texte brut', 'image/jpeg', PLAIN_TEXT],
    ['audio/webm déclaré sur un PDF (usurpation)', 'audio/webm', PDF_HEADER],
    ['audio/mpeg déclaré sur une image PNG', 'audio/mpeg', PNG_HEADER],
    ['application/pdf déclaré sur une image PNG', 'application/pdf', PNG_HEADER],
    ['application/pdf déclaré sur du texte brut', 'application/pdf', PLAIN_TEXT],
    ['image/svg+xml déclaré sur un PDF (usurpation)', 'image/svg+xml', PDF_HEADER],
    ['image/svg+xml déclaré sur du texte brut sans balise', 'image/svg+xml', PLAIN_TEXT],
  ])('rejette %s', (_label, mimeType, buffer) => {
    const verdict = verifyDeclaredMimeType(mimeType, buffer);
    expect(verdict.verified).toBe(false);
    expect((verdict as { reason: string }).reason).toContain(mimeType);
  });

  it('normalise la casse et les paramètres du mimeType déclaré', () => {
    expect(verifyDeclaredMimeType('IMAGE/PNG', PNG_HEADER)).toEqual({ verified: true });
    expect(verifyDeclaredMimeType('image/png; charset=binary', PDF_HEADER).verified).toBe(false);
  });
});
