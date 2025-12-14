// models/Product.js
const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true }, // Custom string ID from JSON
  name: String,
  price: Number,
  image: String,   // Some products use 'image'
  images: [String], // Some products use 'images' array
  description: String,
  tags: [String],
  color: String,
  style: String,
  category: String,
  gender: String
}, { timestamps: true });

// Check if the model is already defined to prevent OverwriteModelError
module.exports = mongoose.models.Product || mongoose.model('Product', ProductSchema);
