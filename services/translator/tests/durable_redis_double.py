"""
#13102 — un client Redis en mémoire, JOIGNABLE : les caches de contenu
(transcriptions, traductions, pistes) n'écrivent plus dans le cache mémoire
de repli, seulement dans Redis. Les témoins qui exercent ce stockage ont donc
besoin d'un Redis, pas d'un repli.
"""
import fnmatch


class DictRedis:
    def __init__(self):
        self.data = {}
        self.ttls = {}

    async def get(self, key):
        return self.data.get(key)

    async def setex(self, key, ttl, value):
        self.data[key] = value
        self.ttls[key] = ttl
        return True

    async def set(self, key, value, ex=None):
        self.data[key] = value
        return True

    async def delete(self, *keys):
        removed = [k for k in keys if k in self.data]
        for k in removed:
            del self.data[k]
        return len(removed)

    async def exists(self, key):
        return 1 if key in self.data else 0

    async def keys(self, pattern):
        return [k for k in self.data if fnmatch.fnmatchcase(k, pattern)]

    async def ttl(self, key):
        return self.ttls.get(key, -1)

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
                self.queued.append((key, ttl, value))

            async def execute(self):
                for key, ttl, value in self.queued:
                    client.data[key] = value
                    client.ttls[key] = ttl
                return [True] * len(self.queued)

        return Pipe()

    async def scan_iter(self, match, count=None):
        for key in list(self.data):
            if fnmatch.fnmatchcase(key, match):
                yield key


def make_durable(service):
    service.permanently_disabled = False
    service.is_redis_available = True
    service.redis = DictRedis()
    return service
