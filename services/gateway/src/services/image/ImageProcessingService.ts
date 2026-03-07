import sharp from 'sharp';

const AVATAR_SIZE = 512;
const BANNER_WIDTH = 1200;
const BANNER_HEIGHT = 400;
const JPEG_QUALITY = 80;

export async function processAvatar(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
    .jpeg({ quality: JPEG_QUALITY, progressive: true })
    .toBuffer();
}

export async function processBanner(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(BANNER_WIDTH, BANNER_HEIGHT, { fit: 'cover' })
    .jpeg({ quality: JPEG_QUALITY, progressive: true })
    .toBuffer();
}
