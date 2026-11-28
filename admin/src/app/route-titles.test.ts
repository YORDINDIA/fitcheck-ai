import { describe, expect, it } from 'vitest'

import { routeManifest } from '@/routes'
import i18n from '@/shared/i18n'

describe('route titles', () => {
  it.each(Object.entries(routeManifest))('%s resolves to a translated title', (_route, meta) => {
    expect(i18n.exists(meta.titleKey)).toBe(true)
    expect(i18n.t(meta.titleKey).trim()).not.toBe('')
  })
})
