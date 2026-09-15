import React, { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';

/**
 * DateInputDMY
 * Formats dates explicitly as Day / Month / Year (DD/MM/YYYY).
 * First thing the user types is Day, then Month, then Year.
 * Internally produces standard ISO (YYYY-MM-DD) for 100% database compatibility.
 */
export default function DateInputDMY({
  label,
  value = '',
  onChange,
  required = false,
  placeholder = 'يوم / شهر / سنة (DD/MM/YYYY)',
  disabled = false,
  min,
  max,
  className = '',
  style = {},
  hint
}) {
  const hiddenPickerRef = useRef(null);
  const [displayValue, setDisplayValue] = useState('');
  const [isValid, setIsValid] = useState(true);

  // Convert ISO (YYYY-MM-DD) to Display (DD/MM/YYYY)
  const isoToDisplay = (isoStr) => {
    if (!isoStr || typeof isoStr !== 'string') return '';
    const parts = isoStr.split(/[-/]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        const [y, m, d] = parts;
        return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
      } else if (parts[2].length === 4) {
        // Already DD/MM/YYYY
        return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
      }
    }
    return isoStr;
  };

  // Convert Display (DD/MM/YYYY) to ISO (YYYY-MM-DD)
  const displayToIso = (dmyStr) => {
    if (!dmyStr) return '';
    const digits = dmyStr
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .replace(/\D/g, '')
      .slice(0, 8);

    if (digits.length === 8) {
      const day = parseInt(digits.slice(0, 2), 10);
      const month = parseInt(digits.slice(2, 4), 10);
      const year = parseInt(digits.slice(4, 8), 10);

      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    return '';
  };

  // Keep displayValue in sync with incoming value
  useEffect(() => {
    if (value) {
      const formatted = isoToDisplay(value);
      setDisplayValue(formatted);
      setIsValid(true);
    } else {
      setDisplayValue('');
      setIsValid(true);
    }
  }, [value]);

  // Handle typing with auto-slashing
  const handleTextChange = (e) => {
    const rawVal = e.target.value;
    const isDeleting = displayValue && displayValue.length > rawVal.length;

    let digits = rawVal
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .replace(/\D/g, '')
      .slice(0, 8);

    let formatted = '';
    if (digits.length === 0) {
      formatted = '';
    } else if (digits.length < 2) {
      formatted = digits;
    } else if (digits.length === 2) {
      formatted = isDeleting ? digits : digits + '/';
    } else if (digits.length < 4) {
      formatted = digits.slice(0, 2) + '/' + digits.slice(2);
    } else if (digits.length === 4) {
      formatted = isDeleting ? digits.slice(0, 2) + '/' + digits.slice(2) : digits.slice(0, 2) + '/' + digits.slice(2) + '/';
    } else {
      formatted = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
    }

    setDisplayValue(formatted);

    // If completely cleared
    if (digits.length === 0) {
      setIsValid(true);
      if (onChange) onChange({ target: { value: '' } });
      return;
    }

    // If fully typed (8 digits)
    if (digits.length === 8) {
      const iso = displayToIso(formatted);
      if (iso) {
        setIsValid(true);
        if (onChange) onChange({ target: { value: iso } });
      } else {
        setIsValid(false);
      }
    } else {
      // Incomplete typing, keep existing valid or notify
      setIsValid(true);
    }
  };

  // Handle picker selection from calendar popup
  const handleCalendarPickerChange = (e) => {
    const pickedIso = e.target.value;
    if (pickedIso) {
      const dmy = isoToDisplay(pickedIso);
      setDisplayValue(dmy);
      setIsValid(true);
      if (onChange) onChange({ target: { value: pickedIso } });
    }
  };

  const handleOpenCalendar = () => {
    if (disabled) return;
    if (hiddenPickerRef.current) {
      try {
        if (typeof hiddenPickerRef.current.showPicker === 'function') {
          hiddenPickerRef.current.showPicker();
        } else {
          hiddenPickerRef.current.click();
        }
      } catch (err) {
        hiddenPickerRef.current.click();
      }
    }
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className}`} style={style}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label className="dark-label" style={{ fontWeight: 700, fontSize: 12.5, color: '#cbd5e1' }}>
            {label}
          </label>
          <span style={{ fontSize: 10.5, color: '#38bdf8', fontWeight: 700, direction: 'ltr' }}>
            [يوم / شهر / سنة]
          </span>
        </div>
      )}

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleTextChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          dir="ltr"
          style={{
            width: '100%',
            height: 42,
            background: 'var(--bg-input, #0a162b)',
            border: isValid ? '1px solid var(--border, rgba(255,255,255,0.15))' : '1.5px solid #ef4444',
            borderRadius: 10,
            padding: '8px 42px 8px 12px',
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '1px',
            textAlign: 'center',
            outline: 'none',
            boxShadow: isValid ? 'none' : '0 0 10px rgba(239,68,68,0.3)',
            transition: 'all 0.2s'
          }}
        />

        {/* Calendar Trigger Button */}
        <button
          type="button"
          onClick={handleOpenCalendar}
          disabled={disabled}
          title="اختيار من التقويم"
          style={{
            position: 'absolute',
            right: 6,
            width: 32,
            height: 32,
            background: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: disabled ? 'not-allowed' : 'pointer',
            color: '#38bdf8',
            transition: 'all 0.2s'
          }}
        >
          <CalendarIcon size={16} />
        </button>

        {/* Hidden Native Date Input for the graphical calendar */}
        <input
          ref={hiddenPickerRef}
          type="date"
          value={value || ''}
          onChange={handleCalendarPickerChange}
          min={min}
          max={max}
          tabIndex={-1}
          style={{
            position: 'absolute',
            opacity: 0,
            pointerEvents: 'none',
            width: 0,
            height: 0,
            border: 'none',
            padding: 0
          }}
        />
      </div>

      {!isValid && (
        <span style={{ fontSize: 11, color: '#f87171', marginTop: 2, display: 'block' }}>
          ⚠️ يرجى التأكد من كتابة التاريخ بشكل صحيح: يوم (01-31) / شهر (01-12) / سنة (مثال: 15/08/2004)
        </span>
      )}

      {hint && isValid && (
        <span style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2, display: 'block' }}>
          {hint}
        </span>
      )}
    </div>
  );
}
