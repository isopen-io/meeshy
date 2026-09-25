## Leçon 104 — recharger un module pour remettre à zéro son état partagé recharge aussi son React

Le cooldown du delta-sync vit au niveau module (plusieurs écrans montent la même liste).
Pour isoler les témoins, premier réflexe : `jest.resetModules()` + `await import(...)`.

Les témoins de fonction pure passaient ; les `renderHook` tombaient sur
`TypeError: Cannot read properties of null (reading 'useContext')` — qui se lit comme un
`QueryClientProvider` manquant, alors que le provider était là.

`resetModules` vide le registre : le module fraîchement importé résout un `react` et un
`@tanstack/react-query` **différents** de ceux que le fichier de test importe
statiquement. Deux instances de React ⇒ dispatcher nul.

**L'état partagé d'un module se remet à zéro par la porte que la PRODUCTION utilise, pas
en détruisant le module.** Le garde lit `Date.now()` : un `jest.spyOn(Date, 'now')` qui
avance de dix minutes entre les tests le rouvre exactement comme le temps réel — sans
toucher au registre, sans export test-only dans le code de production. (La version
retenue de ce cycle a réglé le même besoin autrement : garde porté par une `WeakMap`
clé par `QueryClient`, donc naturellement isolé par client de test.)
