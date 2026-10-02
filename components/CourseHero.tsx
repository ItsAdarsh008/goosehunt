// Animated hero: an orienteering-style course over contour lines. A ping wave sweeps out
// from the centre every few seconds and each hider lights up as the wave reaches them.

const CENTER = { x: 180, y: 120 };
// The wave (r=240) grows over 2.2s of a 5s loop (see .course__wave in globals.css): 240 / 2.2 ≈ 110 units/s.
const WAVE_SPEED = 110;
/** First wave waits for the course lines to finish drawing. */
const WAVE_START = 1.6;

const HIDERS = [
  { x: 84, y: 68 },
  { x: 302, y: 168 },
  { x: 146, y: 204 },
  { x: 262, y: 42 },
  { x: 56, y: 170 },
];

const CONTROLS = [
  { x: 120, y: 150 },
  { x: 214, y: 182 },
  { x: 284, y: 96 },
];

export default function CourseHero() {
  return (
    <svg className="course" viewBox="0 0 360 240" role="img" aria-label="Map with hiders lighting up as a ping sweeps across">
      <g className="course__contours">
        <path d="M-10 40C60 20 110 60 170 44S290 0 380 30" />
        <path d="M-10 70C50 52 120 96 180 78S300 34 380 62" />
        <path d="M-10 214C70 196 120 228 200 206S320 170 380 196" />
        <path d="M-10 236C80 222 140 250 210 232S330 204 380 222" />
        <path d="M118 120C118 98 146 88 170 96S214 120 204 140 160 160 138 150 118 136 118 120Z" />
        <path d="M134 122C134 108 152 102 168 108S192 124 186 134 160 144 148 140 134 132 134 122Z" />
        <path d="M232 120C240 104 270 102 290 112S318 142 300 150 252 152 240 142 226 132 232 120Z" />
      </g>

      <g className="course__leg">
        <path d={`M40 206L${CONTROLS[0].x} ${CONTROLS[0].y}`} style={{ animationDelay: '0.2s' }} />
        <path
          d={`M${CONTROLS[0].x} ${CONTROLS[0].y}L${CONTROLS[1].x} ${CONTROLS[1].y}`}
          style={{ animationDelay: '0.55s' }}
        />
        <path
          d={`M${CONTROLS[1].x} ${CONTROLS[1].y}L${CONTROLS[2].x} ${CONTROLS[2].y}`}
          style={{ animationDelay: '0.9s' }}
        />
        <path d={`M${CONTROLS[2].x} ${CONTROLS[2].y}L320 40`} style={{ animationDelay: '1.25s' }} />
      </g>
      <g className="course__marks">
        <path d="M40 194L51 213H29Z" />
        {CONTROLS.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="11" style={{ animationDelay: `${0.45 + i * 0.35}s` }} />
        ))}
        <circle cx="320" cy="40" r="11" style={{ animationDelay: '1.5s' }} />
        <circle cx="320" cy="40" r="7" style={{ animationDelay: '1.5s' }} />
      </g>

      <circle className="course__wave" cx={CENTER.x} cy={CENTER.y} r="240" style={{ animationDelay: `${WAVE_START}s` }} />

      {HIDERS.map((h, i) => {
        const delay = `${(WAVE_START + Math.hypot(h.x - CENTER.x, h.y - CENTER.y) / WAVE_SPEED).toFixed(2)}s`;
        return (
          <g key={i} className="course__hider" style={{ animationDelay: delay }}>
            <circle className="course__hider-ring" cx={h.x} cy={h.y} r="14" style={{ animationDelay: delay }} />
            <circle className="course__hider-dot" cx={h.x} cy={h.y} r="5.5" style={{ animationDelay: delay }} />
          </g>
        );
      })}
    </svg>
  );
}
