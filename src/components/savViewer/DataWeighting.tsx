"use client"
import { useState, useMemo } from "react";
import type { DataRow, SavVariable, ValueLabels } from "@/utils/types";
import { getWeightInfo, weightedDescriptives, weightedFrequency } from "./statsUtils";
import SearchableSelect from "./SearchableSelect";

interface DataWeightingProps {
    data: DataRow[];
    variables: SavVariable[];
    valueLabels: ValueLabels;
    weights: number[] | null;
    setWeights: (weights: number[] | null) => void;
    weightVar: string;
    setWeightVar: (varName: string) => void;
}

export default function DataWeighting({ data, variables, valueLabels, weights, setWeights, weightVar, setWeightVar }: DataWeightingProps) {
    const [compareVar, setCompareVar] = useState("");

    const numericVars = variables.filter((v) => v.type === "numeric");

    const weightInfo = useMemo(() => {
        if (!weightVar || !data.length) return null;
        return getWeightInfo(data, weightVar);
    }, [data, weightVar]);

    const comparison = useMemo(() => {
        if (!compareVar || !weightInfo) return null;
        const v = variables.find((vv) => vv.name === compareVar);
        if (!v) return null;
        const vl = valueLabels[compareVar];

        if (v.type === "numeric" && (!vl || vl.length === 0)) {
            // Numeric descriptives comparison
            const vals = data.map((r) => Number(r[compareVar])).filter((x) => !isNaN(x));
            const unweightedMean = vals.reduce((s, v) => s + v, 0) / (vals.length || 1);
            const wd = weightedDescriptives(data, compareVar, weightInfo.weights);
            return {
                type: "numeric",
                unweightedMean: unweightedMean.toFixed(3),
                weightedMean: wd.mean.toFixed(3),
                unweightedN: vals.length,
                weightedN: wd.weightedN.toFixed(1),
            };
        } else {
            // Frequency comparison
            const values = data.map((r) => r[compareVar]);
            const unwFreq: Record<string, number> = {};
            for (const val of values) {
                const k = val == null ? "__NULL__" : String(val);
                unwFreq[k] = (unwFreq[k] || 0) + 1;
            }
            const wFreq = weightedFrequency(values, weightInfo.weights);
            const allKeys = [...new Set([...Object.keys(unwFreq), ...Object.keys(wFreq)])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

            const unwTotal = Object.values(unwFreq).reduce((s: number, v: number) => s + v, 0 as number);
            const wTotal = Object.values(wFreq).reduce((s: number, v: number) => s + v, 0 as number);

            const rows = allKeys.map((k) => {
                const uw = unwFreq[k] || 0;
                const w = wFreq[k] || 0;
                let label = k;
                if (vl) {
                    const match = vl.find((l) => String(l.value) === k);
                    if (match) label = match.label;
                }
                return {
                    value: k,
                    label,
                    unwCount: uw,
                    unwPct: unwTotal > 0 ? ((uw / unwTotal) * 100).toFixed(1) : "0.0",
                    wCount: w.toFixed(1),
                    wPct: wTotal > 0 ? ((w / wTotal) * 100).toFixed(1) : "0.0",
                };
            });
            return { type: "categorical", rows };
        }
    }, [compareVar, weightInfo, data, variables, valueLabels]);

    const applyWeight = () => {
        if (!weightInfo) return;
        setWeights(weightInfo.weights);
    };

    const clearWeight = () => {
        setWeightVar("");
        setWeights(null);
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* Weight variable selector */}
            <div className="flex flex-wrap items-end gap-4 bg-gray-50 rounded-lg p-4">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-500">Weight Variable</label>
                    <SearchableSelect
                        options={[
                            { value: "", label: "None (unweighted)" },
                            ...numericVars.map((v) => ({ value: v.name, label: v.name + (v.label ? ` – ${v.label}` : "") }))
                        ]}
                        value={weightVar}
                        onChange={setWeightVar}
                        placeholder="None (unweighted)"
                        searchPlaceholder="Search variable…"
                        minWidth="220px"
                    />
                </div>
                {weightVar && (
                    <>
                        <button onClick={applyWeight}
                            className="bg-sky-500 hover:bg-sky-600 text-white px-5 py-1.5 rounded-lg text-sm font-medium transition-colors">
                            Apply Weight
                        </button>
                        <button onClick={clearWeight}
                            className="bg-white border hover:bg-gray-100 text-gray-600 px-5 py-1.5 rounded-lg text-sm font-medium transition-colors">
                            Clear Weight
                        </button>
                    </>
                )}
                {weights && <span className="text-green-600 text-sm font-medium">✓ Weights active</span>}
            </div>

            {/* Weight info */}
            {weightInfo && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white border rounded-lg px-4 py-3 text-center">
                        <div className="text-lg font-bold text-gray-700">{weightInfo.unweightedN.toLocaleString()}</div>
                        <div className="text-xs text-gray-500">Unweighted N</div>
                    </div>
                    <div className="bg-white border rounded-lg px-4 py-3 text-center">
                        <div className="text-lg font-bold text-sky-600">{weightInfo.totalWeight.toFixed(1)}</div>
                        <div className="text-xs text-gray-500">Weighted N</div>
                    </div>
                    <div className="bg-white border rounded-lg px-4 py-3 text-center">
                        <div className="text-lg font-bold text-purple-600">{weightInfo.effectiveSampleSize.toFixed(1)}</div>
                        <div className="text-xs text-gray-500">Effective Sample Size</div>
                    </div>
                    <div className="bg-white border rounded-lg px-4 py-3 text-center">
                        <div className="text-lg font-bold text-gray-600">
                            {(weightInfo.effectiveSampleSize / weightInfo.unweightedN * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500">Design Effect</div>
                    </div>
                </div>
            )}

            {/* Comparison */}
            {weightInfo && (
                <div className="flex flex-col gap-3 flex-1 overflow-hidden">
                    <div className="flex items-end gap-4 bg-gray-50 rounded-lg p-3">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-gray-500">Compare Variable (weighted vs unweighted)</label>
                            <SearchableSelect
                                options={[
                                    { value: "", label: "Select…" },
                                    ...variables.map((v) => ({ value: v.name, label: v.name + (v.label ? ` – ${v.label}` : "") }))
                                ]}
                                value={compareVar}
                                onChange={setCompareVar}
                                placeholder="Select variable…"
                                searchPlaceholder="Search variable…"
                                minWidth="220px"
                            />
                        </div>
                    </div>

                    {comparison && comparison.type === "numeric" && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white border rounded-lg p-4">
                                <h4 className="text-xs font-semibold text-gray-500 mb-2">Unweighted</h4>
                                <div className="text-lg font-bold text-gray-700">{comparison.unweightedMean}</div>
                                <div className="text-xs text-gray-400">N = {comparison.unweightedN}</div>
                            </div>
                            <div className="bg-sky-50 border border-sky-200 rounded-lg p-4">
                                <h4 className="text-xs font-semibold text-sky-600 mb-2">Weighted</h4>
                                <div className="text-lg font-bold text-sky-700">{comparison.weightedMean}</div>
                                <div className="text-xs text-sky-400">Weighted N = {comparison.weightedN}</div>
                            </div>
                        </div>
                    )}

                    {comparison && comparison.type === "categorical" && (
                        <div className="flex-1 overflow-auto border rounded-lg">
                            <table className="w-full text-sm border-collapse">
                                <thead className="sticky top-0 z-10">
                                    <tr className="bg-gray-100">
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b">Value</th>
                                        <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 border-r border-b" colSpan={2}>Unweighted</th>
                                        <th className="px-3 py-2 text-center text-xs font-semibold text-sky-600 border-b" colSpan={2}>Weighted</th>
                                    </tr>
                                    <tr className="bg-gray-50">
                                        <th className="px-3 py-1 text-left text-[10px] text-gray-500 border-r border-b"></th>
                                        <th className="px-3 py-1 text-center text-[10px] text-gray-500 border-r border-b">Count</th>
                                        <th className="px-3 py-1 text-center text-[10px] text-gray-500 border-r border-b">%</th>
                                        <th className="px-3 py-1 text-center text-[10px] text-sky-500 border-r border-b">Count</th>
                                        <th className="px-3 py-1 text-center text-[10px] text-sky-500 border-b">%</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {comparison.rows?.map((row) => (
                                        <tr key={row.value} className="hover:bg-sky-50">
                                            <td className="px-3 py-1.5 text-xs text-gray-700 border-r border-b">
                                                {row.label !== row.value ? `${row.value} (${row.label})` : row.value}
                                            </td>
                                            <td className="px-3 py-1.5 text-xs text-gray-600 border-r border-b text-center font-mono">{row.unwCount}</td>
                                            <td className="px-3 py-1.5 text-xs text-gray-600 border-r border-b text-center font-mono">{row.unwPct}%</td>
                                            <td className="px-3 py-1.5 text-xs text-sky-600 border-r border-b text-center font-mono">{row.wCount}</td>
                                            <td className="px-3 py-1.5 text-xs text-sky-600 border-b text-center font-mono">{row.wPct}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {!weightVar && (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                    Select a weight variable to begin.
                </div>
            )}
        </div>
    );
}
