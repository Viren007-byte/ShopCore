import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';

// Run with RUN_INTEGRATION=1 and a local MongoDB. Every run uses its own database.
test('marketplace ownership, registration, mixed-shop checkout and fulfillment', { skip: process.env.RUN_INTEGRATION !== '1', timeout: 30000 }, async () => {
  const name = `shopcore_test_${randomBytes(8).toString('hex')}`;
  const env = { ...process.env, MONGO_URI: `mongodb://127.0.0.1:27017/${name}`, JWT_SECRET: randomBytes(32).toString('hex'), PORT: '4199' };
  let server;
  try {
    await new Promise((resolve, reject) => { const seed = spawn(process.execPath, ['src/seed.js'], { env, stdio: 'pipe' }); seed.once('error', reject); seed.once('exit', code => code === 0 ? resolve() : reject(new Error('Seed failed'))); });
    server = spawn(process.execPath, ['src/server.js'], { env, stdio: 'pipe' });
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Startup timeout')), 8000); server.stdout.on('data', data => { if (data.toString().includes('API ready')) { clearTimeout(timer); resolve(); } }); server.once('error', reject); server.once('exit', () => { clearTimeout(timer); reject(new Error('Server exited')); }); });
    const call = async (path, token, method = 'GET', body) => { const response = await fetch('http://127.0.0.1:4199/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: response.status, data: await response.json() }; };
    const login = async email => { const result = await call('/auth/login', null, 'POST', { email, password: 'ShopCore@123' }); assert.equal(result.status, 200); return result.data.token; };
    const customer = await login('demo@shopcore.test'), seller = await login('seller@shopcore.test'), second = await login('seller2@shopcore.test'), admin = await login('admin@shopcore.test');
    assert.equal((await call('/manage/products', customer)).status, 403);
    const own = (await call('/manage/products', seller)).data, other = (await call('/manage/products', second)).data;
    assert.equal(own.shops.length, 1); assert.equal(other.shops.length, 2);
    assert.equal((await call(`/products/${other.products[0]._id}`, seller, 'PATCH', { price: 1 })).status, 403);
    assert.equal((await call('/products', seller, 'POST', { name: 'Invalid', shop: other.shops[0]._id, price: 10, stock: 1 })).status, 403);
    const created = await call('/products', seller, 'POST', { name: 'Test product', description: 'Integration listing', shop: own.shops[0]._id, price: 120, stock: 4 }); assert.equal(created.status, 201);
    assert.equal((await call(`/products/${created.data._id}`, seller, 'PATCH', { stock: 2.5 })).status, 400);
    const secondProduct = other.products[0];
    const order = await call('/orders', customer, 'POST', { items: [{ product: created.data._id, quantity: 2 }, { product: secondProduct._id, quantity: 1 }] }); assert.equal(order.status, 201);
    assert.equal(order.data.total, 240 + secondProduct.price);
    const sellerOrder = (await call('/manage/orders', seller)).data.find(o => o._id === order.data._id); assert.equal(sellerOrder.items.length, 1); assert.equal(sellerOrder.total, 240);
    const secondOrder = (await call('/manage/orders', second)).data.find(o => o._id === order.data._id); assert.equal(secondOrder.items.length, 1);
    assert.equal((await call(`/manage/orders/${order.data._id}/fulfill`, seller, 'PATCH')).status, 200);
    assert.equal((await call('/orders', customer)).data.find(o => o._id === order.data._id).status, 'placed');
    assert.equal((await call(`/manage/orders/${order.data._id}/fulfill`, second, 'PATCH')).status, 200);
    assert.equal((await call('/orders', customer)).data.find(o => o._id === order.data._id).status, 'fulfilled');
    assert.equal((await call(`/products/${created.data._id}`, admin, 'PATCH', { active: false })).status, 200);
    assert.ok(!(await call('/products')).data.items.some(p => p._id === created.data._id));
    assert.equal((await call('/orders', seller, 'POST', { items: [{ product: secondProduct._id, quantity: 1 }] })).status, 403);
    const registration = await call('/auth/register', null, 'POST', { name: 'New Seller', email: 'new@example.test', password: 'Example@123', role: 'seller' }); assert.equal(registration.data.user.role, 'seller');
    const deniedPromotion = await call('/auth/register', null, 'POST', { name: 'Customer', email: 'customer@example.test', password: 'Example@123', role: 'admin' }); assert.equal(deniedPromotion.data.user.role, 'user');
    assert.equal((await call('/shops', registration.data.token, 'POST', { name: 'New shop' })).status, 201);
  } finally {
    if (server && server.exitCode === null) await new Promise(resolve => { server.once('exit', resolve); server.kill(); });
    await mongoose.connect(env.MONGO_URI);
    assert.ok(mongoose.connection.name.startsWith('shopcore_test_'));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
