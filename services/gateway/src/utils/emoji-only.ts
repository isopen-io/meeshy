/**
 * **Un contenu fait UNIQUEMENT d'emojis** (espaces tolérés), borné à 40
 * caractères. Site unique de la règle : la traduction n'envoie pas un tel
 * message au traducteur, et le filet de déduplication par contenu (#6910) le
 * laisse passer, pour que 😂😂😂 tapés en série restent trois messages (#7985).
 */
const EMOJI_ONLY_PATTERN = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}\u{1F3FB}-\u{1F3FF}\s]+$/u;

export function isEmojiOnly(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= 40 && EMOJI_ONLY_PATTERN.test(trimmed);
}
