/**
 * Ce qu'une référence de média DIT — et de quel magasin elle vient.
 *
 * ## Le défaut que ce module ferme
 *
 * Meeshy sert ses médias depuis DEUX magasins, et rien dans la donnée ne disait
 * lequel :
 *
 * | magasin | qui écrit | comment on le sert |
 * |---|---|---|
 * | passerelle | `tus-handler`, `UploadProcessor` | `GET <base d'API>/attachments/file/<clé>` |
 * | statique | la route d'avatar du web (`public/u/i/YYYY/MM/`) | `https://static.<domaine>/<clé>` |
 *
 * #4324 a retiré l'hôte et le préfixe d'API des clés de la PASSERELLE, et les
 * trois clients savent depuis lors composer `clé → adresse`. Les 272 avatars du
 * magasin STATIQUE (`Participant.avatar` 254, `User.avatar` 18) n'ont pas pu
 * suivre : réduits à leur clé, ils seraient allés se chercher sur la passerelle,
 * où ils ne sont pas. **Ils ne s'affichent aujourd'hui que parce qu'ils portent
 * encore leur hôte** — une dette qui se tient debout toute seule (#4625).
 *
 * ## Pourquoi un SCHÉMA, et pas une expression régulière
 *
 * Le web reconnaissait un chemin de la passerelle à `^/\d{4}/\d{2}/`, que
 * `u/i/2025/11/…` ne satisfait pas — mais `avatars/user/<id>.jpg`, une clé de
 * la PASSERELLE, ne le satisfait pas non plus. **Aucune forme de clé ne dit son
 * magasin** : les deux espaces de noms se ressemblent trop pour qu'on les
 * sépare à vue, et chaque consommateur qui essaie invente sa propre règle.
 *
 * La distinction est donc PORTÉE PAR LA DONNÉE, sous la forme d'un schéma :
 *
 * ```
 * static:u/i/2025/11/avatar_1763143871947_o0.jpg   → magasin statique
 * 2025/12/<id>/photo.jpg                            → passerelle (défaut)
 * ```
 *
 * L'absence de schéma vaut « passerelle » : c'est ce que la migration `013` a
 * déjà écrit pour 514 attachements, et leur relecture ne bouge pas.
 *
 * ## Ce que ce module ne fait PAS
 *
 * Il ne compose aucune URL. Les DEUX bases (celle de l'API, celle du magasin
 * statique) sont des décisions de déploiement que chaque client tient de sa
 * propre configuration — le web par `getBackendUrl()` / `getStaticUrl()`, iOS
 * par `MeeshyConfig`, Android par sa `MeeshyConfig`. Ce module dit ce que la
 * chaîne EST ; l'adresse se pose chez celui qui sait à quels hôtes il parle.
 */

/** Le magasin d'où vient un média. */
export type MediaStore = 'gateway' | 'static';

/** Le schéma qui déclare le magasin statique. */
export const STATIC_STORE_SCHEME = 'static:';

/**
 * Ce qu'une référence de média est, une fois lue.
 *
 * `absolute` et `path` sont des formes HÉRITÉES qui fonctionnent : une adresse
 * complète porte déjà tout, un chemin absolu porte déjà sa route. Elles se
 * distinguent d'une clé parce qu'un consommateur ne doit RIEN leur ajouter —
 * c'est en leur posant une seconde route qu'on fabrique
 * `…/attachments/file/api/v1/attachments/file/…`.
 */
export type MediaRef =
  | { readonly kind: 'absolute'; readonly url: string }
  | { readonly kind: 'path'; readonly path: string }
  | { readonly kind: 'key'; readonly store: MediaStore; readonly key: string };

/**
 * Lit une référence de média telle que la base la porte.
 *
 * Rend `null` pour ce qui ne désigne aucun média — chaîne vide, chaîne
 * d'espaces, schéma sans clé. Un `null` se distingue d'une clé vide : le premier
 * dit « rien à afficher », la seconde composerait l'adresse d'un répertoire.
 */
export function parseMediaRef(valeur: string | null | undefined): MediaRef | null {
  if (valeur === null || valeur === undefined) return null;
  const brut = valeur.trim();
  if (brut.length === 0) return null;

  if (brut.startsWith(STATIC_STORE_SCHEME)) {
    const cle = brut.slice(STATIC_STORE_SCHEME.length).replace(/^\/+/, '');
    return cle.length === 0 ? null : { kind: 'key', store: 'static', key: cle };
  }

  if (brut.startsWith('http://') || brut.startsWith('https://')) {
    return { kind: 'absolute', url: brut };
  }

  if (brut.startsWith('/')) return { kind: 'path', path: brut };

  return { kind: 'key', store: 'gateway', key: brut };
}

/**
 * La forme STOCKÉE d'une clé du magasin statique.
 *
 * Site unique : l'écriture du schéma est le pendant exact de sa lecture, et les
 * deux doivent bouger ensemble. Un appelant qui écrirait `'static:' + clé` à la
 * main survivrait au renommage du schéma sans rougir.
 */
export function staticMediaRef(cle: string): string {
  return `${STATIC_STORE_SCHEME}${cle.replace(/^\/+/, '')}`;
}

/**
 * La clé nue d'une adresse absolue du magasin statique, quand c'en est une.
 *
 * C'est la brique de la migration : `https://static.meeshy.me/u/i/2025/11/a.jpg`
 * → `u/i/2025/11/a.jpg`. L'hôte est reconnu par son PREMIER label (`static`),
 * jamais par un domaine écrit ici — c'est précisément le littéral d'hôte que
 * cette issue retire de la donnée, et il n'a pas plus sa place dans le code qui
 * l'en retire.
 */
export function staticKeyFromAbsoluteUrl(url: string): string | null {
  let analysee: URL;
  try {
    analysee = new URL(url);
  } catch {
    return null;
  }
  if (!analysee.hostname.startsWith('static.')) return null;
  const cle = analysee.pathname.replace(/^\/+/, '');
  return cle.length === 0 ? null : cle;
}
