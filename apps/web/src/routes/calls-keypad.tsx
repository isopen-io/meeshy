import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { unwrap } from '@/lib/api/client';
import { createDirectConversation } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import type { PersonSummary } from '@/lib/api/friend-requests';
import { appQueryClient } from '@/lib/api/query-client';
import { searchUsers } from '@/lib/api/users-search';
import { lookupUserByPhone } from '@/lib/api/users-phone';
import { callActions } from '@/lib/calls/call-actions';
import { startCallWithPerson } from '@/lib/calls/call-starter';
import type { CallMedia } from '@/lib/calls/call-store';
import { primeTones } from '@/lib/calls/call-tones';
import { classifyKeypadInput, KEYPAD_DEBOUNCE_MS, keypadAppend, keypadDeleteLast, nameSearchKey, phoneLookupKey, type KeypadQuery } from '@/lib/calls/keypad';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import {
  KeypadCallFailed,
  KeypadField,
  KeypadHeader,
  KeypadPad,
  KeypadResult,
  KeypadStatusView,
  type KeypadStatus,
} from '@/routes/calls-keypad-parts';

/**
 * **LE PAVÉ DU HUB APPELS** (#6454) — `/calls/keypad`, l'onglet `.keypad` de
 * `ContactsHubView` servi en écran frère du journal (D-61). Une saisie, deux
 * recherches, classées SEULES (`classifyKeypadInput`) : un numéro par
 * `GET /users/phone/:phone`, un nom par `GET /directory/people`. Seule la
 * dernière frappe interroge (300 ms, `scheduleSearch()` d'iOS) ; une réponse
 * dépassée ne s'affiche jamais, parce que la requête est CLÉE par la saisie.
 *
 * Chaque résultat s'appelle en vocal ou en vidéo : le direct s'ouvre, puis
 * l'appel part (`startCallWithPerson`, miroir `CallStarter`).
 */

function useDebounced(query: KeypadQuery): KeypadQuery {
  const [settled, setSettled] = useState(query);
  const key = query.kind === 'idle' ? '' : `${query.kind}:${query.value}`;
  useEffect(() => {
    const timer = setTimeout(() => setSettled(query), query.kind === 'idle' ? 0 : KEYPAD_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la clé porte la saisie entière
  }, [key]);
  return settled;
}

async function search(query: KeypadQuery): Promise<readonly PersonSummary[]> {
  if (query.kind === 'idle') return [];
  if (query.kind === 'phone') {
    const found = unwrap(await lookupUserByPhone(apiDeps, query.value));
    return found === null ? [] : [found];
  }
  return unwrap(await searchUsers(apiDeps, query.value));
}

export default function CallsKeypadScreen() {
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const [input, setInput] = useState('');
  const [failed, setFailed] = useState(false);
  const typed = classifyKeypadInput(input);
  const settled = useDebounced(typed);
  const pending = typed.kind !== 'idle' && (settled.kind === 'idle' || settled.kind !== typed.kind || typed.value !== settled.value);

  const results = useQuery(
    {
      queryKey: settled.kind === 'phone' ? phoneLookupKey(settled.value) : settled.kind === 'name' ? nameSearchKey(settled.value) : (['keypad', 'idle'] as const),
      queryFn: () => search(settled),
      enabled: settled.kind !== 'idle',
      staleTime: 60_000,
      gcTime: 60_000,
      retry: false,
    },
    appQueryClient,
  );

  const onChange = useCallback((next: string) => {
    setFailed(false);
    setInput(next);
  }, []);

  const onCall = useCallback((person: PersonSummary, media: CallMedia) => {
    setFailed(false);
    void startCallWithPerson({
      person: { id: person.id, name: person.displayName ?? person.username, avatar: person.avatar },
      media,
      prime: primeTones,
      openDirect: async (participantId) => {
        const opened = await createDirectConversation(apiDeps, participantId);
        return opened.ok ? { ok: true, data: { id: opened.data.id } } : opened;
      },
      start: callActions.start,
    }).then((outcome) => setFailed(!outcome.ok));
  }, []);

  const people = settled.kind === 'idle' || results.data === undefined ? null : results.data;
  const status: KeypadStatus | null =
    typed.kind === 'idle'
      ? 'idle'
      : pending || (results.isFetching && people === null)
        ? online
          ? 'searching'
          : 'offline'
        : people !== null
          ? people.length === 0
            ? 'none'
            : null
          : results.isError
            ? online
              ? 'error'
              : 'offline'
            : results.isPaused || !online
              ? 'offline'
              : 'searching';

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden pt-safe">
      <KeypadHeader language={language} />
      <KeypadField
        language={language}
        value={input}
        onChange={onChange}
        onDelete={() => onChange(keypadDeleteLast(input))}
        onClear={() => onChange('')}
      />
      <div id="contenu" className="scrollbar-none flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain" aria-live="polite">
        {failed ? <KeypadCallFailed language={language} /> : null}
        {status !== null ? (
          <KeypadStatusView language={language} status={status} onRetry={() => void results.refetch()} />
        ) : (
          <ul data-keypad-results aria-label={translate(language, 'keypad.results')}>
            {(people ?? []).map((person) => (
              <KeypadResult key={person.id} language={language} person={person} onCall={onCall} />
            ))}
          </ul>
        )}
      </div>
      <div className="pb-safe">
        <KeypadPad onKey={(digit) => onChange(keypadAppend(input, digit))} />
      </div>
    </main>
  );
}
