'use client';

import { useCallback, useMemo, useState } from 'react';
import type {
  ComposerReference,
  PostReferenceDisplay,
  PostReferenceInput,
} from '@meeshy/shared/types/post-reference';
import { upsertReference, removeReference, referencePayload } from '@meeshy/shared/utils/composer-references';

/** D'où vient le geste — et donc quel mode un simple clic pose. */
export type PickContext = 'picker' | 'textList';

/**
 * Depuis le chip, on nomme quelqu'un SANS l'écrire : le plus discret gagne.
 * Depuis la liste @, on est en train de l'écrire : l'inline gagne.
 */
export const TAP_DEFAULT: Record<PickContext, PostReferenceDisplay> = {
  picker: 'SILENT',
  textList: 'INLINE',
};

type PickedPerson = { readonly username: string; readonly userId?: string };

type UseReferencesReturn = {
  readonly references: ComposerReference[];
  readonly pick: (person: PickedPerson, context: PickContext, display?: PostReferenceDisplay) => void;
  readonly drop: (username: string) => void;
  readonly clear: () => void;
  readonly payload: PostReferenceInput[];
};

export function useReferences(): UseReferencesReturn {
  const [references, setReferences] = useState<ComposerReference[]>([]);

  const pick = useCallback(
    (person: PickedPerson, context: PickContext, display?: PostReferenceDisplay) => {
      const resolvedDisplay = display ?? TAP_DEFAULT[context];
      setReferences((current) => upsertReference({ ...person, display: resolvedDisplay }, current));
    },
    []
  );

  const drop = useCallback((username: string) => {
    setReferences((current) => removeReference(username, current));
  }, []);

  const clear = useCallback(() => setReferences([]), []);

  const payload = useMemo(() => referencePayload(references), [references]);

  return { references, pick, drop, clear, payload };
}
