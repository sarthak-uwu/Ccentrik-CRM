import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import {
  Search, Flame, Sun, Snowflake, X, Edit2, Trash2,
  Save, Phone, Mail, Building2, User, Briefcase, IndianRupee,
  PackageSearch, Link2, Globe, MessageSquare, Tag, RadioTower,
  TrendingUp, ExternalLink, AlertCircle, ChevronRight
} from 'lucide-react';

// ── Constants ──
const SOURCES = ['LinkedIn', 'Website', 'Referral', 'Cold call', 'Event', 'Direct Call', 'Other'];
const CATEGORIES = ['Enterprise', 'SMB', 'Startup', 'Agency', 'Freelancer'];
const STAGES = ['Awareness', 'Interest', 'Consideration', 'Intent', 'Evaluation', 'Purchase', 'Closed Lost'];
const STATUSES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Closed'];
const CONDITIONS = [
  { value: 'Hot', label: 'Hot', Icon: Flame, color: 'text-red-600', bg: 'bg-red-50 border-red-300 text-red-700' },
  { value: 'Warm', label: 'Warm', Icon: Sun, color: 'text-amber-500', bg: 'bg-amber-50 border-amber-300 text-amber-700' },
  { value: 'Cold', label: 'Cold', Icon: Snowflake, color: 'text-blue-500', bg: 'bg-blue-50 border-blue-300 text-blue-700' },
];

const STAGE_COLORS = {
  Awareness: 'bg-gray-100 text-gray-600',
  Interest: 'bg-blue-50 text-blue-700',
  Consideration: 'bg-indigo-50 text-indigo-700',
  Intent: 'bg-purple-50 text-purple-700',
  Evaluation: 'bg-orange-50 text-orange-700',
  Purchase: 'bg-green-50 text-green-700',
  'Closed Lost': 'bg-red-50 text-red-600',
};

const TEMP_CONFIG = {
  Hot: { Icon: Flame, cls: 'text-red-500', bg: 'bg-red-50 border-red-200 text-red-700' },
  Warm: { Icon: Sun, cls: 'text-amber-500', bg: 'bg-amber-50 border-amber-200 text-amber-700' },
  Cold: { Icon: Snowflake, cls: 'text-blue-500', bg: 'bg-blue-50 border-blue-200 text-blue-700' },
};

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-800 outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition';

// ── Small helpers ──
const TempBadge = ({ value }) => {
  const cfg = TEMP_CONFIG[value];
  if (!cfg) return null;
  const { Icon, bg } = cfg;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${bg}`}>
      <Icon size={10} /> {value}
    </span>
  );
};

const StageBadge = ({ stage }) => (
  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${STAGE_COLORS[stage] || 'bg-gray-100 text-gray-600'}`}>
    {stage}
  </span>
);

const Field = ({ label, icon: Icon, children }) => (
  <div>
    <label className="block text-xs font-medium text-gray-500 mb-1.5">
      {Icon && <Icon size={12} className="inline mr-1 text-gray-400" />}{label}
    </label>
    {children}
  </div>
);

// ── Stage Progress Bar ──
const StageBar = ({ stage }) => {
  const activeStages = STAGES.filter(s => s !== 'Closed Lost');
  const idx = activeStages.indexOf(stage);
  const isLost = stage === 'Closed Lost';
  return (
    <div className="w-full mt-3">
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isLost ? 'bg-red-400' : 'bg-blue-500'}`}
          style={{ width: isLost ? '100%' : `${((idx + 1) / activeStages.length) * 100}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 mt-1">{stage}</p>
    </div>
  );
};

// ══════════════════════════════════════════
// ── Lead Detail Side Panel ──
// ══════════════════════════════════════════
const LeadPanel = ({ lead, onClose, onUpdate, onDelete }) => {
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState(lead);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { setEditData(lead); setEditMode(false); }, [lead]);

  const set = (key) => (e) => setEditData(p => ({ ...p, [key]: e.target.value }));

  const handleSave = async () => {
    if (!editData.remarks?.trim()) { alert('Remarks mandatory hain!'); return; }
    setSaving(true);
    const { error } = await supabase.from('leads').update(editData).eq('id', lead.id);
    setSaving(false);
    if (error) { alert(error.message); return; }
    onUpdate(editData);
    setEditMode(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await supabase.from('leads').delete().eq('id', lead.id);
    setDeleting(false);
    if (error) { alert(error.message); return; }
    onDelete(lead.id);
    onClose();
  };

  const data = editMode ? editData : lead;

  return (
    <div className="flex flex-col h-full">

      {/* Panel Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-gray-900 truncate">{lead.name}</h2>
            <TempBadge value={lead.temperature} />
          </div>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{lead.designation} · {lead.company}</p>
          <StageBar stage={lead.stage} />
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 mt-0.5 shrink-0">
          <X size={18} />
        </button>
      </div>

      {/* Action Buttons */}
      <div className="px-5 py-3 border-b border-gray-100 flex gap-2 shrink-0">
        {!editMode ? (
          <>
            <button onClick={() => setEditMode(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition">
              <Edit2 size={12} /> Edit
            </button>
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition">
              <Trash2 size={12} /> Delete
            </button>
          </>
        ) : (
          <>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
              <Save size={12} /> {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => { setEditData(lead); setEditMode(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
              <X size={12} /> Cancel
            </button>
          </>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Company & Lead Info */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Company & Lead Info</p>
          <div className="space-y-3">

            <div className="grid grid-cols-2 gap-3">
              <Field label="Company" icon={Building2}>
                {editMode
                  ? <input type="text" className={inputCls} value={editData.company} onChange={set('company')} />
                  : <p className="text-sm text-gray-800">{data.company || '—'}</p>}
              </Field>
              <Field label="Full Name" icon={User}>
                {editMode
                  ? <input type="text" className={inputCls} value={editData.name} onChange={set('name')} />
                  : <p className="text-sm text-gray-800">{data.name || '—'}</p>}
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone" icon={Phone}>
                {editMode
                  ? <input type="tel" className={inputCls} value={editData.phone} onChange={set('phone')} />
                  : <a href={`tel:${data.phone}`} className="text-sm text-blue-600 hover:underline">{data.phone || '—'}</a>}
              </Field>
              <Field label="Email" icon={Mail}>
                {editMode
                  ? <input type="email" className={inputCls} value={editData.email} onChange={set('email')} />
                  : data.email
                    ? <a href={`mailto:${data.email}`} className="text-sm text-blue-600 hover:underline truncate block">{data.email}</a>
                    : <p className="text-sm text-gray-400 italic">—</p>}
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Designation" icon={Briefcase}>
                {editMode
                  ? <input type="text" className={inputCls} value={editData.designation} onChange={set('designation')} />
                  : <p className="text-sm text-gray-800">{data.designation || '—'}</p>}
              </Field>
              <Field label="Budget" icon={IndianRupee}>
                {editMode
                  ? <input type="text" className={inputCls} value={editData.budget} onChange={set('budget')} />
                  : <p className="text-sm text-gray-800">{data.budget || '—'}</p>}
              </Field>
            </div>

            <Field label="Product Interest" icon={PackageSearch}>
              {editMode
                ? <input type="text" className={inputCls} value={editData.product_interest} onChange={set('product_interest')} />
                : <p className="text-sm text-gray-800">{data.product_interest || '—'}</p>}
            </Field>

          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Classification */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Classification</p>
          <div className="space-y-3">

            <Field label="Lead Condition">
              {editMode ? (
                <div className="flex gap-2 flex-wrap">
                  {CONDITIONS.map(({ value, label, Icon, color, bg }) => (
                    <button key={value} type="button"
                      onClick={() => setEditData(p => ({ ...p, temperature: value }))}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition
                        ${editData.temperature === value ? bg : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                      <Icon size={11} className={editData.temperature === value ? color : 'text-gray-300'} />
                      {label}
                    </button>
                  ))}
                </div>
              ) : <TempBadge value={data.temperature} />}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Stage" icon={TrendingUp}>
                {editMode
                  ? <select className={inputCls} value={editData.stage} onChange={set('stage')}>
                      {STAGES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  : <StageBadge stage={data.stage} />}
              </Field>
              <Field label="Category" icon={Tag}>
                {editMode
                  ? <select className={inputCls} value={editData.category} onChange={set('category')}>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  : <p className="text-sm text-gray-800">{data.category || '—'}</p>}
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Status" icon={RadioTower}>
                {editMode
                  ? <select className={inputCls} value={editData.status} onChange={set('status')}>
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  : <p className="text-sm text-gray-800">{data.status || '—'}</p>}
              </Field>
              <Field label="Source">
                {editMode
                  ? <select className={inputCls} value={editData.source} onChange={set('source')}>
                      {SOURCES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  : <p className="text-sm text-gray-800">{data.source || '—'}</p>}
              </Field>
            </div>

          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Links */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Contact Links</p>
          <div className="space-y-3">
            <Field label="LinkedIn" icon={Link2}>
              {editMode
                ? <input type="url" className={inputCls} value={editData.linkedin} onChange={set('linkedin')} placeholder="https://linkedin.com/in/..." />
                : data.linkedin
                  ? <a href={data.linkedin} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-blue-600 hover:underline truncate">
                      {data.linkedin} <ExternalLink size={10} />
                    </a>
                  : <p className="text-sm text-gray-400 italic">—</p>}
            </Field>
            <Field label="Website" icon={Globe}>
              {editMode
                ? <input type="url" className={inputCls} value={editData.website} onChange={set('website')} placeholder="https://company.com" />
                : data.website
                  ? <a href={data.website} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-blue-600 hover:underline truncate">
                      {data.website} <ExternalLink size={10} />
                    </a>
                  : <p className="text-sm text-gray-400 italic">—</p>}
            </Field>
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Remarks */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Remarks</p>
          <Field label="Remarks" icon={MessageSquare}>
            {editMode
              ? <textarea rows={4} className={`${inputCls} resize-none`}
                  value={editData.remarks} onChange={set('remarks')}
                  placeholder="Add notes..." />
              : <p className={`text-sm leading-relaxed ${data.remarks ? 'text-gray-800' : 'text-gray-400 italic'}`}>
                  {data.remarks || 'No remarks.'}
                </p>}
          </Field>
        </div>

        {/* Metadata */}
        {lead.created_at && (
          <p className="text-[10px] text-gray-300 pb-2">
            ID: {lead.id} · {new Date(lead.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        )}
      </div>

      {/* Delete Confirm Overlay */}
      {confirmDelete && (
        <div className="absolute inset-0 bg-white/95 flex items-center justify-center p-6 z-10">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
              <Trash2 size={20} className="text-red-500" />
            </div>
            <p className="text-sm font-semibold text-gray-800 mb-1">Delete this lead?</p>
            <p className="text-xs text-gray-400 mb-5">
              <span className="font-medium text-gray-600">{lead.name}</span> ko permanently delete kar doge.
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60">
                {deleting ? 'Deleting...' : 'Haan, Delete Karo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════
// ── Inline Row Edit Modal ──
// ══════════════════════════════════════════
const InlineEditModal = ({ lead, onClose, onUpdate }) => {
  const [editData, setEditData] = useState(lead);
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setEditData(p => ({ ...p, [key]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('leads').update(editData).eq('id', lead.id);
    setSaving(false);
    if (error) { alert(error.message); return; }
    onUpdate(editData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-800">Edit Lead</h3>
            <p className="text-xs text-gray-400">{lead.company} · {lead.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company" icon={Building2}>
              <input type="text" className={inputCls} value={editData.company || ''} onChange={set('company')} />
            </Field>
            <Field label="Full Name" icon={User}>
              <input type="text" className={inputCls} value={editData.name || ''} onChange={set('name')} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" icon={Phone}>
              <input type="tel" className={inputCls} value={editData.phone || ''} onChange={set('phone')} />
            </Field>
            <Field label="Email" icon={Mail}>
              <input type="email" className={inputCls} value={editData.email || ''} onChange={set('email')} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Designation" icon={Briefcase}>
              <input type="text" className={inputCls} value={editData.designation || ''} onChange={set('designation')} />
            </Field>
            <Field label="Budget" icon={IndianRupee}>
              <input type="text" className={inputCls} value={editData.budget || ''} onChange={set('budget')} />
            </Field>
          </div>
          <Field label="Product Interest" icon={PackageSearch}>
            <input type="text" className={inputCls} value={editData.product_interest || ''} onChange={set('product_interest')} />
          </Field>

          {/* Lead Condition Toggle */}
          <Field label="Lead Condition">
            <div className="flex gap-2 flex-wrap">
              {CONDITIONS.map(({ value, label, Icon, color, bg }) => (
                <button key={value} type="button"
                  onClick={() => setEditData(p => ({ ...p, temperature: value }))}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition
                    ${editData.temperature === value ? bg : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                  <Icon size={11} className={editData.temperature === value ? color : 'text-gray-300'} />
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Stage" icon={TrendingUp}>
              <select className={inputCls} value={editData.stage || ''} onChange={set('stage')}>
                {STAGES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Status" icon={RadioTower}>
              <select className={inputCls} value={editData.status || ''} onChange={set('status')}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" icon={Tag}>
              <select className={inputCls} value={editData.category || ''} onChange={set('category')}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Source">
              <select className={inputCls} value={editData.source || ''} onChange={set('source')}>
                {SOURCES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Remarks" icon={MessageSquare}>
            <textarea rows={3} className={`${inputCls} resize-none`}
              value={editData.remarks || ''} onChange={set('remarks')}
              placeholder="Add notes..." />
          </Field>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60">
            <Save size={13} /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════
// ── Inline Delete Confirm Modal ──
// ══════════════════════════════════════════
const DeleteConfirmModal = ({ lead, onClose, onDelete }) => {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await supabase.from('leads').delete().eq('id', lead.id);
    setDeleting(false);
    if (error) { alert(error.message); return; }
    onDelete(lead.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Trash2 size={20} className="text-red-500" />
        </div>
        <p className="text-sm font-semibold text-gray-800 mb-1">Delete this lead?</p>
        <p className="text-xs text-gray-500 mb-5">
          <span className="font-medium text-gray-700">{lead.company}</span> ({lead.name}) ko permanently delete kar doge. Yeh action undo nahi hoga.
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60">
            {deleting ? 'Deleting...' : 'Haan, Delete Karo'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════
// ── Main LeadsList Component ──
// ══════════════════════════════════════════
const LeadsList = () => {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTemp, setFilterTemp] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedLead, setSelectedLead] = useState(null);
  const [editingLead, setEditingLead] = useState(null);   // for inline edit modal
  const [deletingLead, setDeletingLead] = useState(null); // for inline delete modal

  useEffect(() => { fetchLeads(); }, []);

  const fetchLeads = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('organization_id', 'ccentrik_01')
      .order('created_at', { ascending: false });
    setLoading(false);
    if (!error && data) setLeads(data);
  };

  const filtered = leads.filter(l => {
    const q = search.toLowerCase();
    const matchSearch = !q || l.name?.toLowerCase().includes(q) || l.company?.toLowerCase().includes(q) || l.phone?.includes(q) || l.email?.toLowerCase().includes(q);
    const matchTemp = !filterTemp || l.temperature === filterTemp;
    const matchStage = !filterStage || l.stage === filterStage;
    const matchStatus = !filterStatus || l.status === filterStatus;
    return matchSearch && matchTemp && matchStage && matchStatus;
  });

  const handleUpdate = (updated) => {
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
    if (selectedLead?.id === updated.id) setSelectedLead(updated);
  };

  const handleDelete = (id) => {
    setLeads(prev => prev.filter(l => l.id !== id));
    if (selectedLead?.id === id) setSelectedLead(null);
  };

  const clearFilters = () => { setSearch(''); setFilterTemp(''); setFilterStage(''); setFilterStatus(''); };
  const hasFilters = search || filterTemp || filterStage || filterStatus;

  // Columns shown depend on whether detail panel is open
  const panelOpen = !!selectedLead;

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">

      {/* ── Left: Leads List ── */}
      <div className={`flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-300 ${panelOpen ? 'w-[58%]' : 'w-full'}`}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-base font-bold text-gray-800">Sales Pipeline</h1>
              <p className="text-xs text-gray-400">{filtered.length} leads {hasFilters ? '(filtered)' : 'total'}</p>
            </div>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <X size={11} /> Clear filters
              </button>
            )}
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, company, phone, email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <select value={filterTemp} onChange={e => setFilterTemp(e.target.value)}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-600 outline-none focus:ring-2 focus:ring-blue-400">
              <option value="">All Conditions</option>
              {['Hot', 'Warm', 'Cold'].map(t => <option key={t}>{t}</option>)}
            </select>
            <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-600 outline-none focus:ring-2 focus:ring-blue-400">
              <option value="">All Stages</option>
              {STAGES.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-600 outline-none focus:ring-2 focus:ring-blue-400">
              <option value="">All Statuses</option>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <AlertCircle size={32} className="mb-2 text-gray-300" />
              <p className="text-sm font-medium">Koi lead nahi mila</p>
              {hasFilters && <p className="text-xs mt-1">Filters clear karo</p>}
            </div>
          ) : (
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 z-10">
                <tr>
                  {/* ── FIXED: Company first, then Name ── */}
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Company / Name</th>
                  {!panelOpen && <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Phone</th>}
                  {!panelOpen && <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Email</th>}
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Condition</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Stage</th>
                  {!panelOpen && <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>}
                  {!panelOpen && <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Source</th>}
                  {/* ── FIXED: Actions column always visible ── */}
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(lead => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLead(selectedLead?.id === lead.id ? null : lead)}
                    className={`cursor-pointer transition-colors group ${
                      selectedLead?.id === lead.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* ── Company first, name below ── */}
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-gray-800 truncate max-w-[160px]">{lead.company || '—'}</p>
                      <p className="text-xs text-gray-400 truncate max-w-[160px]">{lead.name}</p>
                    </td>

                    {!panelOpen && (
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{lead.phone || '—'}</td>
                    )}
                    {!panelOpen && (
                      <td className="px-4 py-3 text-sm text-gray-500 truncate max-w-[160px]">{lead.email || '—'}</td>
                    )}
                    <td className="px-4 py-3"><TempBadge value={lead.temperature} /></td>
                    <td className="px-4 py-3"><StageBadge stage={lead.stage} /></td>
                    {!panelOpen && (
                      <td className="px-4 py-3 text-xs text-gray-500">{lead.status || '—'}</td>
                    )}
                    {!panelOpen && (
                      <td className="px-4 py-3 text-xs text-gray-500">{lead.source || '—'}</td>
                    )}

                    {/* ── FIXED: Inline Edit & Delete buttons ── */}
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingLead(lead)}
                          title="Edit"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => setDeletingLead(lead)}
                          title="Delete"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                        >
                          <Trash2 size={13} />
                        </button>
                        <ChevronRight size={13} className={`ml-1 transition-transform ${selectedLead?.id === lead.id ? 'rotate-90 text-blue-500' : 'text-gray-300'}`} />
                      </div>
                      {/* Show chevron when not hovered */}
                      <div className={`flex justify-end group-hover:hidden ${selectedLead?.id === lead.id ? 'hidden' : ''}`}>
                        <ChevronRight size={13} className="text-gray-300" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Right: Detail Panel ── */}
      {selectedLead && (
        <div className="w-[42%] bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden relative flex flex-col">
          <LeadPanel
            lead={selectedLead}
            onClose={() => setSelectedLead(null)}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        </div>
      )}

      {/* ── Inline Edit Modal ── */}
      {editingLead && (
        <InlineEditModal
          lead={editingLead}
          onClose={() => setEditingLead(null)}
          onUpdate={(updated) => { handleUpdate(updated); setEditingLead(null); }}
        />
      )}

      {/* ── Inline Delete Confirm Modal ── */}
      {deletingLead && (
        <DeleteConfirmModal
          lead={deletingLead}
          onClose={() => setDeletingLead(null)}
          onDelete={(id) => { handleDelete(id); setDeletingLead(null); }}
        />
      )}
    </div>
  );
};

export default LeadsList;