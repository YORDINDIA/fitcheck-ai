import { describe, expect, it } from 'vitest'
import snapshot from '../../../../docs/generated/plan-limits.json'
import { PLAN_LIMITS } from '../plan-limits'

type Tier = 'free' | 'plus' | 'pro'

const SNAPSHOT = snapshot as Record<Tier, Record<string, number>>

describe('plan-limits snapshot', () => {
  it.each(['free', 'plus', 'pro'] as const)(
    '%s marketing limits match docs/generated/plan-limits.json',
    (tier) => {
      expect(PLAN_LIMITS[tier]).toEqual({
        monthlyExtractions: SNAPSHOT[tier].monthly_extractions,
        monthlyGenerations: SNAPSHOT[tier].monthly_generations,
        monthlyEmbeddings: SNAPSHOT[tier].monthly_embeddings,
        dailyPhotoshootImages: SNAPSHOT[tier].daily_photoshoot_images,
      })
    },
  )
})
