-- Agoré V0: private image attachments for comments and replies.
-- Supports up to four images per comment, independently of post media.

CREATE TABLE IF NOT EXISTS public.comment_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL
    REFERENCES public.comments (id) ON DELETE CASCADE,
  author_id uuid NOT NULL
    REFERENCES public.profiles (id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL
    CHECK (mime_type IN (
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/avif'
    )),
  size_bytes bigint NOT NULL
    CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  width integer
    CHECK (width IS NULL OR width > 0),
  height integer
    CHECK (height IS NULL OR height > 0),
  sort_order smallint NOT NULL
    CHECK (sort_order BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comment_media_comment_sort_order_key
    UNIQUE (comment_id, sort_order),
  CONSTRAINT comment_media_storage_path_owner_key
    CHECK (storage_path ~ ('^' || author_id::text || '/[^/]+$'))
);

CREATE INDEX IF NOT EXISTS comment_media_comment_id_sort_order_idx
  ON public.comment_media (comment_id, sort_order);
CREATE INDEX IF NOT EXISTS comment_media_author_id_idx
  ON public.comment_media (author_id);

ALTER TABLE public.comment_media ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON TABLE public.comment_media TO authenticated;

DROP POLICY IF EXISTS comment_media_select_visible ON public.comment_media;
CREATE POLICY comment_media_select_visible
ON public.comment_media
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.comments AS c
    JOIN public.posts AS p ON p.id = c.post_id
    JOIN public.profiles AS comment_author
      ON comment_author.id = c.author_id
     AND comment_author.account_status = 'active'
    JOIN public.profiles AS post_author
      ON post_author.id = p.author_id
     AND post_author.account_status = 'active'
    JOIN public.profiles AS viewer
      ON viewer.id = (SELECT auth.uid())
     AND viewer.account_status = 'active'
    WHERE c.id = comment_media.comment_id
      AND c.author_id = comment_media.author_id
      AND c.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.blocks AS b
        WHERE (
          b.blocker_id = (SELECT auth.uid())
          AND b.blocked_id IN (c.author_id, p.author_id)
        ) OR (
          b.blocked_id = (SELECT auth.uid())
          AND b.blocker_id IN (c.author_id, p.author_id)
        )
      )
  )
);

DROP POLICY IF EXISTS comment_media_insert_own_comment ON public.comment_media;
CREATE POLICY comment_media_insert_own_comment
ON public.comment_media
FOR INSERT TO authenticated
WITH CHECK (
  author_id = (SELECT auth.uid())
  AND storage_path LIKE ((SELECT auth.uid())::text || '/%')
  AND EXISTS (
    SELECT 1
    FROM public.comments AS c
    JOIN public.posts AS p ON p.id = c.post_id
    JOIN public.profiles AS commenter
      ON commenter.id = c.author_id
     AND commenter.account_status = 'active'
    JOIN public.profiles AS post_author
      ON post_author.id = p.author_id
     AND post_author.account_status = 'active'
    WHERE c.id = comment_media.comment_id
      AND c.author_id = (SELECT auth.uid())
      AND c.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.blocks AS b
        WHERE (
          b.blocker_id = (SELECT auth.uid())
          AND b.blocked_id = p.author_id
        ) OR (
          b.blocked_id = (SELECT auth.uid())
          AND b.blocker_id = p.author_id
        )
      )
  )
);

DROP POLICY IF EXISTS comment_media_delete_own ON public.comment_media;
CREATE POLICY comment_media_delete_own
ON public.comment_media
FOR DELETE TO authenticated
USING (author_id = (SELECT auth.uid()));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comment-media',
  'comment-media',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS comment_media_objects_insert_owner ON storage.objects;
CREATE POLICY comment_media_objects_insert_owner
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'comment-media'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS comment_media_objects_select_visible ON storage.objects;
CREATE POLICY comment_media_objects_select_visible
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'comment-media'
  AND EXISTS (
    SELECT 1 FROM public.comment_media AS cm
    WHERE cm.storage_path = storage.objects.name
  )
);

DROP POLICY IF EXISTS comment_media_objects_delete_owner ON storage.objects;
CREATE POLICY comment_media_objects_delete_owner
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'comment-media'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

COMMENT ON TABLE public.comment_media IS
  'Private image attachments for visible Agoré comments and replies. Up to four images per comment.';