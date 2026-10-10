type PhotoDevelopModule = Pick<typeof import('@/lib/media/photo-develop'), 'developPhotoFile'>;

/**
 * Ce qui revient de l'appareil photo passe par le développement unique des
 * photos (#8695), chargé au premier retour. Chunk injoignable : la photo part
 * originale, jamais perdue.
 */
export const developShots = (shots: readonly File[], load: () => Promise<PhotoDevelopModule> = () => import('@/lib/media/photo-develop')): Promise<readonly File[]> =>
  load().then(
    ({ developPhotoFile }) => Promise.all(shots.map((shot) => developPhotoFile(shot))),
    () => shots,
  );
