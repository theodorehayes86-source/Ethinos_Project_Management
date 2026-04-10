import React, { useState, useRef } from 'react';
import { X, Upload, Download, CheckCircle2 } from 'lucide-react';

const parseRow = (line) => {
  const result = [];
  let inQuote = false;
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === ',' && !inQuote) {
      result.push(current); current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
};

const parseCsv = (text) => {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 1) return [];
  const headers = parseRow(lines[0]).map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseRow(line);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (values[idx] || '').trim(); });
    rows.push(obj);
  }
  return rows;
};

const MODE_CONFIG = {
  users: {
    title: 'Import Users',
    subtitle: 'Bulk upload users from a CSV. Clients column is pipe-separated (|). Password must be 6+ characters.',
    templateContent: 'name,email,password,role,department,region,position,clients\nJane Doe,jane@ethinos.com,TempPass123!,Executive,Growth,North,Account Manager,Client A|Client B',
    templateName: 'users-template.csv',
    columns: ['name', 'email', 'password', 'role', 'department', 'region', 'position', 'clients'],
    columnLabels: { name: 'Name', email: 'Email', password: 'Password', role: 'Role', department: 'Dept', region: 'Region', position: 'Position', clients: 'Clients (pipe-sep)' },
  },
  clients: {
    title: 'Import Clients',
    subtitle: 'Bulk upload client projects. Entity is the parent company/group.',
    templateContent: 'entityName,clientName\nAcme Holdings,Acme Digital\nBeta Corp,Beta Growth',
    templateName: 'clients-template.csv',
    columns: ['entityName', 'clientName'],
    columnLabels: { entityName: 'Entity Name', clientName: 'Client Name' },
  },
  combined: {
    title: 'Import Clients + Users',
    subtitle: 'Create clients and assign existing users by email. User emails are pipe-separated (|).',
    templateContent: 'entityName,clientName,userEmails\nAcme Holdings,Acme Digital,jane@ethinos.com|john@ethinos.com\nBeta Corp,Beta Growth,sarah@ethinos.com',
    templateName: 'clients-and-users-template.csv',
    columns: ['entityName', 'clientName', 'userEmails'],
    columnLabels: { entityName: 'Entity Name', clientName: 'Client Name', userEmails: 'User Emails (pipe-sep)' },
  },
};

const CsvImportModal = ({
  mode,
  onClose,
  onImport,
  validate,
}) => {
  const config = MODE_CONFIG[mode] || MODE_CONFIG.users;
  const [step, setStep] = useState('upload');
  const [parsedRows, setParsedRows] = useState([]);
  const [rowErrors, setRowErrors] = useState({});
  const [results, setResults] = useState([]);
  const fileRef = useRef(null);

  const downloadTemplate = () => {
    const blob = new Blob([config.templateContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = config.templateName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCsv(ev.target.result);
      const errors = {};
      rows.forEach((row, idx) => {
        const errs = validate ? validate(row, idx, rows) : [];
        if (errs.length > 0) errors[idx] = errs;
      });
      setParsedRows(rows);
      setRowErrors(errors);
      setStep('preview');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const fakeEvent = { target: { files: [file], value: '' } };
    handleFile(fakeEvent);
  };

  const validRows = parsedRows.filter((_, idx) => !rowErrors[idx]);
  const errorCount = Object.keys(rowErrors).length;

  const handleImport = async () => {
    setStep('importing');
    const res = await onImport(validRows);
    setResults(res);
    setStep('done');
  };

  const successes = results.filter(r => r.success).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900">{config.title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{config.subtitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-all text-slate-400 hover:text-slate-700">
            <X size={16}/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {step === 'upload' && (
            <div className="space-y-4">
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 px-4 py-2.5 rounded-lg hover:bg-blue-100 transition-all"
              >
                <Download size={14}/> Download CSV Template
              </button>
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
              >
                <Upload size={28} className="mx-auto text-slate-400 mb-3"/>
                <p className="text-sm font-semibold text-slate-700">Click to choose a CSV file</p>
                <p className="text-xs text-slate-400 mt-1">or drag and drop</p>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile}/>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-[11px] font-semibold text-slate-600 mb-2 uppercase tracking-wide">Required columns</p>
                <div className="flex flex-wrap gap-1.5">
                  {config.columns.map(col => (
                    <span key={col} className="text-[10px] font-mono font-medium bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-semibold text-slate-700">{parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''} found</span>
                {validRows.length > 0 && (
                  <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full font-semibold">{validRows.length} ready to import</span>
                )}
                {errorCount > 0 && (
                  <span className="text-xs text-red-700 bg-red-50 border border-red-200 px-2.5 py-0.5 rounded-full font-semibold">{errorCount} with errors — will be skipped</span>
                )}
                <button
                  onClick={() => { setStep('upload'); setParsedRows([]); setRowErrors({}); }}
                  className="ml-auto text-xs text-slate-500 hover:text-slate-800 underline"
                >
                  Choose different file
                </button>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-auto max-h-72">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-2 text-left font-semibold text-slate-500 border-b border-slate-200 w-7">#</th>
                      {config.columns.map(col => (
                        <th key={col} className="px-2 py-2 text-left font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap">
                          {config.columnLabels[col] || col}
                        </th>
                      ))}
                      <th className="px-2 py-2 text-left font-semibold text-slate-600 border-b border-slate-200">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.map((row, idx) => {
                      const errs = rowErrors[idx];
                      return (
                        <tr key={idx} className={errs ? 'bg-red-50' : ''}>
                          <td className="px-2 py-1.5 text-slate-400 font-mono">{idx + 1}</td>
                          {config.columns.map(col => (
                            <td key={col} className="px-2 py-1.5 text-slate-700 max-w-[130px] truncate" title={row[col] || ''}>
                              {row[col] || <span className="text-slate-300 italic">—</span>}
                            </td>
                          ))}
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            {errs
                              ? <span className="text-red-600 font-semibold" title={errs.join(' · ')}>⚠ {errs[0]}{errs.length > 1 ? ` +${errs.length - 1}` : ''}</span>
                              : <span className="text-emerald-600 font-semibold">✓ OK</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {validRows.length === 0 && (
                <p className="text-sm text-red-600 font-medium text-center py-2">No valid rows to import. Fix the errors in your CSV and re-upload.</p>
              )}
            </div>
          )}

          {step === 'importing' && (
            <div className="flex items-center gap-3 py-8 justify-center">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0"/>
              <span className="text-sm text-slate-700 font-medium">Importing — please wait…</span>
            </div>
          )}

          {step === 'done' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 size={20} className={successes > 0 ? 'text-emerald-600' : 'text-slate-400'}/>
                <span className="text-sm font-bold text-slate-900">
                  Import complete — {successes} of {results.length} succeeded
                </span>
              </div>
              <div className="border border-slate-200 rounded-lg overflow-auto max-h-64">
                {results.map((r, idx) => (
                  <div key={idx} className={`flex items-start gap-2.5 px-3 py-2.5 text-xs border-b border-slate-100 last:border-0 ${r.success ? '' : 'bg-red-50'}`}>
                    <span className={`font-bold mt-0.5 flex-shrink-0 ${r.success ? 'text-emerald-600' : 'text-red-500'}`}>
                      {r.success ? '✓' : '✗'}
                    </span>
                    <div>
                      <p className={`font-semibold leading-snug ${r.success ? 'text-slate-800' : 'text-red-800'}`}>{r.label}</p>
                      {r.error && <p className="text-red-500 mt-0.5 leading-snug">{r.error}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-all font-medium"
          >
            {step === 'done' ? 'Close' : 'Cancel'}
          </button>
          {step === 'preview' && validRows.length > 0 && (
            <button
              onClick={handleImport}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-all shadow-sm"
            >
              Import {validRows.length} row{validRows.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CsvImportModal;
