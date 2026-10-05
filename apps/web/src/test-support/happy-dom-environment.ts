import { GlobalRegistrator } from '@happy-dom/global-registrator';

/**
 * LE POINT UNIQUE d'enregistrement du DOM global pour `bun test` (#5888).
 *
 * `GlobalRegistrator` (happy-dom) porte son état dans un champ STATIQUE —
 * un singleton partagé par tout le process `bun test`, quels que soient les
 * fichiers qui l'appellent. `register()` lève si déjà enregistré,
 * `unregister()` lève si rien ne l'est. Six sites (`composer.test.tsx` ×2,
 * `message-menu.test.tsx`, `selection-toolbar.test.tsx`,
 * `use-back-dismiss.test.tsx`, `use-live-announcer.test.tsx`) l'enregistraient
 * et le désenregistraient CHACUN dans son propre `beforeAll`/`afterAll` — un
 * appel redondant (l'un enregistrant ce qu'un autre a déjà enregistré, ou
 * l'inverse au désenregistrement) devient un rejet NON attrapé par un
 * `expect`, ce que `bun test` compte en « error » plutôt qu'en « fail » : la
 * suite complète passe (1252 pass, 0 fail) et le run sort quand même en
 * erreur.
 *
 * **Rester enregistré en permanence n'est PAS le correctif** — mesuré en le
 * tentant : `src/lib/scheme.test.ts` installe son PROPRE mock de
 * `document`/`window`/`localStorage` par affectation brute
 * (`(globalThis as {…}).document = {…}`), ce qui exige l'environnement
 * NATIF (non enregistré) — `document` y est sinon une propriété que
 * `GlobalRegistrator` a rendue non réinscriptible par affectation directe,
 * et l'affectation lève « Attempted to assign to readonly property » (21
 * tests d'autres fichiers rougissent, pas seulement celui-ci : le mock
 * fantôme laissé derrière fuit vers le fichier suivant). L'ENREGISTREMENT
 * DOIT rester scopé, borné dans le temps — seul le double-appel doit
 * devenir sans effet.
 *
 * Les deux fonctions ci-dessous sont donc IDEMPOTENTES dans les DEUX sens
 * (un `register()` ou un `unregister()` redondant ne lève plus), sans
 * changer la portée : chaque site continue de l'enregistrer dans son
 * `beforeAll` et de le libérer dans son `afterAll`, restaurant
 * l'environnement natif pour les fichiers suivants — c'est le double appel
 * qui levait, pas la portée qui était fausse.
 *
 * `options` passe tel quel à `register()` : `router.test.tsx` et
 * `magic-link.test.tsx` servent une `url` au document.
 */
export const ensureHappyDomRegistered = (options?: Parameters<typeof GlobalRegistrator.register>[0]): void => {
  if (!GlobalRegistrator.isRegistered) {
    GlobalRegistrator.register(options);
  }
  installNodePortrait(globalThis.Node.prototype);
};

const INSPECT = Symbol.for('nodejs.util.inspect.custom');
const PORTRAIT_LENGTH = 240;

const clip = (text: string): string => (text.length > PORTRAIT_LENGTH ? `${text.slice(0, PORTRAIT_LENGTH)}…` : text);

/**
 * LE PORTRAIT D'UN NŒUD DANS UN MESSAGE D'ÉCHEC (#9509).
 *
 * Sous bun 1.3.14, formater un nœud happy-dom MONTÉ PAR REACT (ses propriétés
 * `__reactFiber$…` mènent à tout l'arbre de fibres, puis au document) prend
 * ~13 s et rend une chaîne VIDE — mesuré sur le profil du jeu (345 nœuds) :
 * `Bun.inspect(el)` 13 527 ms, longueur 0. Un `expect(el).toBeNull()` qui
 * échoue formate son « Received » : il ne lève pas, et le témoin dépasse son
 * délai. bun passe au suivant pendant que le corps abandonné poursuit ses
 * `act()` par-dessus les fichiers suivants — 3 523 rouges en cascade (#9481).
 *
 * Le portrait — balise et début de `outerHTML` — remplace ce parcours : le même
 * échec lève en 0,05 ms et dit ce qu'il a reçu. `Node` est une classe de MODULE
 * de happy-dom, partagée par toutes les fenêtres que ce fichier enregistre :
 * la poser une fois suffit, la reposer ne change rien.
 */
function installNodePortrait(prototype: object): void {
  if (Object.prototype.hasOwnProperty.call(prototype, INSPECT)) return;
  Object.defineProperty(prototype, INSPECT, {
    configurable: true,
    value(this: Node): string {
      return 'outerHTML' in this && typeof this.outerHTML === 'string'
        ? clip(this.outerHTML)
        : `${this.nodeName} ${clip(JSON.stringify(this.textContent ?? ''))}`;
    },
  });
}

export const releaseHappyDomIfRegistered = async (): Promise<void> => {
  if (GlobalRegistrator.isRegistered) {
    await GlobalRegistrator.unregister();
  }
};
