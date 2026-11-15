/**
 * **UN MÉDIA DONT LES OCTETS SONT SUR L'APPAREIL** (#15111) — la pièce d'un
 * envoi en attente pointe une URL `blob:`, recréée depuis le
 * fichier gardé après un rechargement (`outbox-durability.ts`). La lire ne coûte
 * aucun réseau : elle charge au moins ses métadonnées, pour que la bulle montre
 * la première image d'une vidéo et la durée d'une vidéo ou d'un audio, même
 * hors ligne et quelle que soit sa taille.
 */
const LOCAL_MEDIA_SRC = /^blob:/i;

export const isLocalMediaSrc = (src: string): boolean => LOCAL_MEDIA_SRC.test(src);

/** `metadata` pour une source locale ; la règle du fil ailleurs. */
export const localAwarePreload = <P extends string>(src: string, remote: P): P | 'metadata' =>
  isLocalMediaSrc(src) ? 'metadata' : remote;

/**
 * WebKit ne peint aucune image d'une vidéo sans affiche tant qu'on ne la lit
 * pas ; un fragment temporel le fait se placer sur la première. Seule une source
 * locale le reçoit : une adresse servie garde son affiche (`thumbnailUrl`).
 */
export const firstFrameSrc = (src: string): string =>
  isLocalMediaSrc(src) && !src.includes('#') ? `${src}#t=0.001` : src;
