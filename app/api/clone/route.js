import { NextResponse } from 'next/server';
import { cloneGuild } from '@/lib/cloner';
import { addHistoryEntry } from '@/lib/history';
import { checkAndConsume } from '@/lib/ratelimit';

let activeClones = 0;
const MAX_CONCURRENT_CLONES = 10;
const GLOBAL_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes safety timeout

export async function POST(request) {
  const body = await request.json();
  const { userToken, sourceGuildId, targetGuildId, resetTargetServer, password, lang, cloneOptions } = body;

  if (activeClones >= MAX_CONCURRENT_CLONES) {
    return NextResponse.json({ error: 'OVERLOAD' }, { status: 429 });
  }

  if (password !== process.env.NEXT_PUBLIC_API_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  activeClones++;
  console.log(`Active clones: ${activeClones}`);

  const encoder = new TextEncoder();
  let isClosed = false;
  let decremented = false;
  let timeoutId;

  // Kendi AbortController'ımızı yönetiyoruz. request.signal'a değil,
  // stream'in cancel() callback'ine bağlıyoruz — çünkü Next.js'te
  // request.signal her ortamda güvenilir tetiklenmeyebiliyor.
  const abortController = new AbortController();

  const cleanup = () => {
    if (!decremented) {
      activeClones--;
      decremented = true;
      console.log(`Active clones: ${activeClones}`);
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data) => {
        if (!isClosed) {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch (e) {
            isClosed = true;
          }
        }
      };

      // Timeout logic
      timeoutId = setTimeout(() => {
        if (!isClosed) {
          send({ error: 'TIMEOUT' });
          isClosed = true;
          try {
            controller.close();
          } catch (e) {
            // Ignore if already closed
          }
          cleanup();
        }
      }, GLOBAL_TIMEOUT_MS);

      try {
        const startTime = Date.now();
        const result = await cloneGuild(userToken, {
          sourceGuildId,
          targetGuildId,
          resetTargetServer: resetTargetServer || false,
          lang: lang,
          checkRateLimit: checkAndConsume,
          abortSignal: abortController.signal,
          cloneOptions: {
            cloneRoles: cloneOptions?.cloneRoles !== false,
            cloneChannels: cloneOptions?.cloneChannels !== false,
            cloneEmojis: cloneOptions?.cloneEmojis !== false,
            cloneServerIcon: cloneOptions?.cloneServerIcon !== false,
            cloneServerBanner: cloneOptions?.cloneServerBanner !== false,
            cloneServerName: cloneOptions?.cloneServerName !== false
          }
        }, (progress) => {
          send(progress);
        });

        // Başarılı klonlama geçmişe kaydedilir
        addHistoryEntry({
          sourceGuildId,
          sourceGuildName: result?.sourceGuildName,
          targetGuildId,
          targetGuildName: result?.targetGuildName,
          status: 'success',
          rolesCloned: result?.rolesCloned,
          categoriesCloned: result?.categoriesCloned,
          channelsCloned: result?.channelsCloned,
          emojisCloned: result?.emojisCloned,
          durationMs: Date.now() - startTime
        });
      } catch (err) {
        if (err.code === 'RATE_LIMITED') {
          send({
            error: 'RATE_LIMITED',
            resetAt: err.resetAt,
            message: err.message
          });
        } else if (err.code === 'ABORTED') {
          send({ error: 'ABORTED', message: err.message });
        } else {
          send({ error: err.message });
        }

        // Hatalı/iptal edilen klonlama da geçmişe kaydedilir
        addHistoryEntry({
          sourceGuildId,
          targetGuildId,
          status: err.code === 'ABORTED' ? 'cancelled' : 'error',
          errorMessage: err.message
        });
      } finally {
        isClosed = true;
        try {
          controller.close();
        } catch (e) {
          // Ignore if already closed
        }
        cleanup();
      }
    },
    cancel() {
      isClosed = true;
      abortController.abort();
      cleanup();
      console.log("Client disconnected, aborting clone operation.");
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
