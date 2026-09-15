import React from "react";
import { Modal, Button } from "./ui";
import { formatCurrency, formatDateTime } from "../utils/constants";

export default function CafeReceiptModal({ isOpen, onClose, sale, orgName = "TFG | CAFE" }) {
  if (!isOpen || !sale) return null;

  const handlePrint = () => {
    const itemsHtml = (sale.items || []).map(itm =>
      `<tr>
        <td style="padding:3px 0;font-weight:600;">${itm.name || ""}</td>
        <td style="padding:3px 0;text-align:center;">${itm.qty} x ${itm.unitPrice}</td>
        <td style="padding:3px 0;text-align:left;font-weight:700;">${(itm.qty * itm.unitPrice).toLocaleString()} ج.م</td>
       </tr>`
    ).join("");

    const payMethodLabel =
      sale.paymentMethod === "cash" ? "نقدي" :
      sale.paymentMethod === "visa" ? "فيزا" :
      sale.paymentMethod === "vodafone_cash" ? "فودافون كاش" : "انستاباي";

    const now = new Date().toLocaleString("ar-EG-u-nu-latn", { timeZone: "Africa/Cairo" });

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>ايصال كافيه</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
  <style>
    * { margin:0;padding:0;box-sizing:border-box; }
    body { font-family:"Cairo",monospace;font-size:12px;background:#fff;color:#000;width:80mm;margin:0 auto;padding:5mm; }
    .c { text-align:center; }
    h2 { font-size:15px;font-weight:900; }
    .s { font-size:10px;color:#555;margin:2px 0; }
    .d { border-top:1px dashed #000;margin:6px 0; }
    table { width:100%;border-collapse:collapse; }
    th { font-size:10px;font-weight:700;border-bottom:1px solid #ccc;padding-bottom:3px; }
    td { vertical-align:top; }
    .tr td { font-size:14px;font-weight:900;padding-top:6px; }
    .me td { font-size:10px;color:#444;padding:1px 0; }
    .ft { text-align:center;font-size:10px;color:#666;padding-top:8px; }
    @page { size:80mm auto;margin:0; }
    @media print { body { width:80mm; } }
  </style>
</head>
<body>
  <div class="c">
    <h2>TFG | CAFE</h2>
    <p class="s">المشروبات والضيافة</p>
    <p class="s">${now}</p>
    <p class="s">رقم الطلب: #${sale.id || Date.now().toString().slice(-4)}</p>
  </div>
  <div class="d"></div>
  <table>
    <thead><tr><th style="text-align:right">الصنف</th><th style="text-align:center">ك x س</th><th style="text-align:left">الإجمالي</th></tr></thead>
    <tbody>
      ${itemsHtml}
      <tr><td colspan="3"><div class="d"></div></td></tr>
      <tr class="tr"><td colspan="2">المجموع الكلي:</td><td style="text-align:left">${Number(sale.total||0).toLocaleString()} ج.م</td></tr>
      <tr class="me"><td colspan="2">طريقة الدفع:</td><td style="text-align:left">${payMethodLabel}</td></tr>
      ${sale.buyerName ? `<tr class="me"><td colspan="2">الزبون:</td><td style="text-align:left">${sale.buyerName}</td></tr>` : ""}
    </tbody>
  </table>
  <div class="d"></div>
  <div class="ft">نتمنى لكم وقتا ممتعا ومشروبا هنيئا!</div>
  <script>window.onload=function(){window.print();setTimeout(function(){window.close();},800);};</script>
</body>
</html>`;

    const popup = window.open("", "_blank", "width=340,height=520,toolbar=0,scrollbars=0,status=0");
    if (!popup) {
      alert("يرجى السماح بالنوافذ المنبثقة في المتصفح لتتمكن من الطباعة");
      return;
    }
    popup.document.write(html);
    popup.document.close();
  };

  return (
    <Modal open={true} onClose={onClose} title="إيصال طلب TFG | CAFE (بون استلام)" size="sm">
      <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
        <div style={{
          width: "100%", maxWidth: 300, background: "#ffffff", color: "#000000",
          padding: "16px 14px", borderRadius: 8, fontFamily: "monospace",
          fontSize: 12, lineHeight: 1.4, border: "1px dashed #94a3b8"
        }}>
          <div style={{ textAlign: "center", borderBottom: "1px dashed #000", paddingBottom: 8, marginBottom: 8 }}>
            <h3 style={{ fontSize: 16, fontWeight: 900, margin: 0, color: "#000" }}>TFG | CAFE</h3>
            <p style={{ fontSize: 11, margin: "2px 0 0", color: "#444" }}>المشروبات والضيافة</p>
            <p style={{ fontSize: 10, margin: "2px 0 0", color: "#666" }}>{formatDateTime(new Date())}</p>
            <p style={{ fontSize: 10, margin: "2px 0 0", color: "#666" }}>{'رقم الطلب: #' + (sale.id || Date.now().toString().slice(-4))}</p>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, borderBottom: "1px solid #ddd", paddingBottom: 4 }}>
              <span>الصنف</span><span>الكمية x السعر</span><span>الإجمالي</span>
            </div>
            {(sale.items || []).map((itm, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 11 }}>
                <span style={{ fontWeight: 600 }}>{itm.name}</span>
                <span>{itm.qty} x {itm.unitPrice}</span>
                <span style={{ fontWeight: 700 }}>{itm.qty * itm.unitPrice} ج.م</span>
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px dashed #000", paddingTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 900 }}>
              <span>المجموع الكلي:</span><span>{formatCurrency(sale.total)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#444" }}>
              <span>طريقة الدفع:</span>
              <span>{sale.paymentMethod === "cash" ? "نقدي" : sale.paymentMethod === "visa" ? "فيزا" : sale.paymentMethod === "vodafone_cash" ? "فودافون" : "انستاباي"}</span>
            </div>
            {sale.buyerName && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#444" }}>
                <span>الزبون:</span><span>{sale.buyerName}</span>
              </div>
            )}
          </div>
          <div style={{ textAlign: "center", borderTop: "1px dashed #000", paddingTop: 6, marginTop: 8, fontSize: 10, color: "#666" }}>
            نتمنى لكم وقتا ممتعا ومشروبا هنيئا!
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, width: "100%", justifyContent: "flex-end", marginTop: 4 }}>
          <Button type="button" variant="ghost" onClick={onClose}>اغلاق</Button>
          <Button type="button" variant="primary" onClick={handlePrint} style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}>
            طباعة البون الفوري
          </Button>
        </div>
      </div>
    </Modal>
  );
}
