# Exemple d'Utilisation - Page Contacts avec Statuts Temps Réel

## Vue d'ensemble

Ce document montre comment intégrer le système de statut utilisateur temps réel dans la page Contacts.

## Implémentation

### Imports Nécessaires

```typescript
import { useUserStatusRealtime } from '@/hooks/use-user-status-realtime';
import { useUserStore } from '@/stores/user-store';
import { useEffect } from 'react';
```

### Dans le Composant ContactsPage

```typescript
export default function ContactsPage() {
  const router = useRouter();
  const user = useUser();
  const { t } = useI18n('contacts');

  // État local
  const [contacts, setContacts] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // ✅ NOUVEAU: Activer les listeners temps réel
  useUserStatusRealtime();

  // ✅ NOUVEAU: Store global des utilisateurs
  const storeParticipants = useUserStore(state => state.participants);
  const setStoreParticipants = useUserStore(state => state.setParticipants);

  // ✅ NOUVEAU: Initialiser le store avec les contacts
  useEffect(() => {
    if (contacts && contacts.length > 0) {
      setStoreParticipants(contacts);
    }
  }, [contacts, setStoreParticipants]);

  // ✅ NOUVEAU: Utiliser les contacts du store (mis à jour en temps réel)
  const activeContacts = useMemo(() => {
    if (storeParticipants.length === 0) {
      return contacts; // Fallback sur les contacts locaux
    }

    // Fusionner les contacts locaux avec les données du store
    return contacts.map(contact => {
      const storeUser = storeParticipants.find(u => u.id === contact.id);
      return storeUser || contact;
    });
  }, [contacts, storeParticipants]);

  // Charger les contacts au montage
  useEffect(() => {
    const fetchContacts = async () => {
      try {
        const contactsList = await usersService.getContacts();
        setContacts(contactsList);
      } catch (error) {
        console.error('Error loading contacts:', error);
        toast.error('Erreur lors du chargement des contacts');
      } finally {
        setLoading(false);
      }
    };

    fetchContacts();
  }, []);

  // Filtrer les contacts selon la recherche et le statut
  const filteredContacts = useMemo(() => {
    let result = activeContacts; // ✅ Utiliser activeContacts au lieu de contacts

    // Filtrer par recherche
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(contact =>
        contact.username.toLowerCase().includes(query) ||
        contact.displayName?.toLowerCase().includes(query) ||
        contact.email?.toLowerCase().includes(query)
      );
    }

    // Filtrer par onglet actif
    if (activeTab === 'connected') {
      result = result.filter(c => c.isOnline); // ✅ isOnline est maintenant en temps réel
    } else if (activeTab === 'offline') {
      result = result.filter(c => !c.isOnline); // ✅ isOnline est maintenant en temps réel
    }

    return result;
  }, [activeContacts, searchQuery, activeTab]);

  // Statistiques en temps réel
  const onlineCount = useMemo(() => {
    return activeContacts.filter(c => c.isOnline).length;
  }, [activeContacts]);

  const offlineCount = useMemo(() => {
    return activeContacts.filter(c => !c.isOnline).length;
  }, [activeContacts]);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Contacts</CardTitle>
                <CardDescription>
                  {activeContacts.length} contacts • {onlineCount} en ligne • {offlineCount} hors ligne
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {/* Barre de recherche */}
            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un contact..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Onglets */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="mb-4">
                <TabsTrigger value="all">
                  Tous ({activeContacts.length})
                </TabsTrigger>
                <TabsTrigger value="connected">
                  En ligne ({onlineCount})
                </TabsTrigger>
                <TabsTrigger value="offline">
                  Hors ligne ({offlineCount})
                </TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab}>
                {loading ? (
                  <div>Chargement...</div>
                ) : filteredContacts.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Aucun contact</h3>
                    <p className="text-muted-foreground">
                      Commencez par ajouter des contacts
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredContacts.map((contact) => (
                      <ContactCard
                        key={contact.id}
                        contact={contact}
                        onMessage={() => handleMessage(contact)}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
```

### Composant ContactCard

```typescript
interface ContactCardProps {
  contact: User;
  onMessage: () => void;
}

function ContactCard({ contact, onMessage }: ContactCardProps) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors">
      <div className="relative">
        <Avatar className="h-10 w-10">
          <AvatarImage src={contact.avatar} />
          <AvatarFallback>
            {contact.username.substring(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {/* Indicateur de statut en temps réel */}
        <div
          className={`absolute -bottom-0 -right-0 h-3 w-3 rounded-full border-2 border-card ${
            contact.isOnline ? 'bg-green-500' : 'bg-muted-foreground/50'
          }`}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">
            {contact.displayName || contact.username}
          </span>
          {contact.isOnline && (
            <Badge variant="secondary" className="text-xs">
              En ligne
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          @{contact.username}
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onMessage}
        className="h-8 w-8 p-0"
      >
        <MessageSquare className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

## Avantages

1. **Temps Réel**: Les statuts se mettent à jour instantanément sans polling
2. **Performance**: Aucune requête HTTP répétée
3. **Simplicité**: Le hook `useUserStatusRealtime()` gère tout automatiquement
4. **Cohérence**: Le store global garantit la cohérence entre tous les composants

## Points Clés

- Appeler `useUserStatusRealtime()` une seule fois dans le composant racine
- Initialiser le store avec `setStoreParticipants(contacts)` après chargement
- Utiliser `activeContacts` au lieu de `contacts` pour avoir les données temps réel
- Les statistiques (onlineCount, offlineCount) sont recalculées automatiquement

## Tests

Pour tester:
1. Ouvrir la page Contacts
2. Dans un autre navigateur/onglet, connecter/déconnecter un contact
3. Observer que le statut se met à jour instantanément (< 1 seconde)
4. Vérifier que les onglets "En ligne" / "Hors ligne" se mettent à jour

## Fallback Manuel (Optionnel)

Si vous voulez un bouton de rafraîchissement manuel:

```typescript
import { useManualStatusRefresh } from '@/hooks/use-manual-status-refresh';

const { refresh, isRefreshing } = useManualStatusRefresh(null); // null car pas de conversationId

<Button
  variant="ghost"
  size="sm"
  onClick={async () => {
    try {
      const contactsList = await usersService.getContacts();
      setContacts(contactsList);
      setStoreParticipants(contactsList);
      toast.success('Contacts rafraîchis');
    } catch (error) {
      toast.error('Erreur lors du rafraîchissement');
    }
  }}
  disabled={isRefreshing}
>
  <RefreshCw className={isRefreshing ? 'animate-spin' : ''} />
  Rafraîchir
</Button>
```

## Notes

- Le store `useUserStore` est global et partagé entre tous les composants
- Si plusieurs pages utilisent le store, elles partagent les mêmes données
- Les mises à jour sont propagées automatiquement à tous les composants abonnés
