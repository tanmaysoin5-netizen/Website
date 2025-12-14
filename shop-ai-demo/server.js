// server.js — Express + MongoDB (Users + Products + Orders) + session cart

require('dotenv').config(); // optional .env support

const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');

// --- Mongo models ---
const Product = require('./models/Product');
const User = require('./models/User');
const Order = require('./models/Order');

const app = express();
const PORT = process.env.PORT || 3001;

// --------- 1. MongoDB connection + seed products ----------
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shopai';

// file used only for seeding the database
const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json');

function loadProductsFromFile() {
  try {
    if (!fs.existsSync(PRODUCTS_FILE)) return [];
    const raw = fs.readFileSync(PRODUCTS_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.error('loadProductsFromFile error:', err);
    return [];
  }
}

// connect + seed + then start server
mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');

    // Seed products collection: ALWAYS wipe and re-seed to ensure new products appear
    await Product.deleteMany({});
    console.log('🧹 Cleared existing products');

    try {
      const json = loadProductsFromFile();
      if (json.length) {
        await Product.insertMany(json);
        console.log(`🌱 Seeded ${json.length} products from data/products.json`);
      } else {
        console.log('products.json empty, nothing to seed');
      }
    } catch (e) {
      console.error('Error seeding products:', e);
    }

    // start http server only after DB is ready
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// --------- 2. Express + session middlewares ----------
app.use(cors({
  origin: 'http://localhost:3001', // adjust if you use another port/origin
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const MongoStore = require('connect-mongo').default || require('connect-mongo');

app.use(session({
  secret: process.env.SESSION_SECRET || 'replace_this_with_a_real_secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGODB_URI }),
  cookie: {
    secure: false,       // true only if using https
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 30 // 30 days
  }
}));

// serve static files
app.use(express.static(path.join(__dirname, 'public')));

// --------- 3. Helper: auth middleware (protect APIs) ----------
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  // for API requests, return 401 JSON
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  // for normal browser navigation, go to login
  return res.redirect('/login.html');
}

// --------- 4. AUTH routes (signup, login, logout) ----------

// POST /auth/signup
app.post('/auth/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password required' });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Username already taken' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      email: email || '',
      passwordHash: hash
    });

    // mark this user as logged-in in session
    req.session.userId = user._id;
    req.session.username = user.username;

    res.json({ success: true, user: { username: user.username } });
  } catch (err) {
    console.error('signup error', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /auth/login
app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password required' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    req.session.userId = user._id;
    req.session.username = user.username;

    res.json({ success: true, user: { username: user.username } });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /auth/logout
app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// GET /auth/check (optional: used by login.js to auto-redirect)
app.get('/auth/check', (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({ authenticated: true, user: { username: req.session.username } });
  }
  return res.json({ authenticated: false });
});

// --------- 5. PRODUCTS APIs (now from Mongo, not JSON) ----------

// GET /api/products  (with q, gender, category, minPrice)
app.get('/api/products', requireAuth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    const gender = (req.query.gender || '').toLowerCase();
    const category = (req.query.category || '').toLowerCase();
    const rawMin = req.query.minPrice;
    const minPrice = rawMin !== undefined ? Number(rawMin) || 0 : 0;

    const filter = {};

    if (gender && gender !== 'all') {
      filter.gender = { $in: [gender, 'unisex'] };
    }

    if (category) {
      filter.category = category;
    }

    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } },
      ];
    }

    if (!isNaN(minPrice) && minPrice > 0) {
      filter.price = { $gte: minPrice };
    }

    const products = await Product.find(filter).lean();
    res.json(products);
  } catch (err) {
    console.error('/api/products error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/products/:id
app.get('/api/products/:id', requireAuth, async (req, res) => {
  try {
    const p = await Product.findOne({ id: req.params.id }).lean();
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json(p);
  } catch (err) {
    console.error('/api/products/:id error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// simple recommend using tags/color/style (like before, but from Mongo)
const colorMatches = {
  black: ['white', 'grey', 'red', 'blue', 'gold', 'silver'],
  white: ['black', 'blue', 'red', 'beige', 'grey'],
  blue: ['white', 'beige', 'grey', 'black'],
  navy: ['beige', 'white', 'grey'],
  beige: ['navy', 'blue', 'black', 'white', 'green'],
  brown: ['white', 'beige', 'blue'],
  grey: ['black', 'white', 'blue', 'red'],
  red: ['black', 'white', 'blue'],
  pink: ['white', 'grey', 'blue'],
  green: ['beige', 'white', 'black'],
  gold: ['black', 'white', 'red'],
  silver: ['black', 'white', 'blue']
};

function similarity(pA, pB) {
  const setA = new Set(pA.tags || []);
  const setB = new Set(pB.tags || []);
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size || 1;
  let score = intersection / union;

  // Exact color match
  if (pA.color && pB.color && pA.color === pB.color) score += 0.12;

  // Compatible color match
  if (pA.color && pB.color && colorMatches[pA.color] && colorMatches[pA.color].includes(pB.color)) {
    score += 0.15;
  }

  if (pA.style && pB.style && pA.style === pB.style) score += 0.08;
  return score;
}
const complementary = {
  shirt: ['pants', 'jacket', 'shoes'],
  polo: ['pants', 'shoes'],
  jacket: ['shirt', 'pants', 'shoes'],
  pants: ['shirt', 'jacket', 'shoes'],
  dress: ['jacket', 'shoes'],
  shoes: ['pants', 'shirt', 'jacket'],
  default: ['shirt', 'pants', 'jacket', 'shoes']
};
function isComplementary(baseCat, otherCat) {
  const arr = complementary[baseCat] || complementary.default;
  return arr.includes(otherCat);
}

app.get('/api/recommend/:id', requireAuth, async (req, res) => {
  try {
    const all = await Product.find().lean();
    const base = all.find(p => p.id === req.params.id);
    if (!base) return res.json([]);

    const recs = all
      .filter(p => {
        if (p.id === base.id) return false;
        // Strict gender filtering
        if (base.gender === 'men' && p.gender === 'women') return false;
        if (base.gender === 'women' && p.gender === 'men') return false;
        return true;
      })
      .map(p => {
        let s = similarity(base, p);
        if (isComplementary(base.category, p.category)) s += 0.18;
        return { p, score: s };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(x => ({ ...x.p, score: Number(x.score.toFixed(3)) }));

    res.json(recs);
  } catch (err) {
    console.error('/api/recommend error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --------- 6. CART endpoints (session-based, using Mongo for product lookup) ----------

// GET cart
app.get('/api/cart', requireAuth, (req, res) => {
  req.session.cart = req.session.cart || [];
  res.json({ cart: req.session.cart });
});

// ADD to cart
app.post('/api/cart/add', requireAuth, async (req, res) => {
  try {
    const { productId, quantity } = req.body || {};
    const product = await Product.findOne({ id: productId }).lean();
    if (!product) return res.status(400).json({ error: 'Invalid product' });

    req.session.cart = req.session.cart || [];
    const existing = req.session.cart.find(item => item.product.id === productId);

    if (existing) {
      existing.quantity += quantity || 1;
    } else {
      req.session.cart.push({
        id: String(Date.now()) + Math.random().toString(16).slice(2),
        product,
        quantity: quantity || 1
      });
    }

    res.json({ cart: req.session.cart });
  } catch (err) {
    console.error('/api/cart/add error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// REMOVE from cart
app.post('/api/cart/remove', requireAuth, (req, res) => {
  const { id } = req.body || {};
  req.session.cart = (req.session.cart || []).filter(item => item.id !== id);
  res.json({ cart: req.session.cart });
});

// CLEAR cart
app.post('/api/cart/clear', requireAuth, (req, res) => {
  req.session.cart = [];
  res.json({ cart: [] });
});

// --------- 7. CHECKOUT: save order in MongoDB ----------
app.post('/api/checkout', requireAuth, async (req, res) => {
  try {
    const cart = req.session.cart || [];
    if (!cart.length) {
      return res.status(400).json({ success: false, error: 'Cart is empty' });
    }

    const { shipping, paymentMethod } = req.body || {};

    const total = cart.reduce(
      (sum, item) => sum + (item.product.price || 0) * (item.quantity || 0),
      0
    );

    const order = await Order.create({
      userId: req.session.userId,
      shipping: shipping || {},
      paymentMethod: paymentMethod || 'cod',
      items: cart.map(it => ({
        productId: it.product.id,
        name: it.product.name,
        quantity: it.quantity,
        price: it.product.price
      })),
      total
    });

    // clear cart after placing order
    req.session.cart = [];

    res.json({
      success: true,
      orderId: order._id,
      orderTotal: total
    });
  } catch (err) {
    console.error('checkout error', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// --------- 8. My Orders (user sees their own orders) ----------
app.get('/api/my-orders', requireAuth, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.session.userId })
      .sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (err) {
    console.error('my-orders error', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// --------- 9. Root & fallback routes ----------
app.get('/', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Explicit route for index.html
app.get('/index.html', requireAuth, (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Any other path → if logged in, show index; else go to login
app.get('*', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login.html');
  }
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
