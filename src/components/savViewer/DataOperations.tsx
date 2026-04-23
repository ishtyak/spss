"use client"
import { useState, useCallback } from "react";
import { enqueueSnackbar } from "notistack";
import type { DataRow, SavVariable, SavParseResult } from "@/utils/types";

interface SavParserConstructor {
    new (buffer: ArrayBuffer): { parse(): SavParseResult };
}

interface DataOperationsProps {
    data: DataRow[];
    variables: SavVariable[];
    setData: (data: DataRow[]) => void;
    setVariables: (variables: SavVariable[]) => void;
    SavParser: SavParserConstructor;
}

// We reuse the SavParser from the parent — passed as prop
export default function DataOperations({ data, variables, setData, setVariables, SavParser }: DataOperationsProps) {
    const [operation, setOperation] = useState("append");
    const [secondaryData, setSecondaryData] = useState<DataRow[] | null>(null);
    const [secondaryVars, setSecondaryVars] = useState<SavVariable[]>([]);
    const [secondaryFileName, setSecondaryFileName] = useState("");
    const [stackVars, setStackVars] = useState<string[]>([]);
    const [stackTarget, setStackTarget] = useState("stacked_value");
    const [stackIdVar, setStackIdVar] = useState("source_var");

    const handleSecondaryFile = useCallback(async (file: File) => {
        if (!file || !file.name.toLowerCase().endsWith(".sav")) {
            enqueueSnackbar("Please upload a .sav file", { variant: "warning" });
            return;
        }
        try {
            const ab = await file.arrayBuffer();
            const parser = new SavParser(ab);
            const result = parser.parse();
            setSecondaryData(result.data);
            setSecondaryVars(result.variables);
            setSecondaryFileName(file.name);
            enqueueSnackbar(`Loaded ${result.data.length} rows from ${file.name}`, { variant: "success" });
        } catch (err) {
            enqueueSnackbar("Error reading secondary file: " + (err as Error).message, { variant: "error" });
        }
    }, [SavParser]);

    const doAppend = () => {
        if (!secondaryData) return;
        // Merge by matching variable names
        const allVarNames = new Set([...variables.map((v) => v.name), ...secondaryVars.map((v) => v.name)]);
        const merged = [...data, ...secondaryData.map((row) => {
            const newRow: DataRow = {};
            for (const vn of allVarNames) {
                newRow[vn] = row[vn] ?? null;
            }
            return newRow;
        })];
        setData(merged);
        // Add any new variables from secondary
        const existingNames = new Set(variables.map((v) => v.name));
        const newVars = secondaryVars.filter((v) => !existingNames.has(v.name));
        if (newVars.length) setVariables([...variables, ...newVars]);
        enqueueSnackbar(`Appended ${secondaryData.length} rows. Total: ${merged.length}`, { variant: "success" });
    };

    const doReplace = () => {
        if (!secondaryData) return;
        setData(secondaryData);
        setVariables(secondaryVars);
        enqueueSnackbar(`Replaced data with ${secondaryData.length} rows, ${secondaryVars.length} variables`, { variant: "success" });
    };

    const doStack = () => {
        if (stackVars.length < 2) {
            enqueueSnackbar("Select at least 2 variables to stack", { variant: "warning" });
            return;
        }
        const otherVars = variables.filter((v) => !stackVars.includes(v.name));
        const stacked: DataRow[] = [];
        for (const row of data) {
            for (const sv of stackVars) {
                const newRow: DataRow = {};
                for (const ov of otherVars) newRow[ov.name] = row[ov.name];
                newRow[stackTarget] = row[sv];
                newRow[stackIdVar] = sv;
                stacked.push(newRow);
            }
        }
        const newVars: SavVariable[] = [
            ...otherVars,
            { name: stackTarget, type: "numeric", label: "Stacked Value", width: 8, printFormat: 0, writeFormat: 0, missingValues: [], measure: "", columnWidth: 8, alignment: "" },
            { name: stackIdVar, type: "string", label: "Source Variable", width: 32, printFormat: 0, writeFormat: 0, missingValues: [], measure: "", columnWidth: 8, alignment: "" },
        ];
        setData(stacked);
        setVariables(newVars);
        enqueueSnackbar(`Stacked ${stackVars.length} variables → ${stacked.length} rows`, { variant: "success" });
    };

    const toggleStackVar = (name: string) => {
        setStackVars((prev) => prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]);
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* Operation selector */}
            <div className="flex gap-2 bg-gray-50 rounded-lg p-3">
                {["append", "replace", "stack"].map((op) => (
                    <button key={op} onClick={() => setOperation(op)}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${operation === op ? "bg-sky-500 text-white" : "bg-white text-gray-600 border hover:bg-gray-100"}`}>
                        {op === "append" ? "📎 Append" : op === "replace" ? "🔄 Replace" : "📚 Stack"}
                    </button>
                ))}
            </div>

            {/* Append / Replace */}
            {(operation === "append" || operation === "replace") && (
                <div className="flex flex-col gap-4">
                    <div className="border-2 border-dashed rounded-lg p-6 text-center">
                        <p className="text-sm text-gray-600 mb-2">
                            {operation === "append"
                                ? "Upload a second .sav file to append its rows to the current data"
                                : "Upload a .sav file to replace the current data entirely"}
                        </p>
                        <label className="cursor-pointer inline-block bg-sky-500 hover:bg-sky-600 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                            Browse .sav File
                            <input type="file" accept=".sav" onChange={(e) => { if (e.target.files?.[0]) handleSecondaryFile(e.target.files[0]); }} className="hidden" />
                        </label>
                        {secondaryFileName && (
                            <p className="text-sm text-gray-500 mt-2">
                                ✓ {secondaryFileName} — {secondaryData?.length} rows, {secondaryVars?.length} variables
                            </p>
                        )}
                    </div>

                    {secondaryData && (
                        <div className="flex flex-col gap-3">
                            {operation === "append" && (
                                <div className="text-sm bg-blue-50 border border-blue-200 rounded-lg p-3">
                                    <p className="font-medium text-blue-700 mb-1">Variable Matching Preview:</p>
                                    <div className="flex gap-4 text-xs">
                                        <span className="text-green-600">
                                            ✓ Matching: {variables.filter((v) => secondaryVars.some((sv) => sv.name === v.name)).length}
                                        </span>
                                        <span className="text-orange-600">
                                            + New in secondary: {secondaryVars.filter((sv) => !variables.some((v) => v.name === sv.name)).length}
                                        </span>
                                        <span className="text-gray-500">
                                            ○ Missing in secondary: {variables.filter((v) => !secondaryVars.some((sv) => sv.name === v.name)).length}
                                        </span>
                                    </div>
                                </div>
                            )}
                            <button onClick={operation === "append" ? doAppend : doReplace}
                                className="bg-sky-500 hover:bg-sky-600 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors self-start">
                                {operation === "append" ? "Append Data" : "Replace Data"}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Stack */}
            {operation === "stack" && (
                <div className="flex flex-col gap-4 flex-1 overflow-auto">
                    <p className="text-sm text-gray-600">
                        Select variables to stack into a single column. Each row will be repeated for each selected variable.
                    </p>
                    <div className="flex gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-gray-500">Target Variable Name</label>
                            <input value={stackTarget} onChange={(e) => setStackTarget(e.target.value)}
                                className="border rounded-lg px-3 py-1.5 text-sm w-48" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-gray-500">Source ID Variable</label>
                            <input value={stackIdVar} onChange={(e) => setStackIdVar(e.target.value)}
                                className="border rounded-lg px-3 py-1.5 text-sm w-48" />
                        </div>
                    </div>
                    <div className="border rounded-lg p-3 flex-1 overflow-auto max-h-[300px]">
                        <p className="text-xs font-semibold text-gray-500 mb-2">Select variables to stack ({stackVars.length} selected):</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
                            {variables.filter((v) => v.type === "numeric").map((v) => (
                                <label key={v.name} className="flex items-center gap-2 text-sm cursor-pointer px-2 py-1 rounded hover:bg-gray-50">
                                    <input type="checkbox" checked={stackVars.includes(v.name)} onChange={() => toggleStackVar(v.name)} className="accent-sky-500" />
                                    <span className="truncate" title={v.label}>{v.name}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    {stackVars.length >= 2 && (
                        <div className="text-sm bg-blue-50 border border-blue-200 rounded-lg p-3">
                            Preview: {data.length} rows × {stackVars.length} vars → <strong>{data.length * stackVars.length} rows</strong>
                        </div>
                    )}
                    <button onClick={doStack} disabled={stackVars.length < 2}
                        className="bg-sky-500 hover:bg-sky-600 disabled:bg-gray-300 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors self-start">
                        Stack Variables
                    </button>
                </div>
            )}
        </div>
    );
}
