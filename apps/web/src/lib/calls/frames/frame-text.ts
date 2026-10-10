import type { FrameNames, FrameTitle } from './frame-spec';

/**
 * **LES MOTS D'UN CADRE** (#8743) — ce que le titre, le sous-titre et les
 * noms ÉCRIVENT, en fonctions pures : la mesure du texte est injectée, pour
 * que la règle (§ 4.5 et § 5.3 de la spec) se prouve sans canevas.
 */

/** Une personne de l'appel, moi compris — le nom qu'on voit déjà dans l'appel, et son @pseudo s'il est connu. */
export type FramePerson = { readonly id: string; readonly name: string; readonly handle: string | null; readonly isSelf: boolean };

/** Ce que le cadre écrit hors des visages : le nom du groupe (en groupe seulement), la date déjà formatée, l'accent de la conversation. */
export type FrameTexts = {
  readonly groupName: string | null;
  readonly isGroup: boolean;
  readonly date: string;
  readonly accent: { readonly primary: string; readonly secondary: string } | null;
};

export type TitleContext = { readonly people: readonly FramePerson[]; readonly texts: FrameTexts };

/** L'UNIQUE graphie de la marque dans un cadre : en minuscules, jamais passée en capitales. */
export const BRAND_WORD = 'meeshy';

const VISIBLE_NAMES = 3;

/** « Awa » · « Awa & Karim » · « Awa, Karim & Lina » · « Awa, Karim, Lina + 2 ». */
export function namesText(people: readonly FramePerson[]): string {
  const names = people.map((person) => person.name.trim()).filter((name) => name.length > 0);
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= VISIBLE_NAMES) return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1] ?? ''}`;
  return `${names.slice(0, VISIBLE_NAMES).join(', ')} + ${names.length - VISIBLE_NAMES}`;
}

/** Un pseudo, toujours préfixé d'UN seul « @ ». */
export const handleText = (handle: string): string => `@${handle.trim().replace(/^@+/, '')}`;

const hasText = (value: string | null): value is string => value !== null && value.trim().length > 0;

/**
 * Le texte d'un titre ou d'un sous-titre. `group` hors groupe (ou sans nom
 * de groupe) ⇒ les noms : un duo n'a pas de nom de groupe à afficher, et un
 * titre vide ne serait pas un choix. La marque ne passe jamais en capitales.
 * Les sources de l'heure, du lieu, du monument et de l'émotion (#9197) n'écrivent
 * rien tant que leur moteur n'est pas là (doc 06, étape 3.3) : un texte vide se
 * tait, il ne remplace pas la donnée par une autre.
 */
export function titleText(source: FrameTitle['source'], context: TitleContext, textCase: FrameTitle['case'] = 'as-is'): string {
  const raw = ((): string => {
    switch (source) {
      case 'group':
        return context.texts.isGroup && hasText(context.texts.groupName) ? context.texts.groupName.trim() : namesText(context.people);
      case 'names':
        return namesText(context.people);
      case 'brand':
        return BRAND_WORD;
      case 'date':
        return context.texts.date.trim();
      case 'none':
        return '';
      case 'time':
      case 'datetime':
      case 'place':
      case 'landmark':
      case 'emotion':
        return '';
    }
  })();
  return textCase === 'upper' && source !== 'brand' ? raw.toLocaleUpperCase() : raw;
}

/** Les lignes qu'une personne porte sous `show` : le nom, le @pseudo, ou les deux sur deux lignes. Sans pseudo connu, le nom le remplace. */
export function personLines(person: FramePerson, show: FrameNames['show']): readonly string[] {
  const name = person.name.trim();
  const handle = hasText(person.handle) ? handleText(person.handle) : null;
  switch (show) {
    case 'none':
      return [];
    case 'name':
      return name.length > 0 ? [name] : handle === null ? [] : [handle];
    case 'handle':
      return handle === null ? (name.length > 0 ? [name] : []) : [handle];
    case 'both':
      return [name, handle].filter((line): line is string => line !== null && line.length > 0);
  }
}

/** Une ligne de la liste des noms (style `list`) : « Awa », « @awa » ou « Awa @awa ». */
export const listEntry = (person: FramePerson, show: FrameNames['show']): string => personLines(person, show).join(' ');

/** Mesure la largeur de `text` à `px` pixels — le canevas en production, une règle fixe dans les témoins. */
export type MeasureText = (text: string, px: number) => number;

export type FittedText = { readonly text: string; readonly px: number };

const MIN_SHARE = 0.6;
const ELLIPSIS = '…';

/**
 * Un texte trop long pour `maxWidth` rétrécit jusqu'à 60 % de sa taille,
 * puis se tronque d'une ellipse (§ 5.3) — coupé entre deux points de code,
 * jamais au milieu d'un caractère.
 */
export function fitText(measure: MeasureText, text: string, maxWidth: number, fontPx: number): FittedText {
  if (text.length === 0 || maxWidth <= 0) return { text: maxWidth <= 0 ? '' : text, px: fontPx };
  const width = measure(text, fontPx);
  if (width <= maxWidth) return { text, px: fontPx };
  const floor = fontPx * MIN_SHARE;
  const scaled = Math.max(floor, (fontPx * maxWidth) / width);
  const settle = (px: number): number => (px > floor && measure(text, px) > maxWidth ? settle(Math.max(floor, px * 0.97)) : px);
  const px = settle(scaled);
  if (measure(text, px) <= maxWidth) return { text, px };
  const glyphs = Array.from(text);
  const cut = (keep: number): string => (keep <= 0 ? ELLIPSIS : `${glyphs.slice(0, keep).join('').trimEnd()}${ELLIPSIS}`);
  const longest = (low: number, high: number): number => {
    if (low >= high) return low;
    const middle = Math.ceil((low + high) / 2);
    return measure(cut(middle), px) <= maxWidth ? longest(middle, high) : longest(low, middle - 1);
  };
  const keep = longest(0, glyphs.length - 1);
  return { text: keep === 0 && measure(ELLIPSIS, px) > maxWidth ? '' : cut(keep), px };
}
