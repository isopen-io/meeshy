/**
 * UN FRAGMENT DU CATALOGUE D’ADMINISTRATION (#8876) — le catalogue d’une
 * langue est la SOMME de fragments que chaque lot de section possède seul,
 * pour que dix lots travaillent en parallèle sans éditer le même fichier.
 *
 * Le fragment français est la SOURCE de ses clés (`as const`) ; chaque autre
 * langue le reprend par `satisfies AdminCatalogFragment<typeof fr>`, ce qui
 * rougit à la compilation sur une clé manquante ou en trop.
 */
export type AdminCatalogFragment<F> = Readonly<Record<keyof F, string>>;
