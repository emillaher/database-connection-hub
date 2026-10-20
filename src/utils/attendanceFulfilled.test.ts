import { describe, expect, it } from 'vitest';
import legacySource from '../../public/legacy/app.js?raw';
import { calculateAttendanceStatus } from './calculateAttendanceStatus';
import type { SessionStatus } from '../types/attendance';

// Test the actual shipped vanilla engine as well as the typed utility.
const legacyEngine = new Function(
  `${legacySource.split('// 2. ICS Kalender-Parser')[0]}\nreturn calculateAttendanceStatus;`,
)() as typeof calculateAttendanceStatus;

for (const [name, calculate] of [['Legacy app', legacyEngine], ['Typed utility', calculateAttendanceStatus]] as const) {
  describe(name, () => {
    const course = { minAttendancePercent: 75 };
    const sessions = (...statuses: SessionStatus[]) => statuses.map(status => ({ status }));

    it('stays green with 6 of 8 attended and the seventh absent', () => {
      const result = calculate(course, sessions('present', 'present', 'present', 'present', 'present', 'present', 'absent', 'open'));
      expect(result.requiredAttendance).toBe(6);
      expect(result.remainingAbsences).toBe(1);
      expect(result.trafficLight).toBe('green');
      expect(result.isAtRisk).toBe(false);
      expect(result.isFailed).toBe(false);
    });

    it('stays green when the sixth attendance reaches the requirement', () => {
      const result = calculate(course, sessions('present', 'present', 'present', 'present', 'present', 'present', 'absent', 'absent'));
      expect(result.remainingAbsences).toBe(0);
      expect(result.trafficLight).toBe('green');
      expect(result.isAtRisk).toBe(false);
    });

    it('still warns before the requirement is reached with one absence left', () => {
      const result = calculate(course, sessions('present', 'present', 'present', 'present', 'present', 'open', 'absent', 'open'));
      expect(result.trafficLight).toBe('yellow');
      expect(result.isAtRisk).toBe(true);
    });

    it('still fails when allowed absences are exceeded', () => {
      const result = calculate(course, sessions('present', 'present', 'present', 'present', 'present', 'absent', 'absent', 'absent'));
      expect(result.trafficLight).toBe('red');
      expect(result.isFailed).toBe(true);
    });
  });
}