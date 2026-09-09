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
 */
export const ensureHappyDomRegistered = (): void => {
  if (!GlobalRegistrator.isRegistered) {
    GlobalRegistrator.register();
  }
};

export const releaseHappyDomIfRegistered = async (): Promise<void> => {
  if (GlobalRegistrator.isRegistered) {
    await GlobalRegistrator.unregister();
  }
};
