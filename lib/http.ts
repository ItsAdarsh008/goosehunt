export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Wraps a route handler: returns JSON, maps HttpError to its status, hides other errors. */
export function route<C>(fn: (req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      const body = await fn(req, ctx);
      return Response.json(body ?? { ok: true }, { headers: NO_STORE });
    } catch (e) {
      if (e instanceof HttpError) {
        return Response.json({ error: e.message }, { status: e.status, headers: NO_STORE });
      }
      console.error(e);
      return Response.json({ error: 'Server error' }, { status: 500, headers: NO_STORE });
    }
  };
}

export type CodeCtx = { params: Promise<{ code: string }> };

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

export function cleanName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (!name) throw new HttpError(400, 'Enter a name');
  if (name.length > 24) throw new HttpError(400, 'Name must be 24 characters or fewer');
  return name;
}
