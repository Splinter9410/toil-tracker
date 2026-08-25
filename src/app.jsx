import React, { createContext, useContext, useReducer, useState, useRef, useEffect } from "react";
import {
  LayoutDashboard,
  Clock,
  CalendarClock,
  CheckSquare,
  Users,
  Settings,
  Building2,
  RotateCcw,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  History,
  Send,
  Pencil,
  Undo2,
  Plus,
  Trash2,
  GitBranch,
  Tags,
  CalendarDays,
  Clock4,
  ListChecks,
  UserPlus,
  AlertTriangle,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/* =========================================================================
   SEED DATA — canonical source of truth (Prompt 1: Foundation)
   Every later stage extends this module. Do not restructure lightly.
   ========================================================================= */

const ROLE = {
  EMPLOYEE: "employee",
  REPORTING_OFFICER: "reportingOfficer",
  SYSTEM_ADMINISTRATOR: "systemAdministrator",
};

// Status lifecycle (Prompt 4), shared by overtime entries and time-off
// requests:
//   Draft -> Pending Approval -> Approved
//                             -> Rejected
//                             -> Changes Requested -> (resubmit) -> Pending Approval
//        -> Withdrawn (employee, only while Pending Approval)
// Prompt 8b adds a new terminal status, CANCELLED, reachable only through
// an administrator override (e.g. cancelling an already-Approved time-off
// request) — never through the normal employee/officer workflow.
const STATUS = {
  DRAFT: "Draft",
  PENDING: "Pending Approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CHANGES_REQUESTED: "Changes Requested",
  WITHDRAWN: "Withdrawn",
  CANCELLED: "Cancelled",
};

const AUDIT_ACTION = {
  SAVED_DRAFT: "Saved as Draft",
  UPDATED_DRAFT: "Updated Draft",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CHANGES_REQUESTED: "Changes Requested",
  RESUBMITTED: "Resubmitted",
  WITHDRAWN: "Withdrawn",
  DELEGATION_CREATED: "Delegation Created",
  DELEGATION_REVOKED: "Delegation Revoked",
  DELEGATION_MODIFIED: "Delegation Modified",
  FORCE_APPROVED: "Force-Approved (Administrator Override)",
  FORCE_REJECTED: "Force-Rejected (Administrator Override)",
  CANCELLED: "Cancelled (Administrator Override)",
  BALANCE_ADJUSTED: "Balance Adjusted",
};

// Prompt 11: delegation eligibility is now dynamic, not a fixed pair.
// Any Reporting Officer with direct reports can designate a covering
// officer from among those direct reports — except Amelia, since the
// self-approval-escalation rule has no valid target above the top of the
// department.
function canDesignateCoveringOfficer(person, people) {
  if (!person || person.id === "amelia") return false;
  if (!hasRole(person, ROLE.REPORTING_OFFICER)) return false;
  return getDirectReports(people, person.id).some((p) => p.active !== false);
}

const WORKING_SCHEDULE = { start: "08:30", end: "18:00" };

// `actingAsApproverFor` is a placeholder field for a future delegation
// feature (temporary approval authority). It is always null in this stage.
// `openingBalanceMinutes` is the TOIL balance HR set when the tracker
// launched, independent of any in-app overtime submissions. Only eligible
// employees carry a nonzero value.
// `designatedCoveringOfficerId` (Prompt 11) is a standing "who would cover
// for me" setting held by Reporting Officers with direct reports — separate
// from whether a delegation is currently active. Seeded with the original
// defaults (Benjamin -> Grace, Chloe -> Daniel) so nothing changes unless
// someone deliberately changes it. Not applicable to Amelia (top of the
// department, no valid escalation target above her) or to people without
// direct reports.
// `active` (Prompt 13) — everyone starts active. Deactivated people keep
// all their historical data and still appear in analytics/hierarchy, but
// disappear from operational pickers (reports-to, covering-officer
// candidacy) and lose the ability to submit new overtime/time-off.
const INITIAL_PEOPLE = [
  { id: "amelia", name: "Amelia Tan", jobTitle: "Department Manager", reportsTo: null, systemRoles: [ROLE.REPORTING_OFFICER], eligible: false, schedule: WORKING_SCHEDULE, actingAsApproverFor: null, openingBalanceMinutes: 0, designatedCoveringOfficerId: null, active: true },
  { id: "benjamin", name: "Benjamin Lee", jobTitle: "Supervisor", reportsTo: "amelia", systemRoles: [ROLE.EMPLOYEE, ROLE.REPORTING_OFFICER], eligible: true, schedule: WORKING_SCHEDULE, actingAsApproverFor: null, openingBalanceMinutes: 660, designatedCoveringOfficerId: "grace", active: true },
  { id: "chloe", name: "Chloe Lim", jobTitle: "Supervisor", reportsTo: "amelia", systemRoles: [ROLE.EMPLOYEE, ROLE.REPORTING_OFFICER], eligible: true, schedule: WORKING_SCHEDULE, actingAsApproverFor: null, openingBalanceMinutes: 540, designatedCoveringOfficerId: "daniel", active: true },
  { id: "grace", name: "Grace Koh", jobTitle: "Executive", reportsTo: "benjamin", systemRoles: [ROLE.EMPLOYEE], eligible: true, schedule: WORKING_SCHEDULE, actingAsApproverFor: null, openingBalanceMinutes: 480, designatedCoveringOfficerId: null, active: true },
  { id: "harish", name: "Harish Nair", jobTitle: "Executive", reportsTo: "benjamin", systemRoles: [ROLE.EMPLOYEE], eligible: true, schedule: WORKING_SCHEDULE, actingAsApproverFor: null, openingBalanceMinutes: 600, designatedCoveringOfficerId: null, active: true },
  { id: "isabelle", name: "Isabelle Wong", jobTitle: "Executive", reportsTo: "benjamin", systemRoles: [ROLE.EMPLOYEE], eligible: true, schedule: WORKING_SCHEDULE, actingAsApproverFor: null, openingBalanceMinutes: 300, designatedCoveringOfficerId: null, active: true },
  { id: "daniel", name: "Daniel Goh", jobTitle: "Executive", reportsTo: "chloe", systemRoles: [ROLE.EMPLOYEE], eligible: true, schedule: WORKING_SCHEDULE, actingAsApproverFor: null, openingBalanceMinutes: 900, designatedCoveringOfficerId: null, active: true },
  { id: "evelyn", name: "Evelyn Ng", jobTitle: "Executive", reportsTo: "chloe", systemRoles: [ROLE.EMPLOYEE], eligible: true, schedule: WORKING_SCHEDULE, actingAsApproverFor: null, openingBalanceMinutes: 420, designatedCoveringOfficerId: null, active: true },
  { id: "farid", name: "Farid Rahman", jobTitle: "Executive", reportsTo: "chloe", systemRoles: [ROLE.EMPLOYEE], eligible: true, schedule: WORKING_SCHEDULE, actingAsApproverFor: null, openingBalanceMinutes: 240, designatedCoveringOfficerId: null, active: true },
  { id: "jason", name: "Jason Teo", jobTitle: "HR Officer", reportsTo: "amelia", systemRoles: [ROLE.SYSTEM_ADMINISTRATOR], eligible: false, schedule: WORKING_SCHEDULE, actingAsApproverFor: null, openingBalanceMinutes: 0, designatedCoveringOfficerId: null, active: true },
];

const WORK_CODES = [
  { code: "RP01", label: "Repair", active: true },
  { code: "MT02", label: "Maintenance", active: true },
  { code: "IN03", label: "Inspection", active: true },
  { code: "ER04", label: "Emergency Response", active: true },
  { code: "PJ05", label: "Project Work", active: true },
  { code: "ES06", label: "Event Support", active: true },
  { code: "TR07", label: "Training Support", active: true },
  { code: "AD08", label: "Administration", active: true },
  { code: "OP09", label: "Operational Support", active: true },
  { code: "OT10", label: "Others", active: true },
];

const PUBLIC_HOLIDAYS = [
  { id: "ho-001", date: "2026-01-01", name: "New Year's Day" },
  { id: "ho-002", date: "2026-02-17", name: "Chinese New Year" },
  { id: "ho-003", date: "2026-05-01", name: "Labour Day" },
  { id: "ho-004", date: "2026-08-09", name: "National Day" },
  { id: "ho-005", date: "2026-12-25", name: "Christmas Day" },
];

// Named policy constants — later stages must reference these, not literals.
const POLICY = {
  OFFICE_START: "08:30",
  OFFICE_END: "18:00",
  LUNCH_START: "12:00",
  LUNCH_END: "13:00",
  LUNCH_IS_FLEXIBLE: false,
  TOIL_CONVERSION_RATIO: 1, // 1 hour overtime : 1 hour TOIL
  TIME_GRANULARITY_MINUTES: 15,
  MAX_SINGLE_ENTRY_HOURS: 24, // an entry must represent strictly under this
  balanceAlertThresholdHours: 50, // admin-configurable; decimals allowed (e.g. 42.5)
};

const DEFAULT_USER_ID = "benjamin";

/* =========================================================================
   DATE / TIME UTILITIES
   Shared by the date & time pickers and the overtime calculation engine.
   No date library is used — plain Date arithmetic only.
   ========================================================================= */

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LABELS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_LABELS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function pad2(n) {
  return String(n).padStart(2, "0");
}
function formatISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseISODate(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function isSameDate(a, b) {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDaysISO(dateISO, days) {
  const d = parseISODate(dateISO);
  d.setDate(d.getDate() + days);
  return formatISODate(d);
}
function timeStringToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function formatDurationMinutes(totalMinutes) {
  const safe = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}h ${pad2(m)}m`;
}

// CORRECTION (date-display fix): single shared formatter for showing a date
// with its day of week, e.g. "Sat, 16 Aug 2026". Used everywhere a date
// appears outside the date picker itself (which already shows the weekday
// next to the calendar button and is left as-is).
function formatDateWithWeekday(dateISO) {
  if (!dateISO) return "—";
  const d = parseISODate(dateISO);
  const weekday = WEEKDAY_LABELS[d.getDay()];
  const month = MONTH_LABELS[d.getMonth()].slice(0, 3);
  return `${weekday}, ${d.getDate()} ${month} ${d.getFullYear()}`;
}

// Same idea for full timestamps (audit trail entries), which carry a time
// as well as a date.
function formatDateTimeWithWeekday(isoDateTimeString) {
  if (!isoDateTimeString) return "—";
  const d = new Date(isoDateTimeString);
  const weekday = WEEKDAY_LABELS[d.getDay()];
  const month = MONTH_LABELS[d.getMonth()].slice(0, 3);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${weekday}, ${d.getDate()} ${month} ${d.getFullYear()}, ${time}`;
}

// CORRECTION (date-display fix): explicit weekend/public-holiday context
// for overtime entries specifically, so a reviewer doesn't have to check a
// calendar to know why full duration was credited.
function getDayTypeInfo(dateISO, holidays) {
  if (!dateISO) return null;
  const d = parseISODate(dateISO);
  const day = d.getDay();
  const holiday = holidays.find((h) => h.date === dateISO);
  if (holiday) return { type: "holiday", label: "Public Holiday — full duration counted" };
  if (day === 0 || day === 6) return { type: "weekend", label: "Weekend — full duration counted" };
  return null;
}

function to24Hour(h12, m, meridiem) {
  let h = h12 % 12;
  if (meridiem === "PM") h += 12;
  return `${pad2(h)}:${pad2(m)}`;
}
function from24Hour(value24) {
  if (!value24) return null;
  const [hh, mm] = value24.split(":").map(Number);
  const meridiem = hh >= 12 ? "PM" : "AM";
  let h12 = hh % 12;
  if (h12 === 0) h12 = 12;
  return { h12, m: mm, meridiem };
}
function formatTimeLabel(h12, m) {
  return `${h12}:${pad2(m)}`;
}

const TIME_OPTIONS = [];
for (let h = 1; h <= 12; h++) {
  for (let m = 0; m < 60; m += 15) {
    TIME_OPTIONS.push({ h, m });
  }
}

const BREAK_OPTIONS = Array.from({ length: 17 }, (_, i) => i * 15); // 0–240 min, 15-min steps

// Inclusive list of ISO dates from startISO to endISO. Used to repeat a
// daily start/end time pattern across a multi-day entry.
function getDateRangeArray(startISO, endISO) {
  const dates = [];
  let cur = parseISODate(startISO);
  const end = parseISODate(endISO);
  let guard = 0;
  while (cur <= end && guard < 400) {
    dates.push(formatISODate(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
    guard += 1;
  }
  return dates;
}

// Does calendar day `dateISO` fall within a record's date span? Falls back
// to single-day comparison for records with no endDate (delegations, or
// any legacy shape), so this is safe to use everywhere.
function isDateWithinEntry(dateISO, entry) {
  if (!entry || !entry.date) return false;
  const end = entry.endDate || entry.date;
  return dateISO >= entry.date && dateISO <= end;
}

// Display helper: a single date for one-day entries, a "start – end" range
// for multi-day ones.
function formatEntryDateRange(entry) {
  const start = entry.date;
  const end = entry.endDate || entry.date;
  if (start === end) return formatDateWithWeekday(start);
  return `${formatDateWithWeekday(start)} – ${formatDateWithWeekday(end)}`;
}

/* =========================================================================
   OVERTIME CALCULATION ENGINE
   Implements the exact rule from the spec: split the worked interval into
   per-calendar-day segments, exclude normal office hours on weekdays,
   count weekend/holiday segments in full, then subtract any break.
   This is the single source of truth — the form and the seed data both
   call into it, so they can never drift apart.

   Generalized to a date range: the same daily start/end time (and, if
   "Ends Next Day" is on, the same overnight crossing) repeats once for
   every calendar day from startDateISO to endDateISO inclusive. A
   single-day entry (startDateISO === endDateISO) is just a range of one
   day, so existing behavior is unchanged.
   ========================================================================= */

function isWeekendOrHoliday(dateISO, holidays) {
  const d = parseISODate(dateISO);
  const day = d.getDay();
  if (day === 0 || day === 6) return true;
  return holidays.some((h) => h.date === dateISO);
}

function segmentOvertimeMinutes(dateISO, segStart, segEnd, holidays, policy) {
  if (segEnd <= segStart) return 0;
  if (isWeekendOrHoliday(dateISO, holidays)) {
    return segEnd - segStart;
  }
  const officeStart = timeStringToMinutes(policy.OFFICE_START);
  const officeEnd = timeStringToMinutes(policy.OFFICE_END);
  const overlap = Math.max(0, Math.min(segEnd, officeEnd) - Math.max(segStart, officeStart));
  return (segEnd - segStart) - overlap;
}

function computeOvertimeResult({ startDateISO, endDateISO, startTime, endTime, endsNextDay, breakMinutes, holidays, policy }) {
  if (!startDateISO || !endDateISO || !startTime || !endTime) {
    return { valid: false, error: null };
  }

  if (endDateISO < startDateISO) {
    return { valid: false, error: "End date must be on or after the start date." };
  }

  const startMin = timeStringToMinutes(startTime);
  const endMin = timeStringToMinutes(endTime);

  if (!endsNextDay && endMin <= startMin) {
    return {
      valid: false,
      error: 'End time must be after start time. Turn on "Ends Next Day" if each day\'s shift crosses midnight.',
    };
  }

  const effectiveBreak = breakMinutes || 0;
  const dayOccurrences = getDateRangeArray(startDateISO, endDateISO);

  let totalElapsedMinutes = 0;
  let rawOvertimeMinutes = 0;
  let earnedMinutes = 0;
  const segments = [];

  for (const dayISO of dayOccurrences) {
    let dayElapsed;
    let daySegments;
    if (!endsNextDay) {
      dayElapsed = endMin - startMin;
      daySegments = [{ dateISO: dayISO, start: startMin, end: endMin }];
    } else {
      dayElapsed = (1440 - startMin) + endMin;
      daySegments = [
        { dateISO: dayISO, start: startMin, end: 1440 },
        { dateISO: addDaysISO(dayISO, 1), start: 0, end: endMin },
      ];
    }

    if (endsNextDay && dayElapsed >= policy.MAX_SINGLE_ENTRY_HOURS * 60) {
      return {
        valid: false,
        error: `Each day's shift must be under ${policy.MAX_SINGLE_ENTRY_HOURS} hours. Please adjust the times.`,
      };
    }
    if (effectiveBreak > dayElapsed) {
      return {
        valid: false,
        error: "Break duration cannot exceed each day's elapsed duration.",
      };
    }

    let dayRaw = 0;
    daySegments.forEach((seg) => {
      dayRaw += segmentOvertimeMinutes(seg.dateISO, seg.start, seg.end, holidays, policy);
    });

    totalElapsedMinutes += dayElapsed;
    rawOvertimeMinutes += dayRaw;
    earnedMinutes += Math.max(0, dayRaw - effectiveBreak);
    segments.push(...daySegments);
  }

  return {
    valid: true,
    error: null,
    totalElapsedMinutes,
    rawOvertimeMinutes,
    breakMinutes: effectiveBreak * dayOccurrences.length,
    earnedMinutes,
    segments,
    dayCount: dayOccurrences.length,
  };
}

/* =========================================================================
   TIME-OFF CALCULATION ENGINE (Prompt 14)
   Start Date and End Date must each be a working day. Any day strictly
   between them is automatically included: a full 8h30m if a weekday, zero
   (and non-blocking) if a weekend/holiday. With "All day" on, the Start
   and End days are also full 8h30m; with it off, the Start day runs from
   Start Time to office close and the End day runs from office open to End
   Time, each minus any lunch overlap. If Start Date equals End Date, this
   collapses to exactly the original single-day formula — no double
   counting, no special-casing beyond "the range is one day long."
   ========================================================================= */

function formatPolicyTime12h(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const meridiem = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${pad2(m)} ${meridiem}`;
}

// Short "Fri 21 Aug" style label for the day-by-day breakdown.
function formatShortDayLabel(dateISO) {
  const d = parseISODate(dateISO);
  return `${WEEKDAY_LABELS[d.getDay()]} ${d.getDate()} ${MONTH_LABELS[d.getMonth()].slice(0, 3)}`;
}

function computeTimeOffResult({ startDateISO, endDateISO, allDay, startTime, endTime, holidays, policy }) {
  if (!startDateISO || !endDateISO) {
    return { valid: false, error: null };
  }
  if (endDateISO < startDateISO) {
    return { valid: false, error: "End date must be on or after the start date." };
  }
  if (isWeekendOrHoliday(startDateISO, holidays)) {
    return { valid: false, error: "Start date must be a working day (not a weekend or public holiday)." };
  }
  if (isWeekendOrHoliday(endDateISO, holidays)) {
    return { valid: false, error: "End date must be a working day (not a weekend or public holiday)." };
  }

  const officeStart = timeStringToMinutes(policy.OFFICE_START);
  const officeEnd = timeStringToMinutes(policy.OFFICE_END);
  const lunchStart = timeStringToMinutes(policy.LUNCH_START);
  const lunchEnd = timeStringToMinutes(policy.LUNCH_END);
  const officeRangeLabel = `${formatPolicyTime12h(policy.OFFICE_START)}–${formatPolicyTime12h(policy.OFFICE_END)}`;
  const fullDayMinutes = (officeEnd - officeStart) - (lunchEnd - lunchStart);
  const sameDay = startDateISO === endDateISO;

  if (!allDay) {
    if (!startTime || !endTime) return { valid: false, error: null };
    const startMin = timeStringToMinutes(startTime);
    const endMin = timeStringToMinutes(endTime);
    if (startMin < officeStart || startMin > officeEnd) {
      return { valid: false, error: `Start time must be within normal office hours (${officeRangeLabel}).` };
    }
    if (endMin < officeStart || endMin > officeEnd) {
      return { valid: false, error: `End time must be within normal office hours (${officeRangeLabel}).` };
    }
    // Only compare start/end times against each other when they're the
    // same calendar day — comparing a Start Time to an End Time on a
    // different, later date is meaningless and was the reported bug.
    if (sameDay && endMin <= startMin) {
      return { valid: false, error: "End time must be after start time." };
    }
  }

  function lunchOverlapFor(segStart, segEnd) {
    return Math.max(0, Math.min(segEnd, lunchEnd) - Math.max(segStart, lunchStart));
  }

  const breakdown = [];
  let totalMinutes = 0;

  if (sameDay) {
    if (allDay) {
      totalMinutes = fullDayMinutes;
      breakdown.push({ type: "day", label: formatShortDayLabel(startDateISO), detail: `Full day (${officeRangeLabel})`, minutes: totalMinutes });
    } else {
      const startMin = timeStringToMinutes(startTime);
      const endMin = timeStringToMinutes(endTime);
      totalMinutes = (endMin - startMin) - lunchOverlapFor(startMin, endMin);
      breakdown.push({
        type: "day",
        label: formatShortDayLabel(startDateISO),
        detail: `${formatPolicyTime12h(startTime)} – ${formatPolicyTime12h(endTime)}`,
        minutes: totalMinutes,
      });
    }
    return { valid: true, error: null, calculatedMinutes: totalMinutes, breakdown };
  }

  // Start day
  let startDayMinutes;
  let startDetail;
  if (allDay) {
    startDayMinutes = fullDayMinutes;
    startDetail = `Full day (${officeRangeLabel})`;
  } else {
    const startMin = timeStringToMinutes(startTime);
    startDayMinutes = (officeEnd - startMin) - lunchOverlapFor(startMin, officeEnd);
    startDetail = `${formatPolicyTime12h(startTime)} – ${formatPolicyTime12h(policy.OFFICE_END)}`;
  }
  breakdown.push({ type: "day", label: formatShortDayLabel(startDateISO), detail: startDetail, minutes: startDayMinutes });
  totalMinutes += startDayMinutes;

  // Days strictly between Start Date and End Date
  const middleStart = addDaysISO(startDateISO, 1);
  const middleEnd = addDaysISO(endDateISO, -1);
  if (middleStart <= middleEnd) {
    const middleDays = getDateRangeArray(middleStart, middleEnd);
    let i = 0;
    while (i < middleDays.length) {
      const isSkip = isWeekendOrHoliday(middleDays[i], holidays);
      let j = i;
      while (j + 1 < middleDays.length && isWeekendOrHoliday(middleDays[j + 1], holidays) === isSkip) j++;
      const blockDays = middleDays.slice(i, j + 1);
      if (isSkip) {
        const allHoliday = blockDays.every((d) => holidays.some((h) => h.date === d));
        breakdown.push({
          type: "skipped",
          label: blockDays.map((d) => formatShortDayLabel(d)).join(", "),
          reason: allHoliday ? "public holiday" : "weekend",
        });
      } else {
        const count = blockDays.length;
        const blockMinutes = fullDayMinutes * count;
        const label = count === 1 ? formatShortDayLabel(blockDays[0]) : `${formatShortDayLabel(blockDays[0])} – ${formatShortDayLabel(blockDays[blockDays.length - 1])}`;
        const detail = count === 1 ? `Full day (${officeRangeLabel})` : `${count} full days × ${formatDurationMinutes(fullDayMinutes)}`;
        breakdown.push({ type: "block", label, detail, minutes: blockMinutes });
        totalMinutes += blockMinutes;
      }
      i = j + 1;
    }
  }

  // End day
  let endDayMinutes;
  let endDetail;
  if (allDay) {
    endDayMinutes = fullDayMinutes;
    endDetail = `Full day (${officeRangeLabel})`;
  } else {
    const endMin = timeStringToMinutes(endTime);
    endDayMinutes = (endMin - officeStart) - lunchOverlapFor(officeStart, endMin);
    endDetail = `${formatPolicyTime12h(policy.OFFICE_START)} – ${formatPolicyTime12h(endTime)}`;
  }
  breakdown.push({ type: "day", label: formatShortDayLabel(endDateISO), detail: endDetail, minutes: endDayMinutes });
  totalMinutes += endDayMinutes;

  return { valid: true, error: null, calculatedMinutes: totalMinutes, breakdown };
}

function getReservedMinutes(timeOffRequests, employeeId, excludeId) {
  return timeOffRequests
    .filter((r) => r.employeeId === employeeId && r.status === STATUS.PENDING && r.id !== excludeId)
    .reduce((sum, r) => sum + r.calculatedMinutes, 0);
}

// Two requests conflict if their date ranges intersect at all. With
// boundary days now able to carry different times (or no times, under
// "All day"), a single-day flow no longer applies uniformly across a
// range, so range intersection alone is the meaningful conflict check.
function hasOverlappingPendingRequest(timeOffRequests, employeeId, startDateISO, endDateISO, excludeId) {
  return timeOffRequests.some((r) => {
    if (excludeId && r.id === excludeId) return false;
    if (r.employeeId !== employeeId) return false;
    if (r.status !== STATUS.PENDING) return false;
    const rEnd = r.endDate || r.date;
    return startDateISO <= rEnd && r.date <= endDateISO;
  });
}

/* =========================================================================
   BALANCE ENGINE (Prompt 4)
   Every figure here is derived live from current record statuses rather
   than stored as a running counter — approving, rejecting, or withdrawing
   something automatically corrects these everywhere, with nothing to
   forget to update separately.
   ========================================================================= */

function sumMinutes(records, predicate) {
  return records.filter(predicate).reduce((sum, r) => sum + (r.calculatedMinutes || 0), 0);
}

function getApprovedBalanceMinutes(person, overtimeEntries, timeOffRequests, balanceAdjustments) {
  const approvedOvertime = sumMinutes(
    overtimeEntries,
    (e) => e.employeeId === person.id && e.status === STATUS.APPROVED
  );
  const approvedTimeOff = sumMinutes(
    timeOffRequests,
    (r) => r.employeeId === person.id && r.status === STATUS.APPROVED
  );
  const adjustments = (balanceAdjustments || [])
    .filter((a) => a.employeeId === person.id)
    .reduce((sum, a) => sum + a.amountMinutes, 0);
  return (person.openingBalanceMinutes || 0) + approvedOvertime - approvedTimeOff + adjustments;
}

function getAvailableToRequestMinutes(person, overtimeEntries, timeOffRequests, balanceAdjustments) {
  const approved = getApprovedBalanceMinutes(person, overtimeEntries, timeOffRequests, balanceAdjustments);
  const reserved = getReservedMinutes(timeOffRequests, person.id);
  return approved - reserved;
}

// Accumulation alert: flags anyone whose banked TOIL balance has reached
// the department-wide threshold (Administration > Schedule). This is
// informational only — it does not block further overtime submission or
// approval.
function isOverToilBalanceCap(person, overtimeEntries, timeOffRequests, balanceAdjustments, policy) {
  if (!policy || !policy.balanceAlertThresholdHours || policy.balanceAlertThresholdHours <= 0) return false;
  const approved = getApprovedBalanceMinutes(person, overtimeEntries, timeOffRequests, balanceAdjustments);
  return approved >= policy.balanceAlertThresholdHours * 60;
}

function getUsedThisYearMinutes(person, timeOffRequests, referenceDate) {
  const year = (referenceDate || new Date()).getFullYear();
  return sumMinutes(
    timeOffRequests,
    (r) => r.employeeId === person.id && r.status === STATUS.APPROVED && parseISODate(r.date).getFullYear() === year
  );
}

function getLatestAuditComment(record) {
  if (!record || !record.auditHistory) return null;
  for (let i = record.auditHistory.length - 1; i >= 0; i--) {
    if (record.auditHistory[i].comment) return record.auditHistory[i];
  }
  return null;
}

function appendAudit(record, action, actor, comment) {
  const event = {
    action,
    byId: actor.id,
    byName: actor.name,
    at: new Date().toISOString(),
    comment: comment || null,
  };
  return { ...record, auditHistory: [...(record.auditHistory || []), event] };
}

function isOvertimeEntryComplete(e, holidays, policy) {
  if (!(e.date && e.location && e.location.trim() && e.startTime && e.endTime && e.workCode && e.reasonForWork && e.reasonForWork.trim())) {
    return false;
  }
  const r = computeOvertimeResult({
    startDateISO: e.date,
    endDateISO: e.endDate || e.date,
    startTime: e.startTime,
    endTime: e.endTime,
    endsNextDay: e.endsNextDay,
    breakMinutes: e.breakMinutes,
    holidays,
    policy,
  });
  return r.valid;
}

function isTimeOffRequestComplete(r, holidays, policy) {
  if (!r.date) return false;
  if (!r.allDay && !(r.startTime && r.endTime)) return false;
  const result = computeTimeOffResult({
    startDateISO: r.date,
    endDateISO: r.endDate || r.date,
    allDay: r.allDay,
    startTime: r.startTime,
    endTime: r.endTime,
    holidays,
    policy,
  });
  return result.valid;
}

/* =========================================================================
   DELEGATION ENGINE (Prompt 5; generalized in Prompt 11)
   The covering officer for any delegation is whoever the delegator has
   designated (person.designatedCoveringOfficerId — an assignable setting
   among their own direct reports, checked via canDesignateCoveringOfficer
   above), not a fixed pair. "Active" is always computed from today's date
   and the revoked flag — never stored as a status — so a delegation
   naturally lapses once its end date passes, with nothing to separately
   expire.
   ========================================================================= */

function isDelegationActive(delegation, todayISO) {
  return !delegation.revoked && delegation.startDate <= todayISO && todayISO <= delegation.endDate;
}

function getActiveDelegationForDelegator(delegations, delegatorId, todayISO) {
  return delegations.find((d) => d.delegatorId === delegatorId && isDelegationActive(d, todayISO)) || null;
}

function getActiveDelegationForDelegate(delegations, delegateId, todayISO) {
  return delegations.find((d) => d.delegateId === delegateId && isDelegationActive(d, todayISO)) || null;
}

// The core rule: who should act on this employee's pending item right now.
//  1. Start from their normal reporting officer.
//  2. If that officer has an active delegation:
//     - the covering officer's OWN item escalates to the officer's own
//       reporting officer (no self-approval, no approving your own manager's
//       delegate seat).
//     - everyone else's item routes to the covering officer instead.
//  3. No active delegation -> unchanged from the previous stage.
function getEffectiveApproverId(employeeId, people, delegations, todayISO) {
  const person = getPersonById(people, employeeId);
  if (!person || !person.reportsTo) return null;
  const reportingOfficerId = person.reportsTo;
  const delegation = getActiveDelegationForDelegator(delegations, reportingOfficerId, todayISO);
  if (!delegation) return reportingOfficerId;
  if (employeeId === delegation.delegateId) {
    const reportingOfficer = getPersonById(people, reportingOfficerId);
    return reportingOfficer ? reportingOfficer.reportsTo : null;
  }
  return delegation.delegateId;
}

// Makes the covering context explicit in the audit trail, e.g. "Grace Koh
// (covering for Benjamin Lee)" rather than just "Grace Koh".
function getAuditActorDisplayName(actingOfficer, record, people, delegations, todayISO) {
  const employee = getPersonById(people, record.employeeId);
  if (!employee || !employee.reportsTo) return actingOfficer.name;
  const normalOfficerId = employee.reportsTo;
  if (normalOfficerId === actingOfficer.id) return actingOfficer.name;
  const delegation = getActiveDelegationForDelegator(delegations, normalOfficerId, todayISO);
  if (delegation && delegation.delegateId === actingOfficer.id) {
    const normalOfficer = getPersonById(people, normalOfficerId);
    return `${actingOfficer.name} (covering for ${normalOfficer ? normalOfficer.name : ""})`;
  }
  return actingOfficer.name;
}

// Counts everything currently routed to this officer's Approvals queue
// (same effective-approver rule the Approvals page itself uses), for the
// Prompt 6 dashboard tile.
// Human-readable lifecycle status for a delegation, used by the admin
// delegation controls (Prompt 8b) to show past/active/future at a glance.
function computeDelegationStatus(delegation, todayISO) {
  if (delegation.revoked) return "Revoked";
  if (todayISO < delegation.startDate) return "Scheduled";
  if (todayISO > delegation.endDate) return "Expired";
  return "Active";
}

function getPendingApprovalQueueCount(officerId, state, todayISO) {
  const overtimeCount = state.overtimeEntries.filter(
    (e) => e.status === STATUS.PENDING && getEffectiveApproverId(e.employeeId, state.people, state.delegations, todayISO) === officerId
  ).length;
  const timeOffCount = state.timeOffRequests.filter(
    (r) => r.status === STATUS.PENDING && getEffectiveApproverId(r.employeeId, state.people, state.delegations, todayISO) === officerId
  ).length;
  return overtimeCount + timeOffCount;
}

// Correction prompt: removing the Reporting Officer role is blocked while
// any of these are true, so approval routing and delegation can never be
// left pointing at someone who's no longer equipped to handle them.
// Returns a list of human-readable reasons (empty = safe to remove).
function getReportingOfficerRemovalBlockers(person, state, todayISO) {
  const blockers = [];
  const directReports = getDirectReports(state.people, person.id);
  if (directReports.length > 0) {
    blockers.push(
      `still has ${directReports.length} direct report${directReports.length === 1 ? "" : "s"} (${directReports
        .map((p) => p.name)
        .join(", ")})`
    );
  }
  const pendingCount = getPendingApprovalQueueCount(person.id, state, todayISO);
  if (pendingCount > 0) {
    blockers.push(`has ${pendingCount} pending approval${pendingCount === 1 ? "" : "s"} awaiting action`);
  }
  if (getActiveDelegationForDelegator(state.delegations, person.id, todayISO)) {
    blockers.push("has an active delegation as the delegator");
  }
  if (getActiveDelegationForDelegate(state.delegations, person.id, todayISO)) {
    blockers.push("is currently covering another officer's approvals as an active delegate");
  }
  return blockers;
}

// Removing System Administrator is blocked if this person is the only one
// who currently holds it — that would lock everyone out of Administration.
function isSoleSystemAdministrator(person, people) {
  if (!hasRole(person, ROLE.SYSTEM_ADMINISTRATOR)) return false;
  if (person.active === false) return false; // already inactive, not relevant to lockout
  return people.filter((p) => p.active !== false && hasRole(p, ROLE.SYSTEM_ADMINISTRATOR)).length <= 1;
}

// Prompt 13: deactivation is blocked while any of these are true, so a
// person can never be deactivated with something still live that depends
// on them — no auto-withdraw, no auto-revoke, just a clear list of what to
// resolve first using tools HR already has.
function getDeactivationBlockers(person, state, todayISO) {
  const blockers = [];

  const queueCount = getPendingApprovalQueueCount(person.id, state, todayISO);
  if (queueCount > 0) {
    blockers.push(`${queueCount} pending approval${queueCount === 1 ? "" : "s"} awaiting their action`);
  }

  const ownPendingCount =
    state.overtimeEntries.filter(
      (e) => e.employeeId === person.id && (e.status === STATUS.PENDING || e.status === STATUS.CHANGES_REQUESTED)
    ).length +
    state.timeOffRequests.filter(
      (r) => r.employeeId === person.id && (r.status === STATUS.PENDING || r.status === STATUS.CHANGES_REQUESTED)
    ).length;
  if (ownPendingCount > 0) {
    blockers.push(`${ownPendingCount} of their own submission${ownPendingCount === 1 ? "" : "s"} still Pending or Changes Requested`);
  }

  const asDelegator = getActiveDelegationForDelegator(state.delegations, person.id, todayISO);
  const asDelegate = getActiveDelegationForDelegate(state.delegations, person.id, todayISO);
  if (asDelegator && asDelegate) {
    blockers.push("an active delegation (both as the delegating officer and as a covering officer)");
  } else if (asDelegator) {
    blockers.push("an active delegation as the delegating officer");
  } else if (asDelegate) {
    blockers.push("an active delegation as the covering officer");
  }

  const directReports = getDirectReports(state.people, person.id);
  if (directReports.length > 0 && !person.reportsTo) {
    blockers.push(
      `${directReports.length} direct report${directReports.length === 1 ? "" : "s"} with no reporting officer above them to reassign to`
    );
  }

  if (isSoleSystemAdministrator(person, state.people)) {
    blockers.push("the only active System Administrator");
  }

  return blockers;
}

function formatDeactivationBlockMessage(person, blockers) {
  return `${person.name} has ${blockers.join(", ")}. Resolve these first — you already have the tools to approve/reject requests and revoke delegations from the Administration and Approvals areas.`;
}

/* =========================================================================
   HIERARCHY / ROLE HELPERS
   ========================================================================= */

function getPersonById(people, id) {
  return people.find((p) => p.id === id) || null;
}

function getDirectReports(people, id) {
  return people.filter((p) => p.reportsTo === id);
}

function getAllReportIds(people, id) {
  const direct = getDirectReports(people, id);
  return direct.reduce(
    (acc, p) => acc.concat(p.id, getAllReportIds(people, p.id)),
    []
  );
}

function hasRole(person, role) {
  return !!person && person.systemRoles.includes(role);
}

// Would assigning personId to report to newManagerId create a circular
// reporting line? True if newManagerId is personId themselves, or if
// newManagerId is (directly or indirectly) already a report of personId.
function wouldCreateReportingCycle(people, personId, newManagerId) {
  let current = getPersonById(people, newManagerId);
  const seen = new Set();
  while (current) {
    if (current.id === personId) return true;
    if (seen.has(current.id)) return false; // guard against any pre-existing corrupt cycle
    seen.add(current.id);
    current = current.reportsTo ? getPersonById(people, current.reportsTo) : null;
  }
  return false;
}

/* =========================================================================
   TEAM DASHBOARD HELPERS (Prompt 7a)
   Two distinct scopes, named to match the spec exactly so they're never
   conflated: `getDirectReports` (already existed, used for approval
   routing) vs. `getAllReportsUnderScope` (direct + indirect, filtered to
   eligible people only, used for this dashboard's statistics). For
   Benjamin/Chloe these two are identical; for Amelia they differ.
   ========================================================================= */

function getAllReportsUnderScope(people, officerId) {
  return getAllReportIds(people, officerId)
    .map((id) => getPersonById(people, id))
    .filter((p) => p && p.eligible);
}

function getScopePendingCount(scopeIds, state) {
  const overtimeCount = state.overtimeEntries.filter(
    (e) => scopeIds.includes(e.employeeId) && e.status === STATUS.PENDING
  ).length;
  const timeOffCount = state.timeOffRequests.filter(
    (r) => scopeIds.includes(r.employeeId) && r.status === STATUS.PENDING
  ).length;
  return overtimeCount + timeOffCount;
}

function getStatusBreakdown(scopeIds, state) {
  const counts = {
    [STATUS.PENDING]: 0,
    [STATUS.APPROVED]: 0,
    [STATUS.REJECTED]: 0,
    [STATUS.CHANGES_REQUESTED]: 0,
    [STATUS.WITHDRAWN]: 0,
    [STATUS.CANCELLED]: 0,
  };
  [...state.overtimeEntries, ...state.timeOffRequests].forEach((r) => {
    if (scopeIds.includes(r.employeeId) && Object.prototype.hasOwnProperty.call(counts, r.status)) {
      counts[r.status] += 1;
    }
  });
  return counts;
}

// When a record most recently entered its current Pending state (initial
// submission, or resubmission after Changes Requested) — used to measure
// how long it's been waiting.
function getPendingSinceTimestamp(record) {
  const history = record.auditHistory || [];
  for (let i = history.length - 1; i >= 0; i--) {
    const action = history[i].action;
    if (action === AUDIT_ACTION.SUBMITTED || action === AUDIT_ACTION.RESUBMITTED) {
      return history[i].at;
    }
  }
  return record.submittedAt || null;
}

function getOldestPendingItem(scopeIds, state) {
  const items = [
    ...state.overtimeEntries
      .filter((e) => scopeIds.includes(e.employeeId) && e.status === STATUS.PENDING)
      .map((record) => ({ kind: "overtime", record })),
    ...state.timeOffRequests
      .filter((r) => scopeIds.includes(r.employeeId) && r.status === STATUS.PENDING)
      .map((record) => ({ kind: "timeoff", record })),
  ];
  let oldest = null;
  items.forEach((item) => {
    const since = getPendingSinceTimestamp(item.record);
    if (!since) return;
    if (!oldest || since < oldest.since) {
      oldest = { ...item, since };
    }
  });
  return oldest;
}

function formatWaitingDuration(isoString) {
  if (!isoString) return "—";
  const diffMs = Math.max(0, Date.now() - new Date(isoString).getTime());
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays >= 1) return `${diffDays} day${diffDays === 1 ? "" : "s"}`;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours >= 1) return `${diffHours} hour${diffHours === 1 ? "" : "s"}`;
  const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"}`;
}

/* =========================================================================
   TEAM ANALYTICS HELPERS (Prompt 7b)
   Period filter math (Month/Quarter/Year/Custom), a color palette for the
   work-category donut, and the exact-format manpower date label.
   ========================================================================= */

// `anchor` is any real Date within the currently selected period. Month/
// Quarter/Year windows are derived from it; Custom uses explicit ISO dates.
function computePeriodRange(periodType, anchor, customStart, customEnd) {
  if (periodType === "custom") {
    return { start: customStart || null, end: customEnd || null };
  }
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  if (periodType === "month") {
    return { start: formatISODate(new Date(y, m, 1)), end: formatISODate(new Date(y, m + 1, 0)) };
  }
  if (periodType === "quarter") {
    const qStart = Math.floor(m / 3) * 3;
    return { start: formatISODate(new Date(y, qStart, 1)), end: formatISODate(new Date(y, qStart + 3, 0)) };
  }
  // year
  return { start: formatISODate(new Date(y, 0, 1)), end: formatISODate(new Date(y, 11, 31)) };
}

function getPeriodLabel(periodType, anchor) {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  if (periodType === "month") return `${MONTH_LABELS[m]} ${y}`;
  if (periodType === "quarter") return `Q${Math.floor(m / 3) + 1} ${y}`;
  if (periodType === "year") return `${y}`;
  return "Custom range";
}

function shiftPeriodAnchor(periodType, anchor, direction) {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  if (periodType === "month") return new Date(y, m + direction, 1);
  if (periodType === "quarter") return new Date(y, m + direction * 3, 1);
  if (periodType === "year") return new Date(y + direction, m, 1);
  return anchor;
}

function isDateInRange(dateISO, start, end) {
  if (!start || !end) return false;
  return dateISO >= start && dateISO <= end;
}

const CATEGORY_COLOR_PALETTE = [
  "#0891B2", "#7C3AED", "#D97706", "#DC2626", "#16A34A",
  "#DB2777", "#4F46E5", "#0D9488", "#CA8A04", "#64748B",
];

// Exact format required by the spec: "Thursday, 27 August" (no year).
function formatManpowerDateLabel(dateISO) {
  const d = parseISODate(dateISO);
  return `${WEEKDAY_LABELS_LONG[d.getDay()]}, ${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`;
}

// CORRECTION (merged team calendar/manpower view): weekends and seeded
// public holidays show a brief non-working-day note in place of the
// manpower breakdown, since attendance isn't expected on those days.
function getNonWorkingDayLabel(dateISO, holidays) {
  const d = parseISODate(dateISO);
  const day = d.getDay();
  const holiday = holidays.find((h) => h.date === dateISO);
  if (holiday) return `${holiday.name} — non-working day`;
  if (day === 0) return "Sunday — non-working day";
  if (day === 6) return "Saturday — non-working day";
  return null;
}

/* =========================================================================
   NAVIGATION CONFIG
   ========================================================================= */

const NAV_ITEMS = [
  { key: "dashboard", label: "My Dashboard", icon: LayoutDashboard, visible: () => true },
  { key: "orgChart", label: "Org Chart", icon: Building2, visible: () => true },
  { key: "recordOvertime", label: "Record Overtime", icon: Clock, visible: (p) => p.eligible && p.active !== false },
  { key: "requestTimeOff", label: "Request Time Off", icon: CalendarClock, visible: (p) => p.eligible && p.active !== false },
  {
    key: "approvals",
    label: "Approvals",
    icon: CheckSquare,
    visible: (p, state, todayISO) =>
      hasRole(p, ROLE.REPORTING_OFFICER) || Boolean(getActiveDelegationForDelegate(state.delegations, p.id, todayISO)),
  },
  { key: "teamDashboard", label: "Team Dashboard", icon: Users, visible: (p) => hasRole(p, ROLE.REPORTING_OFFICER) },
  { key: "administration", label: "Administration", icon: Settings, visible: (p) => hasRole(p, ROLE.SYSTEM_ADMINISTRATOR) },
];

const ROLE_META = {
  [ROLE.EMPLOYEE]: { label: "Employee", className: "bg-blue-50 text-blue-700 border-blue-200" },
  [ROLE.REPORTING_OFFICER]: { label: "Reporting Officer", className: "bg-violet-50 text-violet-700 border-violet-200" },
  [ROLE.SYSTEM_ADMINISTRATOR]: { label: "System Administrator", className: "bg-amber-50 text-amber-800 border-amber-200" },
};

/* =========================================================================
   SEED DATA — overtime entries (Prompt 2, statuses adjusted in Prompt 4)
   Hours are computed through computeOvertimeResult so seed data can never
   drift from the calculation engine the form itself uses. Audit histories
   are constructed here too, so every seeded record starts with a realistic
   trail instead of an empty one.
   ========================================================================= */

const RAW_SEED_OVERTIME_ENTRIES = [
  { id: "ot-001", employeeId: "grace", date: "2026-08-10", startTime: "07:00", endTime: "09:00", endsNextDay: false, location: "Plant Control Room", workCode: "MT02", reasonForWork: "Routine equipment maintenance completed before shift start.", breakMinutes: 0, status: STATUS.APPROVED, officerId: "benjamin", officerComment: null },
  { id: "ot-002", employeeId: "evelyn", date: "2026-08-11", startTime: "17:00", endTime: "20:00", endsNextDay: false, location: "Site Office, Block C", workCode: "PJ05", reasonForWork: "Project work to meet a vendor integration deadline.", breakMinutes: 0, status: STATUS.PENDING, officerId: null, officerComment: null },
  { id: "ot-003", employeeId: "daniel", date: "2026-08-12", startTime: "22:30", endTime: "02:15", endsNextDay: true, location: "Network Operations Centre", workCode: "ER04", reasonForWork: "Emergency response to an overnight network outage.", breakMinutes: 0, status: STATUS.REJECTED, officerId: "chloe", officerComment: "Overnight vendor incidents should go through the on-call contract, not personal overtime. Please check with me before resubmitting." },
  { id: "ot-004", employeeId: "isabelle", date: "2026-08-13", startTime: "07:00", endTime: "19:00", endsNextDay: false, location: "Warehouse B", workCode: "AD08", reasonForWork: "Administrative catch-up ahead of month-end close.", breakMinutes: 30, status: STATUS.CHANGES_REQUESTED, officerId: "benjamin", officerComment: "Please name the specific reports or systems this covered — \"administrative catch-up\" is too generic for the audit log." },
  { id: "ot-005", employeeId: "harish", date: "2026-08-15", startTime: "09:00", endTime: "13:00", endsNextDay: false, location: "Substation Yard 2", workCode: "IN03", reasonForWork: "Weekend inspection round for a compliance audit.", breakMinutes: 0, status: STATUS.PENDING, officerId: null, officerComment: null },
  { id: "ot-006", employeeId: "farid", date: "2026-01-01", startTime: "09:00", endTime: "13:00", endsNextDay: false, location: "Community Event Grounds", workCode: "ES06", reasonForWork: "Event support coverage during the New Year's Day public holiday.", breakMinutes: 0, status: STATUS.PENDING, officerId: null, officerComment: null },
  { id: "ot-007", employeeId: "isabelle", date: "2026-08-17", endDate: "2026-08-19", startTime: "18:00", endTime: "20:00", endsNextDay: false, location: "Warehouse B", workCode: "PJ05", reasonForWork: "Multi-day stock count project running after hours all week.", breakMinutes: 0, status: STATUS.PENDING, officerId: null, officerComment: null },
];

const INITIAL_OVERTIME_ENTRIES = RAW_SEED_OVERTIME_ENTRIES.map((e) => {
  const result = computeOvertimeResult({
    startDateISO: e.date,
    endDateISO: e.endDate || e.date,
    startTime: e.startTime,
    endTime: e.endTime,
    endsNextDay: e.endsNextDay,
    breakMinutes: e.breakMinutes,
    holidays: PUBLIC_HOLIDAYS,
    policy: POLICY,
  });
  const workCodeMeta = WORK_CODES.find((w) => w.code === e.workCode);
  const employee = INITIAL_PEOPLE.find((p) => p.id === e.employeeId);
  const officer = e.officerId ? INITIAL_PEOPLE.find((p) => p.id === e.officerId) : null;

  const auditHistory = [
    { action: AUDIT_ACTION.SUBMITTED, byId: employee.id, byName: employee.name, at: `${e.date}T${e.startTime}:00`, comment: null },
  ];
  if (officer && e.status === STATUS.APPROVED) {
    auditHistory.push({ action: AUDIT_ACTION.APPROVED, byId: officer.id, byName: officer.name, at: `${addDaysISO(e.date, 1)}T09:00:00`, comment: null });
  } else if (officer && e.status === STATUS.REJECTED) {
    auditHistory.push({ action: AUDIT_ACTION.REJECTED, byId: officer.id, byName: officer.name, at: `${addDaysISO(e.date, 1)}T09:00:00`, comment: e.officerComment });
  } else if (officer && e.status === STATUS.CHANGES_REQUESTED) {
    auditHistory.push({ action: AUDIT_ACTION.CHANGES_REQUESTED, byId: officer.id, byName: officer.name, at: `${addDaysISO(e.date, 1)}T09:00:00`, comment: e.officerComment });
  }

  return {
    ...e,
    category: workCodeMeta ? workCodeMeta.label : "",
    calculatedMinutes: result.valid ? result.earnedMinutes : 0,
    submittedAt: `${e.date}T${e.startTime}:00`,
    auditHistory,
  };
});

/* =========================================================================
   SEED DATA — time-off requests (Prompt 3, statuses adjusted in Prompt 4)
   Hours are computed through computeTimeOffResult, same principle as the
   overtime seed data above. Consistent with the opening balances assigned
   to each person: e.g. Harish's 10h opening balance minus this 3h pending
   request leaves 7h available, exactly matching the spec's worked example.
   All three are left Pending so reporting officers have real queue items.
   ========================================================================= */

const RAW_SEED_TIME_OFF_REQUESTS = [
  { id: "to-001", employeeId: "harish", date: "2026-08-20", allDay: false, startTime: "09:00", endTime: "12:00", comments: "Personal appointment in the morning.", status: STATUS.PENDING, officerId: null, officerComment: null },
  { id: "to-002", employeeId: "daniel", date: "2026-08-19", allDay: false, startTime: "13:00", endTime: "16:00", comments: "", status: STATUS.PENDING, officerId: null, officerComment: null },
  { id: "to-003", employeeId: "evelyn", date: "2026-08-21", allDay: false, startTime: "10:00", endTime: "14:00", comments: "Half-day for a family event.", status: STATUS.PENDING, officerId: null, officerComment: null },
  { id: "to-004", employeeId: "farid", date: "2026-08-24", endDate: "2026-08-26", allDay: true, startTime: "08:30", endTime: "18:00", comments: "Multi-day trip — three working days off.", status: STATUS.PENDING, officerId: null, officerComment: null },
];

const INITIAL_TIME_OFF_REQUESTS = RAW_SEED_TIME_OFF_REQUESTS.map((r) => {
  const result = computeTimeOffResult({
    startDateISO: r.date,
    endDateISO: r.endDate || r.date,
    allDay: r.allDay,
    startTime: r.startTime,
    endTime: r.endTime,
    holidays: PUBLIC_HOLIDAYS,
    policy: POLICY,
  });
  const employee = INITIAL_PEOPLE.find((p) => p.id === r.employeeId);
  const auditHistory = [
    { action: AUDIT_ACTION.SUBMITTED, byId: employee.id, byName: employee.name, at: `${r.date}T${r.startTime}:00`, comment: null },
  ];
  return {
    ...r,
    calculatedMinutes: result.valid ? result.calculatedMinutes : 0,
    submittedAt: `${r.date}T${r.startTime}:00`,
    auditHistory,
  };
});

/* =========================================================================
   SEED DATA — delegations (Prompt 5)
   Chloe -> Daniel is seeded already active. The window is anchored to the
   real "today" at load time (rather than fixed calendar dates) so it's
   always active whenever the artifact is opened, not just on one date.
   ========================================================================= */

const INITIAL_DELEGATIONS = (() => {
  const todayAtLoadISO = formatISODate(new Date());
  const startDate = addDaysISO(todayAtLoadISO, -3);
  const endDate = addDaysISO(todayAtLoadISO, 7);
  return [
    {
      id: "del-001",
      delegatorId: "chloe",
      delegateId: "daniel",
      startDate,
      endDate,
      revoked: false,
      revokedById: null,
      revokedAt: null,
      auditHistory: [
        {
          action: AUDIT_ACTION.DELEGATION_CREATED,
          byId: "chloe",
          byName: "Chloe Lim",
          at: `${startDate}T09:00:00`,
          comment: null,
        },
      ],
    },
  ];
})();

/* =========================================================================
   CENTRAL STATE — React Context + useReducer
   ========================================================================= */

const AppStateContext = createContext(null);
const AppDispatchContext = createContext(null);

const initialState = {
  people: INITIAL_PEOPLE,
  currentUserId: DEFAULT_USER_ID,
  workCodes: WORK_CODES,
  holidays: PUBLIC_HOLIDAYS,
  policy: POLICY,
  overtimeEntries: INITIAL_OVERTIME_ENTRIES,
  timeOffRequests: INITIAL_TIME_OFF_REQUESTS,
  delegations: INITIAL_DELEGATIONS,
  balanceAdjustments: [],
};

function appReducer(state, action) {
  switch (action.type) {
    case "SET_CURRENT_USER":
      return { ...state, currentUserId: action.payload };
    case "ADD_OVERTIME_ENTRY":
      return { ...state, overtimeEntries: [action.payload, ...state.overtimeEntries] };
    case "UPDATE_OVERTIME_ENTRY":
      return {
        ...state,
        overtimeEntries: state.overtimeEntries.map((e) => (e.id === action.payload.id ? action.payload.entry : e)),
      };
    case "ADD_TIME_OFF_REQUEST":
      return { ...state, timeOffRequests: [action.payload, ...state.timeOffRequests] };
    case "UPDATE_TIME_OFF_REQUEST":
      return {
        ...state,
        timeOffRequests: state.timeOffRequests.map((r) => (r.id === action.payload.id ? action.payload.entry : r)),
      };
    case "ADD_DELEGATION":
      return { ...state, delegations: [action.payload, ...state.delegations] };
    case "UPDATE_DELEGATION":
      return {
        ...state,
        delegations: state.delegations.map((d) => (d.id === action.payload.id ? action.payload.entry : d)),
      };
    case "UPDATE_PERSON":
      return {
        ...state,
        people: state.people.map((p) => (p.id === action.payload.id ? { ...p, ...action.payload.updates } : p)),
      };
    case "ADD_PERSON":
      return { ...state, people: [...state.people, action.payload] };
    case "ADD_WORK_CODE":
      return { ...state, workCodes: [...state.workCodes, action.payload] };
    case "UPDATE_WORK_CODE":
      return {
        ...state,
        workCodes: state.workCodes.map((w) => (w.code === action.payload.code ? { ...w, ...action.payload.updates } : w)),
      };
    case "ADD_HOLIDAY":
      return { ...state, holidays: [...state.holidays, action.payload] };
    case "UPDATE_HOLIDAY":
      return {
        ...state,
        holidays: state.holidays.map((h) => (h.id === action.payload.id ? action.payload.updated : h)),
      };
    case "REMOVE_HOLIDAY":
      return { ...state, holidays: state.holidays.filter((h) => h.id !== action.payload.id) };
    case "UPDATE_POLICY":
      return { ...state, policy: { ...state.policy, ...action.payload } };
    case "ADD_BALANCE_ADJUSTMENT":
      return { ...state, balanceAdjustments: [action.payload, ...state.balanceAdjustments] };
    case "RESET_DEMO":
      return buildFreshSeedState();
    case "HYDRATE":
      return action.payload;
    default:
      return state;
  }
}

// Single source of truth for "what does a freshly-seeded app look like" —
// used by both the RESET_DEMO reducer case and the reset-with-storage flow
// (Prompt 10), so the two can never drift apart.
function buildFreshSeedState() {
  return {
    ...initialState,
    people: INITIAL_PEOPLE.map((p) => ({ ...p })),
    overtimeEntries: INITIAL_OVERTIME_ENTRIES.map((e) => ({ ...e, auditHistory: e.auditHistory.map((ev) => ({ ...ev })) })),
    timeOffRequests: INITIAL_TIME_OFF_REQUESTS.map((r) => ({ ...r, auditHistory: r.auditHistory.map((ev) => ({ ...ev })) })),
    delegations: INITIAL_DELEGATIONS.map((d) => ({ ...d, auditHistory: d.auditHistory.map((ev) => ({ ...ev })) })),
    workCodes: WORK_CODES.map((w) => ({ ...w })),
    holidays: PUBLIC_HOLIDAYS.map((h) => ({ ...h })),
    policy: { ...POLICY },
    balanceAdjustments: [],
  };
}

/* =========================================================================
   PERSISTENCE (Prompt 10)
   One namespaced key, personal (non-shared) storage — every component goes
   through these three functions rather than calling window.storage
   directly. Every function fails silently (returns null/false) since a
   storage problem must never surface as a user-facing error.
   ========================================================================= */

const STORAGE_KEY = "toil-tracker-demo-v1";

// Lightweight structural check — not full schema validation, just enough
// to refuse to hydrate from something obviously corrupted or from a wildly
// different shape, and fall back to seed data instead of crashing.
function isValidPersistedState(obj) {
  if (!obj || typeof obj !== "object") return false;
  const requiredArrayKeys = [
    "people", "overtimeEntries", "timeOffRequests", "delegations", "balanceAdjustments", "workCodes", "holidays",
  ];
  for (const key of requiredArrayKeys) {
    if (!Array.isArray(obj[key])) return false;
  }
  if (typeof obj.currentUserId !== "string") return false;
  if (!obj.policy || typeof obj.policy !== "object") return false;
  return true;
}

async function loadPersistedState() {
  try {
    if (!window.storage || typeof window.storage.get !== "function") return null;
    const result = await window.storage.get(STORAGE_KEY, false);
    if (!result || !result.value) return null;
    const parsed = JSON.parse(result.value);
    return isValidPersistedState(parsed) ? parsed : null;
  } catch (err) {
    // Missing key, storage unavailable, malformed JSON — all treated the
    // same way: no persisted state to hydrate from.
    return null;
  }
}

async function savePersistedState(state) {
  try {
    if (!window.storage || typeof window.storage.set !== "function") return false;
    await window.storage.set(STORAGE_KEY, JSON.stringify(state), false);
    return true;
  } catch (err) {
    return false;
  }
}

async function clearPersistedState() {
  try {
    if (!window.storage || typeof window.storage.delete !== "function") return false;
    await window.storage.delete(STORAGE_KEY, false);
    return true;
  } catch (err) {
    return false;
  }
}

const AppMetaContext = createContext({ storageAvailable: true, resetDemo: () => {} });

function useAppMeta() {
  return useContext(AppMetaContext);
}

function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  // Optimistic default: assume storage works until a save attempt proves
  // otherwise, so the preview-mode note doesn't flash on/off during normal
  // operation when a published copy's storage is genuinely fine.
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // Load on startup — attempt once, hydrate if valid, otherwise keep the
  // in-memory seed default. Saving is deliberately gated on this attempt
  // having finished (see the effect below), so a fresh load can never
  // overwrite genuinely persisted data with the default seed first.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadPersistedState();
      if (cancelled) return;
      if (loaded) {
        dispatch({ type: "HYDRATE", payload: loaded });
        setStorageAvailable(true);
      }
      setInitialLoadComplete(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save on change — one effect watching the whole top-level state, only
  // active once the initial load attempt has completed.
  useEffect(() => {
    if (!initialLoadComplete) return;
    let cancelled = false;
    (async () => {
      const ok = await savePersistedState(state);
      if (!cancelled) setStorageAvailable(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [state, initialLoadComplete]);

  // Reset Demo Data now also clears the stored copy and immediately writes
  // the fresh seed back, so a reload right after resetting can't pull the
  // pre-reset data back in.
  async function resetDemo() {
    dispatch({ type: "RESET_DEMO" });
    try {
      await clearPersistedState();
      const ok = await savePersistedState(buildFreshSeedState());
      setStorageAvailable(ok);
    } catch (err) {
      setStorageAvailable(false);
    }
  }

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        <AppMetaContext.Provider value={{ storageAvailable, resetDemo }}>{children}</AppMetaContext.Provider>
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

function useAppState() {
  return useContext(AppStateContext);
}

function useAppDispatch() {
  return useContext(AppDispatchContext);
}

/* =========================================================================
   REUSABLE TABLE PRIMITIVES
   (shadcn's Table is not supported in this environment — plain HTML + Tailwind)
   ========================================================================= */

function AppTable({ children }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}
function AppTableHead({ children }) {
  return <thead className="bg-slate-50 border-b border-slate-200">{children}</thead>;
}
function AppTableBody({ children }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}
function AppTableRow({ children, className = "", onClick }) {
  return (
    <tr onClick={onClick} className={`hover:bg-slate-50/70 transition-colors ${onClick ? "cursor-pointer" : ""} ${className}`}>
      {children}
    </tr>
  );
}
function AppTableHeaderCell({ children, className = "" }) {
  return (
    <th className={`text-left font-mono text-[11px] uppercase tracking-wider text-slate-500 px-4 py-2.5 ${className}`}>
      {children}
    </th>
  );
}
function AppTableCell({ children, className = "" }) {
  return <td className={`px-4 py-2.5 align-middle text-slate-700 ${className}`}>{children}</td>;
}

/* =========================================================================
   SHARED UI ATOMS
   ========================================================================= */

function RoleBadge({ role }) {
  const meta = ROLE_META[role];
  if (!meta) return null;
  return (
    <Badge variant="outline" className={`text-[11px] font-medium ${meta.className}`}>
      {meta.label}
    </Badge>
  );
}

function PageHeader({ eyebrow, title, description }) {
  return (
    <div className="mb-6">
      {eyebrow && (
        <div className="text-xs font-mono uppercase tracking-wider text-cyan-700 mb-1">
          {eyebrow}
        </div>
      )}
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      {description && <p className="text-sm text-slate-500 mt-1 max-w-2xl">{description}</p>}
    </div>
  );
}

function PlaceholderPage({ title, description, icon: Icon }) {
  return (
    <div>
      <PageHeader eyebrow="Coming soon" title={title} description={description} />
      <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50">
        <CardContent className="py-16 flex flex-col items-center text-center gap-3">
          {Icon && <Icon className="h-8 w-8 text-slate-300" />}
          <p className="text-sm text-slate-400 font-mono">
            This will be implemented in an upcoming stage.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

const STATUS_META = {
  [STATUS.DRAFT]: "bg-slate-100 text-slate-600 border-slate-200",
  [STATUS.PENDING]: "bg-amber-50 text-amber-700 border-amber-200",
  [STATUS.APPROVED]: "bg-emerald-50 text-emerald-700 border-emerald-200",
  [STATUS.REJECTED]: "bg-rose-50 text-rose-700 border-rose-200",
  [STATUS.CHANGES_REQUESTED]: "bg-orange-50 text-orange-700 border-orange-200",
  [STATUS.WITHDRAWN]: "bg-slate-100 text-slate-500 border-slate-200",
  [STATUS.CANCELLED]: "bg-slate-200 text-slate-600 border-slate-300",
};

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
        STATUS_META[status] || "bg-slate-100 text-slate-600 border-slate-200"
      }`}
    >
      {status}
    </span>
  );
}

// CORRECTION (date-display fix): shown next to overtime entries only, on
// weekend/holiday dates, so a reviewer can see at a glance why the full
// duration was credited instead of just the outside-office-hours portion.
function DayTypeBadge({ dateISO, holidays }) {
  const info = getDayTypeInfo(dateISO, holidays);
  if (!info) return null;
  const className =
    info.type === "holiday"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-indigo-50 text-indigo-700 border-indigo-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${className}`}>
      {info.label}
    </span>
  );
}

function AuditHistoryDialog({ record }) {
  const events = record.auditHistory || [];
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-slate-500">
          <History className="h-3.5 w-3.5" />
          History
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Audit History</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {events.length === 0 ? (
            <p className="text-sm text-slate-400">No history yet.</p>
          ) : (
            events.map((ev, i) => (
              <div key={i} className="border-l-2 border-slate-200 pl-3 py-0.5">
                <div className="text-sm font-medium text-slate-800">{ev.action}</div>
                <div className="text-xs text-slate-500 font-mono">
                  {ev.byName} · {formatDateTimeWithWeekday(ev.at)}
                </div>
                {ev.comment && (
                  <div className="text-xs text-slate-600 mt-1 italic">&ldquo;{ev.comment}&rdquo;</div>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CommentActionDialog({ triggerLabel, triggerVariant, title, description, onConfirm }) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");

  function handleOpenChange(next) {
    setOpen(next);
    if (!next) setComment("");
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant={triggerVariant || "outline"} size="sm">
          {triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment (required)"
          rows={3}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={!comment.trim()} onClick={() => onConfirm(comment.trim())}>
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Prompt 15: cosmetic only — clicking shows a brief "coming soon" note and
// generates nothing. No CSV logic exists behind this on purpose.
function ExportCsvButton({ className }) {
  const [showNote, setShowNote] = useState(false);

  useEffect(() => {
    if (!showNote) return;
    const t = setTimeout(() => setShowNote(false), 2500);
    return () => clearTimeout(t);
  }, [showNote]);

  return (
    <div className="relative inline-flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={`gap-1.5 ${className || ""}`}
        onClick={() => setShowNote(true)}
      >
        <Download className="h-3.5 w-3.5" />
        Export to CSV
      </Button>
      {showNote && (
        <span className="text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1 whitespace-nowrap">
          Export coming soon
        </span>
      )}
    </div>
  );
}

/* =========================================================================
   DATE & TIME PICKERS
   Standalone, reusable components — built here for Record Overtime and
   reused as-is by the Request Time Off stage. No external date library.
   ========================================================================= */

function useClickOutside(ref, onOutside) {
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onOutside();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onOutside]);
}

function DatePickerField({ label, valueISO, onChange, maxDateISO, minDateISO, disabledDates, required }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  useClickOutside(containerRef, () => setOpen(false));

  const selected = valueISO ? parseISODate(valueISO) : null;
  const maxDate = maxDateISO ? parseISODate(maxDateISO) : null;
  const minDate = minDateISO ? parseISODate(minDateISO) : null;
  const [viewDate, setViewDate] = useState(selected || minDate || maxDate || new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  function isDisabled(d) {
    if (!d) return true;
    if (maxDate && startOfDay(d) > startOfDay(maxDate)) return true;
    if (minDate && startOfDay(d) < startOfDay(minDate)) return true;
    if (disabledDates && disabledDates(d)) return true;
    return false;
  }

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <label className="text-sm font-medium text-slate-700">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-left hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <span className={selected ? "text-slate-900" : "text-slate-400"}>
            {selected ? `${formatISODate(selected)} · ${WEEKDAY_LABELS_LONG[selected.getDay()]}` : "Select a date"}
          </span>
          <CalendarIcon className="h-4 w-4 text-slate-400" />
        </button>

        {open && (
          <div className="absolute z-20 mt-1 w-72 rounded-lg border border-slate-200 bg-white shadow-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => setViewDate(new Date(year, month - 1, 1))}
                className="p-1 rounded hover:bg-slate-100"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-sm font-medium text-slate-800">
                {MONTH_LABELS[month]} {year}
              </div>
              <button
                type="button"
                onClick={() => setViewDate(new Date(year, month + 1, 1))}
                className="p-1 rounded hover:bg-slate-100"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAY_LABELS.map((w) => (
                <div key={w} className="text-center text-[10px] font-mono uppercase text-slate-400">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (!d) return <div key={i} />;
                const disabled = isDisabled(d);
                const isSelected = isSameDate(d, selected);
                return (
                  <button
                    type="button"
                    key={i}
                    disabled={disabled}
                    onClick={() => {
                      onChange(formatISODate(d));
                      setOpen(false);
                    }}
                    className={`h-8 w-8 rounded-md text-sm flex items-center justify-center transition-colors ${
                      disabled
                        ? "text-slate-300 cursor-not-allowed"
                        : isSelected
                        ? "bg-cyan-600 text-white font-medium"
                        : "text-slate-700 hover:bg-cyan-50"
                    }`}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TimePickerField({ label, value24, onChange, required }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  useClickOutside(containerRef, () => setOpen(false));
  const parsed = from24Hour(value24);

  function selectTime(h, m) {
    const meridiem = parsed ? parsed.meridiem : "AM";
    onChange(to24Hour(h, m, meridiem));
  }
  function selectMeridiem(mer) {
    if (!parsed) {
      onChange(to24Hour(9, 0, mer));
      return;
    }
    onChange(to24Hour(parsed.h12, parsed.m, mer));
  }

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <label className="text-sm font-medium text-slate-700">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-left hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <span className={parsed ? "text-slate-900 font-mono" : "text-slate-400"}>
            {parsed ? `${formatTimeLabel(parsed.h12, parsed.m)} ${parsed.meridiem}` : "Select a time"}
          </span>
          <Clock className="h-4 w-4 text-slate-400" />
        </button>

        {open && (
          <div className="absolute z-20 mt-1 w-52 rounded-lg border border-slate-200 bg-white shadow-lg p-2 flex gap-2">
            <div className="flex-1 max-h-56 overflow-y-auto pr-1">
              {TIME_OPTIONS.map(({ h, m }) => {
                const active = parsed && parsed.h12 === h && parsed.m === m;
                return (
                  <button
                    type="button"
                    key={`${h}-${m}`}
                    onClick={() => selectTime(h, m)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md text-sm font-mono transition-colors ${
                      active ? "bg-cyan-600 text-white" : "text-slate-700 hover:bg-cyan-50"
                    }`}
                  >
                    {formatTimeLabel(h, m)}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-1 w-14 shrink-0">
              {["AM", "PM"].map((mer) => (
                <button
                  type="button"
                  key={mer}
                  onClick={() => selectMeridiem(mer)}
                  className={`flex-1 rounded-md text-sm font-mono transition-colors ${
                    parsed && parsed.meridiem === mer
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {mer}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   LAYOUT — Sidebar + Top Bar
   ========================================================================= */

function getApprovalsNavLabel(person, state, todayISO) {
  if (hasRole(person, ROLE.REPORTING_OFFICER)) return "Approvals";
  const delegation = getActiveDelegationForDelegate(state.delegations, person.id, todayISO);
  if (delegation) {
    const delegator = getPersonById(state.people, delegation.delegatorId);
    return `Approvals — Covering for ${delegator ? delegator.name : ""}`;
  }
  return "Approvals";
}

function Sidebar({ currentPage, onNavigate }) {
  const state = useAppState();
  const person = getPersonById(state.people, state.currentUserId);
  const todayISO = formatISODate(new Date());
  const items = NAV_ITEMS.filter((item) => item.visible(person, state, todayISO));

  return (
    <aside className="flex w-60 flex-col bg-slate-900 text-slate-100 shrink-0">
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-md bg-cyan-600 flex items-center justify-center font-mono text-sm font-bold text-white">
            T
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">TOIL Tracker</div>
            <div className="text-[10px] text-slate-400 font-mono tracking-wide">DEPT-OPS · PROTOTYPE</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = currentPage === item.key;
          const label = item.key === "approvals" ? getApprovalsNavLabel(person, state, todayISO) : item.label;
          const pendingCount = item.key === "approvals" ? getPendingApprovalQueueCount(person.id, state, todayISO) : 0;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={`w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm text-left transition-colors ${
                active
                  ? "bg-cyan-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate flex-1">{label}</span>
              {pendingCount > 0 && (
                <span
                  className={`shrink-0 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[11px] font-semibold font-mono ${
                    active ? "bg-white/25 text-white" : "bg-amber-500 text-slate-900"
                  }`}
                  title={`${pendingCount} awaiting your approval`}
                >
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-slate-800 text-[10px] text-slate-500 font-mono">
        v0.1 · STAGE 1 OF N
      </div>
    </aside>
  );
}

function TopBar() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { storageAvailable, resetDemo } = useAppMeta();
  const person = getPersonById(state.people, state.currentUserId);

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
            Viewing as
          </div>
          {!storageAvailable && (
            <span className="text-[11px] text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
              Preview mode — changes won't be saved after you close this
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="font-semibold text-slate-900">{person.name}</span>
          <span className="text-slate-300">·</span>
          <span className="text-sm text-slate-500">{person.jobTitle}</span>
          <div className="flex gap-1.5 ml-1 flex-wrap">
            {person.systemRoles.map((r) => (
              <RoleBadge key={r} role={r} />
            ))}
            {person.eligible ? (
              <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                Overtime Eligible
              </span>
            ) : (
              <span className="text-[11px] text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
                Exempt from Overtime
              </span>
            )}
            {person.active === false && (
              <span className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5">
                Inactive
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Select
          value={state.currentUserId}
          onValueChange={(id) => dispatch({ type: "SET_CURRENT_USER", payload: id })}
        >
          <SelectTrigger className="w-[230px]">
            <SelectValue placeholder="Switch demo user" />
          </SelectTrigger>
          <SelectContent>
            {state.people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} — {p.jobTitle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Demo Data
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset demo data?</AlertDialogTitle>
              <AlertDialogDescription>
                This restores the department to its original seed data — including all
                overtime entries, time-off requests, statuses, audit histories, delegations,
                and opening balances — and switches back to the default demo user. This
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => resetDemo()}>
                Reset
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </header>
  );
}

/* =========================================================================
   PAGE: My Dashboard
   ========================================================================= */

function ManagementLanding({ person, onNavigate }) {
  const state = useAppState();
  const todayISO = formatISODate(new Date());

  let scopeText = "";
  if (person.id === "amelia") {
    const directOfficers = getDirectReports(state.people, "amelia").filter((p) =>
      hasRole(p, ROLE.REPORTING_OFFICER)
    );
    const names = directOfficers.map((p) => p.name).join(" and ");
    scopeText = `You approve requests from ${names}.`;
  } else if (person.id === "jason") {
    scopeText =
      "You manage system configuration for the department — reporting hierarchy, work codes, public holidays, and balances.";
  }

  const allReports = getAllReportIds(state.people, person.id);
  const pendingCount = person.id === "amelia" ? getPendingApprovalQueueCount("amelia", state, todayISO) : null;

  return (
    <div>
      <PageHeader
        eyebrow="My Dashboard"
        title={person.active === false ? `${person.name} — Inactive` : `Welcome, ${person.name.split(" ")[0]}`}
        description={person.jobTitle}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-slate-700">{scopeText}</p>
            {person.id === "amelia" && (
              <p className="text-xs text-slate-500 font-mono">
                VISIBILITY: {allReports.length} people across the department report up through
                your line.
              </p>
            )}
            <div className="flex gap-1.5 flex-wrap pt-1">
              {person.systemRoles.map((r) => (
                <RoleBadge key={r} role={r} />
              ))}
            </div>
          </CardContent>
        </Card>

        {person.id === "amelia" && (
          <Card
            onClick={() => onNavigate && onNavigate("approvals")}
            className="cursor-pointer hover:border-cyan-300 transition-colors"
          >
            <CardContent className="p-6">
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Pending Approvals
              </div>
              <div className="mt-2 text-3xl font-semibold font-mono text-cyan-700">{pendingCount}</div>
              <div className="mt-1 text-xs text-slate-500">awaiting you →</div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function DashboardStatTile({ label, value, sublabel, active, onClick }) {
  return (
    <Card
      onClick={onClick}
      className={`cursor-pointer transition-colors ${
        active ? "border-cyan-400 ring-1 ring-cyan-400 bg-cyan-50/40" : "hover:border-slate-300"
      }`}
    >
      <CardContent className="p-4">
        <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">{label}</div>
        <div className="mt-2 text-2xl font-semibold font-mono text-slate-900">{value}</div>
        {sublabel && <div className="mt-1 text-[11px] text-slate-400">{sublabel}</div>}
      </CardContent>
    </Card>
  );
}

function PersonalCalendar({ overtimeEntries, timeOffRequests, selectedDate, onSelectDate }) {
  const [viewDate, setViewDate] = useState(new Date());
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className="p-1 rounded hover:bg-slate-100"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-sm font-medium text-slate-800">
          {MONTH_LABELS[month]} {year}
        </div>
        <button
          type="button"
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="p-1 rounded hover:bg-slate-100"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="text-center text-[10px] font-mono uppercase text-slate-400">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const dateISO = formatISODate(d);
          const hasOvertime = overtimeEntries.some((e) => isDateWithinEntry(dateISO, e));
          const hasTimeOff = timeOffRequests.some((r) => isDateWithinEntry(dateISO, r));
          const isSelected = selectedDate === dateISO;
          return (
            <button
              type="button"
              key={i}
              onClick={() => onSelectDate(dateISO)}
              className={`relative h-9 w-9 rounded-md text-sm flex items-center justify-center transition-colors ${
                isSelected
                  ? "bg-cyan-600 text-white font-medium"
                  : hasOvertime || hasTimeOff
                  ? "text-slate-700 hover:bg-slate-100"
                  : "text-slate-400 hover:bg-slate-50"
              }`}
            >
              {d.getDate()}
              {(hasOvertime || hasTimeOff) && (
                <span className="absolute bottom-1 flex gap-0.5">
                  {hasOvertime && (
                    <span className={`h-1 w-1 rounded-full ${isSelected ? "bg-white" : "bg-cyan-500"}`} />
                  )}
                  {hasTimeOff && (
                    <span className={`h-1 w-1 rounded-full ${isSelected ? "bg-white" : "bg-violet-500"}`} />
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" /> Overtime
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> Time Off
        </span>
      </div>
    </div>
  );
}

const RECENT_ACTIVITY_STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: STATUS.DRAFT, label: "Draft" },
  { value: STATUS.PENDING, label: "Pending Approval" },
  { value: STATUS.CHANGES_REQUESTED, label: "Changes Requested" },
  { value: STATUS.APPROVED, label: "Approved" },
  { value: STATUS.REJECTED, label: "Rejected" },
  { value: STATUS.WITHDRAWN, label: "Withdrawn" },
  { value: STATUS.CANCELLED, label: "Cancelled" },
];

const TILE_FILTER_LABELS = {
  balance: "Balance-affecting items",
  pendingOvertime: "Pending Overtime",
  reserved: "Reserved for Requests",
  usedThisYear: "Used This Year",
};

function EligibleEmployeeDashboard({ person, onNavigate }) {
  const state = useAppState();
  const manager = person.reportsTo ? getPersonById(state.people, person.reportsTo) : null;
  const todayISO = formatISODate(new Date());
  const currentYear = new Date().getFullYear();

  const [tileFilter, setTileFilter] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);

  const myOvertime = state.overtimeEntries.filter((e) => e.employeeId === person.id);
  const myTimeOff = state.timeOffRequests.filter((r) => r.employeeId === person.id);

  const feedItems = [
    ...myOvertime.map((record) => ({ kind: "overtime", record })),
    ...myTimeOff.map((record) => ({ kind: "timeoff", record })),
  ].sort((a, b) => (a.record.date < b.record.date ? 1 : -1));

  const availableBalanceMinutes = getAvailableToRequestMinutes(person, state.overtimeEntries, state.timeOffRequests, state.balanceAdjustments);
  const pendingOvertimeMinutes = sumMinutes(
    state.overtimeEntries,
    (e) => e.employeeId === person.id && (e.status === STATUS.PENDING || e.status === STATUS.CHANGES_REQUESTED)
  );
  const reservedMinutes = getReservedMinutes(state.timeOffRequests, person.id);
  const usedThisYearMinutes = getUsedThisYearMinutes(person, state.timeOffRequests);

  const overtimeDrafts = myOvertime.filter((e) => e.status === STATUS.DRAFT);
  const timeOffDrafts = myTimeOff.filter((r) => r.status === STATUS.DRAFT);

  const myAdjustments = state.balanceAdjustments
    .filter((a) => a.employeeId === person.id)
    .sort((a, b) => (a.at < b.at ? 1 : -1));

  const upcomingTimeOff = myTimeOff
    .filter((r) => r.status === STATUS.APPROVED && (r.endDate || r.date) >= todayISO)
    .sort((a, b) => (a.date > b.date ? 1 : -1))
    .slice(0, 5);

  const TILE_FILTERS = {
    balance: (item) =>
      (item.kind === "overtime" && item.record.status === STATUS.APPROVED) ||
      (item.kind === "timeoff" && (item.record.status === STATUS.APPROVED || item.record.status === STATUS.PENDING)),
    pendingOvertime: (item) =>
      item.kind === "overtime" && (item.record.status === STATUS.PENDING || item.record.status === STATUS.CHANGES_REQUESTED),
    reserved: (item) => item.kind === "timeoff" && item.record.status === STATUS.PENDING,
    usedThisYear: (item) =>
      item.kind === "timeoff" &&
      item.record.status === STATUS.APPROVED &&
      parseISODate(item.record.date).getFullYear() === currentYear,
  };

  function handleTileClick(key) {
    setStatusFilter("all");
    setTileFilter((prev) => (prev === key ? null : key));
  }

  function handleStatusFilterChange(value) {
    setTileFilter(null);
    setStatusFilter(value);
  }

  let visibleFeedItems = feedItems;
  if (tileFilter) {
    visibleFeedItems = feedItems.filter(TILE_FILTERS[tileFilter]);
  } else if (statusFilter !== "all") {
    visibleFeedItems = feedItems.filter((item) => item.record.status === statusFilter);
  }

  const dayItems = selectedCalendarDate ? feedItems.filter((item) => isDateWithinEntry(selectedCalendarDate, item.record)) : [];

  return (
    <div>
      <PageHeader
        eyebrow="My Dashboard"
        title={person.active === false ? `${person.name} — Inactive` : `Welcome, ${person.name.split(" ")[0]}`}
        description="Your overtime and time-off-in-lieu snapshot."
      />

      {isOverToilBalanceCap(person, state.overtimeEntries, state.timeOffRequests, state.balanceAdjustments, state.policy) && (
        <div className="mb-6 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Your accumulated TOIL balance ({formatDurationMinutes(getApprovedBalanceMinutes(person, state.overtimeEntries, state.timeOffRequests, state.balanceAdjustments))}) has reached the department's{" "}
            {formatDurationMinutes(state.policy.balanceAlertThresholdHours * 60)} alert threshold. Consider requesting time off to draw it down.
          </span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="text-slate-400 text-xs">Name</div>
              <div className="font-medium text-slate-900">{person.name}</div>
            </div>
            <div>
              <div className="text-slate-400 text-xs">Job Title</div>
              <div className="font-medium text-slate-900">{person.jobTitle}</div>
            </div>
            <div>
              <div className="text-slate-400 text-xs">Reports To</div>
              <div className="font-medium text-slate-900">{manager ? manager.name : "—"}</div>
            </div>
            <div>
              <div className="text-slate-400 text-xs">Working Schedule</div>
              <div className="font-medium text-slate-900 font-mono">
                {state.policy.OFFICE_START} – {state.policy.OFFICE_END}
              </div>
            </div>
            <div className="flex gap-1.5 pt-1 flex-wrap">
              {person.systemRoles.map((r) => (
                <RoleBadge key={r} role={r} />
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="md:col-span-2 grid grid-cols-2 gap-4">
          <DashboardStatTile
            label="Available Balance"
            value={formatDurationMinutes(availableBalanceMinutes)}
            sublabel="Approved minus reserved"
            active={tileFilter === "balance"}
            onClick={() => handleTileClick("balance")}
          />
          <DashboardStatTile
            label="Pending Overtime"
            value={formatDurationMinutes(pendingOvertimeMinutes)}
            sublabel="Pending or changes requested"
            active={tileFilter === "pendingOvertime"}
            onClick={() => handleTileClick("pendingOvertime")}
          />
          <DashboardStatTile
            label="Reserved for Requests"
            value={formatDurationMinutes(reservedMinutes)}
            sublabel="Your pending time-off"
            active={tileFilter === "reserved"}
            onClick={() => handleTileClick("reserved")}
          />
          <DashboardStatTile
            label="Used This Year"
            value={formatDurationMinutes(usedThisYearMinutes)}
            sublabel={`Approved in ${currentYear}`}
            active={tileFilter === "usedThisYear"}
            onClick={() => handleTileClick("usedThisYear")}
          />
        </div>
      </div>

      {(overtimeDrafts.length > 0 || timeOffDrafts.length > 0) && (
        <Card className="mb-6 border-amber-200 bg-amber-50/50">
          <CardContent className="py-3 px-4 space-y-1">
            {overtimeDrafts.length > 0 && (
              <button
                type="button"
                onClick={() => onNavigate && onNavigate("recordOvertime")}
                className="block text-sm text-amber-800 hover:underline"
              >
                {overtimeDrafts.length} overtime {overtimeDrafts.length === 1 ? "draft" : "drafts"} waiting to be
                submitted →
              </button>
            )}
            {timeOffDrafts.length > 0 && (
              <button
                type="button"
                onClick={() => onNavigate && onNavigate("requestTimeOff")}
                className="block text-sm text-amber-800 hover:underline"
              >
                {timeOffDrafts.length} time-off {timeOffDrafts.length === 1 ? "draft" : "drafts"} waiting to be
                submitted →
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {myAdjustments.length > 0 && (
        <Card className="mb-6 border-cyan-200 bg-cyan-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-cyan-800">Balance Adjustments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {myAdjustments.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <div className="text-slate-700">{a.reason}</div>
                  <div className="text-xs text-slate-500 font-mono">
                    {a.byName} · {formatDateTimeWithWeekday(a.at)}
                  </div>
                </div>
                <span className={`font-mono shrink-0 ${a.amountMinutes >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {a.amountMinutes >= 0 ? "+" : "−"}
                  {formatDurationMinutes(Math.abs(a.amountMinutes))}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Personal Calendar</CardTitle>
          </CardHeader>
          <CardContent>
            <PersonalCalendar
              overtimeEntries={myOvertime}
              timeOffRequests={myTimeOff}
              selectedDate={selectedCalendarDate}
              onSelectDate={(d) => setSelectedCalendarDate((prev) => (prev === d ? null : d))}
            />
            {selectedCalendarDate && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="text-xs font-mono uppercase tracking-wide text-slate-400 mb-2">
                  {formatDateWithWeekday(selectedCalendarDate)}
                </div>
                {dayItems.length === 0 ? (
                  <p className="text-sm text-slate-400">No entries on this day.</p>
                ) : (
                  <div className="space-y-2">
                    {dayItems.map(({ kind, record }) => (
                      <div key={`${kind}-${record.id}`} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={
                              kind === "overtime"
                                ? "bg-cyan-50 text-cyan-700 border-cyan-200 text-[10px]"
                                : "bg-violet-50 text-violet-700 border-violet-200 text-[10px]"
                            }
                          >
                            {kind === "overtime" ? "OT" : "TO"}
                          </Badge>
                          <span className="font-mono text-xs text-slate-500">
                            {kind === "timeoff" && record.allDay ? "All day" : `${record.startTime}–${record.endTime}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{formatDurationMinutes(record.calculatedMinutes)}</span>
                          <StatusBadge status={record.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Upcoming Time Off</CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingTimeOff.length === 0 ? (
              <p className="text-sm text-slate-400">No upcoming approved time off.</p>
            ) : (
              <div className="space-y-2">
                {upcomingTimeOff.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0"
                  >
                    <div>
                      <div className="font-medium text-slate-900">{formatEntryDateRange(r)}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        {r.allDay ? "All day" : `${r.startTime}–${r.endTime}`}
                      </div>
                    </div>
                    <div className="font-mono text-slate-600">{formatDurationMinutes(r.calculatedMinutes)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-medium text-slate-500">Recent Activity</CardTitle>
            <div className="flex items-center gap-2">
              {tileFilter && (
                <button
                  type="button"
                  onClick={() => setTileFilter(null)}
                  className="text-xs text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-full px-2 py-0.5 hover:bg-cyan-100"
                >
                  {TILE_FILTER_LABELS[tileFilter]} ✕
                </button>
              )}
              <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECENT_ACTIVITY_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {visibleFeedItems.length === 0 ? (
            <p className="text-sm text-slate-400 px-6 py-8 text-center">No activity matches this filter.</p>
          ) : (
            <AppTable>
              <AppTableHead>
                <AppTableRow>
                  <AppTableHeaderCell>Date</AppTableHeaderCell>
                  <AppTableHeaderCell>Time</AppTableHeaderCell>
                  <AppTableHeaderCell>Type</AppTableHeaderCell>
                  <AppTableHeaderCell>Detail</AppTableHeaderCell>
                  <AppTableHeaderCell>Hours</AppTableHeaderCell>
                  <AppTableHeaderCell>Status</AppTableHeaderCell>
                </AppTableRow>
              </AppTableHead>
              <AppTableBody>
                {visibleFeedItems.map(({ kind, record }) => (
                  <AppTableRow key={`${kind}-${record.id}`}>
                    <AppTableCell className="font-medium text-slate-900">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{formatEntryDateRange(record)}</span>
                        {kind === "overtime" && record.date === (record.endDate || record.date) && (
                          <DayTypeBadge dateISO={record.date} holidays={state.holidays} />
                        )}
                      </div>
                    </AppTableCell>
                    <AppTableCell className="font-mono text-xs">
                      {kind === "timeoff" && record.allDay ? "All day" : `${record.startTime}–${record.endTime}`}
                      {kind === "overtime" && record.endsNextDay ? " (+1d)" : ""}
                    </AppTableCell>
                    <AppTableCell>
                      <Badge
                        variant="outline"
                        className={
                          kind === "overtime"
                            ? "bg-cyan-50 text-cyan-700 border-cyan-200 text-[11px]"
                            : "bg-violet-50 text-violet-700 border-violet-200 text-[11px]"
                        }
                      >
                        {kind === "overtime" ? "Overtime" : "Time Off"}
                      </Badge>
                    </AppTableCell>
                    <AppTableCell className="text-xs text-slate-500">
                      {kind === "overtime" ? record.category || "—" : record.comments || "—"}
                    </AppTableCell>
                    <AppTableCell className="font-mono">{formatDurationMinutes(record.calculatedMinutes)}</AppTableCell>
                    <AppTableCell>
                      <StatusBadge status={record.status} />
                    </AppTableCell>
                  </AppTableRow>
                ))}
              </AppTableBody>
            </AppTable>
          )}
        </CardContent>
      </Card>

      {hasRole(person, ROLE.REPORTING_OFFICER) && (
        <Card className="bg-violet-50/50 border-violet-200 mt-6">
          <CardContent className="py-4 text-sm text-violet-800">
            You're also a Reporting Officer. Review requests from your team under{" "}
            <span className="font-medium">Approvals</span>.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MyDashboardPage({ onNavigate }) {
  const state = useAppState();
  const person = getPersonById(state.people, state.currentUserId);

  if (!person.eligible) {
    return <ManagementLanding person={person} onNavigate={onNavigate} />;
  }

  return <EligibleEmployeeDashboard person={person} onNavigate={onNavigate} />;
}

/* =========================================================================
   PAGE: Org Chart
   ========================================================================= */

function NodeCard({ person, compact }) {
  const isInactive = person.active === false;
  return (
    <div
      className={`rounded-lg border bg-white shadow-sm px-3 py-2.5 ${
        compact ? "min-w-[172px]" : "min-w-[200px]"
      } ${isInactive ? "border-slate-200 opacity-60" : "border-slate-200"}`}
    >
      <div className="flex items-center gap-1.5">
        <div className="font-medium text-sm text-slate-900">{person.name}</div>
        {isInactive && (
          <span className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-1.5 py-0.5">
            Inactive
          </span>
        )}
      </div>
      <div className="text-[11px] text-slate-500">{person.jobTitle}</div>
      <div className="flex gap-1 mt-1.5 flex-wrap">
        {person.systemRoles.map((r) => (
          <RoleBadge key={r} role={r} />
        ))}
      </div>
    </div>
  );
}

function Branch({ people, rootId, compact }) {
  const root = getPersonById(people, rootId);
  const children = getDirectReports(people, rootId);
  return (
    <div className="flex flex-col items-center">
      <NodeCard person={root} compact={compact} />
      {children.length > 0 && (
        <div className="mt-3 border-l-2 border-slate-300 pl-4 flex flex-col gap-2.5">
          {children.map((child) => (
            <Branch key={child.id} people={people} rootId={child.id} compact />
          ))}
        </div>
      )}
    </div>
  );
}

function OrgChartPage() {
  const state = useAppState();
  const amelia = getPersonById(state.people, "amelia");
  const topBranches = getDirectReports(state.people, "amelia");

  return (
    <div>
      <PageHeader
        eyebrow="Department Structure"
        title="Org Chart"
        description="Reporting lines for all 10 people in the department."
      />

      <Card className="mb-6">
        <CardContent className="p-6 overflow-x-auto">
          <div className="flex flex-col items-center min-w-max">
            <NodeCard person={amelia} />
            <div className="w-px h-6 bg-slate-300" />
            <div className="flex gap-10 items-start">
              {topBranches.map((b) => (
                <Branch key={b.id} people={state.people} rootId={b.id} />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-500">
            Department Directory
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <AppTable>
            <AppTableHead>
              <AppTableRow>
                <AppTableHeaderCell>Name</AppTableHeaderCell>
                <AppTableHeaderCell>Job Title</AppTableHeaderCell>
                <AppTableHeaderCell>Reports To</AppTableHeaderCell>
                <AppTableHeaderCell>System Role(s)</AppTableHeaderCell>
                <AppTableHeaderCell>Overtime Eligible</AppTableHeaderCell>
                <AppTableHeaderCell>Status</AppTableHeaderCell>
              </AppTableRow>
            </AppTableHead>
            <AppTableBody>
              {state.people.map((p) => {
                const manager = p.reportsTo ? getPersonById(state.people, p.reportsTo) : null;
                return (
                  <AppTableRow key={p.id}>
                    <AppTableCell className="font-medium text-slate-900">{p.name}</AppTableCell>
                    <AppTableCell>{p.jobTitle}</AppTableCell>
                    <AppTableCell>{manager ? manager.name : "—"}</AppTableCell>
                    <AppTableCell>
                      <div className="flex gap-1 flex-wrap">
                        {p.systemRoles.map((r) => (
                          <RoleBadge key={r} role={r} />
                        ))}
                      </div>
                    </AppTableCell>
                    <AppTableCell>
                      {p.eligible ? (
                        <span className="text-emerald-700 text-xs font-medium">Yes</span>
                      ) : (
                        <span className="text-slate-400 text-xs">No</span>
                      )}
                    </AppTableCell>
                    <AppTableCell>
                      {p.active === false ? (
                        <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                          Inactive
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Active
                        </span>
                      )}
                    </AppTableCell>
                  </AppTableRow>
                );
              })}
            </AppTableBody>
          </AppTable>
        </CardContent>
      </Card>
    </div>
  );
}

/* =========================================================================
   PLACEHOLDER PAGES (built out in later stages)
   ========================================================================= */

function RecordOvertimePage() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const person = getPersonById(state.people, state.currentUserId);

  const todayISO = formatISODate(new Date());

  const [startDateISO, setStartDateISO] = useState("");
  const [endDateISO, setEndDateISO] = useState("");
  const [location, setLocation] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [endsNextDay, setEndsNextDay] = useState(false);
  const [workCode, setWorkCode] = useState("");
  const [reason, setReason] = useState("");
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [submitMessage, setSubmitMessage] = useState(null);
  const [editingId, setEditingId] = useState(null);

  function handleStartDateChange(newStart) {
    setStartDateISO(newStart);
    if (!endDateISO || endDateISO < newStart) setEndDateISO(newStart);
  }

  if (!person.eligible || person.active === false) {
    return (
      <PlaceholderPage
        title="Record Overtime"
        icon={Clock}
        description={person.active === false ? "This person is inactive and can't submit new entries." : "This section isn't applicable to your role."}
      />
    );
  }

  const editingEntry = editingId ? state.overtimeEntries.find((e) => e.id === editingId) : null;

  const result = computeOvertimeResult({
    startDateISO,
    endDateISO,
    startTime,
    endTime,
    endsNextDay,
    breakMinutes,
    holidays: state.holidays,
    policy: state.policy,
  });

  const workCodeMeta = state.workCodes.find((w) => w.code === workCode);
  const fieldsFilled = Boolean(startDateISO && endDateISO && location.trim() && startTime && endTime && workCode && reason.trim());
  const canSubmit = fieldsFilled && result.valid;
  const canSaveDraft = Boolean(startDateISO);

  function resetForm() {
    setStartDateISO("");
    setEndDateISO("");
    setLocation("");
    setStartTime("");
    setEndTime("");
    setEndsNextDay(false);
    setWorkCode("");
    setReason("");
    setBreakMinutes(0);
    setEditingId(null);
  }

  function loadEntryIntoForm(entry) {
    setStartDateISO(entry.date);
    setEndDateISO(entry.endDate || entry.date);
    setLocation(entry.location || "");
    setStartTime(entry.startTime);
    setEndTime(entry.endTime);
    setEndsNextDay(entry.endsNextDay);
    setWorkCode(entry.workCode || "");
    setReason(entry.reasonForWork || "");
    setBreakMinutes(entry.breakMinutes || 0);
    setEditingId(entry.id);
    setSubmitMessage(null);
  }

  function buildEntry(status) {
    return {
      id: editingId || `ot-${Date.now()}`,
      employeeId: person.id,
      date: startDateISO,
      endDate: endDateISO,
      startTime,
      endTime,
      endsNextDay,
      location: location.trim(),
      workCode,
      category: workCodeMeta ? workCodeMeta.label : "",
      reasonForWork: reason.trim(),
      breakMinutes: breakMinutes || 0,
      calculatedMinutes: result.valid ? result.earnedMinutes : 0,
      status,
      submittedAt: editingEntry ? editingEntry.submittedAt : new Date().toISOString(),
    };
  }

  function handleSaveDraft() {
    if (!canSaveDraft) return;
    let entry = buildEntry(STATUS.DRAFT);
    entry.auditHistory = editingEntry ? editingEntry.auditHistory : [];
    entry = appendAudit(entry, editingEntry ? AUDIT_ACTION.UPDATED_DRAFT : AUDIT_ACTION.SAVED_DRAFT, person);
    dispatch({ type: editingEntry ? "UPDATE_OVERTIME_ENTRY" : "ADD_OVERTIME_ENTRY", payload: editingEntry ? { id: entry.id, entry } : entry });
    setSubmitMessage("Saved as draft.");
    resetForm();
  }

  function handleSubmit() {
    if (!canSubmit) return;
    let entry = buildEntry(STATUS.PENDING);
    entry.auditHistory = editingEntry ? editingEntry.auditHistory : [];
    const wasChangesRequested = editingEntry && editingEntry.status === STATUS.CHANGES_REQUESTED;
    entry = appendAudit(entry, wasChangesRequested ? AUDIT_ACTION.RESUBMITTED : AUDIT_ACTION.SUBMITTED, person);
    dispatch({ type: editingEntry ? "UPDATE_OVERTIME_ENTRY" : "ADD_OVERTIME_ENTRY", payload: editingEntry ? { id: entry.id, entry } : entry });
    setSubmitMessage(
      `Entry submitted for ${formatEntryDateRange({ date: startDateISO, endDate: endDateISO })} — ${formatDurationMinutes(result.earnedMinutes)} pending approval.`
    );
    resetForm();
  }

  function handleWithdraw(entry) {
    if (entry.status !== STATUS.PENDING) return;
    let updated = { ...entry, status: STATUS.WITHDRAWN };
    updated = appendAudit(updated, AUDIT_ACTION.WITHDRAWN, person);
    dispatch({ type: "UPDATE_OVERTIME_ENTRY", payload: { id: updated.id, entry: updated } });
    if (editingId === entry.id) resetForm();
  }

  const myEntries = state.overtimeEntries.filter((e) => e.employeeId === person.id);
  const myDrafts = myEntries.filter((e) => e.status === STATUS.DRAFT).sort((a, b) => (a.date < b.date ? 1 : -1));
  const mySubmitted = myEntries
    .filter((e) => e.status !== STATUS.DRAFT)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const changesRequestedNote = editingEntry ? getLatestAuditComment(editingEntry) : null;

  return (
    <div>
      <PageHeader
        eyebrow="Record Overtime"
        title="Log an overtime entry"
        description="Submit overtime you've already worked. Entries are reviewed by your Reporting Officer."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-6 space-y-5">
            {editingEntry && (
              <div className="flex items-center justify-between rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-800">
                <span>
                  Editing {editingEntry.status === STATUS.DRAFT ? "draft" : "entry"} from {formatEntryDateRange(editingEntry)}.
                </span>
                <Button variant="ghost" size="sm" onClick={resetForm} className="h-7 text-cyan-800">
                  Cancel
                </Button>
              </div>
            )}

            {changesRequestedNote && editingEntry.status === STATUS.CHANGES_REQUESTED && (
              <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
                <span className="font-medium">Officer feedback:</span> "{changesRequestedNote.comment}"
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <DatePickerField
                label="Start Date"
                valueISO={startDateISO}
                onChange={handleStartDateChange}
                maxDateISO={todayISO}
                required
              />
              <DatePickerField
                label="End Date"
                valueISO={endDateISO}
                onChange={setEndDateISO}
                minDateISO={startDateISO || undefined}
                maxDateISO={todayISO}
                required
              />

              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Location of Work <span className="text-rose-500">*</span>
                </label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Substation Yard 2"
                />
              </div>

              <TimePickerField label="Start Time" value24={startTime} onChange={setStartTime} required />
              <TimePickerField label="End Time" value24={endTime} onChange={setEndTime} required />

              <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div>
                  <div className="text-sm font-medium text-slate-700">Ends Next Day</div>
                  <div className="text-xs text-slate-500">
                    Turn on if each day's shift crosses midnight into the next calendar day.
                  </div>
                </div>
                <Switch checked={endsNextDay} onCheckedChange={setEndsNextDay} />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Work Code <span className="text-rose-500">*</span>
                </label>
                <Select value={workCode} onValueChange={setWorkCode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a work code" />
                  </SelectTrigger>
                  <SelectContent>
                    {state.workCodes
                      .filter((w) => w.active !== false || w.code === workCode)
                      .map((w) => (
                        <SelectItem key={w.code} value={w.code}>
                          {w.code} — {w.label}
                          {w.active === false ? " (inactive)" : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Category</label>
                <div className="rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500">
                  {workCodeMeta ? workCodeMeta.label : "Auto-filled from work code"}
                </div>
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Reason for Work <span className="text-rose-500">*</span>
                </label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Conducted emergency replacement of a failed network switch."
                  rows={3}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Break Duration (optional)</label>
                <Select value={String(breakMinutes)} onValueChange={(v) => setBreakMinutes(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BREAK_OPTIONS.map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {m === 0 ? "No break" : formatDurationMinutes(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {result.error && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {result.error}
              </div>
            )}

            {submitMessage && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {submitMessage}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-400">
                {canSubmit ? "Ready to submit." : "Fill in all required fields to submit."}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleSaveDraft} disabled={!canSaveDraft}>
                  Save as Draft
                </Button>
                <Button onClick={handleSubmit} disabled={!canSubmit}>
                  {editingEntry && editingEntry.status === STATUS.CHANGES_REQUESTED ? "Resubmit" : "Submit for Approval"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Calculated Hours</CardTitle>
          </CardHeader>
          <CardContent>
            {!startDateISO || !endDateISO || !startTime || !endTime ? (
              <p className="text-sm text-slate-400">Fill in dates and times to see a preview.</p>
            ) : !result.valid ? (
              <p className="text-sm text-rose-500">{result.error || "Enter a valid time range."}</p>
            ) : (
              <div className="space-y-3">
                <div className="text-3xl font-semibold font-mono text-cyan-700">
                  {formatDurationMinutes(result.earnedMinutes)}
                </div>
                <div className="text-xs text-slate-400 font-mono uppercase tracking-wide">
                  Earned Overtime → TOIL
                </div>
                {result.dayCount > 1 && (
                  <div className="text-xs text-slate-500">
                    Across {result.dayCount} days ({startDateISO} to {endDateISO})
                  </div>
                )}
                <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs text-slate-500">
                  <div className="flex justify-between">
                    <span>Total elapsed</span>
                    <span className="font-mono">{formatDurationMinutes(result.totalElapsedMinutes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Overtime before break</span>
                    <span className="font-mono">{formatDurationMinutes(result.rawOvertimeMinutes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Break deducted</span>
                    <span className="font-mono">− {formatDurationMinutes(result.breakMinutes)}</span>
                  </div>
                  {result.segments.map((seg, i) => (
                    <div key={i} className="flex justify-between text-slate-400">
                      <span>
                        {seg.dateISO} ({isWeekendOrHoliday(seg.dateISO, state.holidays) ? "non-office day" : "weekday"})
                      </span>
                      <span className="font-mono">{formatDurationMinutes(seg.end - seg.start)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {myDrafts.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-slate-500">My Drafts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <AppTable>
              <AppTableHead>
                <AppTableRow>
                  <AppTableHeaderCell>Date</AppTableHeaderCell>
                  <AppTableHeaderCell>Category</AppTableHeaderCell>
                  <AppTableHeaderCell>Hours</AppTableHeaderCell>
                  <AppTableHeaderCell>Actions</AppTableHeaderCell>
                </AppTableRow>
              </AppTableHead>
              <AppTableBody>
                {myDrafts.map((e) => {
                  const complete = isOvertimeEntryComplete(e, state.holidays, state.policy);
                  return (
                    <AppTableRow key={e.id}>
                      <AppTableCell className="font-medium text-slate-900">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{formatEntryDateRange(e)}</span>
                          {e.date === (e.endDate || e.date) && <DayTypeBadge dateISO={e.date} holidays={state.holidays} />}
                        </div>
                      </AppTableCell>
                      <AppTableCell>{e.category || "—"}</AppTableCell>
                      <AppTableCell className="font-mono">{formatDurationMinutes(e.calculatedMinutes)}</AppTableCell>
                      <AppTableCell>
                        <div className="flex items-center gap-1.5">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => loadEntryIntoForm(e)}>
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 text-cyan-700"
                            disabled={!complete}
                            onClick={() => {
                              const r = computeOvertimeResult({
                                startDateISO: e.date,
                                endDateISO: e.endDate || e.date,
                                startTime: e.startTime,
                                endTime: e.endTime,
                                endsNextDay: e.endsNextDay,
                                breakMinutes: e.breakMinutes,
                                holidays: state.holidays,
                                policy: state.policy,
                              });
                              let updated = { ...e, status: STATUS.PENDING, calculatedMinutes: r.valid ? r.earnedMinutes : 0 };
                              updated = appendAudit(updated, AUDIT_ACTION.SUBMITTED, person);
                              dispatch({ type: "UPDATE_OVERTIME_ENTRY", payload: { id: updated.id, entry: updated } });
                            }}
                          >
                            <Send className="h-3.5 w-3.5" />
                            Submit for Approval
                          </Button>
                        </div>
                      </AppTableCell>
                    </AppTableRow>
                  );
                })}
              </AppTableBody>
            </AppTable>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-500">Your Submitted Entries</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {mySubmitted.length === 0 ? (
            <p className="text-sm text-slate-400 px-6 py-8 text-center">No entries submitted yet.</p>
          ) : (
            <AppTable>
              <AppTableHead>
                <AppTableRow>
                  <AppTableHeaderCell>Date</AppTableHeaderCell>
                  <AppTableHeaderCell>Time</AppTableHeaderCell>
                  <AppTableHeaderCell>Category</AppTableHeaderCell>
                  <AppTableHeaderCell>Hours</AppTableHeaderCell>
                  <AppTableHeaderCell>Status</AppTableHeaderCell>
                  <AppTableHeaderCell>Actions</AppTableHeaderCell>
                </AppTableRow>
              </AppTableHead>
              <AppTableBody>
                {mySubmitted.map((e) => {
                  const feedback = [STATUS.CHANGES_REQUESTED, STATUS.REJECTED, STATUS.CANCELLED].includes(e.status) ? getLatestAuditComment(e) : null;
                  return (
                    <AppTableRow key={e.id}>
                      <AppTableCell className="font-medium text-slate-900">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{formatEntryDateRange(e)}</span>
                          {e.date === (e.endDate || e.date) && <DayTypeBadge dateISO={e.date} holidays={state.holidays} />}
                        </div>
                      </AppTableCell>
                      <AppTableCell className="font-mono text-xs">
                        {e.startTime}–{e.endTime}
                        {e.endsNextDay ? " (+1d)" : ""}
                      </AppTableCell>
                      <AppTableCell>{e.category}</AppTableCell>
                      <AppTableCell className="font-mono">{formatDurationMinutes(e.calculatedMinutes)}</AppTableCell>
                      <AppTableCell>
                        <div className="space-y-1">
                          <StatusBadge status={e.status} />
                          {feedback && <div className="text-[11px] text-slate-400 italic max-w-[16rem]">"{feedback.comment}"</div>}
                        </div>
                      </AppTableCell>
                      <AppTableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          {e.status === STATUS.PENDING && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-rose-600" onClick={() => handleWithdraw(e)}>
                              <Undo2 className="h-3.5 w-3.5" />
                              Withdraw
                            </Button>
                          )}
                          {e.status === STATUS.CHANGES_REQUESTED && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-cyan-700" onClick={() => loadEntryIntoForm(e)}>
                              <Pencil className="h-3.5 w-3.5" />
                              Edit & Resubmit
                            </Button>
                          )}
                          <AuditHistoryDialog record={e} />
                        </div>
                      </AppTableCell>
                    </AppTableRow>
                  );
                })}
              </AppTableBody>
            </AppTable>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
function RequestTimeOffPage() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const person = getPersonById(state.people, state.currentUserId);

  const todayISO = formatISODate(new Date());

  const [startDateISO, setStartDateISO] = useState("");
  const [endDateISO, setEndDateISO] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [comments, setComments] = useState("");
  const [submitMessage, setSubmitMessage] = useState(null);
  const [editingId, setEditingId] = useState(null);

  function handleStartDateChange(newStart) {
    setStartDateISO(newStart);
    if (!endDateISO || endDateISO < newStart) setEndDateISO(newStart);
  }

  if (!person.eligible || person.active === false) {
    return (
      <PlaceholderPage
        title="Request Time Off"
        icon={CalendarClock}
        description={person.active === false ? "This person is inactive and can't submit new requests." : "This section isn't applicable to your role."}
      />
    );
  }

  const editingRequest = editingId ? state.timeOffRequests.find((r) => r.id === editingId) : null;

  // Excludes the item currently being edited from its own reserved total,
  // so re-editing a Pending/Changes-Requested request doesn't double-count.
  const approvedMinutes = getApprovedBalanceMinutes(person, state.overtimeEntries, state.timeOffRequests, state.balanceAdjustments);
  const reservedMinutes = getReservedMinutes(state.timeOffRequests, person.id, editingId);
  const availableMinutes = Math.max(0, approvedMinutes - reservedMinutes);

  const result = computeTimeOffResult({
    startDateISO,
    endDateISO,
    allDay,
    startTime,
    endTime,
    holidays: state.holidays,
    policy: state.policy,
  });

  let formError = null;
  if (result.valid) {
    if (hasOverlappingPendingRequest(state.timeOffRequests, person.id, startDateISO, endDateISO, editingId)) {
      formError = "This overlaps another pending time-off request you already have.";
    } else if (result.calculatedMinutes > availableMinutes) {
      formError = `This would use ${formatDurationMinutes(result.calculatedMinutes)}, but only ${formatDurationMinutes(availableMinutes)} is available.`;
    }
  }

  const fieldsFilled = Boolean(startDateISO && endDateISO && (allDay || (startTime && endTime)));
  const canSubmit = fieldsFilled && result.valid && !formError;
  const canSaveDraft = Boolean(startDateISO);

  function resetForm() {
    setStartDateISO("");
    setEndDateISO("");
    setAllDay(false);
    setStartTime("");
    setEndTime("");
    setComments("");
    setEditingId(null);
  }

  function loadRequestIntoForm(request) {
    setStartDateISO(request.date);
    setEndDateISO(request.endDate || request.date);
    setAllDay(Boolean(request.allDay));
    setStartTime(request.startTime || "");
    setEndTime(request.endTime || "");
    setComments(request.comments || "");
    setEditingId(request.id);
    setSubmitMessage(null);
  }

  function buildRequest(status) {
    return {
      id: editingId || `to-${Date.now()}`,
      employeeId: person.id,
      date: startDateISO,
      endDate: endDateISO,
      allDay,
      startTime: allDay ? "" : startTime,
      endTime: allDay ? "" : endTime,
      calculatedMinutes: result.valid ? result.calculatedMinutes : 0,
      comments: comments.trim(),
      status,
      submittedAt: editingRequest ? editingRequest.submittedAt : new Date().toISOString(),
    };
  }

  function handleSaveDraft() {
    if (!canSaveDraft) return;
    let request = buildRequest(STATUS.DRAFT);
    request.auditHistory = editingRequest ? editingRequest.auditHistory : [];
    request = appendAudit(request, editingRequest ? AUDIT_ACTION.UPDATED_DRAFT : AUDIT_ACTION.SAVED_DRAFT, person);
    dispatch({ type: editingRequest ? "UPDATE_TIME_OFF_REQUEST" : "ADD_TIME_OFF_REQUEST", payload: editingRequest ? { id: request.id, entry: request } : request });
    setSubmitMessage("Saved as draft.");
    resetForm();
  }

  function handleSubmit() {
    if (!canSubmit) return;
    let request = buildRequest(STATUS.PENDING);
    request.auditHistory = editingRequest ? editingRequest.auditHistory : [];
    const wasChangesRequested = editingRequest && editingRequest.status === STATUS.CHANGES_REQUESTED;
    request = appendAudit(request, wasChangesRequested ? AUDIT_ACTION.RESUBMITTED : AUDIT_ACTION.SUBMITTED, person);
    dispatch({ type: editingRequest ? "UPDATE_TIME_OFF_REQUEST" : "ADD_TIME_OFF_REQUEST", payload: editingRequest ? { id: request.id, entry: request } : request });
    setSubmitMessage(
      `Request submitted for ${formatEntryDateRange({ date: startDateISO, endDate: endDateISO })} — ${formatDurationMinutes(result.calculatedMinutes)} reserved, pending approval.`
    );
    resetForm();
  }

  function handleWithdraw(request) {
    if (request.status !== STATUS.PENDING) return;
    let updated = { ...request, status: STATUS.WITHDRAWN };
    updated = appendAudit(updated, AUDIT_ACTION.WITHDRAWN, person);
    dispatch({ type: "UPDATE_TIME_OFF_REQUEST", payload: { id: updated.id, entry: updated } });
    if (editingId === request.id) resetForm();
  }

  const myRequests = state.timeOffRequests.filter((r) => r.employeeId === person.id);
  const myDrafts = myRequests.filter((r) => r.status === STATUS.DRAFT).sort((a, b) => (a.date < b.date ? 1 : -1));
  const mySubmitted = myRequests
    .filter((r) => r.status !== STATUS.DRAFT)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const changesRequestedNote = editingRequest ? getLatestAuditComment(editingRequest) : null;

  return (
    <div>
      <PageHeader
        eyebrow="Request Time Off"
        title="Request time off in lieu"
        description="Draw down your available TOIL balance for time away from work."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-6 space-y-5">
            {editingRequest && (
              <div className="flex items-center justify-between rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-800">
                <span>
                  Editing {editingRequest.status === STATUS.DRAFT ? "draft" : "request"} from {formatEntryDateRange(editingRequest)}.
                </span>
                <Button variant="ghost" size="sm" onClick={resetForm} className="h-7 text-cyan-800">
                  Cancel
                </Button>
              </div>
            )}

            {changesRequestedNote && editingRequest.status === STATUS.CHANGES_REQUESTED && (
              <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
                <span className="font-medium">Officer feedback:</span> "{changesRequestedNote.comment}"
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <DatePickerField
                label="Start Date"
                valueISO={startDateISO}
                onChange={handleStartDateChange}
                minDateISO={todayISO}
                disabledDates={(d) => isWeekendOrHoliday(formatISODate(d), state.holidays)}
                required
              />
              <DatePickerField
                label="End Date"
                valueISO={endDateISO}
                onChange={setEndDateISO}
                minDateISO={startDateISO || todayISO}
                disabledDates={(d) => isWeekendOrHoliday(formatISODate(d), state.holidays)}
                required
              />

              <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div>
                  <div className="text-sm font-medium text-slate-700">All Day</div>
                  <div className="text-xs text-slate-500">
                    Every included day counts as a full working day (8:30 AM–6:00 PM, minus lunch).
                  </div>
                </div>
                <Switch checked={allDay} onCheckedChange={setAllDay} />
              </div>

              {!allDay && (
                <>
                  {startDateISO && endDateISO && startDateISO === endDateISO && (
                    <div className="sm:col-span-2 flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-500">Quick select:</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setStartTime("08:30");
                          setEndTime("12:00");
                        }}
                      >
                        Half Day — AM
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setStartTime("13:00");
                          setEndTime("18:00");
                        }}
                      >
                        Half Day — PM
                      </Button>
                    </div>
                  )}
                  <TimePickerField label="Start Time" value24={startTime} onChange={setStartTime} required />
                  <TimePickerField label="End Time" value24={endTime} onChange={setEndTime} required />
                </>
              )}

              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Comments (optional)</label>
                <Textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Add any context for your Reporting Officer (optional)."
                  rows={3}
                />
              </div>
            </div>

            {result.error && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {result.error}
              </div>
            )}
            {!result.error && formError && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {formError}
              </div>
            )}
            {submitMessage && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {submitMessage}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-400">
                {canSubmit ? "Ready to submit." : `Fill in dates${allDay ? "" : " and times"} to submit.`}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleSaveDraft} disabled={!canSaveDraft}>
                  Save as Draft
                </Button>
                <Button onClick={handleSubmit} disabled={!canSubmit}>
                  {editingRequest && editingRequest.status === STATUS.CHANGES_REQUESTED ? "Resubmit" : "Submit Request"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">TOIL Calculation</CardTitle>
            </CardHeader>
            <CardContent>
              {!startDateISO || !endDateISO || (!allDay && (!startTime || !endTime)) ? (
                <p className="text-sm text-slate-400">Fill in dates{allDay ? "" : " and times"} to see a preview.</p>
              ) : !result.valid ? (
                <p className="text-sm text-rose-500">{result.error}</p>
              ) : (
                <div className="space-y-2">
                  <div className="text-3xl font-semibold font-mono text-cyan-700">
                    {formatDurationMinutes(result.calculatedMinutes)}
                  </div>
                  <div className="text-xs text-slate-400 font-mono uppercase tracking-wide">TOIL Requested</div>
                  <div className="pt-2 border-t border-slate-100 space-y-1 text-xs">
                    {result.breakdown.map((row, i) =>
                      row.type === "skipped" ? (
                        <div key={i} className="text-slate-400 italic">
                          ({row.label}: {row.reason}, not counted)
                        </div>
                      ) : (
                        <div key={i} className="flex justify-between text-slate-600">
                          <span>
                            {row.label}: {row.detail}
                          </span>
                          <span className="font-mono">{formatDurationMinutes(row.minutes)}</span>
                        </div>
                      )
                    )}
                    <div className="flex justify-between pt-1 border-t border-slate-100 font-medium text-slate-700">
                      <span>Total</span>
                      <span className="font-mono">{formatDurationMinutes(result.calculatedMinutes)}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Your Balance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Approved balance</span>
                <span className="font-mono font-medium text-slate-900">{formatDurationMinutes(approvedMinutes)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Reserved (pending)</span>
                <span className="font-mono font-medium text-slate-900">{formatDurationMinutes(reservedMinutes)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-100">
                <span className="text-slate-600 font-medium">Available to request</span>
                <span className="font-mono font-semibold text-emerald-700">{formatDurationMinutes(availableMinutes)}</span>
              </div>
              {result.valid && !formError && (
                <div className="flex justify-between pt-2 border-t border-slate-100 text-xs text-slate-400">
                  <span>If submitted, remaining</span>
                  <span className="font-mono">{formatDurationMinutes(availableMinutes - result.calculatedMinutes)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {myDrafts.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-slate-500">My Drafts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <AppTable>
              <AppTableHead>
                <AppTableRow>
                  <AppTableHeaderCell>Date</AppTableHeaderCell>
                  <AppTableHeaderCell>Time</AppTableHeaderCell>
                  <AppTableHeaderCell>Hours</AppTableHeaderCell>
                  <AppTableHeaderCell>Actions</AppTableHeaderCell>
                </AppTableRow>
              </AppTableHead>
              <AppTableBody>
                {myDrafts.map((r) => {
                  const complete = isTimeOffRequestComplete(r, state.holidays, state.policy);
                  return (
                    <AppTableRow key={r.id}>
                      <AppTableCell className="font-medium text-slate-900">{formatEntryDateRange(r)}</AppTableCell>
                      <AppTableCell className="font-mono text-xs">
                        {r.allDay ? "All day" : r.startTime && r.endTime ? `${r.startTime}–${r.endTime}` : "—"}
                      </AppTableCell>
                      <AppTableCell className="font-mono">{formatDurationMinutes(r.calculatedMinutes)}</AppTableCell>
                      <AppTableCell>
                        <div className="flex items-center gap-1.5">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => loadRequestIntoForm(r)}>
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 text-cyan-700"
                            disabled={!complete}
                            onClick={() => {
                              const res = computeTimeOffResult({
                                startDateISO: r.date,
                                endDateISO: r.endDate || r.date,
                                allDay: r.allDay,
                                startTime: r.startTime,
                                endTime: r.endTime,
                                holidays: state.holidays,
                                policy: state.policy,
                              });
                              let updated = { ...r, status: STATUS.PENDING, calculatedMinutes: res.valid ? res.calculatedMinutes : 0 };
                              updated = appendAudit(updated, AUDIT_ACTION.SUBMITTED, person);
                              dispatch({ type: "UPDATE_TIME_OFF_REQUEST", payload: { id: updated.id, entry: updated } });
                            }}
                          >
                            <Send className="h-3.5 w-3.5" />
                            Submit for Approval
                          </Button>
                        </div>
                      </AppTableCell>
                    </AppTableRow>
                  );
                })}
              </AppTableBody>
            </AppTable>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-500">Your Time-Off Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {mySubmitted.length === 0 ? (
            <p className="text-sm text-slate-400 px-6 py-8 text-center">No requests submitted yet.</p>
          ) : (
            <AppTable>
              <AppTableHead>
                <AppTableRow>
                  <AppTableHeaderCell>Date</AppTableHeaderCell>
                  <AppTableHeaderCell>Time</AppTableHeaderCell>
                  <AppTableHeaderCell>Hours</AppTableHeaderCell>
                  <AppTableHeaderCell>Status</AppTableHeaderCell>
                  <AppTableHeaderCell>Actions</AppTableHeaderCell>
                </AppTableRow>
              </AppTableHead>
              <AppTableBody>
                {mySubmitted.map((r) => {
                  const feedback = [STATUS.CHANGES_REQUESTED, STATUS.REJECTED, STATUS.CANCELLED].includes(r.status) ? getLatestAuditComment(r) : null;
                  return (
                    <AppTableRow key={r.id}>
                      <AppTableCell className="font-medium text-slate-900">{formatEntryDateRange(r)}</AppTableCell>
                      <AppTableCell className="font-mono text-xs">
                        {r.allDay ? "All day" : `${r.startTime}–${r.endTime}`}
                      </AppTableCell>
                      <AppTableCell className="font-mono">{formatDurationMinutes(r.calculatedMinutes)}</AppTableCell>
                      <AppTableCell>
                        <div className="space-y-1">
                          <StatusBadge status={r.status} />
                          {feedback && <div className="text-[11px] text-slate-400 italic max-w-[16rem]">"{feedback.comment}"</div>}
                        </div>
                      </AppTableCell>
                      <AppTableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          {r.status === STATUS.PENDING && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-rose-600" onClick={() => handleWithdraw(r)}>
                              <Undo2 className="h-3.5 w-3.5" />
                              Withdraw
                            </Button>
                          )}
                          {r.status === STATUS.CHANGES_REQUESTED && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-cyan-700" onClick={() => loadRequestIntoForm(r)}>
                              <Pencil className="h-3.5 w-3.5" />
                              Edit & Resubmit
                            </Button>
                          )}
                          <AuditHistoryDialog record={r} />
                        </div>
                      </AppTableCell>
                    </AppTableRow>
                  );
                })}
              </AppTableBody>
            </AppTable>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
function DelegationPanel({ officer, todayISO }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const directReports = getDirectReports(state.people, officer.id).filter((p) => p.active !== false);
  const delegateId = officer.designatedCoveringOfficerId;
  const delegate = delegateId ? getPersonById(state.people, delegateId) : null;

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const activeDelegation = getActiveDelegationForDelegator(state.delegations, officer.id, todayISO);
  const upcomingDelegation = state.delegations.find(
    (d) => d.delegatorId === officer.id && !d.revoked && d.endDate >= todayISO && d.startDate > todayISO
  );
  const existing = activeDelegation || upcomingDelegation;

  function handleDesignationChange(newDelegateId) {
    dispatch({ type: "UPDATE_PERSON", payload: { id: officer.id, updates: { designatedCoveringOfficerId: newDelegateId } } });
  }

  function handleRevoke(delegation) {
    let updated = { ...delegation, revoked: true, revokedById: officer.id, revokedAt: new Date().toISOString() };
    updated = appendAudit(updated, AUDIT_ACTION.DELEGATION_REVOKED, officer);
    dispatch({ type: "UPDATE_DELEGATION", payload: { id: updated.id, entry: updated } });
  }

  const canCreate = Boolean(delegateId && startDate && endDate && endDate >= startDate && startDate >= todayISO);

  function handleCreate() {
    if (!canCreate) return;
    let delegation = {
      id: `del-${Date.now()}`,
      delegatorId: officer.id,
      delegateId,
      startDate,
      endDate,
      revoked: false,
      revokedById: null,
      revokedAt: null,
      auditHistory: [],
    };
    delegation = appendAudit(delegation, AUDIT_ACTION.DELEGATION_CREATED, officer);
    dispatch({ type: "ADD_DELEGATION", payload: delegation });
    setStartDate("");
    setEndDate("");
  }

  return (
    <Card className="mb-6 border-violet-200 bg-violet-50/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-violet-700">Delegated Approval</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-violet-100">
          <div>
            <div className="text-sm font-medium text-slate-700">Designated Covering Officer</div>
            <div className="text-xs text-slate-500">
              Who would cover your approvals, independent of whether a delegation is active right now.
            </div>
          </div>
          <Select value={delegateId || ""} onValueChange={handleDesignationChange}>
            <SelectTrigger className="w-[220px] h-9">
              <SelectValue placeholder="Choose a direct report" />
            </SelectTrigger>
            <SelectContent>
              {directReports.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {existing ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-700">
              <span className="font-medium">{delegate ? delegate.name : "Someone"}</span>{" "}
              {activeDelegation ? "is covering" : "is scheduled to cover"} your approvals from{" "}
              <span className="font-mono">{formatDateWithWeekday(existing.startDate)}</span> to{" "}
              <span className="font-mono">{formatDateWithWeekday(existing.endDate)}</span>.
            </p>
            <div className="flex items-center gap-2">
              <AuditHistoryDialog record={existing} />
              <Button variant="outline" size="sm" onClick={() => handleRevoke(existing)}>
                Revoke
              </Button>
            </div>
          </div>
        ) : !delegate ? (
          <p className="text-sm text-slate-500">
            Choose a designated covering officer above before creating a delegation.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              No active delegation. You can temporarily hand your approvals to{" "}
              <span className="font-medium text-slate-700">{delegate.name}</span>, your designated covering officer.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <DatePickerField label="Start Date" valueISO={startDate} onChange={setStartDate} minDateISO={todayISO} required />
              <DatePickerField label="End Date" valueISO={endDate} onChange={setEndDate} minDateISO={startDate || todayISO} required />
            </div>
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-slate-400">
                {canCreate ? "Ready to delegate." : "Select a start and end date (end on or after start)."}
              </p>
              <Button size="sm" onClick={handleCreate} disabled={!canCreate}>
                Delegate to {delegate.name}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ApprovalsPage() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const officer = getPersonById(state.people, state.currentUserId);
  const todayISO = formatISODate(new Date());
  const [selectedKeys, setSelectedKeys] = useState(new Set());

  const isNormalOfficer = hasRole(officer, ROLE.REPORTING_OFFICER);
  const activeDelegationAsDelegate = getActiveDelegationForDelegate(state.delegations, officer.id, todayISO);
  const canDelegate = canDesignateCoveringOfficer(officer, state.people);
  const activeDelegationAsDelegator = canDelegate
    ? getActiveDelegationForDelegator(state.delegations, officer.id, todayISO)
    : null;

  if (!isNormalOfficer && !activeDelegationAsDelegate) {
    return (
      <PlaceholderPage
        title="Approvals"
        icon={CheckSquare}
        description="This section isn't applicable to your role."
      />
    );
  }

  const pendingOvertime = state.overtimeEntries
    .filter(
      (e) => e.status === STATUS.PENDING && getEffectiveApproverId(e.employeeId, state.people, state.delegations, todayISO) === officer.id
    )
    .map((record) => ({ kind: "overtime", record }));
  const pendingTimeOff = state.timeOffRequests
    .filter(
      (r) => r.status === STATUS.PENDING && getEffectiveApproverId(r.employeeId, state.people, state.delegations, todayISO) === officer.id
    )
    .map((record) => ({ kind: "timeoff", record }));

  const queue = [...pendingOvertime, ...pendingTimeOff].sort((a, b) => (a.record.date < b.record.date ? -1 : 1));

  function keyFor(kind, record) {
    return `${kind}-${record.id}`;
  }

  const selectedItems = queue.filter(({ kind, record }) => selectedKeys.has(keyFor(kind, record)));
  const selectedTotalMinutes = selectedItems.reduce((sum, { record }) => sum + record.calculatedMinutes, 0);
  const allVisibleSelected = queue.length > 0 && selectedItems.length === queue.length;

  function toggleSelect(kind, record) {
    const key = keyFor(kind, record);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(queue.map(({ kind, record }) => keyFor(kind, record))));
    }
  }

  function applyUpdate(kind, updated) {
    const actionType = kind === "overtime" ? "UPDATE_OVERTIME_ENTRY" : "UPDATE_TIME_OFF_REQUEST";
    dispatch({ type: actionType, payload: { id: updated.id, entry: updated } });
  }

  function actorFor(record) {
    return { id: officer.id, name: getAuditActorDisplayName(officer, record, state.people, state.delegations, todayISO) };
  }

  function handleApprove(kind, record) {
    let updated = { ...record, status: STATUS.APPROVED };
    updated = appendAudit(updated, AUDIT_ACTION.APPROVED, actorFor(record));
    applyUpdate(kind, updated);
  }

  function handleReject(kind, record, comment) {
    let updated = { ...record, status: STATUS.REJECTED };
    updated = appendAudit(updated, AUDIT_ACTION.REJECTED, actorFor(record), comment);
    applyUpdate(kind, updated);
  }

  function handleRequestChanges(kind, record, comment) {
    let updated = { ...record, status: STATUS.CHANGES_REQUESTED };
    updated = appendAudit(updated, AUDIT_ACTION.CHANGES_REQUESTED, actorFor(record), comment);
    applyUpdate(kind, updated);
  }

  function handleBulkApprove() {
    selectedItems.forEach(({ kind, record }) => handleApprove(kind, record));
    setSelectedKeys(new Set());
  }

  function handleBulkReject(comment) {
    selectedItems.forEach(({ kind, record }) => handleReject(kind, record, comment));
    setSelectedKeys(new Set());
  }

  const coveringForOfficer = activeDelegationAsDelegate ? getPersonById(state.people, activeDelegationAsDelegate.delegatorId) : null;

  return (
    <div>
      <PageHeader
        eyebrow="Approvals"
        title="Approval Queue"
        description={
          coveringForOfficer
            ? `Covering ${coveringForOfficer.name}'s team until ${formatDateWithWeekday(activeDelegationAsDelegate.endDate)}, plus anything escalated to you.`
            : "Pending overtime and time-off requests routed to you."
        }
      />

      {canDelegate && <DelegationPanel officer={officer} todayISO={todayISO} />}

      {activeDelegationAsDelegator ? (
        <Card className="border-slate-200 bg-slate-50">
          <CardContent className="py-4 text-sm text-slate-600">
            Your team's approvals are currently being handled by{" "}
            <span className="font-medium">{getPersonById(state.people, activeDelegationAsDelegator.delegateId).name}</span>{" "}
            (covering until {formatDateWithWeekday(activeDelegationAsDelegator.endDate)}).
          </CardContent>
        </Card>
      ) : queue.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50">
          <CardContent className="py-16 text-center text-sm text-slate-400 font-mono">
            Nothing pending review right now.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <Checkbox checked={allVisibleSelected} onCheckedChange={toggleSelectAll} />
              Select all visible ({queue.length})
            </label>
          </div>

          {selectedKeys.size > 0 && (
            <Card className="border-cyan-200 bg-cyan-50/60">
              <CardContent className="py-3 px-4 flex items-center justify-between flex-wrap gap-3">
                <div className="text-sm text-cyan-800">
                  {selectedItems.length} selected · {formatDurationMinutes(selectedTotalMinutes)} total
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm">Approve Selected</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Approve {selectedItems.length} item{selectedItems.length === 1 ? "" : "s"}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This approves {selectedItems.length} selected item{selectedItems.length === 1 ? "" : "s"} totaling{" "}
                          {formatDurationMinutes(selectedTotalMinutes)}, each using the same approval logic as approving
                          one at a time.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleBulkApprove}>Approve All</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <CommentActionDialog
                    triggerLabel="Reject Selected"
                    title={`Reject ${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"}?`}
                    description="This one comment is applied to every selected item's audit trail. The employees will see it."
                    onConfirm={(comment) => handleBulkReject(comment)}
                  />
                  <Button variant="ghost" size="sm" onClick={() => setSelectedKeys(new Set())}>
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {queue.map(({ kind, record }) => {
            const employee = getPersonById(state.people, record.employeeId);
            const isSelected = selectedKeys.has(keyFor(kind, record));
            return (
              <Card key={`${kind}-${record.id}`}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(kind, record)}
                        className="mt-1"
                      />
                      <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900">{employee ? employee.name : "Unknown"}</span>
                        <Badge
                          variant="outline"
                          className={
                            kind === "overtime"
                              ? "bg-cyan-50 text-cyan-700 border-cyan-200 text-[11px]"
                              : "bg-violet-50 text-violet-700 border-violet-200 text-[11px]"
                          }
                        >
                          {kind === "overtime" ? "Overtime" : "Time Off"}
                        </Badge>
                        {kind === "overtime" && record.date === (record.endDate || record.date) && (
                          <DayTypeBadge dateISO={record.date} holidays={state.holidays} />
                        )}
                      </div>
                      <div className="text-sm text-slate-500 mt-1 font-mono">
                        {formatEntryDateRange(record)} ·{" "}
                        {kind === "timeoff" && record.allDay ? "All day" : `${record.startTime}–${record.endTime}`}
                        {kind === "overtime" && record.endsNextDay ? " (+1d)" : ""}
                      </div>
                      {kind === "overtime" ? (
                        <div className="text-sm text-slate-600 mt-2 space-y-0.5">
                          <div>
                            <span className="text-slate-400">Work Code:</span> {record.workCode} — {record.category}
                          </div>
                          <div>
                            <span className="text-slate-400">Reason:</span> {record.reasonForWork}
                          </div>
                          <div>
                            <span className="text-slate-400">Location:</span> {record.location}
                          </div>
                        </div>
                      ) : (
                        record.comments && (
                          <div className="text-sm text-slate-600 mt-2">
                            <span className="text-slate-400">Comments:</span> {record.comments}
                          </div>
                        )
                      )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xl font-semibold font-mono text-cyan-700">
                        {formatDurationMinutes(record.calculatedMinutes)}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono uppercase">Hours</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100 flex-wrap">
                    <Button size="sm" onClick={() => handleApprove(kind, record)}>
                      Approve
                    </Button>
                    <CommentActionDialog
                      triggerLabel="Reject"
                      title="Reject this request?"
                      description="Explain why this is being rejected. The employee will see this comment."
                      onConfirm={(comment) => handleReject(kind, record, comment)}
                    />
                    <CommentActionDialog
                      triggerLabel="Request Changes"
                      title="Request changes?"
                      description="Let the employee know what needs to change before resubmitting."
                      onConfirm={(comment) => handleRequestChanges(kind, record, comment)}
                    />
                    <AuditHistoryDialog record={record} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
function MiniStat({ label, value }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-mono uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-mono font-semibold text-slate-900">{value}</div>
    </div>
  );
}

// Reusable employee drill-down — opened from the Team Balances table and
// the hierarchy view in this prompt, and reused as-is by the ranking/
// category charts in the follow-up prompt. Read-only.
function BalanceAdjustmentPanel({ personId }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const admin = getPersonById(state.people, state.currentUserId);
  const [direction, setDirection] = useState("add");
  const [amountHours, setAmountHours] = useState("");
  const [reason, setReason] = useState("");

  const parsedHours = parseFloat(amountHours);
  const amountMinutesRaw = Number.isFinite(parsedHours) ? Math.round(parsedHours * 60) : 0;
  const canSubmit = amountMinutesRaw > 0 && reason.trim().length > 0;

  const history = state.balanceAdjustments
    .filter((a) => a.employeeId === personId)
    .sort((a, b) => (a.at < b.at ? 1 : -1));

  function handleSubmit() {
    if (!canSubmit) return;
    const signedMinutes = direction === "subtract" ? -amountMinutesRaw : amountMinutesRaw;
    const adjustment = {
      id: `adj-${Date.now()}`,
      employeeId: personId,
      amountMinutes: signedMinutes,
      reason: reason.trim(),
      byId: admin.id,
      byName: admin.name,
      at: new Date().toISOString(),
    };
    dispatch({ type: "ADD_BALANCE_ADJUSTMENT", payload: adjustment });
    setAmountHours("");
    setReason("");
  }

  return (
    <div className="rounded-md border border-slate-200 p-3 space-y-3">
      <div className="text-xs font-mono uppercase tracking-wide text-slate-400">Adjust Balance</div>
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={direction} onValueChange={setDirection}>
          <SelectTrigger className="w-24 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="add">Add</SelectItem>
            <SelectItem value="subtract">Subtract</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="number"
          min="0"
          step="0.25"
          value={amountHours}
          onChange={(e) => setAmountHours(e.target.value)}
          placeholder="Hours"
          className="w-24 h-8 text-xs"
        />
        <span className="text-xs text-slate-400">hours</span>
      </div>
      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required — this is logged to the audit trail)"
        rows={2}
        className="text-xs"
      />
      <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
        Apply Adjustment
      </Button>

      {history.length > 0 && (
        <div className="pt-2 border-t border-slate-100 space-y-1.5">
          <div className="text-[11px] font-mono uppercase tracking-wide text-slate-400">Adjustment History</div>
          {history.map((a) => (
            <div key={a.id} className="text-xs text-slate-600 flex items-start justify-between gap-2">
              <span>
                {a.reason} — <span className="text-slate-400">{a.byName}</span>
              </span>
              <span className={`font-mono shrink-0 ${a.amountMinutes >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {a.amountMinutes >= 0 ? "+" : "−"}
                {formatDurationMinutes(Math.abs(a.amountMinutes))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmployeeDrilldownDialog({ personId, onOpenChange, adminMode }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const admin = getPersonById(state.people, state.currentUserId);
  const person = personId ? getPersonById(state.people, personId) : null;

  function applyOverride(kind, record, newStatus, action, reason) {
    const actionType = kind === "overtime" ? "UPDATE_OVERTIME_ENTRY" : "UPDATE_TIME_OFF_REQUEST";
    let updated = { ...record, status: newStatus };
    updated = appendAudit(updated, action, { id: admin.id, name: admin.name }, reason);
    dispatch({ type: actionType, payload: { id: updated.id, entry: updated } });
  }

  const content = person && (
    <>
      <DialogHeader>
        <DialogTitle>{person.name}</DialogTitle>
      </DialogHeader>
      {(() => {
        const approvedBalance = getApprovedBalanceMinutes(person, state.overtimeEntries, state.timeOffRequests, state.balanceAdjustments);
        const reserved = getReservedMinutes(state.timeOffRequests, person.id);
        const available = approvedBalance - reserved;
        const usedThisYear = getUsedThisYearMinutes(person, state.timeOffRequests);
        const pendingOvertime = sumMinutes(
          state.overtimeEntries,
          (e) => e.employeeId === person.id && (e.status === STATUS.PENDING || e.status === STATUS.CHANGES_REQUESTED)
        );

        const feedItems = [
          ...state.overtimeEntries.filter((e) => e.employeeId === person.id).map((record) => ({ kind: "overtime", record })),
          ...state.timeOffRequests.filter((r) => r.employeeId === person.id).map((record) => ({ kind: "timeoff", record })),
        ]
          .filter((item) => item.record.status !== STATUS.DRAFT)
          .sort((a, b) => (a.record.date < b.record.date ? 1 : -1));

        return (
          <div className="space-y-4">
            <div className="text-sm text-slate-500 -mt-2">{person.jobTitle}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MiniStat label="Available" value={formatDurationMinutes(available)} />
              <MiniStat label="Pending OT" value={formatDurationMinutes(pendingOvertime)} />
              <MiniStat label="Reserved" value={formatDurationMinutes(reserved)} />
              <MiniStat label="Used This Yr" value={formatDurationMinutes(usedThisYear)} />
            </div>

            {adminMode && <BalanceAdjustmentPanel personId={person.id} />}

            <div>
              <div className="text-xs font-mono uppercase tracking-wide text-slate-400 mb-2">Recent Activity</div>
              {feedItems.length === 0 ? (
                <p className="text-sm text-slate-400">No activity yet.</p>
              ) : (
                <AppTable>
                  <AppTableHead>
                    <AppTableRow>
                      <AppTableHeaderCell>Date</AppTableHeaderCell>
                      <AppTableHeaderCell>Time</AppTableHeaderCell>
                      <AppTableHeaderCell>Type</AppTableHeaderCell>
                      <AppTableHeaderCell>Hours</AppTableHeaderCell>
                      <AppTableHeaderCell>Status</AppTableHeaderCell>
                      {adminMode && <AppTableHeaderCell>Override</AppTableHeaderCell>}
                    </AppTableRow>
                  </AppTableHead>
                  <AppTableBody>
                    {feedItems.map(({ kind, record }) => {
                      const canForceApprove = record.status !== STATUS.APPROVED && record.status !== STATUS.CANCELLED;
                      const canForceReject = record.status !== STATUS.REJECTED && record.status !== STATUS.CANCELLED;
                      const canCancel = kind === "timeoff" && record.status === STATUS.APPROVED;
                      return (
                        <AppTableRow key={`${kind}-${record.id}`}>
                          <AppTableCell className="font-medium text-slate-900">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{formatEntryDateRange(record)}</span>
                              {kind === "overtime" && record.date === (record.endDate || record.date) && (
                                <DayTypeBadge dateISO={record.date} holidays={state.holidays} />
                              )}
                            </div>
                          </AppTableCell>
                          <AppTableCell className="font-mono text-xs">
                            {kind === "timeoff" && record.allDay ? "All day" : `${record.startTime}–${record.endTime}`}
                            {kind === "overtime" && record.endsNextDay ? " (+1d)" : ""}
                          </AppTableCell>
                          <AppTableCell>
                            <Badge
                              variant="outline"
                              className={
                                kind === "overtime"
                                  ? "bg-cyan-50 text-cyan-700 border-cyan-200 text-[11px]"
                                  : "bg-violet-50 text-violet-700 border-violet-200 text-[11px]"
                              }
                            >
                              {kind === "overtime" ? "Overtime" : "Time Off"}
                            </Badge>
                          </AppTableCell>
                          <AppTableCell className="font-mono">{formatDurationMinutes(record.calculatedMinutes)}</AppTableCell>
                          <AppTableCell>
                            <StatusBadge status={record.status} />
                          </AppTableCell>
                          {adminMode && (
                            <AppTableCell>
                              <div className="flex items-center gap-1 flex-wrap">
                                {canForceApprove && (
                                  <CommentActionDialog
                                    triggerLabel="Force Approve"
                                    triggerVariant="ghost"
                                    title="Force-approve this record?"
                                    description="This is an administrator override, distinct from a normal approval. A reason is required and will be logged."
                                    onConfirm={(reason) => applyOverride(kind, record, STATUS.APPROVED, AUDIT_ACTION.FORCE_APPROVED, reason)}
                                  />
                                )}
                                {canForceReject && (
                                  <CommentActionDialog
                                    triggerLabel="Force Reject"
                                    triggerVariant="ghost"
                                    title="Force-reject this record?"
                                    description="This is an administrator override, distinct from a normal rejection. A reason is required and will be logged."
                                    onConfirm={(reason) => applyOverride(kind, record, STATUS.REJECTED, AUDIT_ACTION.FORCE_REJECTED, reason)}
                                  />
                                )}
                                {canCancel && (
                                  <CommentActionDialog
                                    triggerLabel="Cancel"
                                    triggerVariant="ghost"
                                    title="Cancel this approved time off?"
                                    description="This restores the balance it consumed. A reason is required and will be logged."
                                    onConfirm={(reason) => applyOverride(kind, record, STATUS.CANCELLED, AUDIT_ACTION.CANCELLED, reason)}
                                  />
                                )}
                              </div>
                            </AppTableCell>
                          )}
                        </AppTableRow>
                      );
                    })}
                  </AppTableBody>
                </AppTable>
              )}
            </div>
          </div>
        );
      })()}
    </>
  );

  return (
    <Dialog open={Boolean(personId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">{content}</DialogContent>
    </Dialog>
  );
}

// Recursive tree node for the Team Dashboard's hierarchy view. Naturally
// flat for Benjamin/Chloe (their reports have no reports of their own) and
// naturally nested for Amelia — same component, no branching needed.
function TeamTreeNode({ personId, state, onSelect }) {
  const person = getPersonById(state.people, personId);
  const children = getDirectReports(state.people, personId).filter((p) => p.eligible);
  const available = getAvailableToRequestMinutes(person, state.overtimeEntries, state.timeOffRequests, state.balanceAdjustments);
  const isInactive = person.active === false;

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => onSelect(personId)}
        className={`rounded-lg border bg-white shadow-sm px-3 py-2.5 min-w-[188px] text-left hover:border-cyan-300 hover:shadow transition-all ${
          isInactive ? "border-slate-200 opacity-60" : "border-slate-200"
        }`}
      >
        <div className="flex items-center gap-1.5">
          <div className="font-medium text-sm text-slate-900">{person.name}</div>
          {isInactive && (
            <span className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-1.5 py-0.5">
              Inactive
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-500">{person.jobTitle}</div>
        <div className="mt-1.5 text-sm font-mono font-semibold text-cyan-700">{formatDurationMinutes(available)}</div>
        <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wide">Available</div>
      </button>
      {children.length > 0 && (
        <div className="mt-3 border-l-2 border-slate-300 pl-4 flex flex-col gap-2.5">
          {children.map((child) => (
            <TeamTreeNode key={child.id} personId={child.id} state={state} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   TEAM ANALYTICS COMPONENTS (Prompt 7b)
   ========================================================================= */

function PeriodFilterControl({ periodType, onPeriodTypeChange, anchor, onAnchorChange, customStart, onCustomStartChange, customEnd, onCustomEndChange, todayISO }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={periodType} onValueChange={onPeriodTypeChange}>
        <SelectTrigger className="w-[140px] h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="month">Month</SelectItem>
          <SelectItem value="quarter">Quarter</SelectItem>
          <SelectItem value="year">Year</SelectItem>
          <SelectItem value="custom">Custom range</SelectItem>
        </SelectContent>
      </Select>

      {periodType === "custom" ? (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-44">
            <DatePickerField label="" valueISO={customStart} onChange={onCustomStartChange} maxDateISO={todayISO} />
          </div>
          <span className="text-slate-400 text-sm">to</span>
          <div className="w-44">
            <DatePickerField label="" valueISO={customEnd} onChange={onCustomEndChange} minDateISO={customStart} maxDateISO={todayISO} />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-1.5 py-1">
          <button
            type="button"
            onClick={() => onAnchorChange(shiftPeriodAnchor(periodType, anchor, -1))}
            className="p-1 rounded hover:bg-slate-100"
          >
            <ChevronLeft className="h-4 w-4 text-slate-500" />
          </button>
          <span className="text-sm font-medium text-slate-700 font-mono min-w-[110px] text-center">
            {getPeriodLabel(periodType, anchor)}
          </span>
          <button
            type="button"
            onClick={() => onAnchorChange(shiftPeriodAnchor(periodType, anchor, 1))}
            className="p-1 rounded hover:bg-slate-100"
          >
            <ChevronRight className="h-4 w-4 text-slate-500" />
          </button>
        </div>
      )}
    </div>
  );
}

function RankingChart({ scopePeople, overtimeEntries, periodRange, onSelectPerson }) {
  const rows = scopePeople
    .map((p) => {
      const approvedMinutes = sumMinutes(
        overtimeEntries,
        (e) => e.employeeId === p.id && e.status === STATUS.APPROVED && isDateInRange(e.date, periodRange.start, periodRange.end)
      );
      const pendingMinutes = sumMinutes(
        overtimeEntries,
        (e) =>
          e.employeeId === p.id &&
          (e.status === STATUS.PENDING || e.status === STATUS.CHANGES_REQUESTED) &&
          isDateInRange(e.date, periodRange.start, periodRange.end)
      );
      return { person: p, approvedMinutes, pendingMinutes };
    })
    .sort((a, b) => b.approvedMinutes - a.approvedMinutes);

  const maxMinutes = Math.max(1, ...rows.map((r) => r.approvedMinutes));

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {rows.map((r) => (
          <button
            key={r.person.id}
            type="button"
            onClick={() => onSelectPerson(r.person.id)}
            className="w-full text-left group"
          >
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium text-slate-700 group-hover:text-cyan-700">{r.person.name}</span>
              <span className="font-mono text-slate-500">
                {formatDurationMinutes(r.approvedMinutes)}
                {r.pendingMinutes > 0 && (
                  <span className="text-slate-400"> (+{formatDurationMinutes(r.pendingMinutes)} pending)</span>
                )}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-cyan-500 rounded-full transition-all"
                style={{ width: `${(r.approvedMinutes / maxMinutes) * 100}%` }}
              />
            </div>
          </button>
        ))}
      </div>

      <AppTable>
        <AppTableHead>
          <AppTableRow>
            <AppTableHeaderCell>Name</AppTableHeaderCell>
            <AppTableHeaderCell>Approved</AppTableHeaderCell>
            <AppTableHeaderCell>Pending</AppTableHeaderCell>
          </AppTableRow>
        </AppTableHead>
        <AppTableBody>
          {rows.map((r) => (
            <AppTableRow key={r.person.id} onClick={() => onSelectPerson(r.person.id)}>
              <AppTableCell className="font-medium text-slate-900">{r.person.name}</AppTableCell>
              <AppTableCell className="font-mono">{formatDurationMinutes(r.approvedMinutes)}</AppTableCell>
              <AppTableCell className="font-mono text-slate-500">{formatDurationMinutes(r.pendingMinutes)}</AppTableCell>
            </AppTableRow>
          ))}
        </AppTableBody>
      </AppTable>
    </div>
  );
}

function CategoryDonutChart({ scopeIds, overtimeEntries, workCodes, people, periodRange, onSelectPerson }) {
  const [selectedCode, setSelectedCode] = useState(null);

  const approvedInPeriod = overtimeEntries.filter(
    (e) => scopeIds.includes(e.employeeId) && e.status === STATUS.APPROVED && isDateInRange(e.date, periodRange.start, periodRange.end)
  );

  const totalsByCode = {};
  approvedInPeriod.forEach((e) => {
    totalsByCode[e.workCode] = (totalsByCode[e.workCode] || 0) + e.calculatedMinutes;
  });

  const totalMinutes = Object.values(totalsByCode).reduce((s, v) => s + v, 0);

  const categories = Object.entries(totalsByCode)
    .map(([code, minutes], i) => {
      const meta = workCodes.find((w) => w.code === code);
      return { code, label: meta ? meta.label : code, minutes, pct: totalMinutes > 0 ? (minutes / totalMinutes) * 100 : 0 };
    })
    .sort((a, b) => b.minutes - a.minutes)
    .map((c, i) => ({ ...c, color: CATEGORY_COLOR_PALETTE[i % CATEGORY_COLOR_PALETTE.length] }));

  if (categories.length === 0) {
    return <p className="text-sm text-slate-400 py-8 text-center">No approved overtime in this period.</p>;
  }

  let cumulative = 0;
  const gradientStops = categories
    .map((c) => {
      const start = cumulative;
      cumulative += c.pct;
      return `${c.color} ${start}% ${cumulative}%`;
    })
    .join(", ");

  const filteredEntries = selectedCode ? approvedInPeriod.filter((e) => e.workCode === selectedCode) : [];

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="flex flex-col items-center justify-center">
        <div className="relative w-40 h-40">
          <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(${gradientStops})` }} />
          <div className="absolute inset-[20%] rounded-full bg-white flex flex-col items-center justify-center shadow-sm">
            <div className="text-base font-semibold font-mono text-slate-900">{formatDurationMinutes(totalMinutes)}</div>
            <div className="text-[9px] text-slate-400 font-mono uppercase tracking-wide text-center">Approved OT</div>
          </div>
        </div>
      </div>

      <div>
        <div className="space-y-1.5">
          {categories.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => setSelectedCode((prev) => (prev === c.code ? null : c.code))}
              className={`w-full flex items-center justify-between text-xs px-2 py-1.5 rounded-md transition-colors ${
                selectedCode === c.code ? "bg-slate-100" : "hover:bg-slate-50"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                <span className="text-slate-700">{c.label}</span>
              </span>
              <span className="font-mono text-slate-500">
                {formatDurationMinutes(c.minutes)} · {c.pct.toFixed(0)}%
              </span>
            </button>
          ))}
        </div>

        {selectedCode && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5 max-h-40 overflow-y-auto">
            {filteredEntries.map((e) => {
              const emp = getPersonById(people, e.employeeId);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onSelectPerson(e.employeeId)}
                  className="w-full flex items-center justify-between text-[11px] text-left hover:bg-slate-50 px-1.5 py-1 rounded"
                >
                  <span className="text-slate-600">
                    {emp ? emp.name : e.employeeId} · {formatEntryDateRange(e)}
                  </span>
                  <span className="font-mono text-slate-500">{formatDurationMinutes(e.calculatedMinutes)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MonthlyTrendChart({ scopeIds, overtimeEntries, monthsBack }) {
  const months = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const y = d.getFullYear();
    const m = d.getMonth();
    const start = formatISODate(new Date(y, m, 1));
    const end = formatISODate(new Date(y, m + 1, 0));
    const minutes = sumMinutes(
      overtimeEntries,
      (e) => scopeIds.includes(e.employeeId) && e.status === STATUS.APPROVED && e.date >= start && e.date <= end
    );
    months.push({ label: `${MONTH_LABELS[m].slice(0, 3)} ${y}`, minutes });
  }

  const maxMinutes = Math.max(1, ...months.map((m) => m.minutes));

  return (
    <div>
      <div className="flex items-end gap-3 h-24">
        {months.map((m) => (
          <div key={m.label} className="flex-1 h-full flex flex-col justify-end items-center">
            <div
              className="w-full bg-cyan-500 rounded-t-sm transition-all"
              style={{ height: `${(m.minutes / maxMinutes) * 100}%`, minHeight: m.minutes > 0 ? "3px" : "0px" }}
              title={formatDurationMinutes(m.minutes)}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-1.5">
        {months.map((m) => (
          <div key={m.label} className="flex-1 text-center text-[10px] text-slate-400 font-mono">
            {m.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamTimeOffCalendar({ timeOffRequests, people, selectedDate, onSelectDate }) {
  const [viewDate, setViewDate] = useState(new Date());
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const approvedRequests = timeOffRequests.filter((r) => r.status === STATUS.APPROVED);
  const pendingRequests = timeOffRequests.filter((r) => r.status === STATUS.PENDING);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))} className="p-1 rounded hover:bg-slate-100">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-sm font-medium text-slate-800">
          {MONTH_LABELS[month]} {year}
        </div>
        <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))} className="p-1 rounded hover:bg-slate-100">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="text-center text-[10px] font-mono uppercase text-slate-400">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const dateISO = formatISODate(d);
          const hasApproved = approvedRequests.some((r) => isDateWithinEntry(dateISO, r));
          const hasPending = pendingRequests.some((r) => isDateWithinEntry(dateISO, r));
          const isSelected = selectedDate === dateISO;
          return (
            <button
              type="button"
              key={i}
              onClick={() => onSelectDate(dateISO)}
              className={`relative h-9 w-9 rounded-md text-sm flex items-center justify-center transition-colors ${
                isSelected
                  ? "bg-cyan-600 text-white font-medium"
                  : hasApproved || hasPending
                  ? "text-slate-700 hover:bg-slate-100"
                  : "text-slate-400 hover:bg-slate-50"
              }`}
            >
              {d.getDate()}
              {(hasApproved || hasPending) && (
                <span className="absolute bottom-1 flex gap-0.5">
                  {hasApproved && <span className={`h-1 w-1 rounded-full ${isSelected ? "bg-white" : "bg-emerald-500"}`} />}
                  {hasPending && <span className={`h-1 w-1 rounded-full ${isSelected ? "bg-white" : "bg-amber-500"}`} />}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Approved
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Pending
        </span>
      </div>
    </div>
  );
}

function TeamDashboardPage({ onNavigate }) {
  const state = useAppState();
  const officer = getPersonById(state.people, state.currentUserId);
  const todayISO = formatISODate(new Date());
  const [drilldownId, setDrilldownId] = useState(null);
  const [periodType, setPeriodType] = useState("month");
  const [periodAnchor, setPeriodAnchor] = useState(new Date());
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [teamCalendarSelectedDate, setTeamCalendarSelectedDate] = useState(todayISO);

  if (!hasRole(officer, ROLE.REPORTING_OFFICER)) {
    return (
      <PlaceholderPage
        title="Team Dashboard"
        icon={Users}
        description="This section isn't applicable to your role."
      />
    );
  }

  const directReportPeople = getDirectReports(state.people, officer.id).filter((p) => p.eligible);
  const scopePeople = getAllReportsUnderScope(state.people, officer.id);
  const scopeIds = scopePeople.map((p) => p.id);
  const hasIndirectReports = scopeIds.length > directReportPeople.length;

  const actionableQueueCount = getPendingApprovalQueueCount(officer.id, state, todayISO);
  const departmentPendingCount = hasIndirectReports ? getScopePendingCount(scopeIds, state) : null;
  const statusBreakdown = getStatusBreakdown(scopeIds, state);
  const oldest = getOldestPendingItem(scopeIds, state);
  const oldestEmployee = oldest ? getPersonById(state.people, oldest.record.employeeId) : null;

  const periodRange = computePeriodRange(periodType, periodAnchor, customStart, customEnd);
  const periodValid = Boolean(periodRange.start && periodRange.end);

  const teamApprovedOvertimeMinutes = periodValid
    ? sumMinutes(
        state.overtimeEntries,
        (e) => scopeIds.includes(e.employeeId) && e.status === STATUS.APPROVED && isDateInRange(e.date, periodRange.start, periodRange.end)
      )
    : 0;
  const teamApprovedTimeOffMinutes = periodValid
    ? sumMinutes(
        state.timeOffRequests,
        (r) => scopeIds.includes(r.employeeId) && r.status === STATUS.APPROVED && isDateInRange(r.date, periodRange.start, periodRange.end)
      )
    : 0;

  const scopeTimeOffRequests = state.timeOffRequests.filter((r) => scopeIds.includes(r.employeeId));
  const teamCalendarDayItems = scopeTimeOffRequests.filter(
    (r) => isDateWithinEntry(teamCalendarSelectedDate, r) && (r.status === STATUS.APPROVED || r.status === STATUS.PENDING)
  );

  const selectedDayNonWorkingLabel = getNonWorkingDayLabel(teamCalendarSelectedDate, state.holidays);
  const selectedDayApproved = scopeTimeOffRequests.filter((r) => isDateWithinEntry(teamCalendarSelectedDate, r) && r.status === STATUS.APPROVED);
  const selectedDayPending = scopeTimeOffRequests.filter((r) => isDateWithinEntry(teamCalendarSelectedDate, r) && r.status === STATUS.PENDING);
  const selectedDayAwayCount = new Set(selectedDayApproved.map((r) => r.employeeId)).size;
  const selectedDayAvailableCount = Math.max(0, scopePeople.length - selectedDayAwayCount);

  return (
    <div>
      <PageHeader
        eyebrow="Team Dashboard"
        title="Team Overview"
        description="Balances and pending activity for your team."
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <DashboardStatTile
          label="Pending Approvals"
          value={String(actionableQueueCount)}
          sublabel="Awaiting your action"
          onClick={() => onNavigate && onNavigate("approvals")}
        />

        {hasIndirectReports && (
          <Card className="border-slate-200 bg-slate-50">
            <CardContent className="p-4">
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Department Pending
              </div>
              <div className="mt-2 text-2xl font-semibold font-mono text-slate-500">{departmentPendingCount}</div>
              <div className="mt-1 text-[11px] text-slate-400">
                Visibility only, across your full reporting line — not yours to action
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Oldest Pending</div>
            {oldest ? (
              <button
                type="button"
                onClick={() => setDrilldownId(oldest.record.employeeId)}
                className="mt-2 block text-left hover:underline"
              >
                <div className="text-sm font-semibold text-slate-900">{oldestEmployee ? oldestEmployee.name : "—"}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {oldest.kind === "overtime" ? "Overtime" : "Time Off"} · waiting {formatWaitingDuration(oldest.since)}
                </div>
              </button>
            ) : (
              <div className="mt-2 text-sm text-slate-400">Nothing pending</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2">
              Status Breakdown
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Pending</span>
                <span className="font-mono">{statusBreakdown[STATUS.PENDING]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Approved</span>
                <span className="font-mono">{statusBreakdown[STATUS.APPROVED]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Rejected</span>
                <span className="font-mono">{statusBreakdown[STATUS.REJECTED]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Changes Req.</span>
                <span className="font-mono">{statusBreakdown[STATUS.CHANGES_REQUESTED]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Withdrawn</span>
                <span className="font-mono">{statusBreakdown[STATUS.WITHDRAWN]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Cancelled</span>
                <span className="font-mono">{statusBreakdown[STATUS.CANCELLED]}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-sm font-medium text-slate-500">Period</CardTitle>
            <PeriodFilterControl
              periodType={periodType}
              onPeriodTypeChange={setPeriodType}
              anchor={periodAnchor}
              onAnchorChange={setPeriodAnchor}
              customStart={customStart}
              onCustomStartChange={setCustomStart}
              customEnd={customEnd}
              onCustomEndChange={setCustomEnd}
              todayISO={todayISO}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Approved Overtime Earned
              </div>
              <div className="mt-1 text-2xl font-semibold font-mono text-cyan-700">
                {periodValid ? formatDurationMinutes(teamApprovedOvertimeMinutes) : "—"}
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Approved Time-Off Used
              </div>
              <div className="mt-1 text-2xl font-semibold font-mono text-violet-700">
                {periodValid ? formatDurationMinutes(teamApprovedTimeOffMinutes) : "—"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Overtime Ranking</CardTitle>
          </CardHeader>
          <CardContent>
            {periodValid ? (
              <RankingChart
                scopePeople={scopePeople}
                overtimeEntries={state.overtimeEntries}
                periodRange={periodRange}
                onSelectPerson={setDrilldownId}
              />
            ) : (
              <p className="text-sm text-slate-400 py-8 text-center">Select a complete custom range.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Work Category Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {periodValid ? (
              <CategoryDonutChart
                scopeIds={scopeIds}
                overtimeEntries={state.overtimeEntries}
                workCodes={state.workCodes}
                people={state.people}
                periodRange={periodRange}
                onSelectPerson={setDrilldownId}
              />
            ) : (
              <p className="text-sm text-slate-400 py-8 text-center">Select a complete custom range.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">Monthly Overtime Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyTrendChart scopeIds={scopeIds} overtimeEntries={state.overtimeEntries} monthsBack={6} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium text-slate-500">Team Balances</CardTitle>
          <ExportCsvButton />
        </CardHeader>
        <CardContent className="p-0">
          <AppTable>
            <AppTableHead>
              <AppTableRow>
                <AppTableHeaderCell>Name</AppTableHeaderCell>
                <AppTableHeaderCell>Job Title</AppTableHeaderCell>
                <AppTableHeaderCell>Available Balance</AppTableHeaderCell>
                <AppTableHeaderCell>Reserved</AppTableHeaderCell>
                <AppTableHeaderCell>Used This Year</AppTableHeaderCell>
              </AppTableRow>
            </AppTableHead>
            <AppTableBody>
              {scopePeople.map((p) => {
                const approved = getApprovedBalanceMinutes(p, state.overtimeEntries, state.timeOffRequests, state.balanceAdjustments);
                const reserved = getReservedMinutes(state.timeOffRequests, p.id);
                const available = approved - reserved;
                const used = getUsedThisYearMinutes(p, state.timeOffRequests);
                const overCap = isOverToilBalanceCap(p, state.overtimeEntries, state.timeOffRequests, state.balanceAdjustments, state.policy);
                return (
                  <AppTableRow key={p.id} onClick={() => setDrilldownId(p.id)}>
                    <AppTableCell className="font-medium text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <span>{p.name}</span>
                        {p.active === false && (
                          <span className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-1.5 py-0.5">
                            Inactive
                          </span>
                        )}
                      </div>
                    </AppTableCell>
                    <AppTableCell className="text-slate-500">{p.jobTitle}</AppTableCell>
                    <AppTableCell className="font-mono">
                      <span className="inline-flex items-center gap-1.5">
                        {formatDurationMinutes(available)}
                        {overCap && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" title="Over accumulation threshold" />}
                      </span>
                    </AppTableCell>
                    <AppTableCell className="font-mono">{formatDurationMinutes(reserved)}</AppTableCell>
                    <AppTableCell className="font-mono">{formatDurationMinutes(used)}</AppTableCell>
                  </AppTableRow>
                );
              })}
            </AppTableBody>
          </AppTable>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-500">Team Hierarchy</CardTitle>
        </CardHeader>
        <CardContent className="p-6 overflow-x-auto">
          <div className="flex gap-8 items-start min-w-max">
            {directReportPeople.map((p) => (
              <TeamTreeNode key={p.id} personId={p.id} state={state} onSelect={setDrilldownId} />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">Team Time-Off Calendar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-2">
            <TeamTimeOffCalendar
              timeOffRequests={scopeTimeOffRequests}
              people={state.people}
              selectedDate={teamCalendarSelectedDate}
              onSelectDate={setTeamCalendarSelectedDate}
            />
            <div className="lg:border-l lg:border-slate-100 lg:pl-6">
              <div className="text-xs font-mono uppercase tracking-wide text-slate-400 mb-2">
                {formatManpowerDateLabel(teamCalendarSelectedDate)}
              </div>

              {selectedDayNonWorkingLabel ? (
                <p className="text-sm text-slate-400">{selectedDayNonWorkingLabel}</p>
              ) : (
                <>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 space-y-1 font-mono text-sm text-slate-700 mb-3">
                    <div>
                      {selectedDayAvailableCount} of {scopePeople.length} team members available
                    </div>
                    <div>
                      {selectedDayApproved.length} approved time-off request{selectedDayApproved.length === 1 ? "" : "s"}
                    </div>
                    <div>
                      {selectedDayPending.length} pending time-off request{selectedDayPending.length === 1 ? "" : "s"}
                    </div>
                  </div>

                  {teamCalendarDayItems.length === 0 ? (
                    <p className="text-sm text-slate-400">No one on time off this day.</p>
                  ) : (
                    <div className="space-y-2">
                      {teamCalendarDayItems.map((r) => {
                        const emp = getPersonById(state.people, r.employeeId);
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setDrilldownId(r.employeeId)}
                            className="w-full flex items-center justify-between text-sm hover:bg-slate-50 px-1.5 py-1 rounded"
                          >
                            <span className="text-slate-700">{emp ? emp.name : r.employeeId}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-slate-500">
                                {r.allDay ? "All day" : `${r.startTime}–${r.endTime}`}
                              </span>
                              <StatusBadge status={r.status} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <EmployeeDrilldownDialog personId={drilldownId} onOpenChange={(open) => !open && setDrilldownId(null)} />
    </div>
  );
}

/* =========================================================================
   ADMINISTRATION (Prompt 8a) — reference data & hierarchy
   ========================================================================= */

function HierarchyAdminTab() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [feedback, setFeedback] = useState(null);

  const editablePeople = state.people.filter((p) => p.id !== "amelia");

  function handleReassign(personId, newManagerId) {
    const person = getPersonById(state.people, personId);
    const manager = getPersonById(state.people, newManagerId);
    dispatch({ type: "UPDATE_PERSON", payload: { id: personId, updates: { reportsTo: newManagerId } } });
    setFeedback(`${person.name} now reports to ${manager.name}. Approval routing and dashboard scope updated immediately.`);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Amelia Tan sits at the top of the department and isn't reassignable. The "Reports To" choices below are
        limited to people who hold the Reporting Officer role — assigning someone to a non-officer would silently
        orphan their approval routing, since only Reporting Officers (or an active covering delegate) have an
        Approvals queue to receive it. Changing a reporting line takes effect immediately — approval routing and
        Team Dashboard scoping always look up the current reporting line live, never a frozen value.
      </p>
      {feedback && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {feedback}
        </div>
      )}
      <AppTable>
        <AppTableHead>
          <AppTableRow>
            <AppTableHeaderCell>Name</AppTableHeaderCell>
            <AppTableHeaderCell>Job Title</AppTableHeaderCell>
            <AppTableHeaderCell>Reports To</AppTableHeaderCell>
          </AppTableRow>
        </AppTableHead>
        <AppTableBody>
          {editablePeople.map((p) => {
            const validManagers = state.people.filter(
              (c) =>
                c.id !== p.id &&
                c.active !== false &&
                hasRole(c, ROLE.REPORTING_OFFICER) &&
                !wouldCreateReportingCycle(state.people, p.id, c.id)
            );
            return (
              <AppTableRow key={p.id}>
                <AppTableCell className="font-medium text-slate-900">{p.name}</AppTableCell>
                <AppTableCell className="text-slate-500">{p.jobTitle}</AppTableCell>
                <AppTableCell>
                  <Select value={p.reportsTo || ""} onValueChange={(v) => handleReassign(p.id, v)}>
                    <SelectTrigger className="w-[220px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {validManagers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </AppTableCell>
              </AppTableRow>
            );
          })}
        </AppTableBody>
      </AppTable>
    </div>
  );
}

function WorkCodeFormDialog({ open, onOpenChange, initial, existingCodes, onSubmit }) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const isEdit = Boolean(initial);

  useEffect(() => {
    setCode(initial ? initial.code : "");
    setLabel(initial ? initial.label : "");
  }, [initial, open]);

  const normalizedCode = code.trim().toUpperCase();
  const codeTaken = !isEdit && existingCodes.includes(normalizedCode);
  const canSubmit = Boolean(normalizedCode && label.trim() && !codeTaken);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Work Code" : "Add Work Code"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Code</label>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} disabled={isEdit} placeholder="e.g. XY11" />
            {codeTaken && <p className="text-xs text-rose-600">This code already exists.</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Category</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Facilities Support" />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <Button
            disabled={!canSubmit}
            onClick={() => {
              onSubmit({ code: normalizedCode, label: label.trim() });
              onOpenChange(false);
            }}
          >
            {isEdit ? "Save Changes" : "Add Code"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WorkCodesAdminTab() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCode, setEditingCode] = useState(null);

  function handleSubmit(values) {
    if (editingCode) {
      dispatch({ type: "UPDATE_WORK_CODE", payload: { code: editingCode.code, updates: { label: values.label } } });
    } else {
      dispatch({ type: "ADD_WORK_CODE", payload: { code: values.code, label: values.label, active: true } });
    }
  }

  function toggleActive(w) {
    dispatch({ type: "UPDATE_WORK_CODE", payload: { code: w.code, updates: { active: w.active === false } } });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500 max-w-xl">
          Deactivating a code removes it from the overtime form's options without affecting historical entries
          that already used it — codes are never hard-deleted.
        </p>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setEditingCode(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Work Code
        </Button>
      </div>
      <AppTable>
        <AppTableHead>
          <AppTableRow>
            <AppTableHeaderCell>Code</AppTableHeaderCell>
            <AppTableHeaderCell>Category</AppTableHeaderCell>
            <AppTableHeaderCell>Status</AppTableHeaderCell>
            <AppTableHeaderCell>Actions</AppTableHeaderCell>
          </AppTableRow>
        </AppTableHead>
        <AppTableBody>
          {state.workCodes.map((w) => (
            <AppTableRow key={w.code}>
              <AppTableCell className="font-mono font-medium text-slate-900">{w.code}</AppTableCell>
              <AppTableCell>{w.label}</AppTableCell>
              <AppTableCell>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                    w.active !== false
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-slate-100 text-slate-500 border-slate-200"
                  }`}
                >
                  {w.active !== false ? "Active" : "Inactive"}
                </span>
              </AppTableCell>
              <AppTableCell>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() => {
                      setEditingCode(w);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => toggleActive(w)}>
                    {w.active !== false ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
              </AppTableCell>
            </AppTableRow>
          ))}
        </AppTableBody>
      </AppTable>

      <WorkCodeFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editingCode}
        existingCodes={state.workCodes.map((w) => w.code)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function HolidayFormDialog({ open, onOpenChange, initial, onSubmit }) {
  const [dateISO, setDateISO] = useState("");
  const [name, setName] = useState("");
  const isEdit = Boolean(initial);

  useEffect(() => {
    setDateISO(initial ? initial.date : "");
    setName(initial ? initial.name : "");
  }, [initial, open]);

  const canSubmit = Boolean(dateISO && name.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Public Holiday" : "Add Public Holiday"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <DatePickerField label="Date" valueISO={dateISO} onChange={setDateISO} required />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Deepavali" />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <Button
            disabled={!canSubmit}
            onClick={() => {
              onSubmit({ date: dateISO, name: name.trim() });
              onOpenChange(false);
            }}
          >
            {isEdit ? "Save Changes" : "Add Holiday"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HolidaysAdminTab() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [pendingRemoval, setPendingRemoval] = useState(null);

  const sorted = [...state.holidays].sort((a, b) => (a.date < b.date ? -1 : 1));

  function handleSubmit(values) {
    if (editingHoliday) {
      dispatch({ type: "UPDATE_HOLIDAY", payload: { id: editingHoliday.id, updated: { ...editingHoliday, ...values } } });
    } else {
      dispatch({ type: "ADD_HOLIDAY", payload: { id: `ho-${Date.now()}`, ...values } });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500 max-w-xl">
          Changes only affect overtime and time-off calculated going forward — already-submitted or already-
          approved records keep the hours they were originally calculated with.
        </p>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setEditingHoliday(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Holiday
        </Button>
      </div>
      <AppTable>
        <AppTableHead>
          <AppTableRow>
            <AppTableHeaderCell>Date</AppTableHeaderCell>
            <AppTableHeaderCell>Name</AppTableHeaderCell>
            <AppTableHeaderCell>Actions</AppTableHeaderCell>
          </AppTableRow>
        </AppTableHead>
        <AppTableBody>
          {sorted.map((h) => (
            <AppTableRow key={h.id}>
              <AppTableCell className="font-medium text-slate-900">{formatDateWithWeekday(h.date)}</AppTableCell>
              <AppTableCell>{h.name}</AppTableCell>
              <AppTableCell>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() => {
                      setEditingHoliday(h);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1 text-rose-600"
                    onClick={() => setPendingRemoval(h)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                </div>
              </AppTableCell>
            </AppTableRow>
          ))}
        </AppTableBody>
      </AppTable>

      <HolidayFormDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editingHoliday} onSubmit={handleSubmit} />

      <AlertDialog open={Boolean(pendingRemoval)} onOpenChange={(o) => !o && setPendingRemoval(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this holiday?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemoval &&
                `${pendingRemoval.name} (${formatDateWithWeekday(pendingRemoval.date)}) will no longer be treated as a public holiday for future entries.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                dispatch({ type: "REMOVE_HOLIDAY", payload: { id: pendingRemoval.id } });
                setPendingRemoval(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ScheduleAdminTab() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [officeStart, setOfficeStart] = useState(state.policy.OFFICE_START);
  const [officeEnd, setOfficeEnd] = useState(state.policy.OFFICE_END);
  const [lunchStart, setLunchStart] = useState(state.policy.LUNCH_START);
  const [lunchEnd, setLunchEnd] = useState(state.policy.LUNCH_END);
  const [savedMessage, setSavedMessage] = useState(null);
  const [capHours, setCapHours] = useState(String(state.policy.balanceAlertThresholdHours ?? 0));
  const [capSavedMessage, setCapSavedMessage] = useState(null);

  const officeValid = timeStringToMinutes(officeEnd) > timeStringToMinutes(officeStart);
  const lunchValid = timeStringToMinutes(lunchEnd) > timeStringToMinutes(lunchStart);
  const lunchWithinOffice =
    timeStringToMinutes(lunchStart) >= timeStringToMinutes(officeStart) &&
    timeStringToMinutes(lunchEnd) <= timeStringToMinutes(officeEnd);
  const canSave = officeValid && lunchValid && lunchWithinOffice;

  function handleSave() {
    if (!canSave) return;
    dispatch({
      type: "UPDATE_POLICY",
      payload: { OFFICE_START: officeStart, OFFICE_END: officeEnd, LUNCH_START: lunchStart, LUNCH_END: lunchEnd },
    });
    setSavedMessage("Schedule updated — this applies to every overtime and time-off calculation from now on.");
  }

  const parsedCapHours = parseFloat(capHours);
  const capValid = Number.isFinite(parsedCapHours) && parsedCapHours > 0;

  function handleSaveCap() {
    if (!capValid) return;
    dispatch({ type: "UPDATE_POLICY", payload: { balanceAlertThresholdHours: parsedCapHours } });
    setCapSavedMessage(`Accumulation alert threshold set to ${formatDurationMinutes(Math.round(parsedCapHours * 60))}.`);
  }

  return (
    <div className="space-y-8 max-w-xl">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          This prototype covers a single department on one shared schedule, so there's one setting here rather
          than per-person schedules.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TimePickerField label="Office Start" value24={officeStart} onChange={setOfficeStart} required />
          <TimePickerField label="Office End" value24={officeEnd} onChange={setOfficeEnd} required />
          <TimePickerField label="Lunch Start" value24={lunchStart} onChange={setLunchStart} required />
          <TimePickerField label="Lunch End" value24={lunchEnd} onChange={setLunchEnd} required />
        </div>
        {!officeValid && <p className="text-sm text-rose-600">Office end must be after office start.</p>}
        {officeValid && !lunchValid && <p className="text-sm text-rose-600">Lunch end must be after lunch start.</p>}
        {officeValid && lunchValid && !lunchWithinOffice && (
          <p className="text-sm text-rose-600">The lunch window must fall within office hours.</p>
        )}
        {savedMessage && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {savedMessage}
          </div>
        )}
        <Button onClick={handleSave} disabled={!canSave}>
          Save Changes
        </Button>
      </div>

      <div className="space-y-3 pt-6 border-t border-slate-100">
        <div>
          <div className="text-sm font-medium text-slate-700">TOIL Balance Accumulation Alert</div>
          <p className="text-xs text-slate-500 mt-0.5">
            Flags anyone whose banked TOIL balance reaches this many hours — informational only, it doesn't block
            overtime submission or approval.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="0.5"
            step="0.5"
            value={capHours}
            onChange={(e) => setCapHours(e.target.value)}
            className="w-28"
          />
          <span className="text-sm text-slate-500">hours</span>
        </div>
        {!capValid && <p className="text-sm text-rose-600">Enter a positive number of hours.</p>}
        {capSavedMessage && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {capSavedMessage}
          </div>
        )}
        <Button onClick={handleSaveCap} disabled={!capValid}>
          Save Threshold
        </Button>
      </div>
    </div>
  );
}

// Prompt 12: a brand-new person can never already be part of an existing
// reporting cycle (nothing points to them yet), so unlike the hierarchy
// editor's reassignment dropdown, every current person is a valid "reports
// to" choice here — the circular-reference concern is vacuously satisfied
// for a new leaf node.
function AddPersonDialog({ open, onOpenChange }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [reportsTo, setReportsTo] = useState("");
  const [isEmployee, setIsEmployee] = useState(true);
  const [isReportingOfficer, setIsReportingOfficer] = useState(false);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [eligible, setEligible] = useState(true);

  useEffect(() => {
    if (open) {
      setName("");
      setJobTitle("");
      setReportsTo("");
      setIsEmployee(true);
      setIsReportingOfficer(false);
      setIsSystemAdmin(false);
      setEligible(true);
    }
  }, [open]);

  const roleCount = [isEmployee, isReportingOfficer, isSystemAdmin].filter(Boolean).length;
  const canSubmit = Boolean(name.trim() && jobTitle.trim() && reportsTo && roleCount > 0);

  function handleSubmit() {
    if (!canSubmit) return;
    const systemRoles = [];
    if (isEmployee) systemRoles.push(ROLE.EMPLOYEE);
    if (isReportingOfficer) systemRoles.push(ROLE.REPORTING_OFFICER);
    if (isSystemAdmin) systemRoles.push(ROLE.SYSTEM_ADMINISTRATOR);

    const newPerson = {
      id: `person-${Date.now()}`,
      name: name.trim(),
      jobTitle: jobTitle.trim(),
      reportsTo,
      systemRoles,
      eligible,
      schedule: WORKING_SCHEDULE,
      actingAsApproverFor: null,
      // Starting balance is always zero — use the Balance Adjustment tool
      // afterward for anyone transferring in with existing TOIL.
      openingBalanceMinutes: 0,
      // Unset even if given the Reporting Officer role — there's nothing to
      // choose from until they have direct reports of their own.
      designatedCoveringOfficerId: null,
      active: true,
    };
    dispatch({ type: "ADD_PERSON", payload: newPerson });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Person</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Name <span className="text-rose-500">*</span>
              </label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Nair" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Job Title <span className="text-rose-500">*</span>
              </label>
              <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Executive" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Reports To <span className="text-rose-500">*</span>
            </label>
            <Select value={reportsTo} onValueChange={setReportsTo}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reporting officer" />
              </SelectTrigger>
              <SelectContent>
                {state.people
                  .filter((p) => p.active !== false && hasRole(p, ROLE.REPORTING_OFFICER))
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {p.jobTitle}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              System Role(s) <span className="text-rose-500">*</span>
            </label>
            <div className="space-y-2 rounded-md border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700">Employee</span>
                <Switch checked={isEmployee} onCheckedChange={setIsEmployee} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700">Reporting Officer</span>
                <Switch checked={isReportingOfficer} onCheckedChange={setIsReportingOfficer} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700">System Administrator</span>
                <Switch checked={isSystemAdmin} onCheckedChange={setIsSystemAdmin} />
              </div>
            </div>
            {roleCount === 0 && <p className="text-xs text-rose-600">Select at least one system role.</p>}
          </div>

          <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2.5">
            <div>
              <div className="text-sm font-medium text-slate-700">
                {eligible ? "Overtime Eligible" : "Exempt from Overtime"}
              </div>
              <div className="text-xs text-slate-500">Whether this person accrues and requests overtime/TOIL.</div>
            </div>
            <Switch checked={eligible} onCheckedChange={setEligible} />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <Button disabled={!canSubmit} onClick={handleSubmit}>
            Add Person
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Correction prompt: editing an existing person's roles and eligibility.
// Adding a role is always allowed; removing Reporting Officer or System
// Administrator is blocked while getReportingOfficerRemovalBlockers /
// isSoleSystemAdministrator say it's unsafe, with a clear reason shown
// rather than silently failing.
function EditPersonDialog({ personId, onOpenChange }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const admin = getPersonById(state.people, state.currentUserId);
  const todayISO = formatISODate(new Date());
  const person = personId ? getPersonById(state.people, personId) : null;

  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [isEmployee, setIsEmployee] = useState(false);
  const [isReportingOfficer, setIsReportingOfficer] = useState(false);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [eligible, setEligible] = useState(false);
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);

  useEffect(() => {
    if (person) {
      setName(person.name);
      setJobTitle(person.jobTitle);
      setIsEmployee(person.systemRoles.includes(ROLE.EMPLOYEE));
      setIsReportingOfficer(person.systemRoles.includes(ROLE.REPORTING_OFFICER));
      setIsSystemAdmin(person.systemRoles.includes(ROLE.SYSTEM_ADMINISTRATOR));
      setEligible(person.eligible);
      setDeactivateConfirmOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  if (!person) {
    return (
      <Dialog open={false} onOpenChange={onOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }

  const officerRemovalBlockers = hasRole(person, ROLE.REPORTING_OFFICER)
    ? getReportingOfficerRemovalBlockers(person, state, todayISO)
    : [];
  const officerToggleLocked = hasRole(person, ROLE.REPORTING_OFFICER) && officerRemovalBlockers.length > 0;
  const adminToggleLocked = isSoleSystemAdministrator(person, state.people);

  const roleCount = [isEmployee, isReportingOfficer, isSystemAdmin].filter(Boolean).length;
  const canSubmit = Boolean(name.trim() && jobTitle.trim() && roleCount > 0);

  function handleSubmit() {
    if (!canSubmit) return;
    const systemRoles = [];
    if (isEmployee) systemRoles.push(ROLE.EMPLOYEE);
    if (isReportingOfficer) systemRoles.push(ROLE.REPORTING_OFFICER);
    if (isSystemAdmin) systemRoles.push(ROLE.SYSTEM_ADMINISTRATOR);
    dispatch({
      type: "UPDATE_PERSON",
      payload: {
        id: person.id,
        updates: {
          name: name.trim(),
          jobTitle: jobTitle.trim(),
          systemRoles,
          eligible,
          // Newly added -> starts unset; kept -> preserved; removed -> cleared.
          designatedCoveringOfficerId: isReportingOfficer ? person.designatedCoveringOfficerId || null : null,
        },
      },
    });
    onOpenChange(false);
  }

  // --- Deactivation (Prompt 13) ---
  const isActive = person.active !== false;
  const deactivationBlockers = isActive ? getDeactivationBlockers(person, state, todayISO) : [];
  const directReportsOfPerson = getDirectReports(state.people, person.id);
  const forfeitAmount = getAvailableToRequestMinutes(person, state.overtimeEntries, state.timeOffRequests, state.balanceAdjustments);
  const reassignTarget = person.reportsTo ? getPersonById(state.people, person.reportsTo) : null;

  function handleDeactivateConfirmed() {
    // 1. Reassign any direct reports to this person's own reporting officer.
    directReportsOfPerson.forEach((r) => {
      dispatch({ type: "UPDATE_PERSON", payload: { id: r.id, updates: { reportsTo: person.reportsTo } } });
    });

    // 2. Clear this person's designation as anyone's covering officer.
    state.people.forEach((p) => {
      if (p.designatedCoveringOfficerId === person.id) {
        dispatch({ type: "UPDATE_PERSON", payload: { id: p.id, updates: { designatedCoveringOfficerId: null } } });
      }
    });

    // 3. Forfeit their balance — safe because deactivation was blocked while
    // anything was pending, so nothing here is a moving target.
    if (forfeitAmount !== 0) {
      const adjustment = {
        id: `adj-${Date.now()}`,
        employeeId: person.id,
        amountMinutes: -forfeitAmount,
        reason: "Forfeited upon deactivation.",
        byId: admin.id,
        byName: admin.name,
        at: new Date().toISOString(),
      };
      dispatch({ type: "ADD_BALANCE_ADJUSTMENT", payload: adjustment });
    }

    // 4. Mark inactive.
    dispatch({ type: "UPDATE_PERSON", payload: { id: person.id, updates: { active: false } } });

    setDeactivateConfirmOpen(false);
    onOpenChange(false);
  }

  function handleReactivate() {
    dispatch({ type: "UPDATE_PERSON", payload: { id: person.id, updates: { active: true } } });
  }

  return (
    <Dialog open={Boolean(personId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Edit {person.name}
            {!isActive && <span className="text-slate-400 font-normal"> — Inactive</span>}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Name <span className="text-rose-500">*</span>
              </label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Job Title <span className="text-rose-500">*</span>
              </label>
              <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              System Role(s) <span className="text-rose-500">*</span>
            </label>
            <div className="space-y-3 rounded-md border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700">Employee</span>
                <Switch checked={isEmployee} onCheckedChange={setIsEmployee} />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">Reporting Officer</span>
                  <Switch
                    checked={isReportingOfficer}
                    disabled={isReportingOfficer && officerToggleLocked}
                    onCheckedChange={(checked) => {
                      if (!checked && officerToggleLocked) return;
                      setIsReportingOfficer(checked);
                    }}
                  />
                </div>
                {isReportingOfficer && officerToggleLocked && (
                  <p className="text-xs text-rose-600 mt-1">
                    Can't remove Reporting Officer — {officerRemovalBlockers.join("; ")}.
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">System Administrator</span>
                  <Switch
                    checked={isSystemAdmin}
                    disabled={isSystemAdmin && adminToggleLocked}
                    onCheckedChange={(checked) => {
                      if (!checked && adminToggleLocked) return;
                      setIsSystemAdmin(checked);
                    }}
                  />
                </div>
                {isSystemAdmin && adminToggleLocked && (
                  <p className="text-xs text-rose-600 mt-1">
                    Can't remove System Administrator — {person.name} is the only active person who currently holds
                    it.
                  </p>
                )}
              </div>
            </div>
            {roleCount === 0 && <p className="text-xs text-rose-600">Select at least one system role.</p>}
          </div>

          <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2.5">
            <div>
              <div className="text-sm font-medium text-slate-700">
                {eligible ? "Overtime Eligible" : "Exempt from Overtime"}
              </div>
              <div className="text-xs text-slate-500">Whether this person accrues and requests overtime/TOIL.</div>
            </div>
            <Switch checked={eligible} onCheckedChange={setEligible} />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <Button disabled={!canSubmit} onClick={handleSubmit}>
            Save Changes
          </Button>
        </div>

        <div className="pt-4 mt-2 border-t border-slate-100">
          {isActive ? (
            <div className="space-y-2">
              {deactivationBlockers.length > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {formatDeactivationBlockMessage(person, deactivationBlockers)}
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  Deactivating will forfeit their current balance ({formatDurationMinutes(Math.max(0, forfeitAmount))})
                  {directReportsOfPerson.length > 0 &&
                    ` and reassign ${directReportsOfPerson.length} direct report${
                      directReportsOfPerson.length === 1 ? "" : "s"
                    } to ${reassignTarget ? reassignTarget.name : "—"}`}
                  .
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="text-rose-600 border-rose-200 hover:bg-rose-50"
                disabled={deactivationBlockers.length > 0}
                onClick={() => setDeactivateConfirmOpen(true)}
              >
                Deactivate
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">This person is currently inactive.</p>
              <Button variant="outline" size="sm" onClick={handleReactivate}>
                Reactivate
              </Button>
            </div>
          )}
        </div>
      </DialogContent>

      <AlertDialog open={deactivateConfirmOpen} onOpenChange={setDeactivateConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {person.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will forfeit their current balance of {formatDurationMinutes(Math.max(0, forfeitAmount))} (logged
              as "Forfeited upon deactivation") and cannot be undone.
              {directReportsOfPerson.length > 0 &&
                ` Their ${directReportsOfPerson.length} direct report${
                  directReportsOfPerson.length === 1 ? "" : "s"
                } will be reassigned to ${reassignTarget ? reassignTarget.name : "—"}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivateConfirmed}>Deactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function RecordsAdminTab() {
  const state = useAppState();
  const [drilldownId, setDrilldownId] = useState(null);
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [editPersonId, setEditPersonId] = useState(null);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <p className="text-sm text-slate-500 max-w-xl">
          Click a person to open their drill-down, where you can apply balance adjustments and override individual
          record statuses. Use Edit to change a person's roles, name, job title, or overtime eligibility.
        </p>
        <div className="flex items-center gap-2">
          <ExportCsvButton />
          <Button size="sm" className="gap-1.5" onClick={() => setAddPersonOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add Person
          </Button>
        </div>
      </div>
      <AppTable>
        <AppTableHead>
          <AppTableRow>
            <AppTableHeaderCell>Name</AppTableHeaderCell>
            <AppTableHeaderCell>Job Title</AppTableHeaderCell>
            <AppTableHeaderCell>Reports To</AppTableHeaderCell>
            <AppTableHeaderCell>Status</AppTableHeaderCell>
            <AppTableHeaderCell>Available</AppTableHeaderCell>
            <AppTableHeaderCell>Reserved</AppTableHeaderCell>
            <AppTableHeaderCell>Used This Year</AppTableHeaderCell>
            <AppTableHeaderCell>Actions</AppTableHeaderCell>
          </AppTableRow>
        </AppTableHead>
        <AppTableBody>
          {state.people.map((p) => {
            const manager = p.reportsTo ? getPersonById(state.people, p.reportsTo) : null;
            const approved = getApprovedBalanceMinutes(p, state.overtimeEntries, state.timeOffRequests, state.balanceAdjustments);
            const reserved = getReservedMinutes(state.timeOffRequests, p.id);
            const available = approved - reserved;
            const used = getUsedThisYearMinutes(p, state.timeOffRequests);
            const overCap = isOverToilBalanceCap(p, state.overtimeEntries, state.timeOffRequests, state.balanceAdjustments, state.policy);
            return (
              <AppTableRow key={p.id} onClick={() => setDrilldownId(p.id)}>
                <AppTableCell className="font-medium text-slate-900">{p.name}</AppTableCell>
                <AppTableCell className="text-slate-500">{p.jobTitle}</AppTableCell>
                <AppTableCell className="text-slate-500">{manager ? manager.name : "—"}</AppTableCell>
                <AppTableCell>
                  {p.active === false ? (
                    <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                      Inactive
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      Active
                    </span>
                  )}
                </AppTableCell>
                <AppTableCell className="font-mono">
                  <span className="inline-flex items-center gap-1.5">
                    {formatDurationMinutes(available)}
                    {overCap && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" title="Over accumulation threshold" />}
                  </span>
                </AppTableCell>
                <AppTableCell className="font-mono">{formatDurationMinutes(reserved)}</AppTableCell>
                <AppTableCell className="font-mono">{formatDurationMinutes(used)}</AppTableCell>
                <AppTableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditPersonId(p.id);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </AppTableCell>
              </AppTableRow>
            );
          })}
        </AppTableBody>
      </AppTable>
      <EmployeeDrilldownDialog personId={drilldownId} onOpenChange={(open) => !open && setDrilldownId(null)} adminMode />
      <AddPersonDialog open={addPersonOpen} onOpenChange={setAddPersonOpen} />
      <EditPersonDialog personId={editPersonId} onOpenChange={(open) => !open && setEditPersonId(null)} />
    </div>
  );
}

function DelegationDatesDialog({ open, onOpenChange, initialStart, initialEnd, minDateISO, title, onSubmit }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    setStartDate(initialStart || "");
    setEndDate(initialEnd || "");
    setReason("");
  }, [open, initialStart, initialEnd]);

  const canSubmit = Boolean(startDate && endDate && endDate >= startDate && reason.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <DatePickerField label="Start Date" valueISO={startDate} onChange={setStartDate} minDateISO={minDateISO} required />
            <DatePickerField label="End Date" valueISO={endDate} onChange={setEndDate} minDateISO={startDate || minDateISO} required />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Reason <span className="text-rose-500">*</span>
            </label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required — this action is logged." rows={2} />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <Button
            disabled={!canSubmit}
            onClick={() => {
              onSubmit(startDate, endDate, reason.trim());
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AdminDelegationOfficerCard({ officerId }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const admin = getPersonById(state.people, state.currentUserId);
  const officer = getPersonById(state.people, officerId);
  const directReports = getDirectReports(state.people, officerId).filter((p) => p.active !== false);
  const delegateId = officer.designatedCoveringOfficerId;
  const delegate = delegateId ? getPersonById(state.people, delegateId) : null;
  const todayISO = formatISODate(new Date());
  const [dialogState, setDialogState] = useState(null);

  const officerDelegations = state.delegations
    .filter((d) => d.delegatorId === officerId)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

  const hasOpenDelegation = officerDelegations.some((d) => !d.revoked && d.endDate >= todayISO);

  function actorOnBehalf() {
    return { id: admin.id, name: `${admin.name} (on behalf of ${officer.name})` };
  }

  function handleDesignationChange(newDelegateId) {
    dispatch({ type: "UPDATE_PERSON", payload: { id: officerId, updates: { designatedCoveringOfficerId: newDelegateId } } });
  }

  function handleDialogSubmit(startDate, endDate, reason) {
    if (dialogState.mode === "create") {
      let delegation = {
        id: `del-${Date.now()}`,
        delegatorId: officerId,
        delegateId,
        startDate,
        endDate,
        revoked: false,
        revokedById: null,
        revokedAt: null,
        auditHistory: [],
      };
      delegation = appendAudit(delegation, AUDIT_ACTION.DELEGATION_CREATED, actorOnBehalf(), reason);
      dispatch({ type: "ADD_DELEGATION", payload: delegation });
    } else {
      let updated = { ...dialogState.delegation, startDate, endDate };
      updated = appendAudit(updated, AUDIT_ACTION.DELEGATION_MODIFIED, actorOnBehalf(), reason);
      dispatch({ type: "UPDATE_DELEGATION", payload: { id: updated.id, entry: updated } });
    }
  }

  function handleRevoke(d, reason) {
    let updated = { ...d, revoked: true, revokedById: admin.id, revokedAt: new Date().toISOString() };
    updated = appendAudit(updated, AUDIT_ACTION.DELEGATION_REVOKED, actorOnBehalf(), reason);
    dispatch({ type: "UPDATE_DELEGATION", payload: { id: updated.id, entry: updated } });
  }

  const DELEGATION_STATUS_STYLE = {
    Active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Scheduled: "bg-cyan-50 text-cyan-700 border-cyan-200",
    Revoked: "bg-rose-50 text-rose-700 border-rose-200",
    Expired: "bg-slate-100 text-slate-500 border-slate-200",
  };

  return (
    <div className="space-y-3 pb-6 border-b border-slate-100 last:border-0 last:pb-0">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="font-medium text-slate-900">{officer.name}</div>
          <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
            <span>Designated covering officer:</span>
            <Select value={delegateId || ""} onValueChange={handleDesignationChange}>
              <SelectTrigger className="w-[180px] h-7 text-xs">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                {directReports.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setDialogState({ mode: "create" })}
          disabled={hasOpenDelegation || !delegateId}
          title={
            hasOpenDelegation
              ? "Revoke the existing delegation before creating a new one."
              : !delegateId
              ? "Set a designated covering officer first."
              : undefined
          }
        >
          <Plus className="h-3.5 w-3.5" />
          New Delegation
        </Button>
      </div>
      {hasOpenDelegation && (
        <p className="text-xs text-slate-400">
          {officer.name} already has an active or scheduled delegation — revoke it below before creating another.
        </p>
      )}
      {!hasOpenDelegation && !delegateId && (
        <p className="text-xs text-slate-400">No designated covering officer set — choose one above first.</p>
      )}

      {officerDelegations.length === 0 ? (
        <p className="text-sm text-slate-400">No delegations recorded.</p>
      ) : (
        <AppTable>
          <AppTableHead>
            <AppTableRow>
              <AppTableHeaderCell>Start</AppTableHeaderCell>
              <AppTableHeaderCell>End</AppTableHeaderCell>
              <AppTableHeaderCell>Status</AppTableHeaderCell>
              <AppTableHeaderCell>Actions</AppTableHeaderCell>
            </AppTableRow>
          </AppTableHead>
          <AppTableBody>
            {officerDelegations.map((d) => {
              const status = computeDelegationStatus(d, todayISO);
              const canModify = !d.revoked && d.endDate >= todayISO;
              return (
                <AppTableRow key={d.id}>
                  <AppTableCell className="font-mono text-xs">{formatDateWithWeekday(d.startDate)}</AppTableCell>
                  <AppTableCell className="font-mono text-xs">{formatDateWithWeekday(d.endDate)}</AppTableCell>
                  <AppTableCell>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                        DELEGATION_STATUS_STYLE[status] || "bg-slate-100 text-slate-500 border-slate-200"
                      }`}
                    >
                      {status}
                    </span>
                  </AppTableCell>
                  <AppTableCell>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {canModify && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => setDialogState({ mode: "edit", delegation: d })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                      )}
                      {canModify && (
                        <CommentActionDialog
                          triggerLabel="Revoke"
                          triggerVariant="ghost"
                          title="Revoke this delegation?"
                          description={`This is on behalf of ${officer.name} and requires a reason. It's logged distinctly from an officer revoking their own delegation.`}
                          onConfirm={(reason) => handleRevoke(d, reason)}
                        />
                      )}
                      <AuditHistoryDialog record={d} />
                    </div>
                  </AppTableCell>
                </AppTableRow>
              );
            })}
          </AppTableBody>
        </AppTable>
      )}

      <DelegationDatesDialog
        open={Boolean(dialogState)}
        onOpenChange={(o) => !o && setDialogState(null)}
        initialStart={dialogState && dialogState.mode === "edit" ? dialogState.delegation.startDate : ""}
        initialEnd={dialogState && dialogState.mode === "edit" ? dialogState.delegation.endDate : ""}
        minDateISO={todayISO}
        title={dialogState && dialogState.mode === "edit" ? `Edit Delegation — ${officer.name}` : `New Delegation — ${officer.name}`}
        onSubmit={handleDialogSubmit}
      />
    </div>
  );
}

function DelegationAdminTab() {
  const state = useAppState();
  const eligibleOfficers = state.people.filter((p) => canDesignateCoveringOfficer(p, state.people));

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Create, modify, or revoke delegations on any Supervisor's behalf — bypassing the normal restriction that
        only the issuer can revoke. You can also override who each Supervisor has designated as their covering
        officer. Every action here requires a reason and is logged distinctly from an officer managing their own
        delegation.
      </p>
      {eligibleOfficers.map((officer) => (
        <AdminDelegationOfficerCard key={officer.id} officerId={officer.id} />
      ))}
    </div>
  );
}

function buildSystemAuditFeed(state) {
  const events = [];

  state.overtimeEntries.forEach((e) => {
    (e.auditHistory || []).forEach((ev, idx) => {
      events.push({
        id: `ot-${e.id}-${idx}`,
        sourceType: "overtime",
        employeeId: e.employeeId,
        category: e.category || null,
        recordStatus: e.status,
        action: ev.action,
        byName: ev.byName,
        at: ev.at,
        comment: ev.comment,
      });
    });
  });

  state.timeOffRequests.forEach((r) => {
    (r.auditHistory || []).forEach((ev, idx) => {
      events.push({
        id: `to-${r.id}-${idx}`,
        sourceType: "timeoff",
        employeeId: r.employeeId,
        category: null,
        recordStatus: r.status,
        action: ev.action,
        byName: ev.byName,
        at: ev.at,
        comment: ev.comment,
      });
    });
  });

  state.delegations.forEach((d) => {
    (d.auditHistory || []).forEach((ev, idx) => {
      events.push({
        id: `del-${d.id}-${idx}`,
        sourceType: "delegation",
        employeeId: d.delegatorId,
        category: null,
        recordStatus: d.revoked ? "Revoked" : "N/A",
        action: ev.action,
        byName: ev.byName,
        at: ev.at,
        comment: ev.comment,
      });
    });
  });

  state.balanceAdjustments.forEach((a) => {
    const sign = a.amountMinutes >= 0 ? "+" : "−";
    events.push({
      id: `adj-${a.id}`,
      sourceType: "adjustment",
      employeeId: a.employeeId,
      category: null,
      recordStatus: "N/A",
      action: AUDIT_ACTION.BALANCE_ADJUSTED,
      byName: a.byName,
      at: a.at,
      comment: `${sign}${formatDurationMinutes(Math.abs(a.amountMinutes))} — ${a.reason}`,
    });
  });

  return events.sort((a, b) => (a.at < b.at ? 1 : -1));
}

const AUDIT_SOURCE_LABEL = {
  overtime: "Overtime",
  timeoff: "Time Off",
  delegation: "Delegation",
  adjustment: "Balance Adjustment",
};

function AuditLogAdminTab() {
  const state = useAppState();
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [supervisorFilter, setSupervisorFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  const allEvents = buildSystemAuditFeed(state);
  const supervisors = state.people.filter((p) => hasRole(p, ROLE.REPORTING_OFFICER));

  let filtered = allEvents;
  if (employeeFilter !== "all") filtered = filtered.filter((ev) => ev.employeeId === employeeFilter);
  if (supervisorFilter !== "all") {
    filtered = filtered.filter((ev) => {
      const emp = getPersonById(state.people, ev.employeeId);
      return emp && emp.reportsTo === supervisorFilter;
    });
  }
  if (categoryFilter !== "all") filtered = filtered.filter((ev) => ev.category === categoryFilter);
  if (statusFilter !== "all") filtered = filtered.filter((ev) => ev.recordStatus === statusFilter);
  if (dateStart) filtered = filtered.filter((ev) => ev.at.slice(0, 10) >= dateStart);
  if (dateEnd) filtered = filtered.filter((ev) => ev.at.slice(0, 10) <= dateEnd);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Employee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {state.people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={supervisorFilter} onValueChange={setSupervisorFilter}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Supervisor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Supervisors</SelectItem>
            {supervisors.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {state.workCodes.map((w) => (
              <SelectItem key={w.code} value={w.label}>
                {w.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.values(STATUS).map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
            <SelectItem value="N/A">N/A</SelectItem>
          </SelectContent>
        </Select>

        <DatePickerField label="" valueISO={dateStart} onChange={setDateStart} />
        <DatePickerField label="" valueISO={dateEnd} onChange={setDateEnd} minDateISO={dateStart} />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No audit events match these filters.</p>
      ) : (
        <AppTable>
          <AppTableHead>
            <AppTableRow>
              <AppTableHeaderCell>When</AppTableHeaderCell>
              <AppTableHeaderCell>Employee</AppTableHeaderCell>
              <AppTableHeaderCell>Type</AppTableHeaderCell>
              <AppTableHeaderCell>Action</AppTableHeaderCell>
              <AppTableHeaderCell>By</AppTableHeaderCell>
              <AppTableHeaderCell>Comment</AppTableHeaderCell>
            </AppTableRow>
          </AppTableHead>
          <AppTableBody>
            {filtered.map((ev) => {
              const emp = getPersonById(state.people, ev.employeeId);
              return (
                <AppTableRow key={ev.id}>
                  <AppTableCell className="font-mono text-xs whitespace-nowrap">{formatDateTimeWithWeekday(ev.at)}</AppTableCell>
                  <AppTableCell className="font-medium text-slate-900">{emp ? emp.name : ev.employeeId}</AppTableCell>
                  <AppTableCell className="text-xs text-slate-500">{AUDIT_SOURCE_LABEL[ev.sourceType]}</AppTableCell>
                  <AppTableCell className="text-xs">{ev.action}</AppTableCell>
                  <AppTableCell className="text-xs text-slate-500">{ev.byName}</AppTableCell>
                  <AppTableCell className="text-xs text-slate-500 max-w-xs">{ev.comment || "—"}</AppTableCell>
                </AppTableRow>
              );
            })}
          </AppTableBody>
        </AppTable>
      )}
    </div>
  );
}

function PendingMonitorAdminTab() {
  const state = useAppState();
  const todayISO = formatISODate(new Date());

  const items = [
    ...state.overtimeEntries.filter((e) => e.status === STATUS.PENDING).map((record) => ({ kind: "overtime", record })),
    ...state.timeOffRequests.filter((r) => r.status === STATUS.PENDING).map((record) => ({ kind: "timeoff", record })),
  ].sort((a, b) => (a.record.date < b.record.date ? -1 : 1));

  return (
    <div>
      <p className="text-sm text-slate-500 mb-4">
        Read-only visibility across the whole organization, regardless of routing. Act on these through the
        employee drill-down's override controls, not here directly.
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">Nothing pending anywhere right now.</p>
      ) : (
        <AppTable>
          <AppTableHead>
            <AppTableRow>
              <AppTableHeaderCell>Employee</AppTableHeaderCell>
              <AppTableHeaderCell>Type</AppTableHeaderCell>
              <AppTableHeaderCell>Date</AppTableHeaderCell>
              <AppTableHeaderCell>Hours</AppTableHeaderCell>
              <AppTableHeaderCell>Routed To</AppTableHeaderCell>
            </AppTableRow>
          </AppTableHead>
          <AppTableBody>
            {items.map(({ kind, record }) => {
              const emp = getPersonById(state.people, record.employeeId);
              const routedToId = getEffectiveApproverId(record.employeeId, state.people, state.delegations, todayISO);
              const routedTo = routedToId ? getPersonById(state.people, routedToId) : null;
              return (
                <AppTableRow key={`${kind}-${record.id}`}>
                  <AppTableCell className="font-medium text-slate-900">{emp ? emp.name : "—"}</AppTableCell>
                  <AppTableCell>
                    <Badge
                      variant="outline"
                      className={
                        kind === "overtime"
                          ? "bg-cyan-50 text-cyan-700 border-cyan-200 text-[11px]"
                          : "bg-violet-50 text-violet-700 border-violet-200 text-[11px]"
                      }
                    >
                      {kind === "overtime" ? "Overtime" : "Time Off"}
                    </Badge>
                  </AppTableCell>
                  <AppTableCell className="text-xs">{formatEntryDateRange(record)}</AppTableCell>
                  <AppTableCell className="font-mono">{formatDurationMinutes(record.calculatedMinutes)}</AppTableCell>
                  <AppTableCell className="text-slate-600">{routedTo ? routedTo.name : "—"}</AppTableCell>
                </AppTableRow>
              );
            })}
          </AppTableBody>
        </AppTable>
      )}
    </div>
  );
}

function AdministrationPage() {
  const state = useAppState();
  const person = getPersonById(state.people, state.currentUserId);

  if (!hasRole(person, ROLE.SYSTEM_ADMINISTRATOR)) {
    return (
      <PlaceholderPage
        title="Administration"
        icon={Settings}
        description="This section isn't applicable to your role."
      />
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="System Administration"
        description="Reference data and department configuration."
      />
      <Tabs defaultValue="hierarchy">
        <TabsList>
          <TabsTrigger value="hierarchy" className="gap-1.5">
            <GitBranch className="h-3.5 w-3.5" />
            Hierarchy
          </TabsTrigger>
          <TabsTrigger value="workCodes" className="gap-1.5">
            <Tags className="h-3.5 w-3.5" />
            Work Codes
          </TabsTrigger>
          <TabsTrigger value="holidays" className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            Holidays
          </TabsTrigger>
          <TabsTrigger value="schedule" className="gap-1.5">
            <Clock4 className="h-3.5 w-3.5" />
            Schedule
          </TabsTrigger>
          <TabsTrigger value="records" className="gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            People
          </TabsTrigger>
          <TabsTrigger value="delegations" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Delegations
          </TabsTrigger>
          <TabsTrigger value="auditLog" className="gap-1.5">
            <History className="h-3.5 w-3.5" />
            Audit Log
          </TabsTrigger>
          <TabsTrigger value="pendingMonitor" className="gap-1.5">
            <CheckSquare className="h-3.5 w-3.5" />
            Pending Monitor
          </TabsTrigger>
        </TabsList>
        <TabsContent value="hierarchy" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <HierarchyAdminTab />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="workCodes" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <WorkCodesAdminTab />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="holidays" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <HolidaysAdminTab />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="schedule" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <ScheduleAdminTab />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="records" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <RecordsAdminTab />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="delegations" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <DelegationAdminTab />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="auditLog" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <AuditLogAdminTab />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="pendingMonitor" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <PendingMonitorAdminTab />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* =========================================================================
   APP SHELL
   ========================================================================= */

function AppShell() {
  const [page, setPage] = useState("dashboard");
  const state = useAppState();
  const person = getPersonById(state.people, state.currentUserId);

  // If switching demo users makes the current page invisible to them
  // (e.g. an Employee was on Approvals and we switch to Farid), fall back.
  const todayISO = formatISODate(new Date());
  const activeNavItem = NAV_ITEMS.find((n) => n.key === page);
  const pageIsVisible = activeNavItem ? activeNavItem.visible(person, state, todayISO) : true;
  const effectivePage = pageIsVisible ? page : "dashboard";

  let content;
  switch (effectivePage) {
    case "dashboard":
      content = <MyDashboardPage onNavigate={setPage} />;
      break;
    case "orgChart":
      content = <OrgChartPage />;
      break;
    case "recordOvertime":
      content = <RecordOvertimePage />;
      break;
    case "requestTimeOff":
      content = <RequestTimeOffPage />;
      break;
    case "approvals":
      content = <ApprovalsPage />;
      break;
    case "teamDashboard":
      content = <TeamDashboardPage onNavigate={setPage} />;
      break;
    case "administration":
      content = <AdministrationPage />;
      break;
    default:
      content = <MyDashboardPage />;
  }

  return (
    <div className="flex h-full min-h-screen bg-slate-50">
      <Sidebar currentPage={effectivePage} onNavigate={setPage} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">{content}</main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
