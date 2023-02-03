const { ObjectId } = require('mongodb');

module.exports = {
    $increment: 'numId',
    user_id: { type: ObjectId, required: true },
    tariff_id: { type: ObjectId, required: true },
    ctid: { type: Number, required: true },
    ip: { type: String, required: true },
    username: { type: String, required: true },
    password: { type: String, required: true },
    os: { type: String, required: true },
    price: { type: Number, required: true },
    ending_date: { type: Date, default: () => new Date() },
    active: { type: Boolean, default: true }
};
