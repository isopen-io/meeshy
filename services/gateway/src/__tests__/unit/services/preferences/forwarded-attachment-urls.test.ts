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

  /**
   * Ce témoin exigeait `null` : « pas de racine dérivable ⇒ on RETIRE ».
   * Contrat CHANGÉ le 2026-08-31, et le retrait n'a jamais été ce qui
   * protégeait. Ce qui protège est la FORME PAR IDENTIFIANT, qui ne porte
   * aucun chemin donc aucune identité — quelle que soit la forme dont on part.
   * Retirer coûtait un média invisible pour rien ; c'est devenu le cas NOMINAL
   * depuis que la base stocke la clé nue (volet A de #4324).
   */
  it("sert par IDENTIFIANT quand l'URL stockée n'expose aucune racine", () => {
    const redacted = redactForwardedAttachmentUrls(
      forwardedCopy({ fileUrl: `/relatif/2026/08/${ORIGIN_USER_ID}/x.jpg`, thumbnailUrl: null }),
    );

    expect(redacted.fileUrl).toBe(`/api/v1/attachments/${ATTACHMENT_ID}`);
    expect(JSON.stringify(redacted)).not.toContain(ORIGIN_USER_ID);
  });

  it('applique la règle à toute la liste, et laisse une liste absente absente', () => {
    const list = redactForwardedAttachmentUrlsIn([forwardedCopy()]);

    expect(JSON.stringify(list)).not.toContain(ORIGIN_USER_ID);
    expect(redactForwardedAttachmentUrlsIn(null)).toBeNull();
    expect(redactForwardedAttachmentUrlsIn(undefined)).toBeUndefined();
  });
});

/**
 * **La clé nue est la forme que la base écrit depuis le volet A de #4324.**
 *
 * `originOf` dérivait la racine publique de l'URL STOCKÉE. Depuis `eca0684ae9`,
 * ce qui est stocké est la CLÉ (`2026/08/<User.id>/photo.png`) : plus d'hôte,
 * plus de route, donc plus de racine à dériver. `base` retombait à `null` et la
 * pièce jointe transférée partait SANS AUCUNE adresse — pas une fuite (le sens
 * est le bon), mais un média invisible.
 *
 * La réécriture n'a plus besoin de racine : le client compose (décision porteur
 * du 2026-08-31, « c'est lui qui décide quelle API attaquer »), et les trois
 * résolveurs préfixent déjà un chemin à barre initiale par leur origine.
 */
describe('réécriture par identifiant — sur la clé nue que la base stocke (#4324)', () => {
  const transfere = {
    id: 'att-1',
    isForwarded: true,
    forwardedFromAttachmentId: 'att-source',
    fileUrl: '2026/08/64f0aa11bb22cc33dd44ee55/photo.png',
    thumbnailUrl: '2026/08/64f0aa11bb22cc33dd44ee55/photo.thumb.png',
  };

  it('sert une adresse par identifiant, au lieu de tout retirer', () => {
    const sorti = redactForwardedAttachmentUrls(transfere);

    expect(sorti.fileUrl).toBe('/api/v1/attachments/att-1');
    expect(sorti.thumbnailUrl).toBe('/api/v1/attachments/att-1/thumbnail');
  });

  it('ne laisse AUCUN identifiant d’auteur dans ce qui sort — la raison d’être', () => {
    const sorti = redactForwardedAttachmentUrls(transfere);

    expect(sorti.fileUrl).not.toContain('64f0aa11bb22cc33dd44ee55');
    expect(sorti.thumbnailUrl).not.toContain('64f0aa11bb22cc33dd44ee55');
  });

  /**
   * Contre-épreuve — le correctif ne déborde pas sur la forme HÉRITÉE.
   *
   * Une URL stockée qui porte un hôte le GARDE : c'est le contrat existant
   * (« l'adresse réécrite reste exactement sur l'hôte qui servait l'originale,
   * y compris derrière un proxy »), et il n'y a aucune raison de le rouvrir
   * pour réparer une population qui n'a pas d'hôte du tout.
   */
  it('la forme HÉRITÉE, avec hôte et route, garde son hôte', () => {
    const sorti = redactForwardedAttachmentUrls({
      ...transfere,
      fileUrl: 'https://gate.meeshy.me/api/v1/attachments/file/2026/01/aaa/p.png',
      thumbnailUrl: null,
    });

    expect(sorti.fileUrl).toBe('https://gate.meeshy.me/api/v1/attachments/att-1');
  });

  it('sans identifiant, rien n’est fabriqué — taire vaut mieux que fuir', () => {
    const sorti = redactForwardedAttachmentUrls({ ...transfere, id: null });

    expect(sorti.fileUrl).toBeNull();
    expect(sorti.thumbnailUrl).toBeNull();
  });
});
