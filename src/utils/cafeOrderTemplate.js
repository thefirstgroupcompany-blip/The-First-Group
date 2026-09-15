import { formatCurrency } from './constants';

export const DEFAULT_CAFE_ORDER_TEMPLATE = `مرحباً باريستا {system_name} ☕
أرغب في طلب الضيافة التالي:
━━━━━━━━━━━━━━━━━━
👤 اسم العميل: {name}
🪑 المكان: {table}
━━━━━━━━━━━━━━━━━━
📋 تفاصيل الطلبات ({count} عناصر):
{items}
━━━━━━━━━━━━━━━━━━
💰 إجمالي الحساب: {total}
{notes}
━━━━━━━━━━━━━━━━━━
شكراً جزيلاً وفي انتظار التجهيز! ✨`;

/**
 * Replace placeholders in the cafe WhatsApp order template
 */
export function formatCafeOrderMessage(template, data = {}) {
  const tpl = (template && typeof template === 'string' && template.trim())
    ? template
    : DEFAULT_CAFE_ORDER_TEMPLATE;

  const sysName = data.systemName || 'THE FIRST GROUP';
  const name = data.customerName?.trim() ? data.customerName.trim() : 'طلب مباشر';
  const table = data.tableNumber?.trim() ? data.tableNumber.trim() : 'طلب مباشر / بالصالة';
  const count = String(data.cartTotalQty ?? (data.cartList?.length || 1));
  const total = formatCurrency(data.cartTotalPrice || 0);

  let formattedItems = '';
  if (Array.isArray(data.cartList) && data.cartList.length > 0) {
    formattedItems = data.cartList.map(c => {
      const itemPrice = Number(c.item?.unitPrice) || 0;
      const subtotal = (c.qty || 1) * itemPrice;
      return `• *${c.qty || 1}x* ${c.item?.name || 'مشروب'} (${formatCurrency(subtotal)})`;
    }).join('\n');
  } else if (data.singleItem) {
    formattedItems = `• *1x* ${data.singleItem.name} (${formatCurrency(data.singleItem.unitPrice || 15)})`;
  } else {
    formattedItems = '• *1x* قهوة مضبوط (30 ج.م)';
  }

  const notesText = data.orderNotes?.trim() ? `📝 ملاحظات: ${data.orderNotes.trim()}` : '';

  let message = tpl
    .replace(/\{system_name\}|\{اسم_المكان\}/gi, sysName)
    .replace(/\{name\}|\{اسم_العميل\}|\{الاسم\}/gi, name)
    .replace(/\{table\}|\{المكان\}|\{الطاولة\}|\{table_number\}/gi, table)
    .replace(/\{count\}|\{العدد\}|\{items_count\}/gi, count)
    .replace(/\{total\}|\{الإجمالي\}|\{total_price\}/gi, total)
    .replace(/\{items\}|\{الطلبات\}|\{order_items\}/gi, formattedItems)
    .replace(/\{notes\}|\{الملاحظات\}/gi, notesText);

  message = message.replace(/\n\s*\n\s*\n/g, '\n\n').trim();

  return message;
}
