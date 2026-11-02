/**
 * #11327 — le crédit d'une lens voyage avec le MÉDIA, pas avec son premier
 * envoi : une pièce transférée ou diffusée garde la lens qui l'a produite.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { copiedAttachmentFields } from '../../../services/messaging/copiedAttachmentFields';

const source = { id: 'a1', fileName: 'p.jpg', originalName: 'p.jpg', mimeType: 'image/jpeg', fileSize: 10, filePath: 'x/p.jpg', fileUrl: '/f/p.jpg' };

describe('copiedAttachmentFields — la lens du média', () => {
  it('la copie garde la lens de sa source', () => {
    expect(copiedAttachmentFields({ ...source, lensSlug: 'aurore' }).lensSlug).toBe('aurore');
  });

  it('une source sans lens n’en fabrique pas', () => {
    expect(copiedAttachmentFields(source).lensSlug).toBeUndefined();
  });
});
