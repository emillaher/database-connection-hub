/**
 * Definition der Kern-Datenstrukturen für das Anwesenheits-Tracking
 */

export type SessionStatus = 'present' | 'absent' | 'excused' | 'open';

export type TrafficLightColor = 'green' | 'yellow' | 'red';

export interface Course {
  id: string;
  userId?: string;
  name: string;
  code?: string;
  room?: string;
  lecturer?: string;
  color?: string; // Hex-Farbe für UI-Akzente
  minAttendancePercent: number; // z.B. 66.7, 75, 80, 100
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Session {
  id: string;
  courseId: string;
  date: string; // ISO Date String YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  topic?: string;
  room?: string;
  status: SessionStatus;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AttendanceCalculationResult {
  totalSessions: number;          // N: Gesamtanzahl aller Termine
  requiredAttendance: number;     // ⌈N × (Prozent/100)⌉
  maxAllowedAbsences: number;     // N - requiredAttendance
  presentCount: number;           // Tatsächlich anwesend
  absentCount: number;            // Unentschuldigt gefehlt
  excusedCount: number;           // Entschuldigt gefehlt (zählt nicht als Fehlzeit)
  openCount: number;              // Zukünftige / noch nicht markierte Einheiten
  completedCount: number;         // Bereits stattgefundene bewertete Einheiten (present + absent + excused)
  
  remainingAbsences: number;      // maxAllowedAbsences - absentCount
  isAttendanceFulfilled: boolean; // Ist die Pflicht aktuell noch erfüllbar bzw. erfüllt?
  isAtRisk: boolean;              // Ist der Kurs gefährdet (<= 1 Fehltag übrig)?
  isFailed: boolean;              // Endgültig unterschritten (< 0 Fehltage übrig)?
  
  trafficLight: TrafficLightColor; // 'green' | 'yellow' | 'red'
  currentAttendancePercent: number; // Tatsächliche Quote bisher (in %)
  maxPossibleAttendancePercent: number; // Maximal noch erreichbare Quote (in %)
  statusMessage: string;          // Menschlich lesbare Statusmeldung
}

export interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  isGuest: boolean;
}
