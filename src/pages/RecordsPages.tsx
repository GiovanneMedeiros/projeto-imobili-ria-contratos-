import { Building2, Pencil, Plus, Search, UserRound, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { listClients, listProperties, saveClient, saveProperty } from '../services/records'
import { formatDocument, formatPhone, formatPostalCode, formatPropertyAddress, isValidCpfCnpj } from '../utils/format'
import type { Client, Property } from '../types/domain'

interface ClientDraft {
  name: string
  document: string
  phone: string
  email: string
  address: string
  notes: string
}

const emptyClient: ClientDraft = { name: '', document: '', phone: '', email: '', address: '', notes: '' }

export function ClientEditor({ client, onClose, onSaved }: { client?: Client; onClose: () => void; onSaved: (client: Client) => void }) {
  const { user } = useAuth()
  const [draft, setDraft] = useState<ClientDraft>(client ? { ...emptyClient, ...client } : emptyClient)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function change(key: keyof ClientDraft, value: string) {
    const formatted = key === 'document' ? formatDocument(value) : key === 'phone' ? formatPhone(value) : value
    setDraft((current) => ({ ...current, [key]: formatted }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isValidCpfCnpj(draft.document)) return setError('Informe um CPF/CNPJ válido.')
    if (!user) return setError('Sua sessão expirou. Entre novamente para continuar.')
    setBusy(true)
    setError('')
    try {
      const saved = await saveClient(draft, user.id, client?.id)
      onSaved(saved)
    } catch (saveError) {
      setError(saveError instanceof Error && /duplicate|unique/i.test(saveError.message) ? 'Já existe um cliente cadastrado com este CPF/CNPJ.' : 'Não foi possível salvar o cliente. Verifique os dados e tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="record-modal" role="dialog" aria-modal="true" aria-labelledby="client-modal-title"><header><div><span className="section-overline">CADASTRO · CLIENTES</span><h2 id="client-modal-title">{client ? 'Editar cliente' : 'Novo cliente'}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={17} /></button></header><form onSubmit={(event) => void submit(event)}><div className="record-form-grid"><label className="editor-field field-wide">Nome completo<input value={draft.name} onChange={(event) => change('name', event.target.value)} required /></label><label className="editor-field">CPF/CNPJ<input value={draft.document} onChange={(event) => change('document', event.target.value)} required /></label><label className="editor-field">Telefone<input type="tel" value={draft.phone} onChange={(event) => change('phone', event.target.value)} /></label><label className="editor-field">E-mail<input type="email" value={draft.email} onChange={(event) => change('email', event.target.value)} /></label><label className="editor-field field-wide">Endereço<input value={draft.address} onChange={(event) => change('address', event.target.value)} /></label><label className="editor-field field-wide">Observações<textarea rows={3} value={draft.notes} onChange={(event) => change('notes', event.target.value)} /></label></div>{error && <div className="inline-alert" role="alert">{error}</div>}<footer><button className="outline-button" type="button" onClick={onClose}>Cancelar</button><button className="gold-button" type="submit" disabled={busy}>{busy ? 'Salvando...' : client ? 'Salvar alterações' : 'Cadastrar cliente'}</button></footer></form></section></div>
}

interface PropertyDraft {
  code: string
  address: string
  number: string
  complement: string
  neighborhood: string
  city: string
  state: string
  postalCode: string
  kind: string
  area: string
  bedrooms: string
  bathrooms: string
  ownerId: string
  notes: string
}

const emptyProperty: PropertyDraft = { code: '', address: '', number: '', complement: '', neighborhood: '', city: '', state: '', postalCode: '', kind: 'Residencial', area: '', bedrooms: '', bathrooms: '', ownerId: '', notes: '' }

export function PropertyEditor({ property, clients, onClose, onSaved }: { property?: Property; clients: Client[]; onClose: () => void; onSaved: (property: Property) => void }) {
  const { user } = useAuth()
  const [draft, setDraft] = useState<PropertyDraft>(property ? { ...emptyProperty, ...property, area: property.area?.toString() ?? '', bedrooms: property.bedrooms?.toString() ?? '', bathrooms: property.bathrooms?.toString() ?? '', ownerId: property.ownerId ?? '' } : emptyProperty)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  function change(key: keyof PropertyDraft, value: string) {
    setDraft((current) => ({ ...current, [key]: key === 'postalCode' ? formatPostalCode(value) : value }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return setError('Sua sessão expirou. Entre novamente para continuar.')
    setBusy(true)
    setError('')
    try {
      const saved = await saveProperty({ code: draft.code, address: draft.address, number: draft.number, complement: draft.complement, neighborhood: draft.neighborhood, city: draft.city, state: draft.state.toUpperCase(), postalCode: draft.postalCode, kind: draft.kind, area: draft.area ? Number(draft.area) : undefined, bedrooms: draft.bedrooms ? Number(draft.bedrooms) : undefined, bathrooms: draft.bathrooms ? Number(draft.bathrooms) : undefined, ownerId: draft.ownerId || undefined, notes: draft.notes }, user.id, property?.id)
      onSaved(saved)
    } catch {
      setError('Não foi possível salvar o imóvel. Confira se o código já está cadastrado.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="record-modal" role="dialog" aria-modal="true" aria-labelledby="property-modal-title"><header><div><span className="section-overline">CADASTRO · IMÓVEIS</span><h2 id="property-modal-title">{property ? 'Editar imóvel' : 'Novo imóvel'}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={17} /></button></header><form onSubmit={(event) => void submit(event)}><div className="record-form-grid"><label className="editor-field">Código<input value={draft.code} onChange={(event) => change('code', event.target.value)} required /></label><label className="editor-field">Tipo<select value={draft.kind} onChange={(event) => change('kind', event.target.value)}><option>Residencial</option><option>Apartamento</option><option>Casa</option><option>Comercial</option><option>Terreno</option><option>Outro</option></select></label><label className="editor-field field-wide">Endereço<input value={draft.address} onChange={(event) => change('address', event.target.value)} required /></label><label className="editor-field">Número<input value={draft.number} onChange={(event) => change('number', event.target.value)} /></label><label className="editor-field">Complemento<input value={draft.complement} onChange={(event) => change('complement', event.target.value)} /></label><label className="editor-field">Bairro<input value={draft.neighborhood} onChange={(event) => change('neighborhood', event.target.value)} /></label><label className="editor-field">CEP<input value={draft.postalCode} onChange={(event) => change('postalCode', event.target.value)} inputMode="numeric" /></label><label className="editor-field">Cidade<input value={draft.city} onChange={(event) => change('city', event.target.value)} required /></label><label className="editor-field">Estado<input value={draft.state} onChange={(event) => change('state', event.target.value.toUpperCase().slice(0, 2))} maxLength={2} required /></label><label className="editor-field">Área (m²)<input type="number" min="0" step="0.01" value={draft.area} onChange={(event) => change('area', event.target.value)} /></label><label className="editor-field">Quartos<input type="number" min="0" value={draft.bedrooms} onChange={(event) => change('bedrooms', event.target.value)} /></label><label className="editor-field">Banheiros<input type="number" min="0" value={draft.bathrooms} onChange={(event) => change('bathrooms', event.target.value)} /></label><label className="editor-field field-wide">Proprietário<select value={draft.ownerId} onChange={(event) => change('ownerId', event.target.value)}><option value="">Selecionar cliente</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label><label className="editor-field field-wide">Observações<textarea rows={3} value={draft.notes} onChange={(event) => change('notes', event.target.value)} /></label></div>{error && <div className="inline-alert" role="alert">{error}</div>}<footer><button className="outline-button" type="button" onClick={onClose}>Cancelar</button><button className="gold-button" type="submit" disabled={busy}>{busy ? 'Salvando...' : property ? 'Salvar alterações' : 'Cadastrar imóvel'}</button></footer></form></section></div>
}

export function ClientsPage() {
  const { demo } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Client | undefined>()
  const [createOpen, setCreateOpen] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function refresh() { setClients(await listClients()) }
  useEffect(() => {
    let active = true
    void listClients().then((items) => { if (active) setClients(items) }).catch(() => { if (active) setError('Não foi possível carregar os clientes.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const filtered = clients.filter((client) => `${client.name} ${client.document} ${client.phone} ${client.email}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))

  return <div className="records-page"><section className="page-heading-row"><div><span className="section-overline">BASE INTERNA · CADASTROS</span><h1>Clientes</h1><p>Encontre e mantenha os dados dos clientes da imobiliária.</p></div><button className="gold-button" type="button" onClick={() => setCreateOpen(true)}><Plus size={16} />Novo cliente</button></section>
    {demo && <div className="demo-warning"><span className="demo-badge"><i />DEMONSTRAÇÃO</span>Cadastros identificados como demonstração. Não adicione dados reais neste ambiente.</div>}{error && <div className="inline-alert" role="alert">{error}</div>}
    <section className="records-table-section"><div className="history-toolbar"><label className="search-control"><Search size={16} /><input aria-label="Buscar cliente" placeholder="Buscar por nome, CPF/CNPJ, telefone..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><span className="template-total">{filtered.length} clientes</span></div><div className="records-grid">{filtered.map((client) => <article className="record-card" key={client.id}><span className="record-icon"><UserRound size={17} /></span><div className="record-card-copy"><strong>{client.name}</strong><span>{client.document}</span><small>{client.phone || 'Sem telefone'} · {client.email || 'Sem e-mail'}</small><small>{client.address || 'Endereço não informado'}</small></div><button className="icon-button" type="button" onClick={() => setEditing(client)} title="Editar" aria-label={`Editar ${client.name}`}><Pencil size={15} /></button></article>)}{!loading && filtered.length === 0 && <div className="records-empty">Nenhum cliente encontrado.</div>}{loading && <div className="records-empty">Carregando clientes...</div>}</div></section>
    {(createOpen || editing) && <ClientEditor client={editing} onClose={() => { setCreateOpen(false); setEditing(undefined) }} onSaved={() => { setCreateOpen(false); setEditing(undefined); void refresh() }} />}
  </div>
}

export function PropertiesPage() {
  const { demo } = useAuth()
  const [properties, setProperties] = useState<Property[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Property | undefined>()
  const [createOpen, setCreateOpen] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function refresh() {
    const items = await listProperties()
    setProperties(items)
  }
  useEffect(() => {
    let active = true
    void Promise.all([listProperties(), listClients()]).then(([propertyList, clientList]) => { if (active) { setProperties(propertyList); setClients(clientList) } }).catch(() => { if (active) setError('Não foi possível carregar os imóveis.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const filtered = properties.filter((property) => `${property.code} ${property.address} ${property.city} ${property.kind}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))

  return <div className="records-page"><section className="page-heading-row"><div><span className="section-overline">BASE INTERNA · CADASTROS</span><h1>Imóveis</h1><p>Localize e atualize os imóveis disponíveis para contratos.</p></div><button className="gold-button" type="button" onClick={() => setCreateOpen(true)}><Plus size={16} />Novo imóvel</button></section>
    {demo && <div className="demo-warning"><span className="demo-badge"><i />DEMONSTRAÇÃO</span>Cadastros identificados como demonstração. Não adicione dados reais neste ambiente.</div>}{error && <div className="inline-alert" role="alert">{error}</div>}
    <section className="records-table-section"><div className="history-toolbar"><label className="search-control"><Search size={16} /><input aria-label="Buscar imóvel" placeholder="Buscar por código, endereço, cidade..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><span className="template-total">{filtered.length} imóveis</span></div><div className="records-grid">{filtered.map((property) => <article className="record-card" key={property.id}><span className="record-icon"><Building2 size={17} /></span><div className="record-card-copy"><strong>{property.code} · {formatPropertyAddress(property)}</strong><span>{property.city}/{property.state} · {property.kind}</span><small>{property.area ? `${property.area.toLocaleString('pt-BR')} m² · ` : ''}{property.bedrooms ?? '—'} quartos · {property.bathrooms ?? '—'} banheiros</small><small>Proprietário: {clients.find((client) => client.id === property.ownerId)?.name ?? 'Não informado'}</small></div><button className="icon-button" type="button" onClick={() => setEditing(property)} title="Editar" aria-label={`Editar imóvel ${property.code}`}><Pencil size={15} /></button></article>)}{!loading && filtered.length === 0 && <div className="records-empty">Nenhum imóvel encontrado.</div>}{loading && <div className="records-empty">Carregando imóveis...</div>}</div></section>
    {(createOpen || editing) && <PropertyEditor property={editing} clients={clients} onClose={() => { setCreateOpen(false); setEditing(undefined) }} onSaved={() => { setCreateOpen(false); setEditing(undefined); void refresh() }} />}
  </div>
}