/**
 * **LE MIROIR D'UNE CAMÉRA** (#8696) — une seule loi pour tous les sites qui
 * montrent, envoient ou capturent une caméra (appel, studio de story) :
 *
 * - l'APERÇU de la caméra avant est un miroir, comme une glace ;
 * - la caméra arrière n'est jamais retournée ;
 * - ce qui PART (le flux d'appel) et ce qui se CAPTURE (photo, montage,
 *   film) est l'image vraie — celle que l'autre voit, texte lisible ;
 * - un écran partagé n'est jamais retourné.
 *
 * Le miroir suit la caméra ACTIVE : il se lit à chaque rendu depuis `facing`,
 * jamais retenu d'une caméra à l'autre.
 */

export type CameraFacing = 'user' | 'environment';

export type CameraRole = 'preview' | 'sent' | 'capture';

type MirrorInput = { readonly facing: CameraFacing; readonly role: CameraRole; readonly screen?: boolean };

export const cameraMirrored = ({ facing, role, screen = false }: MirrorInput): boolean => role === 'preview' && facing === 'user' && !screen;
