import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import type { Message } from '@/lib/api/types';
import { translationsOf } from '@/lib/view/message';
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
 */

export type MessageActionId = 'select' | 'translate' | 'copy' | 'compose' | 'more';

/** Les cinq glyphes du menu — miroir `MessageActionsMenu.swift:96-111`. */
export type MessageMenuGlyph = 'checkCircle' | 'globe' | 'copy' | 'magicWand' | 'dotsThree';

export type MessageMenuItem = {
  readonly id: MessageActionId;
  readonly label: string;
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
};

/**
 * Dérive le contexte d'UN message, à l'instant `now` — même discipline que
 * `protectionOf` (D-23) : jamais de seconde horloge, l'appelant injecte `now`.
 */
export function messageMenuContextOf(
  message: Pick<
    Message,
    'deletedAt' | 'isViewOnce' | 'viewOnceCount' | 'isBlurred' | 'expiresAt' | 'content' | 'translations'
  >,
  input: { readonly now: number },
): MessageMenuContext {
  const kind = protectionOf(message, input.now);
  return {
    hasText: message.content.trim().length > 0,
    isProtected: kind !== 'standard',
    languageCount: 1 + translationsOf(message as Message).length,
  };
}

/**
 * `MessageActionResolver.primaryActions` réduit : `select` et `more`
 * inconditionnels, `translate`/`copy` gardés par `hasText` ET `!isProtected`
 * (`translate` de plus par `languageCount > 1`), `compose` inconditionnel
 * (v3.1 : « Composer » = répondre, § question 2 de la spécification —
 * toujours disponible, aucune capacité manquante ne le retire).
 */
export function messageMenuItems(ctx: MessageMenuContext): readonly MessageMenuItem[] {
  const items: MessageMenuItem[] = [{ id: 'select', label: 'Sélectionner', glyph: 'checkCircle' }];
  if (ctx.hasText && !ctx.isProtected && ctx.languageCount > 1) {
    items.push({ id: 'translate', label: 'Traduire', glyph: 'globe' });
  }
  if (ctx.hasText && !ctx.isProtected) {
    items.push({ id: 'copy', label: 'Copier', glyph: 'copy' });
  }
  items.push({ id: 'compose', label: 'Composer', glyph: 'magicWand' });
  items.push({ id: 'more', label: 'Plus…', glyph: 'dotsThree' });
  return items;
}

/**
 * **LE FAVORI, DANS « PLUS… »** (#7378) — miroir de
 * `MessageActionResolver.moreSections` (`apps/ios/Meeshy/Features/Main/
 * Components/MessageActionResolver.swift`, `ctx.isStarred ? .unstar : .star`) :
 * iOS range l'étoile dans la feuille « Plus… », section « Faire », juste après
 * l'épingle. Le web n'a pas d'épingle — l'étoile ouvre la section.
 *
 * DEUX ÉCARTS avec iOS, assumés parce qu'ils vont dans le sens de la vérité :
 * - `null` quand l'état est INCONNU (l'ensemble des favoris n'est pas chargé,
 *   `starred-messages-cache.ts`) : proposer « Ajouter » sur un message déjà en
 *   favori ferait mentir le geste ;
 * - `null` pour AJOUTER sur un message que le serveur refuserait (vue unique :
 *   409 `MESSAGE_NOT_STARRABLE`) : iOS la propose sans condition parce que son
 *   magasin est local ; l'entrée disparaît ici plutôt que d'échouer au tap.
 *   Une étoile déjà posée se RETIRE toujours (le retrait serveur est sans
 *   condition).
 *
 * Le LIBELLÉ n'est pas ici : il vit dans les sept catalogues d'interface
 * (`action.star` / `action.unstar`, les clés d'iOS), lus par la feuille.
 */
export type MessageStarAction = 'star' | 'unstar';

export function messageStarAction(ctx: {
  readonly starred: boolean | undefined;
  readonly starrable: boolean;
}): MessageStarAction | null {
  if (ctx.starred === undefined) return null;
  if (ctx.starred) return 'unstar';
  return ctx.starrable ? 'star' : null;
}

/**
 * CE QUE LE SERVEUR ACCEPTERAIT D'ÉTOILER — la règle 2 de #7377
 * (`starredMessageVerdict.ts`) lue côté client : ni supprimé, ni expiré, ni à
 * vue unique (par le booléen ET par le bit `VIEW_ONCE` d'`effectFlags`, comme
 * le verdict serveur). Un message encore OPTIMISTE (`cid_…`,
 * `api/client-message-id.ts`) n'existe pas côté serveur : `PUT` rendrait 404.
 *
 * Flouté, chiffré ou éphémère encore vivant se mettent en favori : ils seront
 * servis en PLACEHOLDER (règle 3), jamais refusés.
 */
export function starrableOf(
  message: Pick<Message, 'id' | 'deletedAt' | 'expiresAt' | 'isViewOnce' | 'effectFlags'>,
  input: { readonly now: number },
): boolean {
  if (message.id.startsWith('cid_')) return false;
  if (message.deletedAt != null) return false;
  if (message.expiresAt != null && new Date(message.expiresAt).getTime() <= input.now) return false;
  return !message.isViewOnce && ((message.effectFlags ?? 0) & MESSAGE_EFFECT_FLAGS.VIEW_ONCE) === 0;
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
 */
export function translationChoices(params: {
  readonly message: Pick<Message, 'originalLanguage' | 'translations'>;
  readonly preferredLanguages: readonly string[];
  readonly servedLanguage: string;
}): readonly TranslationChoice[] {
  const { message, preferredLanguages, servedLanguage } = params;
  const translations = translationsOf(message as Message);
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
