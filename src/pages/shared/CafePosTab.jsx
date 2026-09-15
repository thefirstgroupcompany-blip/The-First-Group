import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  getActiveCafeShift, openCafeShift, closeCafeShift,
  addCafeSale, addCafeExpense, getInventory, addCafeCashDrop, addInventoryItem,
  watchPendingCafeOrders, updateCafeOrderStatus, fulfillCafeOrder, getEmployees,
  addEmployee, cancelCafeOrderWithRefund, chargeClientWallet, topUpClientWallet, getClients,
  verifyAndConsumeClientWalletOtp, generateClientWalletOtp
} from '../../services/db';
import { Card, StatCard, EmptyState, Button, Input, Select, Modal, Badge } from '../../components/ui';
import { formatCurrency, formatDateTime, formatTime } from '../../utils/constants';
import CafeShiftDetailModal from '../../components/CafeShiftDetailModal';
import CafeReceiptModal from '../../components/CafeReceiptModal';
import CafeWasteModal from '../../components/CafeWasteModal';
import MenuQrModal from '../../components/MenuQrModal';
import WalletOtpModal from '../../components/WalletOtpModal';
import { getDrinkImage, getDrinkFallbackEmoji } from '../../utils/drinkImages';
import { playCafeOrderChime } from '../../utils/audioAlert';
import { useAuth } from '../../contexts/AuthContext';
import {
  Coffee, QrCode, Plus, ArrowDownToLine, Trash2, ArrowDownCircle,
  Lock, PlayCircle, ShoppingCart, BellRing, Bell, History,
  CheckCircle2, User, MapPin, Receipt, Eye, Info, Sparkles, Clock,
  Wallet, CreditCard, Banknote, Zap, ShieldCheck, TrendingUp
} from 'lucide-react';

export default function CafePosTab({ initialSubTab = 'pos' } = {}) {
  const { user } = useAuth();
  const [activeShift, setActiveShift] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [activeSubTab, setActiveSubTab] = useState(initialSubTab);
  const [qrModalOpen, setQrModalOpen] = useState(false);

  // Live incoming cafe orders state
  const [pendingOrders, setPendingOrders] = useState([]);
  const [fulfillingOrderId, setFulfillingOrderId] = useState(null);
  const [cancellingOrderId, setCancellingOrderId] = useState(null);
  const prevOrdersCountRef = useRef(0);

  const [cart, setCart] = useState([]);
  const [discountAmount, setDiscountAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [buyerName, setBuyerName] = useState('');
  const [saleLoading, setSaleLoading] = useState(false);
  const [clients, setClients] = useState([]);
  const [walletSearch, setWalletSearch] = useState('');
  const [selectedWalletClient, setSelectedWalletClient] = useState(null);
  const [walletOtpInput, setWalletOtpInput] = useState('');
  const [otpInputError, setOtpInputError] = useState('');
  const [walletOtpModalOpen, setWalletOtpModalOpen] = useState(false);
  const [walletOtpSubmitting, setWalletOtpSubmitting] = useState(false);

  const [posSearch, setPosSearch] = useState('');
  const [posCategory, setPosCategory] = useState('all');

  const [openModal, setOpenModal] = useState(false);
  const [openingDrawer, setOpeningDrawer] = useState('0');
  const [selectedBaristaId, setSelectedBaristaId] = useState('');
  const [baristaNameInput, setBaristaNameInput] = useState(user?.name || 'باريستا الكافيه');

  // Quick Barista Creation Modal
  const [quickBaristaModal, setQuickBaristaModal] = useState(false);
  const [quickBaristaForm, setQuickBaristaForm] = useState({
    name: '',
    memberId: '',
    phone: '',
    salary: '3000',
    salaryType: 'fixed_monthly',
    password: '123'
  });
  const [quickBaristaLoading, setQuickBaristaLoading] = useState(false);
  const [quickBaristaError, setQuickBaristaError] = useState('');

  const [closeModal, setCloseModal] = useState(false);
  const [actualClosingCount, setActualClosingCount] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [closeLoading, setCloseLoading] = useState(false);

  const [expModal, setExpModal] = useState(false);
  const [expForm, setExpForm] = useState({ label: '', amount: '', category: 'سكر وحليب وثلج' });
  const [expLoading, setExpLoading] = useState(false);

  const [viewShift, setViewShift] = useState(null);
  const [lastSaleReceipt, setLastSaleReceipt] = useState(null);
  const [wasteModalOpen, setWasteModalOpen] = useState(false);
  const [cashDropModal, setCashDropModal] = useState(false);
  const [cashDropAmount, setCashDropAmount] = useState('');
  const [cashDropNotes, setCashDropNotes] = useState('');
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [newItemForm, setNewItemForm] = useState({ name: '', category: 'مشروبات وبن', quantity: '50', minQuantityAlert: '5', unitPrice: '20', costPrice: '10', unit: 'كوب' });

  useEffect(() => {
    const unsubA = getActiveCafeShift(setActiveShift);
    const unsubI = getInventory(setInventory);
    const unsubE = getEmployees(setEmployees);
    const unsubC = getClients(setClients);
    const unsubOrders = watchPendingCafeOrders((orders) => {
      if (orders.length > prevOrdersCountRef.current) {
        playCafeOrderChime();
      }
      prevOrdersCountRef.current = orders.length;
      setPendingOrders(orders);
    });

    return () => {
      unsubA();
      unsubI();
      unsubE();
      unsubC();
      unsubOrders();
    };
  }, []);

  const categories = useMemo(() => {
    const cats = new Set(inventory.map(i => i.category || 'مشروبات'));
    return ['all', ...Array.from(cats)];
  }, [inventory]);

  const filteredItems = useMemo(() => {
    return inventory.filter(item => {
      const matchCat = posCategory === 'all' || (item.category || 'مشروبات') === posCategory;
      const q = posSearch.trim().toLowerCase();
      const matchSearch = !q || (item.name || '').toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [inventory, posCategory, posSearch]);

  const rawCartTotal = useMemo(() => {
    return cart.reduce((s, item) => s + (item.unitPrice * item.qty), 0);
  }, [cart]);

  const finalCartTotal = useMemo(() => {
    const disc = Number(discountAmount) || 0;
    return Math.max(0, rawCartTotal - disc);
  }, [rawCartTotal, discountAmount]);

  const addToCart = (item) => {
    const existing = cart.find(c => c.itemId === item.id);
    if (existing) {
      setCart(cart.map(c => c.itemId === item.id ? { ...c, qty: c.qty + 1 } : c));
    } else {
      setCart([...cart, {
        itemId: item.id,
        name: item.name,
        unitPrice: Number(item.unitPrice) || Number(item.costPrice) || 15,
        costPrice: Number(item.costPrice) || 0,
        qty: 1
      }]);
    }
  };

  const updateCartQty = (itemId, delta) => {
    setCart(cart.map(c => {
      if (c.itemId === itemId) {
        const newQ = c.qty + delta;
        return newQ > 0 ? { ...c, qty: newQ } : null;
      }
      return c;
    }).filter(Boolean));
  };

  const handleAddNewItem = async (e) => {
    e.preventDefault();
    if (!newItemForm.name.trim()) return;
    try {
      await addInventoryItem(newItemForm);
      setAddItemModalOpen(false);
      setNewItemForm({ name: '', category: 'مشروبات وبن', quantity: '50', minQuantityAlert: '5', unitPrice: '20', costPrice: '10', unit: 'كوب' });
      alert('✅ تم إضافة المشروب بنجاح وسيظهر فوراً في الكاشير والمنيو!');
    } catch (err) {
      alert('حدث خطأ أثناء الإضافة: ' + err.message);
    }
  };

  const handleCashDrop = async (e) => {
    e.preventDefault();
    if (!activeShift || !cashDropAmount) return;
    try {
      await addCafeCashDrop(activeShift.id, cashDropAmount, cashDropNotes, user?.name || 'كاشير الكافيه');
      setCashDropModal(false);
      setCashDropAmount('');
      setCashDropNotes('');
      alert('✅ تم توريد النقدية للإدارة بنجاح وخصمها من الدرج!');
    } catch (err) {
      alert('حدث خطأ: ' + err.message);
    }
  };

  const handleFulfillOrder = async (order) => {
    if (!activeShift) {
      alert('⚠️ يرجى فتح وردية كافيه أولاً ليتم قيد مبيعات الطلب وترحيلها في الدرج والمناوبة الحالية تلقائياً!');
      setBaristaNameInput(user?.name || 'باريستا الكافيه');
      setOpenModal(true);
      return;
    }

    setFulfillingOrderId(order.id);
    try {
      await fulfillCafeOrder(order.id, order, activeShift.id, user?.name || activeShift.baristaName || 'باريستا الكافيه');
      alert(`✅ تم تسليم وإتمام الطلب #${order.orderCode} وترحيل مبلغ ${formatCurrency(order.totalPrice)} للمناوبة وخصم الأصناف من المخزون بنجاح!`);
    } catch (err) {
      alert('حدث خطأ أثناء إتمام الطلب: ' + err.message);
    } finally {
      setFulfillingOrderId(null);
    }
  };

  const handleSetPreparing = async (orderId) => {
    try {
      await updateCafeOrderStatus(orderId, 'preparing');
    } catch (err) {
      alert('حدث خطأ: ' + err.message);
    }
  };

  const handleCancelOrder = async (order) => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في إلغاء واعتذار الطلب #${order.orderCode || order.id.slice(-6)}؟`)) return;
    setCancellingOrderId(order.id);
    try {
      const res = await cancelCafeOrderWithRefund({
        orderId: order.id,
        cancelledBy: user?.name || 'كاشير الكافيه',
        cancelReason: 'إلغاء واعتذار من شاشة الكافيه'
      });
      if (res.refunded) {
        alert(`تم إلغاء الطلب #${order.orderCode || order.id.slice(-6)} بنجاح، وتم استرداد ${formatCurrency(res.orderTotal)} فورياً إلى محفظة العميل (${res.clientName})`);
      } else {
        alert(`تم إلغاء الطلب #${order.orderCode || order.id.slice(-6)} بنجاح`);
      }
    } catch (err) {
      alert('حدث خطأ أثناء الإلغاء: ' + err.message);
    } finally {
      setCancellingOrderId(null);
    }
  };

  const handleCheckout = async () => {
    if (saleLoading) return;
    if (cart.length === 0) return alert('يرجى اختيار أصناف المشروبات أولاً');
    if (!activeShift) return alert('يرجى فتح وردية كافيه أولاً');

    const isWallet = paymentMethod === 'wallet_credit';

    if (isWallet) {
      if (!selectedWalletClient) {
        return alert('يرجى اختيار المشترك صاحب المحفظة الرقمية أولاً لإتمام الخصم المالي من حسابه.');
      }
      const clientBal = Number(selectedWalletClient.walletBalance) || 0;
      if (clientBal < finalCartTotal) {
        return alert(`عذراً، رصيد محفظة المشترك (${selectedWalletClient.name}) لا يكفي.\nالرصيد المتاح: ${formatCurrency(clientBal)}\nوالمطلوب: ${formatCurrency(finalCartTotal)}`);
      }
      if (!walletOtpInput || walletOtpInput.trim().length !== 4) {
        setOtpInputError('يرجى إدخال كود الأمان المؤقت (4 أرقام) من هاتف العميل أولاً');
        return;
      }
      await handleWalletOtpConfirm(walletOtpInput.trim());
      return;
    }

    setSaleLoading(true);
    try {
      const cleanBuyer = buyerName.trim();
      const completedSale = await addCafeSale(activeShift.id, {
        items: cart,
        total: finalCartTotal,
        discount: Number(discountAmount) || 0,
        paymentMethod,
        paidWithWallet: false,
        clientId: null,
        walletTxId: null,
        buyerName: cleanBuyer || 'زبون كافيه'
      });

      setCart([]);
      setBuyerName('');
      setSelectedWalletClient(null);
      setWalletSearch('');
      setWalletOtpInput('');
      setOtpInputError('');
      setDiscountAmount('0');
      setLastSaleReceipt(completedSale);
    } catch (err) {
      alert('حدث خطأ: ' + err.message);
    } finally {
      setSaleLoading(false);
    }
  };

  const handleWalletOtpConfirm = async (otpCode) => {
    if (!selectedWalletClient || !activeShift) return;
    setSaleLoading(true);
    setWalletOtpSubmitting(true);
    setOtpInputError('');
    let walletTxId = null;
    try {
      const chargeRes = await verifyAndConsumeClientWalletOtp({
        clientId: selectedWalletClient.id,
        inputOtp: otpCode,
        amount: finalCartTotal,
        description: `مبيعات كافيه بالصالة (${cart.map(c => c.name).join('، ')})`,
        source: 'cafe_pos',
        actorName: user?.name || baristaNameInput || 'كاشير الكافيه'
      });
      walletTxId = chargeRes.id;

      const cleanBuyer = selectedWalletClient.name.trim();
      const completedSale = await addCafeSale(activeShift.id, {
        items: cart,
        total: finalCartTotal,
        discount: Number(discountAmount) || 0,
        paymentMethod: 'wallet_credit',
        paidWithWallet: true,
        clientId: selectedWalletClient.id,
        walletTxId,
        buyerName: `${cleanBuyer} [مدفوع بالمحفظة (OTP)]`
      });

      setCart([]);
      setBuyerName('');
      setSelectedWalletClient(null);
      setWalletSearch('');
      setWalletOtpInput('');
      setOtpInputError('');
      setDiscountAmount('0');
      setLastSaleReceipt(completedSale);
      setWalletOtpModalOpen(false);
    } catch (err) {
      // Compensating transaction: rollback wallet charge if recording sale fails
      if (walletTxId && selectedWalletClient?.id) {
        try {
          await topUpClientWallet({
            clientId: selectedWalletClient.id,
            amount: finalCartTotal,
            bonusAmount: 0,
            paymentMethod: 'wallet_refund',
            notes: 'استرداد تلقائي لفشل تسجيل عملية بيع الكافيه',
            actorName: 'النظام (استرداد آلي)',
            skipPaymentRecord: true,
            type: 'refund'
          });
        } catch (rbErr) {
          console.error('Critical rollback error in CafePosTab:', rbErr);
        }
      }
      setOtpInputError(err.message || 'كود الأمان المؤقت غير صحيح');
      throw err;
    } finally {
      setSaleLoading(false);
      setWalletOtpSubmitting(false);
    }
  };

  const [sendingOtpPrompt, setSendingOtpPrompt] = useState(false);

  const handleSelectWalletClient = async (client) => {
    setSelectedWalletClient(client);
    setBuyerName(client.name);
    setWalletSearch('');
    setWalletOtpInput('');
    setOtpInputError('');
    setSendingOtpPrompt(true);
    try {
      await generateClientWalletOtp(client.id, finalCartTotal, user?.name || baristaNameInput || 'كاشير الكافيه');
    } catch (err) {
      console.error('Failed to auto-generate OTP on selection:', err);
    } finally {
      setSendingOtpPrompt(false);
    }
  };

  const retriggerClientOtp = async () => {
    if (!selectedWalletClient?.id || sendingOtpPrompt) return;
    setSendingOtpPrompt(true);
    setOtpInputError('');
    try {
      await generateClientWalletOtp(selectedWalletClient.id, finalCartTotal, user?.name || baristaNameInput || 'كاشير الكافيه');
    } catch (err) {
      setOtpInputError('تعذر إرسال الكود: ' + err.message);
    } finally {
      setSendingOtpPrompt(false);
    }
  };

  // Auto-select barista from employees if available
  useEffect(() => {
    if (employees.length > 0 && !selectedBaristaId) {
      const match = employees.find(e => e.name === user?.name || e.id === user?.id)
        || employees.find(e => e.jobTitle?.includes('باريستا'))
        || employees[0];
      if (match) {
        setSelectedBaristaId(match.id);
        setBaristaNameInput(match.name);
      }
    }
  }, [employees, user, selectedBaristaId]);

  const openAddQuickBarista = () => {
    const baristaCount = employees.filter(e => e.jobTitle?.includes('باريستا')).length + 1;
    setQuickBaristaForm({
      name: '',
      memberId: `BAR${String(baristaCount).padStart(2, '0')}`,
      phone: '',
      salary: '3000',
      salaryType: 'fixed_monthly',
      password: '123'
    });
    setQuickBaristaError('');
    setQuickBaristaModal(true);
  };

  const handleSaveQuickBarista = async (e) => {
    e.preventDefault();
    setQuickBaristaError('');
    if (!quickBaristaForm.name.trim()) return setQuickBaristaError('يرجى إدخال اسم الباريستا');
    if (!quickBaristaForm.memberId.trim()) return setQuickBaristaError('رقم العضوية مطلوب');
    if (!quickBaristaForm.password.trim()) return setQuickBaristaError('كلمة المرور مطلوبة');

    setQuickBaristaLoading(true);
    try {
      const newEmp = await addEmployee({
        name: quickBaristaForm.name.trim(),
        memberId: quickBaristaForm.memberId.trim(),
        role: 'staff',
        jobTitle: 'باريستا كافيه ☕',
        phone: quickBaristaForm.phone.trim(),
        salary: Number(quickBaristaForm.salary) || 0,
        salaryType: quickBaristaForm.salaryType || 'fixed_monthly',
        password: quickBaristaForm.password.trim()
      });
      setQuickBaristaModal(false);
      if (newEmp && newEmp.id) {
        setSelectedBaristaId(newEmp.id);
        setBaristaNameInput(newEmp.name);
      } else {
        setBaristaNameInput(quickBaristaForm.name.trim());
      }
      alert(`✅ تم إضافة الباريستا "${quickBaristaForm.name}" بنجاح إلى فريق الموظفين وتحديده للوردية!`);
    } catch (err) {
      setQuickBaristaError('حدث خطأ أثناء الإضافة: ' + err.message);
    } finally {
      setQuickBaristaLoading(false);
    }
  };

  const handleOpenShift = async (e) => {
    e.preventDefault();
    try {
      const selectedEmp = employees.find(emp => emp.id === selectedBaristaId);
      const baristaName = selectedEmp ? selectedEmp.name : (baristaNameInput.trim() || user?.name || 'باريستا الكافيه');
      const baristaId = selectedEmp ? selectedEmp.id : (user?.id || 'STAFF');

      await openCafeShift({
        openingDrawer: Number(openingDrawer) || 0,
        baristaName,
        baristaId
      });
      setOpenModal(false);
    } catch (err) {
      alert('حدث خطأ أثناء فتح الوردية: ' + err.message);
    }
  };

  const handleCloseShift = async (e) => {
    e.preventDefault();
    if (closeLoading || !activeShift) return;
    setCloseLoading(true);
    try {
      await closeCafeShift(activeShift.id, {
        actualCount: Number(actualClosingCount) || 0,
        notes: closeNotes,
        closedBy: user?.name || 'كاشير الكافيه'
      });
      setCloseModal(false);
      alert('🎉 تم إغلاق وتصفية وردية الكافيه وحساب الأرباح بنجاح!');
    } catch (err) {
      alert('حدث خطأ أثناء إغلاق وردية الكافيه: ' + (err.message || err));
    } finally {
      setCloseLoading(false);
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (expLoading || !activeShift || !expForm.amount) return;
    setExpLoading(true);
    try {
      await addCafeExpense(activeShift.id, expForm);
      setExpModal(false);
      setExpForm({ label: '', amount: '', category: 'سكر وحليب وثلج' });
      alert('✅ تم قيد مصروف الكافيه بنجاح!');
    } catch (err) {
      alert('حدث خطأ أثناء قيد المصروف: ' + (err.message || err));
    } finally {
      setExpLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: 18, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Coffee size={22} color="var(--accent)" /> TFG | CAFE (نقطة البيع والطلبات)
          </h2>
          <p style={{ color: '#93c5fd', fontSize: 13, margin: '4px 0 0' }}>
            نقطة بيع سريعة للمشروبات والضيافة واستلام الطلبات والتحصيل بالوردية النشطة
          </p>
        </div>

        <div className="cafe-action-bar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="sm" onClick={() => setQrModalOpen(true)} style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)', color: '#fff', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
            <QrCode size={15} /> طباعة ستاند QR للمنيو
          </Button>
          <Button size="sm" onClick={() => setAddItemModalOpen(true)} style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> إضافة مشروب / صنف
          </Button>
          {activeShift ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setCashDropModal(true)} style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ArrowDownToLine size={15} /> سحب وتوريد نقدي للإدارة
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setWasteModalOpen(true)} style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fcd34d', border: '1px solid rgba(245, 158, 11, 0.3)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Trash2 size={15} /> تسجيل هالك
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setExpModal(true)} style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ArrowDownCircle size={15} /> تسجيل مصروف كافيه
              </Button>
              <Button size="sm" variant="danger" onClick={() => { setActualClosingCount(String(activeShift.drawerCash || 0)); setCloseModal(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Lock size={15} /> إغلاق وتصفية وردية TFG | CAFE
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* Live Active Shift Financial Status & Audit Bar */}
      {activeShift ? (
        <div style={{
          background: 'linear-gradient(135deg, rgba(15, 32, 64, 0.95) 0%, rgba(13, 27, 54, 0.98) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          borderRadius: 16, padding: '14px 18px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8'
              }}>
                <Coffee size={20} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <strong style={{ color: '#ffffff', fontSize: 14 }}>
                    وردية جارية: {activeShift.baristaName || 'كاشير الكافيه'}
                  </strong>
                  <Badge color="green">مباشر 🟢</Badge>
                </div>
                <span style={{ color: '#93c5fd', fontSize: 11 }}>
                  بدأت: {activeShift.openedAt ? formatTime(activeShift.openedAt) : '—'}
                </span>
              </div>
            </div>

            <div style={{ height: 28, width: 1, background: 'rgba(255,255,255,0.1)' }} className="hide-mobile" />

            {/* Quick Live Stats Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
              {/* Cash in Drawer */}
              <div style={{
                background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.35)',
                borderRadius: 8, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5
              }}>
                <span style={{ color: '#a7f3d0' }}>💵 كاش الدرج:</span>
                <strong style={{ color: '#34d399', fontWeight: 900 }}>
                  {formatCurrency(activeShift.drawerCash || 0)}
                </strong>
              </div>

              {/* Digital Wallet Sales */}
              <div style={{
                background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.35)',
                borderRadius: 8, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5
              }}>
                <span style={{ color: '#e9d5ff' }}>💳 محفظة رقمية:</span>
                <strong style={{ color: '#c084fc', fontWeight: 900 }}>
                  {formatCurrency(activeShift.walletSales || (activeShift.sales || []).filter(s => (s.paymentMethod === 'wallet_credit' || s.paidWithWallet || (s.buyerName && s.buyerName.includes('محفظة')))).reduce((a, b) => a + (Number(b.total) || 0), 0))}
                </strong>
              </div>

              {/* Total Sales */}
              <div style={{
                background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: 8, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5
              }}>
                <span style={{ color: '#bfdbfe' }}>إجمالي المبيعات:</span>
                <strong style={{ color: '#38bdf8', fontWeight: 900 }}>
                  {formatCurrency(activeShift.totalSales || 0)}
                </strong>
              </div>

              {/* Expenses */}
              {(Number(activeShift.totalExpenses) || 0) > 0 && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 8, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5
                }}>
                  <span style={{ color: '#fca5a5' }}>المصروفات:</span>
                  <strong style={{ color: '#f87171', fontWeight: 900 }}>
                    -{formatCurrency(activeShift.totalExpenses || 0)}
                  </strong>
                </div>
              )}
            </div>
          </div>

          {/* Quick Shift Details Button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setViewShift(activeShift)}
            style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.25))',
              border: '1px solid rgba(245, 158, 11, 0.5)',
              color: '#fcd34d', fontWeight: 800,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.2)'
            }}
          >
            <Receipt size={14} />
            <span>كشف تفصيلي لمبيعات الوردية (مين دفع كاش ومحفظة)</span>
          </Button>
        </div>
      ) : (
        <div style={{
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(220, 38, 38, 0.08) 100%)',
          border: '1.5px solid rgba(239, 68, 68, 0.4)',
          borderRadius: 16, padding: '14px 18px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
          boxShadow: '0 4px 20px rgba(239, 68, 68, 0.15)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="pulse-dot pulse-dot-red" style={{ width: 10, height: 10 }} />
            <div>
              <div style={{ color: '#f87171', fontWeight: 800, fontSize: 14 }}>
                🔴 وردية الكافيه مغلقة حالياً
              </div>
              <div style={{ color: '#cbd5e1', fontSize: 12, marginTop: 2 }}>
                لبدء استلام الطلبات وتسجيل مبيعات المنيو والتحصيل في الدرج، يرجى فتح وردية جديدة للباريستا.
              </div>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => { setBaristaNameInput(user?.name || 'باريستا الكافيه'); setOpenModal(true); }}
            style={{
              background: 'linear-gradient(135deg, #059669, #10b981)',
              color: '#fff', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 10px rgba(16, 185, 129, 0.3)'
            }}
          >
            <PlayCircle size={16} /> فتح وردية TFG | CAFE جديدة
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {[
          { id: 'pos', label: 'كاشير TFG | CAFE (POS)', icon: ShoppingCart },
          { id: 'live_orders', label: 'طلبات المنيو الحية', icon: BellRing, count: pendingOrders.length }
        ].map(t => {
          const TabIcon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveSubTab(t.id)}
              style={{
                padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                background: activeSubTab === t.id
                  ? (t.id === 'live_orders' && t.count > 0 ? 'linear-gradient(135deg, #dc2626, #ef4444)' : 'linear-gradient(135deg, #1d4ed8, #3b82f6)')
                  : 'rgba(255, 255, 255, 0.05)',
                color: activeSubTab === t.id ? '#ffffff' : (t.id === 'live_orders' && t.count > 0 ? '#f87171' : '#94a3b8'),
                display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap'
              }}
            >
              <TabIcon size={16} />
              <span>{t.label}</span>
              {t.count > 0 && (
                <span style={{
                  background: activeSubTab === t.id ? '#ffffff' : '#ef4444',
                  color: activeSubTab === t.id ? '#b91c1c' : '#ffffff',
                  fontSize: 11, fontWeight: 900,
                  padding: '2px 8px', borderRadius: 12,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
                }}>
                  {t.count} جديد
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Urgent Alert Banner on POS Screen if there are pending orders */}
      {activeSubTab === 'pos' && pendingOrders.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.25), rgba(185, 28, 28, 0.35))',
          border: '1.5px solid #ef4444',
          borderRadius: 16,
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          boxShadow: '0 4px 20px rgba(239, 68, 68, 0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 26, animation: 'bounce 1s infinite' }}>🛎️</span>
            <div>
              <h4 style={{ margin: 0, color: '#ffffff', fontSize: 15, fontWeight: 900 }}>
                لديك ({pendingOrders.length}) طلبات جديدة واردة من المنيو الإلكتروني في الانتظار!
              </h4>
              <p style={{ margin: '3px 0 0', color: '#fecaca', fontSize: 12 }}>
                أحدث طلب: {pendingOrders[0]?.customerName} • {pendingOrders[0]?.tableNumber} ({formatCurrency(pendingOrders[0]?.totalPrice)})
              </p>
            </div>
          </div>

          <Button
            size="sm"
            onClick={() => setActiveSubTab('live_orders')}
            style={{
              background: 'linear-gradient(135deg, #dc2626, #ef4444)',
              color: '#fff', fontWeight: 900, fontSize: 13,
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)'
            }}
          >
            عرض وإتمام الطلبات ({pendingOrders.length}) 👈
          </Button>
        </div>
      )}

      {activeSubTab === 'pos' && (
        <div
          className="cafe-pos-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 400px',
            gap: 20,
            alignItems: 'start'
          }}
        >
          {/* Left / Main Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 800, margin: 0 }}>📋 قائمة الأصناف</h3>
              <input
                placeholder="🔍 بحث سريع عن صنف..."
                value={posSearch}
                onChange={e => setPosSearch(e.target.value)}
                style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '6px 12px', color: '#fff', fontSize: 12, outline: 'none', minWidth: 180
                }}
              />
            </div>

            {/* Category Pills */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setPosCategory(cat)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                    background: posCategory === cat ? 'linear-gradient(135deg, #d97706, #f59e0b)' : 'var(--bg-surface)',
                    color: posCategory === cat ? '#ffffff' : '#94a3b8'
                  }}
                >
                  {cat === 'all' ? 'الكل' : cat}
                </button>
              ))}
            </div>

            {/* Items Grid */}
            {filteredItems.length === 0 ? (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '36px 20px', textAlign: 'center' }}>
                <Coffee size={40} color="var(--accent)" style={{ margin: '0 auto 12px' }} />
                <h3 style={{ color: '#fff', fontSize: 16, margin: '0 0 6px' }}>لا توجد مشروبات أو أصناف مسجلة بعد</h3>
                <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 16px' }}>أضف مشروبات الكافيه (شاي، قهوة، مشروبات باردة، سناكس) لتبدأ بالبيع فوراً.</p>
                <Button size="md" variant="primary" onClick={() => setAddItemModalOpen(true)} style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)', color: '#000', fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={16} /> إضافة أول مشروب للكافيه الآن
                </Button>
              </div>
            ) : (
            <div className="cafe-items-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
              {filteredItems.map(item => {
                const qty = Number(item.quantity) || 0;
                const isOutOfStock = qty <= 0;
                const isLowStock = qty > 0 && qty <= 2;
                return (
                  <button
                    key={item.id}
                    disabled={isOutOfStock}
                    onClick={() => addToCart(item)}
                    style={{
                      background: isOutOfStock ? 'rgba(255,255,255,0.02)' : 'var(--bg-card)',
                      border: isLowStock ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid var(--border)',
                      borderRadius: 14, padding: '12px 10px',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      cursor: isOutOfStock ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                      opacity: isOutOfStock ? 0.4 : 1, textAlign: 'center', position: 'relative'
                    }}
                  >
                    <div style={{
                      width: 48, height: 48,
                      borderRadius: 12,
                      background: 'radial-gradient(circle, rgba(30,58,138,0.35) 0%, rgba(15,23,42,0.75) 100%)',
                      border: '1px solid rgba(59,130,246,0.25)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: 4
                    }}>
                      {getDrinkImage(item) ? (
                        <img
                          src={getDrinkImage(item)}
                          alt={item.name}
                          style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.5))' }}
                        />
                      ) : (
                        <Coffee size={24} color="#f59e0b" />
                      )}
                    </div>
                    <strong style={{ color: '#fff', fontSize: 13, lineHeight: 1.2 }}>{item.name}</strong>
                    <span style={{ color: '#f59e0b', fontSize: 12, fontWeight: 800 }}>{formatCurrency(item.unitPrice || 15)}</span>
                    <span style={{ color: isOutOfStock ? '#f87171' : (isLowStock ? '#fbbf24' : '#94a3b8'), fontSize: 10, fontWeight: isLowStock ? 700 : 400 }}>
                      {isOutOfStock ? 'نفذت الكمية' : (isLowStock ? ('متبقي: ' + qty) : ('متبقي: ' + qty))}
                    </span>
                  </button>
                );
              })}
            </div>
            )}</div>

          {/* Cart & Checkout */}
          <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
              <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Receipt size={17} color="var(--accent)" /> طلب TFG | CAFE الحالي
              </h3>
              {cart.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => { setCart([]); setDiscountAmount('0'); }} style={{ color: '#f87171', fontSize: 11 }}>تفريغ السلة</Button>
              )}
            </div>

            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: '#64748b' }}>
                <ShoppingCart size={32} color="#64748b" style={{ margin: '0 auto' }} />
                <p style={{ fontSize: 13, marginTop: 8 }}>اضغط على المشروب لإضافته للفاتورة</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                {cart.map(c => {
                  const drinkImg = getDrinkImage(c);
                  return (
                    <div key={c.itemId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', padding: '8px 12px', borderRadius: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, flexShrink: 0,
                          borderRadius: 8, background: 'rgba(30,58,138,0.25)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 2
                        }}>
                          {drinkImg ? (
                            <img src={drinkImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          ) : (
                            <span style={{ fontSize: 16 }}>{getDrinkFallbackEmoji(c)}</span>
                          )}
                        </div>
                        <div>
                          <strong style={{ color: '#fff', fontSize: 13 }}>{c.name}</strong>
                          <span style={{ color: '#f59e0b', fontSize: 11, display: 'block' }}>{formatCurrency(c.unitPrice)}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={() => updateCartQty(c.itemId, -1)} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: '#334155', color: '#fff', cursor: 'pointer' }}>-</button>
                        <strong style={{ color: '#fff', fontSize: 13 }}>{c.qty}</strong>
                        <button onClick={() => updateCartQty(c.itemId, 1)} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: '#334155', color: '#fff', cursor: 'pointer' }}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#cbd5e1', fontSize: 13 }}>المجموع قبل الخصم:</span>
                <span style={{ color: '#94a3b8', fontSize: 14, fontWeight: 700 }}>{formatCurrency(rawCartTotal)}</span>
              </div>

              <div style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-end',
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Input
                    label="خصم (ج.م)"
                    type="number"
                    min="0"
                    value={discountAmount}
                    onChange={e => setDiscountAmount(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <span style={{ color: '#93c5fd', fontSize: 11, display: 'block', fontWeight: 700, marginBottom: 2 }}>
                    الصافي بعد الخصم:
                  </span>
                  <strong style={{ color: '#34d399', fontSize: 22, fontWeight: 900, display: 'block' }}>
                    {formatCurrency(finalCartTotal)}
                  </strong>
                </div>
              </div>

              <Input placeholder="اسم المشتري / العميل (اختياري)" value={buyerName} onChange={e => setBuyerName(e.target.value)} />

              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>طريقة الدفع:</label>
                <div className="cafe-payment-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 6 }}>
                  {[
                    { id: 'cash', label: '💵 نقدي (كاش)' },
                    { id: 'wallet_credit', label: '💳 محفظة العضو' },
                    { id: 'instapay', label: '⚡ إنستاباي' },
                    { id: 'visa', label: '💳 فيزا' }
                  ].map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id)}
                      style={{
                        padding: '8px 4px', borderRadius: 8, fontSize: 11.5, fontWeight: 800,
                        border: 'none', cursor: 'pointer',
                        background: paymentMethod === m.id
                          ? (m.id === 'wallet_credit' ? 'linear-gradient(135deg, #7e22ce, #a855f7)' : 'linear-gradient(135deg, #1d4ed8, #3b82f6)')
                          : 'rgba(255, 255, 255, 0.05)',
                        color: paymentMethod === m.id ? '#fff' : '#94a3b8',
                        boxShadow: paymentMethod === m.id ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
                        transition: 'all 0.15s'
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                {paymentMethod === 'wallet_credit' && (
                  <div style={{
                    marginTop: 10,
                    background: 'rgba(126, 34, 206, 0.12)',
                    border: '1.5px solid rgba(168, 85, 247, 0.4)',
                    borderRadius: 12,
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ color: '#d8b4fe', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Wallet size={15} color="#c084fc" /> اختيار المشترك صاحب المحفظة:
                      </label>
                      {selectedWalletClient && (
                        <button
                          type="button"
                          onClick={() => { setSelectedWalletClient(null); setWalletSearch(''); }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#f87171',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          ✕ تغيير العضو
                        </button>
                      )}
                    </div>

                    {!selectedWalletClient ? (
                      <div>
                        <input
                          placeholder="🔍 ابحث برقم العضوية (1001) أو الاسم أو الهاتف..."
                          value={walletSearch}
                          onChange={e => setWalletSearch(e.target.value)}
                          style={{
                            width: '100%',
                            background: 'rgba(0, 0, 0, 0.4)',
                            border: '1px solid rgba(168, 85, 247, 0.4)',
                            borderRadius: 8,
                            padding: '8px 12px',
                            color: '#ffffff',
                            fontSize: 12,
                            outline: 'none'
                          }}
                        />
                        {walletSearch.trim().length > 0 && (
                          <div style={{
                            marginTop: 6,
                            maxHeight: 140,
                            overflowY: 'auto',
                            background: '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: 8,
                            display: 'flex',
                            flexDirection: 'column'
                          }}>
                            {clients
                              .filter(c => {
                                const q = walletSearch.toLowerCase().trim();
                                return (c.name && c.name.toLowerCase().includes(q)) ||
                                       (c.memberId && String(c.memberId).includes(q)) ||
                                       (c.phone && String(c.phone).includes(q));
                              })
                              .slice(0, 8)
                              .map(c => {
                                const bal = Number(c.walletBalance) || 0;
                                const hasEnough = bal >= finalCartTotal;
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => handleSelectWalletClient(c)}
                                    style={{
                                      padding: '8px 10px',
                                      border: 'none',
                                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                                      background: 'transparent',
                                      color: '#ffffff',
                                      textAlign: 'right',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      fontSize: 12
                                    }}
                                  >
                                    <div>
                                      <strong style={{ color: '#ffffff' }}>{c.name}</strong>
                                      <span style={{ color: '#94a3b8', fontSize: 10, marginRight: 6 }}>
                                        (كود: #{c.memberId || '—'})
                                      </span>
                                    </div>
                                    <div style={{ color: hasEnough ? '#34d399' : '#f87171', fontWeight: 800, fontSize: 11 }}>
                                      رصيد: {formatCurrency(bal)}
                                    </div>
                                  </button>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{
                        background: 'rgba(0, 0, 0, 0.35)',
                        borderRadius: 10,
                        padding: '10px 12px',
                        border: '1px solid rgba(168, 85, 247, 0.3)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ color: '#e2e8f0', fontWeight: 800, fontSize: 13 }}>
                            👤 {selectedWalletClient.name} <span style={{ color: '#c084fc', fontSize: 11 }}>(#{selectedWalletClient.memberId || '—'})</span>
                          </span>
                          <span style={{
                            background: (Number(selectedWalletClient.walletBalance) || 0) >= finalCartTotal ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                            color: (Number(selectedWalletClient.walletBalance) || 0) >= finalCartTotal ? '#34d399' : '#f87171',
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 800
                          }}>
                            {(Number(selectedWalletClient.walletBalance) || 0) >= finalCartTotal ? '✓ رصيد كافٍ' : '⚠️ رصيد غير كافٍ'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
                          <span>الرصيد الحالي بالمحفظة:</span>
                          <strong style={{ color: '#ffffff' }}>{formatCurrency(selectedWalletClient.walletBalance || 0)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#c084fc', marginTop: 2 }}>
                          <span>المتبقي بعد إتمام الفاتورة:</span>
                          <strong style={{ color: (Number(selectedWalletClient.walletBalance) || 0) >= finalCartTotal ? '#34d399' : '#f87171' }}>
                            {formatCurrency((Number(selectedWalletClient.walletBalance) || 0) - finalCartTotal)}
                          </strong>
                        </div>
                        {/* Direct 4-Digit OTP Input Field */}
                        <div style={{
                          marginTop: 10,
                          padding: '10px 12px',
                          borderRadius: 10,
                          background: 'rgba(0, 0, 0, 0.45)',
                          border: otpInputError ? '1.5px solid #ef4444' : '1.5px solid rgba(168, 85, 247, 0.5)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ color: '#d8b4fe', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Lock size={14} color="#c084fc" />
                              <span>كود الأمان المؤقت (4 أرقام من هاتف المشترك):</span>
                            </label>
                            <button
                              type="button"
                              onClick={retriggerClientOtp}
                              disabled={sendingOtpPrompt}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#38bdf8',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                            >
                              <span>{sendingOtpPrompt ? 'جارٍ الإرسال...' : '🔄 إعادة إظهار الكود'}</span>
                            </button>
                          </div>

                          <div style={{
                            background: 'rgba(16, 185, 129, 0.12)',
                            border: '1px solid rgba(16, 185, 129, 0.25)',
                            borderRadius: 6,
                            padding: '4px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 11,
                            color: '#34d399',
                            fontWeight: 700
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', display: 'inline-block', boxShadow: '0 0 6px #34d399' }} />
                            <span>يظهر الكود الآن إجبارياً على شاشة هاتف العميل تلقائياً!</span>
                          </div>

                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={4}
                              placeholder="أدخل الـ 4 أرقام..."
                              value={walletOtpInput}
                              onChange={e => {
                                setWalletOtpInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                                setOtpInputError('');
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleCheckout();
                                }
                              }}
                              style={{
                                width: '100%',
                                background: '#0a0f1d',
                                border: otpInputError ? '1.5px solid #ef4444' : '1.5px solid rgba(168, 85, 247, 0.6)',
                                borderRadius: 8,
                                padding: '8px 12px',
                                color: '#ffffff',
                                fontSize: 18,
                                fontWeight: 900,
                                letterSpacing: '6px',
                                textAlign: 'center',
                                outline: 'none',
                                direction: 'ltr'
                              }}
                              autoFocus
                            />
                          </div>
                          {otpInputError ? (
                            <span style={{ color: '#f87171', fontSize: 11, fontWeight: 700 }}>
                              ⚠️ {otpInputError}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: 10.5 }}>
                              اطلب من المشترك قراءة الـ 4 أرقام الظاهرة على شاشة هاتفه الآن واكتبها هنا.
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Button
                variant="success"
                onClick={handleCheckout}
                disabled={saleLoading || cart.length === 0 || !activeShift}
                style={{
                  width: '100%',
                  padding: 12,
                  fontSize: 15,
                  fontWeight: 800,
                  marginTop: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  background: paymentMethod === 'wallet_credit' ? 'linear-gradient(135deg, #7e22ce, #9333ea)' : undefined
                }}
              >
                {!activeShift ? 'افتح وردية TFG | CAFE أولاً للبيع' : (
                  saleLoading ? 'جارٍ التحقق والخصم...' : (
                    paymentMethod === 'wallet_credit'
                      ? <><Lock size={16} /> تأكيد كود الأمان وخصم الفاتورة 🔒</>
                      : <><CheckCircle2 size={16} /> تحصيل الفاتورة وطباعة البون</>
                  )
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* TAB: LIVE INCOMING CAFE ORDERS (KDS) */}
      {activeSubTab === 'live_orders' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Header Controls */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 16, padding: '14px 20px', flexWrap: 'wrap', gap: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: 'linear-gradient(135deg, #dc2626, #ef4444)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)'
              }}>
                <BellRing size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, color: '#ffffff', fontSize: 16, fontWeight: 900 }}>
                  شاشة استقبال طلبات المنيو الحية (Live Kitchen Display)
                </h3>
                <p style={{ margin: '2px 0 0', color: '#94a3b8', fontSize: 12 }}>
                  تصل الطلبات هنا تلقائياً بلحظتها مع رنة تنبيه، وبمجرد إتمام الطلب يُرحل إيراده للمناوبة ويُخصم من المخزون فوراً
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={playCafeOrderChime}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#93c5fd', borderRadius: 10, padding: '7px 14px',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6
                }}
                title="تجربة رنة التنبيه"
              >
                <BellRing size={14} /> تجربة صوت الرنة
              </button>

              <Badge color={pendingOrders.length > 0 ? 'red' : 'green'}>
                {pendingOrders.length > 0 ? `${pendingOrders.length} طلبات قيد الانتظار` : 'لا توجد طلبات معلقة'}
              </Badge>
            </div>
          </div>

          {/* Orders Cards Grid */}
          {pendingOrders.length === 0 ? (
            <Card style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              padding: '50px 20px', textAlign: 'center'
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.12)', border: '2px solid rgba(16, 185, 129, 0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', color: '#10b981'
              }}>
                <CheckCircle2 size={36} color="#10b981" />
              </div>
              <h3 style={{ color: '#ffffff', fontSize: 17, fontWeight: 900, margin: '0 0 6px' }}>
                جميع الطلبات تم إنجازها بنجاح!
              </h3>
              <p style={{ color: '#94a3b8', fontSize: 13, maxWidth: 460, margin: '0 auto 16px', lineHeight: 1.6 }}>
                لا توجد أي طلبات واردة قيد الانتظار حالياً. عندما يطلب أي عميل من صفحة المنيو الإلكتروني أو عبر مسح كود الـ QR، سيظهر طلبه هنا فوراً مع رنة صوتية لتنبيهك.
              </p>
              <Button
                variant="ghost"
                onClick={() => setQrModalOpen(true)}
                style={{ border: '1px solid var(--border)', color: '#f59e0b', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <QrCode size={14} /> عرض وطباعة ستاند QR للمنيو
              </Button>
            </Card>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))',
              gap: 16
            }}>
              {pendingOrders.map(order => {
                const isFulfilling = fulfillingOrderId === order.id;
                const isCancelling = cancellingOrderId === order.id;
                const isPreparing = order.status === 'preparing';

                return (
                  <Card
                    key={order.id}
                    style={{
                      background: 'linear-gradient(180deg, #0d1e38 0%, #081324 100%)',
                      border: isPreparing ? '1.5px solid #f59e0b' : '1.5px solid rgba(59, 130, 246, 0.4)',
                      borderRadius: 18,
                      padding: 18,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 14,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                    }}
                  >
                    <div>
                      {/* Card Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa',
                            fontWeight: 900, fontSize: 13, padding: '3px 8px', borderRadius: 8,
                            border: '1px solid rgba(59, 130, 246, 0.3)'
                          }}>
                            #{order.orderCode || order.id.slice(0, 6)}
                          </span>
                          <span style={{ color: '#94a3b8', fontSize: 11 }}>
                            {order.isoDate ? formatTime(order.isoDate) : 'الآن'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {/* Clear Payment Status Badge in Header */}
                          {order.paidWithWallet ? (
                            <span style={{
                              background: 'linear-gradient(135deg, #059669, #10b981)',
                              color: '#ffffff',
                              fontWeight: 900,
                              fontSize: 11.5,
                              padding: '3px 9px',
                              borderRadius: 8,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              boxShadow: '0 0 12px rgba(16, 185, 129, 0.45)'
                            }}>
                              <CheckCircle2 size={13} color="#ffffff" />
                              <span>مدفوع بالمحفظة ✓</span>
                            </span>
                          ) : (
                            <span style={{
                              background: 'rgba(245, 158, 11, 0.2)',
                              color: '#fcd34d',
                              border: '1px solid rgba(245, 158, 11, 0.45)',
                              fontSize: 11,
                              fontWeight: 900,
                              padding: '3px 8px',
                              borderRadius: 8,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}>
                              <span>💵 كاش عند الاستلام</span>
                            </span>
                          )}

                          <span style={{
                            background: isPreparing ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                            color: isPreparing ? '#fcd34d' : '#fca5a5',
                            border: isPreparing ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
                            fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 8,
                            display: 'flex', alignItems: 'center', gap: 4
                          }}>
                            {isPreparing ? <Clock size={11} /> : <Bell size={11} />}
                            {isPreparing ? 'جاري التجهيز' : 'قيد الانتظار'}
                          </span>
                        </div>
                      </div>

                      {/* Prominent High-Contrast Barista Instruction Banner */}
                      {order.paidWithWallet ? (
                        <div style={{
                          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.22) 0%, rgba(6, 95, 70, 0.38) 100%)',
                          border: '1.5px solid #10b981',
                          borderRadius: 12,
                          padding: '10px 12px',
                          marginBottom: 10,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          boxShadow: '0 4px 14px rgba(16, 185, 129, 0.2)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: 8,
                              background: '#10b981', color: '#ffffff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 900, fontSize: 16, flexShrink: 0
                            }}>
                              ✓
                            </div>
                            <div>
                              <div style={{ color: '#ffffff', fontWeight: 900, fontSize: 13 }}>
                                طلب مدفوع مسبقاً من المحفظة الرقمية
                              </div>
                              <div style={{ color: '#a7f3d0', fontSize: 11, fontWeight: 700 }}>
                                تم خصم {formatCurrency(order.totalPrice || 0)} من حساب العضو ({order.customerName})
                              </div>
                            </div>
                          </div>
                          <div style={{
                            background: '#047857',
                            border: '1px solid #34d399',
                            color: '#ffffff',
                            fontSize: 11.5,
                            fontWeight: 900,
                            padding: '4px 10px',
                            borderRadius: 8,
                            whiteSpace: 'nowrap',
                            flexShrink: 0
                          }}>
                            لا تستلم كاش 🚫
                          </div>
                        </div>
                      ) : (
                        <div style={{
                          background: 'rgba(245, 158, 11, 0.12)',
                          border: '1px solid rgba(245, 158, 11, 0.35)',
                          borderRadius: 10,
                          padding: '8px 12px',
                          marginBottom: 10,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}>
                          <span style={{ color: '#fcd34d', fontSize: 12, fontWeight: 800 }}>
                            💵 استلام نقدي مطلوب عند التسليم:
                          </span>
                          <span style={{ color: '#ffffff', fontSize: 13, fontWeight: 900 }}>
                            استلم {formatCurrency(order.totalPrice || 0)} كاش
                          </span>
                        </div>
                      )}

                      {/* Customer & Table Info */}
                      <div style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: 10, padding: '8px 12px',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginBottom: 12
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <User size={13} color="var(--accent)" />
                          <strong style={{ color: '#ffffff', fontSize: 13 }}>
                            {order.customerName || 'طلب مباشر'}
                          </strong>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <MapPin size={13} color="#f59e0b" />
                          <span style={{ color: '#f59e0b', fontSize: 12, fontWeight: 800 }}>
                            {order.tableNumber || 'بالصالة'}
                          </span>
                        </div>
                      </div>

                      {/* Itemized list with totals */}
                      <div style={{
                        background: 'rgba(0, 0, 0, 0.35)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: 12, padding: '10px 12px',
                        display: 'flex', flexDirection: 'column', gap: 6
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 4 }}>
                          قائمة المشروبات المطلوبة ({order.totalCount || order.items?.length || 1} عناصر):
                        </div>
                        {(order.items || []).map((it, idx) => {
                          const itemQty = Number(it.qty) || 1;
                          const itemPrice = Number(it.unitPrice) || 0;
                          const itemSubtotal = it.subtotal || (itemPrice * itemQty);
                          return (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: idx < order.items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                              <span style={{ color: '#ffffff', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Coffee size={13} color="#f59e0b" /> {it.name} <span style={{ color: '#f59e0b', fontWeight: 900, marginRight: 4 }}>× {itemQty}</span>
                              </span>
                              <span style={{ color: '#34d399', fontWeight: 900, fontSize: 13 }}>
                                = {formatCurrency(itemSubtotal)}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Notes if any */}
                      {order.notes && (
                        <div style={{
                          marginTop: 10,
                          background: 'rgba(245, 158, 11, 0.1)',
                          border: '1px solid rgba(245, 158, 11, 0.25)',
                          borderRadius: 8, padding: '6px 10px',
                          color: '#fde68a', fontSize: 12
                        }}>
                          <strong>ملاحظات:</strong> {order.notes}
                        </div>
                      )}
                    </div>

                    {/* Footer Total and Actions */}
                    <div style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 700, display: 'block' }}>
                            {order.paidWithWallet ? 'حالة الحساب:' : 'إجمالي الحساب المطلوب:'}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 800, color: order.paidWithWallet ? '#34d399' : '#f59e0b' }}>
                            {order.paidWithWallet ? '✓ تم السداد بالمحفظة' : '💵 مطلوب كاش عند الاستلام'}
                          </span>
                        </div>
                        <strong style={{ color: order.paidWithWallet ? '#34d399' : '#10b981', fontSize: 22, fontWeight: 900 }}>
                          {formatCurrency(order.totalPrice || 0)}
                        </strong>
                      </div>

                      {/* Main Fulfillment Button */}
                      <Button
                        variant="success"
                        onClick={() => handleFulfillOrder(order)}
                        disabled={isFulfilling || isCancelling}
                        style={{
                          width: '100%',
                          background: order.paidWithWallet ? 'linear-gradient(135deg, #047857, #10b981)' : 'linear-gradient(135deg, #059669, #10b981)',
                          fontWeight: 900, fontSize: 14, padding: 12,
                          boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                        }}
                      >
                        <CheckCircle2 size={16} />
                        {isFulfilling
                          ? 'جاري ترحيل الطلب...'
                          : order.paidWithWallet
                            ? `تسليم الطلب للعميل (مدفوع بالمحفظة ✓)`
                            : `إتمام الطلب واستلام كاش (${formatCurrency(order.totalPrice)})`}
                      </Button>

                      {/* Sub-actions */}
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                        {!isPreparing && (
                          <button
                            type="button"
                            onClick={() => handleSetPreparing(order.id)}
                            style={{
                              flex: 1, background: 'rgba(245, 158, 11, 0.15)',
                              border: '1px solid rgba(245, 158, 11, 0.3)',
                              color: '#fcd34d', borderRadius: 8, padding: '6px 10px',
                              fontSize: 12, fontWeight: 700, cursor: 'pointer'
                            }}
                          >
                            وضع قيد التجهيز
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleCancelOrder(order)}
                          disabled={isCancelling}
                          style={{
                            background: 'transparent', border: 'none',
                            color: '#ef4444', fontSize: 12, fontWeight: 700,
                            cursor: 'pointer', padding: '6px 10px', marginRight: 'auto'
                          }}
                        >
                          {isCancelling ? 'جاري الإلغاء...' : 'إلغاء / اعتذار'}
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Open Shift Modal with Barista Selection & Quick Add */}
      <Modal open={openModal} onClose={() => setOpenModal(false)} title="فتح وردية TFG | CAFE جديدة">
        <form onSubmit={handleOpenShift} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label className="dark-label" style={{ fontWeight: 700 }}>باريستا الوردية (الموظف المسؤول):</label>
              <button
                type="button"
                onClick={openAddQuickBarista}
                style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  color: '#fcd34d',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                + إضافة باريستا جديد للموظفين
              </button>
            </div>

            {employees.length > 0 ? (
              <Select
                value={selectedBaristaId}
                onChange={e => {
                  const val = e.target.value;
                  setSelectedBaristaId(val);
                  if (val === 'custom') {
                    setBaristaNameInput('');
                  } else {
                    const emp = employees.find(m => m.id === val);
                    if (emp) setBaristaNameInput(emp.name);
                  }
                }}
              >
                <optgroup label="فريق العمل والموظفين (المسجلين في النظام)">
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      [{emp.memberId || 'ID'}] {emp.name} {emp.jobTitle ? `— (${emp.jobTitle})` : ''}
                    </option>
                  ))}
                </optgroup>
                <option value="custom">إدخال اسم باريستا يدوياً...</option>
              </Select>
            ) : null}

            {(employees.length === 0 || selectedBaristaId === 'custom') && (
              <div style={{ marginTop: 8 }}>
                <Input
                  label="اسم الباريستا اليدوي"
                  value={baristaNameInput}
                  onChange={e => setBaristaNameInput(e.target.value)}
                  placeholder="اكتب اسم الباريستا هنا..."
                  required
                />
              </div>
            )}
          </div>

          <Input
            label="عهدة نقدية الدرج الافتتاحية (ج.م)"
            type="number"
            value={openingDrawer}
            onChange={e => setOpeningDrawer(e.target.value)}
            required
          />

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="ghost" onClick={() => setOpenModal(false)}>إلغاء</Button>
            <Button type="submit" variant="primary">تأكيد فتح الوردية</Button>
          </div>
        </form>
      </Modal>

      {/* Quick Add Barista Modal */}
      <Modal open={quickBaristaModal} onClose={() => setQuickBaristaModal(false)} title="إضافة باريستا جديد لفريق الموظفين">
        <form onSubmit={handleSaveQuickBarista} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {quickBaristaError && (
            <div style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
              {quickBaristaError}
            </div>
          )}
          <Input
            label="اسم الباريستا بالكامل *"
            value={quickBaristaForm.name}
            onChange={e => setQuickBaristaForm({ ...quickBaristaForm, name: e.target.value })}
            placeholder="مثال: يوسف محمود"
            required
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Input
              label="رقم العضوية / الكود *"
              value={quickBaristaForm.memberId}
              onChange={e => setQuickBaristaForm({ ...quickBaristaForm, memberId: e.target.value })}
              required
            />
            <Input
              label="رقم الهاتف"
              value={quickBaristaForm.phone}
              onChange={e => setQuickBaristaForm({ ...quickBaristaForm, phone: e.target.value })}
              placeholder="010..."
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Input
              label="الراتب / المستحق (ج.م)"
              type="number"
              value={quickBaristaForm.salary}
              onChange={e => setQuickBaristaForm({ ...quickBaristaForm, salary: e.target.value })}
            />
            <Select
              label="نظام الراتب"
              value={quickBaristaForm.salaryType}
              onChange={e => setQuickBaristaForm({ ...quickBaristaForm, salaryType: e.target.value })}
            >
              <option value="fixed_monthly">شهري ثابت</option>
              <option value="per_shift">بالوردية / الشفت</option>
              <option value="hourly">بالساعة</option>
            </Select>
          </div>
          <Input
            label="كلمة المرور للحساب *"
            type="password"
            value={quickBaristaForm.password}
            onChange={e => setQuickBaristaForm({ ...quickBaristaForm, password: e.target.value })}
            placeholder="لتمكينه من تسجيل الدخول"
            required
          />

          <div style={{ background: 'rgba(59, 130, 246, 0.08)', padding: 10, borderRadius: 8, fontSize: 12, color: '#93c5fd', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Info size={16} /> سيتم تسجيل الباريستا بمسمى <strong>باريستا كافيه</strong> وسيكون له بطاقة موظف، حساب كامل، وتسجيل حضور وانصراف مثل باقي الموظفين تماماً.
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="ghost" onClick={() => setQuickBaristaModal(false)}>إلغاء</Button>
            <Button type="submit" variant="primary" disabled={quickBaristaLoading}>
              {quickBaristaLoading ? 'جاري الإضافة...' : 'حفظ وإضافته للموظفين'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Close Shift Modal */}
      <Modal open={closeModal} onClose={() => setCloseModal(false)} title="إغلاق وتصفية وردية TFG | CAFE">
        <form onSubmit={handleCloseShift} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: 14, borderRadius: 12, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#93c5fd' }}>إجمالي مبيعات الوردية:</span>
              <strong style={{ color: '#38bdf8', fontWeight: 900 }}>{formatCurrency(activeShift?.totalSales || 0)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingRight: 10, fontSize: 12 }}>
              <span style={{ color: '#a7f3d0' }}>• منها مبيعات كاش محصلة بالدرج:</span>
              <strong style={{ color: '#34d399', fontWeight: 800 }}>+{formatCurrency(activeShift?.cashSales || 0)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingRight: 10, fontSize: 12 }}>
              <span style={{ color: '#e9d5ff' }}>• منها مبيعات محفظة إلكترونية (رقمية):</span>
              <strong style={{ color: '#c084fc', fontWeight: 800 }}>{formatCurrency(activeShift?.walletSales || 0)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#fca5a5' }}>إجمالي مصاريف الوردية:</span>
              <strong style={{ color: '#f87171', fontWeight: 800 }}>-{formatCurrency(activeShift?.totalExpenses || 0)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 6, marginTop: 4 }}>
              <span style={{ color: '#fcd34d', fontWeight: 800 }}>النقدية المطلوب تسليمها بالدرج:</span>
              <strong style={{ color: '#fbbf24', fontSize: 16, fontWeight: 900 }}>{formatCurrency(activeShift?.drawerCash || 0)}</strong>
            </div>
          </div>

          <div>
            <label className="dark-label" style={{ fontWeight: 700 }}>النقدية الفعلية المحصورة بالدرج (ج.م):</label>
            <Input
              type="number"
              value={actualClosingCount}
              onChange={e => setActualClosingCount(e.target.value)}
              placeholder="المبلغ الموجود بالدرج فعلياً"
              required
              autoFocus
            />
            {Number(actualClosingCount) !== Number(activeShift?.drawerCash || 0) && (
              <p style={{
                color: Number(actualClosingCount) > Number(activeShift?.drawerCash || 0) ? '#34d399' : '#f87171',
                fontSize: 12, fontWeight: 700, margin: '4px 0 0'
              }}>
                {Number(actualClosingCount) > Number(activeShift?.drawerCash || 0)
                  ? `زيادة بالدرج: +${(Number(actualClosingCount) - Number(activeShift?.drawerCash || 0)).toFixed(2)} ج.م`
                  : `عجز بالدرج: ${(Number(actualClosingCount) - Number(activeShift?.drawerCash || 0)).toFixed(2)} ج.م`}
              </p>
            )}
          </div>

          <div>
            <label className="dark-label" style={{ fontWeight: 700 }}>ملاحظات التقفيل / التوريد:</label>
            <Input
              value={closeNotes}
              onChange={e => setCloseNotes(e.target.value)}
              placeholder="أي ملاحظات حول المشروبات أو الدرج..."
            />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="ghost" onClick={() => setCloseModal(false)}>إلغاء</Button>
            <Button type="submit" variant="danger" disabled={closeLoading}>
              {closeLoading ? 'جاري التصفية...' : 'تأكيد التصفية والتوريد'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Expense Modal */}
      <Modal open={expModal} onClose={() => setExpModal(false)} title="تسجيل مصروف كافيه وبوفيه">
        <form onSubmit={handleAddExpense} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="بيان المصروف" value={expForm.label} onChange={e => setExpForm({ ...expForm, label: e.target.value })} placeholder="مثال: شراء 2 كيلو سكر + علبة شاي" required />
          <Input label="المبلغ (ج.م)" type="number" value={expForm.amount} onChange={e => setExpForm({ ...expForm, amount: e.target.value })} required />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="ghost" onClick={() => setExpModal(false)}>إلغاء</Button>
            <Button type="submit" variant="primary">حفظ وخصم من الدرج</Button>
          </div>
        </form>
      </Modal>

      <CafeShiftDetailModal isOpen={!!viewShift} onClose={() => setViewShift(null)} shift={viewShift} />
      <CafeReceiptModal isOpen={!!lastSaleReceipt} onClose={() => setLastSaleReceipt(null)} sale={lastSaleReceipt} />
      <CafeWasteModal isOpen={wasteModalOpen} onClose={() => setWasteModalOpen(false)} inventory={inventory} baristaName={user?.name} />

      {/* Add New Cafe Item Modal */}
      <Modal open={addItemModalOpen} onClose={() => setAddItemModalOpen(false)} title="إضافة مشروب / صنف جديد للكافيه" size="md">
        <form onSubmit={handleAddNewItem} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input label="اسم المشروب / الصنف" value={newItemForm.name} onChange={e => setNewItemForm({ ...newItemForm, name: e.target.value })} placeholder="مثال: قهوة تركي، شاي، آيس لاتيه..." required />
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>التصنيف:</label>
              <select
                value={newItemForm.category}
                onChange={e => setNewItemForm({ ...newItemForm, category: e.target.value })}
                style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none' }}
              >
                <option value="مشروبات وبن">مشروبات وبن</option>
                <option value="مشروبات باردة">مشروبات باردة</option>
                <option value="سناكس وضيافة">سناكس وضيافة</option>
                <option value="أكواب وأدوات ضيافة">أكواب وأدوات ضيافة</option>
                <option value="أخرى">أخرى</option>
              </select>
            </div>
            <Input label="الوحدة" value={newItemForm.unit} onChange={e => setNewItemForm({ ...newItemForm, unit: e.target.value })} placeholder="كوب / كان / قطعة" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: user?.role === 'admin' ? '1fr 1fr' : '1fr', gap: 10 }}>
            <Input label="سعر البيع للجمهور (ج.م)" type="number" step="any" min="0" value={newItemForm.unitPrice} onChange={e => setNewItemForm({ ...newItemForm, unitPrice: e.target.value })} required />
            {user?.role === 'admin' && (
              <Input label="سعر التكلفة (ج.م)" type="number" step="any" min="0" value={newItemForm.costPrice} onChange={e => setNewItemForm({ ...newItemForm, costPrice: e.target.value })} placeholder="تكلفة الخامات" />
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Input label="الكمية المتوفرة حالياً" type="number" min="0" value={newItemForm.quantity} onChange={e => setNewItemForm({ ...newItemForm, quantity: e.target.value })} required />
            <Input label="حد التنبيه عند النقص" type="number" min="1" value={newItemForm.minQuantityAlert} onChange={e => setNewItemForm({ ...newItemForm, minQuantityAlert: e.target.value })} />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="ghost" onClick={() => setAddItemModalOpen(false)}>إلغاء</Button>
            <Button type="submit" variant="primary" style={{ background: 'linear-gradient(135deg, #059669, #10b981)', fontWeight: 800 }}>حفظ وإضافة الصنف</Button>
          </div>
        </form>
      </Modal>

      {/* Cash Drop Modal */}
      <Modal open={cashDropModal} onClose={() => setCashDropModal(false)} title="💵 سحب وتوريد نقدي جزئي للإدارة (Cash Drop)">
        <form onSubmit={handleCashDrop} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: 12, borderRadius: 10, color: '#93c5fd', fontSize: 13 }}>
            النقدية المتوفرة حالياً بالدرج: <strong>{formatCurrency(activeShift?.drawerCash || 0)}</strong>
          </div>
          <Input label="المبلغ المراد سحبه وتوريده للخزينة (ج.م)" type="number" value={cashDropAmount} onChange={e => setCashDropAmount(e.target.value)} required />
          <Input label="ملاحظات السحب (اختياري)" value={cashDropNotes} onChange={e => setCashDropNotes(e.target.value)} placeholder="مثال: تأمين نقدية فترة الذروة" />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="ghost" onClick={() => setCashDropModal(false)}>إلغاء</Button>
            <Button type="submit" variant="primary">تأكيد السحب وتوريد النقدية</Button>
          </div>
        </form>
      </Modal>

      {/* QR Table Stand Modal */}
      <MenuQrModal isOpen={qrModalOpen} onClose={() => setQrModalOpen(false)} />

      {/* Client Wallet Security OTP Modal */}
      <WalletOtpModal
        isOpen={walletOtpModalOpen}
        onClose={() => setWalletOtpModalOpen(false)}
        client={selectedWalletClient}
        amount={finalCartTotal}
        onConfirm={handleWalletOtpConfirm}
        loading={walletOtpSubmitting}
      />

      <style>{`
        @media (max-width: 1024px) {
          .cafe-pos-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
