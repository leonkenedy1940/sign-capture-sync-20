-- Drop existing RLS policies that require authentication
DROP POLICY IF EXISTS "Users can view their own signs" ON public.signs;
DROP POLICY IF EXISTS "Users can create their own signs" ON public.signs;
DROP POLICY IF EXISTS "Users can update their own signs" ON public.signs;
DROP POLICY IF EXISTS "Users can delete their own signs" ON public.signs;

-- Create public policies that don't require authentication
CREATE POLICY "Anyone can view signs" 
ON public.signs 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can create signs" 
ON public.signs 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update signs" 
ON public.signs 
FOR UPDATE 
USING (true);

CREATE POLICY "Anyone can delete signs" 
ON public.signs 
FOR DELETE 
USING (true);

-- Update the signs table to make user_id nullable since we won't require authentication
ALTER TABLE public.signs ALTER COLUMN user_id DROP NOT NULL;