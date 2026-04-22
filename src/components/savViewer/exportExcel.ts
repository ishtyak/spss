import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

/**
 * Export data to Excel (.xlsx) with Data + Variable sheets.
 */
export function exportToExcel(data, variables, valueLabels, fileName = "export") {
    const wb = XLSX.utils.book_new();

    // ── Data sheet ──────────────────────────────────────────────────
    const headers = variables.map((v) => v.name);
    const rows = data.map((row) =>
        variables.map((v) => {
            const val = row[v.name];
            return val == null ? "" : val;
        })
    );
    const dataWS = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    // Set column widths
    dataWS["!cols"] = headers.map((h) => ({ wch: Math.max(h.length, 12) }));
    XLSX.utils.book_append_sheet(wb, dataWS, "Data");

    // ── Variable sheet ──────────────────────────────────────────────
    const varHeaders = ["Name", "Type", "Width", "Label", "Value Labels", "Measure", "Alignment"];
    const varRows = variables.map((v) => {
        const vl = valueLabels[v.name];
        const vlStr = vl ? vl.map((l) => `${l.value}=${l.label}`).join("; ") : "";
        return [v.name, v.type, v.type === "string" ? v.width : 8, v.label || "", vlStr, v.measure || "", v.alignment || ""];
    });
    const varWS = XLSX.utils.aoa_to_sheet([varHeaders, ...varRows]);
    varWS["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 8 }, { wch: 40 }, { wch: 60 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, varWS, "Variables");

    // ── Value Labels sheet ──────────────────────────────────────────
    const vlHeaders = ["Variable", "Value", "Label"];
    const vlRows = [];
    for (const v of variables) {
        const vl = valueLabels[v.name];
        if (!vl || vl.length === 0) continue;
        for (const l of vl) {
            vlRows.push([v.name, l.value, l.label]);
        }
    }
    if (vlRows.length > 0) {
        const vlWS = XLSX.utils.aoa_to_sheet([vlHeaders, ...vlRows]);
        vlWS["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 40 }];
        XLSX.utils.book_append_sheet(wb, vlWS, "Value Labels");
    }

    // ── Write & download ────────────────────────────────────────────
    const wbOut = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbOut], { type: "application/octet-stream" });
    const safeName = fileName.replace(/\.sav$/i, "");
    saveAs(blob, `${safeName}.xlsx`);
}
