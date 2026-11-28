import { Camera, Layers, Shirt, Smartphone, Sparkles, Upload } from 'lucide-react'
import { CrayonBox, Keycap } from '@/components/crayon/CrayonPrimitives'

const SOURCES = [
  {
    title: 'Single piece',
    sub: 'Flat lay or hanger',
    kbd: '1x',
  },
  {
    title: 'Whole pile',
    sub: 'Bed or floor snap',
    kbd: '6+',
  },
  {
    title: 'Hanging rack',
    sub: 'Closet bar photo',
    kbd: 'Batch',
  },
  {
    title: 'Camera roll',
    sub: 'Bulk photo import',
    fill: 'var(--cp-sky)',
    icon: Smartphone,
  },
  {
    title: 'Mirror selfie',
    sub: 'Try-on & photoshoot',
    fill: 'var(--cp-mint)',
    icon: Sparkles,
  },
  {
    title: 'Instagram',
    sub: 'Saved outfit import',
    fill: 'var(--cp-lilac)',
    icon: Upload,
  },
] as const

export default function CaptureSources() {
  return (
    <section className="cp-wrap cp-sec" aria-labelledby="sources-heading">
      <h2 id="sources-heading" className="cp-eyebrow">
        WORKS WITH THE PHOTOS YOU ALREADY TAKE
      </h2>
      <div className="cp-srcs">
        {SOURCES.map((src, idx) => {
          const Icon = 'icon' in src ? src.icon : idx === 0 ? Shirt : idx === 1 ? Layers : Camera
          return (
            <CrayonBox
              key={src.title}
              className="cp-src"
              radius={20}
              fill={'fill' in src ? src.fill : undefined}
            >
              <div className="k">
                {'kbd' in src ? (
                  <>
                    <span className="ico">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <Keycap>{src.kbd}</Keycap>
                  </>
                ) : (
                  <span className="ico">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                )}
              </div>
              <b>{src.title}</b>
              <small>{src.sub}</small>
            </CrayonBox>
          )
        })}
      </div>
    </section>
  )
}
