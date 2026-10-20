import { calculateAttendanceStatus } from './calculateAttendanceStatus';
import { SessionStatus } from '../types/attendance';

function runTests() {
  console.log('--- Starte Tests für calculateAttendanceStatus ---');
  let passed = 0;
  let failed = 0;

  function assert(desc: string, actual: any, expected: any) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
      console.log(`✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${desc}`);
      console.error(`  Erwartet:`, expected);
      console.error(`  Erhalten:`, actual);
      failed++;
    }
  }

  // Test 1: User-Beispiel: 4 Termine, 66.7% Pflicht
  // ceil(4 * 0.667) = ceil(2.668) = 3
  // Erlaubte Fehlzeiten: 4 - 3 = 1
  const s4_initial: { status: SessionStatus }[] = [
    { status: 'open' },
    { status: 'open' },
    { status: 'open' },
    { status: 'open' }
  ];
  const res1 = calculateAttendanceStatus({ minAttendancePercent: 66.7 }, s4_initial);
  assert('Beispiel 1: 4 Termine, 66.7%, 0 gefehlt -> 3 nötig', res1.requiredAttendance, 3);
  assert('Beispiel 1: Erlaubte Fehlzeiten gesamt = 1', res1.maxAllowedAbsences, 1);
  assert('Beispiel 1: Verbleibende Fehltage = 1', res1.remainingAbsences, 1);
  assert('Beispiel 1: Ampel ist Gelb (nur 1 Tag Puffer)', res1.trafficLight, 'yellow');

  // Test 2: 1-mal gefehlt im gleichen Kurs
  const s4_oneAbsent: { status: SessionStatus }[] = [
    { status: 'present' },
    { status: 'absent' },
    { status: 'open' },
    { status: 'open' }
  ];
  const res2 = calculateAttendanceStatus({ minAttendancePercent: 66.7 }, s4_oneAbsent);
  assert('Beispiel 2: 1-mal gefehlt -> verbleibend 0', res2.remainingAbsences, 0);
  assert('Beispiel 2: Ampel bleibt Gelb (0 Fehltage übrig)', res2.trafficLight, 'yellow');
  assert('Beispiel 2: Noch nicht durchgefallen', res2.isFailed, false);

  // Test 3: 2-mal gefehlt im gleichen Kurs (Endgültig durchgefallen)
  const s4_twoAbsent: { status: SessionStatus }[] = [
    { status: 'present' },
    { status: 'absent' },
    { status: 'absent' },
    { status: 'open' }
  ];
  const res3 = calculateAttendanceStatus({ minAttendancePercent: 66.7 }, s4_twoAbsent);
  assert('Beispiel 3: 2-mal gefehlt -> verbleibend -1', res3.remainingAbsences, -1);
  assert('Beispiel 3: Ampel ist Rot', res3.trafficLight, 'red');
  assert('Beispiel 3: isFailed ist true', res3.isFailed, true);

  // Test 4: Entschuldigt zählt nicht als Fehlzeit
  const s4_withExcused: { status: SessionStatus }[] = [
    { status: 'present' },
    { status: 'excused' },
    { status: 'absent' },
    { status: 'open' }
  ];
  const res4 = calculateAttendanceStatus({ minAttendancePercent: 66.7 }, s4_withExcused);
  assert('Beispiel 4: 1 entschuldigt + 1 gefehlt -> absentCount ist 1', res4.absentCount, 1);
  assert('Beispiel 4: remainingAbsences ist weiterhin 0 (nicht -1)', res4.remainingAbsences, 0);

  // Test 5: 10 Termine mit 80% (Fließkomma-Präzision)
  // 10 * 0.80 = 8.00000 -> ceil(8) = 8 -> max allowed = 2
  const s10: { status: SessionStatus }[] = Array(10).fill({ status: 'open' });
  const res5 = calculateAttendanceStatus({ minAttendancePercent: 80 }, s10);
  assert('Beispiel 5: 10 Termine, 80% -> exakt 8 nötig', res5.requiredAttendance, 8);
  assert('Beispiel 5: Erlaubte Fehlzeiten = 2', res5.maxAllowedAbsences, 2);
  assert('Beispiel 5: Ampel ist Grün (>= 2 Puffer)', res5.trafficLight, 'green');

  // Test 6: 100% Pflicht
  const s5_100: { status: SessionStatus }[] = Array(5).fill({ status: 'open' });
  const res6 = calculateAttendanceStatus({ minAttendancePercent: 100 }, s5_100);
  assert('Beispiel 6: 100% Pflicht bei 5 Terminen -> 5 nötig', res6.requiredAttendance, 5);
  assert('Beispiel 6: 0 Fehlzeiten erlaubt', res6.maxAllowedAbsences, 0);

  // Test 7: Randfall 0 Termine
  const res7 = calculateAttendanceStatus({ minAttendancePercent: 75 }, []);
  assert('Beispiel 7: 0 Termine -> 0 nötig', res7.requiredAttendance, 0);
  assert('Beispiel 7: Ampel grün / sicher', res7.trafficLight, 'green');

  console.log(`\nTestergebnis: ${passed} bestanden, ${failed} fehlgeschlagen.`);
}

runTests();
