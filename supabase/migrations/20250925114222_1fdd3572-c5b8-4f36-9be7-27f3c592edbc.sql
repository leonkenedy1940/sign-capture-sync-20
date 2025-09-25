-- Drop existing storage policies that require authentication
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own documents" ON storage.objects;

-- Create public policies for sign-videos bucket
CREATE POLICY "Anyone can view sign videos" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'sign-videos');

CREATE POLICY "Anyone can upload sign videos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'sign-videos');

CREATE POLICY "Anyone can update sign videos" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'sign-videos');

CREATE POLICY "Anyone can delete sign videos" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'sign-videos');

-- Make sure the bucket is public
UPDATE storage.buckets 
SET public = true 
WHERE id = 'sign-videos';