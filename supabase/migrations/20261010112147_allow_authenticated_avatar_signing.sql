BEGIN;

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
      'storage.object.get_signed',
      'storage.object.sign'
    ]
  )
);

COMMIT;