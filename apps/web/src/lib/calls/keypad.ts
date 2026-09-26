/**
 * **LE PAVÉ DU HUB APPELS** (#6454) — les règles pures de `KeypadViewModel.swift` :
 * une saisie faite SEULEMENT de caractères de téléphone (`0-9 + - ( ) .` et
 * l'espace) cherche un compte par numéro exact, à partir de trois chiffres ;
 * toute autre saisie cherche par nom, à partir de deux caractères ; en deçà,
 * le pavé reste au repos plutôt que d'interroger la passerelle à chaque touche.
 */

export type KeypadKey = { readonly digit: string; readonly letters: string };

export const KEYPAD_KEYS: readonly KeypadKey[] = [
  { digit: '1', letters: '' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '+', letters: '' },
  { digit: '0', letters: '' },
  { digit: '#', letters: '' },
];

/** Le délai de `scheduleSearch()` d'iOS : seule la dernière frappe interroge. */
export const KEYPAD_DEBOUNCE_MS = 300;

const MIN_PHONE_DIGITS = 3;
const MIN_NAME_LENGTH = 2;
const PHONE_CHARS = /^[0-9+\s\-().]+$/;

export type KeypadQuery = { readonly kind: 'idle' } | { readonly kind: 'phone'; readonly value: string } | { readonly kind: 'name'; readonly value: string };

export function classifyKeypadInput(input: string): KeypadQuery {
  const trimmed = input.trim();
  if (trimmed === '') return { kind: 'idle' };
  if (PHONE_CHARS.test(trimmed)) {
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length < MIN_PHONE_DIGITS) return { kind: 'idle' };
    return { kind: 'phone', value: `${trimmed.startsWith('+') ? '+' : ''}${digits}` };
  }
  return [...trimmed].length < MIN_NAME_LENGTH ? { kind: 'idle' } : { kind: 'name', value: trimmed };
}

export const keypadAppend = (input: string, key: string): string => `${input}${key}`;

export const keypadDeleteLast = (input: string): string => [...input].slice(0, -1).join('');

export const phoneLookupKey = (phone: string) => ['keypad', 'phone', phone] as const;
export const nameSearchKey = (name: string) => ['keypad', 'name', name] as const;
