import React, { useState, useCallback, useMemo } from "react";
import { enqueueSnackbar } from "notistack";
import { useAuth } from "../context/useAuth";
import CrossTabulation from "./savViewer/CrossTabulation";
import CorrelationMatrix from "./savViewer/CorrelationMatrix";
import DataOperations from "./savViewer/DataOperations";
import FactorAnalysis from "./savViewer/FactorAnalysis";
import TurfAnalysis from "./savViewer/TurfAnalysis";
import DataQCPanel from "./savViewer/DataQCPanel";
import AIAssistant from "./savViewer/AIAssistant";
import DataWeighting from "./savViewer/DataWeighting";
import { exportToExcel } from "./savViewer/exportExcel";
import type {
    SavVariable,
    ValueLabelEntry,
    ValueLabels,
    DataRow,
    SavHeader,
} from "../types";

// ─── Pure‑JS SAV (SPSS) binary reader ──────────────────────────────
// Parses the .sav format directly from an ArrayBuffer so no Node
// stream polyfills are needed in the browser.

class SavParser {
    private buffer: ArrayBuffer;
    private view: DataView;
    private pos: number;
    private encoding: string;
    variables: SavVariable[];
    valueLabels: ValueLabels;
    header: Partial<SavHeader>;
    private compressionBias: number;
    private compressed: boolean;
    private rawIndexToVar: (SavVariable | null)[];
    private _pendingValueLabels: Array<{ idx: number; labels: ValueLabelEntry[] }>;

    constructor(buffer: ArrayBuffer) {
        this.buffer = buffer;
        this.view = new DataView(buffer);
        this.pos = 0;
        this.encoding = "utf-8";
        this.variables = [];
        this.valueLabels = {};
        this.header = {};
        this.compressionBias = 100;
        this.compressed = false;
        // Maps raw 1-based variable record index (incl. continuation slots) → variable object or null
        this.rawIndexToVar = [];
        // Deferred value label assignments resolved after all metadata records (incl. long-name ext.) are parsed
        this._pendingValueLabels = [];
    }

    // ── low‑level readers ──────────────────────────
    readBytes(n: number) {
        const slice = new Uint8Array(this.buffer, this.pos, n);
        this.pos += n;
        return slice;
    }
    readString(n: number) {
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
    skip(n: number) {
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
    }

    parseVariableRecords(): void {
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

    parseVariableRecord(): void {
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
                type: (type === 0 ? "numeric" : "string") as "numeric" | "string",
                width: type,
                printFormat,
                writeFormat,
                missingValues,
                measure: "" as "nominal" | "ordinal" | "scale" | "",
                columnWidth: 8,
                alignment: "left" as "left" | "right" | "center" | "",
            };
            this.variables.push(varObj);
            this.rawIndexToVar.push(varObj); // raw slot → real variable
        } else {
            this.rawIndexToVar.push(null); // continuation slot — no variable
        }
    }

    parseValueLabelRecord(): void {
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

    parseDocumentRecord(): void {
        const nLines = this.readInt32();
        this.skip(nLines * 80);
    }

    parseExtensionRecord(): void {
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
        const rows: DataRow[] = [];
        const numVarSlots = this._countVarSlots();
        const SYSMIS = -Number.MAX_VALUE;

        if (!this.compressed) {
            return this._readUncompressedData(numVarSlots, SYSMIS);
        }

        // bytecode‑compressed data
        let currentRow: DataRow = {};
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
                                currentRow[v.name] = (currentRow[v.name] as string).trimEnd();
                            }
                        }
                        rows.push(currentRow);
                        currentRow = {} as DataRow;
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

    _countVarSlots(): number {
        // each numeric = 1 slot, each string = ceil(width/8) slots
        let count = 0;
        for (const v of this.variables) {
            count += v.type === "string" ? Math.max(1, Math.ceil(v.width / 8)) : 1;
        }
        return count;
    }

    _getVarInfoForSlot(slotIndex: number): SavVariable | null {
        let idx = 0;
        for (const v of this.variables) {
            const slots = v.type === "string" ? Math.max(1, Math.ceil(v.width / 8)) : 1;
            if (slotIndex >= idx && slotIndex < idx + slots) return v;
            idx += slots;
        }
        return null;
    }

    _readUncompressedData(numVarSlots: number, SYSMIS: number): DataRow[] {
        const rows: DataRow[] = [];
        const maxRows = 100000;
        try {
            while (this.pos < this.buffer.byteLength && rows.length < maxRows) {
                const row: DataRow = {};
                for (let s = 0; s < numVarSlots; s++) {
                    const varInfo = this._getVarInfoForSlot(s);
                    if (varInfo && varInfo.type === "string") {
                        row[varInfo.name] = ((row[varInfo.name] as string) || "") + this.readString(8);
                    } else if (varInfo) {
                        const val = this.readFloat64();
                        row[varInfo.name] = val === SYSMIS ? null : val;
                    } else {
                        this.skip(8);
                    }
                }
                for (const v of this.variables) {
                    if (v.type === "string" && typeof row[v.name] === "string") {
                        row[v.name] = (row[v.name] as string).trimEnd();
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
            header: this.header as SavHeader,
            variables: this.variables,
            valueLabels: this.valueLabels,
            data,
        };
    }
}

// ─── Helper: format value using value labels ────────────────────────
function formatCellValue(value: string | number | null | undefined, varName: string, valueLabels: ValueLabels): string {
    if (value === null || value === undefined) return "";
    const labels = valueLabels[varName];
    if (labels && typeof value === "number") {
        const match = labels.find((l) => Math.abs(l.value - value) < 1e-9);
        if (match) return `${value} (${match.label})`;
    }
    return String(value);
}

// ─── Dashboard home (shown before any file is uploaded) ───────────
const STAT_CARDS = [
    {
        label: "Analysis Modules", value: "9", sub: "Ready to use",
        badge: "+1 new", badgeColor: "bg-purple-50 text-purple-600",
        icon: (
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
            </div>
        ),
    },
    {
        label: "Variable Types", value: "4", sub: "Numeric, String, Date, Other",
        badge: "Full support", badgeColor: "bg-cyan-50 text-cyan-600",
        icon: (
            <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
            </div>
        ),
    },
    {
        label: "Charts & Visuals", value: "12+", sub: "Export-ready heatmaps",
        badge: "↑ +23% insights", badgeColor: "bg-green-50 text-green-600",
        icon: (
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            </div>
        ),
    },
    {
        label: "Processing Speed", value: "< 2s", sub: "Avg SAV parse time",
        badge: "↑ +8x faster", badgeColor: "bg-blue-50 text-blue-600",
        icon: (
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
        ),
    },
];

const TOOL_CARDS = [
    {
        key: "crosstab", label: "Cross-Tabulation", sub: "Chi-square & sig letters",
        gradient: "from-blue-500 to-blue-600",
        icon: <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2M4 20h16" /></svg>,
    },
    {
        key: "corrmatrix", label: "Correlation Matrix", sub: "Heatmap & p-values",
        gradient: "from-rose-500 to-pink-600",
        icon: <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
    },
    {
        key: "factor", label: "Factor & PCA", sub: "Eigenvalues & loadings",
        gradient: "from-emerald-500 to-green-600",
        icon: <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>,
        badge: "PCA",
    },
    {
        key: "turf", label: "TURF & Driver", sub: "Reach optimisation",
        gradient: "from-violet-500 to-purple-600",
        icon: <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
    },
    {
        key: "operations", label: "Data Operations", sub: "Filter, compute, recode",
        gradient: "from-cyan-500 to-teal-600",
        icon: <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
    },
    {
        key: "qc", label: "Data QC", sub: "Missing, duplicates, outliers",
        gradient: "from-orange-500 to-amber-500",
        icon: <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
        key: "ai", label: "AI Assistant", sub: "Ask questions in plain English",
        gradient: "from-fuchsia-500 to-pink-500",
        icon: <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>,
        badge: "AI",
    },
    {
        key: "weight", label: "Data Weighting", sub: "Apply & compare weights",
        gradient: "from-amber-500 to-yellow-500",
        icon: <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>,
    },
];

interface DashboardHomeProps {
    dragActive: boolean;
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onTabChange: (tab: string) => void;
}

function DashboardHome({ dragActive, onDragOver, onDragLeave, onDrop, onFileChange, onTabChange }: DashboardHomeProps) {
    const { user } = useAuth();
    const firstName = user?.given_name || user?.name?.split(" ")[0] || "there";

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50/60 p-6">
            {/* ── Welcome ── */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">
                    Welcome back, {firstName} 👋
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                    Your statistical analysis workspace — drop a .sav file to get started instantly.
                </p>
            </div>

            {/* ── Upload card ── */}
            <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`mb-6 border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 bg-white
                    ${dragActive ? "border-blue-400 bg-blue-50 scale-[1.01]" : "border-gray-200 hover:border-blue-300 hover:bg-blue-50/30"}`}
            >
                <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                    <svg className="w-7 h-7 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                </div>
                <p className="text-gray-800 font-semibold text-base mb-1">Drop your .sav file here</p>
                <p className="text-gray-400 text-sm mb-5">SPSS / SAV format · Up to 100 MB · Processed locally in your browser</p>
                <label className="cursor-pointer inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-md">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Browse File
                    <input type="file" accept=".sav" onChange={onFileChange} className="hidden" />
                </label>
            </div>

            {/* ── Stat cards ── */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                {STAT_CARDS.map((s) => (
                    <div key={s.label} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <p className="text-xs text-gray-400 font-medium">{s.label}</p>
                                <p className="text-2xl font-bold text-gray-900 mt-0.5">{s.value}</p>
                            </div>
                            {s.icon}
                        </div>
                        <p className="text-xs text-gray-400">{s.sub}</p>
                        <div className="mt-3">
                            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.badgeColor}`}>
                                ↗ {s.badge}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Quick Actions ── */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-base font-bold text-gray-900">Quick Actions</h2>
                    <p className="text-xs text-gray-400">Jump right into your favourite tools (upload a file first)</p>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
                {TOOL_CARDS.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => {
                            onTabChange(t.key);
                            enqueueSnackbar("Upload a .sav file to use this module", { variant: "info" });
                        }}
                        className="relative bg-white border border-gray-100 rounded-2xl p-5 text-left shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
                    >
                        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${t.gradient} flex items-center justify-center mb-4 shadow-md group-hover:scale-105 transition-transform`}>
                            {t.icon}
                        </div>
                        <p className="text-sm font-bold text-gray-800">{t.label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{t.sub}</p>
                        {t.badge && (
                            <span className="absolute top-3 right-3 text-[10px] font-bold bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full">
                                {t.badge}
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}

// ─── Icon helpers (defined at module level to avoid re-creation) ──
const CopyIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);
const CheckIcon = () => (
    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
);

// ─── Nav config ───────────────────────────────────────────────────
const NAV_SECTIONS = [
    {
        heading: "VIEWS",
        items: [
            {
                key: "data", label: "Data View",
                icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 6h18M3 14h18M3 18h18" /></svg>,
            },
            {
                key: "variable", label: "Variable View",
                icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
            },
        ],
    },
    {
        heading: "ANALYZE",
        items: [
            {
                key: "crosstab", label: "Cross-Tab",
                icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2M4 20h16" /></svg>,
            },
            {
                key: "factor", label: "Factor & Corr",
                icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>,
            },
            {
                key: "corrmatrix", label: "Corr Matrix",
                icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
            },
            {
                key: "turf", label: "TURF & Driver",
                icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
            },
        ],
    },
    {
        heading: "TOOLS",
        items: [
            {
                key: "operations", label: "Data Ops",
                icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
            },
            {
                key: "qc", label: "Data QC",
                icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
            },
            {
                key: "ai", label: "AI Assistant",
                icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>,
            },
            {
                key: "weight", label: "Weighting",
                icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>,
            },
        ],
    },
];

// ─── React component ───────────────────────────────────────────────
export default function SavViewer() {
    const { user, logout } = useAuth();
    const [fileInfo, setFileInfo] = useState<SavHeader | null>(null);
    const [variables, setVariables] = useState<SavVariable[]>([]);
    const [valueLabels, setValueLabels] = useState<ValueLabels>({});
    const [data, setData] = useState<DataRow[]>([]);
    const [activeTab, setActiveTab] = useState("data");
    const [loading, setLoading] = useState(false);
    const [fileName, setFileName] = useState("");
    const [dragActive, setDragActive] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const [weights, setWeights] = useState<number[] | null>(null);
    const [weightVar, setWeightVar] = useState("");
    const [dataSearch, setDataSearch] = useState("");
    const [dataSortConfig, setDataSortConfig] = useState<{ key: string | null; dir: "asc" | "desc" }>({ key: null, dir: "asc" });
    const [dataCopied, setDataCopied] = useState(false);
    const [varSearch, setVarSearch] = useState("");
    const [varSortConfig, setVarSortConfig] = useState<{ key: string | null; dir: "asc" | "desc" }>({ key: null, dir: "asc" });
    const [varCopied, setVarCopied] = useState(false);

    const handleFile = useCallback(async (file: File) => {
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
            enqueueSnackbar("Error reading .sav file: " + (err as Error).message, { variant: "error" });
        } finally {
            setLoading(false);
        }
    }, []);

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => handleFile(e.target.files?.[0] as File);
    const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragActive(false);
        handleFile(e.dataTransfer.files?.[0]);
    };
    const handleExportExcel = () => {
        if (!data.length) return;
        exportToExcel(data, variables, valueLabels, fileName);
        enqueueSnackbar("Exported to Excel", { variant: "success" });
    };

    const handleReset = () => {
        setFileInfo(null);
        setVariables([]);
        setValueLabels({});
        setData([]);
        setFileName("");
        setActiveTab("data");
        setWeights(null);
        setWeightVar("");
        setDataSearch("");
        setVarSearch("");
        setDataSortConfig({ key: null, dir: "asc" });
        setVarSortConfig({ key: null, dir: "asc" });
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
        const header = variables.map((v) => v.name).join("\t");
        const body = filteredDataRows.map((row) =>
            variables.map((v) => formatCellValue(row[v.name], v.name, valueLabels)).join("\t")
        ).join("\n");
        navigator.clipboard.writeText(header + "\n" + body).then(() => {
            setDataCopied(true);
            setTimeout(() => setDataCopied(false), 2000);
        });
    };
    const toggleDataSort = (key: string) =>
        setDataSortConfig((prev) => ({ key, dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc" }));
    const toggleVarSort = (key: string) =>
        setVarSortConfig((prev) => ({ key, dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc" }));

    const filteredDataRows = useMemo(() => {
        let rows = data;
        if (dataSearch.trim()) {
            const q = dataSearch.toLowerCase();
            rows = rows.filter((row) =>
                variables.some((v) => formatCellValue(row[v.name], v.name, valueLabels).toLowerCase().includes(q))
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
        return dataSearch.trim() ? rows : rows.slice(0, MAX_DISPLAY_ROWS);
    }, [data, dataSearch, dataSortConfig, variables, valueLabels]);

    const filteredVarRows = useMemo(() => {
        let rows = variables;
        if (varSearch.trim()) {
            const q = varSearch.toLowerCase();
            rows = rows.filter((v) =>
                v.name.toLowerCase().includes(q) || v.label.toLowerCase().includes(q) || v.type.toLowerCase().includes(q)
            );
        }
        if (varSortConfig.key) {
            const k = varSortConfig.key;
            rows = [...rows].sort((a, b) => {
                const av = String(a[k as keyof typeof a] ?? "");
                const bv = String(b[k as keyof typeof b] ?? "");
                return varSortConfig.dir === "asc"
                    ? av.localeCompare(bv, undefined, { numeric: true })
                    : bv.localeCompare(av, undefined, { numeric: true });
            });
        }
        return rows;
    }, [variables, varSearch, varSortConfig]);

    const activeLabel = NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.key === activeTab)?.label ?? "Data View";

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-white">

            {/* ══════════════ SIDEBAR ══════════════════════════════════ */}
            <aside
                className={`flex flex-col flex-shrink-0 bg-white border-r border-gray-200 transition-[width] duration-300 ease-in-out overflow-hidden ${collapsed ? "w-[60px]" : "w-[220px]"}`}
            >
                {/* Logo row */}
                {collapsed ? (
                    <div className="flex items-center justify-center py-4 border-b border-gray-200">
                        <button
                            onClick={() => setCollapsed(false)}
                            className="text-gray-400 hover:text-gray-700 transition-colors rounded-md p-1 hover:bg-gray-100"
                            title="Expand"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-3 px-3 py-4 border-b border-gray-200">
                        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center shadow-md">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </div>
                        <div className="min-w-0">
                            <p className="text-gray-900 font-bold text-sm leading-none tracking-wide">SAVAnalyzer</p>
                            <p className="text-gray-400 text-[10px] mt-0.5">SPSS Data Studio</p>
                        </div>
                        <button
                            onClick={() => setCollapsed(true)}
                            className="flex-shrink-0 ml-auto text-gray-400 hover:text-gray-700 transition-colors rounded-md p-1 hover:bg-gray-100"
                            title="Collapse"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                            </svg>
                        </button>
                    </div>
                )}

                {/* Nav */}
                <nav className="flex-1 overflow-y-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {NAV_SECTIONS.map((section) => (
                        <div key={section.heading} className="mb-4">
                            {!collapsed && (
                                <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-widest px-4 mb-1">
                                    {section.heading}
                                </p>
                            )}
                            {collapsed && <div className="border-t border-gray-200 mx-3 mb-2" />}
                            {section.items.map((item) => {
                                const active = activeTab === item.key;
                                const locked = !fileInfo && item.key !== "data";
                                return (
                                    <button
                                        key={item.key}
                                        onClick={() => !locked && setActiveTab(item.key)}
                                        title={item.label}
                                        className={`w-full flex items-center gap-3 px-3 py-2.5 mx-0 text-sm transition-colors rounded-none
                                            ${active
                                                ? "bg-gray-100 text-gray-900 border-r-2 border-blue-500"
                                                : locked
                                                    ? "text-gray-300 cursor-not-allowed"
                                                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}
                                            ${collapsed ? "justify-center px-0" : "px-4"}`}
                                    >
                                        <span className="flex-shrink-0">{item.icon}</span>
                                        {!collapsed && <span className="truncate font-medium text-[13px]">{item.label}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </nav>

                {/* Footer — user + logout */}
                <div className="border-t border-gray-200 p-3 space-y-1">

                    {/* User + logout */}
                    <div className={`flex items-center gap-2 rounded-lg px-2.5 py-2 ${collapsed ? "justify-center" : ""}`}>
                        {user?.picture
                            ? <img src={user.picture} alt={user.name} className="w-5 h-5 rounded-full flex-shrink-0" />
                            : <div className="w-5 h-5 rounded-full bg-gray-200 flex-shrink-0" />}
                        {!collapsed && (
                            <>
                                <span className="text-[12px] text-gray-600 font-medium truncate flex-1 min-w-0">{user?.name ?? "User"}</span>
                                <button
                                    onClick={logout}
                                    title="Sign out"
                                    className="flex-shrink-0 flex items-center gap-1 text-gray-400 hover:text-red-500 transition-colors"
                                >
                                    <svg className="w-[15px] h-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </aside>

            {/* ══════════════ MAIN ═════════════════════════════════════ */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

                {/* ── Top bar ───────────────────────────────────────── */}
                <header className="flex-shrink-0 flex items-center justify-between px-6 h-14 bg-white border-b border-gray-200 shadow-sm">
                    <div className="flex items-center gap-3 min-w-0">
                        <h2 className="text-[15px] font-semibold text-gray-800 whitespace-nowrap">{activeLabel}</h2>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                        {fileInfo && (
                            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                                <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                <span className="text-xs text-gray-600 font-medium max-w-[160px] truncate" title={fileName}>{fileName}</span>
                                <span className="text-gray-300 text-xs">·</span>
                                <span className="text-xs text-gray-400 whitespace-nowrap">{data.length.toLocaleString()} rows · {variables.length} vars</span>
                                {weights && <span className="text-xs text-amber-500 font-medium whitespace-nowrap">⚖ Weighted</span>}
                            </div>
                        )}
                        {fileInfo && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleExportExcel}
                                className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Export to Excel
                            </button>
                            <button
                                onClick={handleReset}
                                title="Unload file and return to dashboard"
                                className="flex items-center gap-1.5 border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500 hover:bg-red-50 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      					        </svg>
                                Close File
                            </button>
                        </div>
                        )}
                    </div>
                </header>

                {/* ── Content ───────────────────────────────────────── */}
                <main className="flex-1 overflow-hidden flex flex-col min-h-0 bg-white">

                    {/* ── Dashboard (no file loaded) ──────────────────── */}
                    {!fileInfo && !loading && (
                        <DashboardHome
                            dragActive={dragActive}
                            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                            onDragLeave={() => setDragActive(false)}
                            onDrop={onDrop}
                            onFileChange={onFileChange}
                            onTabChange={setActiveTab}
                        />
                    )}

                    {/* Loading */}
                    {fileInfo && loading && (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    )}

                    {/* ── Data View ───────────────────────────────── */}
                    {fileInfo && !loading && activeTab === "data" && (
                        <div className="flex-1 flex flex-col overflow-hidden bg-white min-h-0">
                            {data.length === 0 ? (
                                <p className="text-gray-400 text-center py-16 text-sm">No data rows found</p>
                            ) : (
                                <>
                                    <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 border-b bg-gray-50/50">
                                        <div className="relative">
                                            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                            <input type="text" value={dataSearch} onChange={(e) => setDataSearch(e.target.value)}
                                                placeholder="Search across all columns…"
                                                className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300 w-60 bg-white" />
                                        </div>
                                        <span className="text-xs text-gray-400">
                                            {dataSearch.trim()
                                                ? `${filteredDataRows.length} of ${data.length} rows`
                                                : `${Math.min(data.length, MAX_DISPLAY_ROWS).toLocaleString()} of ${data.length.toLocaleString()} rows`}
                                        </span>
                                        {dataSortConfig.key && (
                                            <button onClick={() => setDataSortConfig({ key: null, dir: "asc" })} className="text-xs text-sky-500 hover:text-sky-700">Clear sort</button>
                                        )}
                                        <button onClick={copyDataTable}
                                            className={`ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${dataCopied ? "bg-green-50 border-green-300 text-green-600" : "bg-white border-gray-200 text-gray-500 hover:border-sky-400 hover:text-sky-600"}`}>
                                            {dataCopied ? <><CheckIcon />Copied!</> : <><CopyIcon />Copy table</>}
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-auto">
                                        <table className="w-full text-sm border-collapse">
                                            <thead className="sticky top-0 z-10">
                                                <tr className="bg-gray-100">
                                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 border-r border-b w-10">#</th>
                                                    {variables.map((v) => (
                                                        <th key={v.name} onClick={() => toggleDataSort(v.name)}
                                                            className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b whitespace-nowrap cursor-pointer select-none hover:bg-gray-200 transition-colors"
                                                            title={v.label}>
                                                            <span className="flex items-center gap-1">
                                                                {v.name}
                                                                <span className="text-gray-400 text-[10px]">
                                                                    {dataSortConfig.key === v.name ? (dataSortConfig.dir === "asc" ? "▲" : "▼") : "⇅"}
                                                                </span>
                                                            </span>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredDataRows.map((row, ri) => (
                                                    <tr key={ri} className="hover:bg-sky-50/50 transition-colors">
                                                        <td className="px-3 py-1.5 text-xs text-gray-400 border-r border-b">{ri + 1}</td>
                                                        {variables.map((v) => (
                                                            <td key={v.name}
                                                                className="px-3 py-1.5 text-xs text-gray-700 border-r border-b whitespace-nowrap max-w-[200px] truncate"
                                                                title={formatCellValue(row[v.name], v.name, valueLabels)}>
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

                    {/* ── Variable View ────────────────────────────── */}
                    {fileInfo && !loading && activeTab === "variable" && (
                        <div className="flex-1 flex flex-col overflow-hidden bg-white min-h-0">
                            <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 border-b bg-gray-50/50">
                                <div className="relative">
                                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    <input type="text" value={varSearch} onChange={(e) => setVarSearch(e.target.value)}
                                        placeholder="Search by name, label, or type…"
                                        className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300 w-60 bg-white" />
                                </div>
                                <span className="text-xs text-gray-400">
                                    {varSearch.trim() ? `${filteredVarRows.length} of ${variables.length} variables` : `${variables.length} variables`}
                                </span>
                                {varSortConfig.key && (
                                    <button onClick={() => setVarSortConfig({ key: null, dir: "asc" })} className="text-xs text-sky-500 hover:text-sky-700">Clear sort</button>
                                )}
                                <button onClick={copyVarTable}
                                    className={`ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${varCopied ? "bg-green-50 border-green-300 text-green-600" : "bg-white border-gray-200 text-gray-500 hover:border-sky-400 hover:text-sky-600"}`}>
                                    {varCopied ? <><CheckIcon />Copied!</> : <><CopyIcon />Copy table</>}
                                </button>
                            </div>
                            <div className="flex-1 overflow-auto">
                                <table className="min-w-full text-sm border-collapse">
                                    <thead className="sticky top-0 z-10">
                                        <tr className="bg-gray-100">
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 border-r border-b w-10">#</th>
                                            {[{ key: "name", label: "Name" }, { key: "type", label: "Type" }, { key: "width", label: "Width" }, { key: "label", label: "Label" }].map(({ key, label }) => (
                                                <th key={key} onClick={() => toggleVarSort(key)}
                                                    className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b cursor-pointer select-none hover:bg-gray-200 transition-colors whitespace-nowrap">
                                                    <span className="flex items-center gap-1">{label}
                                                        <span className="text-gray-400 text-[10px]">{varSortConfig.key === key ? (varSortConfig.dir === "asc" ? "▲" : "▼") : "⇅"}</span>
                                                    </span>
                                                </th>
                                            ))}
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b">Value Labels</th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b">Missing</th>
                                            {[{ key: "measure", label: "Measure" }, { key: "alignment", label: "Alignment" }].map(({ key, label }) => (
                                                <th key={key} onClick={() => toggleVarSort(key)}
                                                    className={`px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b cursor-pointer select-none hover:bg-gray-200 transition-colors ${key === "measure" ? "border-r" : ""}`}>
                                                    <span className="flex items-center gap-1">{label}
                                                        <span className="text-gray-400 text-[10px]">{varSortConfig.key === key ? (varSortConfig.dir === "asc" ? "▲" : "▼") : "⇅"}</span>
                                                    </span>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredVarRows.map((v, i) => {
                                            const vl = valueLabels[v.name];
                                            return (
                                                <tr key={v.name} className="hover:bg-sky-50/50 transition-colors">
                                                    <td className="px-3 py-2 text-xs text-gray-400 border-r border-b">{i + 1}</td>
                                                    <td className="px-3 py-2 text-xs font-medium text-gray-800 border-r border-b">{v.name}</td>
                                                    <td className="px-3 py-2 text-xs text-gray-600 border-r border-b capitalize">{v.type}</td>
                                                    <td className="px-3 py-2 text-xs text-gray-600 border-r border-b">{v.type === "string" ? v.width : 8}</td>
                                                    <td className="px-3 py-2 text-xs text-gray-600 border-r border-b min-w-[200px] whitespace-normal break-words">{v.label}</td>
                                                    <td className="px-3 py-2 text-xs text-gray-600 border-r border-b min-w-[220px]">
                                                        {vl ? (
                                                            <div>{vl.map((lbl, li) => (
                                                                <div key={li} className="whitespace-nowrap">
                                                                    <span className="text-gray-400">{Number.isInteger(lbl.value) ? lbl.value.toFixed(2) : lbl.value}</span>
                                                                    {" = "}<span>{lbl.label}</span>
                                                                </div>
                                                            ))}</div>
                                                        ) : <span className="text-gray-300">None</span>}
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

                    {/* ── Cross-Tab ─────────────────────────────────── */}
                    {fileInfo && !loading && activeTab === "crosstab" && (
                        <div className="flex-1 overflow-auto bg-white border border-gray-200 rounded-xl shadow-sm p-5 min-h-0 m-5">
                            <CrossTabulation data={data} variables={variables} valueLabels={valueLabels} weights={weights} />
                        </div>
                    )}

                    {/* ── Data Ops ──────────────────────────────────── */}
                    {fileInfo && !loading && activeTab === "operations" && (
                        <div className="flex-1 overflow-auto bg-white border border-gray-200 rounded-xl shadow-sm p-5 min-h-0 m-5">
                            <DataOperations data={data} variables={variables} setData={setData} setVariables={setVariables} SavParser={SavParser} />
                        </div>
                    )}

                    {/* ── Factor & Corr ─────────────────────────────── */}
                    {fileInfo && !loading && activeTab === "factor" && (
                        <div className="flex-1 overflow-hidden bg-white border border-gray-200 rounded-xl shadow-sm p-5 min-h-0 m-5">
                            <FactorAnalysis data={data} variables={variables} />
                        </div>
                    )}

                    {/* ── Correlation Matrix ────────────────────────── */}
                    {fileInfo && !loading && activeTab === "corrmatrix" && (
                        <div className="flex-1 overflow-hidden bg-white border border-gray-200 rounded-xl shadow-sm min-h-0 m-5">
                            <CorrelationMatrix data={data} variables={variables} />
                        </div>
                    )}

                    {/* ── TURF & Driver ─────────────────────────────── */}
                    {fileInfo && !loading && activeTab === "turf" && (
                        <div className="flex-1 overflow-hidden bg-white border border-gray-200 rounded-xl shadow-sm p-5 min-h-0 m-5">
                            <TurfAnalysis data={data} variables={variables} />
                        </div>
                    )}

                    {/* ── Data QC ───────────────────────────────────── */}
                    {fileInfo && !loading && activeTab === "qc" && (
                        <div className="flex-1 overflow-auto bg-white border border-gray-200 rounded-xl shadow-sm p-5 min-h-0 m-5">
                            <DataQCPanel data={data} variables={variables} valueLabels={valueLabels} />
                        </div>
                    )}

                    {/* ── AI Assistant ──────────────────────────────── */}
                    {fileInfo && !loading && activeTab === "ai" && (
                        <div className="flex-1 overflow-hidden bg-white border border-gray-200 rounded-xl shadow-sm min-h-0 m-5">
                            <AIAssistant data={data} variables={variables} valueLabels={valueLabels} weights={weights} />
                        </div>
                    )}

                    {/* ── Weighting ─────────────────────────────────── */}
                    {fileInfo && !loading && activeTab === "weight" && (
                        <div className="flex-1 overflow-auto bg-white border border-gray-200 rounded-xl shadow-sm p-5 min-h-0 m-5">
                            <DataWeighting data={data} variables={variables} valueLabels={valueLabels}
                                weights={weights} setWeights={setWeights} weightVar={weightVar} setWeightVar={setWeightVar} />
                        </div>
                    )}

                </main>
            </div>
        </div>
    );
}
