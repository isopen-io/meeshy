/**
 * Apparie les chemins d'API ÉCRITS À LA MAIN dans un client aux routes que le
 * serveur sert réellement (#4588).
 *
 * ## Pourquoi cette règle existe, et ce qu'aucun test unitaire ne pouvait voir
 *
 * Le 2026-08-31, cinq chemins d'`AuthService.swift` rendaient **404** en
 * production — dont celui de la réinitialisation de mot de passe, avec trois
 * appelants. Six témoins les assertaient, et étaient verts :
 *
 *     XCTAssertEqual(mock.lastRequest?.endpoint, "/auth/password-reset/reset")
 *
 * Un témoin qui épingle un chemin ne peut vérifier qu'une chose : **que le
 * client est cohérent avec LUI-MÊME**. La comparaison avec ce que le serveur
 * SERT n'existait ni dans le code ni dans les tests. Aucune relecture ne
 * pouvait la faire ; seul l'appariement mécanique le pouvait.
 *
 * ## Ce que la comparaison doit tolérer, et pourquoi
 *
 * - **l'interpolation** : `"/conversations/\(id)/messages"` décrit la même
 *   adresse que `/api/v1/conversations/:conversationId/messages`. Les deux se
 *   réduisent à une forme où tout segment variable vaut `*`.
 * - **la chaîne de requête** : `"/links?offset=\(o)"` est le chemin `/links`.
 *   Sans ce retrait, six littéraux parfaitement valides seraient dénoncés — la
 *   première écriture de cet audit l'a fait.
 * - **le préfixe absent** : les sites d'appel écrivent un SUFFIXE
 *   (`/auth/login`), le manifeste un chemin complet. Un littéral déjà préfixé
 *   (`/api/…`) passe inchangé — c'est le cas des quatorze routes hors `/api/v1`.
 *
 * ## Ce que l'audit ne peut PAS vérifier, et pourquoi c'est assumé
 *
 * Un segment INTERPOLÉ est un joker : `"/me/preferences/\(category.rawValue)"`
 * apparie n'importe quelle route de même forme, parce que rien ici ne connaît
 * les valeurs que prend l'énumération. Le serveur sert une route par catégorie
 * (`/me/preferences/audio`, `…/video`, sept en tout) et non un `:param` ; les
 * sept sont bien servies, mais l'audit ne le SAIT pas — il ne peut que ne pas
 * accuser à tort.
 *
 * Le durcir avec une liste d'exemptions serait pire : une liste se périme au
 * premier site ajouté, en silence. Ce qui ferme vraiment ce trou est la
 * migration #4282 — `AuthEndpoint.verifyPhone` ne porte aucun joker, donc rien
 * à tolérer. **Cet audit couvre la période où des chemins restent écrits à la
 * main ; il rétrécit à mesure qu'elle finit.**
 *
 * Les cinq défauts de #4588 vivaient tous dans des segments LITTÉRAUX, qui
 * restent vérifiés en entier.
 */

/** Réduit un chemin à sa forme comparable : sans requête, segments variables neutralisés. */
export function canonicalPath(path: string): string {
  const withoutQuery = path.split('?')[0] ?? '';
  return withoutQuery
    .split('/')
    .map((segment) => (segment.startsWith(':') || segment === '*' ? '*' : segment))
    .join('/');
}

/** La forme comparable d'un littéral Swift, interpolations comprises. */
export function canonicalSwiftLiteral(literal: string): string {
  return canonicalPath(literal.replace(/\\\([^)]*\)/g, '*'));
}

export interface EndpointLiteralSite {
  readonly file: string;
  readonly line: number;
  readonly literal: string;
}

const LITERAL = /endpoint: "([^"]*)"/g;

/** Tous les chemins écrits à la main dans une source Swift. */
export function endpointLiteralsIn(file: string, source: string): readonly EndpointLiteralSite[] {
  const sites: EndpointLiteralSite[] = [];
  source.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(LITERAL)) {
      const literal = match[1] ?? '';
      if (literal.startsWith('/')) sites.push({ file, line: index + 1, literal });
    }
  });
  return sites;
}

/**
 * Les littéraux qui ne correspondent à AUCUNE route servie — c'est-à-dire les
 * 404 que le client ne peut pas voir venir.
 *
 * `apiPrefix` est le préfixe que la couche de transport ajoute aux suffixes
 * (`/api/v1`). Il est passé, jamais deviné : un client qui changerait de
 * préfixe ferait sinon mentir cet audit dans le sens rassurant.
 */
export function unmatchedEndpointLiterals(
  sites: readonly EndpointLiteralSite[],
  servedPaths: readonly string[],
  apiPrefix: string
): readonly EndpointLiteralSite[] {
  const served = servedPaths.map((path) => canonicalPath(path).split('/'));
  const matches = (candidate: string): boolean => {
    const wanted = candidate.split('/');
    return served.some(
      (route) =>
        route.length === wanted.length &&
        route.every((segment, index) => {
          const other = wanted[index] ?? '';
          return segment === '*' || other === '*' || segment === other;
        })
    );
  };
  return sites.filter((site) => {
    const suffix = canonicalSwiftLiteral(site.literal);
    const prefixed = suffix.startsWith('/api') ? suffix : `${apiPrefix}${suffix}`;
    return !matches(prefixed) && !matches(suffix);
  });
}
