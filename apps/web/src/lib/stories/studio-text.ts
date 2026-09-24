import { SERVED_TEXT_STYLES, type ServedTextStyle } from '@/lib/canvas/text-appearance';
import { TEXT_EFFECTS, type StoryTextEffect } from '@/lib/canvas/text-effect';

import { IDENTITY_POSE, type StudioPose } from './studio-pose';

/**
 * **UN OBJET TEXTE DU STUDIO** (#6943) — ce que l'auteur pose, déplace,
 * tourne, agrandit, colore et fait traduire. Le studio de #6900 n'en avait
 * qu'UN, d'`id` littéral `'text'`, ancré au centre, sans langue choisie et
 * sans style : trois manques sur les cinq que la directive porteur du
 * 2026-09-17 nomme.
 *
 * Le vocabulaire est celui de `StoryTextObject.swift`, pas un synonyme local :
 * `textStyle` (la POLICE et rien d'autre, depuis #4850), `textEffect` (ce qui
 * brille ou porte une ombre), `textColor`, `textAlign`, `backgroundStyle`, et
 * la langue SOURCE — qu'iOS nomme `sourceLanguage` sur le modèle et qui
 * voyage en **`locale` sur l'enveloppe** de l'objet v3
 * (`CanvasV3Migration.swift:273`), jamais dans le `payload`.
 */
export type StudioTextLayer = {
  readonly id: string;
  readonly text: string;
  /** La langue SOURCE de CE texte — celle que le serveur traduira
   * (`triggerStoryTextObjectTranslation`). Elle est CHOISIE, jamais devinée :
   * un studio qui recopie la langue d'interface fait traduire un texte arabe
   * depuis le français. */
  readonly language: string;
  readonly style: ServedTextStyle;
  readonly effect: StoryTextEffect | 'none';
  /** Hex SANS dièse — la forme que le corpus réel porte
   * (`StoryTextObject.swift:114`). */
  readonly color: string;
  readonly align: 'left' | 'center' | 'right';
  /** La pastille derrière le texte, hex SANS dièse ; `null` = aucune. */
  readonly background: string | null;
  readonly pose: StudioPose;
};

/** Les langues que l'auteur peut déclarer — les MÊMES sept que le sélecteur
 * iOS (`TextEditToolOptions.swift:454-460`), donc les sept de l'app. */
export const STUDIO_TEXT_LANGUAGES = ['fr', 'en', 'es', 'de', 'it', 'pt', 'ar'] as const;

/** La palette de l'éditeur de texte iOS (`StoryTextEditorView.swift:488-492`),
 * dans son ordre — quatorze couleurs, recopiées telles quelles. */
export const STUDIO_TEXT_COLORS = [
  'FFFFFF', '000000', 'FF2E63', '08D9D6', 'F8B500', '9B59B6', '2ECC71',
  'FF6B6B', '3498DB', 'E91E63', 'FF7F50', '00CED1', 'A855F7', 'F59E0B',
] as const;

/** Les fonds SOLIDES des presets iOS (`StoryTextBackgroundPresets.swift:16-29`),
 * sans `glass` (hors tranche) et sans les variantes à alpha, que la pastille
 * CSS rendrait identiques à l'œil. */
export const STUDIO_TEXT_BACKGROUNDS = ['000000', 'FFFFFF', '6366F1', 'F472B6', '34D399', 'FBBF24', 'F87171'] as const;

/**
 * **CE QU'UNE PASTILLE DE FOND PEUT VALOIR** — l'UNION des presets iOS et de la
 * palette de texte, parce que le rail web offre la SECONDE pour les deux
 * usages (l'encre et la pastille).
 *
 * Défaut trouvé en relisant le lot : le rail proposait un fond pris dans
 * `STUDIO_TEXT_COLORS`, et la relecture du brouillon le validait contre
 * `STUDIO_TEXT_BACKGROUNDS` seuls — six des huit fonds offerts étaient donc
 * **effacés au rechargement**, en silence, sans qu'aucun témoin ne rougisse.
 * C'est la forme d'un contrôle qui a l'air d'avoir un effet et n'en garde pas.
 * Une liste OFFERTE et une liste ACCEPTÉE doivent avoir un seul site.
 */
export const STUDIO_TEXT_BACKGROUND_VALUES = [...STUDIO_TEXT_BACKGROUNDS, ...STUDIO_TEXT_COLORS] as const;

export const STUDIO_TEXT_ALIGNS = ['left', 'center', 'right'] as const;

/** Les styles SERVIS (cinq sur dix-huit) — voir l'arbitrage « aucune police
 * web » de `text-appearance.ts`. */
export const STUDIO_TEXT_STYLES = SERVED_TEXT_STYLES;

/** L'axe EFFET au complet — vingt-cinq valeurs, zéro octet téléchargé —,
 * « aucun » en tête pour que le repos soit le premier choix. */
export const STUDIO_TEXT_EFFECTS = ['none', ...TEXT_EFFECTS] as const;

/** Le défaut du COMPOSER iOS (`StoryTextObject.swift:109`), référentiel 1080.
 * La TAILLE se règle ici par l'échelle du geste (`transform.scale`), jamais
 * par un second curseur : deux réglages pour une seule grandeur divergent. */
export const STUDIO_TEXT_FONT_SIZE = 96;

/**
 * Un identifiant unique DANS CE DOCUMENT — `text-1`, `text-2`… Le studio de
 * #6900 posait l'`id` littéral `'text'`, ce qui interdisait le second objet :
 * deux objets d'un même `id` font un document invalide.
 *
 * Il se calcule depuis les objets EN PLACE, jamais depuis un compteur de
 * module : un brouillon relu au rechargement rapporte ses propres `id`, et un
 * compteur reparti de zéro aurait rendu `text-1` une seconde fois. « Un
 * identifiant qui ne s'alloue pas ne collisionne pas » (#5102) — ici il
 * s'alloue, donc il se calcule contre l'existant.
 */
export function nextTextLayerId(existing: readonly StudioTextLayer[]): string {
  const used = existing.map((layer) => Number.parseInt(layer.id.replace(/^text-/, ''), 10)).filter((n) => Number.isInteger(n));
  return `text-${Math.max(0, ...used) + 1}`;
}

export function newTextLayer(params: { readonly language: string; readonly id: string; readonly text?: string }): StudioTextLayer {
  return {
    id: params.id,
    text: params.text ?? '',
    language: params.language,
    style: 'bold',
    effect: 'none',
    color: 'FFFFFF',
    align: 'center',
    background: null,
    pose: IDENTITY_POSE,
  };
}

/**
 * LE `payload` DE L'OBJET V3 — les clés de `CanvasV3Migration.textPayload`
 * (`CanvasV3Migration.swift:735-775`), et **rien qui vaille le défaut** :
 * `textEffect: 'none'` et `backgroundStyle` absents plutôt que posés à vide,
 * pour qu'un document du studio soit indiscernable d'un document iOS au repos.
 */
export function textLayerPayload(layer: StudioTextLayer): Record<string, unknown> {
  return {
    text: layer.text,
    textStyle: layer.style,
    textColor: layer.color,
    fontSize: STUDIO_TEXT_FONT_SIZE,
    fontFamily: 'system',
    textAlign: layer.align,
    ...(layer.effect !== 'none' ? { textEffect: layer.effect } : {}),
    ...(layer.background !== null ? { backgroundStyle: { type: 'solid', hex: layer.background } } : {}),
  };
}
