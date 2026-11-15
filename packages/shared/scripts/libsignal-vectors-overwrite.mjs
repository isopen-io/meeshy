/**
 * Garde du générateur de vecteurs libsignal (#17113) : un jeu d'une autre
 * version ne s'écrase que s'il est déjà rangé dans `legacy/`, que les trois
 * bancs rejouent encore (#9231).
 */
export const overwriteRefusal = ({ existingVersion, version, legacyExists }) => {
  if (existingVersion === undefined || existingVersion === version || legacyExists) return undefined;
  return (
    `le jeu courant porte libsignal ${existingVersion} et serait écrasé par ${version} : ` +
    `déplace-le d'abord dans fixtures/libsignal/legacy/${existingVersion}.vectors.json`
  );
};
