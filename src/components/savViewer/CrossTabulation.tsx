import React, { useState, useMemo } from "react";
import { contingencyTable, chiSquareTest, significanceLetters } from "./statsUtils";

export default function CrossTabulation({ data, variables, valueLabels, weights }) {
    const [rowVar, setRowVar] = useState("");
    const [colVar, setColVar] = useState("");
    const [alpha, setAlpha] = useState(0.05);
    const [showExpected, setShowExpected] = useState(false);
    const [showColPct, setShowColPct] = useState(true);
    const [showRowPct, setShowRowPct] = useState(false);
    const [showSigLetters, setShowSigLetters] = useState(true);

    const getLabel = (varName, value) => {
        const vl = valueLabels[varName];
        if (!vl) return String(value);
        const match = vl.find((l) => String(l.value) === String(value));
        return match ? match.label : String(value);
    };

    const result = useMemo(() => {
        if (!rowVar || !colVar || !data.length) return null;
        const rowArr = data.map((r) => r[rowVar]);
        const colArr = data.map((r) => r[colVar]);
        const w = weights || null;
        const ct = contingencyTable(rowArr, colArr, w);
        const chi = chiSquareTest(ct);
        const sigLtrs = significanceLetters(ct, alpha);
        return { ct, chi, sigLtrs };
    }, [rowVar, colVar, data, weights, alpha]);

    const catVars = variables.filter((v) => {
        const vl = valueLabels[v.name];
        return vl && vl.length > 0;
    });

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* Controls */}
            <div className="flex flex-wrap items-end gap-4 bg-gray-50 rounded-lg p-4">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-500">Row Variable</label>
                    <select value={rowVar} onChange={(e) => setRowVar(e.target.value)}
                        className="border rounded-lg px-3 py-1.5 text-sm min-w-[180px]">
                        <option value="">Select…</option>
                        {catVars.map((v) => (
                            <option key={v.name} value={v.name}>{v.name}{v.label ? ` – ${v.label}` : ""}</option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-500">Column Variable</label>
                    <select value={colVar} onChange={(e) => setColVar(e.target.value)}
                        className="border rounded-lg px-3 py-1.5 text-sm min-w-[180px]">
                        <option value="">Select…</option>
                        {catVars.map((v) => (
                            <option key={v.name} value={v.name}>{v.name}{v.label ? ` – ${v.label}` : ""}</option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-500">Significance α</label>
                    <select value={alpha} onChange={(e) => setAlpha(Number(e.target.value))}
                        className="border rounded-lg px-3 py-1.5 text-sm">
                        <option value={0.01}>0.01</option>
                        <option value={0.05}>0.05</option>
                        <option value={0.10}>0.10</option>
                    </select>
                </div>
                <div className="flex items-center gap-4 text-sm">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={showColPct} onChange={(e) => setShowColPct(e.target.checked)} className="accent-sky-500" />
                        Col %
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={showRowPct} onChange={(e) => setShowRowPct(e.target.checked)} className="accent-sky-500" />
                        Row %
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={showExpected} onChange={(e) => setShowExpected(e.target.checked)} className="accent-sky-500" />
                        Expected
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={showSigLetters} onChange={(e) => setShowSigLetters(e.target.checked)} className="accent-sky-500" />
                        Sig. Letters
                    </label>
                </div>
            </div>

            {/* Result */}
            {result && (
                <div className="flex-1 overflow-auto">
                    {/* Chi-square summary */}
                    <div className="flex flex-wrap gap-6 mb-4 text-sm">
                        <div className="bg-white border rounded-lg px-4 py-2">
                            <span className="text-gray-500">χ² = </span>
                            <span className="font-semibold">{result.chi.chiSquare.toFixed(3)}</span>
                        </div>
                        <div className="bg-white border rounded-lg px-4 py-2">
                            <span className="text-gray-500">df = </span>
                            <span className="font-semibold">{result.chi.df}</span>
                        </div>
                        <div className={`border rounded-lg px-4 py-2 ${result.chi.pValue < alpha ? "bg-green-50 border-green-300" : "bg-white"}`}>
                            <span className="text-gray-500">p = </span>
                            <span className="font-semibold">{result.chi.pValue < 0.001 ? "< 0.001" : result.chi.pValue.toFixed(4)}</span>
                            {result.chi.pValue < alpha && <span className="ml-2 text-green-600 font-semibold">✓ Significant</span>}
                        </div>
                        <div className="bg-white border rounded-lg px-4 py-2">
                            <span className="text-gray-500">N = </span>
                            <span className="font-semibold">{result.ct.grandTotal.toFixed(0)}</span>
                        </div>
                    </div>

                    {/* Cross-tab table */}
                    <div className="border rounded-lg overflow-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="bg-gray-100">
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b" rowSpan={2}>
                                        {rowVar}
                                    </th>
                                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 border-b" colSpan={result.ct.colKeys.length + 1}>
                                        {colVar}
                                    </th>
                                </tr>
                                <tr className="bg-gray-50">
                                    {result.ct.colKeys.map((ck, ci) => (
                                        <th key={ck} className="px-3 py-2 text-center text-xs font-semibold text-gray-600 border-r border-b whitespace-nowrap">
                                            {getLabel(colVar, ck)}
                                            {showSigLetters && (
                                                <div className="text-sky-500 font-bold">({String.fromCharCode(65 + ci)})</div>
                                            )}
                                        </th>
                                    ))}
                                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 border-b">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.ct.rowKeys.map((rk, ri) => (
                                    <tr key={rk} className="hover:bg-sky-50">
                                        <td className="px-3 py-2 text-xs font-medium text-gray-800 border-r border-b whitespace-nowrap">
                                            {getLabel(rowVar, rk)}
                                        </td>
                                        {result.ct.colKeys.map((ck, ci) => {
                                            const obs = result.ct.observed[ri][ci];
                                            const exp = result.chi.expected[ri][ci];
                                            const colPct = result.ct.colTotals[ci] > 0 ? (obs / result.ct.colTotals[ci]) * 100 : 0;
                                            const rowPct = result.ct.rowTotals[ri] > 0 ? (obs / result.ct.rowTotals[ri]) * 100 : 0;
                                            const sig = result.sigLtrs[ri][ci];
                                            return (
                                                <td key={ck} className="px-3 py-2 text-xs text-gray-700 border-r border-b text-center">
                                                    <div className="font-semibold">{obs.toFixed(weights ? 1 : 0)}</div>
                                                    {showColPct && <div className="text-gray-400">{colPct.toFixed(1)}%</div>}
                                                    {showRowPct && <div className="text-blue-400">{rowPct.toFixed(1)}%</div>}
                                                    {showExpected && <div className="text-orange-400">E: {exp.toFixed(1)}</div>}
                                                    {showSigLetters && sig && <div className="text-red-500 font-bold text-[10px]">{sig}</div>}
                                                </td>
                                            );
                                        })}
                                        <td className="px-3 py-2 text-xs text-gray-700 border-b text-center font-semibold">
                                            {result.ct.rowTotals[ri].toFixed(weights ? 1 : 0)}
                                        </td>
                                    </tr>
                                ))}
                                {/* Column totals row */}
                                <tr className="bg-gray-50 font-semibold">
                                    <td className="px-3 py-2 text-xs text-gray-800 border-r border-b">Total</td>
                                    {result.ct.colKeys.map((ck, ci) => (
                                        <td key={ck} className="px-3 py-2 text-xs text-gray-700 border-r border-b text-center">
                                            {result.ct.colTotals[ci].toFixed(weights ? 1 : 0)}
                                        </td>
                                    ))}
                                    <td className="px-3 py-2 text-xs text-gray-700 border-b text-center">
                                        {result.ct.grandTotal.toFixed(weights ? 1 : 0)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {showSigLetters && (
                        <p className="text-xs text-gray-400 mt-2">
                            Significance letters indicate this column's proportion is significantly greater than the lettered column at α = {alpha}.
                        </p>
                    )}
                </div>
            )}

            {!result && (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                    Select a row and column variable to generate a cross-tabulation.
                </div>
            )}
        </div>
    );
}
