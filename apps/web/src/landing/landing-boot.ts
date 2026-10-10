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
 *  4. lire `GET /world` (#10000) : l'effectif, la clé de jonction, ou
 *     l'absence d'entrée ouverte — et masquer alors l'entrée ;
 *  5. faire entrer le nom saisi dans World Wide ;
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
  readonly entryTemplate: string;
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

  const sessionOf = (raw: string | null): 'member' | 'guest' | 'none' => {
    if (raw === null) return 'none';
    try {
      const held: unknown = JSON.parse(raw);
      if (typeof held !== 'object' || held === null) return 'none';
      const expiresAt = Reflect.get(held, 'expiresAt');
      if (typeof expiresAt !== 'number' || expiresAt <= Date.now()) return 'none';
      if (Reflect.get(held, 'kind') === 'guest') return 'guest';
      return typeof Reflect.get(held, 'token') === 'string' ? 'member' : 'none';
    } catch {
      return 'none';
    }
  };

  const head = (): void => {
    doc.documentElement.setAttribute('data-session', sessionOf(read(config.sessionKey)));
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

  const entryOf = (raw: unknown): { readonly link: string; readonly count: string } | null => {
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
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return null;
    if (capped !== undefined && capped !== true) return null;
    return { link: String(Reflect.get(data, 'shareLinkIdentifier')), count: capped === true ? `${count}+` : `${count}` };
  };

  const unavailable = (status: number, raw: unknown): boolean =>
    status === 404 && typeof raw === 'object' && raw !== null && Reflect.get(raw, 'code') === 'WORLD_UNAVAILABLE';

  const all = (selector: string): readonly Element[] => Array.from(scope.querySelectorAll(selector));

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

    let link: string | null = null;
    let closed = false;
    const waiting: Array<() => void> = [];
    const enter = (name: string): void => {
      if (link === null) return;
      win.location.assign(
        config.entryTemplate.replace('{link}', encodeURIComponent(link)).replace('{name}', encodeURIComponent(name)),
      );
    };

    const form = scope.querySelector('[data-world-form]');
    if (form instanceof win.HTMLFormElement) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const field = form.elements.namedItem('name');
        const name = field instanceof win.HTMLInputElement ? field.value.trim() : '';
        if (name === '' || closed) return;
        if (link === null) waiting.push(() => enter(name));
        else enter(name);
      });
    }

    for (const cta of all('[data-world-cta]')) {
      cta.addEventListener('click', () => {
        const field = scope.querySelector('[data-world-form] input[name="name"]');
        if (field instanceof win.HTMLInputElement) field.focus();
      });
    }

    void win
      .fetch(config.apiBase + config.worldPath, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const raw: unknown = await response.json().catch(() => null);
        const entry = response.ok ? entryOf(raw) : null;
        if (entry !== null) {
          link = entry.link;
          for (const slot of all('[data-world-count]')) slot.textContent = config.presence.replace('{count}', entry.count);
          for (const pill of all('[data-world-presence]')) pill.removeAttribute('hidden');
          waiting.splice(0).forEach((go) => go());
          return;
        }
        if (!unavailable(response.status, raw)) return;
        closed = true;
        for (const door of all('[data-world-entry]')) door.setAttribute('hidden', '');
        for (const note of all('[data-world-unavailable]')) note.removeAttribute('hidden');
      })
      .catch(() => undefined);
  };

  if (phase !== 'body') head();
  if (phase === 'head') return;
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', body, { once: true });
  else body();
}
