import { GESTE_SUR_UNE_LIGNE, LISTE_DES_CHATS } from '@/app/connecte/liste-porte';

/**
 * `/chats` — la liste des conversations du lecteur, et les trois gestes de
 * chaque ligne (§ 12.10.4). La porte vit dans `app/connecte/liste-porte.ts` ;
 * cette route ne fait que la JOINDRE.
 */
export const GET = LISTE_DES_CHATS;
export const POST = GESTE_SUR_UNE_LIGNE;
