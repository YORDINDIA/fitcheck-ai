-- FitCheck AI - photoshoot job status: 'complete' becomes 'completed'
--
-- WHY. The other durable job tables end in 'completed' (extraction_jobs,
-- social_import_jobs, outfit_generations). Photoshoot jobs were the only
-- table that wrote 'complete', so readers needed a special case in the admin
-- console and the clients. The backend now writes 'completed' (knot 6,
-- commit B). This migration lets the database accept that value and rewrites
-- the rows that already hold 'complete'.
--
-- ORDER. Apply this file to hosted Supabase BEFORE the backend that writes
-- 'completed' is deployed. Once it runs, the CHECK rejects 'complete', so a
-- backend instance still on the old code fails its photoshoot job writes
-- until it is replaced. Keep that gap short.
--
-- EFFECTS.
--   * photoshoot_jobs rows with status 'complete' become 'completed'. The
--     photoshoot_jobs_updated_at trigger sets updated_at on those rows.
--   * photoshoot_jobs_status_check is replaced. It no longer allows 'complete'.
--   * admin_trend_jobs (041) counts 'completed' for photoshoot jobs. Its body
--     is copied from 041 with that one value changed, and its grants are
--     restated below.
--
-- CHECK AFTER APPLYING. The first query returns 0. The second returns one row
-- whose text lists 'completed'.
--   SELECT count(*) FROM public.photoshoot_jobs WHERE status = 'complete';
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.photoshoot_jobs'::regclass AND contype = 'c'
--      AND pg_get_constraintdef(oid) LIKE '%status%';

BEGIN;

ALTER TABLE public.photoshoot_jobs
    DROP CONSTRAINT IF EXISTS photoshoot_jobs_status_check;

DO $$
BEGIN
    -- Rerun-safe: once this has run, no row holds 'complete', so a rerun updates nothing.
    UPDATE public.photoshoot_jobs
       SET status = 'completed'
     WHERE status = 'complete';
END
$$;

ALTER TABLE public.photoshoot_jobs
    ADD CONSTRAINT photoshoot_jobs_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));

CREATE OR REPLACE FUNCTION public.admin_trend_jobs(p_days integer DEFAULT 30)
RETURNS TABLE(day date, kind text, total bigint, succeeded bigint, failed bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    -- Qualify with the subquery alias `s`: the RETURNS TABLE out-params
    -- (day/kind/total/...) are PL/pgSQL variables, so a bare `day` in the
    -- outer SELECT is ambiguous (Postgres 42702) and the call fails.
    RETURN QUERY
    SELECT s.day, s.kind, s.total, s.succeeded, s.failed
    FROM (
        SELECT date_trunc('day', created_at)::date AS day,
               'extraction'::text AS kind,
               count(*) AS total,
               count(*) FILTER (WHERE status = 'completed') AS succeeded,
               count(*) FILTER (WHERE status = 'failed') AS failed
        FROM public.extraction_jobs
        WHERE created_at >= (CURRENT_DATE - p_days + 1)
        GROUP BY 1
        UNION ALL
        SELECT date_trunc('day', created_at)::date,
               'photoshoot'::text,
               count(*),
               count(*) FILTER (WHERE status = 'completed'),
               count(*) FILTER (WHERE status = 'failed')
        FROM public.photoshoot_jobs
        WHERE created_at >= (CURRENT_DATE - p_days + 1)
        GROUP BY 1
        UNION ALL
        SELECT date_trunc('day', created_at)::date,
               'social_import'::text,
               count(*),
               count(*) FILTER (WHERE status = 'completed'),
               count(*) FILTER (WHERE status = 'failed')
        FROM public.social_import_jobs
        WHERE created_at >= (CURRENT_DATE - p_days + 1)
        GROUP BY 1
        UNION ALL
        SELECT date_trunc('day', created_at)::date,
               'outfit_generation'::text,
               count(*),
               count(*) FILTER (WHERE status = 'completed'),
               count(*) FILTER (WHERE status = 'failed')
        FROM public.outfit_generations
        WHERE created_at >= (CURRENT_DATE - p_days + 1)
        GROUP BY 1
    ) s
    ORDER BY s.day, s.kind;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_trend_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_trend_jobs(integer) TO service_role;

COMMIT;
