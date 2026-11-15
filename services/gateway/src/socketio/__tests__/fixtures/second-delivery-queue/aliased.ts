// Fixture — la forme ALIASÉE : l'identifiant est rebaptisé à l'import, et
// `new Queue(` ne ressemble plus à rien que l'on puisse chercher. Le balayage
// refuse l'ALIAS plutôt que de le suivre : résoudre les noms ferait de lui un
// demi-résolveur de modules, l'interdire ferme la famille à la ligne.
import { RedisDeliveryQueue as Queue } from '../../../../services/RedisDeliveryQueue';

export const aliased = (store: unknown) => new Queue(store as never);
