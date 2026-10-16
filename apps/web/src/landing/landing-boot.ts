/**
 * CE QUE LA LANDING FAIT, en un seul script (#10002).
 *
 * La landing est un document STATIQUE : aucun octet du socle applicatif, aucun
 * module. Ce qu'elle doit pourtant savoir faire tient ici :
 *
 *  1. dire si un COMPTE est déjà là (`data-session` sur `<html>`), AVANT la
 *     première peinture — un compte voit « Mes conversations » sans éclair ;
 *  2. rendre à un lecteur la langue qu'il a CHOISIE dans Meeshy quand il ouvre
 *     la racine (jamais celle du navigateur : un robot n'en a pas, et la racine
 *     est l'`x-default` qu'il doit pouvoir lire) ;
 *  3. changer de langue depuis le sélecteur, en retenant le choix pour
 *     l'application ;
 *  4. lire `GET /world` (#10000) : la clé de jonction, ou l'absence d'entrée
 *     ouverte — et masquer alors les QR (`data-world-entry`). L'EFFECTIF ne se
 *     montre qu'à un COMPTE (#10205, directive porteur du 2026-10-11 : pas de
 *     nombre de participants pour qui n'est pas membre de Meeshy), et
 *     seulement s'il est servi ;
 *  5. RIEN d'autre pour World Wide : on n'y entre plus sans compte depuis la
 *     landing (#10784, directive porteur du 2026-10-16) — ni formulaire, ni
 *     bouton, ni jeton de passage. L'entrée anonyme ne passe plus que par le
 *     QR de la page, FLASHÉ vers `/world`, où le parcours invité attend
 *     (`routes/world-entry.tsx`) ; une panne de `GET /world` laisse les QR en
 *     place, sans relance ;
 *  5 bis. proposer « Revenir dans World Wide » à l'invité qui y est déjà ;
 *  6. rendre la LISTE à l'application INSTALLÉE (`appPath`) : une PWA posée
 *     avant #10002 garde `start_url: '/'` (iOS ne relit jamais le manifeste),
 *     et `/` y désignait la liste — elle ne doit pas s'ouvrir sur la landing.
 *
 * LA FONCTION EST AUTONOME, et c'est un contrat : le prérendu l'inline par son
 * TEXTE (`landingBootScript`), elle ne peut donc rien lire hors de ses
 * paramètres — ni import, ni constante de module —, à UNE exception près :
 * `isInstalledApp`, inlinée par son texte à côté d'elle. La même fonction sert l'écran
 * `/` de l'application (`routes/home.tsx`), qui l'appelle directement.
 *
 * Deux règles partagées y sont réécrites faute d'import, chacune JUMELLE GARDÉE
 * par un témoin (`landing.test.tsx`) : la validation de `worldEntrySchema`
 * (`@meeshy/shared/types/world`) et `formatMemberCount`
 * (`@meeshy/shared/utils/member-visibility`).
 */
export type LandingBootConfig = {
  readonly language: string;
  readonly rootLanguage: string;
  readonly paths: Readonly<Record<string, string>>;
  readonly apiBase: string;
  readonly worldPath: string;
  readonly sessionKey: string;
  readonly languageKey: string;
  readonly threadTemplate: string;
  readonly appPath: string;
  readonly presence: string;
};

export type LandingBootOptions = {
  readonly scope?: ParentNode;
  readonly phase?: 'all' | 'head' | 'body';
};

/**
 * L'APPLICATION INSTALLÉE — écran d'accueil (`display-mode: standalone`) ou
 * Safari iOS (`navigator.standalone`), la même lecture que `client-session.ts`.
 * `routes/home.tsx` l'appelle avant de peindre ; le prérendu l'inline par son
 * TEXTE à côté de `landingBoot` (`landingBootScript`), seule fonction que
 * celle-ci peut nommer hors de ses paramètres.
 */
export function isInstalledApp(win: Window & typeof globalThis): boolean {
  const media = typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches;
  return media || Reflect.get(win.navigator ?? {}, 'standalone') === true;
}

export function landingBoot(win: Window & typeof globalThis, config: LandingBootConfig, options?: LandingBootOptions): void {
  const doc = win.document;
  const scope: ParentNode = options?.scope ?? doc;
  const phase = options?.phase ?? 'all';

  const read = (key: string): string | null => {
    try {
      return win.localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const heldOf = (raw: string | null): object | null => {
    if (raw === null) return null;
    try {
      const held: unknown = JSON.parse(raw);
      if (typeof held !== 'object' || held === null) return null;
      const expiresAt = Reflect.get(held, 'expiresAt');
      return typeof expiresAt === 'number' && expiresAt > Date.now() ? held : null;
    } catch {
      return null;
    }
  };

  const sessionOf = (held: object | null): 'member' | 'guest' | 'none' => {
    if (held === null) return 'none';
    if (Reflect.get(held, 'kind') === 'guest') return 'guest';
    return typeof Reflect.get(held, 'token') === 'string' ? 'member' : 'none';
  };

  const held = heldOf(read(config.sessionKey));
  const session = sessionOf(held);

  const head = (): void => {
    doc.documentElement.setAttribute('data-session', session);
    if (isInstalledApp(win)) {
      win.location.replace(config.appPath);
      return;
    }
    if (config.language !== config.rootLanguage) return;
    const chosen = read(config.languageKey);
    const target = chosen === null ? undefined : config.paths[chosen];
    if (chosen === null || chosen === config.language || target === undefined) return;
    win.location.replace(target + win.location.search + win.location.hash);
  };

  const entryOf = (raw: unknown): { readonly link: string; readonly count: string | null } | null => {
    if (typeof raw !== 'object' || raw === null || Reflect.get(raw, 'success') !== true) return null;
    const data: unknown = Reflect.get(raw, 'data');
    if (typeof data !== 'object' || data === null) return null;
    const text = (key: string): boolean => {
      const value: unknown = Reflect.get(data, key);
      return typeof value === 'string' && value.length > 0;
    };
    const count: unknown = Reflect.get(data, 'memberCount');
    const capped: unknown = Reflect.get(data, 'memberCountCapped');
    if (!text('identifier') || !text('title') || !text('shareLinkIdentifier')) return null;
    const counted = typeof count === 'number' && Number.isInteger(count) && count >= 0 && (capped === undefined || capped === true);
    return { link: String(Reflect.get(data, 'shareLinkIdentifier')), count: counted ? (capped === true ? `${count}+` : `${count}`) : null };
  };

  const unavailable = (status: number, raw: unknown): boolean =>
    status === 404 && typeof raw === 'object' && raw !== null && Reflect.get(raw, 'code') === 'WORLD_UNAVAILABLE';

  const all = (selector: string): readonly Element[] => Array.from(scope.querySelectorAll(selector));
  const flag = (selector: string, shown: boolean): void => {
    for (const node of all(selector)) node.toggleAttribute('hidden', !shown);
  };

  const body = (): void => {
    const select = scope.querySelector('[data-landing-language]');
    if (select instanceof win.HTMLSelectElement) {
      select.value = config.language;
      select.addEventListener('change', () => {
        const target = config.paths[select.value];
        if (target === undefined) return;
        try {
          win.localStorage.setItem(config.languageKey, select.value);
        } catch {
          /* Stockage refusé (navigation privée) : le changement de page suffit. */
        }
        win.location.assign(target);
      });
    }

    const guest: unknown = session === 'guest' && held !== null ? Reflect.get(held, 'guest') : null;
    const guestOf = (key: string): unknown => (typeof guest === 'object' && guest !== null ? Reflect.get(guest, key) : null);
    const conversation = guestOf('conversationId');
    const offerReturn = (worldLink: string | null): void => {
      const own = typeof conversation === 'string' && conversation !== '' && (worldLink === null || guestOf('link') === worldLink);
      for (const anchor of all('[data-world-return]')) {
        if (own) anchor.setAttribute('href', config.threadTemplate.replace('{conversation}', encodeURIComponent(conversation)));
        anchor.toggleAttribute('hidden', !own);
      }
    };
    offerReturn(null);

    void win
      .fetch(config.apiBase + config.worldPath, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const raw: unknown = await response.json().catch(() => null);
        const entry = response.ok ? entryOf(raw) : null;
        if (entry === null) {
          if (!unavailable(response.status, raw)) return;
          flag('[data-world-entry]', false);
          flag('[data-world-unavailable]', true);
          return;
        }
        offerReturn(entry.link);
        const count = session === 'member' ? entry.count : null;
        for (const slot of all('[data-world-count]')) slot.textContent = count === null ? '' : config.presence.replace('{count}', count);
        flag('[data-world-presence]', count !== null);
      })
      .catch(() => undefined);
  };

  if (phase !== 'body') head();
  if (phase === 'head') return;
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', body, { once: true });
  else body();
}
