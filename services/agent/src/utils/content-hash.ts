import { createHash } from 'crypto';

export function contentHash(content: string): string {
  return createHash('sha256')
    .update(content.toLowerCase().trim())
    .digest('hex')
    .slice(0, 16);
}
