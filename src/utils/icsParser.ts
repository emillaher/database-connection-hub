/**
 * Robuster RFC 5545 iCalendar (.ics) Parser für Hochschul-Stundenpläne.
 * Extrahiert Termine, Räume, Zeiten und fasst Veranstaltungen zu Kursen zusammen.
 */

export interface ParsedIcsEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  startDate: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  rrule?: string;
}

export interface ParsedIcsResult {
  events: ParsedIcsEvent[];
  courseNames: string[];
}

/**
 * Entfaltet mehrzeilige iCal-Zeilen (RFC 5545 Zeilenfortsetzung per führendem Leerzeichen/Tab).
 */
function unfoldIcsLines(rawContent: string): string[] {
  const lines = rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const unfolded: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (unfolded.length > 0) {
        unfolded[unfolded.length - 1] += line.substring(1);
      }
    } else {
      unfolded.push(line);
    }
  }

  return unfolded;
}

/**
 * Parst einen iCal Datumsstring (z.B. "20261020T081500Z" oder "TZID=Europe/Berlin:20261020T081500" oder "20261020")
 */
function parseIcsDate(rawDateStr: string): { date: string; time?: string } {
  // Entferne vorangestellte Parameter wie TZID
  const value = rawDateStr.includes(':') ? rawDateStr.split(':').pop() || '' : rawDateStr;
  const clean = value.trim();

  if (clean.length >= 8) {
    const year = clean.substring(0, 4);
    const month = clean.substring(4, 6);
    const day = clean.substring(6, 8);
    const date = `${year}-${month}-${day}`;

    let time: string | undefined;
    if (clean.includes('T')) {
      const timePart = clean.split('T')[1] ?? '';
      if (timePart.length >= 4) {
        const hour = timePart.substring(0, 2);
        const minute = timePart.substring(2, 4);
        time = `${hour}:${minute}`;
      }
    }

    return time !== undefined ? { date, time } : { date };
  }

  return { date: new Date().toISOString().split('T')[0] ?? '' };
}

/**
 * Parst den Inhalt einer .ics Datei und gibt extrahierte Termine zurück.
 */
export function parseIcsContent(icsData: string): ParsedIcsResult {
  const lines = unfoldIcsLines(icsData);
  const events: ParsedIcsEvent[] = [];
  const courseNameSet = new Set<string>();

  let inEvent = false;
  let currentEvent: Partial<ParsedIcsEvent> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true;
      currentEvent = {
        uid: Math.random().toString(36).substring(2, 9)
      };
      continue;
    }

    if (trimmed === 'END:VEVENT') {
      inEvent = false;
      if (currentEvent.summary && currentEvent.startDate) {
        events.push(currentEvent as ParsedIcsEvent);
        courseNameSet.add(currentEvent.summary.trim());
      }
      currentEvent = {};
      continue;
    }

    if (!inEvent) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const rawKey = trimmed.substring(0, colonIdx);
    const value = trimmed.substring(colonIdx + 1).replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, '\n');
    const key = (rawKey.split(';')[0] ?? '').toUpperCase();

    switch (key) {
      case 'UID':
        currentEvent.uid = value.trim();
        break;
      case 'SUMMARY':
        currentEvent.summary = value.trim();
        break;
      case 'LOCATION':
        currentEvent.location = value.trim();
        break;
      case 'DESCRIPTION':
        currentEvent.description = value.trim();
        break;
      case 'DTSTART': {
        const parsed = parseIcsDate(trimmed);
        currentEvent.startDate = parsed.date;
        if (parsed.time !== undefined) currentEvent.startTime = parsed.time;
        break;
      }
      case 'DTEND': {
        const parsed = parseIcsDate(trimmed);
        if (parsed.time !== undefined) currentEvent.endTime = parsed.time;
        break;
      }
      case 'RRULE':
        currentEvent.rrule = value.trim();
        break;
    }
  }

  return {
    events,
    courseNames: Array.from(courseNameSet).sort()
  };
}
