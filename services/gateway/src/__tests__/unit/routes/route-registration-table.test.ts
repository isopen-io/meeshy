/**
 * Témoin de la TABLE de routes (#4278) — `routes/index.ts`.
 *
 * Ce fichier ne rejoue PAS ce que `route-manifest-ratchet.test.ts` et
 * `route-auth-coverage.test.ts` couvrent déjà (le graphe de routes RÉELLEMENT
 * assemblé) : ce sont les filets de CE lot, lancés à chaque étape, et ils
 * restent la preuve qu'aucun montage n'a été perdu ou déplacé. Ici, on garde
 * ce qui est NOUVEAU et qu'eux ne peuvent pas voir : la FORME de la table
 * elle-même — critère 2 (préfixe obligatoire) et critère 3 (le `name` de la
 * table porte l'identité, l'alias d'import n'y est plus pour rien).
 */

import { describe, expect, it } from '@jest/globals';
import type { RouteRegistrationEntry } from '../../../routes/index';
import { ROUTE_TABLE } from '../../../routes/index';

describe('ROUTE_TABLE (#4278)', () => {
  it('ne contient aucune entrée sans module, préfixe ou nom', () => {
    for (const entry of ROUTE_TABLE) {
      expect(typeof entry.module).toBe('function');
      expect(typeof entry.prefix).toBe('string');
      expect(typeof entry.name).toBe('string');
      expect(entry.name.length).toBeGreaterThan(0);
    }
  });

  it("porte un `name` UNIQUE par entrée — c'est lui, pas l'alias d'import, qui identifie une route", () => {
    const names = ROUTE_TABLE.map((entry) => entry.name);
    const doublons = names.filter((name, index) => names.indexOf(name) !== index);
    expect(doublons).toEqual([]);
  });

  /**
   * Critère 3 — les DEUX vraies collisions d'import (`invitationRoutes`
   * déclaré identiquement dans `routes/admin/invitations.ts` ET
   * `routes/invitations.ts` ; `messagesRoutes`/`messageRoutes`, plus proches
   * en LECTURE qu'en syntaxe) n'obligent plus personne à choisir un alias
   * pour compiler : la table les importe par NAMESPACE et leur donne un
   * `name` distinct, qui est désormais la SEULE identité qu'un lecteur doit
   * retenir. La fonction JS sous-jacente peut rester homonyme (c'est un fait
   * du code source, pas un défaut) — ce que ce témoin exige, c'est que le
   * `name` de la TABLE, lui, ne le soit jamais.
   */
  it('distingue admin/invitations de invitations (public) par le name, pas par le nom JS', () => {
    const adminInvitations = ROUTE_TABLE.find((e) => e.name === 'admin-invitations');
    const publicInvitations = ROUTE_TABLE.find((e) => e.name === 'invitations');

    expect(adminInvitations).toBeDefined();
    expect(publicInvitations).toBeDefined();
    expect(adminInvitations?.name).not.toBe(publicInvitations?.name);

    // Les DEUX modules sont bien la même fonction homonyme à la source — la
    // preuve même que la collision existe et que seul `name` la résout.
    expect(adminInvitations?.module.name).toBe('invitationRoutes');
    expect(publicInvitations?.module.name).toBe('invitationRoutes');

    // Admin doit rester enregistré AVANT public : c'est cet ordre, préservé
    // dans la table, qui fait que le manifeste désambiguïse ces deux montages
    // en `invitationRoutes` (1er) / `invitationRoutes~2` (2nd) — un ordre
    // inversé romprait #4276 sans qu'aucune route n'ait bougé.
    expect(ROUTE_TABLE.indexOf(adminInvitations!)).toBeLessThan(ROUTE_TABLE.indexOf(publicInvitations!));
  });

  it('distingue admin/messages de messages par le name', () => {
    const adminMessages = ROUTE_TABLE.find((e) => e.name === 'admin-messages');
    const messages = ROUTE_TABLE.find((e) => e.name === 'messages');

    expect(adminMessages).toBeDefined();
    expect(messages).toBeDefined();
    expect(adminMessages?.module.name).toBe('messagesRoutes');
    expect(messages?.module.name).toBe('messageRoutes');
  });

  it("chaque préfixe dérivé de l'API est bâti depuis apiBasePath(), jamais recopié en dur", () => {
    // Un seul littéral toléré : le montage LEGACY non versionné n'existe pas
    // dans cette table (il reste explicite dans route-registration.ts, sous
    // témoin de régression dédié — attachments-unversioned-mount.test.ts).
    // Tout préfixe non vide de CETTE table doit donc commencer par le
    // préfixe versionné courant.
    const API_PREFIX_MARKER = ROUTE_TABLE.find((e) => e.name === 'auth')?.prefix.split('/auth')[0];
    expect(API_PREFIX_MARKER).toBeTruthy();

    for (const entry of ROUTE_TABLE) {
      if (entry.prefix === '') continue; // alias racine explicite (voice-analysis-legacy-alias) — voir son commentaire dans routes/index.ts
      expect(entry.prefix.startsWith(API_PREFIX_MARKER as string)).toBe(true);
    }
  });

  it('a exactement 57 entrées — un canary : une entrée en moins est une route perdue en silence', () => {
    // Compte ancré au 2026-08-30 sur les 65 actes d'enregistrement de
    // `route-registration.ts` moins les 8 montages qui exigent PLUS qu'un
    // {module, prefix} (traduction, userDeletions, conversationRoutes,
    // attachments × 2, tus, voiceRoutesPlugin, postRoutes) — voir le
    // commentaire de module de `routes/index.ts` pour l'énumération. Si ce
    // compte change, c'est qu'une route a rejoint ou quitté la table : la
    // prochaine étape est de vérifier `route-manifest-ratchet`, pas
    // d'ajuster ce chiffre en aveugle.
    expect(ROUTE_TABLE.length).toBe(57);
  });
});

/**
 * Critère 2, PREUVE DE COMPILATION — « le préfixe est obligatoire par
 * entrée : un module sans préfixe explicite ne compile pas ».
 *
 * `tsc --noEmit` n'atteint jamais ce fichier (le bloc `exclude` de
 * tsconfig.json retire tout le dossier `__tests__` — voir la note de
 * `services/gateway/CLAUDE.md` § « Un cliquet doit être ATTEIGNABLE par le
 * compilateur »). `tsconfig.test.json`, lui, INCLUT `__tests__` sans
 * exclusion — c'est donc ts-jest, au moment où
 * CE fichier de test est chargé, qui type-vérifie les trois blocs
 * `@ts-expect-error` ci-dessous. Le code TS2578 (directive `@ts-expect-error`
 * inutilisée) n'est PAS dans `diagnostics.ignoreCodes` de `jest.config.json`
 * — si un champ redevenait optionnel, la ligne se mettrait à COMPILER, la
 * directive deviendrait inutile, et ts-jest ferait ROUGIR ce fichier entier
 * au chargement. C'est la preuve, PROUVÉE rouge sous chacune des trois
 * mutations qu'elle nomme (voir le rapport de la session : mutation
 * `prefix?: string`, `module?: RoutePlugin`, `name?: string` — chacune fait
 * tomber CE fichier avec `TS2578: Unused '@ts-expect-error' directive`).
 */
function neCompilePasSansChampObligatoire(): void {
  // @ts-expect-error — `prefix` est REQUIS : cette entrée ne le porte pas.
  const sansPrefix: RouteRegistrationEntry = {
    name: 'x',
    module: async () => {},
  };
  void sansPrefix;

  // @ts-expect-error — `module` est REQUIS : cette entrée ne le porte pas.
  const sansModule: RouteRegistrationEntry = {
    name: 'x',
    prefix: '/x',
  };
  void sansModule;

  // @ts-expect-error — `name` est REQUIS : cette entrée ne le porte pas.
  const sansName: RouteRegistrationEntry = {
    prefix: '/x',
    module: async () => {},
  };
  void sansName;
}
void neCompilePasSansChampObligatoire;
