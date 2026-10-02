import { ImageResponse } from 'next/og';
import { BODY_PATH, CHINSTRAP_PATH, GOOSE_PATH, LOGO_COLORS } from '@/components/Logo';

const SIZES = [180, 192, 512];

// PNG app icons rendered on demand from the same paths as <Logo />, so the repo has no binary assets.
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const requested = Number((await params).size);
  const size = SIZES.includes(requested) ? requested : 192;
  // Inner artwork sits within the maskable-icon safe zone (central 80%).
  const art = Math.round(size * 0.72);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: LOGO_COLORS.field,
        }}
      >
        <svg width={art} height={art} viewBox="0 0 64 64">
          <defs>
            <clipPath id="c">
              <circle cx="32" cy="32" r="25" />
            </clipPath>
          </defs>
          <g clipPath="url(#c)">
            <path d={BODY_PATH} fill={LOGO_COLORS.body} />
            <path d={GOOSE_PATH} fill={LOGO_COLORS.ink} />
            <path d={CHINSTRAP_PATH} fill={LOGO_COLORS.white} />
          </g>
          <circle cx="32" cy="32" r="27" fill="none" stroke={LOGO_COLORS.ring} strokeWidth="5" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
