/**
 * **LE NOM D'UN CADRE D'APPEL DANS LA LANGUE D'INTERFACE** (#13953) — sans schéma ni dépendance, pour
 * qu'un écran l'importe sans tirer le vocabulaire des cadres dans son paquet. `capture-frames.ts` le
 * réexporte et en tire le schéma de `localizedNames`.
 */

/** Les langues du nom d'un cadre : celles des packs (`PACK_LANGUAGES`). */
export const FRAME_NAME_LANGUAGES = ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'] as const;
export type FrameNameLanguage = (typeof FRAME_NAME_LANGUAGES)[number];

export type FrameLocalizedNames = Partial<Record<FrameNameLanguage, string>>;

/** `pt-BR`, `EN_us` ⇒ `pt`, `en` : les noms des cadres se rangent par code court. */
const shortLanguage = (language: string): string => language.toLowerCase().split(/[-_]/)[0] ?? '';

const isFrameNameLanguage = (language: string): language is FrameNameLanguage => (FRAME_NAME_LANGUAGES as readonly string[]).includes(language);

/**
 * Le nom de `localizedNames` dans la langue d'interface, sinon `name` — le français, que servait chaque
 * cadre d'avant. Vaut pour un motif, un cadre déplié ou une déclinaison.
 */
export function frameDisplayName(owner: { readonly name: string; readonly localizedNames?: FrameLocalizedNames | undefined }, language: string): string {
  const code = shortLanguage(language);
  const localized = isFrameNameLanguage(code) ? owner.localizedNames?.[code] : undefined;
  return localized !== undefined && localized.trim().length > 0 ? localized : owner.name;
}
