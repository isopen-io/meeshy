import { createPortal } from 'react-dom';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { Glyph } from './glyph';

/**
 * LE VOILE DE DÉPÔT (#9991) — pendant qu'un fichier survole la fenêtre, il
 * dit où le lâcher. `pointer-events: none` : le voile ne vole aucun
 * événement de glisser à la page qu'il couvre.
 */
export function ComposerDropVeil({ language }: { readonly language: InterfaceLanguage }) {
  return createPortal(
    <div
      data-composer-drop-veil=""
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[230] grid place-items-center bg-black/35 p-6"
    >
      <div className="glass-prominent flex items-center gap-3 rounded-2xl border-2 border-dashed border-white/60 px-6 py-5 text-base font-semibold text-white">
        <Glyph name="file" size={26} />
        <span>{translate(language, 'composer.drop.veil')}</span>
      </div>
    </div>,
    document.body,
  );
}
