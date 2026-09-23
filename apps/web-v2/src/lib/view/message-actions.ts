import type { Message, MessageTranslation } from '@/lib/api/types';
import type { InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { translationsOf } from '@/lib/view/message';
import { forwardRefusalOf } from '@/lib/view/forward';
import { protectionOf } from '@/lib/reading-mode/protection';

/**
 * LE MENU DU MESSAGE — LA LOI (#5814) : QUELLES actions, dans quel ORDRE, et
 * QUELLES langues offrir à « Traduire ». Miroir de
 * `MessageActionResolver.primaryActions` (`apps/ios/Meeshy/Features/Main/
 * Components/MessageActionResolver.swift:253-274`) — réduit au sous-ensemble
 * que la v3.1 peut RÉELLEMENT servir (§ 1.2 de la spécification #5814) :
 * `edit`, `saveMedia` et `callDetail` n'ont aucun port web, la loi 4 du
 * dépôt (« un contrôle existe s'il a un effet ») interdit de les lister.
 *
 * Ce fichier ne rend RIEN — c'est `message-menu.tsx` qui consomme cette loi.
 * Il ne porte donc AUCUN libellé : une loi PURE ne connaît pas la langue de
 * son lecteur, elle nomme ce qu'il faut dire et laisse le rendu le dire.
 */

/**
 * `reply` ARME UNE RÉPONSE, ET NE S'APPELLE PLUS `compose` (#7555).
 *
 * Le mot « composer » a un sens ARRÊTÉ sur iOS, et ce n'est pas celui-là :
 * `PrimaryAction.compose` (`MessageActionResolver.swift:14`) ouvre l'atelier
 * sur le MÉDIA d'un message pour en faire une story ou un post, quand
 * répondre y est `MoreItem.reply`. Le même mot pour deux effets était le
 * défaut de cohérence de positionnement (dimension 6) que ce lot ferme :
 * web-v2 dit désormais `reply`, et le nom « composer » reste disponible pour
 * le jour où le port web du geste iOS arrivera — sans collision.
 *
 * Le GLYPHE, lui, n'a pas suivi : `reply` porte encore la baguette magique
 * choisie du temps de « Composer ». `glyphs-thread-menu.ts` est généré, et
 * régénérer dix modules dans un lot de renommage aurait noyé un diff
 * relisible — dette consignée, #7564.
 * `forward` vient de #5866 et reste GARDÉ par `canForward` : la règle du
 * serveur est dite ICI, avant l'aller-retour, pour qu'un refus ne se découvre
 * pas après coup.
 */
export type MessageActionId = 'select' | 'translate' | 'copy' | 'forward' | 'reply' | 'more';

/** Les six glyphes du menu — miroir `MessageActionsMenu.swift:96-111`. */
export type MessageMenuGlyph = 'checkCircle' | 'globe' | 'copy' | 'arrowBendUpRight' | 'magicWand' | 'dotsThree';

/**
 * UNE CLÉ, JAMAIS UN LIBELLÉ (#7555). `as const satisfies` plutôt qu'une
 * annotation large, même discipline que `feed-post-card.tsx` : la table est
 * VÉRIFIÉE contre le catalogue (une clé absente des sept langues ne compile
 * pas) tout en gardant ses littéraux, si bien que `MessageMenuLabelKey` dit
 * QUELLES clés ce menu emploie — et pas « n'importe laquelle du catalogue ».
 */
const MENU_LABEL_KEYS = {
  select: 'message.menu.select',
  translate: 'message.menu.translate',
  copy: 'message.menu.copy',
  forward: 'message.menu.forward',
  reply: 'message.menu.reply',
  more: 'message.menu.more',
} as const satisfies Readonly<Record<MessageActionId, InterfaceCatalogKey>>;

export type MessageMenuLabelKey = (typeof MENU_LABEL_KEYS)[MessageActionId];

export type MessageMenuItem = {
  readonly id: MessageActionId;
  readonly labelKey: MessageMenuLabelKey;
  readonly glyph: MessageMenuGlyph;
};

export type MessageMenuContext = {
  readonly hasText: boolean;
  /** `kind !== 'standard'` (D-23) — un message voilé, brûlé ou supprimé n'offre
   * ni Copier ni Traduire : `ComposableAttachment.seedPlan` étendu (§ 1.2). */
  readonly isProtected: boolean;
  /** `1 + traductions.length` — Traduire n'apparaît qu'à partir de 2 : un
   * sous-menu à une seule entrée ne changerait rien (loi 4). */
  readonly languageCount: number;
  /**
   * #5866 — `forwardRefusalOf(message) === null` (`view/forward.ts`), la
   * règle du serveur rejouée AVANT l'aller-retour. Indépendante d'`isProtected` :
   * un ÉPHÉMÈRE et un FLOU se transfèrent (le serveur les admet, l'éphémère
   * héritant même de sa durée) alors qu'ils ne se copient ni ne se traduisent.
   */
  readonly canForward: boolean;
};

/**
 * Dérive le contexte d'UN message, à l'instant `now` — même discipline que
 * `protectionOf` (D-23) : jamais de seconde horloge, l'appelant injecte `now`.
 *
 * GARDE (#7526, rendue EFFECTIVE #7527) : `message.translations` peut être
 * UNDEFINED dans le cache allégé. Le champ sort donc du `Pick` — qui le
 * rendrait REQUIS, une intersection avec un optionnel n'y changeant rien — et
 * l'assertion `as Message` qui masquait l'écart a disparu avec lui : c'est
 * `translationsOf` qui déclare l'optionalité, une fois.
 */
export function messageMenuContextOf(
  message: Pick<
    Message,
    'deletedAt' | 'isViewOnce' | 'viewOnceCount' | 'isBlurred' | 'expiresAt' | 'content' | 'effectFlags'
  > & {
    readonly translations?: readonly MessageTranslation[];
  },
  input: { readonly now: number },
): MessageMenuContext {
  const kind = protectionOf(message, input.now);
  return {
    hasText: message.content.trim().length > 0,
    isProtected: kind !== 'standard',
    languageCount: 1 + translationsOf(message).length,
    canForward: forwardRefusalOf(message, input.now) === null,
  };
}

/**
 * `MessageActionResolver.primaryActions` réduit : `select` et `more`
 * inconditionnels, `translate`/`copy` gardés par `hasText` ET `!isProtected`
 * (`translate` de plus par `languageCount > 1`), `forward` gardé par
 * `canForward` (#5866 — la règle du serveur, dite AVANT l'aller-retour),
 * `reply` inconditionnel —
 * répondre reste toujours possible, aucune capacité manquante ne le retire.
 */
export function messageMenuItems(ctx: MessageMenuContext): readonly MessageMenuItem[] {
  const items: MessageMenuItem[] = [{ id: 'select', labelKey: MENU_LABEL_KEYS.select, glyph: 'checkCircle' }];
  if (ctx.hasText && !ctx.isProtected && ctx.languageCount > 1) {
    items.push({ id: 'translate', labelKey: MENU_LABEL_KEYS.translate, glyph: 'globe' });
  }
  if (ctx.hasText && !ctx.isProtected) {
    items.push({ id: 'copy', labelKey: MENU_LABEL_KEYS.copy, glyph: 'copy' });
  }
  if (ctx.canForward) {
    items.push({ id: 'forward', labelKey: MENU_LABEL_KEYS.forward, glyph: 'arrowBendUpRight' });
  }
  items.push({ id: 'reply', labelKey: MENU_LABEL_KEYS.reply, glyph: 'magicWand' });
  items.push({ id: 'more', labelKey: MENU_LABEL_KEYS.more, glyph: 'dotsThree' });
  return items;
}

/** Le rail — 6 fixes (question 6 de la spécification, tranchée : jamais un
 * classement par usage ce lot). Miroir `MessageOverlayMenu.swift:99-101`. */
export const QUICK_REACTIONS = ['😂', '❤️', '👍', '😮', '😢', '🔥'] as const;

/** Les 20 emojis étendus — miroir `MessageOverlayMenu.swift:99-104`
 * (`defaultEmojis`), servis par la feuille « Ajouter une réaction ». */
export const EXTENDED_REACTIONS = [
  '😂', '❤️', '👍', '😮', '😢', '🔥',
  '🎉', '💯', '🥰', '😎', '🙏', '💀',
  '🤣', '✨', '👏', '🤔', '🥺', '😍',
  '🫶', '💪',
] as const;

export type TranslationChoice = {
  readonly code: string;
  readonly isOriginal: boolean;
  readonly isServed: boolean;
};

/**
 * Les langues offertes par le sous-menu « Traduire » — l'ORIGINAL d'abord,
 * puis les rangs du PRISME du lecteur (dans SON ordre, jamais celui du
 * tableau de traductions), puis le reste des traductions disponibles.
 *
 * Témoin de RANG (leçon 261) : un lecteur `['es','en']` sur un message `fr`
 * traduit en `en` sert l'anglais au RANG 2 (« es » n'a pas de traduction) —
 * la servie n'est donc jamais celle du rang 1, et le verdict distingue une
 * loi juste d'une loi qui s'arrêterait au premier rang.
 *
 * GARDE (#7526, rendue EFFECTIVE #7527) : `translations` est OPTIONNEL ici,
 * hors du `Pick` — voir `messageMenuContextOf` ci-dessus.
 */
export function translationChoices(params: {
  readonly message: Pick<Message, 'originalLanguage'> & { readonly translations?: readonly MessageTranslation[] };
  readonly preferredLanguages: readonly string[];
  readonly servedLanguage: string;
}): readonly TranslationChoice[] {
  const { message, preferredLanguages, servedLanguage } = params;
  const translations = translationsOf(message);
  const available = new Set(translations.map((t) => t.language));
  const seen = new Set<string>();
  const choices: TranslationChoice[] = [];

  const original = message.originalLanguage;
  if (original !== null && original !== undefined) {
    choices.push({ code: original, isOriginal: true, isServed: servedLanguage === original });
    seen.add(original);
  }

  for (const lang of preferredLanguages) {
    if (seen.has(lang) || !available.has(lang)) continue;
    choices.push({ code: lang, isOriginal: false, isServed: servedLanguage === lang });
    seen.add(lang);
  }

  for (const t of translations) {
    if (seen.has(t.language)) continue;
    choices.push({ code: t.language, isOriginal: false, isServed: servedLanguage === t.language });
    seen.add(t.language);
  }

  return choices;
}
