import React, { useState } from "react";
import { Modal, Button } from "./ui";
import { formatCurrency, formatDateTime } from "../utils/constants";
import { printThermalReceipt } from "../utils/thermalPrinter";
import { Printer, Check, Receipt } from "lucide-react";

export default function CafeReceiptModal({ isOpen, onClose, sale, orgName = "THE FIRST GROUP" }) {
  const [paperWidth, setPaperWidth] = useState("80mm");

  if (!isOpen || !sale) return null;

  const handlePrint = (width = paperWidth) => {
    printThermalReceipt({
      type: 'cafe',
      paperWidth: width,
      data: {
        orderId: sale.id || Date.now().toString().slice(-4),
        items: sale.items || [],
        subtotal: sale.total,
        discount: sale.discount || 0,
        total: sale.total,
        paymentMethod: sale.paymentMethod,
        cashierName: sale.cashierName || sale.baristaName,
        buyerName: sale.buyerName
      },
      orgName
    });
  };

  const payMethodLabel =
    sale.paymentMethod === "cash" ? "نقدي (كاش)" :
    sale.paymentMethod === "visa" ? "فيزا / بطاقة" :
    sale.paymentMethod === "wallet_credit" ? "محفظة العضو" :
    sale.paymentMethod === "vodafone_cash" ? "فودافون كاش" : "انستاباي";

  return (
    <Modal open={true} onClose={onClose} title="🖨️ طباعة إيصال كافيه حراري (Thermal POS)" size="sm">
      <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center", direction: "rtl" }}>
        
        {/* Paper Width Selector */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "rgba(255, 255, 255, 0.05)",
          padding: "6px 12px",
          borderRadius: 12,
          border: "1px solid rgba(255, 255, 255, 0.1)",
          width: "100%",
          justifyContent: "space-between"
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8" }}>حجم بكرة الورق:</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setPaperWidth("80mm")}
              style={{
                padding: "5px 12px",
                borderRadius: 8,
                fontSize: 11.5,
                fontWeight: 800,
                cursor: "pointer",
                border: "none",
                background: paperWidth === "80mm" ? "#0284c7" : "rgba(255,255,255,0.06)",
                color: "#ffffff"
              }}
            >
              80 مم (قياسي)
            </button>
            <button
              type="button"
              onClick={() => setPaperWidth("58mm")}
              style={{
                padding: "5px 12px",
                borderRadius: 8,
                fontSize: 11.5,
                fontWeight: 800,
                cursor: "pointer",
                border: "none",
                background: paperWidth === "58mm" ? "#0284c7" : "rgba(255,255,255,0.06)",
                color: "#ffffff"
              }}
            >
              58 مم (صغير)
            </button>
          </div>
        </div>

        {/* Receipt Simulation Preview */}
        <div style={{
          width: "100%",
          maxWidth: paperWidth === "58mm" ? 240 : 310,
          background: "#ffffff",
          color: "#000000",
          padding: "16px 14px",
          borderRadius: 8,
          fontFamily: "monospace",
          fontSize: paperWidth === "58mm" ? 10.5 : 12,
          lineHeight: 1.4,
          border: "2px dashed #64748b",
          boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
          transition: "max-width 0.2s ease"
        }}>
          <div style={{ textAlign: "center", borderBottom: "1px dashed #000", paddingBottom: 8, marginBottom: 8 }}>
            <h3 style={{ fontSize: paperWidth === "58mm" ? 14 : 16, fontWeight: 900, margin: 0, color: "#000" }}>{orgName}</h3>
            <p style={{ fontSize: 10, margin: "2px 0 0", color: "#444" }}>☕ TFG | CAFE</p>
            <p style={{ fontSize: 9.5, margin: "2px 0 0", color: "#666" }}>{formatDateTime(new Date())}</p>
            <p style={{ fontSize: 10, margin: "2px 0 0", fontWeight: 800 }}>{'رقم الطلب: #' + (sale.id || Date.now().toString().slice(-4))}</p>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, fontWeight: 800, borderBottom: "1px solid #ddd", paddingBottom: 4 }}>
              <span>الصنف</span><span>الكمية x السعر</span><span>الإجمالي</span>
            </div>
            {(sale.items || []).map((itm, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 10.5 }}>
                <span style={{ fontWeight: 600 }}>{itm.name}</span>
                <span>{itm.qty} x {itm.unitPrice}</span>
                <span style={{ fontWeight: 800 }}>{(itm.qty * itm.unitPrice).toFixed(1)} ج.م</span>
              </div>
            ))}
          </div>

          <div style={{ borderTop: "1px dashed #000", paddingTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 900 }}>
              <span>المجموع الكلي:</span><span>{formatCurrency(sale.total)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "#444" }}>
              <span>طريقة الدفع:</span>
              <span style={{ fontWeight: 700 }}>{payMethodLabel}</span>
            </div>
            {sale.buyerName && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "#444" }}>
                <span>الزبون:</span><span>{sale.buyerName}</span>
              </div>
            )}
          </div>

          <div style={{ textAlign: "center", borderTop: "1px dashed #000", paddingTop: 6, marginTop: 8, fontSize: 9.5, color: "#444" }}>
            شكراً لزيارتكم ونتمنى لكم يوماً سعيداً!
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 10, width: "100%", justifyContent: "space-between", marginTop: 4 }}>
          <Button type="button" variant="ghost" onClick={onClose}>
            إغلاق
          </Button>

          <div style={{ display: "flex", gap: 8 }}>
            <Button
              type="button"
              variant="primary"
              onClick={() => handlePrint("80mm")}
              style={{
                background: "linear-gradient(135deg, #0284c7, #0ea5e9)",
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                gap: 6
              }}
            >
              <Printer size={15} />
              <span>طباعة حراري 80mm</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handlePrint("58mm")}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                color: "#ffffff",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 6
              }}
            >
              <Printer size={14} />
              <span>58mm</span>
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
