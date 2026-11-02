"""
#13102 — un client Redis en mémoire, JOIGNABLE, qui parle comme `redis.asyncio`
pour ce que le translator emploie : chaînes à échéance, ensembles, transactions
`MULTI`/`EXEC`. Les caches de contenu n'écrivent plus que dans Redis : les
témoins qui exercent ce stockage ont besoin d'un Redis, pas d'un repli mémoire.
`fail_transaction` / `fail_setex` simulent une panne.
"""
import fnmatch
from collections import OrderedDict


class DictRedis:
    def __init__(self, fail_transaction=False, fail_setex=False):
        self.data = {}
        self.sets = {}
        self.ttls = {}
        self.fail_transaction = fail_transaction
        self.fail_setex = fail_setex
        self.keys_called = False

    @property
    def store(self):
        return {**self.data, **{k: sorted(v) for k, v in self.sets.items()}}

    async def get(self, key):
        return self.data.get(key)

    async def setex(self, key, ttl, value):
        if self.fail_setex:
            raise ConnectionError("écriture refusée")
        self.data[key] = value
        self.ttls[key] = ttl
        return True

    async def set(self, key, value, ex=None):
        self.data[key] = value
        return True

    async def delete(self, *keys):
        removed = [k for k in keys if k in self.data or k in self.sets]
        for k in removed:
            self.data.pop(k, None)
            self.sets.pop(k, None)
        return len(removed)

    async def exists(self, key):
        return 1 if key in self.data or key in self.sets else 0

    async def keys(self, pattern):
        self.keys_called = True
        return [k for k in self.store if fnmatch.fnmatchcase(k, pattern)]

    async def smembers(self, key):
        return set(self.sets.get(key, set()))

    async def ttl(self, key):
        return self.ttls.get(key, -1)

    async def scan_iter(self, match, count=None):
        for key in list(self.store):
            if fnmatch.fnmatchcase(key, match):
                yield key

    def pipeline(self, transaction=True):
        client = self

        class Pipe:
            def __init__(self):
                self.queued = []

            async def __aenter__(self):
                return self

            async def __aexit__(self, *exc):
                return False

            def setex(self, key, ttl, value):
                self.queued.append(("setex", key, ttl, value))

            def sadd(self, key, member):
                self.queued.append(("sadd", key, member))

            def expire(self, key, ttl):
                self.queued.append(("expire", key, ttl))

            async def execute(self):
                if client.fail_transaction:
                    raise ConnectionError("EXEC refusé")
                for op in self.queued:
                    if op[0] == "setex":
                        client.data[op[1]] = op[3]
                        client.ttls[op[1]] = op[2]
                    elif op[0] == "sadd":
                        client.sets.setdefault(op[1], set()).add(op[2])
                    else:
                        client.ttls[op[1]] = op[2]
                return [True] * len(self.queued)

        return Pipe()


def make_durable(service, client=None):
    service.permanently_disabled = False
    service.is_redis_available = True
    service.redis = client or DictRedis()
    return service


def durable_service(client=None, available=True):
    """Un `RedisService` réel posé sur ce client, hors singleton."""
    from services.redis_service import RedisService

    service = object.__new__(RedisService)
    service.permanently_disabled = False
    service.is_redis_available = available
    service.redis = client or DictRedis()
    service.memory_cache = OrderedDict()
    service.connection_attempts = 0
    service.max_connection_attempts = 3
    return service
