/**
 * Global SVG filters for the Snaptitle-inspired crayon & paper system.
 * Mounted once inside PublicLayout; never use `display: none` so SVG filters
 * remain active across browsers.
 */
export function CrayonFilters() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{
        position: 'absolute',
        width: 0,
        height: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <defs>
        <filter id="cp-line" x="-6%" y="-6%" width="112%" height="112%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.035"
            numOctaves="2"
            seed="3"
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale="3.2"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        <filter id="cp-scribble" x="-4%" y="-4%" width="108%" height="108%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.025"
            numOctaves="2"
            seed="7"
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale="7"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        <filter
          id="cp-wax"
          x="-4%"
          y="-4%"
          width="108%"
          height="108%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.72"
            numOctaves="2"
            seed="11"
            result="grain"
          />
          <feColorMatrix
            in="grain"
            type="matrix"
            values="0.08 0 0 0 0.46  0 0.08 0 0 0.46  0 0 0.08 0 0.46  0 0 0 0.25 0"
            result="softGrain"
          />
          <feComposite in="softGrain" in2="SourceGraphic" operator="atop" result="clippedGrain" />
          <feBlend in="SourceGraphic" in2="clippedGrain" mode="overlay" result="waxFill" />
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.032"
            numOctaves="2"
            seed="5"
            result="wobble"
          />
          <feDisplacementMap
            in="waxFill"
            in2="wobble"
            scale="2.2"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  )
}
