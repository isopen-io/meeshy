/**
 * Suite TDD pour le portage TypeScript de l'accent conversationnel (C-021,
 * contrat LWS-2, écart E3). Chaque cas est dérivé à la main (ou via un script
 * Python indépendant reproduisant EXACTEMENT les formules du fichier sous
 * test, jamais l'implémentation elle-même) à partir des constantes lues dans
 * `packages/MeeshySDK/Sources/MeeshySDK/Theme/ColorGeneration.swift` — les
 * numéros de ligne cités ci-dessous sont ceux du fichier au moment de
 * l'écriture de cette suite.
 *
 * Les 20 vecteurs officiels (`accent.vectors.json`, générés depuis les
 * valeurs Swift réelles) arrivent avec C-022 ; cette suite doit déjà prouver
 * l'exactitude sur ≥ 5 cas dérivés à la main, ce qu'elle fait (7 palettes +
 * les cas de repli).
 */
import { conversationAccentPalette, colorForName, authorAccentColor, ISO_TO_CONVERSATION_LANGUAGE } from '../utils/conversation-colors.js';

const HEX_RE = /^#[0-9A-F]{6}$/;

describe('conversationAccentPalette', () => {
  describe('règle de troncature (Math.trunc, jamais Math.round)', () => {
    it('reproduit le cas documenté du contrat : fr + groupe + voyage → #31B6BA, PAS #31B6BB', () => {
      // Constantes lues dans ColorGeneration.swift :
      //   languageColors[.french] = "3498DB" (L107)
      //   typeColors[.group]      = "4ECDC4" (L121)
      //   themeColors[.travel]    = "1ABC9C" (L136)
      //   poids : blendColors(lang×0.3, type×0.3, theme×0.4) (L181-185)
      //
      // Calcul à la main (canal par canal, R puis G puis B) :
      //   3498DB → (0x34, 0x98, 0xDB) = (52, 152, 219)
      //   4ECDC4 → (0x4E, 0xCD, 0xC4) = (78, 205, 196)
      //   1ABC9C → (0x1A, 0xBC, 0x9C) = (26, 188, 156)
      //   R = 52×0.3 + 78×0.3 + 26×0.4 = 15.6 + 23.4 + 10.4 = 49.4  → trunc → 49  = 0x31
      //   G = 152×0.3 + 205×0.3 + 188×0.4 = 45.6 + 61.5 + 75.2 = 182.3 → trunc → 182 = 0xB6
      //   B = 219×0.3 + 196×0.3 + 156×0.4 = 65.7 + 58.8 + 62.4 = 186.9 → trunc → 186 = 0xBA
      //   → #31B6BA
      // Avec Math.round, B = round(186.9) = 187 = 0xBB → #31B6BB, la valeur
      // (erronée) de la maquette `docs/design/2026-08-15-conversation-list-lentille.html`
      // et documentée comme telle par `tasks/lentille-implementation-contract.md` §0 /
      // `tasks/focal-implementation-contract.md` ("L'accent démo #31B6BB est faux").
      const palette = conversationAccentPalette({
        name: 'Week-end Ardèche',
        type: 'group',
        language: 'french',
        theme: 'travel',
      });

      expect(palette.primary).toBe('#31B6BA');
      expect(palette.primary).not.toBe('#31B6BB');
      // hueShift(primary, ±30°) — dérivé du même primary, vérifié par script
      // indépendant (HSB) reproduisant DynamicColorGenerator.shiftHue (L310-326).
      expect(palette.secondary).toBe('#3071BA');
      expect(palette.accent).toBe('#30BA79');
    });
  });

  describe('cas dérivés à la main depuis les tables Swift (≥ 5 cas, hors cas de troncature)', () => {
    it.each([
      // [language, type, theme, primary, secondary, accent]
      // Cas 1 — direct/french/general : FF6B6B, 3498DB, 4ECDC4 (L107,120,128)
      ['french', 'direct', 'general', '#7B9FB0', '#7B84B0', '#7BB0A6'],
      // Cas 2 — bot/english/work : E74C3C, 00CED1, 3498DB (L108,124,129)
      ['english', 'bot', 'work', '#5A91A8', '#5A6AA8', '#5AA897'],
      // Cas 3 — community/japanese/gaming : E91E63, 9B59B6, 2ECC71 (L111,122,131)
      ['japanese', 'community', 'gaming', '#867581', '#867578', '#827586'],
      // Cas 4 — channel/arabic/music : F8B500, F8B500, 9B59B6 (L112,123,132) — coïncidence :
      // langue et type partagent la même couleur brute ; sert de garde contre une
      // implémentation qui confondrait les deux poids.
      ['arabic', 'channel', 'music', '#D29048', '#CFD248', '#D24B48'],
      // Cas 5 — direct/other/food : 9B59B6, FF6B6B, FF7F50 (L116,120,137)
      ['other', 'direct', 'food', '#E16D76', '#E19E6D', '#E16DB0'],
      // Cas 6 — group/italian/sports : 1ABC9C, 4ECDC4, F39C12 (L115,121,133)
      ['italian', 'group', 'sports', '#80B470', '#70B481', '#A2B470'],
    ])('language=%s type=%s theme=%s → primary=%s secondary=%s accent=%s', (
      language, type, theme, primary, secondary, accent,
    ) => {
      const palette = conversationAccentPalette({ name: 'irrelevant', type, language, theme });
      expect(palette.primary).toBe(primary);
      expect(palette.secondary).toBe(secondary);
      expect(palette.accent).toBe(accent);
    });

    it('produit toujours un hex #RRGGBB majuscule à 6 chiffres pour les trois couleurs', () => {
      const palette = conversationAccentPalette({ name: 'x', type: 'group', language: 'german', theme: 'tech' });
      expect(palette.primary).toMatch(HEX_RE);
      expect(palette.secondary).toMatch(HEX_RE);
      expect(palette.accent).toMatch(HEX_RE);
    });
  });

  describe('`name` est accepté mais N\'INTERVIENT PAS dans le calcul (colorFor(context:) ne lit jamais context.name, ColorGeneration.swift L174-196)', () => {
    it('deux noms différents, mêmes type/langue/thème → même palette', () => {
      const a = conversationAccentPalette({ name: 'Alice', type: 'direct', language: 'french', theme: 'general' });
      const b = conversationAccentPalette({ name: 'Complètement différent 🎉', type: 'direct', language: 'french', theme: 'general' });
      expect(a).toEqual(b);
    });
  });

  describe('mapping du type "fil" (wire) vers le type de contexte à 5 clés (computeColorPalette, CoreModels.swift L341-355)', () => {
    it.each(['public', 'global', 'community', 'broadcast'])(
      'type=%s retombe sur le contexte "community" — même palette que type=community',
      (wireType) => {
        const reference = conversationAccentPalette({ name: 'x', type: 'community', language: 'japanese', theme: 'gaming' });
        const actual = conversationAccentPalette({ name: 'x', type: wireType, language: 'japanese', theme: 'gaming' });
        expect(actual).toEqual(reference);
      },
    );
  });

  describe('replis (langue/thème fournis mais inconnus, type inconnu, langue/thème omis)', () => {
    it('langue inconnue retombe sur #4ECDC4 (repli littéral `?? "4ECDC4"`, ColorGeneration.swift L175)', () => {
      const palette = conversationAccentPalette({ name: 'x', type: 'direct', language: 'klingon', theme: 'general' });
      expect(palette.primary).toBe('#83AFA9');
    });

    it('thème inconnu retombe sur #4ECDC4 (repli littéral `?? "4ECDC4"`, ColorGeneration.swift L177)', () => {
      const palette = conversationAccentPalette({ name: 'x', type: 'group', language: 'french', theme: 'atlantis' });
      expect(palette.primary).toBe('#46BDCA');
    });

    it('type inconnu retombe sur le contexte "direct" (défaut de ConversationContext.type, L22-26)', () => {
      const palette = conversationAccentPalette({ name: 'x', type: 'holodeck', language: 'other', theme: 'music' });
      expect(palette.primary).toBe('#B95E9F');
    });

    it('langue et thème omis retombent sur les défauts Swift (french, general) — pas sur le repli 4ECDC4-inconnu', () => {
      const withDefaults = conversationAccentPalette({ name: 'x', type: 'group' });
      const explicit = conversationAccentPalette({ name: 'x', type: 'group', language: 'french', theme: 'general' });
      expect(withDefaults).toEqual(explicit);
      expect(withDefaults.primary).toBe('#46BDCA');
    });
  });

  it('est pure : deux appels avec le même objet littéral rendent exactement le même résultat', () => {
    const input = { name: 'stable', type: 'direct', language: 'french', theme: 'general' } as const;
    expect(conversationAccentPalette({ ...input })).toEqual(conversationAccentPalette({ ...input }));
  });

  describe('RÉSERVE 7 (revue REV-1) — accepte aussi un code ISO 639-1 pour `language`', () => {
    it('ISO_TO_CONVERSATION_LANGUAGE mappe les 9 langues réelles de LANGUAGE_COLORS (hors "other", pas une langue ISO)', () => {
      expect(ISO_TO_CONVERSATION_LANGUAGE).toEqual({
        fr: 'french',
        en: 'english',
        es: 'spanish',
        de: 'german',
        ja: 'japanese',
        ar: 'arabic',
        zh: 'chinese',
        pt: 'portuguese',
        it: 'italian',
      });
    });

    it.each([
      ['fr', 'french'],
      ['en', 'english'],
      ['es', 'spanish'],
      ['de', 'german'],
      ['ja', 'japanese'],
      ['ar', 'arabic'],
      ['zh', 'chinese'],
      ['pt', 'portuguese'],
      ['it', 'italian'],
    ])('language=%s (ISO) produit exactement la même palette que language=%s (nom complet)', (iso, full) => {
      const viaIso = conversationAccentPalette({ name: 'x', type: 'direct', language: iso, theme: 'general' });
      const viaFull = conversationAccentPalette({ name: 'x', type: 'direct', language: full, theme: 'general' });
      expect(viaIso).toEqual(viaFull);
    });

    it('language="fr" avec type=direct/theme=general → même palette que le cas documenté demo-fr (#7B9FB0)', () => {
      const palette = conversationAccentPalette({ name: 'demo-fr-iso', type: 'direct', language: 'fr', theme: 'general' });
      expect(palette.primary).toBe('#7B9FB0');
      expect(palette.secondary).toBe('#7B84B0');
      expect(palette.accent).toBe('#7BB0A6');
    });

    it('un code ISO inconnu (2 lettres hors table) retombe sur le repli langue-inconnue, comme un nom inconnu', () => {
      const viaUnknownIso = conversationAccentPalette({ name: 'x', type: 'direct', language: 'xx', theme: 'general' });
      const viaUnknownName = conversationAccentPalette({ name: 'x', type: 'direct', language: 'klingon', theme: 'general' });
      expect(viaUnknownIso).toEqual(viaUnknownName);
    });
  });
});

describe("authorAccentColor — l'accent d'un contenu, miroir d'iOS", () => {
  // iOS dérive l'accent d'un post ainsi (FeedModels.swift:255) :
  //   authorColor = colorForName(authorId.isEmpty ? author : authorId)
  //
  // La règle vit ici pour que le web ne la RECOPIE pas : recopiée, elle
  // divergerait — et deux clients peindraient le même post de deux couleurs,
  // ce qui rend le renforcement « c'est moi » illisible d'un appareil à l'autre.

  it("dérive de l'identifiant quand il est présent", () => {
    expect(authorAccentColor('user-42', 'Alice')).toBe(colorForName('user-42'));
  });

  it('retombe sur le nom quand l identifiant manque', () => {
    expect(authorAccentColor(undefined, 'Alice')).toBe(colorForName('Alice'));
    expect(authorAccentColor('', 'Alice')).toBe(colorForName('Alice'));
  });

  it("ne confond pas les deux : un identifiant ne donne pas la couleur du nom", () => {
    expect(authorAccentColor('user-42', 'Alice')).not.toBe(colorForName('Alice'));
  });

  it('est déterministe — le même auteur garde sa couleur', () => {
    expect(authorAccentColor('user-42', 'Alice')).toBe(authorAccentColor('user-42', 'Bob'));
  });
});

describe('colorForName (repli — DynamicColorGenerator.colorForName, ColorGeneration.swift L234-237)', () => {
  it('reproduit le hash DJB2 calculé à la main pour "Bob" (3 octets ASCII)', () => {
    // stableHash (L224-230) : hash = 5381 ; puis pour chaque octet UTF-8 :
    //   hash = (hash × 33 + octet) mod 2^64   [ ((hash << 5) + hash) + octet ]
    // "Bob" → octets [66, 111, 98] :
    //   h0 = 5381
    //   h1 = 5381×33 + 66   = 177573 + 66   = 177639
    //   h2 = 177639×33 + 111 = 5862087 + 111 = 5862198
    //   h3 = 5862198×33 + 98 = 193452534 + 98 = 193452632
    // index = 193452632 mod 39 (longueur de vibrantPalette, L201-220) :
    //   39 × 4960323 = 193452597 ; 193452632 − 193452597 = 35
    // vibrantPalette[35] = "C026D3" (L217, dans le bloc "Purples & Fuchsias")
    expect(colorForName('Bob')).toBe('#C026D3');
  });

  it.each([
    // [name, index attendu dans vibrantPalette (39 entrées), couleur attendue]
    // Valeurs croisées via un script Python indépendant reproduisant le DJB2
    // 64-bit wraparound (BigInt côté TS) — mêmes octets UTF-8, même palette.
    ['Alice', 20, '#0D9488'],
    ['conversation-123', 1, '#C0392B'],
  ])('colorForName(%s) → palette[%d] = %s', (name, _index, expected) => {
    expect(colorForName(name)).toBe(expected);
  });

  it('produit un hex #RRGGBB majuscule à 6 chiffres', () => {
    expect(colorForName('n\'importe quoi')).toMatch(HEX_RE);
  });

  it('est déterministe : même nom → même couleur sur plusieurs appels', () => {
    const name = 'répétable';
    expect(colorForName(name)).toBe(colorForName(name));
    expect(colorForName(name)).toBe(colorForName(name));
  });

  it('deux noms différents peuvent produire deux couleurs différentes (non-dégénéré)', () => {
    expect(colorForName('Alice')).not.toBe(colorForName('Bob'));
  });

  it("gère les caractères non-ASCII (emoji, accents) sans jeter — hash sur les octets UTF-8, comme `string.utf8` côté Swift", () => {
    expect(() => colorForName('Week-end Ardèche 🏕')).not.toThrow();
    expect(colorForName('Week-end Ardèche 🏕')).toMatch(HEX_RE);
  });
});

describe('divergence Swift/Kotlin/documentation constatée (palette de repli)', () => {
  it('la palette de repli documentée ("20 couleurs", CLAUDE.md et contrat LWS-2) ne correspond PAS au tableau Swift réel — 39 entrées, recomptées ligne à ligne depuis ColorGeneration.swift L201-220 (le Kotlin en L92-102 recopie la même liste de 39, sans divergence entre les deux plateformes)', () => {
    // Ce test documente l'écart entre la prose ("palette de 20", CLAUDE.md /
    // tasks/lentille-implementation-contract.md) et le code source qui fait foi.
    // Il échoue si quelqu'un "corrige" VIBRANT_PALETTE pour coller à la prose
    // au lieu du Swift — exactement la garde recherchée.
    const distinctColorsAcrossManyNames = new Set(
      Array.from({ length: 200 }, (_, i) => colorForName(`probe-${i}`)),
    );
    // 39 couleurs distinctes doivent être atteignables sur un échantillon large.
    expect(distinctColorsAcrossManyNames.size).toBe(39);
  });
});
