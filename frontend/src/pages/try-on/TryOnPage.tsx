/**
 * TryOnPage - Main page for "Try My Look" feature.
 *
 * Allows users to upload a clothing image and see how they would look wearing it.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Download, Upload, RefreshCw, Loader2, Sparkles, X, Camera } from 'lucide-react';
import { useAuthStore, useCurrentUser, useUserAvatar } from '@/stores/authStore';
import { useJobUiStore } from '@/stores/jobUiStore';
import { invalidateUsageCache } from '@/stores/subscriptionStore';
import { generateTryOn, TryOnOptions, TryOnResult } from '@/api/ai';
import { getPresignedUrl } from '@/api/images';
import { uploadAvatar } from '@/api/users';
import { tryOnUsedKey } from '@/lib/activation';
import { fileToReplayablePreview } from '@/lib/replayable-preview';
import { getTryOnErrorMessage } from '@/lib/try-on-errors';
import { useElapsedSeconds } from '@/hooks/useElapsedSeconds';
import {
  AVATAR_INITIAL,
  createTryOnMachine,
  transitionAvatar,
  transitionTryOn,
  type TryOnStep,
} from './tryOnMachine';
import { useStateMachine } from './useStateMachine';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { ZoomableImage } from '@/components/ui/zoomable-image';
import { WizardSteps } from '@/components/ui/wizard-steps';
import { GeneratingSurface } from '@/components/jobs';
import { cn, downloadBlob } from '@/lib/utils';
import { imageFetchOptions } from '@/lib/sessionCookie';

const STYLE_OPTIONS = [
  { value: 'casual', label: 'Casual' },
  { value: 'formal', label: 'Formal' },
  { value: 'business', label: 'Business' },
  { value: 'sporty', label: 'Sporty' },
  { value: 'streetwear', label: 'Streetwear' },
  { value: 'elegant', label: 'Elegant' },
];

const BACKGROUND_OPTIONS = [
  { value: 'studio white', label: 'Studio White' },
  { value: 'studio gray', label: 'Studio Gray' },
  { value: 'urban street', label: 'Urban Street' },
  { value: 'nature outdoor', label: 'Nature' },
  { value: 'minimal', label: 'Minimal' },
];

const POSE_OPTIONS = [
  { value: 'standing front', label: 'Standing Front' },
  { value: 'standing side', label: 'Standing Side' },
  { value: 'walking', label: 'Walking' },
  { value: 'casual pose', label: 'Casual' },
];

const STEPS = [
  { id: 'upload', label: 'Upload', shortLabel: '1' },
  { id: 'options', label: 'Options', shortLabel: '2' },
  { id: 'generating', label: 'Generate', shortLabel: '3' },
  { id: 'result', label: 'Result', shortLabel: '4' },
] as const;

/**
 * Module-level run counter for try-on generation (NOT a per-mount ref): the
 * shared 'try-on' job pill lives in the store, so a stale in-flight response
 * must never retire a NEWER run's pill after a remount. Every
 * generate/cancel/reset bumps the counter; a response only applies its
 * result (and only clears the pill) while its captured run id still equals
 * the counter.
 */
let tryOnRunSeq = 0;

/**
 * Latest completed try-on result by run id — module-level (like
 * tryOnRunSeq), so a REMOUNTED page (navigation away and back, HMR) can still
 * land a response that resolved on the unmounted instance. Without this, the
 * live instance's unwedge effect bounces the user back to Options with no
 * result and no error — a silent failure that outlived every response-shape
 * fix. Guarded by run id: a stale result for an abandoned run never lands.
 */
let lastTryOnResult: { runId: number; result: TryOnResult } | null = null;

/** Latest failed run by run id. Same role as lastTryOnResult, for errors. */
let lastTryOnFailure: { runId: number; message: string } | null = null;

function isTryOnPillActive(): boolean {
  const job = useJobUiStore.getState().job;
  return job?.id === 'try-on' && job.isActive === true;
}

/**
 * The only writers of the shared try-on pill. Call them after the step
 * machine has accepted the matching event.
 */
function beginTryOnPill() {
  useJobUiStore.getState().setJob({
    id: 'try-on',
    label: 'Generating try-on…',
    isActive: true,
    href: '/try-on',
  });
}

/** Clears the pill only while `runId` still owns it. */
function endTryOnPill(runId: number) {
  if (runId !== tryOnRunSeq) return;
  useJobUiStore.getState().clearJob('try-on');
}

/** Abandons the current run (cancel or reset) and clears the pill. */
function abandonTryOnRun() {
  tryOnRunSeq += 1;
  useJobUiStore.getState().clearJob('try-on');
}

/**
 * Resolve the best renderable source for a try-on result. URL-first (the
 * backend persists to object storage); base64 only as the storage-failure
 * fallback. Returns null when the response carries NEITHER — the provider
 * returned an empty image, which must surface as a visible error, never as a
 * silent broken result. Null-safe: an unusable/malformed result must never
 * throw into the generation catch.
 */
function resolveResultSrc(result: TryOnResult | null | undefined): string | null {
  if (!result) return null;
  if (result.image_url) return result.image_url;
  if (result.image_base64) return `data:image/png;base64,${result.image_base64}`;
  return null;
}

import { useTranslation } from '@/i18n'

export default function TryOnPage() {
  const { t } = useTranslation()
  const userAvatar = useUserAvatar();
  const setUser = useAuthStore((s) => s.setUser);
  const user = useCurrentUser();
  const { toast } = useToast();
  /**
   * Single source of truth for the step, the garment flag and the run outcome.
   * Transitions come from the pure table in ./tryOnMachine. A remount restores
   * the generating step from the shared pill once, at mount. The pill is never
   * mirrored into local state.
   */
  const [machine, send, getMachine] = useStateMachine(
    () => createTryOnMachine(isTryOnPillActive()),
    transitionTryOn
  );
  const step: TryOnStep = machine.step;
  const clothingFileRef = useRef<File | null>(null);
  const [clothingPreview, setClothingPreview] = useState<string | null>(null);
  const [clothingDescription, setClothingDescription] = useState('');
  const [style, setStyle] = useState('casual');
  const [background, setBackground] = useState('studio white');
  const [pose, setPose] = useState('standing front');
  const isGenerating = step === 'generating';
  // Single opaque backend call — no phases to report, so show elapsed time
  // rather than a fabricated percentage.
  const tryOnElapsed = useElapsedSeconds(isGenerating);
  const result = machine.result;
  const error = machine.error;
  // Result-image self-heal: the backend's image_url is a short-lived
  // presigned URL, so a result rendered long after generation (or after an
  // expired-URL moment) can fail to load. On error we re-mint ONCE via
  // /images/presigned using the durable storage_path; if that still fails the
  // image is shown as a visible error card instead of a silent broken image.
  const [resultImageSrc, setResultImageSrc] = useState<string | null>(null);
  const [resultImageError, setResultImageError] = useState(false);
  const resultSrcRemintRef = useRef(false);
  const previewUrlRef = useRef<string | null>(null);
  // Uploading = client sending bytes (real % from axios progress, else
  // indeterminate); Processing = server has the file, we're just waiting.
  const [avatar, sendAvatar] = useStateMachine(AVATAR_INITIAL, transitionAvatar);
  const avatarPhase =
    avatar.phase === 'uploading' || avatar.phase === 'processing' ? avatar.phase : null;
  const avatarUploadPercent = avatar.percent;
  const avatarElapsed = useElapsedSeconds(avatarPhase === 'processing');
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const revokePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      revokePreviewUrl();
    };
  }, [revokePreviewUrl]);

  // The shared pill is the cross-page signal. When it retires while this page
  // is generating, the run ended elsewhere: a remounted instance resolved it,
  // or another caller cleared it. Land the stored outcome for the CURRENT run,
  // or abandon the run. Nothing is copied from the store into local state.
  useEffect(() => {
    const reconcile = (jobState: ReturnType<typeof useJobUiStore.getState>) => {
      const pillActive = jobState.job?.id === 'try-on' && jobState.job.isActive === true;
      if (pillActive || getMachine().step !== 'generating') return;
      const landed = lastTryOnResult;
      if (landed && landed.runId === tryOnRunSeq) {
        send({ type: 'SUCCESS', result: landed.result });
        return;
      }
      const failed = lastTryOnFailure;
      if (failed && failed.runId === tryOnRunSeq) {
        send({ type: 'FAIL', message: failed.message });
        return;
      }
      abandonTryOnRun();
      send({ type: 'CANCEL' });
    };
    const unsubscribe = useJobUiStore.subscribe(reconcile);
    // A pill clear that ran between render and this subscription has no event
    // to observe. Reconcile once against the current store state.
    reconcile(useJobUiStore.getState());
    return unsubscribe;
  }, [send, getMachine]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    // Preview must be a data URL (downscaled) so it survives PostHog session
    // recordings — blob URLs only exist in the originating browser session.
    // The upload itself always uses `clothingFileRef` (the File), never this
    // preview, so fidelity is unaffected.
    revokePreviewUrl();
    clothingFileRef.current = file;
    void fileToReplayablePreview(file).then((url) => {
      if (clothingFileRef.current !== file) {
        // Superseded by another pick (or reset) before the preview resolved.
        // Data URLs are no-ops to revoke; blob-URL fallbacks would otherwise leak.
        URL.revokeObjectURL(url);
        return;
      }
      previewUrlRef.current = url;
      setClothingPreview(url);
      send({ type: 'PICK_GARMENT' });
    });
  }, [revokePreviewUrl, send]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.heif', '.bmp', '.tif', '.tiff'],
    },
    multiple: false,
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  const handleAvatarUpload = async (file: File) => {
    if (!sendAvatar({ type: 'PICK_AVATAR' })) return;
    try {
      const { avatar_url } = await uploadAvatar(file, (percent) => {
        sendAvatar({ type: 'PROGRESS', percent });
      });
      sendAvatar({ type: 'UPLOADED' });
      if (user) {
        setUser({ ...user, avatar_url });
      }
      toast({ title: 'Photo added', description: 'You can generate a try-on now.' });
    } catch {
      // api/client interceptor already toasts the failure.
      sendAvatar({ type: 'UPLOAD_FAILED' });
    }
  };

  const handleGenerate = async () => {
    if (!clothingFileRef.current) return;
    if (!userAvatar) {
      toast({
        title: 'Photo of you required',
        description: 'Add a clear photo of yourself first.',
        variant: 'destructive',
      });
      return;
    }

    // Transition first. A rejected START (already generating, or no garment)
    // stops here, before any run id or pill is created.
    if (!send({ type: 'START' })) return;
    const runId = ++tryOnRunSeq;
    lastTryOnResult = null;
    lastTryOnFailure = null;
    setResultImageSrc(null);
    setResultImageError(false);
    resultSrcRemintRef.current = false;
    beginTryOnPill();

    try {
      const options: TryOnOptions = {
        clothing_description: clothingDescription || undefined,
        style,
        background,
        pose,
        // URL-first: the backend persists the render to object storage and
        // returns image_url (base64 inline only as a storage-failure fallback).
        save_to_storage: true,
      };

      const tryOnResult = await generateTryOn(clothingFileRef.current, options);
      // The generation request reserves/consumes daily AI quota even when it
      // fails, so invalidate regardless of outcome; the next usage read must
      // hit the server, not the 60s-fresh cache (F1-10).
      invalidateUsageCache();
      if (tryOnRunSeq !== runId) return;
      if (!resolveResultSrc(tryOnResult)) {
        // Provider returned no image payload at all: an empty result must be
        // a visible failure (with retry), never a silent broken result screen.
        const message = 'The generated image came back empty. Please try again.';
        lastTryOnFailure = { runId, message };
        send({ type: 'FAIL', message });
        return;
      }
      // Publish before the transition so a remount racing this response can
      // still land the render (see the subscription effect).
      lastTryOnResult = { runId, result: tryOnResult };
      send({ type: 'SUCCESS', result: tryOnResult });
      try {
        localStorage.setItem(tryOnUsedKey(user?.id), '1');
      } catch {
        // ignore
      }
    } catch (err) {
      if (tryOnRunSeq !== runId) return;
      const message = getTryOnErrorMessage(err);
      lastTryOnFailure = { runId, message };
      send({ type: 'FAIL', message });
    } finally {
      // Cancelled or superseded runs never clear a newer run's pill.
      endTryOnPill(runId);
    }
  };

  const handleCancelGenerate = () => {
    // The API call keeps running, but its response is abandoned: the run id
    // advances, so neither this instance nor a remount can land it.
    send({ type: 'CANCEL' });
    abandonTryOnRun();
  };

  const handleReset = () => {
    // Reset mid-generation abandons the run, so its response can never land
    // a result screen for a flow the user has left.
    const wasGenerating = getMachine().step === 'generating';
    send({ type: 'RESET' });
    if (wasGenerating) abandonTryOnRun();
    revokePreviewUrl();
    clothingFileRef.current = null;
    setClothingPreview(null);
    setClothingDescription('');
    setResultImageSrc(null);
    setResultImageError(false);
    resultSrcRemintRef.current = false;
  };

  const handleDownload = async () => {
    if (!result) return;

    const src = resultImageSrc ?? resolveResultSrc(result);
    if (!src) return;
    try {
      // Fetch → blob → object URL so a cross-origin `image_url` (Supabase
      // storage) actually downloads instead of the browser navigating to the
      // image (the `download` attribute is ignored cross-origin). Worker-mode
      // CDN URLs need the auth cookie; presigned URLs must stay credential-free.
      const response = await fetch(src, imageFetchOptions(src));
      const blob = await response.blob();
      downloadBlob(blob, `try-on-${Date.now()}.png`);
    } catch {
      toast({
        title: 'Download failed',
        description: 'Could not download the image. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleRegenerate = () => {
    void handleGenerate();
  };

  const handleResultImageError = useCallback(() => {
    if (!result) return;
    if (resultImageError) return;
    // One self-heal per result: the URL we got is a short-lived presigned
    // URL, so a load failure may just mean it expired. Re-mint from the
    // durable storage_path and let the <img> retry with the fresh URL.
    if (result.storage_path && !resultSrcRemintRef.current) {
      resultSrcRemintRef.current = true;
      void getPresignedUrl(result.storage_path)
        .then((fresh) => {
          if (fresh) {
            setResultImageSrc(fresh);
          } else {
            setResultImageError(true);
          }
        })
        .catch(() => setResultImageError(true));
      return;
    }
    // No storage_path to re-mint from, or the re-minted URL also failed:
    // surface a visible error instead of a silent broken image.
    setResultImageError(true);
  }, [result, resultImageError]);


  return (
    <div className="app-page max-w-4xl">
      <div className="mb-4">
        <h1 className="text-xl md:text-2xl font-bold text-foreground">{t('tryOn.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a picture of clothes to see how you would look wearing them.
        </p>
      </div>

      {/* Inline avatar gate — stay on page instead of hard redirect to profile */}
      {!userAvatar && (
        <Card className="mb-4 md:mb-6 border-border">
          <CardHeader className="px-4 py-3 md:px-6 md:py-4">
            <CardTitle className="text-base md:text-lg flex items-center gap-2">
              <Camera className="h-5 w-5" />
              {t('tryOn.addPhoto')}
            </CardTitle>
            <CardDescription>
              A clear full-body or waist-up photo is required for try-on. Good lighting, face and
              torso visible.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 md:px-6 md:pb-6 flex flex-wrap gap-2">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleAvatarUpload(file);
                e.target.value = '';
              }}
            />
            <Button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarPhase !== null}
            >
              {avatarPhase === 'uploading' ? (
                <>
                  <Loader2 className="h-4 w-4 me-2 animate-spin" />
                  {avatarUploadPercent != null
                    ? `Uploading photo… ${avatarUploadPercent}%`
                    : 'Uploading photo…'}
                </>
              ) : avatarPhase === 'processing' ? (
                <>
                  <Loader2 className="h-4 w-4 me-2 animate-spin" />
                  {`Processing… (${avatarElapsed}s elapsed)`}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 me-2" />
                  {t('tryOn.uploadPhoto')}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* While a request is in flight the wizard is locked (onStepClick dropped
          so completed steps render disabled). Cancel on the generating surface
          is the escape hatch; allowing a step-back mid-flight would fire a
          second request and let a stale result yank the user to the result
          screen after they abandoned the flow. */}
      <WizardSteps
        steps={[...STEPS]}
        currentStepId={step}
        onStepClick={isGenerating ? undefined : (id) => send({ type: 'STEP_BACK', to: id as TryOnStep })}
      />

      {step === 'upload' && (
        <Card>
          <CardHeader className="px-4 py-3 md:px-6 md:py-4">
            <CardTitle className="text-base md:text-lg">{t('tryOn.uploadClothing')}</CardTitle>
            <CardDescription>
              Upload a photo of the clothes you want to try on. Works best with clear, well-lit images.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 md:px-6 md:pb-6">
            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
            <div
              {...getRootProps()}
              className={cn(
                'border-2 border-dashed rounded-lg p-6 md:p-12 text-center cursor-pointer transition-colors touch-target',
                isDragActive
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <input {...getInputProps()} />
              <Upload className="mx-auto h-10 w-10 md:h-12 md:w-12 text-muted-foreground" />
              <p className="mt-4 text-base md:text-lg font-medium text-foreground">
                {isDragActive ? 'Drop the image here' : 'Drag & drop a clothing image'}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                or tap to browse
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'options' && clothingPreview && (
        <div className="grid gap-4 md:gap-6 md:grid-cols-2">
          <Card>
            <CardHeader className="px-4 py-3 md:px-6 md:py-4">
              <CardTitle className="flex items-center justify-between text-base md:text-lg">
                {t('tryOn.clothingPreview')}
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  <X className="h-4 w-4 me-1" />
                  {t('tryOn.change')}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 md:px-6 md:pb-6 space-y-3">
              <ZoomableImage
                src={clothingPreview}
                alt={t('tryOn.previewAlt')}
                className="w-full h-48 md:h-64 object-contain rounded-lg bg-muted"
              />
              {userAvatar && (
                <div className="flex items-center gap-3">
                  <img loading="lazy" decoding="async"
                    src={userAvatar}
                    alt={t('tryOn.youAlt')}
                    className="h-12 w-12 rounded-full object-cover border border-border"
                  />
                  <p className="text-xs text-muted-foreground">{t('tryOn.usingThisPhoto')}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 py-3 md:px-6 md:py-4">
              <CardTitle className="text-base md:text-lg">{t('tryOn.generationOptions')}</CardTitle>
              <CardDescription>
                {t('tryOn.customizeHint')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-4 pb-4 md:px-6 md:pb-6">
              <div className="space-y-2">
                <Label htmlFor="description">{t('tryOn.descriptionOptional')}</Label>
                <Input
                  id="description"
                  placeholder="e.g., Blue denim jacket with brass buttons"
                  value={clothingDescription}
                  onChange={(e) => setClothingDescription(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t('tryOn.descriptionHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tryon-style">{t('tryOn.style')}</Label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger id="tryon-style">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STYLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tryon-background">{t('tryOn.background')}</Label>
                <Select value={background} onValueChange={setBackground}>
                  <SelectTrigger id="tryon-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BACKGROUND_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tryon-pose">{t('tryOn.pose')}</Label>
                <Select value={pose} onValueChange={setPose}>
                  <SelectTrigger id="tryon-pose">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POSE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button
                className="w-full mt-4"
                onClick={() => void handleGenerate()}
                disabled={isGenerating || !userAvatar}
              >
                <Sparkles className="h-4 w-4 me-2" />
                {t('tryOn.generate')}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 'generating' && (
        <GeneratingSurface
          stage={`Generating your try-on… (${tryOnElapsed}s elapsed)`}
          detail="Often under a minute. Combining your photo with the clothing."
          isActive
          previewUrls={[clothingPreview, userAvatar].filter(Boolean) as string[]}
          previewLabel="Clothing + your photo"
          onCancel={handleCancelGenerate}
        />
      )}

      {step === 'result' && result && (
        <div className="space-y-4 md:space-y-6">
          <Card>
            <CardHeader className="px-4 py-3 md:px-6 md:py-4">
              <CardTitle className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-base md:text-lg">
                {t('tryOn.resultTitle')}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleRegenerate}>
                    <RefreshCw className="h-4 w-4 me-1" />
                    <span className="hidden xs:inline">{t('actions.regenerate')}</span>
                    <span className="xs:hidden">{t('actions.retry')}</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownload}>
                    <Download className="h-4 w-4 me-1" />
                    <span className="hidden xs:inline">{t('actions.download')}</span>
                    <span className="xs:hidden">{t('actions.save')}</span>
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 md:px-6 md:pb-6">
              {resultImageError ? (
                <div className="flex flex-col items-center gap-3 rounded-lg bg-destructive/10 border border-destructive/30 p-6 text-center">
                  <p className="text-sm text-destructive font-medium">
                    Couldn&apos;t load the generated image. The link may have expired — try
                    regenerating for a fresh one.
                  </p>
                  <Button variant="outline" size="sm" onClick={handleRegenerate}>
                    <RefreshCw className="h-4 w-4 me-1" />
                    {t('actions.regenerate')}
                  </Button>
                </div>
              ) : (
                <ZoomableImage
                  src={resultImageSrc ?? resolveResultSrc(result) ?? undefined}
                  alt={t('tryOn.resultAlt')}
                  className="w-full max-h-[50dvh] md:max-h-[600px] object-contain rounded-lg bg-muted"
                  onError={handleResultImageError}
                />
              )}
            </CardContent>
          </Card>

          <div className="flex justify-center">
            <Button onClick={handleReset} className="w-full sm:w-auto">
              <Upload className="h-4 w-4 me-2" />
              {t('tryOn.tryAnother')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
