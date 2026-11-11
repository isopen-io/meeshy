import '@/styles/glass-kit.css';
import { createContext, useContext, type ElementType, type HTMLAttributes, type ReactNode } from 'react';

import {
  meeshyGlassRecipe,
  type MeeshyGlassDensity,
  type MeeshyGlassTint,
  type MeeshyGlassTone,
} from './meeshy-glass-recipe';

export {
  MEESHY_GLASS_TONES,
  meeshyGlassRecipe,
  resolveMeeshyGlassTone,
  type MeeshyGlassDensity,
  type MeeshyGlassFill,
  type MeeshyGlassMaterial,
  type MeeshyGlassRecipe,
  type MeeshyGlassRecipeInput,
  type MeeshyGlassTint,
  type MeeshyGlassTone,
} from './meeshy-glass-recipe';

type MeeshyGlassHost = {
  readonly tone: MeeshyGlassTone;
  readonly nested: boolean;
  readonly opaque: boolean;
};

const HOSTS = new Map<string, MeeshyGlassHost>();

const hostOf = (host: MeeshyGlassHost): MeeshyGlassHost => {
  const key = `${host.tone}|${host.nested}|${host.opaque}`;
  const known = HOSTS.get(key);
  if (known !== undefined) return known;
  HOSTS.set(key, host);
  return host;
};

const OPEN_HOST = hostOf({ tone: 'deep', nested: false, opaque: false });

const MeeshyGlassHostContext = createContext<MeeshyGlassHost>(OPEN_HOST);

export type MeeshyGlassProps = Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'> & {
  readonly as?: ElementType;
  readonly tone?: MeeshyGlassTone;
  readonly density?: MeeshyGlassDensity;
  readonly tint?: MeeshyGlassTint;
  readonly interactive?: boolean;
  readonly pressed?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
  readonly type?: 'button' | 'submit' | 'reset';
  readonly disabled?: boolean;
};

export function MeeshyGlass({
  as: Tag = 'div',
  tone,
  density = 'regular',
  tint,
  interactive = false,
  pressed = false,
  className,
  children,
  ...rest
}: MeeshyGlassProps) {
  const host = useContext(MeeshyGlassHostContext);
  const resolved = tone ?? host.tone;
  const recipe = meeshyGlassRecipe({
    tone: resolved,
    density,
    tint: tint ?? null,
    isInteractive: interactive,
    isPressed: pressed,
    isNested: host.nested,
    material: host.opaque ? 'opaque' : 'drawn',
  });
  return (
    <Tag {...rest} {...recipe.attributes} className={className === undefined ? recipe.className : `${recipe.className} ${className}`}>
      <MeeshyGlassHostContext.Provider value={hostOf({ tone: resolved, nested: true, opaque: host.opaque })}>{children}</MeeshyGlassHostContext.Provider>
    </Tag>
  );
}

export function MeeshyGlassScope({
  tone,
  opaque,
  children,
}: {
  readonly tone: MeeshyGlassTone;
  readonly opaque?: boolean;
  readonly children?: ReactNode;
}) {
  const host = useContext(MeeshyGlassHostContext);
  const forced = opaque ?? host.opaque;
  return (
    <div data-glass-scope="" data-glass-tone={tone} className="glass-scope">
      <MeeshyGlassHostContext.Provider value={hostOf({ tone, nested: host.nested, opaque: forced })}>{children}</MeeshyGlassHostContext.Provider>
    </div>
  );
}

export function MeeshyGlassGroup({ className, children }: { readonly className?: string; readonly children?: ReactNode }) {
  return (
    <div data-glass-group="" className={className === undefined ? 'glass-group' : `glass-group ${className}`}>
      {children}
    </div>
  );
}
