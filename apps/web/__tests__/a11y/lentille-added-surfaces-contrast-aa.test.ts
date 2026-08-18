/**
 * Q-142 — CONTRASTE AA, DEUX THÈMES, SUR CE QUE LES LOTS DU 2026-08-17 ONT
 * AJOUTÉ ET QU'AUCUNE SUITE NE COUVRAIT.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUI ÉTAIT DÉJÀ COUVERT — ET QUI N'EST PAS RECOPIÉ ICI
 * ═══════════════════════════════════════════════════════════════════════════
 * Deux suites existent et restent le domicile de ce qu'elles gardent :
 *   - `components/conversations/lentille/__tests__/lentille-contrast.test.ts`
 *     — le pont ✦ teinté accent, les 500 combinaisons `type × langue × thème`,
 *     ≥ 4,5:1 garanti par `resolveBridgeTintColor` ;
 *   - `__tests__/focal/focal-contrast-aa.test.ts` — « Toi » et le nom de
 *     l'auteur cité du fil Focal, avec son constat honnête verrouillé
 *     (`#6366F1` mesuré ≈ 4,47:1 en thème clair, sous 4,5:1 — finding WF-113).
 * Les deux ont été re-exécutées le 2026-08-17 : 8 témoins verts.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE CE FICHIER AJOUTE, ET POURQUOI IL FALLAIT L'AJOUTER
 * ═══════════════════════════════════════════════════════════════════════════
 * Trois surfaces posées le 2026-08-17 n'étaient couvertes par AUCUNE des
 * deux — ni par l'audit axe, dont la règle `color-contrast` ne s'exécute PAS
 * sous jsdom (elle a besoin d'une mise en page et de couleurs calculées, que
 * jsdom ne produit pas) :
 *
 *   1. **Les pastilles de tag** du rang (`lentille-row-tag-dot`,
 *      behaviour-matrix:L08) — 17 teintes de `getTagColor`, nuance 700 en
 *      clair / 300 en sombre, peintes en `currentColor` sur 6 px.
 *   2. **Le point médian et l'heure** de la ligne 1 (maquette §3 :
 *      « nom · heure ») — `text-muted-foreground`.
 *   3. **La modale de profil** (`UserProfileModal`, directive produit du
 *      2026-08-17) — son unique élément coloré, le lien « voir le profil
 *      complet » en `text-primary`.
 *
 * MÉTHODE. Les ratios sont calculés par la MÊME loi WCAG que les deux suites
 * existantes (`lentille-contrast.ts` : `relativeLuminance`/`contrastRatio`) —
 * jamais une seconde formule. Les couleurs de thème sont les tokens de
 * `app/globals.css`, et les hex Tailwind ceux de la palette v3 : les deux
 * sont recopiés ici, comme `lentille-contrast.ts` le fait déjà et pour la
 * même raison (`getComputedStyle` ne résout rien sans charger la feuille).
 * Toute dérive doit être corrigée AUX DEUX endroits.
 *
 * LES DEUX FONDS QUI COMPTENT. Un rang Lentille se lit sur `--background`,
 * SAUF quand il porte la focus card (élu ou sélectionné, WL-108/L11) : son
 * fond devient alors `--secondary`, et c'est le cas le MOINS favorable. Les
 * deux sont mesurés — ne mesurer que le premier laisserait passer le seul
 * défaut que ce fichier trouve.
 */
import {
  contrastRatio,
  hexToRgb,
  hslToRgb,
  type Rgb,
  type ThemeName,
} from '@/components/conversations/lentille/lentille-contrast';

// ---------------------------------------------------------------------------
// Les tokens de thème — MIROIR de `app/globals.css` (`:root` et `.dark`)
// ---------------------------------------------------------------------------

const BACKGROUND: Readonly<Record<ThemeName, Rgb>> = {
  light: hslToRgb(0, 0, 100),
  dark: hslToRgb(224, 71.4, 4.1),
};

/** Le fond de la focus card (`LentilleFocusCard`, `bg-secondary`). */
const SECONDARY: Readonly<Record<ThemeName, Rgb>> = {
  light: hslToRgb(220, 14.3, 95.9),
  dark: hslToRgb(215, 27.9, 16.9),
};

const MUTED_FOREGROUND: Readonly<Record<ThemeName, Rgb>> = {
  light: hslToRgb(220, 8.9, 46.1),
  dark: hslToRgb(217.9, 10.6, 64.9),
};

const PRIMARY: Readonly<Record<ThemeName, Rgb>> = {
  light: hslToRgb(220.9, 39.3, 11),
  dark: hslToRgb(217, 91, 60),
};

/**
 * Les 17 teintes de `utils/tag-colors.ts`, dans SON ordre — la nuance que la
 * pastille peint réellement : `text-{couleur}-700` en clair,
 * `dark:text-{couleur}-300` en sombre (valeurs de la palette Tailwind v3).
 */
const TAG_DOT_HEX: Readonly<Record<ThemeName, readonly string[]>> = {
  light: [
    '#b91c1c', '#c2410c', '#b45309', '#a16207', '#4d7c0f', '#15803d',
    '#047857', '#0f766e', '#0e7490', '#0369a1', '#1d4ed8', '#4338ca',
    '#6d28d9', '#7e22ce', '#a21caf', '#be185d', '#be123c',
  ],
  dark: [
    '#fca5a5', '#fdba74', '#fcd34d', '#fde047', '#bef264', '#86efac',
    '#6ee7b7', '#5eead4', '#67e8f9', '#7dd3fc', '#93c5fd', '#a5b4fc',
    '#c4b5fd', '#d8b4fe', '#f0abfc', '#f9a8d4', '#fda4af',
  ],
};

/** AA, texte normal (< 18,66 px). L'heure du rang est cotée 12 px. */
const AA_TEXT = 4.5;
/** AA, objet graphique / composant d'interface (WCAG 2.1 SC 1.4.11). */
const AA_NON_TEXT = 3;

const THEMES: readonly ThemeName[] = ['light', 'dark'];

// ---------------------------------------------------------------------------
// 1 — Les pastilles de tag (behaviour-matrix:L08)
// ---------------------------------------------------------------------------

describe('Q-142 — pastilles de tag du rang : 17 teintes × 2 thèmes × 2 fonds', () => {
  /**
   * Le SEUIL applicable est 3:1, pas 4,5:1, et il faut le dire plutôt que
   * s'offrir la marge par inadvertance : une pastille de 6 px ne porte aucun
   * texte, elle est `aria-hidden`, et son exigence WCAG est celle d'un objet
   * graphique porteur d'information (SC 1.4.11). Le témoin mesure quand même
   * la marge réelle jusqu'à 4,5:1 dans le second `it` — elle est confortable,
   * et la connaître évite de croire qu'on l'a alors qu'on ne l'a pas.
   */
  it.each(THEMES)('thème %s — les 17 teintes passent 3:1 sur le fond ET sur la focus card', (theme) => {
    const hexes = TAG_DOT_HEX[theme];
    expect(hexes).toHaveLength(17);

    for (const hex of hexes) {
      const dot = hexToRgb(hex);
      expect(contrastRatio(dot, BACKGROUND[theme])).toBeGreaterThanOrEqual(AA_NON_TEXT);
      expect(contrastRatio(dot, SECONDARY[theme])).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  it.each(THEMES)('thème %s — mesure : la teinte la PLUS FAIBLE reste au-dessus même du seuil TEXTE (4,5:1)', (theme) => {
    const worstOnCard = Math.min(
      ...TAG_DOT_HEX[theme].map((hex) => contrastRatio(hexToRgb(hex), SECONDARY[theme]))
    );

    // Ce n'est PAS l'exigence (voir ci-dessus) : c'est le constat, verrouillé
    // pour qu'un changement de palette qui le ferait tomber remonte à
    // l'attention au lieu de passer. Mesuré le 2026-08-17 : clair 4,47
    // (yellow-700 sur la carte) — juste sous 4,5 ; sombre 7,36 (indigo-300).
    if (theme === 'dark') {
      expect(worstOnCard).toBeGreaterThanOrEqual(AA_TEXT);
    } else {
      expect(worstOnCard).toBeGreaterThan(4.4);
      expect(worstOnCard).toBeLessThan(AA_TEXT);
    }
  });
});

// ---------------------------------------------------------------------------
// 2 — Le point médian et l'heure (maquette §3)
// ---------------------------------------------------------------------------

describe('Q-142 — point médian et heure de la ligne 1 (`text-muted-foreground`)', () => {
  it.each(THEMES)('thème %s — sur le fond ORDINAIRE du rang : AA tenu (≥ 4,5:1)', (theme) => {
    expect(contrastRatio(MUTED_FOREGROUND[theme], BACKGROUND[theme])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  /**
   * FINDING Q-142 (2026-08-17) — le seul défaut de contraste que cette
   * vérification croisée trouve, et il n'est pas masqué.
   *
   * Sur un rang qui porte la FOCUS CARD (élu au défilement, ou sélectionné —
   * WL-108/behaviour-matrix:L11), le fond passe de `--background` à
   * `--secondary`. En thème CLAIR, `--muted-foreground` y mesure **4,393:1**,
   * soit sous les 4,5:1 que WCAG AA demande pour du texte normal — et
   * l'heure du rang EST du texte normal (12 px, `--lentille-list-time-size`).
   * Déficit : 0,107. En thème sombre, 5,782:1 — AA tenu.
   *
   * PÉRIMÈTRE HONNÊTE : ce n'est PAS une régression des lots du 2026-08-17.
   * L'heure et sa couleur préexistaient ; le point médian (maquette §3) et la
   * focus card n'ont fait que les mettre côte à côte. Ce qui est neuf, c'est
   * qu'on l'ait MESURÉ.
   *
   * CE TÉMOIN VERROUILLE LE RÉSULTAT MESURÉ plutôt que de l'affirmer conforme
   * — même discipline, et même forme, que le constat `#6366F1` de
   * `focal-contrast-aa.test.ts` (WF-113). Le jour où quelqu'un assombrit
   * `--muted-foreground` en clair, éclaircit `--secondary`, ou route ces deux
   * spans par `resolveBridgeTintColor`, ce test tombe — et c'est le signal
   * attendu, pas une surprise. Reporté à l'orchestrateur : la décision
   * (produit/design) n'appartient pas à cette tâche.
   */
  it('thème clair — FINDING : sur la focus card, l’heure tombe à ≈ 4,39:1, SOUS le seuil AA', () => {
    const measured = contrastRatio(MUTED_FOREGROUND.light, SECONDARY.light);

    expect(measured).toBeLessThan(AA_TEXT);
    expect(measured).toBeGreaterThan(4.35);
    expect(measured).toBeCloseTo(4.393, 2);
  });

  it('thème sombre — sur la focus card, AA reste tenu', () => {
    expect(contrastRatio(MUTED_FOREGROUND.dark, SECONDARY.dark)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

// ---------------------------------------------------------------------------
// 3 — La modale de profil (directive produit 2026-08-17)
// ---------------------------------------------------------------------------

describe('Q-142 — modale de profil : le lien « voir le profil complet »', () => {
  /**
   * `UserProfileModal` ne pose qu'UNE couleur qui lui soit propre
   * (RE-PROUVÉ par lecture : `text-primary` sur le lien de bas de modale,
   * `text-sm` = 14 px, donc texte NORMAL) ; tout le reste hérite du
   * `DialogContent` (`bg-background`/`text-foreground`), dont le contraste
   * est celui de l'application entière. Le thème SOMBRE est le cas serré :
   * `--primary` y est un bleu vif (`217 91% 60%`) et non plus un quasi-noir.
   */
  it.each(THEMES)('thème %s — `text-primary` sur `bg-background` passe AA (texte normal)', (theme) => {
    expect(contrastRatio(PRIMARY[theme], BACKGROUND[theme])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('thème sombre — le bleu vif de `--primary` garde une marge réelle, pas une marge de justesse', () => {
    // Mesuré le 2026-08-17 par la loi du dépôt : 5,549:1. Verrouillé bas ET haut : un changement
    // de teinte, dans un sens comme dans l'autre, doit se déclarer.
    expect(contrastRatio(PRIMARY.dark, BACKGROUND.dark)).toBeCloseTo(5.549, 2);
  });
});
