# Analyse de l'ordre des messages

## Backend retourne (ligne 811):
```typescript
orderBy: { createdAt: 'desc' }
```
= Du plus RÉCENT au plus ANCIEN
= Array: [Message_récent_1, Message_récent_2, ..., Message_ancien_20]

## Frontend avec reverseOrder=false:
```typescript
return reverseOrder ? [...transformedMessages].reverse() : transformedMessages;
```
= Garde l'ordre de l'array
= Affiche: Message_récent_1 (en haut) → Message_ancien_20 (en bas)

## Frontend avec reverseOrder=true:
= Inverse l'array
= Affiche: Message_ancien_20 (en haut) → Message_récent_1 (en bas)

## Ce que l'utilisateur veut pour la page `/`:
- Messages ANCIENS en HAUT
- Messages RÉCENTS en BAS
- Scroll vers le BAS pour charger ENCORE PLUS anciens
- Bouton "Load More" EN BAS

## Donc il faut:
- reverseOrder = TRUE (pour inverser et avoir anciens en haut)
- scrollDirection = 'down' (scroll vers le bas)
- Ajouter les nouveaux messages anciens AU DÉBUT de l'array

