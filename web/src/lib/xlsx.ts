// Oddiy Excel (.xlsx) yozuvchi: bir nechta varaq, qalin sarlavha, raqamlar "1 234 567" ko'rinishida.
// Tashqi og'ir kutubxonasiz — faqat fflate (zip).
import { strToU8, zipSync } from 'fflate';

export type XCell = string | number | null | undefined;
export interface XSheet {
  name: string;
  rows: XCell[][];
  /** Qalin qatorlar (sarlavha, jami) — 0 dan boshlab indekslar */
  bold?: number[];
  /** Ustun kengliklari (belgilarda) */
  widths?: number[];
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  // XML 1.0 da ruxsat etilmagan boshqaruv belgilarini olib tashlash
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const col = (i: number) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

function sheetXml(sh: XSheet) {
  const bold = new Set(sh.bold ?? [0]);
  const ncols = Math.max(1, ...sh.rows.map((r) => r.length));
  const widths = sh.widths ?? Array.from({ length: ncols }, (_, c) =>
    Math.min(60, Math.max(8, ...sh.rows.map((r) => String(r[c] ?? '').length + 2))));
  const cols = `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`;
  const rows = sh.rows.map((r, ri) => {
    const b = bold.has(ri);
    const cells = r.map((v, ci) => {
      if (v === null || v === undefined || v === '') return '';
      const ref = `${col(ci)}${ri + 1}`;
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${b ? 3 : 2}"><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr" s="${b ? 1 : 0}"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

/** Varaq nomi: 31 belgigacha, taqiqlangan belgilarsiz, takrorlanmas. */
function sheetNames(list: XSheet[]) {
  const used = new Set<string>();
  return list.map((s) => {
    const base = (s.name.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Varaq').slice(0, 31);
    let n = base, k = 2;
    while (used.has(n.toLowerCase())) { const suf = ` (${k++})`; n = base.slice(0, 31 - suf.length) + suf; }
    used.add(n.toLowerCase());
    return n;
  });
}

export function buildXlsx(sheets: XSheet[]): Uint8Array {
  const names = sheetNames(sheets);
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    // Uslublar: 0 oddiy, 1 qalin, 2 raqam (# ##0), 3 qalin raqam
    'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf/><xf fontId="1" applyFont="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
  };
  sheets.forEach((sh, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(sh)); });
  return zipSync(files);
}

/** .xlsx faylni yuklab olish. */
export function downloadXlsx(filename: string, sheets: XSheet[]) {
  const blob = new Blob([buildXlsx(sheets)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Fayl nomi uchun xavfsiz qism. */
export const fileSafe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, '_').slice(0, 60);
