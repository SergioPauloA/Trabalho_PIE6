import { useEffect, useState } from 'react';
import { BarChart3, Boxes, ChartNoAxesCombined, Check, ChevronRight, CircleHelp, ClipboardList, LayoutDashboard, Leaf, Menu, Package, Settings as SettingsIcon, ShoppingBasket, Tag, X } from 'lucide-react';
import { useApi } from './api';
import { NoticeContext } from './components/ui';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Catalog from './pages/Catalog';
import Promotions from './pages/Promotions';
import Movements from './pages/Movements';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';

const navigation = [
  { id: 'painel', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'estoque', label: 'Estoque e validades', icon: Boxes },
  { id: 'cadastros', label: 'Produtos e categorias', icon: Package },
  { id: 'promocoes', label: 'Promoções', icon: Tag },
  { id: 'movimentacoes', label: 'Vendas e descartes', icon: ShoppingBasket },
  { id: 'analises', label: 'Análises e resultados', icon: ChartNoAxesCombined },
  { id: 'configuracoes', label: 'Configurações', icon: SettingsIcon },
] as const;
function currentPage() { const id = window.location.hash.slice(1); return navigation.some(item => item.id === id) ? id : 'painel'; }
export default function App() {
  const [page, setPage] = useState(currentPage);
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState('');
  const health = useApi<{ status: string }>('/health');
  useEffect(() => { const update = () => { setPage(currentPage()); setMenu(false); }; window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { document.title = `${navigation.find(item => item.id === page)?.label} | Mercelume`; }, [page]);
  useEffect(() => { if (!menu) return; const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(false); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [menu]);
  return <NoticeContext.Provider value={setNotice}><div className="app-shell"><a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Pular para o conteúdo</a>{menu && <button className="sidebar-overlay" aria-label="Fechar menu" onClick={() => setMenu(false)} />}
    <aside id="navigation" className={`sidebar ${menu ? 'is-open' : ''}`}><a href="#painel" className="brand"><span className="brand-icon"><Leaf size={23} /></span><span>Merce<span className="text-lime-200">lume</span><small>MENOS PERDAS. MAIS CONTROLE.</small></span></a><button className="mobile-close" onClick={() => setMenu(false)} aria-label="Fechar navegação"><X size={20} /></button>
      <div className="sidebar-label">GESTÃO DO ESTABELECIMENTO</div><nav aria-label="Navegação principal">{navigation.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} className={page === id ? 'nav-item active' : 'nav-item'} aria-current={page === id ? 'page' : undefined}><Icon size={19} /><span>{label}</span>{page === id && <ChevronRight size={15} />}</a>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-tip"><BarChart3 size={23} /><strong>Cada tonelada conta.</strong><p>Acompanhe as validades e transforme atenção em ação.</p></div><div className="workspace"><span><ClipboardList size={18} /></span><div>Meu estabelecimento<small>Gestão de estoque</small></div></div></div>
    </aside>
    <div className="workspace-main"><header className="topbar"><div className="flex items-center gap-3"><button className="btn-icon lg:hidden" aria-label="Abrir menu" aria-expanded={menu} aria-controls="navigation" onClick={() => setMenu(!menu)}><Menu size={21} /></button><span className="text-slate-400 hidden sm:inline">Estabelecimento</span><ChevronRight size={14} className="text-slate-300 hidden sm:block" /><span className="font-medium">{navigation.find(item => item.id === page)?.label}</span></div><div className={`connection ${health.isError ? 'offline' : ''}`} title={health.error?.message}><span />{health.isPending ? 'Conectando' : health.isError ? 'Sem conexão' : 'Sistema conectado'}</div></header>
      <main id="main-content" tabIndex={-1}>{page === 'painel' && <Dashboard />}{page === 'estoque' && <Inventory />}{page === 'cadastros' && <Catalog />}{page === 'promocoes' && <Promotions />}{page === 'movimentacoes' && <Movements />}{page === 'analises' && <Analytics />}{page === 'configuracoes' && <Settings />}</main><footer className="app-footer"><span>Mercelume · Gestão inteligente de estoque</span><span><CircleHelp size={13} /> Quantidades em t · Preços em R$/t · Horário de Brasília</span></footer>
    </div>{notice && <div className="toast" role="status"><Check size={20} /><span>{notice}</span><button aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={17} /></button></div>}
  </div></NoticeContext.Provider>;
}
