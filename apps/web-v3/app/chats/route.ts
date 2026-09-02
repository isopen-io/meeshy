import { LISTE_DES_CHATS } from '@/app/connecte/porte';

/** `/chats` — la liste des conversations du lecteur. La porte vit dans
 *  `app/connecte/porte.ts` ; cette route ne fait que la JOINDRE. */
export const GET = LISTE_DES_CHATS;
