const normalize = (v) => (v || "").trim().toLowerCase();
const normalizePhone = (v) => (v || "").replace(/\D/g, "");

function parseNotes(record, key) {
  const val = record[key];
  if (!val) return {};
  if (typeof val === "object" && !Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return {}; }
}

function extractFields(record, notesKey, phoneKey) {
  const notes = parseNotes(record, notesKey);
  return {
    company: normalize(record.company_name || record.title || ""),
    contact: normalize(record.contact_name || ""),
    email: normalize(notes.email || ""),
    phone: normalizePhone(notes[phoneKey] || ""),
    website: normalize(notes.website || ""),
  };
}

function computeScore(newF, existF) {
  let score = 0;
  const reasons = [];

  if (newF.company && existF.company) {
    if (newF.company === existF.company) {
      score += 50; reasons.push("Company name matches");
    } else if (newF.company.includes(existF.company) || existF.company.includes(newF.company)) {
      score += 25; reasons.push("Company name is similar");
    }
  }

  if (newF.email && existF.email && newF.email === existF.email) {
    score += 40; reasons.push("Email matches");
  }

  if (newF.phone.length >= 7 && newF.phone === existF.phone) {
    score += 40; reasons.push("Phone number matches");
  }

  if (newF.contact && existF.contact && newF.contact === existF.contact) {
    score += 15; reasons.push("Contact name matches");
  }

  if (newF.website && existF.website && newF.website === existF.website) {
    score += 10; reasons.push("Website matches");
  }

  return { score, reasons };
}

function runDetection(newFields, existingRecords, notesKey, phoneKey) {
  if (!newFields.company && !newFields.email && !newFields.phone) {
    return { exact: [], partial: [] };
  }

  const exact = [], partial = [];
  for (const rec of existingRecords) {
    const existF = extractFields(rec, notesKey, phoneKey);
    const { score, reasons } = computeScore(newFields, existF);
    if (score >= 60) exact.push({ record: rec, score, reasons });
    else if (score >= 25) partial.push({ record: rec, score, reasons });
  }

  const sort = (arr) => arr.sort((a, b) => b.score - a.score).slice(0, 5);
  return { exact: sort(exact), partial: sort(partial) };
}

/**
 * Detect duplicates for a new record against existing DB records.
 * newRecord must have company_name/title, contact_name, and the notesKey field (JSON string or object).
 */
export function detectDuplicates(newRecord, existingRecords, { notesKey = "other_notes", phoneKey = "phone" } = {}) {
  const newFields = extractFields(newRecord, notesKey, phoneKey);
  return runDetection(newFields, existingRecords, notesKey, phoneKey);
}

/**
 * Detect duplicates for a flat object (used in CSV import paths).
 * flat must have: company_name, contact_name, email, phone/contact (varies by phoneKey).
 */
export function detectDuplicatesFlat(flat, existingRecords, { notesKey = "other_notes", phoneKey = "phone" } = {}) {
  const newFields = {
    company: normalize(flat.company_name || flat.title || ""),
    contact: normalize(flat.contact_name || ""),
    email: normalize(flat.email || ""),
    phone: normalizePhone(flat[phoneKey] || flat.phone || ""),
    website: normalize(flat.website || ""),
  };
  return runDetection(newFields, existingRecords, notesKey, phoneKey);
}
