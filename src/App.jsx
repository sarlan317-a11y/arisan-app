import React, { useState, useMemo, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  collection, 
  onSnapshot, 
  addDoc,
  deleteDoc,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import { 
  Search, 
  DollarSign, 
  Lock,
  LogOut,
  Users,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  ArrowUpCircle,
  ArrowDownCircle,
  Plus,
  Trash2,
  Wallet,
  History,
  Save,
  AlertCircle,
  Filter,
  Download,
  ListChecks,
  Receipt
} from 'lucide-react';

// --- Firebase Configuration (Updated with User Provided Config) ---
const firebaseConfig = {
  apiKey: "AIzaSyDutvnsvjmu8iaj6W70v3-I55FryWuQlBM",
  authDomain: "arisan-a99bb.firebaseapp.com",
  projectId: "arisan-a99bb",
  storageBucket: "arisan-a99bb.firebasestorage.app",
  messagingSenderId: "490550659293",
  appId: "1:490550659293:web:3759eb26fb290a3b7b7334"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'arisan-a99bb-v2';

// Daftar Nama Anggota Tetap
const MEMBER_NAMES = [
  "ARIF", "LANDUNG", "P. MANSUR", "ANCA", "P. ANI", "P. RAHMA", "AYAH LISA", "P. ENI",
  "PATIR", "SINNA", "IFUL", "UDIN", "JASMAN", "SARLAN", "WANDI", "P. LISA",
  "WAHID", "SUDI", "P. KUNA", "CAMBANG", "ALDO", "HATTAB", "P. NASLA", "P. GURU",
  "P. JULI", "P. ISA", "P. DIMAS", "P. NURDIN", "P. LIA", "P. SERLI", "P. BAKRI", "P. AFI",
  "P. DEVI", "P. TIARA", "TEPU", "P. KALANG", "NAMMA", "P. ABING", "P. ADRIAN", "AKKA",
  "P. HABIBI", "P. AMRANG", "ALHAM", "QADRI", "P. NISA", "ANDI", "AGU", "P. ARHAM"
];

const App = () => {
  // Navigation State
  const [activeTab, setActiveTab] = useState('dashboard');

  // Auth States
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [pin, setPin] = useState('');
  const [loginError, setLoginError] = useState('');

  // Data States
  const [members, setMembers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [weekDates, setWeekDates] = useState({}); 
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentWeek, setCurrentWeek] = useState(1);
  const [historyWeek, setHistoryWeek] = useState(1); 
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('Data Berhasil Disimpan!');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  // Local Buffering for Arisan Inputs
  const [localPayments, setLocalPayments] = useState({});

  // Form State
  const [newTx, setNewTx] = useState({ 
    date: new Date().toISOString().split('T')[0], 
    note: '', 
    amount: '', 
    type: 'in',
    memberName: 'Umum / Lainnya' 
  });

  // Konfigurasi Aplikasi
  const TOTAL_MEMBERS = MEMBER_NAMES.length;
  const ADMIN_PIN = "123456"; 
  const TARGET_IURAN = 55000; 
  const MAX_WEEKS_DISPLAY = 48; 

  const formatRupiah = (num) => {
    if (!num) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const parseNumber = (str) => {
    if (typeof str !== 'string') return str || 0;
    return parseInt(str.replace(/\./g, '')) || 0;
  };

  // 1. Auth Logic with Robust Fallback
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch (tokenErr) {
            console.warn("Custom token failed, falling back to anonymous");
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => setUser(currentUser));
    return () => unsubscribe();
  }, []);

  // 2. Data Fetching
  useEffect(() => {
    if (!user || !isLoggedIn) return;

    // Use partitioned paths as per Rule 1
    const membersCol = collection(db, 'artifacts', appId, 'public', 'data', 'members');
    const unsubMembers = onSnapshot(membersCol, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (data.length === 0) {
        initializeDefaultMembers();
      } else {
        const sorted = data.sort((a, b) => a.memberIndex - b.memberIndex);
        setMembers(sorted);
        
        const buffer = {};
        sorted.forEach(m => {
          buffer[m.id] = m.payments || {};
        });
        setLocalPayments(prev => ({ ...buffer, ...prev }));
      }
    }, (err) => console.error("Firestore Listen Error:", err));

    const txCol = collection(db, 'artifacts', appId, 'public', 'data', 'transactions');
    const unsubTx = onSnapshot(txCol, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(data.sort((a, b) => b.date.localeCompare(a.date)));
      setLoading(false);
    }, (err) => console.error("Firestore Listen Error:", err));

    const settingsDoc = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'weeks');
    const unsubDates = onSnapshot(settingsDoc, (snapshot) => {
      if (snapshot.exists()) setWeekDates(snapshot.data().dates || {});
    }, (err) => console.error("Firestore Listen Error:", err));

    return () => {
      unsubMembers();
      unsubTx();
      unsubDates();
    };
  }, [user, isLoggedIn]);

  const initializeDefaultMembers = async () => {
    if (!user) return;
    const batch = writeBatch(db);
    MEMBER_NAMES.forEach((name, index) => {
      const memberIndex = index + 1;
      const memberRef = doc(db, 'artifacts', appId, 'public', 'data', 'members', `member_${memberIndex}`);
      batch.set(memberRef, { 
        memberIndex, 
        name: name, 
        payments: {} 
      });
    });
    await batch.commit();
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (pin === ADMIN_PIN) { setIsLoggedIn(true); setLoginError(''); }
    else setLoginError('PIN yang Anda masukkan salah!');
  };

  const handleLocalPaymentChange = (memberId, week, val) => {
    const numericAmount = parseNumber(val);
    setLocalPayments(prev => ({
      ...prev,
      [memberId]: {
        ...(prev[memberId] || {}),
        [week]: numericAmount
      }
    }));
  };

  const saveSingleMemberPayment = async (memberId) => {
    if (!user) return;
    try {
      const memberRef = doc(db, 'artifacts', appId, 'public', 'data', 'members', memberId);
      await updateDoc(memberRef, { payments: localPayments[memberId] });
      triggerToast("Data Anggota Berhasil Disimpan!");
    } catch (err) {
      console.error(err);
    }
  };

  const saveAllWeeklyPayments = async () => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      members.forEach(member => {
        const memberRef = doc(db, 'artifacts', appId, 'public', 'data', 'members', member.id);
        batch.update(memberRef, { payments: localPayments[member.id] });
      });
      await batch.commit();
      triggerToast(`Semua Data Minggu ${currentWeek} Berhasil Disimpan!`);
    } catch (err) {
      console.error(err);
    }
  };

  const triggerToast = (msg) => {
    setToastMsg(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const addTransaction = async (type) => {
    if (!user || !newTx.amount || !newTx.note) return;
    const txCol = collection(db, 'artifacts', appId, 'public', 'data', 'transactions');
    await addDoc(txCol, {
      ...newTx,
      type,
      amount: parseNumber(newTx.amount.toString()),
      createdAt: new Date().toISOString()
    });
    setNewTx({ 
      date: new Date().toISOString().split('T')[0], 
      note: '', 
      amount: '', 
      type: 'in',
      memberName: 'Umum / Lainnya'
    });
    triggerToast("Transaksi Berhasil Dicatat!");
  };

  const deleteTransaction = async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'transactions', id));
  };

  const totals = useMemo(() => {
    const totalArisan = members.reduce((acc, m) => {
      const amounts = Object.values(m.payments || {});
      return acc + amounts.reduce((s, val) => s + (Number(val) || 0), 0);
    }, 0);
    const totalKasMasuk = transactions.filter(t => t.type === 'in').reduce((acc, t) => acc + t.amount, 0);
    const totalKasKeluar = transactions.filter(t => t.type === 'out').reduce((acc, t) => acc + t.amount, 0);
    const grandTotalMasuk = totalArisan + totalKasMasuk;
    return { totalArisan, totalMasuk: grandTotalMasuk, totalKeluar: totalKasKeluar, sisaSaldo: grandTotalMasuk - totalKasKeluar };
  }, [members, transactions]);

  const combinedTransactions = useMemo(() => {
    const list = [];
    transactions.forEach(t => {
      list.push({
        date: t.date,
        note: t.note,
        category: t.type === 'in' ? 'Kas Masuk' : 'Kas Keluar',
        memberName: t.memberName || 'Umum',
        amount: t.amount,
        type: t.type 
      });
    });
    members.forEach(m => {
      Object.entries(m.payments || {}).forEach(([week, amt]) => {
        if (amt > 0) {
          list.push({
            date: weekDates[week] || `2024-01-01`, 
            note: `Iuran Arisan Minggu Ke-${week}`,
            category: 'Arisan',
            memberName: m.name,
            amount: amt,
            type: 'in'
          });
        }
      });
    });
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, members, weekDates]);

  const paymentSummary = useMemo(() => {
    return members.map(m => {
      const total = Object.values(m.payments || {}).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
      return {
        id: m.id,
        name: m.name,
        totalPaid: total
      };
    }).sort((a, b) => b.totalPaid - a.totalPaid);
  }, [members]);

  const loadScript = (url) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  const generatePDF = async (type) => {
    setIsGeneratingPdf(true);
    try {
      if (!window.jspdf) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      }
      if (!window.jspdf.jsPDF.API.autoTable) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js');
      }

      const { jsPDF } = window.jspdf;
      const docPdf = new jsPDF();
      
      if (type === 'weekly_history') {
        const dateText = weekDates[historyWeek] ? new Date(weekDates[historyWeek]).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-';
        docPdf.setFontSize(18);
        docPdf.text("LAPORAN ARISAN PER MINGGU", 105, 15, { align: 'center' });
        docPdf.setFontSize(11);
        docPdf.text(`Periode: Minggu Ke-${historyWeek} (${dateText})`, 105, 22, { align: 'center' });
        
        const tableRows = members.map((m, i) => [i + 1, m.name, `Rp ${formatRupiah(m.payments?.[historyWeek] || 0)}`, (m.payments?.[historyWeek] || 0) >= TARGET_IURAN ? 'LUNAS' : 'BELUM']);
        docPdf.autoTable({ startY: 30, head: [['No', 'Nama Anggota', 'Setoran', 'Status']], body: tableRows, theme: 'grid' });
      } 
      else if (type === 'rekap_transaksi') {
        docPdf.setFontSize(18);
        docPdf.text("REKAPITULASI SELURUH TRANSAKSI", 105, 15, { align: 'center' });
        docPdf.setFontSize(10);
        docPdf.text(`Dicetak pada: ${new Date().toLocaleString('id-ID')}`, 105, 22, { align: 'center' });
        
        const tableRows = combinedTransactions.map((t, i) => [
          new Date(t.date).toLocaleDateString('id-ID'),
          t.note,
          t.category,
          t.type === 'in' ? `Rp ${formatRupiah(t.amount)}` : '-',
          t.type === 'out' ? `Rp ${formatRupiah(t.amount)}` : '-'
        ]);
        docPdf.autoTable({ 
          startY: 30, 
          head: [['Tanggal', 'Keterangan', 'Kategori', 'Masuk', 'Keluar']], 
          body: tableRows, 
          theme: 'striped',
          headStyles: { fillColor: [30, 41, 59] }
        });
      }
      else if (type === 'rekap_pembayaran') {
        docPdf.setFontSize(18);
        docPdf.text("REKAP PEMBAYARAN ANGGOTA", 105, 15, { align: 'center' });
        docPdf.setFontSize(10);
        docPdf.text(`Total Akumulasi Iuran Seluruh Periode`, 105, 22, { align: 'center' });
        
        const tableRows = paymentSummary.map((m, i) => [i + 1, m.name, `Rp ${formatRupiah(m.totalPaid)}`]);
        docPdf.autoTable({ 
          startY: 30, 
          head: [['No', 'Nama Anggota', 'Total Terbayar']], 
          body: tableRows, 
          theme: 'grid',
          headStyles: { fillColor: [2, 132, 199] }
        });
      }

      docPdf.save(`Laporan_${type}_${Date.now()}.pdf`);
      triggerToast("PDF Berhasil Dibuat!");
    } catch (error) {
      console.error("PDF Error:", error);
      triggerToast("Gagal membuat PDF");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const filteredMembers = members.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-slate-200">
        <div className="w-full max-w-md">
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-[2.5rem] shadow-2xl text-center">
             <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 shadow-lg shadow-blue-900/20">
                <Lock size={32} />
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight uppercase">Sistem Keuangan</h1>
              <p className="text-slate-400 text-sm mt-2 font-medium mb-8">Gunakan PIN Admin untuk Masuk</p>
            <form onSubmit={handleLogin} className="space-y-6 text-left">
              <input type="password" placeholder="••••••" value={pin} onChange={(e) => setPin(e.target.value)} className="w-full bg-slate-800/50 border border-slate-700 text-white text-center text-2xl tracking-[0.5em] py-4 rounded-2xl outline-none focus:border-blue-500 transition-all" maxLength={6} />
              {loginError && <p className="text-red-400 text-xs text-center font-bold">{loginError}</p>}
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-blue-600/20">
                LOGIN <ArrowRight size={18} />
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-40 relative overflow-x-hidden">
      {/* Toast Notif */}
      <div className={`fixed top-6 right-6 z-50 transform transition-all duration-500 flex items-center gap-3 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl border border-slate-700 ${showToast ? 'translate-y-0 opacity-100' : '-translate-y-20 opacity-0 pointer-events-none'}`}>
        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white"><Check size={18} strokeWidth={3} /></div>
        <p className="text-sm font-bold">{toastMsg}</p>
      </div>

      <nav className="bg-white border-b sticky top-0 z-30 px-4 py-4 shadow-sm">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl text-white shadow-lg shadow-blue-500/30"><Wallet size={20} /></div>
            <span className="font-black text-slate-800 tracking-tight text-lg uppercase">Admin Keuangan</span>
          </div>
          <button onClick={() => setIsLoggedIn(false)} className="bg-slate-100 text-slate-600 font-bold text-[10px] flex items-center gap-2 hover:bg-red-50 hover:text-red-600 p-2.5 rounded-xl transition-all uppercase tracking-widest border border-transparent hover:border-red-100">
            <LogOut size={14} /> KELUAR
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 mt-8">
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard Icon={ArrowUpCircle} label="Total Uang Masuk" value={`Rp ${formatRupiah(totals.totalMasuk)}`} color="green" />
              <StatCard Icon={ArrowDownCircle} label="Total Uang Keluar" value={`Rp ${formatRupiah(totals.totalKeluar)}`} color="red" />
              <StatCard Icon={DollarSign} label="Sisa Saldo Kas" value={`Rp ${formatRupiah(totals.sisaSaldo)}`} color="blue" />
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-5"><LayoutDashboard size={150} /></div>
               <h2 className="text-xl font-black text-slate-800 mb-6 uppercase tracking-tight flex items-center gap-2">
                 <LayoutDashboard size={20} className="text-blue-500" /> Ringkasan Keuangan
               </h2>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                 <div className="space-y-4">
                   <div className="p-5 bg-slate-50 rounded-3xl flex justify-between items-center border border-slate-100">
                     <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Iuran Arisan</span>
                     <span className="font-black text-emerald-600">Rp {formatRupiah(totals.totalArisan)}</span>
                   </div>
                   <div className="p-5 bg-slate-50 rounded-3xl flex justify-between items-center border border-slate-100">
                     <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Kas Masuk Lain</span>
                     <span className="font-black text-emerald-600">Rp {formatRupiah(transactions.filter(t=>t.type==='in').reduce((a,c)=>a+c.amount,0))}</span>
                   </div>
                 </div>
                 <div className="space-y-4">
                   <div className="p-5 bg-red-50 rounded-3xl flex justify-between items-center border border-red-100 shadow-sm shadow-red-500/5">
                     <span className="text-xs font-black text-red-600 uppercase tracking-widest">Total Keluar</span>
                     <span className="font-black text-red-700">Rp {formatRupiah(totals.totalKeluar)}</span>
                   </div>
                   <div className="p-5 bg-gradient-to-r from-blue-600 to-blue-700 rounded-3xl text-white flex justify-between items-center shadow-xl shadow-blue-600/20 border border-blue-500">
                     <span className="text-xs font-black opacity-80 uppercase tracking-widest">Saldo Bersih</span>
                     <span className="text-2xl font-black">Rp {formatRupiah(totals.sisaSaldo)}</span>
                   </div>
                 </div>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'arisan' && (
          <div className="animate-in slide-in-from-bottom-4 duration-500 space-y-6">
            <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4">
              <div className="flex flex-col md:flex-row gap-4 bg-white p-3 rounded-[2rem] shadow-sm border border-slate-200 flex-1">
                <div className="flex items-center gap-1 bg-slate-50 rounded-2xl p-1 border border-slate-100">
                  <button onClick={() => setCurrentWeek(prev => Math.max(1, prev - 1))} className="p-2.5 hover:bg-white hover:shadow-md rounded-xl transition-all text-slate-600 active:scale-90"><ChevronLeft size={20} /></button>
                  <div className="px-6 py-1 flex flex-col items-center min-w-[100px]">
                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-0.5">Minggu</span>
                    <span className="text-2xl font-black text-slate-800 leading-none">{currentWeek}</span>
                  </div>
                  <button onClick={() => setCurrentWeek(prev => prev + (prev < MAX_WEEKS_DISPLAY ? 1 : 0))} className="p-2.5 hover:bg-white hover:shadow-md rounded-xl transition-all text-slate-600 active:scale-90"><ChevronRight size={20} /></button>
                </div>
                <div className="flex-1 flex items-center gap-3 px-5 py-2 bg-slate-50 rounded-2xl border border-slate-100">
                  <CalendarDays size={20} className="text-blue-500" />
                  <div className="flex-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1 tracking-widest">Tanggal Periode</p>
                    <input type="date" className="bg-transparent font-bold text-slate-800 outline-none w-full text-sm block cursor-pointer" value={weekDates[currentWeek] || ''} onChange={(e) => { if (!user) return; setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'weeks'), { dates: { ...weekDates, [currentWeek]: e.target.value } }, { merge: true })}} />
                  </div>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="bg-white px-5 py-3 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-3 flex-1 md:w-64">
                    <Search size={18} className="text-slate-400" />
                    <input type="text" placeholder="Cari nama anggota..." className="bg-transparent outline-none text-sm w-full font-bold text-slate-700" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <button onClick={saveAllWeeklyPayments} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-2xl font-black text-xs flex items-center gap-2 shadow-xl shadow-blue-600/20 active:scale-95 transition-all uppercase tracking-widest"><Save size={18} /> Simpan Semua</button>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
                      <th className="px-8 py-5">Nama Anggota</th>
                      <th className="px-8 py-5 text-center">Input Bayar (Rp)</th>
                      <th className="px-8 py-5 text-center">Status</th>
                      <th className="px-8 py-5 text-center w-24">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMembers.map((member) => {
                      const amount = localPayments[member.id]?.[currentWeek] || 0;
                      const serverAmount = member.payments?.[currentWeek] || 0;
                      const isLunas = amount >= TARGET_IURAN;
                      const isModified = amount !== serverAmount;
                      return (
                        <tr key={member.id} className={`transition-colors ${isModified ? 'bg-blue-50/40' : 'hover:bg-slate-50/50'}`}>
                          <td className="px-8 py-5">
                            <span className="font-black text-slate-800 text-sm uppercase block tracking-tight">{member.name}</span>
                          </td>
                          <td className="px-8 py-5 text-center">
                            <div className="relative inline-block">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">Rp</span>
                              <input type="text" className={`w-44 border-2 rounded-xl pl-9 pr-3 py-2 text-sm font-black text-right outline-none transition-all ${isLunas ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-100 focus:border-blue-400 bg-slate-50/50'}`} value={formatRupiah(amount)} onChange={(e) => handleLocalPaymentChange(member.id, currentWeek, e.target.value.replace(/[^0-9]/g, ''))} />
                            </div>
                          </td>
                          <td className="px-8 py-5 text-center">{isLunas ? (<div className="inline-flex items-center gap-1.5 text-green-600 bg-green-100 px-4 py-1.5 rounded-full text-[10px] font-black uppercase shadow-sm border border-green-200"><Check size={14} strokeWidth={3} /> Lunas</div>) : (<div className="inline-flex items-center gap-1.5 text-slate-400 bg-slate-100 px-4 py-1.5 rounded-full text-[10px] font-black uppercase border border-slate-200">Belum</div>)}</td>
                          <td className="px-8 py-5 text-center">{isModified && (<button onClick={() => saveSingleMemberPayment(member.id)} className="p-3 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/30 active:scale-90 hover:bg-blue-500 transition-all"><Save size={18} /></button>)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="animate-in slide-in-from-bottom-4 duration-500 space-y-6">
             <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8">
                  <div className="flex items-center gap-3">
                    <div className="bg-amber-100 text-amber-600 p-4 rounded-[1.5rem] shadow-sm"><History size={24} /></div>
                    <div>
                      <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Riwayat Mingguan</h2>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
                    <select value={historyWeek} onChange={(e) => setHistoryWeek(Number(e.target.value))} className="bg-slate-100 border-2 border-transparent px-6 py-2.5 rounded-xl text-sm font-black text-blue-600 outline-none">
                      {[...Array(MAX_WEEKS_DISPLAY)].map((_, i) => (<option key={i+1} value={i+1}>Minggu ke {i+1}</option>))}
                    </select>
                    <button onClick={() => generatePDF('weekly_history')} disabled={isGeneratingPdf} className="bg-slate-900 text-white px-8 py-3.5 rounded-2xl font-black text-xs flex items-center gap-2">
                      {isGeneratingPdf ? "..." : <Download size={18} />} PDF Minggu Ini
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-[2rem] border border-slate-200 overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest">
                      <tr>
                        <th className="px-8 py-5 w-20 text-center">No</th>
                        <th className="px-8 py-5">Nama Anggota</th>
                        <th className="px-8 py-5 text-center">Setoran</th>
                        <th className="px-8 py-5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {members.map((m, index) => {
                        const amt = m.payments?.[historyWeek] || 0;
                        const isPaid = amt >= TARGET_IURAN;
                        return (
                          <tr key={m.id} className="hover:bg-slate-50">
                            <td className="px-8 py-5 text-center text-xs font-black text-slate-300">{index + 1}</td>
                            <td className="px-8 py-5 font-black text-slate-800 uppercase text-sm">{m.name}</td>
                            <td className="px-8 py-5 text-center font-black text-blue-600">Rp {formatRupiah(amt)}</td>
                            <td className="px-8 py-5 text-center">{amt > 0 ? (isPaid ? 'LUNAS' : 'DICICIL') : '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'kas_masuk' || activeTab === 'kas_keluar' ? (
          <div className="animate-in slide-in-from-bottom-4 duration-500 space-y-6">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
              <h2 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-3 uppercase tracking-tight">
                {activeTab === 'kas_masuk' ? <ArrowUpCircle className="text-emerald-500" size={24} /> : <ArrowDownCircle className="text-red-500" size={24} />}
                KAS {activeTab === 'kas_masuk' ? 'MASUK' : 'KELUAR'} BARU
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tanggal</label>
                  <input type="date" className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl font-black outline-none focus:border-blue-400 focus:bg-white transition-all" value={newTx.date} onChange={e=>setNewTx({...newTx, date: e.target.value})} />
                </div>
                {activeTab === 'kas_masuk' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Sumber / Anggota</label>
                    <select className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl font-black outline-none focus:border-blue-400 focus:bg-white" value={newTx.memberName} onChange={e => setNewTx({...newTx, memberName: e.target.value, note: e.target.value === 'Umum / Lainnya' ? '' : `Setoran kas dari ${e.target.value}`})}>
                        <option value="Umum / Lainnya">Umum / Lainnya</option>
                        {members.map(m => (<option key={m.id} value={m.name}>{m.name}</option>))}
                    </select>
                  </div>
                )}
                <div className={`${activeTab === 'kas_masuk' ? 'md:col-span-1' : 'md:col-span-2'} space-y-2`}>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Keterangan</label>
                  <input type="text" placeholder="Detail transaksi..." className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl font-black outline-none focus:border-blue-400 focus:bg-white" value={newTx.note} onChange={e=>setNewTx({...newTx, note: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nominal (Rp)</label>
                  <input type="text" placeholder="0" className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl font-black outline-none focus:border-blue-400 focus:bg-white" value={formatRupiah(newTx.amount)} onChange={e=>setNewTx({...newTx, amount: e.target.value.replace(/[^0-9]/g, '')})} />
                </div>
              </div>
              <button onClick={() => addTransaction(activeTab === 'kas_masuk' ? 'in' : 'out')} className={`mt-8 w-full py-5 rounded-3xl font-black text-white shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all ${activeTab === 'kas_masuk' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20' : 'bg-red-600 hover:bg-red-500 shadow-red-500/20'}`}><Plus size={24} /> TAMBAH TRANSAKSI</button>
            </div>
          </div>
        ) : null}

        {activeTab === 'rekap_transaksi' && (
          <div className="animate-in fade-in duration-500 space-y-6">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-xl font-black text-slate-800 uppercase">Rekap Transaksi</h2>
                  <button onClick={() => generatePDF('rekap_transaksi')} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-black text-xs uppercase"><Download size={14} className="inline mr-2" /> Cetak PDF</button>
                </div>
                <div className="overflow-x-auto rounded-2xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b">
                      <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <th className="px-8 py-5">Tanggal</th>
                        <th className="px-8 py-5">Keterangan</th>
                        <th className="px-8 py-5 text-right">Masuk</th>
                        <th className="px-8 py-5 text-right">Keluar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {combinedTransactions.map((t, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-8 py-5 text-xs font-black text-slate-400 uppercase">{new Date(t.date).toLocaleDateString('id-ID')}</td>
                          <td className="px-8 py-5 text-sm font-black text-slate-800 uppercase">{t.note}</td>
                          <td className="px-8 py-5 text-right font-black text-emerald-600">{t.type === 'in' ? `Rp ${formatRupiah(t.amount)}` : '-'}</td>
                          <td className="px-8 py-5 text-right font-black text-red-600">{t.type === 'out' ? `Rp ${formatRupiah(t.amount)}` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            </div>
          </div>
        )}

        {activeTab === 'rekap_pembayaran' && (
          <div className="animate-in fade-in duration-500 space-y-6">
             <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-xl font-black text-slate-800 uppercase">Akumulasi Pembayaran</h2>
                  <button onClick={() => generatePDF('rekap_pembayaran')} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black text-xs uppercase"><Download size={14} className="inline mr-2" /> Cetak PDF</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {paymentSummary.map((m, i) => (
                    <div key={m.id} className="p-6 bg-slate-50 border border-slate-100 rounded-2xl flex justify-between items-center">
                      <span className="font-black text-slate-800 uppercase text-xs">{i+1}. {m.name}</span>
                      <span className="font-black text-emerald-600">Rp {formatRupiah(m.totalPaid)}</span>
                    </div>
                  ))}
                </div>
             </div>
          </div>
        )}
      </div>

      {/* Navigasi Bawah */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/70 backdrop-blur-xl border-t border-slate-200 px-4 py-6 z-40 shadow-2xl">
        <div className="max-w-4xl mx-auto flex justify-between items-center bg-slate-900 rounded-3xl p-1.5 shadow-2xl shadow-slate-900/40 overflow-x-auto">
          <NavBtn active={activeTab === 'dashboard'} onClick={()=>setActiveTab('dashboard')} Icon={LayoutDashboard} label="Home" />
          <NavBtn active={activeTab === 'arisan'} onClick={()=>setActiveTab('arisan')} Icon={Users} label="Arisan" />
          <NavBtn active={activeTab === 'history'} onClick={()=>setActiveTab('history')} Icon={History} label="Periode" />
          <div className="w-[1px] h-8 bg-slate-700/50 mx-1 shrink-0"></div>
          <NavBtn active={activeTab === 'rekap_transaksi'} onClick={()=>setActiveTab('rekap_transaksi')} Icon={Receipt} label="Transaksi" />
          <NavBtn active={activeTab === 'rekap_pembayaran'} onClick={()=>setActiveTab('rekap_pembayaran')} Icon={ListChecks} label="Anggota" />
          <div className="w-[1px] h-8 bg-slate-700/50 mx-1 shrink-0"></div>
          <NavBtn active={activeTab === 'kas_masuk'} onClick={()=>setActiveTab('kas_masuk')} Icon={ArrowUpCircle} label="Masuk" />
          <NavBtn active={activeTab === 'kas_keluar'} onClick={()=>setActiveTab('kas_keluar')} Icon={ArrowDownCircle} label="Keluar" />
        </div>
      </div>
    </div>
  );
};

const NavBtn = ({ active, onClick, Icon, label }) => (
  <button onClick={onClick} className={`flex-1 min-w-[70px] flex flex-col items-center gap-1.5 py-3.5 rounded-[1.25rem] transition-all duration-300 ${active ? 'bg-blue-600 text-white shadow-xl scale-105 z-10' : 'text-slate-500 hover:text-white'}`}>
    <Icon size={18} />
    <span className="text-[7px] font-black uppercase tracking-[0.1em] leading-none">{label}</span>
  </button>
);

const StatCard = ({ Icon, label, value, color }) => {
  const styles = { green: "text-emerald-600 bg-emerald-50 border-emerald-100", blue: "text-blue-600 bg-blue-50 border-blue-100", red: "text-red-600 bg-red-50 border-red-100" };
  return (
    <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4 group">
      <div className={`p-4 rounded-2xl ${styles[color]} border shadow-sm group-hover:scale-110 transition-transform`}><Icon size={28} /></div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">{label}</p>
        <p className={`text-xl font-black tracking-tight ${color==='red'?'text-red-700':color==='green'?'text-emerald-700':'text-blue-700'}`}>{value}</p>
      </div>
    </div>
  );
};

export default App;