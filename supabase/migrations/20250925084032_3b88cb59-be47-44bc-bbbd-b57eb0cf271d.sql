-- Create a table for sign language records
CREATE TABLE public.signs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  video_url TEXT,
  keyframes JSONB,
  duration REAL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.signs ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own signs" 
ON public.signs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own signs" 
ON public.signs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own signs" 
ON public.signs 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own signs" 
ON public.signs 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create storage bucket for sign videos
INSERT INTO storage.buckets (id, name, public) VALUES ('sign-videos', 'sign-videos', false);

-- Create storage policies for sign videos
CREATE POLICY "Users can view their own videos" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'sign-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own videos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'sign-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own videos" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'sign-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own videos" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'sign-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_signs_updated_at
  BEFORE UPDATE ON public.signs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();