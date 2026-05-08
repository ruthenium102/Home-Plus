import { useEffect, useMemo, useState } from 'react';
import {
  X,
  ClipboardPaste,
  Globe,
  Sparkles,
  CheckSquare,
  Square,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { useToast } from '@/context/ToastContext';
import { Avatar } from './Avatar';
import {
  getAusPublicHolidays,
  getWASchoolTerms,
  type ImportableEvent
} from '@/lib/holidays';
import type { CalendarEvent } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Source = 'holidays' | 'paste' | 'ical';

export function ImportEventsModal({ open, onClose }: Props) {
  const { events, members, addEvent } = useFamily();
  const { show } = useToast();

  const [source, setSource] = useState<Source>('holidays');

  // ---- Aussie holidays state ----
  const [includeHolidays, setIncludeHolidays] = useState(true);
  const [includeSchool, setIncludeSchool] = useState(true);
  const [year, setYear] = useState<number>(new Date().getFullYear());

  // ---- Paste state ----
  const [pasteText, setPasteText] = useState('');
  const [pasteLoading, setPasteLoading] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteResults, setPasteResults] = useState<ImportableEvent[]>([]);

  // ---- iCal state ----
  const [icalUrl, setIcalUrl] = useState('');
  const [icalLoading, setIcalLoading] = useState(false);
  const [icalError, setIcalError] = useState<string | null>(null);
  const [icalResults, setIcalResults] = useState<ImportableEvent[]>([]);

  // ---- Selection state (which events to import) ----
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignToMembers, setAssignToMembers] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setSource('holidays');
    setSelectedIds(new Set());
    setAssignToMembers([]);
    setPasteText('');
    setPasteResults([]);
    setPasteError(null);
    setIcalUrl('');
    setIcalResults([]);
    setIcalError(null);
  }, [open]);

  // Compute the candidate list based on the selected source
  const candidates: ImportableEvent[] = useMemo(() => {
    if (source === 'holidays') {
      const list: ImportableEvent[] = [];
      if (includeHolidays) list.push(...getAusPublicHolidays(year));
      if (includeSchool) list.push(...getWASchoolTerms(year));
      return list.sort((a, b) => a.start_at.localeCompare(b.start_at));
    }
    if (source === 'paste') return pasteResults;
    if (source === 'ical') return icalResults;
    return [];
  }, [source, includeHolidays, includeSchool, year, pasteResults, icalResults]);

  // Auto-select all candidates when they change
  useEffect(() => {
    setSelectedIds(new Set(candidates.map((c) => c.source_id)));
  }, [candidates]);

  // Detect duplicates: an existing event with the same title + start date
  const existingKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const e of events) {
      keys.add(e.title.toLowerCase() + '|' + e.start_at.slice(0, 10));
    }
    return keys;
  }, [events]);

  const isDuplicate = (c: ImportableEvent) =>
    existingKeys.has(c.title.toLowerCase() + '|' + c.start_at.slice(0, 10));

  if (!open) return null;

  // ---- Handlers ----

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePasteAnalyse = async () => {
    if (!pasteText.trim()) return;
    setPasteLoading(true);
    setPasteError(null);
    try {
      const events = await extractEventsFromText(pasteText);
      setPasteResults(events);
      if (events.length === 0) {
        setPasteError("Couldn't find any clear events in that text. Try a different paste.");
      }
    } catch (err: any) {
      setPasteError(err?.message || 'Something went wrong analysing the text.');
    } finally {
      setPasteLoading(false);
    }
  };

  const handleIcalFetch = async () => {
    if (!icalUrl.trim()) return;
    setIcalLoading(true);
    setIcalError(null);
    try {
      const events = await fetchAndParseICal(icalUrl.trim());
      setIcalResults(events);
      if (events.length === 0) {
        setIcalError('No events found in that feed (or the feed is empty).');
      }
    } catch (err: any) {
      setIcalError(err?.message || 'Could not load that calendar feed.');
    } finally {
      setIcalLoading(false);
    }
  };

  const handleImport = () => {
    let added = 0;
    for (const c of candidates) {
      if (!selectedIds.has(c.source_id)) continue;
      if (isDuplicate(c)) continue;
      addEvent({
        title: c.title,
        description: c.description,
        start_at: c.start_at,
        end_at: c.end_at,
        all_day: c.all_day,
        location: c.location,
        category: c.category,
        member_ids: assignToMembers,
        recurrence: null,
        reminder_offsets: [],
        created_by: null
      });
      added++;
    }
    show({ message: `${added} event${added === 1 ? '' : 's'} imported.` });
    onClose();
  };

  const selectedCount = candidates.filter(
    (c) => selectedIds.has(c.source_id) && !isDuplicate(c)
  ).length;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-display text-xl text-text">Import events</h2>
            <div className="text-xs text-text-faint">
              From a paste, an iCal feed, or Australian public holidays
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-md hover:bg-surface-2 flex items-center justify-center text-text-muted"
          >
            <X size={18} />
          </button>
        </div>

        {/* Source picker */}
        <div className="px-4 pt-3 pb-2 border-b border-border shrink-0">
          <div className="grid grid-cols-3 gap-2">
            <SourceTile
              active={source === 'holidays'}
              onClick={() => setSource('holidays')}
              icon={Sparkles}
              label="WA holidays"
              hint="Public + school"
            />
            <SourceTile
              active={source === 'paste'}
              onClick={() => setSource('paste')}
              icon={ClipboardPaste}
              label="Paste text"
              hint="AI extracts dates"
            />
            <SourceTile
              active={source === 'ical'}
              onClick={() => setSource('ical')}
              icon={Globe}
              label="iCal URL"
              hint="One-time import"
            />
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {source === 'holidays' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeHolidays}
                    onChange={(e) => setIncludeHolidays(e.target.checked)}
                    className="accent-accent w-4 h-4"
                  />
                  <span className="text-sm text-text">WA public holidays</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSchool}
                    onChange={(e) => setIncludeSchool(e.target.checked)}
                    className="accent-accent w-4 h-4"
                  />
                  <span className="text-sm text-text">WA school terms</span>
                </label>
                <select
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value, 10))}
                  className="ml-auto px-2 py-1 bg-surface-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
                >
                  <option value={2026}>2026</option>
                  <option value={2027}>2027</option>
                </select>
              </div>
              <div className="text-[11px] text-text-faint">
                Hardcoded list — works offline. We'll refresh annually.
              </div>
            </div>
          )}

          {source === 'paste' && (
            <div className="space-y-2">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste a school newsletter, an email about events, or any text containing dates and event names..."
                rows={5}
                className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent resize-none font-mono"
              />
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] text-text-faint">
                  AI will extract event titles + dates. No data is stored.
                </div>
                <button
                  onClick={handlePasteAnalyse}
                  disabled={!pasteText.trim() || pasteLoading}
                  className="px-3 py-1.5 bg-accent text-white text-sm font-medium rounded-md hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
                >
                  {pasteLoading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Analysing…
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} /> Extract events
                    </>
                  )}
                </button>
              </div>
              {pasteError && (
                <div className="flex gap-2 p-2 bg-accent-soft/40 rounded-md text-xs text-accent">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{pasteError}</span>
                </div>
              )}
            </div>
          )}

          {source === 'ical' && (
            <div className="space-y-2">
              <input
                type="url"
                value={icalUrl}
                onChange={(e) => setIcalUrl(e.target.value)}
                placeholder="https://your-school.wa.edu.au/calendar.ics"
                className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
              />
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] text-text-faint">
                  Most schools/sports clubs publish a calendar feed (.ics file).
                </div>
                <button
                  onClick={handleIcalFetch}
                  disabled={!icalUrl.trim() || icalLoading}
                  className="px-3 py-1.5 bg-accent text-white text-sm font-medium rounded-md hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
                >
                  {icalLoading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Loading…
                    </>
                  ) : (
                    <>Fetch</>
                  )}
                </button>
              </div>
              {icalError && (
                <div className="flex gap-2 p-2 bg-accent-soft/40 rounded-md text-xs text-accent">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{icalError}</span>
                </div>
              )}
              <div className="text-[11px] text-text-faint">
                Note: some calendar feeds block cross-origin requests. If yours fails,
                paste the URL contents into the Paste tab instead.
              </div>
            </div>
          )}

          {/* Candidates list */}
          {candidates.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs uppercase tracking-wider text-text-faint">
                  {candidates.length} found · {selectedCount} will import
                </div>
                <button
                  onClick={() => {
                    if (selectedIds.size === candidates.length) {
                      setSelectedIds(new Set());
                    } else {
                      setSelectedIds(new Set(candidates.map((c) => c.source_id)));
                    }
                  }}
                  className="text-xs text-accent hover:underline"
                >
                  {selectedIds.size === candidates.length ? 'Select none' : 'Select all'}
                </button>
              </div>
              <div className="border border-border rounded-md divide-y divide-border max-h-72 overflow-y-auto">
                {candidates.map((c) => {
                  const dup = isDuplicate(c);
                  const checked = selectedIds.has(c.source_id);
                  return (
                    <button
                      key={c.source_id}
                      onClick={() => !dup && toggleSelected(c.source_id)}
                      disabled={dup}
                      className={
                        'w-full flex items-center gap-2.5 p-2.5 text-left transition-colors ' +
                        (dup
                          ? 'opacity-40 cursor-not-allowed'
                          : 'hover:bg-surface-2/60')
                      }
                    >
                      {checked && !dup ? (
                        <CheckSquare size={16} className="text-accent shrink-0" />
                      ) : (
                        <Square size={16} className="text-text-faint shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-text truncate">{c.title}</div>
                        <div className="text-[11px] text-text-faint">
                          {new Date(c.start_at).toLocaleDateString(undefined, {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                          {dup && ' · already in calendar'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Member assignment for chosen events */}
          {candidates.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-text-faint mb-2">
                Assign to (optional)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => {
                  const selected = assignToMembers.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() =>
                        setAssignToMembers((prev) =>
                          prev.includes(m.id)
                            ? prev.filter((x) => x !== m.id)
                            : [...prev, m.id]
                        )
                      }
                      className={
                        'flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 rounded-full border text-xs transition-colors ' +
                        (selected
                          ? 'bg-surface-2 border-accent'
                          : 'border-border opacity-60 hover:opacity-100')
                      }
                    >
                      <Avatar member={m} size={20} />
                      {m.name}
                    </button>
                  );
                })}
              </div>
              <div className="text-[10px] text-text-faint mt-1">
                Empty = visible to whole family.
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-4 border-t border-border shrink-0 bg-surface">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-muted hover:text-text"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={selectedCount === 0}
            className="px-5 py-2 bg-accent text-white text-sm font-medium rounded-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Import {selectedCount > 0 ? `${selectedCount} ` : ''}event
            {selectedCount === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SourceTile({
  active,
  onClick,
  icon: Icon,
  label,
  hint
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Sparkles;
  label: string;
  hint: string;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'flex flex-col items-center gap-1 p-3 rounded-md border-2 transition-colors ' +
        (active
          ? 'border-accent bg-accent-soft'
          : 'border-border hover:border-border-strong')
      }
    >
      <Icon size={18} className={active ? 'text-accent' : 'text-text-muted'} />
      <span className="text-sm font-medium text-text">{label}</span>
      <span className="text-[10px] text-text-faint">{hint}</span>
    </button>
  );
}

// ============================================================================
// AI text extraction (paste source)
// ============================================================================

/**
 * Extract events from text. Tries the /api/extract-events serverless
 * function (Claude-powered) first; falls back to a simple regex extractor
 * if the API is unavailable (demo mode / no key configured).
 */
async function extractEventsFromText(text: string): Promise<ImportableEvent[]> {
  try {
    const res = await fetch('/api/extract-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.events) && data.events.length > 0) {
        return data.events as ImportableEvent[];
      }
      // Empty list from AI = also fall through to regex as a sanity check
    }
    // 501 (no key) or other error: fall through silently
  } catch {
    // Network error in demo mode — fall through
  }
  return regexExtractEvents(text);
}

function regexExtractEvents(text: string): ImportableEvent[] {
  // Look for lines like: "DD Month Year - Title" or "Title - DD Month"
  // This is intentionally simple; real AI extraction lives in the
  // /api/extract-events serverless function (added in next deploy).
  const events: ImportableEvent[] = [];
  const lines = text.split(/\n+/);
  const dateRegex =
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\w*\s*(\d{4})?\b/i;
  const monthMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11
  };
  const currentYear = new Date().getFullYear();

  for (const line of lines) {
    const m = line.match(dateRegex);
    if (!m) continue;
    const day = parseInt(m[1], 10);
    const month = monthMap[m[2].slice(0, 3).toLowerCase()];
    const year = m[3] ? parseInt(m[3], 10) : currentYear;
    if (isNaN(day) || month === undefined) continue;
    // Title = the line minus the date
    const title = line.replace(dateRegex, '').replace(/[-–—:|]+/g, ' ').trim();
    if (!title || title.length < 3) continue;
    const date = new Date(year, month, day);
    const iso = date.toISOString().slice(0, 10);
    events.push({
      source_id: 'paste-' + iso + '-' + title.slice(0, 20),
      title,
      start_at: iso + 'T00:00:00.000Z',
      end_at: iso + 'T23:59:00.000Z',
      all_day: true,
      description: 'Imported from text',
      location: null,
      category: 'general'
    });
  }
  return events;
}

// ============================================================================
// iCal fetch + parse
// ============================================================================

async function fetchAndParseICal(url: string): Promise<ImportableEvent[]> {
  let text: string;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    text = await res.text();
  } catch (err: any) {
    // Most likely CORS — surface a clear message
    throw new Error(
      "Couldn't fetch that URL directly. The site may block cross-origin requests. " +
        'Try downloading the .ics file and pasting its contents instead.'
    );
  }
  return parseICal(text);
}

/**
 * Minimal iCalendar parser — handles VEVENT blocks with SUMMARY, DTSTART,
 * DTEND, LOCATION, DESCRIPTION. Doesn't handle RRULE, VTIMEZONE, or
 * folded continuation lines beyond the basics. Sufficient for school feeds.
 */
function parseICal(text: string): ImportableEvent[] {
  // Unfold lines (RFC 5545: continuation lines start with whitespace)
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  const events: ImportableEvent[] = [];
  let current: Partial<ImportableEvent> | null = null;
  let allDay = false;

  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      current = {};
      allDay = false;
    } else if (line.startsWith('END:VEVENT') && current) {
      if (current.title && current.start_at) {
        if (!current.end_at) current.end_at = current.start_at;
        events.push({
          source_id:
            'ical-' + (current.start_at || '').slice(0, 10) + '-' + (current.title || '').slice(0, 20),
          title: current.title,
          start_at: current.start_at,
          end_at: current.end_at,
          all_day: allDay,
          description: current.description || null,
          location: current.location || null,
          category: 'general'
        });
      }
      current = null;
    } else if (current) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx);
      const value = line.slice(colonIdx + 1);
      const baseKey = key.split(';')[0];
      switch (baseKey) {
        case 'SUMMARY':
          current.title = unescapeIcal(value);
          break;
        case 'DTSTART':
          current.start_at = parseIcalDate(value);
          if (key.includes('VALUE=DATE')) allDay = true;
          break;
        case 'DTEND':
          current.end_at = parseIcalDate(value);
          break;
        case 'DESCRIPTION':
          current.description = unescapeIcal(value);
          break;
        case 'LOCATION':
          current.location = unescapeIcal(value);
          break;
      }
    }
  }
  return events;
}

function unescapeIcal(s: string): string {
  return s
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseIcalDate(value: string): string {
  // 20260225 or 20260225T143000Z or 20260225T143000
  if (/^\d{8}$/.test(value)) {
    return value.slice(0, 4) + '-' + value.slice(4, 6) + '-' + value.slice(6, 8) + 'T00:00:00.000Z';
  }
  if (/^\d{8}T\d{6}Z?$/.test(value)) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    const hh = value.slice(9, 11);
    const mm = value.slice(11, 13);
    const ss = value.slice(13, 15);
    return `${y}-${m}-${d}T${hh}:${mm}:${ss}.000Z`;
  }
  // Fallback — return today
  return new Date().toISOString();
}

// Suppress "unused" warning for CalendarEvent type (used for typing the addEvent call)
type _Used = CalendarEvent;
