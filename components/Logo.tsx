// Canada goose head inside an orienteering control ring.
// Paths are shared with the PWA icon route so the two never drift apart.

export const BODY_PATH = 'M2 64C6 52 16 46 28 47C40 48 52 52 62 64Z';
export const GOOSE_PATH =
  'M23 50C23 41 22 32 24 25C26 17 31 12 37 12C41 12 44 14 46 17L58 21.5C59 22 59 23.6 58 24L45 25C41 25.5 37 26.5 35 30C32 36 32 43 33 50Z';
export const CHINSTRAP_PATH = 'M27.5 20C30 16.5 35 17.5 37.5 22C38.5 26 36.5 29.5 33 30.5C29.5 30 27.5 26 27.5 20Z';

export const LOGO_COLORS = {
  field: '#E8EDE3',
  ink: '#15261F',
  body: '#8C7A62',
  ring: '#C8177E',
  white: '#FFFFFF',
};

export default function Logo({ size = 32, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={animated ? 'logo logo--animated' : 'logo'}
      aria-hidden
    >
      <defs>
        <clipPath id="logo-clip">
          <circle cx="32" cy="32" r="25" />
        </clipPath>
      </defs>
      <circle cx="32" cy="32" r="27" fill={LOGO_COLORS.field} />
      <g clipPath="url(#logo-clip)">
        <path d={BODY_PATH} fill={LOGO_COLORS.body} />
        <path d={GOOSE_PATH} fill={LOGO_COLORS.ink} />
        <path d={CHINSTRAP_PATH} fill={LOGO_COLORS.white} />
      </g>
      <circle cx="32" cy="32" r="27" fill="none" stroke={LOGO_COLORS.ring} strokeWidth="5" />
      {animated && <circle className="logo__ripple" cx="32" cy="32" r="27" fill="none" stroke={LOGO_COLORS.ring} strokeWidth="3" />}
    </svg>
  );
}

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="wordmark">
      <Logo size={size} />
      <span className="wordmark__text">Goosehunt</span>
    </span>
  );
}
