"use client"
import { useState, useMemo } from "react";
import type { DataRow, SavVariable } from "@/utils/types";
import { turfAnalysis, driverAnalysis } from "./statsUtils";
import SearchableSelect from "./SearchableSelect";

interface TurfAnalysisProps {
    data: DataRow[];
    variables: SavVariable[];
}

export default function TurfAnalysis({ data, variables }: TurfAnalysisProps) {
    const [activeView, setActiveView] = useState("turf");

    // TURF state
    const [turfVars, setTurfVars] = useState<string[]>([]);
    const [maxCombo, setMaxCombo] = useState(3);
    const [topN, setTopN] = useState(10);

    // Driver state
    const [dvVar, setDvVar] = useState("");
    const [ivVars, setIvVars] = useState<string[]>([]);

    const numericVars = variables.filter((v) => v.type === "numeric");

    const toggleTurfVar = (name: string) => {
        setTurfVars((prev) => prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]);
    };

    const toggleIvVar = (name: string) => {
        setIvVars((prev) => prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]);
    };

    const turfResult = useMemo(() => {
        if (turfVars.length < 2) return null;
        try {
            return turfAnalysis(data, turfVars, maxCombo, topN);
        } catch (e) {
            console.error("TURF error:", e);
            return null;
        }
    }, [data, turfVars, maxCombo, topN]);

    const driverResult = useMemo(() => {
        if (!dvVar || ivVars.length < 1) return null;
        try {
            return driverAnalysis(data, ivVars, dvVar);
        } catch (e) {
            console.error("Driver analysis error:", e);
            return null;
        }
    }, [data, dvVar, ivVars]);

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* View Toggle */}
            <div className="flex gap-2 bg-gray-50 rounded-lg p-3">
                <button onClick={() => setActiveView("turf")}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeView === "turf" ? "bg-sky-500 text-white" : "bg-white text-gray-600 border hover:bg-gray-100"}`}>
                    📡 TURF Analysis
                </button>
                <button onClick={() => setActiveView("driver")}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeView === "driver" ? "bg-sky-500 text-white" : "bg-white text-gray-600 border hover:bg-gray-100"}`}>
                    🎯 Driver Analysis
                </button>
            </div>

            {/* TURF */}
            {activeView === "turf" && (
                <div className="flex gap-4 flex-1 overflow-hidden">
                    {/* Variable selector */}
                    <div className="w-56 flex-shrink-0 border rounded-lg overflow-auto flex flex-col">
                        <div className="sticky top-0 bg-gray-50 px-3 py-2 border-b">
                            <span className="text-xs font-semibold text-gray-500">Select Items ({turfVars.length})</span>
                        </div>
                        <div className="flex-1 overflow-auto">
                            {numericVars.map((v) => (
                                <label key={v.name} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50 border-b">
                                    <input type="checkbox" checked={turfVars.includes(v.name)} onChange={() => toggleTurfVar(v.name)} className="accent-sky-500" />
                                    <span className="truncate" title={v.label}>{v.name}</span>
                                </label>
                            ))}
                        </div>
                        <div className="p-3 border-t bg-gray-50 flex flex-col gap-2">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-gray-500">Max combo</label>
                                <SearchableSelect
                                    options={[2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
                                    value={String(maxCombo)}
                                    onChange={(v) => setMaxCombo(Number(v))}
                                    placeholder="Select…"
                                    searchPlaceholder="Search…"
                                    minWidth="80px"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-gray-500">Top N</label>
                                <SearchableSelect
                                    options={[5, 10, 15, 20].map((n) => ({ value: String(n), label: String(n) }))}
                                    value={String(topN)}
                                    onChange={(v) => setTopN(Number(v))}
                                    placeholder="Select…"
                                    searchPlaceholder="Search…"
                                    minWidth="80px"
                                />
                            </div>
                        </div>
                    </div>

                    {/* TURF Results */}
                    <div className="flex-1 overflow-auto">
                        {turfVars.length < 2 ? (
                            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                                Select at least 2 items for TURF analysis.
                            </div>
                        ) : turfResult ? (
                            <div className="flex flex-col gap-4">
                                {turfResult.map((group) => (
                                    <div key={group.comboSize}>
                                        <h3 className="text-sm font-semibold text-gray-700 mb-2">
                                            Combination Size: {group.comboSize}
                                        </h3>
                                        <div className="border rounded-lg overflow-auto">
                                            <table className="w-full text-sm border-collapse">
                                                <thead>
                                                    <tr className="bg-gray-100">
                                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b w-10">#</th>
                                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b">Items</th>
                                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b w-20">Reach</th>
                                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b w-32">Reach %</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {group.top.map((combo, i) => (
                                                        <tr key={i} className="hover:bg-sky-50">
                                                            <td className="px-3 py-1.5 text-xs text-gray-400 border-r border-b">{i + 1}</td>
                                                            <td className="px-3 py-1.5 text-xs text-gray-700 border-r border-b">{combo.items.join(" + ")}</td>
                                                            <td className="px-3 py-1.5 text-xs text-gray-700 border-r border-b font-mono">{combo.reach}</td>
                                                            <td className="px-3 py-1.5 text-xs text-gray-700 border-b">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                                                        <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: `${combo.reachPct}%` }} />
                                                                    </div>
                                                                    <span className="font-mono text-[10px] w-12 text-right">{combo.reachPct.toFixed(1)}%</span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>
            )}

            {/* Driver Analysis */}
            {activeView === "driver" && (
                <div className="flex gap-4 flex-1 overflow-hidden">
                    {/* Controls */}
                    <div className="w-56 flex-shrink-0 border rounded-lg overflow-auto flex flex-col">
                        <div className="px-3 py-2 bg-gray-50 border-b">
                            <label className="text-xs font-semibold text-gray-500">Dependent Variable (DV)</label>
                            <div className="mt-1">
                                <SearchableSelect
                                    options={numericVars.map((v) => ({ value: v.name, label: v.name }))}
                                    value={dvVar}
                                    onChange={setDvVar}
                                    placeholder="Select DV…"
                                    searchPlaceholder="Search variable…"
                                    minWidth="100%"
                                />
                            </div>
                        </div>
                        <div className="sticky top-0 bg-gray-50 px-3 py-2 border-b">
                            <span className="text-xs font-semibold text-gray-500">Independent Variables ({ivVars.length})</span>
                        </div>
                        <div className="flex-1 overflow-auto">
                            {numericVars.filter((v) => v.name !== dvVar).map((v) => (
                                <label key={v.name} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50 border-b">
                                    <input type="checkbox" checked={ivVars.includes(v.name)} onChange={() => toggleIvVar(v.name)} className="accent-sky-500" />
                                    <span className="truncate" title={v.label}>{v.name}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Driver Results */}
                    <div className="flex-1 overflow-auto">
                        {(!dvVar || ivVars.length < 1) ? (
                            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                                Select a DV and at least 1 IV.
                            </div>
                        ) : driverResult ? (
                            <div className="flex flex-col gap-4">
                                <h3 className="text-sm font-semibold text-gray-700">
                                    Driver Importance for: {dvVar}
                                </h3>
                                <div className="border rounded-lg overflow-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="bg-gray-100">
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b w-10">#</th>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b">Variable</th>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b w-24">Correlation</th>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b">Relative Importance</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {driverResult.map((dr, i) => (
                                                <tr key={dr.variable} className="hover:bg-sky-50">
                                                    <td className="px-3 py-1.5 text-xs text-gray-400 border-r border-b">{i + 1}</td>
                                                    <td className="px-3 py-1.5 text-xs font-medium text-gray-700 border-r border-b">{dr.variable}</td>
                                                    <td className="px-3 py-1.5 text-xs text-gray-700 border-r border-b font-mono">
                                                        <span className={dr.correlation >= 0 ? "text-blue-600" : "text-red-500"}>
                                                            {dr.correlation.toFixed(4)}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-1.5 text-xs text-gray-700 border-b">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                                                                <div className={`h-full rounded-full transition-all ${dr.correlation >= 0 ? "bg-sky-500" : "bg-red-400"}`}
                                                                    style={{ width: `${dr.importancePct ?? 0}%` }} />
                                                            </div>
                                                            <span className="font-mono text-[10px] w-12 text-right">{(dr.importancePct ?? 0).toFixed(0)}%</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-xs text-gray-400">
                                    Importance based on absolute Pearson correlation with DV. Positive = blue, Negative = red.
                                </p>
                            </div>
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    );
}
