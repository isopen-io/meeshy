import {
  planAttachmentPublication,
  postMediaFieldsFromAttachment,
  defaultVisibilityForPostType,
  type PublishableAttachment,
} from '../../../../services/posts/publishAttachment';

const makeAttachment = (overrides: Partial<PublishableAttachment> = {}): PublishableAttachment => ({
  id: '507f1f77bcf86cd799439047',
  messageId: '507f1f77bcf86cd799439041',
  mimeType: 'image/jpeg',
  fileUrl: 'https://gate.meeshy.me/api/v1/attachments/file/2026/08/u1/photo.jpg',
  thumbnailUrl: 'https://gate.meeshy.me/api/v1/attachments/file/2026/08/u1/thumb_photo.jpg',
  originalName: 'photo.jpg',
  width: 1200,
  height: 900,
  duration: null,
  codec: null,
  thumbHash: 'abc',
  ...overrides,
});

describe('planAttachmentPublication — le format découle du média', () => {
  it('une image devient un POST', () => {
    const result = planAttachmentPublication({
      attachment: makeAttachment(),
      callerIsMemberOfConversation: true,
      mediaIsProtected: false,
    });

    expect(result).toEqual({ ok: true, plan: { postType: 'POST', attachment: expect.anything() } });
  });

  it('une vidéo devient un REEL', () => {
    const result = planAttachmentPublication({
      attachment: makeAttachment({ mimeType: 'video/mp4' }),
      callerIsMemberOfConversation: true,
      mediaIsProtected: false,
    });

    expect(result.ok && result.plan.postType).toBe('REEL');
  });

  it('un son devient un REEL', () => {
    const result = planAttachmentPublication({
      attachment: makeAttachment({ mimeType: 'audio/mpeg' }),
      callerIsMemberOfConversation: true,
      mediaIsProtected: false,
    });

    expect(result.ok && result.plan.postType).toBe('REEL');
  });

  it('une STORY demandée explicitement est honorée, quel que soit le média', () => {
    const image = planAttachmentPublication({
      attachment: makeAttachment(),
      callerIsMemberOfConversation: true,
      mediaIsProtected: false,
      target: 'STORY',
    });
    const video = planAttachmentPublication({
      attachment: makeAttachment({ mimeType: 'video/mp4' }),
      callerIsMemberOfConversation: true,
      mediaIsProtected: false,
      target: 'STORY',
    });

    expect(image.ok && image.plan.postType).toBe('STORY');
    expect(video.ok && video.plan.postType).toBe('STORY');
  });

  it("un document est refusé — le fil ne sait pas le rendre", () => {
    const result = planAttachmentPublication({
      attachment: makeAttachment({ mimeType: 'application/pdf' }),
      callerIsMemberOfConversation: true,
      mediaIsProtected: false,
    });

    expect(result).toEqual({ ok: false, reason: 'unpublishable-media' });
  });
});

describe('planAttachmentPublication — la porte', () => {
  it("refuse un non-membre de la conversation : publier serait exfiltrer", () => {
    const result = planAttachmentPublication({
      attachment: makeAttachment(),
      callerIsMemberOfConversation: false,
      mediaIsProtected: false,
    });

    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it("vérifie l'appartenance AVANT le type — sinon le refus renseigne un tiers sur la nature du média", () => {
    const result = planAttachmentPublication({
      attachment: makeAttachment({ mimeType: 'application/pdf' }),
      callerIsMemberOfConversation: false,
      mediaIsProtected: false,
    });

    // « interdit », jamais « ce PDF n'est pas publiable ».
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('refuse une pièce jointe introuvable', () => {
    const result = planAttachmentPublication({ attachment: null, callerIsMemberOfConversation: true, mediaIsProtected: false });

    expect(result).toEqual({ ok: false, reason: 'attachment-not-found' });
  });

  it("refuse une pièce jointe orpheline : sans message, aucune porte ne la garde", () => {
    const result = planAttachmentPublication({
      attachment: makeAttachment({ messageId: null }),
      callerIsMemberOfConversation: true,
      mediaIsProtected: false,
    });

    expect(result).toEqual({ ok: false, reason: 'attachment-not-in-a-message' });
  });
});

describe('planAttachmentPublication — un média protégé ne se publie jamais', () => {
  // La NATURE de la protection (vue unique / flou / éphémère / chiffré, au
  // niveau MESSAGE comme au niveau PIÈCE JOINTE) est tranchée par l'appelant
  // via `protectedPreview` + `maskedAttachment` (testés dans NotificationService
  // et dans le test de route). Le plan ne reçoit que le VERDICT booléen.
  it("refuse dès que l'appelant signale un média protégé", () => {
    const result = planAttachmentPublication({
      attachment: makeAttachment(),
      callerIsMemberOfConversation: true,
      mediaIsProtected: true,
    });

    expect(result).toEqual({ ok: false, reason: 'protected-media' });
  });

  it("un non-membre reçoit TOUJOURS 'forbidden' d'abord — le refus 'protected' divulguerait l'existence du média", () => {
    const result = planAttachmentPublication({
      // Protégé ET hors de la conversation : l'appartenance se juge AVANT la
      // protection, sinon le verdict renseigne un tiers sur la nature du média.
      attachment: makeAttachment(),
      callerIsMemberOfConversation: false,
      mediaIsProtected: true,
    });

    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });
});

describe('defaultVisibilityForPostType — une STORY par défaut reste entre amis', () => {
  it("une STORY tombe sur FRIENDS — jamais PUBLIC par défaut", () => {
    expect(defaultVisibilityForPostType('STORY')).toBe('FRIENDS');
  });

  it("tout autre type tombe sur PUBLIC", () => {
    expect(defaultVisibilityForPostType('POST')).toBe('PUBLIC');
    expect(defaultVisibilityForPostType('REEL')).toBe('PUBLIC');
    expect(defaultVisibilityForPostType('STATUS')).toBe('PUBLIC');
  });
});

describe('postMediaFieldsFromAttachment — la copie porte son propre emplacement', () => {
  const duplicated = {
    fileUrl: 'https://gate.meeshy.me/api/v1/attachments/file/2026/08/u2/copie.jpg',
    filePath: '2026/08/u2/copie.jpg',
    fileName: 'copie.jpg',
    fileSize: 4242,
    mimeType: 'image/jpeg',
  };

  it("prend l'URL et le chemin de la COPIE, jamais ceux de la source", () => {
    const fields = postMediaFieldsFromAttachment({
      attachment: makeAttachment(),
      duplicated,
      uploaderId: 'user-2',
    });

    expect(fields.fileUrl).toBe(duplicated.fileUrl);
    expect(fields.filePath).toBe(duplicated.filePath);
    // Le chemin de la source porte l'identifiant de son auteur : le reprendre
    // ferait de la suppression du post une suppression dans la conversation.
    expect(JSON.stringify(fields)).not.toContain('/u1/');
  });

  it('conserve la métadonnée qui décrit le CONTENU, pas son emplacement', () => {
    const fields = postMediaFieldsFromAttachment({
      attachment: makeAttachment({ duration: 4200, codec: 'h264' }),
      duplicated,
      uploaderId: 'user-2',
    });

    expect(fields.width).toBe(1200);
    expect(fields.height).toBe(900);
    expect(fields.duration).toBe(4200);
    expect(fields.codec).toBe('h264');
    expect(fields.thumbHash).toBe('abc');
    expect(fields.originalName).toBe('photo.jpg');
  });

  it("naît sans post : c'est la création du post qui l'y rattache", () => {
    const fields = postMediaFieldsFromAttachment({
      attachment: makeAttachment(),
      duplicated,
      uploaderId: 'user-2',
    });

    expect(fields.postId).toBeNull();
    expect(fields.uploaderId).toBe('user-2');
  });

  it("ne fabrique PAS de vignette quand la copie n'en a pas", () => {
    const fields = postMediaFieldsFromAttachment({
      attachment: makeAttachment(),
      duplicated,
      uploaderId: 'user-2',
    });

    expect(fields.thumbnailUrl).toBeNull();
  });
});
