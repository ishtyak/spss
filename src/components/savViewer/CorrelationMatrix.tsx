"use client"
import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import type { DataRow, SavVariable } from "@/utils/types";
import { correlationMatrix, pearsonPValue, sigStars } from "./statsUtils";
import { saveAs }  from "file-saver"

interface Props {
    data: DataRow[];
    variables: SavVariable[];
}

// ─── Colour helpers ────────────────────────────────────────────────
function heatBg(r: number): string {
    if (isNaN(r)) return "#f8fafc";
    const a = Math.min(Math.abs(r), 1);
    if (r >= 0) {
        const l = Math.round(100 - a * 50);
        const s = Math.round(a * 88);
        return `hsl(214,${s}%,${l}%)`;
    }
    const l = Math.round(100 - a * 50);
    const s = Math.round(a * 88);
    return `hsl(355,${s}%,${l}%)`;
}
function heatFg(r: number): string {
    return Math.abs(r) >= 0.55 ? "#fff" : "#1e293b";
}

// ─── Component ────────────────────────────────────────────────────
export default function CorrelationMatrix({ data, variables }: Props) {
    const numericVars = useMemo(
        () => variables.filter((v) => v.type === "numeric"),
        [variables],
    );

    const defaultSelected = useMemo(
        () => numericVars.slice(0, 12).map((v) => v.name),
        [numericVars],
    );

    const [selected, setSelected] = useState<string[]>(defaultSelected);
    const [showPValues, setShowPValues] = useState(false);
    const [showStars, setShowStars] = useState(true);

    const n = data.length;

    const result = useMemo(() => {
        if (selected.length < 2) return null;
        const cm = correlationMatrix(data, selected);
        const pMatrix = cm.matrix.map((row, i) =>
            row.map((r, j) => (i === j ? 0 : pearsonPValue(r, n))),
        );
        return { ...cm, pMatrix };
    }, [data, selected, n]);

    function toggle(name: string) {
        setSelected((prev) =>
            prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name],
        );
    }

    function exportXlsx() {
        if (!result) return;
        const { varNames, matrix, pMatrix } = result;
        const wb = XLSX.utils.book_new();

        const rHdr = ["Variable", ...varNames];
        const rRows = matrix.map((row, i) => [
            varNames[i],
            ...row.map((r, j) => (i === j ? 1 : Number(r.toFixed(4)))),
        ]);
        const rWS = XLSX.utils.aoa_to_sheet([rHdr, ...rRows]);
        rWS["!cols"] = [{ wch: 28 }, ...varNames.map(() => ({ wch: 10 }))];
        XLSX.utils.book_append_sheet(wb, rWS, "Correlations (r)");

        const pHdr = ["Variable", ...varNames];
        const pRows = pMatrix.map((row, i) => [
            varNames[i],
            ...row.map((p, j) => (i === j ? "—" : p < 0.001 ? "<.001" : p.toFixed(4))),
        ]);
        const pWS = XLSX.utils.aoa_to_sheet([pHdr, ...pRows]);
        pWS["!cols"] = [{ wch: 28 }, ...varNames.map(() => ({ wch: 10 }))];
        XLSX.utils.book_append_sheet(wb, pWS, "P-Values");

        const wbOut = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        saveAs(new Blob([wbOut], { type: "application/octet-stream" }), "correlation_matrix.xlsx");
    }

    return (
        <div className="flex h-full gap-0 min-h-0 overflow-hidden">

            {/* ── Left panel: variable selector ── */}
            <div className="w-56 flex-shrink-0 flex flex-col border-r border-gray-100 bg-gray-50 overflow-hidden">
                <div className="px-3 pt-3 pb-2 border-b border-gray-100">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                        Numeric Variables
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setSelected(numericVars.map((v) => v.name))}
                            className="text-[10px] text-blue-600 hover:underline"
                        >
                            All
                        </button>
                        <span className="text-gray-300">|</span>
                        <button
                            onClick={() => setSelected([])}
                            className="text-[10px] text-gray-400 hover:underline"
                        >
                            None
                        </button>
                        <span className="ml-auto text-[10px] text-gray-400 font-medium">
                            {selected.length}/{numericVars.length}
                        </span>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto py-1">
                    {numericVars.length === 0 ? (
                        <p className="px-3 py-4 text-[11px] text-gray-400">No numeric variables found.</p>
                    ) : (
                        numericVars.map((v) => {
                            const active = selected.includes(v.name);
                            return (
                                <label
                                    key={v.name}
                                    className={`flex items-start gap-2 px-3 py-1.5 cursor-pointer transition-colors ${active ? "bg-blue-50" : "hover:bg-gray-100"}`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={active}
                                        onChange={() => toggle(v.name)}
                                        className="mt-0.5 accent-blue-600 w-3.5 h-3.5 flex-shrink-0"
                                    />
                                    <span
                                        className="text-[11px] leading-snug"
                                        title={v.label || v.name}
                                    >
                                        <span className={active ? "text-blue-700 font-semibold" : "text-gray-700 font-medium"}>
                                            {v.name}
                                        </span>
                                        {v.label && (
                                            <span className="block text-[10px] text-gray-400 font-normal truncate">
                                                {v.label}
                                            </span>
                                        )}
                                    </span>
                                </label>
                            );
                        })
                    )}
                </div>
            </div>

            {/* ── Right panel: controls + heatmap ── */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">

                {/* Controls bar */}
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 bg-white flex-wrap flex-shrink-0">
                    <h2 className="text-sm font-semibold text-gray-800">Correlation Matrix</h2>
                    <span className="text-gray-200">|</span>

                    {/* r / p toggle */}
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[11px] font-medium">
                        <button
                            onClick={() => setShowPValues(false)}
                            className={`px-3 py-1.5 transition-colors ${!showPValues ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                        >
                            r values
                        </button>
                        <button
                            onClick={() => setShowPValues(true)}
                            className={`px-3 py-1.5 transition-colors ${showPValues ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                        >
                            p values
                        </button>
                    </div>

                    {/* Stars toggle */}
                    <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={showStars}
                            onChange={(e) => setShowStars(e.target.checked)}
                            className="accent-blue-600"
                        />
                        Significance stars
                    </label>

                    {/* Right side */}
                    <div className="ml-auto flex items-center gap-3">
                        <span className="text-[11px] text-gray-400">Pearson · n = {n}</span>
                        <button
                            onClick={exportXlsx}
                            disabled={!result}
                            className="flex items-center gap-1.5 text-[11px] font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Export Excel
                        </button>
                    </div>
                </div>

                {/* Matrix or empty state */}
                {!result ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
                        <svg className="w-12 h-12 opacity-25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10" />
                        </svg>
                        <p className="text-sm">
                            {numericVars.length === 0
                                ? "No numeric variables in this dataset."
                                : "Select at least 2 numeric variables to compute correlations."}
                        </p>
                    </div>
                ) : (
                    <div className="flex-1 overflow-auto p-5 min-h-0">

                        {/* Heatmap table */}
                        <div className="overflow-auto">
                            <table className="border-collapse" style={{ fontSize: 11 }}>
                                <thead>
                                    <tr>
                                        {/* corner cell */}
                                        <th
                                            className="sticky left-0 bg-white z-20"
                                            style={{ minWidth: 130, width: 130 }}
                                        />
                                        {result.varNames.map((v) => (
                                            <th
                                                key={v}
                                                className="pb-1 px-0.5 font-medium text-gray-600 align-bottom"
                                                style={{ minWidth: 56 }}
                                            >
                                                <div
                                                    className="flex items-end justify-start pl-1 h-14 whitespace-nowrap text-[10px]"
                                                    style={{ transform: "rotate(-45deg)", transformOrigin: "bottom left" }}
                                                >
                                                    {v}
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.varNames.map((rowVar, i) => (
                                        <tr key={rowVar}>
                                            {/* Row label */}
                                            <td
                                                className="sticky left-0 bg-white z-10 pr-3 py-0.5 text-[10px] font-medium text-gray-700 truncate"
                                                style={{ maxWidth: 130, width: 130 }}
                                                title={rowVar}
                                            >
                                                {rowVar}
                                            </td>

                                            {result.varNames.map((colVar, j) => {
                                                const r = result.matrix[i][j];
                                                const p = result.pMatrix[i][j];
                                                const stars = showStars ? sigStars(p) : "";
                                                const isDiag = i === j;

                                                const bg = isDiag ? "#e5e7eb" : heatBg(r);
                                                const fg = isDiag ? "#6b7280" : heatFg(r);

                                                const displayVal = isDiag
                                                    ? "1.00"
                                                    : showPValues
                                                    ? p < 0.001 ? "<.001" : p.toFixed(3)
                                                    : r.toFixed(2);

                                                return (
                                                    <td
                                                        key={colVar}
                                                        className="py-0.5 px-0.5"
                                                        title={isDiag ? rowVar : `${rowVar} × ${colVar}\nr = ${r.toFixed(4)}\np = ${p < 0.001 ? "<.001" : p.toFixed(4)}`}
                                                    >
                                                        <div
                                                            className="rounded flex flex-col items-center justify-center transition-opacity hover:opacity-80 cursor-default"
                                                            style={{
                                                                background: bg,
                                                                color: fg,
                                                                width: 54,
                                                                height: 38,
                                                                fontWeight: isDiag ? 700 : 400,
                                                            }}
                                                        >
                                                            <span style={{ fontSize: 11 }}>{displayVal}</span>
                                                            {!isDiag && stars && (
                                                                <span
                                                                    style={{ fontSize: 8, lineHeight: 1, letterSpacing: 1, opacity: 0.85 }}
                                                                >
                                                                    {stars}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Legend */}
                        <div className="mt-6 flex flex-wrap items-center gap-6 pt-4 border-t border-gray-100">
                            {/* Colour scale */}
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-500 mr-1">−1.0</span>
                                <div className="flex gap-px rounded overflow-hidden">
                                    {[-1, -0.75, -0.5, -0.25, -0.1, 0, 0.1, 0.25, 0.5, 0.75, 1].map((v) => (
                                        <div
                                            key={v}
                                            style={{
                                                width: 20,
                                                height: 16,
                                                background: v === 0 ? "#f1f5f9" : heatBg(v),
                                            }}
                                        />
                                    ))}
                                </div>
                                <span className="text-[10px] text-gray-500 ml-1">+1.0</span>
                            </div>

                            {showStars && (
                                <div className="flex gap-5 text-[11px] text-gray-500">
                                    <span><span className="font-bold text-gray-700">*</span> p &lt; .05</span>
                                    <span><span className="font-bold text-gray-700">**</span> p &lt; .01</span>
                                    <span><span className="font-bold text-gray-700">***</span> p &lt; .001</span>
                                </div>
                            )}

                            <span className="text-[10px] text-gray-400 ml-auto">
                                Two-tailed Pearson · n = {n} · hover a cell for exact values
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
