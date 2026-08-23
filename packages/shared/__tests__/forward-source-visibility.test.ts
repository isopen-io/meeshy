import { describe, it, expect } from 'vitest';
import {
  allowsForwardSource,
  resolveForwardSourceVisibility,
  withoutForwardSource,
  type ForwardSourceVisibilityInput,
} from '../utils/forward-source-visibility';
import {
  PrivacyPreferenceSchema,
  PRIVACY_PREFERENCE_DEFAULTS,
} from '../types/preferences/privacy';

// Réciprocité de la source des transferts (directive produit 2026-08-23).
//
// « si on permet d'afficher le nom des transferts, toute personne qui l'a
//   permis aussi verra mes noms de transfert. Si on ne permet pas, je ne verrai
//   pas le nom d'auteur des transferts et personne ne verra les miens non
//   plus ! »
//
// Un seul refus suffit à masquer. Ces tests VERROUILLENT la règle : c'est elle
// qui décide si le nom QUITTE le serveur — pas le client.

const inputFor = (
  overrides: Partial<ForwardSourceVisibilityInput> = {},
): ForwardSourceVisibilityInput => ({
  isSelf: false,
  forwarderAllows: true,
  readerAllows: true,
  ...overrides,
});

describe('resolveForwardSourceVisibility — la règle bilatérale', () => {
  it('montre la source quand les deux autorisent', () => {
    expect(resolveForwardSourceVisibility(inputFor())).toBe(true);
  });

  it("masque quand l'AUTEUR du transfert a désactivé, même si le lecteur autorise", () => {
    expect(resolveForwardSourceVisibility(inputFor({ forwarderAllows: false }))).toBe(false);
  });

  it("masque quand le LECTEUR a désactivé, même si l'auteur autorise — qui se cache ne voit pas", () => {
    expect(resolveForwardSourceVisibility(inputFor({ readerAllows: false }))).toBe(false);
  });

  it('masque quand les deux ont désactivé', () => {
    expect(
      resolveForwardSourceVisibility(inputFor({ forwarderAllows: false, readerAllows: false })),
    ).toBe(false);
  });

  it("laisse l'auteur relire SA propre source : se cacher des autres n'est pas s'aveugler", () => {
    expect(
      resolveForwardSourceVisibility(inputFor({ isSelf: true, forwarderAllows: false, readerAllows: false })),
    ).toBe(true);
  });
});

describe('allowsForwardSource — le défaut TRUE, y compris sans document (la prod ne migre pas)', () => {
  it('autorise quand AUCUNE préférence n\'est enregistrée', () => {
    expect(allowsForwardSource(undefined)).toBe(true);
    expect(allowsForwardSource(null)).toBe(true);
    expect(allowsForwardSource({})).toBe(true);
  });

  it('autorise quand le document existe mais ne porte PAS la clé (documents antérieurs)', () => {
    expect(allowsForwardSource({ showReadReceipts: false } as Record<string, boolean>)).toBe(true);
  });

  it('ne refuse que sur un `false` EXPLICITE', () => {
    expect(allowsForwardSource({ showForwardSource: false })).toBe(false);
    expect(allowsForwardSource({ showForwardSource: true })).toBe(true);
  });
});

describe('withoutForwardSource — omettre, jamais marquer', () => {
  const payload = {
    id: 'm1',
    forwardedFromId: 'orig',
    forwardedFromConversationId: 'conv',
    forwardedFrom: { id: 'orig', sender: { displayName: 'Alice' } },
    forwardedFromConversation: { id: 'conv', title: 'Groupe public' },
  };

  it('retire les DEUX objets nommants', () => {
    const stripped = withoutForwardSource(payload);
    expect('forwardedFrom' in stripped).toBe(false);
    expect('forwardedFromConversation' in stripped).toBe(false);
  });

  it('conserve les identifiants — le badge générique « Transféré » doit survivre', () => {
    const stripped = withoutForwardSource(payload) as typeof payload;
    expect(stripped.forwardedFromId).toBe('orig');
    expect(stripped.forwardedFromConversationId).toBe('conv');
    expect(stripped.id).toBe('m1');
  });

  it("n'ajoute AUCUN marqueur : un champ « caché » est une information de plus, et il serait strippé en silence par fast-json-stringify", () => {
    expect(Object.keys(withoutForwardSource(payload)).sort()).toEqual(
      ['forwardedFromConversationId', 'forwardedFromId', 'id'],
    );
  });

  it('ne mute jamais la source — le payload du salon est partagé entre destinataires', () => {
    withoutForwardSource(payload);
    expect(payload.forwardedFrom).toBeDefined();
    expect(payload.forwardedFromConversation).toBeDefined();
  });
});

// ─── La porte de réglage ──────────────────────────────────────────────────────

describe('PATCH /me/preferences/privacy — le corps doit SURVIVRE à la validation', () => {
  it('conserve `showForwardSource` à travers le schéma partiel du PATCH', () => {
    // La factory de routes valide par `PrivacyPreferenceSchema.partial().parse(body)`,
    // puis réduit aux clés que le corps NOMME (`submittedKeysOnly` — `partial()`
    // ne retire pas les `default()`). Zod RETIRE les clés INCONNUES : une
    // préférence absente du schéma serait silencieusement effacée du corps, la
    // route répondrait 200, et rien ne serait écrit.
    const parsed = PrivacyPreferenceSchema.partial().parse({ showForwardSource: false });

    expect(parsed.showForwardSource).toBe(false);
  });

  it("efface une clé INCONNUE du corps — la preuve que l'appartenance au schéma est ce qui compte", () => {
    const parsed = PrivacyPreferenceSchema.partial().parse({ showForwardSourceTypo: false } as never);

    expect(parsed).not.toHaveProperty('showForwardSourceTypo');
  });

  it("vaut TRUE quand le corps ne la nomme pas — c'est un opt-out", () => {
    expect(PrivacyPreferenceSchema.parse({}).showForwardSource).toBe(true);
    expect(PRIVACY_PREFERENCE_DEFAULTS.showForwardSource).toBe(true);
  });

  it('refuse une valeur non booléenne plutôt que de la laisser passer', () => {
    expect(() => PrivacyPreferenceSchema.parse({ showForwardSource: 'non' })).toThrow();
  });
});

describe("le refus du LECTEUR ne dépend pas de l'identité de l'auteur", () => {
  it("masque même quand l'auteur du transfert est un ANONYME (aucune préférence possible)", () => {
    // Un anonyme n'a pas de compte, donc pas de réglage : il est servi par le
    // défaut, qui AUTORISE. Cela ne doit pas relever le refus du lecteur.
    expect(resolveForwardSourceVisibility(inputFor({ forwarderAllows: true, readerAllows: false }))).toBe(false);
  });
});

describe('troisième acteur — le veto de l\'auteur d\'origine, préparé mais non collecté', () => {
  // Le porteur produit (2026-08-23) : « il faut que le système développé
  // permette PLUS TARD que l'auteur puisse décider si on l'affiche ou non,
  // notamment activable par les autorités ». Le champ existe donc dès
  // maintenant, permissif par défaut, pour que la règle n'ait pas à être
  // réécrite le jour où il sera alimenté.

  it('omis ⇒ strictement identique au comportement bilatéral', () => {
    // LE témoin qui compte : ajouter le champ ne doit RIEN changer tant que
    // personne ne le renseigne. Les quatre combinaisons, sans le champ.
    for (const forwarderAllows of [true, false]) {
      for (const readerAllows of [true, false]) {
        expect(resolveForwardSourceVisibility({ isSelf: false, forwarderAllows, readerAllows }))
          .toBe(forwarderAllows && readerAllows);
      }
    }
  });

  it('undefined explicite ⇒ autorise, comme l\'absence', () => {
    expect(resolveForwardSourceVisibility({
      isSelf: false, forwarderAllows: true, readerAllows: true, originalAuthorAllows: undefined,
    })).toBe(true);
  });

  it('false ⇒ masque, même quand les deux autres autorisent', () => {
    expect(resolveForwardSourceVisibility({
      isSelf: false, forwarderAllows: true, readerAllows: true, originalAuthorAllows: false,
    })).toBe(false);
  });

  it('ne court-circuite PAS isSelf — relire son propre transfert reste possible', () => {
    // Celui qui relit son propre transfert sait déjà d'où il vient : un veto ne
    // lui apprendrait rien et rendrait seulement son historique illisible.
    expect(resolveForwardSourceVisibility({
      isSelf: true, forwarderAllows: false, readerAllows: false, originalAuthorAllows: false,
    })).toBe(true);
  });
});
