/**
 * **COPIER UN TEXTE, AVEC SON REPLI** (#8734) — `navigator.clipboard` exige un
 * contexte sûr et, selon le navigateur, un geste encore « frais » : un menu
 * qui se referme avant d'écrire peut le perdre. Le repli historique (une zone
 * de texte hors écran, sélectionnée, `execCommand('copy')`) couvre ces cas.
 * L'issue se DIT toujours : un geste sans effet ne se tait pas.
 *
 * La zone vit là où vit le focus (#8986) : une `<dialog>` modale rend inerte
 * tout ce qui est hors d'elle, et une zone posée dans `body` n'y copierait rien.
 */
export type CopyTextOutcome = 'copied' | 'failed';

export type ClipboardEnv = {
  readonly writeText: ((text: string) => Promise<void>) | undefined;
  readonly legacyCopy: (text: string) => boolean;
};

function legacyCopyInDocument(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.setAttribute('aria-hidden', 'true');
  field.style.position = 'fixed';
  field.style.insetInlineStart = '-9999px';
  field.style.opacity = '0';
  (previous?.closest('dialog') ?? document.body).appendChild(field);
  field.select();
  try {
    return document.execCommand('copy');
  } finally {
    field.remove();
    previous?.focus();
  }
}

export function browserClipboard(): ClipboardEnv {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  return {
    writeText: clipboard === undefined ? undefined : (text) => clipboard.writeText(text),
    legacyCopy: legacyCopyInDocument,
  };
}

const legacy = (env: ClipboardEnv, text: string): CopyTextOutcome => {
  try {
    return env.legacyCopy(text) ? 'copied' : 'failed';
  } catch {
    return 'failed';
  }
};

export async function copyPlainText(text: string, env: ClipboardEnv = browserClipboard()): Promise<CopyTextOutcome> {
  if (env.writeText === undefined) return legacy(env, text);
  try {
    await env.writeText(text);
    return 'copied';
  } catch {
    return legacy(env, text);
  }
}
