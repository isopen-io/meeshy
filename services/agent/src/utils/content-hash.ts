import { createHash } from 'crypto';

export function contentHash(content: string): string {
  return createHash('sha256')
    .update(content.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    .digest('hex')
    .slice(0, 32);
}
