import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { readFile } from 'node:fs/promises';
import { User } from './core.js';
import './routes.js';
const catalog = JSON.parse((await readFile(new URL('../../catalog.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
try {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shopcore');

  for (const [email, name, role] of [['demo@shopcore.test', 'Alex Morgan', 'user'], ['admin@shopcore.test', 'Store Admin', 'admin'], ['seller@shopcore.test', 'Jamie Ellis', 'seller'], ['seller2@shopcore.test', 'Taylor Reed', 'seller']]) {
    await User.updateOne({ email }, { $setOnInsert: { name, email, role, password: await bcrypt.hash('ShopCore@123', 12) } }, { upsert: true });
  }
  const seller = await User.findOne({ email: 'seller@shopcore.test' });
  const secondSeller = await User.findOne({ email: 'seller2@shopcore.test' });
  const shops = [...new Map(catalog.map(p => [p.shop._id, p.shop])).values()];
  for (const [index, shop] of shops.entries()) await mongoose.model('Shop').updateOne({ _id: shop._id }, { $setOnInsert: { name: shop.name, owner: index === 0 ? seller._id : secondSeller._id, description: 'Independent essentials for everyday living.' } }, { upsert: true });
  for (const { _id, shop, rating, reviewCount, ...product } of catalog) {
    await mongoose.model('Product').updateOne({ _id }, { $setOnInsert: product }, { upsert: true });
    await mongoose.model('Product').updateOne({ _id, shop: { $exists: false } }, { $set: { shop: shop._id, rating, reviewCount } });
  }
  const user = await User.findOne({ email: 'demo@shopcore.test' });
  const Order = mongoose.model('Order');
  if (!await Order.exists({ user: user._id })) await Order.create({ user: user._id, items: [{ product: catalog[4]._id, shop: catalog[4].shop._id, status: 'fulfilled', name: catalog[4].name, price: catalog[4].price, quantity: 1 }], total: catalog[4].price, status: 'fulfilled' });
  await mongoose.model('Order').updateMany({ user: user._id, 'items.shop': { $exists: false } }, { $set: { 'items.$[].shop': catalog[4].shop._id, 'items.$[].status': 'fulfilled' } });
  console.log('Demo catalog, customer, admin, and order ready. Existing records preserved. Credentials are in README.');
} finally { await mongoose.disconnect(); }
