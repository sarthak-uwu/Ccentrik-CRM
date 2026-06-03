import React, { useState, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  User, Phone, Mail, Building2, Briefcase,
  IndianRupee, PackageSearch, Flame, Sun, Snowflake,
  Link2, Globe, MessageSquare, Tag, RadioTower, TrendingUp,
  Upload, X, CheckCircle, AlertCircle
} from 'lucide-react';

const SOURCES = ['LinkedIn', 'Website', 'Referral', 'Cold call', 'Event', 'Direct Call', 'Other'];
const CATEGORIES = ['Enterprise', 'SMB', 'Startup', 'Agency', 'Freelancer'];
const CONDITIONS = [
  { value: 'Hot', label: 'Hot', Icon: Flame, color: 'text-red-600' },
  { value: 'Warm', label: 'Warm', Icon: Sun, color: 'text-amber-500' },
  { value: 'Cold', label: 'Cold', Icon: Snowflake, color: 'text-blue-500' },
];
const STAGES = [
  'Awareness', 'Interest', 'Consideration',
  'Intent', 'Evaluation', 'Purchase', 'Closed Lost',
];

const Field = ({ label, required, icon: Icon, children }) => (
  <div>
    <label className="block text-xs font-medium text-gray-500 mb-1.5">
      {Icon && <Icon size={13} className="inline mr-1.5 text-gray-400" />}
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {children}
  </div>
);

const inputCls =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-800 outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition';

const AddLead = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);

  // ── Bulk Upload State ──
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkPreview, setBulkPreview] = useState([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const fileInputRef = useRef();

  const [formData, setFormData] = useState({
    company: '', name: '', phone: '', email: '',
    designation: '', budget: '', product_interest: '',
    temperature: 'Warm', stage: 'Awareness',
    category: 'SMB', status: 'New', source: 'Direct Call',
    linkedin: '', website: '', remarks: '',
  });

  const set = (key) => (e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.remarks.trim()) { toast.error('Remarks are mandatory!'); return; }
    setLoading(true);
    // Map legacy field names to current CRM schema
    const { company, name, phone, email, designation, budget, product_interest,
            temperature, stage, category, status, source, linkedin, website, remarks } = formData;
    const { error } = await supabase.from('leads').insert([{
      company_name:     company || '',
      contact_name:     name    || '',
      phone:            phone   || null,
      email:            email   || null,
      designation:      designation || null,
      budget:           Number(budget) || 0,
      product_interest: product_interest || null,
      temperature:      (temperature || 'warm').toLowerCase(),
      stage:            'new',
      source:           (source || 'other').toLowerCase().replace(/\s+/g, '_'),
      remarks:          remarks || '',
      other_notes:      JSON.stringify({ category, status, linkedin: linkedin || '', website: website || '' }),
    }]);
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
      qc.invalidateQueries({ queryKey: ['monthly-leads'] });
      qc.invalidateQueries({ queryKey: ['recent-activity'] });
      toast.success('Lead created successfully!');
      navigate('/leads');
    }
  };

  // ── Bulk Upload Logic ──
  const parseCSV = (text) => {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    return lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
      const obj = {};
      headers.forEach((h, i) => { obj[h] = values[i] || ''; });
      return obj;
    }).filter((row) => row.name || row.company);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBulkResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result);
      setBulkPreview(parsed.slice(0, 5));
      setBulkFile({ file, parsed });
    };
    reader.readAsText(file);
  };

  const handleBulkUpload = async () => {
    if (!bulkFile?.parsed?.length) return;
    setBulkUploading(true);
    setBulkResult(null);
    const rows = bulkFile.parsed.map((row) => ({
      company_name:     row.company || row.company_name || '',
      contact_name:     row.name    || row.contact_name || '',
      phone:            row.phone   || null,
      email:            row.email   || null,
      designation:      row.designation || null,
      budget:           Number(row.budget) || 0,
      product_interest: row.product_interest || null,
      temperature:      (row.temperature || row.lead_condition || 'warm').toLowerCase(),
      stage:            'new',
      source:           (row.source || 'other').toLowerCase().replace(/\s+/g, '_'),
      remarks:          row.remarks || '',
      other_notes:      JSON.stringify({ category: row.category || '', linkedin: row.linkedin || '', website: row.website || '' }),
    }));
    const { error } = await supabase.from('leads').insert(rows);
    setBulkUploading(false);
    if (error) {
      setBulkResult({ success: false, message: error.message });
    } else {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
      qc.invalidateQueries({ queryKey: ['monthly-leads'] });
      setBulkResult({ success: true, count: rows.length });
    }
  };

  const downloadTemplate = () => {
    const csv = 'company,name,phone,email,designation,budget,product_interest,temperature,stage,category,status,source,linkedin,website,remarks\nAcme Corp,John Doe,9999999999,john@acme.com,CTO,500000,CRM Software,Hot,Interest,Enterprise,New,LinkedIn,https://linkedin.com/in/johndoe,https://acme.com,Interested in Q1 deal';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'leads_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const closeBulkModal = () => {
    setBulkModal(false);
    setBulkFile(null);
    setBulkPreview([]);
    setBulkResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="h-screen overflow-y-auto bg-gray-50">
      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Header */}
          <div className="px-7 py-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Add New Lead</h2>
              <p className="text-xs text-gray-400 mt-0.5">Fill in all basic details. Remarks are mandatory.</p>
            </div>
            {/* ✅ Bulk Upload Button */}
            <button
              type="button"
              onClick={() => setBulkModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition"
            >
              <Upload size={15} />
              Upload Leads
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-7 py-6 space-y-6">

            {/* Section: Company & Lead Info */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Company & Lead Info</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                <Field label="Company Name" required icon={Building2}>
                  <input type="text" required className={inputCls}
                    placeholder="e.g. Tata Consultancy"
                    value={formData.company} onChange={set('company')} />
                </Field>

                <Field label="Full Name" required icon={User}>
                  <input type="text" required className={inputCls}
                    placeholder="e.g. Rahul Mehta"
                    value={formData.name} onChange={set('name')} />
                </Field>

                <Field label="Phone Number" required icon={Phone}>
                  <input type="tel" required className={inputCls}
                    placeholder="e.g. 9812345678"
                    value={formData.phone} onChange={set('phone')} />
                </Field>

                <Field label="Email" icon={Mail}>
                  <input type="email" className={inputCls}
                    placeholder="e.g. rahul@tcs.com"
                    value={formData.email} onChange={set('email')} />
                </Field>

                <Field label="Designation" icon={Briefcase}>
                  <input type="text" className={inputCls}
                    placeholder="e.g. CTO, Founder"
                    value={formData.designation} onChange={set('designation')} />
                </Field>

                <Field label="Budget" icon={IndianRupee}>
                  <input type="text" className={inputCls}
                    placeholder="e.g. 5,00,000"
                    value={formData.budget} onChange={set('budget')} />
                </Field>

                <div className="md:col-span-2">
                  <Field label="Product Interest" icon={PackageSearch}>
                    <input type="text" className={inputCls}
                      placeholder="Which product / service are they interested in?"
                      value={formData.product_interest} onChange={set('product_interest')} />
                  </Field>
                </div>

              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* Section: Classification */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Classification</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                {/* Lead Condition pills */}
                <div className="md:col-span-3">
                  <label className="block text-xs font-medium text-gray-500 mb-2">
                    Lead Condition <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-3">
                    {CONDITIONS.map(({ value, label, Icon, color }) => (
                      <button key={value} type="button"
                        onClick={() => setFormData((p) => ({ ...p, temperature: value }))}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition
                          ${formData.temperature === value
                            ? value === 'Hot' ? 'bg-red-50 border-red-300 text-red-700'
                              : value === 'Warm' ? 'bg-amber-50 border-amber-300 text-amber-700'
                              : 'bg-blue-50 border-blue-300 text-blue-700'
                            : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300'}`}>
                        <Icon size={14} className={formData.temperature === value ? color : 'text-gray-300'} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ✅ Lead Stage dropdown */}
                <Field label="Lead Stage" required icon={TrendingUp}>
                  <select className={inputCls} value={formData.stage} onChange={set('stage')}>
                    {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>

                <Field label="Category" icon={Tag}>
                  <select className={inputCls} value={formData.category} onChange={set('category')}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>

                <Field label="Status" icon={RadioTower}>
                  <select className={inputCls} value={formData.status} onChange={set('status')}>
                    {['New', 'Contacted', 'Qualified', 'Proposal', 'Closed'].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Source">
                  <select className={inputCls} value={formData.source} onChange={set('source')}>
                    {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>

              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* Section: Contact Links */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Contact Links</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                <Field label="LinkedIn Profile" icon={Link2}>
                  <input type="url" className={inputCls}
                    placeholder="https://linkedin.com/in/..."
                    value={formData.linkedin} onChange={set('linkedin')} />
                </Field>

                <Field label="Website" icon={Globe}>
                  <input type="url" className={inputCls}
                    placeholder="https://company.com"
                    value={formData.website} onChange={set('website')} />
                </Field>

              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* Section: Remarks */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Remarks</p>
              <Field label="Remarks" required icon={MessageSquare}>
                <textarea required rows={4}
                  className={`${inputCls} resize-none`}
                  placeholder="Add any important notes about this lead..."
                  value={formData.remarks} onChange={set('remarks')} />
              </Field>
            </div>

            {/* Submit */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button type="button" onClick={() => navigate('/dashboard')}
                className="px-5 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
                {loading ? 'Saving...' : 'Add Lead'}
              </button>
            </div>

          </form>
        </div>
      </div>

      {/* ── Bulk Upload Modal ── */}
      {bulkModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-xl border border-gray-200 w-full max-w-lg shadow-lg p-6">

            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <Upload size={15} /> Bulk Upload Leads
              </h3>
              <button onClick={closeBulkModal} className="text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>

            {/* Template hint */}
            <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between">
              <p className="text-xs text-blue-700">Pehle CSV template download karo, fill karo, phir upload karo.</p>
              <button onClick={downloadTemplate}
                className="text-xs font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900 whitespace-nowrap ml-3">
                Template Download
              </button>
            </div>

            {/* File picker */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-green-400 hover:bg-green-50 transition-colors mb-4"
            >
              <Upload size={22} className="mx-auto mb-2 text-gray-400" />
              <p className="text-sm text-gray-600 font-medium">
                {bulkFile?.file?.name || 'CSV file select karo'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Click karke file choose karo</p>
              <input ref={fileInputRef} type="file" accept=".csv"
                className="hidden" onChange={handleFileChange} />
            </div>

            {/* Preview */}
            {bulkPreview.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2 font-medium">
                  Preview (pehle {bulkPreview.length} rows) — Total:{' '}
                  <span className="text-gray-800 font-semibold">{bulkFile?.parsed?.length} leads</span>
                </p>
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-gray-50 text-gray-400 uppercase">
                      <tr>
                        {['company', 'name', 'phone', 'stage', 'status'].map((h) => (
                          <th key={h} className="px-3 py-2">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-700">
                      {bulkPreview.map((row, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 truncate max-w-[100px]">{row.company || '—'}</td>
                          <td className="px-3 py-1.5 truncate max-w-[80px]">{row.name || '—'}</td>
                          <td className="px-3 py-1.5">{row.phone || '—'}</td>
                          <td className="px-3 py-1.5">{row.stage || '—'}</td>
                          <td className="px-3 py-1.5">{row.status || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Result */}
            {bulkResult && (
              <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm font-medium
                ${bulkResult.success
                  ? 'bg-green-50 text-green-800 border border-green-100'
                  : 'bg-red-50 text-red-800 border border-red-100'}`}>
                {bulkResult.success
                  ? <><CheckCircle size={16} /> {bulkResult.count} leads successfully upload ho gaye!</>
                  : <><AlertCircle size={16} /> Upload failed: {bulkResult.message}</>}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={closeBulkModal}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                {bulkResult?.success ? 'Done' : 'Cancel'}
              </button>
              {!bulkResult?.success && (
                <button onClick={handleBulkUpload}
                  disabled={!bulkFile?.parsed?.length || bulkUploading}
                  className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                  <Upload size={14} />
                  {bulkUploading ? 'Uploading...' : `Upload ${bulkFile?.parsed?.length || 0} Leads`}
                </button>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default AddLead;