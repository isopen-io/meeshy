import { languageColor } from '@/lib/languages';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { Glyph } from './glyph';

/**
 * **LA PASTILLE DU PRISME — SON PROPRE MODULE** (#7141).
 *
 * Elle vivait dans `message-blocks.tsx`, le module du FIL, tant qu'elle ne
 * servait que lui. Elle sert désormais TROIS surfaces — le fil, les
 * publications, les commentaires — et un composant partagé par plusieurs
 * surfaces n'appartient au module d'aucune d'elles : l'importer depuis
 * `message-blocks` faisait entrer tout le module du fil dans le graphe du
 * feed, pour une pastille de vingt lignes.
 *
 * C'est la même règle que le dépôt applique à ses lois (« une loi qui habite
 * un service est inatteignable aux clients ») : ici, un composant qui habite
 * une surface la fait voyager avec lui.
 *
 * **Ce que cette extraction ne fait PAS** : elle n'a corrigé aucun gate. Le
 * rouge de `check-feed-scenes` observé pendant ce lot s'est révélé indépendant
 * — l'arbre `dev` NU rougit de la même façon dans le même worktree, et le code
 * web-v2 du commit rouge de `dev` est identique à celui d'un commit vert. Ce
 * découplage est une question de conception, pas un correctif.
 */
/**
 * LA PASTILLE DU PRISME — elle ne se montre QUE si le texte affiché est une
 * TRADUCTION (« la traduction ne se signale que par la pastille du pied ») et
 * elle a un EFFET : elle ouvre, et referme, le message dans sa langue
 * d'origine. Elle était rendue INCONDITIONNELLEMENT et sans `onClick` — donc
 * elle mentait deux fois : sur un message non traduit, et à chaque clic.
 *
 * Le geste double celui du premier drapeau du pied, et c'est voulu :
 * l'exploration de l'original est l'affordance DISCRÈTE du Prisme, le pied
 * étant l'affordance EXHAUSTIVE (toutes les langues servies).
 *
 * ## SANS `onToggle`, ELLE INFORME ET NE PROMET RIEN (#6862, revue-correction)
 *
 * La lecture souveraine de l'administration est le premier hôte du dépôt qui
 * n'a AUCUNE prise de langue : on ne change pas la langue lue au nom d'un
 * tiers. Le bouton y restait pourtant peint, focalisable, annoncé « Afficher
 * le message dans sa langue d'origine » — et son clic n'appelait rien. C'est
 * le contrôle sans effet de la loi 4, sous la forme qui a déjà coûté au dépôt
 * (`PostCard`, cycle 123 du `CLAUDE.md`) : cliquer ne changeait PAS le texte lu.
 *
 * Le FAIT reste dit — « ce texte est une traduction » est l'indicateur discret
 * du Prisme (§ Transparence), et le retirer priverait le lecteur d'une
 * information vraie. Seul le GESTE disparaît : une `<span>`, donc ni halte de
 * tabulation, ni `aria-pressed`, ni verbe à l'infinitif.
 */
/**
 * CE QUE LA PASTILLE QUALIFIE (#7141). « Afficher le message dans sa langue
 * d'origine » sur un commentaire serait traduit et FAUX : le vocabulaire fait
 * partie de la justesse, pas de la décoration. Trois sujets, neuf clés plates —
 * l'accord (« traduit » / « traduite ») ne se paramètre pas d'une langue à
 * l'autre.
 */
export type PrismSubject = 'message' | 'comment' | 'post';

/* Des tables FERMÉES (`Record<PrismSubject, …>`) plutôt qu'une clé composée :
   un sujet de plus fait rougir `tsc` ICI, au lieu de rendre une clé absente que
   le catalogue servirait telle quelle. */
const TRANSLATED_KEY = {
  message: 'prism.translated.message',
  comment: 'prism.translated.comment',
  post: 'prism.translated.post',
} as const satisfies Record<PrismSubject, string>;

const SHOW_KEY = {
  message: 'prism.original.show.message',
  comment: 'prism.original.show.comment',
  post: 'prism.original.show.post',
} as const satisfies Record<PrismSubject, string>;

const HIDE_KEY = {
  message: 'prism.original.hide.message',
  comment: 'prism.original.hide.comment',
  post: 'prism.original.hide.post',
} as const satisfies Record<PrismSubject, string>;

export function PrismPastille({
  servedLanguage,
  originalLanguage,
  active,
  language,
  subject,
  onToggle,
}: {
  servedLanguage: string;
  originalLanguage: string;
  active: string | null;
  /** La langue de l'INTERFACE — jamais celle du contenu, que le Prisme résout. */
  language: InterfaceLanguage;
  subject: PrismSubject;
  /** ABSENTE ⇒ l'hôte ne sait pas explorer une autre langue : aucun bouton. */
  onToggle?: () => void;
}) {
  if (servedLanguage === originalLanguage) return null;
  const isOpen = active === originalLanguage;

  if (onToggle === undefined) {
    return (
      <span
        data-prism-indicator
        className="grid size-[22px] place-items-center rounded-menu"
        style={{ color: 'var(--color-i400)' }}
      >
        <Glyph name="translate" size={12} />
        <span className="offscreen">{translate(language, TRANSLATED_KEY[subject])}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      data-prism-toggle
      onClick={onToggle}
      aria-pressed={isOpen}
      aria-label={translate(language, (isOpen ? HIDE_KEY : SHOW_KEY)[subject])}
      /* `tap-target-22` étend la zone TACTILE par un `::after` en débord
         (`app.css`) sans grandir le DESSIN — élargir visuellement ce bouton
         grandirait chaque message traduit. Défaut #5566 (revue, défaut 11
         puis défaut 1 de la revue-correction) : plein en VERTICAL (-11px,
         rien ne le dispute), borné en HORIZONTAL à la moitié du gap réel
         vers `Flags` (-2px) pour ne jamais voler le clic du premier drapeau —
         le geste PLEIN existe ailleurs (menu long-appui du message, hors
         périmètre de ce lot). */
      className="tap-target-22 grid size-[22px] place-items-center rounded-menu"
      style={{ color: isOpen ? languageColor(originalLanguage) : 'var(--color-i400)' }}
    >
      <Glyph name="translate" size={12} />
    </button>
  );
}

