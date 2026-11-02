import { Router } from 'express';
import mongoose from 'mongoose';
import { auth, admin } from './core.js';
export const Shop = mongoose.model('Shop', new mongoose.Schema({ name: { type: String, required: true, trim: true }, owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, description: String }, { timestamps: true }));
const Product = mongoose.model('Product', new mongoose.Schema({ name: { type: String, required: true, trim: true }, description: String, art: String, color: String, tag: String, shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' }, rating: { type: Number, default: 0, min: 0, max: 5 }, reviewCount: { type: Number, default: 0 }, category: { type: String, default: 'General' }, price: { type: Number, min: 0, required: true }, stock: { type: Number, min: 0, default: 0 }, active: { type: Boolean, default: true } }, { timestamps: true }));
const Order = mongoose.model('Order', new mongoose.Schema({ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, items: [{ product: mongoose.Schema.Types.ObjectId, shop: mongoose.Schema.Types.ObjectId, name: String, price: Number, quantity: Number, status: { type: String, enum: ['placed', 'fulfilled'], default: 'placed' } }], total: Number, status: { type: String, enum: ['placed', 'fulfilled', 'cancelled'], default: 'placed' } }, { timestamps: true }));
export const apiRouter = Router();
const staff = (req, res, next) => ['seller', 'admin'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Seller access required' });
const validId = id => mongoose.isValidObjectId(id);
const wrap = handler => async (req, res, next) => { try { await handler(req, res); } catch (error) { if (error.name === 'ValidationError' || error.name === 'CastError') return res.status(400).json({ error: 'Invalid field values' }); next(error); } };
apiRouter.get('/shops', wrap(async (req, res) => res.json(await Shop.find().select('name description').lean())));
apiRouter.get('/products', wrap(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1), limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 100));
  const filter = { active: true };
  if (req.query.shop) { if (!validId(req.query.shop)) return res.status(400).json({ error: 'Invalid shop' }); filter.shop = req.query.shop; }
  if (req.query.category) filter.category = req.query.category;
  const [items, total] = await Promise.all([Product.find(filter).populate('shop', 'name').skip((page - 1) * limit).limit(limit).lean(), Product.countDocuments(filter)]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));
apiRouter.get('/manage/products', auth, staff, wrap(async (req, res) => {
  const shops = await Shop.find(req.user.role === 'admin' ? {} : { owner: req.user.id }).lean();
  const products = await Product.find(req.user.role === 'admin' ? {} : { shop: { $in: shops.map(s => s._id) } }).populate('shop', 'name').lean();
  res.json({ shops, products });
}));
apiRouter.post('/shops', auth, staff, wrap(async (req, res) => {
  if (typeof req.body.name !== 'string' || !req.body.name.trim() || req.body.name.length > 80) return res.status(400).json({ error: 'Shop name is required (up to 80 characters)' });
  res.status(201).json(await Shop.create({ name: req.body.name, description: req.body.description, owner: req.user.id }));
}));
apiRouter.post('/products', auth, staff, wrap(async (req, res) => {
  const { name, description, category, price, stock, shop, art, color } = req.body;
  if (typeof name !== 'string' || !name.trim() || name.length > 120 || typeof price !== 'number' || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0 || !validId(shop)) return res.status(400).json({ error: 'Valid name, shop, numeric price and whole-number stock required' });
  const store = await Shop.findById(shop);
  if (!store || (req.user.role !== 'admin' && String(store.owner) !== req.user.id)) return res.status(403).json({ error: 'You can only add products to your own shop' });
  res.status(201).json(await Product.create({ name, description, category, price, stock, shop, art, color }));
}));
apiRouter.patch('/products/:id', auth, staff, wrap(async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'Product not found' });
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const shop = product.shop && await Shop.findById(product.shop);
  if (req.user.role !== 'admin' && (!shop || String(shop.owner) !== req.user.id)) return res.status(403).json({ error: 'This product belongs to another seller' });
  if (req.body.price !== undefined && (typeof req.body.price !== 'number' || !Number.isFinite(req.body.price) || req.body.price < 0) || req.body.stock !== undefined && (!Number.isInteger(req.body.stock) || req.body.stock < 0) || req.body.active !== undefined && typeof req.body.active !== 'boolean') return res.status(400).json({ error: 'Invalid price, stock or visibility' });
  for (const key of ['name', 'description', 'category', 'price', 'stock', 'active']) if (req.body[key] !== undefined) product[key] = req.body[key];
  await product.save(); res.json(product);
}));
apiRouter.get('/orders', auth, wrap(async (req, res) => res.json(await Order.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(100).lean())));
apiRouter.post('/orders', auth, wrap(async (req, res) => {
  if (req.user.role !== 'user') return res.status(403).json({ error: 'Use a customer account to shop' });
  const items = req.body.items;
  if (!Array.isArray(items) || !items.length || items.length > 30 || items.some(x => !x || !validId(x.product) || !Number.isInteger(x.quantity) || x.quantity < 1 || x.quantity > 100) || new Set(items.map(x => x.product)).size !== items.length) return res.status(400).json({ error: 'Invalid cart items' });
  const reserved = [];
  try {
    for (const item of items) {
      const p = await Product.findOneAndUpdate({ _id: item.product, active: true, stock: { $gte: item.quantity } }, { $inc: { stock: -item.quantity } }, { new: true });
      if (!p) throw new Error('Insufficient stock or product unavailable');
      reserved.push({ product: p._id, shop: p.shop, name: p.name, price: p.price, quantity: item.quantity, status: 'placed' });
    }
    res.status(201).json(await Order.create({ user: req.user.id, items: reserved, total: reserved.reduce((s, x) => s + x.price * x.quantity, 0) }));
  } catch (error) { for (const item of reserved) await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } }); res.status(409).json({ error: error.message }); }
}));
apiRouter.get('/manage/orders', auth, staff, wrap(async (req, res) => {
  const shops = await Shop.find({ owner: req.user.id }).distinct('_id');
  const orders = await Order.find(req.user.role === 'admin' ? {} : { 'items.shop': { $in: shops } }).populate('user', 'name').sort({ createdAt: -1 }).limit(100).lean();
  res.json(orders.map(o => { const items = req.user.role === 'admin' ? o.items : o.items.filter(i => shops.some(s => String(s) === String(i.shop))); return { ...o, items, total: items.reduce((s, i) => s + i.price * i.quantity, 0) }; }));
}));
apiRouter.patch('/manage/orders/:id/fulfill', auth, staff, wrap(async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'Order not found' });
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status === 'cancelled') return res.status(409).json({ error: 'Order was cancelled' });
  const shops = await Shop.find({ owner: req.user.id }).distinct('_id');
  const owns = item => req.user.role === 'admin' || shops.some(s => String(s) === String(item.shop));
  if (!order.items.some(owns)) return res.status(403).json({ error: 'No items belong to your shops' });
  for (const item of order.items) if (owns(item)) item.status = 'fulfilled';
  if (order.items.every(i => i.status === 'fulfilled')) order.status = 'fulfilled';
  await order.save(); res.json({ ok: true });
}));
apiRouter.get('/admin/orders', auth, admin, wrap(async (req, res) => res.json(await Order.find().sort({ createdAt: -1 }).limit(100).lean())));
