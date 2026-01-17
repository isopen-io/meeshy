/**
 * Utilitaires pour filtrer et organiser les attachments par type
 */

import { Attachment, getAttachmentType } from '@meeshy/shared/types/attachment';

export interface AttachmentsByType {
  images: Attachment[];
  videos: Attachment[];
  audios: Attachment[];
  pdfs: Attachment[];
  pptxs: Attachment[];
  markdowns: Attachment[];
  texts: Attachment[];
  others: Attachment[];
}

export function separateAttachmentsByType(attachments: Attachment[]): AttachmentsByType {
  const images: Attachment[] = [];
  const videos: Attachment[] = [];
  const audios: Attachment[] = [];
  const pdfs: Attachment[] = [];
  const pptxs: Attachment[] = [];
  const markdowns: Attachment[] = [];
  const texts: Attachment[] = [];
  const others: Attachment[] = [];

  for (const att of attachments) {
    const type = getAttachmentType(att.mimeType, att.originalName);

    if (type === 'image') {
      images.push(att);
    } else if (type === 'video') {
      videos.push(att);
    } else if (type === 'audio') {
      audios.push(att);
    } else if (att.mimeType === 'application/pdf') {
      pdfs.push(att);
    } else if (
      att.mimeType === 'application/vnd.ms-powerpoint' ||
      att.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      att.originalName.toLowerCase().endsWith('.ppt') ||
      att.originalName.toLowerCase().endsWith('.pptx')
    ) {
      pptxs.push(att);
    } else if (
      att.mimeType === 'text/markdown' ||
      att.mimeType === 'text/x-markdown' ||
      att.originalName.toLowerCase().endsWith('.md')
    ) {
      markdowns.push(att);
    } else if (
      (type === 'text' || type === 'code') &&
      att.mimeType !== 'text/markdown' &&
      att.mimeType !== 'text/x-markdown' &&
      !att.originalName.toLowerCase().endsWith('.md')
    ) {
      texts.push(att);
    } else {
      others.push(att);
    }
  }

  return { images, videos, audios, pdfs, pptxs, markdowns, texts, others };
}
