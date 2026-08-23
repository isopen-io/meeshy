import {
  redactForwardedAttachmentUrls,
  redactForwardedAttachmentUrlsIn,
} from '../../../../services/preferences/forwarded-attachment-urls';

const ORIGIN_USER_ID = '507f1f77bcf86cd799439045';
const ATTACHMENT_ID = '507f1f77bcf86cd799439047';
const BASE = 'https://gate.meeshy.me';

const forwardedCopy = (overrides: Record<string, unknown> = {}) => ({
  id: ATTACHMENT_ID,
  isForwarded: true,
  forwardedFromAttachmentId: '507f1f77bcf86cd799439046',
  fileUrl: `${BASE}/api/v1/attachments/file/2026/08/${ORIGIN_USER_ID}/photo_9f2c.jpg`,
  thumbnailUrl: `${BASE}/api/v1/attachments/file/2026/08/${ORIGIN_USER_ID}/thumb_photo_9f2c.jpg`,
  ...overrides,
});

describe("redactForwardedAttachmentUrls — l'identité ne sort pas par le chemin", () => {
  it("remplace le chemin d'une copie de transfert par une adresse par identifiant", () => {
    const redacted = redactForwardedAttachmentUrls(forwardedCopy());

    expect(redacted.fileUrl).toBe(`${BASE}/api/v1/attachments/${ATTACHMENT_ID}`);
    expect(redacted.thumbnailUrl).toBe(`${BASE}/api/v1/attachments/${ATTACHMENT_ID}/thumbnail`);
  });

  it("ne laisse l'identifiant de l'auteur d'origine dans AUCUN champ", () => {
    const redacted = redactForwardedAttachmentUrls(forwardedCopy());

    expect(JSON.stringify(redacted)).not.toContain(ORIGIN_USER_ID);
  });

  it('conserve la racine publique portée par l’URL stockée, jamais celle de l’environnement', () => {
    const redacted = redactForwardedAttachmentUrls(
      forwardedCopy({
        fileUrl: `https://autre-hote.example/api/v1/attachments/file/2026/08/${ORIGIN_USER_ID}/x.jpg`,
        thumbnailUrl: null,
      }),
    );

    expect(redacted.fileUrl).toBe(`https://autre-hote.example/api/v1/attachments/${ATTACHMENT_ID}`);
  });

  it("laisse une vignette absente absente — ne fabrique pas d'adresse", () => {
    const redacted = redactForwardedAttachmentUrls(forwardedCopy({ thumbnailUrl: null }));

    expect(redacted.thumbnailUrl).toBeNull();
  });

  it("ne touche PAS une pièce jointe ordinaire : son chemin est celui de l'expéditeur déjà nommé", () => {
    const ordinary = {
      id: ATTACHMENT_ID,
      isForwarded: false,
      forwardedFromAttachmentId: null,
      fileUrl: `${BASE}/api/v1/attachments/file/2026/08/507f1f77bcf86cd799439022/x.jpg`,
      thumbnailUrl: null,
    };

    expect(redactForwardedAttachmentUrls(ordinary)).toBe(ordinary);
  });

  it("reconnaît la copie par `forwardedFromAttachmentId` seul, sans le drapeau", () => {
    const redacted = redactForwardedAttachmentUrls(forwardedCopy({ isForwarded: false }));

    expect(redacted.fileUrl).toBe(`${BASE}/api/v1/attachments/${ATTACHMENT_ID}`);
  });

  it("RETIRE plutôt que de servir en clair quand l'adresse ne peut pas être refabriquée", () => {
    const redacted = redactForwardedAttachmentUrls(forwardedCopy({ id: null }));

    expect(redacted.fileUrl).toBeNull();
    expect(redacted.thumbnailUrl).toBeNull();
    expect(JSON.stringify(redacted)).not.toContain(ORIGIN_USER_ID);
  });

  it("RETIRE aussi quand l'URL stockée n'a pas la forme d'un chemin de fichier servi", () => {
    const redacted = redactForwardedAttachmentUrls(
      forwardedCopy({ fileUrl: `/relatif/2026/08/${ORIGIN_USER_ID}/x.jpg`, thumbnailUrl: null }),
    );

    expect(redacted.fileUrl).toBeNull();
  });

  it('applique la règle à toute la liste, et laisse une liste absente absente', () => {
    const list = redactForwardedAttachmentUrlsIn([forwardedCopy()]);

    expect(JSON.stringify(list)).not.toContain(ORIGIN_USER_ID);
    expect(redactForwardedAttachmentUrlsIn(null)).toBeNull();
    expect(redactForwardedAttachmentUrlsIn(undefined)).toBeUndefined();
  });
});
