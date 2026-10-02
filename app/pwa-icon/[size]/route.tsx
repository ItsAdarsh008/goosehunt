import { ImageResponse } from 'next/og';

const SIZES = [180, 192, 512];

// PNG app icons rendered on demand, so the repo has no binary assets.
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const requested = Number((await params).size);
  const size = SIZES.includes(requested) ? requested : 192;
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1c1b17',
        }}
      >
        <div
          style={{
            width: size * 0.5,
            height: size * 0.5,
            borderRadius: '50%',
            background: '#ea6a1f',
            border: `${Math.round(size * 0.06)}px solid #f4efe4`,
            display: 'flex',
          }}
        />
      </div>
    ),
    { width: size, height: size, headers: { 'Cache-Control': 'public, max-age=604800, immutable' } },
  );
}
