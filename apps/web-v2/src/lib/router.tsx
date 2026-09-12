import {
  Suspense,
  createContext,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type ComponentType,
  type ReactNode,
} from 'react';

/**
 * LE ROUTEUR.
 *
 * Pourquoi il existe plutot qu'une dependance : TanStack Router pesait
 * 25,13 Ko gzip, soit 49 % de ce que l'utilisateur telecharge avant de voir
 * quoi que ce soit — plus de trois fois le runtime de l'interface entiere. Sur
 * le profil vise (Fast 3G), ce sont 1,1 s a chaque demarrage a froid. Et ce
 * poids est INCOMPRESSIBLE : mesure faite, retirer toutes ses options rend un
 * chunk au hash IDENTIQUE. On ne paie pas ce qu'on utilise, on paie le moteur.
 *
 * Ce que ce module rend, et qui est ce dont Meeshy a besoin :
 *   - des routes a PARAMETRES (`/c/$conversation`), TYPES depuis le motif ;
 *   - des parametres de RECHERCHE (`?autour=&media=`), que la v3 emploie deja
 *     pour cadrer une tranche de fil et ouvrir un media ;
 *   - le decoupage par route (chaque ecran est un import a la demande) ;
 *   - le prechargement A L'INTENTION, jamais au survol de passage ;
 *   - la restauration du defilement.
 *
 * Ce qu'il ne rend PAS, et qu'il faut savoir avant de s'en servir : pas de
 * chargeurs de route, pas d'etats « pending » de navigation, pas de validation
 * de parametres de recherche, pas de routes imbriquees au-dela d'un niveau.
 * Les trois premiers sont couverts par TanStack Query, qui reste ; le
 * quatrieme est une limite reelle, a lever le jour ou un ecran la rencontre.
 */

// --- Le typage des parametres, derive du MOTIF lui-meme -------------------
// `/c/$conversation` rend `{ conversation: string }`. C'est ce qui evite de
// declarer deux fois la meme information, et c'est l'essentiel de ce que le
// typage de bout en bout de TanStack apportait ici.
type Segment<C extends string> = C extends `${infer Head}/${infer Rest}`
  ? Segment<Head> | Segment<Rest>
  : C extends `$${infer Name}`
    ? Name
    : never;

export type ParamsOf<C extends string> = Record<Segment<C>, string>;

export type RouteTable = Record<string, { readonly pattern: string; readonly screen: () => Promise<{ default: ComponentType }> }>;

type Location = { path: string; search: string };

// --- L'observation de l'URL ------------------------------------------------

function readLocation(): Location {
  return { path: window.location.pathname, search: window.location.search };
}

const subscribers = new Set<() => void>();
let currentLocation: Location =
  typeof window === 'undefined' ? { path: '/', search: '' } : readLocation();

function notify(): void {
  const next = readLocation();
  // L'IDENTITE de l'objet ne doit changer que si l'URL change reellement :
  // `useSyncExternalStore` compare par reference et re-rendrait a chaque
  // evenement sinon.
  if (next.path === currentLocation.path && next.search === currentLocation.search) return;
  currentLocation = next;
  for (const subscriber of subscribers) subscriber();
}

function subscriber(onSchemeChange: () => void): () => void {
  subscribers.add(onSchemeChange);
  return () => subscribers.delete(onSchemeChange);
}

export function navigate(url: string, replace = false): void {
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  notify();
}

// --- La compilation des motifs --------------------------------------------

type CompiledPattern = { readonly regex: RegExp; readonly names: readonly string[] };

export function compile(pattern: string): CompiledPattern {
  const names: string[] = [];
  const source = pattern
    .split('/')
    .map((segment) => {
      if (!segment.startsWith('$')) return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      names.push(segment.slice(1));
      return '([^/]+)';
    })
    .join('/');
  return { regex: new RegExp(`^${source}/?$`), names };
}

/**
 * LA CLÉ DE REMONTAGE D'UN ÉCRAN (#5566, correction de revue, défaut 8) — un
 * écran à PARAMÈTRES (`/c/$conversation`) ne doit PAS survivre à un
 * changement de ces paramètres. Sans elle, `<Screen />` gardait la MÊME
 * identité React d'une navigation fil → fil : chaque `useState(initialiseur)`
 * de l'écran (mode de lecture collant, horloge d'ouverture, messages)
 * n'était évalué qu'au premier montage et restait figé sur la conversation
 * PRÉCÉDENTE, pendant que tout ce qui vient du contexte de route (en-tête,
 * accent) suivait, lui, la nouvelle — un écran mi-vrai.
 *
 * `React.key` force un DÉMONTAGE, jamais un rendu différent : c'est la seule
 * garantie que CHAQUE `useState` reparte de son initialiseur pour la
 * nouvelle identité de route. Fonction PURE et exportée : c'est le même
 * dispositif que `match` juste au-dessus — la seule logique de ce fichier où
 * une erreur se voit tard et mal mérite un test qui ne passe pas par un DOM.
 */
export function routeKey(context: { readonly key: string; readonly params: Record<string, string> }): string {
  const names = Object.keys(context.params).sort();
  if (names.length === 0) return context.key;
  return `${context.key}:${names.map((name) => `${name}=${context.params[name]}`).join('&')}`;
}

/**
 * Apparie un chemin a un motif COMPILE et rend ses parametres, ou `null`.
 *
 * Fonction PURE et exportee pour qu'elle soit testable seule : l'appariement
 * est la seule logique du routeur ou une erreur se voit tard et mal (une route
 * qui ne prend pas, un parametre decode de travers), et la cacher dans un
 * composant reviendrait a la tester par capture d'ecran.
 */
export function match(compile: CompiledPattern, path: string): Record<string, string> | null {
  const found = compile.regex.exec(path);
  if (!found) return null;
  const params: Record<string, string> = {};
  compile.names.forEach((name, i) => {
    params[name] = decodeURIComponent(found[i + 1] ?? '');
  });
  return params;
}

// --- Le contexte -----------------------------------------------------------

type RouteContext = { readonly key: string; readonly params: Record<string, string>; readonly search: URLSearchParams };

const Context = createContext<RouteContext | null>(null);

export function useRoute(): RouteContext {
  const context = useContext(Context);
  if (!context) throw new Error('useRoute() hors de <Routeur>');
  return context;
}

export function useParams<T extends string>(): ParamsOf<T> {
  return useRoute().params as ParamsOf<T>;
}

/** Les parametres de recherche, et de quoi les REECRIRE sans quitter l'ecran. */
export function useSearch(): [URLSearchParams, (next: URLSearchParams, replace?: boolean) => void] {
  const { search } = useRoute();
  const set = useCallback((next: URLSearchParams, replace = false) => {
    const chain = next.toString();
    navigate(`${window.location.pathname}${chain ? `?${chain}` : ''}`, replace);
  }, []);
  return [search, set];
}

// --- La fabrique -----------------------------------------------------------

export function createRouter<T extends RouteTable>(table: T, notFound: ComponentType) {
  const entries = Object.entries(table).map(([key, route]) => ({
    key,
    pattern: route.pattern,
    compile: compile(route.pattern),
    // `lazy` est appele UNE fois par route : le module se memorise tout seul,
    // donc precharger revient a declencher l'import, et le rendu le retrouve.
    Screen: lazy(route.screen),
    load: route.screen,
  }));

  function href<C extends keyof T & string>(
    key: C,
    params?: ParamsOf<T[C]['pattern']>,
    search?: Record<string, string | undefined>,
  ): string {
    const entry = entries.find((e) => e.key === key);
    if (!entry) throw new Error(`Route inconnue : ${key}`);
    const path = entry.pattern
      .split('/')
      .map((segment) =>
        segment.startsWith('$')
          ? encodeURIComponent((params as Record<string, string>)[segment.slice(1)] ?? '')
          : segment,
      )
      .join('/');
    const q = new URLSearchParams();
    for (const [name, value] of Object.entries(search ?? {})) if (value !== undefined) q.set(name, value);
    const chain = q.toString();
    return `${path}${chain ? `?${chain}` : ''}`;
  }

  function Router({
    wrap,
    skeleton,
  }: {
    wrap: (children: ReactNode) => ReactNode;
    /**
     * Ce qui s'affiche pendant qu'un ecran DECOUPE arrive. Sur la 3G visee ce
     * n'est pas un detail : le chunk d'un ecran met une seconde ou deux, et un
     * repli `null` rendrait un ecran BLANC pendant ce temps. La regle du depot
     * vaut ici comme ailleurs — un squelette qui dit ce qui manque, jamais un
     * spinner.
     */
    skeleton: ReactNode;
  }) {
    const location = useSyncExternalStore(subscriber, () => currentLocation, () => currentLocation);

    const resolved = useMemo(() => {
      for (const entry of entries) {
        const params = match(entry.compile, location.path);
        if (params) return { entry, params };
      }
      return null;
    }, [location.path]);

    const context = useMemo<RouteContext>(
      () => ({
        key: resolved?.entry.key ?? '',
        params: resolved?.params ?? {},
        search: new URLSearchParams(location.search),
      }),
      [resolved, location.search],
    );

    /**
     * RESTAURATION DU DEFILEMENT. Le navigateur la fait tout seul pour une
     * navigation de DOCUMENT ; en application, l'URL change sans que rien ne
     * se recharge, donc c'est a nous. On remonte en haut a chaque nouvelle
     * adresse, et on rend sa position a un retour arriere.
     */
    const positions = useRef(new Map<string, number>());
    const previous = useRef<string | null>(null);
    useEffect(() => {
      const currentHref = location.path + location.search;
      if (previous.current !== null) positions.current.set(previous.current, window.scrollY);
      previous.current = currentHref;
      window.scrollTo(0, positions.current.get(currentHref) ?? 0);
    }, [location.path, location.search]);

    useEffect(() => {
      const surPop = () => notify();
      window.addEventListener('popstate', surPop);
      return () => window.removeEventListener('popstate', surPop);
    }, []);

    const Screen = resolved?.entry.Screen ?? notFound;

    return (
      <Context.Provider value={context}>
        {wrap(
          <Suspense fallback={skeleton}>
            <Screen key={routeKey(context)} />
          </Suspense>,
        )}
      </Context.Provider>
    );
  }

  function Link<C extends keyof T & string>({
    to,
    params,
    search,
    replace = false,
    children,
    onClick: onClickProp,
    anchorRef,
    ...rest
  }: {
    to: C;
    params?: ParamsOf<T[C]['pattern']>;
    search?: Record<string, string | undefined>;
    /**
     * REMPLACER l'entree courante au lieu d'en empiler une (defaut : empiler).
     *
     * Il existe pour les liens qui REFERMENT plutot qu'ils n'avancent : le
     * « X » de l'inscription, « Deja un compte ? Se connecter ». Sans lui, ces
     * gestes s'ecrivaient `<button onClick={navigate(..., true)}>` — un
     * controle qui NAVIGUE sans etre un lien : pas de `href`, pas d'ouverture
     * en nouvel onglet, pas de menu contextuel, pas de prechargement, et rien
     * a montrer dans la barre d'etat. Le motif serait recopie par les 40+
     * surfaces a venir ; deux lignes ici l'evitent partout.
     */
    replace?: boolean;
    /**
     * L'ANCRE ELLE-MEME, pour qui doit lui DONNER LE FOCUS (#6104).
     *
     * `ref` ne peut pas servir ici : ce composant est generique, et `ref` est
     * extrait des props par le runtime — par React 19 comme par
     * `preact/compat`, mais pas de la meme facon. Une porte NOMMEE se comporte
     * identiquement dans les deux variantes que ce POC compare, ce qui est
     * exactement sa raison d'etre.
     *
     * Elle existe parce qu'un menu ARIA doit pouvoir poser le focus sur ses
     * lignes (fleches, Home/End, entree dans le menu a l'ouverture — voir
     * `lib/view/roving-menu.ts`) et qu'une ligne qui NAVIGUE doit rester un
     * lien. Sans elle, un menu de liens n'aurait eu le choix qu'entre perdre
     * le clavier et perdre le `href`.
     */
    anchorRef?: (element: HTMLAnchorElement | null) => void;
    children: ReactNode;
  } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children'>) {
    const url = href(to, params, search);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    /**
     * PRECHARGEMENT A L'INTENTION, jamais au survol de passage : sur un reseau
     * paye au mega-octet, precharger ce que le pointeur traverse gaspille des
     * octets reels. 300 ms d'intention filtrent les passages.
     */
    const armPrefetch = () => {
      const entry = entries.find((e) => e.key === to);
      if (!entry || timer.current) return;
      timer.current = setTimeout(() => void entry.load(), 300);
    };
    const disarm = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
    useEffect(() => disarm, []);

    return (
      <a
        {...rest}
        ref={anchorRef}
        href={url}
        onPointerEnter={armPrefetch}
        onPointerLeave={disarm}
        onFocus={armPrefetch}
        onBlur={disarm}
        onClick={(e) => {
          // On laisse le navigateur faire son travail quand l'utilisateur le
          // lui demande : nouvel onglet, telechargement, cible explicite. Le
          // `onClick` de l'appelant n'est meme pas invoque pour ces gestes-la
          // (#5816, E2) : rien de ce qui suit un clic SPA ne doit se produire.
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          onClickProp?.(e);
          if (e.defaultPrevented) return;
          e.preventDefault();
          disarm();
          navigate(url, replace);
        }}
      >
        {children}
      </a>
    );
  }

  return { Router, Link, href, navigate };
}
