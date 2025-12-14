// app.js — gallery + minPrice + modal UX + payment methods
// + 2-step checkout + logout + orders history + cancel order
// + seasonal sale + discounted prices inside cart

// fetch helper with status checking & logging
async function fetchJSON(url, opts) {
  try {
    const res = await fetch(url, opts);

    // Automatic redirect if session is invalid/expired
    if (res.status === 401) {
      window.location.href = '/login.html';
      return null;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      console.error('fetchJSON error', res.status, res.statusText, text);
      throw new Error('Network response was not ok: ' + res.status);
    }
    return await res.json();
  } catch (err) {
    console.error('fetchJSON failed for', url, err);
    throw err;
  }
}

// DOM refs
const productsGrid = document.getElementById('products-grid');
const modal = document.getElementById('modal');
const modalClose = document.getElementById('modal-close');
const productDetail = document.getElementById('product-detail');
const recommendationsDiv = document.getElementById('recommendations');
const viewCartBtn = document.getElementById('view-cart-btn');
const cartDrawer = document.getElementById('cart-drawer');
const cartList = document.getElementById('cart-list');
const cartCount = document.getElementById('cart-count');
const cartTotal = document.getElementById('cart-total');
const checkoutBtn = document.getElementById('checkout-btn');
const clearCartBtn = document.getElementById('clear-cart-btn');
const closeCartBtn = document.getElementById('close-cart');
const searchInput = document.getElementById('search-input');
const genderFilter = document.getElementById('gender-filter');
const categoryFilter = document.getElementById('category-filter');
const shopNowBtn = document.getElementById('shop-now');
const minPriceSelect = document.getElementById('minprice-filter');

// Seasonal sale DOM refs
const saleGrid = document.getElementById('sale-grid');
const saleSubtitle = document.getElementById('sale-subtitle');
const saleSection = document.getElementById('sale-section');

// address + orders
const useSavedAddressCheckbox = document.getElementById('use-saved-address');
const ordersList = document.getElementById('orders-list');

// logout button
const logoutBtn = document.getElementById('logout-btn');

// payment method buttons
const paymentButtons = document.querySelectorAll('.payment-btn');

// checkout form refs
const checkoutForm = document.getElementById('checkout-form');
const placeOrderBtn = document.getElementById('place-order-btn');
const cancelCheckoutBtn = document.getElementById('cancel-checkout-btn');
const shipNameInput = document.getElementById('ship-name');
const shipAddressInput = document.getElementById('ship-address');
const shipCityInput = document.getElementById('ship-city');
const shipPincodeInput = document.getElementById('ship-pincode');
const shipPhoneInput = document.getElementById('ship-phone');

// fallback inline SVG image (no external)
const PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400'><rect width='100%' height='100%' fill='%23f3f4f6'/><g transform='translate(0,120)'><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-family='Arial, Helvetica, sans-serif' font-size='20'>Image not available</text></g></svg>`
)}`;

function normalizeDataUri(url) {
  if (!url || typeof url !== 'string') return url;
  const prefix = 'data:image/svg+xml;utf8,';
  if (url.toLowerCase().startsWith(prefix)) {
    try {
      const payload = url.slice(prefix.length);
      if (/%[0-9A-F]{2}/i.test(payload)) {
        const decoded = decodeURIComponent(payload);
        return prefix + decoded;
      }
      return url;
    } catch (e) {
      console.warn('normalizeDataUri decode failed', e);
      return url;
    }
  }
  return url;
}

function imgWithFallback(url, alt = '') {
  const img = document.createElement('img');
  const finalUrl = normalizeDataUri(url) || PLACEHOLDER;
  img.src = finalUrl;
  img.alt = alt || '';
  img.loading = 'lazy';
  img.onerror = function () {
    if (this.src !== PLACEHOLDER) {
      this.onerror = null;
      this.src = PLACEHOLDER;
    }
  };
  return img;
}

function safeAddEvent(el, evt, fn) { if (!el) return; el.addEventListener(evt, fn); }

function productsApiUrl(params) {
  params.set('_ts', String(Date.now()));
  return '/api/products?' + params.toString();
}

/* ===== Seasonal helpers ===== */

function getSeasonInfo() {
  const now = new Date();
  const m = now.getMonth(); // 0 = Jan, 11 = Dec
  const d = now.getDate();

  if (m === 11 && d >= 20 && d <= 26) {
    return {
      key: 'christmas',
      title: 'Christmas Sale',
      subtitle: 'Flat 30% off on party outfits + free gift wrapping. Orders over ₹2500 get free mini speaker.'
    };
  }

  if ((m === 10 || m === 11 || m === 0 || m === 1)) {
    return {
      key: 'newyear',
      title: 'New Year Mega Sale',
      subtitle: 'Ring in the new year with 25–35% off. Orders above ₹3001 get bonus wireless earbuds.'
    };
  }


  if (( m === 11 && d >= 27) || (m === 0 && d <= 5)){
    return {
      key: 'winter',
      title: 'Winter Warmers',
      subtitle: 'Stay cozy with 20% off jackets & warm bottoms. Extra 10% off items above ₹1000.'
    };
  }

  if (m === 3 || m === 4 || m === 5) {
    return {
      key: 'summer',
      title: 'Summer Vibes',
      subtitle: 'Cool shirts and dresses with 15–25% off. Lightweight styles get “Buy 2 get 1 free”.'
    };
  }

  return {
    key: 'default',
    title: 'Today’s Picks',
    subtitle: 'Hand-picked outfits with special prices just for today.'
  };

}


function productEligibleForSeason(p, seasonKey) {
  const cat = (p.category || '').toLowerCase();
  const tags = (p.tags || []).map(t => t.toLowerCase());

  if (seasonKey === 'winter') {
    return ['jacket', 'coat', 'sweater', 'hoodie', 'pants'].includes(cat)
      || tags.includes('winter');
  }
  if (seasonKey === 'summer') {
    return ['shirt', 'tshirt', 'polo', 'dress', 'shorts'].includes(cat)
      || tags.includes('summer');
  }
  if (seasonKey === 'christmas' || seasonKey === 'newyear') {
    return ['dress', 'jacket', 'shoes', 'shirt'].includes(cat) || tags.includes('party');
  }
  return (p.price || 0) >= 300;
}

function decorateSaleProduct(p, seasonKey) {
  const price = Number(p.price || 0);
  if (!price) return null;

  let baseDiscount = 0.2; // 20%
  if (seasonKey === 'christmas' || seasonKey === 'newyear') baseDiscount = 0.3;
  if (seasonKey === 'summer') baseDiscount = 0.15;

  if (price >= 1000) baseDiscount += 0.10;
  if (baseDiscount > 0.45) baseDiscount = 0.45;

  const salePrice = Math.round(price * (1 - baseDiscount));

  let offer = '';
  if (seasonKey === 'winter') {
    offer = 'Offer: Buy 2 jackets / winter bottoms, get 1 woolen cap free.';
  } else if (seasonKey === 'summer') {
    offer = 'Offer: Buy 2 summer tops, get 1 basic tee free.';
  } else if (seasonKey === 'christmas') {
    offer = 'Offer: Orders above ₹2500 get a free mini Bluetooth speaker.';
  } else if (seasonKey === 'newyear') {
    offer = 'Offer: Orders above ₹3000 get free wireless earbuds.';
  } else {
    offer = 'Limited time price – while stocks last.';
  }

  return {
    ...p,
    salePrice,
    discountPercent: Math.round(baseDiscount * 100),
    offer
  };
}
function getFreeGiftsForOrder(totalAmount) {
  const { key } = getSeasonInfo();
  const gifts = [];
  // you can change these amounts / names if you like
  if (key === 'winter' && totalAmount >= 1500) {
    gifts.push({ name: 'Woolen cap', image: '/images/image copy 47.png' });
  }
  if (key === 'summer' && totalAmount >= 1500) {
    gifts.push({ name: 'Basic cotton T-shirt', image: '/images/image copy 49.png' });
  }
  if (key === 'christmas' && totalAmount >= 2500) {
    gifts.push({ name: 'Mini Bluetooth speaker', image: '/images/speaker.png' });
  }
  if (key === 'newyear' && totalAmount >= 3001) {
    gifts.push({ name: 'Wireless earbuds', image: '/images/earbuds.png' });
  }

  return gifts;
}




// *** NEW: effective price used in cart and totals ***
function getEffectivePrice(product) {
  const season = getSeasonInfo();
  if (productEligibleForSeason(product, season.key)) {
    const decorated = decorateSaleProduct(product, season.key);
    if (decorated && decorated.salePrice) {
      return Number(decorated.salePrice);
    }
  }
  return Number(product.price || 0);
}

function firstImageOf(p) {
  if (!p) return null;
  if (Array.isArray(p.images) && p.images.length > 0) return p.images[0];
  if (typeof p.image === 'string' && p.image) return p.image;
  return null;
}

/* ===== Seasonal sale renderer ===== */

async function loadSeasonalSale() {
  if (!saleGrid || !saleSection) return;

  const season = getSeasonInfo();

  const header = saleSection.querySelector('h2');
  if (header) header.textContent = season.title;
  if (saleSubtitle) saleSubtitle.textContent = season.subtitle;

  try {
    const params = new URLSearchParams();
    params.set('minPrice', '0');
    params.set('_ts', String(Date.now()));
    const all = await fetchJSON('/api/products?' + params.toString());

    const eligible = all
      .filter(p => productEligibleForSeason(p, season.key))
      .map(p => decorateSaleProduct(p, season.key))
      .filter(Boolean)
      .sort((a, b) => (b.discountPercent - a.discountPercent) || (b.price - a.price))
      .slice(0, 6);

    if (!eligible.length) {
      saleSection.style.display = 'none';
      return;
    }

    saleGrid.innerHTML = '';
    eligible.forEach(p => {
      const card = document.createElement('div');
      card.className = 'card sale-card';

      const img = imgWithFallback(firstImageOf(p) || p.image, p.name);
      img.style.height = '170px';
      img.style.width = '100%';
      img.style.objectFit = 'cover';

      const badge = document.createElement('div');
      badge.className = 'sale-badge';
      badge.textContent = `${p.discountPercent}% OFF`;

      const title = document.createElement('h4');
      title.textContent = p.name || 'Sale item';

      const priceLine = document.createElement('div');
      priceLine.className = 'sale-price-line';
      const now = document.createElement('span');
      now.className = 'sale-price-now';
      now.textContent = 'Now ₹ ' + p.salePrice.toFixed(0);
      const old = document.createElement('span');
      old.className = 'sale-price-old';
      old.textContent = '₹ ' + Number(p.price || 0).toFixed(0);
      priceLine.appendChild(now);
      priceLine.appendChild(old);

      const extra = document.createElement('div');
      extra.className = 'sale-extra';
      extra.textContent = p.offer;

      const row = document.createElement('div');
      row.className = 'button-row';
      const viewBtn = document.createElement('button');
      viewBtn.className = 'btn';
      viewBtn.textContent = 'View';
      viewBtn.addEventListener('click', () => showProduct(p.id));
      const addBtn = document.createElement('button');
      addBtn.className = 'btn alt';
      addBtn.textContent = 'Add to Cart';
      addBtn.addEventListener('click', () => addToCart(p.id));
      row.appendChild(viewBtn);
      row.appendChild(addBtn);

      card.appendChild(img);
      card.appendChild(badge);
      card.appendChild(title);
      card.appendChild(priceLine);
      card.appendChild(extra);
      card.appendChild(row);
      saleGrid.appendChild(card);
    });
  } catch (err) {
    console.error('loadSeasonalSale error', err);
    saleSection.style.display = 'none';
  }
}

/* ===== Products grid ===== */

async function loadProducts() {
  if (!productsGrid) {
    console.warn('loadProducts: productsGrid not found');
    return;
  }

  const q = searchInput ? searchInput.value.trim() : '';
  const gender = genderFilter ? genderFilter.value : 'all';
  const category = categoryFilter ? categoryFilter.value : '';
  const minPrice = minPriceSelect ? Number(minPriceSelect.value) : undefined;

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (gender) params.set('gender', gender);
  if (category) params.set('category', category);
  if (typeof minPrice === 'number' && !isNaN(minPrice)) params.set('minPrice', String(minPrice));

  const url = productsApiUrl(params);
  try {
    const products = await fetchJSON(url).catch(() => []);
    productsGrid.innerHTML = '';
    products.forEach((p, idx) => {
      const el = document.createElement('div');
      el.className = 'card';
      el.style.animationDelay = (idx * 45) + 'ms';

      const imgUrl = firstImageOf(p) || PLACEHOLDER;
      const img = imgWithFallback(imgUrl, p.name);
      img.style.height = '180px';
      img.style.width = '100%';
      img.style.objectFit = 'cover';
      el.appendChild(img);

      const h = document.createElement('h4'); h.textContent = p.name || 'Untitled';
      const d = document.createElement('p'); d.textContent = p.description || '';
      const price = document.createElement('div'); price.className = 'price';
      price.textContent = '₹ ' + (typeof p.price === 'number' ? p.price.toFixed(2) : (p.price || '0'));

      const row = document.createElement('div'); row.className = 'button-row';
      const viewBtn = document.createElement('button'); viewBtn.className = 'btn'; viewBtn.textContent = 'View';
      viewBtn.addEventListener('click', () => showProduct(p.id));
      const addBtn = document.createElement('button'); addBtn.className = 'btn alt'; addBtn.textContent = 'Add to Cart';
      addBtn.addEventListener('click', () => addToCart(p.id));

      row.appendChild(viewBtn); row.appendChild(addBtn);

      el.appendChild(h); el.appendChild(d); el.appendChild(price); el.appendChild(row);
      productsGrid.appendChild(el);
    });
  } catch (err) {
    console.error('loadProducts failed:', err);
    productsGrid.innerHTML = '<div style="padding:20px;color:#b00">Failed to load products. Open console for details.</div>';
  }
}

/* ===== Gallery & modal ===== */

function renderGallery(container, images = [], initialIndex = 0) {
  container.innerHTML = '';
  if (!images || images.length === 0) {
    const img = imgWithFallback(null, 'No image');
    img.style.width = '100%';
    img.style.maxWidth = '380px';
    container.appendChild(img);
    return;
  }

  let current = initialIndex || 0;
  const mainWrap = document.createElement('div');
  mainWrap.className = 'gallery-main';
  mainWrap.style.display = 'flex';
  mainWrap.style.alignItems = 'center';
  mainWrap.style.justifyContent = 'center';
  mainWrap.style.position = 'relative';
  mainWrap.style.marginBottom = '10px';

  const mainImg = imgWithFallback(images[current], 'product');
  mainImg.style.width = '100%';
  mainImg.style.maxWidth = '420px';
  mainImg.style.maxHeight = '420px';
  mainImg.style.objectFit = 'cover';
  mainImg.style.borderRadius = '10px';
  mainWrap.appendChild(mainImg);

  if (images.length > 1) {
    const navStyle = 'position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.45);border:none;color:white;padding:8px;border-radius:8px;cursor:pointer;';
    const leftBtn = document.createElement('button');
    leftBtn.innerHTML = '◀';
    leftBtn.style.cssText = navStyle + 'left:8px;';
    leftBtn.addEventListener('click', () => {
      current = (current - 1 + images.length) % images.length;
      mainImg.src = normalizeDataUri(images[current]) || PLACEHOLDER;
      updateThumbs();
    });
    const rightBtn = document.createElement('button');
    rightBtn.innerHTML = '▶';
    rightBtn.style.cssText = navStyle + 'right:8px;';
    rightBtn.addEventListener('click', () => {
      current = (current + 1) % images.length;
      mainImg.src = normalizeDataUri(images[current]) || PLACEHOLDER;
      updateThumbs();
    });
    mainWrap.appendChild(leftBtn);
    mainWrap.appendChild(rightBtn);
  }

  container.appendChild(mainWrap);

  if (images.length > 1) {
    const thumbs = document.createElement('div');
    thumbs.className = 'gallery-thumbs';
    thumbs.style.display = 'flex';
    thumbs.style.gap = '8px';
    thumbs.style.flexWrap = 'wrap';
    images.forEach((src, i) => {
      const t = document.createElement('div');
      t.style.cursor = 'pointer';
      t.style.borderRadius = '8px';
      t.style.overflow = 'hidden';
      t.style.width = '64px';
      t.style.height = '64px';
      t.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
      const ti = imgWithFallback(src, 'thumb');
      ti.style.width = '100%';
      ti.style.height = '100%';
      ti.style.objectFit = 'cover';
      t.appendChild(ti);
      t.addEventListener('click', () => {
        current = i;
        mainImg.src = normalizeDataUri(images[current]) || PLACEHOLDER;
        updateThumbs();
      });
      thumbs.appendChild(t);
    });
    container.appendChild(thumbs);
  }

  function updateThumbs() {
    const thumbDivs = container.querySelectorAll('.gallery-thumbs > div');
    thumbDivs.forEach((td, idx) => {
      td.style.outline = (idx === current) ? '3px solid rgba(0,0,0,0.08)' : 'none';
    });
  }

  updateThumbs();
}

function openModal() {
  if (!modal) return;
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  if (modalClose) modalClose.focus();
}
function closeModal() {
  if (!modal) return;
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

async function showProduct(id) {
  if (!productDetail || !modal) return;
  const p = await fetchJSON('/api/products/' + encodeURIComponent(id)).catch(() => null);
  if (!p) return;

  productDetail.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.gap = '18px';
  wrapper.style.flexWrap = 'wrap';

  const left = document.createElement('div');
  left.style.flex = '1 1 420px';
  left.style.minWidth = '280px';

  const images = Array.isArray(p.images) && p.images.length ? p.images.slice() : (p.image ? [p.image] : []);
  renderGallery(left, images, 0);

  const right = document.createElement('div');
  right.style.flex = '1 1 320px';
  right.style.minWidth = '260px';
  const title = document.createElement('h2'); title.textContent = p.name;
  const desc = document.createElement('p'); desc.textContent = p.description || '';
  const price = document.createElement('p'); price.innerHTML = '<strong>₹ ' + (typeof p.price === 'number' ? p.price.toFixed(2) : p.price || '0') + '</strong>';
  const add = document.createElement('button'); add.className = 'primary'; add.textContent = 'Add to cart';
  add.addEventListener('click', () => addToCart(p.id));

  right.appendChild(title); right.appendChild(desc); right.appendChild(price); right.appendChild(add);

  wrapper.appendChild(left);
  wrapper.appendChild(right);
  productDetail.appendChild(wrapper);

  const recs = await fetchJSON('/api/recommend/' + encodeURIComponent(id)).catch(() => []);
  if (recommendationsDiv) {
    recommendationsDiv.innerHTML = '';
    recs.forEach(r => {
      const c = document.createElement('div'); c.className = 'card';
      const recImg = imgWithFallback(firstImageOf(r) || r.image, r.name);
      recImg.style.height = '120px'; recImg.style.width = '100%'; recImg.style.objectFit = 'cover';
      c.appendChild(recImg);
      const h = document.createElement('h4'); h.textContent = r.name;
      const pr = document.createElement('small'); pr.textContent = '₹ ' + (typeof r.price === 'number' ? r.price.toFixed(2) : r.price || '0');
      const vv = document.createElement('div'); vv.className = 'button-row';
      const vbtn = document.createElement('button'); vbtn.className = 'btn'; vbtn.textContent = 'View';
      vbtn.addEventListener('click', () => showProduct(r.id));
      const abtn = document.createElement('button'); abtn.className = 'btn alt'; abtn.textContent = 'Add';
      abtn.addEventListener('click', () => addToCart(r.id));
      vv.appendChild(vbtn); vv.appendChild(abtn);
      c.appendChild(h); c.appendChild(pr); c.appendChild(vv);
      recommendationsDiv.appendChild(c);
    });
  }

  openModal();
  const content = modal.querySelector('.modal-content');
  if (content) content.scrollTop = 0;
}

/* ===== Cart ===== */

async function addToCart(productId) {
  await fetchJSON('/api/cart/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, quantity: 1 })
  }).catch(() => { });
  await refreshCartUI();
  if (viewCartBtn) {
    const old = viewCartBtn.textContent;
    viewCartBtn.textContent = 'Added ✓';
    setTimeout(() => { if (viewCartBtn) viewCartBtn.textContent = old; }, 900);
  }
}

async function refreshCartUI() {
  const res = await fetchJSON('/api/cart').catch(() => ({ cart: [] }));
  const cart = res.cart || [];
  if (!cartList) return;

  cartList.innerHTML = '';
  let total = 0;
  let originalTotal = 0;

  cart.forEach(item => {
    const div = document.createElement('div');
    div.className = 'cart-item';

    const img = imgWithFallback(firstImageOf(item.product) || item.product.image, item.product.name);
    img.style.width = '66px';
    img.style.height = '66px';
    img.style.objectFit = 'cover';

    const qty = item.quantity || 0;
    const origPrice = Number(item.product.price || 0);
    const effPrice = getEffectivePrice(item.product);

    originalTotal += origPrice * qty;
    total += effPrice * qty;

    const info = document.createElement('div');
    info.style.flex = '1';

    const saleBadge = effPrice < origPrice
      ? '<span class="badge-small">SALE</span>'
      : '';

    const priceLine = effPrice < origPrice
      ? `₹ ${effPrice.toFixed(2)} x ${qty} <span class="orig-line">(MRP ₹${origPrice.toFixed(2)})</span>`
      : `₹ ${effPrice.toFixed(2)} x ${qty}`;

    info.innerHTML =
      `<div><strong>${item.product.name}</strong> ${saleBadge}</div>` +
      `<div><small>${priceLine}</small></div>`;

    const rem = document.createElement('button');
    rem.className = 'muted';
    rem.textContent = 'Remove';
    rem.addEventListener('click', async () => {
      await fetchJSON('/api/cart/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id })
      });
      await refreshCartUI();
    });

    div.appendChild(img);
    div.appendChild(info);
    div.appendChild(rem);
    cartList.appendChild(div);
  });

  cartCount.textContent = cart.reduce((s, i) => s + (i.quantity || 0), 0);

  if (cartTotal) {
    if (total < originalTotal) {
      const savings = originalTotal - total;
      cartTotal.innerHTML =
        `Total to pay: <strong>₹ ${total.toFixed(2)}</strong>` +
        `<div style="font-size:12px;color:#16a34a;">You save ₹${savings.toFixed(2)} this season 🎉</div>`;
    } else {
      cartTotal.textContent = 'Total: ₹ ' + total.toFixed(2);
    }
  }
}

/* ===== payment methods ===== */

function getSelectedPaymentMethod() {
  const active = document.querySelector('.payment-btn.active');
  return active ? active.dataset.method : 'cod';
}
function getPaymentLabel(method) {
  switch (method) {
    case 'gpay': return 'GPay';
    case 'phonepe': return 'PhonePe';
    case 'cod': return 'Cash on Delivery';
    default: return method ? method.toUpperCase() : 'Unknown';
  }
}
if (paymentButtons && paymentButtons.length) {
  paymentButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      paymentButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

/* ===== ORDER HISTORY + SAVED ADDRESS (localStorage) ===== */

function loadOrdersFromStorage() {
  try {
    return JSON.parse(localStorage.getItem('ordersHistory') || '[]');
  } catch {
    return [];
  }
}
function saveOrdersToStorage(orders) {
  localStorage.setItem('ordersHistory', JSON.stringify(orders));
}
function saveLastShipping(shipping) {
  localStorage.setItem('lastShipping', JSON.stringify(shipping));
}
function getLastShipping() {
  try {
    return JSON.parse(localStorage.getItem('lastShipping') || 'null');
  } catch {
    return null;
  }
}

function cancelOrderById(orderId) {
  let orders = loadOrdersFromStorage();
  // Remove the order entirely
  orders = orders.filter(o => String(o.id) !== String(orderId));
  saveOrdersToStorage(orders);
  renderOrders();
}

function renderOrders() {
  if (!ordersList) return;
  const orders = loadOrdersFromStorage();
  ordersList.innerHTML = '';
  if (orders.length === 0) {
    ordersList.innerHTML =
      '<p style="color:var(--muted);font-size:14px;">No orders placed yet.</p>';
    return;
  }

  orders.slice().reverse().forEach(order => {
    const div = document.createElement('div');
    div.className = 'order-card';
    const when = new Date(order.date).toLocaleString();
    const isCancelled = order.status === 'cancelled';

    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <strong>Order #${order.id}</strong>
          <div><small>${when}</small></div>
        </div>
        <div>
          ${isCancelled
        ? `<span style="color:#b91c1c;font-size:12px;font-weight:600;">Cancelled</span>`
        : `<button class="order-cancel-btn" data-id="${order.id}" style="padding:4px 8px;font-size:12px;border-radius:8px;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;cursor:pointer;">Cancel order</button>`
      }
        </div>
      </div>
      <div style="margin-top:4px;">Total: ₹ ${Number(order.total || 0).toFixed(2)} · ${getPaymentLabel(order.paymentMethod)}</div>
      <div style="margin-top:6px;">
        <strong>Ship to:</strong> ${order.shipping.name}, ${order.shipping.address}, ${order.shipping.city} - ${order.shipping.pincode}
      </div>
      <div class="order-items" style="margin-top:6px;">
        <strong>Items:</strong>
        <ul style="margin:4px 0 0 18px;padding:0;">
          ${(order.items || []).map(it => `<li>${it.name} × ${it.quantity}</li>`).join('')}
        </ul>
      </div>
    
    ${order.freeGifts && order.freeGifts.length
        ? `
      <div class="order-gifts" style="margin-top:6px;">
      <strong>Free gifts:</strong>
      <div style="display:flex;gap:8px;margin-top:4px;">
      ${order.freeGifts.map(g => `
        <div style="text-align:center;">
          <img src="${g.image || '/images/placeholder.png'}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;" onerror="this.src='/images/placeholder.png'">
          <div style="font-size:10px;">${g.name}</div>
        </div>
      `).join('')}
      </div>
      </div>`
        : ''
      }
 `;
    if (isCancelled) {
      div.style.opacity = '0.7';
    }

    ordersList.appendChild(div);
  });
}

if (ordersList) {
  ordersList.addEventListener('click', (e) => {
    const btn = e.target.closest('.order-cancel-btn');
    if (!btn) return;
    const orderId = btn.dataset.id;
    if (!orderId) return;
    if (!confirm('Cancel this order?')) return;
    cancelOrderById(orderId);
  });
}

safeAddEvent(useSavedAddressCheckbox, 'change', () => {
  if (!useSavedAddressCheckbox.checked) return;
  const s = getLastShipping();
  if (!s) {
    alert('No saved address yet. Place an order once to save it.');
    useSavedAddressCheckbox.checked = false;
    return;
  }
  shipNameInput.value = s.name || '';
  shipAddressInput.value = s.address || '';
  shipCityInput.value = s.city || '';
  shipPincodeInput.value = s.pincode || '';
  if (shipPhoneInput) shipPhoneInput.value = s.phone || '';
});

/* ===== 2-step checkout ===== */

safeAddEvent(checkoutBtn, 'click', () => {
  if (!checkoutForm) {
    alert('Checkout form not found in HTML.');
    return;
  }
  checkoutForm.classList.remove('hidden');
  if (cartDrawer) cartDrawer.scrollTop = cartDrawer.scrollHeight;
});

safeAddEvent(checkoutBtn, 'click', () => {
  if (!checkoutForm) {
    alert('Checkout form not found in HTML.');
    return;
  }
  checkoutForm.classList.remove('hidden');
  if (cartDrawer) cartDrawer.scrollTop = cartDrawer.scrollHeight;
});

safeAddEvent(placeOrderBtn, 'click', async () => {
  if (!checkoutForm) return;

  const name = shipNameInput.value.trim();
  const address = shipAddressInput.value.trim();
  const city = shipCityInput.value.trim();
  const pincode = shipPincodeInput.value.trim();
  const phone = shipPhoneInput ? shipPhoneInput.value.trim() : '';

  if (!name || !address || !city || !pincode) {
    alert('Please fill all required fields (name, address, city, pincode).');
    return;
  }
  if (!/^\d{4,6}$/.test(pincode)) {
    alert('Enter a valid pincode (4–6 digits).');
    return;
  }

  const method = getSelectedPaymentMethod();

  // get current cart items
  const cartState = await fetchJSON('/api/cart').catch(() => ({ cart: [] }));
  const cartItems = cartState.cart || [];
  const localTotal = cartItems.reduce(
    (s, it) => s + getEffectivePrice(it.product) * (it.quantity || 0),
    0
  );

  // free gifts
  const freeGifts = getFreeGiftsForOrder(localTotal);

  const payload = {
    shipping: { name, address, city, pincode, phone },
    paymentMethod: method
  };

  const res = await fetchJSON('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => ({ success: false }));

  if (res && res.success) {
    const total = localTotal.toFixed(2);
    const giftText = freeGifts.length
      ? `\n Free gifts: ${freeGifts.join(', ')}`
      : '';

    const newOrder = {
      id: Date.now(),
      date: new Date().toISOString(),
      total,
      paymentMethod: method,
      shipping: payload.shipping,
      items: cartItems.map(it => ({
        name: it.product.name,
        quantity: it.quantity
      })),
      freeGifts: freeGifts,
      status: 'placed'
    };

    const orders = loadOrdersFromStorage();
    orders.push(newOrder);
    saveOrdersToStorage(orders);
    saveLastShipping(payload.shipping);
    renderOrders();

    alert(`Thanks ${name}, your order has been placed using ${getPaymentLabel(method)}. Total: ₹${total}${giftText}`);
    await refreshCartUI();

    checkoutForm.classList.add('hidden');
    shipNameInput.value = '';
    shipAddressInput.value = '';
    shipCityInput.value = '';
    shipPincodeInput.value = '';
    if (shipPhoneInput) shipPhoneInput.value = '';
    if (useSavedAddressCheckbox) useSavedAddressCheckbox.checked = false;
  } else {
    alert('Could not place order. Please try again.');
  }
}); // ← FIXED: closing bracket

safeAddEvent(cancelCheckoutBtn, 'click', () => {
  if (checkoutForm) checkoutForm.classList.add('hidden');
});

/* ===== Other wiring ===== */

safeAddEvent(clearCartBtn, 'click', async () => {
  await fetchJSON('/api/cart/clear', { method: 'POST' }).catch(() => { });
  await refreshCartUI();
});
safeAddEvent(viewCartBtn, 'click', () => {
  if (cartDrawer) cartDrawer.classList.remove('hidden');
  refreshCartUI();
});
safeAddEvent(closeCartBtn, 'click', () => {
  if (cartDrawer) cartDrawer.classList.add('hidden');
});

safeAddEvent(modalClose, 'click', () => closeModal());
if (modal)
  safeAddEvent(modal, 'click', (e) => {
    if (e.target === modal) closeModal();
  });

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'Esc') {
    if (modal && !modal.classList.contains('hidden')) closeModal();
  }
});

(function setupSwipeToClose() {
  if (!modal) return;
  let startY = null;
  let currentY = null;
  let touching = false;
  const threshold = 80;

  modal.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      startY = e.touches[0].clientY;
      touching = true;
      currentY = startY;
    },
    { passive: true }
  );

  modal.addEventListener(
    'touchmove',
    (e) => {
      if (!touching || e.touches.length !== 1) return;
      currentY = e.touches[0].clientY;
    },
    { passive: true }
  );

  modal.addEventListener('touchend', () => {
    if (!touching) return;
    touching = false;
    if (
      startY !== null &&
      currentY !== null &&
      currentY - startY > threshold
    ) {
      closeModal();
    }
    startY = currentY = null;
  });
})();

// LOGOUT wiring
safeAddEvent(logoutBtn, 'click', async () => {
  try {
    await fetch('/auth/logout', { method: 'POST' }).catch(() => { });
  } finally {
    window.location.href = '/login.html';
  }
});

// search/filter wiring
if (searchInput) searchInput.addEventListener('input', debounce(loadProducts, 300));
if (genderFilter) genderFilter.addEventListener('change', loadProducts);
if (categoryFilter) categoryFilter.addEventListener('change', loadProducts);
if (minPriceSelect) minPriceSelect.addEventListener('change', loadProducts);
safeAddEvent(document.getElementById('search-btn'), 'click', loadProducts);

// Shop Now → scroll + highlight
if (shopNowBtn) {
  shopNowBtn.addEventListener('click', () => {
    const grid = document.getElementById('products-grid');
    if (!grid) return;
    grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
      const cards = grid.querySelectorAll('.card');
      for (let i = 0; i < Math.min(4, cards.length); i++) {
        cards[i].classList.add('pulse-highlight');
        setTimeout(() => cards[i].classList.remove('pulse-highlight'), 1400);
      }
    }, 500);
  });
}

// reload button for dev
(function addReloadButton() {
  try {
    const btn = document.createElement('button');
    btn.textContent = 'Reload products';
    btn.style.position = 'fixed';
    btn.style.right = '18px';
    btn.style.bottom = '18px';
    btn.style.zIndex = '9999';
    btn.style.padding = '8px 12px';
    btn.style.borderRadius = '10px';
    btn.style.border = 'none';
    btn.style.background = '#111';
    btn.style.color = 'white';
    btn.style.cursor = 'pointer';
    btn.style.boxShadow = '0 6px 18px rgba(0,0,0,0.15)';
    btn.onclick = () => {
      loadProducts();
      refreshCartUI();
      loadSeasonalSale();
      btn.textContent = 'Reloaded ✓';
      setTimeout(() => (btn.textContent = 'Reload products'), 900);
    };
    document.body.appendChild(btn);
  } catch (e) { }
})();

function debounce(fn, ms = 200) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

// initial load
if (productsGrid) {
  loadProducts();
  refreshCartUI();
  renderOrders();
  loadSeasonalSale();
} else {
  console.warn('products-grid not found. Make sure index.html contains the element.');
}
