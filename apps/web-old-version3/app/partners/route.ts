import { gestionnaireDe } from '@/app/institutionnel/document';

import { PAGE_PARTENAIRES } from './contenu';

/** `/partners` — « Partenaires ». Le modèle et le gestionnaire vivent dans
 *  `app/institutionnel/document.ts` ; cette route ne fait que les JOINDRE. */
export const GET = gestionnaireDe(PAGE_PARTENAIRES);
