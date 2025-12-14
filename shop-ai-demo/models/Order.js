// models/Order.js
const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  userName: String,    // optional: you can connect to User later
  userEmail: String,
  shipping: {
    name: String,
    address: String,
    city: String,
    pincode: String,
    phone: String
  },
  paymentMethod: String,
  items: [{
    productId: String,
    name: String,
    quantity: Number,
    price: Number
  }],
  total: Number,
  status: { type: String, default: 'placed' }, // e.g. placed, cancelled
}, { timestamps: true });

// Check if the model is already defined to prevent OverwriteModelError
module.exports = mongoose.models.Order || mongoose.model('Order', OrderSchema);
