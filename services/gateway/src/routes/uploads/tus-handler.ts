import { Server } from '@tus/server';
import { FileStore } from '@tus/file-store';
import type { FastifyInstance } from 'fastify';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  getAttachmentType,
  getSizeLimit,
  UPLOAD_LIMITS,
} from '@meeshy/shared/types/attachment';
import { MetadataManager } from '../../services/attachments/MetadataManager';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'TusHandler' });

const UPLOAD_PATH = process.env.UPLOAD_PATH || '/app/uploads';
const TUS_TEMP_PATH = path.join(UPLOAD_PATH, '.tus-resumable');

function getMaxFileSize(): number {
  return Math.max(...Object.values(UPLOAD_LIMITS));
}

function buildPublicUrl(): string {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    const domain = process.env.DOMAIN || 'meeshy.me';
    return `https://gate.${domain}`;
  }
  return process.env.BACKEND_URL || `http://localhost:${process.env.PORT || '3000'}`;
}

export async function registerTusRoutes(fastify: FastifyInstance): Promise<void> {
  const prisma = fastify.prisma;
  if (!prisma) {
    throw new Error('[TUS] Prisma client not available');
  }

  await fs.mkdir(TUS_TEMP_PATH, { recursive: true });

  const metadataManager = new MetadataManager(UPLOAD_PATH);
  const publicUrl = buildPublicUrl();

  const tusServer = new Server({
    path: '/api/v1/uploads',
    datastore: new FileStore({ directory: TUS_TEMP_PATH }),
    maxSize: getMaxFileSize(),
    respectForwardedHeaders: true,
    async onUploadCreate(req, upload) {
      const headers = req.headers as any;
      const authHeader = headers?.get?.('authorization') ?? headers?.authorization;
      const sessionToken = headers?.get?.('x-session-token') ?? headers?.['x-session-token'];

      if (!authHeader && !sessionToken) {
        throw { status_code: 401, body: 'Authentication required\n' };
      }

      const mimeType = upload.metadata?.filetype || 'application/octet-stream';
      const attachmentType = getAttachmentType(mimeType, upload.metadata?.filename ?? undefined);
      const sizeLimit = getSizeLimit(attachmentType);

      if (upload.size && upload.size > sizeLimit) {
        throw {
          status_code: 413,
          body: `File too large. Max size for ${attachmentType}: ${(sizeLimit / (1024 * 1024 * 1024)).toFixed(1)} GB\n`,
        };
      }

      return {
        metadata: {
          ...upload.metadata,
          uploadedAt: new Date().toISOString(),
        },
      };
    },
    async onUploadFinish(_req, upload) {
      const filename = upload.metadata?.filename || 'unknown';
      const mimeType = upload.metadata?.filetype || 'application/octet-stream';
      const userId = upload.metadata?.userId || 'anonymous';
      const isAnonymous = upload.metadata?.isAnonymous === 'true';

      const now = new Date();
      const year = now.getFullYear().toString();
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const destDir = path.join(UPLOAD_PATH, year, month, userId);
      await fs.mkdir(destDir, { recursive: true });

      const ext = path.extname(filename);
      const baseName = path.basename(filename, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      const storedName = `${baseName}_${uuidv4()}${ext}`;
      const destPath = path.join(destDir, storedName);

      const sourcePath = upload.storage?.path
        ? upload.storage.path
        : path.join(TUS_TEMP_PATH, upload.id);

      try {
        await fs.rename(sourcePath, destPath);
      } catch {
        await fs.copyFile(sourcePath, destPath);
        await fs.unlink(sourcePath).catch(() => {});
      }

      const fileSize = upload.size || 0;
      const relPath = path.join(year, month, userId, storedName);
      const fileUrl = `${publicUrl}/api/v1/attachments/file/${relPath}`;

      const attachmentType = getAttachmentType(mimeType, filename);
      let metadata: Record<string, any> = {};
      try {
        metadata = await metadataManager.extractMetadata(
          relPath,
          attachmentType,
          mimeType,
          undefined,
          fileSize
        );
      } catch (err) {
        logger.warn('[TUS] Metadata extraction failed:', err);
      }

      let thumbnailUrl: string | undefined;
      let thumbnailRelPath: string | undefined;
      try {
        if (attachmentType === 'image') {
          thumbnailRelPath = await metadataManager.generateThumbnail(relPath) ?? undefined;
        } else if (attachmentType === 'video') {
          thumbnailRelPath = await metadataManager.generateVideoThumbnail(relPath) ?? undefined;
        }
        if (thumbnailRelPath) {
          thumbnailUrl = `${publicUrl}/api/v1/attachments/file/${thumbnailRelPath}`;
        }
      } catch (err) {
        logger.warn('[TUS] Thumbnail generation failed:', err);
      }

      const attachment = await prisma.messageAttachment.create({
        data: {
          fileName: storedName,
          originalName: filename,
          mimeType,
          fileSize,
          filePath: relPath,
          fileUrl,
          thumbnailPath: thumbnailRelPath || null,
          thumbnailUrl: thumbnailUrl || null,
          width: metadata.width || null,
          height: metadata.height || null,
          duration: metadata.duration || null,
          bitrate: metadata.bitrate || null,
          sampleRate: metadata.sampleRate || null,
          codec: metadata.codec || null,
          channels: metadata.channels || null,
          fps: metadata.fps || null,
          videoCodec: metadata.videoCodec || null,
          pageCount: metadata.pageCount || null,
          lineCount: metadata.lineCount || null,
          uploadedBy: userId,
          isAnonymous,
        },
      });

      logger.info(`[TUS] Upload complete: ${storedName} (${fileSize} bytes)`);

      return {
        status_code: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          data: {
            attachment: {
              id: attachment.id,
              fileName: storedName,
              originalName: filename,
              mimeType,
              fileSize,
              fileUrl,
              thumbnailUrl,
              width: metadata.width,
              height: metadata.height,
              duration: metadata.duration,
              bitrate: metadata.bitrate,
              sampleRate: metadata.sampleRate,
              codec: metadata.codec,
              channels: metadata.channels,
            },
          },
        }),
      };
    },
  });

  fastify.addContentTypeParser(
    'application/offset+octet-stream',
    (_request: any, _payload: any, done: (err: null) => void) => done(null)
  );

  fastify.all('/api/v1/uploads', (req, reply) => {
    tusServer.handle(req.raw, reply.raw);
  });

  fastify.all('/api/v1/uploads/*', (req, reply) => {
    tusServer.handle(req.raw, reply.raw);
  });

  logger.info('[TUS] Resumable upload routes registered at /api/v1/uploads/*');
}
