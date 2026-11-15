import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * `Message` DIT SA SUPPRESSION UNE SEULE FOIS (directive porteur 2026-09-14).
 *
 * « `Message` porte à la fois `isDeleted` et `deletedAt` : CLAIREMENT doublon.
 * `deletedAt` suffit partout — soit `undefined` (non supprimé), soit défini
 * (supprimé). »
 *
 * C'est la règle que le `CLAUDE.md` racine énonce déjà pour tout le dépôt :
 * « No redundant boolean + timestamp pairs — a nullable `DateTime?` field is
 * sufficient ». Elle n'avait aucun témoin.
 *
 * ## Ce que la mesure a montré, et qui rend cette garde utile
 *
 * Le schéma ne déclarait DÉJÀ que `deletedAt` : le code était propre, et les
 * deux propriétés Swift `isDeleted` (`MeeshyMessage`, `APIMessage`) sont des
 * DÉRIVÉES (`deletedAt != nil`), pas des colonnes. Le doublon ne vivait que
 * dans les DONNÉES de production : 6 041 documents portaient encore un champ
 * `isDeleted` résiduel, que MongoDB conserve puisqu'il ne suit aucun schéma.
 *
 * > Un champ retiré d'un schéma ne quitte pas la base. Il y reste, invisible à
 * > l'ORM, lisible par tout ce qui interroge en direct — et il dérive : au
 * > retrait, 169 messages portaient `deletedAt` sans `isDeleted`, contre 113
 * > cohérents. Deux vérités pour un même fait, dont une que plus personne
 * > n'écrivait.
 *
 * Les 6 041 champs ont été retirés (`$unset`), sans perte : aucun document
 * n'avait `isDeleted: true` sans `deletedAt`.
 *
 * ## Ce que cette garde tient
 *
 * Que le schéma ne RÉINTRODUISE pas la colonne. C'est le seul chemin par lequel
 * le doublon pourrait revenir dans les données : sans déclaration Prisma, aucun
 * écrivain de l'application ne peut la poser.
 *
 * `Notification.isRead` + `readAt` n'est PAS visé, et la différence importe :
 * ce couple-là est DÉCLARÉ dans le schéma, justifié en commentaire par la
 * performance des index, et ses 205 961 documents sont parfaitement cohérents
 * (zéro écart dans les deux sens, mesuré). C'est une dérogation assumée, pas
 * un résidu — la trancher demande un arbitrage produit, pas un témoin.
 */
describe('Message dit sa suppression une seule fois', () => {
  const schema = readFileSync(join(import.meta.dirname, '..', 'prisma', 'schema.prisma'), 'utf8');

  /** Le bloc `model Message { … }`, borné par ses accolades. */
  const modelMessage = (): string => {
    const start = schema.indexOf('model Message {');
    expect(start).toBeGreaterThan(-1);
    const end = schema.indexOf('\n}', start);
    expect(end).toBeGreaterThan(start);
    return schema.slice(start, end);
  };

  it('le modèle est bien lu — sans quoi la garde serait verte par omission', () => {
    const bloc = modelMessage();
    expect(bloc.length).toBeGreaterThan(200);
    expect(bloc).toContain('deletedAt');
  });

  it('porte `deletedAt`, la seule source de vérité', () => {
    expect(modelMessage()).toMatch(/deletedAt\s+DateTime\?/);
  });

  it('ne réintroduit PAS un booléen `isDeleted` qui la doublerait', () => {
    // `undefined` ⇒ non supprimé, défini ⇒ supprimé. Un booléen à côté crée un
    // second état à tenir d'accord, et c'est lui qui dérive : en production,
    // 169 messages portaient l'horodatage sans le booléen.
    expect(modelMessage()).not.toMatch(/^\s*isDeleted\s/m);
  });
});
