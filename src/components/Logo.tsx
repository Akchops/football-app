// Matchday's mark: a faceted ball with one panel lit green. The six panels a
// regular dodecahedron shows face-on, lit from the top left, flat colours with
// real gaps for seams - the same artwork as docs/brand/logo/symbol.svg, with
// the seams a little wider since it's drawn at around 24px.
const GREEN = '#30D27C';
const LIGHT = '#3B3F45';
const MID = '#35393E';
const DARK = '#2A2E32';

const PANELS: [string, string][] = [
  ['M230.52,87.38L193.65,36.64L134,17.26L134,51.01L198.41,97.81Z', GREEN],
  ['M21.78,161.51L58.64,212.26L78.48,184.95L53.88,109.23L21.78,98.79Z', MID],
  ['M177.52,184.95L197.36,212.26L234.22,161.51L234.22,98.79L202.12,109.23Z', DARK],
  ['M187.65,219.31L167.81,192L88.19,192L68.35,219.31L128,238.69Z', DARK],
  ['M128,61.49L65.69,106.76L89.49,180L166.51,180L190.31,106.76Z', MID],
  ['M57.59,97.81L122,51.01L122,17.26L62.35,36.64L25.48,87.38Z', LIGHT],
];

/** The ball on its own, without the black tile, so it sits on either theme. */
export function Logo({ size = '1em', className }: { size?: number | string; className?: string }) {
  return (
    <svg
      className={className ? `logo ${className}` : 'logo'}
      viewBox="16.5 16 223 223"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      {PANELS.map(([d, fill]) => (
        <path key={d} d={d} fill={fill} />
      ))}
    </svg>
  );
}
