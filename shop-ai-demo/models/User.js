// models/User.js
const mongoose = require('mongoose');
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    email: { type: String },
    passwordHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }

});
module.exports = mongoose.models.User || mongoose.model('User', UserSchema);