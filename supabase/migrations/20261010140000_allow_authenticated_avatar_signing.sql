BEGIN;

-- Allow authenticated users to generate signed URLs for
-- profile avatars, while preserving the private bucket.
-- Keep the existing authenticated-read restrictions.
DROP POLICY IF EXISTS agore_avatars_select_authenticated
ON storage.objects;

CREATE POLICY agore_avatars_select_authenticated
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND storage.allow_any_operation(
    ARRAY[
      'object.get_authenticated_info',
      'object.get_authenticated',
      'storage.object.sign'
    ]
  )
);

COMMIT;