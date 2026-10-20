import { AttendanceCalculationResult, Course, Session, TrafficLightColor } from '../types/attendance';

/**
 * Mathematische Berechnungs-Engine für Anwesenheit und Fehlzeiten.
 * 
 * Berechnungslogik gemäß Studienordnungen:
 * - N = Gesamtanzahl aller Termine im Semester
 * - Notwendige Anwesenheiten = ⌈N × (Mindestanwesenheit / 100)⌉
 *   (Stets auf die nächste ganze Zahl aufgerundet)
 * - Erlaubte Fehlzeiten gesamt = N - Notwendige Anwesenheiten
 * - Verbleibende Fehltage = Erlaubte Fehlzeiten - bisher unentschuldigt gefehlt
 * - 'Entschuldigt' zählt laut Anforderung NICHT als Fehlzeit.
 * 
 * @param course Kursinformationen mit minAttendancePercent
 * @param sessions Liste aller Termine des Kurses
 * @returns AttendanceCalculationResult mit Ampelstatus, Resttagen und Kennzahlen
 */
export function calculateAttendanceStatus(
  course: Pick<Course, 'minAttendancePercent'>,
  sessions: Pick<Session, 'status'>[] = []
): AttendanceCalculationResult {
  const totalSessions = sessions.length;
  const rawMinPercent = course.minAttendancePercent;
  
  // Normalisierung des Prozentsatzes auf Bereich [0, 100]
  const minAttendancePercent = Math.max(0, Math.min(100, isNaN(rawMinPercent) ? 0 : rawMinPercent));

  // Zählung der Status-Zustände
  let presentCount = 0;
  let absentCount = 0;
  let excusedCount = 0;
  let openCount = 0;

  for (const session of sessions) {
    switch (session.status) {
      case 'present':
        presentCount++;
        break;
      case 'absent':
        absentCount++;
        break;
      case 'excused':
        excusedCount++;
        break;
      case 'open':
      default:
        openCount++;
        break;
    }
  }

  const completedCount = presentCount + absentCount + excusedCount;

  // Randfall: Keine Termine vorhanden
  if (totalSessions === 0) {
    return {
      totalSessions: 0,
      requiredAttendance: 0,
      maxAllowedAbsences: 0,
      presentCount: 0,
      absentCount: 0,
      excusedCount: 0,
      openCount: 0,
      completedCount: 0,
      remainingAbsences: 0,
      isAttendanceFulfilled: true,
      isAtRisk: false,
      isFailed: false,
      trafficLight: 'green',
      currentAttendancePercent: 100,
      maxPossibleAttendancePercent: 100,
      statusMessage: 'Noch keine Termine für dieses Fach hinterlegt.'
    };
  }

  // Mathematisch exakte Berechnung mit Beseitigung von IEEE-754 Fließkomma-Ungenauigkeiten:
  // Beispiel: 10 * 0.8 = 8.000000000000002 darf nicht zu 9 aufgerundet werden!
  const rawTarget = (totalSessions * minAttendancePercent) / 100;
  const cleanTarget = Math.round(rawTarget * 1e8) / 1e8;
  const requiredAttendance = Math.ceil(cleanTarget);

  // Erlaubte Fehlzeiten gesamt: N - notwendige Anwesenheiten
  const maxAllowedAbsences = Math.max(0, totalSessions - requiredAttendance);

  // Verbleibende Fehltage: Erlaubte Fehlzeiten minus tatsächlich unentschuldigt gefehlt
  const remainingAbsences = maxAllowedAbsences - absentCount;

  // Ampel-Logik:
  // - Grün: Sicher (mehrere Fehltage Puffer: >= 2)
  // - Gelb: Kritisches Limit (nur noch maximal 1 Fehltag übrig: 0 oder 1)
  // - Rot: Pflicht unterschritten (< 0 Fehltage übrig)
  let trafficLight: TrafficLightColor;
  let isFailed = false;
  let isAtRisk = false;
  let isAttendanceFulfilled = true;

  if (remainingAbsences < 0) {
    trafficLight = 'red';
    isFailed = true;
    isAttendanceFulfilled = false;
  } else if (remainingAbsences <= 1) {
    trafficLight = 'yellow';
    isAtRisk = true;
    isAttendanceFulfilled = true;
  } else {
    trafficLight = 'green';
    isAttendanceFulfilled = true;
  }

  // Quoten-Berechnungen (in Prozent mit 1 Nachkommastelle)
  // Aktuelle Quote: basierend auf bisher absolvierten Einheiten
  const attendedSoFar = presentCount + excusedCount;
  const currentAttendancePercent = completedCount > 0
    ? Math.round((attendedSoFar / completedCount) * 1000) / 10
    : 100;

  // Maximal noch erreichbare Quote im Semester:
  // Selbst wenn alle offenen Einheiten besucht werden
  const maxPossibleAttended = presentCount + excusedCount + openCount;
  const maxPossibleAttendancePercent = Math.round((maxPossibleAttended / totalSessions) * 1000) / 10;

  // Status-Botschaft
  let statusMessage = '';
  if (isFailed) {
    const overdue = Math.abs(remainingAbsences);
    statusMessage = `Prüfungszulassung gefährdet! Die Pflicht wurde um ${overdue} ${overdue === 1 ? 'Fehltag' : 'Fehltage'} überschritten.`;
  } else if (remainingAbsences === 0) {
    statusMessage = `Kritisches Limit: Du darfst kein einziges Mal mehr fehlen!`;
  } else if (remainingAbsences === 1) {
    statusMessage = `Achtung: Du darfst in diesem Fach noch genau 1-mal fehlen.`;
  } else {
    statusMessage = `Alles im grünen Bereich: Du darfst noch genau ${remainingAbsences}-mal fehlen.`;
  }

  return {
    totalSessions,
    requiredAttendance,
    maxAllowedAbsences,
    presentCount,
    absentCount,
    excusedCount,
    openCount,
    completedCount,
    remainingAbsences,
    isAttendanceFulfilled,
    isAtRisk,
    isFailed,
    trafficLight,
    currentAttendancePercent,
    maxPossibleAttendancePercent,
    statusMessage
  };
}
