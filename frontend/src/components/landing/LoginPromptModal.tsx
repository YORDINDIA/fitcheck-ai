/**
 * LoginPromptModal - shown after demo features that need an account to save work.
 */

import { Link } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { CrayonLink } from '@/components/crayon/CrayonPrimitives'
import { Shirt, ArrowRight, Check } from 'lucide-react'

interface LoginPromptModalProps {
  isOpen: boolean
  onClose: () => void
  feature: string
}

export function LoginPromptModal({ isOpen, onClose, feature }: LoginPromptModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="cp rounded-2xl border-0 bg-[var(--cp-surface)] text-[var(--cp-ink)] shadow-[0_0_0_3px_var(--cp-ink),6px_7px_0_var(--cp-shadow-ink)] sm:max-w-md">
        <DialogHeader>
          <div className="mb-4 flex justify-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--cp-orange)] text-white shadow-[0_0_0_2.5px_var(--cp-ink)]">
              <Shirt className="h-7 w-7" aria-hidden="true" />
            </div>
          </div>
          <DialogTitle className="cp-hand text-center text-3xl text-[var(--cp-ink)]">
            Save your work
          </DialogTitle>
          <DialogDescription className="text-center text-[var(--cp-ink-2)]">
            Create a free account to {feature}. Your uploads and results are saved inside the app,
            where you can keep building.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <ul className="space-y-2 text-sm font-medium text-[var(--cp-ink-2)]">
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-[var(--cp-orange)]" aria-hidden="true" />
              Keep extracted items in your wardrobe
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-[var(--cp-orange)]" aria-hidden="true" />
              Save try-ons and photoshoot results
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-[var(--cp-orange)]" aria-hidden="true" />
              Daily outfit recommendations
            </li>
          </ul>

          <div className="flex flex-col gap-2.5">
            <CrayonLink to="/auth/register" variant="orange" size="sm" className="w-full">
              Start free
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </CrayonLink>
            <Link
              to="/auth/login"
              className="inline-flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold text-[var(--cp-ink-2)] hover:text-[var(--cp-orange-deep)]"
            >
              Already have an account? Log in
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
