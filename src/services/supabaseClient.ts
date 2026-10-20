import { Course, Session, UserProfile } from '../types/attendance';

// Konfiguration der Supabase-Umgebungsvariablen
const SUPABASE_URL = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_URL) || '';
const SUPABASE_ANON_KEY = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY) || '';

export interface StorageService {
  isConfigured(): boolean;
  getCurrentUser(): Promise<UserProfile | null>;
  signIn(email: string, password: string): Promise<UserProfile>;
  signUp(email: string, password: string): Promise<UserProfile>;
  signOut(): Promise<void>;
  
  getCourses(): Promise<Course[]>;
  saveCourse(course: Omit<Course, 'id'> & { id?: string }): Promise<Course>;
  deleteCourse(courseId: string): Promise<void>;
  
  getSessions(courseId?: string): Promise<Session[]>;
  saveSession(session: Omit<Session, 'id'> & { id?: string }): Promise<Session>;
  saveBatchSessions(sessions: (Omit<Session, 'id'> & { id?: string })[]): Promise<Session[]>;
  deleteSession(sessionId: string): Promise<void>;
  updateSessionStatus(sessionId: string, status: Session['status']): Promise<void>;
}

const LOCAL_STORAGE_KEY_COURSES = 'study_attendance_courses_v1';
const LOCAL_STORAGE_KEY_SESSIONS = 'study_attendance_sessions_v1';
const LOCAL_STORAGE_KEY_USER = 'study_attendance_user_v1';

/**
 * LocalStorage Fallback & Gastmodus-Implementierung.
 * Ermöglicht sofortiges Arbeiten ohne Datenbankeinrichtung.
 */
export class LocalStorageService implements StorageService {
  isConfigured(): boolean {
    return true;
  }

  async getCurrentUser(): Promise<UserProfile | null> {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_USER);
    if (!raw) {
      const guestUser: UserProfile = {
        id: 'guest-user-local',
        email: 'gast@student.de',
        displayName: 'Gast-Student',
        isGuest: true
      };
      localStorage.setItem(LOCAL_STORAGE_KEY_USER, JSON.stringify(guestUser));
      return guestUser;
    }
    return JSON.parse(raw);
  }

  async signIn(email: string): Promise<UserProfile> {
    const user: UserProfile = {
      id: 'local-user-' + Math.random().toString(36).substring(2, 8),
      email,
      displayName: email.split('@')[0],
      isGuest: false
    };
    localStorage.setItem(LOCAL_STORAGE_KEY_USER, JSON.stringify(user));
    return user;
  }

  async signUp(email: string): Promise<UserProfile> {
    return this.signIn(email);
  }

  async signOut(): Promise<void> {
    const guestUser: UserProfile = {
      id: 'guest-user-local',
      email: 'gast@student.de',
      displayName: 'Gast-Student',
      isGuest: true
    };
    localStorage.setItem(LOCAL_STORAGE_KEY_USER, JSON.stringify(guestUser));
  }

  async getCourses(): Promise<Course[]> {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_COURSES);
    return raw ? JSON.parse(raw) : [];
  }

  async saveCourse(courseData: Omit<Course, 'id'> & { id?: string }): Promise<Course> {
    const courses = await this.getCourses();
    const id = courseData.id || 'course_' + Math.random().toString(36).substring(2, 9);
    const now = new Date().toISOString();
    
    const course: Course = {
      ...courseData,
      id,
      createdAt: courseData.createdAt || now,
      updatedAt: now
    };

    const existingIdx = courses.findIndex(c => c.id === id);
    if (existingIdx >= 0) {
      courses[existingIdx] = course;
    } else {
      courses.push(course);
    }

    localStorage.setItem(LOCAL_STORAGE_KEY_COURSES, JSON.stringify(courses));
    return course;
  }

  async deleteCourse(courseId: string): Promise<void> {
    let courses = await this.getCourses();
    courses = courses.filter(c => c.id !== courseId);
    localStorage.setItem(LOCAL_STORAGE_KEY_COURSES, JSON.stringify(courses));

    // Auch verknüpfte Termine löschen
    let sessions = await this.getSessions();
    sessions = sessions.filter(s => s.courseId !== courseId);
    localStorage.setItem(LOCAL_STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
  }

  async getSessions(courseId?: string): Promise<Session[]> {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_SESSIONS);
    const sessions: Session[] = raw ? JSON.parse(raw) : [];
    if (courseId) {
      return sessions.filter(s => s.courseId === courseId);
    }
    return sessions;
  }

  async saveSession(sessionData: Omit<Session, 'id'> & { id?: string }): Promise<Session> {
    const sessions = await this.getSessions();
    const id = sessionData.id || 'sess_' + Math.random().toString(36).substring(2, 9);
    const now = new Date().toISOString();

    const session: Session = {
      ...sessionData,
      id,
      createdAt: sessionData.createdAt || now,
      updatedAt: now
    };

    const existingIdx = sessions.findIndex(s => s.id === id);
    if (existingIdx >= 0) {
      sessions[existingIdx] = session;
    } else {
      sessions.push(session);
    }

    localStorage.setItem(LOCAL_STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
    return session;
  }

  async saveBatchSessions(batch: (Omit<Session, 'id'> & { id?: string })[]): Promise<Session[]> {
    const sessions = await this.getSessions();
    const now = new Date().toISOString();
    const saved: Session[] = [];

    for (const item of batch) {
      const id = item.id || 'sess_' + Math.random().toString(36).substring(2, 9);
      const session: Session = {
        ...item,
        id,
        createdAt: item.createdAt || now,
        updatedAt: now
      };
      saved.push(session);
      sessions.push(session);
    }

    localStorage.setItem(LOCAL_STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
    return saved;
  }

  async deleteSession(sessionId: string): Promise<void> {
    let sessions = await this.getSessions();
    sessions = sessions.filter(s => s.id !== sessionId);
    localStorage.setItem(LOCAL_STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
  }

  async updateSessionStatus(sessionId: string, status: Session['status']): Promise<void> {
    const sessions = await this.getSessions();
    const target = sessions.find(s => s.id === sessionId);
    if (target) {
      target.status = status;
      target.updatedAt = new Date().toISOString();
      localStorage.setItem(LOCAL_STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
    }
  }
}

// Export der Standard-Serviceinstanz
export const storageService: StorageService = new LocalStorageService();
