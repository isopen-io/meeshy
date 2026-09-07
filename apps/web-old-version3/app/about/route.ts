import { gestionnaireDe } from '@/app/institutionnel/document';

import { PAGE_A_PROPOS } from './contenu';

/** `/about` — « À propos ». Le modèle et le gestionnaire vivent dans
 *  `app/institutionnel/document.ts` ; cette route ne fait que les JOINDRE. */
export const GET = gestionnaireDe(PAGE_A_PROPOS);
