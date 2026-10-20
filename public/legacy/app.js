/**
 * Anwesenheits- & Fehlzeitenrechner für Studierende
 * Vollständige Frontend-Applikation mit mathematischer Berechnungs-Engine,
 * Kalender-Import (.ics), Serien-Generator und Ampelsystem.
 */

// ==========================================
// 1. Mathematische Berechnungs-Engine
// ==========================================

function calculateAttendanceStatus(course, sessions = []) {
  const totalSessions = sessions.length;
  const rawMinPercent = parseFloat(course.minAttendancePercent) || 0;
  const minAttendancePercent = Math.max(0, Math.min(100, rawMinPercent));

  let presentCount = 0;
  let absentCount = 0;
  let excusedCount = 0;
  let openCount = 0;

  for (const session of sessions) {
    switch (session.status) {
      case 'present': presentCount++; break;
      case 'absent': absentCount++; break;
      case 'excused': excusedCount++; break;
      case 'open':
      default: openCount++; break;
    }
  }

  const completedCount = presentCount + absentCount + excusedCount;

  // Randfall: Keine Termine hinterlegt
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

  // Mathematisch exakt: ⌈N × (Prozent/100)⌉
  // Beseitigung von IEEE-754 Fließkomma-Rundungsfehlern
  const rawTarget = (totalSessions * minAttendancePercent) / 100;
  const cleanTarget = Math.round(rawTarget * 1e8) / 1e8;
  const requiredAttendance = Math.ceil(cleanTarget);

  // Erlaubte Fehlzeiten gesamt: N - erforderliche Anwesenheiten
  const maxAllowedAbsences = Math.max(0, totalSessions - requiredAttendance);

  // Verbleibende Fehltage: Erlaubt abzüglich der unentschuldigt versäumten Termine
  const remainingAbsences = maxAllowedAbsences - absentCount;

  // Ampel-System:
  // - Grün: Sicher (mindestens 2 Fehltage Puffer)
  // - Gelb: Kritisches Limit (nur noch maximal 1 Fehltag übrig: 0 oder 1)
  // - Rot: Pflicht unterschritten (< 0 Fehltage übrig)
  let trafficLight = 'green';
  let isFailed = false;
  let isAtRisk = false;

  if (remainingAbsences < 0) {
    trafficLight = 'red';
    isFailed = true;
  } else if (remainingAbsences <= 1) {
    trafficLight = 'yellow';
    isAtRisk = true;
  } else {
    trafficLight = 'green';
  }

  // Quoten
  const attendedSoFar = presentCount + excusedCount;
  const currentAttendancePercent = completedCount > 0
    ? Math.round((attendedSoFar / completedCount) * 1000) / 10
    : 100;

  const maxPossibleAttended = presentCount + excusedCount + openCount;
  const maxPossibleAttendancePercent = Math.round((maxPossibleAttended / totalSessions) * 1000) / 10;

  // Status-Botschaft für Echtzeit-Anzeige
  let statusMessage = '';
  if (isFailed) {
    const overdue = Math.abs(remainingAbsences);
    statusMessage = `Prüfungszulassung gefährdet! Pflicht um ${overdue} ${overdue === 1 ? 'Fehltermin' : 'Fehltermine'} unterschritten.`;
  } else if (remainingAbsences === 0) {
    statusMessage = `Kritisches Limit: Du darfst in diesem Fach kein weiteres Mal fehlen!`;
  } else if (remainingAbsences === 1) {
    statusMessage = `Du darfst in diesem Fach noch genau 1-mal fehlen.`;
  } else {
    statusMessage = `Du darfst in diesem Fach noch genau ${remainingAbsences}-mal fehlen.`;
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
    isAttendanceFulfilled: !isFailed,
    isAtRisk,
    isFailed,
    trafficLight,
    currentAttendancePercent,
    maxPossibleAttendancePercent,
    statusMessage
  };
}

// ==========================================
// 2. ICS Kalender-Parser (RFC 5545)
// ==========================================

function unfoldIcsLines(raw) {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (result.length > 0) result[result.length - 1] += line.substring(1);
    } else {
      result.push(line);
    }
  }
  return result;
}

function parseIcsDate(raw) {
  const val = (raw.includes(':') ? raw.split(':').pop() : raw).trim();
  if (val.length >= 8) {
    const date = `${val.substring(0, 4)}-${val.substring(4, 6)}-${val.substring(6, 8)}`;
    let time = '';
    if (val.includes('T')) {
      const t = val.split('T')[1];
      if (t.length >= 4) time = `${t.substring(0, 2)}:${t.substring(2, 4)}`;
    }
    return { date, time };
  }
  return { date: new Date().toISOString().split('T')[0], time: '08:00' };
}

function parseIcs(content) {
  const lines = unfoldIcsLines(content);
  const events = [];
  let inEvent = false;
  let cur = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true;
      cur = {};
      continue;
    }
    if (trimmed === 'END:VEVENT') {
      inEvent = false;
      if (cur.summary && cur.date) events.push(cur);
      cur = {};
      continue;
    }
    if (!inEvent) continue;

    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const key = trimmed.substring(0, idx).split(';')[0].toUpperCase();
    const val = trimmed.substring(idx + 1).replace(/\\,/g, ',').replace(/\\;/g, ';');

    if (key === 'SUMMARY') cur.summary = val.trim();
    else if (key === 'LOCATION') cur.room = val.trim();
    else if (key === 'DTSTART') {
      const p = parseIcsDate(trimmed);
      cur.date = p.date;
      cur.startTime = p.time;
    } else if (key === 'DTEND') {
      const p = parseIcsDate(trimmed);
      cur.endTime = p.time;
    }
  }
  return events;
}

// ==========================================
// 3. State Management & Persistenz
// ==========================================

const STORAGE_KEY_COURSES = 'study_attendance_courses_v2';
const STORAGE_KEY_SESSIONS = 'study_attendance_sessions_v2';
const STORAGE_KEY_USER = 'study_attendance_user_v2';

// Standard-Beispieldaten zur Veranschaulichung der mathematischen Anforderungen
const DEFAULT_COURSES = [
  {
    id: 'course-1',
    name: 'Informatik I: Grundlagen & Algorithmen',
    code: 'CS101',
    room: 'Hörsaal A (Audimax)',
    lecturer: 'Prof. Dr. Schmidt',
    color: '#6366f1',
    minAttendancePercent: 66.7, // 2/3 Anwesenheitspflicht wie im Prompt-Beispiel
    notes: 'Praktikum mit Anwesenheitspflicht. Bei 4 Terminen mind. 3 nötig.'
  },
  {
    id: 'course-2',
    name: 'Höhere Mathematik I für Ingenieure',
    code: 'MATH101',
    room: 'Seminarraum 204',
    lecturer: 'Prof. Dr. Müller',
    color: '#06b6d4',
    minAttendancePercent: 80.0,
    notes: 'Übungsgruppen mit wöchentlicher Anwesenheit.'
  },
  {
    id: 'course-3',
    name: 'Datenbanksysteme & Cloud',
    code: 'CS204',
    room: 'Labor 112',
    lecturer: 'Dr. Bauer',
    color: '#10b981',
    minAttendancePercent: 75.0,
    notes: 'Projekt-Workshops.'
  }
];

const DEFAULT_SESSIONS = [
  // Informatik I (4 Termine, 66.7% Pflicht: 3 nötig, 1 Fehltag erlaubt)
  { id: 's1-1', courseId: 'course-1', date: '2026-10-06', startTime: '10:00', endTime: '11:30', topic: 'Einführung & Syntax', status: 'present' },
  { id: 's1-2', courseId: 'course-1', date: '2026-10-13', startTime: '10:00', endTime: '11:30', topic: 'Kontrollstrukturen & Schleifen', status: 'absent' }, // 1-mal gefehlt -> noch 0 erlaubt!
  { id: 's1-3', courseId: 'course-1', date: '2026-10-20', startTime: '10:00', endTime: '11:30', topic: 'Funktionen & Rekursion', status: 'open' },
  { id: 's1-4', courseId: 'course-1', date: '2026-10-27', startTime: '10:00', endTime: '11:30', topic: 'Abschlussprüfungsvorbereitung', status: 'open' },

  // Mathematik I (6 Termine, 80% -> 5 nötig, 1 Fehltag erlaubt)
  { id: 's2-1', courseId: 'course-2', date: '2026-10-07', startTime: '08:15', endTime: '09:45', topic: 'Vektorrechnung I', status: 'present' },
  { id: 's2-2', courseId: 'course-2', date: '2026-10-14', startTime: '08:15', endTime: '09:45', topic: 'Matrizen & LGS', status: 'present' },
  { id: 's2-3', courseId: 'course-2', date: '2026-10-21', startTime: '08:15', endTime: '09:45', topic: 'Grenzwerte & Stetigkeit', status: 'open' },
  { id: 's2-4', courseId: 'course-2', date: '2026-10-28', startTime: '08:15', endTime: '09:45', topic: 'Differenzialrechnung', status: 'open' },
  { id: 's2-5', courseId: 'course-2', date: '2026-11-04', startTime: '08:15', endTime: '09:45', topic: 'Integralrechnung', status: 'open' },
  { id: 's2-6', courseId: 'course-2', date: '2026-11-11', startTime: '08:15', endTime: '09:45', topic: 'Wiederholung', status: 'open' },

  // Datenbanksysteme (4 Termine, 75% -> 3 nötig)
  { id: 's3-1', courseId: 'course-3', date: '2026-10-08', startTime: '14:00', endTime: '15:30', topic: 'ER-Modellierung', status: 'present' },
  { id: 's3-2', courseId: 'course-3', date: '2026-10-15', startTime: '14:00', endTime: '15:30', topic: 'Normalformen', status: 'excused' }, // Entschuldigt zählt nicht als Fehltag!
  { id: 's3-3', courseId: 'course-3', date: '2026-10-22', startTime: '14:00', endTime: '15:30', topic: 'SQL DDL & DML', status: 'open' },
  { id: 's3-4', courseId: 'course-3', date: '2026-10-29', startTime: '14:00', endTime: '15:30', topic: 'Transaktionen & ACID', status: 'open' }
];

let state = {
  courses: [],
  sessions: [],
  selectedCourseId: 'all',
  filterStatus: 'all',
  searchQuery: '',
  currentUser: {
    id: 'guest',
    displayName: 'Gast-Student',
    isGuest: true
  }
};

function loadState() {
  try {
    const rawCourses = localStorage.getItem(STORAGE_KEY_COURSES);
    const rawSessions = localStorage.getItem(STORAGE_KEY_SESSIONS);
    const rawUser = localStorage.getItem(STORAGE_KEY_USER);

    if (rawCourses && rawSessions) {
      state.courses = JSON.parse(rawCourses);
      state.sessions = JSON.parse(rawSessions);
    } else {
      // Initiale Beispieldaten laden
      state.courses = DEFAULT_COURSES;
      state.sessions = DEFAULT_SESSIONS;
      saveState();
    }


  } catch (e) {
    console.error('Fehler beim Laden des State:', e);
    state.courses = DEFAULT_COURSES;
    state.sessions = DEFAULT_SESSIONS;
  }
}

function saveState() {
  if (state.currentUser && !state.currentUser.isGuest) {
    scheduleCloudSync();
    return;
  }
  localStorage.setItem(STORAGE_KEY_COURSES, JSON.stringify(state.courses));
  localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(state.sessions));
}

// ==========================================
// Cloud-Datenbank (Lovable Cloud)
// ==========================================
const sb = window.__sb;
let cloudSynced = { courses: new Set(), sessions: new Set() };
let syncTimer = null;
let syncRunning = Promise.resolve();

function guestUser() {
  return { id: 'guest', displayName: 'Gast-Student', isGuest: true };
}

function courseToRow(c) {
  return { id: c.id, name: c.name, code: c.code || null, room: c.room || null, lecturer: c.lecturer || null,
    color: c.color || null, min_attendance_percent: Number(c.minAttendancePercent) || 0, notes: c.notes || null };
}
function rowToCourse(r) {
  return { id: r.id, name: r.name, code: r.code || '', room: r.room || '', lecturer: r.lecturer || '',
    color: r.color || '#6366f1', minAttendancePercent: Number(r.min_attendance_percent), notes: r.notes || '' };
}
function sessionToRow(s) {
  return { id: s.id, course_id: s.courseId, date: s.date, start_time: s.startTime || null, end_time: s.endTime || null,
    topic: s.topic || null, room: s.room || null, status: s.status || 'open', note: s.note || null };
}
function rowToSession(r) {
  return { id: r.id, courseId: r.course_id, date: r.date, startTime: r.start_time || '', endTime: r.end_time || '',
    topic: r.topic || '', room: r.room || '', status: r.status, note: r.note || '' };
}

async function loadCloudState() {
  const [c, s] = await Promise.all([
    sb.from('courses').select('*').order('created_at'),
    sb.from('sessions').select('*').order('date').range(0, 9999)
  ]);
  if (c.error || s.error) throw (c.error || s.error);
  state.courses = c.data.map(rowToCourse);
  state.sessions = s.data.map(rowToSession);
  cloudSynced = { courses: new Set(state.courses.map(x => x.id)), sessions: new Set(state.sessions.map(x => x.id)) };
}

function scheduleCloudSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncRunning = syncRunning.then(syncCloud); }, 400);
}

async function syncCloud() {
  try {
    const courseIds = new Set(state.courses.map(c => c.id));
    const sessionIds = new Set(state.sessions.map(s => s.id));
    const removedSessions = [...cloudSynced.sessions].filter(id => !sessionIds.has(id));
    const removedCourses = [...cloudSynced.courses].filter(id => !courseIds.has(id));
    if (removedSessions.length) { const r = await sb.from('sessions').delete().in('id', removedSessions); if (r.error) throw r.error; }
    if (removedCourses.length) { const r = await sb.from('courses').delete().in('id', removedCourses); if (r.error) throw r.error; }
    if (state.courses.length) { const r = await sb.from('courses').upsert(state.courses.map(courseToRow), { onConflict: 'user_id,id' }); if (r.error) throw r.error; }
    const validSessions = state.sessions.filter(s => courseIds.has(s.courseId));
    for (let i = 0; i < validSessions.length; i += 500) {
      const r = await sb.from('sessions').upsert(validSessions.slice(i, i + 500).map(sessionToRow), { onConflict: 'user_id,id' });
      if (r.error) throw r.error;
    }
    cloudSynced = { courses: courseIds, sessions: new Set(validSessions.map(s => s.id)) };
  } catch (e) {
    console.error('Cloud-Sync fehlgeschlagen:', e);
    showToast('Speichern in der Cloud fehlgeschlagen. Bitte erneut versuchen.', 'error');
  }
}

async function applySession(session) {
  if (session && session.user) {
    state.currentUser = { id: session.user.id, email: session.user.email,
      displayName: (session.user.email || '').split('@')[0], isGuest: false };
    try {
      await loadCloudState();
      if (state.courses.length === 0) {
        // Erste Anmeldung: lokale Daten in die Cloud übernehmen
        const raw = localStorage.getItem(STORAGE_KEY_COURSES);
        const rawS = localStorage.getItem(STORAGE_KEY_SESSIONS);
        state.courses = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEFAULT_COURSES));
        state.sessions = rawS ? JSON.parse(rawS) : JSON.parse(JSON.stringify(DEFAULT_SESSIONS));
        await syncCloud();
      }
    } catch (e) {
      console.error(e);
      showToast('Daten konnten nicht aus der Cloud geladen werden.', 'error');
    }
  } else {
    state.currentUser = guestUser();
    loadState();
  }
  renderApp();
}

function resetToDefaultData() {
  if (confirm('Möchtest du wirklich alle Daten auf die Standard-Beispieldaten zurücksetzen?')) {
    state.courses = JSON.parse(JSON.stringify(DEFAULT_COURSES));
    state.sessions = JSON.parse(JSON.stringify(DEFAULT_SESSIONS));
    saveState();
    renderApp();
    showToast('Daten auf Beispieldaten zurückgesetzt.', 'info');
  }
}

// ==========================================
// 4. UI Rendering & Echtzeit-Aktualisierung
// ==========================================

function renderApp() {
  renderHeaderStats();
  renderCourseCards();
  renderCourseFilterSelect();
  renderSessionList();
  renderActiveUserDisplay();
}

function renderHeaderStats() {
  const container = document.getElementById('header-stats');
  if (!container) return;

  let totalSessionsAll = 0;
  let presentAll = 0;
  let absentAll = 0;
  let atRiskCount = 0;
  let failedCount = 0;

  state.courses.forEach(c => {
    const s = state.sessions.filter(sess => sess.courseId === c.id);
    const res = calculateAttendanceStatus(c, s);
    totalSessionsAll += res.totalSessions;
    presentAll += res.presentCount;
    absentAll += res.absentCount;
    if (res.isFailed) failedCount++;
    else if (res.isAtRisk) atRiskCount++;
  });

  document.getElementById('stat-total-courses').textContent = state.courses.length;
  document.getElementById('stat-at-risk-courses').textContent = atRiskCount + failedCount;
  
  const statusSummaryEl = document.getElementById('stat-global-status');
  if (failedCount > 0) {
    statusSummaryEl.innerHTML = `<span class="text-rose-400 font-semibold flex items-center gap-1.5"><i data-lucide="alert-octagon" class="w-4 h-4"></i> ${failedCount} Fach gefährdet</span>`;
  } else if (atRiskCount > 0) {
    statusSummaryEl.innerHTML = `<span class="text-amber-400 font-semibold flex items-center gap-1.5"><i data-lucide="alert-triangle" class="w-4 h-4"></i> ${atRiskCount} am Limit</span>`;
  } else {
    statusSummaryEl.innerHTML = `<span class="text-emerald-400 font-semibold flex items-center gap-1.5"><i data-lucide="check-circle-2" class="w-4 h-4"></i> Alles im grünen Bereich</span>`;
  }

  lucide.createIcons();
}

function renderCourseCards() {
  const grid = document.getElementById('courses-grid');
  if (!grid) return;

  if (state.courses.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-12 glass-card rounded-2xl p-8 border border-dashed border-gray-700">
        <div class="w-16 h-16 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-4">
          <i data-lucide="book-open" class="w-8 h-8"></i>
        </div>
        <h3 class="text-lg font-semibold text-gray-200 mb-1">Noch keine Fächer angelegt</h3>
        <p class="text-gray-400 text-sm max-w-md mx-auto mb-5">Erstelle dein erstes Fach oder importiere deinen Stundenplan via .ics Kalenderdatei.</p>
        <button onclick="openCourseModal()" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl text-sm transition shadow-lg shadow-indigo-600/30 inline-flex items-center gap-2">
          <i data-lucide="plus" class="w-4 h-4"></i> Fach hinzufügen
        </button>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  grid.innerHTML = state.courses.map(course => {
    const sessions = state.sessions.filter(s => s.courseId === course.id);
    const result = calculateAttendanceStatus(course, sessions);
    
    // Ampel-Styling
    let badgeClass = 'badge-green';
    let iconName = 'shield-check';
    let badgeLabel = 'Sicher';
    let cardBorder = 'border-gray-800';

    if (result.trafficLight === 'red') {
      badgeClass = 'badge-red';
      iconName = 'alert-octagon';
      badgeLabel = 'Nicht bestanden / Gefährdet';
      cardBorder = 'border-rose-500/40 shadow-rose-950/20';
    } else if (result.trafficLight === 'yellow') {
      badgeClass = 'badge-yellow';
      iconName = 'alert-triangle';
      badgeLabel = 'Kritisches Limit';
      cardBorder = 'border-amber-500/40 shadow-amber-950/20';
    }

    // Fortschrittsbalken Prozent
    const progressFill = Math.min(100, result.totalSessions > 0 ? (result.presentCount / result.totalSessions) * 100 : 0);
    const requiredThreshold = Math.min(100, course.minAttendancePercent);

    return `
      <div class="glass-card rounded-2xl p-5 border ${cardBorder} flex flex-col justify-between relative overflow-hidden group">
        <!-- Farbakzent oben -->
        <div class="absolute top-0 left-0 right-0 h-1.5" style="background-color: ${course.color || '#6366f1'}"></div>
        
        <div>
          <!-- Header Zeile: Titel & Ampel Badge -->
          <div class="flex items-start justify-between gap-3 mb-3 pt-1">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700/60">${escapeHtml(course.code || 'KURS')}</span>
                <span class="text-xs text-gray-400 font-mono">${course.minAttendancePercent}% Pflicht</span>
              </div>
              <h3 class="text-base font-bold text-gray-100 truncate mt-1.5 group-hover:text-indigo-300 transition">${escapeHtml(course.name)}</h3>
              <p class="text-xs text-gray-400 truncate flex items-center gap-1.5 mt-0.5">
                <i data-lucide="map-pin" class="w-3 h-3 text-gray-500"></i> ${escapeHtml(course.room || 'Kein Raum')} 
                <span class="text-gray-600">•</span> 
                <i data-lucide="user" class="w-3 h-3 text-gray-500"></i> ${escapeHtml(course.lecturer || 'Kein Dozent')}
              </p>
            </div>
            
            <div class="flex flex-col items-end gap-1">
              <span class="px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 ${badgeClass}">
                <i data-lucide="${iconName}" class="w-3.5 h-3.5"></i> ${badgeLabel}
              </span>
            </div>
          </div>

          <!-- Großes Kennzahlen-Panel: Verbleibende Fehltage (Kernanforderung) -->
          <div class="my-4 p-3.5 rounded-xl bg-gray-900/80 border border-gray-800/80 flex items-center justify-between">
            <div>
              <span class="text-[11px] uppercase tracking-wider text-gray-400 font-semibold block">Verbleibende Fehltage</span>
              <div class="text-xl font-extrabold ${result.isFailed ? 'text-rose-400' : result.remainingAbsences <= 1 ? 'text-amber-400' : 'text-emerald-400'} mt-0.5 flex items-baseline gap-1.5">
                <span>${result.isFailed ? `${result.remainingAbsences}` : result.remainingAbsences}</span>
                <span class="text-xs font-normal text-gray-400">von max. ${result.maxAllowedAbsences} erlaubt</span>
              </div>
            </div>
            <div class="text-right">
              <span class="text-[11px] uppercase tracking-wider text-gray-400 font-semibold block">Notwendig</span>
              <span class="text-sm font-bold text-gray-200">⌈${result.requiredAttendance} von ${result.totalSessions}⌉</span>
            </div>
          </div>

          <!-- Echtzeit-Statusanzeige (Kernanforderung) -->
          <div class="text-xs font-medium px-3 py-2 rounded-lg mb-4 flex items-center gap-2 ${
            result.isFailed ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20' :
            result.isAtRisk ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' :
            'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
          }">
            <i data-lucide="${result.isFailed ? 'x-circle' : result.isAtRisk ? 'alert-circle' : 'info'}" class="w-4 h-4 shrink-0"></i>
            <span>${escapeHtml(result.statusMessage)}</span>
          </div>

          <!-- Fortschrittsbalken mit Schwellenwert-Markierung -->
          <div class="mb-4">
            <div class="flex justify-between text-[11px] text-gray-400 mb-1.5 font-medium">
              <span>Anwesenheit bisher: <strong class="text-gray-200">${result.presentCount}</strong> / ${result.totalSessions}</span>
              <span>Gefehlt: <strong class="${result.absentCount > result.maxAllowedAbsences ? 'text-rose-400' : 'text-gray-200'}">${result.absentCount}</strong> | Entschuldigt: <strong class="text-blue-400">${result.excusedCount}</strong></span>
            </div>
            <div class="h-2.5 w-full bg-gray-800 rounded-full overflow-hidden relative border border-gray-700/50">
              <div class="h-full transition-all duration-500 ${result.isFailed ? 'bg-rose-500' : result.isAtRisk ? 'bg-amber-500' : 'bg-emerald-500'}" style="width: ${progressFill}%"></div>
              <!-- Schwellenwert-Linie für Mindestanwesenheit -->
              <div class="absolute top-0 bottom-0 w-0.5 bg-indigo-400 z-10" style="left: ${requiredThreshold}%" title="Pflichtgrenze: ${requiredThreshold}%"></div>
            </div>
          </div>
        </div>

        <!-- Aktionsleiste unten -->
        <div class="pt-3 border-t border-gray-800/80 flex items-center justify-between text-xs text-gray-400">
          <button onclick="selectCourseFilter('${course.id}')" class="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 transition">
            <i data-lucide="calendar" class="w-3.5 h-3.5"></i> Termine verwalten (${sessions.length})
          </button>
          <div class="flex items-center gap-2">
            <button onclick="openCourseModal('${course.id}')" class="p-1.5 hover:text-gray-200 hover:bg-gray-800 rounded transition" title="Kurs bearbeiten">
              <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="deleteCourse('${course.id}')" class="p-1.5 hover:text-rose-400 hover:bg-rose-500/10 rounded transition" title="Kurs löschen">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function renderCourseFilterSelect() {
  const select = document.getElementById('filter-course-select');
  if (!select) return;

  const currentVal = state.selectedCourseId;
  select.innerHTML = `
    <option value="all">Alle Fächer (${state.sessions.length} Termine)</option>
    ${state.courses.map(c => `
      <option value="${c.id}" ${c.id === currentVal ? 'selected' : ''}>${escapeHtml(c.name)} (${state.sessions.filter(s => s.courseId === c.id).length} Termine)</option>
    `).join('')}
  `;
}

function renderSessionList() {
  const container = document.getElementById('sessions-container');
  if (!container) return;

  // Filter anwenden
  let filtered = [...state.sessions];

  if (state.selectedCourseId !== 'all') {
    filtered = filtered.filter(s => s.courseId === state.selectedCourseId);
  }

  if (state.filterStatus !== 'all') {
    filtered = filtered.filter(s => s.status === state.filterStatus);
  }

  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter(s => {
      const course = state.courses.find(c => c.id === s.courseId);
      return (
        (s.topic && s.topic.toLowerCase().includes(q)) ||
        (s.date && s.date.includes(q)) ||
        (course && course.name.toLowerCase().includes(q))
      );
    });
  }

  // Sortierung nach Datum aufsteigend
  filtered.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // Anzeige der gefilterten Anzahl
  const countEl = document.getElementById('sessions-filtered-count');
  if (countEl) countEl.textContent = `${filtered.length} Termine`;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center py-16 glass-card rounded-2xl border border-dashed border-gray-800 p-8">
        <i data-lucide="calendar-x" class="w-10 h-10 text-gray-500 mx-auto mb-3"></i>
        <h4 class="text-base font-semibold text-gray-300 mb-1">Keine Termine gefunden</h4>
        <p class="text-xs text-gray-500 max-w-sm mx-auto mb-4">Erstelle einzelne Einheiten, nutze den wöchentlichen Serien-Generator oder importiere eine .ics Datei.</p>
        <div class="flex items-center justify-center gap-3">
          <button onclick="openSessionModal()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition inline-flex items-center gap-1.5">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i> Einzeltermin
          </button>
          <button onclick="openSeriesModal()" class="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg transition inline-flex items-center gap-1.5">
            <i data-lucide="repeat" class="w-3.5 h-3.5"></i> Wöchentliche Serie
          </button>
        </div>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = filtered.map(session => {
    const course = state.courses.find(c => c.id === session.courseId) || {
      name: 'Unbekannter Kurs',
      color: '#6b7280'
    };

    const formattedDate = formatDateDisplay(session.date);

    return `
      <div class="glass-card rounded-xl p-3.5 border border-gray-800/80 hover:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition">
        <!-- Linke Seite: Datum, Kurs & Thema -->
        <div class="flex items-center gap-3.5 min-w-0">
          <!-- Datum-Badge -->
          <div class="w-14 h-14 rounded-xl bg-gray-900 border border-gray-800 flex flex-col items-center justify-center shrink-0">
            <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">${formattedDate.weekday}</span>
            <span class="text-base font-extrabold text-gray-100">${formattedDate.day}</span>
            <span class="text-[10px] text-gray-400 font-medium">${formattedDate.month}</span>
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${course.color || '#6366f1'}"></span>
              <span class="text-xs font-semibold text-gray-300 truncate">${escapeHtml(course.name)}</span>
              ${session.startTime ? `
                <span class="text-[11px] text-gray-400 font-mono flex items-center gap-1">
                  <i data-lucide="clock" class="w-3 h-3 text-gray-500"></i> ${session.startTime} ${session.endTime ? `- ${session.endTime}` : ''}
                </span>
              ` : ''}
            </div>
            <h4 class="text-sm font-medium text-gray-100 truncate mt-0.5">${escapeHtml(session.topic || 'Vorlesungseinheit')}</h4>
            ${session.room ? `<p class="text-[11px] text-gray-500 flex items-center gap-1"><i data-lucide="map-pin" class="w-3 h-3"></i> ${escapeHtml(session.room)}</p>` : ''}
          </div>
        </div>

        <!-- Rechte Seite: Status Toggle Buttons (Echtzeit-Interaktion!) -->
        <div class="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
          <button 
            onclick="updateSessionStatus('${session.id}', 'present')" 
            class="btn-status ${session.status === 'present' ? 'active-present' : 'bg-gray-800/80 text-gray-400 hover:text-emerald-400'}"
            title="Als anwesend markieren">
            <i data-lucide="check" class="w-3.5 h-3.5 sm:mr-1"></i>
            <span class="hidden sm:inline">Anwesend</span>
          </button>

          <button 
            onclick="updateSessionStatus('${session.id}', 'absent')" 
            class="btn-status ${session.status === 'absent' ? 'active-absent' : 'bg-gray-800/80 text-gray-400 hover:text-rose-400'}"
            title="Als gefehlt markieren">
            <i data-lucide="x" class="w-3.5 h-3.5 sm:mr-1"></i>
            <span class="hidden sm:inline">Gefehlt</span>
          </button>

          <button 
            onclick="updateSessionStatus('${session.id}', 'excused')" 
            class="btn-status ${session.status === 'excused' ? 'active-excused' : 'bg-gray-800/80 text-gray-400 hover:text-blue-400'}"
            title="Entschuldigt (zählt nicht als Fehlzeit)">
            <i data-lucide="file-text" class="w-3.5 h-3.5 sm:mr-1"></i>
            <span class="hidden sm:inline">Entschuldigt</span>
          </button>

          <button 
            onclick="updateSessionStatus('${session.id}', 'open')" 
            class="btn-status ${session.status === 'open' ? 'active-open' : 'bg-gray-800/80 text-gray-400 hover:text-gray-200'}"
            title="Zurück auf offen setzen">
            <i data-lucide="circle-dashed" class="w-3.5 h-3.5 sm:mr-1"></i>
            <span class="hidden sm:inline">Offen</span>
          </button>

          <!-- Termin löschen -->
          <button 
            onclick="deleteSession('${session.id}')" 
            class="p-2 text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition ml-1"
            title="Termin entfernen">
            <i data-lucide="trash" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function renderActiveUserDisplay() {
  const el = document.getElementById('user-profile-badge');
  if (!el) return;
  el.innerHTML = `
    <div class="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-800/80 border border-gray-700/60 text-xs">
      <div class="w-2 h-2 rounded-full ${state.currentUser.isGuest ? 'bg-amber-400' : 'bg-emerald-400'}"></div>
      <span class="text-gray-300 font-medium">${escapeHtml(state.currentUser.displayName || 'Gast')}</span>
      <span class="text-[10px] text-gray-500 font-mono">${state.currentUser.isGuest ? 'Gastmodus (Lokal)' : 'Cloud'}</span>
    </div>
  `;
}

// ==========================================
// 5. Interaktionen & Event-Handler
// ==========================================

function updateSessionStatus(sessionId, newStatus) {
  const session = state.sessions.find(s => s.id === sessionId);
  if (!session) return;

  session.status = newStatus;
  saveState();

  // Sofortige Echtzeit-Neuberechnung aller betroffenen Fächer und Cards
  renderHeaderStats();
  renderCourseCards();
  renderSessionList();

  const course = state.courses.find(c => c.id === session.courseId);
  const statusTexts = {
    present: 'als anwesend markiert',
    absent: 'als unentschuldigt gefehlt gewertet',
    excused: 'als entschuldigt vermerkt (zählt nicht als Fehlzeit)',
    open: 'auf offen zurückgesetzt'
  };

  showToast(`Termin ${statusTexts[newStatus]} (${course ? course.name : ''}).`, 'info');
}

function deleteSession(sessionId) {
  if (confirm('Möchtest du diesen Termin wirklich löschen?')) {
    state.sessions = state.sessions.filter(s => s.id !== sessionId);
    saveState();
    renderApp();
    showToast('Termin gelöscht.', 'info');
  }
}

function selectCourseFilter(courseId) {
  state.selectedCourseId = courseId;
  const select = document.getElementById('filter-course-select');
  if (select) select.value = courseId;
  renderSessionList();
  
  // Smooth Scroll zur Terminliste
  const listEl = document.getElementById('sessions-section');
  if (listEl) listEl.scrollIntoView({ behavior: 'smooth' });
}

function deleteCourse(courseId) {
  const course = state.courses.find(c => c.id === courseId);
  if (!course) return;

  if (confirm(`Möchtest du das Fach "${course.name}" und alle verknüpften Termine wirklich löschen?`)) {
    state.courses = state.courses.filter(c => c.id !== courseId);
    state.sessions = state.sessions.filter(s => s.courseId !== courseId);
    if (state.selectedCourseId === courseId) state.selectedCourseId = 'all';
    saveState();
    renderApp();
    showToast(`Fach "${course.name}" gelöscht.`, 'info');
  }
}

function markAllPastAsPresent() {
  const today = new Date().toISOString().split('T')[0];
  let changedCount = 0;

  state.sessions.forEach(s => {
    if ((state.selectedCourseId === 'all' || s.courseId === state.selectedCourseId) && s.status === 'open' && s.date <= today) {
      s.status = 'present';
      changedCount++;
    }
  });

  if (changedCount > 0) {
    saveState();
    renderApp();
    showToast(`${changedCount} vergangene Einheiten als anwesend markiert.`, 'success');
  } else {
    showToast('Keine vergangenen offenen Einheiten gefunden.', 'info');
  }
}

// ==========================================
// 6. Modals: Kurs anlegen / bearbeiten
// ==========================================

function openCourseModal(courseId = null) {
  const modal = document.getElementById('modal-course');
  const title = document.getElementById('modal-course-title');
  const form = document.getElementById('form-course');
  if (!modal || !form) return;

  form.reset();

  if (courseId) {
    const c = state.courses.find(item => item.id === courseId);
    if (c) {
      title.textContent = 'Fach bearbeiten';
      document.getElementById('course-id-input').value = c.id;
      document.getElementById('course-name-input').value = c.name;
      document.getElementById('course-code-input').value = c.code || '';
      document.getElementById('course-room-input').value = c.room || '';
      document.getElementById('course-lecturer-input').value = c.lecturer || '';
      document.getElementById('course-percent-input').value = c.minAttendancePercent;
      document.getElementById('course-color-input').value = c.color || '#6366f1';
      document.getElementById('course-notes-input').value = c.notes || '';
    }
  } else {
    title.textContent = 'Neues Fach anlegen';
    document.getElementById('course-id-input').value = '';
    document.getElementById('course-percent-input').value = 75;
    document.getElementById('course-color-input').value = '#6366f1';
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeCourseModal() {
  const modal = document.getElementById('modal-course');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function handleCourseFormSubmit(e) {
  e.preventDefault();
  const idInput = document.getElementById('course-id-input').value;
  const name = document.getElementById('course-name-input').value.trim();
  const code = document.getElementById('course-code-input').value.trim();
  const room = document.getElementById('course-room-input').value.trim();
  const lecturer = document.getElementById('course-lecturer-input').value.trim();
  const percent = parseFloat(document.getElementById('course-percent-input').value) || 75;
  const color = document.getElementById('course-color-input').value;
  const notes = document.getElementById('course-notes-input').value.trim();

  if (!name) {
    showToast('Bitte gib einen Kursnamen ein.', 'error');
    return;
  }

  if (idInput) {
    const existing = state.courses.find(c => c.id === idInput);
    if (existing) {
      existing.name = name;
      existing.code = code;
      existing.room = room;
      existing.lecturer = lecturer;
      existing.minAttendancePercent = percent;
      existing.color = color;
      existing.notes = notes;
      showToast(`Fach "${name}" aktualisiert.`, 'success');
    }
  } else {
    const newCourse = {
      id: 'course_' + Math.random().toString(36).substring(2, 9),
      name,
      code,
      room,
      lecturer,
      minAttendancePercent: percent,
      color,
      notes
    };
    state.courses.push(newCourse);
    showToast(`Fach "${name}" angelegt.`, 'success');
  }

  saveState();
  closeCourseModal();
  renderApp();
}

// ==========================================
// 7. Modals: Einzeltermin anlegen
// ==========================================

function openSessionModal() {
  const modal = document.getElementById('modal-session');
  const courseSelect = document.getElementById('session-course-select');
  if (!modal || !courseSelect) return;

  if (state.courses.length === 0) {
    showToast('Bitte lege zuerst ein Fach an.', 'error');
    openCourseModal();
    return;
  }

  courseSelect.innerHTML = state.courses.map(c => `
    <option value="${c.id}" ${state.selectedCourseId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>
  `).join('');

  document.getElementById('session-date-input').value = new Date().toISOString().split('T')[0];
  document.getElementById('session-start-input').value = '10:00';
  document.getElementById('session-end-input').value = '11:30';
  document.getElementById('session-topic-input').value = '';
  document.getElementById('session-status-input').value = 'open';

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeSessionModal() {
  const modal = document.getElementById('modal-session');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function handleSessionFormSubmit(e) {
  e.preventDefault();
  const courseId = document.getElementById('session-course-select').value;
  const date = document.getElementById('session-date-input').value;
  const startTime = document.getElementById('session-start-input').value;
  const endTime = document.getElementById('session-end-input').value;
  const topic = document.getElementById('session-topic-input').value.trim();
  const status = document.getElementById('session-status-input').value;

  if (!courseId || !date) {
    showToast('Bitte wähle Fach und Datum aus.', 'error');
    return;
  }

  const newSession = {
    id: 'sess_' + Math.random().toString(36).substring(2, 9),
    courseId,
    date,
    startTime,
    endTime,
    topic: topic || 'Vorlesung',
    status
  };

  state.sessions.push(newSession);
  saveState();
  closeSessionModal();
  renderApp();
  showToast('Termin hinzugefügt.', 'success');
}

// ==========================================
// 8. Modals: Wöchentliche Serie generieren
// ==========================================

function openSeriesModal() {
  const modal = document.getElementById('modal-series');
  const courseSelect = document.getElementById('series-course-select');
  if (!modal || !courseSelect) return;

  if (state.courses.length === 0) {
    showToast('Bitte lege zuerst ein Fach an.', 'error');
    openCourseModal();
    return;
  }

  courseSelect.innerHTML = state.courses.map(c => `
    <option value="${c.id}" ${state.selectedCourseId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>
  `).join('');

  // Default: Heute bis in 14 Wochen
  const today = new Date();
  const in14Weeks = new Date(today.getTime() + 14 * 7 * 24 * 60 * 60 * 1000);

  document.getElementById('series-start-date').value = today.toISOString().split('T')[0];
  document.getElementById('series-end-date').value = in14Weeks.toISOString().split('T')[0];
  document.getElementById('series-weekday').value = (today.getDay() === 0 ? 7 : today.getDay());
  document.getElementById('series-start-time').value = '10:00';
  document.getElementById('series-end-time').value = '11:30';

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeSeriesModal() {
  const modal = document.getElementById('modal-series');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function handleSeriesFormSubmit(e) {
  e.preventDefault();
  const courseId = document.getElementById('series-course-select').value;
  const startDateStr = document.getElementById('series-start-date').value;
  const endDateStr = document.getElementById('series-end-date').value;
  const targetDay = parseInt(document.getElementById('series-weekday').value, 10);
  const startTime = document.getElementById('series-start-time').value;
  const endTime = document.getElementById('series-end-time').value;
  const topicPrefix = document.getElementById('series-topic-prefix').value.trim() || 'Einheit';

  if (!courseId || !startDateStr || !endDateStr) {
    showToast('Bitte alle Pflichtfelder ausfüllen.', 'error');
    return;
  }

  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  if (end < start) {
    showToast('Das Enddatum darf nicht vor dem Startdatum liegen.', 'error');
    return;
  }

  const generated = [];
  let current = new Date(start);
  let count = 1;

  while (current <= end) {
    const currentDay = current.getDay() === 0 ? 7 : current.getDay();
    if (currentDay === targetDay) {
      const dateStr = current.toISOString().split('T')[0];
      generated.push({
        id: 'sess_' + Math.random().toString(36).substring(2, 9),
        courseId,
        date: dateStr,
        startTime,
        endTime,
        topic: `${topicPrefix} #${count}`,
        status: 'open'
      });
      count++;
    }
    // Nächster Tag
    current.setDate(current.getDate() + 1);
  }

  if (generated.length === 0) {
    showToast('Im gewählten Datumsbereich fiel kein passender Wochentag an.', 'error');
    return;
  }

  state.sessions.push(...generated);
  saveState();
  closeSeriesModal();
  renderApp();
  showToast(`${generated.length} Termine als Serie erfolgreich generiert!`, 'success');
}

// ==========================================
// 9. Modals: ICS Kalender-Import
// ==========================================

let parsedIcsEventsBuffer = [];

function openIcsModal() {
  const modal = document.getElementById('modal-ics');
  const courseSelect = document.getElementById('ics-course-select');
  if (!modal || !courseSelect) return;

  courseSelect.innerHTML = `
    <option value="auto">Automatisch (Kurse aus Terminnamen erkennen)</option>
    ${state.courses.map(c => `<option value="${c.id}">Zuordnen zu: ${escapeHtml(c.name)}</option>`).join('')}
  `;

  document.getElementById('ics-file-input').value = '';
  document.getElementById('ics-preview-container').classList.add('hidden');
  document.getElementById('btn-import-ics-submit').disabled = true;
  parsedIcsEventsBuffer = [];

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeIcsModal() {
  const modal = document.getElementById('modal-ics');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function handleIcsFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const content = e.target.result;
      parsedIcsEventsBuffer = parseIcs(content);

      if (parsedIcsEventsBuffer.length === 0) {
        showToast('Keine Termine in der .ics Datei gefunden.', 'error');
        return;
      }

      // Vorschau anzeigen
      const previewBox = document.getElementById('ics-preview-container');
      const previewList = document.getElementById('ics-preview-list');
      const countLabel = document.getElementById('ics-detected-count');

      countLabel.textContent = `${parsedIcsEventsBuffer.length} Termine erkannt`;
      previewList.innerHTML = parsedIcsEventsBuffer.slice(0, 5).map(ev => `
        <li class="text-xs text-gray-300 py-1 border-b border-gray-800 flex justify-between">
          <span class="truncate max-w-[200px] font-medium">${escapeHtml(ev.summary)}</span>
          <span class="text-gray-500 font-mono">${ev.date} ${ev.startTime || ''}</span>
        </li>
      `).join('') + (parsedIcsEventsBuffer.length > 5 ? `<li class="text-[11px] text-gray-500 pt-1">... und ${parsedIcsEventsBuffer.length - 5} weitere</li>` : '');

      previewBox.classList.remove('hidden');
      document.getElementById('btn-import-ics-submit').disabled = false;
      showToast(`${parsedIcsEventsBuffer.length} Termine erfolgreich eingelesen.`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Fehler beim Parsen der .ics Datei.', 'error');
    }
  };
  reader.readAsText(file);
}

function executeIcsImport() {
  if (parsedIcsEventsBuffer.length === 0) return;

  const targetCourseMode = document.getElementById('ics-course-select').value;
  let importedSessionsCount = 0;
  let newCoursesCount = 0;

  if (targetCourseMode === 'auto') {
    // Kurse gruppieren nach Event-Summary
    const courseMap = {};

    parsedIcsEventsBuffer.forEach(ev => {
      const name = ev.summary.trim();
      if (!courseMap[name]) {
        // Prüfe ob bereits ein Kurs existiert
        let match = state.courses.find(c => c.name.toLowerCase() === name.toLowerCase());
        if (!match) {
          match = {
            id: 'course_' + Math.random().toString(36).substring(2, 9),
            name: name,
            code: 'ICS',
            room: ev.room || '',
            minAttendancePercent: 75.0,
            color: '#3b82f6'
          };
          state.courses.push(match);
          newCoursesCount++;
        }
        courseMap[name] = match.id;
      }

      state.sessions.push({
        id: 'sess_' + Math.random().toString(36).substring(2, 9),
        courseId: courseMap[name],
        date: ev.date,
        startTime: ev.startTime || '08:00',
        endTime: ev.endTime || '10:00',
        topic: ev.summary,
        room: ev.room || '',
        status: 'open'
      });
      importedSessionsCount++;
    });
  } else {
    // Einem festen Kurs zuordnen
    parsedIcsEventsBuffer.forEach(ev => {
      state.sessions.push({
        id: 'sess_' + Math.random().toString(36).substring(2, 9),
        courseId: targetCourseMode,
        date: ev.date,
        startTime: ev.startTime || '08:00',
        endTime: ev.endTime || '10:00',
        topic: ev.summary,
        room: ev.room || '',
        status: 'open'
      });
      importedSessionsCount++;
    });
  }

  saveState();
  closeIcsModal();
  renderApp();
  showToast(`Import abgeschlossen: ${importedSessionsCount} Termine ${newCoursesCount > 0 ? `und ${newCoursesCount} neue Fächer` : ''} hinzugefügt!`, 'success');
}

// ==========================================
// 10. Modals: Account & Supabase Synchronisation
// ==========================================

function openAccountModal() {
  const modal = document.getElementById('modal-account');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeAccountModal() {
  const modal = document.getElementById('modal-account');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('account-email-input').value.trim();
  const password = document.getElementById('account-password-input').value;
  if (!email || !password) return;

  let { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error && /invalid login credentials/i.test(error.message)) {
    const res = await sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    if (res.error) { showToast(res.error.message, 'error'); return; }
    if (!res.data.session) {
      showToast('Fast geschafft! Bitte bestätige deine E-Mail-Adresse über den Link in deinem Postfach.', 'success');
      closeAccountModal();
      return;
    }
    data = res.data; error = null;
  }
  if (error) { showToast(error.message === 'Email not confirmed' ? 'Bitte bestätige zuerst deine E-Mail-Adresse.' : error.message, 'error'); return; }
  closeAccountModal();
  await applySession(data.session);
  showToast(`Angemeldet als ${state.currentUser.email}`, 'success');
}

async function logoutUser() {
  await sb.auth.signOut();
  closeAccountModal();
  await applySession(null);
  showToast('Abgemeldet. Lokaler Gastmodus aktiv.', 'info');
}

function exportBackupJson() {
  const data = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    courses: state.courses,
    sessions: state.sessions
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `anwesenheit_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup-Datei heruntergeladen.', 'success');
}

// ==========================================
// 11. Hilfsfunktionen & Toasts
// ==========================================

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateDisplay(isoDateStr) {
  if (!isoDateStr) return { weekday: '---', day: '--', month: '---' };
  try {
    const parts = isoDateStr.split('-');
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const weekdays = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'];
    const months = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];
    return {
      weekday: weekdays[date.getDay()],
      day: String(parts[2]).padStart(2, '0'),
      month: months[date.getMonth()]
    };
  } catch (e) {
    return { weekday: '---', day: '--', month: '---' };
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const colors = {
    success: 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200',
    error: 'bg-rose-950/90 border-rose-500/50 text-rose-200',
    info: 'bg-indigo-950/90 border-indigo-500/50 text-indigo-200'
  };

  const icons = {
    success: 'check-circle-2',
    error: 'alert-triangle',
    info: 'info'
  };

  toast.className = `px-4 py-3 rounded-xl border shadow-xl flex items-center gap-2.5 text-xs font-medium transition-all duration-300 transform translate-y-4 opacity-0 ${colors[type] || colors.info}`;
  toast.innerHTML = `
    <i data-lucide="${icons[type] || 'info'}" class="w-4 h-4 shrink-0"></i>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  // Animation einblenden
  setTimeout(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
  }, 10);

  // Nach 3.5s entfernen
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==========================================
// 12. Initialisierung beim DOM-Ready
// ==========================================

window.__studyTrackInit = async () => {
  loadState();
  renderApp();
  const { data: { session } } = await sb.auth.getSession();
  if (session) await applySession(session);
  sb.auth.onAuthStateChange((event, s) => {
    if (event === 'SIGNED_IN' && state.currentUser.isGuest && s) setTimeout(() => applySession(s), 0);
  });

  // Filter Event Listeners
  const courseFilter = document.getElementById('filter-course-select');
  if (courseFilter) {
    courseFilter.addEventListener('change', (e) => {
      state.selectedCourseId = e.target.value;
      renderSessionList();
    });
  }

  const statusFilter = document.getElementById('filter-status-select');
  if (statusFilter) {
    statusFilter.addEventListener('change', (e) => {
      state.filterStatus = e.target.value;
      renderSessionList();
    });
  }

  const searchInput = document.getElementById('search-sessions-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderSessionList();
    });
  }

  // Form Submits
  const courseForm = document.getElementById('form-course');
  if (courseForm) courseForm.addEventListener('submit', handleCourseFormSubmit);

  const sessionForm = document.getElementById('form-session');
  if (sessionForm) sessionForm.addEventListener('submit', handleSessionFormSubmit);

  const seriesForm = document.getElementById('form-series');
  if (seriesForm) seriesForm.addEventListener('submit', handleSeriesFormSubmit);

  const loginForm = document.getElementById('form-login');
  if (loginForm) loginForm.addEventListener('submit', handleLoginSubmit);

  const icsInput = document.getElementById('ics-file-input');
  if (icsInput) icsInput.addEventListener('change', handleIcsFileSelected);

  lucide.createIcons();
};
