/**
 * Reniflement de signature (magic bytes) — vérifie le CONTENU réel d'un
 * fichier plutôt que le `Content-Type` déclaré par le client.
 *
 * Contexte (task-1-fix-round-1) : l'exemption audio de la boucle
 * d'autorisation anonyme (`routes/attachments/upload.ts`) se fiait
 * uniquement au `mimeType` déclaré par le client, sans jamais regarder les
 * octets — un PDF déclaré `audio/webm` passait tel quel. Ce module ferme ce
 * contournement (et le même défaut, préexistant, côté image/fichier) sans
 * ajouter de dépendance de sniffing (`file-type`, `mmmagic` : absentes de ce
 * dépôt) — une reconnaissance de signatures en tête de fichier suffit et
 * reste testable.
 *
 * ── Ce que ce module garantit RÉELLEMENT (round 2, honnêteté du contrat) ──
 *
 * Le round 1 affirmait que l'exemption « se mérite par les octets ». Une
 * revue adverse a montré, PAR EXÉCUTION, que ce n'était vrai que pour les
 * quelques octets de tête : `[0xFF,0xFB]` (2 octets, MP3), `ID3` (3 octets),
 * le magic EBML de WebM (4 octets) ou la box `ftyp` de MP4 (4 octets),
 * suivis d'un PDF entier, passaient tous. Le vrai contrat est donc : CE
 * MODULE VÉRIFIE UN PRÉFIXE STRUCTUREL (magic number + quelques champs
 * adjacents vérifiables sans parser le conteneur — tailles, versions,
 * marqueurs réservés), PAS LE FICHIER ENTIER. Au-delà de cette fenêtre
 * (`RECOMMENDED_SIGNATURE_PREFIX_BYTES`, ≤ 64 octets), aucun octet n'est
 * jamais inspecté — un attaquant qui lit ce fichier peut forger un préfixe
 * qui satisfait chaque vérification ci-dessous. Le gain réel est de faire
 * passer le coût de l'exemption de « copier 2 à 8 octets sur Wikipédia » à
 * « connaître la structure du format » — pas de le rendre infalsifiable.
 *
 * Formats renforcés au-delà du magic number nu, et pourquoi c'est sûr pour
 * les vocaux/images légitimes (chaque contrainte est un invariant du
 * FORMAT, pas une supposition sur un encodeur particulier) :
 * - EBML/WebM : le DocType ("webm") doit apparaître dans la fenêtre de tête
 *   — présent par construction dans tout fichier WebM conforme (c'est ce qui
 *   distingue le profil WebM du Matroska générique dans la spec).
 * - MP4/ftyp : la taille de box déclarée doit être plausible et le
 *   major_brand (4 octets juste après `ftyp`) doit être de l'ASCII
 *   imprimable — toujours vrai pour un brand FourCC réel ("M4A ", "isom",
 *   "mp42"...). Un attaquant qui connaît la structure peut satisfaire les
 *   DEUX en choisissant une taille plausible et un contenu imprimable — ce
 *   n'est PAS une garantie forte, seulement un plancher (cf. réserve
 *   ci-dessous).
 * - Ogg : `stream_structure_version` DOIT valoir 0 et les bits réservés du
 *   `header_type_flag` DOIVENT être nuls — imposé par RFC 3533.
 * - WAV : le sous-chunk qui suit "WAVE" est TOUJOURS "fmt " en tête d'un
 *   fichier RIFF/WAVE valide.
 * - ID3 (MP3 tagué) : la version majeure doit être 2-4 et la taille doit
 *   être encodée en syncsafe (bit de poids fort nul sur chaque octet) —
 *   imposé par la spec ID3v2.
 * - PNG : le chunk qui suit la signature officielle est TOUJOURS IHDR, de
 *   longueur EXACTEMENT 13 — imposé par la spec PNG. Vérification quasi
 *   infalsifiable par accident (1 chance sur ~4 milliards sur la longueur
 *   seule).
 * - WEBP : le FourCC qui suit "WEBP" est l'un de "VP8 "/"VP8L"/"VP8X" —
 *   les 3 seules variantes du format.
 * - JPEG : l'octet de marqueur qui suit `FF D8 FF` doit être 0x01 ou dans
 *   [0xC0, 0xFE] — les seules valeurs de marqueur JPEG définies par la spec.
 *
 * Formats VOLONTAIREMENT laissés au magic number nu — dit explicitement
 * plutôt que survendu :
 * - Trame MPEG sans tag (MP3 sans ID3 / AAC brut ADTS, 2 octets) :
 *   départager les deux formats sans ambiguïté (leurs 2e/3e octets ont une
 *   sémantique différente) exigerait de décoder une trame complète — c'est
 *   la frontière du « parser un conteneur » que ce module refuse
 *   d'franchir. Aucun client Meeshy ne produit ce format en pratique (web =
 *   WebM/MP4/Ogg, iOS = M4A/MP4/ftyp — cf. round 1) ; il reste accepté par
 *   `isAudioMimeType` et donc reconnu ici, sans renfort au-delà du magic.
 * - GIF (6 octets, déjà la signature officielle complète) : la structure
 *   suivante (Logical Screen Descriptor) n'impose aucune valeur fixe
 *   exploitable — une tentative de vérifier « largeur/hauteur > 0 » a été
 *   essayée puis écartée : plus de 99,99 % des octets arbitraires
 *   satisfont cette contrainte, ce qui aurait donné une fausse impression
 *   de renfort sans bénéfice réel.
 *
 * Ne PAS confondre avec `getAttachmentType` (packages/shared/types/attachment) :
 * cette fonction classe par DÉCLARATION (mimeType/extension) pour le pipeline
 * de traitement (thumbnails, limites de taille…) une fois le fichier admis.
 * Les fonctions ci-dessous vérifient les OCTETS pour décider si une
 * déclaration mérite d'être crue — rôles différents, ne pas fusionner.
 */

/**
 * Nombre d'octets de tête suffisant pour évaluer TOUTES les signatures
 * ci-dessous (la plus profonde lit jusqu'à l'octet 16, plus la fenêtre de
 * recherche du DocType EBML jusqu'à 64). Un appelant qui ne peut pas garder
 * le fichier entier en mémoire (upload resumable, gros fichiers) peut lire
 * uniquement ce préfixe depuis le disque.
 */
export const RECOMMENDED_SIGNATURE_PREFIX_BYTES = 64;

function startsWithBytes(buffer: Buffer, bytes: readonly number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function startsWithAscii(buffer: Buffer, ascii: string, offset = 0): boolean {
  if (buffer.length < offset + ascii.length) return false;
  return buffer.toString('latin1', offset, offset + ascii.length) === ascii;
}

function isPrintableAscii(buffer: Buffer, offset: number, length: number): boolean {
  if (buffer.length < offset + length) return false;
  for (let i = offset; i < offset + length; i++) {
    if (buffer[i] < 0x20 || buffer[i] > 0x7e) return false;
  }
  return true;
}

// ─── Audio ──────────────────────────────────────────────────────────────────

const WEBM_DOCTYPE_SEARCH_WINDOW = RECOMMENDED_SIGNATURE_PREFIX_BYTES;

/** DocType "webm" doit apparaître près de la tête — cf. docstring du module. */
function hasEbmlWebmDocType(buffer: Buffer): boolean {
  const idx = buffer.indexOf('webm', 4, 'latin1');
  return idx !== -1 && idx < WEBM_DOCTYPE_SEARCH_WINDOW;
}

/** Taille de box plausible + major_brand en ASCII imprimable — cf. docstring. */
function isPlausibleFtypBox(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  const boxSize = buffer.readUInt32BE(0);
  if (boxSize < 16 || boxSize > 4096) return false; // une box `ftyp` réelle fait quelques dizaines d'octets
  return isPrintableAscii(buffer, 8, 4); // major_brand : "M4A ", "isom", "mp42"...
}

/** `stream_structure_version` (0) et bits réservés de `header_type_flag` — RFC 3533. */
function isPlausibleOggPage(buffer: Buffer): boolean {
  if (buffer.length < 6) return false;
  const version = buffer[4];
  const headerTypeFlag = buffer[5];
  return version === 0x00 && (headerTypeFlag & 0xf8) === 0x00;
}

/** Le sous-chunk qui suit "WAVE" est toujours "fmt " en tête d'un RIFF/WAVE valide. */
function isPlausibleWavHeader(buffer: Buffer): boolean {
  return startsWithAscii(buffer, 'WAVE', 8) && startsWithAscii(buffer, 'fmt ', 12);
}

/** Version majeure ID3v2 (2-4) + taille encodée en syncsafe — spec ID3v2. */
function isPlausibleId3Tag(buffer: Buffer): boolean {
  if (buffer.length < 10) return false;
  const majorVersion = buffer[3];
  if (majorVersion < 2 || majorVersion > 4) return false;
  return buffer[6] < 0x80 && buffer[7] < 0x80 && buffer[8] < 0x80 && buffer[9] < 0x80;
}

/**
 * Conteneurs audio réellement produits par les clients Meeshy pour un
 * message vocal, établis à partir du code (pas d'une liste générique) :
 *
 * - Web `MediaRecorder` (`apps/web/components/v2/AudioPostComposer.tsx`,
 *   `apps/web/hooks/use-voice-recording.ts`, `AudioRecorderCard.tsx`,
 *   `AudioRecorderWithEffects.tsx`) : essaie `audio/mp4`, `audio/webm`
 *   (`;codecs=opus` ou générique), `audio/ogg` (`;codecs=opus` ou générique),
 *   dans cet ordre selon `MediaRecorder.isTypeSupported` — donc en pratique
 *   WebM/EBML (Chrome, Firefox, Edge, Brave) ou MP4/ftyp (Safari), Ogg en
 *   repli.
 * - iOS `AVAudioRecorder` (`AudioRecordingProviding.swift`, codec `.aac` par
 *   défaut — le seul actif en production) : conteneur M4A, soit MP4/ftyp
 *   également, labellisé `audio/mp4`.
 *
 * Ajoutés en complément car déjà acceptés par `isAudioMimeType`
 * (`packages/shared/types/attachment.ts` → `ACCEPTED_MIME_TYPES.AUDIO`) et
 * identifiables par signature, pour ne pas régresser un vocal légitime dans
 * ce format : WAV (RIFF/WAVE/fmt ), MP3 (tag ID3v2 ou frame sync MPEG — la
 * plupart des encodeurs n'apposent pas systématiquement de tag), AAC
 * brut/ADTS.
 *
 * ⚠️ RÉSERVE — codec Opus iOS (`AudioCodec.opus`, conteneur CAF, MIME
 * `audio/opus`) : dormant, non activé en production (cf. commentaire de
 * `AudioRecordingProviding.swift` — « Until then the default stays .aac »)
 * et absent de `isAudioMimeType`. Aucune signature CAF n'est donc fournie
 * ici : ce format n'atteint pas ce chemin aujourd'hui, et `isAudioMimeType`
 * le rejetterait de toute façon en amont. À couvrir si/quand ce codec
 * s'active.
 */
export function matchesAudioSignature(buffer: Buffer): boolean {
  if (startsWithBytes(buffer, [0x1a, 0x45, 0xdf, 0xa3]) && hasEbmlWebmDocType(buffer)) return true; // WebM/Matroska (EBML)
  if (startsWithAscii(buffer, 'ftyp', 4) && isPlausibleFtypBox(buffer)) return true; // MP4/M4A (ISO base media — ftyp box)
  if (startsWithAscii(buffer, 'OggS') && isPlausibleOggPage(buffer)) return true; // Ogg
  if (startsWithAscii(buffer, 'RIFF') && isPlausibleWavHeader(buffer)) return true; // WAV
  if (startsWithAscii(buffer, 'ID3') && isPlausibleId3Tag(buffer)) return true; // MP3 (tag ID3v2)
  // MP3 sans tag ID3 / AAC brut (ADTS) : sync word 12 bits (0xFFE-0xFFF) en
  // tête de trame — 1er octet 0xFF, 3 bits de poids fort du 2e à 1. NON
  // renforcé au-delà du magic — voir « Formats volontairement laissés au
  // magic number nu » dans la docstring du module.
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return true;
  return false;
}

// ─── Image ──────────────────────────────────────────────────────────────────

/** Marqueur JPEG valide : 0x01 ou [0xC0, 0xFE] — seules valeurs définies par la spec. */
function isPlausibleJpegMarker(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  const marker = buffer[3];
  return marker === 0x01 || (marker >= 0xc0 && marker <= 0xfe);
}

/** Le chunk qui suit la signature PNG est TOUJOURS IHDR, longueur EXACTEMENT 13 — spec PNG. */
function isPlausiblePngIhdr(buffer: Buffer): boolean {
  if (buffer.length < 16) return false;
  const length = buffer.readUInt32BE(8);
  return length === 13 && startsWithAscii(buffer, 'IHDR', 12);
}

/** FourCC qui suit "WEBP" : une des 3 seules variantes du format. */
function isPlausibleWebpFourCc(buffer: Buffer): boolean {
  if (buffer.length < 16) return false;
  const fourCc = buffer.toString('latin1', 12, 16);
  return fourCc === 'VP8 ' || fourCc === 'VP8L' || fourCc === 'VP8X';
}

/**
 * Signatures des formats acceptés par `isImageMimeType`
 * (`ACCEPTED_MIME_TYPES.IMAGE` : jpeg/jpg, png, gif, webp).
 *
 * GIF : NON renforcé au-delà de sa signature officielle (6 octets) — voir
 * « Formats volontairement laissés au magic number nu » dans la docstring
 * du module.
 */
export function matchesImageSignature(buffer: Buffer): boolean {
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff]) && isPlausibleJpegMarker(buffer)) return true; // JPEG
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) && isPlausiblePngIhdr(buffer)) return true; // PNG
  if (startsWithAscii(buffer, 'GIF87a') || startsWithAscii(buffer, 'GIF89a')) return true; // GIF
  if (startsWithAscii(buffer, 'RIFF') && startsWithAscii(buffer, 'WEBP', 8) && isPlausibleWebpFourCc(buffer)) return true; // WEBP
  return false;
}

// ─── Décision d'autorisation anonyme ───────────────────────────────────────

export type ShareLinkAnonymousFlags = {
  readonly allowAnonymousFiles: boolean;
  readonly allowAnonymousImages: boolean;
};

export type AnonymousAttachmentVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

/**
 * Décision UNIQUE de classification/autorisation anonyme, partagée par
 * `routes/attachments/upload.ts` (REST, fichier entier en mémoire) et
 * `routes/uploads/tus-handler.ts` (resumable, préfixe lu depuis le disque) —
 * pour que les deux chemins d'upload ne puissent pas diverger (task-1-fix-
 * round-2, Critical 1).
 *
 * Normalise la casse du `mimeType` déclaré : `IMAGE/PNG` sur une vraie image
 * doit rester classée « image », pas basculer dans le seau « fichier » plus
 * permissif faute d'un `.toLowerCase()` (task-1-fix-round-2, Important).
 */
export function classifyAnonymousAttachment(
  declaredMimeType: string,
  buffer: Buffer,
  shareLink: ShareLinkAnonymousFlags
): AnonymousAttachmentVerdict {
  const normalizedMimeType = declaredMimeType.toLowerCase();
  const declaresImage = normalizedMimeType.startsWith('image/');
  const declaresAudio = normalizedMimeType.startsWith('audio/');

  // La classification se MÉRITE par les octets (dans les limites décrites en
  // tête de ce module), jamais par la seule déclaration du client.
  const isAudio = declaresAudio && matchesAudioSignature(buffer);
  const isImage = !isAudio && declaresImage && matchesImageSignature(buffer);

  // Décision produit : la voix suit le droit d'écrire dans la conversation,
  // pas le droit d'envoyer des fichiers — un message vocal n'est jamais
  // soumis à `allowAnonymousFiles` ni à `allowAnonymousImages`.
  if (isAudio) return { allowed: true };

  if (isImage && !shareLink.allowAnonymousImages) {
    return { allowed: false, reason: 'Images are not allowed for anonymous users on this conversation' };
  }

  if (!isImage && !shareLink.allowAnonymousFiles) {
    return { allowed: false, reason: 'File uploads are not allowed for anonymous users on this conversation' };
  }

  return { allowed: true };
}
