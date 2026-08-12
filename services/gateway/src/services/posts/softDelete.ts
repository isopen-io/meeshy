/**
 * Prédicat Prisma du soft-delete, source unique.
 *
 * `null` n'est PAS le marqueur d'un enregistrement vivant côté MongoDB : un
 * champ `DateTime?` non écrit est ABSENT du document, d'où `isSet: false`.
 *
 * Il vit dans son propre module, et non dans `postIncludes`, parce que
 * celui-ci construit ses `Prisma.validator` au chargement : le module d'ACL
 * (`postVisibility`) n'a besoin que de ce prédicat, et l'importer depuis
 * `postIncludes` faisait exécuter tout le reste — jusque dans les tests de
 * `NotificationService`, qui doublent le client Prisma et n'ont aucune raison
 * de connaître les formes d'include des posts.
 */
export const NOT_DELETED = { isSet: false } as const;
