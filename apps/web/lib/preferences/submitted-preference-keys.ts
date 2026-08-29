/**
 * Ce qu'une écriture de préférences a le droit d'envoyer : les clés que
 * l'utilisateur a SOUMISES, et rien d'autre.
 *
 * La passerelle expose deux verbes par catégorie, et ils ne disent pas la même
 * chose (`routes/me/preferences/preference-router-factory.ts`) :
 *
 * | verbe | ce qu'il fait |
 * |---|---|
 * | `PUT` | **REMPLACE** — `schema.parse(body)` puis `update: { [category]: validated }`. Zod comble les clés absentes par leurs `default()` et SUPPRIME celles qui sont `optional()` sans défaut. |
 * | `PATCH` | **FUSIONNE** — `submittedKeysOnly(...)` sur `resolveComplete(userId)`. Ce qu'on ne nomme pas ne bouge pas. |
 *
 * Tout site qui écrit en `PUT` un corps construit sur sa propre vue des
 * préférences pose donc une condition de correction invisible : que sa vue soit
 * FIDÈLE au document. Elle ne l'est jamais longtemps — l'écran des
 * notifications amorce 15 des 33 champs du schéma, celui de l'application 17
 * des 22 — et chaque champ ajouté au schéma partagé sans être ajouté à la vue
 * devient une perte de données silencieuse au prochain réglage touché.
 *
 * Envoyer le SOUMIS retire la condition : le serveur fusionne sur ce qu'il
 * obéit déjà. Elle ferme au passage l'écrasement concurrent — un réglage changé
 * sur un AUTRE appareil n'est plus annulé par une bascule sans rapport.
 *
 * `undefined` est retiré parce que `JSON.stringify` le retire de toute façon —
 * sans quoi la garde « aucune clé » compterait une clé que le serveur ne verra
 * jamais, et paierait un aller-retour, un journal de mutation et une diffusion
 * `preferences:updated` pour zéro changement.
 */
export const submittedKeys = <T extends object>(prefs: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(prefs).filter(([, value]) => value !== undefined),
  ) as Partial<T>;

/**
 * La même règle pour un écran qui tient un ÉTAT LOCAL COMPLET et sait, à part,
 * quelles clés le geste de l'utilisateur a touchées.
 *
 * Un écran de réglages ne peut pas répondre « ce que j'ai soumis » depuis son
 * état : cet état est indiscernable d'un état de DÉFAUTS quand le chargement a
 * échoué. Ce sont les clés touchées — et elles seules — qui portent une
 * intention. Une clé nommée mais absente de l'état est ignorée : un `Set` de
 * clés survit à un remplacement d'état, pas nécessairement à un changement de
 * forme.
 */
export const pickSubmitted = <T extends object>(
  state: T,
  submitted: Iterable<string>,
): Partial<T> => {
  const picked: Record<string, unknown> = {};

  for (const key of submitted) {
    if (key in state) picked[key] = (state as Record<string, unknown>)[key];
  }

  return submittedKeys(picked) as Partial<T>;
};
