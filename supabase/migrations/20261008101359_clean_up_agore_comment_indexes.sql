-- Remove indexes introduced by harden_agore_comments_v0 that duplicate or
-- unnecessarily overlap indexes already present on public.comments.

DROP INDEX IF EXISTS public.comments_post_created_at_id_idx;
DROP INDEX IF EXISTS public.comments_parent_comment_id_idx;
DROP INDEX IF EXISTS public.comments_author_id_idx;