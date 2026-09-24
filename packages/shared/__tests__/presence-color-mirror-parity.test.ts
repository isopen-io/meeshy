/**
 * Une seule palette de présence 1/3/5, sur toutes les plateformes.
 *
 * Le barème temporel (`presence-mirror-parity.test.ts`) décide de l'ÉTAT —
 * `online` / `away` / `idle` / `offline`. La COULEUR de cet état est l'autre
 * moitié de la règle produit « 1/3/5 » (2026-07-20), et elle vit, comme le
 * barème, en plusieurs exemplaires — un par client — qu'aucun témoin ne
 * gardait jusqu'ici (amélioration différée par l'itération 270, qui gardait le
 * seul barème temporel) :
 *
 * | plateforme | valeurs de couleur | mapping état → couleur |
 * |---|---|---|
 * | TypeScript (SSOT) | `PRESENCE_HEX` (`utils/user-presence.ts`) | `PRESENCE_TONE` (même fichier) |
 * | Swift (iOS/SDK) | `MeeshyColors.success/.warning/.neutral400` (`MeeshyColors.swift`) | `PresenceState.dotColor` (`PresenceStyle.swift`) |
 * | Kotlin (Android) | `MeeshyPalette.Success/.Warning/.Neutral400` (`MeeshyPalette.kt`) | `meeshyPresenceDotColor` (`MeeshyAvatar.kt`) |
 * | Web | AUCUN miroir : `PRESENCE_HEX` + `presenceTone` importés de `@meeshy/shared` | idem |
 *
 * **Le web n'a plus de colonne MIROIR, et il ne doit pas en retrouver une
 * (#7668, 2026-09-24).** Le legacy recopiait la palette en classes Tailwind
 * (`PRESENCE_DOT_CLASS`, `apps/web/lib/user-status.ts`) et ce témoin la lisait
 * par le système de fichiers. L'application web qui l'a remplacé ne RECOPIE
 * rien : `src/components/avatar.tsx` importe `PRESENCE_HEX` et `presenceTone`
 * de la source de vérité — une divergence y est impossible par construction,
 * ce qui vaut mieux qu'un miroir gardé. Le dernier bloc de ce fichier garde
 * CETTE propriété : le web consomme la SSOT et ne redéclare aucune carte
 * état → couleur. Ne pas « réparer » ce témoin en recréant un `user-status.ts`
 * côté web : ce serait ressusciter le miroir que l'architecture a éliminé.
 *
 * Les plateformes DOIVENT rendre la même couleur pour un même état : une divergence
 * afficherait un contact « en ligne » en vert émeraude sur un client et dans un
 * vert légèrement différent — ou pire, un `idle` en orange — sur un autre, pour
 * la même donnée serveur. Le point de présence est vu côte à côte (une liste de
 * conversations affiche web et mobile de la même personne) ; l'écart se voit.
 *
 * Jusqu'ici l'invariant ne tenait que par des consignes en commentaire
 * (« Ne JAMAIS redéclarer ces couleurs localement », « miroir web
 * PRESENCE_DOT_CLASS et Android meeshyPresenceDotColor »). Une consigne n'est
 * pas un témoin : une teinte a pu dériver sur un seul site — ou un état a pu
 * être recâblé sur le mauvais ton — sans que rien ne rougisse. Même esprit et
 * même mécanique que `presence-mirror-parity.test.ts` (le barème temporel) :
 * une règle unique, recensée là où elle se duplique, et un témoin qui tombe au
 * ROUGE dès qu'une seule teinte, ou un seul câblage état → ton, change sur un
 * seul des quatre sites.
 *
 * NB : le test lit les couleurs là où chaque plateforme les DÉCLARE (littéraux
 * `Color(hex:)` Swift, `Color(0xFF…)` Kotlin). Il n'exige AUCUNE modification
 * des sources iOS/Android/web.
 *
 * L'état `offline` est HORS de la table état → couleur : les quatre clients ne
 * rendent AUCUN point pour lui (iOS `showsIndicator == false`, Android renvoie
 * `null`, `presenceTone` web rend `null`). La couleur `muted` reste définie centralement pour
 * les seuls contextes LABELLISÉS (« Hors ligne », « vu il y a X »), hors du
 * point d'avatar — le témoin ne gouverne donc que les trois états qui rendent
 * un point coloré : `online`, `away`, `idle`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { PRESENCE_HEX } from '../utils/user-presence.js';

const SWIFT_COLORS_SOURCE = join(
  __dirname,
  '../../MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift'
);
const SWIFT_STYLE_SOURCE = join(
  __dirname,
  '../../MeeshySDK/Sources/MeeshyUI/Theme/PresenceStyle.swift'
);
const KOTLIN_PALETTE_SOURCE = join(
  __dirname,
  '../../../apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyPalette.kt'
);
const KOTLIN_AVATAR_SOURCE = join(
  __dirname,
  '../../../apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshyAvatar.kt'
);
const WEB_AVATAR_SOURCE = join(__dirname, '../../../apps/web/src/components/avatar.tsx');
const WEB_SOURCES_ROOT = join(__dirname, '../../../apps/web/src');

/** Ton logique → hex de référence (SSOT TS). */
type Tone = 'success' | 'warning' | 'muted';

/** Les trois états qui rendent un point COLORÉ, et leur ton. */
const COLORED_DOT_STATES = [
  { state: 'online', tone: 'success' as Tone },
  { state: 'away', tone: 'warning' as Tone },
  { state: 'idle', tone: 'muted' as Tone },
];

/** Ramène un hex en MAJUSCULES, sans `#` de tête, pour comparer les formes. */
function canon(hex: string): string {
  return hex.replace(/^#/, '').toUpperCase();
}

/** `PRESENCE_HEX` (avec `#`) → hex canonique par ton. */
const TS_TONE_HEX: Record<Tone, string> = {
  success: canon(PRESENCE_HEX.success),
  warning: canon(PRESENCE_HEX.warning),
  muted: canon(PRESENCE_HEX.muted),
};

/** Littéral `public static let NAME = Color(hex: "RRGGBB")` d'iOS. */
function swiftColorHex(source: string, name: string): string {
  const pattern = new RegExp(
    `public static let ${name}\\s*=\\s*Color\\(hex:\\s*"([0-9A-Fa-f]{6})"\\)`
  );
  const match = source.match(pattern);
  if (!match) {
    throw new Error(
      `Couleur Swift \`MeeshyColors.${name}\` introuvable — la déclaration a-t-elle changé de forme ?`
    );
  }
  return canon(match[1]);
}

/** Littéral `val Name = Color(0xFFRRGGBB)` d'Android (ARGB, alpha `FF`). */
function kotlinColorHex(source: string, name: string): string {
  const pattern = new RegExp(`val ${name}\\s*=\\s*Color\\(0x[Ff]{2}([0-9A-Fa-f]{6})\\)`);
  const match = source.match(pattern);
  if (!match) {
    throw new Error(
      `Couleur Kotlin \`MeeshyPalette.${name}\` introuvable — la déclaration a-t-elle changé de forme ?`
    );
  }
  return canon(match[1]);
}

/**
 * Ton retourné par le `switch` de `PresenceState.dotColor` (iOS) pour un état.
 * Les cas combinés (`case .idle, .offline: return MeeshyColors.neutral400`)
 * sont couverts : le motif accepte l'état n'importe où dans la liste du `case`.
 */
function swiftStateToken(source: string, state: string): string {
  const pattern = new RegExp(
    `case[^:\\n]*\\.${state}\\b[^:\\n]*:\\s*return\\s+MeeshyColors\\.(\\w+)`
  );
  const match = source.match(pattern);
  if (!match) {
    throw new Error(
      `Câblage Swift \`dotColor\` pour \`.${state}\` introuvable — le switch a-t-il changé de forme ?`
    );
  }
  return match[1];
}

/** Ton retourné par le `when` de `meeshyPresenceDotColor` (Android) pour un état. */
function kotlinStateToken(source: string, state: string): string {
  const pattern = new RegExp(
    `PresenceState\\.${state}\\b[^\\n]*->\\s*MeeshyPalette\\.(\\w+)`
  );
  const match = source.match(pattern);
  if (!match) {
    throw new Error(
      `Câblage Kotlin \`meeshyPresenceDotColor\` pour \`${state}\` introuvable — le when a-t-il changé de forme ?`
    );
  }
  return match[1];
}

/** Token de couleur natif → ton logique (iOS `neutral400`/Android `Neutral400` = `muted`). */
const NATIVE_TOKEN_TO_TONE: Record<string, Tone> = {
  success: 'success',
  Success: 'success',
  warning: 'warning',
  Warning: 'warning',
  neutral400: 'muted',
  Neutral400: 'muted',
};

/** Sources `.ts`/`.tsx` du web, tests exclus, en chemins absolus. */
function webSourceFiles(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return webSourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('palette de présence 1/3/5 — TS, Swift et Kotlin ne peuvent pas diverger, le web consomme la SSOT', () => {
  const swiftColors = readFileSync(SWIFT_COLORS_SOURCE, 'utf8');
  const swiftStyle = readFileSync(SWIFT_STYLE_SOURCE, 'utf8');
  const kotlinPalette = readFileSync(KOTLIN_PALETTE_SOURCE, 'utf8');
  const kotlinAvatar = readFileSync(KOTLIN_AVATAR_SOURCE, 'utf8');

  it('les couleurs TS sont bien la palette produit 1/3/5 (contre-épreuve)', () => {
    // Ancre le test sur les valeurs attendues : une extraction native cassée qui
    // rendrait la même valeur des deux côtés ne « passerait » pas contre un TS
    // lui-même faux.
    expect(TS_TONE_HEX).toEqual({
      success: '34D399',
      warning: 'FBBF24',
      muted: '9CA3AF',
    });
  });

  it('iOS MeeshyColors applique exactement les hex de référence', () => {
    expect({
      success: swiftColorHex(swiftColors, 'success'),
      warning: swiftColorHex(swiftColors, 'warning'),
      muted: swiftColorHex(swiftColors, 'neutral400'),
    }).toEqual(TS_TONE_HEX);
  });

  it('Android MeeshyPalette applique exactement les hex de référence', () => {
    expect({
      success: kotlinColorHex(kotlinPalette, 'Success'),
      warning: kotlinColorHex(kotlinPalette, 'Warning'),
      muted: kotlinColorHex(kotlinPalette, 'Neutral400'),
    }).toEqual(TS_TONE_HEX);
  });

  it.each(COLORED_DOT_STATES)(
    'iOS dotColor câble $state sur le bon ton (couleur $tone)',
    ({ state, tone }) => {
      const iosTone = NATIVE_TOKEN_TO_TONE[swiftStateToken(swiftStyle, state)];
      expect(iosTone).toBe(tone);
      expect(swiftColorHex(swiftColors, tone === 'muted' ? 'neutral400' : tone)).toBe(
        TS_TONE_HEX[tone]
      );
    }
  );

  it.each(COLORED_DOT_STATES)(
    'Android meeshyPresenceDotColor câble $state sur le bon ton (couleur $tone)',
    ({ state, tone }) => {
      const androidTone =
        NATIVE_TOKEN_TO_TONE[kotlinStateToken(kotlinAvatar, state.toUpperCase())];
      expect(androidTone).toBe(tone);
    }
  );

  it('le web importe la palette de la source de vérité, sans la recopier', () => {
    const avatar = readFileSync(WEB_AVATAR_SOURCE, 'utf8');
    expect(avatar).toMatch(
      /import\s*\{[^}]*\bPRESENCE_HEX\b[^}]*\bpresenceTone\b[^}]*\}\s*from\s*'@meeshy\/shared\/utils\/user-presence'/
    );
  });

  it('aucune source web ne redéclare une carte état → couleur de présence', () => {
    const mirrors = webSourceFiles(WEB_SOURCES_ROOT).filter(file =>
      /\b(PRESENCE_DOT_CLASS|PRESENCE_BADGE_CLASS|PRESENCE_HEX|PRESENCE_TONE)\s*[:=]/.test(
        readFileSync(file, 'utf8')
      )
    );
    expect(mirrors).toEqual([]);
  });
});
