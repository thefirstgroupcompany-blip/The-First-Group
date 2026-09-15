import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getInventory,
  getSystemInfo,
  createCafeOrder,
  updateCafeOrderStatus,
  getClient,
  clientPortalLogin as clientLogin,
  chargeClientWallet,
  topUpClientWallet,
  cancelCafeOrderWithRefund
} from '../services/db';
import { formatCurrency } from '../utils/constants';
import { getDrinkImage, getDrinkFallbackEmoji } from '../utils/drinkImages';
import {
  User, ShoppingCart, Search, Sparkles, Coffee, ArrowRight,
  Trash2, Clock, CheckCircle2, X, Eye, ShieldCheck, Star,
  Wallet, CreditCard, Smartphone, Copy, Check
} from 'lucide-react';
import ClientFeedbackModal from '../components/ClientFeedbackModal';

export default function MenuPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [systemInfo, setSystemInfo] = useState({ name: 'THE FIRST GROUP', logoUrl: '', phone: '01000000000' });
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [hasSubmittedFeedback, setHasSubmittedFeedback] = useState(() => {
    try {
      return localStorage.getItem('tfg_feedback_submitted_cafe_menu') === 'true' ||
             localStorage.getItem('tfg_feedback_submitted_cafe') === 'true' ||
             localStorage.getItem('tfg_feedback_submitted') === 'true';
    } catch {
      return false;
    }
  });

  // Digital Wallet & VIP Member Session State
  const [memberClient, setMemberClient] = useState(null);

  useEffect(() => {
    if (memberClient?.id) {
      try {
        if (localStorage.getItem(`tfg_feedback_submitted_member_${memberClient.id}`) === 'true') {
          setHasSubmittedFeedback(true);
        }
      } catch {}
    }
  }, [memberClient]);
  const [paymentChoice, setPaymentChoice] = useState('wallet'); // 'wallet' | 'cash' | 'instapay'
  const [walletLookupInput, setWalletLookupInput] = useState('');
  const [walletLookupLoading, setWalletLookupLoading] = useState(false);
  const [walletLookupError, setWalletLookupError] = useState('');
  const [showWalletLookup, setShowWalletLookup] = useState(false);
  const [copiedInstapay, setCopiedInstapay] = useState(false);

  // Cart state: { [itemId]: { item, qty } }
  const [cart, setCart] = useState(() => {
    try {
      const saved = sessionStorage.getItem('tfg_cafe_cart');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [lastSubmittedOrder, setLastSubmittedOrder] = useState(null);
  const [orderSuccessModal, setOrderSuccessModal] = useState(false);

  // 30-Second Grace Period for Order Review & Cancellation
  const [cancelCountdown, setCancelCountdown] = useState(0);
  const [lastSubmittedCartItems, setLastSubmittedCartItems] = useState([]);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [cancelledToast, setCancelledToast] = useState('');

  useEffect(() => {
    getSystemInfo().then(setSystemInfo);
    return getInventory(setItems);
  }, []);

  // Auto-detect logged-in VIP student/member
  useEffect(() => {
    const savedClientId = localStorage.getItem('tfg_current_client_id');
    if (savedClientId) {
      const unsub = getClient(savedClientId, (client) => {
        if (client) {
          setMemberClient(client);
          setPaymentChoice('wallet');
          setCustomerName(prev => prev || client.name || '');
        }
      });
      return () => {
        if (typeof unsub === 'function') unsub();
      };
    } else {
      // Default to cash if not pre-logged in
      setPaymentChoice('cash');
    }
  }, []);

  const handleVerifyWallet = async (e) => {
    if (e) e.preventDefault();
    const query = walletLookupInput.trim();
    if (!query) {
      setWalletLookupError('يرجى إدخال رقم الموبايل أو رقم العضوية');
      return;
    }
    setWalletLookupLoading(true);
    setWalletLookupError('');
    try {
      const found = await clientLogin(query, query);
      if (found) {
        setMemberClient(found);
        localStorage.setItem('tfg_current_client_id', found.id);
        setPaymentChoice('wallet');
        setShowWalletLookup(false);
        if (!customerName) setCustomerName(found.name || '');
      }
    } catch (err) {
      setWalletLookupError(err.message || 'لم يتم العثور على عضوية مطابقة. يرجى التأكد من الرقم أو الدفع كاش.');
    } finally {
      setWalletLookupLoading(false);
    }
  };

  // Save cart to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem('tfg_cafe_cart', JSON.stringify(cart));
    } catch {
      // ignore
    }
  }, [cart]);

  const menuEligibleItems = useMemo(() => {
    return items.filter(item => {
      if (item.showInMenu === false || item.isMenuItem === false) return false;
      const cat = String(item.category || '').toLowerCase();
      if (cat.includes('منظف') || cat.includes('أدوات') || cat.includes('مستهلكات') || cat.includes('ورقيات') || cat.includes('صيانة')) {
        return false;
      }
      return true;
    });
  }, [items]);

  const categories = useMemo(() => {
    const cats = new Set(menuEligibleItems.map(i => i.category || 'مشروبات'));
    return ['all', ...Array.from(cats)];
  }, [menuEligibleItems]);

  const filteredItems = useMemo(() => {
    return menuEligibleItems.filter(item => {
      const matchCat = selectedCategory === 'all' || (item.category || 'مشروبات') === selectedCategory;
      const q = search.trim().toLowerCase();
      const matchSearch = !q || (item.name || '').toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [menuEligibleItems, selectedCategory, search]);

  // Cart operations
  const addToCart = (item) => {
    setCart(prev => {
      const currentQty = prev[item.id]?.qty || 0;
      return {
        ...prev,
        [item.id]: {
          item,
          qty: currentQty + 1
        }
      };
    });
  };

  const removeFromCart = (itemId) => {
    setCart(prev => {
      const currentQty = prev[itemId]?.qty || 0;
      if (currentQty <= 1) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return {
        ...prev,
        [itemId]: {
          ...prev[itemId],
          qty: currentQty - 1
        }
      };
    });
  };

  const deleteItemFromCart = (itemId) => {
    setCart(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const clearCart = () => {
    setCart({});
  };

  const cartList = useMemo(() => {
    return Object.values(cart).filter(c => c && c.qty > 0);
  }, [cart]);

  const cartTotalQty = useMemo(() => {
    return cartList.reduce((sum, c) => sum + c.qty, 0);
  }, [cartList]);

  const cartTotalPrice = useMemo(() => {
    return cartList.reduce((sum, c) => sum + (c.qty * (Number(c.item.unitPrice) || 0)), 0);
  }, [cartList]);

  // Countdown timer for 30-second grace period
  useEffect(() => {
    if (cancelCountdown <= 0) return;
    const timer = setInterval(() => {
      setCancelCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [cancelCountdown]);

  // Direct Live System Order Dispatcher (No WhatsApp)
  const handleConfirmOrder = async () => {
    if (cartList.length === 0 || submittingOrder) return;

    // Check payment method requirements
    const isWallet = paymentChoice === 'wallet';
    const isInstapay = paymentChoice === 'instapay';

    if (isWallet) {
      if (!memberClient) {
        alert('يرجى التحقق من رقم عضويتك أو رقم الموبايل أولاً للدفع من المحفظة الرقمية، أو اختيار الدفع كاش.');
        setShowWalletLookup(true);
        return;
      }
      const currentBal = Number(memberClient.walletBalance) || 0;
      if (currentBal < cartTotalPrice) {
        alert(`عذراً، رصيد محفظتك الرقمية (${formatCurrency(currentBal)}) لا يكفي لتغطية إجمالي الطلب (${formatCurrency(cartTotalPrice)}).\nيرجى اختيار "دفع نقدي كاش" أو شحن محفظتك من الاستقبال.`);
        return;
      }
    }

    setSubmittingOrder(true);

    try {
      // 1. Snapshot cart items so we can restore them if cancelled within 30s
      setLastSubmittedCartItems([...cartList]);

      // 2. Format order payload
      const orderPayloadItems = cartList.map(c => ({
        itemId: c.item.id,
        name: c.item.name,
        category: c.item.category || 'مشروبات',
        unitPrice: Number(c.item.unitPrice) || 0,
        qty: c.qty,
        subtotal: c.qty * (Number(c.item.unitPrice) || 0),
        imageUrl: c.item.imageUrl || ''
      }));

      // 3. Determine clean payment method
      const isPaidWithWallet = isWallet && !!memberClient;
      const cleanPaymentMethod = isPaidWithWallet ? 'wallet_credit' : isInstapay ? 'instapay' : 'cash';

      // 4. If paid with digital wallet, verify and charge atomically FIRST
      let walletChargeRes = null;
      if (isPaidWithWallet && memberClient) {
        walletChargeRes = await chargeClientWallet({
          clientId: memberClient.id,
          amount: cartTotalPrice,
          description: `طلب كافيه (${cartTotalQty} عناصر)`,
          source: 'cafe_menu',
          actorName: memberClient.name || 'المشترك'
        });
      }

      // 5. Save directly to Firestore cafe_orders with compensation rollback
      let created = null;
      try {
        created = await createCafeOrder({
          customerName: customerName.trim() || (memberClient ? memberClient.name : 'طلب مباشر'),
          tableNumber: tableNumber.trim() || 'طلب مباشر / بالصالة',
          items: orderPayloadItems,
          totalCount: cartTotalQty,
          totalPrice: cartTotalPrice,
          notes: orderNotes.trim() + (isInstapay ? ' [الدفع عبر إنستاباي]' : ''),
          paidWithWallet: isPaidWithWallet,
          paymentMethod: cleanPaymentMethod,
          clientId: memberClient ? memberClient.id : null,
          clientName: memberClient ? memberClient.name : null,
          paid: isPaidWithWallet,
          walletTxId: walletChargeRes?.id || null
        });
      } catch (orderErr) {
        // Compensating transaction: rollback wallet charge if order creation fails
        if (walletChargeRes && memberClient?.id) {
          try {
            await topUpClientWallet({
              clientId: memberClient.id,
              amount: cartTotalPrice,
              bonusAmount: 0,
              paymentMethod: 'wallet_refund',
              notes: 'استرداد تلقائي لفشل حفظ الطلب بالشبكة',
              actorName: 'النظام (استرداد آلي)',
              skipPaymentRecord: true,
              type: 'refund'
            });
          } catch (rbErr) {
            console.error('Critical rollback error:', rbErr);
          }
        }
        throw orderErr;
      }

      // 6. Clear cart, start 30-second countdown, and show welcoming order confirmation
      setLastSubmittedOrder({
        ...created,
        paidWithWallet: isPaidWithWallet,
        paymentMethod: cleanPaymentMethod,
        clientId: memberClient ? memberClient.id : null,
        totalPrice: cartTotalPrice
      });
      setIsCartModalOpen(false);
      clearCart();
      setCancelCountdown(30);
      setOrderSuccessModal(true);
    } catch (err) {
      alert('حدث خطأ أثناء تأكيد الطلب: ' + (err.message || ''));
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Cancel & Revise Order within 30 seconds
  const handleCancelAndReviseOrder = async () => {
    if (!lastSubmittedOrder || cancellingOrder) return;
    if (cancelCountdown <= 0) {
      alert('عذراً، انتهت مهلة الـ 30 ثانية للإلغاء وبدأ الباريستا في تحضير الطلب بالفعل.');
      return;
    }

    setCancellingOrder(true);
    try {
      // Atomic cancellation and wallet refund via single Firestore transaction
      await cancelCafeOrderWithRefund({
        orderId: lastSubmittedOrder.id,
        cancelledBy: memberClient?.name || 'العميل',
        cancelReason: 'إلغاء وتعديل بواسطة العميل خلال مهلة الـ 30 ثانية'
      });

      // Restore items back to cart
      const restoredCart = {};
      if (lastSubmittedCartItems.length > 0) {
        lastSubmittedCartItems.forEach(c => {
          if (c && c.item) {
            restoredCart[c.item.id] = c;
          }
        });
      } else if (lastSubmittedOrder.items) {
        lastSubmittedOrder.items.forEach(it => {
          restoredCart[it.itemId] = {
            item: { id: it.itemId, name: it.name, unitPrice: it.unitPrice, category: it.category, imageUrl: it.imageUrl },
            qty: it.qty
          };
        });
      }
      setCart(restoredCart);

      const prevOrderCode = lastSubmittedOrder.orderCode;
      setCancelCountdown(0);
      setOrderSuccessModal(false);
      setLastSubmittedOrder(null);
      setIsCartModalOpen(true);
      setCancelledToast(`تم إلغاء الطلب #${prevOrderCode} بنجاح ${lastSubmittedOrder.paidWithWallet ? 'واسترجاع المبلغ لمحفظتك ' : ''}واسترجاع الأصناف لسلتك لتعديلها كما تحب! ✨`);
      setTimeout(() => setCancelledToast(''), 5000);
    } catch (err) {
      alert('حدث خطأ أثناء إلغاء الطلب: ' + (err.message || ''));
    } finally {
      setCancellingOrder(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      minHeight: '100dvh',
      background: 'transparent',
      fontFamily: 'Cairo, sans-serif',
      color: '#ffffff',
      padding: 'calc(14px + env(safe-area-inset-top, 0px)) 12px calc(110px + env(safe-area-inset-bottom, 0px))',
      direction: 'rtl'
    }}>
      <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Top Utility Navigation Row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          padding: '2px 0 6px'
        }}>
          {/* Right status pill */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 20,
            padding: '4px 10px',
            fontSize: 11.5,
            fontWeight: 700,
            color: '#cbd5e1'
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 6px #10b981' }} />
            <span>{systemInfo?.name || 'TFG | CAFE'} • طلبات سريعة</span>
          </div>

          {/* Left action pills: Feedback, Member Portal, Cart */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {!hasSubmittedFeedback && (
              <button
                type="button"
                onClick={() => setFeedbackModalOpen(true)}
                style={{
                  background: 'rgba(245, 158, 11, 0.14)',
                  border: '1px solid rgba(245, 158, 11, 0.45)',
                  borderRadius: 12, padding: '5px 9px',
                  color: '#fcd34d', fontSize: 11, fontWeight: 800, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                  transition: 'all 0.2s'
                }}
                title="شاركنا رأيك وقيم تجربتك"
              >
                <Star size={12} style={{ color: '#f59e0b' }} />
                <span>تقييم المكان</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => navigate('/portal')}
              style={{
                background: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: 12, padding: '5px 10px',
                color: '#bfdbfe', fontSize: 11, fontWeight: 800, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                transition: 'all 0.2s'
              }}
              title="بوابة دخول حسابات العملاء والأعضاء"
            >
              <User size={12} style={{ color: '#38bdf8' }} />
              <span>حساب المشترك</span>
            </button>

            {cartTotalQty > 0 && (
              <button
                onClick={() => setIsCartModalOpen(true)}
                style={{
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  border: 'none', borderRadius: 12, padding: '5px 10px',
                  color: '#fff', fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                  boxShadow: '0 3px 10px rgba(16, 185, 129, 0.4)'
                }}
              >
                <ShoppingCart size={13} />
                <span>{cartTotalQty}</span>
              </button>
            )}
          </div>
        </div>

        {/* Header Hero Branding (Centered, No absolute collisions) */}
        <div style={{ textAlign: 'center', padding: '6px 0 10px' }}>
          <div style={{
            width: 150,
            height: 62,
            margin: '0 auto 6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <img
              src="/logo.png"
              alt="TFG | CAFE"
              onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                mixBlendMode: 'screen',
                filter: 'drop-shadow(0 0 18px rgba(56, 189, 248, 0.75))'
              }}
            />
          </div>

          <h1 style={{
            fontSize: 22,
            fontWeight: 900,
            color: '#ffffff',
            margin: 0,
            letterSpacing: '0.8px',
            textShadow: '0 0 20px rgba(56, 189, 248, 0.4)'
          }}>
            TFG | CAFE
          </h1>
          <p style={{ color: '#fcd34d', fontSize: 12.5, fontWeight: 700, margin: '4px 0 0' }}>
            قائمة المشروبات والضيافة • خدمة سريعة لطاولتك
          </p>
        </div>

        {/* Prominent Payment Feature Banner */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(13, 27, 54, 0.9) 100%)',
          border: '1.5px solid rgba(52, 211, 153, 0.4)',
          borderRadius: 16,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(16, 185, 129, 0.25)', border: '1px solid #10b981',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399', flexShrink: 0
            }}>
              <CreditCard size={18} />
            </div>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 900, color: '#ffffff' }}>
                خيارات الدفع عند الطلب متاحة الآن ⚡
              </div>
              <div style={{ fontSize: 11.5, color: '#93c5fd' }}>
                💳 محفظة الأعضاء والطلاب (VIP) • 💵 نقداً عند الاستلام • ⚡ إنستاباي (InstaPay)
              </div>
            </div>
          </div>

          {memberClient ? (
            <div style={{
              background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10b981',
              padding: '5px 12px', borderRadius: 10, fontSize: 12, color: '#34d399', fontWeight: 800
            }}>
              رصيد محفظتك: <strong>{formatCurrency(memberClient.walletBalance || 0)}</strong>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setIsCartModalOpen(true); setShowWalletLookup(true); }}
              style={{
                background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.45)',
                color: '#38bdf8', padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 800,
                cursor: 'pointer', fontFamily: 'Cairo, sans-serif'
              }}
            >
              ربط محفظتك الرقمية 💳
            </button>
          )}
        </div>

        {/* Customer Location & Name Inputs */}
        <div className="glass-card-subtle" style={{
          padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fcd34d', whiteSpace: 'nowrap' }}>رقم الطاولة / القاعة:</span>
            <input
              placeholder="مثال: طاولة 5 أو قاعة A"
              value={tableNumber}
              onChange={e => setTableNumber(e.target.value)}
              className="glass-input"
              style={{
                flex: 1, minWidth: 140, padding: '8px 12px'
              }}
            />
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <input
            placeholder="ابحث عن مشروبك المفضل..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="glass-input"
            style={{ paddingRight: 40 }}
          />
          <Search size={16} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(200, 220, 245, 0.5)', pointerEvents: 'none' }} />
        </div>

        {/* Category Pills */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {categories.map(cat => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: '8px 16px', borderRadius: 12, fontSize: 13, fontWeight: 700,
                  border: isSelected ? '1px solid rgba(245, 158, 11, 0.6)' : '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s',
                  background: isSelected ? 'linear-gradient(135deg, #d97706, #f59e0b)' : 'rgba(255,255,255,0.06)',
                  color: isSelected ? '#ffffff' : 'rgba(200, 220, 245, 0.75)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)'
                }}
              >
                {cat === 'all' ? 'كافة المشروبات' : cat}
              </button>
            );
          })}
        </div>

        {/* Menu Items List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredItems.map(item => {
            const isAvailable = (Number(item.quantity) || 0) > 0;
            const drinkImg = getDrinkImage(item);
            const fallbackEmoji = getDrinkFallbackEmoji(item);
            const itemInCartQty = cart[item.id]?.qty || 0;

            return (
              <div
                key={item.id}
                style={{
                  background: itemInCartQty > 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(15, 32, 64, 0.75)',
                  backdropFilter: 'blur(10px)',
                  border: itemInCartQty > 0 ? '1px solid rgba(16, 185, 129, 0.45)' : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 16,
                  padding: '12px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  opacity: isAvailable ? 1 : 0.6,
                  boxShadow: itemInCartQty > 0 ? '0 4px 20px rgba(16, 185, 129, 0.18)' : '0 4px 20px rgba(0,0,0,0.25)',
                  transition: 'all 0.25s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {/* Professional Embedded Product Badge */}
                  <div style={{
                    width: 56, height: 56, flexShrink: 0,
                    borderRadius: 14,
                    background: 'radial-gradient(circle, rgba(30,58,138,0.45) 0%, rgba(15,23,42,0.9) 100%)',
                    border: '1px solid rgba(59,130,246,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 4,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                  }}>
                    {drinkImg ? (
                      <img
                        src={drinkImg}
                        alt={item.name}
                        style={{
                          width: '100%', height: '100%',
                          objectFit: 'contain',
                          filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.45))'
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: 26 }}>{fallbackEmoji}</span>
                    )}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h3 style={{ color: '#ffffff', fontSize: 16, fontWeight: 900, margin: 0, letterSpacing: '0.2px' }}>
                        {item.name}
                      </h3>
                      {!isAvailable && (
                        <span style={{ fontSize: 10, background: 'rgba(239,68,68,0.2)', color: '#fca5a5', padding: '2px 6px', borderRadius: 6, fontWeight: 700 }}>
                          غير متاح حالياً
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <span style={{ color: '#93c5fd', fontSize: 12, fontWeight: 600 }}>
                        {item.category || 'مشروبات'}
                      </span>
                      <span style={{ color: '#f59e0b', fontSize: 15, fontWeight: 900 }}>
                        • {formatCurrency(item.unitPrice || 15)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Cart Quantity Selector or Add Button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isAvailable && (
                    itemInCartQty > 0 ? (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: 'rgba(15, 23, 42, 0.85)',
                        padding: '4px 6px', borderRadius: 12,
                        border: '1px solid rgba(16, 185, 129, 0.4)'
                      }}>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          style={{
                            width: 32, height: 32, borderRadius: 8,
                            border: 'none', background: 'rgba(239, 68, 68, 0.2)',
                            color: '#f87171', fontSize: 18, fontWeight: 900,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}
                          title="إنقاص"
                        >
                          -
                        </button>
                        <span style={{
                          minWidth: 26, textAlign: 'center',
                          color: '#10b981', fontSize: 16, fontWeight: 900
                        }}>
                          {itemInCartQty}
                        </span>
                        <button
                          onClick={() => addToCart(item)}
                          style={{
                            width: 32, height: 32, borderRadius: 8,
                            border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)',
                            color: '#ffffff', fontSize: 18, fontWeight: 900,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}
                          title="زيادة"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(item)}
                        style={{
                          background: 'linear-gradient(135deg, #d97706, #f59e0b)',
                          border: 'none', borderRadius: 12, padding: '8px 14px',
                          color: '#ffffff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s',
                          boxShadow: '0 4px 12px rgba(245, 158, 11, 0.35)'
                        }}
                      >
                        <span>🛒</span>
                        <span>أضف للطلب</span>
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Feedback Banner for Table Guests */}
        {!hasSubmittedFeedback && (
          <div style={{
            marginTop: 10,
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(13, 27, 54, 0.85) 100%)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: 18, padding: '16px 20px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexWrap: 'wrap', gap: 12, textAlign: 'right',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: 'rgba(245, 158, 11, 0.2)', border: '1px solid rgba(245, 158, 11, 0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b', flexShrink: 0
              }}>
                <Star size={22} fill="#f59e0b" />
              </div>
              <div>
                <h4 style={{ margin: '0 0 2px', color: '#ffffff', fontWeight: 800, fontSize: 14.5 }}>
                  استبيان الجودة ورأي العملاء
                </h4>
                <p style={{ margin: 0, color: '#93c5fd', fontSize: 12 }}>
                  يسعدنا دائماً سماع رأيك وملاحظاتك حول المشروبات والسرعة لمساعدتنا على التطور المستمر
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackModalOpen(true)}
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#ffffff', border: 'none', padding: '9px 18px', borderRadius: 10,
                fontWeight: 800, fontSize: 13, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)',
                fontFamily: 'Cairo, sans-serif'
              }}
            >
              <Star size={14} fill="#ffffff" />
              <span>قيّم زيارتك الآن</span>
            </button>
          </div>
        )}

        <div style={{ textAlign: 'center', color: '#64748b', fontSize: 12, marginTop: 14 }}>
          {systemInfo?.name || 'TFG | CAFE'} • نتمنى لكم يوماً رائعاً وإنتاجية مثمرة! ✨
        </div>
      </div>

      {/* Floating Bottom Cart Bar */}
      {cartTotalQty > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 'calc(14px + env(safe-area-inset-bottom, 0px))',
          left: 'calc(12px + env(safe-area-inset-left, 0px))',
          right: 'calc(12px + env(safe-area-inset-right, 0px))',
          maxWidth: 680,
          margin: '0 auto',
          zIndex: 999,
          animation: 'slideUp 0.3s ease-out'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.95), rgba(4, 120, 87, 0.95))',
            backdropFilter: 'blur(16px)',
            border: '1.5px solid rgba(52, 211, 153, 0.6)',
            borderRadius: 20,
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(16, 185, 129, 0.3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                background: '#ffffff', color: '#065f46',
                width: 38, height: 38, borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, fontWeight: 900,
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
              }}>
                {cartTotalQty}
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#a7f3d0', fontWeight: 700 }}>سلة المشروبات</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#ffffff' }}>
                  {formatCurrency(cartTotalPrice)}
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsCartModalOpen(true)}
              style={{
                background: '#ffffff',
                color: '#065f46',
                border: 'none',
                borderRadius: 14,
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 900,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
                transition: 'all 0.2s'
              }}
            >
              <span>عرض السلة وإرسال الطلب</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Cart Review & WhatsApp Dispatch Modal */}
      {isCartModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16
        }}>
          <div style={{
            background: 'linear-gradient(180deg, #0d1b32 0%, #07101e 100%)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: 24,
            width: '100%',
            maxWidth: 520,
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 60px rgba(0,0,0,0.8), 0 0 30px rgba(16,185,129,0.2)',
            direction: 'rtl'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '18px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(255,255,255,0.03)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981'
                }}>
                  <ShoppingCart size={20} />
                </div>
                <div>
                  <h2 style={{ fontSize: 17, fontWeight: 900, color: '#ffffff', margin: 0 }}>
                    سلة الطلبات ({cartTotalQty} عنصر)
                  </h2>
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>
                    تأكيد طلبك وإرساله فوراً إلى شاشة الباريستا لتحضيره
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCartModalOpen(false)}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  borderRadius: 10,
                  width: 32,
                  height: 32,
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Inputs: Table & Customer Name */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.04)',
                borderRadius: 16,
                padding: '12px 14px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#cbd5e1', display: 'block', marginBottom: 4 }}>
                      رقم الطاولة / الغرفة:
                    </label>
                    <input
                      placeholder="مثال: طاولة 3"
                      value={tableNumber}
                      onChange={e => setTableNumber(e.target.value)}
                      style={{
                        width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 8, padding: '8px 10px', color: '#fff', fontSize: 12, outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#cbd5e1', display: 'block', marginBottom: 4 }}>
                      اسم صاحب الطلب:
                    </label>
                    <input
                      placeholder="اسمك الكريم (اختياري)"
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      style={{
                        width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 8, padding: '8px 10px', color: '#fff', fontSize: 12, outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#cbd5e1', display: 'block', marginBottom: 4 }}>
                    ملاحظات خاصة على المشروبات:
                  </label>
                  <input
                    placeholder="مثال: سكر خفيف، الشاي مظبوط، البيبسي ساقع..."
                    value={orderNotes}
                    onChange={e => setOrderNotes(e.target.value)}
                    style={{
                      width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 8, padding: '8px 10px', color: '#fff', fontSize: 12, outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Prominent Payment Method Selector */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 18,
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CreditCard size={16} color="#10b981" />
                    <span>طريقة الدفع المطلوبة:</span>
                  </span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    اختر ما يناسبك
                  </span>
                </div>

                {/* 3 Payment Options */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
                  {/* Option 1: VIP Wallet */}
                  <div
                    onClick={() => {
                      setPaymentChoice('wallet');
                      if (!memberClient) setShowWalletLookup(true);
                    }}
                    style={{
                      border: paymentChoice === 'wallet' ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                      background: paymentChoice === 'wallet' ? 'rgba(16, 185, 129, 0.18)' : 'rgba(0,0,0,0.25)',
                      borderRadius: 12, padding: '10px 12px', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', gap: 4, transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 900, color: paymentChoice === 'wallet' ? '#34d399' : '#fff' }}>
                        💳 المحفظة (VIP)
                      </span>
                      {paymentChoice === 'wallet' && <Check size={14} color="#34d399" />}
                    </div>
                    <span style={{ fontSize: 10.5, color: '#94a3b8' }}>
                      {memberClient ? `رصيدك: ${formatCurrency(memberClient.walletBalance || 0)}` : 'للأعضاء والطلاب'}
                    </span>
                  </div>

                  {/* Option 2: Cash on Delivery */}
                  <div
                    onClick={() => setPaymentChoice('cash')}
                    style={{
                      border: paymentChoice === 'cash' ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.1)',
                      background: paymentChoice === 'cash' ? 'rgba(245, 158, 11, 0.18)' : 'rgba(0,0,0,0.25)',
                      borderRadius: 12, padding: '10px 12px', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', gap: 4, transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 900, color: paymentChoice === 'cash' ? '#fcd34d' : '#fff' }}>
                        💵 دفع نقدي (كاش)
                      </span>
                      {paymentChoice === 'cash' && <Check size={14} color="#fcd34d" />}
                    </div>
                    <span style={{ fontSize: 10.5, color: '#94a3b8' }}>
                      للباريستا عند الاستلام
                    </span>
                  </div>

                  {/* Option 3: InstaPay / E-Wallet */}
                  <div
                    onClick={() => setPaymentChoice('instapay')}
                    style={{
                      border: paymentChoice === 'instapay' ? '2px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)',
                      background: paymentChoice === 'instapay' ? 'rgba(56, 189, 248, 0.18)' : 'rgba(0,0,0,0.25)',
                      borderRadius: 12, padding: '10px 12px', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', gap: 4, transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 900, color: paymentChoice === 'instapay' ? '#38bdf8' : '#fff' }}>
                        ⚡ إنستاباي (InstaPay)
                      </span>
                      {paymentChoice === 'instapay' && <Check size={14} color="#38bdf8" />}
                    </div>
                    <span style={{ fontSize: 10.5, color: '#94a3b8' }}>
                      تحويل إنستاباي فوري
                    </span>
                  </div>
                </div>

                {/* Sub-panels for selected payment */}
                {paymentChoice === 'wallet' && (
                  <div>
                    {memberClient ? (
                      <div style={{
                        background: (Number(memberClient.walletBalance) || 0) >= cartTotalPrice ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        border: (Number(memberClient.walletBalance) || 0) >= cartTotalPrice ? '1px solid #10b981' : '1px solid #ef4444',
                        borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#ffffff', fontWeight: 800, fontSize: 12 }}>
                            العضو: {memberClient.name}
                          </span>
                          <span style={{ color: '#34d399', fontWeight: 900, fontSize: 13 }}>
                            رصيدك: {formatCurrency(memberClient.walletBalance || 0)}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: (Number(memberClient.walletBalance) || 0) >= cartTotalPrice ? '#a7f3d0' : '#fca5a5' }}>
                          {(Number(memberClient.walletBalance) || 0) >= cartTotalPrice
                            ? `✓ سيتم خصم ${formatCurrency(cartTotalPrice)} مباشرة من محفظتك (مدفوع مسبقاً فوراً).`
                            : `⚠️ رصيدك المتاح لا يكفي لتغطية الطلب (${formatCurrency(cartTotalPrice)}). يرجى اختيار الدفع كاش.`}
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)',
                        borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8
                      }}>
                        <span style={{ color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>
                          هل أنت مشترك أو طالب؟ أدخل رقمك لربط محفظتك واستخدام رصيدك:
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            placeholder="رقم الموبايل أو رقم العضوية..."
                            value={walletLookupInput}
                            onChange={e => setWalletLookupInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleVerifyWallet(e); }}
                            style={{
                              flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)',
                              borderRadius: 8, padding: '8px 10px', color: '#fff', fontSize: 12, outline: 'none'
                            }}
                          />
                          <button
                            type="button"
                            onClick={handleVerifyWallet}
                            disabled={walletLookupLoading}
                            style={{
                              background: '#0284c7', color: '#fff', border: 'none', borderRadius: 8,
                              padding: '8px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap'
                            }}
                          >
                            {walletLookupLoading ? '...' : 'تحقق واستخدام'}
                          </button>
                        </div>
                        {walletLookupError && (
                          <span style={{ color: '#fca5a5', fontSize: 11 }}>{walletLookupError}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {paymentChoice === 'cash' && (
                  <div style={{
                    background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: 12, padding: '8px 12px', color: '#fde68a', fontSize: 12
                  }}>
                    💵 سيتم تحضير طلبك مباشرة وتدفع <strong>{formatCurrency(cartTotalPrice)}</strong> نقداً للباريستا عند استلام طلبك.
                  </div>
                )}

                {paymentChoice === 'instapay' && (
                  <div style={{
                    background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#ffffff', fontSize: 12, fontWeight: 800 }}>
                        حول المبلغ ({formatCurrency(cartTotalPrice)}) على إنستاباي:
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(systemInfo?.instapayHandle || 'thefirstgroup@instapay');
                          setCopiedInstapay(true);
                          setTimeout(() => setCopiedInstapay(false), 2500);
                        }}
                        style={{
                          background: 'rgba(56, 189, 248, 0.2)', border: '1px solid #38bdf8',
                          color: '#38bdf8', padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer'
                        }}
                      >
                        {copiedInstapay ? '✓ تم النسخ' : 'نسخ المعرف'}
                      </button>
                    </div>
                    <code style={{ background: 'rgba(0,0,0,0.4)', padding: '4px 8px', borderRadius: 6, color: '#38bdf8', fontSize: 12, direction: 'ltr', textAlign: 'left', display: 'block' }}>
                      {systemInfo?.instapayHandle || 'thefirstgroup@instapay'}
                    </code>
                  </div>
                )}
              </div>

              {/* Items List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {cartList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                      <ShoppingCart size={38} color="#94a3b8" />
                    </div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>سلة الطلبات فارغة حالياً</p>
                  </div>
                ) : (
                  cartList.map(c => {
                    const drinkImg = getDrinkImage(c.item);
                    const fallbackEmoji = getDrinkFallbackEmoji(c.item);
                    const itemPrice = Number(c.item.unitPrice) || 0;
                    const subtotal = c.qty * itemPrice;

                    return (
                      <div
                        key={c.item.id}
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          borderRadius: 14,
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          border: '1px solid rgba(255,255,255,0.08)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 42, height: 42, borderRadius: 10,
                            background: 'rgba(15,23,42,0.8)',
                            border: '1px solid rgba(59,130,246,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: 2
                          }}>
                            {drinkImg ? (
                              <img src={drinkImg} alt={c.item.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            ) : (
                              <span style={{ fontSize: 20 }}>{fallbackEmoji}</span>
                            )}
                          </div>
                          <div>
                            <div style={{ color: '#ffffff', fontSize: 14, fontWeight: 800 }}>
                              {c.item.name}
                            </div>
                            <div style={{ color: '#94a3b8', fontSize: 11 }}>
                              {formatCurrency(itemPrice)} × {c.qty} = <span style={{ color: '#f59e0b', fontWeight: 800 }}>{formatCurrency(subtotal)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Controls */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            background: 'rgba(0,0,0,0.4)', borderRadius: 10, padding: '3px 5px'
                          }}>
                            <button
                              onClick={() => removeFromCart(c.item.id)}
                              style={{
                                width: 28, height: 28, borderRadius: 6, border: 'none',
                                background: 'rgba(239,68,68,0.2)', color: '#f87171',
                                fontSize: 16, fontWeight: 900, cursor: 'pointer'
                              }}
                            >
                              -
                            </button>
                            <span style={{ minWidth: 22, textAlign: 'center', fontWeight: 900, fontSize: 14, color: '#fff' }}>
                              {c.qty}
                            </span>
                            <button
                              onClick={() => addToCart(c.item)}
                              style={{
                                width: 28, height: 28, borderRadius: 6, border: 'none',
                                background: '#10b981', color: '#fff',
                                fontSize: 16, fontWeight: 900, cursor: 'pointer'
                              }}
                            >
                              +
                            </button>
                          </div>

                          <button
                            onClick={() => deleteItemFromCart(c.item.id)}
                            style={{
                              background: 'transparent', border: 'none', color: '#94a3b8',
                              cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center'
                            }}
                            title="حذف من السلة"
                          >
                            <Trash2 size={16} color="#f87171" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Modal Footer */}
            {cartList.length > 0 && (
              <div style={{
                padding: '16px 20px',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(10, 20, 38, 0.95)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}>
                {/* Total Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#cbd5e1' }}>
                    المجموع الكلي ({cartTotalQty} عنصر):
                  </span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: '#10b981' }}>
                    {formatCurrency(cartTotalPrice)}
                  </span>
                </div>

                {/* Primary Direct Order Button */}
                <button
                  onClick={handleConfirmOrder}
                  disabled={submittingOrder}
                  style={{
                    background: 'linear-gradient(135deg, #059669, #10b981)',
                    border: 'none',
                    borderRadius: 14,
                    padding: '14px 20px',
                    color: '#ffffff',
                    fontSize: 16,
                    fontWeight: 900,
                    cursor: submittingOrder ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    boxShadow: '0 6px 20px rgba(16, 185, 129, 0.4)',
                    transition: 'all 0.2s',
                    opacity: submittingOrder ? 0.7 : 1
                  }}
                >
                  <Coffee size={20} />
                  <span>{submittingOrder ? 'جاري إرسال الطلب للباريستا...' : 'تأكيد وإرسال الطلب للباريستا الآن'}</span>
                </button>

                {/* Footer Sub-actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    onClick={clearCart}
                    style={{
                      background: 'transparent', border: 'none',
                      color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 6
                    }}
                  >
                    <Trash2 size={13} /> تفريغ السلة
                  </button>

                  <button
                    onClick={() => setIsCartModalOpen(false)}
                    style={{
                      background: 'transparent', border: 'none',
                      color: '#94a3b8', fontSize: 12, fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    + إضافة المزيد من المشروبات
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating 30s Grace Period Banner (if user closes modal within 30s) */}
      {!orderSuccessModal && cancelCountdown > 0 && lastSubmittedOrder && (
        <div style={{
          position: 'fixed',
          top: 14,
          left: 14,
          right: 14,
          maxWidth: 680,
          margin: '0 auto',
          zIndex: 998,
          direction: 'rtl'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(9, 44, 32, 0.98))',
            border: '1.5px solid #ef4444',
            borderRadius: 16,
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 10px 25px rgba(0,0,0,0.6), 0 0 20px rgba(239, 68, 68, 0.3)',
            backdropFilter: 'blur(10px)',
            gap: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Clock size={20} color="#f87171" />
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#ffffff' }}>
                  طلبك #{lastSubmittedOrder.orderCode} (متبقي {cancelCountdown} ثانية للإلغاء والتعديل)
                </div>
                <div style={{ fontSize: 11, color: '#cbd5e1' }}>
                  يمكنك استرجاع الأصناف لسلتك فوراً لتعديلها
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setOrderSuccessModal(true)}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: 8,
                  padding: '6px 12px', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6
                }}
              >
                <Eye size={13} /> تفاصيل
              </button>
              <button
                type="button"
                onClick={handleCancelAndReviseOrder}
                disabled={cancellingOrder}
                style={{
                  background: 'linear-gradient(135deg, #dc2626, #ef4444)',
                  border: 'none', borderRadius: 8,
                  padding: '6px 12px', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
                  display: 'inline-flex', alignItems: 'center', gap: 6
                }}
              >
                {cancellingOrder ? 'جاري الإلغاء...' : <><X size={13} /> إلغاء وتعديل</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification when Order is Cancelled and Restored */}
      {cancelledToast && (
        <div style={{
          position: 'fixed',
          top: 20,
          left: 16,
          right: 16,
          maxWidth: 540,
          margin: '0 auto',
          zIndex: 1200,
          background: 'linear-gradient(135deg, #092c20, #064e3b)',
          border: '1.5px solid #34d399',
          borderRadius: 16,
          padding: '14px 20px',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          boxShadow: '0 12px 35px rgba(0,0,0,0.7), 0 0 25px rgba(52, 211, 153, 0.35)',
          fontSize: 14,
          fontWeight: 800,
          direction: 'rtl'
        }}>
          <CheckCircle2 size={22} color="#34d399" />
          <span>{cancelledToast}</span>
        </div>
      )}

      {/* Order Sent Successfully Modal - Mobile Optimized & Zero-Clipping Receipt */}
      {orderSuccessModal && lastSubmittedOrder && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.88)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          zIndex: 1100,
          overflowY: 'auto',
          padding: '16px 12px 40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          direction: 'rtl'
        }}>
          <div style={{
            margin: 'auto 0',
            width: '100%',
            maxWidth: 440,
            background: 'linear-gradient(180deg, #092c20 0%, #031812 100%)',
            border: '2px solid rgba(52, 211, 153, 0.45)',
            borderRadius: 24,
            padding: '20px 16px',
            textAlign: 'center',
            boxShadow: '0 25px 60px rgba(0,0,0,0.85), 0 0 40px rgba(16,185,129,0.25)',
            position: 'relative',
            animation: 'fadeIn 0.3s ease-out'
          }}>
            {/* Top Close Button */}
            <button
              type="button"
              onClick={() => { setOrderSuccessModal(false); setLastSubmittedOrder(null); }}
              style={{
                position: 'absolute',
                top: 14,
                left: 14,
                width: 32,
                height: 32,
                borderRadius: 10,
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="إغلاق"
            >
              <X size={18} />
            </button>

            {/* Compact Header Mini Logo */}
            <div style={{
              width: 130,
              height: 48,
              margin: '0 auto 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <img
                src="/logo.png"
                alt="TFG | CAFE"
                onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  mixBlendMode: 'screen',
                  filter: 'drop-shadow(0 0 12px rgba(56, 189, 248, 0.6))'
                }}
              />
            </div>

            <h2 style={{ fontSize: 20, fontWeight: 900, color: '#ffffff', margin: '0 0 4px', letterSpacing: '-0.3px' }}>
              أهلاً بك في TFG Cafe
            </h2>

            <p style={{ color: '#a7f3d0', fontSize: 13, fontWeight: 700, margin: '0 0 12px' }}>
              طلبك وصل للباريستا وجاري تحضيره بكل إتقان! ☕✨
            </p>

            {/* HUGE PROMINENT PAYMENT STATUS STAMP */}
            {lastSubmittedOrder.paidWithWallet ? (
              <div style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(6, 95, 70, 0.38) 100%)',
                border: '1.5px solid #10b981',
                borderRadius: 14,
                padding: '10px 14px',
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 4px 16px rgba(16, 185, 129, 0.25)'
              }}>
                <CheckCircle2 size={20} color="#34d399" />
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#ffffff', fontWeight: 900, fontSize: 13.5 }}>
                    طلب مدفوع مسبقاً من المحفظة الرقمية ✓
                  </div>
                  <div style={{ color: '#a7f3d0', fontSize: 11, fontWeight: 700 }}>
                    تم خصم {formatCurrency(lastSubmittedOrder.totalPrice)} - لن تدفع أي كاش للباريستا
                  </div>
                </div>
              </div>
            ) : lastSubmittedOrder.paymentMethod === 'instapay' ? (
              <div style={{
                background: 'rgba(56, 189, 248, 0.18)',
                border: '1.5px solid #38bdf8',
                borderRadius: 14,
                padding: '10px 14px',
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}>
                <Smartphone size={20} color="#38bdf8" />
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#ffffff', fontWeight: 900, fontSize: 13.5 }}>
                    الدفع الإلكتروني (إنستاباي)
                  </div>
                  <div style={{ color: '#93c5fd', fontSize: 11, fontWeight: 700 }}>
                    المبلغ: {formatCurrency(lastSubmittedOrder.totalPrice)} إلى {systemInfo?.instapayHandle || 'thefirstgroup@instapay'}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{
                background: 'rgba(245, 158, 11, 0.18)',
                border: '1.5px solid rgba(245, 158, 11, 0.5)',
                borderRadius: 14,
                padding: '10px 14px',
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}>
                <Clock size={20} color="#fcd34d" />
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#ffffff', fontWeight: 900, fontSize: 13.5 }}>
                    الدفع نقداً عند الاستلام (كاش)
                  </div>
                  <div style={{ color: '#fde68a', fontSize: 11, fontWeight: 700 }}>
                    المطلوب سداده: {formatCurrency(lastSubmittedOrder.totalPrice)} للباريستا
                  </div>
                </div>
              </div>
            )}

            {/* Order Code & Price Highlight Grid (White-space nowrap to prevent line wrap) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              marginBottom: 14
            }}>
              <div style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1.5px dashed #34d399',
                borderRadius: 14,
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, marginBottom: 2 }}>
                  رقم الطلب
                </span>
                <span style={{
                  color: '#fcd34d',
                  fontSize: 20,
                  fontWeight: 900,
                  letterSpacing: '0.5px',
                  whiteSpace: 'nowrap',
                  direction: 'ltr'
                }}>
                  #{lastSubmittedOrder.orderCode || (lastSubmittedOrder.id ? lastSubmittedOrder.id.slice(0, 6) : '')}
                </span>
              </div>

              <div style={{
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1.5px solid rgba(52, 211, 153, 0.4)',
                borderRadius: 14,
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <span style={{ color: '#a7f3d0', fontSize: 11, fontWeight: 700, marginBottom: 2 }}>
                  {lastSubmittedOrder.paidWithWallet ? 'المدفوع من المحفظة' : 'سعر الأوردر المطلوب'}
                </span>
                <span style={{
                  color: '#34d399',
                  fontSize: 20,
                  fontWeight: 900,
                  whiteSpace: 'nowrap'
                }}>
                  {formatCurrency(lastSubmittedOrder.totalPrice)}
                </span>
              </div>
            </div>

            {/* 30-Second Grace Period & Review Widget */}
            <div style={{
              background: cancelCountdown > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.12)',
              border: `1.5px solid ${cancelCountdown > 0 ? 'rgba(239, 68, 68, 0.35)' : 'rgba(52, 211, 153, 0.35)'}`,
              borderRadius: 16,
              padding: '12px 14px',
              marginBottom: 14,
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              transition: 'all 0.3s ease'
            }}>
              {cancelCountdown > 0 ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fca5a5', fontSize: 12.5, fontWeight: 800 }}>
                      <Clock size={15} />
                      <span>مهلة التراجع والتعديل:</span>
                    </div>
                    <div style={{
                      background: '#ef4444',
                      color: '#ffffff',
                      borderRadius: 20,
                      padding: '2px 10px',
                      fontSize: 12,
                      fontWeight: 900,
                      boxShadow: '0 0 10px rgba(239, 68, 68, 0.5)'
                    }}>
                      {cancelCountdown} ثانية
                    </div>
                  </div>

                  {/* Animated Progress Bar */}
                  <div style={{
                    width: '100%',
                    height: 5,
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: 3,
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${(cancelCountdown / 30) * 100}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #ef4444, #f59e0b)',
                      transition: 'width 1s linear'
                    }} />
                  </div>

                  <p style={{ color: '#cbd5e1', fontSize: 11, margin: '2px 0 0', lineHeight: 1.4 }}>
                    نسيت صنفاً أو ترغب في تعديل الطاولة؟ يمكنك الإلغاء فوراً واسترجاع الأصناف لسلتك.
                  </p>

                  <button
                    type="button"
                    onClick={handleCancelAndReviseOrder}
                    disabled={cancellingOrder}
                    style={{
                      background: 'rgba(239, 68, 68, 0.2)',
                      border: '1.5px solid #ef4444',
                      borderRadius: 10,
                      padding: '8px 14px',
                      color: '#fca5a5',
                      fontSize: 12.5,
                      fontWeight: 800,
                      cursor: cancellingOrder ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      transition: 'all 0.2s',
                      marginTop: 2
                    }}
                  >
                    <X size={14} />
                    <span>{cancellingOrder ? 'جاري إلغاء الطلب...' : 'إلغاء الطلب والتعديل عليه'}</span>
                  </button>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#34d399', fontSize: 12.5, fontWeight: 800, padding: '2px 0' }}>
                  <CheckCircle2 size={16} color="#34d399" />
                  <span>تم اعتماد الطلب رسمياً وجاري تحضيره بواسطة الباريستا</span>
                </div>
              )}
            </div>

            {/* Location & Customer Info */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.04)',
              borderRadius: 12,
              padding: '8px 12px',
              fontSize: 12,
              color: '#cbd5e1',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
              border: '1px solid rgba(255, 255, 255, 0.07)'
            }}>
              <div>
                <span style={{ color: '#94a3b8' }}>مكان الاستلام: </span>
                <strong style={{ color: '#38bdf8' }}>{lastSubmittedOrder.tableNumber || 'بالصالة'}</strong>
              </div>
              {lastSubmittedOrder.customerName && (
                <div>
                  <span style={{ color: '#94a3b8' }}>الاسم: </span>
                  <strong style={{ color: '#ffffff' }}>{lastSubmittedOrder.customerName}</strong>
                </div>
              )}
            </div>

            {/* Ordered Items Preview (Compact Scrollable Box) */}
            {lastSubmittedOrder.items && lastSubmittedOrder.items.length > 0 && (
              <div style={{
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: 12,
                padding: '10px 12px',
                marginBottom: 14,
                textAlign: 'right',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                maxHeight: 120,
                overflowY: 'auto'
              }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, marginBottom: 4 }}>
                  المشروبات المطلوبة ({lastSubmittedOrder.items.length} أصناف):
                </div>
                {lastSubmittedOrder.items.map((it, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '3px 0',
                    borderBottom: idx === lastSubmittedOrder.items.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.05)',
                    fontSize: 12.5
                  }}>
                    <span style={{ color: '#ffffff', fontWeight: 700 }}>
                      {it.qty} × {it.name}
                    </span>
                    <span style={{ color: '#34d399', fontWeight: 800 }}>
                      {formatCurrency(it.subtotal)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Quality & Feedback Button Banner (Compact) */}
            {!hasSubmittedFeedback && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(30, 41, 59, 0.6) 100%)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: 12,
                padding: '10px 12px',
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8
              }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#fcd34d' }}>
                    رأيك يهمنا في المشروبات والخدمة!
                  </div>
                  <div style={{ fontSize: 11, color: '#cbd5e1' }}>
                    تقييم سريع لمدة 30 ثانية
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFeedbackModalOpen(true)}
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 10,
                    padding: '7px 14px',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    boxShadow: '0 2px 8px rgba(245, 158, 11, 0.35)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <Star size={13} fill="#ffffff" />
                  <span>قيّم الآن</span>
                </button>
              </div>
            )}

            {/* Primary Action Button */}
            <button
              onClick={() => { setOrderSuccessModal(false); setLastSubmittedOrder(null); }}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 14,
                padding: '13px 18px',
                fontSize: 14.5,
                fontWeight: 900,
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(16, 185, 129, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 0.2s'
              }}
            >
              <Coffee size={18} />
              <span>العودة لقائمة المشروبات (طلب آخر)</span>
            </button>
          </div>
        </div>
      )}
      
      {/* Quality & Feedback Modal */}
        <ClientFeedbackModal
          open={feedbackModalOpen}
          onClose={() => setFeedbackModalOpen(false)}
          initialClientName={customerName || lastSubmittedOrder?.customerName || ''}
          tableNumber={tableNumber || lastSubmittedOrder?.tableNumber || ''}
          defaultService="كافيه ومشروبات"
          source="cafe_menu"
          onFeedbackSubmitted={() => {
            setHasSubmittedFeedback(true);
          }}
        />
      </div>
  );
}

