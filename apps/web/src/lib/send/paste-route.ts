/**
 * **CE QU'ON COLLE PART TOUJOURS** (#9037) — la loi PURE du collage dans le
 * champ du composer de conversation.
 *
 *  - un FICHIER collé (image, audio, vidéo, document) devient la pièce jointe
 *    elle-même. Le presse-papiers qui porte un fichier porte souvent AUSSI son
 *    nom ou son chemin en texte (Finder, explorateur) : ce texte n'est jamais
 *    écrit dans le champ ;
 *  - un TEXTE qui ferait dépasser la limite que le serveur accepte part en
 *    document `.txt` joint, et le champ reste tel qu'il était ;
 *  - tout le reste est laissé au navigateur (`native`).
 *
 * LA LIMITE EST CELLE DU SERVEUR, mesurée dans la passerelle :
 * `MESSAGE_LIMITS.MAX_MESSAGE_LENGTH` (`services/gateway/src/config/
 * message-limits.ts`, défaut 4000) borne `SendMessageBodySchema.content`
 * (REST) et `validateMessageLength` (socket). Le `MAX_MESSAGE_LENGTH = 2000`
 * de `@meeshy/shared/utils/languages` DIVERGE de ce que le serveur accepte et
 * n'est pas lu ici. Les deux comptent en unités UTF-16 (`String.length`, le
 * `.max()` de Zod), comme ce module.
 */
export const SERVER_MESSAGE_MAX_LENGTH = 4000;

export type PastedContent = { readonly files: readonly File[]; readonly text: string };

export type PasteRoute = { readonly kind: 'native' } | { readonly kind: 'attach'; readonly files: readonly File[] };

type ClipboardItemLike = { readonly kind: string; readonly getAsFile: () => File | null };

export type ClipboardLike = {
  readonly files: ArrayLike<File>;
  readonly items: ArrayLike<ClipboardItemLike>;
  readonly getData: (type: string) => string;
};

export function pastedContentOf(data: ClipboardLike | null): PastedContent {
  if (data === null) return { files: [], text: '' };
  const listed = Array.from(data.files);
  const files =
    listed.length > 0
      ? listed
      : Array.from(data.items)
          .filter((item) => item.kind === 'file')
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null);
  return { files, text: data.getData('text/plain') };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function pastedTextFileName(now: Date): string {
  const day = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `texte-colle-${day}-${time}.txt`;
}

export function routePastedContent(input: {
  readonly pasted: PastedContent;
  /** Le texte du champ AVANT le collage. */
  readonly current: string;
  /** La sélection que le collage remplace — un curseur : `start === end`. */
  readonly selection: { readonly start: number; readonly end: number };
  readonly now: Date;
  readonly maxLength?: number;
}): PasteRoute {
  const { pasted, current, selection } = input;
  if (pasted.files.length > 0) return { kind: 'attach', files: pasted.files };
  if (pasted.text === '') return { kind: 'native' };
  const kept = current.length - Math.max(0, selection.end - selection.start);
  if (kept + pasted.text.length <= (input.maxLength ?? SERVER_MESSAGE_MAX_LENGTH)) return { kind: 'native' };
  return { kind: 'attach', files: [new File([pasted.text], pastedTextFileName(input.now), { type: 'text/plain;charset=utf-8' })] };
}
