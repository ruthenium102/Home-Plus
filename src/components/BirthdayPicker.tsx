import { useEffect, useState } from 'react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function BirthdayPicker({ value, onChange }: Props) {
  const parsed = value ? value.split('-') : ['', '', ''];
  const [year, setYear] = useState(parsed[0] || '');
  const [month, setMonth] = useState(parsed[1] || '');
  const [day, setDay] = useState(parsed[2] || '');

  useEffect(() => {
    if (value) {
      const [y, m, d] = value.split('-');
      setYear(y || ''); setMonth(m || ''); setDay(d || '');
    } else {
      setYear(''); setMonth(''); setDay('');
    }
  }, [value]);

  const update = (y: string, m: string, d: string) => {
    if (y && m && d) onChange(`${y}-${m}-${d}`);
    else if (!y && !m && !d) onChange('');
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => String(currentYear - i));
  const daysInMonth = month && year ? new Date(Number(year), Number(month), 0).getDate() : 31;
  const days = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'));

  const selectClass = 'flex-1 px-2 py-2 bg-surface-2 border border-border rounded-md text-text text-sm focus:outline-none focus:border-accent';

  return (
    <div className="flex gap-2">
      <select value={day} onChange={(e) => { setDay(e.target.value); update(year, month, e.target.value); }} className={selectClass}>
        <option value="">Day</option>
        {days.map((d) => <option key={d} value={d}>{Number(d)}</option>)}
      </select>
      <select value={month} onChange={(e) => { setMonth(e.target.value); update(year, e.target.value, day); }} className={selectClass}>
        <option value="">Month</option>
        {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
      </select>
      <select value={year} onChange={(e) => { setYear(e.target.value); update(e.target.value, month, day); }} className={selectClass}>
        <option value="">Year</option>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}
