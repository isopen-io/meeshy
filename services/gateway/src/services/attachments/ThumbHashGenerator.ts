import sharp from 'sharp'
import { rgbaToThumbHash } from 'thumbhash'
import ffmpeg from 'fluent-ffmpeg'
import { PassThrough } from 'stream'
import { createLogger } from '../../utils/logger.js'

const logger = createLogger('thumbhash')

export class ThumbHashGenerator {
  /**
   * Generate ThumbHash for any visual attachment.
   * Returns base64-encoded hash string (~33 chars) or null if not visual.
   *
   * Frontend-first strategy: if the client already computed and sent a thumbHash,
   * this function is not called. This is the backend fallback for:
   * - Forwarded messages
   * - Link previews
   * - Bot/webhook uploads
   * - Backfill of existing attachments
   */
  static async generate(filePath: string, mimeType: string): Promise<string | null> {
    try {
      if (mimeType.startsWith('image/')) {
        return await this.fromImage(filePath)
      }
      if (mimeType.startsWith('video/')) {
        return await this.fromVideo(filePath)
      }
      if (mimeType === 'application/pdf') {
        return await this.fromPDF(filePath)
      }
      return null
    } catch (error) {
      logger.warn({ error, filePath, mimeType }, 'ThumbHash generation failed — skipping')
      return null
    }
  }

  /**
   * Image (JPEG, PNG, WebP, GIF first frame, HEIC, SVG)
   * ~6-15ms per image
   */
  private static async fromImage(filePath: string): Promise<string> {
    const { data, info } = await sharp(filePath, { animated: false })
      .resize(100, 100, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const hash = rgbaToThumbHash(info.width, info.height, new Uint8Array(data))
    return Buffer.from(hash).toString('base64')
  }

  /**
   * Video (MP4, MOV, WebM) — extract frame at 0.5s
   * ~50-200ms per video (ffmpeg frame extraction dominates)
   */
  private static async fromVideo(filePath: string): Promise<string> {
    const frameBuffer = await this.extractVideoFrame(filePath)
    const { data, info } = await sharp(frameBuffer)
      .resize(100, 100, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const hash = rgbaToThumbHash(info.width, info.height, new Uint8Array(data))
    return Buffer.from(hash).toString('base64')
  }

  /**
   * PDF — render page 1 as image
   * ~100-300ms (requires pdf2pic + ghostscript)
   */
  private static async fromPDF(filePath: string): Promise<string | null> {
    try {
      const { fromPath } = await import('pdf2pic')
      const converter = fromPath(filePath, {
        density: 72,
        format: 'png',
        width: 200,
        height: 200,
      })
      const result = await converter(1)
      if (!result.buffer) return null

      const { data, info } = await sharp(result.buffer)
        .resize(100, 100, { fit: 'inside' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })

      const hash = rgbaToThumbHash(info.width, info.height, new Uint8Array(data))
      return Buffer.from(hash).toString('base64')
    } catch {
      return null
    }
  }

  /**
   * Extract first frame from video using ffmpeg.
   * Seeks to 0.5s to skip potential black intro frames.
   * Falls back to frame 0 on error.
   */
  private static extractVideoFrame(videoPath: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      const stream = new PassThrough()

      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)

      ffmpeg(videoPath)
        .seekInput(0.5)
        .frames(1)
        .outputFormat('image2pipe')
        .outputOptions('-vcodec', 'png')
        .on('error', () => {
          // Fallback: try frame 0 if seek fails
          const fallback: Buffer[] = []
          const fallbackStream = new PassThrough()
          fallbackStream.on('data', (c: Buffer) => fallback.push(c))
          fallbackStream.on('end', () => resolve(Buffer.concat(fallback)))
          fallbackStream.on('error', reject)

          ffmpeg(videoPath)
            .seekInput(0)
            .frames(1)
            .outputFormat('image2pipe')
            .outputOptions('-vcodec', 'png')
            .pipe(fallbackStream, { end: true })
        })
        .pipe(stream, { end: true })
    })
  }
}
