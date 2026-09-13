import type { Ref } from 'react';

import { getLanguageInfo } from '@meeshy/shared/utils/languages';

import { Glyph } from './glyph';
import { spokenLanguageName } from '@/lib/view/language-name';

/**
 * LA PASTILLE DE LANGUE (#5828) — miroir de la Language Selector Pill
 * (`UniversalComposerBar+Toolbar.swift:105-129`) : drapeau + code + chevron,
 * dans une capsule TEINTÉE par l'accent en clair / par un lavis blanc en
 * sombre — les DEUX schémas se lisent par la variante `light:` (jamais un
 * test JS, `app.css:26` `@custom-variant light`), jamais une valeur en dur
 * (D-4).
 *
 * L'ENCRE EST `--color-ios-ink` DANS LES DEUX SCHÉMAS, JAMAIS `--accent`
 * (écart assumé avec la description initiale de #5828, trouvé en GATE) —
 * `check-thread-chrome.mjs § 6` mesurait 1,99:1 en clair avec une encre
 * accent sur un fond teinté à l'accent à 15 % (sous la barre AA 4,5:1,
 * `contrastOf`) : `--accent-ink` (`lib/accent.ts`, « le noir ou le blanc,
 * celui des deux qui contraste le PLUS ») est calculé pour une surface peinte
 * à l'accent PLEIN, pas pour un lavis à 15 % — sur ce lavis, quel que soit
 * l'accent, le fond reste proche du blanc (clair) ou du canevas sombre
 * (sombre), et c'est `--color-ios-ink` qui y lit juste, comme sur toute
 * autre surface neutre de l'app.
 *
 * LA CIBLE EST ≥ 44×44 (dimension 5) — la capsule visuelle iOS ne fait que
 * 66×22 pt, SOUS la HIG (`targets/README.md` § 1.4) : le `<button>` porte la
 * cible pleine, la capsule à l'intérieur reste visuellement compacte.
 *
 * LE BOUTON S'ÉLARGIT À SA CAPSULE, IL NE LA CONTIENT PAS DE FORCE
 * (revue-correction) — première forme : `grid size-11` (44×44 FIXE) avec une
 * capsule de ~62 px centrée dedans. La capsule DÉBORDAIT son bouton de 9 px
 * de chaque côté sans que rien ne rougisse : le rectangle du `<button>` reste
 * 44×44, donc la mesure de cible, l'`opacity` et le non-recouvrement du champ
 * étaient tous verts pendant que le chevron SORTAIT DE L'ÉCRAN (mesuré
 * 334 → 406 px pour un cadre de 390, dans les DEUX schémas). `min-h-11
 * min-w-11` (motif `thread-chrome.tsx`, `episode-list.tsx`) pose un PLANCHER
 * de 44 et laisse le bouton prendre la largeur de ce qu'il peint : la cible
 * et la peinture coïncident enfin. Témoin : `check-thread-chrome.mjs § 6`,
 * « sa CAPSULE PEINTE tient dans le cadre » — la RÉUNION bouton+descendants
 * contre le cadre, jamais le seul rectangle du bouton.
 *
 * `aria-label` DIT ce qui partira — jamais « Langue du message » (le libellé
 * iOS, qui ne nomme pas la CONSÉQUENCE) : « Langue d’écriture : anglais »
 * répond directement au critère de fin de #5828, et `spokenLanguageName`
 * porte la face CADRAGE du Prisme (nom dans la langue du LECTEUR).
 */
export function ComposerLanguagePill({
  code,
  onOpen,
  buttonRef,
}: {
  code: string;
  onOpen: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const flag = getLanguageInfo(code).flag;
  const name = spokenLanguageName(code);

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-haspopup="dialog"
      aria-label={`Langue d’écriture : ${name}`}
      onClick={onOpen}
      data-composer-language={code}
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center"
    >
      <span
        className="flex items-center gap-1 rounded-chip px-2 text-[var(--color-ios-ink)] bg-[color-mix(in_srgb,white_15%,transparent)] light:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]"
        style={{ height: 24 }}
      >
        <span aria-hidden>{flag}</span>
        <span className="text-title font-semibold" aria-hidden>
          {code.toUpperCase()}
        </span>
        <Glyph name="caretDown" size={12} />
      </span>
    </button>
  );
}
