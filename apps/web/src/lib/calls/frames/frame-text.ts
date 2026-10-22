import type { FrameNames, FrameTitle } from './frame-spec';

/** La règle « rétrécir puis tronquer » vit dans `lib/canvas/text-fit.ts`, partagée avec les cadres de gloire (#10159). */
export { fitText, type FittedText, type MeasureText } from '@/lib/canvas/text-fit';

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
