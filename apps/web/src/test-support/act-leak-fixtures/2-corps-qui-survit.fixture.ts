import { act } from 'react';
import { test } from 'bun:test';

/* LE SECOND COUPABLE (#9509) : il dépasse son délai HORS de toute portée, puis
   son corps abandonné se réveille pendant les témoins du fichier suivant et
   ouvre ses propres `act()` par-dessus les leurs. */
test('un corps qui survit à son délai puis rouvre des act()', async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 150));
  for (let i = 0; i < 20; i += 1) {
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));
  }
}, 50);
