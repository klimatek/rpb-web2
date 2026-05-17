import fs from "node:fs/promises";
import path from "node:path";
import {
  parseAdditionalInformationSections,
  stripBoldMarkers,
} from "@/lib/quotation-content";
import { NextResponse } from "next/server";
import XlsxPopulate from "xlsx-populate";

export const runtime = "nodejs";

type Payload = {
  quotationDate?: string;
  quotationNo?: string;
  preparedFor?: string;
  customerName?: string;
  customerAddressLine1?: string;
  customerAddress?: string;
  customerAddressLine2?: string;
  attn?: string;
  salesName?: string;
  salesEmail?: string;
  salesPhone?: string;
  itemDescription?: string;
  item1Description?: string;
  quantity?: number | string;
  itemQuantity?: number | string;
  item1Quantity?: number | string;
  price?: number | string;
  itemPrice?: number | string;
  item1Price?: number | string;
  discount?: number | string;
  itemDiscount?: number | string;
  item1Discount?: number | string;
  items?: Array<{
    description?: string;
    quantity?: number | string;
    price?: number | string;
  }>;
  additionalInformation?: string;
  ppnRate?: number;
};

const TEMPLATE_FILE = path.join(process.cwd(), "templates", "Quotation_PT_Jaya_Nurimba.xlsx");

function toNumber(value: unknown): number {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDiscount(value: unknown): number {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.replace("%", "");
  let n = toNumber(normalized);
  if (n > 1) n /= 100;
  if (n < 0) n = 0;
  if (n > 1) n = 1;
  return n;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function plainText(value: unknown): string {
  return stripBoldMarkers(text(value));
}

function normalizeItems(payload: Payload): Array<{ description: string; quantity: number; price: number }> {
  if (Array.isArray(payload.items) && payload.items.length > 0) {
    return payload.items.slice(0, 10).map((item, index) => ({
      description: plainText(item.description) || `AHU ${index + 1}`,
      quantity: Math.max(1, toNumber(item.quantity)),
      price: toNumber(item.price),
    }));
  }

  return [
    {
      description: plainText(payload.itemDescription || payload.item1Description) || "-",
      quantity: Math.max(1, toNumber(payload.quantity || payload.itemQuantity || payload.item1Quantity)),
      price: toNumber(payload.price || payload.itemPrice || payload.item1Price),
    },
  ];
}

function buildContactPerson(salesName: unknown, salesPhone: unknown): string {
  const name = plainText(salesName);
  const phone = plainText(salesPhone);
  if (name && phone) return `${name} / ${phone}`;
  return name || phone;
}

function formatQuotationDate(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function buildQuotationNo(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "Asia/Jakarta",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? String(date.getFullYear());
  const month =
    parts.find((part) => part.type === "month")?.value ?? String(date.getMonth() + 1).padStart(2, "0");
  return `Q-${year}${month}`;
}

type SheetLineWriter = {
  cell: (address: string) => {
    value: (nextValue?: unknown) => unknown;
  };
};

function writeLinesToColumn(
  sheet: SheetLineWriter,
  column: string,
  startRow: number,
  endRow: number,
  lines: string[],
): void {
  for (let row = startRow; row <= endRow; row += 1) {
    sheet.cell(`${column}${row}`).value(null);
  }

  const maxRows = endRow - startRow + 1;
  lines.slice(0, maxRows).forEach((line, index) => {
    sheet.cell(`${column}${startRow + index}`).value(line);
  });
}

async function createWorkbookBuffer(payload: Payload): Promise<Buffer> {
  await fs.access(TEMPLATE_FILE);

  const workbook = await XlsxPopulate.fromFileAsync(TEMPLATE_FILE);
  const sheet = workbook.sheet("Quotation") || workbook.sheet(0);
  sheet.pageMarginsPreset("normal");

  const now = new Date();
  const quotationDate = text(payload.quotationDate) || formatQuotationDate(now);
  const quotationNo = text(payload.quotationNo) || buildQuotationNo(now);
  const preparedFor = plainText(payload.preparedFor || payload.customerName) || "-";
  const addressLine1 = plainText(payload.customerAddressLine1 || payload.customerAddress) || "-";
  const addressLine2 = plainText(payload.customerAddressLine2);
  const attn = plainText(payload.attn) || "-";
  const contactPerson = buildContactPerson(payload.salesName, payload.salesPhone) || "-";
  const salesName = plainText(payload.salesName) || "-";
  const salesEmail = plainText(payload.salesEmail) || "-";

  const items = normalizeItems(payload);
  const discount = toDiscount(payload.discount || payload.itemDiscount || payload.item1Discount);
  const addressCombined = [addressLine1, addressLine2].filter(Boolean).join("\n") || "-";
  const discountRateLiteral = Number.isFinite(discount) ? String(discount) : "0";
  const parsedAdditional = parseAdditionalInformationSections(text(payload.additionalInformation));
  const termsConditionLines = parsedAdditional.conditionLines.map((line) => stripBoldMarkers(line));
  const termsPaymentLines = parsedAdditional.paymentLines.map((line) => stripBoldMarkers(line));
  const ppnRate = Number.isFinite(payload.ppnRate) && (payload.ppnRate as number) > 0 ? (payload.ppnRate as number) : 0.11;
  const ppnPercent = Math.round(ppnRate * 100);

  ["A26:A36", "B26:D36", "E26:E36", "F26:F36", "G26:G36", "H26:H36"].forEach((range) => {
    sheet.range(range).merged(false);
  });
  ["G15:G25", "H15:H25"].forEach((range) => {
    sheet.range(range).merged(false);
  });
  sheet.column("F").width(13.5);
  sheet.column("G").width(5.5);
  sheet.column("H").width(11.5);
  sheet.column("G").hidden(false);
  sheet.cell("G14").value("Total Price");
  sheet.cell("H14").value("");
  sheet.cell("H2").formula(null).value(quotationDate);
  sheet.cell("H3").formula(null).value(quotationNo);

  sheet.cell("C9").value(contactPerson);
  sheet.cell("C10").formula(null).value(preparedFor);
  sheet.cell("C11").formula(null).value(addressCombined);
  sheet.cell("C12").formula(null).value(attn);
  sheet.cell("C11").style("wrapText", true);

  for (let row = 15; row <= 24; row += 1) {
    ["A", "B", "E", "F", "G", "H"].forEach((col) => {
      sheet.cell(`${col}${row}`).formula(null).value(null);
    });
    sheet.range(`G${row}:H${row}`).merged(false);
    sheet.row(row).hidden(true);
  }

  items.forEach((item, index) => {
    const row = 15 + index;
    sheet.row(row).hidden(false);
    sheet.cell(`A${row}`).value(index + 1);
    sheet.cell(`B${row}`).formula(null).value(item.description);
    sheet.cell(`B${row}`).style("wrapText", true);
    sheet.cell(`E${row}`).formula(null).value(item.quantity);
    sheet.cell(`F${row}`).formula(null).value(item.price);
    sheet.cell(`G${row}`).formula(`IF(OR(E${row}="",F${row}=""),"",E${row}*F${row})`);
    sheet.cell(`H${row}`).formula(null).value(null);
    sheet.range(`G${row}:H${row}`).merged(true);
    sheet.range(`A${row}:H${row}`).style("border", {
      top: true,
      left: true,
      right: true,
      bottom: true,
    });
  });
  sheet.row(25).hidden(true);

  ["A26", "B26", "E26", "F26", "G26", "H26"].forEach((address) => {
    sheet.cell(address).formula(null).value(null);
  });
  for (let row = 26; row <= 33; row += 1) {
    sheet.row(row).hidden(true);
  }
  for (let row = 34; row <= 37; row += 1) {
    sheet.row(row).hidden(false);
  }

  ["E34:F34", "E35:F35", "E36:F36", "E37:F37", "G34:H34", "G35:H35", "G36:H36", "G37:H37"].forEach(
    (range) => {
      sheet.range(range).merged(false);
    },
  );
  ["A", "B", "C", "D", "E", "F", "G", "H"].forEach((col) => {
    for (let row = 34; row <= 37; row += 1) {
      sheet.cell(`${col}${row}`).formula(null).value(null);
    }
  });

  sheet.cell("G26").formula(null).value(null);
  sheet.cell("H26").formula(null).value(null);
  sheet.cell("E34").value("Subtotal");
  sheet.cell("G34").formula('IF(SUM(G15:G24)=0,"",SUM(G15:G24))');
  sheet.cell("E35").value(`Discount (${(discount * 100).toFixed(2)}%)`);
  sheet.cell("G35").formula(`IF(G34="","",G34*${discountRateLiteral})`);
  sheet.cell("E36").value(`PPN ${ppnPercent}%`);
  sheet.cell("G36").formula(`IF(G34="","",(G34-G35)*${ppnRate})`);
  sheet.cell("E37").value("Grand Total");
  sheet.cell("G37").formula('IF(G34="","",G34-G35+G36)');

  const qtyNumberFormat = "#,##0";
  const currencyNumberFormat = '"Rp" #,##0';
  for (let row = 15; row <= 24; row += 1) {
    sheet.cell(`E${row}`).style("numberFormat", qtyNumberFormat);
    sheet.cell(`F${row}`).style("numberFormat", currencyNumberFormat);
    sheet.cell(`G${row}`).style("numberFormat", currencyNumberFormat);
  }
  for (let row = 34; row <= 37; row += 1) {
    sheet.range(`E${row}:F${row}`).style("horizontalAlignment", "right");
    sheet.cell(`G${row}`).style("horizontalAlignment", "right");
    sheet.cell(`G${row}`).style("numberFormat", currencyNumberFormat);
  }
  sheet.range("E37:F37").style("bold", true);
  sheet.cell("G37").style("bold", true);

  [
    "E34:F34",
    "E35:F35",
    "E36:F36",
    "E37:F37",
    "G14:H14",
    "G34:H34",
    "G35:H35",
    "G36:H36",
    "G37:H37",
  ].forEach((range) => {
    sheet.range(range).merged(true);
    sheet.range(range).style("border", {
      top: true,
      left: true,
      right: true,
      bottom: true,
    });
  });
  sheet.range("A14:H25").style("border", {
    top: true,
    left: true,
    right: true,
    bottom: true,
  });

  ["A", "B", "C", "D"].forEach((col) => {
    for (let row = 34; row <= 37; row += 1) {
      sheet.cell(`${col}${row}`).style("border", {});
    }
  });
  for (let row = 34; row <= 37; row += 1) {
    sheet.range(`E${row}:F${row}`).style("border", {
      top: true,
      left: true,
      right: true,
      bottom: true,
    });
    sheet.range(`G${row}:H${row}`).style("border", {
      top: true,
      left: true,
      right: true,
      bottom: true,
    });
  }

  writeLinesToColumn(sheet, "A", 40, 46, termsConditionLines);
  writeLinesToColumn(sheet, "A", 48, 49, termsPaymentLines);
  sheet.cell("A52").formula(null).value(salesName);
  sheet.cell("A54").formula(null).value(`Email : ${salesEmail}`);

  ["K58:O58", "L59:O59", "L60:O60", "L61:O61", "L62:O62"].forEach((range) => {
    sheet.range(range).merged(false);
  });
  const inputCols = ["K", "L", "M", "N", "O"];
  for (let row = 58; row <= 66; row += 1) {
    inputCols.forEach((col) => {
      sheet.cell(`${col}${row}`).formula(null).value(null);
    });
    sheet.row(row).hidden(true);
  }
  inputCols.forEach((col) => sheet.column(col).hidden(true));

  return workbook.outputAsync({ type: "nodebuffer" }) as Promise<Buffer>;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = (await request.json()) as Payload;
    const buffer = await createWorkbookBuffer(payload);

    const body = new Uint8Array(buffer);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="quotation-${Date.now()}.xlsx"`,
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "Failed to generate Excel file",
      },
      { status: 500 },
    );
  }
}
