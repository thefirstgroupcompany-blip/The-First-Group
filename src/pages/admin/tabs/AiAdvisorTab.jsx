import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getClients, getAllSubscriptions, getAllShifts, getPackages, getInstructors } from '../../../services/db';
import { generateComprehensiveMetrics, generateAiReport, answerUserQuestion } from '../../../services/aiAdvisor';
import { Card, Button, Input, Badge, Spinner } from '../../../components/ui';
import { useAuth } from '../../../contexts/AuthContext';

export default function AiAdvisorTab({ isEmployee = false }) {
  const { user } = useAuth();
  const effectiveIsEmployee = isEmployee || (user && user.role === 'employee');

  const [clients, setClients] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [packages, setPackages] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active AI Report Modal/View
  const [selectedReportKey, setSelectedReportKey] = useState(
    effectiveIsEmployee ? 'employee_renewal_radar' : 'financial_audit'
  );

  // Conversational Chat State
  const [chatMessages, setChatMessages] = useState([
    {
      sender: 'ai',
      text: effectiveIsEmployee
        ? 'مرحباً بك يا زميلي! أنا **TFG AI** 🤖✨\n\nأنا هنا لمساعدتك في كل ما يخص خدمة العملاء، متابعة تجديد باقات الطلاب، معرفة تفاصيل الكورسات، وإجراءات المناوبة والتشغيل اليومي بنجاح! 🚀\n\nكيف يمكنني مساعدتك اليوم؟'
        : 'مرحباً بك يا فندم! أنا **TFG AI** 🤖🧠✨\n\nلقد قمت بتحليل كافة بيانات المؤسسة الحية (الأرباح، المصروفات، الاشتراكات، حسابات المدرسين، والمديونيات).\n\nيمكنك مراجعة **التقارير الاستشارية بالأعلى** أو كتابة أي سؤال مخصص في الشات وسأجيبك فوراً بالأرقام الدقيقة والتوصيات! 🚀'
    }
  ]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  // Subscribe to Live Firestore Data
  useEffect(() => {
    const unsubClt = getClients(setClients);
    const unsubSub = getAllSubscriptions(setSubscriptions);
    const unsubShf = getAllShifts(setShifts);
    const unsubPkg = getPackages(setPackages);
    const unsubInst = getInstructors((insts) => {
      setInstructors(insts);
      setLoading(false);
    });

    return () => {
      unsubClt();
      unsubSub();
      unsubShf();
      unsubPkg();
      unsubInst();
    };
  }, []);

  // Compute Comprehensive Real-time Metrics
  const metrics = useMemo(() => {
    return generateComprehensiveMetrics({
      clients,
      subscriptions,
      shifts,
      packages,
      instructors
    });
  }, [clients, subscriptions, shifts, packages, instructors]);

  // Current Active Report
  const currentReport = useMemo(() => {
    if (!selectedReportKey) return null;
    return generateAiReport(selectedReportKey, metrics, effectiveIsEmployee);
  }, [selectedReportKey, metrics, effectiveIsEmployee]);

  // Scroll to bottom on new chat message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isTyping]);

  const handleSendMessage = (textToSend) => {
    const q = textToSend || inputQuestion;
    if (!q.trim()) return;

    // Add user message
    setChatMessages(prev => [...prev, { sender: 'user', text: q.trim() }]);
    setInputQuestion('');
    setIsTyping(true);

    // Simulate AI thinking
    setTimeout(() => {
      const response = answerUserQuestion(q.trim(), metrics, effectiveIsEmployee);
      setChatMessages(prev => [...prev, { sender: 'ai', text: response }]);
      setIsTyping(false);
    }, 500);
  };

  const formatCurrency = (val) => `${(Number(val) || 0).toLocaleString('ar-EG-u-nu-latn')} ج.م`;

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <Spinner size={36} />
        <p style={{ color: '#93c5fd', marginTop: 12, fontWeight: 700 }}>TFG AI يقوم بتحليل وتجهيز البيانات...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1100, margin: '0 auto' }}>

      {/* Hero Header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 58, 138, 0.4))',
        border: '1px solid rgba(59, 130, 246, 0.4)',
        borderRadius: 24,
        padding: '24px 28px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16,
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 20,
            background: 'radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, rgba(37, 99, 235, 0.1) 100%)',
            border: '2px solid #3b82f6',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32,
            boxShadow: '0 0 24px rgba(59, 130, 246, 0.5)'
          }}>
            🤖
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#ffffff', letterSpacing: '0.3px' }}>
                TFG AI
              </h2>
              <Badge color="emerald">
                {effectiveIsEmployee ? 'مساعد التشغيل والاستقبال ⚡' : 'مستشار الإدارة والماليات ⚡'}
              </Badge>
            </div>
            <p style={{ margin: '6px 0 0', color: '#93c5fd', fontSize: 13, fontWeight: 600 }}>
              {effectiveIsEmployee
                ? 'مساعدتك الذكية في فحص الاشتراكات، خدمة العملاء، باقات الكورسات، ومتابعة الطلاب'
                : 'مستشارك الذكي لتحليل الأرباح، التنبؤ بالإيرادات، رادار تجديد الاشتراكات، وتطوير المؤسسة'}
            </p>
          </div>
        </div>
      </div>

      {/* Intelligence KPI Highlights */}
      {effectiveIsEmployee ? (
        // EMPLOYEE KPI CARDS (Safe, Non-financial)
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <Card style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(59, 130, 246, 0.3)', padding: 16 }}>
            <div style={{ color: '#93c5fd', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>👥 الطلاب المشتركون النشطون</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#ffffff' }}>
              {metrics.activeClientsCount} <span style={{ fontSize: 13, color: '#94a3b8' }}>طالب</span>
            </div>
            <div style={{ color: '#60a5fa', fontSize: 11, marginTop: 4 }}>مسجلون في النظام</div>
          </Card>

          <Card style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: 16 }}>
            <div style={{ color: '#fcd34d', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>⏳ رادار الاشتراكات للتجديد</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#fbbf24' }}>
              {metrics.expiringSoon.length} <span style={{ fontSize: 13, color: '#94a3b8' }}>طالب</span>
            </div>
            <div style={{ color: '#fde68a', fontSize: 11, marginTop: 4 }}>باقي حصتان أو أقل</div>
          </Card>

          <Card style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(168, 85, 247, 0.3)', padding: 16 }}>
            <div style={{ color: '#d8b4fe', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>📦 باقات الكورسات والعمل</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#c084fc' }}>
              {(metrics.packages || []).length} <span style={{ fontSize: 13, color: '#94a3b8' }}>باقة معتمدة</span>
            </div>
            <div style={{ color: '#e9d5ff', fontSize: 11, marginTop: 4 }}>جاهزة للاشتراك</div>
          </Card>

          <Card style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: 16 }}>
            <div style={{ color: '#6ee7b7', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>🌟 جودة خدمة الاستقبال</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#34d399' }}>
              ممتاز ومتصل ✅
            </div>
            <div style={{ color: '#a7f3d0', fontSize: 11, marginTop: 4 }}>THE FIRST GROUP</div>
          </Card>
        </div>
      ) : (
        // ADMIN KPI CARDS (Full Financial & Strategic)
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <Card style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(59, 130, 246, 0.3)', padding: 16 }}>
            <div style={{ color: '#93c5fd', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>📈 صافي الأرباح المحققة</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: metrics.netProfit >= 0 ? '#34d399' : '#f87171' }}>
              {formatCurrency(metrics.netProfit)}
            </div>
            <div style={{ color: '#60a5fa', fontSize: 11, marginTop: 4 }}>هامش ربح: {metrics.profitMargin}%</div>
          </Card>

          <Card style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: 16 }}>
            <div style={{ color: '#fcd34d', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>⏳ رادار الاشتراكات المنتهية</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#fbbf24' }}>
              {metrics.expiringSoon.length} <span style={{ fontSize: 13, color: '#94a3b8' }}>طالب للتجديد</span>
            </div>
            <div style={{ color: '#fde68a', fontSize: 11, marginTop: 4 }}>باقي حصتان أو أقل</div>
          </Card>

          <Card style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: 16 }}>
            <div style={{ color: '#fca5a5', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>⚠️ إجمالي المديونيات المعلقة</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#f87171' }}>
              {formatCurrency(metrics.totalDebt)}
            </div>
            <div style={{ color: '#fecaca', fontSize: 11, marginTop: 4 }}>عبر {metrics.clientsWithDebt.length} عميل</div>
          </Card>

          <Card style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(168, 85, 247, 0.3)', padding: 16 }}>
            <div style={{ color: '#d8b4fe', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>🏆 الأعلى إقبالاً ونشاطاً</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#c084fc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {metrics.topInstructor}
            </div>
            <div style={{ color: '#e9d5ff', fontSize: 11, marginTop: 4 }}>{metrics.topPackage}</div>
          </Card>
        </div>
      )}

      {/* Section 1: Quick Strategy Audit Reports */}
      <div>
        <h3 style={{ color: '#ffffff', fontSize: 17, fontWeight: 800, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>💡</span> إرشادات وتقارير TFG AI السريعة:
        </h3>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {effectiveIsEmployee ? (
            [
              ['employee_renewal_radar', `👥 رادار متابعة وتجديد الطلاب (${metrics.expiringSoon.length})`],
              ['employee_packages_guide', '📦 دليل باقات الكورسات والأسعار'],
              ['employee_hospitality_tips', '🌟 دليل التميز في خدمة العملاء']
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSelectedReportKey(key)}
                style={{
                  padding: '10px 18px',
                  borderRadius: 14,
                  fontWeight: 800,
                  fontSize: 13,
                  fontFamily: 'Cairo, sans-serif',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: selectedReportKey === key ? 'linear-gradient(135deg, #1d4ed8, #3b82f6)' : 'rgba(15, 23, 42, 0.8)',
                  color: selectedReportKey === key ? '#ffffff' : '#94a3b8',
                  boxShadow: selectedReportKey === key ? '0 4px 16px rgba(37, 99, 235, 0.4)' : 'none',
                  border: selectedReportKey === key ? '1px solid #60a5fa' : '1px solid rgba(255,255,255,0.08)'
                }}
              >
                {label}
              </button>
            ))
          ) : (
            [
              ['financial_audit', '📊 التحليل المالي والصحة الربحية'],
              ['churn_radar', `👥 رادار الطلاب والتجديد (${metrics.expiringSoon.length})`],
              ['instructors_benchmark', '👨‍🏫 تقييم أداء المدرسين والكورسات'],
              ['growth_forecast', '🔮 توقعات النمو والإيراد القادم'],
              ['marketing_ideas', '🎁 أفكار وعروض تسويقية مقترحة']
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSelectedReportKey(key)}
                style={{
                  padding: '10px 18px',
                  borderRadius: 14,
                  fontWeight: 800,
                  fontSize: 13,
                  fontFamily: 'Cairo, sans-serif',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: selectedReportKey === key ? 'linear-gradient(135deg, #1d4ed8, #3b82f6)' : 'rgba(15, 23, 42, 0.8)',
                  color: selectedReportKey === key ? '#ffffff' : '#94a3b8',
                  boxShadow: selectedReportKey === key ? '0 4px 16px rgba(37, 99, 235, 0.4)' : 'none',
                  border: selectedReportKey === key ? '1px solid #60a5fa' : '1px solid rgba(255,255,255,0.08)'
                }}
              >
                {label}
              </button>
            ))
          )}
        </div>

        {/* Selected Report Card */}
        {currentReport && (
          <Card style={{
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9))',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            padding: 24,
            borderRadius: 20
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <h4 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 8 }}>
                {currentReport.title}
              </h4>
              <Badge color="blue">{currentReport.badge}</Badge>
            </div>

            <p style={{ color: '#e2e8f0', fontSize: 14, lineHeight: 1.7, margin: '0 0 16px', background: 'rgba(59, 130, 246, 0.1)', padding: 14, borderRadius: 12, border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              {currentReport.summary}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 16 }}>
              {/* Insights List */}
              <div style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 16 }}>
                <h5 style={{ margin: '0 0 10px', color: '#38bdf8', fontSize: 14, fontWeight: 800 }}>📌 معلومات وبيانات:</h5>
                <ul style={{ margin: 0, paddingRight: 20, color: '#cbd5e1', fontSize: 13, lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {currentReport.insights.map((ins, i) => (
                    <li key={i} dangerouslySetInnerHTML={{ __html: ins.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#ffffff">$1</strong>') }} />
                  ))}
                </ul>
              </div>

              {/* Recommendations List */}
              <div style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 14, padding: 16 }}>
                <h5 style={{ margin: '0 0 10px', color: '#34d399', fontSize: 14, fontWeight: 800 }}>🎯 إرشادات وتوجيهات:</h5>
                <ul style={{ margin: 0, paddingRight: 20, color: '#cbd5e1', fontSize: 13, lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {currentReport.recommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Section 2: Conversational AI Chat */}
      <Card style={{
        background: 'rgba(15, 23, 42, 0.95)',
        border: '1px solid rgba(59, 130, 246, 0.35)',
        borderRadius: 22,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ color: '#ffffff', fontSize: 17, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>💬</span> دردشة مباشرة مع TFG AI
          </h3>
          <span style={{ color: '#94a3b8', fontSize: 12 }}>استجابة فورية 🧠</span>
        </div>

        {/* Suggestion Chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {effectiveIsEmployee ? (
            [
              'من هم الطلاب المطلوب تذكيرهم بالتجديد؟',
              'ما هي باقات الكورسات المتاحة وأسعارها؟',
              'كيف أتعامل مع طالب يشتكي من بطء الإنترنت؟',
              'ما هي إجراءات تسليم الوردية بنجاح؟'
            ].map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(prompt)}
                style={{
                  background: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: 20,
                  padding: '6px 14px',
                  color: '#93c5fd',
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: 'Cairo, sans-serif',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.25)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)'}
              >
                💬 {prompt}
              </button>
            ))
          ) : (
            [
              'كم إجمالي مديونيات الطلاب المعلقة؟',
              'لخص لي الوضع المالي والأرباح',
              'ما هو الكورس والمدرس الأكثر إقبالاً؟',
              'كيف يمكننا زيادة إيرادات المكان؟'
            ].map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(prompt)}
                style={{
                  background: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: 20,
                  padding: '6px 14px',
                  color: '#93c5fd',
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: 'Cairo, sans-serif',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.25)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)'}
              >
                💬 {prompt}
              </button>
            ))
          )}
        </div>

        {/* Messages Stream */}
        <div style={{
          background: 'rgba(7, 17, 31, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: 18,
          padding: 18,
          minHeight: 280,
          maxHeight: 420,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 14
        }}>
          {chatMessages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                background: msg.sender === 'user' ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : 'rgba(30, 41, 59, 0.9)',
                border: msg.sender === 'user' ? 'none' : '1px solid rgba(59, 130, 246, 0.3)',
                color: '#ffffff',
                padding: '12px 18px',
                borderRadius: 16,
                borderBottomRightRadius: msg.sender === 'user' ? 4 : 16,
                borderBottomLeftRadius: msg.sender === 'ai' ? 4 : 16,
                fontSize: 13,
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap'
              }}
            >
              {msg.text}
            </div>
          ))}

          {isTyping && (
            <div style={{ alignSelf: 'flex-start', background: 'rgba(30, 41, 59, 0.9)', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '10px 16px', borderRadius: 16, color: '#93c5fd', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Spinner size={14} /> TFG AI يجهز الإجابة...
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Chat Input Bar */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
          style={{ display: 'flex', gap: 10, alignItems: 'center' }}
        >
          <input
            type="text"
            value={inputQuestion}
            onChange={e => setInputQuestion(e.target.value)}
            placeholder={effectiveIsEmployee ? "اسأل TFG AI عن أي شيء يخص الطلاب، الباقات، أو التشغيل..." : "اسأل TFG AI عن أي شيء في أرباح ومصروفات وأعمال المكان..."}
            style={{
              flex: 1,
              background: 'rgba(7, 17, 31, 0.85)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 14,
              padding: '13px 18px',
              color: '#ffffff',
              fontSize: 14,
              fontFamily: 'Cairo, sans-serif',
              outline: 'none',
              direction: 'rtl'
            }}
          />

          <button
            type="submit"
            disabled={!inputQuestion.trim() || isTyping}
            style={{
              padding: '13px 22px',
              borderRadius: 14,
              background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
              color: '#ffffff',
              fontFamily: 'Cairo, sans-serif',
              fontWeight: 800,
              fontSize: 14,
              border: 'none',
              cursor: !inputQuestion.trim() || isTyping ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 16px rgba(37, 99, 235, 0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span>🚀</span> إرسال
          </button>
        </form>
      </Card>

    </div>
  );
}
