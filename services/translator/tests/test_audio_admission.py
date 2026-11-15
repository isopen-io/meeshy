"""
#11268 — le vocal d'un MESSAGE passe avant le média d'un POST. Les requêtes
`audio_process` entrent par une admission à priorités, dont la concurrence est
bornée : quand une place se libère, la requête de plus haute priorité part
d'abord, puis l'ordre d'arrivée départage.
"""

import asyncio

from utils.audio_admission import (
    MESSAGE_VOICE,
    POST_MEDIA,
    AudioAdmission,
    audio_process_concurrency,
    audio_request_priority,
)


def test_a_message_vocal_outranks_a_post_media():
    assert audio_request_priority({"messageId": "m", "attachmentId": "a"}) == MESSAGE_VOICE
    assert audio_request_priority({"messageId": "m", "postId": "p", "postMediaId": "pm"}) == POST_MEDIA
    assert MESSAGE_VOICE < POST_MEDIA


def test_the_concurrency_reads_its_environment_and_stays_positive():
    assert audio_process_concurrency({}) == 2
    assert audio_process_concurrency({"AUDIO_PROCESS_CONCURRENCY": "4"}) == 4
    assert audio_process_concurrency({"AUDIO_PROCESS_CONCURRENCY": "0"}) == 2
    assert audio_process_concurrency({"AUDIO_PROCESS_CONCURRENCY": "beaucoup"}) == 2


def test_when_a_place_frees_up_the_message_vocal_goes_before_the_post_media_that_waited_longer():
    async def scenario():
        admission = AudioAdmission(concurrency=1)
        order = []
        release_first = asyncio.Event()

        async def job(name, wait=None):
            order.append(f"start:{name}")
            if wait is not None:
                await wait.wait()
            order.append(f"end:{name}")
            return name

        first = asyncio.create_task(admission.run(POST_MEDIA, lambda: job("post-1", release_first)))
        await asyncio.sleep(0)
        queued_post = asyncio.create_task(admission.run(POST_MEDIA, lambda: job("post-2")))
        await asyncio.sleep(0)
        queued_vocal = asyncio.create_task(admission.run(MESSAGE_VOICE, lambda: job("vocal")))
        await asyncio.sleep(0)
        release_first.set()
        results = await asyncio.gather(first, queued_post, queued_vocal)
        return order, results

    order, results = asyncio.run(scenario())

    assert results == ["post-1", "post-2", "vocal"]
    assert order.index("start:vocal") < order.index("start:post-2")


def test_a_failing_job_frees_its_place_and_lets_its_error_through():
    async def scenario():
        admission = AudioAdmission(concurrency=1)

        async def broken():
            raise RuntimeError("whisper")

        async def fine():
            return "ok"

        failed = asyncio.create_task(admission.run(MESSAGE_VOICE, broken))
        after = asyncio.create_task(admission.run(MESSAGE_VOICE, fine))
        outcomes = await asyncio.gather(failed, after, return_exceptions=True)
        return outcomes

    failed, after = asyncio.run(scenario())

    assert isinstance(failed, RuntimeError)
    assert after == "ok"


def test_never_runs_more_jobs_at_once_than_its_concurrency():
    async def scenario():
        admission = AudioAdmission(concurrency=2)
        running = 0
        peak = 0

        async def job():
            nonlocal running, peak
            running += 1
            peak = max(peak, running)
            await asyncio.sleep(0.01)
            running -= 1

        await asyncio.gather(*(admission.run(POST_MEDIA, job) for _ in range(6)))
        return peak

    assert asyncio.run(scenario()) == 2
