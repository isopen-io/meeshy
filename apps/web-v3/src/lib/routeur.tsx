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
type Segment<C extends string> = C extends `${infer Tete}/${infer Reste}`
  ? Segment<Tete> | Segment<Reste>
  : C extends `$${infer Nom}`
    ? Nom
    : never;

export type ParamsDe<C extends string> = Record<Segment<C>, string>;

export type TableDeRoutes = Record<string, { readonly motif: string; readonly ecran: () => Promise<{ default: ComponentType }> }>;

type Emplacement = { chemin: string; recherche: string };

// --- L'observation de l'URL ------------------------------------------------

function lisLEmplacement(): Emplacement {
  return { chemin: window.location.pathname, recherche: window.location.search };
}

const abonnes = new Set<() => void>();
let emplacementCourant: Emplacement =
  typeof window === 'undefined' ? { chemin: '/', recherche: '' } : lisLEmplacement();

function previens(): void {
  const suivant = lisLEmplacement();
  // L'IDENTITE de l'objet ne doit changer que si l'URL change reellement :
  // `useSyncExternalStore` compare par reference et re-rendrait a chaque
  // evenement sinon.
  if (suivant.chemin === emplacementCourant.chemin && suivant.recherche === emplacementCourant.recherche) return;
  emplacementCourant = suivant;
  for (const abonne of abonnes) abonne();
}

function abonne(surChangement: () => void): () => void {
  abonnes.add(surChangement);
  return () => abonnes.delete(surChangement);
}

export function navigue(url: string, remplace = false): void {
  if (remplace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  previens();
}

// --- La compilation des motifs --------------------------------------------

type MotifCompile = { readonly regex: RegExp; readonly noms: readonly string[] };

export function compile(motif: string): MotifCompile {
  const noms: string[] = [];
  const source = motif
    .split('/')
    .map((segment) => {
      if (!segment.startsWith('$')) return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      noms.push(segment.slice(1));
      return '([^/]+)';
    })
    .join('/');
  return { regex: new RegExp(`^${source}/?$`), noms };
}

/**
 * Apparie un chemin a un motif COMPILE et rend ses parametres, ou `null`.
 *
 * Fonction PURE et exportee pour qu'elle soit testable seule : l'appariement
 * est la seule logique du routeur ou une erreur se voit tard et mal (une route
 * qui ne prend pas, un parametre decode de travers), et la cacher dans un
 * composant reviendrait a la tester par capture d'ecran.
 */
export function apparie(compile: MotifCompile, chemin: string): Record<string, string> | null {
  const trouve = compile.regex.exec(chemin);
  if (!trouve) return null;
  const params: Record<string, string> = {};
  compile.noms.forEach((nom, i) => {
    params[nom] = decodeURIComponent(trouve[i + 1] ?? '');
  });
  return params;
}

// --- Le contexte -----------------------------------------------------------

type ContexteDeRoute = { readonly cle: string; readonly params: Record<string, string>; readonly recherche: URLSearchParams };

const Contexte = createContext<ContexteDeRoute | null>(null);

export function useRoute(): ContexteDeRoute {
  const contexte = useContext(Contexte);
  if (!contexte) throw new Error('useRoute() hors de <Routeur>');
  return contexte;
}

export function useParams<T extends string>(): ParamsDe<T> {
  return useRoute().params as ParamsDe<T>;
}

/** Les parametres de recherche, et de quoi les REECRIRE sans quitter l'ecran. */
export function useRecherche(): [URLSearchParams, (suivant: URLSearchParams, remplace?: boolean) => void] {
  const { recherche } = useRoute();
  const pose = useCallback((suivant: URLSearchParams, remplace = false) => {
    const chaine = suivant.toString();
    navigue(`${window.location.pathname}${chaine ? `?${chaine}` : ''}`, remplace);
  }, []);
  return [recherche, pose];
}

// --- La fabrique -----------------------------------------------------------

export function creeLeRouteur<T extends TableDeRoutes>(table: T, introuvable: ComponentType) {
  const entrees = Object.entries(table).map(([cle, route]) => ({
    cle,
    motif: route.motif,
    compile: compile(route.motif),
    // `lazy` est appele UNE fois par route : le module se memorise tout seul,
    // donc precharger revient a declencher l'import, et le rendu le retrouve.
    Ecran: lazy(route.ecran),
    charge: route.ecran,
  }));

  function adresse<C extends keyof T & string>(
    cle: C,
    params?: ParamsDe<T[C]['motif']>,
    recherche?: Record<string, string | undefined>,
  ): string {
    const entree = entrees.find((e) => e.cle === cle);
    if (!entree) throw new Error(`Route inconnue : ${cle}`);
    const chemin = entree.motif
      .split('/')
      .map((segment) =>
        segment.startsWith('$')
          ? encodeURIComponent((params as Record<string, string>)[segment.slice(1)] ?? '')
          : segment,
      )
      .join('/');
    const q = new URLSearchParams();
    for (const [nom, valeur] of Object.entries(recherche ?? {})) if (valeur !== undefined) q.set(nom, valeur);
    const chaine = q.toString();
    return `${chemin}${chaine ? `?${chaine}` : ''}`;
  }

  function Routeur({
    enveloppe,
    squelette,
  }: {
    enveloppe: (enfants: ReactNode) => ReactNode;
    /**
     * Ce qui s'affiche pendant qu'un ecran DECOUPE arrive. Sur la 3G visee ce
     * n'est pas un detail : le chunk d'un ecran met une seconde ou deux, et un
     * repli `null` rendrait un ecran BLANC pendant ce temps. La regle du depot
     * vaut ici comme ailleurs — un squelette qui dit ce qui manque, jamais un
     * spinner.
     */
    squelette: ReactNode;
  }) {
    const emplacement = useSyncExternalStore(abonne, () => emplacementCourant, () => emplacementCourant);

    const resolu = useMemo(() => {
      for (const entree of entrees) {
        const params = apparie(entree.compile, emplacement.chemin);
        if (params) return { entree, params };
      }
      return null;
    }, [emplacement.chemin]);

    const contexte = useMemo<ContexteDeRoute>(
      () => ({
        cle: resolu?.entree.cle ?? '',
        params: resolu?.params ?? {},
        recherche: new URLSearchParams(emplacement.recherche),
      }),
      [resolu, emplacement.recherche],
    );

    /**
     * RESTAURATION DU DEFILEMENT. Le navigateur la fait tout seul pour une
     * navigation de DOCUMENT ; en application, l'URL change sans que rien ne
     * se recharge, donc c'est a nous. On remonte en haut a chaque nouvelle
     * adresse, et on rend sa position a un retour arriere.
     */
    const positions = useRef(new Map<string, number>());
    const precedent = useRef<string | null>(null);
    useEffect(() => {
      const adresseCourante = emplacement.chemin + emplacement.recherche;
      if (precedent.current !== null) positions.current.set(precedent.current, window.scrollY);
      precedent.current = adresseCourante;
      window.scrollTo(0, positions.current.get(adresseCourante) ?? 0);
    }, [emplacement.chemin, emplacement.recherche]);

    useEffect(() => {
      const surPop = () => previens();
      window.addEventListener('popstate', surPop);
      return () => window.removeEventListener('popstate', surPop);
    }, []);

    const Ecran = resolu?.entree.Ecran ?? introuvable;

    return (
      <Contexte.Provider value={contexte}>
        {enveloppe(
          <Suspense fallback={squelette}>
            <Ecran />
          </Suspense>,
        )}
      </Contexte.Provider>
    );
  }

  function Lien<C extends keyof T & string>({
    vers,
    params,
    recherche,
    children,
    ...reste
  }: {
    vers: C;
    params?: ParamsDe<T[C]['motif']>;
    recherche?: Record<string, string | undefined>;
    children: ReactNode;
  } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children'>) {
    const href = adresse(vers, params, recherche);
    const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

    /**
     * PRECHARGEMENT A L'INTENTION, jamais au survol de passage : sur un reseau
     * paye au mega-octet, precharger ce que le pointeur traverse gaspille des
     * octets reels. 300 ms d'intention filtrent les passages.
     */
    const armePrechargement = () => {
      const entree = entrees.find((e) => e.cle === vers);
      if (!entree || minuteur.current) return;
      minuteur.current = setTimeout(() => void entree.charge(), 300);
    };
    const desarme = () => {
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = null;
    };
    useEffect(() => desarme, []);

    return (
      <a
        {...reste}
        href={href}
        onPointerEnter={armePrechargement}
        onPointerLeave={desarme}
        onFocus={armePrechargement}
        onBlur={desarme}
        onClick={(e) => {
          // On laisse le navigateur faire son travail quand l'utilisateur le
          // lui demande : nouvel onglet, telechargement, cible explicite.
          if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          desarme();
          navigue(href);
        }}
      >
        {children}
      </a>
    );
  }

  return { Routeur, Lien, adresse, navigue };
}
