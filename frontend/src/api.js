import catalog from '../../catalog.json';
export const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4102/api';
export const isDemo = () => localStorage.getItem('shopcore-demo') === 'true';
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const demoUsers = [
  { id: 'customer', name: 'Alex Morgan', email: 'demo@shopcore.test', role: 'user' },
  { id: 'seller', name: 'Jamie Ellis', email: 'seller@shopcore.test', role: 'seller' },
  { id: 'seller2', name: 'Taylor Reed', email: 'seller2@shopcore.test', role: 'seller' },
  { id: 'admin', name: 'Store Admin', email: 'admin@shopcore.test', role: 'admin' }
];
export async function request(path, options = {}) {
  if (isDemo()) {
    const body = JSON.parse(options.body || '{}');
    const products = read('market-products-v1', catalog);
    const initialShops = [...new Map(catalog.map(p => [p.shop._id, { ...p.shop, owner: p.shop._id.endsWith('1') ? 'seller' : 'seller2' }])).values()];
    const shops = read('market-shops-v1', initialShops);
    if (path === '/products' && !options.method) return { items: products.filter(p => p.active !== false) };
    if (path === '/shops' && !options.method) return shops;
    if (path === '/auth/login') {
      const user = demoUsers.find(u => u.email === body.email);
      if (!user || body.password !== 'ShopCore@123') throw new Error('Use the demo credentials shown below.');
      return { token: 'local-demo-' + user.id, user };
    }
    if (path === '/auth/register') throw new Error('Switch to the live store to create an account.');
    const user = demoUsers.find(u => 'local-demo-' + u.id === localStorage.getItem('token'));
    if (!user) throw new Error('Please sign in to continue.');
    if (path === '/auth/me') return user;
    const staff = ['seller', 'admin'].includes(user.role);
    const ownsShop = id => user.role === 'admin' || shops.some(s => s._id === id && s.owner === user.id);
    const orders = read('market-orders-v1', [{ _id: 'demo-order-1001', user: { name: 'Alex Morgan' }, total: 999, items: [{ product: catalog[4]._id, shop: catalog[4].shop._id, name: catalog[4].name, price: 999, quantity: 1, status: 'fulfilled' }], status: 'fulfilled', createdAt: '2026-10-20T10:00:00Z' }]);
    if (path.startsWith('/manage/') || path === '/shops' || path.startsWith('/products')) {
      if (!staff) throw new Error('Seller access required');
      if (path === '/manage/products') return { shops: shops.filter(s => ownsShop(s._id)), products: products.filter(p => ownsShop(p.shop?._id)) };
      if (path === '/manage/orders') return orders.filter(o => o.items.some(i => ownsShop(i.shop))).map(o => { const items = o.items.filter(i => ownsShop(i.shop)); return { ...o, items, total: items.reduce((n, i) => n + i.price * i.quantity, 0) }; });
      if (path === '/shops' && options.method === 'POST') {
        if (!body.name?.trim()) throw new Error('Shop name required');
        const shop = { _id: crypto.randomUUID(), name: body.name.trim(), description: body.description, owner: user.id };
        save('market-shops-v1', [...shops, shop]); return shop;
      }
      if (path === '/products' && options.method === 'POST') {
        if (!ownsShop(body.shop)) throw new Error('This shop belongs to another seller');
        if (!body.name?.trim() || !Number.isFinite(body.price) || body.price < 0 || !Number.isInteger(body.stock) || body.stock < 0) throw new Error('Valid name, price and stock required');
        const p = { ...body, _id: crypto.randomUUID(), shop: shops.find(s => s._id === body.shop), rating: 0, reviewCount: 0, active: true };
        save('market-products-v1', [...products, p]); return p;
      }
      if (path.startsWith('/products/') && options.method === 'PATCH') {
        const p = products.find(p => p._id === path.split('/')[2]);
        if (!p || !ownsShop(p.shop?._id)) throw new Error('This product belongs to another seller');
        if (body.price !== undefined && (!Number.isFinite(body.price) || body.price < 0) || body.stock !== undefined && (!Number.isInteger(body.stock) || body.stock < 0)) throw new Error('Invalid price or stock');
        const allowed = Object.fromEntries(Object.entries(body).filter(([key]) => ['name', 'description', 'category', 'price', 'stock', 'active'].includes(key)));
        save('market-products-v1', products.map(x => x._id === p._id ? { ...x, ...allowed } : x)); return { ...p, ...allowed };
      }
      if (path.endsWith('/fulfill') && options.method === 'PATCH') {
        const order = orders.find(o => o._id === path.split('/')[3]);
        if (!order || !order.items.some(i => ownsShop(i.shop))) throw new Error('Order unavailable');
        const items = order.items.map(i => ownsShop(i.shop) ? { ...i, status: 'fulfilled' } : i);
        save('market-orders-v1', orders.map(o => o._id === order._id ? { ...o, items, status: items.every(i => i.status === 'fulfilled') ? 'fulfilled' : 'placed' } : o)); return { ok: true };
      }
    }
    if (path === '/orders' && options.method === 'POST') {
      if (user.role !== 'user') throw new Error('Use a customer account to shop');
      if (!body.items?.length || new Set(body.items.map(i => i.product)).size !== body.items.length) throw new Error('Invalid cart');
      const items = body.items.map(item => {
        const product = products.find(p => p._id === item.product);
        if (!product || product.active === false || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > product.stock) throw new Error('One of your items is no longer available in that quantity.');
        return { ...item, shop: product.shop?._id, name: product.name, price: product.price, status: 'placed' };
      });
      const order = { _id: `demo-${Date.now()}`, user: { name: user.name }, items, total: items.reduce((sum, p) => sum + p.price * p.quantity, 0), status: 'placed', createdAt: new Date().toISOString() };
      save('market-products-v1', products.map(p => ({ ...p, stock: p.stock - (items.find(i => i.product === p._id)?.quantity || 0) })));
      save('market-orders-v1', [order, ...orders]); return order;
    }
    if (path === '/orders') return user.role === 'user' ? orders : [];
    throw new Error('This action requires the live API.');
  }
  const token = localStorage.getItem('token');
  let res;
  try { res = await fetch(BASE + path, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } }); }
  catch { throw new Error('Cannot reach the store API. Start the backend or try the interactive demo.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.errors?.map(e => e.msg).join(', ') || 'Request failed');
  return data;
}
