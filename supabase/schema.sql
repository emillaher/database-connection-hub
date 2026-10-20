-- ============================================================
-- Supabase / PostgreSQL Schema für Anwesenheits-Manager
-- ============================================================

-- 1. Tabelle: profiles (Erweiterung der auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  university TEXT,
  semester TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabelle: courses (Lehrveranstaltungen)
CREATE TABLE IF NOT EXISTS public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  room TEXT,
  lecturer TEXT,
  color TEXT DEFAULT '#3b82f6',
  min_attendance_percent NUMERIC(5, 2) NOT NULL DEFAULT 75.00 CHECK (min_attendance_percent >= 0 AND min_attendance_percent <= 100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabelle: sessions (Einzeltermine / Vorlesungseinheiten)
CREATE TYPE session_status_type AS ENUM ('present', 'absent', 'excused', 'open');

CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  topic TEXT,
  room TEXT,
  status session_status_type NOT NULL DEFAULT 'open',
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Indizes für hohe Abfrage-Performance
CREATE INDEX IF NOT EXISTS idx_courses_user_id ON public.courses(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_course_id ON public.sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON public.sessions(date);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.sessions(status);

-- 5. Row Level Security (RLS) aktivieren
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- RLS Richtlinien: profiles
CREATE POLICY "Benutzer können eigenes Profil lesen"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Benutzer können eigenes Profil aktualisieren"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- RLS Richtlinien: courses
CREATE POLICY "Benutzer können eigene Kurse sehen"
  ON public.courses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Benutzer können eigene Kurse anlegen"
  ON public.courses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Benutzer können eigene Kurse bearbeiten"
  ON public.courses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Benutzer können eigene Kurse löschen"
  ON public.courses FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Richtlinien: sessions
CREATE POLICY "Benutzer können Sessions ihrer Kurse sehen"
  ON public.sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.courses
      WHERE courses.id = sessions.course_id
      AND courses.user_id = auth.uid()
    )
  );

CREATE POLICY "Benutzer können Sessions für ihre Kurse anlegen"
  ON public.sessions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.courses
      WHERE courses.id = sessions.course_id
      AND courses.user_id = auth.uid()
    )
  );

CREATE POLICY "Benutzer können eigene Sessions aktualisieren"
  ON public.sessions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.courses
      WHERE courses.id = sessions.course_id
      AND courses.user_id = auth.uid()
    )
  );

CREATE POLICY "Benutzer können eigene Sessions löschen"
  ON public.sessions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.courses
      WHERE courses.id = sessions.course_id
      AND courses.user_id = auth.uid()
    )
  );

-- 6. Automatischer Trigger: Neues Profil bei Benutzer-Registrierung anlegen
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Automatischer Trigger: updated_at Zeitstempel aktualisieren
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER set_sessions_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
