import { useState } from 'react';
import { Pencil, Plus, Search } from 'lucide-react';
import { queryString, useApi, useOptions, useWrite } from '../api';
import type { Category, Page, Product } from '../types';
import { Empty, ErrorBox, Field, Form, Loading, Modal, PageHeading, Pagination, Panel, fieldValue, useNotice } from '../components/ui';

function isProduct(value: Category | Product): value is Product { return 'sku' in value; }

export default function Catalog() {
  const [tab, setTab] = useState<'products' | 'categories'>('products');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('');
  const [editing, setEditing] = useState<Product | Category | 'new' | null>(null);
  const products = useApi<Page<Product>>(`/api/products?${queryString({ page, pageSize: 12, search, active })}`, tab === 'products');
  const categories = useApi<Page<Category>>(`/api/categories?page=${page}&pageSize=12`, tab === 'categories');
  const options = useOptions<Category>('/api/categories');
  const write = useWrite();
  const notify = useNotice();
  const selected = editing && editing !== 'new' ? editing : null;
  const product = selected && isProduct(selected) ? selected : null;
  async function save(data: FormData) {
    const body = tab === 'categories' ? { name: fieldValue(data, 'name') } : { name: fieldValue(data, 'name'), sku: fieldValue(data, 'sku'), barcode: fieldValue(data, 'barcode') || null, categoryId: fieldValue(data, 'categoryId'), active: data.get('active') === 'on' };
    await write.mutateAsync({ path: `/api/${tab}${selected ? `/${selected.id}` : ''}`, method: selected ? 'PATCH' : 'POST', body });
    setEditing(null); notify(selected ? 'Cadastro atualizado.' : 'Cadastro criado com sucesso.');
  }
  const query = tab === 'products' ? products : categories;
  return <><PageHeading eyebrow="BASE DO SEU ESTOQUE" title="Produtos e categorias" description="Organize seu catálogo para acompanhar cada produto com precisão." action={<button className="btn-primary" onClick={() => setEditing('new')}><Plus size={17} />{tab === 'products' ? 'Novo produto' : 'Nova categoria'}</button>} />
    <div className="tabs" role="group" aria-label="Tipo de cadastro"><button aria-pressed={tab === 'products'} className={tab === 'products' ? 'selected' : ''} onClick={() => { setTab('products'); setPage(1); }}>Produtos</button><button aria-pressed={tab === 'categories'} className={tab === 'categories' ? 'selected' : ''} onClick={() => { setTab('categories'); setPage(1); }}>Categorias</button></div>
    <Panel>{tab === 'products' && <div className="filters"><label className="search-field"><Search size={17} /><input aria-label="Buscar produtos" type="search" maxLength={160} placeholder="Buscar por produto, SKU ou código de barras" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></label><select aria-label="Situação do produto" value={active} onChange={e => { setActive(e.target.value); setPage(1); }}><option value="">Todos os produtos</option><option value="true">Ativos</option><option value="false">Inativos</option></select></div>}
      <ErrorBox error={query.error} retry={() => void query.refetch()} />{query.isPending ? <Loading /> : query.data?.data.length ? <div className="table-scroll"><table><thead><tr><th>{tab === 'products' ? 'Produto' : 'Categoria'}</th>{tab === 'products' && <><th>SKU</th><th>Categoria</th><th>Situação</th></>}<th><span className="sr-only">Ações</span></th></tr></thead><tbody>{tab === 'products' ? products.data?.data.map(item => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.barcode || 'Sem código de barras'}</small></td><td className="font-mono">{item.sku}</td><td>{item.category.name}</td><td><span className={`badge ${item.active ? 'green' : 'gray'}`}><span />{item.active ? 'Ativo' : 'Inativo'}</span></td><td><button className="btn-secondary btn-small" onClick={() => setEditing(item)} aria-label={`Editar ${item.name}`}><Pencil size={14} />Editar</button></td></tr>) : categories.data?.data.map(item => <tr key={item.id}><td><strong>{item.name}</strong></td><td><button className="btn-secondary btn-small" onClick={() => setEditing(item)} aria-label={`Editar ${item.name}`}><Pencil size={14} />Editar</button></td></tr>)}</tbody></table></div> : !query.error && <Empty title={tab === 'products' ? 'Seu catálogo começa aqui' : 'Organize os produtos por categoria'} text={tab === 'products' ? 'Cadastre uma categoria e adicione seu primeiro produto.' : 'Crie categorias como Laticínios, Padaria e Hortifrúti.'} />}
      <Pagination meta={query.data?.pagination} onChange={setPage} /></Panel>
    {editing && <Modal title={`${selected ? 'Editar' : 'Cadastrar'} ${tab === 'products' ? 'produto' : 'categoria'}`} onClose={() => setEditing(null)}><Form onSave={save}><Field label="Nome"><input name="name" required maxLength={tab === 'products' ? 160 : 100} defaultValue={selected?.name} autoFocus /></Field>{tab === 'products' && <><div className="form-grid"><Field label="SKU"><input name="sku" required maxLength={60} defaultValue={product?.sku} placeholder="Ex.: IOG-001" /></Field><Field label="Código de barras (opcional)"><input name="barcode" maxLength={40} defaultValue={product?.barcode ?? ''} /></Field></div><Field label="Categoria"><select name="categoryId" required defaultValue={product?.categoryId ?? ''}><option value="">Selecione uma categoria</option>{options.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><ErrorBox error={options.error} />{options.data?.length === 0 && <p className="text-sm text-amber-800">Cadastre uma categoria antes de criar o produto.</p>}<label className="checkbox-label"><input name="active" type="checkbox" defaultChecked={product?.active ?? true} />Produto ativo para novos lotes</label></>}</Form></Modal>}
  </>;
}
