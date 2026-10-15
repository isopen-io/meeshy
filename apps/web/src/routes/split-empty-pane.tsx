import { GlyphSvg } from '@/components/glyph';
import { COMMUNITIES_GLYPHS } from '@/components/glyphs-communities';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

/**
 * LE VOLET DROIT QUAND AUCUNE CONVERSATION N'EST OUVERTE (#10073) — sur grand
 * écran, `/chats` rend la liste à gauche et cet état dessiné à droite.
 *
 * Une table SYNCHRONE, pas une clé du catalogue d'interface : ce volet ne
 * s'affiche qu'à partir de 1024 px, et ses deux phrases n'ont rien à faire dans
 * le catalogue que chaque téléphone télécharge au démarrage (même discipline
 * que `lib/skip-link.ts`). Ce module est chargé à la demande par
 * `split-frame.tsx`, jamais avant le premier pixel.
 */
type EmptyPaneLabels = { readonly title: string; readonly hint: string };

const LABELS: Readonly<Record<InterfaceLanguage, EmptyPaneLabels>> = {
  fr: { title: 'Choisissez une conversation', hint: 'Elle s’ouvrira ici, à côté de la liste.' },
  en: { title: 'Choose a conversation', hint: 'It will open here, next to the list.' },
  es: { title: 'Elige una conversación', hint: 'Se abrirá aquí, junto a la lista.' },
  pt: { title: 'Escolha uma conversa', hint: 'Ela abrirá aqui, ao lado da lista.' },
  de: { title: 'Wähle eine Unterhaltung', hint: 'Sie öffnet sich hier, neben der Liste.' },
  it: { title: 'Scegli una conversazione', hint: 'Si aprirà qui, accanto all’elenco.' },
  ar: { title: 'اختر محادثة', hint: 'ستُفتح هنا، بجانب القائمة.' },
};

export function emptyPaneLabels(language: InterfaceLanguage): EmptyPaneLabels {
  return LABELS[language];
}

export default function SplitEmptyPane() {
  const { title, hint } = emptyPaneLabels(currentInterfaceLanguage());
  return (
    <section data-split-empty="" aria-labelledby="split-empty-title" className="grid h-dvh place-items-center p-8 pt-safe text-center">
      <div className="grid max-w-[22rem] justify-items-center gap-3">
        <span data-split-empty-mark="" className="grid size-18 place-items-center rounded-full" style={{ color: 'var(--color-ios-brand)' }}>
          <GlyphSvg glyph={COMMUNITIES_GLYPHS.chatsCircle} size={34} />
        </span>
        <h2 id="split-empty-title" className="text-title font-bold" style={{ color: 'var(--color-ios-ink)' }}>
          {title}
        </h2>
        <p className="text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
          {hint}
        </p>
      </div>
    </section>
  );
}
