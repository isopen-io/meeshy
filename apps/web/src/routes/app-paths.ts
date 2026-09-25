import { compile, match } from '@/lib/router';
import { ROUTES } from '@/routes/route-table';

/**
 * LES CHEMINS QUE L'APP SERT (#7849) — compilés UNE fois : un lien Meeshy
 * dont le chemin n'est pas ici reste un lien sortant, qu'il soit touché dans
 * un message (`rich-text.tsx`) ou reçu par la coque (`shell-deep-links.ts`).
 */
const APP_PATTERNS = Object.values(ROUTES).map((route) => compile(route.pattern));

export const isAppPath = (path: string): boolean => APP_PATTERNS.some((pattern) => match(pattern, path) !== null);
