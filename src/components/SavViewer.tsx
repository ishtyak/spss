import React, { useState, useCallback, useMemo } from "react";
import { enqueueSnackbar } from "notistack";
import CrossTabulation from "./savViewer/CrossTabulation";
import DataOperations from "./savViewer/DataOperations";
import FactorAnalysis from "./savViewer/FactorAnalysis";
import TurfAnalysis from "./savViewer/TurfAnalysis";
import DataQCPanel from "./savViewer/DataQCPanel";
import AIAssistant from "./savViewer/AIAssistant";
import DataWeighting from "./savViewer/DataWeighting";
import { exportToExcel } from "./savViewer/exportExcel";

// ─── Pure‑JS SAV (SPSS) binary reader ──────────────────────────────
// Parses the .sav format directly from an ArrayBuffer so no Node
// stream polyfills are needed in the browser.

class SavParser {
    constructor(buffer) {
        this.buffer = buffer;
        this.view = new DataView(buffer);
        this.pos = 0;
        this.encoding = "utf-8";
        this.variables = [];
        this.valueLabels = {};
        this.header = {};
        this.compressionBias = 100;
        this.compressed = false;
        this.varCount = 0;
        // Maps raw 1-based variable record index (incl. continuation slots) → variable object or null
        this.rawIndexToVar = [];
        // Deferred value label assignments resolved after all metadata records (incl. long-name ext.) are parsed
        this._pendingValueLabels = [];
    }

    // ── low‑level readers ──────────────────────────
    readBytes(n) {
        const slice = new Uint8Array(this.buffer, this.pos, n);
        this.pos += n;
        return slice;
    }
    readString(n) {
        const bytes = this.readBytes(n);
        return new TextDecoder(this.encoding).decode(bytes).replace(/\0+$/, "");
    }
    readInt32() {
        const v = this.view.getInt32(this.pos, true);
        this.pos += 4;
        return v;
    }
    readFloat64() {
        const v = this.view.getFloat64(this.pos, true);
        this.pos += 8;
        return v;
    }
    skip(n) {
        this.pos += n;
    }

    // ── metadata ───────────────────────────────────
    parseHeader() {
        const recType = this.readString(4);
        if (recType !== "$FL2" && recType !== "$FL3") throw new Error("Not a valid .sav file");
        if (recType === "$FL3") throw new Error("ZLIB compressed .sav not supported");

        const product = this.readString(60);
        this.readInt32(); // layoutCode
        const nominalCaseSize = this.readInt32();
        const compression = this.readInt32();
        this.compressed = compression === 1;
        this.readInt32(); // weightIndex
        const nCases = this.readInt32();
        this.compressionBias = this.readFloat64();
        const created = this.readString(9);
        const time = this.readString(8);
        const fileLabel = this.readString(64);
        this.skip(3); // padding

        this.header = { product, nominalCaseSize, nCases, created, time, fileLabel, encoding: this.encoding };
        this.varCount = nominalCaseSize;
    }

    parseVariableRecords() {
        // keep parsing rec_type 2 records
        while (this.pos < this.buffer.byteLength) {
            const recType = this.readInt32();
            if (recType === 2) {
                this.parseVariableRecord();
            } else if (recType === 3) {
                this.parseValueLabelRecord();
            } else if (recType === 6) {
                this.parseDocumentRecord();
            } else if (recType === 7) {
                this.parseExtensionRecord();
            } else if (recType === 999) {
                this.skip(4); // filler
                break;
            } else {
                break;
            }
        }
    }

    parseVariableRecord() {
        const type = this.readInt32(); // 0=numeric, >0=string width
        const hasLabel = this.readInt32();
        const missingValueFormat = this.readInt32();
        const printFormat = this.readInt32();
        const writeFormat = this.readInt32();
        const name = this.readString(8).trim();

        let label = "";
        if (hasLabel === 1) {
            const labelLen = this.readInt32();
            label = this.readString(labelLen).trim();
            // labels are padded to multiple of 4
            const padded = Math.ceil(labelLen / 4) * 4;
            if (padded > labelLen) this.skip(padded - labelLen);
        }

        // missing values
        const missingCount = Math.abs(missingValueFormat);
        const missingValues = [];
        for (let i = 0; i < missingCount; i++) {
            missingValues.push(this.readFloat64());
        }

        // type < 0 means this is a continuation of a long string var — skip
        if (type >= 0) {
            const varObj = {
                name,
                label: label || name,
                type: type === 0 ? "numeric" : "string",
                width: type,
                printFormat,
                writeFormat,
                missingValues,
                measure: "",
                columnWidth: 8,
                alignment: "left",
            };
            this.variables.push(varObj);
            this.rawIndexToVar.push(varObj); // raw slot → real variable
        } else {
            this.rawIndexToVar.push(null); // continuation slot — no variable
        }
    }

    parseValueLabelRecord() {
        const labelCount = this.readInt32();
        const labels = [];
        for (let i = 0; i < labelCount; i++) {
            const value = this.readFloat64();
            const labelLen = this.readBytes(1)[0];
            const padded = Math.ceil((labelLen + 1) / 8) * 8 - 1;
            const label = this.readString(padded).substring(0, labelLen);
            labels.push({ value, label });
        }
        // rec type 4 follows — variable index record
        const recType4 = this.readInt32();
        if (recType4 === 4) {
            const varIndexCount = this.readInt32();
            for (let i = 0; i < varIndexCount; i++) {
                const idx = this.readInt32();
                // Defer assignment: rawIndexToVar may not be fully built yet and
                // long-name extension (subType 13) may rename variables later.
                this._pendingValueLabels.push({ idx, labels });
            }
        }
    }

    parseDocumentRecord() {
        const nLines = this.readInt32();
        this.skip(nLines * 80);
    }

    parseExtensionRecord() {
        const subType = this.readInt32();
        const size = this.readInt32();
        const count = this.readInt32();
        const totalBytes = size * count;

        if (subType === 20) {
            // encoding record
            this.encoding = this.readString(totalBytes).trim().toLowerCase();
            if (this.encoding === "utf-8" || this.encoding === "utf8") this.encoding = "utf-8";
        } else if (subType === 11 && size === 4) {
            // measurement level, col width, alignment
            for (let i = 0; i < count / 3 && i < this.variables.length; i++) {
                const measure = this.readInt32();
                const colWidth = this.readInt32();
                const alignment = this.readInt32();
                this.variables[i].measure = measure === 1 ? "nominal" : measure === 2 ? "ordinal" : "scale";
                this.variables[i].columnWidth = colWidth;
                this.variables[i].alignment = alignment === 0 ? "left" : alignment === 1 ? "right" : "center";
            }
            // skip any remaining
            const consumed = Math.min(Math.floor(count / 3), this.variables.length) * 12;
            if (consumed < totalBytes) this.skip(totalBytes - consumed);
        } else if (subType === 13) {
            // long variable names
            const str = this.readString(totalBytes);
            const pairs = str.split("\t");
            for (const pair of pairs) {
                const [shortName, longName] = pair.split("=");
                if (shortName && longName) {
                    const v = this.variables.find(
                        (vr) => vr.name.toLowerCase() === shortName.trim().toLowerCase()
                    );
                    if (v) v.name = longName.trim();
                }
            }
        } else {
            this.skip(totalBytes);
        }
    }

    // ── data records ───────────────────────────────
    parseData() {
        const rows = [];
        const numVarSlots = this._countVarSlots();
        const SYSMIS = -Number.MAX_VALUE;

        if (!this.compressed) {
            return this._readUncompressedData(numVarSlots, SYSMIS);
        }

        // bytecode‑compressed data
        let currentRow = {};
        let slotIndex = 0;
        let rowCount = 0;
        const maxRows = 100000;

        try {
            while (this.pos < this.buffer.byteLength && rowCount < maxRows) {
                const opcodes = this.readBytes(8);
                for (let i = 0; i < 8 && this.pos <= this.buffer.byteLength; i++) {
                    const code = opcodes[i];
                    if (code === 0) continue; // ignore padding
                    const varInfo = this._getVarInfoForSlot(slotIndex);
                    if (code === 252) {
                        // end of file
                        if (slotIndex > 0 && Object.keys(currentRow).length > 0) {
                            rows.push(currentRow);
                        }
                        return rows;
                    } else if (code === 253) {
                        // raw 8 bytes follow
                        if (varInfo && varInfo.type === "string") {
                            currentRow[varInfo.name] = (currentRow[varInfo.name] || "") + this.readString(8);
                        } else if (varInfo) {
                            currentRow[varInfo.name] = this.readFloat64();
                        } else {
                            this.skip(8);
                        }
                    } else if (code === 254) {
                        // string whitespace (8 spaces)
                        if (varInfo) {
                            currentRow[varInfo.name] = (currentRow[varInfo.name] || "") + "        ";
                        }
                    } else if (code === 255) {
                        // system missing
                        if (varInfo) {
                            currentRow[varInfo.name] = null;
                        }
                    } else {
                        // compressed numeric: value = code - bias
                        if (varInfo && varInfo.type === "numeric") {
                            currentRow[varInfo.name] = code - this.compressionBias;
                        } else if (varInfo) {
                            currentRow[varInfo.name] = (currentRow[varInfo.name] || "") + String.fromCharCode(code);
                        }
                    }

                    slotIndex++;
                    if (slotIndex >= numVarSlots) {
                        // trim string values
                        for (const v of this.variables) {
                            if (v.type === "string" && typeof currentRow[v.name] === "string") {
                                currentRow[v.name] = currentRow[v.name].trimEnd();
                            }
                        }
                        rows.push(currentRow);
                        currentRow = {};
                        slotIndex = 0;
                        rowCount++;
                    }
                }
            }
        } catch {
            // end of data
        }
        if (slotIndex > 0 && Object.keys(currentRow).length > 0) {
            rows.push(currentRow);
        }
        return rows;
    }

    _countVarSlots() {
        // each numeric = 1 slot, each string = ceil(width/8) slots
        let count = 0;
        for (const v of this.variables) {
            count += v.type === "string" ? Math.max(1, Math.ceil(v.width / 8)) : 1;
        }
        return count;
    }

    _getVarInfoForSlot(slotIndex) {
        let idx = 0;
        for (const v of this.variables) {
            const slots = v.type === "string" ? Math.max(1, Math.ceil(v.width / 8)) : 1;
            if (slotIndex >= idx && slotIndex < idx + slots) return v;
            idx += slots;
        }
        return null;
    }

    _readUncompressedData(numVarSlots, SYSMIS) {
        const rows = [];
        const maxRows = 100000;
        try {
            while (this.pos < this.buffer.byteLength && rows.length < maxRows) {
                const row = {};
                for (let s = 0; s < numVarSlots; s++) {
                    const varInfo = this._getVarInfoForSlot(s);
                    if (varInfo && varInfo.type === "string") {
                        row[varInfo.name] = (row[varInfo.name] || "") + this.readString(8);
                    } else if (varInfo) {
                        const val = this.readFloat64();
                        row[varInfo.name] = val === SYSMIS ? null : val;
                    } else {
                        this.skip(8);
                    }
                }
                for (const v of this.variables) {
                    if (v.type === "string" && typeof row[v.name] === "string") {
                        row[v.name] = row[v.name].trimEnd();
                    }
                }
                rows.push(row);
            }
        } catch {
            // end of data
        }
        return rows;
    }

    // ── main entry ─────────────────────────────────
    parse() {
        this.parseHeader();
        this.parseVariableRecords();
        // Resolve deferred value labels now that all variable metadata
        // (including long-name extension records) has been parsed.
        // rawIndexToVar uses the raw 1-based record index which correctly
        // accounts for string-continuation slots that are absent from this.variables.
        for (const { idx, labels } of this._pendingValueLabels) {
            const v = this.rawIndexToVar[idx - 1];
            if (v) {
                if (!this.valueLabels[v.name]) {
                    this.valueLabels[v.name] = labels;
                } else {
                    // Merge: add any labels not already present for this variable
                    const existing = this.valueLabels[v.name];
                    for (const lbl of labels) {
                        if (!existing.some((e) => e.value === lbl.value)) {
                            existing.push(lbl);
                        }
                    }
                }
            }
        }
        const data = this.parseData();
        return {
            header: this.header,
            variables: this.variables,
            valueLabels: this.valueLabels,
            data,
        };
    }
}

// ─── Helper: format value using value labels ────────────────────────
function formatCellValue(value:any, varName:any, valueLabels:any) {
    if (value === null || value === undefined) return "";
    const labels = valueLabels[varName];
    if (labels) {
        const match = labels.find((l) => Math.abs(l.value - value) < 1e-9);
        if (match) return `${value} (${match.label})`;
    }
    return String(value);
}

// ─── React component ───────────────────────────────────────────────
const TABS = [
    { key: "data", label: "Data View", icon: "📋" },
    { key: "variable", label: "Variable View", icon: "📐" },
    { key: "crosstab", label: "Cross-Tab", icon: "📊" },
    { key: "operations", label: "Data Ops", icon: "🔧" },
    { key: "factor", label: "Factor & Corr", icon: "🔬" },
    { key: "turf", label: "TURF & Driver", icon: "🎯" },
    { key: "qc", label: "Data QC", icon: "✅" },
    { key: "ai", label: "AI Assistant", icon: "🤖" },
    { key: "weight", label: "Weighting", icon: "⚖️" },
];

export default function SavViewer() {
    const [fileInfo, setFileInfo] = useState(null);
    const [variables, setVariables] = useState([]);
    const [valueLabels, setValueLabels] = useState({});
    const [data, setData] = useState([]);
    const [activeTab, setActiveTab] = useState("data");
    const [loading, setLoading] = useState(false);
    const [fileName, setFileName] = useState("");
    const [dragActive, setDragActive] = useState(false);
    const [weights, setWeights] = useState(null);
    const [weightVar, setWeightVar] = useState("");
    const [dataSearch, setDataSearch] = useState("");
    const [dataSortConfig, setDataSortConfig] = useState({ key: null, dir: "asc" });
    const [dataCopied, setDataCopied] = useState(false);
    const [varSearch, setVarSearch] = useState("");
    const [varSortConfig, setVarSortConfig] = useState({ key: null, dir: "asc" });
    const [varCopied, setVarCopied] = useState(false);

    const handleFile = useCallback(async (file:any) => {
        if (!file) return;
        if (!file.name.toLowerCase().endsWith(".sav")) {
            enqueueSnackbar("Please upload a .sav file", { variant: "warning" });
            return;
        }
        setLoading(true);
        setFileName(file.name);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const parser = new SavParser(arrayBuffer);
            const result = parser.parse();

            setFileInfo(result.header);
            setVariables(result.variables);
            setValueLabels(result.valueLabels);
            setData(result.data);
            setActiveTab("data");
            setWeights(null);
            setWeightVar("");
            enqueueSnackbar(`Loaded ${result.data.length} rows, ${result.variables.length} variables`, { variant: "success" });
        } catch (err) {
            console.error(err);
            enqueueSnackbar("Error reading .sav file: " + err.message, { variant: "error" });
        } finally {
            setLoading(false);
        }
    }, []);

    const onFileChange = (e) => handleFile(e.target.files?.[0]);

    const onDrop = (e) => {
        e.preventDefault();
        setDragActive(false);
        handleFile(e.dataTransfer.files?.[0]);
    };

    const handleExportExcel = () => {
        if (!data.length) return;
        exportToExcel(data, variables, valueLabels, fileName);
        enqueueSnackbar("Exported to Excel", { variant: "success" });
    };

    const MAX_DISPLAY_ROWS = 500;

    const copyVarTable = () => {
        const cols = ["#", "Name", "Type", "Width", "Label", "Value Labels", "Missing", "Measure", "Alignment"];
        const body = filteredVarRows.map((v, i) => {
            const vl = valueLabels[v.name];
            const vlStr = vl ? vl.map((l) => `${l.value}=${l.label}`).join("; ") : "";
            const missing = v.missingValues?.length > 0 ? v.missingValues.join(", ") : "";
            return [i + 1, v.name, v.type, v.type === "string" ? v.width : 8, v.label, vlStr, missing, v.measure || "", v.alignment || ""].join("\t");
        }).join("\n");
        navigator.clipboard.writeText(cols.join("\t") + "\n" + body).then(() => {
            setVarCopied(true);
            setTimeout(() => setVarCopied(false), 2000);
        });
    };

    const copyDataTable = () => {
        const rows = filteredDataRows;
        const header = variables.map((v) => v.name).join("\t");
        const body = rows.map((row) =>
            variables.map((v) => formatCellValue(row[v.name], v.name, valueLabels)).join("\t")
        ).join("\n");
        navigator.clipboard.writeText(header + "\n" + body).then(() => {
            setDataCopied(true);
            setTimeout(() => setDataCopied(false), 2000);
        });
    };

    const toggleDataSort = (key) => {
        setDataSortConfig((prev) => ({ key, dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc" }));
    };

    const toggleVarSort = (key) => {
        setVarSortConfig((prev) => ({ key, dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc" }));
    };

    const filteredDataRows = useMemo(() => {
        let rows = data;
        if (dataSearch.trim()) {
            const q = dataSearch.toLowerCase();
            rows = rows.filter((row) =>
                variables.some((v) => {
                    const val = formatCellValue(row[v.name], v.name, valueLabels);
                    return val.toLowerCase().includes(q);
                })
            );
        }
        if (dataSortConfig.key) {
            const k = dataSortConfig.key;
            rows = [...rows].sort((a, b) => {
                const av = formatCellValue(a[k], k, valueLabels);
                const bv = formatCellValue(b[k], k, valueLabels);
                return dataSortConfig.dir === "asc"
                    ? av.localeCompare(bv, undefined, { numeric: true })
                    : bv.localeCompare(av, undefined, { numeric: true });
            });
        }
        if (!dataSearch.trim()) {
            return rows.slice(0, MAX_DISPLAY_ROWS);
        }
        return rows;
    }, [data, dataSearch, dataSortConfig, variables, valueLabels]);

    const filteredVarRows = useMemo(() => {
        let rows = variables;
        if (varSearch.trim()) {
            const q = varSearch.toLowerCase();
            rows = rows.filter((v) =>
                v.name.toLowerCase().includes(q) ||
                v.label.toLowerCase().includes(q) ||
                v.type.toLowerCase().includes(q)
            );
        }
        if (varSortConfig.key) {
            const k = varSortConfig.key;
            rows = [...rows].sort((a, b) => {
                const av = String(a[k] ?? "");
                const bv = String(b[k] ?? "");
                return varSortConfig.dir === "asc"
                    ? av.localeCompare(bv, undefined, { numeric: true })
                    : bv.localeCompare(av, undefined, { numeric: true });
            });
        }
        return rows;
    }, [variables, varSearch, varSortConfig]);

    return (
        <div className="w-full h-full flex flex-col p-4 overflow-hidden">
            {/* ── Header ────────────────────────────────── */}
            <div className="flex items-center justify-between mb-3">
                <h1 className="text-sm font-semibold text-gray-600">SAV File Viewer</h1>
                <div className="flex items-center gap-3">
                    {fileName && (
                        <span className="text-sm text-gray-500">
                            {fileName}
                            {fileInfo && ` • ${data.length} rows • ${variables.length} variables`}
                            {weights && " • ⚖️ Weighted"}
                        </span>
                    )}
                    {fileInfo && (
                        <button onClick={handleExportExcel}
                            className="bg-sky-500 hover:bg-sky-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5">
                            📥 Export to Excel
                        </button>
                    )}
                </div>
            </div>

            {/* ── Upload area ───────────────────────────── */}
            {!fileInfo && (
                <div
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={onDrop}
                    className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors mb-4 ${dragActive ? "border-sky-500 bg-sky-50" : "border-gray-300 bg-gray-50"
                        }`}
                >
                    {loading ? (
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-gray-500">Parsing file…</p>
                        </div>
                    ) : (
                        <>
                            <svg className="mx-auto h-12 w-12 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            <p className="text-gray-600 font-medium mb-1">Drag & drop a .sav file here</p>
                            <p className="text-gray-400 text-sm mb-3">or</p>
                            <label className="cursor-pointer inline-block bg-sky-500 hover:bg-sky-600 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                                Browse File
                                <input type="file" accept=".sav" onChange={onFileChange} className="hidden" />
                            </label>
                        </>
                    )}
                </div>
            )}

            {/* ── Tabs + re‑upload ──────────────────────── */}
            {fileInfo && (
                <>
                    <div className="flex items-center gap-1 mb-3 border-b pb-2 overflow-x-auto">
                        {TABS.map((tab) => (
                            <button key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors whitespace-nowrap flex items-center gap-1 ${activeTab === tab.key
                                    ? "text-sky-600 border-b-2 border-sky-500 bg-sky-50"
                                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                                    }`}
                            >
                                <span>{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}

                        <div className="ml-auto flex-shrink-0">
                            <label className="cursor-pointer text-sm text-sky-600 hover:text-sky-700 font-medium transition-colors">
                                Upload new file
                                <input type="file" accept=".sav" onChange={onFileChange} className="hidden" />
                            </label>
                        </div>
                    </div>

                    {loading && (
                        <div className="flex items-center justify-center py-12">
                            <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    )}

                    {/* ── Data View ─────────────────────── */}
                    {!loading && activeTab === "data" && (
                        <div className="flex-1 flex flex-col overflow-hidden border rounded-lg">
                            {data.length === 0 ? (
                                <p className="text-gray-400 text-center py-12">No data rows found</p>
                            ) : (
                                <>
                                    {/* Search bar */}
                                    <div className="flex-shrink-0 flex items-center gap-3 px-3 py-2 border-b bg-white">
                                        <input
                                            type="text"
                                            value={dataSearch}
                                            onChange={(e) => setDataSearch(e.target.value)}
                                            placeholder="Search across all columns…"
                                            className="w-full max-w-xs px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:border-sky-400"
                                        />
                                        <span className="text-xs text-gray-400 whitespace-nowrap">
                                            {dataSearch.trim()
                                                ? `${filteredDataRows.length} of ${data.length} rows`
                                                : `${Math.min(data.length, MAX_DISPLAY_ROWS)} of ${data.length} rows`}
                                        </span>
                                        {dataSortConfig.key && (
                                            <button
                                                onClick={() => setDataSortConfig({ key: null, dir: "asc" })}
                                                className="text-xs text-sky-600 hover:text-sky-800 whitespace-nowrap"
                                            >
                                                Clear sort
                                            </button>
                                        )}
                                        <button
                                            onClick={copyDataTable}
                                            title="Copy table to clipboard"
                                            className={`ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                                dataCopied
                                                    ? "bg-green-50 border-green-300 text-green-600"
                                                    : "bg-white border-gray-300 text-gray-500 hover:border-sky-400 hover:text-sky-600"
                                            }`}
                                        >
                                            {dataCopied ? (
                                                <>
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                    Copied!
                                                </>
                                            ) : (
                                                <>
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                    </svg>
                                                    Copy table
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-auto">
                                        <table className="w-full text-sm border-collapse">
                                            <thead className="sticky top-0 z-10">
                                                <tr className="bg-gray-100">
                                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 border-r border-b w-12">#</th>
                                                    {variables.map((v) => (
                                                        <th
                                                            key={v.name}
                                                            onClick={() => toggleDataSort(v.name)}
                                                            className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b whitespace-nowrap cursor-pointer select-none hover:bg-gray-200 transition-colors"
                                                            title={v.label}
                                                        >
                                                            <span className="flex items-center gap-1">
                                                                {v.name}
                                                                <span className="text-gray-400 text-[10px]">
                                                                    {dataSortConfig.key === v.name
                                                                        ? dataSortConfig.dir === "asc" ? "▲" : "▼"
                                                                        : "⇅"}
                                                                </span>
                                                            </span>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredDataRows.map((row, ri) => (
                                                    <tr key={ri} className="hover:bg-sky-50 transition-colors">
                                                        <td className="px-3 py-1.5 text-xs text-gray-400 border-r border-b">{ri + 1}</td>
                                                        {variables.map((v) => (
                                                            <td
                                                                key={v.name}
                                                                className="px-3 py-1.5 text-xs text-gray-700 border-r border-b whitespace-nowrap max-w-[200px] truncate"
                                                                title={formatCellValue(row[v.name], v.name, valueLabels)}
                                                            >
                                                                {formatCellValue(row[v.name], v.name, valueLabels)}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* ── Variable View ─────────────────── */}
                    {!loading && activeTab === "variable" && (
                        <div className="flex-1 flex flex-col overflow-hidden border rounded-lg">
                            {/* Search bar */}
                            <div className="flex-shrink-0 flex items-center gap-3 px-3 py-2 border-b bg-white">
                                <input
                                    type="text"
                                    value={varSearch}
                                    onChange={(e) => setVarSearch(e.target.value)}
                                    placeholder="Search by name, label, or type…"
                                    className="w-full max-w-xs px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:border-sky-400"
                                />
                                <span className="text-xs text-gray-400 whitespace-nowrap">
                                    {varSearch.trim()
                                        ? `${filteredVarRows.length} of ${variables.length} variables`
                                        : `${variables.length} variables`}
                                </span>
                                {varSortConfig.key && (
                                    <button
                                        onClick={() => setVarSortConfig({ key: null, dir: "asc" })}
                                        className="text-xs text-sky-600 hover:text-sky-800 whitespace-nowrap"
                                    >
                                        Clear sort
                                    </button>
                                )}
                                <button
                                    onClick={copyVarTable}
                                    title="Copy variable table to clipboard"
                                    className={`ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                        varCopied
                                            ? "bg-green-50 border-green-300 text-green-600"
                                            : "bg-white border-gray-300 text-gray-500 hover:border-sky-400 hover:text-sky-600"
                                    }`}
                                >
                                    {varCopied ? (
                                        <>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                            Copied!
                                        </>
                                    ) : (
                                        <>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                            Copy table
                                        </>
                                    )}
                                </button>
                            </div>
                            <div className="flex-1 overflow-auto">
                                <table className="min-w-full text-sm border-collapse">
                                    <thead className="sticky top-0 z-10">
                                        <tr className="bg-gray-100">
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 border-r border-b w-12">#</th>
                                            {[
                                                { key: "name", label: "Name" },
                                                { key: "type", label: "Type" },
                                                { key: "width", label: "Width" },
                                                { key: "label", label: "Label" },
                                            ].map(({ key, label }) => (
                                                <th
                                                    key={key}
                                                    onClick={() => toggleVarSort(key)}
                                                    className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b whitespace-nowrap cursor-pointer select-none hover:bg-gray-200 transition-colors"
                                                >
                                                    <span className="flex items-center gap-1">
                                                        {label}
                                                        <span className="text-gray-400 text-[10px]">
                                                            {varSortConfig.key === key
                                                                ? varSortConfig.dir === "asc" ? "▲" : "▼"
                                                                : "⇅"}
                                                        </span>
                                                    </span>
                                                </th>
                                            ))}
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b">Value Labels</th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b">Missing</th>
                                            {[
                                                { key: "measure", label: "Measure" },
                                                { key: "alignment", label: "Alignment" },
                                            ].map(({ key, label }) => (
                                                <th
                                                    key={key}
                                                    onClick={() => toggleVarSort(key)}
                                                    className={`px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b whitespace-nowrap cursor-pointer select-none hover:bg-gray-200 transition-colors ${key === "alignment" ? "border-r-0" : ""}`}
                                                >
                                                    <span className="flex items-center gap-1">
                                                        {label}
                                                        <span className="text-gray-400 text-[10px]">
                                                            {varSortConfig.key === key
                                                                ? varSortConfig.dir === "asc" ? "▲" : "▼"
                                                                : "⇅"}
                                                        </span>
                                                    </span>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredVarRows.map((v, i) => {
                                            const vl = valueLabels[v.name];
                                            return (
                                                <tr key={v.name} className="hover:bg-sky-50 transition-colors">
                                                    <td className="px-3 py-2 text-xs text-gray-400 border-r border-b">{i + 1}</td>
                                                    <td className="px-3 py-2 text-xs font-medium text-gray-800 border-r border-b">{v.name}</td>
                                                    <td className="px-3 py-2 text-xs text-gray-600 border-r border-b capitalize">{v.type}</td>
                                                    <td className="px-3 py-2 text-xs text-gray-600 border-r border-b">{v.type === "string" ? v.width : 8}</td>
                                                    <td className="px-3 py-2 text-xs text-gray-600 border-r border-b min-w-[200px] whitespace-normal break-words">{v.label}</td>
                                                    <td className="px-3 py-2 text-xs text-gray-600 border-r border-b min-w-[220px]">
                                                        {vl ? (
                                                            <div>
                                                                {vl.map((lbl, li) => (
                                                                    <div key={li} className="whitespace-nowrap">
                                                                        <span className="text-gray-400">{Number.isInteger(lbl.value) ? lbl.value.toFixed(2) : lbl.value}</span>
                                                                        {" = "}
                                                                        <span>{lbl.label}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-300">None</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-xs text-gray-600 border-r border-b">
                                                        {v.missingValues?.length > 0 ? v.missingValues.join(", ") : <span className="text-gray-300">None</span>}
                                                    </td>
                                                    <td className="px-3 py-2 text-xs text-gray-600 border-r border-b capitalize">{v.measure || "—"}</td>
                                                    <td className="px-3 py-2 text-xs text-gray-600 border-b capitalize">{v.alignment || "—"}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ── Cross-Tabulation ──────────────── */}
                    {!loading && activeTab === "crosstab" && (
                        <div className="flex-1 overflow-auto">
                            <CrossTabulation data={data} variables={variables} valueLabels={valueLabels} weights={weights} />
                        </div>
                    )}

                    {/* ── Data Operations ───────────────── */}
                    {!loading && activeTab === "operations" && (
                        <div className="flex-1 overflow-auto">
                            <DataOperations data={data} variables={variables} setData={setData} setVariables={setVariables} SavParser={SavParser} />
                        </div>
                    )}

                    {/* ── Factor Analysis & Correlation ── */}
                    {!loading && activeTab === "factor" && (
                        <div className="flex-1 overflow-hidden">
                            <FactorAnalysis data={data} variables={variables} />
                        </div>
                    )}

                    {/* ── TURF & Driver Analysis ────────── */}
                    {!loading && activeTab === "turf" && (
                        <div className="flex-1 overflow-hidden">
                            <TurfAnalysis data={data} variables={variables} />
                        </div>
                    )}

                    {/* ── Data QC ───────────────────────── */}
                    {!loading && activeTab === "qc" && (
                        <div className="flex-1 overflow-hidden">
                            <DataQCPanel data={data} variables={variables} valueLabels={valueLabels} />
                        </div>
                    )}

                    {/* ── AI Assistant ──────────────────── */}
                    {!loading && activeTab === "ai" && (
                        <div className="flex-1 overflow-hidden border rounded-lg">
                            <AIAssistant data={data} variables={variables} valueLabels={valueLabels} weights={weights} />
                        </div>
                    )}

                    {/* ── Data Weighting ────────────────── */}
                    {!loading && activeTab === "weight" && (
                        <div className="flex-1 overflow-auto">
                            <DataWeighting data={data} variables={variables} valueLabels={valueLabels}
                                weights={weights} setWeights={setWeights} weightVar={weightVar} setWeightVar={setWeightVar} />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
