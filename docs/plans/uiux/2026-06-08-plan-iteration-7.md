# UI/UX Plan — Iteration 7 (2026-06-08)

## Goals

1. iOS: MessageEffectModifiers — MeeshyColors migration (3 hardcoded #6366F1 → indigo500)
2. Web: language-select — i18n 2 placeholder defaults
3. Web: translation-monitor — i18n 4 strings + dark mode 5 violations
4. Web: AgentGlobalConfigTab — i18n 1 placeholder
5. Web: AgentConfigDialog — i18n 5 placeholders (add hook)
6. Web: AgentTopicEditModal — i18n 2 placeholders (add hook)
7. Web: RankingFilters — i18n 2 more placeholders
8. Web: ConversationDrawer — i18n 2 placeholders (wire existing keys)
9. Web: MessageSearch — i18n placeholder + a11y (add hook)
10. Web: ScanLogTable — a11y 2 pagination buttons
11. Web: DeliveryQueuePanel — a11y 1 icon button + i18n 2 strings
12. Web: ConversationSidebar — a11y 2 icon buttons

---

## Locale JSON additions (×4 languages)

### components.json — `components.languageSelect`

Add:
- `placeholder`: "Select a language" / "Sélectionner une langue" / "Seleccionar un idioma" / "Selecionar um idioma"
- `search`: "Search a language..." / "Rechercher une langue..." / "Buscar un idioma..." / "Pesquisar um idioma..."

### admin.json — new keys

Under `agentGlobal`:
- `systemPromptPlaceholder`: "Global system prompt for all agents..." / "Prompt système global pour tous les agents..." / "Prompt de sistema global para todos los agentes..." / "Prompt de sistema global para todos os agentes..."

Under `agentConfig`:
- `searchGroup`: "Search a group, channel, or discussion..." / "Rechercher un groupe, un canal ou une discussion..." / "Buscar un grupo, canal o discusión..." / "Pesquisar um grupo, canal ou discussão..."
- `searchTriggers`: "Search to restrict triggers..." / "Chercher pour restreindre les triggers..." / "Buscar para restringir los disparadores..." / "Pesquisar para restringir os gatilhos..."
- `addControlledUser`: "Add a user under control..." / "Ajouter un utilisateur sous contrôle..." / "Agregar un usuario bajo control..." / "Adicionar um utilizador sob controlo..."
- `excludeUser`: "Exclude a user from control..." / "Exclure un utilisateur du contrôle..." / "Excluir un usuario del control..." / "Excluir um utilizador do controlo..."
- `agentInstructions`: "Custom instructions for this agent..." / "Instructions personnalisées pour l'agent dans cette conversation..." / "Instrucciones personalizadas para el agente..." / "Instruções personalizadas para o agente..."

Under `agentTopic`:
- `newTopicPrompt`: "Start a NEW topic on {{label}}..." / "Lance un NOUVEAU sujet sur {{label}}..." / "Iniciar un NUEVO tema sobre {{label}}..." / "Iniciar um NOVO tópico sobre {{label}}..."
- `searchQuery`: "{{label}} news this week" / "actualité {{label}} cette semaine" / "noticias de {{label}} esta semana" / "notícias de {{label}} esta semana"

Under `ranking`:
- `filterCriteria`: "Filter criteria..." / "Filtrer les critères..." / "Filtrar criterios..." / "Filtrar critérios..."
- `resultsCount`: "Number of results" / "Nombre de résultats" / "Número de resultados" / "Número de resultados"

Under `scanLog`:
- `previousPage`: "Previous page" / "Page précédente" / "Página anterior" / "Página anterior"
- `nextPage`: "Next page" / "Page suivante" / "Página siguiente" / "Página seguinte"

Under `deliveryQueue`:
- `retry`: "Retry" / "Réessayer" / "Reintentar" / "Tentar novamente"
- `refresh`: "Refresh" / "Actualiser" / "Actualizar" / "Atualizar"
- `pending`: "pending" / "en attente" / "pendiente" / "pendente"

Under `translationMonitor`:
- `queue`: "Queue" / "File d'attente" / "Cola" / "Fila"
- `errorsUnit`: "errors" / "erreurs" / "errores" / "erros"
- `lastUpdated`: "Last updated:" / "Dernière mise à jour:" / "Última actualización:" / "Última atualização:"

### conversations.json — new keys

Under `messageSearch`:
- `placeholder`: "Search in conversation…" / "Rechercher dans la conversation…" / "Buscar en la conversación…" / "Pesquisar na conversa…"
- `closeSearch`: "Close search" / "Fermer la recherche" / "Cerrar búsqueda" / "Fechar pesquisa"

Under `conversationSidebar`:
- `newConversation`: "New conversation" / "Nouvelle conversation" / "Nueva conversación" / "Nova conversa"
- `settings`: "Settings" / "Paramètres" / "Configuración" / "Definições"

---

## Checklist

- [ ] iOS: MessageEffectModifiers — 3 × MeeshyColors.indigo500
- [ ] Locales: components.json — languageSelect.placeholder + search (×4)
- [ ] Locales: admin.json — 15 new keys (×4)
- [ ] Locales: conversations.json — 4 new keys (×4)
- [ ] Web: language-select.tsx — wire 2 t() calls
- [ ] Web: translation-monitor.tsx — wire 4 t() calls + 5 dark mode fixes
- [ ] Web: AgentGlobalConfigTab.tsx — wire 1 t() call
- [ ] Web: AgentConfigDialog.tsx — add useI18n + wire 5 t() calls
- [ ] Web: AgentTopicEditModal.tsx — add useI18n + wire 2 t() calls
- [ ] Web: RankingFilters.tsx — wire 2 t() calls
- [ ] Web: ConversationDrawer.tsx — wire 2 t() calls
- [ ] Web: MessageSearch.tsx — add useI18n + wire 2 t() calls
- [ ] Web: ScanLogTable.tsx — 2 aria-labels
- [ ] Web: DeliveryQueuePanel.tsx — 1 aria-label + 2 i18n strings
- [ ] Web: ConversationSidebar.tsx — 2 aria-labels
