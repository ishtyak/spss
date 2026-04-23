"use client"
import { useMemo, useState } from "react";
import type { DataRow, SavVariable, ValueLabels } from "@/utils/types";
import { dataQC } from "./statsUtils";
import SearchableSelect from "./SearchableSelect";

interface DataQCPanelProps {
    data: DataRow[];
    variables: SavVariable[];
    valueLabels: ValueLabels;
}

const SEVERITY_COLORS: Record<Severity, string> = {
    high: "bg-red-100 text-red-700 border-red-200",
    medium: "bg-amber-100 text-amber-700 border-amber-200",
    low: "bg-blue-100 text-blue-700 border-blue-200",
};
type Severity = "high" | "medium" | "low";

type Issue = {
    severity: Severity;
    variable: any;
    type: any;
    label: any;
    count: any;
    message: any

    // add other fields if needed
};

const SEVERITY_BADGES: Record<Severity, string> = {
    high: "bg-red-500",
    medium: "bg-amber-500",
    low: "bg-blue-500",
};

export default function DataQCPanel({ data, variables, valueLabels }: DataQCPanelProps) {
    const [filterType, setFilterType] = useState("all");
    const [filterSeverity, setFilterSeverity] = useState("all");

    const result = useMemo(() => {
        if (!data.length) return null;
        return dataQC(data, variables, valueLabels);
    }, [data, variables, valueLabels]);

    if (!result) {
        return <div className="flex items-center justify-center h-full text-gray-400 text-sm">No data loaded.</div>;
    }

    const { issues, summary } = result;

    const filtered = issues.filter((iss: any) => {
        if (filterType !== "all" && iss.type !== filterType) return false;
        if (filterSeverity !== "all" && iss.severity !== filterSeverity) return false;
        return true;
    });

    const issueTypes = [...new Set(issues.map((i: any) => i.type))];

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {[
                    { label: "Total Rows", value: summary.totalRows, color: "text-gray-700" },
                    { label: "Variables", value: summary.totalVariables, color: "text-gray-700" },
                    { label: "Numeric", value: summary.numericVars, color: "text-blue-600" },
                    { label: "String", value: summary.stringVars, color: "text-green-600" },
                    { label: "Missing Cells", value: summary.totalMissing, color: summary.totalMissing > 0 ? "text-amber-600" : "text-gray-700" },
                    { label: "Duplicate Rows", value: summary.duplicateRows, color: summary.duplicateRows > 0 ? "text-red-600" : "text-gray-700" },
                    { label: "Issues Found", value: summary.issueCount, color: summary.issueCount > 0 ? "text-red-600" : "text-green-600" },
                ].map((card) => (
                    <div key={card.label} className="bg-white border rounded-lg px-4 py-3 text-center">
                        <div className={`text-lg font-bold ${card.color}`}>{card.value.toLocaleString()}</div>
                        <div className="text-xs text-gray-500">{card.label}</div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4 bg-gray-50 rounded-lg p-3">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-500">Issue Type</label>
                    <SearchableSelect
                        options={[
                            { value: "all", label: "All Types" },
                            ...issueTypes.map((t: any) => ({ value: t, label: t.replace(/_/g, " ") }))
                        ]}
                        value={filterType}
                        onChange={setFilterType}
                        placeholder="All Types"
                        searchPlaceholder="Search type…"
                        minWidth="160px"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-500">Severity</label>
                    <SearchableSelect
                        options={[
                            { value: "all", label: "All" },
                            { value: "high", label: "High" },
                            { value: "medium", label: "Medium" },
                            { value: "low", label: "Low" },
                        ]}
                        value={filterSeverity}
                        onChange={setFilterSeverity}
                        placeholder="All"
                        searchPlaceholder="Search…"
                        minWidth="120px"
                    />
                </div>
                <div className="flex items-end text-sm text-gray-500">
                    {filtered.length} issue{filtered.length !== 1 ? "s" : ""} shown
                </div>
            </div>

            {/* Issues list */}
            <div className="flex-1 overflow-auto">
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                        <span className="text-3xl mb-2">✅</span>
                        <span className="text-sm">No issues found with current filters.</span>
                    </div>
                ) : (
                    <div className="border rounded-lg overflow-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead className="sticky top-0 z-10">
                                <tr className="bg-gray-100">
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b w-10">#</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b w-24">Severity</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b w-28">Type</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b">Variable</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b w-16">Count</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b">Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((iss: Issue, i: number) => (
                                    <tr key={i} className={`${SEVERITY_COLORS[iss.severity]} border`}>
                                        <td className="px-3 py-2 text-xs border-r border-b">{i + 1}</td>
                                        <td className="px-3 py-2 text-xs border-r border-b">
                                            <span className={`${SEVERITY_BADGES[iss.severity]} text-white text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase`}>
                                                {iss.severity}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-xs border-r border-b capitalize font-medium">{iss.type.replace(/_/g, " ")}</td>
                                        <td className="px-3 py-2 text-xs border-r border-b">
                                            <span className="font-semibold">{iss.variable}</span>
                                            {iss.label && <span className="text-gray-500 ml-1">({iss.label})</span>}
                                        </td>
                                        <td className="px-3 py-2 text-xs border-r border-b font-mono">{iss.count}</td>
                                        <td className="px-3 py-2 text-xs border-b">{iss.message}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
