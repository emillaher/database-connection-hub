ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS semester text;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS ects numeric;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS grade numeric;