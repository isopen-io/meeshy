import { APPLICATION, CHANGE_LE_THEME } from '@/app/connecte/reglages-porte';

/**
 * `/settings/application` — le thème de Meeshy sur cet appareil.
 *
 * LE SEUL ÉCRAN DES SIX QUI NE PARLE PAS À LA PASSERELLE : le thème n'a aucune
 * route de compte, il vit dans un cookie que le script de tête relit avant le
 * premier pixel (`app/theme-script.tsx`). `POST` pose ce cookie et redirige —
 * c'est ce qui donne au contrôle son effet sans une ligne de JavaScript de
 * page.
 */
export const GET = (requete: Request): Promise<Response> => APPLICATION(requete);
export const POST = (requete: Request): Promise<Response> => CHANGE_LE_THEME(requete);

export const dynamic = 'force-dynamic';
